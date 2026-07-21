"use client";

import { useEffect, useState } from "react";

type AvailabilityResponse = {
  available: boolean;
  updatedAt: string;
};

export function AvailabilitySwitch() {
  const [available, setAvailable] = useState(false);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const controller = new AbortController();

    async function loadAvailability() {
      try {
        const response = await fetch("/api/availability", {
          cache: "no-store",
          signal: controller.signal,
        });
        if (!response.ok) {
          throw new Error("No se pudo consultar la disponibilidad");
        }
        const data = (await response.json()) as AvailabilityResponse;
        setAvailable(data.available);
      } catch (loadError) {
        if ((loadError as Error).name !== "AbortError") {
          setError("No se pudo cargar el estado");
        }
      } finally {
        if (!controller.signal.aborted) {
          setLoading(false);
        }
      }
    }

    void loadAvailability();
    return () => controller.abort();
  }, []);

  async function toggleAvailability() {
    if (loading || saving) return;

    const previous = available;
    const next = !previous;
    setAvailable(next);
    setSaving(true);
    setError(null);

    try {
      const response = await fetch("/api/availability", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ available: next }),
      });
      if (!response.ok) {
        throw new Error("No se pudo guardar la disponibilidad");
      }
      const data = (await response.json()) as AvailabilityResponse;
      setAvailable(data.available);
    } catch {
      setAvailable(previous);
      setError("No se pudo guardar el estado");
    } finally {
      setSaving(false);
    }
  }

  const disabled = loading || saving;
  const statusLabel = loading
    ? "Consultando..."
    : saving
      ? "Guardando..."
      : available
        ? "Disponible"
        : "No disponible";

  return (
    <div className="flex flex-col items-end gap-1">
      <button
        type="button"
        role="switch"
        aria-checked={available}
        aria-label="Cambiar disponibilidad en Typebot"
        disabled={disabled}
        onClick={toggleAvailability}
        className={`flex min-h-[42px] items-center gap-3 whitespace-nowrap rounded-xl border px-3 py-2 text-sm font-semibold transition disabled:cursor-wait disabled:opacity-70 ${
          available
            ? "border-emerald-400/35 bg-emerald-500/15 text-emerald-200"
            : "border-white/15 bg-slate-900/70 text-slate-300"
        }`}
      >
        <span
          aria-hidden="true"
          className={`relative h-6 w-11 shrink-0 rounded-full transition ${
            available ? "bg-emerald-500" : "bg-slate-600"
          }`}
        >
          <span
            className={`absolute top-1 h-4 w-4 rounded-full bg-white shadow-sm transition-transform ${
              available ? "translate-x-6" : "translate-x-1"
            }`}
          />
        </span>
        <span className="min-w-[94px] text-left">{statusLabel}</span>
      </button>
      {error ? (
        <span role="alert" className="text-xs text-rose-300">
          {error}
        </span>
      ) : null}
    </div>
  );
}
