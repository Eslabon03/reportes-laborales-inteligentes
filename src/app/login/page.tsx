import { redirect } from "next/navigation";

import { LoginForm } from "@/components/login-form";
import { getSessionUser } from "@/lib/auth";

export default async function LoginPage() {
  const currentUser = await getSessionUser();

  if (currentUser) {
    redirect(currentUser.role === "admin" ? "/dashboard" : "/reportes");
  }

  return (
    <main className="mx-auto flex min-h-screen w-full max-w-5xl items-center px-4 py-10 sm:px-6 lg:px-8">
      <section className="grid w-full gap-8 rounded-[34px] border border-slate-900/10 bg-white/85 p-6 shadow-[var(--shadow-panel)] backdrop-blur-xl md:grid-cols-[1.1fr_0.9fr] md:p-10">
        <div className="space-y-5">
          <p className="font-mono text-xs uppercase tracking-[0.3em] text-slate-500">
            Acceso multiusuario
          </p>
          <h1 className="text-4xl font-semibold tracking-tight text-slate-950 sm:text-5xl">
            Ingresa para capturar o administrar reportes laborales.
          </h1>
          <p className="text-base leading-8 text-slate-700 sm:text-lg">
            El administrador puede crear cuentas para cada tecnico desde el panel de usuarios.
          </p>
        </div>

        <div className="rounded-[26px] border border-slate-900/10 bg-slate-50/90 p-5 sm:p-6">
          <p className="text-sm font-semibold uppercase tracking-[0.2em] text-slate-600">
            Inicio de sesión
          </p>
          <LoginForm />
        </div>
      </section>
    </main>
  );
}
