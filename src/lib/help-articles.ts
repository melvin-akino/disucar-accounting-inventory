export type HelpRole = "ADMIN" | "AGENT" | "FINANCE" | "WAREHOUSE" | "DRIVER" | "CUSTOMER";

export interface HelpStep {
  title: string;
  description: string;
  tip?: string;
  warning?: string;
  note?: string;
}

export interface HelpWorkflow {
  title: string;
  description?: string;
  roles?: HelpRole[];
  steps: HelpStep[];
}

export interface HelpArticle {
  slug: string;
  title: string;
  subtitle: string;
  icon: string;
  roles: HelpRole[];
  overview: string;
  concepts?: { term: string; definition: string }[];
  workflows: HelpWorkflow[];
  faqs?: { q: string; a: string }[];
}

export const HELP_ARTICLES: HelpArticle[] = [

  // ─── 1. Getting Started ──────────────────────────────────────────────────────
  {
    slug: "getting-started",
    title: "Getting Started",
    subtitle: "Login, navigation, and your first steps in the system",
    icon: "🚀",
    roles: ["ADMIN", "AGENT", "FINANCE", "WAREHOUSE", "DRIVER", "CUSTOMER"],
    overview:
      "This guide walks you through logging in, understanding your role, and finding your way around the system. Every user has a role that controls which pages they can see and what actions they can take. This is by design — a warehouse staff member doesn't need access to accounting, and a customer only sees their own orders.",
    concepts: [
      { term: "Role", definition: "Your job function in the system. Set by an Administrator. Determines which pages and actions are available to you." },
      { term: "Dashboard", definition: "Your home screen after login. Shows a summary of activity relevant to your role." },
      { term: "Sidebar", definition: "The navigation menu on the left side of every page. Only shows sections your role can access." },
      { term: "Session", definition: "Your login session. The system will ask you to log in again after a period of inactivity." },
    ],
    workflows: [
      {
        title: "Logging in for the first time",
        steps: [
          { title: "Open the application", description: "Navigate to the app URL provided by your administrator. The login screen will appear automatically if you are not already logged in." },
          { title: "Enter your credentials", description: "Type in your email address and password exactly as provided by your Administrator. Passwords are case-sensitive.", tip: "If you were given a temporary password, you can ask your Administrator to update it in Settings → Users." },
          { title: "Click Sign In", description: "After successful login you will land on the Dashboard. The sidebar on the left shows the sections available to your role." },
          { title: "Familiarise yourself with the layout", description: "The sidebar is your main navigation. The top bar shows your name and role. Click your name in the sidebar footer to see your account details. Click Sign Out when done." },
        ],
      },
      {
        title: "Understanding your role's access",
        steps: [
          { title: "Agent", description: "Can create and view sales orders, create quotations, and manage customers. Cannot approve orders or access accounting.", note: "Agents see all orders across all customers unless restricted." },
          { title: "Finance", description: "Can approve orders, create and manage invoices, record payments, manage bills, handle BIR filings, and run reports. Cannot physically handle stock." },
          { title: "Warehouse", description: "Can advance orders from Approved → Preparing → Shipped, receive inbound purchase orders, manage stock levels, and handle returns and transfers." },
          { title: "Driver", description: "Can view assigned shipments. Marks deliveries as completed." },
          { title: "Admin", description: "Full access to all modules including user management and system settings.", warning: "Admin accounts should be kept to a minimum. Use role-specific accounts for daily operations." },
          { title: "Customer", description: "Can view and place their own orders, invoices, and quotations. Cannot see any other customer's data." },
        ],
      },
      {
        title: "Navigating the application",
        steps: [
          { title: "Use the sidebar to move between modules", description: "Click any item in the left sidebar to navigate. The current page is highlighted. On mobile, tap the hamburger icon to open the sidebar." },
          { title: "Use breadcrumbs and back buttons", description: "Detail pages (like an individual order) have a ← back button at the top left. Use this rather than the browser back button for the best experience." },
          { title: "Look for action buttons in the top-right of cards", description: "Most list pages have action buttons like '+ New Order' or 'Export CSV' in the top right area of the page or card header." },
          { title: "Use the Help button on each page", description: "Every major page has a ? Help button in the top-right area. Clicking it opens the relevant training article for that module.", tip: "Press ? on any page to jump directly to this help system." },
        ],
      },
    ],
    faqs: [
      { q: "I forgot my password — what do I do?", a: "Contact your Administrator. They can reset your password from Settings → Users → Edit User." },
      { q: "Why can't I see a certain menu item?", a: "Menu items are controlled by your role. If you need access to a section, ask your Administrator to update your role or create a more appropriate account." },
      { q: "Can I be logged in on multiple devices at the same time?", a: "Yes. Sessions are independent per device and browser." },
      { q: "Is my data saved automatically?", a: "Yes — all actions (creating orders, recording payments, etc.) are saved immediately when you click the confirm or submit button. There is no manual save step." },
      { q: "I'm getting \"This account can only log in from the office network\" — what does that mean?", a: "Your Administrator has restricted your account to logging in from the office. Agents, Drivers, and accounts flagged Owner are always exempt from this. If you believe you're being blocked in error, contact your Administrator." },
    ],
  },

  // ─── 2. Dashboard ────────────────────────────────────────────────────────────
  {
    slug: "dashboard",
    title: "Dashboard",
    subtitle: "Your command centre — key metrics at a glance",
    icon: "📊",
    roles: ["ADMIN", "AGENT", "FINANCE", "WAREHOUSE"],
    overview:
      "The Dashboard is the first page you see after logging in. It gives you a real-time snapshot of the business: pending orders, stock alerts, overdue invoices, and upcoming maintenance. The exact widgets you see depend on your role — a Warehouse user sees stock and shipment data, while Finance sees AR and billing summaries.",
    concepts: [
      { term: "KPI Card", definition: "A summary number shown in a coloured box — e.g. 'Pending Orders: 12'. Click most KPI cards to navigate to the related list." },
      { term: "Revenue Chart", definition: "A bar chart showing monthly revenue for the current year. Based on delivered orders." },
      { term: "Pending Approvals", definition: "Orders in PENDING state waiting for a Finance or Admin user to approve them." },
      { term: "Morning Order Activity", definition: "ADMIN-only card showing each active agent's order count for today, up to 11:59:59 AM — a quick read on who's placing/closing orders early in the day. A zero count just means no orders yet, not necessarily that the agent isn't working." },
    ],
    workflows: [
      {
        title: "Reading the dashboard",
        steps: [
          { title: "Check pending approvals (Finance/Admin)", description: "The 'Pending Approvals' card shows how many orders are waiting. Click it to go straight to the Approvals page.", tip: "Aim to process approvals within one business day to keep the order pipeline moving." },
          { title: "Check low stock alerts (Warehouse)", description: "The inventory widget highlights items where on-hand quantity is at or below the reorder point. Click to go to Inventory and investigate.", warning: "Items showing 0 available (onHand minus reserved = 0) cannot be picked for new orders." },
          { title: "Check overdue invoices (Finance)", description: "The AR summary shows invoices past their due date. These represent cash that should already have been collected." },
          { title: "Review the revenue chart", description: "The bar chart shows month-over-month revenue from delivered orders. Hover over a bar to see the exact amount." },
          { title: "Review recent orders", description: "The recent orders table at the bottom shows the last 10 orders across all customers. Click any row to open the order detail." },
        ],
      },
    ],
    faqs: [
      { q: "The dashboard numbers don't match what I see on the orders page. Why?", a: "The dashboard may be cached for a few seconds. Refresh the page to get the latest figures." },
      { q: "Can I customise the dashboard?", a: "Not yet. The widgets shown are determined by your role and cannot be rearranged." },
    ],
  },

  // ─── 3. Sales Orders ─────────────────────────────────────────────────────────
  {
    slug: "sales-orders",
    title: "Sales Orders",
    subtitle: "Creating, tracking, and fulfilling customer orders end-to-end",
    icon: "🛒",
    roles: ["AGENT", "FINANCE", "WAREHOUSE", "ADMIN", "CUSTOMER"],
    overview:
      "A Sales Order records a customer's request to purchase products. It follows a strict lifecycle: PENDING → APPROVED → PREPARING → SHIPPED → DELIVERED. Each stage requires a specific role to advance it, creating a clear chain of responsibility from the sales agent who created the order all the way to the warehouse staff who ships it. The order cannot skip stages — this is intentional.",
    concepts: [
      { term: "Order State", definition: "Where the order is in its lifecycle. States move forward only (except cancellation). See the workflow diagram below." },
      { term: "Order Lines", definition: "Each product in the order, with quantity and unit price. An order must have at least one line." },
      { term: "Subtotal", definition: "The sum of all line totals before tax." },
      { term: "VAT", definition: "Value Added Tax at 12%, calculated on the subtotal. Automatically computed." },
      { term: "CWT 2307", definition: "Creditable Withholding Tax at 2%, deducted from the total. Optional — tick the checkbox if the customer is a withholding agent." },
      { term: "Stock Reservation", definition: "When an order is APPROVED, the required stock is reserved in the warehouse. Reserved stock cannot be promised to another order." },
      { term: "PO Reference", definition: "The customer's internal purchase order number. Optional, but important for large retail chains that require PO-matching on invoices." },
    ],
    workflows: [
      {
        title: "Creating a new sales order",
        roles: ["AGENT", "FINANCE", "ADMIN"],
        steps: [
          { title: "Go to Sales Orders → + New Order", description: "Click 'Sales Orders' in the sidebar, then click the '+ New Order' button in the top-right." },
          { title: "Select the customer", description: "Choose the customer from the dropdown. An account-standing banner shows their current unpaid receipt count; at 3 or more, a hold warning appears.", tip: "Can't find the customer? Go to Customers and create them first." },
          { title: "Select the warehouse", description: "Choose which warehouse will fulfil this order. Stock availability is checked per warehouse." },
          { title: "Add line items", description: "Click '+ Add line', select a product from the catalogue, set the quantity, and confirm the unit price (auto-filled from the catalogue but can be overridden).", warning: "You cannot save an order with a zero unit price. If a product is being given free-of-charge, this must be handled through a credit memo after invoicing." },
          { title: "Apply BIR Form 2307 if needed", description: "If the customer is a government entity or withholding agent, tick the 'Apply BIR Form 2307' checkbox. This deducts 2% CWT from the order total." },
          { title: "Add notes (optional)", description: "The Notes field is for delivery instructions, special handling requirements, or any message you want the warehouse to see." },
          { title: "Click Create Order", description: "The order is saved with state PENDING and an order number is assigned (e.g. SO-2026-0001). You are taken to the order detail page.", note: "Creation always succeeds even if the customer is on credit hold — the hold only blocks approval, where Finance/Admin must enter an override reason." },
        ],
      },
      {
        title: "Approving an order (PENDING → APPROVED)",
        roles: ["FINANCE", "ADMIN"],
        steps: [
          { title: "Go to Approvals or open the order", description: "The Approvals page shows all PENDING orders in one place. Alternatively, find the order in Sales Orders and open it." },
          { title: "Review the order details", description: "Check the customer, line items, quantities, and totals. Watch for the '⚠ Credit hold' badge on the Approvals page — it means the customer has 3+ unpaid receipts." },
          { title: "Click Approve Order", description: "The green Approve button is in the top-right area of the order detail sidebar. After clicking, the system checks that sufficient stock exists in the warehouse.", warning: "If stock is insufficient for any line item, the approval will be blocked. The error message tells you exactly which product is short. Coordinate with Warehouse to adjust stock first." },
          { title: "Stock is automatically reserved", description: "Once approved, the exact quantities are reserved in the warehouse. The inventory 'Reserved' column will increase. Reserved stock cannot be allocated to other orders." },
        ],
      },
      {
        title: "Preparing and shipping an order (APPROVED → PREPARING → SHIPPED)",
        roles: ["WAREHOUSE", "ADMIN"],
        steps: [
          { title: "Open the approved order", description: "Go to Sales Orders and filter by status APPROVED, or check your dashboard for approved orders ready to pick." },
          { title: "Click Start Preparing", description: "This moves the order to PREPARING, signalling the team to begin picking and packing." },
          { title: "Pick and pack the items", description: "Using the order detail page as your pick list, gather all items from the warehouse locations." },
          { title: "Create a shipment record (optional but recommended)", description: "If using a courier, open the Shipments page and add the tracking number, courier name, and estimated arrival date to the linked shipment record." },
          { title: "Click Mark Shipped", description: "Once the goods have left the warehouse, click Mark Shipped. This moves the order to SHIPPED and triggers an email notification to the customer." },
        ],
      },
      {
        title: "Confirming delivery (SHIPPED → DELIVERED)",
        roles: ["WAREHOUSE", "FINANCE", "ADMIN"],
        steps: [
          { title: "Confirm receipt of delivery", description: "Once the customer has received the goods (confirmed via POD, email, or phone), open the order and click Confirm Delivery." },
          { title: "Stock is automatically consumed", description: "On delivery, the system decrements the warehouse's on-hand quantity for each line item and releases the reservation. A PICK stock movement is recorded." },
          { title: "Generate an invoice (Finance)", description: "After delivery, go to Accounting → AR tab, find the order, and click Generate Invoice. This creates an invoice with the correct VAT split and posts the journal entry.", tip: "You can also generate the invoice from the order detail sidebar." },
        ],
      },
      {
        title: "Cancelling an order",
        roles: ["FINANCE", "ADMIN"],
        steps: [
          { title: "Open the order", description: "Find and open the order you need to cancel. Orders in DELIVERED or CANCELLED state cannot be cancelled again." },
          { title: "Click Cancel Order", description: "A confirmation dialog asks for a cancellation reason. Enter a brief explanation — this is recorded in the order history." },
          { title: "Stock reservation is released", description: "If the order was APPROVED or beyond, reserved stock is automatically released back to available inventory.", warning: "Cancellation is permanent. If the customer wants to re-order, a new Sales Order must be created." },
        ],
      },
      {
        title: "Printing an order",
        steps: [
          { title: "Open the order detail page", description: "Navigate to the specific order." },
          { title: "Click the Print button", description: "The print icon button in the top-right opens a print-ready version of the order in a new tab." },
          { title: "Use browser print or Save as PDF", description: "In the print view, click Print / Save PDF. Use your browser's PDF option to save a copy.", tip: "For formal invoices, use the Invoice PDF from Accounting → AR, not the order print. The invoice includes the correct VAT breakdown." },
        ],
      },
    ],
    faqs: [
      { q: "Can I edit an order after it's been created?", a: "No. Once an order is submitted it cannot be edited. If there is a mistake, cancel the order and create a new one. This audit trail is intentional." },
      { q: "Why is the Approve button not visible?", a: "Only Finance and Admin roles can approve orders. If you are an Agent, you cannot see this button." },
      { q: "The approval failed because of insufficient stock. What do I do?", a: "Coordinate with the Warehouse team to either receive new stock (via an Inbound PO) or do a stock adjustment. Once stock levels are corrected, try approving again." },
      { q: "Can a customer order be placed directly by the customer?", a: "Yes — users with the CUSTOMER role can create their own orders from Sales Orders → + New Order. These appear in the Sales Orders list as PENDING and require the same approval process." },
      { q: "What does 'Reserved' mean on the inventory page?", a: "Reserved is the quantity committed to approved-but-not-yet-delivered orders. Available stock = On Hand minus Reserved." },
    ],
  },

  // ─── 4. Quotations ───────────────────────────────────────────────────────────
  {
    slug: "quotations",
    title: "Quotations & Proforma Invoices",
    subtitle: "Send price proposals and convert accepted quotes to orders",
    icon: "📋",
    roles: ["AGENT", "FINANCE", "ADMIN"],
    overview:
      "A Quotation (also called a Proforma Invoice) is a formal price proposal sent to a customer before an order is placed. It lists products, quantities, and prices, and has a validity period. When the customer accepts, you can convert it into a Sales Order with one click — all the lines are carried over automatically.",
    concepts: [
      { term: "Quote Status", definition: "DRAFT → SENT → ACCEPTED/REJECTED → CONVERTED or EXPIRED." },
      { term: "Valid Until", definition: "The date after which prices are no longer guaranteed. After this date, a SENT quote is treated as Expired." },
      { term: "Convert to Order", definition: "The action that creates a Sales Order from an accepted quotation. The quotation status becomes CONVERTED and is linked to the new order." },
      { term: "Proforma Invoice", definition: "Another name for a quotation. Some supermarket chains and government agencies require a Proforma before they can raise an internal purchase order." },
    ],
    workflows: [
      {
        title: "Creating a quotation",
        steps: [
          { title: "Go to Quotations → + New Quotation", description: "Click Quotations in the sidebar. Click '+ New Quotation'." },
          { title: "Select customer, warehouse, and valid-until date", description: "Choose the customer this quote is for, the warehouse that would fulfil it, and set an expiry date (default is 30 days from today)." },
          { title: "Add line items", description: "Click '+ Add line', pick the product, set quantity and price. Repeat for each item." },
          { title: "Apply CWT 2307 if applicable", description: "Tick the CWT checkbox for withholding-agent customers." },
          { title: "Add notes", description: "Use the Notes field for payment terms, delivery conditions, or any special terms you want on the proforma document.", tip: "Standard notes: 'Prices valid for 30 days. Delivery within 3–5 business days from order confirmation.'" },
          { title: "Click Create Quotation", description: "The quote is saved as DRAFT. You can still edit it before sending." },
        ],
      },
      {
        title: "Sending a quotation to the customer",
        steps: [
          { title: "Find the DRAFT quote in the list", description: "Quotations list shows all quotes. Filter by DRAFT status if the list is long." },
          { title: "Click Send", description: "The Send button changes the status to SENT and sends an email notification to the customer's email addresses (contact email + linked CUSTOMER user emails).", note: "Email sending requires RESEND_API_KEY to be configured by the Administrator. If email is not configured, status still changes to SENT but no email is sent." },
          { title: "Share the PDF link", description: "Once sent, the quote has a printable proforma invoice. Click the quote ID or Print button to open it, then share the PDF with the customer.", tip: "Many customers prefer to receive the PDF by email as an attachment. Use Print → Save as PDF from the print view." },
        ],
      },
      {
        title: "Converting an accepted quote to a Sales Order",
        steps: [
          { title: "Confirm the customer has accepted", description: "Once the customer verbally or in writing confirms they want to proceed, find the SENT or ACCEPTED quote." },
          { title: "Click → Order", description: "The '→ Order' button appears on SENT and ACCEPTED quotes. Clicking it creates a new Sales Order with all the same line items, customer, and warehouse." },
          { title: "The Sales Order is created in PENDING state", description: "You are redirected to the new order. It follows the standard order lifecycle from here — it needs Finance approval before stock is reserved.", note: "The quotation status becomes CONVERTED and shows the linked order number." },
        ],
      },
      {
        title: "Editing a draft quote",
        steps: [
          { title: "Click Edit on a DRAFT quote", description: "Only DRAFT quotes can be edited. Once sent, you must create a new quotation if the customer requests changes." },
          { title: "Update lines, prices, or validity", description: "Make any needed changes in the edit modal." },
          { title: "Click Update Quotation", description: "Changes are saved immediately." },
        ],
      },
    ],
    faqs: [
      { q: "The customer wants to change quantities after I sent the quote. What do I do?", a: "You cannot edit a SENT quote. Create a new quotation with the updated quantities and send that one. Communicate to the customer that the new quote supersedes the old one." },
      { q: "Can a customer view their own quotations?", a: "Yes. Users with the CUSTOMER role can see SENT, ACCEPTED, and CONVERTED quotations for their own account in the Quotations list, and download the PDF." },
      { q: "What happens when a quote expires?", a: "The system shows SENT quotes with a past valid-until date as 'Expired'. The status does not change automatically in the backend — you would need to create a new quote if the customer still wants to proceed." },
    ],
  },

  // ─── 5. Approvals ────────────────────────────────────────────────────────────
  {
    slug: "approvals",
    title: "Order Approvals",
    subtitle: "Review and approve pending orders before fulfilment begins",
    icon: "✅",
    roles: ["FINANCE", "ADMIN"],
    overview:
      "The Approvals page is a dedicated queue for Finance and Admin users to review and approve Sales Orders. It shows all PENDING orders with key information — customer, total, credit hold status, and purchase quota status — so you can make informed decisions quickly without opening each order individually.",
    concepts: [
      { term: "Approval Queue", definition: "The list of all PENDING orders waiting for sign-off. Orders appear here as soon as an Agent submits them." },
      { term: "Credit Hold Badge", definition: "A red ⚠ badge under the customer name indicating the customer has 3 or more unpaid receipts. Requires an override reason to approve." },
      { term: "Quota Warning Badge", definition: "An amber ⚠ badge under the customer name indicating the order would exceed the customer's active purchase quota. Requires an override reason to approve." },
      { term: "Quota Override", definition: "When an order exceeds a customer's quota, Finance or Admin must provide a written business reason before approving. The reason is stored permanently on the order." },
    ],
    workflows: [
      {
        title: "Processing the approvals queue",
        steps: [
          { title: "Go to Approvals in the sidebar", description: "The Approvals page shows all PENDING orders sorted by date (oldest first — longest-waiting orders are at the top)." },
          { title: "Review each order", description: "For each pending order, check: customer name, order total, any notes from the agent, the red credit hold badge, and the amber quota warning badge if present." },
          { title: "Open the order for full details", description: "Click the order ID to open the full order detail page. Review individual line items and check if prices are correct." },
          { title: "Approve the order", description: "Click the green 'Approve' button. The system checks stock availability, whether the customer is on credit hold, and the customer's active purchase quota.", warning: "If the customer has 3+ unpaid receipts, a Credit Hold Override dialog appears requiring a written reason. If the order also exceeds the customer's quota, a separate quota override dialog appears next." },
          { title: "Handle a credit hold override", description: "When the ⚠ Credit Hold Override Required dialog appears, check the unpaid receipt count and enter a clear reason (e.g. 'Payment received, not yet posted'). Click 'Approve with Override'.", tip: "The real fix for a chronic hold is collecting payment — run AR Aging to follow up." },
          { title: "Handle a quota override", description: "When the ⚠ Quota Override Required dialog appears, review the quota period, the remaining amount, and enter a clear business justification (e.g. 'Emergency restock approved by Finance Director'). Click 'Approve with Override'. The reason is recorded permanently.", tip: "Run the per-customer Sales report regularly to monitor customers frequently hitting their quota ceiling." },
          { title: "Handle stock-blocked approvals", description: "If approval fails due to insufficient stock, note which product is short and coordinate with the Warehouse team to resolve before retrying." },
        ],
      },
    ],
    faqs: [
      { q: "An agent is asking me to approve an order urgently. How do I find it quickly?", a: "Go to Approvals and search by the customer name or order ID. The list is sorted oldest-first by default." },
      { q: "Should I approve orders even if the customer is on credit hold?", a: "This is a business decision. The system requires an override reason but will not block Finance/Admin from approving. Consider the customer's payment history and relationship before deciding." },
      { q: "What does the red ⚠ badge mean on the Approvals page?", a: "It means the customer has 3 or more unpaid receipts and is on credit hold. You must provide a written override reason to proceed with approval. The reason is stored on the order and visible to all Finance and Admin users." },
      { q: "What does the amber ⚠ badge mean on the Approvals page?", a: "It means the order total would push the customer over their active purchase quota for the current period. You must provide a written override reason to proceed with approval." },
      { q: "Where can I see all overrides that have been granted?", a: "Open the order detail page — the event log shows the override reason(s) and who approved it. You can also run the Sales report filtered by customer to review their total purchases against their quota." },
    ],
  },

  // ─── 6. Credit Holds ─────────────────────────────────────────────────────────
  {
    slug: "credit-limits",
    title: "Credit Holds & Overrides",
    subtitle: "Customer holds are based on unpaid receipt count, not peso amount",
    icon: "💳",
    roles: ["FINANCE", "ADMIN", "AGENT"],
    overview:
      "Disucar's customer limit is not based on an outstanding peso amount — it's based on the number of unpaid receipts (invoices) a customer has open. Once a customer has 3 or more unpaid receipts, they go on hold: new orders can still be created for them, but Finance or Admin must approve with a recorded override reason before the order can move forward. The Customer's Credit Limit field and Outstanding AR figure still exist for reference (visible on the order form and Customers list) but no longer block anything by themselves.",
    concepts: [
      { term: "Unpaid Receipt", definition: "Any invoice that isn't fully paid — status DRAFT, OPEN, PARTIAL, or OVERDUE. Only PAID invoices don't count toward the hold." },
      { term: "Credit Hold", definition: "Triggered automatically once a customer reaches 3 unpaid receipts. Blocks order approval (not creation) until overridden." },
      { term: "Credit Hold Override", definition: "Approving a held customer's order anyway, with a written reason. Only Finance and Admin can do this — the reason is permanently recorded on the order." },
      { term: "Credit Limit (informational)", definition: "The peso figure on the Customer record, shown for context on the order form. It no longer blocks orders on its own." },
    ],
    workflows: [
      {
        title: "What happens as a customer's unpaid receipts pile up",
        steps: [
          { title: "Agent creates an order for a customer nearing 3 unpaid receipts", description: "The new order form shows an account-standing banner with the current unpaid receipt count. Below 3, it's informational only." },
          { title: "At 3+ unpaid receipts, the banner turns red", description: "The order can still be submitted — creation is never blocked — but a note explains it will require a Finance/Admin override at approval." },
          { title: "Finance opens Approvals", description: "The pending order shows a '⚠ Credit hold' badge with the unpaid receipt count next to the customer name." },
          { title: "Finance clicks Approve", description: "A 'Credit Hold Override Required' dialog appears instead of approving immediately.", warning: "There is no way to approve a held customer's order without entering an override reason." },
        ],
      },
      {
        title: "Overriding a credit hold as Finance or Admin",
        roles: ["FINANCE", "ADMIN"],
        steps: [
          { title: "Review why the customer is on hold", description: "Check the Customers list — the customer shows an 'ON HOLD' badge and the unpaid receipt count. Consider running AR Aging for the specifics." },
          { title: "Enter an override reason and approve", description: "In the Credit Hold Override dialog, type a clear reason (e.g. payment received but not yet posted) and click 'Approve with Override'.", tip: "The reason is recorded on the order and shown in its event log — treat it as an audit trail." },
          { title: "Clear the hold at the source", description: "The real fix is collecting payment. Once enough invoices are marked PAID to bring the count below 3, future orders for that customer won't trigger the hold." },
        ],
      },
      {
        title: "Clearing a customer's hold",
        roles: ["FINANCE", "ADMIN"],
        steps: [
          { title: "Go to Accounting → AR tab", description: "Find the customer's open invoices." },
          { title: "Record payments as they come in", description: "Recording a payment that fully settles an invoice moves it to PAID, which removes it from the unpaid-receipt count.", tip: "Partial payments keep the invoice at PARTIAL — it still counts as unpaid until fully settled." },
          { title: "Confirm the hold clears", description: "Once the customer has 2 or fewer unpaid receipts, the ON HOLD badge disappears from the Customers list and new orders no longer require an override." },
        ],
      },
    ],
    faqs: [
      { q: "A customer has a huge outstanding balance but only 2 unpaid receipts. Are they held?", a: "No. The hold is purely count-based — 3 or more unpaid receipts, regardless of the total peso amount outstanding." },
      { q: "Can Finance override the hold at order creation instead of waiting for approval?", a: "No — creation is never blocked. The hold only gates approval, where Finance/Admin can override with a reason." },
      { q: "Outstanding AR is wrong — a customer shows unpaid receipts but they've already paid.", a: "The payment may not have been recorded yet. Go to Accounting → AR tab, find the invoice, and record the payment." },
    ],
  },

  // ─── 6b. Collections ─────────────────────────────────────────────────────────
  {
    slug: "collections",
    title: "Field Collections & Remittances",
    subtitle: "Log cash/check collections, remit to Finance, and clear unbalanced flags",
    icon: "💰",
    roles: ["AGENT", "DRIVER", "FINANCE", "ADMIN"],
    overview:
      "When an agent or driver collects cash or a check from a customer against an open invoice, they log it as a Collection in the system. The customer's invoice balance drops immediately, but the money isn't considered settled internally until the employee remits it to Finance. If an employee is still holding unremitted money more than 24 hours after collecting it, they're automatically flagged as 'unbalanced' — the system emails them (and Finance) a reminder, and it shows up in-app and in the Reports module, without anyone having to check manually.",
    concepts: [
      { term: "Collection", definition: "A record of cash/check received by an employee from a customer against a specific invoice. Reduces the invoice balance immediately." },
      { term: "Remittance", definition: "The employee handing the collected money over to Finance. Recorded separately from the collection itself." },
      { term: "Unbalanced", definition: "An employee who has collected money but not remitted it (or remitted less than expected) for more than 24 hours." },
      { term: "Short", definition: "A remittance that came in less than the amount collected. Requires a shortage note explaining the discrepancy." },
      { term: "Automatic Issuance", definition: "A scheduled job that checks for unbalanced employees and emails/notifies them (and Finance) without anyone triggering it manually." },
    ],
    workflows: [
      {
        title: "Logging a collection (Agent/Driver)",
        roles: ["AGENT", "DRIVER"],
        steps: [
          { title: "Go to Collections → Log Collection", description: "Select the invoice you collected against and enter the amount received." },
          { title: "Save", description: "The invoice balance drops immediately — the customer's debt is considered paid from an AR standpoint. Internally, the money sits in 'Cash in Transit' until you remit it." },
          { title: "Remit as soon as possible", description: "You're still accountable for that cash until Finance confirms receipt. If you hold it more than 24 hours, you'll be flagged as unbalanced and emailed a reminder.", warning: "Don't wait — the automatic issuance job runs on a schedule and doesn't know you're 'about to' remit." },
        ],
      },
      {
        title: "Recording a remittance (Finance)",
        roles: ["FINANCE", "ADMIN"],
        steps: [
          { title: "Go to Collections", description: "Unbalanced employees are listed at the top with their total unremitted amount and receipt count." },
          { title: "Click Record Remittance", description: "Enter the amount actually received in cash/check from the employee." },
          { title: "Handle a shortfall", description: "If the amount is less than expected, you must enter a shortage note explaining the discrepancy before saving.", warning: "A short remittance still leaves the employee flagged as unbalanced for the shortfall amount until it's resolved." },
        ],
      },
      {
        title: "How automatic issuance works",
        roles: ["FINANCE", "ADMIN"],
        steps: [
          { title: "Runs on a schedule", description: "A scheduled job (not triggered by a person) checks every employee's unremitted collections once a day." },
          { title: "Employees are emailed directly", description: "Anyone holding unremitted money past the grace period gets an email listing the amount and how long they've had it." },
          { title: "Finance gets a summary", description: "All Finance/Admin users receive a summary email listing every flagged employee." },
          { title: "Won't repeat the same day", description: "Each employee is only issued one notice per day, even if the job runs more than once — recorded permanently in the Activity Log." },
        ],
      },
    ],
    faqs: [
      { q: "Why did the customer's invoice balance drop before I actually handed the cash to Finance?", a: "Collections reduce the invoice balance as soon as they're logged — the customer has paid. Whether the employee has personally remitted that cash internally is tracked separately and doesn't affect the customer's account." },
      { q: "I remitted on time but I'm still showing as unbalanced.", a: "Check that Finance has recorded the remittance in the system — being handed cash isn't the same as it being logged. Ask Finance to record it if it's missing." },
      { q: "Can I remit less than I collected?", a: "Yes, but Finance must enter a shortage note explaining why. The shortfall remains flagged as unbalanced until it's fully resolved." },
    ],
  },

  // ─── 7. Inventory ────────────────────────────────────────────────────────────
  {
    slug: "inventory",
    title: "Inventory & Stock Management",
    subtitle: "Track on-hand quantities, adjustments, and stock movements",
    icon: "📦",
    roles: ["WAREHOUSE", "ADMIN"],
    overview:
      "The Inventory module shows current stock levels for every product across all warehouses. It tracks On Hand (physical units in the warehouse), Reserved (committed to approved orders), and Available (On Hand minus Reserved). Every change to stock — receiving, picking, adjustments, returns — is recorded as a Stock Movement for full traceability.",
    concepts: [
      { term: "On Hand", definition: "The number of units physically present in the warehouse right now." },
      { term: "Reserved", definition: "Units committed to orders that have been approved but not yet delivered. You cannot pick reserved stock for a different order." },
      { term: "Available", definition: "On Hand minus Reserved. This is the number of units you can actually promise to a new order." },
      { term: "Reorder Point", definition: "The minimum stock level before a reorder should be triggered. When available drops to or below this number, the item appears as low-stock." },
      { term: "Stock Move", definition: "A record of any change to stock: RECEIPT (goods in), PICK (goods out for order), RETURN (goods back in), TRANSFER (moved between warehouses), ADJUSTMENT (manual correction)." },
    ],
    workflows: [
      {
        title: "Checking current stock levels",
        steps: [
          { title: "Go to Inventory in the sidebar", description: "The main inventory page shows all products with their current on-hand, reserved, and available quantities per warehouse." },
          { title: "Filter by warehouse", description: "Use the warehouse filter dropdown to focus on a specific location." },
          { title: "Identify low-stock items", description: "Items where available quantity is at or below the reorder point are highlighted. These need attention.", tip: "Set reorder points on each product to make the low-stock alert meaningful. A reorder point of 0 means you'll only notice when you run out." },
          { title: "View stock movement history", description: "Click on any product row to see its full movement history: every receipt, pick, transfer, and adjustment." },
        ],
      },
      {
        title: "Making a stock adjustment",
        steps: [
          { title: "Find the product in Inventory", description: "Use the search or filter to locate the product you need to adjust." },
          { title: "Click Adjust", description: "The Adjust button opens a form for the product in the selected warehouse." },
          { title: "Enter the adjustment quantity and reason", description: "Positive number = adding stock (e.g. found extra units during a count). Negative number = removing stock (e.g. damaged units).", warning: "Adjustments are immediate and permanent. Double-check the quantity and reason before saving. Every adjustment is logged with your name and timestamp." },
          { title: "Select ADJUSTMENT as the movement type", description: "Adjustments are recorded as ADJUSTMENT type moves in the stock history." },
        ],
      },
      {
        title: "Setting reorder points",
        steps: [
          { title: "Open the Inventory page and find the product", description: "Locate the product-warehouse combination you want to configure." },
          { title: "Click Edit on the stock row", description: "Enter the reorder point (minimum level before reorder) and max level (upper bound for ordering)." },
          { title: "Save", description: "The reorder point is now active. Items at or below this level will be highlighted on the dashboard.", tip: "For fast-moving consumables like gloves or syringes, set a reorder point that gives you at least 2 weeks of buffer stock." },
        ],
      },
    ],
    faqs: [
      { q: "On hand shows 50 but we can only see 30 units on the shelf. What happened?", a: "Check the stock movement history for that product. Look for recent PICK movements — these reduce on hand when orders are delivered. Also check if any units are marked as Reserved (waiting for delivery)." },
      { q: "A product shows negative available stock. Is that possible?", a: "It shouldn't happen in normal operations. If it does, it usually means a manual adjustment was made incorrectly. Do a stock adjustment to correct it and investigate the cause." },
      { q: "Can two warehouses have different stock levels for the same product?", a: "Yes. Stock is tracked per product-warehouse combination. A product can have 100 units in Warehouse A and 20 in Warehouse B." },
    ],
  },

  // ─── 8. Inbound POs ──────────────────────────────────────────────────────────
  {
    slug: "inbound-pos",
    title: "Purchase Orders & Receiving",
    subtitle: "Create POs to suppliers, receive goods, and log B.O. (backorder) returns",
    icon: "📥",
    roles: ["WAREHOUSE", "FINANCE", "ADMIN"],
    overview:
      "When you need to replenish stock, you create an Inbound Purchase Order (PO) addressed to a supplier. Once the goods arrive, you receive them against the PO — recording how many units were accepted (good condition) and how many were damaged. Accepted units are immediately added to on-hand stock. Damaged units are resolved through the B.O. (backorder) log: Warehouse logs each damaged unit against its PO as either Good B.O. (returned to inventory) or Bad B.O. (written off with a reason). Finance can then link the supplier's bill and close the PO once every B.O. unit is resolved and the bill is fully paid.",
    concepts: [
      { term: "Inbound PO", definition: "A purchase order sent to a supplier requesting product delivery to your warehouse." },
      { term: "PO Status", definition: "EXPECTED → RECEIVING → RECEIVED (or DELAYED if the supplier is late)." },
      { term: "Accepted", definition: "Units received in good condition and added to stock." },
      { term: "Damaged", definition: "Units received but not usable. Logged as a B.O. and resolved as Good or Bad." },
      { term: "Good B.O.", definition: "A damaged/short-shipped unit that is actually usable on inspection — returned to sellable inventory." },
      { term: "Bad B.O.", definition: "A unit that cannot be sold — logged with a typed reason (Rat Bite, Damaged Container, Expired, Wrong Item, Short Ship, Other) and written off as a cost." },
      { term: "Closing a PO", definition: "Finance/Admin can only close a PO once every damaged unit on it has been logged as a resolved B.O. and the linked supplier bill is fully paid — this is how the account is confirmed to tally." },
    ],
    workflows: [
      {
        title: "Creating a purchase order",
        steps: [
          { title: "Go to Purchase Orders → + New PO", description: "Navigate to the Purchase Orders (Inbound) page in the sidebar and click + New PO." },
          { title: "Select the supplier and warehouse", description: "Choose the supplier you are ordering from and the warehouse that will receive the goods." },
          { title: "Set the expected delivery date", description: "Enter when you expect the goods to arrive. This helps plan warehouse resources." },
          { title: "Add line items", description: "Add each product and the quantity ordered. Unit cost is optional but useful for inventory valuation." },
          { title: "Save the PO", description: "The PO is created with status EXPECTED. A PO number is assigned automatically (e.g. PO-2026-0001)." },
          { title: "Print the PO to send to the supplier", description: "Click Print PO to open the printable PO document. Share the PDF with your supplier.", tip: "Always get a confirmed delivery date from the supplier once they receive the PO." },
        ],
      },
      {
        title: "Receiving goods against a PO",
        steps: [
          { title: "Find the PO when goods arrive", description: "Go to Purchase Orders and find the PO with status EXPECTED. You can filter by status." },
          { title: "Open the PO and click Receive", description: "Click the PO to open its detail drawer, then click the Receive button." },
          { title: "Enter quantities received", description: "For each line, enter the Accepted quantity (good units) and Damaged quantity (defective or broken units).", warning: "Do not add damaged units to the accepted count. Damaged units are tracked separately and do not enter stock." },
          { title: "Save the receipt", description: "Accepted units are immediately added to on-hand stock in the selected warehouse. A RECEIPT stock movement is recorded." },
          { title: "Mark as RECEIVED when complete", description: "Once all lines have been received (or partially received with remaining units on backorder), update the PO status to RECEIVED." },
          { title: "Handle damaged goods", description: "For damaged units, file a claim with the supplier. Reference the PO number and damaged quantities from the PO record." },
        ],
      },
      {
        title: "Handling a delayed PO",
        steps: [
          { title: "Update the PO status to DELAYED", description: "If the supplier has notified you of a delay, open the PO and change the status to DELAYED." },
          { title: "Update the expected date", description: "Enter the new expected delivery date from the supplier." },
          { title: "Notify relevant teams", description: "If there are approved orders waiting on this stock, alert the Finance team so they can manage customer expectations.", tip: "Check the Inventory page for items with low available stock that are linked to DELAYED POs — these are the highest-risk situations." },
        ],
      },
      {
        title: "Logging a B.O. and closing the PO",
        steps: [
          { title: "Open the received PO", description: "Once a PO shows RECEIVED with damaged units on any line, open its detail drawer to see the B.O. Log panel." },
          { title: "Log each damaged unit", description: "Warehouse selects the line, enters the quantity and cost per unit, and chooses Good B.O. (return to inventory) or Bad B.O. (write off with a reason: Rat Bite, Damaged Container, Expired, Wrong Item, Short Ship, or Other).", warning: "You can't log more units than are still outstanding (unresolved) on a line." },
          { title: "Good B.O. restocks automatically", description: "Logging a Good B.O. immediately adds the quantity back to on-hand stock and records a stock movement." },
          { title: "Bad B.O. posts a write-off", description: "Logging a Bad B.O. posts a journal entry moving the cost from Inventory to the B.O. Write-off expense account — no stock is added." },
          { title: "Finance links the supplier bill", description: "Once the supplier's AP bill for this PO is entered in Accounting, Finance links it to the PO from the same panel." },
          { title: "Close the PO", description: "Finance/Admin can close the PO once every damaged unit is resolved and the linked bill is fully paid. The Close PO button stays disabled with a reason shown until both conditions are met.", tip: "This is what Disucar means by 'the account can only be closed when payment and cost of B.O. tally.'" },
        ],
      },
    ],
    faqs: [
      { q: "I received goods but forgot to log it in the system. Can I backdate the receipt?", a: "Stock movements are dated at the time you enter them. You can add an adjustment with today's date and note it as a backdated receipt in the reason field. There is no way to change the timestamp." },
      { q: "A supplier sent more units than we ordered. Can I receive the extra?", a: "Yes — you can enter a higher quantity than the PO line. The stock will be added. Note the variance in the note field for your records." },
      { q: "Why can't I close this PO?", a: "Either some damaged units haven't been logged as a resolved B.O. yet, or the linked supplier bill isn't marked PAID. The Close PO button shows which one is blocking it." },
    ],
  },

  // ─── 9. Transfers ────────────────────────────────────────────────────────────
  {
    slug: "transfers",
    title: "Inter-Warehouse Transfers",
    subtitle: "Move stock between your warehouse locations",
    icon: "🔄",
    roles: ["WAREHOUSE", "ADMIN"],
    overview:
      "When you need to move stock from one warehouse to another — for example, balancing inventory between a main depot and a satellite location — you create a Transfer. The transfer tracks what was sent from the source and received at the destination.",
    concepts: [
      { term: "Transfer Status", definition: "DRAFT → IN_TRANSIT → RECEIVED." },
      { term: "Source Warehouse (From)", definition: "The warehouse sending the stock. Stock is deducted here." },
      { term: "Destination Warehouse (To)", definition: "The warehouse receiving the stock. Stock is added here." },
    ],
    workflows: [
      {
        title: "Creating and completing a transfer",
        steps: [
          { title: "Go to Inventory → Transfers (or via the Warehouse module)", description: "Find the Transfers section in the Warehouse or Inventory area." },
          { title: "Click + New Transfer", description: "Select the From warehouse and the To warehouse." },
          { title: "Add products and quantities", description: "For each product being transferred, enter the quantity to move." },
          { title: "Set status to IN_TRANSIT and record dispatch", description: "When the goods physically leave the source warehouse, update the transfer to IN_TRANSIT. Add an ETA for when the destination warehouse expects to receive." },
          { title: "Confirm receipt at the destination", description: "When the goods arrive at the destination warehouse, the receiving warehouse user updates the transfer to RECEIVED. Stock is decremented at source and incremented at destination.", warning: "Only mark RECEIVED when the goods have physically arrived and been counted. Stock changes are immediate and cannot be easily undone." },
        ],
      },
    ],
    faqs: [
      { q: "Can a transfer be cancelled mid-transit?", a: "Currently there is no cancel function for an IN_TRANSIT transfer. If goods are returned, you would need to create a reverse transfer (from destination back to source)." },
    ],
  },

  // ─── 10. Shipments ───────────────────────────────────────────────────────────
  {
    slug: "shipments",
    title: "Shipments & Delivery Tracking",
    subtitle: "Track outbound deliveries and record proof of delivery",
    icon: "🚚",
    roles: ["WAREHOUSE", "DRIVER", "FINANCE", "ADMIN"],
    overview:
      "Every order that reaches SHIPPED state has a Shipment record. The Shipments page is the central view for tracking what is currently in transit — which orders are on the road, with which courier, and when they are expected. Drivers use this page to confirm deliveries.",
    concepts: [
      { term: "Tracking Number", definition: "The courier's shipment tracking code. Enter this so customers and staff can track the parcel online." },
      { term: "ETA", definition: "Estimated time of arrival. Set when marking an order as shipped." },
      { term: "POD", definition: "Proof of Delivery. A document or photo confirming the customer received the goods. The POD URL field stores a link to this document." },
      { term: "Signed By", definition: "The name of the person at the customer's site who signed for the delivery." },
    ],
    workflows: [
      {
        title: "Recording shipment details",
        roles: ["WAREHOUSE", "ADMIN"],
        steps: [
          { title: "After marking an order as Shipped, go to the Shipments page", description: "The Shipments page lists all orders currently in SHIPPED state." },
          { title: "Find the shipment and click Edit", description: "Open the shipment row to add courier details." },
          { title: "Enter tracking number, courier name, and ETA", description: "Fill in the tracking number from your courier's system, the courier name, and the estimated delivery date.", tip: "For LBC, J&T, or other local couriers, the tracking number lets customers check delivery status directly on the courier's website." },
          { title: "Save the shipment details", description: "Details are visible to the customer on their own order." },
        ],
      },
      {
        title: "Confirming delivery",
        roles: ["WAREHOUSE", "DRIVER", "FINANCE", "ADMIN"],
        steps: [
          { title: "Find the shipment in the Shipments list", description: "Filter by status SHIPPED to see all in-transit deliveries." },
          { title: "Record proof of delivery", description: "Enter the name of the person who signed for the goods and optionally a link to the signed DR (photo, Google Drive link, etc.) in the POD URL field." },
          { title: "Click Confirm Delivery on the linked order", description: "Navigate to the order detail and click Confirm Delivery. This moves the order to DELIVERED and triggers stock consumption.", note: "You can also confirm delivery directly from the order page without going through Shipments first." },
        ],
      },
      {
        title: "Printing a Delivery Receipt",
        steps: [
          { title: "Open the Shipments page and find the shipment", description: "Each shipment row has a print icon on the right side." },
          { title: "Click the print icon", description: "Opens the Delivery Receipt print page — a formal document for the customer to sign upon receipt.", tip: "Print the DR before dispatching. The customer or their representative signs it and returns a copy to your driver." },
        ],
      },
    ],
    faqs: [
      { q: "The driver delivered but the order wasn't marked SHIPPED first. What do I do?", a: "You cannot confirm delivery without going through the SHIPPED state. First mark the order as Shipped, then immediately confirm delivery." },
      { q: "Can I attach the signed delivery receipt as a file?", a: "Yes — use the Attachments panel on the order detail page to upload a scanned or photographed copy of the signed DR." },
    ],
  },

  // ─── 11. Returns ─────────────────────────────────────────────────────────────
  {
    slug: "returns",
    title: "Returns & RMA",
    subtitle: "Process return merchandise authorisations and manage dispositions",
    icon: "↩️",
    roles: ["AGENT", "WAREHOUSE", "FINANCE", "ADMIN"],
    overview:
      "Returns (also called RMAs — Return Merchandise Authorisations) handle situations where a customer sends products back: defective units, wrong items delivered, or excess quantities. The process ensures returned goods are properly inspected and either restocked (if saleable) or scrapped (if not), with full traceability.",
    concepts: [
      { term: "RMA Status", definition: "REQUESTED → APPROVED → RECEIVED → CLOSED." },
      { term: "Disposition", definition: "What happens to each returned item: RESTOCK (returned to saleable inventory) or SCRAP (written off)." },
      { term: "Qty Requested vs Qty Received", definition: "The customer may request to return 10 units but only 8 arrive. The system records both." },
      { term: "Return Lot Number", definition: "The lot number of the returned units. Pre-filled from the original order's lot consumption records. Confirm or correct this when receiving the goods." },
    ],
    workflows: [
      {
        title: "Creating a return request",
        roles: ["AGENT", "FINANCE", "ADMIN"],
        steps: [
          { title: "Go to Returns / RMA → + New Return", description: "Click Returns in the sidebar and click '+ New Return'." },
          { title: "Select the original delivered order", description: "Only DELIVERED orders can have returns. The dropdown shows all delivered orders." },
          { title: "Enter the reason for return", description: "Be specific: 'Customer received wrong SKU', 'Unit arrived damaged', 'Excess order — customer only needed 5 of 10 ordered'." },
          { title: "Set quantities and disposition per line", description: "For each product being returned, enter how many units are coming back. Set disposition to RESTOCK if the units can be resold, or SCRAP if they are damaged/expired.", warning: "You cannot return more units than were in the original order line." },
          { title: "Submit the return request", description: "Status becomes REQUESTED. The Warehouse team is notified to expect incoming goods." },
        ],
      },
      {
        title: "Approving a return",
        roles: ["WAREHOUSE", "FINANCE", "ADMIN"],
        steps: [
          { title: "Review the return request", description: "Check the reason, the items, and the quantities. Verify with the customer if needed." },
          { title: "Click Approve", description: "Status changes to APPROVED. The warehouse team can now begin preparing to receive the goods." },
        ],
      },
      {
        title: "Receiving returned goods",
        roles: ["WAREHOUSE", "ADMIN"],
        steps: [
          { title: "When goods arrive, open the APPROVED return and click Receive", description: "The Receive modal shows each return line with the requested quantity, disposition, and lot fields." },
          { title: "Enter the actual quantity received for each line", description: "Count the incoming units. Enter the actual number received — it may be less than requested if the customer sent a partial return." },
          { title: "Verify or correct the lot number and expiry date", description: "For RESTOCK lines, the Lot No. and Expiry Date fields are pre-filled from the original order's consumed lots. Check the physical label on the returned goods and correct if needed.", tip: "If the returned item's lot number matches what was originally shipped, you can leave it as-is. The lot's remaining quantity is automatically restored when you confirm receipt." },
          { title: "Confirm receipt", description: "Units marked RESTOCK are immediately added to on-hand stock and their lot's remaining quantity is updated. SCRAP units are logged but do not enter stock or update any lot.", note: "The lot number and expiry date are saved on the return record for traceability. They are visible in the return detail view after receipt." },
          { title: "Status becomes RECEIVED", description: "The return is now recorded. Finance can proceed with issuing a credit note or credit memo if applicable." },
        ],
      },
      {
        title: "Closing a return",
        roles: ["FINANCE", "ADMIN"],
        steps: [
          { title: "After all downstream actions (credit note, credit memo) are complete, close the return", description: "Click Close on a RECEIVED return." },
          { title: "Status becomes CLOSED", description: "Closed returns are kept for reference but no further action is required." },
        ],
      },
    ],
    faqs: [
      { q: "Does the system automatically issue a credit note when a return is received?", a: "No. The system records the return and restocks the inventory. Issuing a credit note or adjusting the invoice must be done manually in Accounting. This is intentional — not all returns result in a credit." },
      { q: "Can I create a return for an order that has already been invoiced?", a: "Yes. The invoice is separate from the return process. Handle the credit note or invoice adjustment in Accounting separately." },
      { q: "What happens to the lot quantity when units are restocked?", a: "The system restores the lot's remaining quantity by the number of units received. If the lot no longer exists (e.g. was written off), it is recreated with the returned quantity. If the lot number is left blank, stock quantity is updated but no lot record is modified." },
      { q: "What if the returned units came from a different lot than what was originally shipped?", a: "This can happen when the customer returns different packaging or the warehouse staff made a picking error. Correct the Lot No. field in the Receive modal before confirming. The corrected lot number is saved on the return for auditing." },
    ],
  },

  // ─── 15. Accounting ──────────────────────────────────────────────────────────
  {
    slug: "accounting",
    title: "Accounting — Journal, AR, AP & BIR",
    subtitle: "Manage books, invoices, bills, payments, and tax filings",
    icon: "📒",
    roles: ["FINANCE", "ADMIN"],
    overview:
      "The Accounting module is the financial backbone of the system. It covers Accounts Receivable (AR — money owed to you by customers), Accounts Payable (AP — money you owe to suppliers), the General Ledger (a record of all financial transactions), and BIR filings (Philippine tax compliance). All transactions are double-entry: every peso in has a matching peso out.",
    concepts: [
      { term: "Journal Entry (JE)", definition: "A double-entry bookkeeping record. Every JE has at least two lines: one debit and one credit that must balance." },
      { term: "Debit (DR)", definition: "An entry that increases asset or expense accounts, or decreases liability or income accounts." },
      { term: "Credit (CR)", definition: "An entry that increases liability or income accounts, or decreases asset or expense accounts." },
      { term: "Accounts Receivable (AR)", definition: "Money customers owe you for delivered goods. Recorded when an invoice is generated." },
      { term: "Accounts Payable (AP)", definition: "Money you owe suppliers for purchased goods. Recorded as bills." },
      { term: "Chart of Accounts", definition: "The standardised list of account codes used in journal entries. e.g. 1100 = Accounts Receivable, 4000 = Sales Revenue, 2100 = VAT Payable." },
      { term: "Trial Balance", definition: "A summary of all account balances. The total of all debits must equal total credits. Used to verify the books are correct." },
      { term: "BIR", definition: "Bureau of Internal Revenue — the Philippine tax authority. The system tracks key BIR filing deadlines." },
    ],
    workflows: [
      {
        title: "Generating an invoice from a delivered order",
        steps: [
          { title: "Go to Accounting → AR tab", description: "The AR tab lists all invoices. Delivered orders without invoices are shown in the action items at the top." },
          { title: "Find the delivered order and click Generate Invoice", description: "Click the Generate Invoice button next to the order. A formal invoice is created immediately." },
          { title: "Review the posted journal entry", description: "The system automatically posts: DR Accounts Receivable (1100), CR Sales Revenue (4000), CR VAT Payable (2100)." },
          { title: "Share the invoice with the customer", description: "Click the print icon on the invoice row to open the printable invoice PDF. Send this to the customer.", tip: "Set net payment terms on the customer record (e.g. Net 30). The invoice due date is calculated automatically from these terms." },
        ],
      },
      {
        title: "Recording an invoice payment from a customer",
        steps: [
          { title: "Go to Accounting → AR tab", description: "Find the invoice you want to record a payment against." },
          { title: "Click Record Payment on the invoice row", description: "A payment modal appears." },
          { title: "Enter the payment amount", description: "For full payment, enter the full balance. For partial payment, enter what was actually received.", note: "The system posts DR Cash/Bank (1010), CR Accounts Receivable (1100) for the payment amount." },
          { title: "Confirm", description: "The invoice status updates to PARTIAL (if partially paid) or PAID (if fully settled). The customer's outstanding AR balance decreases accordingly, freeing up credit limit." },
        ],
      },
      {
        title: "Creating and paying a supplier bill",
        steps: [
          { title: "Go to Accounting → AP tab → + New Bill", description: "Create a bill when you receive a supplier invoice." },
          { title: "Enter bill details", description: "Select the supplier, enter the bill reference number, due date, and amount." },
          { title: "Record payment when you pay the supplier", description: "Find the bill and click Record Payment. Enter the amount paid.", note: "Payment posts: DR Accounts Payable (2000), CR Cash/Bank (1010)." },
        ],
      },
      {
        title: "Creating a manual journal entry",
        steps: [
          { title: "Go to Accounting → Journal tab → + Journal Entry", description: "Manual JEs are for transactions that don't have a dedicated module: salary payments, depreciation, bank charges, etc." },
          { title: "Set the date, source, reference, and memo", description: "Source options: AR, AP, BANK, PAYROLL, INV, GL, OPENING. Use GL for general adjustments." },
          { title: "Add debit and credit lines", description: "Add at least one DR line and one CR line. The totals must balance.", warning: "The system will not save an unbalanced journal entry. Total debits must equal total credits to the cent." },
          { title: "Save", description: "The entry is posted immediately and appears in the General Ledger." },
        ],
      },
      {
        title: "Managing BIR filings",
        steps: [
          { title: "Go to Accounting → BIR Filings tab", description: "Upcoming and overdue BIR filings are listed here." },
          { title: "Check due dates", description: "Filings with a red indicator are overdue or due soon. Prioritise these." },
          { title: "File via eFPS or manual submission", description: "Filing is done externally through the BIR's eFPS portal or manual submission. The system does not submit to BIR directly." },
          { title: "Mark as Filed in the system", description: "After filing, click the filing icon on the row, enter the eFPS reference number or confirmation, and mark as FILED.", tip: "Print the BIR form from the print icon (📄) on each filing row for your physical records." },
        ],
      },
    ],
    faqs: [
      { q: "I made a wrong journal entry. Can I delete it?", a: "No — journal entries cannot be deleted to preserve audit integrity. To correct an error, create a reversing journal entry (same accounts, same amounts, but debits and credits swapped) with a memo explaining the correction." },
      { q: "The trial balance doesn't balance. What do I check?", a: "Every system-generated entry (from invoice generation, payment recording) is guaranteed to balance. Imbalances usually come from manual journal entries where the totals don't match. Check the Journal tab and look for entries where the DR and CR amounts differ." },
      { q: "How do I record a customer paying via online bank transfer?", a: "Use Record Payment on the invoice. The system records it as DR Cash/Bank (account 1010). If you want to split by bank account (BDO vs BPI), use a manual journal entry with the specific account code." },
    ],
  },

  // ─── 16. Reports ─────────────────────────────────────────────────────────────
  {
    slug: "reports",
    title: "Reports & Data Exports",
    subtitle: "Analyse sales, receivables, inventory, and profitability",
    icon: "📈",
    roles: ["FINANCE", "ADMIN"],
    overview:
      "The Reports module provides five built-in report types covering the main areas of the business. Reports can be filtered by date range and exported to CSV (for Excel analysis) or printed as PDF. All report data is computed live from the database at the time you run them.",
    concepts: [
      { term: "Sales Report", definition: "Monthly revenue breakdown from delivered orders, with top customers ranking." },
      { term: "AR Aging", definition: "Outstanding invoices grouped by how overdue they are: Current, 1–30 days, 31–60 days, 61–90 days, 90+ days." },
      { term: "Inventory Report", definition: "Current stock snapshot: on-hand, reserved, available, and value per product per warehouse." },
      { term: "PO Summary", definition: "List of purchase orders in the selected period with status and totals." },
      { term: "P&L (Profit & Loss)", definition: "Revenue and expense summary from the general ledger, showing gross profit and net income." },
      { term: "Brand Filter", definition: "On Sales Summary and Inventory Snapshot, filter to a single product brand (e.g. Monde, Century Tuna, Champion Detergent). Sales Summary also shows a Sales by Brand breakdown. Not available on AR Aging or P&L — those aren't linked to product/brand data." },
    ],
    workflows: [
      {
        title: "Running a report",
        steps: [
          { title: "Go to Reports in the sidebar", description: "Click Reports. The report builder page opens." },
          { title: "Select a report type", description: "Click one of the five report type cards: Sales, AR Aging, Inventory, PO Summary, or P&L." },
          { title: "Set the date range (for Sales and PO Summary)", description: "Enter from and to dates. The report updates automatically when you move focus out of the date field." },
          { title: "Filter by brand (Sales and Inventory only)", description: "Pick a brand from the dropdown to see revenue/stock for just that product line. Clear it to see all brands again." },
          { title: "Review the summary KPIs", description: "Each report shows key metrics at the top — total revenue, total outstanding, etc." },
          { title: "Review the detail table", description: "The data table below the KPIs shows the full detail. Scroll horizontally if needed for wide reports." },
        ],
      },
      {
        title: "Exporting to CSV",
        steps: [
          { title: "Run the report as described above", description: "Set the type and date range." },
          { title: "Click Export CSV", description: "A CSV file downloads immediately. The filename includes the report type and date." },
          { title: "Open in Excel", description: "Open the CSV in Excel. The file uses UTF-8 encoding with BOM to correctly display Philippine peso amounts and special characters.", tip: "In Excel, use Data → Get Data → From Text/CSV if the file opens with garbled characters." },
        ],
      },
      {
        title: "Printing a report",
        steps: [
          { title: "Run the report", description: "Set type and date range." },
          { title: "Click Print Report", description: "Opens a print-ready version of the report in a new tab with your company header and date." },
          { title: "Save as PDF", description: "Use browser print → Save as PDF. The report is formatted for A4." },
        ],
      },
    ],
    faqs: [
      { q: "The P&L shows no data. Why?", a: "The P&L is built from journal entries. If no journal entries have been posted, it will be empty. Ensure invoices have been generated and payments recorded through the Accounting module." },
      { q: "The AR Aging report shows an invoice I know is paid. Why?", a: "The payment may not have been recorded in the system. Go to Accounting → AR and record the payment on the invoice. The aging report will update immediately." },
      { q: "Can I schedule a report to run automatically each month?", a: "Automatic report scheduling is not yet available. Run reports manually and export to CSV for distribution." },
    ],
  },

  // ─── 17. Customers & Suppliers ───────────────────────────────────────────────
  {
    slug: "customers-suppliers",
    title: "Customers & Suppliers",
    subtitle: "Manage your trading partner master data",
    icon: "🤝",
    roles: ["AGENT", "FINANCE", "WAREHOUSE", "ADMIN"],
    overview:
      "Customers and Suppliers are the master records for everyone you trade with. Getting these records accurate is important — the customer's credit limit, payment terms, and contact email all drive real business logic (credit checks, invoice due dates, email notifications). Supplier data drives purchasing and bill management.",
    concepts: [
      { term: "Customer Code", definition: "A short internal reference code (e.g. 'MCS-001' for Metro City Supermarket). Used on reports and documents." },
      { term: "TIN", definition: "Tax Identification Number. Required for BIR compliance and appearing on formal documents." },
      { term: "Payment Terms", definition: "How long the customer has to pay after invoice. Common values: Net 30, Net 60, COD. Determines invoice due dates." },
      { term: "Contact Email", definition: "The primary email address for this customer. Order status change emails and quotation emails are sent here." },
      { term: "Supplier Rating", definition: "A star rating (1–5) for the supplier's reliability, quality, and service. Used for vendor evaluation." },
      { term: "Lead Time", definition: "The supplier's typical number of days from PO to delivery. Used for planning reorders." },
    ],
    workflows: [
      {
        title: "Creating a new customer",
        roles: ["AGENT", "FINANCE", "ADMIN"],
        steps: [
          { title: "Go to Customers → + New Customer", description: "Navigate to the Customers page and click + New Customer." },
          { title: "Fill in name, code, and type", description: "Type is usually SUPERMARKET but can be GROCERY, SARI_SARI_STORE, WHOLESALER, GOVERNMENT, or other classification used in reporting." },
          { title: "Enter TIN if available", description: "TIN appears on invoices. Required for government and corporate customers." },
          { title: "Set payment terms", description: "Enter the agreed terms (e.g. 'Net 30'). This controls invoice due date calculation." },
          { title: "Set credit limit", description: "Enter the maximum outstanding balance allowed in pesos. Set to 0 for no limit.", warning: "Setting a credit limit too high exposes you to bad debt risk. Set limits based on the customer's payment history and financial standing." },
          { title: "Enter contact email", description: "This email receives all system notifications for orders and invoices. Make sure it is the right person (usually the purchasing or AP contact, not the doctor)." },
          { title: "Save", description: "The customer is now available when creating orders and quotations." },
        ],
      },
      {
        title: "Creating a new supplier",
        roles: ["WAREHOUSE", "FINANCE", "ADMIN"],
        steps: [
          { title: "Go to Suppliers → + New Supplier", description: "Navigate to the Suppliers page and click + New Supplier." },
          { title: "Enter name, code, and contact details", description: "The supplier code is an internal reference. Contact email is used for PO notifications." },
          { title: "Set payment terms and lead time", description: "Payment terms (Net 30, etc.) and typical lead time in days for planning purposes." },
          { title: "Set an initial rating", description: "Rate the supplier from 1 to 5 stars based on your experience. You can update this over time." },
          { title: "Save", description: "The supplier is now available when creating inbound POs and bills." },
        ],
      },
      {
        title: "Exporting customers or suppliers to CSV",
        steps: [
          { title: "Go to Customers (or Suppliers) page", description: "Navigate to the respective list page." },
          { title: "Click Export CSV", description: "A CSV file with all customer or supplier records downloads immediately." },
        ],
      },
    ],
    faqs: [
      { q: "Can a customer also have a login of their own?", a: "Yes. Go to Settings → Users and create a user with the CUSTOMER role, then link it to the customer record via the 'Customer' field. That user can then log in and see only their own orders, invoices, and quotes." },
      { q: "A supplier has changed their contact details. Do I need to update historical POs?", a: "No — updating the supplier record updates future references only. Historical POs and bills retain the data as it was at time of creation." },
    ],
  },

  // ─── 18. Customer Quotas ─────────────────────────────────────────────────────
  {
    slug: "customer-quotas",
    title: "Customer Purchase Quotas",
    subtitle: "Set period targets and manage quota overrides at order approval",
    icon: "🎯",
    roles: ["FINANCE", "ADMIN"],
    overview:
      "Purchase quotas let you control how much a customer can buy within a defined contract period — for example, a supermarket chain with a ₱5,000,000 annual procurement contract. When a pending order would push the customer over their active quota, Finance and Admin are alerted at approval time and must provide a written business justification to proceed. All overrides are permanently recorded for audit purposes.",
    concepts: [
      { term: "Quota Period", definition: "A date range (Period Start → Period End) with a Target Amount. A customer can have multiple periods but only one should be active at a time." },
      { term: "Active Quota", definition: "A quota period where Active = true and today's date falls between Period Start and Period End. This is the quota checked at order approval." },
      { term: "Consumed", definition: "The total of delivered-order subtotals within the quota period. This is how much of the target has already been used." },
      { term: "Remaining", definition: "Target Amount minus Consumed. Orders that would push this below zero trigger a quota warning." },
      { term: "Quota Override", definition: "Finance or Admin approval of an order that exceeds the quota. Requires a written reason which is stored on the order." },
    ],
    workflows: [
      {
        title: "Setting up a quota period for a customer",
        roles: ["FINANCE", "ADMIN"],
        steps: [
          { title: "Go to Customers in the sidebar", description: "Find the customer you want to configure and click the 'Quotas (N)' button in their row." },
          { title: "Click Add Period in the Quota modal", description: "The modal shows existing quota periods and an Add Period form at the bottom." },
          { title: "Enter the quota details", description: "Label: a human-readable name (e.g. 'FY2025 Annual Contract'). Period Start and Period End: the contract dates. Target Amount: the maximum purchase value in pesos.", tip: "Use a clear label like 'FY2025 Q1 Contract' so the override dialog is meaningful when it appears at approval time." },
          { title: "Tick Active and save", description: "Mark the period Active if it should be enforced today. Click Add Period.", warning: "Only one quota period should be Active at a time. If a customer has two overlapping active periods, both are checked and the more restrictive one triggers warnings." },
        ],
      },
      {
        title: "Handling a quota override at order approval",
        roles: ["FINANCE", "ADMIN"],
        steps: [
          { title: "Go to Approvals", description: "Orders from customers with an active quota show an amber ⚠ Over quota badge under the customer name if the order would exceed their target." },
          { title: "Click Approve on the flagged order", description: "The system detects the quota breach and opens the ⚠ Quota Override Required dialog." },
          { title: "Review the quota details", description: "The dialog shows the quota period label and the remaining amount before this order. Confirm with your management whether the purchase is justified." },
          { title: "Enter the override reason", description: "Type a clear business justification. Examples: 'Emergency procurement approved by Finance Director ref email 2025-01-15', 'Contractual amendment — limit increased for Q4 per signed addendum'." },
          { title: "Click Approve with Override", description: "The order is approved. The reason is stored on the order record and appears in the event log.", warning: "The override reason is permanent and visible to all Finance and Admin users. Write a reason you are comfortable being audited on." },
        ],
      },
      {
        title: "Importing quota periods in bulk via CSV",
        roles: ["FINANCE", "ADMIN"],
        steps: [
          { title: "Go to Customers and click Quotas on any customer", description: "The quota modal opens." },
          { title: "Click ↑ Import CSV in the modal header", description: "The Import CSV dialog opens." },
          { title: "Prepare your CSV file", description: "Required columns: Label, Period Start (YYYY-MM-DD), Period End (YYYY-MM-DD), Target Amount. Optional: Customer Code, Customer Name, Notes, Active (TRUE/FALSE).", tip: "If you provide Customer Code, the system matches by code first. Customer Name is used as a fallback. This lets you bulk-import quotas for many customers in one file." },
          { title: "Upload and preview", description: "Drop or browse for your CSV. Review the preview for any validation errors before confirming the import." },
          { title: "Confirm import", description: "Click Import. The system creates new quota periods or updates existing ones (matched by Customer + Label + Period Start)." },
        ],
      },
    ],
    faqs: [
      { q: "What if no active quota exists for a customer?", a: "No quota check is performed. The order can be approved normally. Set up a quota period only for customers where you want purchase limits enforced." },
      { q: "Can a customer have multiple active quotas at the same time?", a: "Technically yes — the system will check all active ones and warn if any is exceeded. However, best practice is one active period per customer to avoid confusion." },
      { q: "Where is the quota override reason stored?", a: "On the Order record itself (visible in the order detail event log) and in the Approvals event note. It is not stored on the quota period — it is tied to the specific order that exceeded the quota." },
      { q: "Does a quota override affect the 'consumed' amount?", a: "Yes. Once the order is approved (even with an override), its subtotal is counted towards the customer's consumed amount for the period. The override only bypasses the block — it does not adjust the target." },
    ],
  },

  // ─── 19. FEFO / Lot Tracking ─────────────────────────────────────────────────
  {
    slug: "fefo-lot-tracking",
    title: "FEFO Lot Traceability",
    subtitle: "First Expiry First Out stock consumption and lot-level traceability",
    icon: "🧪",
    roles: ["WAREHOUSE", "ADMIN"],
    overview:
      "The system enforces FEFO (First Expiry First Out) when consuming stock for delivered orders — units with the earliest expiry date are always picked first. This is critical for medical supplies where expired products must never reach patients. Each delivery is fully traceable: you can see exactly which lot numbers and expiry dates were consumed for every order line.",
    concepts: [
      { term: "Lot", definition: "A batch of units received together from a supplier, identified by a Lot Number and an optional Expiry Date. Stored in the Lots table per product-warehouse." },
      { term: "FEFO", definition: "First Expiry First Out. The picking rule: lots with the earliest expiry date are consumed first. Lots without an expiry date are consumed last (treated as longest-dated)." },
      { term: "OrderLineLot", definition: "A record linking a specific order line to the lot(s) from which stock was consumed. Created automatically when an order is delivered." },
      { term: "Quarantine", definition: "A lot status indicating units should not be sold — contamination, recall, or pending quality check. Quarantined lots are skipped during FEFO picking." },
      { term: "Write-off", definition: "A lot status for units that have been removed from inventory permanently — expired, damaged, destroyed. Write-offs are logged but do not adjust on-hand (a manual adjustment handles that)." },
    ],
    workflows: [
      {
        title: "How FEFO lot consumption works (automatic)",
        steps: [
          { title: "An order is confirmed delivered", description: "When a Warehouse or Finance user clicks Confirm Delivery, the system begins the FEFO consumption process for each order line." },
          { title: "Lots are sorted by expiry date", description: "For each product-warehouse combination, the system finds all available lots with enough stock and sorts them: earliest expiry first. Lots with no expiry are placed at the end." },
          { title: "Units are deducted lot by lot", description: "The system deducts from the first (soonest-expiry) lot until it is empty, then moves to the next lot, and so on until the full ordered quantity is consumed." },
          { title: "OrderLineLot records are created", description: "For every lot drawn from, an OrderLineLot record is written: order line ID, lot ID, lot number, expiry date, and quantity taken. This is the audit trail.", note: "If a product has no lots defined (older stock without lot tracking), the system deducts from the general stock level and logs a line without a lot reference." },
        ],
      },
      {
        title: "Quarantining a lot",
        roles: ["WAREHOUSE", "ADMIN"],
        steps: [
          { title: "Go to Inventory → Lots tab (or the product detail)", description: "Find the lot you need to quarantine." },
          { title: "Click Quarantine on the lot row", description: "Enter the reason: recall notice, contamination, failed QC check, etc." },
          { title: "Status changes to QUARANTINE", description: "The lot's units are immediately excluded from FEFO picking. Reserved stock from existing approved orders may need to be reviewed.", warning: "Quarantining a lot does not automatically cancel approved orders that reserved stock from it. Check open orders for the affected product and coordinate with Finance to re-approve or cancel as needed." },
        ],
      },
      {
        title: "Writing off a lot",
        roles: ["WAREHOUSE", "ADMIN"],
        steps: [
          { title: "Confirm the units are destroyed or permanently unusable", description: "Write-offs are permanent. Confirm with your supervisor before proceeding." },
          { title: "Click Write Off on the lot row", description: "Enter the reason. Status changes to WRITTEN_OFF." },
          { title: "Do a stock adjustment to correct on-hand", description: "A write-off records the event but does not change the stock count automatically. Go to Inventory → Adjust Stock for the product and subtract the written-off quantity with reason 'Lot write-off [Lot#]'.", tip: "Create a manual journal entry (DR COGS / Inventory Write-off, CR Inventory) to record the financial impact." },
        ],
      },
      {
        title: "Viewing lot traceability for a delivered order",
        steps: [
          { title: "Open the order detail page", description: "Go to Orders and click on any DELIVERED order." },
          { title: "Look at the Order Lines section", description: "Each order line now shows the lot traceability inline. If lots were consumed, a disclosure triangle (▶) appears below the product name." },
          { title: "Click the triangle to expand", description: "Each consumed lot is listed: lot number (in monospace), units taken, and expiry date. Expiry is colour-coded: red = already expired, amber = expiring within 30 days." },
          { title: "Use the Lot Traceability report for batch-level searches", description: "Go to Reports → Lot Traceability. Enter a lot number (or partial) to see all orders that consumed units from that lot — useful for product recalls.", note: "The Lot Traceability report also shows the delivery date and customer name, giving you a complete distribution record for each lot." },
        ],
      },
      {
        title: "Running lot-level reports",
        roles: ["FINANCE", "ADMIN"],
        steps: [
          { title: "Go to Reports in the sidebar", description: "Navigate to the Report Builder." },
          { title: "Select Lot Expiry, Lot Traceability, or Inventory by Lot", description: "Three lot-specific report types are available in the report selector." },
          { title: "Lot Expiry Report", description: "Shows all active lots expiring within a date range. Set the From/To dates to your expiry window (e.g. today to 90 days out). Lots are classified as Critical (≤30 days), Warning (31–90 days), or OK.", tip: "Run this weekly and share with the warehouse team to prioritise dispatching near-expiry lots first." },
          { title: "Lot Traceability Report", description: "Enter a full or partial lot number in the search box and click Search. All orders that consumed units from matching lots are returned — customer name, order ID, delivery date, and quantity taken. Use this during a product recall." },
          { title: "Inventory by Lot Report", description: "Shows remaining stock broken down by individual lot, across all warehouses. Includes expiry date, days remaining, and lot status (ACTIVE / QUARANTINED / WRITTEN_OFF)." },
          { title: "Print or export", description: "Click Print to open a printer-friendly version with the company logo. Click Export CSV for data export." },
        ],
      },
    ],
    faqs: [
      { q: "What if there is no expiry date on a lot?", a: "Lots without an expiry date are treated as longest-dated and consumed last. This is intentional — known expiry dates always take priority so your soonest-to-expire stock moves first." },
      { q: "Can I override FEFO and choose which lot to pick from?", a: "No — FEFO is enforced automatically and cannot be overridden at the order level. If a specific lot must not be used, quarantine it before confirming delivery." },
      { q: "What is OrderLineLot?", a: "OrderLineLot is the database record that links an order line to the exact lot(s) consumed. It records: which order, which product line, which lot number, the expiry date of that lot, and how many units were taken. This creates a full chain of custody from purchase (Inbound PO receipt) to sale (order delivery)." },
      { q: "How do I know which lots were consumed for a delivered order?", a: "Open the order detail page and look at the lot traceability section for each line item. Click the disclosure triangle under the product name to expand the lot list." },
      { q: "How do I find all customers who received a specific lot during a product recall?", a: "Go to Reports → Lot Traceability. Enter the lot number (full or partial) in the search box. The report lists every order that consumed units from that lot, with customer name and delivery date. You can print or export this for your recall records." },
      { q: "What happens to a lot's quantity when a return is received?", a: "When a returned item is marked RESTOCK, the lot's remaining quantity is automatically restored by the number of units received. This keeps the Inventory by Lot report accurate." },
    ],
  },

  // ─── 20. Agent QR Order Links ────────────────────────────────────────────────
  {
    slug: "qr-order-links",
    title: "Agent QR Order Links",
    subtitle: "Give customers a self-service catalog + cart tied to a specific agent",
    icon: "📱",
    roles: ["ADMIN"],
    overview:
      "Each sales agent can be given a personal QR code. When a customer scans it with their phone, they land on a public order page — no login required — showing the product catalog with a shopping cart. After adding items, the customer leaves their name and phone number and submits. This creates a normal Sales Order (PENDING), attributed to that agent, and it flows through the exact same Approvals → Warehouse → Shipments pipeline as any other order.",
    concepts: [
      { term: "QR Token", definition: "A unique, rotatable code tied to one agent. The public order URL is built from it (…/order/<token>), not the agent's internal ID." },
      { term: "Regenerate", definition: "Issuing a new QR code for an agent immediately invalidates the old one — anyone scanning a previously printed code will see \"This link isn't valid.\" Use this if a QR code is lost, shared incorrectly, or an agent leaves." },
      { term: "Home Warehouse", definition: "The warehouse orders placed through an agent's QR link are fulfilled from. Set this on the agent's user record — without it, the first warehouse alphabetically is used." },
      { term: "Self-Service Customer", definition: "A Customer record created automatically from a QR order (matched or created by phone number). Tagged with source = QR_SELF_SERVICE so it's distinguishable from sales-managed accounts." },
    ],
    workflows: [
      {
        title: "Generating a QR code for an agent",
        roles: ["ADMIN"],
        steps: [
          { title: "Go to Settings → Users", description: "Find the agent (role AGENT) in the user list." },
          { title: "Click QR Code", description: "Opens a modal. Click Generate QR Code." },
          { title: "Download or print", description: "Right-click the QR image to save it, or copy the link to send digitally. Print it for the agent to carry or display." },
          { title: "Set a home warehouse if needed", description: "Edit the agent's user record to set which warehouse should fulfill their QR orders, if it shouldn't default to the first warehouse alphabetically." },
        ],
      },
      {
        title: "What the customer sees",
        steps: [
          { title: "Scans the QR code", description: "Lands directly on a product catalog — no account or login needed." },
          { title: "Adds items to cart", description: "Product photos (if uploaded in Catalog), name, brand, price, and a quantity stepper." },
          { title: "Checks out", description: "Enters name and phone number (required), email and delivery notes (optional)." },
          { title: "Gets an on-screen confirmation", description: "Shown the order number and told the agent will follow up — no email is sent automatically." },
        ],
      },
      {
        title: "Product photos for the public catalog",
        roles: ["AGENT", "FINANCE", "ADMIN"],
        steps: [
          { title: "Go to Catalog", description: "Edit any product." },
          { title: "Upload a photo", description: "PNG, JPG, or WebP, under 2MB. Products without a photo show a neutral placeholder — the order form still works fine without one." },
        ],
      },
    ],
    faqs: [
      { q: "Can a customer edit the price of an item?", a: "No. Prices are always taken from the live Catalog at the moment of submission, regardless of anything sent from the browser." },
      { q: "What stops someone from spamming fake orders through the QR link?", a: "A hidden bot-trap field, and a hard cap of 5 orders per phone number in a rolling 24-hour window." },
      { q: "Does the QR order skip Finance approval?", a: "No — it lands as a normal PENDING order and goes through Approvals exactly like an order an agent creates manually." },
      { q: "An agent left the company. What do I do with their QR code?", a: "Deactivate their user account (Settings → Edit → uncheck Active). An inactive agent's QR link stops working immediately, even without regenerating the token." },
    ],
  },

  // ─── 21. Login Restriction (Home Base) ───────────────────────────────────────
  {
    slug: "login-restriction",
    title: "Login Restriction (Home Base Only)",
    subtitle: "Restrict most staff to logging in from the office network",
    icon: "🔒",
    roles: ["ADMIN"],
    overview:
      "Most staff should only be able to log in from the office. Field Agents and Drivers are exempt by role (they work from customer sites), and any account flagged Owner is exempt regardless of role. This is configured in Settings → Security with a list of allowed office IP addresses — leave it blank and the restriction is off entirely, which is the default.",
    concepts: [
      { term: "Allowed Office IPs", definition: "A comma-separated list of exact IP addresses and/or CIDR ranges (e.g. 203.0.113.0/24) that non-exempt accounts may log in from. Blank = restriction disabled for everyone." },
      { term: "Owner Flag", definition: "A checkbox on an ADMIN-role user's account (Settings → Users → Edit) marking them exempt from the location restriction, separate from the AGENT/DRIVER role exemption." },
      { term: "Exempt Roles", definition: "AGENT and DRIVER always bypass the restriction, since their work is field-based by nature." },
    ],
    workflows: [
      {
        title: "Turning on the restriction",
        roles: ["ADMIN"],
        steps: [
          { title: "Find your office's public IP address", description: "Ask whoever manages your office internet connection, or visit a \"what is my IP\" site from a computer on the office network." },
          { title: "Go to Settings → Security", description: "Enter the IP address (or a CIDR range if it varies within a block) in the Allowed Office IPs field." },
          { title: "Flag the Owner account", description: "Go to Settings → Users, edit the Owner's account, and check \"Owner (exempt from location restriction)\" — this only appears for ADMIN-role accounts." },
          { title: "Save", description: "The restriction takes effect on the next login attempt — existing logged-in sessions aren't interrupted." },
        ],
      },
    ],
    faqs: [
      { q: "Our office IP changes sometimes (dynamic IP). What do I do?", a: "Ask your ISP for a static IP, or check and update the Allowed Office IPs field in Settings → Security whenever it changes. There's no automatic detection." },
      { q: "Someone is locked out and shouldn't be. What do I check?", a: "Confirm their role (Agents/Drivers are always exempt) and whether they should be flagged Owner. Otherwise, confirm they're actually on the office network — a phone using mobile data instead of office WiFi will be blocked." },
      { q: "Can I restrict specific roles differently, like WAREHOUSE only?", a: "Not currently — the exemption list (Agent, Driver, Owner) is fixed. Everyone else is subject to the restriction whenever it's enabled." },
    ],
  },

  // ─── 22. Fleet / GPS Tracking ─────────────────────────────────────────────────
  {
    slug: "fleet",
    title: "Fleet & GPS Tracking",
    subtitle: "Register trucks and view their live location on a map",
    icon: "🚚",
    roles: ["WAREHOUSE", "FINANCE", "ADMIN", "DRIVER"],
    overview:
      "The Fleet page shows the live location of every registered delivery truck on a map, using data pushed in from your GPS/fleet-tracking provider. This app doesn't sell or set up GPS hardware — it's the receiving end of the integration. Each truck is registered with a Device ID that must match what your GPS provider sends, so incoming location pings get matched to the right vehicle.",
    concepts: [
      { term: "GPS Device ID", definition: "The identifier your GPS provider uses for a specific tracker/truck. Must be entered exactly when registering a vehicle, or its location updates won't be matched." },
      { term: "Online / Offline", definition: "A vehicle shows Online (green) if it's sent a position within the last 15 minutes, Offline (gray) otherwise." },
      { term: "Trail", definition: "The path a vehicle traveled over a date range, drawn on the map from its full position history." },
    ],
    workflows: [
      {
        title: "Registering a truck",
        roles: ["WAREHOUSE", "ADMIN"],
        steps: [
          { title: "Go to Fleet → Add Vehicle", description: "Enter the plate number, model, and the GPS Device ID your tracking provider uses for this truck." },
          { title: "Assign a driver (optional)", description: "Only users with the Driver role appear in the list." },
          { title: "Save", description: "The vehicle appears on the map once its GPS provider starts sending location pings — see the setup note below if none appear." },
        ],
      },
      {
        title: "Linking a vehicle to a delivery",
        roles: ["WAREHOUSE", "ADMIN"],
        steps: [
          { title: "Go to Shipments and edit a shipment", description: "The edit form has a Vehicle dropdown alongside tracking number and courier." },
          { title: "Select the truck making this delivery", description: "The shipment row then shows the vehicle's last-seen time, linking to the Fleet map." },
        ],
      },
    ],
    faqs: [
      { q: "I registered a truck but it's not showing on the map.", a: "Confirm your GPS provider is actually configured to send data to this app's webhook — that setup happens outside this app (see DEPLOYMENT.md for the exact URL and payload format needed). Also double-check the Device ID matches exactly." },
      { q: "Do I need to buy anything from this system for GPS tracking?", a: "No — this app only receives and displays location data. You (or whoever manages your fleet) choose and set up the actual GPS hardware/tracking service separately." },
      { q: "How far back does the trail go?", a: "As far back as position data has been received and stored — pick any date range in the Trail lookup on the Fleet page." },
    ],
  },

];

