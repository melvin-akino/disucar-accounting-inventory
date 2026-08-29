"use client";

import Link from "next/link";

interface HelpButtonProps {
  slug: string;
  label?: string;
}

export function HelpButton({ slug, label }: HelpButtonProps) {
  return (
    <Link
      href={`/help/${slug}`}
      title={label ?? "Help article"}
      style={{
        display: "inline-flex",
        alignItems: "center",
        justifyContent: "center",
        width: 26,
        height: 26,
        borderRadius: "50%",
        background: "oklch(var(--bg-2))",
        border: "1px solid oklch(var(--line))",
        color: "oklch(var(--ink-3))",
        fontSize: 12,
        fontWeight: 700,
        textDecoration: "none",
        flexShrink: 0,
        transition: "background 0.15s, color 0.15s",
      }}
      onMouseEnter={(e) => {
        (e.currentTarget as HTMLAnchorElement).style.background = "oklch(var(--accent) / 0.1)";
        (e.currentTarget as HTMLAnchorElement).style.color = "oklch(var(--accent))";
        (e.currentTarget as HTMLAnchorElement).style.borderColor = "oklch(var(--accent) / 0.3)";
      }}
      onMouseLeave={(e) => {
        (e.currentTarget as HTMLAnchorElement).style.background = "oklch(var(--bg-2))";
        (e.currentTarget as HTMLAnchorElement).style.color = "oklch(var(--ink-3))";
        (e.currentTarget as HTMLAnchorElement).style.borderColor = "oklch(var(--line))";
      }}
    >
      ?
    </Link>
  );
}
