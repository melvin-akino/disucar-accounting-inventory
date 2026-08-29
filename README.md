# Disucar Sales ERP

Full-stack enterprise resource planning system for Disucar Sales Incorporated, a Philippine grocery/FMCG distributor. Covers sales order management, multi-warehouse inventory, purchase orders, accounting/ledger, BIR compliance, and reporting — all in one application.

**Stack:** Next.js 14 App Router · TypeScript · PostgreSQL · Prisma ORM · NextAuth.js · Tailwind CSS · Docker

---

## Modules at a Glance

| Module | Path | Description | Roles |
|---|---|---|---|
| Dashboard | `/dashboard` | Role-specific KPIs, revenue trend chart | All |
| Sales Orders | `/orders` | Full order lifecycle with state machine | AGENT, FINANCE, WAREHOUSE, ADMIN, CUSTOMER |
| Approvals | `/approvals` | Finance approval queue with audit trail | FINANCE, ADMIN |
| Warehouse | `/warehouse` | Kanban board for pick/pack operations | WAREHOUSE, ADMIN |
| Shipments | `/shipments` | Shipment tracking, delivery confirmation, POD | WAREHOUSE, FINANCE, ADMIN, DRIVER |
| Purchase Orders | `/inbound` | PO creation, goods receipt, damage tracking | WAREHOUSE, ADMIN |
| Inventory | `/inventory` | Stock levels, move history, reorder alerts | WAREHOUSE, ADMIN |
| Catalog | `/catalog` | Product/SKU management | AGENT, FINANCE, ADMIN |
| Customers | `/customers` | CRM-lite: credit limits, TIN, terms | AGENT, FINANCE, ADMIN |
| Suppliers | `/suppliers` | Supplier management with performance ratings | WAREHOUSE, FINANCE, ADMIN |
| Accounting | `/ledger` | Full double-entry ledger, AR, AP, BIR filings | FINANCE, ADMIN |
| Reports | `/reports` | Configurable report builder with export | FINANCE, ADMIN |
| Activity Log | `/audit` | Unified activity feed across all modules | FINANCE, ADMIN |
| Settings | `/settings` | Users, theme, org config | ADMIN |

> Leases, PMS/Work Orders, Equipment, and Customer Portal were removed — they were built for a
> prior medical-equipment-distributor product and don't apply to Disucar's business.

---

## Feature Details

### Sales Orders
- Create orders with line items from catalog; auto-compute subtotal / VAT (12%) / CWT (2%)
- State machine: `PENDING → APPROVED → PREPARING → SHIPPED → DELIVERED` (or `CANCELLED` from any state)
- Order events log every state transition with actor and timestamp
- Print/PDF: clean order confirmation at `/print/order/[id]`
- CSV export of full order list

### Approvals
- Finance queue for orders awaiting approval
- Approve or reject with notes; rejection surfaces back to the placing agent

### Warehouse & Shipments
- Kanban board groups orders by warehouse state (Approved → Preparing → Shipped → Delivered)
- Shipment records: tracking number, courier, ETA, proof-of-delivery signatory
- Delivery confirmation modal with POD sign-off
- Print Delivery Receipt / Packing List at `/print/delivery/[id]` with 3-party signature block

### Purchase Orders (Inbound)
- Create POs for suppliers with line items; PO ID auto-formatted `PO-YYYY-NNNNN`
- Status flow: `EXPECTED → RECEIVING → RECEIVED` (or `DELAYED`)
- Goods receipt: input accepted and damaged quantities per line; auto-updates stock and creates stock moves in a single transaction
- Print Purchase Order document at `/print/po/[id]` with supplier T&C and approval signature block

### Inventory
- Real-time stock levels by SKU and warehouse (on-hand, reserved, available)
- Reorder level alerts with visual flags
- Stock Move history: receipts, picks, transfers, adjustments, returns — with cost-per-unit
- CSV export: current stock snapshot or full move history

### Accounting / Ledger
- **Chart of Accounts** — 35-account Philippine COA (assets, liabilities, equity, revenue, expenses)
- **Journal Entries** — manual GL entries with debit/credit lines; source-tagged (AR/AP/Bank/Payroll/Inv/GL)
- **AR (Receivables)** — invoices linked to sales orders; record payments; track DRAFT/OPEN/PARTIAL/OVERDUE/PAID
- **AP (Payables)** — supplier bills; record payments; overdue aging
- **Trial Balance** — computed from opening balances + all journal lines
- **Financial Statements** — live Income Statement and Balance Sheet at `/print/financials`
- **BIR Compliance** — filing tracker for 2550M, 2550Q, 1601C, 1601-EQ, 1702-RT; mark as filed with eFPS reference number
- **BIR Form Print** — formatted filing summary at `/print/bir/[id]`
- **Invoice Print** — official invoice with line items, VAT, payment instructions at `/print/invoice/[id]`
- **Export GL** — full journal CSV with account codes, DR/CR amounts, memo

