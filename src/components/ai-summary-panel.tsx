"use client";

import { type FormEvent, useCallback, useEffect, useRef, useState } from "react";

import { SectionShell } from "@/components/section-shell";
import { StatusPill } from "@/components/status-pill";
import type { AiPriority, AiSummary } from "@/lib/ai-analysis";

type AiHistoryItem = {
  id: number;
  generatedAt: string;
  generatedByName: string;
  sourceReportsCount: number;
  summary: AiSummary;
};

type ChatMessage = {
  id: number;
  role: "user" | "assistant";
  content: string;
  createdAt: string;
  createdByName: string;
};

function sanitizeChatMessages(candidate: unknown): ChatMessage[] {
  if (!Array.isArray(candidate)) {
    return [];
  }

  return candidate
    .map((item) => {
      if (!item || typeof item !== "object") {
        return null;
      }

      const row = item as Record<string, unknown>;
      const role = row.role;

      if (role !== "user" && role !== "assistant") {
        return null;
      }

      return {
        id: typeof row.id === "number" ? row.id : 0,
        role,
        content: typeof row.content === "string" ? row.content.trim() : "",
        createdAt: typeof row.createdAt === "string" ? row.createdAt : "",
        createdByName:
          typeof row.createdByName === "string" ? row.createdByName : "Sistema",
      };
    })
    .filter(
      (item): item is ChatMessage =>
        Boolean(item && item.id > 0 && item.content.length > 0),
    );
}

const URGENCY_TONE: Record<
  AiPriority["urgencia"],
  "rose" | "amber" | "teal"
> = {
  alta: "rose",
  media: "amber",
  baja: "teal",
};

const URGENCY_LABEL: Record<AiPriority["urgencia"], string> = {
  alta: "Urgente",
  media: "Media",
  baja: "Baja",
};

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

function AnalysisContent({ summary }: { summary: AiSummary }) {
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
            <p className="text-sm text-slate-400">
              No se detectaron prioridades críticas.
            </p>
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
            {summary.recomendaciones.length === 0 ? (
              <p className="text-sm text-slate-400">Sin recomendaciones adicionales.</p>
            ) : (
              <ul className="space-y-2">
                {summary.recomendaciones.map((recommendation, index) => (
                  <li
                    key={`${recommendation}-${index}`}
                    className="flex gap-3 rounded-xl bg-emerald-50 px-4 py-3 text-sm text-emerald-900"
                  >
                    <span className="mt-0.5 shrink-0 text-emerald-500">✓</span>
                    {recommendation}
                  </li>
                ))}
              </ul>
            )}
          </div>

          {summary.riesgos.length > 0 ? (
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
          ) : null}
        </div>
      </div>
    </div>
  );
}

