import type { Prompt } from "../../prompt/types";
import type { GuardContext } from "./context";

/** Redirect (`>`/`>>`) targeting a code-file extension. */
export const CODE_REDIRECT: RegExp =
  /(?:>>?)\s*[^\s|;&]*\.(?:ts|tsx|js|jsx|py|go|rb|rs|java|kt|php|swift|vue|svelte|c|cpp|h)\b/;

/** Interpreters / tools that mutate source in place, plus heredoc-into-file. */
export const CODE_MUTATORS: RegExp =
  /\bpython3?\s+-c\b|\bsed\s+-i\b|\bperl\s+-i\b|\bawk\s+-i\s+inplace\b|\bpatch\s+|<<[-~]?\s*['"]?\w+['"]?[\s\S]*?>/;

/** Redirect to a non-code file, or other ambiguous file writers (ASK). */
export const ASK_WRITERS: RegExp =
  /(?:>>?\s*[^\s|;&]+)|\btee\s+|\bdd\s+of=|\bnode\s+-e\b.*(?:writeFile|appendFile)|\bruby\s+-e\b.*File\.write/;

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
  if (ASK_WRITERS.test(cmd)) {
    return {
      kind: "ask",
      title: "Bash file write",
      reason: "This command writes a file from the shell; confirm it is intended.",
      actions: ["Use the Write/Edit tool instead"],
    };
  }
  return null;
}
