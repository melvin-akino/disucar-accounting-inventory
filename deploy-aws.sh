#!/usr/bin/env bash
# =============================================================================
#  Disucar ERP — one-stop AWS provisioning
#
#  Run this from YOUR machine. It creates the whole stack from nothing:
#
#      VPC (default) ── security groups ── key pair
#                    ├─ RDS PostgreSQL 16   (private, reachable only from EC2)
#                    └─ EC2 + Docker        (app, behind Nginx)
#
#  Prerequisites — you do these once:
#    1. Create an IAM user with programmatic access and attach:
#         AmazonEC2FullAccess, AmazonRDSFullAccess   (nothing else is needed)
#    2. aws configure          (paste the keys THERE, never into a chat or a file
#                               in this repo — this script only ever reads them
#                               from the CLI's own credential store)
#
#  Then:
#    ./deploy-aws.sh                 provision everything
#    ./deploy-aws.sh --destroy       tear it all down again
#    ./deploy-aws.sh --status        show what exists and what it costs
#
#  Everything created is tagged Project=disucar-erp, so --destroy can find it
#  and nothing else in your account is touched.
# =============================================================================
set -euo pipefail

# ── Settings ─────────────────────────────────────────────────────────────────
PROJECT="disucar-erp"
REGION="${AWS_REGION:-${AWS_DEFAULT_REGION:-ap-southeast-1}}"   # Singapore: closest to PH
REPO_URL="${REPO_URL:-https://github.com/melvin-akino/disucar-accounting-inventory.git}"
REPO_BRANCH="${REPO_BRANCH:-main}"

EC2_TYPE="${EC2_TYPE:-t3.small}"      # 2 GB RAM — t3.micro cannot build the Next.js app
EC2_DISK_GB="${EC2_DISK_GB:-30}"
RDS_CLASS="${RDS_CLASS:-db.t4g.micro}"
RDS_DISK_GB="${RDS_DISK_GB:-20}"
DB_NAME="${DB_NAME:-disucar}"
DB_USER="${DB_USER:-postgres}"

KEY_NAME="${PROJECT}-key"
KEY_FILE="${HOME}/.ssh/${KEY_NAME}.pem"
APP_SG="${PROJECT}-app-sg"
DB_SG="${PROJECT}-db-sg"
DB_ID="${PROJECT}-db"
SUBNET_GROUP="${PROJECT}-subnets"
SECRETS_FILE="${HOME}/.disucar-erp-deploy.txt"

RED=$'\033[0;31m'; GRN=$'\033[0;32m'; YLW=$'\033[1;33m'; CYN=$'\033[0;36m'; B=$'\033[1m'; N=$'\033[0m'
say()  { printf '%s\n' "$*"; }
step() { printf '\n%s==>%s %s%s%s\n' "$CYN" "$N" "$B" "$*" "$N"; }
ok()   { printf '%s  ✓%s %s\n' "$GRN" "$N" "$*"; }
warn() { printf '%s  ! %s%s\n' "$YLW" "$*" "$N"; }
die()  { printf '\n%s  ✗ %s%s\n' "$RED" "$*" "$N" >&2; exit 1; }

aws_() { aws --region "$REGION" "$@"; }

# ── Preflight ────────────────────────────────────────────────────────────────
preflight() {
  step "Checking prerequisites"

  command -v aws >/dev/null 2>&1 || die \
    "AWS CLI not found. Install it: https://aws.amazon.com/cli/"

  # Never prompts, never echoes the keys — just proves they work.
  local who
  who=$(aws_ sts get-caller-identity --query 'Arn' --output text 2>/dev/null) || die \
    "AWS credentials are not working. Run: aws configure"
  ok "Authenticated as ${who##*/}"
  ok "Region: $REGION"

  command -v ssh >/dev/null 2>&1 || warn "ssh not found — you won't be able to log into the box"
}

# ── Cost gate ────────────────────────────────────────────────────────────────
# Real infrastructure costs real money. Nothing is created before an explicit yes.
confirm_cost() {
  cat <<EOF

${B}This creates billable AWS resources:${N}

  EC2 ${EC2_TYPE} + ${EC2_DISK_GB}GB disk    ~ \$15-20 / month
  RDS ${RDS_CLASS} + ${RDS_DISK_GB}GB       ~ \$13-16 / month
  Public IPv4 address                        ~ \$4 / month
  ${B}Roughly \$32-40 / month${N} in ${REGION}, billed to your account until destroyed.

  Tear it down with:  ./deploy-aws.sh --destroy

EOF
  if [ "${ASSUME_YES:-false}" = "true" ]; then
    warn "ASSUME_YES set — skipping confirmation"
    return
  fi
  printf 'Type %sdeploy%s to continue: ' "$B" "$N"
  read -r reply
  [ "$reply" = "deploy" ] || die "Cancelled — nothing was created."
}

