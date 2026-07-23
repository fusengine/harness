/**
 * Dependency-free semver ordering. `Array.prototype.sort()` compares strings
 * lexicographically — `"1.0.9" > "1.0.23"` — so versioned directories (plugin
 * caches) must be ordered with a numeric, segment-by-segment comparison.
 */

/**
 * Compare two dotted version strings numerically, segment by segment
 * (shorter version wins when a prefix is equal: `1.0` < `1.0.1`). A segment
 * that is not a plain integer (prerelease tag like `0-beta`) falls back to
 * lexicographic comparison of that segment — never NaN, so `sort()` stays
 * defined; identical strings compare 0.
 * @returns Negative when `a < b`, positive when `a > b`, 0 when equal.
 */
export function compareSemver(a: string, b: string): number {
  const pa = a.split("."), pb = b.split(".");
  for (let i = 0; i < Math.max(pa.length, pb.length); i++) {
    const sa = pa[i] ?? "0", sb = pb[i] ?? "0";
    if (sa === sb) continue;
    const na = Number(sa), nb = Number(sb);
    if (Number.isInteger(na) && Number.isInteger(nb) && na !== nb) return na - nb;
    return sa < sb ? -1 : 1;
  }
  return 0;
}

/** The highest version of the list, or null when empty. */
export function maxSemver(versions: string[]): string | null {
  return versions.length === 0 ? null : versions.reduce((a, b) => (compareSemver(a, b) >= 0 ? a : b));
}
