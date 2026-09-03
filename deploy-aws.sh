#!/usr/bin/env bash
# =============================================================================
#  Disucar ERP — one-stop AWS provisioning (free-tier, single instance)
#
#  Everything runs on ONE t3.micro: the Next.js app and PostgreSQL, both in
#  Docker, with 2 GB of swap so a 1 GB box copes.
#
#  Images are built HERE and shipped as a tarball. Nothing is compiled on the
#  instance — t3.micro cannot build Next.js without being killed by the OOM
#  reaper, and a local build is also reproducible: what you tested is byte-for-
#  byte what runs.
#
#  Prerequisites — you do these once:
#    1. IAM user with programmatic access + AmazonEC2FullAccess
#       (no RDS policy needed: this deploys no RDS)
#    2. aws configure     — paste the keys THERE, never into a chat or into this
#                           repo. This script only reads the CLI's own store.
#
#  Then:
#    ./deploy-aws.sh                provision, build locally, ship, run
#    ./deploy-aws.sh --push         rebuild and redeploy onto the existing box
#    ./deploy-aws.sh --resume       finish a run that failed after the upload
#    ./deploy-aws.sh --status       what exists
#    ./deploy-aws.sh --ssh          open a shell on the instance
#    ./deploy-aws.sh --backup       pull a database dump down to this machine
#    ./deploy-aws.sh --go-live      purge the demo data and issue a real admin
#    ./deploy-aws.sh --destroy      tear it all down
#
#  Everything created is tagged Project=disucar-erp so --destroy can find it
#  and nothing else in the account is touched.
# =============================================================================
set -euo pipefail

# ── Settings ─────────────────────────────────────────────────────────────────
PROJECT="disucar-erp"
REGION="${AWS_REGION:-${AWS_DEFAULT_REGION:-ap-southeast-2}}"   # Sydney: the org SCP permits only this region

EC2_TYPE="${EC2_TYPE:-t3.micro}"       # free tier: 750 h/month for 12 months
EC2_DISK_GB="${EC2_DISK_GB:-30}"       # free tier ceiling for EBS
SWAP_GB="${SWAP_GB:-2}"                # 1 GB RAM alone is not enough to run comfortably
DB_NAME="${DB_NAME:-disucar}"
DB_USER="${DB_USER:-postgres}"

KEY_NAME="${PROJECT}-key"
KEY_FILE="${HOME}/.ssh/${KEY_NAME}.pem"
APP_SG="${PROJECT}-app-sg"
SECRETS_FILE="${HOME}/.disucar-erp-deploy.txt"
REMOTE_DIR="/opt/disucar"
IMAGE_TAR="disucar-images.tar.gz"

RED=$'\033[0;31m'; GRN=$'\033[0;32m'; YLW=$'\033[1;33m'; CYN=$'\033[0;36m'; B=$'\033[1m'; N=$'\033[0m'
say()  { printf '%s\n' "$*"; }
step() { printf '\n%s==>%s %s%s%s\n' "$CYN" "$N" "$B" "$*" "$N"; }
ok()   { printf '%s  ✓%s %s\n' "$GRN" "$N" "$*"; }
warn() { printf '%s  ! %s%s\n' "$YLW" "$*" "$N"; }
die()  { printf '\n%s  ✗ %s%s\n' "$RED" "$*" "$N" >&2; exit 1; }

aws_() { aws --region "$REGION" "$@"; }

# ── SSH on Windows ───────────────────────────────────────────────────────────
# Git Bash ships its own ssh, but its chmod does not map onto Windows ACLs, so
# OpenSSH rejects the key as "too open" and there is no way to satisfy it from
# bash. Use the native Windows OpenSSH client and lock the key with icacls,
# which the same client understands.
setup_ssh_tools() {
  SSH_BIN="ssh"; SCP_BIN="scp"; IS_WINDOWS=false
  if [ -x "/c/Windows/System32/OpenSSH/ssh.exe" ]; then
    SSH_BIN="/c/Windows/System32/OpenSSH/ssh.exe"
    SCP_BIN="/c/Windows/System32/OpenSSH/scp.exe"
    IS_WINDOWS=true
  fi
  command -v "$SSH_BIN" >/dev/null 2>&1 || [ -x "$SSH_BIN" ] || die "No ssh client found."
}

