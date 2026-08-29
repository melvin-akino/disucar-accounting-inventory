"use client";

import { useState } from "react";

type EntryType = "order" | "stock" | "journal" | "settings";

interface FeedEntry {
  id: string;
  type: EntryType;
  at: string;
  actor: string;
  title: string;
  sub: string | null;
  ref: string;
}

interface Props { feed: FeedEntry[] }

const TYPE_CONFIG: Record<EntryType, { label: string; color: string; dot: string; icon: string }> = {
  order:    { label: "Orders",    color: "oklch(0.55 0.13 240)", dot: "oklch(0.65 0.14 240)", icon: "M6 2 3 6v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2V6l-3-4zM3 6h18M16 10a4 4 0 0 1-8 0" },
  stock:    { label: "Inventory", color: "oklch(0.50 0.12 80)",  dot: "oklch(0.65 0.18 80)",  icon: "M12 2 2 7l10 5 10-5-10-5zM2 17l10 5 10-5M2 12l10 5 10-5" },
  journal:  { label: "Accounting",color: "oklch(0.50 0.10 155)", dot: "oklch(0.60 0.16 155)", icon: "M2 3h6a4 4 0 0 1 4 4v14a3 3 0 0 0-3-3H2zM22 3h-6a4 4 0 0 0-4 4v14a3 3 0 0 1 3-3h7z" },
  settings: { label: "Settings",  color: "oklch(0.48 0.10 310)", dot: "oklch(0.60 0.12 310)", icon: "M12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6zM19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z" },
};

function fmtDatetime(iso: string) {
  const d = new Date(iso);
  return d.toLocaleDateString("en-PH", { month: "short", day: "numeric", year: "numeric" })
    + " · " + d.toLocaleTimeString("en-PH", { hour: "2-digit", minute: "2-digit", hour12: false });
}

function groupByDate(feed: FeedEntry[]) {
  const groups: { date: string; entries: FeedEntry[] }[] = [];
  let current: string | null = null;
  for (const e of feed) {
    const date = new Date(e.at).toLocaleDateString("en-PH", { weekday: "long", month: "long", day: "numeric", year: "numeric" });
    if (date !== current) { groups.push({ date, entries: [] }); current = date; }
    groups[groups.length - 1].entries.push(e);
  }
  return groups;
}

export function AuditClient({ feed }: Props) {
  const [filterType, setFilterType] = useState<"ALL" | EntryType>("ALL");
  const [search, setSearch] = useState("");

  const filtered = feed.filter(e => {
    if (filterType !== "ALL" && e.type !== filterType) return false;
    const q = search.toLowerCase();
    return !q || e.title.toLowerCase().includes(q) || (e.sub ?? "").toLowerCase().includes(q) || e.actor.toLowerCase().includes(q);
  });

  const groups = groupByDate(filtered);

  return (
    <div>
      <div className="flex items-center gap-3 mb-5">
        <h1 style={{ fontSize: 17, fontWeight: 600, flex: 1 }}>Activity Log</h1>
        <span style={{ fontSize: 12, color: "oklch(var(--ink-3))" }}>{filtered.length} events</span>
      </div>

      <div className="filters" style={{ marginBottom: 20 }}>
        {(["ALL", "order", "stock", "journal", "settings"] as const).map(t => (
          <button
            key={t}
            className="btn btn-sm"
            style={filterType === t ? { background: t === "ALL" ? "oklch(var(--accent))" : TYPE_CONFIG[t as EntryType]?.dot, color: "white", borderColor: "transparent" } : {}}
            onClick={() => setFilterType(t)}
          >
            {t === "ALL" ? "All" : TYPE_CONFIG[t].label}
          </button>
        ))}
        <div className="search-box" style={{ width: 220, marginLeft: "auto" }}>
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="11" cy="11" r="8"/><path d="M21 21l-4.35-4.35"/></svg>
          <input placeholder="Search events…" value={search} onChange={e => setSearch(e.target.value)} />
        </div>
      </div>

      {filtered.length === 0 && (
        <div style={{ textAlign: "center", padding: "48px 0", color: "oklch(var(--ink-3))" }}>No activity found</div>
      )}

      {groups.map(group => (
        <div key={group.date} style={{ marginBottom: 28 }}>
          <div style={{
            fontSize: 11.5, fontWeight: 600, color: "oklch(var(--ink-3))", letterSpacing: "0.04em",
            textTransform: "uppercase", paddingBottom: 10, marginBottom: 4,
            borderBottom: "1px solid oklch(var(--line))",
          }}>
            {group.date}
          </div>
          <div>
            {group.entries.map((entry, i) => {
              const cfg = TYPE_CONFIG[entry.type];
              const isLast = i === group.entries.length - 1;
              return (
                <div key={entry.id} style={{ display: "flex", gap: 14, paddingTop: 12, paddingBottom: isLast ? 0 : 12, borderBottom: isLast ? "none" : "1px solid oklch(var(--line))" }}>
                  {/* Icon */}
                  <div style={{
                    width: 32, height: 32, borderRadius: "50%", flexShrink: 0,
                    display: "grid", placeItems: "center",
                    background: cfg.dot + "22", color: cfg.dot,
                  }}>
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round">
                      {cfg.icon.split("M").filter(Boolean).map((seg, si) => (
                        <path key={si} d={"M" + seg} />
                      ))}
                    </svg>
                  </div>

                  {/* Content */}
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ display: "flex", alignItems: "baseline", gap: 8, flexWrap: "wrap" }}>
                      <span style={{ fontSize: 13, fontWeight: 500, color: "oklch(var(--ink))" }}>{entry.title}</span>
                      <span style={{
                        fontSize: 10.5, fontWeight: 600, padding: "1px 6px", borderRadius: 4,
                        background: cfg.dot + "22", color: cfg.color, flexShrink: 0,
                      }}>
                        {cfg.label.toUpperCase()}
                      </span>
                    </div>
                    {entry.sub && (
                      <div style={{ fontSize: 12, color: "oklch(var(--ink-2))", marginTop: 2, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                        {entry.sub}
                      </div>
                    )}
                    <div style={{ fontSize: 11.5, color: "oklch(var(--ink-3))", marginTop: 3 }}>
                      <strong>{entry.actor}</strong> · {fmtDatetime(entry.at)}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      ))}
    </div>
  );
}
