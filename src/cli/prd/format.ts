/**
 * Rendering helpers for `harness prd` output: an aligned ASCII table for the
 * human-readable path, and pretty JSON for `--json`.
 */

/** Pad `s` with trailing spaces to `width`. */
function pad(s: string, width: number): string {
  return s.length >= width ? s : s + " ".repeat(width - s.length);
}

/** Render an aligned ASCII table from a header row + data rows. */
export function renderTable(header: string[], rows: string[][]): string {
  const all: string[][] = [header, ...rows];
  const widths = header.map((_, col) => Math.max(...all.map((r) => (r[col] ?? "").length)));
  return all
    .map((r) => r.map((cell, col) => pad(cell ?? "", widths[col] ?? 0)).join("  ").trimEnd())
    .join("\n");
}

/** Render `data` as pretty-printed JSON with a trailing newline. */
export function renderJson(data: unknown): string {
  return JSON.stringify(data, null, 2) + "\n";
}
