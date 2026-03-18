import { NextResponse } from "next/server";

import { clearSessionCookie } from "@/lib/auth";

export const runtime = "nodejs";

export async function POST(request: Request) {
  const response = NextResponse.redirect(new URL("/login", request.url), {
    status: 303,
  });

  const isHttpsRequest = new URL(request.url).protocol === "https:";
  clearSessionCookie(response, {
    secure: isHttpsRequest,
  });

  return response;
}
