import Link from "next/link";

import type { SessionUser } from "@/lib/db";

type AppNavigationProps = {
  currentHref: string;
  user: SessionUser;
};

export function AppNavigation({ currentHref, user }: AppNavigationProps) {
  const navigationItems = [
    { href: "/", label: "Inicio" },
    { href: "/reportes", label: "Captura" },
    ...(user.role === "admin"
      ? [
          { href: "/dashboard", label: "Dashboard" },
          { href: "/admin/usuarios", label: "Usuarios" },
        ]
      : []),
  ];

  return (
    <header className="sticky top-0 z-30 border-b border-slate-900/10 bg-white/70 backdrop-blur-xl">
      <div className="mx-auto flex max-w-7xl flex-wrap items-center justify-between gap-4 px-4 py-4 sm:px-6 lg:px-8">
        <Link href="/" className="flex items-center gap-3">
          <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-slate-950 text-sm font-semibold text-white shadow-lg shadow-slate-900/20">
            RL
          </div>
          <div>
            <p className="text-sm font-semibold uppercase tracking-[0.28em] text-slate-500">
              Operacion
            </p>
            <p className="text-base font-semibold text-slate-950">
              Reportes Inteligentes
            </p>
          </div>
        </Link>

        <nav className="flex flex-wrap items-center gap-2">
          {navigationItems.map((item) => {
            const isActive = item.href === currentHref;

            return (
              <Link
                key={item.href}
                href={item.href}
                className={[
                  "rounded-full px-4 py-2 text-sm font-semibold transition",
                  isActive
                    ? "bg-slate-950 text-white"
                    : "bg-white/60 text-slate-700 hover:bg-slate-950 hover:text-white",
                ].join(" ")}
              >
                {item.label}
              </Link>
            );
          })}

          <div className="ml-1 flex items-center gap-2 rounded-2xl border border-slate-900/10 bg-white px-3 py-2">
            <div className="text-right">
              <p className="text-xs font-semibold uppercase tracking-[0.2em] text-slate-500">
                {user.role === "admin" ? "Administrador" : "Empleado"}
              </p>
              <p className="text-sm font-semibold text-slate-900">{user.name}</p>
            </div>
            <form action="/api/auth/logout" method="post">
              <button
                type="submit"
                className="rounded-full border border-slate-900/15 px-3 py-1.5 text-xs font-semibold text-slate-700 transition hover:bg-slate-950 hover:text-white"
              >
                Salir
              </button>
            </form>
          </div>
        </nav>
      </div>
    </header>
  );
}