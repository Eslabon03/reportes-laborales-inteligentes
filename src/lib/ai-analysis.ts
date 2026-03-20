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

const QA_SYSTEM_PROMPT = `Eres un asistente operativo que responde preguntas sobre reportes de trabajo.
Recibirás dos contextos: (1) resumen IA y (2) reportes concretos.
Reglas:
- Prioriza evidencia de los reportes concretos para responder preguntas específicas (quién, cuándo, cliente, sitio, pendientes).
- Usa el resumen IA para complementar, no para reemplazar evidencia.
- Si faltan datos para responder con certeza, dilo explícitamente y sugiere la siguiente acción.
- Responde en español, **breve y conciso** (máximo 3-4 oraciones cortas).
- Si es una lista, usa viñetas breves, no párrafos.`;

export const QA_REPORT_LIMIT = 40; // Reducido de 80 para respuestas más rápidas
export const QA_TEXT_MAX_LENGTH = 140; // Reducido para contexto más compacto

const DELIVERY_ISSUE_PATTERN =
	/(no se envio producto|no se entrego producto|producto pendiente|pendiente de entrega|sin entrega de producto|no recibio producto|entrega pendiente de producto|producto no enviado)/i;

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

export function buildSummaryContext(summary: AiSummary): string {
	return JSON.stringify(summary, null, 2);
}

function normalizeForMatch(value: string): string {
	return value
		.toLowerCase()
		.normalize("NFD")
		.replace(/[\u0300-\u036f]/g, "");
}

function truncateText(value: string, maxLength = QA_TEXT_MAX_LENGTH): string {
	const clean = value.replace(/\s+/g, " ").trim();

	if (clean.length <= maxLength) {
		return clean;
	}

	return `${clean.slice(0, maxLength - 1)}…`;
}

export function buildReportsContext(reports: WorkReport[]): string {
	if (reports.length === 0) {
		return "No hay reportes disponibles para contexto adicional.";
	}

	const scopedReports = reports.slice(0, QA_REPORT_LIMIT);

	const lines = scopedReports.map((report, index) => {
		return [
			`${index + 1}) Cliente: ${report.clientName}`,
			`Fecha: ${report.serviceDate}`,
			`Sitio: ${report.site}`,
			`Estado: ${report.status}`,
			`Pendiente: ${truncateText(report.pendingActions)}`,
			`Resumen: ${truncateText(report.summary)}`,
			`Tareas: ${truncateText(report.tasksPerformed)}`,
			report.followUpRequired ? "Seguimiento: sí" : "Seguimiento: no",
		].join(" | ");
	});

	return `Reportes de contexto (${scopedReports.length} de ${reports.length}):\n${lines.join("\n")}`;
}

function getYesterdayIsoCandidates(): string[] {
	const now = new Date();

	const localYesterday = new Date(now);
	localYesterday.setDate(localYesterday.getDate() - 1);

	const utcYesterday = new Date(
		Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() - 1),
	);

	return Array.from(
		new Set([
			localYesterday.toISOString().slice(0, 10),
			utcYesterday.toISOString().slice(0, 10),
		]),
	);
}

function hasDeliveryIssue(report: WorkReport): boolean {
	const text = normalizeForMatch(
		[
			report.pendingActions,
			report.summary,
			report.tasksPerformed,
			report.failureType,
		].join(" "),
	);

	return DELIVERY_ISSUE_PATTERN.test(text);
}

function deliveryIssueSnippet(report: WorkReport): string {
	const fields = [report.pendingActions, report.summary, report.tasksPerformed];

	for (const field of fields) {
		const clean = field.trim();

		if (!clean) {
			continue;
		}

		if (DELIVERY_ISSUE_PATTERN.test(normalizeForMatch(clean))) {
			return truncateText(clean, 140);
		}
	}

	return truncateText(report.pendingActions || report.summary || "Sin detalle", 140);
}

