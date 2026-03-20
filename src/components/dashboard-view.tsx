"use client";

import { type ReactNode, useMemo, useState, useTransition } from "react";

import { AiSummaryPanel } from "@/components/ai-summary-panel";
import { MetricCard } from "@/components/metric-card";
import { SectionShell } from "@/components/section-shell";
import { StatusPill } from "@/components/status-pill";
import {
  assignFollowupToUser,
  completePending,
  fetchDashboardSnapshot,
  updateWorkReportStatus,
  type CompletedPendingRecord,
  type FollowupAssignmentRecord,
  type PendingType,
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
  initialCompletedPendings: CompletedPendingRecord[];
  initialFollowupAssignments: FollowupAssignmentRecord[];
  assignableUsers: AssignableUser[];
};

type AssignableUser = {
  id: number;
  name: string;
  email: string;
  role: "admin" | "employee";
};

type MetricSection = "openReports" | "quotes" | "invoices" | "followups";

type PendingListProps = {
  sectionId?: string;
  title: string;
  description: string;
  items: PendingItem[];
  emptyMessage: string;
  pillTone: "amber" | "teal" | "slate";
  renderActions?: (item: PendingItem) => ReactNode;
};

const PENDING_TYPE_LABELS: Record<PendingType, string> = {
  quote: "Cotizacion",
  invoice: "Facturacion",
  followup: "Seguimiento",
};

function toPendingKey(reportId: string | number, pendingType: PendingType): string {
  return `${reportId}-${pendingType}`;
}

function formatTimestamp(value: string): string {
  const normalized = value.includes("T") ? value : `${value.replace(" ", "T")}Z`;
  const date = new Date(normalized);

  if (Number.isNaN(date.getTime())) {
    return value;
  }

  const months = ["ene", "feb", "mar", "abr", "may", "jun", "jul", "ago", "sep", "oct", "nov", "dic"];
  const day = date.getDate();
  const month = months[date.getMonth()];
  const year = date.getFullYear();
  const hours = String(date.getHours()).padStart(2, "0");
  const mins = String(date.getMinutes()).padStart(2, "0");

  return `${day} ${month} ${year} · ${hours}:${mins}`;
}

function normalizePersonValue(value: string): string {
  return value
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .replace(/\s+/g, " ")
    .trim()
    .toLowerCase();
}

function resolveAssigneeByText(
  typedName: string,
  users: AssignableUser[],
): AssignableUser | undefined {
  const normalizedInput = normalizePersonValue(typedName);

  if (!normalizedInput) {
    return undefined;
  }

  const exactMatch = users.find((user) => {
    return (
      normalizePersonValue(user.name) === normalizedInput
      || normalizePersonValue(user.email) === normalizedInput
    );
  });

  if (exactMatch) {
    return exactMatch;
  }

  const startsWithMatches = users.filter((user) => {
    return normalizePersonValue(user.name).startsWith(normalizedInput);
  });

  if (startsWithMatches.length === 1) {
    return startsWithMatches[0];
  }

  const containsMatches = users.filter((user) => {
    return normalizePersonValue(user.name).includes(normalizedInput);
  });

  if (containsMatches.length === 1) {
    return containsMatches[0];
  }

  return undefined;
}

function PendingList({
  sectionId,
  title,
  description,
  items,
  emptyMessage,
  pillTone,
  renderActions,
}: PendingListProps) {
  return (
    <div id={sectionId}>
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
                {renderActions ? <div className="mt-4">{renderActions(item)}</div> : null}
              </article>
            ))}
          </div>
        )}
      </SectionShell>
    </div>
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

