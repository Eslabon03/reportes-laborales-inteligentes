import { NextRequest, NextResponse } from "next/server";

import { getSessionUser, isOwnerAccount } from "@/lib/auth";
import { getAnalysisSnapshot, updateReportStatus } from "@/lib/report-store";
import type { ReportStatus } from "@/lib/reports";

export const runtime = "nodejs";

type RouteParams = {
  params: Promise<{ id: string }>;
};

function isReportStatus(value: unknown): value is ReportStatus {
  return value === "abierto" || value === "en-proceso" || value === "resuelto";
}

export async function PATCH(request: NextRequest, { params }: RouteParams) {
  const currentUser = await getSessionUser();

  if (!currentUser) {
    return NextResponse.json(
      { message: "Debes iniciar sesión para actualizar reportes." },
      { status: 401 },
    );
  }

  if (currentUser.role !== "admin" || !isOwnerAccount(currentUser)) {
    return NextResponse.json(
      { message: "Solo el propietario del sistema puede modificar reportes." },
      { status: 403 },
    );
  }

  let payload: unknown;
  try {
    payload = await request.json();
  } catch {
    return NextResponse.json(
      { message: "No se recibió un cuerpo JSON válido." },
      { status: 400 },
    );
  }

  const status = (payload as Record<string, unknown>).status;

  if (!isReportStatus(status)) {
    return NextResponse.json(
      { message: "El estado enviado no es válido." },
      { status: 422 },
    );
  }

  const { id } = await params;
  const updatedReport = updateReportStatus(id, status);

  if (!updatedReport) {
    return NextResponse.json(
      { message: "No se encontró el reporte solicitado." },
      { status: 404 },
    );
  }

  return NextResponse.json(getAnalysisSnapshot());
}
