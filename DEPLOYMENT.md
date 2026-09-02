# Disucar Sales ERP — Complete AWS Deployment Guide

> **Most people should not follow this guide.** `./deploy-aws.sh` provisions the whole
> stack — security groups, key pair, RDS, EC2 — from your own machine once `aws configure`
> has credentials. See the README's "AWS — one command from nothing".
>
> This document is the manual fallback: click through every AWS service by hand, then run
> `setup-aws.sh` on the instance. Use it when you need to understand or vary what the
> script does. The resource names here (`disucar-sales-key`, `disucar-sales-sg`, …) are
> ones **you** type into the console, and are independent of the names `deploy-aws.sh`
> creates for itself (`disucar-erp-*`).

---

## Architecture Overview

```
                        ┌─────────────────────────────────────┐
                        │           AWS Cloud                 │
                        │                                     │
  Users ──── Internet ──┤  Route 53 (DNS)                    │
                        │       │                             │
                        │  Elastic IP ──► Security Group      │
                        │                    │                │
                        │              EC2 t2.micro           │
                        │         ┌──────────────────┐        │
                        │         │  Nginx (port 80) │        │
                        │         │  SSL (port 443)  │        │
                        │         │  Next.js (:3000) │        │
                        │         │  PostgreSQL       │        │
                        │         │  (Docker)        │        │
                        │         └──────┬───────────┘        │
                        │                │                     │
                        │         EBS Volume (30 GB)          │
                        │         (database + uploads)        │
                        │                                     │
                        │  S3 Bucket (file uploads) [opt]     │
                        │  CloudWatch  (monitoring) [opt]     │
                        │  IAM         (access control)       │
                        │  Billing Alerts (cost alerts)       │
                        └─────────────────────────────────────┘
```

---

## AWS Services Summary

| Service | Purpose | Free Tier | Monthly cost after free tier |
|---|---|---|---|
| **EC2 t2.micro** | The server that runs everything | 750 hrs/month (12 mo) | ~$8.63 |
| **EBS gp2 30 GB** | Disk storage for DB and files | 30 GB (12 mo) | ~$3.00 |
| **Elastic IP** | Fixed public IP address | Free when attached | Free |
| **Security Group** | Firewall / port rules | Always free | Free |
| **VPC (default)** | Private network | Always free | Free |
| **IAM** | User access management | Always free | Free |
| **Billing Alerts** | Cost notifications | Always free | Free |
| **Route 53** | Domain DNS management | ❌ Not free | $0.50/zone/mo |
| **ACM / Let's Encrypt** | SSL certificate | Free (Let's Encrypt) | Free |
| **S3** | File upload storage | 5 GB (12 mo) | ~$0.023/GB |
| **CloudWatch** | Logs & monitoring | Basic free tier | ~$0.50/mo |

---

## Pre-requisites

