import { cn } from "@/lib/utils";
import { STATE_LABEL } from "@/types";
import type { OrderState } from "@prisma/client";

interface Props {
  state: OrderState | "CANCELLED";
  className?: string;
}

export function StatePill({ state, className }: Props) {
  const label =
    (STATE_LABEL as Record<string, string>)[state] ??
    state;

  return (
    <span className={cn("pill", `pill-${state}`, className)}>
      {label}
    </span>
  );
}
