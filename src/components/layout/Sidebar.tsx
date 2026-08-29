"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useSession, signOut } from "next-auth/react";
import { cn } from "@/lib/utils";
import { useMobileNav } from "@/components/layout/NavContext";
import type { NavItem } from "@/types";
import type { Role } from "@prisma/client";
import type { OrgBrand } from "@/lib/org-settings";
import { brand as staticBrand } from "@/lib/brand";

const NAV_ITEMS: NavItem[] = [
  { id: "dashboard", label: "Dashboard",      href: "/dashboard", icon: "home",          roles: ["AGENT", "CASHIER", "FINANCE", "WAREHOUSE", "DRIVER", "ADMIN"] },
  { id: "orders",    label: "Sales Orders",   href: "/orders",    icon: "shopping-cart", roles: ["AGENT", "CASHIER", "FINANCE", "WAREHOUSE", "ADMIN", "CUSTOMER"] },
  { id: "approvals", label: "Approvals",      href: "/approvals", icon: "check-square",  roles: ["FINANCE", "ADMIN"] },
  { id: "warehouse", label: "Warehouse",      href: "/warehouse", icon: "package",       roles: ["WAREHOUSE", "ADMIN"] },
  { id: "shipments", label: "Shipments",      href: "/shipments", icon: "truck",         roles: ["WAREHOUSE", "FINANCE", "ADMIN", "DRIVER"] },
  { id: "deliveries", label: "Delivery Runs", href: "/deliveries", icon: "truck",        roles: ["WAREHOUSE", "ADMIN"] },
  { id: "fleet",     label: "Fleet",          href: "/fleet",     icon: "map-pin",       roles: ["WAREHOUSE", "FINANCE", "ADMIN", "DRIVER"] },
  { id: "inbound",   label: "Purchase Orders",href: "/inbound",   icon: "inbox",         roles: ["WAREHOUSE", "FINANCE", "ADMIN"] },
  { id: "inventory", label: "Inventory",      href: "/inventory", icon: "layers",        roles: ["WAREHOUSE", "ADMIN", "CASHIER", "AGENT"] },
  { id: "quotes",    label: "Quotations",     href: "/quotes",    icon: "file-plus",     roles: ["AGENT", "FINANCE", "ADMIN"] },
  { id: "returns",   label: "Returns / RMA",  href: "/returns",   icon: "rotate-ccw",    roles: ["AGENT", "FINANCE", "WAREHOUSE", "ADMIN"] },
  { id: "collections", label: "Collections",  href: "/collections", icon: "user-circle", roles: ["AGENT", "DRIVER", "FINANCE", "ADMIN"] },
  { id: "catalog",   label: "Catalog",        href: "/catalog",   icon: "grid",          roles: ["AGENT", "CASHIER", "FINANCE", "ADMIN"] },
  { id: "customers", label: "Customers",      href: "/customers", icon: "users",         roles: ["AGENT", "FINANCE", "ADMIN"] },
  { id: "suppliers", label: "Suppliers",      href: "/suppliers", icon: "briefcase",     roles: ["WAREHOUSE", "FINANCE", "ADMIN"] },
  { id: "ledger",    label: "Accounting",     href: "/ledger",    icon: "book-open",     roles: ["FINANCE", "ADMIN"] },
  { id: "reports",   label: "Reports",        href: "/reports",   icon: "bar-chart",     roles: ["FINANCE", "ADMIN"] },
  { id: "audit",     label: "Activity Log",   href: "/audit",     icon: "activity",      roles: ["FINANCE", "ADMIN"] },
  { id: "settings",  label: "Settings",       href: "/settings",  icon: "settings",      roles: ["ADMIN", "WAREHOUSE"] },
  { id: "help",      label: "Help Center",    href: "/help",      icon: "help-circle",   roles: ["AGENT", "CASHIER", "FINANCE", "WAREHOUSE", "DRIVER", "ADMIN", "CUSTOMER"] },
];