# ssh.exe and scp.exe are native Windows binaries: they need C:\... paths, not
# /c/... or /tmp/..., so every LOCAL path handed to them goes through here first.
winpath() {
  if [ "$IS_WINDOWS" = true ] && command -v cygpath >/dev/null 2>&1; then
    cygpath -w "$1"
  else
    printf '%s' "$1"
  fi
}

key_path() { winpath "$KEY_FILE"; }

lock_key_permissions() {
  if [ "$IS_WINDOWS" = true ]; then
    local win; win=$(key_path)
    # Drop inheritance, then grant only the current user — what OpenSSH insists on.
    icacls "$win" /inheritance:r >/dev/null 2>&1 || true
    icacls "$win" /grant:r "$(whoami):(R)" >/dev/null 2>&1 || true
    ok "Key permissions locked via icacls (Windows OpenSSH)"
  else
    chmod 600 "$KEY_FILE"
  fi
}

rssh() { "$SSH_BIN" -i "$(key_path)" -o StrictHostKeyChecking=accept-new \
           -o ConnectTimeout=15 "ec2-user@${PUBLIC_IP}" "$@"; }
rscp() { "$SCP_BIN" -i "$(key_path)" -o StrictHostKeyChecking=accept-new "$@"; }

# ── Preflight ────────────────────────────────────────────────────────────────
preflight() {
  step "Checking prerequisites"
  command -v aws >/dev/null 2>&1 || die "AWS CLI not found: https://aws.amazon.com/cli/"
  command -v docker >/dev/null 2>&1 || die "Docker is required — images are built locally."
  docker info >/dev/null 2>&1 || die "Docker is installed but not running."

  local who
  who=$(aws_ sts get-caller-identity --query 'Arn' --output text 2>/dev/null) || die \
    "AWS credentials are not working. Run: aws configure"
  ok "Authenticated as ${who##*/}"
  ok "Region: $REGION"

  setup_ssh_tools
  ok "SSH client: $SSH_BIN"
}

confirm_cost() {
  cat <<EOF

${B}Free-tier deployment.${N} Within the 12-month AWS Free Tier this is
${B}\$0/month${N}: one ${EC2_TYPE} (750 h), ${EC2_DISK_GB} GB EBS, and 750 h of public IPv4.

  Outside the free tier, or on a second instance, expect roughly \$12-15/month.
  Data transfer out beyond 100 GB/month is charged separately either way.

  ${YLW}The database lives on this instance${N}, not RDS. That is what keeps it free,
  but it means no managed snapshots: if the instance is terminated the data goes
  with it. A nightly pg_dump is installed, and './deploy-aws.sh --backup' pulls a
  dump to your machine.

  Tear everything down with:  ./deploy-aws.sh --destroy

EOF
  if [ "${ASSUME_YES:-false}" = "true" ]; then
    warn "ASSUME_YES set — confirmation was given out of band"
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
  [ "$VPC_ID" != "None" ] || die "No default VPC in $REGION. Create one, or pick another region."
  SUBNET_ID=$(aws_ ec2 describe-subnets --filters "Name=vpc-id,Values=$VPC_ID" \
               --query 'Subnets[0].SubnetId' --output text)
  ok "VPC $VPC_ID"
}

# Discover this machine's public IP so SSH can be restricted to it.
#
# Verified TLS matters here: if an interception proxy could spoof the answer we would
# whitelist somebody else's address for SSH. Reuse whatever CA bundle the AWS CLI is
# configured with, which on a machine running TLS-inspecting antivirus is the only
# bundle that trusts the interceptor.
my_ip() {
  local bundle
  bundle="${AWS_CA_BUNDLE:-$(aws configure get ca_bundle 2>/dev/null || true)}"
  if [ -n "$bundle" ] && [ -f "$bundle" ]; then
    curl -fsS --max-time 10 --cacert "$bundle" https://checkip.amazonaws.com 2>/dev/null | tr -d '[:space:]' || echo ""
  else
    curl -fsS --max-time 10 https://checkip.amazonaws.com 2>/dev/null | tr -d '[:space:]' || echo ""
  fi
}