export function AiSummaryPanel() {
  const [history, setHistory] = useState<AiHistoryItem[]>([]);
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [isLoadingHistory, setIsLoadingHistory] = useState(true);
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [isAsking, setIsAsking] = useState(false);
  const [isLoadingChat, setIsLoadingChat] = useState(false);
  const [question, setQuestion] = useState("");
  const [chatByAnalysisId, setChatByAnalysisId] = useState<
    Record<number, ChatMessage[]>
  >({});
  const [isDeletingChat, setIsDeletingChat] = useState(false);
  const [pendingDeleteAnalysisId, setPendingDeleteAnalysisId] = useState<
    number | null
  >(null);
  const [undoSecondsLeft, setUndoSecondsLeft] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [chatError, setChatError] = useState<string | null>(null);
  const [chatInfo, setChatInfo] = useState<string | null>(null);
  const deleteTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const deleteIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const chatInfoTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const selectedAnalysis =
    history.find((item) => item.id === selectedId) ?? history[0] ?? null;
  const selectedAnalysisId = selectedAnalysis?.id ?? null;
  const selectedChat = selectedAnalysisId
    ? chatByAnalysisId[selectedAnalysisId] ?? []
    : [];
  const hasSelectedChatMessages = selectedChat.length > 0;

  const loadChatHistory = useCallback(
    async (analysisId: number, force = false) => {
      if (!force && chatByAnalysisId[analysisId]) {
        return;
      }

      setIsLoadingChat(true);

      try {
        const response = await fetch(
          `/api/ai-summary/chat?analysisId=${encodeURIComponent(String(analysisId))}`,
          {
            method: "GET",
            credentials: "include",
          },
        );

        const payload = (await response.json()) as {
          messages?: unknown;
          error?: string;
        };

        if (!response.ok) {
          setChatError(payload.error ?? "No se pudo cargar el historial del chat.");
          return;
        }

        setChatByAnalysisId((current) => ({
          ...current,
          [analysisId]: sanitizeChatMessages(payload.messages),
        }));
        setChatError(null);
        setChatInfo(null);
      } catch {
        setChatError("Error de red al cargar el historial del chat.");
      } finally {
        setIsLoadingChat(false);
      }
    },
    [chatByAnalysisId],
  );

  useEffect(() => {
    void loadHistory();
  }, []);

  useEffect(() => {
    if (!selectedAnalysisId) {
      return;
    }

    void loadChatHistory(selectedAnalysisId);
  }, [selectedAnalysisId, loadChatHistory]);

  useEffect(() => {
    return () => {
      clearDeleteCountdown();

      if (chatInfoTimeoutRef.current) {
        clearTimeout(chatInfoTimeoutRef.current);
        chatInfoTimeoutRef.current = null;
      }
    };
  }, []);

  useEffect(() => {
    if (!selectedAnalysisId || pendingDeleteAnalysisId === null) {
      return;
    }

    if (selectedAnalysisId !== pendingDeleteAnalysisId) {
      clearDeleteCountdown();
      setPendingDeleteAnalysisId(null);
      setUndoSecondsLeft(0);
    }
  }, [pendingDeleteAnalysisId, selectedAnalysisId]);

  function clearDeleteCountdown() {
    if (deleteTimeoutRef.current) {
      clearTimeout(deleteTimeoutRef.current);
      deleteTimeoutRef.current = null;
    }

    if (deleteIntervalRef.current) {
      clearInterval(deleteIntervalRef.current);
      deleteIntervalRef.current = null;
    }
  }

  function showChatInfo(message: string) {
    setChatInfo(message);

    if (chatInfoTimeoutRef.current) {
      clearTimeout(chatInfoTimeoutRef.current);
    }

    chatInfoTimeoutRef.current = setTimeout(() => {
      setChatInfo(null);
      chatInfoTimeoutRef.current = null;
    }, 4000);
  }

  async function confirmDeleteConversation(analysisId: number) {
    setIsDeletingChat(true);

    try {
      const response = await fetch(
        `/api/ai-summary/chat?analysisId=${encodeURIComponent(String(analysisId))}`,
        {
          method: "DELETE",
          credentials: "include",
        },
      );

      const payload = (await response.json()) as {
        error?: string;
        deletedCount?: number;
      };

      if (!response.ok) {
        setChatError(payload.error ?? "No se pudo eliminar la conversación.");
        return;
      }

      setChatByAnalysisId((current) => ({
        ...current,
        [analysisId]: [],
      }));
      setChatError(null);
      showChatInfo(
        typeof payload.deletedCount === "number" && payload.deletedCount > 0
          ? "Conversación eliminada correctamente."
          : "No había mensajes para eliminar en esta conversación.",
      );
    } catch {
      setChatError("Error de red al eliminar la conversación.");
    } finally {
      setIsDeletingChat(false);
    }
  }

  function handleDeleteConversationWithUndo() {
    if (!selectedAnalysis) {
      return;
    }

    const analysisId = selectedAnalysis.id;

    clearDeleteCountdown();
    setPendingDeleteAnalysisId(analysisId);
    setUndoSecondsLeft(10);
    setChatError(null);
    setChatInfo(null);

    deleteIntervalRef.current = setInterval(() => {
      setUndoSecondsLeft((current) => (current > 0 ? current - 1 : 0));
    }, 1000);

    deleteTimeoutRef.current = setTimeout(() => {
      clearDeleteCountdown();
      setPendingDeleteAnalysisId(null);
      setUndoSecondsLeft(0);
      void confirmDeleteConversation(analysisId);
    }, 10_000);
  }

  function handleUndoDeleteConversation() {
    clearDeleteCountdown();
    setPendingDeleteAnalysisId(null);
    setUndoSecondsLeft(0);
    setChatError(null);
    showChatInfo("Eliminación cancelada.");
  }

  async function loadHistory() {
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
  }

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
      setHistory((current) => [
        analysis,
        ...current.filter((item) => item.id !== analysis.id),
      ]);
      setSelectedId(analysis.id);
      setChatByAnalysisId((current) => ({
        ...current,
        [analysis.id]: current[analysis.id] ?? [],
      }));
    } catch {
      setError("Error de red. Verifica que Ollama esté corriendo.");
    } finally {
      setIsAnalyzing(false);
    }
  }

  async function handleAskQuestion(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (!selectedAnalysis) {
      return;
    }

    const nextQuestion = question.trim();

    if (!nextQuestion) {
      setChatError("Escribe una pregunta antes de consultar a la IA.");
      return;
    }

    const analysisId = selectedAnalysis.id;

    if (pendingDeleteAnalysisId === analysisId) {
      clearDeleteCountdown();
      setPendingDeleteAnalysisId(null);
      setUndoSecondsLeft(0);
    }

    setIsAsking(true);
    setChatError(null);
    setChatInfo(null);

    try {
      const response = await fetch("/api/ai-summary/chat", {
        method: "POST",
        credentials: "include",
        headers: {
          "content-type": "application/json",
        },
        body: JSON.stringify({
          analysisId,
          question: nextQuestion,
        }),
      });

      const payload = (await response.json()) as {
        answer?: string;
        messages?: unknown;
        error?: string;
      };

      const answer =
        typeof payload.answer === "string" ? payload.answer.trim() : "";
      const nextMessages = sanitizeChatMessages(payload.messages);

      if (!response.ok || !answer) {
        setChatError(payload.error ?? "No se pudo responder la pregunta.");
        return;
      }

      if (nextMessages.length > 0) {
        setChatByAnalysisId((current) => ({
          ...current,
          [analysisId]: nextMessages,
        }));
      } else {
        setChatByAnalysisId((current) => ({
          ...current,
          [analysisId]: [],
        }));
      }

      setQuestion("");
    } catch {
      setChatError("Error de red al consultar preguntas sobre el análisis.");
    } finally {
      setIsAsking(false);
    }
  }

  return (
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

          {selectedAnalysis ? (
            <p className="text-xs text-slate-500">
              Seleccionado: {formatTimestamp(selectedAnalysis.generatedAt)} ·{" "}
              {selectedAnalysis.generatedByName} · {selectedAnalysis.sourceReportsCount} reportes
            </p>
          ) : null}
        </div>

        {error ? (
          <div className="rounded-2xl border border-rose-200 bg-rose-50 px-5 py-4 text-sm text-rose-800">
            {error}
          </div>
        ) : null}

        {isLoadingHistory ? (
          <p className="rounded-2xl border border-dashed border-slate-300 px-4 py-5 text-sm text-slate-600">
            Cargando historial de análisis IA...
          </p>
        ) : history.length === 0 ? (
          <p className="rounded-2xl border border-dashed border-slate-300 px-4 py-5 text-sm text-slate-600">
            Aún no hay análisis guardados. Genera el primero con el botón superior.
          </p>
        ) : selectedAnalysis ? (
          <div className="space-y-5">
            <div className="grid gap-5 xl:grid-cols-[1.35fr_0.65fr]">
              <AnalysisContent summary={selectedAnalysis.summary} />

              <div className="space-y-3 rounded-[24px] border border-slate-900/10 bg-slate-50/80 p-4">
                <h3 className="text-sm font-semibold uppercase tracking-wide text-slate-500">
                  Historial reciente
                </h3>

                {history.map((item) => {
                  const isSelected = item.id === selectedAnalysis.id;

                  return (
                    <button
                      key={item.id}
                      type="button"
                      onClick={() => {
                        setSelectedId(item.id);
                        setChatError(null);
                        setChatInfo(null);
                      }}
                      className={[
                        "w-full rounded-2xl border px-4 py-3 text-left transition",
                        isSelected
                          ? "border-slate-900 bg-slate-900 text-white"
                          : "border-slate-200 bg-white text-slate-700 hover:border-slate-300",
                      ].join(" ")}
                    >
                      <p
                        className={[
                          "text-xs font-semibold uppercase tracking-wide",
                          isSelected ? "text-slate-300" : "text-slate-500",
                        ].join(" ")}
                      >
                        {formatTimestamp(item.generatedAt)}
                      </p>
                      <p className="mt-1 text-xs">
                        {item.generatedByName} · {item.sourceReportsCount} reportes
                      </p>
                      <p className="mt-2 line-clamp-3 text-xs leading-5">
                        {item.summary.resumen}
                      </p>
                    </button>
                  );
                })}
              </div>
            </div>

            <div className="rounded-[24px] border border-slate-900/10 bg-white p-5">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <h3 className="text-sm font-semibold uppercase tracking-wide text-slate-500">
                  Pregúntale al análisis
                </h3>
                <div className="flex flex-wrap items-center gap-2">
                  <button
                    type="button"
                    onClick={() => {
                      if (selectedAnalysis) {
                        void loadChatHistory(selectedAnalysis.id, true);
                      }
                    }}
                    disabled={isLoadingChat || isAsking || isDeletingChat}
                    className="rounded-full border border-slate-200 px-3 py-1.5 text-xs font-semibold text-slate-700 transition hover:bg-slate-100 disabled:cursor-not-allowed disabled:opacity-60"
                  >
                    {isLoadingChat ? "Cargando…" : "Recargar conversación"}
                  </button>
                  <button
                    type="button"
                    onClick={handleDeleteConversationWithUndo}
                    disabled={
                      isLoadingChat ||
                      isAsking ||
                      isDeletingChat ||
                      !hasSelectedChatMessages ||
                      pendingDeleteAnalysisId === selectedAnalysisId
                    }
                    className="rounded-full border border-rose-200 px-3 py-1.5 text-xs font-semibold text-rose-700 transition hover:bg-rose-50 disabled:cursor-not-allowed disabled:opacity-60"
                  >
                    {isDeletingChat
                      ? "Eliminando…"
                      : pendingDeleteAnalysisId === selectedAnalysisId
                        ? `Eliminar en ${undoSecondsLeft}s…`
                        : hasSelectedChatMessages
                          ? "Eliminar conversación"
                          : "Sin conversación"}
                  </button>
                </div>
              </div>

              {pendingDeleteAnalysisId === selectedAnalysisId ? (
                <div className="mt-3 flex flex-wrap items-center justify-between gap-2 rounded-xl border border-amber-200 bg-amber-50 px-3 py-2">
                  <p className="text-xs text-amber-900">
                    Se eliminará esta conversación en {undoSecondsLeft}s.
                  </p>
                  <button
                    type="button"
                    onClick={handleUndoDeleteConversation}
                    className="rounded-full border border-amber-300 px-3 py-1 text-xs font-semibold text-amber-900 transition hover:bg-amber-100"
                  >
                    Deshacer
                  </button>
                </div>
              ) : null}

              <form className="mt-4 grid gap-3" onSubmit={handleAskQuestion}>
                <textarea
                  value={question}
                  onChange={(event) => {
                    setQuestion(event.target.value);
                  }}
                  placeholder="Ejemplo: ¿Qué cliente debería atenderse primero y por qué?"
                  className="min-h-24 rounded-2xl border border-slate-900/10 bg-slate-50 px-4 py-3 text-sm text-slate-950 outline-none transition focus:border-slate-950"
                  maxLength={500}
                />
                <div className="flex items-center justify-between gap-3">
                  <p className="text-xs text-slate-500">
                    {question.length}/500 caracteres
                  </p>
                  <button
                    type="submit"
                    disabled={isAsking}
                    className="inline-flex items-center rounded-full bg-slate-950 px-5 py-2.5 text-sm font-semibold text-white transition hover:bg-slate-700 disabled:cursor-not-allowed disabled:opacity-60"
                  >
                    {isAsking ? "Consultando…" : "Preguntar"}
                  </button>
                </div>
              </form>

              {chatError ? (
                <p className="mt-3 rounded-xl border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-800">
                  {chatError}
                </p>
              ) : null}

              {chatInfo ? (
                <p className="mt-3 rounded-xl border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-800">
                  {chatInfo}
                </p>
              ) : null}

              <div className="mt-4 space-y-3">
                {isLoadingChat ? (
                  <p className="rounded-xl border border-dashed border-slate-300 px-4 py-3 text-sm text-slate-600">
                    Cargando conversación del análisis...
                  </p>
                ) : selectedChat.length === 0 ? (
                  <p className="rounded-xl border border-dashed border-slate-300 px-4 py-3 text-sm text-slate-600">
                    Aún no hay preguntas para este análisis.
                  </p>
                ) : (
                  selectedChat.map((message, index) => (
                    <div
                      key={message.id || `${message.role}-${index}-${message.content.slice(0, 24)}`}
                      className={[
                        "rounded-2xl px-4 py-3 text-sm leading-6",
                        message.role === "user"
                          ? "bg-slate-900 text-white"
                          : "border border-slate-200 bg-slate-50 text-slate-800",
                      ].join(" ")}
                    >
                      <p className="mb-1 text-[11px] font-semibold uppercase tracking-[0.16em] opacity-75">
                        {message.role === "user" ? "Tu pregunta" : "Respuesta IA"} · {message.createdByName}
                      </p>
                      <p>{message.content}</p>
                      <p className="mt-2 text-[11px] opacity-70">
                        {message.createdAt ? formatTimestamp(message.createdAt) : ""}
                      </p>
                    </div>
                  ))
                )}
              </div>
            </div>
          </div>
        ) : null}
      </div>
    </SectionShell>
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