const ICON_PATHS: Record<string, string> = {
  "home":          "M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2zM9 22V12h6v10",
  "shopping-cart": "M6 2 3 6v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2V6l-3-4zM3 6h18M16 10a4 4 0 0 1-8 0",
  "check-square":  "M9 11l3 3L22 4M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11",
  "package":       "M16.5 9.4 7.55 4.24M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16zM3.27 6.96 12 12.01l8.73-5.05M12 22.08V12",
  "truck":         "M1 3h15v13H1zM16 8h4l3 3v5h-7V8zM5.5 21a2.5 2.5 0 1 0 0-5 2.5 2.5 0 0 0 0 5zM18.5 21a2.5 2.5 0 1 0 0-5 2.5 2.5 0 0 0 0 5z",
  "layers":        "M12 2 2 7l10 5 10-5-10-5zM2 17l10 5 10-5M2 12l10 5 10-5",
  "file-text":     "M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8zM14 2v6h6M16 13H8M16 17H8M10 9H8",
  "tool":          "M14.7 6.3a1 1 0 0 0 0 1.4l1.6 1.6a1 1 0 0 0 1.4 0l3.77-3.77a6 6 0 0 1-7.94 7.94l-6.91 6.91a2.12 2.12 0 0 1-3-3l6.91-6.91a6 6 0 0 1 7.94-7.94l-3.76 3.76z",
  "grid":          "M3 3h7v7H3zM14 3h7v7h-7zM14 14h7v7h-7zM3 14h7v7H3z",
  "users":         "M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2M9 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8zM23 21v-2a4 4 0 0 0-3-3.87M16 3.13a4 4 0 0 1 0 7.75",
  "briefcase":     "M20 7H4a2 2 0 0 0-2 2v11a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2V9a2 2 0 0 0-2-2zM16 7V5a2 2 0 0 0-2-2h-4a2 2 0 0 0-2 2v2",
  "user-circle":   "M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2M12 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8z",
  "book-open":     "M2 3h6a4 4 0 0 1 4 4v14a3 3 0 0 0-3-3H2zM22 3h-6a4 4 0 0 0-4 4v14a3 3 0 0 1 3-3h7z",
  "settings":      "M12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6zM19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z",
  "cpu":           "M18 4H6a2 2 0 0 0-2 2v12a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V6a2 2 0 0 0-2-2zM9 9h6v6H9zM9 1v3M15 1v3M9 20v3M15 20v3M20 9h3M20 15h3M1 9h3M1 15h3",
  "map-pin":       "M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0zM12 13a3 3 0 1 0 0-6 3 3 0 0 0 0 6z",
  "inbox":         "M22 12h-6l-2 3h-4l-2-3H2M5.45 5.11L2 12v6a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2v-6l-3.45-6.89A2 2 0 0 0 16.76 4H7.24a2 2 0 0 0-1.79 1.11z",
  "bar-chart":     "M18 20V10M12 20V4M6 20v-6",
  "file-plus":     "M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8zM14 2v6h6M12 18v-6M9 15h6",
  "rotate-ccw":    "M1 4v6h6M3.51 15a9 9 0 1 0 .49-4.95",
  "activity":      "M22 12h-4l-3 9L9 3l-3 9H2",
  "help-circle":   "M12 22a10 10 0 1 0 0-20 10 10 0 0 0 0 20zM9.09 9a3 3 0 0 1 5.83 1c0 2-3 3-3 3M12 17h.01",
  "log-out":       "M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4M16 17l5-5-5-5M21 12H9",
};

function Icon({ name, className }: { name: string; className?: string }) {
  const d = ICON_PATHS[name];
  if (!d) return null;
  return (
    <svg
      width="18" height="18" viewBox="0 0 24 24" fill="none"
      stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round"
      className={className}
    >
      {d.split("M").filter(Boolean).map((seg, i) => (
        <path key={i} d={"M" + seg} />
      ))}
    </svg>
  );
}

function canSee(item: NavItem, role: Role) {
  return !item.roles || item.roles.includes(role);
}

