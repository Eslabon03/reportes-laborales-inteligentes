import { mkdirSync } from "node:fs";
import path from "node:path";

import bcrypt from "bcryptjs";
import Database from "better-sqlite3";

import type { WorkReport, WorkReportInput } from "@/lib/reports";

export type UserRole = "admin" | "employee";

export type DbUser = {
  id: number;
  name: string;
  email: string;
  role: UserRole;
  passwordHash: string;
};

export type SessionUser = Omit<DbUser, "passwordHash">;

export type AiAnalysisHistoryEntry = {
  id: number;
  createdByUserId: number;
  createdByName: string;
  sourceReportsCount: number;
  summaryJson: string;
  createdAt: string;
};

type UserRow = {
  id: number;
  name: string;
  email: string;
  role: UserRole;
  password_hash: string;
};

type ReportRow = {
  id: number;
  user_id: number;
  employee_name: string;
  client_name: string;
  site: string;
  service_date: string;
  summary: string;
  tasks_performed: string;
  pending_actions: string;
  status: WorkReport["status"];
  requires_quote: number;
  requires_invoice: number;
  follow_up_required: number;
  failure_type: string;
};

type AiAnalysisHistoryRow = {
  id: number;
  created_by_user_id: number;
  created_by_name: string;
  source_reports_count: number;
  summary_json: string;
  created_at: string;
};

const databaseFilePath = process.env.SQLITE_DB_PATH?.trim()
  ? path.resolve(process.env.SQLITE_DB_PATH)
  : path.join(process.cwd(), "data", "reportes.db");

mkdirSync(path.dirname(databaseFilePath), { recursive: true });

const database = new Database(databaseFilePath);
database.pragma("journal_mode = WAL");
database.pragma("foreign_keys = ON");

database.exec(`
  CREATE TABLE IF NOT EXISTS app_meta (
    key TEXT PRIMARY KEY,
    value TEXT NOT NULL
  );

  CREATE TABLE IF NOT EXISTS users (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    email TEXT NOT NULL UNIQUE,
    password_hash TEXT NOT NULL,
    role TEXT NOT NULL CHECK (role IN ('admin', 'employee')),
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS reports (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL,
    employee_name TEXT NOT NULL,
    client_name TEXT NOT NULL,
    site TEXT NOT NULL,
    service_date TEXT NOT NULL,
    summary TEXT NOT NULL,
    tasks_performed TEXT NOT NULL,
    pending_actions TEXT NOT NULL,
    status TEXT NOT NULL CHECK (status IN ('abierto', 'en-proceso', 'resuelto')),
    requires_quote INTEGER NOT NULL DEFAULT 0,
    requires_invoice INTEGER NOT NULL DEFAULT 0,
    follow_up_required INTEGER NOT NULL DEFAULT 0,
    failure_type TEXT NOT NULL DEFAULT '',
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE RESTRICT
  );

  CREATE TABLE IF NOT EXISTS ai_analysis_history (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    created_by_user_id INTEGER NOT NULL,
    source_reports_count INTEGER NOT NULL DEFAULT 0,
    summary_json TEXT NOT NULL,
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    FOREIGN KEY (created_by_user_id) REFERENCES users(id) ON DELETE RESTRICT
  );

  CREATE INDEX IF NOT EXISTS idx_reports_user_id ON reports (user_id);
  CREATE INDEX IF NOT EXISTS idx_reports_service_date ON reports (service_date DESC);
  CREATE INDEX IF NOT EXISTS idx_reports_client_name ON reports (client_name);
  CREATE INDEX IF NOT EXISTS idx_ai_analysis_history_created_at ON ai_analysis_history (created_at DESC);
`);

const defaultUsers: Array<{
  name: string;
  email: string;
  password: string;
  role: UserRole;
}> = [
  {
    name: "Administrador General",
    email: "admin@reportes.local",
    password: "Admin123!",
    role: "admin",
  },
];

function rowToUser(row: UserRow): DbUser {
  return {
    id: row.id,
    name: row.name,
    email: row.email,
    role: row.role,
    passwordHash: row.password_hash,
  };
}

function rowToReport(row: ReportRow): WorkReport {
  return {
    id: String(row.id),
    employeeName: row.employee_name,
    clientName: row.client_name,
    site: row.site,
    serviceDate: row.service_date,
    summary: row.summary,
    tasksPerformed: row.tasks_performed,
    pendingActions: row.pending_actions,
    status: row.status,
    requiresQuote: row.requires_quote === 1,
    requiresInvoice: row.requires_invoice === 1,
    followUpRequired: row.follow_up_required === 1,
    failureType: row.failure_type,
  };
}

