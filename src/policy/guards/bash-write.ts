import type { Prompt } from "../../prompt/types";
import type { GuardContext } from "./context";

/** Redirect (`>`/`>>`) targeting a code-file extension. */
export const CODE_REDIRECT: RegExp =
  /(?:>>?)\s*[^\s|;&]*\.(?:ts|tsx|js|jsx|py|go|rb|rs|java|kt|php|swift|vue|svelte|astro|css|c|cpp|h)\b/;

/** Interpreters / tools that mutate source in place, plus heredoc-into-file.
 * `sed`/`perl`/`awk` allow intervening flags before `-i` (parity bash-write-guard.py). */
export const CODE_MUTATORS: RegExp =
  /\bpython3?\s+-c\b|\bpython3?\s+-\s*<<|\bsed\b[^|]*\s-i|\bperl\b[^|]*\s-[pi]i?\b|\bawk\b[^|]*-i\s*inplace|\bpatch\b|<<[-~]?\s*['"]?\w+['"]?[\s\S]*?>/;

/** File-mutating one-liners via `node -e` / `ruby -e` (parity NODE_WRITES/RUBY_WRITES). */
const NODE_WRITES: RegExp =
  /writeFile|appendFile|createWriteStream|fs\.(?:write|rename|unlink|mkdir|rmdir|copyFile)|execSync|spawnSync|child_process/;
const RUBY_WRITES: RegExp =
  /File\.(?:write|open|delete|rename)|IO\.write|FileUtils|\bsystem\b|\bexec\b|`[^`]/;

/** Redirect to a non-code file. Excludes `/dev/null`, `2>`/`N>` and `>&N` fd
 * redirects via the `(?<![0-9&])` lookbehind + `(?!…|&)` (parity has_file_redirect). */
export const FILE_REDIRECT: RegExp =
  /(?<![0-9&])\s*>>?\s*(?!\/dev\/null|&)[a-zA-Z./~$]/;

/** Other ambiguous file writers (ASK): `tee <file>` (not `tee -a`/path) and `dd … of=`. */
export const ASK_WRITERS: RegExp = /\btee\s+[^-/\s]|\bdd\b[^|]*\bof=/;

/**
 * Blocks shell commands that mutate code files in place (and heredocs/redirects
 * to source files); asks before other file-writing shell commands. Forces use
 * of the Write/Edit tool so APEX/SOLID checks are not bypassed.
 */
export function bashWriteGuard(ctx: GuardContext): Prompt | null {
  if (ctx.tool !== "Bash" || !ctx.command) return null;
  const cmd: string = ctx.command;

  if (CODE_MUTATORS.test(cmd) || CODE_REDIRECT.test(cmd)) {
    return {
      kind: "block",
      title: "Bash write to code file",
      reason: "Shell in-place edits / redirects to source files bypass APEX/SOLID checks.",
      actions: ["Use the Write/Edit tool instead"],
    };
  }
  if (
    FILE_REDIRECT.test(cmd) ||
    ASK_WRITERS.test(cmd) ||
    (/\bnode\s+-e\b/.test(cmd) && NODE_WRITES.test(cmd)) ||
    (/\bruby\s+-e\b/.test(cmd) && RUBY_WRITES.test(cmd))
  ) {
    return {
      kind: "ask",
      title: "Bash file write",
      reason: "This command writes a file from the shell; confirm it is intended.",
      actions: ["Use the Write/Edit tool instead"],
    };
  }
  return null;
}
