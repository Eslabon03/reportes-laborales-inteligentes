import type {
  AnalysisSnapshot,
  ReportStatus,
  WorkReportInput,
} from "@/lib/reports";

export type PendingType = "quote" | "invoice" | "followup";

export type CompletedPendingRecord = {
  id: number;
  reportId: number;
  pendingType: PendingType;
  clientName: string;
  employeeName: string;
  reason: string;
  completedByName: string;
  completedAt: string;
};

export type FollowupAssignmentRecord = {
  id: number;
  reportId: number;
  assignedToName: string;
  assignedToId: number;
  createdByName: string;
  clientName: string;
  reason: string;
  createdAt: string;
};

async function parseSnapshotResponse(response: Response): Promise<AnalysisSnapshot> {
  if (!response.ok) {
    const payload = (await response.json().catch(() => null)) as
      | { message?: string }
      | null;

    throw new Error(payload?.message ?? "No fue posible procesar la solicitud.");
  }

  return (await response.json()) as AnalysisSnapshot;
}

async function parseMutationError(response: Response): Promise<string> {
  const payload = (await response.json().catch(() => null)) as
    | { message?: string }
    | null;

  return payload?.message ?? "No fue posible procesar la solicitud.";
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

export async function completePending(payload: {
  reportId: string;
  pendingType: PendingType;
  clientName: string;
  employeeName: string;
  reason: string;
}): Promise<CompletedPendingRecord> {
  const response = await fetch("/api/pendings/complete", {
    method: "POST",
    credentials: "include",
    headers: {
      "content-type": "application/json",
    },
    body: JSON.stringify(payload),
  });

  const data = (await response.json().catch(() => null)) as
    | { completedPending?: CompletedPendingRecord; message?: string }
    | null;

  if (!response.ok || !data?.completedPending) {
    throw new Error(data?.message ?? (await parseMutationError(response)));
  }

  return data.completedPending;
}

export async function assignFollowupToUser(payload: {
  reportId: string;
  assignedToUserId?: number;
  assignedToName: string;
  clientName: string;
  reason: string;
}): Promise<FollowupAssignmentRecord> {
  const response = await fetch("/api/followups/assign", {
    method: "POST",
    credentials: "include",
    headers: {
      "content-type": "application/json",
    },
    body: JSON.stringify(payload),
  });

  const data = (await response.json().catch(() => null)) as
    | { assignment?: FollowupAssignmentRecord; message?: string }
    | null;

  if (!response.ok || !data?.assignment) {
    throw new Error(data?.message ?? (await parseMutationError(response)));
  }

  return data.assignment;
}