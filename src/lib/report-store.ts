import {
  createWorkReportRecord,
  listWorkReports,
  updateWorkReportStatusRecord,
  type SessionUser,
} from "@/lib/db";
import {
  analyzeReports,
  type AnalysisSnapshot,
  type WorkReport,
  type WorkReportInput,
} from "@/lib/reports";

export type ReportScope = {
  userId?: number;
};

export function listReports(scope: ReportScope = {}): WorkReport[] {
  return listWorkReports(scope.userId);
}

export function submitReport(
  input: WorkReportInput,
  author: SessionUser,
): WorkReport {
  return createWorkReportRecord(input, author);
}

export function getAnalysisSnapshot(scope: ReportScope = {}): AnalysisSnapshot {
  return analyzeReports(listReports(scope));
}

export function updateReportStatus(
  reportId: string,
  status: WorkReport["status"],
): WorkReport | null {
  const normalizedId = Number.parseInt(reportId, 10);

  if (!Number.isInteger(normalizedId) || normalizedId <= 0) {
    return null;
  }

  return updateWorkReportStatusRecord(normalizedId, status);
}