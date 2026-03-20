"use client";

import { type FormEvent, useEffect, useRef, useState } from "react";

type AIConversationPanelProps = {
  analysisId: number;
  onHistoryClick: () => void;
};

export function AIConversationPanel({
  analysisId,
  onHistoryClick,
}: AIConversationPanelProps) {
  const [question, setQuestion] = useState("");
  const [isAsking, setIsAsking] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [currentMessage, setCurrentMessage] = useState<string>("");
  const [lastQuestion, setLastQuestion] = useState<string>("");
  const messageEndRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    messageEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [currentMessage]);

  async function handleAskQuestion(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    const nextQuestion = question.trim();

    if (!nextQuestion) {
      setError("Escribe una pregunta antes de consultar a la IA.");
      return;
    }

    setIsAsking(true);
    setError(null);
    setCurrentMessage("");
    setLastQuestion(nextQuestion);
    setQuestion("");

    try {
      const response = await fetch("/api/ai-summary/chat/stream", {
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

      if (!response.ok) {
        const errorData = await response.json() as { error?: string };
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
              const data = JSON.parse(line.slice(6)) as { chunk?: string; done?: boolean; error?: string };

              if (data.error) {
                setError(data.error);
              } else if (data.chunk) {
                setCurrentMessage((prev) => prev + data.chunk);
              }

              if (data.done) {
                setIsAsking(false);
              }
            } catch {
              // Parsing error, skip
            }
          }
        }
      }
    } catch {
      setError("Error de red al consultar la IA.");
      setIsAsking(false);
    }
  }

  return (
    <div className="space-y-4 rounded-[24px] border border-slate-900/10 bg-white p-5">
      <div className="flex items-center justify-between gap-3">
        <h3 className="text-sm font-semibold uppercase tracking-wide text-slate-500">
          Pregúntale al análisis
        </h3>
        <button
          type="button"
          onClick={onHistoryClick}
          className="rounded-full border border-slate-200 px-3 py-1.5 text-xs font-semibold text-slate-700 transition hover:bg-slate-100"
        >
          Ver historial
        </button>
      </div>

      {/* Mostrar pregunta anterior y respuesta actual */}
      {lastQuestion && (
        <div className="space-y-3">
          <div className="rounded-2xl bg-slate-900 px-4 py-3 text-sm text-white">
            <p className="mb-1 text-[11px] font-semibold uppercase tracking-[0.16em] opacity-75">
              Tu pregunta
            </p>
            <p>{lastQuestion}</p>
          </div>

          {currentMessage && (
            <div className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-800">
              <p className="mb-2 text-[11px] font-semibold uppercase tracking-[0.16em] opacity-75">
                Respuesta IA
              </p>
              <p className="whitespace-pre-wrap leading-6">{currentMessage}</p>
              {isAsking && <span className="animate-pulse">▊</span>}
            </div>
          )}

          {error && (
            <div className="rounded-xl border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-800">
              {error}
            </div>
          )}
        </div>
      )}

      {/* Formulario */}
      <form className="grid gap-3" onSubmit={handleAskQuestion}>
        <textarea
          value={question}
          onChange={(event) => {
            setQuestion(event.target.value);
          }}
          placeholder="Ejemplo: ¿Qué cliente debería atenderse primero y por qué?"
          className="min-h-24 rounded-2xl border border-slate-900/10 bg-slate-50 px-4 py-3 text-sm text-slate-950 outline-none transition focus:border-slate-950"
          maxLength={500}
          disabled={isAsking}
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

      <div ref={messageEndRef} />
    </div>
  );
}
