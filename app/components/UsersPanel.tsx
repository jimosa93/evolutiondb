"use client";

import { startTransition, useCallback, useEffect, useState } from "react";

import { ClearInteractionButton } from "@/app/components/ClearInteractionButton";
import { DataPagination } from "@/app/components/DataPagination";
import { RemoteJidFilter } from "@/app/components/RemoteJidFilter";
import { formatDateTime } from "@/lib/format";
import { PAGE_SIZE } from "@/lib/pagination";

export type UserRow = {
  remote_jid: string;
  interaction_date: string | null;
  contact_name: string | null;
  createdAt: string | null;
};

type UsersResponse = {
  users: UserRow[];
  total: number;
  page: number;
  pageSize: number;
  totalPages: number;
};

function redirectIfUnauthorized(res: Response) {
  if (res.status === 401) {
    window.location.href = "/login";
    return true;
  }
  return false;
}

export function UsersPanel() {
  const [filterInput, setFilterInput] = useState("");
  const [appliedQ, setAppliedQ] = useState("");
  const [page, setPage] = useState(1);
  const [users, setUsers] = useState<UserRow[]>([]);
  const [total, setTotal] = useState(0);
  const [totalPages, setTotalPages] = useState(1);
  const [displayPage, setDisplayPage] = useState(1);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchUsers = useCallback(async (q: string, p: number) => {
    startTransition(() => {
      setLoading(true);
      setError(null);
    });
    try {
      const params = new URLSearchParams();
      if (q.trim()) {
        params.set("q", q.trim());
      }
      if (p > 1) {
        params.set("page", String(p));
      }
      const res = await fetch(`/api/users?${params.toString()}`, {
        credentials: "same-origin",
      });
      if (redirectIfUnauthorized(res)) {
        return;
      }
      if (!res.ok) {
        throw new Error("fetch");
      }
      const data = (await res.json()) as UsersResponse;
      startTransition(() => {
        setUsers(data.users);
        setTotal(data.total);
        setTotalPages(data.totalPages);
        setDisplayPage(data.page);
        setPage(data.page);
      });
    } catch {
      startTransition(() => {
        setError("No se pudieron cargar los datos.");
      });
    } finally {
      startTransition(() => {
        setLoading(false);
      });
    }
  }, []);

  useEffect(() => {
    void fetchUsers(appliedQ, page);
  }, [appliedQ, page, fetchUsers]);

  function handleSearch() {
    setAppliedQ(filterInput.trim());
    setPage(1);
  }

  function handleClear() {
    setFilterInput("");
    setAppliedQ("");
    setPage(1);
  }

  function handleRefresh() {
    void fetchUsers(appliedQ, displayPage);
  }

  function handlePrevPage() {
    setPage((prev) => Math.max(1, prev - 1));
  }

  function handleNextPage() {
    setPage((prev) => Math.min(totalPages, prev + 1));
  }

  return (
    <>
      <header className="mb-8 text-center sm:text-left">
        <h1 className="text-3xl font-bold tracking-tight text-white sm:text-4xl">
          Usuarios en base de datos
        </h1>
        <p className="mt-3 max-w-2xl text-slate-400">
          Filtro por <strong className="text-slate-300">número de celular</strong> y opción de eliminar la fecha de la última interacción.
        </p>
      </header>

      <section className="mb-8 rounded-2xl border border-white/10 bg-white/[0.05] p-5 shadow-xl backdrop-blur-md sm:p-6">
        <RemoteJidFilter
          filterInput={filterInput}
          onFilterInputChange={setFilterInput}
          onSearch={handleSearch}
          onClear={handleClear}
          disabled={loading}
        />
      </section>

      <section className="rounded-2xl border border-white/10 bg-white/[0.04] p-5 shadow-xl backdrop-blur-md sm:p-6">
        <div className="mb-6 flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
          <h2 className="text-lg font-semibold text-white">Registros</h2>
          <p className="text-sm text-slate-400">
            {loading && total === 0 ? (
              "Cargando…"
            ) : total === 0 ? (
              "Sin resultados"
            ) : (
              <>
                Mostrando{" "}
                <span className="font-medium text-slate-200">
                  {(displayPage - 1) * PAGE_SIZE + 1}–{Math.min(displayPage * PAGE_SIZE, total)}
                </span>{" "}
                de <span className="font-medium text-slate-200">{total}</span>
              </>
            )}
          </p>
        </div>

        {error ? (
          <p className="rounded-xl border border-red-500/30 bg-red-950/30 py-4 text-center text-sm text-red-200">
            {error}
          </p>
        ) : users.length === 0 && !loading ? (
          <p className="rounded-xl border border-dashed border-white/15 bg-slate-900/40 py-12 text-center text-slate-400">
            No hay registros que coincidan con el filtro.
          </p>
        ) : (
          <>
            <div className="hidden overflow-x-auto rounded-2xl border border-white/10 bg-white/[0.03] shadow-xl backdrop-blur-md md:block">
              <table className="w-full min-w-[640px] border-collapse text-left text-sm">
                <thead>
                  <tr className="border-b border-white/10 bg-slate-900/60">
                    <th scope="col" className="whitespace-nowrap px-4 py-3 font-semibold text-slate-300">
                      Número de celular
                    </th>
                    <th scope="col" className="whitespace-nowrap px-4 py-3 font-semibold text-slate-300">
                      Nombre de contacto
                    </th>
                    <th scope="col" className="whitespace-nowrap px-4 py-3 font-semibold text-slate-300">
                      Última interacción
                    </th>
                    <th scope="col" className="whitespace-nowrap px-4 py-3 font-semibold text-slate-300">
                      Fecha de creación
                    </th>
                    <th scope="col" className="whitespace-nowrap px-4 py-3 font-semibold text-slate-300">
                      Acción
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {users.map((user, index) => (
                    <tr
                      key={user.remote_jid}
                      className={`border-b border-white/5 transition hover:bg-white/[0.04] ${
                        index % 2 === 0 ? "bg-transparent" : "bg-white/[0.02]"
                      }`}
                    >
                      <td className="max-w-[220px] px-4 py-3 font-mono text-xs text-sky-100/95">
                        <span className="break-all">{user.remote_jid}</span>
                      </td>
                      <td className="px-4 py-3 text-slate-200">{user.contact_name ?? "—"}</td>
                      <td className="whitespace-nowrap px-4 py-3 text-slate-200">
                        {formatDateTime(user.interaction_date)}
                      </td>
                      <td className="whitespace-nowrap px-4 py-3 text-slate-300">
                        {formatDateTime(user.createdAt)}
                      </td>
                      <td className="px-4 py-3">
                        <ClearInteractionButton
                          remote_jid={user.remote_jid}
                          canClear={user.interaction_date != null}
                          onSuccess={() => fetchUsers(appliedQ, displayPage)}
                        />
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <div className="mt-6 flex flex-col gap-4 md:hidden">
              {users.map((user) => (
                <article
                  key={user.remote_jid}
                  className="rounded-2xl border border-white/10 bg-white/[0.04] p-4 shadow-lg backdrop-blur-sm"
                >
                  <dl className="space-y-3 text-sm">
                    <div>
                      <dt className="text-xs uppercase tracking-wide text-slate-500">Número de celular</dt>
                      <dd className="mt-0.5 break-all font-mono text-slate-100">{user.remote_jid}</dd>
                    </div>
                    <div>
                      <dt className="text-xs uppercase tracking-wide text-slate-500">Nombre de contacto</dt>
                      <dd className="mt-0.5 text-slate-200">{user.contact_name ?? "—"}</dd>
                    </div>
                    <div className="grid grid-cols-2 gap-3">
                      <div>
                        <dt className="text-xs uppercase tracking-wide text-slate-500">Última interacción</dt>
                        <dd className="mt-0.5 text-slate-200">
                          {formatDateTime(user.interaction_date)}
                        </dd>
                      </div>
                      <div>
                        <dt className="text-xs uppercase tracking-wide text-slate-500">Fecha de creación</dt>
                        <dd className="mt-0.5 text-slate-200">{formatDateTime(user.createdAt)}</dd>
                      </div>
                    </div>
                  </dl>
                  <div className="mt-4 border-t border-white/10 pt-4">
                    <ClearInteractionButton
                      remote_jid={user.remote_jid}
                      canClear={user.interaction_date != null}
                      onSuccess={() => fetchUsers(appliedQ, displayPage)}
                    />
                  </div>
                </article>
              ))}
            </div>
          </>
        )}

        <DataPagination
          page={displayPage}
          totalPages={totalPages}
          onPrev={handlePrevPage}
          onNext={handleNextPage}
          disabled={loading}
        />

        <p className="mt-8 text-center text-xs text-slate-500">
          Solo lectura y borrado de la última interacción.{" "}
          <button
            type="button"
            disabled={loading}
            onClick={handleRefresh}
            className="text-sky-500/80 underline-offset-2 hover:text-sky-400 hover:underline disabled:opacity-50"
          >
            Actualizar lista
          </button>
        </p>
      </section>
    </>
  );
}
