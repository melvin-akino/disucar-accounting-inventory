// Email via Resend REST API (no extra package needed).
// Set RESEND_API_KEY in .env to enable. If unset, emails are silently skipped.
// Set EMAIL_FROM to your verified sender address (default: noreply@yourdomain.com).

const RESEND_API = "https://api.resend.com/emails";

interface EmailPayload {
  to: string | string[];
  subject: string;
  html: string;
  replyTo?: string;
}

export async function sendEmail(payload: EmailPayload): Promise<void> {
  const apiKey = process.env.RESEND_API_KEY;
  if (!apiKey) return; // email not configured — skip silently

  const from = process.env.EMAIL_FROM ?? "Disucar Sales ERP <noreply@disucarsales.ph>";

  await fetch(RESEND_API, {
    method: "POST",
    headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
    body: JSON.stringify({ from, to: payload.to, subject: payload.subject, html: payload.html }),
  });
}

// ── Templates ─────────────────────────────────────────────────────────────────

function baseLayout(title: string, body: string): string {
  return `<!DOCTYPE html>
<html>
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="margin:0;padding:0;background:#f4f4f5;font-family:Arial,sans-serif">
  <table width="100%" cellpadding="0" cellspacing="0" style="padding:32px 0">
    <tr><td align="center">
      <table width="580" cellpadding="0" cellspacing="0" style="background:#fff;border-radius:8px;overflow:hidden;border:1px solid #e5e7eb">
        <tr><td style="background:#003087;padding:20px 32px">
          <span style="color:#fff;font-size:20px;font-weight:700;letter-spacing:-0.5px">Disucar Sales ERP</span>
        </td></tr>
        <tr><td style="padding:32px">
          <h2 style="margin:0 0 16px;font-size:18px;color:#111">${title}</h2>
          ${body}
        </td></tr>
        <tr><td style="padding:16px 32px;background:#f9fafb;border-top:1px solid #e5e7eb">
          <span style="font-size:11px;color:#9ca3af">This is an automated message from Disucar Sales ERP. Please do not reply to this email.</span>
        </td></tr>
      </table>
    </td></tr>
  </table>
</body>
</html>`;
}

function pill(text: string, color: string): string {
  return `<span style="display:inline-block;padding:3px 10px;border-radius:4px;font-size:12px;font-weight:600;background:${color}22;color:${color}">${text}</span>`;
}

function infoRow(label: string, value: string): string {
  return `<tr>
    <td style="padding:6px 0;font-size:13px;color:#6b7280;width:140px">${label}</td>
    <td style="padding:6px 0;font-size:13px;color:#111;font-weight:500">${value}</td>
  </tr>`;
}

const STATE_COLOR: Record<string, string> = {
  PENDING: "#6b7280", APPROVED: "#2563eb", PREPARING: "#d97706",
  SHIPPED: "#7c3aed", DELIVERED: "#16a34a", CANCELLED: "#dc2626",
};

const STATE_LABEL: Record<string, string> = {
  PENDING: "Pending", APPROVED: "Approved", PREPARING: "Preparing",
  SHIPPED: "Shipped", DELIVERED: "Delivered", CANCELLED: "Cancelled",
};

// ── Order status email ────────────────────────────────────────────────────────

interface CustomerLike {
  name: string;
  contactEmail: string | null;
  users: { email: string }[];
}

export async function sendOrderEmail(
  orderId: string,
  state: string,
  customer: CustomerLike
): Promise<void> {
  // Collect recipient emails: customer contact + linked user accounts
  const recipients = new Set<string>();
  if (customer.contactEmail) recipients.add(customer.contactEmail);
  for (const u of customer.users) recipients.add(u.email);
  if (recipients.size === 0) return;

  const stateLabel = STATE_LABEL[state] ?? state;
  const stateColor = STATE_COLOR[state] ?? "#6b7280";

  const messages: Record<string, { title: string; body: string }> = {
    APPROVED: {
      title: "Your order has been approved",
      body: `<p style="margin:0 0 12px;font-size:14px;color:#374151">Your order is confirmed and will be prepared for dispatch.</p>`,
    },
    PREPARING: {
      title: "Your order is being prepared",
      body: `<p style="margin:0 0 12px;font-size:14px;color:#374151">Your order is currently being picked and packed in our warehouse.</p>`,
    },
    SHIPPED: {
      title: "Your order has been shipped",
      body: `<p style="margin:0 0 12px;font-size:14px;color:#374151">Your order is on its way! You will be notified once it is delivered.</p>`,
    },
    DELIVERED: {
      title: "Your order has been delivered",
      body: `<p style="margin:0 0 12px;font-size:14px;color:#374151">Your order has been successfully delivered. Thank you for your business!</p>`,
    },
    CANCELLED: {
      title: "Your order has been cancelled",
      body: `<p style="margin:0 0 12px;font-size:14px;color:#374151">Your order has been cancelled. Please contact us if you have any questions.</p>`,
    },
  };

  const msg = messages[state];
  if (!msg) return; // don't send for PENDING (internal state)

  const appUrl = process.env.NEXTAUTH_URL ?? "http://localhost:3000";

  const body = `
    ${msg.body}
    <table cellpadding="0" cellspacing="0" style="width:100%;margin:16px 0;background:#f9fafb;border-radius:6px;padding:16px">
      ${infoRow("Order Number", orderId)}
      ${infoRow("Customer", customer.name)}
      ${infoRow("Status", "")}
    </table>
    <p style="margin:4px 0 20px;font-size:13px">${pill(stateLabel, stateColor)}</p>
    <a href="${appUrl}/orders/${orderId}" style="display:inline-block;padding:10px 20px;background:#003087;color:#fff;border-radius:6px;text-decoration:none;font-size:13px;font-weight:600">
      View Order →
    </a>
  `;

  await sendEmail({
    to: Array.from(recipients),
    subject: `${msg.title} — ${orderId}`,
    html: baseLayout(msg.title, body),
  });
}

