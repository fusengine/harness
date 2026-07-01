import { execFileSync } from "node:child_process";
import { extname, resolve, sep } from "node:path";
import type { Prompt } from "../prompt/types";
import { DRY_KEYWORDS as KEYWORDS, TS_EXT, TS_PATTERNS, PHP_PATTERNS, EXCLUDE_DIRS } from "./dry-patterns";

/** Extract long (>12 char) declared symbol names from new file content. */
export function extractSymbols(content: string, ext: string): string[] {
  const pats = TS_EXT.has(ext) ? TS_PATTERNS : ext === ".php" ? PHP_PATTERNS : [];
  const names = new Set<string>();
  for (const re of pats) {
    for (const m of content.matchAll(re)) {
      const n = m[1];
      if (n && !KEYWORDS.has(n) && n.length > 12) names.add(n);
    }
  }
  return [...names];
}

/** `modules/X/...` -> `"X"`, else `""` (module-boundary key). */
function moduleOf(path: string): string {
  const parts = path.split(sep);
  const i = parts.indexOf("modules");
  return i >= 0 && i + 1 < parts.length ? (parts[i + 1] ?? "") : "";
}

/** Verdict from {@link detectDuplication}. */
export interface DuplicationVerdict {
  names: string[];
  duplicates: string[];
}

/**
 * Grep the codebase for existing declarations of the symbols a write introduces,
 * honoring module boundaries (cross-`modules/` matches are ignored). Effectful:
 * shells out to `grep`. Fails open (returns no duplicates) on any grep error,
 * timeout, or no-match — matching the original Python hook.
 */
export function detectDuplication(filePath: string, content: string, cwd: string): DuplicationVerdict {
  const ext = extname(filePath).toLowerCase();
  if (!TS_EXT.has(ext) && ext !== ".php") return { names: [], duplicates: [] };
  const names = extractSymbols(content, ext);
  if (!names.length) return { names, duplicates: [] };
  const include = TS_EXT.has(ext)
    ? ["--include=*.ts", "--include=*.tsx", "--include=*.js", "--include=*.jsx"]
    : ["--include=*.php"];
  const decl = TS_EXT.has(ext) ? "(function|const|let|class|interface)\\s+" : "(function|class|interface|trait)\\s+";
  const escaped = names.map((n) => n.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")).join("|");
  const pattern = `${decl}(${escaped})\\b`;
  let out = "";
  try {
    const args = ["-rEl", ...EXCLUDE_DIRS.map((d) => `--exclude-dir=${d}`), ...include, "--", pattern, cwd];
    out = execFileSync("grep", args, { encoding: "utf8", timeout: 1500 });
  } catch {
    return { names, duplicates: [] };
  }
  const self = resolve(filePath);
  const targetMod = moduleOf(filePath);
  const duplicates: string[] = [];
  for (const line of out.split("\n")) {
    const f = line.trim();
    if (!f || resolve(f) === self) continue;
    const dupMod = moduleOf(f);
    if (targetMod && dupMod && dupMod !== targetMod) continue;
    duplicates.push(f);
  }
  return { names, duplicates };
}

/**
 * Prompt when a Write/Edit re-declares an existing symbol: a single match is a
 * softer non-blocking "inform" (could be a false positive / same-name coincidence),
 * escalating to a hard "block" once 2+ existing declarations are found. Returns
 * `null` when no duplicate symbol is found at all.
 */
export function dryGate(tool: string, filePath: string, content: string | undefined, cwd: string | undefined): Prompt | null {
  if (!cwd || (tool !== "Write" && tool !== "Edit") || !content) return null;
  const dup = detectDuplication(filePath, content, cwd);
  if (dup.duplicates.length === 0) return null;
  const names = dup.names.slice(0, 5).join(", ");
  let files = dup.duplicates.slice(0, 3).join(", ");
  if (dup.duplicates.length > 3) files += ` (+${dup.duplicates.length - 3} more)`;
  if (dup.duplicates.length === 1) {
    return {
      kind: "inform",
      title: "Possible duplicate code (DRY)",
      reason: `[${names}] already declared in: ${files}. Consider importing and reusing instead of re-declaring.`,
      actions: ["Import the existing symbol instead of re-declaring it", "Extend the existing module"],
    };
  }
  return {
    kind: "block",
    title: "Duplicate code (DRY)",
    reason: `[${names}] already declared in: ${files}. Import and reuse instead of re-declaring.`,
    actions: ["Import the existing symbol instead of re-declaring it", "Extend the existing module"],
  };
}
