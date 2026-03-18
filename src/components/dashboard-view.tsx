"use client";

import { useState, useTransition } from "react";

import { AiSummaryPanel } from "@/components/ai-summary-panel";
import { MetricCard } from "@/components/metric-card";
import { SectionShell } from "@/components/section-shell";
import { StatusPill } from "@/components/status-pill";
import {
  fetchDashboardSnapshot,
  updateWorkReportStatus,
} from "@/lib/report-service";
import {
  formatDisplayDate,
  getStatusTone,
  type AnalysisSnapshot,
  type PendingItem,
  type ReportStatus,
  type RecurringClientFailure,
} from "@/lib/reports";

type DashboardViewProps = {
  initialSnapshot: AnalysisSnapshot;
  isOwner: boolean;
};

type PendingListProps = {
  title: string;
  description: string;
  items: PendingItem[];
  emptyMessage: string;
  pillTone: "amber" | "teal" | "slate";
};

function PendingList({
  title,
  description,
  items,
  emptyMessage,
  pillTone,
}: PendingListProps) {
  return (
    <SectionShell title={title} description={description}>
      {items.length === 0 ? (
        <p className="rounded-2xl border border-dashed border-slate-300 px-4 py-5 text-sm text-slate-600">
          {emptyMessage}
        </p>
      ) : (
        <div className="space-y-3">
          {items.slice(0, 5).map((item) => (
            <article
              key={item.reportId}
              className="rounded-[24px] border border-slate-900/10 bg-slate-50/90 p-4"
            >
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div>
                  <h3 className="text-base font-semibold text-slate-950">
                    {item.clientName}
                  </h3>
                  <p className="text-sm text-slate-600">
                    {item.employeeName} en {item.site}
                  </p>
                </div>
                <StatusPill tone={pillTone}>{item.status}</StatusPill>
              </div>
              <p className="mt-3 text-sm leading-7 text-slate-700">{item.reason}</p>
              <p className="mt-3 text-xs uppercase tracking-[0.2em] text-slate-500">
                {formatDisplayDate(item.serviceDate)}
              </p>
            </article>
          ))}
        </div>
      )}
    </SectionShell>
  );
}

function RecurringFailureList({
  items,
}: {
  items: RecurringClientFailure[];
}) {
  return (
    <SectionShell
      title="Fallas recurrentes por cliente"
      description="Casos repetidos que vale la pena atacar de raiz o convertir en propuesta de mejora."
    >
      {items.length === 0 ? (
        <p className="rounded-2xl border border-dashed border-slate-300 px-4 py-5 text-sm text-slate-600">
          No hay recurrencias detectadas en este momento.
        </p>
      ) : (
        <div className="space-y-4">
          {items.map((item) => (
            <article
              key={`${item.clientName}-${item.failureType}`}
              className="rounded-[24px] border border-slate-900/10 bg-slate-50/90 p-4"
            >
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div>
                  <h3 className="text-lg font-semibold text-slate-950">
                    {item.clientName}
                  </h3>
                  <p className="text-sm text-slate-600">{item.failureType}</p>
                </div>
                <StatusPill tone="rose">{item.occurrences} eventos</StatusPill>
              </div>
              <div className="mt-4 grid gap-4 sm:grid-cols-3">
                <MetricCard
                  label="Apariciones"
                  value={item.occurrences}
                  detail="Reportes relacionados"
                  tone="amber"
                />
                <MetricCard
                  label="Abiertos"
                  value={item.openReports}
                  detail="Casos aun sin cerrar"
                  tone="slate"
                />
                <MetricCard
                  label="Ultimo evento"
                  value={formatDisplayDate(item.latestReport)}
                  detail="Fecha mas reciente"
                  tone="teal"
                />
              </div>
            </article>
          ))}
        </div>
      )}
    </SectionShell>
  );
}

