import { NextRequest, NextResponse } from "next/server";

import { getUserById, updateUser, deleteUser } from "@/lib/db";
import { getSessionUser } from "@/lib/auth";

export const runtime = "nodejs";

type RouteParams = { params: Promise<{ id: string }> };

async function authorizeAdmin() {
  const user = await getSessionUser();
  if (!user) return NextResponse.json({ error: "No autenticado" }, { status: 401 });
  if (user.role !== "admin") return NextResponse.json({ error: "Acceso denegado" }, { status: 403 });
  return user;
}

export async function PATCH(request: NextRequest, { params }: RouteParams) {
  const currentUser = await authorizeAdmin();
  if (currentUser instanceof NextResponse) return currentUser;

  const { id: rawId } = await params;
  const id = parseInt(rawId, 10);
  if (isNaN(id)) {
    return NextResponse.json({ error: "ID inválido" }, { status: 400 });
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "JSON inválido" }, { status: 400 });
  }

  const { name, email, role, password } = body as Record<string, unknown>;

  if (
    role !== undefined &&
    role !== "admin" &&
    role !== "employee"
  ) {
    return NextResponse.json({ error: "Rol inválido" }, { status: 422 });
  }

  if (typeof name === "string" && name.trim().length < 2) {
    return NextResponse.json(
      { error: "El nombre debe tener al menos 2 caracteres" },
      { status: 422 },
    );
  }

  if (
    typeof email === "string" &&
    !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim())
  ) {
    return NextResponse.json({ error: "Correo inválido" }, { status: 422 });
  }

  if (typeof password === "string" && password.length < 8) {
    return NextResponse.json(
      { error: "La contraseña debe tener al menos 8 caracteres" },
      { status: 422 },
    );
  }

  try {
    const updated = updateUser(id, {
      name: typeof name === "string" ? name : undefined,
      email: typeof email === "string" ? email : undefined,
      role: role as "admin" | "employee" | undefined,
      password: typeof password === "string" ? password : undefined,
    });

    if (!updated) {
      return NextResponse.json({ error: "Usuario no encontrado" }, { status: 404 });
    }

    return NextResponse.json({ user: updated });
  } catch (err: unknown) {
    const message =
      err instanceof Error && err.message.toLowerCase().includes("unique")
        ? "Ya existe un usuario con ese correo"
        : "Error al actualizar el usuario";
    return NextResponse.json({ error: message }, { status: 409 });
  }
}

export async function DELETE(_request: NextRequest, { params }: RouteParams) {
  const currentUser = await authorizeAdmin();
  if (currentUser instanceof NextResponse) return currentUser;

  const { id: rawId } = await params;
  const id = parseInt(rawId, 10);
  if (isNaN(id)) {
    return NextResponse.json({ error: "ID inválido" }, { status: 400 });
  }

  // Prevent admin from deleting their own account
  if (id === currentUser.id) {
    return NextResponse.json(
      { error: "No puedes eliminar tu propia cuenta" },
      { status: 403 },
    );
  }

  const target = getUserById(id);
  if (!target) {
    return NextResponse.json({ error: "Usuario no encontrado" }, { status: 404 });
  }

  const deleted = deleteUser(id);
  if (!deleted) {
    return NextResponse.json({ error: "No se pudo eliminar el usuario" }, { status: 500 });
  }

  return new NextResponse(null, { status: 204 });
}
