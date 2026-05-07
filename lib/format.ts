function parseToDate(value: string | Date | null | undefined): Date | null {
  if (value == null) {
    return null;
  }
  const d = typeof value === "string" ? new Date(value) : value;
  if (Number.isNaN(d.getTime())) {
    return null;
  }
  return d;
}

export function formatDateTime(value: string | Date | null | undefined): string {
  const d = parseToDate(value);
  if (!d) {
    return "—";
  }
  return new Intl.DateTimeFormat("es-CO", {
    dateStyle: "short",
    timeStyle: "medium",
    timeZone: "America/Bogota",
  }).format(d);
}

/** Date + hour + minutes in Bogotá, no seconds (for IntegrationSession.updatedAt). */
export function formatUpdatedAtBogota(
  value: string | Date | null | undefined,
): string {
  const d = parseToDate(value);
  if (!d) {
    return "—";
  }
  return new Intl.DateTimeFormat("es-CO", {
    timeZone: "America/Bogota",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).format(d);
}
