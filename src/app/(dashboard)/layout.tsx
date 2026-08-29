import { getServerSession } from "next-auth";
import { redirect } from "next/navigation";
import { authOptions } from "@/lib/auth";
import { Sidebar } from "@/components/layout/Sidebar";
import { Topbar } from "@/components/layout/Topbar";
import { getOrgSettings } from "@/lib/org-settings";

export default async function DashboardLayout({ children }: { children: React.ReactNode }) {
  const session = await getServerSession(authOptions);
  if (!session) redirect("/login");

  const brand = await getOrgSettings();

  return (
    <div className="app-shell">
      <Sidebar brand={brand} />
      <div className="app-main">
        <Topbar />
        <main className="page-container">{children}</main>
      </div>
    </div>
  );
}