### Report Builder
Five configurable report types at `/reports`:

| Report | Description | Filters |
|---|---|---|
| Sales Summary | Revenue by month, top customers, VAT/CWT breakdown | Date range |
| AR Aging | Outstanding invoices bucketed: Current / 1–30d / 31–60d / 61–90d / 90+d | None (all open) |
| Inventory Snapshot | Stock levels by SKU and warehouse, low-stock flags | None (current) |
| PO Summary | Purchase orders by supplier and status | Date range |
| P&L Statement | Revenue vs expenses from trial balance entries | Date range |

All reports: Export CSV · Print (A4 layout at `/print/report`)

### Activity Log
Unified audit feed merging:
- Order state transitions (with actor)
- Stock moves (type, quantity, warehouse, reference)
- Journal entries (source, memo, posted by)

Filter by type (Orders / Inventory / Accounting), full-text search, grouped by date.

### Notifications
In-app bell in topbar — role-based alerts fetched on mount:
- **FINANCE/ADMIN:** overdue invoices, BIR filings due, pending approvals
- **WAREHOUSE/ADMIN:** orders ready to pick, overdue PO arrivals, low stock items

### Dashboards
Role-specific KPI cards and summaries:
- **ADMIN:** revenue trend chart (6-month SVG sparkline), total orders, inventory alerts, financial summary
- **FINANCE:** AR balance, overdue invoices, BIR filings due, cash position
- **WAREHOUSE:** orders to pick, shipments in transit, stock alerts, PO arrivals
- **AGENT:** my orders, pipeline value, customer count
- **CUSTOMER:** my orders, outstanding invoices

### CSV Exports
Available on every key page:

| Export | Route | Auth |
|---|---|---|
| Orders | `/api/export/orders` | AGENT, FINANCE, ADMIN |
| Inventory (stock) | `/api/export/inventory` | WAREHOUSE, ADMIN |
| Stock Moves | `/api/export/stock-moves` | WAREHOUSE, ADMIN |
| Customers | `/api/export/customers` | AGENT, FINANCE, ADMIN |
| Suppliers | `/api/export/suppliers` | WAREHOUSE, FINANCE, ADMIN |
| Journal (GL) | `/api/export/journal` | FINANCE, ADMIN |
| Reports | `/api/export/reports?type=...` | FINANCE, ADMIN |

All CSVs include UTF-8 BOM for Excel compatibility.

### Print / PDF Pages
All print pages use the browser Print dialog (`Ctrl+P → Save as PDF`). No external PDF library.

| Document | URL |
|---|---|
| Order Confirmation | `/print/order/[id]` |
| Delivery Receipt / Packing List | `/print/delivery/[id]` |
| Purchase Order | `/print/po/[id]` |
| Invoice | `/print/invoice/[id]` |
| BIR Filing Form | `/print/bir/[id]` |
| Financial Statements (IS + BS) | `/print/financials` |
| Report | `/print/report?type=...` |

---

## Roles & Permissions

| Role | Description |
|---|---|
| `ADMIN` | Full access to all modules including Settings |
| `FINANCE` | Accounting, approvals, AR/AP, BIR, reports, customers |
| `AGENT` | Create orders, manage customers, view catalog |
| `WAREHOUSE` | Inventory, shipments, purchase orders |
| `DRIVER` | Shipment delivery confirmation only |
| `CUSTOMER` | Own orders and invoices only |

---

## Setup

### Prerequisites

| Tool | Version |
|---|---|
| Node.js | 18+ |
| PostgreSQL | 14+ (or Supabase free tier) |
| Docker | 24+ (optional, for containerized deployment) |

### Local Development

**1. Clone and install**
```bash
git clone https://github.com/YOUR-ORG/YOUR-REPO.git
cd YOUR-REPO
npm install
```

**2. Configure environment**
```bash
cp .env.example .env
```

Edit `.env`:
```env
# PostgreSQL — Supabase transaction + session URLs, or plain postgres://
DATABASE_URL="postgresql://postgres:password@localhost:5432/disucarsales"
DIRECT_URL="postgresql://postgres:password@localhost:5432/disucarsales"

# NextAuth — generate: openssl rand -base64 32
NEXTAUTH_SECRET="your-secret-here"
NEXTAUTH_URL="http://localhost:3000"

# Branding
NEXT_PUBLIC_APP_NAME="Disucar Sales ERP"
NEXT_PUBLIC_ORG="Disucar Sales Inc"
```

