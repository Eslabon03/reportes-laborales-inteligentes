import { AppNavigation } from "@/components/app-navigation";
import { DashboardView } from "@/components/dashboard-view";
import { isOwnerAccount, requireUser } from "@/lib/auth";
import {
  listAllUsers,
  listCompletedPendings,
  listFollowupAssignments,
} from "@/lib/db";
import { getAnalysisSnapshot } from "@/lib/report-store";

export const dynamic = "force-dynamic";

export default async function DashboardPage() {
  const currentUser = await requireUser({
    roles: ["admin"],
    loginRedirectTo: "/login?next=%2Fdashboard",
    unauthorizedRedirectTo: "/reportes",
  });

  const snapshot = getAnalysisSnapshot();
  const isOwner = isOwnerAccount(currentUser);
  const completedPendings = listCompletedPendings(200);
  const followupAssignments = listFollowupAssignments(200);
  const assignableUsers = listAllUsers().filter((user) => user.role === "employee");

  return (
    <div className="min-h-screen pb-16">
      <AppNavigation currentHref="/dashboard" user={currentUser} />

      <main className="mx-auto flex max-w-7xl flex-col gap-8 px-4 py-8 sm:px-6 lg:px-8">
        <div className="max-w-3xl space-y-4">
          <p className="font-mono text-xs uppercase tracking-[0.3em] text-slate-500">
            Vista administrativa
          </p>
          <h1 className="text-4xl font-semibold tracking-tight text-slate-950 sm:text-5xl">
            Revisa pendientes, recurrencias y carga operativa en un solo tablero.
          </h1>
          <p className="text-base leading-8 text-slate-700 sm:text-lg">
            Este dashboard concentra lo que se debe cotizar, facturar, seguir y
            atacar de raiz segun los reportes del equipo tecnico.
          </p>
        </div>

        <DashboardView
          initialSnapshot={snapshot}
          isOwner={isOwner}
          initialCompletedPendings={completedPendings}
          initialFollowupAssignments={followupAssignments}
          assignableUsers={assignableUsers}
        />
      </main>
    </div>
  );
}