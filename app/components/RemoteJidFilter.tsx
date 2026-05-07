"use client";

import type { FormEvent } from "react";

type RemoteJidFilterProps = {
  filterInput: string;
  onFilterInputChange: (value: string) => void;
  onSearch: () => void;
  onClear: () => void;
  disabled?: boolean;
};

export function RemoteJidFilter({
  filterInput,
  onFilterInputChange,
  onSearch,
  onClear,
  disabled,
}: RemoteJidFilterProps) {
  function handleSubmit(e: FormEvent) {
    e.preventDefault();
    onSearch();
  }

  return (
    <form
      onSubmit={handleSubmit}
      className="flex flex-col gap-3 sm:flex-row sm:items-end"
    >
      <div className="min-w-0 flex-1">
        <label htmlFor="filter-q" className="mb-1.5 block text-sm font-medium text-slate-300">
          Filtrar por <span className="text-sky-400">número de celular</span>
        </label>
        <input
          id="filter-q"
          type="search"
          value={filterInput}
          onChange={(e) => onFilterInputChange(e.target.value)}
          placeholder="Ej. 573001262137 o @s.whatsapp.net"
          autoComplete="off"
          disabled={disabled}
          className="w-full rounded-xl border border-white/15 bg-slate-900/50 px-4 py-2.5 text-sm text-slate-100 placeholder:text-slate-500 focus:border-sky-500/60 focus:outline-none focus:ring-2 focus:ring-sky-500/30 disabled:opacity-50"
        />
      </div>
      <div className="flex shrink-0 gap-2">
        <button
          type="submit"
          disabled={disabled}
          className="rounded-xl bg-sky-600 px-5 py-2.5 text-sm font-semibold text-white shadow-lg shadow-sky-900/30 transition hover:bg-sky-500 disabled:opacity-50"
        >
          Buscar
        </button>
        <button
          type="button"
          disabled={disabled}
          onClick={onClear}
          className="rounded-xl border border-white/15 px-5 py-2.5 text-sm font-medium text-slate-200 transition hover:bg-white/10 disabled:opacity-50"
        >
          Limpiar
        </button>
      </div>
    </form>
  );
}
