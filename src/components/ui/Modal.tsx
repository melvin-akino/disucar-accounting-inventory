"use client";

import { useEffect, useRef } from "react";
import { cn } from "@/lib/utils";

interface Props {
  open: boolean;
  onClose: () => void;
  title?: string;
  children: React.ReactNode;
  className?: string;
}

export function Modal({ open, onClose, title, children, className }: Props) {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const down = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    document.addEventListener("keydown", down);
    return () => document.removeEventListener("keydown", down);
  }, [open, onClose]);

  if (!open) return null;

  return (
    <>
      <div className="scrim" onClick={onClose} aria-hidden />
      <div ref={ref} role="dialog" aria-modal className={cn("modal", className)}>
        {title && (
          <div className="card-head">
            <h2 className="card-h flex-1">{title}</h2>
            <button onClick={onClose} className="btn btn-ghost btn-sm">✕</button>
          </div>
        )}
        {children}
      </div>
    </>
  );
}
