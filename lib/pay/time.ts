/**
 * RFC 3339 → epoch ms. gum-server writes anywhere from zero to six fractional digits; some
 * engines reject more than three, so the fraction is cut to milliseconds before parsing.
 */
export function parseTime(iso: string | null | undefined): number | null {
  if (!iso) return null;
  const normalized = iso.replace(/(\.\d{3})\d+/, "$1");
  const t = Date.parse(normalized);
  return Number.isNaN(t) ? null : t;
}
