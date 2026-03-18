import { AppNavigation } from "@/components/app-navigation";
import { ReportForm } from "@/components/report-form";
import { requireUser } from "@/lib/auth";
import { getAnalysisSnapshot } from "@/lib/report-store";

export const dynamic = "force-dynamic";

export default async function ReportesPage() {
  const currentUser = await requireUser({
    loginRedirectTo: "/login?next=%2Freportes",
  });

  const snapshot = getAnalysisSnapshot(
    currentUser.role === "admin" ? {} : { userId: currentUser.id },
  );

  return (
    <div className="min-h-screen pb-16">
      <AppNavigation currentHref="/reportes" user={currentUser} />

      <main className="mx-auto flex max-w-7xl flex-col gap-8 px-4 py-8 sm:px-6 lg:px-8">
        <div className="max-w-3xl space-y-4">
          <p className="font-mono text-xs uppercase tracking-[0.3em] text-slate-500">
            Flujo de captura
          </p>
          <h1 className="text-4xl font-semibold tracking-tight text-slate-950 sm:text-5xl">
            Carga reportes de trabajo desde el telefono o la computadora.
          </h1>
          <p className="text-base leading-8 text-slate-700 sm:text-lg">
            Diseñado para que varios empleados suban actividad de campo y el
            sistema convierta la informacion en pendientes visibles para
            administracion.
          </p>
        </div>

        <ReportForm initialSnapshot={snapshot} currentUser={currentUser} />
      </main>
    </div>
  );
}