import { NextRequest, NextResponse } from "next/server";

import { createUser, listAllUsers } from "@/lib/db";
import { getSessionUser } from "@/lib/auth";

export const runtime = "nodejs";

export async function GET() {
  const currentUser = await getSessionUser();
  if (!currentUser) {
    return NextResponse.json({ error: "No autenticado" }, { status: 401 });
  }
  if (currentUser.role !== "admin") {
    return NextResponse.json({ error: "Acceso denegado" }, { status: 403 });
  }

  const users = listAllUsers();
  return NextResponse.json({ users });
}

export async function POST(request: NextRequest) {
  const currentUser = await getSessionUser();
  if (!currentUser) {
    return NextResponse.json({ error: "No autenticado" }, { status: 401 });
  }
  if (currentUser.role !== "admin") {
    return NextResponse.json({ error: "Acceso denegado" }, { status: 403 });
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "JSON inválido" }, { status: 400 });
  }

  const { name, email, password, role } = body as Record<string, unknown>;

  if (
    typeof name !== "string" ||
    typeof email !== "string" ||
    typeof password !== "string" ||
    (role !== "admin" && role !== "employee")
  ) {
    return NextResponse.json(
      { error: "Datos incompletos o inválidos" },
      { status: 400 },
    );
  }

  if (name.trim().length < 2) {
    return NextResponse.json(
      { error: "El nombre debe tener al menos 2 caracteres" },
      { status: 422 },
    );
  }

  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim())) {
    return NextResponse.json({ error: "Correo inválido" }, { status: 422 });
  }

  if (password.length < 8) {
    return NextResponse.json(
      { error: "La contraseña debe tener al menos 8 caracteres" },
      { status: 422 },
    );
  }

  try {
    const user = createUser({ name: name.trim(), email: email.trim(), password, role });
    return NextResponse.json({ user }, { status: 201 });
  } catch (err: unknown) {
    const message =
      err instanceof Error && err.message.toLowerCase().includes("unique")
        ? "Ya existe un usuario con ese correo"
        : "Error al crear el usuario";
    return NextResponse.json({ error: message }, { status: 409 });
  }
}
