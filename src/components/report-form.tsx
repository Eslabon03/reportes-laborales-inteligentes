"use client";

import type { FormEvent } from "react";
import { useState, useTransition } from "react";

import { MetricCard } from "@/components/metric-card";
import { SectionShell } from "@/components/section-shell";
import { StatusPill } from "@/components/status-pill";
import type { SessionUser } from "@/lib/db";
import { submitWorkReport } from "@/lib/report-service";
import {
  formatDisplayDate,
  getStatusTone,
  type AnalysisSnapshot,
  type WorkReportInput,
} from "@/lib/reports";

type ReportFormProps = {
  initialSnapshot: AnalysisSnapshot;
  currentUser: SessionUser;
};

const QUICK_MODE_DEFAULT_CLIENT = "Área administrativa";
const QUICK_MODE_DEFAULT_SITE = "Gestión administrativa";
const QUICK_MODE_DEFAULT_SUMMARY = "Registro administrativo";

const QUICK_MODE_QUOTE_PATTERN = /(cotiz|presupuest|quote|precio|propuesta)/i;
const QUICK_MODE_INVOICE_PATTERN = /(factur|cobro|invoice|pago|orden de compra)/i;
const QUICK_MODE_FOLLOWUP_PATTERN = /(seguimiento|llamar|visita|agendar|confirmar|revisar|pendiente)/i;

function buildInitialForm(employeeName: string): WorkReportInput {
  return {
    employeeName,
    clientName: "",
    site: "",
    serviceDate: new Date().toISOString().slice(0, 10),
    summary: "",
    tasksPerformed: "",
    pendingActions: "",
    status: "abierto",
    requiresQuote: false,
    requiresInvoice: false,
    followUpRequired: true,
    failureType: "",
  };
}

function inferAdministrativeFlags(sourceText: string): Pick<
  WorkReportInput,
  "requiresQuote" | "requiresInvoice" | "followUpRequired"
> {
  const normalized = sourceText.trim();

  const requiresQuote = QUICK_MODE_QUOTE_PATTERN.test(normalized);
  const requiresInvoice = QUICK_MODE_INVOICE_PATTERN.test(normalized);
  const followUpRequired =
    QUICK_MODE_FOLLOWUP_PATTERN.test(normalized)
    || (!requiresQuote && !requiresInvoice);

  return {
    requiresQuote,
    requiresInvoice,
    followUpRequired,
  };
}

function buildAdministrativeQuickPayload(form: WorkReportInput): WorkReportInput {
  const tasksPerformed = form.tasksPerformed.trim();
  const pendingActions = form.pendingActions.trim();
  const contextText = `${tasksPerformed} ${pendingActions}`.trim();
  const inferredFlags = inferAdministrativeFlags(contextText);

  return {
    ...form,
    clientName: form.clientName.trim() || QUICK_MODE_DEFAULT_CLIENT,
    site: form.site.trim() || QUICK_MODE_DEFAULT_SITE,
    serviceDate: form.serviceDate || new Date().toISOString().slice(0, 10),
    summary: form.summary.trim() || contextText || QUICK_MODE_DEFAULT_SUMMARY,
    status: "abierto",
    requiresQuote: inferredFlags.requiresQuote,
    requiresInvoice: inferredFlags.requiresInvoice,
    followUpRequired: inferredFlags.followUpRequired,
    failureType: form.failureType.trim(),
  };
}

