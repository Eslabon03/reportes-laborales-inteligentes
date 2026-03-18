import { AppNavigation } from "@/components/app-navigation";
import { UserManagementPanel } from "@/components/user-management-panel";
import { requireUser } from "@/lib/auth";
import { listAllUsers } from "@/lib/db";

export const dynamic = "force-dynamic";

export default async function AdminUsersPage() {
  const currentUser = await requireUser({
    roles: ["admin"],
    loginRedirectTo: "/login?next=%2Fadmin%2Fusuarios",
    unauthorizedRedirectTo: "/reportes",
  });

  const users = listAllUsers();

  return (
    <div className="min-h-screen bg-slate-50">
      <AppNavigation currentHref="/admin/usuarios" user={currentUser} />

      <main className="mx-auto max-w-5xl px-4 py-10 sm:px-6 lg:px-8">
        {/* Page header */}
        <div className="mb-8">
          <p className="text-xs font-semibold uppercase tracking-[0.28em] text-slate-400">
            Administración
          </p>
          <h1 className="mt-1 text-3xl font-bold tracking-tight text-slate-950">
            Gestión de usuarios
          </h1>
          <p className="mt-2 text-sm text-slate-500">
            Alta, baja y cambio de contraseña de todos los usuarios del sistema.
          </p>
        </div>

        <UserManagementPanel
          initialUsers={users}
          currentUserId={currentUser.id}
        />
      </main>
    </div>
  );
}
