import { NextRequest, NextResponse } from "next/server";

import { getSessionUser } from "@/lib/auth";
import { assignFollowup, getUserById, listAllUsers } from "@/lib/db";

export const runtime = "nodejs";

function normalizeValue(value: string): string {
  return value
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .replace(/\s+/g, " ")
    .trim()
    .toLowerCase();
}

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
  const assignedToName =
    typeof body.assignedToName === "string" ? body.assignedToName.trim() : "";
  const clientName = typeof body.clientName === "string" ? body.clientName.trim() : "";
  const reason = typeof body.reason === "string" ? body.reason.trim() : "";

  if (!Number.isInteger(reportId) || reportId <= 0) {
    return NextResponse.json(
      { message: "El reporte enviado no es válido." },
      { status: 422 },
    );
  }

  if (
    (!Number.isInteger(assignedToUserId) || assignedToUserId <= 0)
    && !assignedToName
  ) {
    return NextResponse.json(
      { message: "Ingresa una persona válida para asignar el seguimiento." },
      { status: 422 },
    );
  }

  if (!clientName || !reason) {
    return NextResponse.json(
      { message: "Faltan datos para registrar la asignación." },
      { status: 422 },
    );
  }

  let resolvedAssignedToUserId: number | null = null;
  let resolvedAssignedToName = assignedToName;

  if (Number.isInteger(assignedToUserId) && assignedToUserId > 0) {
    const assignedUser = getUserById(assignedToUserId);

    if (!assignedUser) {
      return NextResponse.json(
        { message: "No se encontró el usuario asignado." },
        { status: 404 },
      );
    }

    resolvedAssignedToUserId = assignedUser.id;
    resolvedAssignedToName = resolvedAssignedToName || assignedUser.name;
  } else {
    const normalizedInput = normalizeValue(assignedToName);
    const matchedUser = listAllUsers().find((user) => {
      return (
        normalizeValue(user.name) === normalizedInput
        || normalizeValue(user.email) === normalizedInput
      );
    });

    if (matchedUser) {
      resolvedAssignedToUserId = matchedUser.id;
      resolvedAssignedToName = matchedUser.name;
    } else {
      resolvedAssignedToUserId = currentUser.id;
    }
  }

  if (!resolvedAssignedToUserId || resolvedAssignedToUserId <= 0) {
    return NextResponse.json(
      { message: "No fue posible resolver el responsable del seguimiento." },
      { status: 422 },
    );
  }

  try {
    const assignment = assignFollowup(
      reportId,
      resolvedAssignedToUserId,
      currentUser.id,
      clientName,
      reason,
      resolvedAssignedToName,
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
