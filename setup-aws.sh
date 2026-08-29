#!/usr/bin/env bash
# =============================================================================
#  Disucar Sales ERP — AWS One-Stop Setup Script (RDS edition)
#  Supports: Ubuntu 20.04 / 22.04 / 24.04 LTS, Amazon Linux 2 / 2023
#
#  Architecture:
#    EC2  →  Docker (migrate + app containers)
#    RDS  →  AWS managed PostgreSQL 16 (no local db container)
#
#  Usage:
#    sudo bash setup-aws.sh                     # interactive
#    sudo bash setup-aws.sh --non-interactive   # all defaults, no prompts
#
#  Environment overrides (set before running to skip prompts):
#    RDS_HOST        existing RDS endpoint (skip RDS creation)
#    RDS_PORT        default 5432
#    RDS_DB          default disucar-sales
#    RDS_USER        default postgres
#    RDS_PASSWORD    master password (required if not creating RDS)
#    AWS_ACCESS_KEY_ID / AWS_SECRET_ACCESS_KEY  (or use EC2 IAM role)
#    AWS_DEFAULT_REGION   default ap-southeast-1
#
#  What this script does:
#    1.  Checks memory / adds swap
#    2.  Interactive configuration (branding, domain, RDS mode)
#    3.  Installs Docker, Docker Compose, Git, Nginx, Certbot, UFW, psql client
#    4.  Installs AWS CLI v2
#    5a. [CREATE mode] Creates RDS subnet group, security group, RDS instance,
#        waits for it to become available, creates the database
#    5b. [EXISTING mode] Tests connectivity to the provided RDS endpoint
#    6.  Clones the application repository
#    7.  Writes .env and docker-compose.override.yml (RDS URLs, no db service)
#    8.  Builds and starts containers (migrate → app)
#    9.  Configures Nginx reverse proxy (optional, requires domain)
#   10.  Obtains Let's Encrypt SSL certificate (optional)
#   11.  Configures firewall
#   12.  Registers systemd service for auto-start on reboot
#   13.  Saves all credentials to /root/disucar-sales-credentials.txt
# =============================================================================

set -euo pipefail

# ── Config ────────────────────────────────────────────────────────────────────
REPO_URL="https://github.com/melvin-akino/inventory-sales-processing-accounting.git"
APP_DIR="/opt/disucar-sales"
APP_PORT=3000
CREDS_FILE="/root/disucar-sales-credentials.txt"
NON_INTERACTIVE=false
[[ "${1:-}" == "--non-interactive" ]] && NON_INTERACTIVE=true

# ── Colors ────────────────────────────────────────────────────────────────────
RED='\033[0;31m'; GREEN='\033[0;32m'; YELLOW='\033[1;33m'
CYAN='\033[0;36m'; BOLD='\033[1m'; NC='\033[0m'

# ── Helpers ───────────────────────────────────────────────────────────────────
log()    { echo -e "${CYAN}[$(date +%H:%M:%S)]${NC} $*"; }
ok()     { echo -e "  ${GREEN}✔${NC} $*"; }
warn()   { echo -e "  ${YELLOW}⚠${NC}  $*"; }
die()    { echo -e "\n${RED}✖  $*${NC}\n" >&2; exit 1; }
banner() { echo -e "\n${CYAN}${BOLD}━━━  $*  ━━━${NC}\n"; }

ask() {
  local __var="$1" __prompt="$2" __default="$3" __val
  if $NON_INTERACTIVE; then
    eval "$__var='$__default'"
    return
  fi
  read -rp "$(echo -e "  ${YELLOW}?${NC} ${__prompt} [${CYAN}${__default}${NC}]: ")" __val
  eval "$__var='${__val:-$__default}'"
}

ask_secret() {
  local __var="$1" __prompt="$2" __val
  if $NON_INTERACTIVE; then
    eval "$__var=''"
    return
  fi
  read -srp "$(echo -e "  ${YELLOW}?${NC} ${__prompt}: ")" __val
  echo ""
  eval "$__var='$__val'"
}

require_root() {
  [[ $EUID -eq 0 ]] || die "Run as root: sudo bash $0"
}

detect_os() {
  OS_ID=$(grep -oP '(?<=^ID=).+' /etc/os-release 2>/dev/null | tr -d '"' | head -1 || echo "unknown")
  OS_VER=$(grep -oP '(?<=^VERSION_ID=).+' /etc/os-release 2>/dev/null | tr -d '"' | head -1 || echo "0")
  IS_AMAZON=false; IS_UBUNTU=false; IS_DEBIAN=false
  case "$OS_ID" in
    amzn)    IS_AMAZON=true ;;
    ubuntu)  IS_UBUNTU=true ;;
    debian)  IS_DEBIAN=true ;;
    *)       warn "Unrecognised OS ($OS_ID). Assuming Debian-like."; IS_DEBIAN=true ;;
  esac
}

gen_pass() {
  openssl rand -base64 48 | tr -dc 'a-zA-Z0-9' | head -c 32
}

gen_secret() {
  openssl rand -base64 48
}

# IMDSv2 helper — this instance enforces token-required metadata access
imds() {
  local token
  token=$(curl -sf -m 3 -X PUT "http://169.254.169.254/latest/api/token" \
    -H "X-aws-ec2-metadata-token-ttl-seconds: 60") || return 1
  curl -sf -m 3 -H "X-aws-ec2-metadata-token: $token" "http://169.254.169.254/latest/meta-data/$1"
}

