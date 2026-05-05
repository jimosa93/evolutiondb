import Link from "next/link";

import { buildListHref } from "@/lib/pagination";

type PaginationProps = {
  query: string | undefined;
  page: number;
  totalPages: number;
};

export function Pagination({ query, page, totalPages }: PaginationProps) {
  if (totalPages <= 1) {
    return null;
  }

  const prev = Math.max(1, page - 1);
  const next = Math.min(totalPages, page + 1);

  return (
    <nav
      className="flex flex-wrap items-center justify-between gap-3 border-t border-white/10 pt-5"
      aria-label="Paginación"
    >
      <p className="text-sm text-slate-400">
        Página{" "}
        <span className="font-medium text-slate-200">
          {page} / {totalPages}
        </span>
      </p>
      <div className="flex gap-2">
        <Link
          href={buildListHref(query, prev)}
          aria-disabled={page <= 1}
          className={`rounded-lg border px-4 py-2 text-sm font-medium transition ${
            page <= 1
              ? "pointer-events-none border-white/5 text-slate-500"
              : "border-white/15 bg-white/5 text-slate-200 hover:border-sky-500/40 hover:bg-sky-500/10"
          }`}
        >
          Anterior
        </Link>
        <Link
          href={buildListHref(query, next)}
          aria-disabled={page >= totalPages}
          className={`rounded-lg border px-4 py-2 text-sm font-medium transition ${
            page >= totalPages
              ? "pointer-events-none border-white/5 text-slate-500"
              : "border-white/15 bg-white/5 text-slate-200 hover:border-sky-500/40 hover:bg-sky-500/10"
          }`}
        >
          Siguiente
        </Link>
      </div>
    </nav>
  );
}
