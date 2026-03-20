import { Ollama } from "ollama";

import {
  buildChatHistoryContext,
  buildReportsContext,
  buildSummaryContext,
  QA_REPORT_LIMIT,
  type AiSummary,
  tryHeuristicAnswer,
} from "@/lib/ai-analysis";
import { getSessionUser } from "@/lib/auth";
import {
  getAiAnalysisHistoryEntryById,
  listAiAnalysisChatMessagesByAnalysisId,
  listWorkReports,
  saveAiAnalysisChatMessageEntry,
} from "@/lib/db";

export const runtime = "nodejs";
export const maxDuration = 180;

const OLLAMA_HOST = process.env.OLLAMA_HOST ?? "http://127.0.0.1:11434";
const OLLAMA_MODEL = process.env.OLLAMA_MODEL ?? "llama3.2";
const OLLAMA_API_KEY = process.env.OLLAMA_API_KEY?.trim();

const QA_SYSTEM_PROMPT = `Eres un asistente operativo que responde preguntas sobre reportes de trabajo.
Recibirás dos contextos: (1) resumen IA y (2) reportes concretos.
Reglas:
- Prioriza evidencia de los reportes concretos para responder preguntas específicas (quién, cuándo, cliente, sitio, pendientes).
- Usa el resumen IA para complementar, no para reemplazar evidencia.
- Si faltan datos para responder con certeza, dilo explícitamente y sugiere la siguiente acción.
- Responde en español, **breve y conciso** (máximo 3-4 oraciones cortas).
- Si es una lista, usa viñetas breves, no párrafos.`;

function makeFetch(): typeof fetch {
  return (url: RequestInfo | URL, init?: RequestInit) => {
    const headers = new Headers(init?.headers);

    if (OLLAMA_API_KEY) {
      headers.set("Authorization", `Bearer ${OLLAMA_API_KEY}`);
    }

    if (OLLAMA_HOST.includes(".loca.lt")) {
      headers.set("Bypass-Tunnel-Reminder", "true");
    }

    return fetch(url, { ...init, headers });
  };
}

function parseAnalysisId(value: unknown): number | null {
  if (typeof value === "number" && Number.isInteger(value) && value > 0) {
    return value;
  }

  if (typeof value === "string") {
    const parsed = Number.parseInt(value, 10);
    if (Number.isInteger(parsed) && parsed > 0) {
      return parsed;
    }
  }

  return null;
}

function sanitizeSummary(candidate: unknown): AiSummary {
  if (!candidate || typeof candidate !== "object") {
    return {
      resumen: "No se pudo recuperar el resumen de este análisis.",
      prioridades: [],
      recomendaciones: [],
      riesgos: [],
    };
  }

  const parsed = candidate as Record<string, unknown>;

  return {
    resumen:
      typeof parsed.resumen === "string" && parsed.resumen.trim()
        ? parsed.resumen.trim()
        : "No se pudo recuperar el resumen de este análisis.",
    prioridades: Array.isArray(parsed.prioridades)
      ? (parsed.prioridades as Array<Record<string, unknown>>)
          .slice(0, 6)
          .map((priority) => ({
            cliente:
              typeof priority.cliente === "string" && priority.cliente.trim()
                ? priority.cliente.trim()
                : "Desconocido",
            descripcion:
              typeof priority.descripcion === "string"
                ? priority.descripcion.trim()
                : "",
            urgencia:
              priority.urgencia === "alta" ||
              priority.urgencia === "media" ||
              priority.urgencia === "baja"
                ? priority.urgencia
                : "media",
          }))
      : [],
    recomendaciones: Array.isArray(parsed.recomendaciones)
      ? (parsed.recomendaciones as unknown[])
          .filter((item): item is string => typeof item === "string")
          .map((item) => item.trim())
          .filter(Boolean)
          .slice(0, 5)
      : [],
    riesgos: Array.isArray(parsed.riesgos)
      ? (parsed.riesgos as unknown[])
          .filter((item): item is string => typeof item === "string")
          .map((item) => item.trim())
          .filter(Boolean)
          .slice(0, 4)
      : [],
  };
}

