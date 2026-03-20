import { NextResponse } from "next/server";

import {
  answerQuestionAboutSummary,
  type AiSummary,
} from "@/lib/ai-analysis";
import { getSessionUser } from "@/lib/auth";
import {
  deleteAiAnalysisChatMessagesByAnalysisId,
  getAiAnalysisHistoryEntryById,
  listAiAnalysisChatMessagesByAnalysisId,
  listWorkReports,
  saveAiAnalysisChatMessageEntry,
  type AiAnalysisChatMessageEntry,
} from "@/lib/db";

export const runtime = "nodejs";
export const maxDuration = 180;

type ChatRequestPayload = {
  analysisId?: number;
  question?: string;
};

type ApiChatMessage = {
  id: number;
  role: "user" | "assistant";
  content: string;
  createdAt: string;
  createdByName: string;
};

function mapChatMessage(message: AiAnalysisChatMessageEntry): ApiChatMessage {
  return {
    id: message.id,
    role: message.role,
    content: message.content,
    createdAt: message.createdAt,
    createdByName: message.createdByName,
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

async function requireAdmin() {
  const currentUser = await getSessionUser();

  if (!currentUser) {
    return NextResponse.json({ error: "No autenticado" }, { status: 401 });
  }

  if (currentUser.role !== "admin") {
    return NextResponse.json({ error: "Acceso denegado" }, { status: 403 });
  }

  return currentUser;
}

export async function GET(request: Request) {
  const currentUser = await requireAdmin();

  if (currentUser instanceof NextResponse) {
    return currentUser;
  }

  const { searchParams } = new URL(request.url);
  const analysisId = parseAnalysisId(searchParams.get("analysisId"));

  if (!analysisId) {
    return NextResponse.json(
      { error: "Debes indicar un análisis válido." },
      { status: 422 },
    );
  }

  const analysis = getAiAnalysisHistoryEntryById(analysisId);

  if (!analysis) {
    return NextResponse.json(
      { error: "No se encontró el análisis seleccionado." },
      { status: 404 },
    );
  }

  const messages = listAiAnalysisChatMessagesByAnalysisId(analysisId).map(
    mapChatMessage,
  );

  return NextResponse.json({ messages });
}

export async function POST(request: Request) {
  const currentUser = await requireAdmin();

  if (currentUser instanceof NextResponse) {
    return currentUser;
  }

  let payload: ChatRequestPayload;

  try {
    payload = (await request.json()) as ChatRequestPayload;
  } catch {
    return NextResponse.json(
      { error: "No se recibió un cuerpo JSON válido." },
      { status: 400 },
    );
  }

  const rawId = parseAnalysisId(payload.analysisId);
  const rawQuestion = typeof payload.question === "string" ? payload.question : "";
  const question = rawQuestion.trim();

  if (!rawId) {
    return NextResponse.json(
      { error: "Debes indicar un análisis válido." },
      { status: 422 },
    );
  }

  if (!question) {
    return NextResponse.json(
      { error: "La pregunta no puede estar vacía." },
      { status: 422 },
    );
  }

  if (question.length > 500) {
    return NextResponse.json(
      { error: "La pregunta es demasiado larga (máximo 500 caracteres)." },
      { status: 422 },
    );
  }

  const entry = getAiAnalysisHistoryEntryById(rawId);

  if (!entry) {
    return NextResponse.json(
      { error: "No se encontró el análisis seleccionado." },
      { status: 404 },
    );
  }

  let summary: AiSummary;

  try {
    summary = sanitizeSummary(JSON.parse(entry.summaryJson));
  } catch {
    return NextResponse.json(
      { error: "No se pudo leer el contenido del análisis seleccionado." },
      { status: 500 },
    );
  }

  try {
    saveAiAnalysisChatMessageEntry({
      analysisId: rawId,
      userId: currentUser.id,
      role: "user",
      content: question,
    });

    const reports = listWorkReports();
    const contextLimit = Math.min(
      Math.max(entry.sourceReportsCount + 20, 20),
      80,
    );
    const reportContext = reports.slice(0, contextLimit);

    const answer = await answerQuestionAboutSummary(
      summary,
      question,
      reportContext,
    );

    saveAiAnalysisChatMessageEntry({
      analysisId: rawId,
      userId: currentUser.id,
      role: "assistant",
      content: answer,
    });

    const messages = listAiAnalysisChatMessagesByAnalysisId(rawId).map(
      mapChatMessage,
    );

    return NextResponse.json({ answer, messages });
  } catch (err: unknown) {
    const isConnectionError =
      err instanceof Error &&
      (err.message.includes("ECONNREFUSED") ||
        err.message.includes("fetch failed") ||
        err.message.includes("connect"));

    if (isConnectionError) {
      return NextResponse.json(
        {
          error:
            "No se pudo conectar con Ollama. Verifica que esté activo y accesible.",
        },
        { status: 503 },
      );
    }

    return NextResponse.json(
      {
        error:
          err instanceof Error
            ? err.message
            : "Error al responder la pregunta sobre el análisis IA.",
      },
      { status: 500 },
    );
  }
}

export async function DELETE(request: Request) {
  const currentUser = await requireAdmin();

  if (currentUser instanceof NextResponse) {
    return currentUser;
  }

  const { searchParams } = new URL(request.url);
  const analysisId = parseAnalysisId(searchParams.get("analysisId"));

  if (!analysisId) {
    return NextResponse.json(
      { error: "Debes indicar un análisis válido." },
      { status: 422 },
    );
  }

  const analysis = getAiAnalysisHistoryEntryById(analysisId);

  if (!analysis) {
    return NextResponse.json(
      { error: "No se encontró el análisis seleccionado." },
      { status: 404 },
    );
  }

  const deletedCount = deleteAiAnalysisChatMessagesByAnalysisId(analysisId);

  return NextResponse.json({ ok: true, deletedCount });
}
