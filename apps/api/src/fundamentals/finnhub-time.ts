/**
 * Normalize Finnhub economic-calendar timestamps to ISO UTC.
 *
 * Finnhub's calendar schema provides a single `time` string. Common
 * timezone-less values use `YYYY-MM-DD HH:mm:ss`; treat those as UTC so
 * server-side filtering and browser rendering use the same instant.
 */
export function parseFinnhubReleaseTime(value: unknown): string | null {
  if (typeof value !== "string") return null;

  const raw = value.trim();
  if (!raw) return null;

  const normalizedSeparator = raw.replace(
    /^(\\d{4}-\\d{2}-\\d{2})\\s+(\\d{2}:\\d{2}(?::\\d{2}(?:\\.\\d+)?)?)(?=Z|[+-]|$)/i,
    "$1T$2",
  );

  const hasExplicitOffset = /(?:Z|[+-]\\d{2}:?\\d{2})$/i.test(
    normalizedSeparator,
  );
  const withTimezone = hasExplicitOffset
    ? normalizedSeparator
    : `${normalizedSeparator}Z`;
  const parsed = new Date(withTimezone);

  return Number.isFinite(parsed.getTime()) ? parsed.toISOString() : null;
}
