"use client";

import { useSession } from "next-auth/react";
import { usePathname } from "next/navigation";
import { useMobileNav } from "@/components/layout/NavContext";
import { useEffect, useRef, useState } from "react";
import Link from "next/link";

const BREADCRUMB_MAP: Record<string, string> = {
  orders:    "Sales Orders",
  approvals: "Approvals",
  warehouse: "Warehouse",
  shipments: "Shipments",
  inbound:   "Purchase Orders",
  inventory: "Inventory",
  catalog:   "Catalog",
  customers: "Customers",
  suppliers: "Suppliers",
  ledger:    "Accounting",
  audit:     "Activity Log",
  settings:  "Settings",
  dashboard: "Dashboard",
  new:       "New",
  board:     "Board",
};

function breadcrumbs(pathname: string): string[] {
  const parts = pathname.split("/").filter(Boolean);
  return parts.map((p) => BREADCRUMB_MAP[p] ?? p);
}

const ROLE_COLOR: Record<string, string> = {
  ADMIN:      "bg-[oklch(var(--accent)/0.15)] text-[oklch(var(--accent))]",
  FINANCE:    "bg-[oklch(0.97_0.03_145/0.15)] text-[oklch(0.55_0.15_145)]",
  WAREHOUSE:  "bg-[oklch(0.97_0.03_230/0.15)] text-[oklch(0.55_0.15_230)]",
  AGENT:      "bg-[oklch(0.97_0.03_280/0.15)] text-[oklch(0.55_0.15_280)]",
  CUSTOMER:   "bg-[oklch(0.97_0.03_20/0.15)]  text-[oklch(0.55_0.15_20)]",
  DRIVER:     "bg-[oklch(0.97_0.03_300/0.15)] text-[oklch(0.55_0.15_300)]",
};

interface NotifItem { type: string; label: string; count: number; href: string }

function NotificationBell() {
  const [open, setOpen] = useState(false);
  const [items, setItems] = useState<NotifItem[]>([]);
  const [total, setTotal] = useState(0);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    fetch("/api/notifications").then(r => r.json()).then(d => {
      setItems(d.items ?? []);
      setTotal(d.total ?? 0);
    }).catch(() => {});
  }, []);

  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, []);

  return (
    <div ref={ref} style={{ position: "relative" }}>
      <button
        onClick={() => setOpen(v => !v)}
        style={{
          width: 32, height: 32, borderRadius: 8, border: "1px solid oklch(var(--line))",
          background: "var(--panel)", cursor: "pointer",
          display: "flex", alignItems: "center", justifyContent: "center",
          position: "relative", color: "oklch(var(--ink-2))",
        }}
        aria-label="Notifications"
      >
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9M13.73 21a2 2 0 0 1-3.46 0"/>
        </svg>
        {total > 0 && (
          <span style={{
            position: "absolute", top: -4, right: -4,
            minWidth: 16, height: 16, borderRadius: 8,
            background: "oklch(0.55 0.18 25)", color: "white",
            fontSize: 9.5, fontWeight: 700, display: "grid", placeItems: "center", padding: "0 3px",
          }}>
            {total > 99 ? "99+" : total}
          </span>
        )}
      </button>

      {open && (
        <div style={{
          position: "absolute", top: "calc(100% + 8px)", right: 0, zIndex: 200,
          width: 280, background: "var(--panel)",
          border: "1px solid oklch(var(--line))", borderRadius: 10,
          boxShadow: "0 8px 24px oklch(0 0 0 / 0.12)",
        }}>
          <div style={{ padding: "12px 14px 8px", borderBottom: "1px solid oklch(var(--line))", fontSize: 13, fontWeight: 600 }}>
            Notifications
          </div>
          {items.length === 0 ? (
            <div style={{ padding: "20px 14px", fontSize: 12.5, color: "oklch(var(--ink-3))", textAlign: "center" }}>
              All clear — no alerts
            </div>
          ) : (
            <div>
              {items.map((item, i) => (
                <Link key={i} href={item.href} onClick={() => setOpen(false)} style={{ textDecoration: "none" }}>
                  <div style={{
                    display: "flex", alignItems: "center", gap: 10,
                    padding: "10px 14px",
                    borderBottom: i < items.length - 1 ? "1px solid oklch(var(--line))" : "none",
                    cursor: "pointer",
                  }} onMouseEnter={e => (e.currentTarget.style.background = "oklch(var(--accent-soft))")}
                     onMouseLeave={e => (e.currentTarget.style.background = "transparent")}>
                    <div style={{
                      width: 8, height: 8, borderRadius: "50%", flexShrink: 0,
                      background: item.type === "warn" ? "oklch(0.60 0.18 25)" : "oklch(0.60 0.14 240)",
                    }} />
                    <span style={{ flex: 1, fontSize: 12.5, color: "oklch(var(--ink))" }}>{item.label}</span>
                    <span style={{
                      fontSize: 11.5, fontWeight: 700, padding: "1px 7px", borderRadius: 99,
                      background: item.type === "warn" ? "oklch(0.95 0.04 25)" : "oklch(0.95 0.04 240)",
                      color: item.type === "warn" ? "oklch(0.45 0.14 25)" : "oklch(0.40 0.14 240)",
                    }}>
                      {item.count}
                    </span>
                  </div>
                </Link>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

export function Topbar() {
  const pathname = usePathname();
  const { data: session } = useSession();
  const { toggle } = useMobileNav();
  const crumbs = breadcrumbs(pathname);
  const role = session?.user?.role ?? "";

  return (
    <header className="topbar">
      <button
        onClick={toggle}
        className="hamburger"
        aria-label="Toggle menu"
      >
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M3 12h18M3 6h18M3 18h18" />
        </svg>
      </button>

      <nav className="topbar-breadcrumb" aria-label="Breadcrumb">
        <span className="topbar-crumb-home">Home</span>
        {crumbs.map((crumb, i) => (
          <span key={i} className="topbar-crumb-item">
            <span className="topbar-crumb-sep">/</span>
            <span className={i === crumbs.length - 1 ? "topbar-crumb-active" : "topbar-crumb"}>
              {crumb}
            </span>
          </span>
        ))}
      </nav>

      <div className="topbar-right" style={{ display: "flex", alignItems: "center", gap: 8 }}>
        <NotificationBell />
        {/* Logged-in user pill — avatar + name + role */}
        {session?.user && (
          <div style={{
            display: "flex", alignItems: "center", gap: 7,
            padding: "4px 10px 4px 5px",
            borderRadius: 8, border: "1px solid oklch(var(--line))",
            background: "var(--panel)",
          }}>
            {/* Avatar circle */}
            <div style={{
              width: 24, height: 24, borderRadius: 6, flexShrink: 0,
              background: "oklch(var(--accent))", color: "#fff",
              display: "flex", alignItems: "center", justifyContent: "center",
              fontSize: 11, fontWeight: 700,
            }}>
              {(session.user.name ?? session.user.email ?? "?")[0].toUpperCase()}
            </div>
            {/* Name */}
            <span style={{ fontSize: 12.5, fontWeight: 500, color: "oklch(var(--ink-1))", whiteSpace: "nowrap" }}>
              {session.user.name ?? session.user.email}
            </span>
            {/* Role chip */}
            {role && (
              <span className={`topbar-role-chip ${ROLE_COLOR[role] ?? ""}`}
                style={{ marginLeft: 2 }}>
                {role}
              </span>
            )}
          </div>
        )}
      </div>
    </header>
  );
}