# ── Networking ───────────────────────────────────────────────────────────────
find_vpc() {
  step "Locating default VPC"
  VPC_ID=$(aws_ ec2 describe-vpcs --filters Name=isDefault,Values=true \
            --query 'Vpcs[0].VpcId' --output text)
  [ "$VPC_ID" != "None" ] || die \
    "No default VPC in $REGION. Create one in the VPC console, or set a different region."

  # RDS needs subnets in at least two availability zones.
  mapfile -t SUBNETS < <(aws_ ec2 describe-subnets \
      --filters "Name=vpc-id,Values=$VPC_ID" \
      --query 'Subnets[].SubnetId' --output text | tr '\t' '\n')
  [ "${#SUBNETS[@]}" -ge 2 ] || die "Need at least 2 subnets in $VPC_ID for RDS."
  ok "VPC $VPC_ID with ${#SUBNETS[@]} subnets"
}

my_ip() {
  # SSH is locked to the machine running this script rather than the whole internet.
  curl -fsS --max-time 10 https://checkip.amazonaws.com 2>/dev/null | tr -d '[:space:]' || echo ""
}

ensure_sg() {
  local name="$1" desc="$2" id
  id=$(aws_ ec2 describe-security-groups --filters "Name=group-name,Values=$name" \
        "Name=vpc-id,Values=$VPC_ID" --query 'SecurityGroups[0].GroupId' --output text 2>/dev/null)
  if [ "$id" = "None" ] || [ -z "$id" ]; then
    id=$(aws_ ec2 create-security-group --group-name "$name" --description "$desc" \
          --vpc-id "$VPC_ID" --query 'GroupId' --output text)
    aws_ ec2 create-tags --resources "$id" --tags "Key=Project,Value=$PROJECT" >/dev/null
  fi
  printf '%s' "$id"
}

setup_security() {
  step "Security groups"

  APP_SG_ID=$(ensure_sg "$APP_SG" "Disucar ERP web tier")
  DB_SG_ID=$(ensure_sg "$DB_SG" "Disucar ERP database tier")

  local ip; ip=$(my_ip)
  if [ -n "$ip" ]; then
    allow "$APP_SG_ID" tcp 22 "$ip/32"
    ok "SSH restricted to your IP ($ip)"
  else
    warn "Could not detect your public IP — SSH left closed. Open port 22 manually if needed."
  fi
  allow "$APP_SG_ID" tcp 80  "0.0.0.0/0"
  allow "$APP_SG_ID" tcp 443 "0.0.0.0/0"
  ok "HTTP/HTTPS open to the internet"

  # Postgres is reachable ONLY from the app instances — never from the internet.
  if ! aws_ ec2 describe-security-groups --group-ids "$DB_SG_ID" \
        --query 'SecurityGroups[0].IpPermissions[?FromPort==`5432`]' --output text | grep -q .; then
    aws_ ec2 authorize-security-group-ingress --group-id "$DB_SG_ID" \
      --protocol tcp --port 5432 --source-group "$APP_SG_ID" >/dev/null
  fi
  ok "Postgres reachable only from the app security group"
}

allow() {
  local sg="$1" proto="$2" port="$3" cidr="$4"
  aws_ ec2 authorize-security-group-ingress --group-id "$sg" \
    --protocol "$proto" --port "$port" --cidr "$cidr" >/dev/null 2>&1 || true
}

# ── Key pair ─────────────────────────────────────────────────────────────────
setup_key() {
  step "SSH key pair"
  if aws_ ec2 describe-key-pairs --key-names "$KEY_NAME" >/dev/null 2>&1; then
    [ -f "$KEY_FILE" ] || warn "Key '$KEY_NAME' exists in AWS but $KEY_FILE is missing — you will not be able to SSH in."
    ok "Reusing key pair $KEY_NAME"
    return
  fi
  mkdir -p "$(dirname "$KEY_FILE")"
  aws_ ec2 create-key-pair --key-name "$KEY_NAME" --query 'KeyMaterial' --output text > "$KEY_FILE"
  chmod 600 "$KEY_FILE"
  aws_ ec2 create-tags --resources \
    "$(aws_ ec2 describe-key-pairs --key-names "$KEY_NAME" --query 'KeyPairs[0].KeyPairId' --output text)" \
    --tags "Key=Project,Value=$PROJECT" >/dev/null 2>&1 || true
  ok "Private key written to $KEY_FILE (keep it; AWS will not show it again)"
}