export function ReportForm({ initialSnapshot, currentUser }: ReportFormProps) {
  const [form, setForm] = useState<WorkReportInput>(
    buildInitialForm(currentUser.name),
  );
  const [isAdministrativeQuickMode, setIsAdministrativeQuickMode] = useState(false);
  const [snapshot, setSnapshot] = useState(initialSnapshot);
  const [error, setError] = useState<string | null>(null);
  const [feedback, setFeedback] = useState<string | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  const [isPending, startTransition] = useTransition();

  const canUseAdministrativeQuickMode = true; // Available to all users (admin + employee)
  const isAdministrativeModeEnabled =
    canUseAdministrativeQuickMode && isAdministrativeQuickMode;

  const clientOptions = [...new Set(snapshot.reports.map((report) => report.clientName))].slice(0, 8);

  function updateField<K extends keyof WorkReportInput>(
    field: K,
    value: WorkReportInput[K],
  ) {
    setForm((current) => ({
      ...current,
      [field]: value,
    }));
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (!form.tasksPerformed.trim() || !form.pendingActions.trim()) {
      setError("Debes completar Trabajo realizado y Pendientes o siguiente acción.");
      setFeedback(null);
      return;
    }

    setIsSaving(true);
    setError(null);
    setFeedback(null);

    try {
      const payload = isAdministrativeModeEnabled
        ? buildAdministrativeQuickPayload(form)
        : form;

      const nextSnapshot = await submitWorkReport(payload);

      startTransition(() => {
        setSnapshot(nextSnapshot);
        setFeedback(
          isAdministrativeModeEnabled
            ? "Reporte administrativo enviado y agregado al analisis operativo."
            : "Reporte enviado y agregado al analisis operativo.",
        );
        setForm(buildInitialForm(currentUser.name));
      });
    } catch (submissionError) {
      setError(
        submissionError instanceof Error
          ? submissionError.message
          : "No fue posible enviar el reporte.",
      );
    } finally {
      setIsSaving(false);
    }
  }

  const isBusy = isSaving || isPending;

  return (
    <div className="grid gap-6 xl:grid-cols-[1.08fr_0.92fr]">
      <SectionShell
        eyebrow="Captura"
        title="Registrar reporte del equipo"
        description="Usa este formulario desde celular o escritorio para dejar el trabajo realizado y los siguientes pasos listos para administracion."
      >
        <form className="grid gap-5" onSubmit={handleSubmit}>
          <div className="rounded-[24px] border border-slate-900/10 bg-slate-50/90 p-4">
            <p className="text-xs font-semibold uppercase tracking-[0.2em] text-slate-500">
              Usuario autenticado
            </p>
            <p className="mt-2 text-base font-semibold text-slate-950">
              {currentUser.name}
            </p>
            <p className="text-sm text-slate-600">
              {currentUser.email} · {currentUser.role === "admin" ? "Administrador" : "Empleado"}
            </p>
          </div>

          {canUseAdministrativeQuickMode ? (
            <div className="rounded-[24px] border border-slate-900/10 bg-slate-50/90 p-4">
              <p className="text-xs font-semibold uppercase tracking-[0.2em] text-slate-500">
                Modo de captura
              </p>
              <div className="mt-3 flex flex-wrap gap-2">
                <button
                  type="button"
                  onClick={() => setIsAdministrativeQuickMode(false)}
                  className={[
                    "rounded-full border px-4 py-2 text-xs font-semibold uppercase tracking-[0.14em] transition",
                    !isAdministrativeModeEnabled
                      ? "border-slate-900 bg-slate-900 text-white"
                      : "border-slate-300 bg-white text-slate-700 hover:border-slate-900",
                  ].join(" ")}
                >
                  Técnico (completo)
                </button>
                <button
                  type="button"
                  onClick={() => setIsAdministrativeQuickMode(true)}
                  className={[
                    "rounded-full border px-4 py-2 text-xs font-semibold uppercase tracking-[0.14em] transition",
                    isAdministrativeModeEnabled
                      ? "border-slate-900 bg-slate-900 text-white"
                      : "border-slate-300 bg-white text-slate-700 hover:border-slate-900",
                  ].join(" ")}
                >
                  Administrativo (rápido)
                </button>
              </div>
              <p className="mt-3 text-sm text-slate-600">
                {isAdministrativeModeEnabled
                  ? "Solo se capturan Trabajo realizado y Pendientes o siguiente acción."
                  : "Modo completo para técnicos: captura todos los campos del reporte."}
              </p>
            </div>
          ) : null}

          <div className="grid gap-5 md:grid-cols-2">
            <label className="grid gap-2 text-sm font-medium text-slate-700">
              Cliente
              <input
                list="client-options"
                value={form.clientName}
                onChange={(event) => updateField("clientName", event.target.value)}
                disabled={isAdministrativeModeEnabled}
                className="rounded-2xl border border-slate-900/10 bg-white px-4 py-3 text-sm text-slate-950 outline-none transition focus:border-slate-950 disabled:cursor-not-allowed disabled:opacity-60"
                placeholder="Nombre del cliente"
              />
            </label>

            <label className="grid gap-2 text-sm font-medium text-slate-700">
              Sitio
              <input
                value={form.site}
                onChange={(event) => updateField("site", event.target.value)}
                disabled={isAdministrativeModeEnabled}
                className="rounded-2xl border border-slate-900/10 bg-white px-4 py-3 text-sm text-slate-950 outline-none transition focus:border-slate-950 disabled:cursor-not-allowed disabled:opacity-60"
                placeholder="Ciudad o planta"
              />
            </label>

            <label className="grid gap-2 text-sm font-medium text-slate-700">
              Fecha de servicio
              <input
                type="date"
                value={form.serviceDate}
                onChange={(event) => updateField("serviceDate", event.target.value)}
                disabled={isAdministrativeModeEnabled}
                className="rounded-2xl border border-slate-900/10 bg-white px-4 py-3 text-sm text-slate-950 outline-none transition focus:border-slate-950 disabled:cursor-not-allowed disabled:opacity-60"
              />
            </label>
          </div>

          <label className="grid gap-2 text-sm font-medium text-slate-700">
            Resumen del hallazgo
            <textarea
              value={form.summary}
              onChange={(event) => updateField("summary", event.target.value)}
              disabled={isAdministrativeModeEnabled}
              className="min-h-28 rounded-3xl border border-slate-900/10 bg-white px-4 py-3 text-sm text-slate-950 outline-none transition focus:border-slate-950 disabled:cursor-not-allowed disabled:opacity-60"
              placeholder="Describe la falla, el contexto del cliente o el resultado de la visita."
            />
          </label>

          <div className="grid gap-5 lg:grid-cols-2">
            <label className="grid gap-2 text-sm font-medium text-slate-700">
              Trabajo realizado
              <textarea
                value={form.tasksPerformed}
                onChange={(event) => updateField("tasksPerformed", event.target.value)}
                className="min-h-28 rounded-3xl border border-slate-900/10 bg-white px-4 py-3 text-sm text-slate-950 outline-none transition focus:border-slate-950"
                placeholder={
                  isAdministrativeModeEnabled
                    ? "Describe la gestión o acción administrativa realizada."
                    : "Que hizo el tecnico durante la visita."
                }
              />
            </label>

            <label className="grid gap-2 text-sm font-medium text-slate-700">
              Pendientes o siguiente accion
              <textarea
                value={form.pendingActions}
                onChange={(event) => updateField("pendingActions", event.target.value)}
                className="min-h-28 rounded-3xl border border-slate-900/10 bg-white px-4 py-3 text-sm text-slate-950 outline-none transition focus:border-slate-950"
                placeholder={
                  isAdministrativeModeEnabled
                    ? "Indica la siguiente acción administrativa o pendiente operativo."
                    : "Que falta: cotizar, facturar, llamar, regresar, confirmar."
                }
              />
            </label>
          </div>

          <div className="grid gap-5 md:grid-cols-[1fr_220px]">
            <label className="grid gap-2 text-sm font-medium text-slate-700">
              Tipo de falla recurrente
              <input
                value={form.failureType}
                onChange={(event) => updateField("failureType", event.target.value)}
                disabled={isAdministrativeModeEnabled}
                className="rounded-2xl border border-slate-900/10 bg-white px-4 py-3 text-sm text-slate-950 outline-none transition focus:border-slate-950 disabled:cursor-not-allowed disabled:opacity-60"
                placeholder="Ejemplo: sensor, fuga, motor"
              />
            </label>

            <label className="grid gap-2 text-sm font-medium text-slate-700">
              Estado
              <select
                value={form.status}
                onChange={(event) =>
                  updateField(
                    "status",
                    event.target.value as WorkReportInput["status"],
                  )
                }
                disabled={isAdministrativeModeEnabled}
                className="rounded-2xl border border-slate-900/10 bg-white px-4 py-3 text-sm text-slate-950 outline-none transition focus:border-slate-950 disabled:cursor-not-allowed disabled:opacity-60"
              >
                <option value="abierto">abierto</option>
                <option value="en-proceso">en-proceso</option>
                <option value="resuelto">resuelto</option>
              </select>
            </label>
          </div>

          <div className="grid gap-3 rounded-[26px] border border-slate-900/10 bg-slate-50/90 p-4 sm:grid-cols-3">
            <label className="flex items-center gap-3 text-sm font-medium text-slate-700">
              <input
                type="checkbox"
                checked={form.requiresQuote}
                disabled={isAdministrativeModeEnabled}
                onChange={(event) => updateField("requiresQuote", event.target.checked)}
              />
              Pendiente de cotizacion
            </label>
            <label className="flex items-center gap-3 text-sm font-medium text-slate-700">
              <input
                type="checkbox"
                checked={form.requiresInvoice}
                disabled={isAdministrativeModeEnabled}
                onChange={(event) => updateField("requiresInvoice", event.target.checked)}
              />
              Pendiente de facturacion
            </label>
            <label className="flex items-center gap-3 text-sm font-medium text-slate-700">
              <input
                type="checkbox"
                checked={form.followUpRequired}
                disabled={isAdministrativeModeEnabled}
                onChange={(event) =>
                  updateField("followUpRequired", event.target.checked)
                }
              />
              Requiere seguimiento
            </label>
          </div>

          {error ? (
            <div className="rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-900">
              {error}
            </div>
          ) : null}
          {feedback ? (
            <div className="rounded-2xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-900">
              {feedback}
            </div>
          ) : null}

          <button
            type="submit"
            disabled={isBusy}
            className="inline-flex items-center justify-center rounded-full bg-slate-950 px-6 py-3 text-sm font-semibold text-white transition hover:bg-slate-800 disabled:cursor-not-allowed disabled:opacity-60"
          >
            {isBusy ? "Guardando reporte..." : "Enviar y analizar reporte"}
          </button>
        </form>

        <datalist id="client-options">
          {clientOptions.map((clientName) => (
            <option key={clientName} value={clientName} />
          ))}
        </datalist>
      </SectionShell>

      <div className="grid gap-6">
        <SectionShell
          eyebrow="Resultado"
          title="Vista previa del analisis"
          description="Cada nuevo reporte recalcula el tablero para que administracion vea prioridades sin esperar un corte manual."
        >
          <div className="grid gap-4 sm:grid-cols-2">
            <MetricCard
              label="Cotizaciones"
              value={snapshot.totals.quotes}
              detail="Casos abiertos por valorar"
              tone="amber"
            />
            <MetricCard
              label="Facturacion"
              value={snapshot.totals.invoices}
              detail="Servicios listos para cobrar"
              tone="teal"
            />
            <MetricCard
              label="Seguimientos"
              value={snapshot.totals.followUps}
              detail="Regresos, llamadas o confirmaciones"
              tone="slate"
            />
            <MetricCard
              label="Fallas recurrentes"
              value={snapshot.recurringClientFailures.length}
              detail="Patrones repetidos por cliente"
              tone="slate"
            />
          </div>
        </SectionShell>

        <SectionShell
          eyebrow="Lo ultimo"
          title="Reportes mas recientes"
          description="Util para confirmar que la captura quedo registrada de inmediato."
        >
          <div className="space-y-4">
            {snapshot.recentReports.slice(0, 4).map((report) => (
              <article
                key={report.id}
                className="rounded-[26px] border border-slate-900/10 bg-slate-50/90 p-4"
              >
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div>
                    <h3 className="text-base font-semibold text-slate-950">
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
                  {report.pendingActions}
                </p>
                <p className="mt-3 text-xs uppercase tracking-[0.2em] text-slate-500">
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