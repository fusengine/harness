import { basename } from "node:path";
import { resolveMaxLines, splitTarget } from "../config/limits";

/**
 * Fixed marketplace plugins root — parity with Python `enforce-file-size.py`'s
 * literal, unexpanded `~/...` string. Exported: reused by
 * `policy/apex.ts::solidReadGate` for its "no reference matched" deny message.
 */
export const PLUGINS_DIR = "~/.claude/plugins/marketplaces/fusengine-plugins/plugins";

/**
 * Skill-dir fragment per framework — parity with Python
 * `enforce-file-size.py::get_solid_ref()` (falls back to `generic/`). Exported:
 * reused by `policy/apex.ts::solidReadGate` (see {@link PLUGINS_DIR}).
 */
export const SOLID_REF: Record<string, string> = {
  react: "react-expert/skills/solid-react/",
  nextjs: "nextjs-expert/skills/solid-nextjs/",
  laravel: "laravel-expert/skills/solid-php/",
  swift: "swift-apple-expert/skills/solid-swift/",
};

/** Verdict from {@link evaluateFileSize}. */
export interface FileSizeVerdict {
  ok: boolean;
  lines: number;
  max: number;
  message: string | null;
}

/**
 * Count physical lines — parity with the Python `enforce-file-size.py`
 * (`sum(1 for _ in f)`): every line counts (blanks and comments included), and a
 * single trailing newline does not add a phantom line. The SOLID ceiling is
 * measured on raw file length, not substantive code, to match the upstream plugin.
 */
export function countLines(content: string): number {
  if (content === "") return 0;
  return content.split("\n").length - (content.endsWith("\n") ? 1 : 0);
}

/**
 * Count non-empty, non-comment lines — parity with the Python `count_code_lines`
 * shared by the framework-specific SOLID validators: `_shared/scripts/validate_solid_common.py`
 * (imported by `nextjs-expert/scripts/validate-nextjs-solid.py` and
 * `swift-apple-expert/scripts/validate-swift-solid.py`), duplicated verbatim in
 * `react-expert/scripts/validate-react-solid.py` / `laravel-expert/scripts/validate-laravel-solid.py`.
 * Strips blank lines and lines starting with `//` or `*` — a SINGLE fixed rule
 * for all 4 callers (the Python `comment` param defaults to, and every real
 * call site leaves it at, `"//"` — never per-language despite covering
 * ts/tsx/js/jsx, php and swift).
 *
 * Deliberately distinct from two other "code-only" counters already in this
 * repo, neither of which is a faithful substitute here:
 *  - `countLoc` (`runtime/lifecycle/check-file-size.ts`): a genuinely
 *    per-language table (PHP additionally strips `#`, Python strips
 *    `#`/`"""`/`'''`) — ported from the unrelated `solid/scripts/check-file-size.py`.
 *  - `countCodeLines` (`runtime/lifecycle/aipilot/solid-compliance.ts`): also
 *    strips `#` — ported from `ai-pilot/scripts/check-solid-compliance.py`.
 * Reusing either would silently strip PHP `#`/Python-style comments that the
 * real react/nextjs/laravel/swift validators do NOT strip.
 * @param content - The file content to measure.
 */
export function countFrameworkCodeLines(content: string): number {
  let count = 0;
  for (const raw of content.split("\n")) {
    const line = raw.trim();
    if (!line || line.startsWith("//") || line.startsWith("*")) continue;
    count++;
  }
  return count;
}

/**
 * Evaluate a file's line count against the SOLID limit.
 * @param lines - the file's line count
 * @param max - the limit (defaults to `resolveMaxLines()`)
 */
export function evaluateFileSize(
  lines: number,
  max: number = resolveMaxLines(),
  filePath = "",
  framework = "generic",
  displayLines: number = lines,
): FileSizeVerdict {
  if (lines <= max) return { ok: true, lines, max, message: null };
  const split = splitTarget(max);
  const fname = filePath ? basename(filePath) : "file";
  const ref = SOLID_REF[framework] ?? "generic/";
  return {
    ok: false,
    lines,
    max,
    message: `BLOCKED: '${fname}' has ${displayLines} lines (max: ${max}). TO SPLIT: 1) Read SOLID rules: ${PLUGINS_DIR}/${ref} 2) Create new module files (<${split} lines each) 3) Use Write to replace '${fname}' with <${max} lines version.`,
  };
}
