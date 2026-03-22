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
const OLLAMA_MODEL = process.env.OLLAMA_MODEL ?? "qwen2.5:7b";
const OLLAMA_API_KEY = process.env.OLLAMA_API_KEY?.trim();
const OLLAMA_FALLBACK_HOST =
	process.env.OLLAMA_FALLBACK_HOST?.trim() ??
	(OLLAMA_HOST.includes(":11435")
		? OLLAMA_HOST.replace(":11435", ":11434")
		: "");
const OLLAMA_FALLBACK_API_KEY = process.env.OLLAMA_FALLBACK_API_KEY?.trim();

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
- En cada reporte hay dos actores distintos: "Empleado" = la persona de la empresa que realizó y envió el reporte; "Cliente" = la empresa o persona atendida. NUNCA los confundas.
- Cuando te pregunten "¿quién envió el reporte?" o "¿quiénes enviaron reporte?" responde con los nombres del campo "Empleado", NO con los del campo "Cliente".
- Prioriza evidencia de los reportes concretos para responder preguntas específicas (quién, cuándo, cliente, sitio, pendientes).
- Usa el resumen IA para complementar, no para reemplazar evidencia.
- Si faltan datos para responder con certeza, dilo explícitamente y sugiere la siguiente acción.
- Responde en español, **breve y conciso** (máximo 3-4 oraciones cortas).
- Si es una lista, usa viñetas breves, no párrafos.`;

export const QA_REPORT_LIMIT = 20; // Reducido para respuestas más rápidas
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

function hasMeaningfulSummary(summary: AiSummary): boolean {
	return (
		summary.resumen.trim().length > 0 &&
		summary.resumen !== "No se pudo generar un resumen."
	);
}

function buildFallbackAiSummaryFromReports(reports: WorkReport[]): AiSummary {
	if (reports.length === 0) {
		return {
			resumen: "No hay reportes cargados para analizar en este momento.",
			prioridades: [],
			recomendaciones: [
				"Registrar nuevos reportes para habilitar análisis operativo.",
			],
			riesgos: [],
		};
	}

	const activeReports = reports.filter((report) => report.status !== "resuelto");
	const source = activeReports.length > 0 ? activeReports : reports;

	const quoteCount = source.filter((report) => report.requiresQuote).length;
	const invoiceCount = source.filter((report) => report.requiresInvoice).length;
	const followUpCount = source.filter((report) => report.followUpRequired).length;

	const byClient = new Map<string, number>();
	for (const report of source) {
		byClient.set(report.clientName, (byClient.get(report.clientName) ?? 0) + 1);
	}

	const topClients = [...byClient.entries()]
		.sort((a, b) => b[1] - a[1])
		.slice(0, 3)
		.map(([cliente, count]) => ({
			cliente,
			descripcion: `${count} reporte${count !== 1 ? "s" : ""} activo${count !== 1 ? "s" : ""} con pendientes por cerrar.`,
			urgencia: count >= 3 ? "alta" : count === 2 ? "media" : "baja",
		})) as AiPriority[];

	const recomendaciones: string[] = [];
	if (quoteCount > 0) {
		recomendaciones.push(`Priorizar ${quoteCount} pendiente${quoteCount !== 1 ? "s" : ""} de cotización para evitar retrasos comerciales.`);
	}
	if (invoiceCount > 0) {
		recomendaciones.push(`Programar cierre de ${invoiceCount} pendiente${invoiceCount !== 1 ? "s" : ""} de facturación con validación de soporte.`);
	}
	if (followUpCount > 0) {
		recomendaciones.push(`Dar seguimiento a ${followUpCount} caso${followUpCount !== 1 ? "s" : ""} abierto${followUpCount !== 1 ? "s" : ""} para evitar acumulación operativa.`);
	}

	if (recomendaciones.length === 0) {
		recomendaciones.push("Revisar reportes recientes y confirmar cierre operativo con cada cliente.");
	}

	const riesgos: string[] = [];
	if (followUpCount >= 4) {
		riesgos.push("Riesgo de retrasos por alta carga de seguimientos pendientes.");
	}
	if (invoiceCount >= 3) {
		riesgos.push("Riesgo de flujo de caja por facturación pendiente acumulada.");
	}
	if (quoteCount >= 3) {
		riesgos.push("Riesgo de pérdida de oportunidades por cotizaciones sin enviar.");
	}

	const resumen =
		`Se analizaron ${source.length} reporte${source.length !== 1 ? "s" : ""} ${activeReports.length > 0 ? "activos" : "recientes"}. ` +
		`${followUpCount} requieren seguimiento, ${quoteCount} requieren cotización y ${invoiceCount} requieren facturación.`;

	return {
		resumen,
		prioridades: topClients,
		recomendaciones: recomendaciones.slice(0, 5),
		riesgos: riesgos.slice(0, 4),
	};
}

function makeFetch(apiKey?: string): typeof fetch {
	return (url: RequestInfo | URL, init?: RequestInit) => {
		const headers = new Headers(init?.headers);

		if (apiKey) {
			headers.set("Authorization", `Bearer ${apiKey}`);
		}

		if (OLLAMA_HOST.includes(".loca.lt")) {
			headers.set("Bypass-Tunnel-Reminder", "true");
		}

		return fetch(url, { ...init, headers });
	};
}

function isConnectionError(error: unknown): error is Error {
	if (!(error instanceof Error)) {
		return false;
	}

	return (
		error.message.includes("ECONNREFUSED") ||
		error.message.includes("fetch failed") ||
		error.message.includes("connect") ||
		error.message.includes("ETIMEDOUT")
	);
}

async function chatWithOllamaFailover(
	request: Parameters<Ollama["chat"]>[0],
) {
	const primary = new Ollama({
		host: OLLAMA_HOST,
		fetch: makeFetch(OLLAMA_API_KEY),
	});

	try {
		return await primary.chat(request);
	} catch (error) {
		if (
			!isConnectionError(error) ||
			!OLLAMA_FALLBACK_HOST ||
			OLLAMA_FALLBACK_HOST === OLLAMA_HOST
		) {
			throw error;
		}

		const errorMessage =
			error instanceof Error ? error.message : String(error);
		console.warn(
			`[ollama] Primary host failed (${OLLAMA_HOST}). Switching to fallback host (${OLLAMA_FALLBACK_HOST}). Error: ${errorMessage}`,
		);

		const fallback = new Ollama({
			host: OLLAMA_FALLBACK_HOST,
			fetch: makeFetch(OLLAMA_FALLBACK_API_KEY),
		});

		return fallback.chat(request);
	}
}

export function buildSummaryContext(summary: AiSummary): string {
	return JSON.stringify(summary);
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
			`${index + 1}) Empleado: ${report.employeeName}`,
			`Cliente: ${report.clientName}`,
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

function getTodayIsoCandidates(): string[] {
	const now = new Date();

	const localToday = now.toISOString().slice(0, 10);
	const utcToday = new Date(
		Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()),
	)
		.toISOString()
		.slice(0, 10);

	return Array.from(new Set([localToday, utcToday]));
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

const SPANISH_MONTHS: Record<string, number> = {
	enero: 1,
	febrero: 2,
	marzo: 3,
	abril: 4,
	mayo: 5,
	junio: 6,
	julio: 7,
	agosto: 8,
	septiembre: 9,
	octubre: 10,
	noviembre: 11,
	diciembre: 12,
};

/**
 * Intenta extraer una fecha ISO (YYYY-MM-DD) de una pregunta en español.
 * Soporta: "20 de marzo", "el 20 de marzo", "20 de marzo de 2026", "20/3", "20/03/2026".
 * Devuelve null si no encuentra una fecha reconocible.
 */
function parseSpanishDate(normalizedQuestion: string): { iso: string; label: string } | null {
	// Formato: "20 de marzo" / "20 de marzo de 2026"
	const textMatch = normalizedQuestion.match(
		/(\d{1,2})\s+de\s+(enero|febrero|marzo|abril|mayo|junio|julio|agosto|septiembre|octubre|noviembre|diciembre)(?:\s+de\s+(\d{4}))?/,
	);
	if (textMatch) {
		const day = parseInt(textMatch[1], 10);
		const month = SPANISH_MONTHS[textMatch[2]];
		const year = textMatch[3] ? parseInt(textMatch[3], 10) : new Date().getFullYear();
		if (month && day >= 1 && day <= 31) {
			const iso = `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
			const label = `el ${day} de ${textMatch[2]}${textMatch[3] ? ` de ${year}` : ""}`;
			return { iso, label };
		}
	}

	// Formato numérico: "20/3" / "20/03" / "20/03/2026"
	const numMatch = normalizedQuestion.match(/(\d{1,2})\/(\d{1,2})(?:\/(\d{4}))?/);
	if (numMatch) {
		const day = parseInt(numMatch[1], 10);
		const month = parseInt(numMatch[2], 10);
		const year = numMatch[3] ? parseInt(numMatch[3], 10) : new Date().getFullYear();
		if (month >= 1 && month <= 12 && day >= 1 && day <= 31) {
			const iso = `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
			const label = `el ${day}/${month}${numMatch[3] ? `/${year}` : ""}`;
			return { iso, label };
		}
	}

	return null;
}

function buildWhoReportedAnswer(
	reports: WorkReport[],
	dateLabel: string,
	dateCandidates: string[],
): string | null {
	const matchingReports = reports.filter((r) =>
		dateCandidates.includes(r.serviceDate),
	);

	if (matchingReports.length === 0) {
		return `No encontré reportes con fecha de ${dateLabel}.`;
	}

	const names = Array.from(
		new Set(matchingReports.map((r) => r.employeeName).filter(Boolean)),
	).sort();

	if (names.length === 0) {
		return `Hay ${matchingReports.length} reporte(s) de ${dateLabel} pero sin nombre de empleado registrado.`;
	}

	const list = names.map((n) => `• ${n}`).join("\n");
	return `Los empleados que enviaron reporte ${dateLabel} (${matchingReports.length} reporte${matchingReports.length !== 1 ? "s" : ""}):\n${list}`;
}

// ── Busca si la pregunta menciona el nombre de un empleado conocido ──────────
function findEmployeeInQuestion(
	normalizedQuestion: string,
	reports: WorkReport[],
): string | null {
	const uniqueNames = Array.from(
		new Set(reports.map((r) => r.employeeName).filter(Boolean)),
	);

	for (const name of uniqueNames) {
		const normalizedName = normalizeForMatch(name);
		// Nombre completo
		if (normalizedQuestion.includes(normalizedName)) return name;
		// Partes individuales (nombre o apellido), mínimo 4 chars para evitar falsos positivos
		const parts = normalizedName.split(/\s+/).filter((p) => p.length >= 4);
		if (parts.some((part) => normalizedQuestion.includes(part))) return name;
	}

	return null;
}

function buildEmployeeReportsAnswer(
	employee: string,
	reports: WorkReport[],
	dateLabel?: string,
	dateIsos?: string[],
): string {
	let filtered = reports.filter((r) => r.employeeName === employee);

	if (dateIsos && dateIsos.length > 0) {
		const byDate = filtered.filter((r) => dateIsos.includes(r.serviceDate));
		if (byDate.length === 0) {
			return `No encontré reportes de ${employee} para ${dateLabel ?? "esa fecha"}.`;
		}
		filtered = byDate;
	}

	if (filtered.length === 0) {
		return `No encontré reportes registrados para el empleado ${employee}.`;
	}

	const shown = filtered.slice(0, 8);
	const header = dateLabel
		? `Reportes de ${employee} (${dateLabel}):`
		: `Reportes de ${employee} (${filtered.length} en total):`;

	const lines = shown.map((r, i) => {
		let line = `${i + 1}. ${r.serviceDate} — ${r.clientName}`;
		if (r.site) line += ` | ${r.site}`;
		line += ` | Estado: ${r.status}`;
		if (r.pendingActions?.trim()) line += `\n   Pendiente: ${truncateText(r.pendingActions, 100)}`;
		return line;
	});

	const extra =
		filtered.length > shown.length
			? `\n...y ${filtered.length - shown.length} reporte(s) más.`
			: "";

	return `${header}\n${lines.join("\n")}${extra}`;
}

export function tryHeuristicAnswer(
	question: string,
	reports: WorkReport[],
): string | null {
	if (reports.length === 0) {
		return null;
	}

	const normalizedQuestion = normalizeForMatch(question);

	// ── Empleado por nombre específico ────────────────────────────────────────
	const matchedEmployee = findEmployeeInQuestion(normalizedQuestion, reports);
	if (matchedEmployee) {
		const parsedDate = parseSpanishDate(normalizedQuestion);
		if (parsedDate) {
			return buildEmployeeReportsAnswer(matchedEmployee, reports, parsedDate.label, [parsedDate.iso]);
		}
		if (normalizedQuestion.includes("hoy")) {
			return buildEmployeeReportsAnswer(matchedEmployee, reports, "hoy", getTodayIsoCandidates());
		}
		if (normalizedQuestion.includes("ayer")) {
			return buildEmployeeReportsAnswer(matchedEmployee, reports, "ayer", getYesterdayIsoCandidates());
		}
		return buildEmployeeReportsAnswer(matchedEmployee, reports);
	}

	// ── Detección amplia de "¿quién(es)?" ────────────────────────────────────
	// Cubre: quien, quienes, qué empleado, cuáles empleados, dime los que, etc.
	const asksWhoPerson =
		/(quien|quienes|que empleado|cuales empleados|cual empleado|dime (los|las|quienes)|nombres? de|lista(r)? (los|las)|empleados? que)/.test(
			normalizedQuestion,
		);

	if (asksWhoPerson) {
		// Primero intenta con fecha específica en la pregunta
		const parsedDate = parseSpanishDate(normalizedQuestion);
		if (parsedDate) {
			return buildWhoReportedAnswer(reports, parsedDate.label, [parsedDate.iso]);
		}
		// Sin fecha → intenta "hoy" o "ayer"
		if (normalizedQuestion.includes("hoy")) {
			return buildWhoReportedAnswer(reports, "hoy", getTodayIsoCandidates());
		}
		if (normalizedQuestion.includes("ayer")) {
			return buildWhoReportedAnswer(reports, "ayer", getYesterdayIsoCandidates());
		}
		// Sin indicador temporal → responde con todos los reportes disponibles
		const allNames = Array.from(
			new Set(reports.map((r) => r.employeeName).filter(Boolean)),
		).sort();
		if (allNames.length > 0) {
			const list = allNames.map((n) => `• ${n}`).join("\n");
			return `Empleados con reporte registrado (${reports.length} reporte${reports.length !== 1 ? "s" : ""} total):\n${list}`;
		}
	}

	// ── Fallback: pregunta con fecha específica + cualquier mención de reporte ─
	// Cubre frases sin "quien" explícito pero con fecha y contexto de reporte
	const mentionsReport =
		/(reporte|reportes|informe|informes|enviaron|envio|entregaron|registraron|subieron|mandaron)/.test(
			normalizedQuestion,
		);
	if (mentionsReport) {
		const parsedDate = parseSpanishDate(normalizedQuestion);
		if (parsedDate) {
			return buildWhoReportedAnswer(reports, parsedDate.label, [parsedDate.iso]);
		}
	}

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
	const userContent = buildReportSummary(reports);

	const request = {
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
	};

	const response = await chatWithOllamaFailover(request);
	let parsed = parseAiResponse(response.message.content);

	if (hasMeaningfulSummary(parsed)) {
		return parsed;
	}

	const retryResponse = await chatWithOllamaFailover({
		...request,
		messages: [
			{
				role: "system",
				content:
					`${SYSTEM_PROMPT}\n\nSi falta un campo, complétalo con texto breve útil. Nunca devuelvas valores vacíos en 'resumen'.`,
			},
			request.messages[1],
		],
	});

	parsed = parseAiResponse(retryResponse.message.content);

	if (hasMeaningfulSummary(parsed)) {
		return parsed;
	}

	return buildFallbackAiSummaryFromReports(reports);
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
			.slice(-4) // Últimos 4 mensajes (2 rondas de preguntas-respuesta)
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

	const reportsContext = buildReportsContext(reports);
	const historyContext = buildChatHistoryContext(chatHistory);

	const response = await chatWithOllamaFailover({
		model: OLLAMA_MODEL,
		options: { temperature: 0.2, num_ctx: 4096, num_predict: 300 },
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