**3. Push schema and seed demo data**
```bash
npm run db:push   # applies Prisma schema to your database
npm run db:seed   # loads demo accounts, catalog, customers, suppliers, and sample orders
```

**4. Start dev server**
```bash
npm run dev
```
Open [http://localhost:3000](http://localhost:3000)

---

### Docker (Production)

```bash
# Copy and configure environment
cp .env.example .env.production
# Edit DATABASE_URL, NEXTAUTH_SECRET, NEXTAUTH_URL in .env.production

# Build and start
docker compose up -d --build

# Run migrations on first deploy
docker compose exec app npx prisma db push
docker compose exec app npx prisma db seed
```

The app listens on port **3000**. Recommended: Nginx or Caddy as reverse proxy for HTTPS.

---

## Demo Accounts

All demo passwords: `password123`

| Email | Role |
|---|---|
| admin@disucarsales.ph | ADMIN |
| finance@disucarsales.ph | FINANCE |
| agent@disucarsales.ph | AGENT |
| warehouse@disucarsales.ph | WAREHOUSE |
| procurement@puregold-urdaneta.ph | CUSTOMER |

---

## Order State Machine

```
                    ┌──────────────────────────────────────────┐
                    │           CANCELLED (terminal)           │
                    └──────────────▲───────────────────────────┘
                                   │ Finance / Admin
                                   │
PENDING ──► APPROVED ──► PREPARING ──► SHIPPED ──► DELIVERED
         Finance/Admin  Warehouse     Warehouse    Warehouse/Finance
```

---

## Database Schema (Summary)

Key relationships (see `prisma/schema.prisma` for full detail):

```
Customer ──< Order ──< OrderLine ──── CatalogItem
                 ├──< OrderEvent
                 ├──  Shipment
                 └──< Invoice

Supplier ──< InboundPO ──< InboundPOLine ──── CatalogItem

CatalogItem ──< Stock (per Warehouse)
            └──< StockMove

JournalEntry ──< JournalLine
Invoice · Bill · BirFiling

User (6 roles)
```

---

## Project Structure

```
src/
├── app/
│   ├── (dashboard)/          # Authenticated routes (sidebar + topbar layout)
│   │   ├── approvals/
│   │   ├── audit/            # Activity Log
│   │   ├── catalog/
│   │   ├── customers/
│   │   ├── dashboard/
│   │   ├── inbound/          # Purchase Orders
│   │   ├── inventory/
│   │   ├── ledger/           # Accounting
│   │   ├── orders/
│   │   ├── reports/          # Report Builder
│   │   ├── settings/
│   │   ├── shipments/
│   │   ├── suppliers/
│   │   └── warehouse/
│   ├── api/
│   │   ├── auth/             # NextAuth handler
│   │   ├── export/           # CSV export endpoints (8 routes)
│   │   └── notifications/    # Role-based notification feed
│   └── print/                # PDF/print document pages (7 routes)
├── components/
│   ├── layout/               # Sidebar, Topbar, NotificationBell, NavContext
│   └── ui/                   # Modal, StatePill, etc.
├── lib/
│   ├── auth.ts               # NextAuth config + role extension
│   ├── coa.ts                # Chart of accounts, opening balances, trial balance
│   ├── csv.ts                # CSV builder with UTF-8 BOM
│   ├── prisma.ts             # Prisma client singleton
│   └── utils.ts              # peso(), fmtDate(), shortPeso(), cn()
└── types/                    # Shared TypeScript types
prisma/
├── schema.prisma             # 30+ models, enums, relations
└── seed.ts                   # Demo data seeder
```

---

## Tech Choices

| Concern | Choice | Rationale |
|---|---|---|
| Framework | Next.js 14 App Router | Server components + server actions eliminate a separate API layer |
| Database | PostgreSQL + Prisma | Type-safe queries, schema migrations, relation support |
| Auth | NextAuth.js | Session-based, role-extensible, credential + OAuth-ready |
| Styling | Tailwind CSS + CSS custom properties | Utility-first; design tokens enable light/dark theming |
| Charts | Inline SVG polyline | Zero dependencies; sufficient for dashboard sparklines |
| PDF | Browser print dialog | No server-side library needed; works offline, native |
| CSV | Custom `buildCSV()` | UTF-8 BOM included; no dependency |
| Containers | Docker + docker-compose | Single-command deploy; health check via `127.0.0.1:3000` (IPv4 explicit for Alpine) |