# ── Database ─────────────────────────────────────────────────────────────────
setup_rds() {
  step "RDS PostgreSQL"

  if aws_ rds describe-db-instances --db-instance-identifier "$DB_ID" >/dev/null 2>&1; then
    ok "Reusing existing instance $DB_ID"
  else
    aws_ rds describe-db-subnet-groups --db-subnet-group-name "$SUBNET_GROUP" >/dev/null 2>&1 || \
      aws_ rds create-db-subnet-group \
        --db-subnet-group-name "$SUBNET_GROUP" \
        --db-subnet-group-description "Disucar ERP" \
        --subnet-ids "${SUBNETS[@]}" \
        --tags "Key=Project,Value=$PROJECT" >/dev/null

    # Generated locally and never printed to the terminal. It is written only to
    # $SECRETS_FILE (mode 600) and injected into the instance's .env.
    DB_PASSWORD=$(LC_ALL=C tr -dc 'A-Za-z0-9' </dev/urandom | head -c 32)

    aws_ rds create-db-instance \
      --db-instance-identifier "$DB_ID" \
      --db-instance-class "$RDS_CLASS" \
      --engine postgres --engine-version 16 \
      --master-username "$DB_USER" --master-user-password "$DB_PASSWORD" \
      --allocated-storage "$RDS_DISK_GB" --storage-type gp3 \
      --db-subnet-group-name "$SUBNET_GROUP" \
      --vpc-security-group-ids "$DB_SG_ID" \
      --backup-retention-period 7 \
      --no-publicly-accessible \
      --no-multi-az \
      --tags "Key=Project,Value=$PROJECT" >/dev/null
    ok "Creating $DB_ID (this takes 5-10 minutes)"
    save_secret DB_PASSWORD "$DB_PASSWORD"
  fi

  printf '     waiting for the database to accept connections'
  until [ "$(aws_ rds describe-db-instances --db-instance-identifier "$DB_ID" \
             --query 'DBInstances[0].DBInstanceStatus' --output text)" = "available" ]; do
    printf '.'; sleep 20
  done
  printf '\n'

  DB_HOST=$(aws_ rds describe-db-instances --db-instance-identifier "$DB_ID" \
             --query 'DBInstances[0].Endpoint.Address' --output text)
  ok "Database available at $DB_HOST"
}

# ── Application instance ─────────────────────────────────────────────────────
# The instance bootstraps itself: everything below runs as root on first boot.
user_data() {
  cat <<EOF
#!/bin/bash
set -euxo pipefail
exec > >(tee /var/log/disucar-bootstrap.log) 2>&1

dnf install -y docker git || { apt-get update -y && apt-get install -y docker.io git; }
systemctl enable --now docker

# Compose v2 as a docker plugin
mkdir -p /usr/local/lib/docker/cli-plugins
curl -fsSL "https://github.com/docker/compose/releases/latest/download/docker-compose-linux-\$(uname -m)" \
  -o /usr/local/lib/docker/cli-plugins/docker-compose
chmod +x /usr/local/lib/docker/cli-plugins/docker-compose

git clone --branch "$REPO_BRANCH" "$REPO_URL" /opt/disucar
cd /opt/disucar

DB_URL="postgresql://${DB_USER}:${DB_PASSWORD}@${DB_HOST}:5432/${DB_NAME}"

cat > .env <<ENVEOF
DATABASE_URL="\$DB_URL"
DIRECT_URL="\$DB_URL"
NEXTAUTH_SECRET="${NEXTAUTH_SECRET}"
NEXTAUTH_URL="http://${PUBLIC_HOST}"
NEXT_PUBLIC_SUPABASE_URL="http://localhost:54321"
NEXT_PUBLIC_SUPABASE_ANON_KEY="placeholder"
ENVEOF

# RDS starts with no application database — create it before migrating.
docker run --rm postgres:16-alpine psql "postgresql://${DB_USER}:${DB_PASSWORD}@${DB_HOST}:5432/postgres" \
  -c 'CREATE DATABASE "${DB_NAME}"' || true

# Production override: talk to RDS, no local db container, listen on port 80.
cat > docker-compose.override.yml <<'OVREOF'
services:
  migrate:
    env_file: .env
    environment:
      SEED_DEMO_DATA: "\${SEED_DEMO_DATA:-false}"
  app:
    env_file: .env
    ports:
      - "80:3000"
OVREOF

SEED_DEMO_DATA="${SEED_DEMO}" docker compose up -d --build
EOF
}

