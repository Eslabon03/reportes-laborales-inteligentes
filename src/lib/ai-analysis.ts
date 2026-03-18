import { Ollama } from "ollama";

import type { WorkReport } from "@/lib/reports";

export type AiPriority = {
  cliente: string;
  descripcion: string;
  urgencia: "alta" | "media" | "baja";
};

export type AiSummary = {
  resumen: string;
  prioridades: AiPriority[];
  recomendaciones: string[];
  riesgos: string[];
};

const OLLAMA_HOST = process.env.OLLAMA_HOST ?? "http://127.0.0.1:11434";
const OLLAMA_MODEL = process.env.OLLAMA_MODEL ?? "llama3.2";

const SYSTEM_PROMPT = `Eres un asistente de análisis operativo para una empresa de servicios técnicos de campo.
Se te proporcionará una lista de reportes de trabajo en formato JSON.
Tu tarea es analizar los reportes y responder EXCLUSIVAMENTE con un objeto JSON válido, sin texto adicional al inicio o al final, con la siguiente estructura exacta:

{
  "resumen": "Resumen ejecutivo de la situación operativa en 2-3 oraciones claras.",
  "prioridades": [
    {
      "cliente": "Nombre del cliente",
      "descripcion": "Descripción concisa del pendiente o problema más urgente",
      "urgencia": "alta"
    }
  ],
  "recomendaciones": [
    "Acción concreta que el administrador debe tomar"
  ],
  "riesgos": [
    "Riesgo operativo o comercial identificado"
  ]
}

Reglas:
- urgencia solo puede ser: "alta", "media" o "baja"
- prioridades: máximo 6 elementos, ordenados de mayor a menor urgencia
- recomendaciones: máximo 5 acciones concretas
- riesgos: máximo 4 riesgos identificados
- Responde SOLO en español
- Responde SOLO con el JSON, sin texto antes ni después`;

function buildReportSummary(reports: WorkReport[]): string {
  // Only send open/in-progress reports to keep context manageable
  const activeReports = reports
    .filter((r) => r.status !== "resuelto")
    .slice(0, 25);

  const lines = activeReports.map((r) =>
    [
      `- Cliente: ${r.clientName}`,
      `  Sitio: ${r.site}`,
      `  Técnico: ${r.employeeName}`,
      `  Fecha: ${r.serviceDate}`,
      `  Estado: ${r.status}`,
      `  Resumen: ${r.summary}`,
      `  Tareas: ${r.tasksPerformed}`,
      `  Pendiente: ${r.pendingActions}`,
      r.requiresQuote ? "  [Requiere cotización]" : "",
      r.requiresInvoice ? "  [Requiere facturación]" : "",
      r.followUpRequired ? "  [Requiere seguimiento]" : "",
      r.failureType ? `  Tipo de falla: ${r.failureType}` : "",
    ]
      .filter(Boolean)
      .join("\n"),
  );

  if (lines.length === 0) {
    return "No hay reportes activos en este momento.";
  }

  return `Reportes activos (${activeReports.length} de ${reports.length} totales):\n\n${lines.join("\n\n")}`;
}

function parseAiResponse(raw: string): AiSummary {
  // Strip potential markdown code blocks if model adds them
  const cleaned = raw
    .replace(/^```json\s*/i, "")
    .replace(/^```\s*/i, "")
    .replace(/\s*```$/i, "")
    .trim();

  const parsed = JSON.parse(cleaned) as Record<string, unknown>;

  const resumen =
    typeof parsed.resumen === "string" && parsed.resumen.trim()
      ? parsed.resumen.trim()
      : "No se pudo generar un resumen.";

  const prioridades: AiPriority[] = Array.isArray(parsed.prioridades)
    ? (parsed.prioridades as Array<Record<string, unknown>>)
        .slice(0, 6)
        .map((p) => ({
          cliente: typeof p.cliente === "string" ? p.cliente : "Desconocido",
          descripcion:
            typeof p.descripcion === "string" ? p.descripcion : "",
          urgencia:
            p.urgencia === "alta" || p.urgencia === "media" || p.urgencia === "baja"
              ? p.urgencia
              : "media",
        }))
    : [];

  const recomendaciones: string[] = Array.isArray(parsed.recomendaciones)
    ? (parsed.recomendaciones as unknown[])
        .filter((r): r is string => typeof r === "string")
        .slice(0, 5)
    : [];

  const riesgos: string[] = Array.isArray(parsed.riesgos)
    ? (parsed.riesgos as unknown[])
        .filter((r): r is string => typeof r === "string")
        .slice(0, 4)
    : [];

  return { resumen, prioridades, recomendaciones, riesgos };
}

export async function generateAiSummary(
  reports: WorkReport[],
): Promise<AiSummary> {
  const ollama = new Ollama({ host: OLLAMA_HOST });

  const userContent = buildReportSummary(reports);

  const response = await ollama.chat({
    model: OLLAMA_MODEL,
    format: "json",
    options: { temperature: 0.2 },
    messages: [
      { role: "system", content: SYSTEM_PROMPT },
      {
        role: "user",
        content: `Analiza los siguientes reportes y devuelve el JSON de análisis operativo:\n\n${userContent}`,
      },
    ],
  });

  return parseAiResponse(response.message.content);
}
