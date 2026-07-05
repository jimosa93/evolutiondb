"use client";

import { useRef, useState } from "react";

import { getCertificarPdfOutputFileName } from "@/lib/certificarPdfFileName";

const QUERY_TYPE_OPTIONS = ["RECIENTE", "PLUS", "ELITE", "PREMIUM"] as const;
type CertificarQueryType = (typeof QUERY_TYPE_OPTIONS)[number];

function redirectIfUnauthorized(res: Response) {
  if (res.status === 401) {
    window.location.href = "/login";
    return true;
  }
  return false;
}

export function CertificarPdfPanel() {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [queryType, setQueryType] = useState<CertificarQueryType>("PREMIUM");
  const [addContactNumber, setAddContactNumber] = useState(true);
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
      formData.append("queryType", queryType);
      formData.append("addContactNumber", String(addContactNumber));

      const response = await fetch("/api/certificar-pdf", {
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
      const outputName = getCertificarPdfOutputFileName(selectedFile.name);
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
            <h1 className="text-2xl font-bold tracking-tight text-white">Certificar PDF</h1>
            <p className="mt-2 max-w-2xl text-sm leading-relaxed text-slate-300">
              Cargue un reporte PDF de Certificar para conservar su contenido y reemplazar el
              encabezado y pie de página con el formato visual de AutoCheck.
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
              htmlFor="certificar-pdf-input"
              className="mb-2 block text-sm font-semibold text-slate-200"
            >
              Archivo PDF de Certificar
            </label>
            <input
              ref={fileInputRef}
              id="certificar-pdf-input"
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

          <fieldset className="rounded-xl border border-white/10 bg-slate-950/35 p-4">
            <legend className="px-1 text-sm font-semibold text-slate-200">
              Tipo de consulta
            </legend>
            <div className="mt-3 grid gap-3 sm:grid-cols-4">
              {QUERY_TYPE_OPTIONS.map((option) => (
                <label
                  key={option}
                  className="flex cursor-pointer items-center gap-2 rounded-lg border border-white/10 bg-slate-900/55 px-3 py-2 text-sm font-medium text-slate-200 transition hover:border-sky-400/40"
                >
                  <input
                    type="radio"
                    name="certificar-query-type"
                    value={option}
                    checked={queryType === option}
                    onChange={() => setQueryType(option)}
                    className="h-4 w-4 border-slate-500 bg-slate-950 text-sky-500 focus:ring-sky-500"
                  />
                  {option}
                </label>
              ))}
            </div>
            <p className="mt-3 text-xs text-slate-500">
              Este valor se mostrará en el header como AUTOCHECK {queryType}.
            </p>
          </fieldset>

          <label className="flex cursor-pointer items-start gap-3 rounded-xl border border-white/10 bg-slate-950/35 p-4 text-sm text-slate-300 transition hover:border-sky-400/40">
            <input
              type="checkbox"
              checked={addContactNumber}
              onChange={(event) => setAddContactNumber(event.target.checked)}
              className="mt-0.5 h-4 w-4 rounded border-slate-500 bg-slate-950 text-sky-500 focus:ring-sky-500"
            />
            <span>
              <span className="block font-semibold text-slate-100">
                Agregar número de contacto
              </span>
              <span className="mt-1 block text-xs text-slate-500">
                Si está activo, se incluirá el WhatsApp 310 552 3591 debajo del logo en el footer.
              </span>
            </span>
          </label>

          <div className="rounded-xl border border-white/10 bg-slate-950/35 p-4 text-sm text-slate-300">
            <p className="font-semibold text-slate-100">Ajustes aplicados al documento</p>
            <ul className="mt-2 list-disc space-y-1 pl-5 text-slate-400">
              <li>Reemplaza el header original sólo en la primera página</li>
              <li>Dibuja un footer AutoCheck en todas las páginas con numeración dinámica</li>
              <li>Extrae placa, fecha, informe y datos del vehículo desde el PDF fuente</li>
              <li>Conserva el contenido central del reporte original</li>
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
              {processing ? "Generando reporte..." : "Generar reporte Certificar"}
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
