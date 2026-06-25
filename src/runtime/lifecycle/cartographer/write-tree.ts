/**
 * Recursive index.md tree writer. Ports `write_recursive.py`.
 */
import { mkdirSync, writeFileSync } from "node:fs";
import { basename, join } from "node:path";
import { countFiles, getFileDesc, listChildren } from "./fs-util";
import { mergeLines } from "./merge";

/**
 * Write `index.md` files mirroring `source` under `output`, recursing into
 * subdirectories. Directory lines carry a file-count hint; file lines carry a
 * derived description and link to the real absolute source path.
 * @param source - Absolute source directory.
 * @param output - Absolute output directory for the index tree.
 * @param back - Relative `← back` link target ("" at the root).
 * @param exclude - Directory/name set to skip.
 */
export function writeTree(source: string, output: string, back: string = "", exclude?: ReadonlySet<string>): void {
  const ex = exclude ?? new Set<string>();
  mkdirSync(output, { recursive: true });
  const { dirs, files } = listChildren(source, ex);
  const lines: string[] = [`# ${basename(source)}\n`];
  if (back) lines.push(`> [← back](${back})\n`);
  const total = dirs.length + files.length;
  let idx = 0;
  for (const d of dirs) {
    idx += 1;
    const conn = idx === total ? "└──" : "├──";
    const count = countFiles(d, ex);
    const hint = count ? ` — ${count} files` : "";
    lines.push(`${conn} [${basename(d)}/](./${basename(d)}/index.md)${hint}`);
    writeTree(d, join(output, basename(d)), "../index.md", exclude);
  }
  for (const f of files) {
    idx += 1;
    const conn = idx === total ? "└──" : "├──";
    const desc = getFileDesc(f);
    const suffix = desc ? ` — ${desc}` : "";
    lines.push(`${conn} [${basename(f)}](${f})${suffix}`);
  }
  const indexPath = join(output, "index.md");
  const merged = mergeLines(lines, indexPath);
  writeFileSync(indexPath, merged.join("\n") + "\n", "utf-8");
}
