"use client";

type DataPaginationProps = {
  page: number;
  totalPages: number;
  onPrev: () => void;
  onNext: () => void;
  disabled?: boolean;
};

export function DataPagination({
  page,
  totalPages,
  onPrev,
  onNext,
  disabled,
}: DataPaginationProps) {
  if (totalPages <= 1) {
    return null;
  }

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
        <button
          type="button"
          disabled={disabled || page <= 1}
          onClick={onPrev}
          className="rounded-lg border border-white/15 bg-white/5 px-4 py-2 text-sm font-medium text-slate-200 transition hover:border-sky-500/40 hover:bg-sky-500/10 disabled:pointer-events-none disabled:opacity-40"
        >
          Anterior
        </button>
        <button
          type="button"
          disabled={disabled || page >= totalPages}
          onClick={onNext}
          className="rounded-lg border border-white/15 bg-white/5 px-4 py-2 text-sm font-medium text-slate-200 transition hover:border-sky-500/40 hover:bg-sky-500/10 disabled:pointer-events-none disabled:opacity-40"
        >
          Siguiente
        </button>
      </div>
    </nav>
  );
}
