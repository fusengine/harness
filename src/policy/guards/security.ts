import type { Prompt } from "../../prompt/types";
import type { GuardContext } from "./context";

/** Critical patterns that must always be blocked. */
export const CRITICAL_PATTERNS: RegExp[] = [
  /\brm\s+(?:-[a-z]*\s+)*-[a-z]*[rf][a-z]*\s+(?:-[a-z]+\s+)*(?:\/|~)(?:\s|$)/,
  /:\(\)\s*\{\s*:\s*\|\s*:\s*&\s*\}\s*;\s*:/,
  /\b(?:curl|wget)\b[^|]*\|\s*(?:sudo\s+)?(?:ba|z|da|k)?sh\b/,
  /\bchmod\s+(?:-[a-zA-Z]+\s+)*777\s+\//,
  /\bmkfs(?:\.[a-z0-9]+)?\b/,
  /\bdd\b[^\n]*\bif=\/dev\/zero\b[^\n]*\bof=\/dev\//,
];

/** Patterns that warrant explicit confirmation before running. */
export const ASK_PATTERNS: RegExp[] = [
  /\bsudo\s/,
  /\bchmod\s+(?:-[a-zA-Z]+\s+)*777\b/,
  /\bchown\s+-R\b/,
  /\beval\s/,
  /(?:>|>>|\btee\b)\s*\/etc\//,
];

/** Guards against dangerous Bash commands (critical → block, sensitive → ask). */
export function securityGuard(ctx: GuardContext): Prompt | null {
  if (ctx.tool !== "Bash" || !ctx.command) return null;
  const cmd: string = ctx.command;

  for (const re of CRITICAL_PATTERNS) {
    if (re.test(cmd)) {
      return {
        kind: "block",
        title: "Dangerous command",
        reason: "Command matches a destructive pattern (recursive root delete, fork bomb, remote-script piped to a shell, world-writable root, filesystem format, or disk overwrite).",
        actions: ["Remove the destructive command", "Scope the operation to a specific safe path"],
      };
    }
  }
  for (const re of ASK_PATTERNS) {
    if (re.test(cmd)) {
      return {
        kind: "ask",
        title: "Dangerous command",
        reason: "Command requests elevated privileges or alters sensitive targets (sudo, chmod 777, recursive chown, eval, or writing to /etc).",
        actions: ["Confirm this command is intended", "Run with least privilege"],
      };
    }
  }
  return null;
}
