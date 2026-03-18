export type ReportStatus = "abierto" | "en-proceso" | "resuelto";

export type WorkReport = {
  id: string;
  employeeName: string;
  clientName: string;
  site: string;
  serviceDate: string;
  summary: string;
  tasksPerformed: string;
  pendingActions: string;
  status: ReportStatus;
  requiresQuote: boolean;
  requiresInvoice: boolean;
  followUpRequired: boolean;
  failureType: string;
};

export type WorkReportInput = Omit<WorkReport, "id"> & {
  id?: string;
};

export type PendingItem = {
  reportId: string;
  clientName: string;
  employeeName: string;
  site: string;
  serviceDate: string;
  reason: string;
  status: ReportStatus;
};

export type RecurringClientFailure = {
  clientName: string;
  failureType: string;
  occurrences: number;
  openReports: number;
  latestReport: string;
};

export type AnalysisSnapshot = {
  generatedAt: string;
  totals: {
    reports: number;
    openReports: number;
    quotes: number;
    invoices: number;
    followUps: number;
    recurringClients: number;
    employees: number;
    clients: number;
  };
  pendingQuotes: PendingItem[];
  pendingInvoices: PendingItem[];
  followUps: PendingItem[];
  recurringClientFailures: RecurringClientFailure[];
  recentReports: WorkReport[];
  reports: WorkReport[];
};

const QUOTE_PATTERN = /(cotiz|presupuest|quote|precio|propuesta)/i;
const INVOICE_PATTERN = /(factur|cobro|invoice|pago pendiente|orden de compra)/i;
const FOLLOW_UP_PATTERN = /(seguimiento|llamar|visita|agendar|confirmar|revisar|dar seguimiento|pendiente)/i;

const FAILURE_PATTERNS: Array<{ pattern: RegExp; label: string }> = [
  { pattern: /(sensor|sonda|temperatura)/i, label: "Sensor o temperatura" },
  { pattern: /(fuga|filtracion|goteo)/i, label: "Fuga o filtracion" },
  { pattern: /(presion|compresor|aire)/i, label: "Presion o compresion" },
  { pattern: /(red|conexion|internet|comunicacion)/i, label: "Conexion o red" },
  { pattern: /(motor|bomba)/i, label: "Motor o bomba" },
  { pattern: /(tablero|energia|electrico|voltaje)/i, label: "Energia o tablero" },
];

function ensureString(value: unknown, fieldName: string): string {
  if (typeof value !== "string") {
    throw new Error(`El campo ${fieldName} debe ser texto.`);
  }

  const normalized = value.trim();

  if (!normalized) {
    throw new Error(`El campo ${fieldName} es obligatorio.`);
  }

  return normalized;
}

function ensureBoolean(value: unknown, fieldName: string): boolean {
  if (typeof value !== "boolean") {
    throw new Error(`El campo ${fieldName} debe ser verdadero o falso.`);
  }

  return value;
}

function ensureStatus(value: unknown): ReportStatus {
  if (value === "abierto" || value === "en-proceso" || value === "resuelto") {
    return value;
  }

  throw new Error("El estado del reporte no es valido.");
}

function ensureServiceDate(value: unknown): string {
  const serviceDate = ensureString(value, "serviceDate");

  if (!/^\d{4}-\d{2}-\d{2}$/.test(serviceDate)) {
    throw new Error("La fecha debe usar el formato AAAA-MM-DD.");
  }

  return serviceDate;
}

function collectSearchText(report: WorkReport | WorkReportInput): string {
  return [
    report.summary,
    report.tasksPerformed,
    report.pendingActions,
    report.failureType,
  ]
    .join(" ")
    .toLowerCase();
}

function extractReasonFromReport(
  report: WorkReport | WorkReportInput,
  pattern: RegExp,
): string {
  // Prioridad: pendingActions → summary → tasksPerformed → failureType
  const fields = [
    report.pendingActions,
    report.summary,
    report.tasksPerformed,
    report.failureType,
  ];

  for (const field of fields) {
    if (!field || !pattern.test(field)) {
      continue;
    }

    // Extrae la primera oración/frase que contiene la palabra clave
    const sentences = field.match(/[^.!?]*[.!?]+/g) || [field];
    const matching = sentences.find((s) => pattern.test(s));

    if (matching) {
      const extracted = matching.trim();
      return extracted.length > 120 ? `${extracted.slice(0, 117)}...` : extracted;
    }
  }

  return "Detectado en el reporte";
}

function buildPendingItem(report: WorkReport, reason: string): PendingItem {
  return {
    reportId: report.id,
    clientName: report.clientName,
    employeeName: report.employeeName,
    site: report.site,
    serviceDate: report.serviceDate,
    reason,
    status: report.status,
  };
}

function inferFailureType(report: WorkReport): string | null {
  if (report.failureType.trim()) {
    return report.failureType.trim();
  }

  const searchableText = collectSearchText(report);

  for (const entry of FAILURE_PATTERNS) {
    if (entry.pattern.test(searchableText)) {
      return entry.label;
    }
  }

  return null;
}

function countDistinct(values: string[]): number {
  return new Set(values.filter(Boolean)).size;
}