function rowToAiAnalysisHistory(
  row: AiAnalysisHistoryRow,
): AiAnalysisHistoryEntry {
  return {
    id: row.id,
    createdByUserId: row.created_by_user_id,
    createdByName: row.created_by_name,
    sourceReportsCount: row.source_reports_count,
    summaryJson: row.summary_json,
    createdAt: row.created_at,
  };
}

function seedDatabase(): void {
  const insertUserStatement = database.prepare(
    `
      INSERT OR IGNORE INTO users (name, email, password_hash, role)
      VALUES (@name, @email, @passwordHash, @role)
    `,
  );

  const seedTransaction = database.transaction(() => {
    for (const user of defaultUsers) {
      insertUserStatement.run({
        name: user.name,
        email: user.email,
        passwordHash: bcrypt.hashSync(user.password, 10),
        role: user.role,
      });
    }
  });

  seedTransaction();
}

seedDatabase();

export function listAllUsers(): SessionUser[] {
  const rows = database
    .prepare(
      `SELECT id, name, email, role FROM users ORDER BY role DESC, name ASC`,
    )
    .all() as Array<{ id: number; name: string; email: string; role: UserRole }>;

  return rows.map((row) => ({
    id: row.id,
    name: row.name,
    email: row.email,
    role: row.role,
  }));
}

export type CreateUserInput = {
  name: string;
  email: string;
  password: string;
  role: UserRole;
};

export function createUser(input: CreateUserInput): SessionUser {
  const passwordHash = bcrypt.hashSync(input.password, 10);
  const result = database
    .prepare(
      `INSERT INTO users (name, email, password_hash, role)
       VALUES (@name, @email, @passwordHash, @role)`,
    )
    .run({
      name: input.name.trim(),
      email: input.email.trim().toLowerCase(),
      passwordHash,
      role: input.role,
    });

  const insertedId = Number(result.lastInsertRowid);
  const user = getUserById(insertedId);
  if (!user) throw new Error("No se pudo recuperar el usuario recién creado.");
  return { id: user.id, name: user.name, email: user.email, role: user.role };
}

export type UpdateUserInput = {
  name?: string;
  email?: string;
  role?: UserRole;
  password?: string;
};

export function updateUser(
  id: number,
  input: UpdateUserInput,
): SessionUser | null {
  const existing = getUserById(id);
  if (!existing) return null;

  const name = input.name?.trim() ?? existing.name;
  const email = input.email?.trim().toLowerCase() ?? existing.email;
  const role = input.role ?? existing.role;
  const passwordHash = input.password
    ? bcrypt.hashSync(input.password, 10)
    : existing.passwordHash;

  database
    .prepare(
      `UPDATE users SET name = @name, email = @email, role = @role,
       password_hash = @passwordHash WHERE id = @id`,
    )
    .run({ name, email, role, passwordHash, id });

  return { id, name, email, role };
}

export function deleteUser(id: number): boolean {
  const result = database.prepare(`DELETE FROM users WHERE id = ?`).run(id);
  return result.changes > 0;
}

export function getUserByEmail(email: string): DbUser | null {
  const row = database
    .prepare(
      `
        SELECT id, name, email, role, password_hash
        FROM users
        WHERE lower(email) = lower(?)
        LIMIT 1
      `,
    )
    .get(email.trim()) as UserRow | undefined;

  return row ? rowToUser(row) : null;
}

export function getUserById(id: number): DbUser | null {
  const row = database
    .prepare(
      `
        SELECT id, name, email, role, password_hash
        FROM users
        WHERE id = ?
        LIMIT 1
      `,
    )
    .get(id) as UserRow | undefined;

  return row ? rowToUser(row) : null;
}

export function saveAiAnalysisHistoryEntry(input: {
  createdByUserId: number;
  sourceReportsCount: number;
  summaryJson: string;
}): AiAnalysisHistoryEntry {
  const insertResult = database
    .prepare(
      `
        INSERT INTO ai_analysis_history (
          created_by_user_id,
          source_reports_count,
          summary_json
        )
        VALUES (@createdByUserId, @sourceReportsCount, @summaryJson)
      `,
    )
    .run({
      createdByUserId: input.createdByUserId,
      sourceReportsCount: input.sourceReportsCount,
      summaryJson: input.summaryJson,
    });

  const insertedId = Number(insertResult.lastInsertRowid);

  const insertedRow = database
    .prepare(
      `
        SELECT
          h.id,
          h.created_by_user_id,
          u.name AS created_by_name,
          h.source_reports_count,
          h.summary_json,
          h.created_at
        FROM ai_analysis_history h
        JOIN users u ON u.id = h.created_by_user_id
        WHERE h.id = ?
        LIMIT 1
      `,
    )
    .get(insertedId) as AiAnalysisHistoryRow | undefined;

  if (!insertedRow) {
    throw new Error("No se pudo recuperar el análisis IA recién guardado.");
  }

  return rowToAiAnalysisHistory(insertedRow);
}