export function DashboardView({
  initialSnapshot,
  isOwner,
  initialCompletedPendings,
  initialFollowupAssignments,
  assignableUsers,
}: DashboardViewProps) {
  const [snapshot, setSnapshot] = useState(initialSnapshot);
  const [completedPendings, setCompletedPendings] = useState(initialCompletedPendings);
  const [followupAssignments, setFollowupAssignments] = useState(initialFollowupAssignments);
  const [assignmentInputs, setAssignmentInputs] = useState<Record<string, string>>({});
  const [selectedMetric, setSelectedMetric] = useState<MetricSection | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();
  const [updatingReportId, setUpdatingReportId] = useState<string | null>(null);
  const [completingKey, setCompletingKey] = useState<string | null>(null);
  const [assigningReportId, setAssigningReportId] = useState<string | null>(null);

  const reportStatusOptions: ReportStatus[] = [
    "abierto",
    "en-proceso",
    "resuelto",
  ];

  const completedPendingKeys = useMemo(() => {
    return new Set(
      completedPendings.map((entry) => toPendingKey(entry.reportId, entry.pendingType)),
    );
  }, [completedPendings]);

  const visiblePendingQuotes = useMemo(
    () =>
      snapshot.pendingQuotes.filter(
        (item) => !completedPendingKeys.has(toPendingKey(item.reportId, "quote")),
      ),
    [snapshot.pendingQuotes, completedPendingKeys],
  );

  const visiblePendingInvoices = useMemo(
    () =>
      snapshot.pendingInvoices.filter(
        (item) => !completedPendingKeys.has(toPendingKey(item.reportId, "invoice")),
      ),
    [snapshot.pendingInvoices, completedPendingKeys],
  );

  const visibleFollowUps = useMemo(
    () =>
      snapshot.followUps.filter(
        (item) => !completedPendingKeys.has(toPendingKey(item.reportId, "followup")),
      ),
    [snapshot.followUps, completedPendingKeys],
  );

  const latestAssignmentsByReportId = useMemo(() => {
    const byReportId = new Map<number, FollowupAssignmentRecord>();

    for (const assignment of followupAssignments) {
      if (!byReportId.has(assignment.reportId)) {
        byReportId.set(assignment.reportId, assignment);
      }
    }

    return byReportId;
  }, [followupAssignments]);

  async function refreshDashboard() {
    try {
      const nextSnapshot = await fetchDashboardSnapshot();

      startTransition(() => {
        setSnapshot(nextSnapshot);
        setError(null);
        setSuccess(null);
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
    setSuccess(null);

    try {
      const nextSnapshot = await updateWorkReportStatus(reportId, nextStatus);

      startTransition(() => {
        setSnapshot(nextSnapshot);
        setSuccess("Estado del reporte actualizado.");
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

  function focusSection(metric: MetricSection, sectionId: string) {
    setSelectedMetric(metric);
    const target = document.getElementById(sectionId);

    if (!target) {
      return;
    }

    target.scrollIntoView({ behavior: "smooth", block: "start" });
  }

  async function handleCompletePending(item: PendingItem, pendingType: PendingType) {
    setError(null);
    setSuccess(null);

    const itemKey = toPendingKey(item.reportId, pendingType);
    setCompletingKey(itemKey);

    try {
      const completedPending = await completePending({
        reportId: item.reportId,
        pendingType,
        clientName: item.clientName,
        employeeName: item.employeeName,
        reason: item.reason,
      });

      startTransition(() => {
        setCompletedPendings((prev) => [
          completedPending,
          ...prev.filter((entry) => entry.id !== completedPending.id),
        ]);
        setSuccess(`Pendiente de ${PENDING_TYPE_LABELS[pendingType].toLowerCase()} finalizado.`);
      });
    } catch (completeError) {
      setError(
        completeError instanceof Error
          ? completeError.message
          : "No fue posible completar el pendiente.",
      );
    } finally {
      setCompletingKey(null);
    }
  }

  async function handleAssignFollowup(item: PendingItem) {
    setError(null);
    setSuccess(null);

    const assigneeName = assignmentInputs[item.reportId]?.trim() ?? "";

    if (!assigneeName) {
      setError("Escribe el nombre del colaborador al que asignarás el seguimiento.");
      return;
    }

    const assignedUser = resolveAssigneeByText(assigneeName, assignableUsers);

    setAssigningReportId(item.reportId);

    try {
      const assignment = await assignFollowupToUser({
        reportId: item.reportId,
        assignedToUserId: assignedUser?.id,
        assignedToName: assigneeName,
        clientName: item.clientName,
        reason: item.reason,
      });

      startTransition(() => {
        setFollowupAssignments((prev) => [assignment, ...prev]);
        setAssignmentInputs((prev) => ({
          ...prev,
          [item.reportId]: "",
        }));
        setSuccess(`Seguimiento asignado a ${assignment.assignedToName}.`);
      });
    } catch (assignError) {
      setError(
        assignError instanceof Error
          ? assignError.message
          : "No fue posible guardar la asignación.",
      );
    } finally {
      setAssigningReportId(null);
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
        {success ? (
          <div className="mt-4 rounded-2xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-900">
            {success}
          </div>
        ) : null}
      </SectionShell>

      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        <MetricCard
          label="Reportes abiertos"
          value={snapshot.totals.openReports}
          detail="Casos sin resolver"
          tone="slate"
          isActive={selectedMetric === "openReports"}
          onClick={() => focusSection("openReports", "section-open-reports")}
        />
        <MetricCard
          label="Cotizaciones"
          value={visiblePendingQuotes.length}
          detail="Pendientes por valorar"
          tone="amber"
          isActive={selectedMetric === "quotes"}
          onClick={() => focusSection("quotes", "section-quotes")}
        />
        <MetricCard
          label="Facturacion"
          value={visiblePendingInvoices.length}
          detail="Servicios por cobrar"
          tone="teal"
          isActive={selectedMetric === "invoices"}
          onClick={() => focusSection("invoices", "section-invoices")}
        />
        <MetricCard
          label="Seguimientos"
          value={visibleFollowUps.length}
          detail="Llamadas, visitas o confirmaciones"
          tone="slate"
          isActive={selectedMetric === "followups"}
          onClick={() => focusSection("followups", "section-followups")}
        />
      </div>

      <div className="grid gap-6 xl:grid-cols-3">
        <PendingList
          sectionId="section-quotes"
          title="Pendientes de cotizacion"
          description="Reportes donde el tecnico marco una propuesta economica o el texto indica necesidad de cotizar."
          items={visiblePendingQuotes}
          emptyMessage="No hay cotizaciones pendientes en este momento."
          pillTone="amber"
          renderActions={(item) => {
            const itemKey = toPendingKey(item.reportId, "quote");
            const isCompleting = completingKey === itemKey;

            return (
              <div className="flex justify-end">
                <button
                  type="button"
                  onClick={() => {
                    void handleCompletePending(item, "quote");
                  }}
                  disabled={isCompleting}
                  className="rounded-full border border-emerald-300 bg-emerald-100 px-4 py-2 text-xs font-semibold uppercase tracking-[0.14em] text-emerald-900 transition hover:border-emerald-500 hover:bg-emerald-200 disabled:cursor-not-allowed disabled:opacity-60"
                >
                  {isCompleting ? "Finalizando..." : "Finalizado"}
                </button>
              </div>
            );
          }}
        />

        <PendingList
          sectionId="section-invoices"
          title="Pendientes de facturacion"
          description="Casos listos para cobro o donde el reporte menciona factura, pago o cobro."
          items={visiblePendingInvoices}
          emptyMessage="No hay servicios pendientes de facturar."
          pillTone="teal"
          renderActions={(item) => {
            const itemKey = toPendingKey(item.reportId, "invoice");
            const isCompleting = completingKey === itemKey;

            return (
              <div className="flex justify-end">
                <button
                  type="button"
                  onClick={() => {
                    void handleCompletePending(item, "invoice");
                  }}
                  disabled={isCompleting}
                  className="rounded-full border border-emerald-300 bg-emerald-100 px-4 py-2 text-xs font-semibold uppercase tracking-[0.14em] text-emerald-900 transition hover:border-emerald-500 hover:bg-emerald-200 disabled:cursor-not-allowed disabled:opacity-60"
                >
                  {isCompleting ? "Finalizando..." : "Finalizado"}
                </button>
              </div>
            );
          }}
        />

        <PendingList
          sectionId="section-followups"
          title="Seguimientos operativos"
          description="Casos que requieren regreso, llamada, confirmacion o revision posterior."
          items={visibleFollowUps}
          emptyMessage="No hay seguimientos abiertos."
          pillTone="slate"
          renderActions={(item) => {
            const reportId = Number.parseInt(item.reportId, 10);
            const latestAssignment = Number.isInteger(reportId)
              ? latestAssignmentsByReportId.get(reportId)
              : undefined;
            const itemKey = toPendingKey(item.reportId, "followup");
            const isCompleting = completingKey === itemKey;
            const isAssigning = assigningReportId === item.reportId;

            return (
              <div className="space-y-3">
                {latestAssignment ? (
                  <p className="text-xs font-semibold uppercase tracking-[0.14em] text-slate-500">
                    Asignado a {latestAssignment.assignedToName} · {formatTimestamp(latestAssignment.createdAt)}
                  </p>
                ) : null}

                <div className="flex flex-col gap-2">
                  <label className="text-xs font-semibold uppercase tracking-[0.14em] text-slate-500">
                    Asignar seguimiento
                  </label>
                  <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
                    <input
                      type="text"
                      list={`followup-assignees-${item.reportId}`}
                      value={assignmentInputs[item.reportId] ?? ""}
                      onChange={(event) => {
                        const nextValue = event.target.value;
                        setAssignmentInputs((prev) => ({
                          ...prev,
                          [item.reportId]: nextValue,
                        }));
                      }}
                      placeholder="Escribe nombre del responsable"
                      className="w-full rounded-full border border-slate-300 bg-white px-4 py-2 text-sm text-slate-900 outline-none transition focus:border-slate-500"
                    />
                    <datalist id={`followup-assignees-${item.reportId}`}>
                      {assignableUsers.map((user) => (
                        <option key={user.id} value={user.name} />
                      ))}
                    </datalist>

                    <button
                      type="button"
                      onClick={() => {
                        void handleAssignFollowup(item);
                      }}
                      disabled={isAssigning}
                      className="rounded-full border border-slate-300 bg-white px-4 py-2 text-xs font-semibold uppercase tracking-[0.14em] text-slate-800 transition hover:border-slate-500 hover:bg-slate-100 disabled:cursor-not-allowed disabled:opacity-60"
                    >
                      {isAssigning ? "Asignando..." : "Asignar"}
                    </button>

                    <button
                      type="button"
                      onClick={() => {
                        void handleCompletePending(item, "followup");
                      }}
                      disabled={isCompleting}
                      className="rounded-full border border-emerald-300 bg-emerald-100 px-4 py-2 text-xs font-semibold uppercase tracking-[0.14em] text-emerald-900 transition hover:border-emerald-500 hover:bg-emerald-200 disabled:cursor-not-allowed disabled:opacity-60"
                    >
                      {isCompleting ? "Finalizando..." : "Finalizado"}
                    </button>
                  </div>
                </div>
              </div>
            );
          }}
        />
      </div>

      <div className="grid gap-6 xl:grid-cols-2">
        <SectionShell
          title="Historial de pendientes finalizados"
          description="Registro reciente de cotizaciones, facturaciones y seguimientos marcados como atendidos."
        >
          {completedPendings.length === 0 ? (
            <p className="rounded-2xl border border-dashed border-slate-300 px-4 py-5 text-sm text-slate-600">
              Aún no hay pendientes finalizados.
            </p>
          ) : (
            <div className="space-y-3">
              {completedPendings.slice(0, 8).map((entry) => (
                <article
                  key={`${entry.id}-${entry.reportId}`}
                  className="rounded-[24px] border border-slate-900/10 bg-slate-50/90 p-4"
                >
                  <div className="flex flex-wrap items-center justify-between gap-3">
                    <div>
                      <h3 className="text-base font-semibold text-slate-950">
                        {entry.clientName}
                      </h3>
                      <p className="text-sm text-slate-600">{entry.employeeName}</p>
                    </div>
                    <StatusPill tone="emerald">{PENDING_TYPE_LABELS[entry.pendingType]}</StatusPill>
                  </div>
                  <p className="mt-3 text-sm leading-7 text-slate-700">{entry.reason}</p>
                  <p className="mt-3 text-xs uppercase tracking-[0.2em] text-slate-500">
                    Finalizado por {entry.completedByName} · {formatTimestamp(entry.completedAt)}
                  </p>
                </article>
              ))}
            </div>
          )}
        </SectionShell>

        <SectionShell
          title="Asignaciones de seguimientos"
          description="Ultimas asignaciones para coordinar llamadas, visitas y confirmaciones en campo."
        >
          {followupAssignments.length === 0 ? (
            <p className="rounded-2xl border border-dashed border-slate-300 px-4 py-5 text-sm text-slate-600">
              Aún no hay seguimientos asignados.
            </p>
          ) : (
            <div className="space-y-3">
              {followupAssignments.slice(0, 8).map((assignment) => (
                <article
                  key={assignment.id}
                  className="rounded-[24px] border border-slate-900/10 bg-slate-50/90 p-4"
                >
                  <div className="flex flex-wrap items-center justify-between gap-3">
                    <div>
                      <h3 className="text-base font-semibold text-slate-950">
                        {assignment.clientName}
                      </h3>
                      <p className="text-sm text-slate-600">
                        Responsable: {assignment.assignedToName}
                      </p>
                    </div>
                    <StatusPill tone="slate">Reporte #{assignment.reportId}</StatusPill>
                  </div>
                  <p className="mt-3 text-sm leading-7 text-slate-700">{assignment.reason}</p>
                  <p className="mt-3 text-xs uppercase tracking-[0.2em] text-slate-500">
                    Asignado por {assignment.createdByName} · {formatTimestamp(assignment.createdAt)}
                  </p>
                </article>
              ))}
            </div>
          )}
        </SectionShell>
      </div>

      <RecurringFailureList items={snapshot.recurringClientFailures} />

      <AiSummaryPanel />

      <div id="section-open-reports">
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
    </div>
  );
}
