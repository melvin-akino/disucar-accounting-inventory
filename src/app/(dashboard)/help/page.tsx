"use client";

import { useState, useMemo } from "react";
import Link from "next/link";
import { useSession } from "next-auth/react";
import { HELP_ARTICLES, QUICK_STARTS } from "@/lib/help-articles";
import type { HelpRole } from "@/lib/help-articles";

const ROLE_LABELS: Record<HelpRole, string> = {
  ADMIN:      "Admin",
  AGENT:      "Sales Agent",
  FINANCE:    "Finance",
  WAREHOUSE:  "Warehouse",
  DRIVER:     "Driver",
  CUSTOMER:   "Customer",
};

export default function HelpPage() {
  const { data: session } = useSession();
  const role = session?.user?.role as HelpRole | undefined;

  const [search, setSearch]       = useState("");
  const [roleFilter, setRoleFilter] = useState<HelpRole | "ALL">("ALL");

  const myQuickStart = role ? QUICK_STARTS.find((q) => q.role === role) : null;

  const filtered = useMemo(() => {
    const q = search.toLowerCase();
    return HELP_ARTICLES.filter((a) => {
      const matchRole   = roleFilter === "ALL" || a.roles.includes(roleFilter);
      const matchSearch = !q ||
        a.title.toLowerCase().includes(q) ||
        a.subtitle.toLowerCase().includes(q) ||
        a.overview.toLowerCase().includes(q);
      return matchRole && matchSearch;
    });
  }, [search, roleFilter]);

  return (
    <div style={{ maxWidth: 980 }}>

      {/* ── Page header ───────────────────────────────────────────────────── */}
      <div style={{ marginBottom: 28 }}>
        <h1 style={{ fontSize: 22, fontWeight: 700, marginBottom: 4 }}>Help Center</h1>
        <p style={{ fontSize: 14, color: "oklch(var(--ink-3))", margin: 0 }}>
          Step-by-step guides and workflows for every role in the system.
        </p>
      </div>

      {/* ── Quick-start banner for the logged-in role ─────────────────────── */}
      {myQuickStart && (
        <div style={{
          background: "oklch(var(--accent) / 0.06)",
          border: "1px solid oklch(var(--accent) / 0.18)",
          borderRadius: 12, padding: "14px 18px",
          display: "flex", alignItems: "flex-start", gap: 14,
          marginBottom: 24,
        }}>
          <div style={{
            width: 38, height: 38, borderRadius: 10, flexShrink: 0,
            background: "oklch(var(--accent) / 0.14)",
            display: "flex", alignItems: "center", justifyContent: "center",
            color: "oklch(var(--accent))",
          }}>
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none"
              stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round">
              <path d="M13 2L3 14h9l-1 8 10-12h-9l1-8z" />
            </svg>
          </div>
          <div style={{ flex: 1 }}>
            <div style={{ fontWeight: 600, fontSize: 13.5, marginBottom: 3 }}>
              Quick Start — {ROLE_LABELS[myQuickStart.role]}
            </div>
            <p style={{ fontSize: 12.5, color: "oklch(var(--ink-3))", marginBottom: 10, lineHeight: 1.5 }}>
              {myQuickStart.description}
            </p>
            <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
              {myQuickStart.steps.map((step, i) => (
                <Link key={i} href={`/help/${step.slug}`} style={{
                  fontSize: 12, fontWeight: 500, padding: "4px 10px",
                  borderRadius: 6, textDecoration: "none",
                  background: "oklch(var(--accent) / 0.12)",
                  color: "oklch(var(--accent))",
                  border: "1px solid oklch(var(--accent) / 0.2)",
                }}>
                  {i + 1}. {step.title}
                </Link>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* ── Search + role filter ───────────────────────────────────────────── */}
      <div style={{ display: "flex", gap: 10, marginBottom: 20, alignItems: "center" }}>
        {/* Search */}
        <div style={{ flex: 1, position: "relative" }}>
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none"
            stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"
            style={{ position: "absolute", left: 10, top: "50%", transform: "translateY(-50%)",
                     color: "oklch(var(--ink-4))", pointerEvents: "none" }}>
            <circle cx="11" cy="11" r="8" /><path d="m21 21-4.35-4.35" />
          </svg>
          <input
            type="text"
            className="input"
            placeholder="Search articles..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            style={{ paddingLeft: 32, width: "100%" }}
          />
        </div>
        {/* Role filter */}
        <select
          className="input"
          value={roleFilter}
          onChange={(e) => setRoleFilter(e.target.value as HelpRole | "ALL")}
          style={{ width: "auto", minWidth: 140 }}
        >
          <option value="ALL">All Roles</option>
          {(Object.keys(ROLE_LABELS) as HelpRole[]).map((r) => (
            <option key={r} value={r}>{ROLE_LABELS[r]}</option>
          ))}
        </select>
      </div>

      {/* ── Article grid ──────────────────────────────────────────────────── */}
      {filtered.length === 0 ? (
        <div className="card">
          <div className="card-body" style={{ textAlign: "center", padding: "48px 24px" }}>
            <svg width="32" height="32" viewBox="0 0 24 24" fill="none"
              stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"
              style={{ color: "oklch(var(--ink-4))", margin: "0 auto 10px" }}>
              <circle cx="11" cy="11" r="8" /><path d="m21 21-4.35-4.35" />
            </svg>
            <p style={{ fontSize: 14, color: "oklch(var(--ink-3))", margin: 0 }}>
              No articles match your search.
            </p>
          </div>
        </div>
      ) : (
        <div style={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fill, minmax(280px, 1fr))",
          gap: 10,
        }}>
          {filtered.map((article) => (
            <Link
              key={article.slug}
              href={`/help/${article.slug}`}
              style={{ textDecoration: "none", display: "block" }}
            >
              <ArticleCard article={article} />
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}

function ArticleCard({ article }: { article: (typeof HELP_ARTICLES)[0] }) {
  const ROLE_LABELS: Record<string, string> = {
    ADMIN: "Admin", AGENT: "Sales Agent", FINANCE: "Finance",
    WAREHOUSE: "Warehouse", DRIVER: "Driver", CUSTOMER: "Customer",
  };

  return (
    <div
      className="card"
      style={{
        cursor: "pointer",
        height: "100%",
        transition: "box-shadow 0.15s, transform 0.12s",
      }}
      onMouseEnter={(e) => {
        (e.currentTarget as HTMLDivElement).style.boxShadow =
          "0 4px 16px oklch(0 0 0 / 0.08)";
        (e.currentTarget as HTMLDivElement).style.transform = "translateY(-1px)";
      }}
      onMouseLeave={(e) => {
        (e.currentTarget as HTMLDivElement).style.boxShadow = "";
        (e.currentTarget as HTMLDivElement).style.transform = "";
      }}
    >
      <div className="card-body" style={{ padding: "16px 18px" }}>
        {/* Icon row */}
        <div style={{ display: "flex", alignItems: "flex-start", gap: 12 }}>
          <div style={{
            width: 38, height: 38, borderRadius: 9, flexShrink: 0,
            background: "oklch(var(--bg-2))",
            border: "1px solid oklch(var(--line))",
            display: "flex", alignItems: "center", justifyContent: "center",
            fontSize: 20,
          }}>
            {article.icon}
          </div>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontWeight: 600, fontSize: 13.5, marginBottom: 3, lineHeight: 1.3 }}>
              {article.title}
            </div>
            <div style={{
              fontSize: 12, color: "oklch(var(--ink-3))",
              lineHeight: 1.45, marginBottom: 10,
            }}>
              {article.subtitle}
            </div>
            {/* Role tags */}
            <div style={{ display: "flex", flexWrap: "wrap", gap: 4 }}>
              {article.roles.map((r) => (
                <span key={r} style={{
                  fontSize: 10, fontWeight: 500,
                  padding: "1px 6px", borderRadius: 4,
                  background: "oklch(var(--bg-2))",
                  color: "oklch(var(--ink-3))",
                  border: "1px solid oklch(var(--line))",
                }}>
                  {ROLE_LABELS[r] ?? r}
                </span>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
