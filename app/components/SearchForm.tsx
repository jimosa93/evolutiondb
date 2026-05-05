import Link from "next/link";

type SearchFormProps = {
  defaultQuery: string;
};

export function SearchForm({ defaultQuery }: SearchFormProps) {
  return (
    <form
      method="get"
      action="/"
      className="flex flex-col gap-3 sm:flex-row sm:items-end"
    >
      <div className="min-w-0 flex-1">
        <label htmlFor="q" className="mb-1.5 block text-sm font-medium text-slate-300">
          Filtrar por <span className="text-sky-400">remote_jid</span>
        </label>
        <input
          id="q"
          name="q"
          type="search"
          placeholder="Ej. 573001262137 o @s.whatsapp.net"
          defaultValue={defaultQuery}
          autoComplete="off"
          className="w-full rounded-xl border border-white/15 bg-slate-900/50 px-4 py-2.5 text-sm text-slate-100 placeholder:text-slate-500 focus:border-sky-500/60 focus:outline-none focus:ring-2 focus:ring-sky-500/30"
        />
      </div>
      <div className="flex shrink-0 gap-2">
        <button
          type="submit"
          className="rounded-xl bg-sky-600 px-5 py-2.5 text-sm font-semibold text-white shadow-lg shadow-sky-900/30 transition hover:bg-sky-500"
        >
          Buscar
        </button>
        {defaultQuery.trim() ? (
          <Link
            href="/"
            className="rounded-xl border border-white/15 px-5 py-2.5 text-center text-sm font-medium text-slate-200 transition hover:bg-white/10"
          >
            Limpiar
          </Link>
        ) : null}
      </div>
    </form>
  );
}