export function tryHeuristicAnswer(
	question: string,
	reports: WorkReport[],
): string | null {
	if (reports.length === 0) {
		return null;
	}

	const normalizedQuestion = normalizeForMatch(question);
	const asksAboutProductDelivery =
		normalizedQuestion.includes("producto") &&
		/(envio|entrego|entrega|recibio|recibieron|recibir)/.test(
			normalizedQuestion,
		);

	const asksAboutYesterday = normalizedQuestion.includes("ayer");

	if (!asksAboutProductDelivery || !asksAboutYesterday) {
		return null;
	}

	const yesterdayCandidates = getYesterdayIsoCandidates();
	const yesterdayReports = reports.filter((report) =>
		yesterdayCandidates.includes(report.serviceDate),
	);

	if (yesterdayReports.length === 0) {
		return "No encontré reportes con fecha de ayer para validar esa entrega. Recomendación: registra o revisa reportes de ayer con estado y pendiente actualizados.";
	}

	const impacted = yesterdayReports.filter(hasDeliveryIssue);

	if (impacted.length === 0) {
		return "Revisé los reportes de ayer y no encontré evidencia explícita de producto no enviado. Si deseas, puedo listar los pendientes de ayer por cliente para confirmarlo.";
	}

	const visible = impacted.slice(0, 8);
	const dates = Array.from(new Set(impacted.map((report) => report.serviceDate))).sort();

	const lines = visible.map(
		(report, index) =>
			`${index + 1}. ${report.clientName} (${report.site}) — ${deliveryIssueSnippet(report)}`,
	);

	const extra =
		impacted.length > visible.length
			? `\nHay ${impacted.length - visible.length} casos adicionales en los reportes.`
			: "";

	return `Según los reportes de ayer (${dates.join(", ")}), los casos con posible producto no enviado son:\n${lines.join("\n")}${extra}\nSiguiente paso recomendado: confirmar con logística y actualizar el estado del pendiente por cliente.`;
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

export type AiChatMessage = {
	role: "user" | "assistant";
	content: string;
};

export function buildChatHistoryContext(messages: AiChatMessage[]): string {
	if (messages.length === 0) {
		return "";
	}

	const historyLines = messages
		.slice(-6) // Últimos 6 mensajes (3 rondas de preguntas-respuesta)
		.map((msg) => {
			const prefix = msg.role === "user" ? "Pregunta anterior" : "Mi respuesta previa";
			return `${prefix}:\n${msg.content}`;
		})
		.join("\n\n");

	return `Historial de conversación:\n${historyLines}\n\n`;
}

export async function answerQuestionAboutSummary(
	summary: AiSummary,
	question: string,
	reports: WorkReport[] = [],
	chatHistory: AiChatMessage[] = [],
): Promise<string> {
	const cleanQuestion = question.trim();

	if (!cleanQuestion) {
		throw new Error("La pregunta no puede estar vacía.");
	}

	const heuristicAnswer = tryHeuristicAnswer(cleanQuestion, reports);

	if (heuristicAnswer) {
		return heuristicAnswer;
	}

	const ollama = new Ollama({ host: OLLAMA_HOST, fetch: makeFetch() });
	const reportsContext = buildReportsContext(reports);
	const historyContext = buildChatHistoryContext(chatHistory);

	const response = await ollama.chat({
		model: OLLAMA_MODEL,
		options: { temperature: 0.2 },
		messages: [
			{ role: "system", content: QA_SYSTEM_PROMPT },
			{
				role: "user",
				content: `Contexto del análisis:\n${buildSummaryContext(summary)}\n\n${reportsContext}\n\n${historyContext}Pregunta actual:\n${cleanQuestion}`,
			},
		],
	});

	const answer = response.message.content.trim();

	if (!answer) {
		return "No tengo información suficiente dentro de este análisis para responder esa pregunta.";
	}

	return answer;
}