setup_security() {
  step "Security group"
  APP_SG_ID=$(aws_ ec2 describe-security-groups \
      --filters "Name=group-name,Values=$APP_SG" "Name=vpc-id,Values=$VPC_ID" \
      --query 'SecurityGroups[0].GroupId' --output text 2>/dev/null)
  if [ "$APP_SG_ID" = "None" ] || [ -z "$APP_SG_ID" ]; then
    APP_SG_ID=$(aws_ ec2 create-security-group --group-name "$APP_SG" \
        --description "Disucar ERP" --vpc-id "$VPC_ID" --query 'GroupId' --output text)
    aws_ ec2 create-tags --resources "$APP_SG_ID" --tags "Key=Project,Value=$PROJECT" >/dev/null
  fi

  local ip; ip=$(my_ip)
  if [ -n "$ip" ]; then
    allow tcp 22 "$ip/32"; ok "SSH restricted to your IP ($ip)"
  else
    warn "Could not detect your public IP — SSH not opened."
  fi
  allow tcp 80  "0.0.0.0/0"
  allow tcp 443 "0.0.0.0/0"
  ok "HTTP/HTTPS open"
  # Postgres is NOT exposed: it is only reachable inside the Docker network.
}

allow() {
  aws_ ec2 authorize-security-group-ingress --group-id "$APP_SG_ID" \
    --protocol "$1" --port "$2" --cidr "$3" >/dev/null 2>&1 || true
}

setup_key() {
  step "SSH key pair"
  if aws_ ec2 describe-key-pairs --key-names "$KEY_NAME" >/dev/null 2>&1; then
    [ -f "$KEY_FILE" ] || die \
      "Key '$KEY_NAME' exists in AWS but $KEY_FILE is missing. Delete the key pair in the EC2 console and re-run, or restore the .pem."
    ok "Reusing key pair $KEY_NAME"
  else
    mkdir -p "$(dirname "$KEY_FILE")"
    aws_ ec2 create-key-pair --key-name "$KEY_NAME" --query 'KeyMaterial' --output text > "$KEY_FILE"
    ok "Private key written to $KEY_FILE"
  fi
  lock_key_permissions
}

# ── Instance ─────────────────────────────────────────────────────────────────
# Bootstrap only prepares the host: swap, Docker, a directory. No clone, no
# build — the images arrive prebuilt over scp.
user_data() {
  cat <<EOF
#!/bin/bash
set -euxo pipefail
exec > >(tee /var/log/disucar-bootstrap.log) 2>&1

# 2 GB swap: 1 GB of RAM runs the app and Postgres together only with headroom.
if [ ! -f /swapfile ]; then
  dd if=/dev/zero of=/swapfile bs=1M count=$((SWAP_GB * 1024))
  chmod 600 /swapfile
  mkswap /swapfile
  swapon /swapfile
  echo '/swapfile none swap sw 0 0' >> /etc/fstab
  sysctl -w vm.swappiness=10
  echo 'vm.swappiness=10' > /etc/sysctl.d/99-swap.conf
fi

dnf install -y docker
systemctl enable --now docker
usermod -aG docker ec2-user

mkdir -p /usr/local/lib/docker/cli-plugins
curl -fsSL "https://github.com/docker/compose/releases/latest/download/docker-compose-linux-\$(uname -m)" \
  -o /usr/local/lib/docker/cli-plugins/docker-compose
chmod +x /usr/local/lib/docker/cli-plugins/docker-compose

mkdir -p ${REMOTE_DIR}/backups
chown -R ec2-user:ec2-user ${REMOTE_DIR}
touch /var/lib/cloud/instance/disucar-ready
EOF
}

