/**
 * Filesystem helpers for the cartographer tree walk. Ports the fs parts of
 * `describe.py` (file desc) and `write_recursive.py` (children + counts).
 */
import { readFileSync, readdirSync } from "node:fs";
import { extname, join } from "node:path";
import { descFromText } from "../../../policy/cartographer/describe";
import { parseField } from "../../../policy/cartographer/frontmatter";

/**
 * Read a file and derive its one-line description (frontmatter / heading /
 * comment). "" on any error or when nothing is found.
 * @param filePath - Absolute path to the file.
 * @returns The description, or "".
 */
export function getFileDesc(filePath: string): string {
  let text = "";
  try {
    text = readFileSync(filePath, "utf-8");
  } catch {
    return "";
  }
  const suffix = extname(filePath);
  const mdField = suffix === ".md" ? parseField(text, "description") : "";
  return descFromText(suffix, text, mdField);
}

/**
 * Recursively count files whose relative path parts are all visible (no leading
 * "." or "_") and none excluded. Best-effort (partial count on errors).
 * @param dir - Directory to count under.
 * @param exclude - Directory/name set to skip.
 * @returns The file count.
 */
export function countFiles(dir: string, exclude: ReadonlySet<string>): number {
  let total = 0;
  try {
    for (const e of readdirSync(dir, { withFileTypes: true })) {
      if (e.name.startsWith(".") || e.name.startsWith("_") || exclude.has(e.name)) continue;
      if (e.isDirectory()) total += countFiles(join(dir, e.name), exclude);
      else if (e.isFile()) total += 1;
    }
  } catch { /* best effort */ }
  return total;
}

/** Absolute children of `source`, split into dirs/files, sorted by full path. */
export function listChildren(source: string, exclude: ReadonlySet<string>): { dirs: string[]; files: string[] } {
  const dirs: string[] = [];
  const files: string[] = [];
  let entries;
  try {
    entries = readdirSync(source, { withFileTypes: true });
  } catch {
    return { dirs, files };
  }
  for (const e of entries) {
    if (e.name.startsWith(".") || e.name.startsWith("_") || exclude.has(e.name)) continue;
    const abs = join(source, e.name);
    if (e.isDirectory()) dirs.push(abs);
    else if (e.isFile()) files.push(abs);
  }
  return { dirs: dirs.sort(), files: files.sort() };
}
