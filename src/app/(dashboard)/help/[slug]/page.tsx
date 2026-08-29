"use client";

import { useParams } from "next/navigation";
import Link from "next/link";
import { HELP_ARTICLES } from "@/lib/help-articles";
import type { HelpWorkflow, HelpStep } from "@/lib/help-articles";

const ROLE_LABELS: Record<string, string> = {
  ADMIN: "Admin", AGENT: "Agent", FINANCE: "Finance",
  WAREHOUSE: "Warehouse", DRIVER: "Driver", CUSTOMER: "Customer",
};

// ── Callout block ────────────────────────────────────────────────────────────

function Callout({ type, children }: { type: "tip" | "warning" | "note"; children: React.ReactNode }) {
  const map = {
    tip: {
      bg: "oklch(0.97 0.03 150)", border: "oklch(0.80 0.12 150)",
      color: "oklch(0.38 0.15 150)", label: "Tip",
      icon: "M12 22c5.523 0 10-4.477 10-10S17.523 2 12 2 2 6.477 2 12s4.477 10 10 10zM12 8v4M12 16h.01",
    },
    warning: {
      bg: "oklch(0.97 0.05 60)",  border: "oklch(0.80 0.18 60)",
      color: "oklch(0.42 0.2 60)", label: "Warning",
      icon: "M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0zM12 9v4M12 17h.01",
    },
    note: {
      bg: "oklch(0.97 0.02 250)", border: "oklch(0.80 0.08 250)",
      color: "oklch(0.38 0.1 250)", label: "Note",
      icon: "M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8zM14 2v6h6M16 13H8M16 17H8M10 9H8",
    },
  };
  const s = map[type];
  return (
    <div style={{
      background: s.bg, border: `1px solid ${s.border}`,
      borderRadius: 8, padding: "10px 14px",
      display: "flex", gap: 10, alignItems: "flex-start", marginTop: 10,
    }}>
      <svg width="14" height="14" viewBox="0 0 24 24" fill="none"
        stroke={s.color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"
        style={{ flexShrink: 0, marginTop: 1 }}>
        {s.icon.split("M").filter(Boolean).map((seg, i) => (
          <path key={i} d={"M" + seg} />
        ))}
      </svg>
      <div>
        <span style={{ fontWeight: 700, fontSize: 11.5, color: s.color, textTransform: "uppercase", letterSpacing: "0.04em" }}>
          {s.label}:{" "}
        </span>
        <span style={{ fontSize: 12.5, color: "oklch(var(--ink-2))" }}>{children}</span>
      </div>
    </div>
  );
}

// ── Step inside a workflow ────────────────────────────────────────────────────

function StepCard({ step, index }: { step: HelpStep; index: number }) {
  return (
    <div style={{
      display: "flex", gap: 16, paddingBottom: 24,
      paddingLeft: 20, marginLeft: 12,
      borderLeft: "2px solid oklch(var(--line))",
      position: "relative",
    }}>
      {/* Numbered bubble */}
      <div style={{
        position: "absolute", left: -13, top: 0,
        width: 24, height: 24, borderRadius: "50%",
        background: "oklch(var(--accent))", color: "#fff",
        display: "flex", alignItems: "center", justifyContent: "center",
        fontSize: 12, fontWeight: 700, flexShrink: 0,
      }}>
        {index + 1}
      </div>

      <div style={{ flex: 1, paddingTop: 2 }}>
        <div style={{ fontWeight: 600, fontSize: 14, marginBottom: 4 }}>{step.title}</div>
        <p style={{ fontSize: 13.5, color: "oklch(var(--ink-2))", lineHeight: 1.65, margin: 0 }}>
          {step.description}
        </p>
        {step.tip     && <Callout type="tip">{step.tip}</Callout>}
        {step.warning && <Callout type="warning">{step.warning}</Callout>}
        {step.note    && <Callout type="note">{step.note}</Callout>}
      </div>
    </div>
  );
}

// ── Workflow section ──────────────────────────────────────────────────────────

function WorkflowSection({ workflow, wfIndex }: { workflow: HelpWorkflow; wfIndex: number }) {
  return (
    <div className="card" style={{ marginBottom: 14 }}>
      {/* Workflow header */}
      <div className="card-head" style={{ paddingBottom: 12 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
          <span style={{
            fontSize: 10.5, fontWeight: 700, letterSpacing: "0.06em",
            padding: "3px 8px", borderRadius: 5,
            background: "oklch(var(--accent) / 0.10)",
            color: "oklch(var(--accent))",
            border: "1px solid oklch(var(--accent) / 0.2)",
          }}>
            WORKFLOW {wfIndex + 1}
          </span>
          <span className="card-h">{workflow.title}</span>
        </div>
        {workflow.description && (
          <p style={{ fontSize: 13, color: "oklch(var(--ink-3))", marginTop: 4, marginBottom: 0 }}>
            {workflow.description}
          </p>
        )}
        {workflow.roles && workflow.roles.length > 0 && (
          <div style={{ display: "flex", gap: 4, flexWrap: "wrap", marginTop: 6 }}>
            {workflow.roles.map((r) => (
              <span key={r} style={{
                fontSize: 10.5, padding: "1px 7px", borderRadius: 4,
                background: "oklch(var(--bg-2))", color: "oklch(var(--ink-3))",
                border: "1px solid oklch(var(--line))",
              }}>{r}</span>
            ))}
          </div>
        )}
      </div>

      <div className="card-body" style={{ paddingTop: 16 }}>
        {workflow.steps.map((step, si) => (
          <StepCard key={si} step={step} index={si} />
        ))}
      </div>
    </div>
  );
}

// ── Page ──────────────────────────────────────────────────────────────────────

export default function HelpArticlePage() {
  const params  = useParams();
  const slug    = params?.slug as string;
  const article = HELP_ARTICLES.find((a) => a.slug === slug);

  if (!article) {
    return (
      <div style={{ maxWidth: 720 }}>
        <Link href="/help" className="btn btn-ghost btn-sm" style={{ marginBottom: 24, display: "inline-flex" }}>
          ← Help Center
        </Link>
        <div className="card">
          <div className="card-body" style={{ textAlign: "center", padding: "48px 24px" }}>
            <p style={{ color: "oklch(var(--ink-3))", fontSize: 14 }}>Article not found.</p>
            <Link href="/help" className="btn btn-sm" style={{ marginTop: 14, display: "inline-flex" }}>
              Back to Help Center
            </Link>
          </div>
        </div>
      </div>
    );
  }

  const idx  = HELP_ARTICLES.findIndex((a) => a.slug === slug);
  const prev = idx > 0 ? HELP_ARTICLES[idx - 1] : null;
  const next = idx < HELP_ARTICLES.length - 1 ? HELP_ARTICLES[idx + 1] : null;

  return (
    <div style={{ maxWidth: 760 }}>

      {/* ── Back link ───────────────────────────────────────────────────── */}
      <Link href="/help" style={{
        display: "inline-flex", alignItems: "center", gap: 6,
        fontSize: 13, color: "oklch(var(--ink-3))", textDecoration: "none",
        marginBottom: 22,
      }}
        onMouseEnter={(e) => ((e.currentTarget as HTMLAnchorElement).style.color = "oklch(var(--accent))")}
        onMouseLeave={(e) => ((e.currentTarget as HTMLAnchorElement).style.color = "oklch(var(--ink-3))")}
      >
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none"
          stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M19 12H5M12 5l-7 7 7 7" />
        </svg>
        Help Center
      </Link>

      {/* ── Article header ──────────────────────────────────────────────── */}
      <div style={{ display: "flex", alignItems: "flex-start", gap: 16, marginBottom: 22 }}>
        <div style={{
          width: 52, height: 52, borderRadius: 12, flexShrink: 0,
          background: "oklch(var(--bg-2))", border: "1px solid oklch(var(--line))",
          display: "flex", alignItems: "center", justifyContent: "center",
          fontSize: 26,
        }}>
          {article.icon}
        </div>
        <div>
          <h1 style={{ fontSize: 20, fontWeight: 700, marginBottom: 4, lineHeight: 1.2 }}>
            {article.title}
          </h1>
          <p style={{ fontSize: 13.5, color: "oklch(var(--ink-3))", marginBottom: 10, lineHeight: 1.4 }}>
            {article.subtitle}
          </p>
          <div style={{ display: "flex", gap: 5, flexWrap: "wrap" }}>
            {article.roles.map((r) => (
              <span key={r} style={{
                fontSize: 10.5, fontWeight: 600, letterSpacing: "0.05em",
                padding: "3px 8px", borderRadius: 5,
                background: "oklch(var(--accent) / 0.07)",
                color: "oklch(var(--accent))",
                border: "1px solid oklch(var(--accent) / 0.22)",
                textTransform: "uppercase",
              }}>
                {ROLE_LABELS[r] ?? r}
              </span>
            ))}
          </div>
        </div>
      </div>

      {/* ── Overview ────────────────────────────────────────────────────── */}
      <div className="card" style={{ marginBottom: 14 }}>
        <div className="card-body">
          <p style={{ fontSize: 14, color: "oklch(var(--ink-2))", lineHeight: 1.75, margin: 0 }}>
            {article.overview}
          </p>
        </div>
      </div>

      {/* ── Key Concepts ────────────────────────────────────────────────── */}
      {article.concepts && article.concepts.length > 0 && (
        <div className="card" style={{ marginBottom: 14 }}>
          <div className="card-head"><span className="card-h">Key Concepts</span></div>
          <div className="card-body" style={{ padding: 0, overflow: "hidden" }}>
            <table style={{ width: "100%", borderCollapse: "collapse" }}>
              <tbody>
                {article.concepts.map((c, i) => (
                  <tr key={i} style={{
                    borderBottom: i < article.concepts!.length - 1
                      ? "1px solid oklch(var(--line))" : "none",
                  }}>
                    <td style={{
                      padding: "11px 18px", width: 170, verticalAlign: "top",
                      fontWeight: 600, fontSize: 13, color: "oklch(var(--ink-1))",
                      whiteSpace: "nowrap",
                    }}>
                      {c.term}
                    </td>
                    <td style={{
                      padding: "11px 18px 11px 0", fontSize: 13,
                      color: "oklch(var(--ink-2))", lineHeight: 1.6, verticalAlign: "top",
                    }}>
                      {c.definition}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* ── Workflows ───────────────────────────────────────────────────── */}
      {article.workflows.map((wf, wi) => (
        <WorkflowSection key={wi} workflow={wf} wfIndex={wi} />
      ))}

      {/* ── FAQs ────────────────────────────────────────────────────────── */}
      {article.faqs && article.faqs.length > 0 && (
        <div className="card" style={{ marginBottom: 14 }}>
          <div className="card-head"><span className="card-h">Frequently Asked Questions</span></div>
          <div className="card-body">
            {article.faqs.map((faq, i) => (
              <div key={i} style={{
                paddingBottom: i < article.faqs!.length - 1 ? 16 : 0,
                marginBottom: i < article.faqs!.length - 1 ? 16 : 0,
                borderBottom: i < article.faqs!.length - 1 ? "1px solid oklch(var(--line))" : "none",
              }}>
                <div style={{ fontWeight: 600, fontSize: 13.5, marginBottom: 5 }}>
                  {faq.q}
                </div>
                <p style={{ fontSize: 13, color: "oklch(var(--ink-2))", lineHeight: 1.65, margin: 0 }}>
                  {faq.a}
                </p>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* ── Prev / Next navigation ───────────────────────────────────────── */}
      <div style={{
        display: "flex", gap: 10, marginTop: 24,
        paddingTop: 20, borderTop: "1px solid oklch(var(--line))",
      }}>
        {prev ? (
          <Link href={`/help/${prev.slug}`} className="btn btn-ghost btn-sm" style={{ flex: 1 }}>
            ← {prev.title}
          </Link>
        ) : <div style={{ flex: 1 }} />}
        {next ? (
          <Link href={`/help/${next.slug}`} className="btn btn-ghost btn-sm"
            style={{ flex: 1, justifyContent: "flex-end" }}>
            {next.title} →
          </Link>
        ) : <div style={{ flex: 1 }} />}
      </div>

    </div>
  );
}
