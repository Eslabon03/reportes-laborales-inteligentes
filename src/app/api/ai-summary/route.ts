import { NextResponse } from "next/server";

import {
  generateAiSummary,
  type AiSummary,
  type AiSummarySource,
} from "@/lib/ai-analysis";
import { getSessionUser } from "@/lib/auth";
import {
  listAiAnalysisHistory,
  listWorkReports,
  saveAiAnalysisHistoryEntry,
  type AiAnalysisHistoryEntry,
} from "@/lib/db";

export const runtime = "nodejs";
// Allow up to 3 minutes for Ollama to respond locally
export const maxDuration = 180;

const OLLAMA_HOST = process.env.OLLAMA_HOST ?? "http://127.0.0.1:11434";
const OLLAMA_MODEL = process.env.OLLAMA_MODEL ?? "qwen2.5:7b";

type ApiAiHistoryItem = {
  id: number;
  generatedAt: string;
  generatedByName: string;
  sourceReportsCount: number;
  summary: AiSummary;
  generationSource: AiSummarySource;
};

type StoredSummaryPayload = {
  summary: AiSummary;
  source: AiSummarySource;
};

function fallbackSummary(): AiSummary {
  return {
    resumen: "No se pudo recuperar el resumen de este análisis.",
    prioridades: [],
    recomendaciones: [],
    riesgos: [],
  };
}

function sanitizeSummary(candidate: unknown): AiSummary {
  if (!candidate || typeof candidate !== "object") {
    return fallbackSummary();
  }

  const parsed = candidate as Record<string, unknown>;

  return {
    resumen:
      typeof parsed.resumen === "string" && parsed.resumen.trim()
        ? parsed.resumen.trim()
        : fallbackSummary().resumen,
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

function parseStoredSummaryPayload(candidate: unknown): StoredSummaryPayload {
  if (!candidate || typeof candidate !== "object") {
    return { summary: fallbackSummary(), source: "fallback" };
  }

  const parsed = candidate as Record<string, unknown>;
  const hasWrappedShape = "summary" in parsed;

  if (hasWrappedShape) {
    const source = parsed.source === "fallback" ? "fallback" : "ai";
    return {
      summary: sanitizeSummary(parsed.summary),
      source,
    };
  }

  return {
    summary: sanitizeSummary(parsed),
    source: "ai",
  };
}

function mapHistoryItem(entry: AiAnalysisHistoryEntry): ApiAiHistoryItem {
  try {
    const parsed = JSON.parse(entry.summaryJson);
    const payload = parseStoredSummaryPayload(parsed);
    return {
      id: entry.id,
      generatedAt: entry.createdAt,
      generatedByName: entry.createdByName,
      sourceReportsCount: entry.sourceReportsCount,
      summary: payload.summary,
      generationSource: payload.source,
    };
  } catch {
    return {
      id: entry.id,
      generatedAt: entry.createdAt,
      generatedByName: entry.createdByName,
      sourceReportsCount: entry.sourceReportsCount,
      summary: fallbackSummary(),
      generationSource: "fallback",
    };
  }
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

export async function GET() {
  const currentUser = await requireAdmin();

  if (currentUser instanceof NextResponse) {
    return currentUser;
  }

  const history = listAiAnalysisHistory(12).map(mapHistoryItem);

  return NextResponse.json({ history });
}

export async function POST() {
  const currentUser = await requireAdmin();

  if (currentUser instanceof NextResponse) {
    return currentUser;
  }

  const reports = listWorkReports();

  if (reports.length === 0) {
    return NextResponse.json(
      { error: "No hay reportes para analizar." },
      { status: 422 },
    );
  }

  try {
    const generation = await generateAiSummary(reports);

    const saved = saveAiAnalysisHistoryEntry({
      createdByUserId: currentUser.id,
      sourceReportsCount: reports.length,
      summaryJson: JSON.stringify(generation),
    });

    return NextResponse.json({ analysis: mapHistoryItem(saved) });
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
            `No se pudo conectar con Ollama en ${OLLAMA_HOST}. Verifica que el servicio esté activo y accesible desde este servidor, y que el modelo '${OLLAMA_MODEL}' esté disponible (ollama pull ${OLLAMA_MODEL}).`,
        },
        { status: 503 },
      );
    }

    return NextResponse.json(
      {
        error:
          err instanceof Error
            ? err.message
            : "Error al generar el análisis con IA.",
      },
      { status: 500 },
    );
  }
}