export function Sidebar({ brand }: { brand: OrgBrand }) {
  const pathname = usePathname();
  const { data: session } = useSession();
  const { open, close } = useMobileNav();
  const role = session?.user?.role as Role | undefined;

  if (!role) return null;

  const visible = NAV_ITEMS.filter((item) => canSee(item, role));

  return (
    <>
      {/* Mobile scrim */}
      {open && (
        <div className="mobile-scrim" onClick={close} aria-hidden />
      )}
      <aside className="sidebar" data-mobile-open={open ? "true" : "false"}>
      <div className="sidebar-brand">
        {/* Mobile close button — top-right of brand area */}
        <button
          onClick={close}
          className="sidebar-signout"
          style={{ display: "none", position: "absolute", top: 0, right: 0 }}
          aria-label="Close menu"
          data-mobile-close
        >
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M18 6 6 18M6 6l12 12" />
          </svg>
        </button>
        <div className="sidebar-logo" style={{ background: brand.logoUrl ? "transparent" : brand.color, padding: brand.logoUrl ? 0 : 16 }}>
          {brand.logoUrl ? (
            <img
              src={brand.logoUrl}
              alt={brand.name}
              style={{ width: "100%", height: "auto", objectFit: "contain", display: "block" }}
            />
          ) : (
            /* Logo fallback: plus-sign mark */
            <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2.5" strokeLinecap="round">
              <path d="M12 2v20M2 12h20" />
            </svg>
          )}
        </div>
        <div style={{ textAlign: "center" }}>
          <span className="sidebar-org">{brand.name}</span>
          {brand.tagline && <div style={{ fontSize: 10, color: "oklch(var(--ink-4))", lineHeight: 1, marginTop: 2 }}>{brand.tagline}</div>}
        </div>
      </div>

      <nav className="sidebar-nav">
        {visible.map((item) => {
          const active = pathname === item.href || pathname.startsWith(item.href + "/");
          return (
            <Link
              key={item.id}
              href={item.href}
              className={cn("sidebar-item", active && "active")}
            >
              <Icon name={item.icon} />
              <span className="sidebar-label">{item.label}</span>
              {item.count != null && item.count > 0 && (
                <span className="sidebar-badge">{item.count}</span>
              )}
            </Link>
          );
        })}
      </nav>

      {/* Feedback links — hidden from customers, and until a repo URL is configured */}
      {role !== "CUSTOMER" && staticBrand.repoUrl && (
        <div style={{ padding: "8px 10px", borderTop: "1px solid oklch(var(--line))" }}>
          <div style={{ fontSize: 10, fontWeight: 700, letterSpacing: "0.06em", textTransform: "uppercase", color: "oklch(var(--ink-4))", marginBottom: 4, paddingLeft: 4 }}>
            Feedback
          </div>
          <a
            href={`${staticBrand.repoUrl}/issues/new?template=bug_report.md`}
            target="_blank"
            rel="noopener noreferrer"
            className="sidebar-item"
            style={{ fontSize: 12, padding: "5px 8px", gap: 8, color: "oklch(var(--ink-2))" }}
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M12 22a10 10 0 1 0 0-20 10 10 0 0 0 0 20z"/>
              <path d="M12 8v4M12 16h.01"/>
            </svg>
            <span className="sidebar-label">Report a Bug</span>
          </a>
          <a
            href={`${staticBrand.repoUrl}/issues/new?template=feature_request.md`}
            target="_blank"
            rel="noopener noreferrer"
            className="sidebar-item"
            style={{ fontSize: 12, padding: "5px 8px", gap: 8, color: "oklch(var(--ink-2))" }}
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01z"/>
            </svg>
            <span className="sidebar-label">Request a Feature</span>
          </a>
        </div>
      )}

      <div className="sidebar-footer">
        <div className="sidebar-user" style={{ flex: 1, minWidth: 0 }}>
          <div className="sidebar-avatar">
            {(session?.user?.name ?? "?")[0].toUpperCase()}
          </div>
          <div className="sidebar-user-info" style={{ flex: 1, minWidth: 0 }}>
            <span className="sidebar-user-name" style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
              {session?.user?.name ?? session?.user?.email}
            </span>
            <span className="sidebar-user-role">{role}</span>
          </div>
        </div>
        <button
          onClick={() => signOut({ callbackUrl: "/login" })}
          className="sidebar-signout"
          title="Sign out"
          style={{ flexShrink: 0 }}
        >
          <Icon name="log-out" />
        </button>
      </div>
    </aside>
    </>
  );
}