export function parseWorkReportInput(value: unknown): WorkReportInput {
  if (!value || typeof value !== "object") {
    throw new Error("No se recibio un reporte valido.");
  }

  const candidate = value as Record<string, unknown>;

  return {
    id: typeof candidate.id === "string" ? candidate.id.trim() : undefined,
    employeeName: ensureString(candidate.employeeName, "employeeName"),
    clientName: ensureString(candidate.clientName, "clientName"),
    site: ensureString(candidate.site, "site"),
    serviceDate: ensureServiceDate(candidate.serviceDate),
    summary: ensureString(candidate.summary, "summary"),
    tasksPerformed: ensureString(candidate.tasksPerformed, "tasksPerformed"),
    pendingActions: ensureString(candidate.pendingActions, "pendingActions"),
    status: ensureStatus(candidate.status),
    requiresQuote: ensureBoolean(candidate.requiresQuote, "requiresQuote"),
    requiresInvoice: ensureBoolean(candidate.requiresInvoice, "requiresInvoice"),
    followUpRequired: ensureBoolean(
      candidate.followUpRequired,
      "followUpRequired",
    ),
    failureType:
      typeof candidate.failureType === "string" ? candidate.failureType.trim() : "",
  };
}

export function createWorkReport(input: WorkReportInput): WorkReport {
  return {
    ...input,
    id:
      input.id && input.id.trim()
        ? input.id.trim()
        : `rep-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
  };
}

const MONTHS = [
  "ene", "feb", "mar", "abr", "may", "jun",
  "jul", "ago", "sep", "oct", "nov", "dic",
];

export function formatDisplayDate(value: string): string {
  const d = new Date(`${value}T12:00:00`);
  return `${d.getDate()} ${MONTHS[d.getMonth()]} ${d.getFullYear()}`;
}

export function getStatusTone(status: ReportStatus):
  | "rose"
  | "amber"
  | "emerald" {
  switch (status) {
    case "abierto":
      return "rose";
    case "en-proceso":
      return "amber";
    case "resuelto":
      return "emerald";
  }
}

export function analyzeReports(reports: WorkReport[]): AnalysisSnapshot {
  const orderedReports = [...reports].sort((left, right) =>
    right.serviceDate.localeCompare(left.serviceDate),
  );

  const pendingQuotes = orderedReports
    .filter((report) => {
      if (report.status === "resuelto") {
        return false;
      }

      return report.requiresQuote || QUOTE_PATTERN.test(collectSearchText(report));
    })
    .map((report) =>
      buildPendingItem(
        report,
        extractReasonFromReport(report, QUOTE_PATTERN),
      ),
    );

  const pendingInvoices = orderedReports
    .filter((report) => {
      if (report.status === "resuelto") {
        return false;
      }

      return (
        report.requiresInvoice || INVOICE_PATTERN.test(collectSearchText(report))
      );
    })
    .map((report) =>
      buildPendingItem(
        report,
        extractReasonFromReport(report, INVOICE_PATTERN),
      ),
    );

  const followUps = orderedReports
    .filter((report) => {
      if (report.status === "resuelto") {
        return false;
      }

      return (
        report.followUpRequired || FOLLOW_UP_PATTERN.test(collectSearchText(report))
      );
    })
    .map((report) =>
      buildPendingItem(
        report,
        extractReasonFromReport(report, FOLLOW_UP_PATTERN),
      ),
    );

  const recurringMap = new Map<string, RecurringClientFailure>();

  for (const report of orderedReports) {
    const failureType = inferFailureType(report);

    if (!failureType) {
      continue;
    }

    const key = `${report.clientName}::${failureType}`;
    const current = recurringMap.get(key);

    if (!current) {
      recurringMap.set(key, {
        clientName: report.clientName,
        failureType,
        occurrences: 1,
        openReports: report.status === "resuelto" ? 0 : 1,
        latestReport: report.serviceDate,
      });
      continue;
    }

    current.occurrences += 1;
    current.openReports += report.status === "resuelto" ? 0 : 1;

    if (report.serviceDate > current.latestReport) {
      current.latestReport = report.serviceDate;
    }
  }

  const recurringClientFailures = [...recurringMap.values()]
    .filter((item) => item.occurrences >= 2)
    .sort((left, right) => {
      if (right.occurrences !== left.occurrences) {
        return right.occurrences - left.occurrences;
      }

      return right.latestReport.localeCompare(left.latestReport);
    });

  return {
    generatedAt: new Date().toISOString(),
    totals: {
      reports: orderedReports.length,
      openReports: orderedReports.filter((report) => report.status !== "resuelto")
        .length,
      quotes: pendingQuotes.length,
      invoices: pendingInvoices.length,
      followUps: followUps.length,
      recurringClients: countDistinct(
        recurringClientFailures.map((item) => item.clientName),
      ),
      employees: countDistinct(orderedReports.map((report) => report.employeeName)),
      clients: countDistinct(orderedReports.map((report) => report.clientName)),
    },
    pendingQuotes,
    pendingInvoices,
    followUps,
    recurringClientFailures,
    recentReports: orderedReports.slice(0, 6),
    reports: orderedReports,
  };
}