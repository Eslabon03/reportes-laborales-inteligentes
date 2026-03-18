import type { ReactNode } from "react";

export type StatusPillTone = "slate" | "amber" | "rose" | "emerald" | "teal";

const toneStyles: Record<StatusPillTone, string> = {
  slate: "border-slate-300/80 bg-slate-100 text-slate-800",
  amber: "border-amber-300/80 bg-amber-100 text-amber-900",
  rose: "border-rose-300/80 bg-rose-100 text-rose-900",
  emerald: "border-emerald-300/80 bg-emerald-100 text-emerald-900",
  teal: "border-teal-300/80 bg-teal-100 text-teal-900",
};

type StatusPillProps = {
  children: ReactNode;
  tone?: StatusPillTone;
};

export function StatusPill({ children, tone = "slate" }: StatusPillProps) {
  return (
    <span
      className={[
        "inline-flex items-center rounded-full border px-3 py-1 text-xs font-semibold uppercase tracking-[0.18em]",
        toneStyles[tone],
      ].join(" ")}
    >
      {children}
    </span>
  );
}