export function DashboardView({ initialSnapshot, isOwner }: DashboardViewProps) {
  const [snapshot, setSnapshot] = useState(initialSnapshot);
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();
  const [updatingReportId, setUpdatingReportId] = useState<string | null>(null);

  const reportStatusOptions: ReportStatus[] = [
    "abierto",
    "en-proceso",
    "resuelto",
  ];

  async function refreshDashboard() {
    try {
      const nextSnapshot = await fetchDashboardSnapshot();

      startTransition(() => {
        setSnapshot(nextSnapshot);
        setError(null);
      });
    } catch (refreshError) {
      setError(
        refreshError instanceof Error
          ? refreshError.message
          : "No fue posible actualizar el tablero.",
      );
    }
  }

  async function handleStatusUpdate(
    reportId: string,
    nextStatus: ReportStatus,
  ) {
    setUpdatingReportId(reportId);
    setError(null);

    try {
      const nextSnapshot = await updateWorkReportStatus(reportId, nextStatus);

      startTransition(() => {
        setSnapshot(nextSnapshot);
      });
    } catch (updateError) {
      setError(
        updateError instanceof Error
          ? updateError.message
          : "No fue posible actualizar el estado del reporte.",
      );
    } finally {
      setUpdatingReportId(null);
    }
  }

  return (
    <div className="space-y-6">
      <SectionShell
        eyebrow="Administracion"
        title="Tablero de pendientes y fallas recurrentes"
        description="Consulta lo que se debe cotizar, facturar o seguir en sitio desde un resumen unico."
      >
        <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
          <div>
            <p className="text-sm leading-7 text-slate-700" suppressHydrationWarning>
              Ultima actualizacion: {new Date(snapshot.generatedAt).toLocaleString("es-MX")}
            </p>
            <p className="text-sm leading-7 text-slate-600">
              {snapshot.totals.reports} reportes, {snapshot.totals.clients} clientes y {snapshot.totals.employees} empleados involucrados.
            </p>
          </div>
          <button
            type="button"
            onClick={() => {
              void refreshDashboard();
            }}
            disabled={isPending}
            className="inline-flex items-center justify-center rounded-full bg-slate-950 px-6 py-3 text-sm font-semibold text-white transition hover:bg-slate-800 disabled:cursor-not-allowed disabled:opacity-60"
          >
            {isPending ? "Actualizando..." : "Actualizar analisis"}
          </button>
        </div>
        {error ? (
          <div className="mt-4 rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-900">
            {error}
          </div>
        ) : null}
      </SectionShell>

      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        <MetricCard
          label="Reportes abiertos"
          value={snapshot.totals.openReports}
          detail="Casos sin resolver"
          tone="slate"
        />
        <MetricCard
          label="Cotizaciones"
          value={snapshot.totals.quotes}
          detail="Pendientes por valorar"
          tone="amber"
        />
        <MetricCard
          label="Facturacion"
          value={snapshot.totals.invoices}
          detail="Servicios por cobrar"
          tone="teal"
        />
        <MetricCard
          label="Seguimientos"
          value={snapshot.totals.followUps}
          detail="Llamadas, visitas o confirmaciones"
          tone="slate"
        />
      </div>

      <div className="grid gap-6 xl:grid-cols-3">
        <PendingList
          title="Pendientes de cotizacion"
          description="Reportes donde el tecnico marco una propuesta economica o el texto indica necesidad de cotizar."
          items={snapshot.pendingQuotes}
          emptyMessage="No hay cotizaciones pendientes en este momento."
          pillTone="amber"
        />
        <PendingList
          title="Pendientes de facturacion"
          description="Casos listos para cobro o donde el reporte menciona factura, pago o cobro."
          items={snapshot.pendingInvoices}
          emptyMessage="No hay servicios pendientes de facturar."
          pillTone="teal"
        />
        <PendingList
          title="Seguimientos operativos"
          description="Casos que requieren regreso, llamada, confirmacion o revision posterior."
          items={snapshot.followUps}
          emptyMessage="No hay seguimientos abiertos."
          pillTone="slate"
        />
      </div>

      <RecurringFailureList items={snapshot.recurringClientFailures} />

      <AiSummaryPanel />

      <SectionShell
        title="Bitacora reciente"
        description="Resumen de los ultimos reportes cargados para validar contexto y responsables."
      >
        <div className="grid gap-4 lg:grid-cols-2">
          {snapshot.recentReports.map((report) => (
            <article
              key={report.id}
              className="rounded-[26px] border border-slate-900/10 bg-slate-50/90 p-5"
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
              <div className="mt-4 flex flex-wrap gap-2">
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
              {isOwner ? (
                <div className="mt-4 flex flex-wrap items-center gap-2">
                  <p className="text-xs font-semibold uppercase tracking-[0.2em] text-slate-500">
                    Estado
                  </p>
                  {reportStatusOptions.map((statusOption) => {
                    const isCurrentStatus = report.status === statusOption;
                    const isUpdating = updatingReportId === report.id;

                    return (
                      <button
                        key={`${report.id}-${statusOption}`}
                        type="button"
                        onClick={() => {
                          void handleStatusUpdate(report.id, statusOption);
                        }}
                        disabled={isUpdating || isCurrentStatus}
                        className={[
                          "rounded-full border px-3 py-1.5 text-xs font-semibold uppercase tracking-[0.12em] transition disabled:cursor-not-allowed disabled:opacity-60",
                          isCurrentStatus
                            ? "border-slate-900 bg-slate-900 text-white"
                            : "border-slate-300 bg-white text-slate-700 hover:border-slate-900 hover:bg-slate-900 hover:text-white",
                        ].join(" ")}
                      >
                        {isUpdating && !isCurrentStatus ? "..." : statusOption}
                      </button>
                    );
                  })}
                </div>
              ) : null}
              <p className="mt-4 text-xs uppercase tracking-[0.2em] text-slate-500">
                {formatDisplayDate(report.serviceDate)}
              </p>
            </article>
          ))}
        </div>
      </SectionShell>
    </div>
  );
}