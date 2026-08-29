import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { redirect } from "next/navigation";
import { QuotesClient } from "./QuotesClient";
import { HelpButton } from "@/components/HelpButton";

export default async function QuotesPage() {
  const session = await getServerSession(authOptions);
  if (!session) redirect("/login");

  const allowedRoles = ["AGENT", "FINANCE", "ADMIN"];
  if (!allowedRoles.includes(session.user.role)) redirect("/dashboard");

  const canCreate = ["AGENT", "FINANCE", "ADMIN"].includes(session.user.role);

  const [quotes, customers, catalog, warehouses] = await Promise.all([
    prisma.quotation.findMany({
      orderBy: { createdAt: "desc" },
      include: {
        customer: { select: { id: true, name: true } },
        agent: { select: { id: true, name: true } },
        warehouse: { select: { id: true, name: true } },
        lines: true,
      },
    }),
    prisma.customer.findMany({ orderBy: { name: "asc" } }),
    prisma.catalogItem.findMany({ where: { active: true }, orderBy: { name: "asc" } }),
    prisma.warehouse.findMany({ orderBy: { name: "asc" } }),
  ]);

  return (
    <div className="flex flex-col gap-4">
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
        <div>
          <div className="flex items-center gap-2">
            <h1 className="page-title">Quotations</h1>
            <HelpButton slug="quotations" label="Help: Quotations" />
          </div>
          <p className="page-sub">Create proforma invoices and convert to sales orders</p>
        </div>
      </div>
      <QuotesClient
        quotes={JSON.parse(JSON.stringify(quotes))}
        customers={customers}
        catalog={catalog}
        warehouses={warehouses}
        canCreate={canCreate}
      />
    </div>
  );
}
