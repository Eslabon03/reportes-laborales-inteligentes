import Link from "next/link";

import { AppNavigation } from "@/components/app-navigation";
import { MetricCard } from "@/components/metric-card";
import { SectionShell } from "@/components/section-shell";
import { StatusPill } from "@/components/status-pill";
import { requireUser } from "@/lib/auth";
import { formatDisplayDate, getStatusTone } from "@/lib/reports";
import { getAnalysisSnapshot } from "@/lib/report-store";

export const dynamic = "force-dynamic";

export default async function Home() {
  const currentUser = await requireUser({
    loginRedirectTo: "/login?next=%2F",
  });

  const snapshot = getAnalysisSnapshot(
    currentUser.role === "admin" ? {} : { userId: currentUser.id },
  );

  return (
    <div className="min-h-screen pb-20">
      <AppNavigation currentHref="/" user={currentUser} />

      <main className="mx-auto flex max-w-7xl flex-col gap-8 px-4 py-8 sm:px-6 lg:px-8">
        <section className="grid gap-6 xl:grid-cols-[1.15fr_0.85fr]">
          <SectionShell className="border-slate-950/10 bg-slate-950 text-slate-50">
            <div className="flex flex-wrap items-center gap-3">
              <StatusPill tone="amber">Operacion de campo</StatusPill>
              <StatusPill tone="teal">Celular y computadora</StatusPill>
            </div>

            <div className="mt-6 max-w-3xl space-y-5">
              <p className="font-mono text-xs uppercase tracking-[0.3em] text-slate-300">
                Reportes listos para accion
              </p>
              <h1 className="text-4xl font-semibold tracking-tight text-white sm:text-5xl">
                Convierte reportes del equipo en pendientes de cotizacion,
                facturacion y seguimiento.
              </h1>
              <p className="max-w-2xl text-base leading-8 text-slate-300 sm:text-lg">
                {currentUser.role === "admin"
                  ? "Los empleados capturan sus actividades y tú recibes un tablero global con prioridades por cotizar, facturar y dar seguimiento."
                  : "Registra tus actividades de campo para que administración vea pendientes de cotización, facturación y seguimiento sin perder contexto."}
              </p>
            </div>

            <div className="mt-8 flex flex-col gap-3 sm:flex-row">
              <Link
                href="/reportes"
                className="inline-flex items-center justify-center rounded-full bg-[var(--color-accent)] px-6 py-3 text-sm font-semibold text-slate-950 transition hover:bg-[var(--color-accent-strong)] hover:text-white"
              >
                Capturar reporte
              </Link>
              {currentUser.role === "admin" ? (
                <Link
                  href="/dashboard"
                  className="inline-flex items-center justify-center rounded-full border border-white/20 px-6 py-3 text-sm font-semibold text-white transition hover:border-white/40 hover:bg-white/10"
                >
                  Ver tablero ejecutivo
                </Link>
              ) : (
                <span className="inline-flex items-center justify-center rounded-full border border-white/20 px-6 py-3 text-sm font-semibold text-slate-200">
                  Acceso de administrador requerido para dashboard global
                </span>
              )}
            </div>

            <div className="mt-8 grid gap-4 md:grid-cols-3">
              <MetricCard
                label="Pendientes de cotizacion"
                value={snapshot.totals.quotes}
                detail="Detectados en reportes abiertos"
                tone="amber"
              />
              <MetricCard
                label="Pendientes de facturacion"
                value={snapshot.totals.invoices}
                detail="Servicios listos para cobrar"
                tone="teal"
              />
              <MetricCard
                label="Clientes con recurrencia"
                value={snapshot.totals.recurringClients}
                detail="Fallas repetidas que requieren foco"
                tone="slate"
              />
            </div>
          </SectionShell>

          <SectionShell>
            <p className="font-mono text-xs uppercase tracking-[0.28em] text-slate-500">
              Actividad reciente
            </p>
            <h2 className="mt-4 text-2xl font-semibold text-slate-950">
              Ultimos reportes listos para revisar
            </h2>
            <div className="mt-6 space-y-4">
              {snapshot.recentReports.slice(0, 4).map((report) => (
                <article
                  key={report.id}
                  className="rounded-3xl border border-slate-900/10 bg-slate-50/90 p-4"
                >
                  <div className="flex flex-wrap items-center justify-between gap-3">
                    <div>
                      <h3 className="text-lg font-semibold text-slate-950">
                        {report.clientName}
                      </h3>
                      <p className="text-sm text-slate-600">
                        {report.employeeName} en {report.site}
                      </p>
                    </div>
                    <StatusPill tone={getStatusTone(report.status)}>
                      {report.status}
                    </StatusPill>
                  </div>
                  <p className="mt-3 text-sm leading-7 text-slate-700">
                    {report.summary}
                  </p>
                  <div className="mt-3 flex flex-wrap items-center gap-2 text-xs uppercase tracking-[0.2em] text-slate-500">
                    <span>{formatDisplayDate(report.serviceDate)}</span>
                    {report.requiresQuote ? (
                      <StatusPill tone="amber">Cotizacion</StatusPill>
                    ) : null}
                    {report.requiresInvoice ? (
                      <StatusPill tone="teal">Facturacion</StatusPill>
                    ) : null}
                    {report.followUpRequired ? (
                      <StatusPill tone="slate">Seguimiento</StatusPill>
                    ) : null}
                  </div>
                </article>
              ))}
            </div>
          </SectionShell>
        </section>

        <section className="grid gap-6 lg:grid-cols-3">
          <SectionShell>
            <p className="font-mono text-xs uppercase tracking-[0.28em] text-slate-500">
              Para empleados
            </p>
            <h2 className="mt-4 text-2xl font-semibold text-slate-950">
              Captura ordenada desde cualquier pantalla.
            </h2>
            <p className="mt-4 text-sm leading-7 text-slate-700">
              Cada tecnico puede registrar cliente, sitio, trabajo realizado,
              pendientes y si el caso requiere cotizacion, factura o seguimiento.
            </p>
          </SectionShell>

          <SectionShell>
            <p className="font-mono text-xs uppercase tracking-[0.28em] text-slate-500">
              Analisis
            </p>
            <h2 className="mt-4 text-2xl font-semibold text-slate-950">
              Clasificacion automatica de pendientes.
            </h2>
            <p className="mt-4 text-sm leading-7 text-slate-700">
              El motor del MVP identifica servicios por cotizar, actividades por
              facturar, seguimientos pendientes y patrones repetidos por cliente.
            </p>
          </SectionShell>

          <SectionShell>
            <p className="font-mono text-xs uppercase tracking-[0.28em] text-slate-500">
              Operacion
            </p>
            <h2 className="mt-4 text-2xl font-semibold text-slate-950">
              Prioridades visibles para administracion.
            </h2>
            <p className="mt-4 text-sm leading-7 text-slate-700">
              El tablero central concentra los casos abiertos para que revises
              avances desde laptop, tablet o telefono sin depender de hojas sueltas.
            </p>
          </SectionShell>
        </section>
      </main>
    </div>
  );
}