# Wait with a spinner; usage: wait_for "description" <max_seconds> <check_command>
wait_for() {
  local DESC="$1" MAX="$2"; shift 2
  local WAIT=0
  until "$@" &>/dev/null; do
    sleep 10; WAIT=$((WAIT + 10))
    printf "\r  ${CYAN}⏳${NC} Waiting for %s… %ds" "$DESC" "$WAIT"
    [[ $WAIT -ge $MAX ]] && { echo ""; die "Timeout waiting for $DESC after ${MAX}s"; }
  done
  echo ""
  ok "$DESC is ready"
}

# ─────────────────────────────────────────────────────────────────────────────
require_root
detect_os

echo -e "\n${CYAN}${BOLD}"
echo "  ╔══════════════════════════════════════════════════════════════╗"
echo "  ║      Disucar Sales ERP — AWS One-Stop Setup  (RDS edition)   ║"
echo "  ║      EC2 app + AWS RDS PostgreSQL — no local db container   ║"
echo "  ╚══════════════════════════════════════════════════════════════╝"
echo -e "${NC}"

# ── 0. Swap (critical for t3.small / t2.micro) ────────────────────────────────
banner "Checking Memory & Swap"

TOTAL_RAM_MB=$(free -m | awk '/^Mem:/{print $2}')
TOTAL_SWAP_MB=$(free -m | awk '/^Swap:/{print $2}')

if [[ $TOTAL_RAM_MB -lt 2048 ]]; then
  warn "Low RAM detected: ${TOTAL_RAM_MB} MB (t2.micro free tier)"
  if [[ $TOTAL_SWAP_MB -gt 0 ]]; then
    ok "Swap already active: ${TOTAL_SWAP_MB} MB"
  else
    log "Creating 2 GB swap…"
    fallocate -l 2G /swapfile 2>/dev/null || dd if=/dev/zero of=/swapfile bs=1M count=2048 status=none
    chmod 600 /swapfile
    mkswap /swapfile -q
    swapon /swapfile
    grep -q '/swapfile' /etc/fstab || echo '/swapfile none swap sw 0 0' >> /etc/fstab
    sysctl -w vm.swappiness=10 > /dev/null
    grep -q 'vm.swappiness' /etc/sysctl.conf || echo 'vm.swappiness=10' >> /etc/sysctl.conf
    ok "2 GB swap created and enabled"
  fi
else
  ok "RAM: ${TOTAL_RAM_MB} MB — sufficient"
fi

# ── 1. Interactive configuration ──────────────────────────────────────────────
banner "Configuration"

# ── RDS mode ─────────────────────────────────────────────────────────────────
echo -e "  ${BOLD}Database Setup${NC}"
echo -e "  ${CYAN}Option 1:${NC} This script creates a new RDS instance for you (requires AWS credentials)"
echo -e "  ${CYAN}Option 2:${NC} You provide an existing RDS endpoint"
echo -e "  ${CYAN}Option 3:${NC} Run PostgreSQL as a local Docker container on this instance (no RDS, no AWS DB permissions needed)"
echo ""

if [[ -n "${RDS_HOST:-}" ]]; then
  RDS_MODE="existing"
  ok "RDS_HOST env var set → using existing RDS: $RDS_HOST"
else
  ask RDS_MODE "RDS mode — 'create', 'existing', or 'local'" "${RDS_MODE:-create}"
fi

if [[ "$RDS_MODE" == "local" ]]; then
  RDS_HOST="db"
  RDS_PORT="5432"
  RDS_DB="${RDS_DB:-disucar-sales}"
  RDS_USER="${RDS_USER:-postgres}"
  RDS_PASSWORD="${RDS_PASSWORD:-$(gen_pass)}"
  ok "Using local Postgres container on this instance (db-service: ${RDS_HOST})"
elif [[ "$RDS_MODE" == "create" ]]; then
  echo ""
  echo -e "  ${BOLD}AWS Credentials${NC}"
  echo -e "  ${YELLOW}Skip if EC2 has an IAM role with AmazonRDSFullAccess attached.${NC}"
  ask AWS_KEY_ID      "AWS Access Key ID (blank = use IAM role)"     "${AWS_ACCESS_KEY_ID:-}"
  if [[ -n "$AWS_KEY_ID" ]]; then
    ask_secret AWS_SECRET_KEY "AWS Secret Access Key"
  else
    AWS_SECRET_KEY=""
  fi
  ask AWS_REGION      "AWS Region"                                   "${AWS_DEFAULT_REGION:-ap-southeast-1}"
  ask RDS_INSTANCE_ID "RDS instance identifier"                      "disucar-sales-db"
  ask RDS_CLASS       "RDS instance class"                           "db.t3.micro"
  ask RDS_STORAGE_GB  "RDS allocated storage (GB)"                   "20"
  ask RDS_DB          "Database name"                                "${RDS_DB:-disucar-sales}"
  ask RDS_USER        "RDS master username"                          "${RDS_USER:-postgres}"
  RDS_PASSWORD="${RDS_PASSWORD:-$(gen_pass)}"
  warn "Generated RDS master password: ${RDS_PASSWORD}"
  warn "Save this — you will not see it again"
  RDS_PORT="${RDS_PORT:-5432}"
else
  ask RDS_HOST     "RDS endpoint (hostname only, no port)" "${RDS_HOST:-}"
  ask RDS_PORT     "RDS port"                              "${RDS_PORT:-5432}"
  ask RDS_DB       "Database name"                        "${RDS_DB:-disucar-sales}"
  ask RDS_USER     "Master username"                      "${RDS_USER:-postgres}"
  ask_secret RDS_PASSWORD "Master password"
fi

