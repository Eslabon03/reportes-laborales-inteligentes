import { NextRequest, NextResponse } from "next/server";

import { getSessionUser } from "@/lib/auth";
import { markPendingAsCompleted } from "@/lib/db";

export const runtime = "nodejs";

type PendingType = "quote" | "invoice" | "followup";

function isPendingType(value: unknown): value is PendingType {
  return value === "quote" || value === "invoice" || value === "followup";
}

export async function POST(request: NextRequest) {
  const currentUser = await getSessionUser();

  if (!currentUser) {
    return NextResponse.json(
      { message: "Debes iniciar sesión para completar pendientes." },
      { status: 401 },
    );
  }

  if (currentUser.role !== "admin") {
    return NextResponse.json(
      { message: "Solo administradores pueden completar pendientes." },
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

  const body = payload as Record<string, unknown>;
  const reportId = Number.parseInt(String(body.reportId), 10);
  const pendingType = body.pendingType;
  const clientName = typeof body.clientName === "string" ? body.clientName.trim() : "";
  const employeeName =
    typeof body.employeeName === "string" ? body.employeeName.trim() : "";
  const reason = typeof body.reason === "string" ? body.reason.trim() : "";

  if (!Number.isInteger(reportId) || reportId <= 0) {
    return NextResponse.json(
      { message: "El reporte enviado no es válido." },
      { status: 422 },
    );
  }

  if (!isPendingType(pendingType)) {
    return NextResponse.json(
      { message: "El tipo de pendiente enviado no es válido." },
      { status: 422 },
    );
  }

  if (!clientName || !employeeName || !reason) {
    return NextResponse.json(
      { message: "Faltan campos requeridos para completar el pendiente." },
      { status: 422 },
    );
  }

  try {
    const completedPending = markPendingAsCompleted(
      reportId,
      pendingType,
      clientName,
      employeeName,
      reason,
      currentUser.id,
    );

    return NextResponse.json({ completedPending });
  } catch (error) {
    return NextResponse.json(
      {
        message:
          error instanceof Error
            ? error.message
            : "No fue posible completar el pendiente.",
      },
      { status: 400 },
    );
  }
}
