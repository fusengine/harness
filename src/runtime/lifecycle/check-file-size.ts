/**
 * PostToolUse (matcher "Write|Edit") for the solid scope: warn when a file
 * exceeds the adaptive `SOLID_FILE_LIMIT` (set by `solidDetectStart` at
 * SessionStart, keyed off the detected project type). Ports `check-file-size.py`.
 * Non-blocking (`additionalContext`), unlike the fixed-ceiling core-guards gate.
 */
import { extname } from "node:path";
import { readText, pathExists } from "../../util/runtime-io";
import { contextResponse } from "../../adapters/claude";
import { parseEnvInt } from "../../config/env";

/** Per-language "blank or comment" line pattern (parity `count_loc`'s `code_comment` map). */
const COMMENT_RE: Record<string, RegExp> = {
  ts: /^\s*$|^\s*\/\/|^\s*\/\*|^\s*\*/,
  tsx: /^\s*$|^\s*\/\/|^\s*\/\*|^\s*\*/,
  js: /^\s*$|^\s*\/\/|^\s*\/\*|^\s*\*/,
  jsx: /^\s*$|^\s*\/\/|^\s*\/\*|^\s*\*/,
  go: /^\s*$|^\s*\/\/|^\s*\/\*|^\s*\*/,
  rs: /^\s*$|^\s*\/\/|^\s*\/\*|^\s*\*/,
  java: /^\s*$|^\s*\/\/|^\s*\/\*|^\s*\*/,
  swift: /^\s*$|^\s*\/\/|^\s*\/\*|^\s*\*/,
  php: /^\s*$|^\s*\/\/|^\s*#|^\s*\/\*|^\s*\*/,
  py: /^\s*$|^\s*#|^\s*"""|^\s*'''/,
};

/** Count lines of code excluding comments/blanks for `filePath`'s extension (raw length when unmapped). */
export function countLoc(filePath: string, content: string): number {
  const pattern = COMMENT_RE[extname(filePath).slice(1)];
  const lines = content.split("\n");
  return pattern ? lines.filter((l) => !pattern.test(l)).length : lines.length;
}

/**
 * Warn when a written/edited file exceeds `SOLID_FILE_LIMIT` (default 100).
 * Inert when `SOLID_PROJECT_TYPE` is absent/"unknown" (parity: the Python hook
 * no-ops outside a detected project).
 * @param tool - The tool name (only "Write"/"Edit" are checked).
 * @param filePath - The written file's absolute path.
 * @param env - Environment (defaults to `process.env`).
 * @returns The PostToolUse `additionalContext` response, or `""` when clean/inert.
 */
export function checkFileSize(tool: string, filePath: string, env: Record<string, string | undefined> = process.env): string {
  const ptype = env.SOLID_PROJECT_TYPE ?? "";
  if (!ptype || ptype === "unknown") return "";
  if (tool !== "Write" && tool !== "Edit") return "";
  if (!filePath || !pathExists(filePath)) return "";

  let content: string;
  try {
    content = readText(filePath);
  } catch {
    return "";
  }

  const limit = parseEnvInt(env.SOLID_FILE_LIMIT, 100);
  const loc = countLoc(filePath, content);
  if (loc <= limit) return "";

  const name = filePath.split("/").pop() ?? filePath;
  return contextResponse("PostToolUse", `SOLID: ${name} has ${loc} lines (limit: ${limit}). Consider splitting into smaller modules.`);
}