echo ""
echo -e "  ${BOLD}Application${NC}"
ask DOMAIN      "Domain / subdomain for Nginx + SSL (blank = IP-only)" ""
ask SSL_EMAIL   "Email for Let's Encrypt (required if domain set)"      "admin@example.com"

echo ""
echo -e "  ${BOLD}Branding / Organisation${NC}"
ask ORG_NAME     "Organisation name"       "Disucar Sales Inc"
ask ORG_TAGLINE  "Tagline"                 "Grocery & FMCG Distribution"
ask ORG_ADDRESS  "Address"                 "3F Greenfield Tower, Mandaluyong City, Metro Manila 1550"
ask ORG_PHONE    "Phone"                   "+63 2 8123 4567"
ask ORG_EMAIL    "Email"                   "info@disucarsales.ph"
ask ORG_TIN      "TIN"                     "123-456-789-000"
ask ORG_WEBSITE  "Website"                 "www.disucarsales.ph"
ask ORG_COLOR    "Brand accent color"      "#003087"
ask ORG_RDO      "RDO code"               "044"
ask ORG_ZIP      "ZIP / postal code"       "1550"
echo ""

# ── 2. Generate app credentials ───────────────────────────────────────────────
banner "Generating App Credentials"

NEXTAUTH_SECRET=$(gen_secret)

if [[ -n "$DOMAIN" ]]; then
  NEXTAUTH_URL="https://${DOMAIN}"
  APP_ORIGIN="$DOMAIN"
else
  PUBLIC_IP=$(imds public-ipv4 \
           || curl -sf --max-time 5 https://ifconfig.me \
           || hostname -I | awk '{print $1}')
  NEXTAUTH_URL="http://${PUBLIC_IP}:${APP_PORT}"
  APP_ORIGIN="$PUBLIC_IP"
fi

ok "NextAuth URL    : ${NEXTAUTH_URL}"
ok "App origin      : ${APP_ORIGIN}"
ok "NextAuth secret : generated"

# ── 3. Install system dependencies ────────────────────────────────────────────
banner "Installing System Dependencies"

if $IS_AMAZON; then
  log "Updating yum…"
  yum update -y -q

  log "Installing base packages…"
  yum install -y git curl wget unzip jq openssl postgresql15  # psql client

  if [[ "$OS_VER" == "2" ]]; then
    amazon-linux-extras enable docker
    yum install -y docker
  else
    yum install -y docker
  fi
  systemctl enable --now docker
  usermod -aG docker ec2-user 2>/dev/null || true

  COMPOSE_DEST="/usr/local/lib/docker/cli-plugins"
  mkdir -p "$COMPOSE_DEST"
  COMPOSE_VER=$(curl -sf https://api.github.com/repos/docker/compose/releases/latest \
    | grep '"tag_name"' | sed 's/.*"\(v[^"]*\)".*/\1/')
  curl -fsSL "https://github.com/docker/compose/releases/download/${COMPOSE_VER}/docker-compose-linux-x86_64" \
    -o "${COMPOSE_DEST}/docker-compose"
  chmod +x "${COMPOSE_DEST}/docker-compose"
  ln -sf "${COMPOSE_DEST}/docker-compose" /usr/local/bin/docker-compose
  ok "Docker Compose ${COMPOSE_VER} installed"

  amazon-linux-extras enable nginx1 2>/dev/null || true
  yum install -y nginx
  systemctl enable --now nginx

else
  export DEBIAN_FRONTEND=noninteractive
  log "Updating apt…"
  apt-get update -qq

  log "Installing base packages…"
  apt-get install -y -qq \
    git curl wget unzip jq openssl ca-certificates gnupg lsb-release \
    nginx ufw certbot python3-certbot-nginx postgresql-client

  log "Installing Docker…"
  install -m 0755 -d /etc/apt/keyrings
  curl -fsSL https://download.docker.com/linux/ubuntu/gpg \
    | gpg --batch --yes --dearmor -o /etc/apt/keyrings/docker.gpg
  chmod a+r /etc/apt/keyrings/docker.gpg
  echo "deb [arch=$(dpkg --print-architecture) signed-by=/etc/apt/keyrings/docker.gpg] \
    https://download.docker.com/linux/ubuntu $(lsb_release -cs) stable" \
    | tee /etc/apt/sources.list.d/docker.list > /dev/null
  apt-get update -qq
  apt-get install -y -qq docker-ce docker-ce-cli containerd.io docker-compose-plugin
  systemctl enable --now docker
  usermod -aG docker ubuntu 2>/dev/null || true

  ok "Docker $(docker --version | awk '{print $3}' | tr -d ',') installed"
fi
ok "postgresql-client installed (psql available for RDS connectivity tests)"
ok "All system dependencies installed"

if [[ "$RDS_MODE" != "local" ]]; then
# ── 4. Install AWS CLI v2 ─────────────────────────────────────────────────────
banner "Installing AWS CLI v2"

if command -v aws &>/dev/null; then
  ok "AWS CLI already installed: $(aws --version 2>&1 | head -1)"
else
  log "Downloading AWS CLI v2…"
  cd /tmp
  curl -fsSL "https://awscli.amazonaws.com/awscli-exe-linux-x86_64.zip" -o awscliv2.zip
  unzip -q awscliv2.zip
  ./aws/install --update
  rm -rf awscliv2.zip aws/
  cd "$OLDPWD"
  ok "AWS CLI v2 installed: $(aws --version 2>&1 | head -1)"
fi

# Configure AWS credentials if provided
if [[ -n "${AWS_KEY_ID:-}" && -n "${AWS_SECRET_KEY:-}" ]]; then
  mkdir -p /root/.aws
  cat > /root/.aws/credentials << AWSCREDS
