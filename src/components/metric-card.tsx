type MetricCardTone = "amber" | "teal" | "slate";

const toneStyles: Record<MetricCardTone, string> = {
  amber: "border-amber-300/70 bg-amber-100/85 text-amber-950",
  teal: "border-teal-300/70 bg-teal-100/85 text-teal-950",
  slate: "border-slate-300/70 bg-white/85 text-slate-950",
};

type MetricCardProps = {
  label: string;
  value: number | string;
  detail: string;
  tone?: MetricCardTone;
};

export function MetricCard({
  label,
  value,
  detail,
  tone = "slate",
}: MetricCardProps) {
  return (
    <div
      className={[
        "rounded-[26px] border p-5 shadow-[var(--shadow-panel)] backdrop-blur",
        toneStyles[tone],
      ].join(" ")}
    >
      <p className="font-mono text-[11px] uppercase tracking-[0.24em] opacity-70">
        {label}
      </p>
      <p className="mt-4 text-4xl font-semibold tracking-tight">{value}</p>
      <p className="mt-2 text-sm leading-6 opacity-75">{detail}</p>
    </div>
  );
}