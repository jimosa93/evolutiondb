import type { Metadata } from "next";

import { loginAction } from "@/app/actions/auth-actions";

export const metadata: Metadata = {
  title: "Acceso · Evolution DB",
  description: "Inicio de sesión",
};

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>;
}) {
  const params = await searchParams;
  const showError = params.error === "invalid";

  return (
    <main className="flex min-h-screen flex-col items-center justify-center px-4 py-12">
      <div className="w-full max-w-md rounded-2xl border border-white/10 bg-white/[0.06] p-8 shadow-2xl backdrop-blur-md">
        <p className="text-center text-sm font-medium uppercase tracking-wider text-sky-400/90">
          Evolution DB
        </p>
        <h1 className="mt-2 text-center text-2xl font-bold text-white">Acceso</h1>
        <p className="mt-2 text-center text-sm text-slate-400">
          Introduce la contraseña de administración para continuar.
        </p>

        {showError ? (
          <p
            role="alert"
            className="mt-4 rounded-lg border border-red-500/40 bg-red-950/40 px-3 py-2 text-center text-sm text-red-200"
          >
            Contraseña incorrecta. Inténtalo de nuevo.
          </p>
        ) : null}

        <form action={loginAction} className="mt-6 space-y-4">
          <div>
            <label htmlFor="password" className="mb-1.5 block text-sm font-medium text-slate-300">
              Contraseña
            </label>
            <input
              id="password"
              name="password"
              type="password"
              required
              autoComplete="current-password"
              className="w-full rounded-xl border border-white/15 bg-slate-900/50 px-4 py-3 text-sm text-slate-100 focus:border-sky-500/60 focus:outline-none focus:ring-2 focus:ring-sky-500/30"
            />
          </div>
          <button
            type="submit"
            className="w-full rounded-xl bg-sky-600 py-3 text-sm font-semibold text-white shadow-lg shadow-sky-900/30 transition hover:bg-sky-500"
          >
            Entrar
          </button>
        </form>

        <p className="mt-6 text-center text-xs text-slate-500">
          La sesión se mantiene activa durante varios días en este dispositivo.
        </p>
      </div>
    </main>
  );
}