setup_ec2() {
  step "Instance"
  local existing
  existing=$(aws_ ec2 describe-instances \
    --filters "Name=tag:Project,Values=$PROJECT" "Name=instance-state-name,Values=running,pending" \
    --query 'Reservations[0].Instances[0].InstanceId' --output text 2>/dev/null || echo "None")
  if [ "$existing" != "None" ] && [ -n "$existing" ]; then
    INSTANCE_ID="$existing"
    ok "Reusing $INSTANCE_ID"
  else
    local ami
    ami=$(aws_ ssm get-parameters \
      --names /aws/service/ami-amazon-linux-latest/al2023-ami-kernel-default-x86_64 \
      --query 'Parameters[0].Value' --output text 2>/dev/null || true)
    if [ -z "$ami" ] || [ "$ami" = "None" ]; then
      # ssm:GetParameters is not in AmazonEC2FullAccess, so fall back to EC2 itself.
      ami=$(aws_ ec2 describe-images --owners amazon \
        --filters "Name=name,Values=al2023-ami-2023.*-kernel-6.1-x86_64" "Name=state,Values=available" \
        --query 'sort_by(Images,&CreationDate)[-1].ImageId' --output text)
    fi
    [ -n "$ami" ] && [ "$ami" != "None" ] || die "Could not resolve an AL2023 AMI in $REGION."
    ok "AMI $ami"

    # MSYS_NO_PATHCONV stops Git Bash rewriting /dev/xvda into
    # "C:/Program Files/Git/dev/xvda" before the AWS CLI ever sees it — RunInstances
    # rejects that as an invalid device name.
    INSTANCE_ID=$(MSYS_NO_PATHCONV=1 aws_ ec2 run-instances \
      --image-id "$ami" --instance-type "$EC2_TYPE" \
      --key-name "$KEY_NAME" --security-group-ids "$APP_SG_ID" \
      --subnet-id "$SUBNET_ID" --associate-public-ip-address \
      --block-device-mappings "DeviceName=/dev/xvda,Ebs={VolumeSize=$EC2_DISK_GB,VolumeType=gp3}" \
      --metadata-options "HttpTokens=required" \
      --user-data "$(user_data)" \
      --tag-specifications "ResourceType=instance,Tags=[{Key=Project,Value=$PROJECT},{Key=Name,Value=$PROJECT}]" \
      --query 'Instances[0].InstanceId' --output text)
    ok "Launched $INSTANCE_ID"
  fi

  aws_ ec2 wait instance-running --instance-ids "$INSTANCE_ID"
  PUBLIC_IP=$(aws_ ec2 describe-instances --instance-ids "$INSTANCE_ID" \
    --query 'Reservations[0].Instances[0].PublicIpAddress' --output text)
  save_secret PUBLIC_IP "$PUBLIC_IP"
  ok "Public IP $PUBLIC_IP"

  printf '     waiting for SSH and bootstrap to finish'
  local n=0
  until rssh 'test -f /var/lib/cloud/instance/disucar-ready' >/dev/null 2>&1; do
    n=$((n+1)); [ "$n" -lt 60 ] || die "Instance never finished bootstrapping. Check the console log."
    printf '.'; sleep 10
  done
  printf '\n'
  ok "Host ready (Docker + ${SWAP_GB}GB swap)"
}

# ── Build locally, ship the images ───────────────────────────────────────────
build_and_ship() {
  step "Building images locally"
  say "     nothing is compiled on the instance — a 1 GB box cannot build Next.js"
  docker compose build app migrate
  docker tag disucar-sales-inc-app:latest     disucar-app:latest
  docker tag disucar-sales-inc-migrate:latest disucar-migrate:latest
  ok "Built disucar-app and disucar-migrate"

  step "Packing and uploading"
  docker save disucar-app:latest disucar-migrate:latest | gzip -1 > "/tmp/$IMAGE_TAR"
  local size; size=$(du -h "/tmp/$IMAGE_TAR" | cut -f1)
  say "     $size — this is the slow part on a home connection"
  rscp "$(winpath "/tmp/$IMAGE_TAR")" "ec2-user@${PUBLIC_IP}:${REMOTE_DIR}/"
  rm -f "/tmp/$IMAGE_TAR"
  ok "Uploaded"

  step "Loading images on the instance"
  rssh "cd $REMOTE_DIR && gunzip -c $IMAGE_TAR | docker load && rm -f $IMAGE_TAR"
  ok "Images loaded"
}

