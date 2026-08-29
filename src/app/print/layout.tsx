import type { Metadata } from "next";

export const metadata: Metadata = { title: "Print" };

export default function PrintLayout({ children }: { children: React.ReactNode }) {
  return (
    <div style={{ background: "white", color: "#111", minHeight: "100vh" }}>
      {children}
    </div>
  );
}
