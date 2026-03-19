import { NextResponse } from "next/server";

import { clearSessionCookie, isSecureRequest } from "@/lib/auth";

export const runtime = "nodejs";

export async function POST(request: Request) {
  const response = new NextResponse(null, {
    status: 303,
    headers: {
      Location: "/login",
    },
  });

  clearSessionCookie(response, {
    secure: isSecureRequest(request),
  });

  return response;
}