# ── Remote runtime files ─────────────────────────────────────────────────────
ship_runtime() {
  step "Writing runtime configuration"

  DB_PASSWORD=$(load_secret DB_PASSWORD)
  if [ -z "$DB_PASSWORD" ]; then
    DB_PASSWORD=$(randstr 32)
    save_secret DB_PASSWORD "$DB_PASSWORD"
  fi
  NEXTAUTH_SECRET=$(load_secret NEXTAUTH_SECRET)
  if [ -z "$NEXTAUTH_SECRET" ]; then
    NEXTAUTH_SECRET=$(randstr 48)
    save_secret NEXTAUTH_SECRET "$NEXTAUTH_SECRET"
  fi

  local tmp; tmp=$(mktemp -d)

  # Secrets travel over SSH and are never echoed to the terminal.
  cat > "$tmp/.env" <<EOF
DATABASE_URL="postgresql://${DB_USER}:${DB_PASSWORD}@db:5432/${DB_NAME}"
DIRECT_URL="postgresql://${DB_USER}:${DB_PASSWORD}@db:5432/${DB_NAME}"
NEXTAUTH_SECRET="${NEXTAUTH_SECRET}"
NEXTAUTH_URL="http://${PUBLIC_IP}"
NEXT_PUBLIC_SUPABASE_URL="http://localhost:54321"
NEXT_PUBLIC_SUPABASE_ANON_KEY="placeholder"
POSTGRES_USER="${DB_USER}"
POSTGRES_PASSWORD="${DB_PASSWORD}"
POSTGRES_DB="${DB_NAME}"
EOF

  # Prebuilt images only: no build: keys, so the instance never compiles anything.
  cat > "$tmp/docker-compose.yml" <<'EOF'
services:
  db:
    image: postgres:16-alpine
    container_name: disucar-db
    restart: unless-stopped
    env_file: .env
    volumes:
      - db-data:/var/lib/postgresql/data
    healthcheck:
      test: ["CMD-SHELL", "pg_isready -U $${POSTGRES_USER} -d $${POSTGRES_DB}"]
      interval: 10s
      timeout: 5s
      retries: 10

  migrate:
    image: disucar-migrate:latest
    container_name: disucar-migrate
    env_file: .env
    environment:
      SEED_DEMO_DATA: "${SEED_DEMO_DATA:-false}"
    command: >
      sh -c "npx prisma migrate deploy &&
             if [ \"$$SEED_DEMO_DATA\" = \"true\" ]; then npx tsx prisma/seed.ts; else echo 'Skipping demo seed.'; fi"
    depends_on:
      db:
        condition: service_healthy

  app:
    image: disucar-app:latest
    container_name: disucar-app
    restart: unless-stopped
    env_file: .env
    environment:
      NODE_ENV: production
      TZ: Asia/Manila
    ports:
      - "80:3000"
    depends_on:
      migrate:
        condition: service_completed_successfully
    healthcheck:
      test: ["CMD", "wget", "--no-verbose", "--tries=1", "--spider", "http://127.0.0.1:3000/api/health"]
      interval: 30s
      timeout: 10s
      retries: 3
      start_period: 20s

volumes:
  db-data:
EOF

  # No RDS means no managed snapshots, so take our own every night and keep a week.
  cat > "$tmp/backup.sh" <<EOF
#!/bin/bash
set -euo pipefail
cd ${REMOTE_DIR}
stamp=\$(date +%Y%m%d-%H%M%S)
docker exec disucar-db pg_dump -U ${DB_USER} ${DB_NAME} | gzip > backups/disucar-\$stamp.sql.gz
find backups -name 'disucar-*.sql.gz' -mtime +7 -delete
EOF

  rscp "$(winpath "$tmp/.env")" "$(winpath "$tmp/docker-compose.yml")" "$(winpath "$tmp/backup.sh")" "ec2-user@${PUBLIC_IP}:${REMOTE_DIR}/"
  rm -rf "$tmp"
  # Amazon Linux 2023 is minimal and ships no cron at all, so `crontab -` failed
  # with "command not found" and took the whole deployment with it. Install cronie
  # first; both the install and the crontab rewrite are idempotent.
  rssh "sudo dnf install -y -q cronie >/dev/null && sudo systemctl enable --now crond"
  rssh "chmod 600 ${REMOTE_DIR}/.env && chmod +x ${REMOTE_DIR}/backup.sh && \
        (crontab -l 2>/dev/null | grep -v disucar-backup; echo '0 2 * * * ${REMOTE_DIR}/backup.sh # disucar-backup') | crontab -"
  ok "Config, compose file and nightly backup installed"
}

start_remote() {
  step "Starting the stack"
  # Demo data ships by default so there is something to show a client on day one.
  # Wipe it with ./deploy-aws.sh --go-live, or set SEED_DEMO_DATA=false to start empty.
  rssh "cd $REMOTE_DIR && SEED_DEMO_DATA=${SEED_DEMO_DATA:-true} docker compose up -d"
  printf '     waiting for the app to answer'
  local n=0
  until curl -fsS --max-time 5 "http://$PUBLIC_IP/login" >/dev/null 2>&1; do
    n=$((n+1))
    if [ "$n" -ge 40 ]; then
      printf '\n'; warn "Not answering yet. Logs:"
      rssh "cd $REMOTE_DIR && docker compose logs --tail 40" || true
      return 1
    fi
    printf '.'; sleep 10
  done
  printf '\n'
  ok "Application is up"
}

# ── Secrets ──────────────────────────────────────────────────────────────────
save_secret() {
  touch "$SECRETS_FILE"; chmod 600 "$SECRETS_FILE" 2>/dev/null || true
  grep -v "^$1=" "$SECRETS_FILE" > "${SECRETS_FILE}.tmp" 2>/dev/null || true
  mv "${SECRETS_FILE}.tmp" "$SECRETS_FILE" 2>/dev/null || true
  printf '%s=%s\n' "$1" "$2" >> "$SECRETS_FILE"
  chmod 600 "$SECRETS_FILE" 2>/dev/null || true
}
randstr() {
  # Generates $1 random alphanumerics.
  #
  # The obvious one-liner --- tr -dc ... </dev/urandom | head -c N --- looks fine
  # and fails under this script's `set -o pipefail`: head exits the moment it has
  # its N bytes, tr dies of SIGPIPE (141), and the pipeline therefore "fails".
  # Under `set -e` that killed the deployment mid-run with no error message at
  # all, right after the "Writing runtime configuration" banner. Command
  # substitution runs in a subshell, so relaxing pipefail here is contained.
  ( set +o pipefail; LC_ALL=C tr -dc 'A-Za-z0-9' < /dev/urandom 2>/dev/null | head -c "$1" )
}

load_secret()
 { grep "^$1=" "$SECRETS_FILE" 2>/dev/null | head -1 | cut -d= -f2- || true; }

require_instance() {
  PUBLIC_IP=$(load_secret PUBLIC_IP)
  [ -n "$PUBLIC_IP" ] || die "No deployment recorded in $SECRETS_FILE. Run ./deploy-aws.sh first."
}

# ── Commands ─────────────────────────────────────────────────────────────────
cmd_deploy() {
  preflight
  confirm_cost
  find_vpc
  setup_security
  setup_key
  setup_ec2
  build_and_ship
  ship_runtime
  start_remote || true

  cat <<EOF

${GRN}${B}Deployed.${N}

  App        http://$PUBLIC_IP
  SSH        ./deploy-aws.sh --ssh
  Secrets    $SECRETS_FILE  (mode 600, outside the repo)
  Backups    nightly at 02:00 into ${REMOTE_DIR}/backups, 7 days kept
             pull one down with: ./deploy-aws.sh --backup

  Redeploy after a code change:  ./deploy-aws.sh --push

  ${YLW}This serves plain HTTP.${N} A login sends the password in clear text, so
  put a domain and HTTPS in front of it before real customer data goes in.

EOF
}

cmd_push() {
  preflight
  require_instance
  setup_ssh_tools
  build_and_ship
  step "Restarting with the new images"
  rssh "cd $REMOTE_DIR && docker compose up -d && docker image prune -f"
  start_remote || true
  ok "http://$PUBLIC_IP"
}

# Picks up after the images are already on the instance. build_and_ship is the
# expensive step (a quarter-gigabyte over a home uplink); when a later step fails
# there is no reason to pay for it twice.
cmd_resume() {
  preflight
  require_instance
  setup_ssh_tools
  ship_runtime
  start_remote || true
  ok "http://$PUBLIC_IP"
}

cmd_status() {

  preflight
  step "Resources tagged Project=$PROJECT"
  aws_ ec2 describe-instances --filters "Name=tag:Project,Values=$PROJECT" \
    "Name=instance-state-name,Values=running,pending,stopped" \
    --query 'Reservations[].Instances[].{Id:InstanceId,State:State.Name,Type:InstanceType,IP:PublicIpAddress}' \
    --output table
  PUBLIC_IP=$(load_secret PUBLIC_IP)
  if [ -n "$PUBLIC_IP" ]; then
    rssh "cd $REMOTE_DIR && docker compose ps && free -h | head -3" 2>/dev/null || \
      warn "Could not reach the instance over SSH."
  fi
}

cmd_ssh()    { setup_ssh_tools; require_instance; rssh; }

cmd_backup() {
  setup_ssh_tools; require_instance
  step "Taking a fresh dump and downloading it"
  rssh "${REMOTE_DIR}/backup.sh"
  local latest; latest=$(rssh "ls -t ${REMOTE_DIR}/backups/*.sql.gz | head -1")
  rscp "ec2-user@${PUBLIC_IP}:${latest}" .
  ok "Downloaded $(basename "$latest") to $(pwd)"
}

# Hand the system over: wipe the demo, keep the configuration, issue a real admin.
cmd_go_live() {
  setup_ssh_tools; require_instance
  step "Going live — purging demo data"
  cat <<EOF

  This deletes every demo order, customer, supplier, catalog item, cost layer and
  ledger entry, and ${B}removes every demo login${N} — including the accounts whose
  password is "password123".

  Kept: warehouses (their codes drive the GL accounts), categories, org settings,
  and one administrator whose password is generated and shown once.

EOF
  # Not optional: this is irreversible and a demo is exactly when someone realises
  # afterwards that they wanted something back.
  say "  Taking a backup first…"
  rssh "${REMOTE_DIR}/backup.sh"
  local latest; latest=$(rssh "ls -t ${REMOTE_DIR}/backups/*.sql.gz | head -1")
  rscp "ec2-user@${PUBLIC_IP}:${latest}" .
  ok "Backup downloaded: $(basename "$latest")"

  if [ "${ASSUME_YES:-false}" != "true" ]; then
    printf '\nType %sPURGE%s to erase the demo data: ' "$B" "$N"
    read -r reply
    [ "$reply" = "PURGE" ] || die "Cancelled — nothing was deleted."
  fi

  rssh "cd $REMOTE_DIR && docker compose run --rm \
        -e RESET_CONFIRM=PURGE \
        ${ADMIN_EMAIL:+-e ADMIN_EMAIL=$ADMIN_EMAIL} \
        migrate npx tsx scripts/reset-prod.ts"

  say ""
  warn "Store the administrator password above — it is not saved anywhere."
}

cmd_destroy() {
  preflight
  step "Destroying everything tagged Project=$PROJECT"
  warn "This terminates the instance AND its database volume. All data is lost."
  warn "Take a copy first with: ./deploy-aws.sh --backup"
  if [ "${ASSUME_YES:-false}" != "true" ]; then
    printf 'Type %sdestroy%s to confirm: ' "$B" "$N"
    read -r reply
    [ "$reply" = "destroy" ] || die "Cancelled — nothing was deleted."
  fi

  local ids
  ids=$(aws_ ec2 describe-instances --filters "Name=tag:Project,Values=$PROJECT" \
        "Name=instance-state-name,Values=running,pending,stopped" \
        --query 'Reservations[].Instances[].InstanceId' --output text)
  if [ -n "$ids" ]; then
    aws_ ec2 terminate-instances --instance-ids $ids >/dev/null
    ok "Terminating $ids"
    aws_ ec2 wait instance-terminated --instance-ids $ids
  fi

  find_vpc
  local sg
  sg=$(aws_ ec2 describe-security-groups --filters "Name=group-name,Values=$APP_SG" \
       --query 'SecurityGroups[0].GroupId' --output text 2>/dev/null || echo None)
  [ "$sg" = "None" ] || aws_ ec2 delete-security-group --group-id "$sg" 2>/dev/null || \
    warn "Security group still in use — delete it manually once the instance is gone."

  ok "Done. Key pair and $SECRETS_FILE were left in place."
  say "  Remove them too if you are finished:"
  say "    aws ec2 delete-key-pair --key-name $KEY_NAME --region $REGION && rm -f $KEY_FILE $SECRETS_FILE"
}

case "${1:-deploy}" in
  deploy|"")  cmd_deploy ;;
  --push)     cmd_push ;;
  --resume)   cmd_resume ;;
  --status)   cmd_status ;;
  --ssh)      cmd_ssh ;;
  --backup)   cmd_backup ;;
  --go-live)  cmd_go_live ;;
  --destroy)  cmd_destroy ;;
  --help|-h)  sed -n '2,30p' "$0" ;;
  *)          die "Unknown option: $1  (try --help)" ;;
esac