setup_ec2() {
  step "Application instance"

  local existing
  existing=$(aws_ ec2 describe-instances \
    --filters "Name=tag:Project,Values=$PROJECT" "Name=instance-state-name,Values=running,pending" \
    --query 'Reservations[0].Instances[0].InstanceId' --output text 2>/dev/null || echo "None")
  if [ "$existing" != "None" ] && [ -n "$existing" ]; then
    INSTANCE_ID="$existing"
    ok "Reusing running instance $INSTANCE_ID"
    return
  fi

  # Amazon Linux 2023, current release, resolved per-region rather than hard-coded.
  #
  # SSM holds the canonical pointer, but reading it needs ssm:GetParameters, which
  # AmazonEC2FullAccess does NOT grant — so fall back to asking EC2 directly for the
  # newest matching image. That keeps the required IAM policies to EC2 + RDS only.
  local ami
  ami=$(aws_ ssm get-parameters \
    --names /aws/service/ami-amazon-linux-latest/al2023-ami-kernel-default-x86_64 \
    --query 'Parameters[0].Value' --output text 2>/dev/null || true)

  if [ -z "$ami" ] || [ "$ami" = "None" ]; then
    ami=$(aws_ ec2 describe-images --owners amazon \
      --filters "Name=name,Values=al2023-ami-2023.*-kernel-6.1-x86_64" \
                "Name=state,Values=available" \
      --query 'sort_by(Images,&CreationDate)[-1].ImageId' --output text)
  fi
  [ -n "$ami" ] && [ "$ami" != "None" ] || die "Could not resolve an Amazon Linux 2023 AMI in $REGION."
  ok "Using AMI $ami"

  NEXTAUTH_SECRET=$(LC_ALL=C tr -dc 'A-Za-z0-9' </dev/urandom | head -c 48)
  save_secret NEXTAUTH_SECRET "$NEXTAUTH_SECRET"
  PUBLIC_HOST="pending"
  SEED_DEMO="${SEED_DEMO_DATA:-false}"

  INSTANCE_ID=$(aws_ ec2 run-instances \
    --image-id "$ami" --instance-type "$EC2_TYPE" \
    --key-name "$KEY_NAME" --security-group-ids "$APP_SG_ID" \
    --subnet-id "${SUBNETS[0]}" --associate-public-ip-address \
    --block-device-mappings "DeviceName=/dev/xvda,Ebs={VolumeSize=$EC2_DISK_GB,VolumeType=gp3}" \
    --metadata-options "HttpTokens=required" \
    --user-data "$(user_data)" \
    --tag-specifications "ResourceType=instance,Tags=[{Key=Project,Value=$PROJECT},{Key=Name,Value=$PROJECT}]" \
    --query 'Instances[0].InstanceId' --output text)
  ok "Launched $INSTANCE_ID"

  printf '     waiting for the instance to start'
  aws_ ec2 wait instance-running --instance-ids "$INSTANCE_ID"
  printf '\n'
}

# ── Secrets file ─────────────────────────────────────────────────────────────
save_secret() {
  touch "$SECRETS_FILE"; chmod 600 "$SECRETS_FILE"
  # Replace rather than append, so re-running does not leave stale values behind.
  grep -v "^$1=" "$SECRETS_FILE" > "${SECRETS_FILE}.tmp" 2>/dev/null || true
  mv "${SECRETS_FILE}.tmp" "$SECRETS_FILE" 2>/dev/null || true
  printf '%s=%s\n' "$1" "$2" >> "$SECRETS_FILE"
  chmod 600 "$SECRETS_FILE"
}

load_secret() { grep "^$1=" "$SECRETS_FILE" 2>/dev/null | head -1 | cut -d= -f2- || true; }

