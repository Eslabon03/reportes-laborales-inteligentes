"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import { AIConversationPanel } from "@/components/ai-conversation-panel";
import { ChatHistoryModal } from "@/components/chat-history-modal";
import { SectionShell } from "@/components/section-shell";
import { StatusPill } from "@/components/status-pill";
import type { AiPriority, AiSummary } from "@/lib/ai-analysis";
import { formatDisplayDate, getStatusTone, type WorkReport } from "@/lib/reports";

type AiHistoryItem = {
  id: number;
  generatedAt: string;
  generatedByName: string;
  sourceReportsCount: number;
  summary: AiSummary;
};

type RecommendationMatch = {
  recommendation: string;
  report: WorkReport | null;
};

const URGENCY_TONE: Record<AiPriority["urgencia"], "rose" | "amber" | "teal"> = {
  alta: "rose",
  media: "amber",
  baja: "teal",
};

const URGENCY_LABEL: Record<AiPriority["urgencia"], string> = {
  alta: "Urgente",
  media: "Media",
  baja: "Baja",
};

const QUOTE_RECOMMENDATION_PATTERN = /(cotiz|presupuest|precio|propuesta)/;
const INVOICE_RECOMMENDATION_PATTERN = /(factur|cobro|pago|invoice)/;
const FOLLOWUP_RECOMMENDATION_PATTERN = /(seguimiento|llamar|visita|confirm|revis|coordinar|agendar)/;

const RECOMMENDATION_STOP_WORDS = new Set([
  "para",
  "con",
  "del",
  "los",
  "las",
  "una",
  "uno",
  "unos",
  "unas",
  "que",
  "por",
  "como",
  "esta",
  "este",
  "estos",
  "estas",
  "debe",
  "deben",
  "sobre",
  "equipo",
  "cliente",
  "clientes",
]);

