"use client";

import type { FormEvent } from "react";
import { useFormStatus } from "react-dom";

import { clearInteractionDate } from "@/app/actions/user-actions";

const CONFIRM_MESSAGE =
  "¿Está seguro de que desea eliminar la fecha de la última interacción para este registro? Esta acción no se puede deshacer.";

function SubmitButton() {
  const { pending } = useFormStatus();
  return (
    <button
      type="submit"
      disabled={pending}
      className="inline-flex w-full items-center justify-center rounded-lg bg-sky-600/90 px-3 py-2 text-xs font-medium text-white shadow-sm transition hover:bg-sky-500 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-sky-400 disabled:pointer-events-none disabled:opacity-50 sm:w-auto sm:text-sm"
    >
      {pending ? "Guardando…" : "Eliminar fecha de la última interacción"}
    </button>
  );
}

export function ClearInteractionButton({
  remote_jid,
  canClear,
}: {
  remote_jid: string;
  canClear: boolean;
}) {
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

  function handleSubmit(e: FormEvent<HTMLFormElement>) {
    if (!window.confirm(CONFIRM_MESSAGE)) {
      e.preventDefault();
    }
  }

  return (
    <form action={clearInteractionDate} onSubmit={handleSubmit}>
      <input type="hidden" name="remote_jid" value={remote_jid} />
      <SubmitButton />
    </form>
  );
}
