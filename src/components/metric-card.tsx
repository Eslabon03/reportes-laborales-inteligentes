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
  onClick?: () => void;
  isActive?: boolean;
};

export function MetricCard({
  label,
  value,
  detail,
  tone = "slate",
  onClick,
  isActive = false,
}: MetricCardProps) {
  const sharedClassName = [
    "rounded-[26px] border p-5 text-left shadow-[var(--shadow-panel)] backdrop-blur",
    toneStyles[tone],
    isActive ? "ring-2 ring-slate-400/70" : "",
  ].join(" ");

  const content = (
    <>
      <p className="font-mono text-[11px] uppercase tracking-[0.24em] opacity-70">
        {label}
      </p>
      <p className="mt-4 text-4xl font-semibold tracking-tight">{value}</p>
      <p className="mt-2 text-sm leading-6 opacity-75">{detail}</p>
    </>
  );

  if (onClick) {
    return (
      <button
        type="button"
        onClick={onClick}
        className={`${sharedClassName} transition hover:-translate-y-0.5 hover:border-slate-400`}
      >
        {content}
      </button>
    );
  }

  return (
    <div className={sharedClassName}>
      {content}
    </div>
  );
}