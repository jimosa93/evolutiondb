export function getAutocheckPdfOutputFileName(originalName: string) {
  const baseName = originalName
    .replace(/\.pdf$/i, "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-zA-Z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .replace(/-{2,}/g, "-");

  return `${baseName || "consulta"}-AutoCheck.pdf`;
}
