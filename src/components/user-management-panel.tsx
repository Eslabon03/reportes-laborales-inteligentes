"use client";

import { useState } from "react";

import type { SessionUser, UserRole } from "@/lib/db";

type Props = {
  initialUsers: SessionUser[];
  currentUserId: number;
};

type FormMode = "create" | "edit";

type FormState = {
  mode: FormMode;
  userId?: number;
  name: string;
  email: string;
  role: UserRole;
  password: string;
  confirmPassword: string;
};

function emptyForm(): FormState {
  return {
    mode: "create",
    name: "",
    email: "",
    role: "employee",
    password: "",
    confirmPassword: "",
  };
}

const ROLE_LABELS: Record<UserRole, string> = {
  admin: "Administrador",
  employee: "Empleado",
};

export function UserManagementPanel({ initialUsers, currentUserId }: Props) {
  const [users, setUsers] = useState<SessionUser[]>(initialUsers);
  const [form, setForm] = useState<FormState>(emptyForm());
  const [showForm, setShowForm] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [deletingId, setDeletingId] = useState<number | null>(null);

  function openCreate() {
    setForm(emptyForm());
    setError(null);
    setSuccess(null);
    setShowForm(true);
  }

  function openEdit(user: SessionUser) {
    setForm({
      mode: "edit",
      userId: user.id,
      name: user.name,
      email: user.email,
      role: user.role,
      password: "",
      confirmPassword: "",
    });
    setError(null);
    setSuccess(null);
    setShowForm(true);
  }

  function closeForm() {
    setShowForm(false);
    setError(null);
    setSuccess(null);
  }

  function validate(): string | null {
    if (form.name.trim().length < 2)
      return "El nombre debe tener al menos 2 caracteres.";
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(form.email.trim()))
      return "Ingresa un correo electrónico válido.";
    if (form.mode === "create" && form.password.length < 8)
      return "La contraseña debe tener al menos 8 caracteres.";
    if (form.mode === "create" && form.password !== form.confirmPassword)
      return "Las contraseñas no coinciden.";
    if (
      form.mode === "edit" &&
      form.password.length > 0 &&
      form.password.length < 8
    )
      return "La nueva contraseña debe tener al menos 8 caracteres.";
    if (
      form.mode === "edit" &&
      form.password.length > 0 &&
      form.password !== form.confirmPassword
    )
      return "Las contraseñas no coinciden.";
    return null;
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setSuccess(null);

    const validationError = validate();
    if (validationError) {
      setError(validationError);
      return;
    }

    setSubmitting(true);

    try {
      if (form.mode === "create") {
        const res = await fetch("/api/users", {
          method: "POST",
          credentials: "include",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            name: form.name.trim(),
            email: form.email.trim(),
            role: form.role,
            password: form.password,
          }),
        });

        const data = (await res.json()) as { user?: SessionUser; error?: string };
        if (!res.ok) {
          setError(data.error ?? "Error al crear el usuario.");
          return;
        }

        if (data.user) {
          setUsers((prev) => [...prev, data.user!]);
        }
        setSuccess(`Usuario "${form.name.trim()}" creado correctamente.`);
        setForm(emptyForm());
        setShowForm(false);
      } else {
        const body: Record<string, string> = {
          name: form.name.trim(),
          email: form.email.trim(),
          role: form.role,
        };
        if (form.password.length > 0) body.password = form.password;

        const res = await fetch(`/api/users/${form.userId}`, {
          method: "PATCH",
          credentials: "include",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(body),
        });

        const data = (await res.json()) as { user?: SessionUser; error?: string };
        if (!res.ok) {
          setError(data.error ?? "Error al actualizar el usuario.");
          return;
        }

        if (data.user) {
          setUsers((prev) =>
            prev.map((u) => (u.id === form.userId ? data.user! : u)),
          );
        }
        setSuccess(`Usuario actualizado correctamente.`);
        setForm(emptyForm());
        setShowForm(false);
      }
    } catch {
      setError("Error de red. Inténtalo de nuevo.");
    } finally {
      setSubmitting(false);
    }
  }

  async function handleDelete(user: SessionUser) {
    if (
      !confirm(
        `¿Eliminar a "${user.name}"?\n\nEsta acción no se puede deshacer.`,
      )
    )
      return;

    setDeletingId(user.id);
    setError(null);
    setSuccess(null);

    try {
      const res = await fetch(`/api/users/${user.id}`, {
        method: "DELETE",
        credentials: "include",
      });

      if (!res.ok) {
        let msg = "Error al eliminar el usuario.";
        try {
          const data = (await res.json()) as { error?: string };
          if (data.error) msg = data.error;
        } catch {
          // ignore parse error
        }
        setError(msg);
        return;
      }

      setUsers((prev) => prev.filter((u) => u.id !== user.id));
      setSuccess(`Usuario "${user.name}" eliminado.`);
    } catch {
      setError("Error de red. Inténtalo de nuevo.");
    } finally {
      setDeletingId(null);
    }
  }

  return (
    <div className="space-y-6">
      {/* Messages */}
      {success && (
        <div className="rounded-2xl border border-emerald-200 bg-emerald-50 px-5 py-4 text-sm font-medium text-emerald-800">
          {success}
        </div>
      )}
      {error && !showForm && (
        <div className="rounded-2xl border border-red-200 bg-red-50 px-5 py-4 text-sm font-medium text-red-700">
          {error}
        </div>
      )}

      {/* Header row */}
      <div className="flex items-center justify-between">
        <p className="text-sm text-slate-500">
          {users.length} usuario{users.length !== 1 ? "s" : ""} registrado
          {users.length !== 1 ? "s" : ""}
        </p>
        {!showForm && (
          <button
            onClick={openCreate}
            className="rounded-full bg-slate-950 px-5 py-2 text-sm font-semibold text-white transition hover:bg-slate-700"
          >
            + Nuevo usuario
          </button>
        )}
      </div>

      {/* Form */}
      {showForm && (
        <div className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
          <h3 className="mb-5 text-base font-semibold text-slate-900">
            {form.mode === "create" ? "Nuevo usuario" : "Editar usuario"}
          </h3>

          {error && (
            <div className="mb-4 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm font-medium text-red-700">
              {error}
            </div>
          )}

          <form onSubmit={handleSubmit} className="grid gap-4 sm:grid-cols-2">
            {/* Name */}
            <div className="flex flex-col gap-1.5">
              <label className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                Nombre completo
              </label>
              <input
                type="text"
                value={form.name}
                onChange={(e) => setForm({ ...form, name: e.target.value })}
                placeholder="Ej. María López"
                required
                className="rounded-xl border border-slate-200 bg-slate-50 px-3.5 py-2.5 text-sm text-slate-900 outline-none transition focus:border-slate-400 focus:bg-white"
              />
            </div>

            {/* Email */}
            <div className="flex flex-col gap-1.5">
              <label className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                Correo electrónico
              </label>
              <input
                type="email"
                value={form.email}
                onChange={(e) => setForm({ ...form, email: e.target.value })}
                placeholder="usuario@empresa.com"
                required
                className="rounded-xl border border-slate-200 bg-slate-50 px-3.5 py-2.5 text-sm text-slate-900 outline-none transition focus:border-slate-400 focus:bg-white"
              />
            </div>

            {/* Role */}
            <div className="flex flex-col gap-1.5">
              <label className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                Rol
              </label>
              <select
                value={form.role}
                onChange={(e) =>
                  setForm({ ...form, role: e.target.value as UserRole })
                }
                className="rounded-xl border border-slate-200 bg-slate-50 px-3.5 py-2.5 text-sm text-slate-900 outline-none transition focus:border-slate-400 focus:bg-white"
              >
                <option value="employee">Empleado</option>
                <option value="admin">Administrador</option>
              </select>
            </div>

            {/* Password */}
            <div className="flex flex-col gap-1.5">
              <label className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                {form.mode === "edit"
                  ? "Nueva contraseña (opcional)"
                  : "Contraseña"}
              </label>
              <input
                type="password"
                value={form.password}
                onChange={(e) => setForm({ ...form, password: e.target.value })}
                placeholder={
                  form.mode === "edit" ? "Dejar vacío para no cambiar" : "Mín. 8 caracteres"
                }
                required={form.mode === "create"}
                className="rounded-xl border border-slate-200 bg-slate-50 px-3.5 py-2.5 text-sm text-slate-900 outline-none transition focus:border-slate-400 focus:bg-white"
              />
            </div>

            {/* Confirm password */}
            {(form.mode === "create" || form.password.length > 0) && (
              <div className="flex flex-col gap-1.5 sm:col-start-2">
                <label className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                  Confirmar contraseña
                </label>
                <input
                  type="password"
                  value={form.confirmPassword}
                  onChange={(e) =>
                    setForm({ ...form, confirmPassword: e.target.value })
                  }
                  placeholder="Repite la contraseña"
                  required={form.mode === "create" || form.password.length > 0}
                  className="rounded-xl border border-slate-200 bg-slate-50 px-3.5 py-2.5 text-sm text-slate-900 outline-none transition focus:border-slate-400 focus:bg-white"
                />
              </div>
            )}

            {/* Actions */}
            <div className="flex gap-3 sm:col-span-2">
              <button
                type="submit"
                disabled={submitting}
                className="rounded-full bg-slate-950 px-6 py-2.5 text-sm font-semibold text-white transition hover:bg-slate-700 disabled:opacity-50"
              >
                {submitting
                  ? "Guardando…"
                  : form.mode === "create"
                    ? "Crear usuario"
                    : "Guardar cambios"}
              </button>
              <button
                type="button"
                onClick={closeForm}
                className="rounded-full border border-slate-200 px-6 py-2.5 text-sm font-semibold text-slate-700 transition hover:bg-slate-100"
              >
                Cancelar
              </button>
            </div>
          </form>
        </div>
      )}

      {/* User list */}
      <div className="overflow-hidden rounded-3xl border border-slate-200 bg-white shadow-sm">
        {users.length === 0 ? (
          <div className="px-6 py-12 text-center text-sm text-slate-400">
            No hay usuarios registrados.
          </div>
        ) : (
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-slate-100 bg-slate-50">
                <th className="px-6 py-3.5 text-left text-xs font-semibold uppercase tracking-wide text-slate-500">
                  Nombre
                </th>
                <th className="hidden px-6 py-3.5 text-left text-xs font-semibold uppercase tracking-wide text-slate-500 sm:table-cell">
                  Correo
                </th>
                <th className="px-6 py-3.5 text-left text-xs font-semibold uppercase tracking-wide text-slate-500">
                  Rol
                </th>
                <th className="px-6 py-3.5 text-right text-xs font-semibold uppercase tracking-wide text-slate-500">
                  Acciones
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {users.map((user) => (
                <tr key={user.id} className="transition hover:bg-slate-50/60">
                  <td className="px-6 py-4 font-medium text-slate-900">
                    {user.name}
                    {user.id === currentUserId && (
                      <span className="ml-2 rounded-full bg-slate-100 px-2 py-0.5 text-xs font-semibold text-slate-500">
                        tú
                      </span>
                    )}
                  </td>
                  <td className="hidden px-6 py-4 text-slate-500 sm:table-cell">
                    {user.email}
                  </td>
                  <td className="px-6 py-4">
                    <span
                      className={[
                        "inline-flex rounded-full px-2.5 py-0.5 text-xs font-semibold",
                        user.role === "admin"
                          ? "bg-slate-900 text-white"
                          : "bg-slate-100 text-slate-700",
                      ].join(" ")}
                    >
                      {ROLE_LABELS[user.role]}
                    </span>
                  </td>
                  <td className="px-6 py-4 text-right">
                    <div className="flex justify-end gap-2">
                      <button
                        onClick={() => openEdit(user)}
                        className="rounded-full border border-slate-200 px-3 py-1 text-xs font-semibold text-slate-700 transition hover:bg-slate-950 hover:text-white"
                      >
                        Editar
                      </button>
                      {user.id !== currentUserId && (
                        <button
                          onClick={() => handleDelete(user)}
                          disabled={deletingId === user.id}
                          className="rounded-full border border-red-200 px-3 py-1 text-xs font-semibold text-red-600 transition hover:bg-red-600 hover:text-white disabled:opacity-50"
                        >
                          {deletingId === user.id ? "…" : "Eliminar"}
                        </button>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}
