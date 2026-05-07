"use client";

import { useState } from "react";

const CONFIRM_MESSAGE =
  "¿Está seguro de que desea eliminar la fecha de la última interacción para este registro? Esta acción no se puede deshacer.";

function redirectIfUnauthorized(res: Response) {
  if (res.status === 401) {
    window.location.href = "/login";
    return true;
  }
  return false;
}

export function ClearInteractionButton({
  remote_jid,
  canClear,
  onSuccess,
}: {
  remote_jid: string;
  canClear: boolean;
  onSuccess: () => void | Promise<void>;
}) {
  const [pending, setPending] = useState(false);

  async function handleClick() {
    if (!window.confirm(CONFIRM_MESSAGE)) {
      return;
    }
    setPending(true);
    try {
      const res = await fetch("/api/users/clear-date", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "same-origin",
        body: JSON.stringify({ remote_jid }),
      });
      if (redirectIfUnauthorized(res)) {
        return;
      }
      if (!res.ok) {
        window.alert("No se pudo actualizar el registro.");
        return;
      }
      await onSuccess();
    } finally {
      setPending(false);
    }
  }

  if (!canClear) {
    return (
      <button
        type="button"
        disabled
        title="No hay fecha de interacción para borrar"
        className="inline-flex w-full cursor-not-allowed items-center justify-center rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-xs text-slate-500 sm:w-auto sm:text-sm"
      >
        Sin fecha de interacción
      </button>
    );
  }

  return (
    <button
      type="button"
      disabled={pending}
      onClick={() => void handleClick()}
      className="inline-flex w-full items-center justify-center rounded-lg bg-sky-600/90 px-3 py-2 text-xs font-medium text-white shadow-sm transition hover:bg-sky-500 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-sky-400 disabled:pointer-events-none disabled:opacity-50 sm:w-auto sm:text-sm"
    >
      {pending ? "Guardando…" : "Eliminar fecha de la última interacción"}
    </button>
  );
}