export async function POST(request: Request) {
  const currentUser = await getSessionUser();

  if (!currentUser) {
    return new Response("No autenticado", { status: 401 });
  }

  if (currentUser.role !== "admin") {
    return new Response("Acceso denegado", { status: 403 });
  }

  let payload: { analysisId?: number; question?: string };

  try {
    payload = (await request.json()) as { analysisId?: number; question?: string };
  } catch {
    return new Response("No se recibió un cuerpo JSON válido.", { status: 400 });
  }

  const analysisId = parseAnalysisId(payload.analysisId);
  const question = typeof payload.question === "string" ? payload.question.trim() : "";

  if (!analysisId) {
    return new Response("Debes indicar un análisis válido.", { status: 422 });
  }

  if (!question) {
    return new Response("La pregunta no puede estar vacía.", { status: 422 });
  }

  if (question.length > 500) {
    return new Response("La pregunta es demasiado larga (máximo 500 caracteres).", { status: 422 });
  }

  const entry = getAiAnalysisHistoryEntryById(analysisId);

  if (!entry) {
    return new Response("No se encontró el análisis seleccionado.", { status: 404 });
  }

  let summary: AiSummary;

  try {
    summary = sanitizeSummary(JSON.parse(entry.summaryJson));
  } catch {
    return new Response("No se pudo leer el contenido del análisis seleccionado.", {
      status: 500,
    });
  }

  try {
    // Guardar pregunta del usuario
    saveAiAnalysisChatMessageEntry({
      analysisId,
      userId: currentUser.id,
      role: "user",
      content: question,
    });

    // Obtener historial para contexto
    const previousMessages = listAiAnalysisChatMessagesByAnalysisId(analysisId);
    const chatHistoryForContext = previousMessages
      .slice(0, -1) // Excluir el mensaje que acabamos de guardar
      .map((msg) => ({
        role: msg.role as "user" | "assistant",
        content: msg.content,
      }));

    const reports = listWorkReports();
    const contextLimit = Math.min(
      Math.max(entry.sourceReportsCount + 15, 15),
      QA_REPORT_LIMIT,
    );
    const reportContext = reports.slice(0, contextLimit);

    // Intentar heurística primero
    const heuristicAnswer = tryHeuristicAnswer(question, reportContext);

    if (heuristicAnswer) {
      // Si hay respuesta heurística, guardar y devolver directamente
      saveAiAnalysisChatMessageEntry({
        analysisId,
        userId: currentUser.id,
        role: "assistant",
        content: heuristicAnswer,
      });

      return new Response(
        heuristicAnswer.split("").reduce((acc, char) => {
          acc += `data: ${JSON.stringify({ chunk: char, done: false })}\n\n`;
          return acc;
        }, "") +
          `data: ${JSON.stringify({ chunk: "", done: true })}\n\n`,
        {
          headers: {
            "Content-Type": "text/event-stream",
            "Cache-Control": "no-cache",
            Connection: "keep-alive",
          },
        },
      );
    }

    // Si no hay heurística, usar Ollama con streaming
    const ollama = new Ollama({ host: OLLAMA_HOST, fetch: makeFetch() });
    const reportsContext = buildReportsContext(reportContext);
    const historyContext = buildChatHistoryContext(chatHistoryForContext);
    const summaryContext = buildSummaryContext(summary);

    const encoder = new TextEncoder();
    let fullAnswer = "";

    // Crear stream personalizado
    const customResponse = new ReadableStream({
      async start(controller) {
        try {
          const response = await ollama.chat({
            model: OLLAMA_MODEL,
            options: { temperature: 0.2 },
            stream: true,
            messages: [
              { role: "system", content: QA_SYSTEM_PROMPT },
              {
                role: "user",
                content: `Contexto del análisis:\n${summaryContext}\n\n${reportsContext}\n\n${historyContext}Pregunta actual:\n${question}`,
              },
            ],
          });


          for await (const chunk of response) {
            if (chunk?.message?.content) {
              const text = chunk.message.content;
              fullAnswer += text;

              const event = `data: ${JSON.stringify({ chunk: text, done: false })}\n\n`;
              controller.enqueue(encoder.encode(event));
            }
          }

          controller.enqueue(
            encoder.encode(`data: ${JSON.stringify({ chunk: "", done: true })}\n\n`),
          );

          // Guardar respuesta completa después de stream
          if (fullAnswer.trim()) {
            saveAiAnalysisChatMessageEntry({
              analysisId,
              userId: currentUser.id,
              role: "assistant",
              content: fullAnswer.trim(),
            });
          }

          controller.close();
        } catch (error) {
          const errorMsg = error instanceof Error ? error.message : "Error desconocido";
          controller.enqueue(
            encoder.encode(
              `data: ${JSON.stringify({ error: errorMsg, done: true })}\n\n`,
            ),
          );
          controller.close();
        }
      },
    });

    return new Response(customResponse, {
      headers: {
        "Content-Type": "text/event-stream",
        "Cache-Control": "no-cache",
        Connection: "keep-alive",
      },
    });
  } catch (err: unknown) {
    const errorMsg =
      err instanceof Error ? err.message : "Error al responder la pregunta sobre el análisis IA.";
    return new Response(errorMsg, { status: 500 });
  }
}
