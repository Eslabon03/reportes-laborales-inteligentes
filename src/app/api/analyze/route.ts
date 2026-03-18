import { NextResponse } from "next/server";

import { getSessionUser } from "@/lib/auth";
import { getAnalysisSnapshot, submitReport } from "@/lib/report-store";
import { parseWorkReportInput } from "@/lib/reports";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET() {
  const currentUser = await getSessionUser();

  if (!currentUser) {
    return NextResponse.json(
      {
        message: "Debes iniciar sesión para consultar reportes.",
      },
      {
        status: 401,
      },
    );
  }

  const scope = currentUser.role === "admin" ? {} : { userId: currentUser.id };

  return NextResponse.json(getAnalysisSnapshot(scope));
}

export async function POST(request: Request) {
  try {
    const currentUser = await getSessionUser();

    if (!currentUser) {
      return NextResponse.json(
        {
          message: "Debes iniciar sesión para registrar reportes.",
        },
        {
          status: 401,
        },
      );
    }

    const payload = (await request.json()) as unknown;
    const report = parseWorkReportInput({
      ...(payload as Record<string, unknown>),
      employeeName: currentUser.name,
    });

    submitReport(report, currentUser);

    const scope = currentUser.role === "admin" ? {} : { userId: currentUser.id };

    return NextResponse.json(getAnalysisSnapshot(scope), {
      status: 201,
    });
  } catch (error) {
    return NextResponse.json(
      {
        message:
          error instanceof Error
            ? error.message
            : "No fue posible registrar el reporte.",
      },
      {
        status: 400,
      },
    );
  }
}