import type { ReactNode } from "react";

type SectionShellProps = {
  eyebrow?: string;
  title?: string;
  description?: string;
  className?: string;
  children: ReactNode;
};

export function SectionShell({
  eyebrow,
  title,
  description,
  className,
  children,
}: SectionShellProps) {
  return (
    <section
      className={[
        "rounded-[30px] border border-slate-900/10 bg-white/80 p-6 shadow-[var(--shadow-panel)] backdrop-blur-xl sm:p-8",
        className ?? "",
      ].join(" ")}
    >
      {eyebrow ? (
        <p className="font-mono text-xs uppercase tracking-[0.28em] text-slate-500">
          {eyebrow}
        </p>
      ) : null}
      {title ? (
        <h2 className="mt-4 text-2xl font-semibold tracking-tight text-inherit">
          {title}
        </h2>
      ) : null}
      {description ? (
        <p className="mt-3 max-w-3xl text-sm leading-7 text-slate-600">
          {description}
        </p>
      ) : null}
      <div className={title || eyebrow || description ? "mt-6" : ""}>{children}</div>
    </section>
  );
}