export function listAiAnalysisHistory(limit = 10): AiAnalysisHistoryEntry[] {
  const safeLimit = Math.min(Math.max(Math.trunc(limit), 1), 50);

  const rows = database
    .prepare(
      `
        SELECT
          h.id,
          h.created_by_user_id,
          u.name AS created_by_name,
          h.source_reports_count,
          h.summary_json,
          h.created_at
        FROM ai_analysis_history h
        JOIN users u ON u.id = h.created_by_user_id
        ORDER BY h.created_at DESC, h.id DESC
        LIMIT ?
      `,
    )
    .all(safeLimit) as AiAnalysisHistoryRow[];

  return rows.map(rowToAiAnalysisHistory);
}

export function listWorkReports(userId?: number): WorkReport[] {
  const rows =
    typeof userId === "number"
      ? (database
          .prepare(
            `
              SELECT
                id,
                user_id,
                employee_name,
                client_name,
                site,
                service_date,
                summary,
                tasks_performed,
                pending_actions,
                status,
                requires_quote,
                requires_invoice,
                follow_up_required,
                failure_type
              FROM reports
              WHERE user_id = ?
              ORDER BY service_date DESC, id DESC
            `,
          )
          .all(userId) as ReportRow[])
      : (database
          .prepare(
            `
              SELECT
                id,
                user_id,
                employee_name,
                client_name,
                site,
                service_date,
                summary,
                tasks_performed,
                pending_actions,
                status,
                requires_quote,
                requires_invoice,
                follow_up_required,
                failure_type
              FROM reports
              ORDER BY service_date DESC, id DESC
            `,
          )
          .all() as ReportRow[]);

  return rows.map(rowToReport);
}

export function updateWorkReportStatusRecord(
  reportId: number,
  status: WorkReport["status"],
): WorkReport | null {
  const updateResult = database
    .prepare(
      `
        UPDATE reports
        SET status = @status
        WHERE id = @reportId
      `,
    )
    .run({ reportId, status });

  if (updateResult.changes === 0) {
    return null;
  }

  const updatedRow = database
    .prepare(
      `
        SELECT
          id,
          user_id,
          employee_name,
          client_name,
          site,
          service_date,
          summary,
          tasks_performed,
          pending_actions,
          status,
          requires_quote,
          requires_invoice,
          follow_up_required,
          failure_type
        FROM reports
        WHERE id = ?
        LIMIT 1
      `,
    )
    .get(reportId) as ReportRow | undefined;

  if (!updatedRow) {
    throw new Error("No fue posible recuperar el reporte tras actualizar estado.");
  }

  return rowToReport(updatedRow);
}

export function createWorkReportRecord(
  input: WorkReportInput,
  author: SessionUser,
): WorkReport {
  const insertStatement = database.prepare(`
    INSERT INTO reports (
      user_id,
      employee_name,
      client_name,
      site,
      service_date,
      summary,
      tasks_performed,
      pending_actions,
      status,
      requires_quote,
      requires_invoice,
      follow_up_required,
      failure_type
    ) VALUES (
      @userId,
      @employeeName,
      @clientName,
      @site,
      @serviceDate,
      @summary,
      @tasksPerformed,
      @pendingActions,
      @status,
      @requiresQuote,
      @requiresInvoice,
      @followUpRequired,
      @failureType
    )
  `);

  const result = insertStatement.run({
    userId: author.id,
    employeeName: author.name,
    clientName: input.clientName,
    site: input.site,
    serviceDate: input.serviceDate,
    summary: input.summary,
    tasksPerformed: input.tasksPerformed,
    pendingActions: input.pendingActions,
    status: input.status,
    requiresQuote: input.requiresQuote ? 1 : 0,
    requiresInvoice: input.requiresInvoice ? 1 : 0,
    followUpRequired: input.followUpRequired ? 1 : 0,
    failureType: input.failureType,
  });

  const insertedId = Number(result.lastInsertRowid);

  const insertedRow = database
    .prepare(
      `
        SELECT
          id,
          user_id,
          employee_name,
          client_name,
          site,
          service_date,
          summary,
          tasks_performed,
          pending_actions,
          status,
          requires_quote,
          requires_invoice,
          follow_up_required,
          failure_type
        FROM reports
        WHERE id = ?
        LIMIT 1
      `,
    )
    .get(insertedId) as ReportRow | undefined;

  if (!insertedRow) {
    throw new Error("No fue posible recuperar el reporte recien guardado.");
  }

  return rowToReport(insertedRow);
}
