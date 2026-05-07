import { logoutAction } from "@/app/actions/auth-actions";
import { DashboardNav } from "@/app/components/DashboardNav";

export default function DashboardLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <div className="min-h-screen">
      <header className="border-b border-white/10 bg-slate-950/50 px-4 py-6 backdrop-blur-sm sm:px-6 lg:px-8">
        <div className="mx-auto flex max-w-7xl flex-col gap-6 sm:flex-row sm:items-start sm:justify-between">
          <div className="min-w-0 flex-1">
            <p className="text-sm font-medium uppercase tracking-wider text-sky-400/90">
              Evolution DB
            </p>
            <DashboardNav />
          </div>
          <form action={logoutAction} className="flex shrink-0 justify-center sm:justify-end sm:pt-1">
            <button
              type="submit"
              className="rounded-xl border border-white/15 px-4 py-2.5 text-sm font-medium text-slate-200 transition hover:bg-white/10"
            >
              Cerrar sesión
            </button>
          </form>
        </div>
      </header>
      <div className="mx-auto max-w-7xl px-4 py-10 sm:px-6 lg:px-8">{children}</div>
    </div>
  );
}
