"use client";

import type { FormEvent } from "react";
import { useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";

function resolveNextPath(path: string | null): string {
  if (!path) {
    return "/";
  }

  if (!path.startsWith("/") || path.startsWith("//")) {
    return "/";
  }

  return path;
}

export function LoginForm() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const router = useRouter();
  const searchParams = useSearchParams();

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    setIsSubmitting(true);

    try {
      const response = await fetch("/api/auth/login", {
        method: "POST",
        headers: {
          "content-type": "application/json",
        },
        body: JSON.stringify({
          email,
          password,
        }),
      });

      if (!response.ok) {
        const payload = (await response.json().catch(() => null)) as
          | { message?: string }
          | null;

        throw new Error(payload?.message ?? "No fue posible iniciar sesión.");
      }

      const nextPath = resolveNextPath(searchParams.get("next"));

      router.replace(nextPath);
      router.refresh();
    } catch (loginError) {
      setError(
        loginError instanceof Error
          ? loginError.message
          : "No fue posible iniciar sesión.",
      );
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <form className="mt-8 grid gap-4" onSubmit={handleSubmit}>
      <label className="grid gap-2 text-sm font-medium text-slate-700">
        Correo
        <input
          type="email"
          autoComplete="username"
          suppressHydrationWarning
          value={email}
          onChange={(event) => setEmail(event.target.value)}
          className="rounded-2xl border border-slate-900/10 bg-white px-4 py-3 text-sm text-slate-950 outline-none transition focus:border-slate-950"
          placeholder="usuario@empresa.com"
        />
      </label>

      <label className="grid gap-2 text-sm font-medium text-slate-700">
        Contraseña
        <input
          type="password"
          autoComplete="current-password"
          suppressHydrationWarning
          value={password}
          onChange={(event) => setPassword(event.target.value)}
          className="rounded-2xl border border-slate-900/10 bg-white px-4 py-3 text-sm text-slate-950 outline-none transition focus:border-slate-950"
          placeholder="••••••••"
        />
      </label>

      {error ? (
        <div className="rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-900">
          {error}
        </div>
      ) : null}

      <button
        type="submit"
        disabled={isSubmitting}
        className="mt-2 inline-flex items-center justify-center rounded-full bg-slate-950 px-6 py-3 text-sm font-semibold text-white transition hover:bg-slate-800 disabled:cursor-not-allowed disabled:opacity-60"
      >
        {isSubmitting ? "Ingresando..." : "Iniciar sesión"}
      </button>
    </form>
  );
}