// ── Quick-start paths by role ─────────────────────────────────────────────────

export interface QuickStart {
  role: HelpRole;
  label: string;
  description: string;
  color: string;
  steps: { title: string; slug: string; description: string }[];
}

export const QUICK_STARTS: QuickStart[] = [
  {
    role: "AGENT",
    label: "Sales Agent",
    description: "Start here if your job is managing customer relationships and creating orders",
    color: "#2563eb",
    steps: [
      { title: "Understand the system", slug: "getting-started", description: "Login, navigation, and your role" },
      { title: "Learn the order lifecycle", slug: "sales-orders", description: "Create an order from scratch to delivery" },
      { title: "Send quotations", slug: "quotations", description: "Create proforma invoices and convert to orders" },
      { title: "Manage customers", slug: "customers-suppliers", description: "Customer records, credit limits, and contacts" },
      { title: "Understand credit limits", slug: "credit-limits", description: "What to do when a customer is over limit" },
    ],
  },
  {
    role: "FINANCE",
    label: "Finance",
    description: "Start here if your job is approvals, invoicing, payments, and reporting",
    color: "#16a34a",
    steps: [
      { title: "Understand the system", slug: "getting-started", description: "Login, navigation, and your role" },
      { title: "Process order approvals", slug: "approvals", description: "Review and approve pending orders" },
      { title: "Manage credit limits", slug: "credit-limits", description: "Set limits and handle overrides" },
      { title: "Handle AR and AP", slug: "accounting", description: "Invoices, payments, bills, journal entries, BIR" },
      { title: "Run reports", slug: "reports", description: "Sales, aging, inventory, and P&L reports" },
    ],
  },
  {
    role: "WAREHOUSE",
    label: "Warehouse",
    description: "Start here if your job is picking, packing, receiving, and stock management",
    color: "#d97706",
    steps: [
      { title: "Understand the system", slug: "getting-started", description: "Login, navigation, and your role" },
      { title: "Pick and ship orders", slug: "sales-orders", description: "Advance orders from Approved to Shipped to Delivered" },
      { title: "Manage stock levels", slug: "inventory", description: "On hand, reserved, adjustments, and reorder points" },
      { title: "Receive purchase orders", slug: "inbound-pos", description: "Receive goods from suppliers and update stock" },
      { title: "Handle returns", slug: "returns", description: "Receive returned goods and decide restock or scrap" },
    ],
  },
];
