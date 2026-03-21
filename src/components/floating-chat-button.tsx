"use client";

import { type FormEvent, useEffect, useRef, useState } from "react";

type AnalysisItem = {
  id: number;
};

export function FloatingChatButton() {
  const [isOpen, setIsOpen] = useState(false);
  const [analysisId, setAnalysisId] = useState<number | null>(null);
  const [question, setQuestion] = useState("");
  const [isAsking, setIsAsking] = useState(false);
  const [currentMessage, setCurrentMessage] = useState("");
  const [lastQuestion, setLastQuestion] = useState("");
  const [error, setError] = useState<string | null>(null);
  const messageEndRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  // Fetch latest analysis ID when opened for the first time
  useEffect(() => {
    if (!isOpen || analysisId !== null) return;

    void (async () => {
      try {
        const res = await fetch("/api/ai-summary", {
          credentials: "include",
        });
        if (!res.ok) return;
        const data = (await res.json()) as { history?: AnalysisItem[] };
        const latest = data.history?.[0];
        if (latest) setAnalysisId(latest.id);
      } catch {
        // silently ignore – no analysis yet
      }
    })();
  }, [isOpen, analysisId]);

  useEffect(() => {
    messageEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [currentMessage]);

  useEffect(() => {
    if (isOpen) {
      setTimeout(() => textareaRef.current?.focus(), 80);
    }
  }, [isOpen]);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const nextQuestion = question.trim();
    if (!nextQuestion) return;

    setIsAsking(true);
    setError(null);
    setCurrentMessage("");
    setLastQuestion(nextQuestion);
    setQuestion("");

    try {
      const response = await fetch("/api/ai-summary/chat/stream", {
        method: "POST",
        credentials: "include",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ analysisId, question: nextQuestion }),
      });

      if (!response.ok) {
        const errorData = (await response.json()) as { error?: string };
        setError(errorData.error ?? "No se pudo responder la pregunta.");
        setIsAsking(false);
        return;
      }

      const reader = response.body?.getReader();
      if (!reader) {
        setError("No se pudo leer la respuesta.");
        setIsAsking(false);
        return;
      }

      const decoder = new TextDecoder();
      let buffer = "";

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split("\n");
        buffer = lines.pop() ?? "";

        for (const line of lines) {
          if (line.startsWith("data: ")) {
            try {
              const data = JSON.parse(line.slice(6)) as {
                chunk?: string;
                done?: boolean;
                error?: string;
              };
              if (data.error) setError(data.error);
              else if (data.chunk) setCurrentMessage((prev) => prev + data.chunk);
              if (data.done) setIsAsking(false);
            } catch {
              // skip malformed chunk
            }
          }
        }
      }
    } catch {
      setError("Error de red al consultar la IA.");
      setIsAsking(false);
    }
  }

  function handleKeyDown(event: React.KeyboardEvent<HTMLTextAreaElement>) {
    if (event.key === "Enter" && !event.shiftKey) {
      event.preventDefault();
      if (!isAsking && question.trim()) {
        event.currentTarget.form?.requestSubmit();
      }
    }
  }

  return (
    <>
      {/* Floating window */}
      {isOpen && (
        <div className="fixed bottom-24 right-4 z-50 flex w-[min(420px,calc(100vw-2rem))] flex-col overflow-hidden rounded-[24px] border border-slate-900/10 bg-white shadow-2xl shadow-slate-900/20">
          {/* Header */}
          <div className="flex items-center justify-between gap-3 border-b border-slate-100 px-5 py-4">
            <div className="flex items-center gap-2">
              <span className="flex h-7 w-7 items-center justify-center rounded-full bg-slate-950 text-white">
                <BubbleIcon />
              </span>
              <h3 className="text-sm font-semibold text-slate-900">
                Pregúntale al análisis
              </h3>
            </div>
            <button
              type="button"
              onClick={() => setIsOpen(false)}
              className="rounded-full p-1.5 text-slate-400 transition hover:bg-slate-100 hover:text-slate-700"
              aria-label="Cerrar chat"
            >
              <CloseIcon />
            </button>
          </div>

          {/* Messages area */}
          <div className="flex max-h-[340px] min-h-[120px] flex-col gap-3 overflow-y-auto px-5 py-4">
            {!lastQuestion && !analysisId && (
              <p className="text-sm text-slate-400">
                Aún no hay un análisis generado. Genera uno desde el panel de IA para poder hacer preguntas.
              </p>
            )}

            {!lastQuestion && analysisId && (
              <p className="text-sm text-slate-400">
                Escribe tu pregunta y presiona{" "}
                <kbd className="rounded border border-slate-200 px-1 text-xs">Enter</kbd> o el botón de enviar.
              </p>
            )}

            {lastQuestion && (
              <>
                <div className="rounded-2xl bg-slate-900 px-4 py-3 text-sm text-white">
                  <p className="mb-1 text-[11px] font-semibold uppercase tracking-[0.16em] opacity-60">
                    Tu pregunta
                  </p>
                  <p>{lastQuestion}</p>
                </div>

                {(currentMessage || isAsking) && (
                  <div className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-800">
                    <p className="mb-2 text-[11px] font-semibold uppercase tracking-[0.16em] opacity-60">
                      Respuesta IA
                    </p>
                    <p className="whitespace-pre-wrap leading-6">
                      {currentMessage}
                      {isAsking && <span className="animate-pulse">▊</span>}
                    </p>
                  </div>
                )}

                {error && (
                  <div className="rounded-xl border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-800">
                    {error}
                  </div>
                )}
              </>
            )}

            <div ref={messageEndRef} />
          </div>

          {/* Input area */}
          <form
            onSubmit={handleSubmit}
            className="border-t border-slate-100 px-4 py-3"
          >
            <div className="flex items-end gap-2">
              <textarea
                ref={textareaRef}
                value={question}
                onChange={(e) => setQuestion(e.target.value)}
                onKeyDown={handleKeyDown}
                placeholder="Pregunta algo sobre los reportes…"
                rows={2}
                maxLength={500}
                disabled={isAsking || !analysisId}
                className="flex-1 resize-none rounded-2xl border border-slate-900/10 bg-slate-50 px-4 py-2.5 text-sm text-slate-950 outline-none transition focus:border-slate-950 disabled:opacity-50"
              />
              <button
                type="submit"
                disabled={isAsking || !question.trim() || !analysisId}
                className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-slate-950 text-white transition hover:bg-slate-700 disabled:cursor-not-allowed disabled:opacity-50"
                aria-label="Enviar pregunta"
              >
                {isAsking ? <SpinnerIcon /> : <SendIcon />}
              </button>
            </div>
            <p className="mt-1.5 text-right text-[11px] text-slate-400">
              {question.length}/500 · Enter para enviar
            </p>
          </form>
        </div>
      )}

      {/* Floating button */}
      <button
        type="button"
        onClick={() => setIsOpen((prev) => !prev)}
        className="fixed bottom-5 right-4 z-50 flex h-14 w-14 items-center justify-center rounded-full bg-slate-950 text-white shadow-xl shadow-slate-900/30 transition hover:bg-slate-700 hover:scale-105 active:scale-95"
        aria-label={isOpen ? "Cerrar asistente IA" : "Abrir asistente IA"}
      >
        {isOpen ? <CloseIcon /> : <BubbleIcon />}
      </button>
    </>
  );
}

function BubbleIcon() {
  return (
    <svg
      className="h-6 w-6"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={2}
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
    </svg>
  );
}

function CloseIcon() {
  return (
    <svg
      className="h-5 w-5"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={2}
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <line x1="18" y1="6" x2="6" y2="18" />
      <line x1="6" y1="6" x2="18" y2="18" />
    </svg>
  );
}

function SendIcon() {
  return (
    <svg
      className="h-4 w-4 translate-x-0.5"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={2}
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <line x1="22" y1="2" x2="11" y2="13" />
      <polygon points="22 2 15 22 11 13 2 9 22 2" />
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
