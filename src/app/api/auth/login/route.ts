import { NextResponse } from "next/server";

import {
  authenticateCredentials,
  createSessionToken,
  isSecureRequest,
  setSessionCookie,
} from "@/lib/auth";

export const runtime = "nodejs";

export async function POST(request: Request) {
  try {
    const payload = (await request.json()) as {
      email?: unknown;
      password?: unknown;
    };

    const email =
      typeof payload.email === "string" ? payload.email.trim().toLowerCase() : "";
    const password = typeof payload.password === "string" ? payload.password : "";

    if (!email || !password) {
      return NextResponse.json(
        {
          message: "Correo y contraseña son obligatorios.",
        },
        {
          status: 400,
        },
      );
    }

    const user = await authenticateCredentials(email, password);

    if (!user) {
      return NextResponse.json(
        {
          message: "Credenciales inválidas.",
        },
        {
          status: 401,
        },
      );
    }

    const token = await createSessionToken(user);
    const response = NextResponse.json({
      user,
    });

    setSessionCookie(response, token, {
      secure: isSecureRequest(request),
    });

    return response;
  } catch {
    return NextResponse.json(
      {
        message: "No fue posible iniciar sesión.",
      },
      {
        status: 400,
      },
    );
  }
}
