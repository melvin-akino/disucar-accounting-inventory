import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { getOrgSettings } from "@/lib/org-settings";
import { redirect } from "next/navigation";
import { join } from "path";
import { readFile } from "fs/promises";

// ── helpers ───────────────────────────────────────────────────────────────────
function peso(n: number) {
  return "\u20B1" + n.toLocaleString("en-PH", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}
function toBuffer(doc: InstanceType<typeof import("pdfkit")>): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    doc.on("data",  (c: Buffer) => chunks.push(c));
    doc.on("end",   ()          => resolve(Buffer.concat(chunks)));
    doc.on("error", reject);
  });
}

// ── route ─────────────────────────────────────────────────────────────────────
export async function GET(
  _req: NextRequest,
  { params }: { params: { id: string } }
) {
  const session = await getServerSession(authOptions);
  if (!session || !["FINANCE", "ADMIN", "AGENT"].includes(session.user.role)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const invoice = await prisma.invoice.findUnique({
    where: { id: params.id },
    include: {
      customer: true,
      order: {
        include: {
          lines:     true,
          warehouse: { select: { name: true } },
        },
      },
    },
  });
  if (!invoice) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const brand  = await getOrgSettings();
  const PDFDoc = (await import("pdfkit")).default;

  const doc = new PDFDoc({ size: "A4", margin: 40, compress: true, info: {
    Title:   `Invoice ${invoice.id}`,
    Author:  brand.name,
    Subject: "Invoice",
  }});

  // ── Logo ──────────────────────────────────────────────────────────────────
  let logoBuffer: Buffer | null = null;
  if (brand.logoUrl?.startsWith("/api/uploads/")) {
    try {
      logoBuffer = await readFile(join(process.cwd(), "uploads", brand.logoUrl.replace("/api/uploads/", "")));
    } catch { /* no logo on disk */ }
  }

  const brandHex = brand.color || "#003087";
  const gray     = "#6b7280";
  const lineClr  = "#e5e7eb";
  const W        = 515; // usable width (595 - 80)

  // ── Header ────────────────────────────────────────────────────────────────
  let y = 40;

  if (logoBuffer) {
    doc.image(logoBuffer, 40, y, { width: 56, height: 56 });
    doc.fillColor(brandHex).font("Helvetica-Bold").fontSize(16).text(brand.name, 106, y + 6, { width: 250 });
    doc.fillColor(gray).font("Helvetica").fontSize(9)
       .text([brand.tagline, brand.address, brand.phone].filter(Boolean).join("  |  "), 106, y + 26, { width: 260 });
  } else {
    // Coloured box fallback
    doc.rect(40, y, 56, 56).fill(brandHex);
    doc.fillColor("white").font("Helvetica-Bold").fontSize(22).text("+", 40, y + 16, { width: 56, align: "center" });
    doc.fillColor(brandHex).font("Helvetica-Bold").fontSize(16).text(brand.name, 106, y + 6, { width: 250 });
    doc.fillColor(gray).font("Helvetica").fontSize(9)
       .text([brand.tagline, brand.address, brand.phone].filter(Boolean).join("  |  "), 106, y + 26, { width: 260 });
  }

  // INVOICE badge (top-right)
  doc.fillColor(brandHex).font("Helvetica-Bold").fontSize(22)
     .text("INVOICE", 40, y + 4, { width: W, align: "right" });
  doc.fillColor(gray).font("Helvetica").fontSize(9)
     .text(invoice.id, 40, y + 30, { width: W, align: "right" });

  y += 72;
  doc.strokeColor(lineClr).lineWidth(1).moveTo(40, y).lineTo(555, y).stroke();
  y += 14;

  // ── Bill To + Metadata ────────────────────────────────────────────────────
  const customer = invoice.customer;
  const order    = invoice.order;

  doc.fillColor(gray).font("Helvetica").fontSize(8).text("BILL TO", 40, y);
  doc.fillColor("#111").font("Helvetica-Bold").fontSize(12).text(customer.name, 40, y + 12);
  let billY = y + 28;
  for (const line of [
    customer.tin   ? `TIN: ${customer.tin}`     : null,
    customer.city  || null,
    customer.terms ? `Terms: ${customer.terms}` : null,
    customer.contactEmail || null,
  ].filter(Boolean) as string[]) {
    doc.fillColor(gray).font("Helvetica").fontSize(9).text(line, 40, billY);
    billY += 12;
  }

  // Metadata grid (right column)
  const metaX = 320;
  const metaRows: [string, string][] = [
    ["Issue Date", new Date(invoice.issued).toLocaleDateString("en-PH", { year: "numeric", month: "short", day: "numeric" })],
    ["Due Date",   new Date(invoice.due).toLocaleDateString("en-PH",   { year: "numeric", month: "short", day: "numeric" })],
    ["Status",     invoice.status],
    ["SO Ref",     invoice.soId ?? "—"],
    ["Warehouse",  order?.warehouse.name ?? "—"],
  ];
  let metaY = y;
  for (const [label, value] of metaRows) {
    doc.fillColor(gray).font("Helvetica").fontSize(8).text(label.toUpperCase(), metaX, metaY);
    doc.fillColor("#111").font("Helvetica").fontSize(9.5).text(value, metaX, metaY + 10);
    metaY += 26;
  }

  y = Math.max(billY, metaY) + 16;
  doc.strokeColor(lineClr).lineWidth(1).moveTo(40, y).lineTo(555, y).stroke();
  y += 12;

  // ── Line items ────────────────────────────────────────────────────────────
  const lines = order?.lines ?? [];
  const colW  = [220, 50, 60, 95, 90]; // Description | Unit | Qty | Unit Price | Total
  const colX  = colW.reduce<number[]>((acc, w) => [...acc, (acc.at(-1) ?? 40) + w], [40]).slice(0, -1);
  const hdrs  = ["Description", "Unit", "Qty", "Unit Price", "Total"];
  const ROWH  = 20;

  // Header row
  doc.rect(40, y, W, ROWH).fill("#f9fafb");
  hdrs.forEach((h, i) => {
    const align = i > 1 ? "right" : "left";
    doc.fillColor("#374151").font("Helvetica-Bold").fontSize(9)
       .text(h, colX[i] + 4, y + 6, { width: colW[i] - 8, align });
  });
  doc.strokeColor(lineClr).lineWidth(0.5).moveTo(40, y + ROWH).lineTo(555, y + ROWH).stroke();
  y += ROWH;

  for (const line of lines) {
    const cells = [
      line.name,
      line.unit,
      String(line.qty),
      peso(Number(line.unitPrice)),
      peso(Number(line.lineTotal)),
    ];
    cells.forEach((c, i) => {
      const align = i > 1 ? "right" : "left";
      doc.fillColor("#111").font("Helvetica").fontSize(9.5)
         .text(c, colX[i] + 4, y + 5, { width: colW[i] - 8, align });
    });
    doc.strokeColor(lineClr).lineWidth(0.5).moveTo(40, y + ROWH).lineTo(555, y + ROWH).stroke();
    y += ROWH;
  }

  y += 16;

  // ── Totals ────────────────────────────────────────────────────────────────
  const amount   = Number(invoice.amount);
  const paid     = Number(invoice.paid);
  const balance  = amount - paid;
  const subtotal = order ? Number(order.subtotal) : amount;
  const vat      = order ? Number(order.vat)      : 0;
  const cwt      = order ? Number(order.cwt)      : 0;

  const totals: [string, number | string, boolean][] = [
    ["Subtotal",   subtotal, false],
    ["VAT (12%)",  vat,      false],
    ["CWT (2%)",   -cwt,     false],
  ];

  const totX = 370;
  for (const [label, value, bold] of totals) {
    doc.fillColor(gray).font(bold ? "Helvetica-Bold" : "Helvetica").fontSize(10)
       .text(String(label), totX, y, { width: 100 });
    doc.fillColor("#111").font("Helvetica").fontSize(10)
       .text(typeof value === "number" ? peso(value) : value, totX + 100, y, { width: 85, align: "right" });
    y += 16;
  }
  doc.strokeColor("#111").lineWidth(1.5).moveTo(totX, y).lineTo(555, y).stroke();
  y += 6;
  doc.fillColor(brandHex).font("Helvetica-Bold").fontSize(13).text("Total Due", totX, y, { width: 100 });
  doc.fillColor(brandHex).font("Helvetica-Bold").fontSize(13).text(peso(amount), totX + 100, y, { width: 85, align: "right" });
  y += 20;

  if (paid > 0) {
    doc.fillColor(gray).font("Helvetica").fontSize(9.5).text("Less: Payments Received", totX, y, { width: 100 });
    doc.fillColor(gray).font("Helvetica").fontSize(9.5).text(`(${peso(paid)})`, totX + 100, y, { width: 85, align: "right" });
    y += 14;
    doc.fillColor(balance > 0 ? "#b91c1c" : "#166534").font("Helvetica-Bold").fontSize(11).text("Balance Due", totX, y, { width: 100 });
    doc.fillColor(balance > 0 ? "#b91c1c" : "#166534").font("Helvetica-Bold").fontSize(11).text(peso(balance), totX + 100, y, { width: 85, align: "right" });
    y += 18;
  }

  // ── Signatures ────────────────────────────────────────────────────────────
  y = Math.max(y + 40, 680);
  const sigLabels = ["Prepared by", "Received by / Authorized Signatory"];
  const sigX      = [40, 320];
  for (let i = 0; i < 2; i++) {
    doc.strokeColor("#9ca3af").lineWidth(0.75).moveTo(sigX[i], y + 30).lineTo(sigX[i] + 200, y + 30).stroke();
    doc.fillColor(gray).font("Helvetica").fontSize(8).text(sigLabels[i], sigX[i], y + 34);
  }

  // ── Footer ────────────────────────────────────────────────────────────────
  const today = new Date().toLocaleDateString("en-PH", { year: "numeric", month: "short", day: "numeric" });
  doc.fillColor("#9ca3af").font("Helvetica").fontSize(8)
     .text(`Generated ${today} · ${invoice.id} · This is not an official receipt`, 40, 810, { width: W, align: "center" });

  doc.end();
  const buffer = await toBuffer(doc);

  return new NextResponse(buffer as unknown as BodyInit, {
    headers: {
      "Content-Type":        "application/pdf",
      "Content-Disposition": `attachment; filename="INV-${invoice.id}.pdf"`,
    },
  });
}