// ── Invoice due reminder ──────────────────────────────────────────────────────

export async function sendInvoiceDueEmail(opts: {
  invoiceId: string;
  customerName: string;
  amount: number;
  dueDate: string;
  to: string[];
}): Promise<void> {
  if (opts.to.length === 0) return;
  const appUrl = process.env.NEXTAUTH_URL ?? "http://localhost:3000";
  const amountStr = `₱${opts.amount.toLocaleString("en-PH", { minimumFractionDigits: 2 })}`;

  const body = `
    <p style="margin:0 0 12px;font-size:14px;color:#374151">
      This is a reminder that the following invoice is due for payment.
    </p>
    <table cellpadding="0" cellspacing="0" style="width:100%;margin:16px 0;background:#f9fafb;border-radius:6px;padding:16px">
      ${infoRow("Invoice No.", opts.invoiceId)}
      ${infoRow("Customer", opts.customerName)}
      ${infoRow("Amount Due", amountStr)}
      ${infoRow("Due Date", opts.dueDate)}
    </table>
    <a href="${appUrl}/ledger" style="display:inline-block;padding:10px 20px;background:#003087;color:#fff;border-radius:6px;text-decoration:none;font-size:13px;font-weight:600">
      View Invoice →
    </a>
  `;

  await sendEmail({
    to: opts.to,
    subject: `Invoice ${opts.invoiceId} — Payment due ${opts.dueDate}`,
    html: baseLayout("Invoice Payment Reminder", body),
  });
}

// ── Unbalanced collection notice ──────────────────────────────────────────────

export async function sendUnbalancedCollectionEmail(opts: {
  employeeName: string;
  totalUnremitted: number;
  count: number;
  oldestCollectedAt: string;
  to: string[];
}): Promise<void> {
  if (opts.to.length === 0) return;
  const appUrl = process.env.NEXTAUTH_URL ?? "http://localhost:3000";
  const amountStr = `₱${opts.totalUnremitted.toLocaleString("en-PH", { minimumFractionDigits: 2 })}`;

  const body = `
    <p style="margin:0 0 12px;font-size:14px;color:#374151">
      You have collected receipts from customers that have not yet been remitted to the office.
      Please remit as soon as possible.
    </p>
    <table cellpadding="0" cellspacing="0" style="width:100%;margin:16px 0;background:#f9fafb;border-radius:6px;padding:16px">
      ${infoRow("Employee", opts.employeeName)}
      ${infoRow("Unremitted Total", amountStr)}
      ${infoRow("Unremitted Receipts", String(opts.count))}
      ${infoRow("Oldest Collection", opts.oldestCollectedAt)}
    </table>
    <a href="${appUrl}/collections" style="display:inline-block;padding:10px 20px;background:#003087;color:#fff;border-radius:6px;text-decoration:none;font-size:13px;font-weight:600">
      View Collections →
    </a>
  `;

  await sendEmail({
    to: opts.to,
    subject: `Unbalanced collection — ${amountStr} unremitted`,
    html: baseLayout("Unbalanced Collection Notice", body),
  });
}

// ── Quote sent notification ───────────────────────────────────────────────────

export async function sendQuoteEmail(opts: {
  quoteId: string;
  customerName: string;
  total: number;
  validUntil: string;
  to: string[];
}): Promise<void> {
  if (opts.to.length === 0) return;
  const appUrl = process.env.NEXTAUTH_URL ?? "http://localhost:3000";
  const totalStr = `₱${opts.total.toLocaleString("en-PH", { minimumFractionDigits: 2 })}`;

  const body = `
    <p style="margin:0 0 12px;font-size:14px;color:#374151">
      Please find below a quotation prepared for your review.
    </p>
    <table cellpadding="0" cellspacing="0" style="width:100%;margin:16px 0;background:#f9fafb;border-radius:6px;padding:16px">
      ${infoRow("Quotation No.", opts.quoteId)}
      ${infoRow("Customer", opts.customerName)}
      ${infoRow("Total Amount", totalStr)}
      ${infoRow("Valid Until", opts.validUntil)}
    </table>
    <p style="margin:0 0 20px;font-size:13px;color:#6b7280">
      To accept this quotation and place an order, please contact your sales representative or reply to this email.
    </p>
    <a href="${appUrl}/print/quote/${opts.quoteId}" style="display:inline-block;padding:10px 20px;background:#003087;color:#fff;border-radius:6px;text-decoration:none;font-size:13px;font-weight:600">
      View Quotation →
    </a>
  `;

  await sendEmail({
    to: opts.to,
    subject: `Quotation ${opts.quoteId} from Disucar Sales Inc`,
    html: baseLayout("Quotation / Proforma Invoice", body),
  });
}