| Requirement | Notes |
|---|---|
| AWS account | [aws.amazon.com/free](https://aws.amazon.com/free) |
| Credit/debit card | For account verification (no charge on free tier) |
| Key pair `.pem` file | Created in Step 2 |
| Domain name | Optional — required only for HTTPS |

---

## Step 1 — Create Your AWS Account

1. Go to **https://aws.amazon.com/free**
2. Click **Create a Free Account**
3. Enter your email, choose an account name
4. Set a strong password
5. Fill in contact details — select **Personal** account type
6. Enter payment card (identity verification only — no charge on free tier)
7. Verify via SMS or voice call
8. Choose **Basic support — Free**
9. Confirm the email AWS sends you

> ⚠️ AWS requires a valid payment method even for free tier. They place a ~$1 temporary hold to verify the card, which is reversed within a few days.

---

## Step 2 — Create an IAM User (Security Best Practice)

Never use your root account for day-to-day work. Create a dedicated admin user.

1. In the AWS Console search bar, type **IAM** and click it
2. In the left sidebar, click **Users**
3. Click **Create user**
4. **User name:** `disucar-sales-admin`
5. Check **Provide user access to the AWS Management Console**
6. Choose **I want to create an IAM user**
7. Set a password, uncheck "User must create new password"
8. Click **Next**
9. Click **Attach policies directly**
10. Search for and check **AdministratorAccess**
11. Click **Next → Create user**
12. **Download the CSV** with the login URL and credentials — save this safely
13. Sign out of root, sign in with your new IAM user going forward

> 🔐 Using an IAM user instead of root prevents accidental deletion of your entire AWS account if credentials are ever compromised.

---

## Step 3 — Choose Your Region

1. Sign in at **https://console.aws.amazon.com**
2. Top-right corner — click the region dropdown
3. Select **Asia Pacific (Singapore) — ap-southeast-1**

> Philippines users get the lowest latency from Singapore (~15–30ms vs 200ms+ from US regions).

---

## Step 4 — Set Up Billing Alerts

Do this before anything else so you are never surprised by a charge.

1. Click your account name (top right) → **Billing and Cost Management**
2. In the left sidebar, click **Budgets**
3. Click **Create budget**
4. Choose **Use a template → Zero spend budget** (alerts if anything is charged at all)
5. Enter your email address
6. Click **Create budget**

Then create a second safety budget:
1. Click **Create budget** again
2. Choose **Monthly cost budget**
3. **Budgeted amount:** `$10`
4. Add your email for alerts at 80% and 100% of the budget
5. Click **Create budget**

> 💡 With two budgets you get an alert the moment any charge appears, and another if it hits $10. This gives you full visibility at zero risk.

---

## Step 5 — Create a Key Pair

A key pair is a special password file (.pem) used to SSH into your server.

1. Go to **EC2 → Network & Security → Key Pairs**
2. Click **Create key pair**
3. **Name:** `disucar-sales-key`
4. **Type:** RSA
5. **Format:** `.pem`
6. Click **Create key pair** — the file downloads automatically

Save it somewhere permanent. On Mac/Linux, set permissions:
```bash
chmod 400 ~/Downloads/disucar-sales-key.pem
```

> ⚠️ You cannot download the key again. If lost, you must create a new key pair and re-launch the instance.

---

## Step 6 — Create a Security Group (Firewall)

1. Go to **EC2 → Network & Security → Security Groups**
2. Click **Create security group**

| Field | Value |
|---|---|
| Name | `disucar-sales-sg` |
| Description | `Disucar Sales ERP firewall` |
| VPC | Default |

**Inbound rules — add all 4:**

| Type | Protocol | Port | Source | Why |
|---|---|---|---|---|
| SSH | TCP | 22 | My IP | Admin-only SSH access |
| HTTP | TCP | 80 | 0.0.0.0/0, ::/0 | Web traffic |
| HTTPS | TCP | 443 | 0.0.0.0/0, ::/0 | Secure web traffic |
| Custom TCP | TCP | 3000 | 0.0.0.0/0 | Direct app (no domain) |

Leave **Outbound rules** as default (allow all). Click **Create security group**.

> 💡 After Nginx is configured with a domain, you can remove port 3000 — the app will be served through port 80/443.

---

## Step 7 — Launch the EC2 Instance

1. Go to **EC2 → Instances → Launch instances**

### Name and AMI
- **Name:** `disucar-sales-ops`
- **AMI:** Ubuntu Server 22.04 LTS — 64-bit (x86)

### Instance type
- Select **t2.micro** ← the "Free tier eligible" label confirms this

### Key pair
- Select **disucar-sales-key**

### Network settings
- Click **Edit**
- Auto-assign public IP: **Enable**
- Firewall: **Select existing → disucar-sales-sg**

### Storage
- **30 GiB** — **gp2** — check **Encrypt this volume**

Click **Launch instance**.

---

## Step 8 — Allocate and Attach an Elastic IP

Without an Elastic IP, your server's public IP address changes every time it restarts.

1. Go to **EC2 → Network & Security → Elastic IPs**
2. Click **Allocate Elastic IP address**
3. Leave all settings as default — click **Allocate**
4. Select the new Elastic IP → click **Actions → Associate Elastic IP address**
5. **Resource type:** Instance
6. **Instance:** Select `disucar-sales-ops`
7. Click **Associate**

Note this IP address (e.g., `54.123.45.67`) — this is your permanent server address.

> 💡 Elastic IPs are free as long as they are attached to a running instance. If you stop the instance, either keep the IP attached or release it to avoid a small charge (~$0.005/hr for unattached IPs).

---

## Step 9 — (Optional) Configure DNS with Route 53

Skip this step if you don't have a domain name yet.

### If you already have a domain registered elsewhere:
1. Log into your domain registrar (GoDaddy, Namecheap, etc.)
2. Find the DNS settings for your domain
3. Add an **A record:**

| Type | Name | Value | TTL |
|---|---|---|---|
| A | `ops` (or `@`) | Your Elastic IP | 300 |

### If you want to use Route 53:
1. Go to **Route 53 → Hosted zones → Create hosted zone**
2. Enter your domain name (e.g., `disucarsales.ph`)
3. Type: **Public hosted zone**
4. Click **Create hosted zone**
5. Note the 4 nameserver values (NS records)
6. Go to your domain registrar and update the nameservers to match Route 53's NS records
7. Add an **A record** pointing to your Elastic IP

**Verify DNS is working** (wait 5–30 minutes for propagation):
```bash
nslookup ops.disucarsales.ph
# Should return your Elastic IP
```

> Route 53 costs $0.50/hosted zone/month. If budget is tight, use your registrar's free DNS.

---

## Step 10 — Connect via SSH

### Mac / Linux
```bash
ssh -i ~/Downloads/disucar-sales-key.pem ubuntu@YOUR-ELASTIC-IP
```

### Windows (Command Prompt / PowerShell)
```powershell
ssh -i C:\Users\YourName\Downloads\disucar-sales-key.pem ubuntu@YOUR-ELASTIC-IP
```

Type `yes` when asked about host authenticity. You'll see the Ubuntu prompt:
```
ubuntu@ip-172-31-xx-xx:~$
```

---

## Step 11 — Run the Setup Script

Inside the SSH session:

```bash
curl -fsSL https://raw.githubusercontent.com/YOUR-ORG/YOUR-REPO/main/setup-aws.sh -o setup-aws.sh
sudo bash setup-aws.sh
```

The script will prompt you for:
- **Domain** — enter your domain (e.g., `ops.disucarsales.ph`) or press Enter to skip
- **SSL email** — your email for Let's Encrypt certificate notifications
- **Organisation details** — name, address, phone, email, TIN, etc.

**What the script does automatically:**
1. Adds swap space (critical for t2.micro's 1 GB RAM)
2. Installs Docker, Nginx, Certbot, Git, UFW
3. Clones the application repository
4. Generates secure random passwords for the database and NextAuth
5. Writes the `.env` configuration file
6. Builds Docker containers and starts the application
7. Configures Nginx as a reverse proxy
8. Obtains a free SSL certificate from Let's Encrypt (if domain provided)
9. Sets up UFW firewall rules
10. Registers a systemd service so the app restarts automatically after reboots
11. Saves all credentials to `/root/disucar-sales-credentials.txt`

**Expected total time:** 20–30 minutes on t2.micro

---

## Step 12 — (Optional) Set Up S3 for File Storage

By default, uploaded files (logos, documents) are stored in a Docker volume on the EC2 disk. For better durability and to survive server rebuilds, move file storage to S3.

### Create an S3 bucket:
1. Go to **S3 → Create bucket**
2. **Bucket name:** `disucar-sales-uploads-yourcompany` (must be globally unique)
3. **Region:** ap-southeast-1
4. **Block all public access:** Keep enabled (files served through the app)
5. Click **Create bucket**

### Create IAM credentials for S3 access:
1. Go to **IAM → Users → Create user**
2. **Name:** `disucar-sales-s3-access`
3. Attach policy: **AmazonS3FullAccess** (or create a custom policy limited to your bucket)
4. After creating: click the user → **Security credentials → Create access key**
5. Choose **Application running on an AWS compute service**
6. Copy the **Access Key ID** and **Secret Access Key**

### Add to your `.env` file on the server:
```bash
sudo nano /opt/disucar-sales/.env
```
Add these lines:
```
AWS_REGION=ap-southeast-1
AWS_S3_BUCKET=disucar-sales-uploads-yourcompany
AWS_ACCESS_KEY_ID=AKIAIOSFODNN7EXAMPLE
AWS_SECRET_ACCESS_KEY=wJalrXUtnFEMI/K7MDENG/bPxRfiCYEXAMPLEKEY
```
Then restart the app: `docker compose -C /opt/disucar-sales restart app`

> Free tier includes 5 GB S3 storage for 12 months. After that: ~$0.023/GB/month.

---

## Step 13 — (Optional) Enable CloudWatch Monitoring

CloudWatch lets you see CPU, memory, disk, and receive alerts when something is wrong.

### Basic EC2 metrics (automatic — no setup needed):
- CPU utilisation
- Network in/out
- Disk read/write

These appear automatically in **EC2 → Instances → select instance → Monitoring tab**

### Set up a CPU alert:
1. Go to **CloudWatch → Alarms → Create alarm**
2. Click **Select metric → EC2 → Per-Instance Metrics**
3. Find your instance and select **CPUUtilization**
4. **Period:** 5 minutes
5. **Threshold:** Greater than **80%** for 2 consecutive periods
6. **Action:** Send notification to your email (create an SNS topic)
7. **Alarm name:** `disucar-sales-high-cpu`
8. Click **Create alarm**

### Install CloudWatch agent (optional — for memory/disk metrics):
```bash
# On your EC2 instance via SSH:
wget https://s3.amazonaws.com/amazoncloudwatch-agent/ubuntu/amd64/latest/amazon-cloudwatch-agent.deb
sudo dpkg -i amazon-cloudwatch-agent.deb
sudo /opt/aws/amazon-cloudwatch-agent/bin/amazon-cloudwatch-agent-config-wizard
```
> CloudWatch basic metrics are free. Custom metrics (memory, disk) cost ~$0.30/metric/month after free tier.

---

## Step 14 — Set Up Automated Database Backups

### Option A: EBS Snapshots (easiest — backs up entire disk)
1. Go to **EC2 → Elastic Block Store → Snapshots**
2. Click **Create snapshot**
3. **Resource type:** Instance
4. Select your `disucar-sales-ops` instance
5. **Description:** `disucar-sales-manual-backup`
6. Click **Create snapshot**

**Automate daily snapshots with AWS Backup:**
1. Go to **AWS Backup → Backup plans → Create backup plan**
2. **Build a new plan**
3. **Backup rule name:** `daily-disucar-sales`
4. **Backup frequency:** Daily
5. **Backup window:** 02:00 AM (low traffic time)
6. **Retain for:** 7 days
7. Assign the `disucar-sales-ops` instance as the resource
8. Click **Create plan**

> EBS snapshots are stored in S3 and cost ~$0.05/GB/month. A 30 GB snapshot = ~$1.50/month.

### Option B: PostgreSQL dump (more granular)
Add this cron job on the server:
```bash
# Daily PostgreSQL backup at 2 AM, keep 7 days
(sudo crontab -l 2>/dev/null; echo "0 2 * * * mkdir -p /opt/backups && docker exec disucar-sales-db pg_dump -U postgres disucar-sales | gzip > /opt/backups/disucar-sales-\$(date +\%Y\%m\%d).sql.gz && find /opt/backups -mtime +7 -delete") | sudo sort -u | sudo crontab -
```

---

## Step 15 — Verify Everything

### 1. Check containers are running
```bash
docker ps
```
Expected:
```
NAMES            STATUS
disucar-sales-ops    Up X minutes (healthy)
disucar-sales-db     Up X minutes (healthy)
```

### 2. Open the application
- **With domain:** `https://ops.disucarsales.ph`
- **Without domain:** `http://YOUR-ELASTIC-IP:3000`

### 3. Test login
| Role | Email | Password |
|---|---|---|
| Admin | `admin@disucarsales.ph` | `password123` |
| Finance | `finance@disucarsales.ph` | `password123` |
| Warehouse | `warehouse@disucarsales.ph` | `password123` |

### 4. Check SSL certificate (if domain configured)
```bash
sudo certbot certificates
```

### 5. Test auto-restart (optional)
```bash
sudo systemctl status disucar-sales
# Should show: Active: active (running)
```

---

## Scheduled Jobs (Cron)

This app has no built-in scheduler (it's not deployed on a platform with native cron, like
Vercel). The "unbalanced collections" auto-issuance feature needs an external trigger — set up a
crontab entry on the EC2 host once `CRON_SECRET` is set in `.env`:

```bash
crontab -e
```
Add a line to run it daily at 8am server time:
```
0 8 * * * curl -fsS -H "x-cron-secret: $CRON_SECRET" https://ops.disucarsales.ph/api/cron/unbalanced-collections >> /var/log/disucar-cron.log 2>&1
```
Replace the URL with your actual domain, and `$CRON_SECRET` with the literal value from `.env`
(crontab doesn't read your app's `.env` — hardcode the secret in the crontab line, or source it
from a file with appropriate permissions). Verify it's protected: calling the endpoint without
the header, or with the wrong value, should return `401 Unauthorized`.

---

## GPS Integration (Fleet Tracking)

The app doesn't set up GPS hardware or pick a tracking provider — it exposes a generic webhook
that any GPS/fleet-tracking platform can POST location updates to, once `GPS_WEBHOOK_SECRET` is
set in `.env`.

**1. Register each truck** in the app first: Fleet → Add Vehicle, with a plate number and a
**GPS Device ID** — this must exactly match the device/vehicle identifier your GPS provider uses,
since that's how incoming pings get matched to a vehicle.

**2. Give your GPS provider this webhook**, however they support outbound integrations (most
platforms call this a "webhook," "HTTP push," or "custom integration"):

```
POST https://<your-domain>/api/gps/ingest
Header: x-gps-secret: <GPS_WEBHOOK_SECRET from .env>
Content-Type: application/json
```

Body — a single ping, or an array of pings (for platforms that batch multiple trucks per call):
```json
{
  "deviceId": "TRK-001",
  "lat": 14.5995,
  "lng": 120.9842,
  "speedKph": 42,
  "headingDeg": 180,
  "recordedAt": "2026-07-20T08:15:00Z"
}
```
`deviceId`, `lat`, `lng` are required; `speedKph`, `headingDeg`, `recordedAt` are optional
(`recordedAt` defaults to server-receive time if omitted — better to send it if your provider has
it, for accurate trail history).

**If your provider only supports a pull-based API** (you have to poll them, e.g. Traccar's REST
API) rather than pushing to a webhook, you'd need a small relay script/cron job that polls the
provider and forwards each result to `/api/gps/ingest` in this shape — this isn't built yet since
no provider has been chosen; ask if you need this once you know the provider.

A ping for an unregistered `deviceId` is accepted (200 OK) but reported as rejected in the
response body — it won't break the provider's delivery/retry behavior, but the position won't
show up until a matching Vehicle is registered in Fleet.

---

## Post-Deployment Security Checklist

- [ ] Change all default passwords in Settings → Users
- [ ] Copy credentials from `/root/disucar-sales-credentials.txt` to a password manager, then delete the file: `rm /root/disucar-sales-credentials.txt`
- [ ] Remove port 3000 from security group if Nginx/domain is configured
- [ ] Enable EC2 termination protection: EC2 → Instance settings → Change termination protection → Enable
- [ ] Verify billing alerts are active: Billing → Budgets
- [ ] Test that a reboot auto-restarts the app: `sudo reboot` (wait 2 min, check URL)

---

## Updating the Application

```bash
cd /opt/disucar-sales
git pull
docker compose up -d --build app
```

---

## Troubleshooting

### App not accessible
```bash
docker ps -a                                          # are containers running?
docker compose -C /opt/disucar-sales logs --tail=50 app   # app errors
sudo systemctl status nginx                           # nginx status
sudo ss -tlnp | grep -E '80|443|3000'                # port check
```

### SSL certificate not working
```bash
sudo nginx -t                                         # test nginx config
sudo certbot --nginx -d yourdomain.com                # re-run certbot
sudo certbot certificates                             # check cert status
```

### Database migration failed
```bash
docker compose -C /opt/disucar-sales run --rm migrate
```

### Out of disk space
```bash
df -h                         # check disk
docker system prune -f        # clean unused images/containers
```

### Server ran out of memory (OOM)
```bash
free -h                       # check RAM + swap
swapon --show                 # confirm swap is active
```

---

## Cost Summary

### Free Tier Period (Months 1–12)
| Service | Cost |
|---|---|
| EC2 t2.micro (750 hrs/month) | $0.00 |
| EBS 30 GB gp2 | $0.00 |
| Elastic IP (attached) | $0.00 |
| Data transfer (first 15 GB/mo) | $0.00 |
| **Total** | **$0.00/month** |

### After Free Tier (Month 13+, ap-southeast-1)
| Service | Cost |
|---|---|
| EC2 t2.micro | ~$8.63/month |
| EBS 30 GB gp2 | ~$3.00/month |
| Data transfer (10 GB) | ~$1.00/month |
| Route 53 (optional) | $0.50/month |
| **Total** | **~$12–13/month** |

### With $100 AWS Credit
Your $100 credit kicks in after free tier expires and covers approximately **7–8 months** of post-free-tier costs — giving you roughly **20 months of effectively free hosting** in total.
