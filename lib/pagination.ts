export const PAGE_SIZE = 20;

export function parsePage(raw: string | string[] | undefined): number {
  const value = Array.isArray(raw) ? raw[0] : raw;
  const n = parseInt(value ?? "1", 10);
  if (!Number.isFinite(n) || n < 1) {
    return 1;
  }
  return n;
}

export function buildListHref(query: string | undefined, page: number): string {
  const params = new URLSearchParams();
  if (query?.trim()) {
    params.set("q", query.trim());
  }
  if (page > 1) {
    params.set("page", String(page));
  }
  const s = params.toString();
  return s ? `/?${s}` : "/";
}
