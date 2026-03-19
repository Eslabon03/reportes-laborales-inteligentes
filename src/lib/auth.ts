import bcrypt from "bcryptjs";
import { SignJWT, jwtVerify } from "jose";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import type { NextResponse } from "next/server";

import {
  getUserByEmail,
  getUserById,
  type SessionUser,
  type UserRole,
} from "@/lib/db";

const SESSION_COOKIE_NAME = "reportes_session";
const SESSION_MAX_AGE_SECONDS = 60 * 60 * 24 * 7;

type RequireUserOptions = {
  roles?: UserRole[];
  loginRedirectTo?: string;
  unauthorizedRedirectTo?: string;
};

type SessionCookieOptions = {
  secure?: boolean;
};

function getForwardedProto(request: Request): string | null {
  const value = request.headers.get("x-forwarded-proto")?.trim();

  if (!value) {
    return null;
  }

  return value.split(",")[0]?.trim() || null;
}

function getSessionSecret(): Uint8Array {
  return new TextEncoder().encode(
    process.env.SESSION_SECRET ?? "cambia-esta-clave-en-produccion",
  );
}

export function isSecureRequest(request: Request): boolean {
  const forwardedProto = getForwardedProto(request);

  if (forwardedProto) {
    return forwardedProto === "https";
  }

  try {
    return new URL(request.url).protocol === "https:";
  } catch {
    return process.env.NODE_ENV === "production";
  }
}

export function isOwnerAccount(user: SessionUser): boolean {
  const ownerEmail = (
    process.env.REPORT_OWNER_EMAIL ?? "admin@reportes.local"
  )
    .trim()
    .toLowerCase();
  return user.email.toLowerCase() === ownerEmail;
}

function toSessionUser(user: {
  id: number;
  name: string;
  email: string;
  role: UserRole;
}): SessionUser {
  return {
    id: user.id,
    name: user.name,
    email: user.email,
    role: user.role,
  };
}

export async function authenticateCredentials(
  email: string,
  password: string,
): Promise<SessionUser | null> {
  const user = getUserByEmail(email.trim().toLowerCase());

  if (!user) {
    return null;
  }

  const isValid = bcrypt.compareSync(password, user.passwordHash);

  if (!isValid) {
    return null;
  }

  return toSessionUser(user);
}

export async function createSessionToken(user: SessionUser): Promise<string> {
  return new SignJWT({
    role: user.role,
    name: user.name,
    email: user.email,
  })
    .setProtectedHeader({ alg: "HS256" })
    .setSubject(String(user.id))
    .setIssuedAt()
    .setExpirationTime(`${SESSION_MAX_AGE_SECONDS}s`)
    .sign(getSessionSecret());
}

export function setSessionCookie(
  response: NextResponse,
  token: string,
  options: SessionCookieOptions = {},
): void {
  response.cookies.set({
    name: SESSION_COOKIE_NAME,
    value: token,
    httpOnly: true,
    sameSite: "lax",
    secure: options.secure ?? process.env.NODE_ENV === "production",
    path: "/",
    maxAge: SESSION_MAX_AGE_SECONDS,
  });
}

export function clearSessionCookie(
  response: NextResponse,
  options: SessionCookieOptions = {},
): void {
  response.cookies.set({
    name: SESSION_COOKIE_NAME,
    value: "",
    httpOnly: true,
    sameSite: "lax",
    secure: options.secure ?? process.env.NODE_ENV === "production",
    path: "/",
    maxAge: 0,
  });
}

export async function getSessionUser(): Promise<SessionUser | null> {
  const cookieStore = await cookies();
  const token = cookieStore.get(SESSION_COOKIE_NAME)?.value;

  if (!token) {
    return null;
  }

  try {
    const { payload } = await jwtVerify(token, getSessionSecret());
    const userId = Number(payload.sub);

    if (!Number.isInteger(userId) || userId <= 0) {
      return null;
    }

    const user = getUserById(userId);

    if (!user) {
      return null;
    }

    return toSessionUser(user);
  } catch {
    return null;
  }
}

export async function requireUser(
  options: RequireUserOptions = {},
): Promise<SessionUser> {
  const user = await getSessionUser();

  if (!user) {
    redirect(options.loginRedirectTo ?? "/login");
  }

  if (options.roles && !options.roles.includes(user.role)) {
    redirect(options.unauthorizedRedirectTo ?? "/");
  }

  return user;
}
