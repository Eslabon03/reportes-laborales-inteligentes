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
const OLLAMA_API_KEY = process.env.OLLAMA_API_KEY?.trim();

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

const QA_SYSTEM_PROMPT = `Eres un asistente que responde preguntas sobre un análisis operativo ya generado.
Solo puedes usar la información incluida en el contexto del análisis proporcionado.
Si la pregunta pide datos que no aparecen en ese análisis, responde claramente que no está en el análisis actual.
Responde en español, de forma breve, concreta y accionable.`;

function buildReportSummary(reports: WorkReport[]): string {
	const activeReports = reports
		.filter((report) => report.status !== "resuelto")
		.slice(0, 25);

	const lines = activeReports.map((report) =>
		[
			`- Cliente: ${report.clientName}`,
			`  Sitio: ${report.site}`,
			`  Técnico: ${report.employeeName}`,
			`  Fecha: ${report.serviceDate}`,
			`  Estado: ${report.status}`,
			`  Resumen: ${report.summary}`,
			`  Tareas: ${report.tasksPerformed}`,
			`  Pendiente: ${report.pendingActions}`,
			report.requiresQuote ? "  [Requiere cotización]" : "",
			report.requiresInvoice ? "  [Requiere facturación]" : "",
			report.followUpRequired ? "  [Requiere seguimiento]" : "",
			report.failureType ? `  Tipo de falla: ${report.failureType}` : "",
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
				.map((priority) => ({
					cliente:
						typeof priority.cliente === "string"
							? priority.cliente
							: "Desconocido",
					descripcion:
						typeof priority.descripcion === "string"
							? priority.descripcion
							: "",
					urgencia:
						priority.urgencia === "alta" ||
						priority.urgencia === "media" ||
						priority.urgencia === "baja"
							? priority.urgencia
							: "media",
				}))
		: [];

	const recomendaciones: string[] = Array.isArray(parsed.recomendaciones)
		? (parsed.recomendaciones as unknown[])
				.filter((recommendation): recommendation is string =>
					typeof recommendation === "string",
				)
				.slice(0, 5)
		: [];

	const riesgos: string[] = Array.isArray(parsed.riesgos)
		? (parsed.riesgos as unknown[])
				.filter((risk): risk is string => typeof risk === "string")
				.slice(0, 4)
		: [];

	return { resumen, prioridades, recomendaciones, riesgos };
}

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

function buildSummaryContext(summary: AiSummary): string {
	return JSON.stringify(summary, null, 2);
}

export async function generateAiSummary(
	reports: WorkReport[],
): Promise<AiSummary> {
	const ollama = new Ollama({ host: OLLAMA_HOST, fetch: makeFetch() });

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

export async function answerQuestionAboutSummary(
	summary: AiSummary,
	question: string,
): Promise<string> {
	const cleanQuestion = question.trim();

	if (!cleanQuestion) {
		throw new Error("La pregunta no puede estar vacía.");
	}

	const ollama = new Ollama({ host: OLLAMA_HOST, fetch: makeFetch() });

	const response = await ollama.chat({
		model: OLLAMA_MODEL,
		options: { temperature: 0.2 },
		messages: [
			{ role: "system", content: QA_SYSTEM_PROMPT },
			{
				role: "user",
				content: `Contexto del análisis:\n${buildSummaryContext(summary)}\n\nPregunta:\n${cleanQuestion}`,
			},
		],
	});

	const answer = response.message.content.trim();

	if (!answer) {
		return "No tengo información suficiente dentro de este análisis para responder esa pregunta.";
	}

	return answer;
}
