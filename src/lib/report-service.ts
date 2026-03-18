import type {
  AnalysisSnapshot,
  ReportStatus,
  WorkReportInput,
} from "@/lib/reports";

async function parseSnapshotResponse(response: Response): Promise<AnalysisSnapshot> {
  if (!response.ok) {
    const payload = (await response.json().catch(() => null)) as
      | { message?: string }
      | null;

    throw new Error(payload?.message ?? "No fue posible procesar la solicitud.");
  }

  return (await response.json()) as AnalysisSnapshot;
}

export async function fetchDashboardSnapshot(): Promise<AnalysisSnapshot> {
  const response = await fetch("/api/analyze", {
    cache: "no-store",
    credentials: "include",
  });

  return parseSnapshotResponse(response);
}

export async function submitWorkReport(
  report: WorkReportInput,
): Promise<AnalysisSnapshot> {
  const response = await fetch("/api/analyze", {
    method: "POST",
    credentials: "include",
    headers: {
      "content-type": "application/json",
    },
    body: JSON.stringify(report),
  });

  return parseSnapshotResponse(response);
}

export async function updateWorkReportStatus(
  reportId: string,
  status: ReportStatus,
): Promise<AnalysisSnapshot> {
  const response = await fetch(`/api/reports/${encodeURIComponent(reportId)}/status`, {
    method: "PATCH",
    credentials: "include",
    headers: {
      "content-type": "application/json",
    },
    body: JSON.stringify({ status }),
  });

  return parseSnapshotResponse(response);
}