# ── Commands ─────────────────────────────────────────────────────────────────
cmd_deploy() {
  preflight
  confirm_cost
  find_vpc
  setup_security
  setup_key

  DB_PASSWORD=$(load_secret DB_PASSWORD)
  setup_rds
  DB_PASSWORD=${DB_PASSWORD:-$(load_secret DB_PASSWORD)}
  [ -n "$DB_PASSWORD" ] || die \
    "The database exists but its password is not in $SECRETS_FILE. Reset it in the RDS console, then add DB_PASSWORD=... to that file."

  setup_ec2

  PUBLIC_IP=$(aws_ ec2 describe-instances --instance-ids "$INSTANCE_ID" \
    --query 'Reservations[0].Instances[0].PublicIpAddress' --output text)
  save_secret PUBLIC_IP "$PUBLIC_IP"
  save_secret DB_HOST "$DB_HOST"

  step "Waiting for the application to come up"
  say "     first boot builds the app from source — allow 5-10 minutes"
  local n=0
  until curl -fsS --max-time 5 "http://$PUBLIC_IP/login" >/dev/null 2>&1; do
    n=$((n+1)); [ "$n" -lt 90 ] || { warn "Still not responding. Check: ssh -i $KEY_FILE ec2-user@$PUBLIC_IP 'tail -50 /var/log/disucar-bootstrap.log'"; break; }
    printf '.'; sleep 20
  done
  printf '\n'

  cat <<EOF

${GRN}${B}Deployed.${N}

  App        http://$PUBLIC_IP
  SSH        ssh -i $KEY_FILE ec2-user@$PUBLIC_IP
  Database   $DB_HOST (private — reachable only from the app)
  Secrets    $SECRETS_FILE  (mode 600, not in the repo)

  ${B}The database is empty.${N} Load the demo dataset with:
    ssh -i $KEY_FILE ec2-user@$PUBLIC_IP \\
      'cd /opt/disucar && SEED_DEMO_DATA=true docker compose up -d migrate'

  ${YLW}Before real use:${N} put a domain and HTTPS in front of it — a plain
  HTTP login page sends passwords in clear text. setup-aws.sh handles Nginx
  and Let's Encrypt once you have a domain pointed at $PUBLIC_IP.

EOF
}

cmd_status() {
  preflight
  step "Resources tagged Project=$PROJECT"
  aws_ ec2 describe-instances --filters "Name=tag:Project,Values=$PROJECT" \
    --query 'Reservations[].Instances[].{Id:InstanceId,State:State.Name,Type:InstanceType,IP:PublicIpAddress}' \
    --output table
  aws_ rds describe-db-instances --db-instance-identifier "$DB_ID" \
    --query 'DBInstances[].{Id:DBInstanceIdentifier,Status:DBInstanceStatus,Class:DBInstanceClass,Endpoint:Endpoint.Address}' \
    --output table 2>/dev/null || say "  (no database)"
}

cmd_destroy() {
  preflight
  step "Destroying everything tagged Project=$PROJECT"
  warn "This deletes the database and ALL its data."
  printf 'Type %sdestroy%s to confirm: ' "$B" "$N"
  read -r reply
  [ "$reply" = "destroy" ] || die "Cancelled — nothing was deleted."

  local ids
  ids=$(aws_ ec2 describe-instances --filters "Name=tag:Project,Values=$PROJECT" \
        "Name=instance-state-name,Values=running,pending,stopped" \
        --query 'Reservations[].Instances[].InstanceId' --output text)
  if [ -n "$ids" ]; then
    aws_ ec2 terminate-instances --instance-ids $ids >/dev/null
    ok "Terminating $ids"
    aws_ ec2 wait instance-terminated --instance-ids $ids
  fi

  if aws_ rds describe-db-instances --db-instance-identifier "$DB_ID" >/dev/null 2>&1; then
    aws_ rds delete-db-instance --db-instance-identifier "$DB_ID" \
      --skip-final-snapshot --delete-automated-backups >/dev/null
    ok "Deleting $DB_ID"
    aws_ rds wait db-instance-deleted --db-instance-identifier "$DB_ID" || true
  fi

  aws_ rds delete-db-subnet-group --db-subnet-group-name "$SUBNET_GROUP" >/dev/null 2>&1 || true

  # Security groups only delete once nothing references them.
  find_vpc
  local dbsg appsg
  dbsg=$(aws_ ec2 describe-security-groups --filters "Name=group-name,Values=$DB_SG" \
         --query 'SecurityGroups[0].GroupId' --output text 2>/dev/null || echo None)
  appsg=$(aws_ ec2 describe-security-groups --filters "Name=group-name,Values=$APP_SG" \
          --query 'SecurityGroups[0].GroupId' --output text 2>/dev/null || echo None)
  [ "$dbsg" = "None" ]  || aws_ ec2 delete-security-group --group-id "$dbsg"  2>/dev/null || true
  [ "$appsg" = "None" ] || aws_ ec2 delete-security-group --group-id "$appsg" 2>/dev/null || true

  ok "Done. The key pair and $SECRETS_FILE were left in place."
  say "  Remove them yourself if you are finished:"
  say "    aws ec2 delete-key-pair --key-name $KEY_NAME --region $REGION && rm -f $KEY_FILE $SECRETS_FILE"
}

case "${1:-deploy}" in
  deploy|"")  cmd_deploy ;;
  --status)   cmd_status ;;
  --destroy)  cmd_destroy ;;
  --help|-h)  sed -n '2,25p' "$0" ;;
  *)          die "Unknown option: $1  (try --help)" ;;
esac
