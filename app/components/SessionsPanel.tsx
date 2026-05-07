"use client";

import { startTransition, useCallback, useEffect, useState } from "react";

import { DataPagination } from "@/app/components/DataPagination";
import { RemoteJidFilter } from "@/app/components/RemoteJidFilter";
import { formatUpdatedAtBogota } from "@/lib/format";
import { PAGE_SIZE } from "@/lib/pagination";

export type SessionRow = {
  id: string;
  remoteJid: string;
  pushName: string | null;
  status: string;
  updatedAt: string;
};

type SessionsResponse = {
  sessions: SessionRow[];
  total: number;
  page: number;
  pageSize: number;
  totalPages: number;
};

const DELETE_CONFIRM =
  "¿Está seguro de que desea eliminar esta sesión de integración? Esta acción eliminará el registro de la base de datos y no se puede deshacer.";

function redirectIfUnauthorized(res: Response) {
  if (res.status === 401) {
    window.location.href = "/login";
    return true;
  }
  return false;
}

function DeleteSessionButton({
  sessionId,
  onDeleted,
}: {
  sessionId: string;
  onDeleted: () => void;
}) {
  const [pending, setPending] = useState(false);

  async function handleClick() {
    if (!window.confirm(DELETE_CONFIRM)) {
      return;
    }
    setPending(true);
    try {
      const res = await fetch(
        `/api/integration-sessions?id=${encodeURIComponent(sessionId)}`,
        { method: "DELETE", credentials: "same-origin" },
      );
      if (redirectIfUnauthorized(res)) {
        return;
      }
      if (!res.ok) {
        const data = (await res.json().catch(() => null)) as { error?: string } | null;
        window.alert(data?.error ?? "No se pudo eliminar la sesión.");
        return;
      }
      onDeleted();
    } finally {
      setPending(false);
    }
  }

  return (
    <button
      type="button"
      disabled={pending}
      onClick={() => void handleClick()}
      className="inline-flex w-full items-center justify-center rounded-lg bg-rose-600/90 px-3 py-2 text-xs font-medium text-white shadow-sm transition hover:bg-rose-500 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-rose-400 disabled:pointer-events-none disabled:opacity-50 sm:w-auto sm:text-sm"
    >
      {pending ? "Eliminando…" : "Eliminar sesión"}
    </button>
  );
}

export function SessionsPanel() {
  const [filterInput, setFilterInput] = useState("");
  const [appliedQ, setAppliedQ] = useState("");
  const [page, setPage] = useState(1);
  const [sessions, setSessions] = useState<SessionRow[]>([]);
  const [total, setTotal] = useState(0);
  const [totalPages, setTotalPages] = useState(1);
  const [displayPage, setDisplayPage] = useState(1);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchSessions = useCallback(async (q: string, p: number) => {
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
      const res = await fetch(`/api/integration-sessions?${params.toString()}`, {
        credentials: "same-origin",
      });
      if (redirectIfUnauthorized(res)) {
        return;
      }
      if (!res.ok) {
        throw new Error("fetch");
      }
      const data = (await res.json()) as SessionsResponse;
      startTransition(() => {
        setSessions(data.sessions);
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
    void fetchSessions(appliedQ, page);
  }, [appliedQ, page, fetchSessions]);

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
    void fetchSessions(appliedQ, displayPage);
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
          Sesiones de Evolution
        </h1>
        <p className="mt-3 max-w-2xl text-slate-400">
          Registros de <strong className="text-slate-300">IntegrationSession</strong> con filtro por número de celular y eliminación de sesiones.
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
        ) : sessions.length === 0 && !loading ? (
          <p className="rounded-xl border border-dashed border-white/15 bg-slate-900/40 py-12 text-center text-slate-400">
            No hay registros que coincidan con el filtro.
          </p>
        ) : (
          <>
            <div className="hidden overflow-x-auto rounded-2xl border border-white/10 bg-white/[0.03] shadow-xl backdrop-blur-md md:block">
              <table className="w-full min-w-[720px] border-collapse text-left text-sm">
                <thead>
                  <tr className="border-b border-white/10 bg-slate-900/60">
                    <th scope="col" className="whitespace-nowrap px-4 py-3 font-semibold text-slate-300">
                      Número de celular
                    </th>
                    <th scope="col" className="whitespace-nowrap px-4 py-3 font-semibold text-slate-300">
                      Nombre de contacto
                    </th>
                    <th scope="col" className="whitespace-nowrap px-4 py-3 font-semibold text-slate-300">
                      Estado
                    </th>
                    <th scope="col" className="whitespace-nowrap px-4 py-3 font-semibold text-slate-300">
                      Última actualización
                    </th>
                    <th scope="col" className="whitespace-nowrap px-4 py-3 font-semibold text-slate-300">
                      Acción
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {sessions.map((row, index) => (
                    <tr
                      key={row.id}
                      className={`border-b border-white/5 transition hover:bg-white/[0.04] ${
                        index % 2 === 0 ? "bg-transparent" : "bg-white/[0.02]"
                      }`}
                    >
                      <td className="max-w-[200px] px-4 py-3 font-mono text-xs text-sky-100/95">
                        <span className="break-all">{row.remoteJid}</span>
                      </td>
                      <td className="px-4 py-3 text-slate-200">{row.pushName ?? "—"}</td>
                      <td className="px-4 py-3 text-slate-300">{row.status}</td>
                      <td className="whitespace-nowrap px-4 py-3 text-slate-200">
                        {formatUpdatedAtBogota(row.updatedAt)}
                      </td>
                      <td className="px-4 py-3">
                        <DeleteSessionButton
                          sessionId={row.id}
                          onDeleted={() => fetchSessions(appliedQ, displayPage)}
                        />
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <div className="mt-6 flex flex-col gap-4 md:hidden">
              {sessions.map((row) => (
                <article
                  key={row.id}
                  className="rounded-2xl border border-white/10 bg-white/[0.04] p-4 shadow-lg backdrop-blur-sm"
                >
                  <dl className="space-y-3 text-sm">
                    <div>
                      <dt className="text-xs uppercase tracking-wide text-slate-500">Número de celular</dt>
                      <dd className="mt-0.5 break-all font-mono text-slate-100">{row.remoteJid}</dd>
                    </div>
                    <div className="grid grid-cols-2 gap-3">
                      <div>
                        <dt className="text-xs uppercase tracking-wide text-slate-500">Nombre de contacto</dt>
                        <dd className="mt-0.5 text-slate-200">{row.pushName ?? "—"}</dd>
                      </div>
                      <div>
                        <dt className="text-xs uppercase tracking-wide text-slate-500">Estado</dt>
                        <dd className="mt-0.5 text-slate-200">{row.status}</dd>
                      </div>
                    </div>
                    <div>
                      <dt className="text-xs uppercase tracking-wide text-slate-500">Última actualización</dt>
                      <dd className="mt-0.5 text-slate-200">{formatUpdatedAtBogota(row.updatedAt)}</dd>
                    </div>
                  </dl>
                  <div className="mt-4 border-t border-white/10 pt-4">
                    <DeleteSessionButton
                      sessionId={row.id}
                      onDeleted={() => fetchSessions(appliedQ, displayPage)}
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
