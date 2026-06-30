/**
 * Hook scanning (fs). Ports `_scan_hooks` from `scan_plugins.py`: reads a
 * plugin's `hooks/hooks.json` and reduces it to a single `("hooks", "<events>", "")`
 * row. The `hooks` value (or the whole document) is either a MAP of event →
 * entries (keys are the events) or a LIST of entries each carrying an `event`.
 */
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import type { ScanRow } from "../../../policy/cartographer/build-tree";

/** True for a non-null plain object (excludes arrays), mirroring Python `isinstance(x, dict)`. */
function isPlainObject(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null && !Array.isArray(v);
}

/** Sort unique non-empty strings alpha (byte-order). */
function sortedEvents(events: Iterable<string>): string[] {
  return [...new Set([...events].filter((e) => e))].sort((a, b) => a.localeCompare(b, "en"));
}

/** Derive hook event names from the `hooks.json` data (map keys, or list `event` fields). */
function hookEvents(hooksData: unknown): string[] {
  if (isPlainObject(hooksData)) {
    return sortedEvents(Object.keys(hooksData).filter((k) => !k.startsWith("_")));
  }
  if (Array.isArray(hooksData)) {
    return sortedEvents(hooksData.map((h) => (isPlainObject(h) ? String(h.event ?? "") : "")));
  }
  return [];
}

/**
 * Scan `hooks/hooks.json` into a single `("hooks", "<events>", "")` row.
 * @param root - Absolute plugin directory.
 * @returns The single hooks row, or `[]` when absent/empty/unreadable.
 */
export function scanHooks(root: string): ScanRow[] {
  const file = join(root, "hooks", "hooks.json");
  if (!existsSync(file)) return [];
  try {
    const raw: unknown = JSON.parse(readFileSync(file, "utf-8"));
    const hooksData = isPlainObject(raw) ? (raw.hooks ?? raw) : {};
    const events = hookEvents(hooksData);
    return events.length ? [["hooks", events.join(", "), ""]] : [];
  } catch {
    return [];
  }
}
