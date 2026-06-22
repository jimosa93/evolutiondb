"use client";

import { useRef, useState } from "react";

import { getAutocheckPdfOutputFileName } from "@/lib/autocheckPdfFileName";

function redirectIfUnauthorized(res: Response) {
  if (res.status === 401) {
    window.location.href = "/login";
    return true;
  }
  return false;
}

export function AutocheckPdfPanel() {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [includeModel2020Notice, setIncludeModel2020Notice] = useState(false);
  const [includeContactNumbers, setIncludeContactNumbers] = useState(false);
  const [processing, setProcessing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);

  function handleFileChange(event: React.ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0] ?? null;
    setSelectedFile(file);
    setError(null);
    setSuccessMessage(null);
  }

  async function handleGenerate() {
    if (!selectedFile) {
      setError("Seleccione un archivo PDF para continuar.");
      return;
    }

    setProcessing(true);
    setError(null);
    setSuccessMessage(null);

    try {
      const formData = new FormData();
      formData.append("file", selectedFile);
      formData.append("includeModel2020Notice", String(includeModel2020Notice));
      formData.append("includeContactNumbers", String(includeContactNumbers));

      const response = await fetch("/api/autocheck-pdf", {
        method: "POST",
        body: formData,
        credentials: "same-origin",
      });

      if (redirectIfUnauthorized(response)) {
        return;
      }

      if (!response.ok) {
        const data = (await response.json().catch(() => null)) as { error?: string } | null;
        throw new Error(data?.error ?? "No se pudo generar el reporte.");
      }

      const blob = await response.blob();
      const downloadUrl = URL.createObjectURL(blob);
      const outputName = getAutocheckPdfOutputFileName(selectedFile.name);
      const anchor = document.createElement("a");
      anchor.href = downloadUrl;
      anchor.download = outputName;
      anchor.click();
      URL.revokeObjectURL(downloadUrl);

      setSuccessMessage(`Reporte generado: ${outputName}`);
    } catch (generateError) {
      const message =
        generateError instanceof Error
          ? generateError.message
          : "No se pudo generar el reporte.";
      setError(message);
    } finally {
      setProcessing(false);
    }
  }

  function handleReset() {
    setSelectedFile(null);
    setIncludeModel2020Notice(false);
    setIncludeContactNumbers(false);
    setError(null);
    setSuccessMessage(null);
    if (fileInputRef.current) {
      fileInputRef.current.value = "";
    }
  }

  return (
    <section className="space-y-6">
      <div className="rounded-2xl border border-white/10 bg-slate-900/45 p-6 shadow-xl shadow-black/20 sm:p-8">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
          <div className="min-w-0">
            <h1 className="text-2xl font-bold tracking-tight text-white">Autocheck PDF</h1>
            <p className="mt-2 max-w-2xl text-sm leading-relaxed text-slate-300">
              Cargue un reporte PDF del proveedor para extraer sus datos y generar un PDF nuevo
              con el formato, estructura visual y marca de Autocheck.
            </p>
          </div>
          <img
            src="/autocheck-logo.png"
            alt="Logo Autocheck"
            className="h-14 w-auto shrink-0 rounded-lg bg-white px-3 py-2"
          />
        </div>
      </div>

      <div className="rounded-2xl border border-white/10 bg-slate-900/45 p-6 shadow-xl shadow-black/20 sm:p-8">
        <div className="space-y-5">
          <div>
            <label
              htmlFor="autocheck-pdf-input"
              className="mb-2 block text-sm font-semibold text-slate-200"
            >
              Archivo PDF del proveedor
            </label>
            <input
              ref={fileInputRef}
              id="autocheck-pdf-input"
              type="file"
              accept="application/pdf,.pdf"
              onChange={handleFileChange}
              className="block w-full cursor-pointer rounded-xl border border-dashed border-white/20 bg-slate-950/40 px-4 py-4 text-sm text-slate-200 file:mr-4 file:rounded-lg file:border-0 file:bg-sky-600 file:px-4 file:py-2 file:text-sm file:font-semibold file:text-white hover:border-sky-400/40"
            />
            {selectedFile ? (
              <p className="mt-2 text-sm text-slate-400">
                Archivo seleccionado:{" "}
                <span className="font-medium text-slate-200">{selectedFile.name}</span>{" "}
                <span className="text-slate-500">
                  ({(selectedFile.size / 1024 / 1024).toFixed(2)} MB)
                </span>
              </p>
            ) : (
              <p className="mt-2 text-sm text-slate-500">
                Formatos aceptados: PDF. Tamaño máximo: 25 MB.
              </p>
            )}
          </div>

          <div className="rounded-xl border border-white/10 bg-slate-950/35 p-4">
            <p className="text-sm font-semibold text-slate-100">Opciones del encabezado</p>
            <div className="mt-3 grid gap-3 sm:grid-cols-2">
              <label className="flex cursor-pointer items-start gap-3 rounded-lg border border-white/10 bg-slate-900/50 p-3 text-sm text-slate-300 transition hover:border-sky-400/40">
                <input
                  type="checkbox"
                  checked={includeModel2020Notice}
                  onChange={(event) => setIncludeModel2020Notice(event.target.checked)}
                  disabled={processing}
                  className="mt-0.5 h-4 w-4 rounded border-white/20 bg-slate-950 text-sky-500 focus:ring-sky-500 disabled:cursor-not-allowed disabled:opacity-50"
                />
                <span>
                  <span className="block font-medium text-slate-100">Modelo 2020</span>
                  <span className="mt-1 block text-xs leading-relaxed text-slate-400">
                    Agrega &quot;Siniestros y reclamaciones 2020 en adelante.&quot; debajo de
                    Histórica Reciente.
                  </span>
                </span>
              </label>

              <label className="flex cursor-pointer items-start gap-3 rounded-lg border border-white/10 bg-slate-900/50 p-3 text-sm text-slate-300 transition hover:border-sky-400/40">
                <input
                  type="checkbox"
                  checked={includeContactNumbers}
                  onChange={(event) => setIncludeContactNumbers(event.target.checked)}
                  disabled={processing}
                  className="mt-0.5 h-4 w-4 rounded border-white/20 bg-slate-950 text-sky-500 focus:ring-sky-500 disabled:cursor-not-allowed disabled:opacity-50"
                />
                <span>
                  <span className="block font-medium text-slate-100">Números de contacto</span>
                  <span className="mt-1 block text-xs leading-relaxed text-slate-400">
                    Agrega &quot;Contacto: 310 5523591 - 312 4095620&quot; debajo de la fecha.
                  </span>
                </span>
              </label>
            </div>
          </div>

          <div className="rounded-xl border border-white/10 bg-slate-950/35 p-4 text-sm text-slate-300">
            <p className="font-semibold text-slate-100">Ajustes aplicados al reporte</p>
            <ul className="mt-2 list-disc space-y-1 pl-5 text-slate-400">
              <li>Extracción estructurada de placa, vehículo, ficha técnica y valoración</li>
              <li>Reconstrucción completa en un template PDF propio de Autocheck</li>
              <li>Score, factores de riesgo y categorías dibujados como componentes visuales</li>
              <li>Paginación automática para reportes con secciones adicionales</li>
            </ul>
          </div>

          {error ? (
            <p
              role="alert"
              className="rounded-xl border border-red-500/30 bg-red-950/40 px-4 py-3 text-sm text-red-200"
            >
              {error}
            </p>
          ) : null}

          {successMessage ? (
            <p
              role="status"
              className="rounded-xl border border-emerald-500/30 bg-emerald-950/35 px-4 py-3 text-sm text-emerald-200"
            >
              {successMessage}
            </p>
          ) : null}

          <div className="flex flex-wrap gap-3">
            <button
              type="button"
              onClick={handleGenerate}
              disabled={!selectedFile || processing}
              className="rounded-xl bg-sky-600 px-5 py-2.5 text-sm font-semibold text-white transition hover:bg-sky-500 disabled:cursor-not-allowed disabled:opacity-50"
            >
              {processing ? "Generando reporte..." : "Generar reporte Autocheck"}
            </button>
            <button
              type="button"
              onClick={handleReset}
              disabled={processing}
              className="rounded-xl border border-white/15 px-5 py-2.5 text-sm font-medium text-slate-200 transition hover:bg-white/10 disabled:cursor-not-allowed disabled:opacity-50"
            >
              Limpiar
            </button>
          </div>
        </div>
      </div>
    </section>
  );
}