function normalizeText(value: string): string {
  return value
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

function tokenizeRecommendation(value: string): string[] {
  return normalizeText(value)
    .split(/[^a-z0-9]+/)
    .map((token) => token.trim())
    .filter((token) => token.length >= 4 && !RECOMMENDATION_STOP_WORDS.has(token));
}

function chooseReportForRecommendation(
  recommendation: string,
  reports: WorkReport[],
): WorkReport | null {
  if (reports.length === 0) {
    return null;
  }

  const recommendationText = normalizeText(recommendation);
  const recommendationTokens = tokenizeRecommendation(recommendation);

  const scored = reports
    .map((report) => {
      const reportText = normalizeText(
        [
          report.clientName,
          report.site,
          report.employeeName,
          report.summary,
          report.tasksPerformed,
          report.pendingActions,
          report.failureType,
        ].join(" "),
      );

      let score = 0;

      const normalizedClient = normalizeText(report.clientName);
      const normalizedSite = normalizeText(report.site);

      if (normalizedClient && recommendationText.includes(normalizedClient)) {
        score += 80;
      }

      if (normalizedSite && recommendationText.includes(normalizedSite)) {
        score += 35;
      }

      for (const token of recommendationTokens) {
        if (reportText.includes(token)) {
          score += 4;
        }
      }

      if (
        QUOTE_RECOMMENDATION_PATTERN.test(recommendationText)
        && report.requiresQuote
      ) {
        score += 25;
      }

      if (
        INVOICE_RECOMMENDATION_PATTERN.test(recommendationText)
        && report.requiresInvoice
      ) {
        score += 25;
      }

      if (
        FOLLOWUP_RECOMMENDATION_PATTERN.test(recommendationText)
        && report.followUpRequired
      ) {
        score += 20;
      }

      if (report.status !== "resuelto") {
        score += 2;
      }

      return { report, score };
    })
    .sort((left, right) => {
      if (right.score !== left.score) {
        return right.score - left.score;
      }

      return right.report.serviceDate.localeCompare(left.report.serviceDate);
    });

  const bestMatch = scored[0];

  if (bestMatch && bestMatch.score >= 6) {
    return bestMatch.report;
  }

  if (QUOTE_RECOMMENDATION_PATTERN.test(recommendationText)) {
    return (
      reports.find((report) => report.status !== "resuelto" && report.requiresQuote)
      ?? bestMatch?.report
      ?? null
    );
  }

  if (INVOICE_RECOMMENDATION_PATTERN.test(recommendationText)) {
    return (
      reports.find((report) => report.status !== "resuelto" && report.requiresInvoice)
      ?? bestMatch?.report
      ?? null
    );
  }

  if (FOLLOWUP_RECOMMENDATION_PATTERN.test(recommendationText)) {
    return (
      reports.find((report) => report.status !== "resuelto" && report.followUpRequired)
      ?? bestMatch?.report
      ?? null
    );
  }

  return reports.find((report) => report.status !== "resuelto") ?? bestMatch?.report ?? null;
}

function formatTimestamp(value: string): string {
  const normalized = value.includes("T") ? value : `${value.replace(" ", "T")}Z`;
  const d = new Date(normalized);

  if (Number.isNaN(d.getTime())) {
    return value;
  }

  const months = ["ene", "feb", "mar", "abr", "may", "jun", "jul", "ago", "sep", "oct", "nov", "dic"];
  const day = d.getDate();
  const month = months[d.getMonth()];
  const year = d.getFullYear();
  const hours = String(d.getHours()).padStart(2, "0");
  const mins = String(d.getMinutes()).padStart(2, "0");
  return `${day} ${month} ${year} · ${hours}:${mins}`;
}

function AnalysisContent({
  summary,
  recommendationMatches,
  onRecommendationClick,
}: {
  summary: AiSummary;
  recommendationMatches: RecommendationMatch[];
  onRecommendationClick: (match: RecommendationMatch) => void;
}) {
  return (
    <div className="space-y-5">
      <div className="rounded-[24px] border border-slate-900/10 bg-slate-950 p-5 text-white">
        <p className="text-xs font-semibold uppercase tracking-[0.2em] text-slate-400">
          Resumen ejecutivo
        </p>
        <p className="mt-2 text-sm leading-7">{summary.resumen}</p>
      </div>

      <div className="grid gap-5 lg:grid-cols-2">
        <div className="space-y-3">
          <h3 className="text-sm font-semibold uppercase tracking-wide text-slate-500">
            Prioridades detectadas
          </h3>
          {summary.prioridades.length === 0 ? (
            <p className="text-sm text-slate-400">No se detectaron prioridades críticas.</p>
          ) : (
            summary.prioridades.map((priority, index) => (
              <div
                key={`${priority.cliente}-${index}`}
                className="rounded-[20px] border border-slate-900/10 bg-slate-50/90 p-4"
              >
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <p className="font-semibold text-slate-950">{priority.cliente}</p>
                  <StatusPill tone={URGENCY_TONE[priority.urgencia]}>
                    {URGENCY_LABEL[priority.urgencia]}
                  </StatusPill>
                </div>
                <p className="mt-1.5 text-sm text-slate-600">{priority.descripcion}</p>
              </div>
            ))
          )}
        </div>

        <div className="space-y-5">
          <div>
            <h3 className="mb-3 text-sm font-semibold uppercase tracking-wide text-slate-500">
              Acciones recomendadas
            </h3>
            {recommendationMatches.length === 0 ? (
              <p className="text-sm text-slate-400">Sin recomendaciones adicionales.</p>
            ) : (
              <ul className="space-y-2">
                {recommendationMatches.map((match, index) => (
                  <li
                    key={`${match.recommendation}-${index}`}
                  >
                    <button
                      type="button"
                      onClick={() => onRecommendationClick(match)}
                      className="flex w-full gap-3 rounded-xl bg-emerald-50 px-4 py-3 text-left text-sm text-emerald-900 transition hover:bg-emerald-100"
                    >
                      <span className="mt-0.5 shrink-0 text-emerald-500">✓</span>
                      <span>
                        <span>{match.recommendation}</span>
                        {match.report ? (
                          <span className="mt-1 block text-xs font-semibold uppercase tracking-[0.12em] text-emerald-800">
                            Ver reporte: {match.report.clientName}
                          </span>
                        ) : null}
                      </span>
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>

          {summary.riesgos.length > 0 && (
            <div>
              <h3 className="mb-3 text-sm font-semibold uppercase tracking-wide text-slate-500">
                Riesgos identificados
              </h3>
              <ul className="space-y-2">
                {summary.riesgos.map((risk, index) => (
                  <li
                    key={`${risk}-${index}`}
                    className="flex gap-3 rounded-xl bg-amber-50 px-4 py-3 text-sm text-amber-900"
                  >
                    <span className="mt-0.5 shrink-0">⚠</span>
                    {risk}
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

export function AiSummaryPanel({ reports = [] }: { reports?: WorkReport[] }) {
  const [history, setHistory] = useState<AiHistoryItem[]>([]);
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [isLoadingHistory, setIsLoadingHistory] = useState(true);
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isHistoryModalOpen, setIsHistoryModalOpen] = useState(false);
  const [selectedRecommendationReport, setSelectedRecommendationReport] = useState<WorkReport | null>(null);
  const recommendationContextRef = useRef<HTMLDivElement>(null);

  const selectedAnalysis = history.find((item) => item.id === selectedId) ?? history[0] ?? null;
  const selectedAnalysisId = selectedAnalysis?.id ?? null;

  const recommendationMatches = useMemo(() => {
    if (!selectedAnalysis) {
      return [] as RecommendationMatch[];
    }

    return selectedAnalysis.summary.recomendaciones.map((recommendation) => ({
      recommendation,
      report: chooseReportForRecommendation(recommendation, reports),
    }));
  }, [selectedAnalysis, reports]);

  useEffect(() => {
    const firstMatchedReport = recommendationMatches.find((item) => item.report)?.report ?? null;
    setSelectedRecommendationReport(firstMatchedReport);
  }, [recommendationMatches]);

  const handleRecommendationClick = useCallback((match: RecommendationMatch) => {
    if (!match.report) {
      return;
    }

    setSelectedRecommendationReport(match.report);

    window.requestAnimationFrame(() => {
      recommendationContextRef.current?.scrollIntoView({
        behavior: "smooth",
        block: "start",
      });
    });
  }, []);

  const loadHistory = useCallback(async () => {
    setIsLoadingHistory(true);

    try {
      const response = await fetch("/api/ai-summary", {
        method: "GET",
        credentials: "include",
      });

      const payload = (await response.json()) as {
        history?: AiHistoryItem[];
        error?: string;
      };

      if (!response.ok) {
        setError(payload.error ?? "No se pudo cargar el historial de análisis IA.");
        return;
      }

      const nextHistory = Array.isArray(payload.history) ? payload.history : [];
      setHistory(nextHistory);
      setSelectedId((current) => {
        if (current && nextHistory.some((item) => item.id === current)) {
          return current;
        }
        return nextHistory[0]?.id ?? null;
      });
      setError(null);
    } catch {
      setError("Error de red al cargar historial de análisis IA.");
    } finally {
      setIsLoadingHistory(false);
    }
  }, []);

  useEffect(() => {
    void loadHistory();
  }, [loadHistory]);

  async function handleAnalyze() {
    setIsAnalyzing(true);
    setError(null);

    try {
      const response = await fetch("/api/ai-summary", {
        method: "POST",
        credentials: "include",
      });

      const payload = (await response.json()) as {
        analysis?: AiHistoryItem;
        error?: string;
      };

      if (!response.ok || !payload.analysis) {
        setError(payload.error ?? "No se pudo generar el análisis IA.");
        return;
      }

      const analysis = payload.analysis;
      setHistory((current) => [analysis, ...current.filter((item) => item.id !== analysis.id)]);
      setSelectedId(analysis.id);
    } catch {
      setError("Error de red. Verifica que Ollama esté corriendo.");
    } finally {
      setIsAnalyzing(false);
    }
  }

  return (
    <>
      <SectionShell
        eyebrow="Inteligencia Artificial"
        title="Análisis operativo con IA"
        description="Llama3.2 analiza reportes activos y guarda un historial persistente con prioridades, recomendaciones y riesgos."
      >
        <div className="space-y-5">
          <div className="flex flex-wrap items-center gap-3">
            <button
              onClick={() => {
                void handleAnalyze();
              }}
              disabled={isAnalyzing}
              className="inline-flex items-center gap-2 rounded-full bg-slate-950 px-6 py-3 text-sm font-semibold text-white transition hover:bg-slate-700 disabled:cursor-not-allowed disabled:opacity-60"
            >
              {isAnalyzing ? (
                <>
                  <SpinnerIcon />
                  Analizando con IA…
                </>
              ) : (
                <>
                  <SparkleIcon />
                  Generar análisis IA
                </>
              )}
            </button>

            <button
              onClick={() => {
                void loadHistory();
              }}
              disabled={isLoadingHistory || isAnalyzing}
              className="inline-flex items-center gap-2 rounded-full border border-slate-200 px-5 py-3 text-sm font-semibold text-slate-700 transition hover:bg-slate-100 disabled:cursor-not-allowed disabled:opacity-60"
            >
              {isLoadingHistory ? "Cargando historial..." : "Actualizar historial"}
            </button>

            {selectedAnalysis && (
              <p className="text-xs text-slate-500">
                Seleccionado: {formatTimestamp(selectedAnalysis.generatedAt)} ·{" "}
                {selectedAnalysis.generatedByName} · {selectedAnalysis.sourceReportsCount} reportes
              </p>
            )}
          </div>

          {error && (
            <div className="rounded-2xl border border-rose-200 bg-rose-50 px-5 py-4 text-sm text-rose-800">
              {error}
            </div>
          )}

          {isLoadingHistory && (
            <p className="rounded-2xl border border-dashed border-slate-300 px-4 py-5 text-sm text-slate-600">
              Cargando historial de análisis IA...
            </p>
          )}

          {!isLoadingHistory && history.length === 0 && (
            <p className="rounded-2xl border border-dashed border-slate-300 px-4 py-5 text-sm text-slate-600">
              Aún no hay análisis guardados. Genera el primero con el botón superior.
            </p>
          )}

          {!isLoadingHistory && selectedAnalysis && (
            <div className="space-y-5">
              <AnalysisContent
                summary={selectedAnalysis.summary}
                recommendationMatches={recommendationMatches}
                onRecommendationClick={handleRecommendationClick}
              />

              {selectedRecommendationReport ? (
                <div
                  ref={recommendationContextRef}
                  className="rounded-[24px] border border-slate-900/10 bg-slate-50/90 p-5"
                >
                  <div className="flex flex-wrap items-center justify-between gap-3">
                    <div>
                      <p className="text-xs font-semibold uppercase tracking-[0.2em] text-slate-500">
                        Contexto del reporte relacionado
                      </p>
                      <h3 className="mt-2 text-lg font-semibold text-slate-950">
                        {selectedRecommendationReport.clientName}
                      </h3>
                    </div>
                    <StatusPill tone={getStatusTone(selectedRecommendationReport.status)}>
                      {selectedRecommendationReport.status}
                    </StatusPill>
                  </div>

                  <p className="mt-3 text-sm text-slate-700">
                    Enviado por <span className="font-semibold">{selectedRecommendationReport.employeeName}</span> en {selectedRecommendationReport.site}
                  </p>
                  <p className="mt-1 text-xs uppercase tracking-[0.2em] text-slate-500">
                    {formatDisplayDate(selectedRecommendationReport.serviceDate)}
                  </p>

                  <div className="mt-4 space-y-3 text-sm leading-7 text-slate-700">
                    <div>
                      <p className="text-xs font-semibold uppercase tracking-[0.16em] text-slate-500">
                        Resumen
                      </p>
                      <p className="mt-1">{selectedRecommendationReport.summary}</p>
                    </div>
                    <div>
                      <p className="text-xs font-semibold uppercase tracking-[0.16em] text-slate-500">
                        Trabajo realizado
                      </p>
                      <p className="mt-1">{selectedRecommendationReport.tasksPerformed}</p>
                    </div>
                    <div>
                      <p className="text-xs font-semibold uppercase tracking-[0.16em] text-slate-500">
                        Pendiente actual
                      </p>
                      <p className="mt-1">{selectedRecommendationReport.pendingActions}</p>
                    </div>
                  </div>
                </div>
              ) : null}

              {selectedAnalysisId && (
                <AIConversationPanel
                  analysisId={selectedAnalysisId}
                  onHistoryClick={() => setIsHistoryModalOpen(true)}
                />
              )}
            </div>
          )}
        </div>
      </SectionShell>

      <ChatHistoryModal
        analysisId={selectedAnalysisId ?? 0}
        isOpen={isHistoryModalOpen}
        onClose={() => setIsHistoryModalOpen(false)}
      />
    </>
  );
}

function SparkleIcon() {
  return (
    <svg
      className="h-4 w-4"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={2}
    >
      <path d="M12 3v1m0 16v1M4.22 4.22l.7.7m13.66 13.66.7.7M3 12h1m16 0h1M4.22 19.78l.7-.7M18.36 5.64l.7-.7" />
      <circle cx="12" cy="12" r="4" />
    </svg>
  );
}

function SpinnerIcon() {
  return (
    <svg
      className="h-4 w-4 animate-spin"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={2}
    >
      <path strokeLinecap="round" d="M12 3a9 9 0 1 0 9 9" />
    </svg>
  );
}
