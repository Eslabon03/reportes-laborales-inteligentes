"use client";

import { useEffect, useRef, useState } from "react";

export type ChatHistoryMessage = {
  id: number;
  role: "user" | "assistant";
  content: string;
  createdAt: string;
  createdByName: string;
};

type ChatHistoryModalProps = {
  analysisId: number;
  isOpen: boolean;
  onClose: () => void;
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

export function ChatHistoryModal({ analysisId, isOpen, onClose }: ChatHistoryModalProps) {
  const [messages, setMessages] = useState<ChatHistoryMessage[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!isOpen || analysisId === 0) return;

    let isMounted = true;

    const loadMessages = async () => {
      if (!isMounted) return;
      setIsLoading(true);
      setError(null);

      try {
        const res = await fetch(
          `/api/ai-summary/chat?analysisId=${encodeURIComponent(String(analysisId))}`,
          {
            method: "GET",
            credentials: "include",
          },
        );

        const data = (await res.json()) as { messages?: unknown; error?: string };

        if (!isMounted) return;

        if (Array.isArray(data.messages)) {
          setMessages(
            data.messages.map((m: unknown) => {
              const msg = m as ChatHistoryMessage;
              return {
                id: msg.id ?? 0,
                role: msg.role ?? "user",
                content: msg.content ?? "",
                createdAt: msg.createdAt ?? "",
                createdByName: msg.createdByName ?? "Sistema",
              };
            }),
          );
        } else if (data.error) {
          setError(data.error);
        }
      } catch {
        if (isMounted) {
          setError("Error al cargar el historial.");
        }
      } finally {
        if (isMounted) {
          setIsLoading(false);
        }
      }
    };

    void loadMessages();

    return () => {
      isMounted = false;
    };
  }, [isOpen, analysisId]);

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages]);

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
      <div className="w-full max-w-2xl max-h-[80vh] rounded-[24px] bg-white p-6 shadow-lg flex flex-col">
        <div className="flex items-center justify-between gap-4 mb-4">
          <h2 className="text-lg font-semibold text-slate-950">Historial de conversación</h2>
          <button
            type="button"
            onClick={onClose}
            className="rounded-full border border-slate-200 px-3 py-1.5 text-sm font-semibold text-slate-700 transition hover:bg-slate-100"
          >
            Cerrar
          </button>
        </div>

        {isLoading ? (
          <div className="flex items-center justify-center py-8">
            <p className="text-sm text-slate-500">Cargando historial…</p>
          </div>
        ) : error ? (
          <div className="rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-800">
            {error}
          </div>
        ) : messages.length === 0 ? (
          <div className="flex items-center justify-center py-8">
            <p className="text-sm text-slate-500">No hay preguntas registradas para este análisis.</p>
          </div>
        ) : (
          <div ref={scrollRef} className="overflow-y-auto space-y-3">
            {messages.map((message, index) => (
              <div
                key={message.id || `${message.role}-${index}`}
                className={[
                  "rounded-2xl px-4 py-3 text-sm leading-6",
                  message.role === "user" ? "bg-slate-900 text-white" : "border border-slate-200 bg-slate-50 text-slate-800",
                ].join(" ")}
              >
                <p className="mb-1 text-[11px] font-semibold uppercase tracking-[0.16em] opacity-75">
                  {message.role === "user" ? "Tu pregunta" : "Respuesta IA"} · {message.createdByName}
                </p>
                <p className="whitespace-pre-wrap">{message.content}</p>
                <p className="mt-2 text-[11px] opacity-70">
                  {message.createdAt ? formatTimestamp(message.createdAt) : ""}
                </p>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
