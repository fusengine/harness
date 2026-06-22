/**
 * Robust integer-from-env parser.
 * undefined / empty / whitespace / NaN / float / <= 0 all fall back to `fallback`.
 * `Number("")` is 0, so the empty guard is required before `Number()`.
 */
export function parseEnvInt(raw: string | undefined, fallback: number): number {
  if (!raw?.trim()) return fallback;
  const n = Number(raw.trim());
  return Number.isInteger(n) && n > 0 ? n : fallback;
}
