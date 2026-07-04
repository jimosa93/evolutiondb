"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const LINKS = [
  { href: "/", label: "Usuarios en base de datos" },
  { href: "/sesiones", label: "Sesiones de Evolution" },
  { href: "/autocheck-pdf", label: "Autocheck PDF" },
  { href: "/certificar-pdf", label: "Certificar PDF" },
] as const;

export function DashboardNav() {
  const pathname = usePathname();

  return (
    <nav
      className="mt-4 flex flex-wrap gap-2 rounded-xl border border-white/10 bg-slate-900/55 p-1.5"
      aria-label="Secciones principales"
    >
      {LINKS.map(({ href, label }) => {
        const active =
          href === "/"
            ? pathname === "/"
            : pathname === href || pathname.startsWith(`${href}/`);
        return (
          <Link
            key={href}
            href={href}
            className={`min-h-[44px] min-w-0 flex-1 rounded-lg px-4 py-2.5 text-center text-sm font-semibold transition sm:flex-none sm:text-left ${
              active
                ? "bg-sky-600 text-white shadow-md shadow-sky-900/30"
                : "text-slate-300 hover:bg-white/10 hover:text-white"
            }`}
          >
            {label}
          </Link>
        );
      })}
    </nav>
  );
}
