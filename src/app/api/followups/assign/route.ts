import { NextRequest, NextResponse } from "next/server";

import { getSessionUser } from "@/lib/auth";
import { assignFollowup, getUserById } from "@/lib/db";

export const runtime = "nodejs";

export async function POST(request: NextRequest) {
  const currentUser = await getSessionUser();

  if (!currentUser) {
    return NextResponse.json(
      { message: "Debes iniciar sesión para asignar seguimientos." },
      { status: 401 },
    );
  }

  if (currentUser.role !== "admin") {
    return NextResponse.json(
      { message: "Solo administradores pueden asignar seguimientos." },
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
  const assignedToUserId = Number.parseInt(String(body.assignedToUserId), 10);
  const clientName = typeof body.clientName === "string" ? body.clientName.trim() : "";
  const reason = typeof body.reason === "string" ? body.reason.trim() : "";

  if (!Number.isInteger(reportId) || reportId <= 0) {
    return NextResponse.json(
      { message: "El reporte enviado no es válido." },
      { status: 422 },
    );
  }

  if (!Number.isInteger(assignedToUserId) || assignedToUserId <= 0) {
    return NextResponse.json(
      { message: "El usuario asignado no es válido." },
      { status: 422 },
    );
  }

  if (!clientName || !reason) {
    return NextResponse.json(
      { message: "Faltan datos para registrar la asignación." },
      { status: 422 },
    );
  }

  const assignedUser = getUserById(assignedToUserId);

  if (!assignedUser) {
    return NextResponse.json(
      { message: "No se encontró el usuario asignado." },
      { status: 404 },
    );
  }

  try {
    const assignment = assignFollowup(
      reportId,
      assignedToUserId,
      currentUser.id,
      clientName,
      reason,
    );

    return NextResponse.json({ assignment }, { status: 201 });
  } catch (error) {
    return NextResponse.json(
      {
        message:
          error instanceof Error
            ? error.message
            : "No fue posible asignar el seguimiento.",
      },
      { status: 400 },
    );
  }
}
