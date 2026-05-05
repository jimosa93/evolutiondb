import type { User } from "@prisma/client";
import type { Prisma } from "@prisma/client";

import { logoutAction } from "@/app/actions/auth-actions";
import { ClearInteractionButton } from "@/app/components/ClearInteractionButton";
import { Pagination } from "@/app/components/Pagination";
import { SearchForm } from "@/app/components/SearchForm";
import { formatDateTime } from "@/lib/format";
import { PAGE_SIZE, buildListHref, parsePage } from "@/lib/pagination";
import { prisma } from "@/lib/prisma";

function buildWhere(
  search: string | undefined,
): Prisma.UserWhereInput | undefined {
  const trimmed = search?.trim();
  if (!trimmed) {
    return undefined;
  }
  return {
    remote_jid: {
      contains: trimmed,
      mode: "insensitive",
    },
  };
}

function UserCard({ user }: { user: User }) {
  const canClear = user.interaction_date != null;
  return (
    <article className="rounded-2xl border border-white/10 bg-white/[0.04] p-4 shadow-lg backdrop-blur-sm md:hidden">
      <dl className="space-y-3 text-sm">
        <div>
          <dt className="text-xs uppercase tracking-wide text-slate-500">Número de celular</dt>
          <dd className="mt-0.5 break-all font-mono text-slate-100">{user.remote_jid}</dd>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <dt className="text-xs uppercase tracking-wide text-slate-500">Última interacción</dt>
            <dd className="mt-0.5 text-slate-200">{formatDateTime(user.interaction_date)}</dd>
          </div>
          <div>
            <dt className="text-xs uppercase tracking-wide text-slate-500">Fecha de creación</dt>
            <dd className="mt-0.5 text-slate-200">{formatDateTime(user.createdAt)}</dd>
          </div>
        </div>
        <div>
          <dt className="text-xs uppercase tracking-wide text-slate-500">Nombre de contacto</dt>
          <dd className="mt-0.5 text-slate-200">{user.contact_name ?? "—"}</dd>
        </div>
      </dl>
      <div className="mt-4 border-t border-white/10 pt-4">
        <ClearInteractionButton remote_jid={user.remote_jid} canClear={canClear} />
      </div>
    </article>
  );
}

function UsersTable({ users }: { users: User[] }) {
  return (
    <div className="hidden overflow-x-auto rounded-2xl border border-white/10 bg-white/[0.03] shadow-xl backdrop-blur-md md:block">
      <table className="w-full min-w-[640px] border-collapse text-left text-sm">
        <thead>
          <tr className="border-b border-white/10 bg-slate-900/60">
            <th scope="col" className="whitespace-nowrap px-4 py-3 font-semibold text-slate-300">
              Número de celular
            </th>
            <th scope="col" className="whitespace-nowrap px-4 py-3 font-semibold text-slate-300">
              Última interacción
            </th>
            <th scope="col" className="whitespace-nowrap px-4 py-3 font-semibold text-slate-300">
              Nombre de contacto
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
              <td className="whitespace-nowrap px-4 py-3 text-slate-200">
                {formatDateTime(user.interaction_date)}
              </td>
              <td className="px-4 py-3 text-slate-200">{user.contact_name ?? "—"}</td>
              <td className="whitespace-nowrap px-4 py-3 text-slate-300">
                {formatDateTime(user.createdAt)}
              </td>
              <td className="px-4 py-3">
                <ClearInteractionButton
                  remote_jid={user.remote_jid}
                  canClear={user.interaction_date != null}
                />
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export default async function HomePage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string; page?: string }>;
}) {
  const params = await searchParams;
  const q = typeof params.q === "string" ? params.q : undefined;
  const where = buildWhere(q);

  const total = await prisma.user.count({ where });
  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));
  let page = parsePage(params.page);
  if (page > totalPages) {
    page = totalPages;
  }

  const users = await prisma.user.findMany({
    where,
    orderBy: { remote_jid: "asc" },
    skip: (page - 1) * PAGE_SIZE,
    take: PAGE_SIZE,
  });

  const queryForHref = q?.trim() || undefined;

  return (
    <main className="mx-auto max-w-7xl px-4 py-10 sm:px-6 lg:px-8">
      <header className="mb-10 flex flex-col gap-6 sm:flex-row sm:items-start sm:justify-between">
        <div className="text-center sm:text-left">
          <p className="text-sm font-medium uppercase tracking-wider text-sky-400/90">
            Evolution DB
          </p>
          <h1 className="mt-1 text-3xl font-bold tracking-tight text-white sm:text-4xl">
            Tabla <code className="rounded-md bg-white/10 px-2 py-0.5 font-mono text-2xl text-sky-300">users</code>
          </h1>
          <p className="mt-3 max-w-2xl text-slate-400">
            Lista de registros con filtro por <strong className="text-slate-300">número de celular</strong> y opción de eliminar la fecha de la última interacción.
          </p>
        </div>
        <form action={logoutAction} className="flex shrink-0 justify-center sm:justify-end">
          <button
            type="submit"
            className="rounded-xl border border-white/15 px-4 py-2.5 text-sm font-medium text-slate-200 transition hover:bg-white/10"
          >
            Cerrar sesión
          </button>
        </form>
      </header>

      <section className="mb-8 rounded-2xl border border-white/10 bg-white/[0.05] p-5 shadow-xl backdrop-blur-md sm:p-6">
        <SearchForm defaultQuery={q ?? ""} />
      </section>

      <section className="rounded-2xl border border-white/10 bg-white/[0.04] p-5 shadow-xl backdrop-blur-md sm:p-6">
        <div className="mb-6 flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
          <h2 className="text-lg font-semibold text-white">Registros</h2>
          <p className="text-sm text-slate-400">
            {total === 0 ? (
              "Sin resultados"
            ) : (
              <>
                Mostrando{" "}
                <span className="font-medium text-slate-200">
                  {(page - 1) * PAGE_SIZE + 1}–{Math.min(page * PAGE_SIZE, total)}
                </span>{" "}
                de <span className="font-medium text-slate-200">{total}</span>
              </>
            )}
          </p>
        </div>

        {users.length === 0 ? (
          <p className="rounded-xl border border-dashed border-white/15 bg-slate-900/40 py-12 text-center text-slate-400">
            No hay registros que coincidan con el filtro.
          </p>
        ) : (
          <>
            <UsersTable users={users} />
            <div className="mt-6 flex flex-col gap-4 md:hidden">
              {users.map((user) => (
                <UserCard key={user.remote_jid} user={user} />
              ))}
            </div>
          </>
        )}

        <Pagination query={queryForHref} page={page} totalPages={totalPages} />

        <p className="mt-8 text-center text-xs text-slate-500">
          Solo lectura y borrado de la última interacción.{" "}
          <a href={buildListHref(queryForHref, page)} className="text-sky-500/80 hover:text-sky-400">
            Actualizar lista
          </a>
        </p>
      </section>
    </main>
  );
}