[default]
aws_access_key_id     = ${AWS_KEY_ID}
aws_secret_access_key = ${AWS_SECRET_KEY}
AWSCREDS
  cat > /root/.aws/config << AWSCFG
[default]
region = ${AWS_REGION:-ap-southeast-1}
output = json
AWSCFG
  chmod 600 /root/.aws/credentials /root/.aws/config
  ok "AWS credentials written to /root/.aws/"
else
  log "No explicit credentials provided — assuming EC2 IAM role"
  AWS_REGION="${AWS_DEFAULT_REGION:-ap-southeast-1}"
  aws configure set region "$AWS_REGION"
fi

# Validate AWS access
aws sts get-caller-identity --output text --query 'Account' &>/dev/null \
  || die "AWS credentials invalid or IAM role not attached. Check your credentials."
ok "AWS credentials validated"
fi

# ── 5a. CREATE RDS ────────────────────────────────────────────────────────────
if [[ "$RDS_MODE" == "create" ]]; then
  banner "Creating AWS RDS PostgreSQL Instance"

  # Detect the EC2's VPC and subnet
  INSTANCE_ID=$(imds instance-id) || die "Could not read instance-id from IMDS (IMDSv2 token request failed)"
  EC2_VPC_ID=$(aws ec2 describe-instances \
    --instance-ids "$INSTANCE_ID" \
    --query 'Reservations[0].Instances[0].VpcId' --output text)
  EC2_SG_ID=$(aws ec2 describe-instances \
    --instance-ids "$INSTANCE_ID" \
    --query 'Reservations[0].Instances[0].SecurityGroups[0].GroupId' --output text)
  ok "EC2 VPC: $EC2_VPC_ID  |  EC2 Security Group: $EC2_SG_ID"

  # Collect all subnets in this VPC (need at least 2 AZs for subnet group)
  SUBNET_IDS=$(aws ec2 describe-subnets \
    --filters "Name=vpc-id,Values=$EC2_VPC_ID" \
    --query 'Subnets[*].SubnetId' --output text | tr '\t' ' ')
  SUBNET_ARRAY=($SUBNET_IDS)
  [[ ${#SUBNET_ARRAY[@]} -lt 2 ]] && die "Need at least 2 subnets in VPC $EC2_VPC_ID for an RDS subnet group. Add a second subnet in a different AZ."
  ok "Found ${#SUBNET_ARRAY[@]} subnets in VPC"

  # Create DB subnet group (idempotent)
  DB_SUBNET_GROUP="disucar-sales-db-subnet-group"
  if ! aws rds describe-db-subnet-groups --db-subnet-group-name "$DB_SUBNET_GROUP" &>/dev/null; then
    log "Creating RDS subnet group: $DB_SUBNET_GROUP"
    aws rds create-db-subnet-group \
      --db-subnet-group-name "$DB_SUBNET_GROUP" \
      --db-subnet-group-description "Disucar Sales ERP RDS subnet group" \
      --subnet-ids ${SUBNET_IDS} \
      --output text --query 'DBSubnetGroup.DBSubnetGroupName' > /dev/null
    ok "RDS subnet group created"
  else
    ok "RDS subnet group already exists"
  fi

  # Create RDS security group (allows inbound 5432 from EC2's SG)
  RDS_SG_NAME="disucar-sales-rds-sg"
  EXISTING_RDS_SG=$(aws ec2 describe-security-groups \
    --filters "Name=group-name,Values=$RDS_SG_NAME" "Name=vpc-id,Values=$EC2_VPC_ID" \
    --query 'SecurityGroups[0].GroupId' --output text 2>/dev/null || echo "None")

  if [[ "$EXISTING_RDS_SG" == "None" || -z "$EXISTING_RDS_SG" ]]; then
    log "Creating RDS security group: $RDS_SG_NAME"
    RDS_SG_ID=$(aws ec2 create-security-group \
      --group-name "$RDS_SG_NAME" \
      --description "DisucarSales RDS — allow 5432 from app EC2" \
      --vpc-id "$EC2_VPC_ID" \
      --query 'GroupId' --output text)

    # Allow port 5432 inbound only from EC2's security group
    aws ec2 authorize-security-group-ingress \
      --group-id "$RDS_SG_ID" \
      --protocol tcp \
      --port 5432 \
      --source-group "$EC2_SG_ID" > /dev/null

    ok "RDS security group created: $RDS_SG_ID (allows 5432 from $EC2_SG_ID)"
  else
    RDS_SG_ID="$EXISTING_RDS_SG"
    ok "Reusing existing RDS security group: $RDS_SG_ID"
  fi

  # Create RDS instance (idempotent)
  EXISTING_RDS=$(aws rds describe-db-instances \
    --db-instance-identifier "$RDS_INSTANCE_ID" \
    --query 'DBInstances[0].DBInstanceStatus' --output text 2>/dev/null || echo "none")

  if [[ "$EXISTING_RDS" == "none" ]]; then
    log "Creating RDS PostgreSQL instance: $RDS_INSTANCE_ID"
    log "Engine: postgres 16 | Class: $RDS_CLASS | Storage: ${RDS_STORAGE_GB} GB"
    log "This takes 5–10 minutes…"

    aws rds create-db-instance \
      --db-instance-identifier "$RDS_INSTANCE_ID" \
      --db-instance-class      "$RDS_CLASS" \
      --engine                 postgres \
      --engine-version         "16.3" \
      --master-username        "$RDS_USER" \
      --master-user-password   "$RDS_PASSWORD" \
      --db-name                "$RDS_DB" \
      --allocated-storage      "$RDS_STORAGE_GB" \
      --storage-type           gp2 \
      --no-publicly-accessible \
      --db-subnet-group-name   "$DB_SUBNET_GROUP" \
      --vpc-security-group-ids "$RDS_SG_ID" \
      --backup-retention-period 7 \
      --deletion-protection \
      --no-multi-az \
      --output text --query 'DBInstance.DBInstanceIdentifier' > /dev/null

    ok "RDS creation request submitted"
  else
    ok "RDS instance '$RDS_INSTANCE_ID' already exists (status: $EXISTING_RDS)"
  fi

  # Wait for RDS to be available
  log "Waiting for RDS instance to become available (up to 20 min)…"
  WAIT=0; MAX_RDS_WAIT=1200
  until [[ "$(aws rds describe-db-instances \
      --db-instance-identifier "$RDS_INSTANCE_ID" \
      --query 'DBInstances[0].DBInstanceStatus' --output text 2>/dev/null)" == "available" ]]; do
    sleep 20; WAIT=$((WAIT + 20))
    printf "\r  ${CYAN}⏳${NC} RDS provisioning… %ds / %ds" "$WAIT" "$MAX_RDS_WAIT"
    [[ $WAIT -ge $MAX_RDS_WAIT ]] && { echo ""; die "RDS not available after ${MAX_RDS_WAIT}s"; }
  done
  echo ""

  # Get the RDS endpoint
  RDS_HOST=$(aws rds describe-db-instances \
    --db-instance-identifier "$RDS_INSTANCE_ID" \
    --query 'DBInstances[0].Endpoint.Address' --output text)
  RDS_PORT=$(aws rds describe-db-instances \
    --db-instance-identifier "$RDS_INSTANCE_ID" \
    --query 'DBInstances[0].Endpoint.Port' --output text)

  ok "RDS endpoint: ${RDS_HOST}:${RDS_PORT}"
fi

if [[ "$RDS_MODE" == "local" ]]; then
  ok "Local mode — skipping RDS connectivity test (Postgres container starts in step 8)"
else
  # ── 5b. Test RDS connectivity ───────────────────────────────────────────────
  banner "Testing RDS Connectivity"

  log "Testing connection to ${RDS_HOST}:${RDS_PORT}/${RDS_DB} as ${RDS_USER}…"

  PGPASSWORD="$RDS_PASSWORD" psql \
    -h "$RDS_HOST" -p "$RDS_PORT" -U "$RDS_USER" -d "$RDS_DB" \
    -c "SELECT version();" --no-password -q 2>&1 | head -3 \
    || die "Cannot connect to RDS. Check:
      1. RDS security group allows port 5432 from this EC2's security group
      2. RDS endpoint, credentials, and database name are correct
      3. RDS instance status is 'available'"

  ok "RDS connection successful"
fi

# ── 6. Clone repository ───────────────────────────────────────────────────────
banner "Cloning Repository"

if [[ -d "$APP_DIR/.git" ]]; then
  warn "$APP_DIR already exists — pulling latest changes"
  # Fix ownership in case of previous runs
  chown -R ubuntu:ubuntu "$APP_DIR" 2>/dev/null || chown -R ec2-user:ec2-user "$APP_DIR" 2>/dev/null || true
  git -C "$APP_DIR" pull --ff-only
else
  log "Cloning ${REPO_URL} → ${APP_DIR}…"
  git clone --depth 1 "$REPO_URL" "$APP_DIR"
fi
ok "Repository ready at $APP_DIR"

# Build the RDS connection strings
DATABASE_URL="postgresql://${RDS_USER}:${RDS_PASSWORD}@${RDS_HOST}:${RDS_PORT}/${RDS_DB}"
DIRECT_URL="$DATABASE_URL"

# ── 7. Write environment files ────────────────────────────────────────────────
banner "Writing Environment Files"

cat > "$APP_DIR/.env" << ENVEOF
# ── Generated by setup-aws.sh on $(date) ─────────────────────────────────────

# ── Database (AWS RDS PostgreSQL) ─────────────────────────────────────────────
DATABASE_URL="${DATABASE_URL}"
DIRECT_URL="${DIRECT_URL}"

# ── NextAuth ──────────────────────────────────────────────────────────────────
NEXTAUTH_SECRET="${NEXTAUTH_SECRET}"
NEXTAUTH_URL="${NEXTAUTH_URL}"

# ── Supabase (unused — RDS is the only database) ──────────────────────────────
NEXT_PUBLIC_SUPABASE_URL="http://localhost:54321"
NEXT_PUBLIC_SUPABASE_ANON_KEY="placeholder"

# ── App ────────────────────────────────────────────────────────────────────────
NEXT_PUBLIC_APP_NAME="Disucar Sales ERP"
NEXT_PUBLIC_APP_ORG="${ORG_NAME}"
NEXT_PUBLIC_APP_ORIGIN="${APP_ORIGIN}"

# ── Branding ──────────────────────────────────────────────────────────────────
NEXT_PUBLIC_ORG_NAME="${ORG_NAME}"
NEXT_PUBLIC_ORG_TAGLINE="${ORG_TAGLINE}"
NEXT_PUBLIC_ORG_ADDRESS="${ORG_ADDRESS}"
NEXT_PUBLIC_ORG_PHONE="${ORG_PHONE}"
NEXT_PUBLIC_ORG_EMAIL="${ORG_EMAIL}"
NEXT_PUBLIC_ORG_TIN="${ORG_TIN}"
NEXT_PUBLIC_ORG_WEBSITE="${ORG_WEBSITE}"
NEXT_PUBLIC_ORG_COLOR="${ORG_COLOR}"
NEXT_PUBLIC_ORG_RDO="${ORG_RDO}"
NEXT_PUBLIC_ORG_ZIP="${ORG_ZIP}"
ENVEOF
chmod 600 "$APP_DIR/.env"
ok ".env written (chmod 600)"

# docker-compose.override.yml — RDS URLs injected (or local db service in local mode)
DB_SERVICE_BLOCK=""
MIGRATE_DEPENDS_BLOCK=""
if [[ "$RDS_MODE" == "local" ]]; then
  DB_SERVICE_BLOCK=$(cat << DBEOF

  db:
    image: postgres:16-alpine
    container_name: disucar-sales-db
    restart: unless-stopped
    environment:
      POSTGRES_USER: "${RDS_USER}"
      POSTGRES_PASSWORD: "${RDS_PASSWORD}"
      POSTGRES_DB: "${RDS_DB}"
    volumes:
      - db-data:/var/lib/postgresql/data
    healthcheck:
      test: ["CMD-SHELL", "pg_isready -U ${RDS_USER} -d ${RDS_DB}"]
      interval: 5s
      timeout: 5s
      retries: 10
DBEOF
)
  MIGRATE_DEPENDS_BLOCK=$(cat << DEPEOF

    depends_on:
      db:
        condition: service_healthy
DEPEOF
)
fi

cat > "$APP_DIR/docker-compose.override.yml" << OVERRIDEEOF
version: "3.9"

# Auto-generated by setup-aws.sh — do not edit manually
# Database: $([ "$RDS_MODE" == "local" ] && echo "local Postgres container (db)" || echo "AWS RDS PostgreSQL at ${RDS_HOST}")
# Regenerate: sudo bash ${APP_DIR}/setup-aws.sh

services:
  migrate:${MIGRATE_DEPENDS_BLOCK}
    environment:
      TZ:                            "Asia/Manila"
      DATABASE_URL:                  "${DATABASE_URL}"
      DIRECT_URL:                    "${DIRECT_URL}"
      NEXTAUTH_SECRET:               "${NEXTAUTH_SECRET}"
      NEXTAUTH_URL:                  "${NEXTAUTH_URL}"
      NEXT_PUBLIC_SUPABASE_URL:      "http://localhost:54321"
      NEXT_PUBLIC_SUPABASE_ANON_KEY: "placeholder"
${DB_SERVICE_BLOCK}
  app:
    environment:
      TZ:                            "Asia/Manila"
      DATABASE_URL:                  "${DATABASE_URL}"
      DIRECT_URL:                    "${DIRECT_URL}"
      NEXTAUTH_SECRET:               "${NEXTAUTH_SECRET}"
      NEXTAUTH_URL:                  "${NEXTAUTH_URL}"
      NEXT_PUBLIC_SUPABASE_URL:      "http://localhost:54321"
      NEXT_PUBLIC_SUPABASE_ANON_KEY: "placeholder"
      NEXT_PUBLIC_APP_NAME:          "Disucar Sales ERP"
      NEXT_PUBLIC_APP_ORG:           "${ORG_NAME}"
      NEXT_PUBLIC_APP_ORIGIN:        "${APP_ORIGIN}"
      NEXT_PUBLIC_ORG_NAME:          "${ORG_NAME}"
      NEXT_PUBLIC_ORG_TAGLINE:       "${ORG_TAGLINE}"
      NEXT_PUBLIC_ORG_ADDRESS:       "${ORG_ADDRESS}"
      NEXT_PUBLIC_ORG_PHONE:         "${ORG_PHONE}"
      NEXT_PUBLIC_ORG_EMAIL:         "${ORG_EMAIL}"
      NEXT_PUBLIC_ORG_TIN:           "${ORG_TIN}"
      NEXT_PUBLIC_ORG_WEBSITE:       "${ORG_WEBSITE}"
      NEXT_PUBLIC_ORG_COLOR:         "${ORG_COLOR}"
      NEXT_PUBLIC_ORG_RDO:           "${ORG_RDO}"
      NEXT_PUBLIC_ORG_ZIP:           "${ORG_ZIP}"
$([ "$RDS_MODE" == "local" ] && cat << VOLEOF

volumes:
  db-data:
VOLEOF
)
OVERRIDEEOF
chmod 600 "$APP_DIR/docker-compose.override.yml"
ok "docker-compose.override.yml written ($([ "$RDS_MODE" == "local" ] && echo "local db service included" || echo "no local db service"))"

# ── 8. Load prebuilt images and start containers ──────────────────────────────
banner "Loading Prebuilt Images & Starting Application"

cd "$APP_DIR"

if [[ -f /home/ubuntu/disucar-sales-images.tar ]]; then
  log "Loading prebuilt images from /home/ubuntu/disucar-sales-images.tar (built locally, not on this instance)…"
  docker load -i /home/ubuntu/disucar-sales-images.tar
  ok "Prebuilt images loaded"
  log "Starting containers (no build — using loaded images)…"
  docker compose up -d --no-build
else
  warn "No prebuilt image tar found at /home/ubuntu/disucar-sales-images.tar — falling back to building on this instance"
  log "Running docker compose up --build (migrate → app)…"
  log "First run takes 10–20 minutes on a small instance — be patient"
  docker compose up -d --build
fi

log "Waiting for application health check…"
WAIT=0; MAX_WAIT=600
until [[ "$(docker inspect --format='{{.State.Health.Status}}' disucar-sales-ops 2>/dev/null)" == "healthy" ]]; do
  sleep 5; WAIT=$((WAIT + 5))
  printf "\r  ${CYAN}⏳${NC} Waiting… %ds" "$WAIT"
  [[ $WAIT -ge $MAX_WAIT ]] && {
    echo ""
    warn "Health check timeout after ${MAX_WAIT}s"
    warn "Check logs: docker compose -C ${APP_DIR} logs app"
    break
  }
done
echo ""
STATUS=$(docker inspect --format='{{.State.Health.Status}}' disucar-sales-ops 2>/dev/null || echo "unknown")
[[ "$STATUS" == "healthy" ]] && ok "Application container is healthy" \
  || warn "Container status: ${STATUS} — may still be starting up"

# ── 9. Nginx reverse proxy ────────────────────────────────────────────────────
banner "Configuring Nginx reverse proxy"

NGINX_CONF="/etc/nginx/sites-available/disucar-sales"
NGINX_ENABLED="/etc/nginx/sites-enabled/disucar-sales"

[[ -f /etc/nginx/sites-enabled/default ]] && rm -f /etc/nginx/sites-enabled/default

cat > "$NGINX_CONF" << NGINXEOF
# Disucar Sales ERP — Nginx config (generated by setup-aws.sh)
server {
    listen 80;
    listen [::]:80;
    server_name ${DOMAIN:-_};

    client_max_body_size 50M;

    location / {
        proxy_pass          http://127.0.0.1:${APP_PORT};
        proxy_http_version  1.1;
        proxy_set_header    Upgrade           \$http_upgrade;
        proxy_set_header    Connection        'upgrade';
        proxy_set_header    Host              \$host;
        proxy_set_header    X-Real-IP         \$remote_addr;
        proxy_set_header    X-Forwarded-For   \$proxy_add_x_forwarded_for;
        proxy_set_header    X-Forwarded-Proto \$scheme;
        proxy_cache_bypass  \$http_upgrade;
        proxy_read_timeout  120s;
        proxy_send_timeout  120s;
    }
}
NGINXEOF

ln -sf "$NGINX_CONF" "$NGINX_ENABLED"
nginx -t && systemctl reload nginx
ok "Nginx configured — proxying port 80 → app (${APP_PORT})"

if [[ -n "$DOMAIN" ]]; then
  log "Obtaining Let's Encrypt SSL certificate…"
  if certbot --nginx -d "$DOMAIN" \
      --non-interactive --agree-tos \
      --email "$SSL_EMAIL" \
      --redirect 2>&1 | tail -5; then
    ok "SSL certificate installed — HTTPS enabled"
    NEXTAUTH_URL="https://${DOMAIN}"
    sed -i "s|NEXTAUTH_URL:.*|NEXTAUTH_URL:                  \"https://${DOMAIN}\"|g" \
      "$APP_DIR/docker-compose.override.yml"
    sed -i "s|NEXTAUTH_URL=.*|NEXTAUTH_URL=\"https://${DOMAIN}\"|g" \
      "$APP_DIR/.env"
    (crontab -l 2>/dev/null; echo "0 3 * * * certbot renew --quiet && systemctl reload nginx") \
      | sort -u | crontab -
    ok "Let's Encrypt auto-renewal cron registered"
  else
    warn "SSL cert failed. Ensure DNS points here, then run:"
    warn "  certbot --nginx -d ${DOMAIN} --email ${SSL_EMAIL}"
  fi
else
  NEXTAUTH_URL="http://${PUBLIC_IP}"
  sed -i "s|NEXTAUTH_URL:.*|NEXTAUTH_URL:                  \"${NEXTAUTH_URL}\"|g" \
    "$APP_DIR/docker-compose.override.yml"
  sed -i "s|NEXTAUTH_URL=.*|NEXTAUTH_URL=\"${NEXTAUTH_URL}\"|g" \
    "$APP_DIR/.env"
  ok "No domain provided — serving plain HTTP on port 80 at ${NEXTAUTH_URL}"
fi

# ── 10. Firewall ──────────────────────────────────────────────────────────────
banner "Configuring Firewall"

if command -v ufw &>/dev/null; then
  ufw --force enable
  ufw allow ssh        comment "SSH"
  ufw allow 80/tcp     comment "HTTP"
  ufw allow 443/tcp    comment "HTTPS"
  ufw reload
  ok "UFW firewall configured (port ${APP_PORT} not exposed — only reachable via Nginx on 80; port 5432 is NOT open — RDS connects internally)"
elif command -v iptables &>/dev/null; then
  iptables -I INPUT -p tcp --dport 22  -j ACCEPT
  iptables -I INPUT -p tcp --dport 80  -j ACCEPT
  iptables -I INPUT -p tcp --dport 443 -j ACCEPT
  ok "iptables rules added"
else
  warn "No firewall tool found — configure AWS Security Group manually"
fi

# ── 11. Systemd service ───────────────────────────────────────────────────────
banner "Registering Systemd Service"

cat > /etc/systemd/system/disucar-sales.service << UNITEOF
[Unit]
Description=Disucar Sales ERP (Docker Compose — RDS)
Documentation=https://github.com/melvin-akino/inventory-sales-processing-accounting
After=docker.service network-online.target
Requires=docker.service
Wants=network-online.target

[Service]
Type=oneshot
RemainAfterExit=yes
WorkingDirectory=${APP_DIR}
ExecStartPre=/usr/bin/docker compose pull --ignore-pull-failures
ExecStart=/usr/bin/docker compose up -d --remove-orphans
ExecStop=/usr/bin/docker compose down
ExecReload=/usr/bin/docker compose restart app
TimeoutStartSec=600
TimeoutStopSec=60
Restart=on-failure
RestartSec=10

[Install]
WantedBy=multi-user.target
UNITEOF

systemctl daemon-reload
systemctl enable disucar-sales.service
ok "disucar-sales.service enabled (auto-starts on reboot)"

# ── 12. Save credentials ──────────────────────────────────────────────────────
banner "Saving Credentials"

cat > "$CREDS_FILE" << CREDSEOF
╔══════════════════════════════════════════════════════════════════════════════╗
║           Disucar Sales ERP — Deployment Credentials (RDS edition)          ║
║           Generated: $(date)
╚══════════════════════════════════════════════════════════════════════════════╝

APPLICATION
  URL:               ${NEXTAUTH_URL}
  Directory:         ${APP_DIR}
  Live logs:         docker compose -C ${APP_DIR} logs -f app
  Restart app:       docker compose -C ${APP_DIR} restart app
  Full stop:         docker compose -C ${APP_DIR} down
  Deploy update:     cd ${APP_DIR} && git pull && docker compose up -d --build app

DATABASE (AWS RDS PostgreSQL)
  Host:              ${RDS_HOST}
  Port:              ${RDS_PORT}
  Database:          ${RDS_DB}
  Username:          ${RDS_USER}
  Password:          ${RDS_PASSWORD}
  Connection string: ${DATABASE_URL}

  Backup (from EC2):
    PGPASSWORD="${RDS_PASSWORD}" pg_dump -h ${RDS_HOST} -U ${RDS_USER} ${RDS_DB} > backup_\$(date +%Y%m%d).sql

  Restore (from EC2):
    PGPASSWORD="${RDS_PASSWORD}" psql -h ${RDS_HOST} -U ${RDS_USER} ${RDS_DB} < backup.sql

NEXTAUTH
  Secret:            ${NEXTAUTH_SECRET}
  URL:               ${NEXTAUTH_URL}

SEEDED LOGIN ACCOUNTS (all use password: password123)
  Admin:             admin@disucarsales.ph        / password123   (role: ADMIN)
  Finance:           finance@disucarsales.ph      / password123   (role: FINANCE)
  Warehouse:         warehouse@disucarsales.ph    / password123   (role: WAREHOUSE)
  Technician:        tech@disucarsales.ph         / password123   (role: TECHNICIAN)
  Driver:            driver@disucarsales.ph       / password123   (role: DRIVER)
  Customer:          procurement@stlukes.com.ph / password123   (role: CUSTOMER)

ORGANISATION
  Name:              ${ORG_NAME}
  Tagline:           ${ORG_TAGLINE}
  Address:           ${ORG_ADDRESS}
  Phone:             ${ORG_PHONE}
  Email:             ${ORG_EMAIL}
  TIN:               ${ORG_TIN}
  Website:           ${ORG_WEBSITE}
  Color:             ${ORG_COLOR}

AWS SECURITY GROUP — EC2 inbound rules required:
  Port 22   (SSH)   — your IP only
  Port 80   (HTTP)  — 0.0.0.0/0
  Port 443  (HTTPS) — 0.0.0.0/0
$([ -z "$DOMAIN" ] && echo "  Port ${APP_PORT} (App)  — 0.0.0.0/0")
  NOTE: Port 5432 must NOT be open on EC2 — RDS is accessed from within the VPC only

RDS SECURITY GROUP:
  Port 5432 inbound from EC2 security group only (set up by this script)

⚠  SECURITY: Delete this credentials file after saving to a secrets manager.
   rm -f ${CREDS_FILE}
CREDSEOF

chmod 600 "$CREDS_FILE"
ok "Credentials saved → $CREDS_FILE (chmod 600)"

# ── Final summary ─────────────────────────────────────────────────────────────
echo -e "\n${GREEN}${BOLD}"
echo "  ╔══════════════════════════════════════════════════════════════╗"
echo "  ║                 🎉  Setup complete!  (RDS)                  ║"
echo "  ╚══════════════════════════════════════════════════════════════╝"
echo -e "${NC}"
echo -e "  ${CYAN}${BOLD}Application URL:${NC}  ${NEXTAUTH_URL}"
echo -e "  ${CYAN}${BOLD}RDS endpoint:${NC}     ${RDS_HOST}:${RDS_PORT}/${RDS_DB}"
echo ""
echo -e "  ${CYAN}${BOLD}Login accounts${NC} (all password: ${YELLOW}password123${NC})"
echo -e "    Admin     →  admin@disucarsales.ph"
echo -e "    Finance   →  finance@disucarsales.ph"
echo -e "    Warehouse →  warehouse@disucarsales.ph"
echo ""
echo -e "  ${CYAN}${BOLD}Credentials file:${NC}  $CREDS_FILE"
echo ""
echo -e "  ${YELLOW}${BOLD}⚠  AWS Security Groups required:${NC}"
echo -e "     EC2: ports 22 / 80 / 443 $([ -z "$DOMAIN" ] && echo "/ ${APP_PORT}")"
echo -e "     RDS: port 5432 from EC2 security group only"
echo ""
echo -e "  ${CYAN}Useful commands:${NC}"
echo -e "    docker compose -C ${APP_DIR} logs -f app         # live logs"
echo -e "    docker compose -C ${APP_DIR} restart app         # restart app only"
echo -e "    systemctl restart disucar-sales                       # full restart"
echo -e "    PGPASSWORD='...' psql -h ${RDS_HOST} -U ${RDS_USER} ${RDS_DB}  # DB shell"
echo ""
