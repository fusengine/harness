import type { Prompt } from "../../prompt/types";
import type { GuardContext } from "./context";

/** Critical patterns that must always be blocked. */
export const CRITICAL_PATTERNS: RegExp[] = [
  /\brm\s+(?:-[a-z]*\s+)*-[a-z]*[rf][a-z]*\s+(?:-[a-z]+\s+)*(?:\/|~)(?:\s|$)/,
  /:\(\)\s*\{\s*:\s*\|\s*:\s*&\s*\}\s*;\s*:/,
  /\b(?:curl|wget)\b[^|]*\|\s*(?:sudo\s+)?(?:ba|z|da|k)?sh\b/,
  /\bchmod\s+(?:-[a-zA-Z]+\s+)*777\s+\//,
  /\bmkfs(?:\.[a-z0-9]+)?\b/,
  /\bdd\b[^\n]*\bof=\/dev\/(?:r?disk|sd|hd|nvme|mmcblk|vd|xvd)/i,
  /\bshred\b/,
  /\bfdisk\b/,
  /\bdiskutil\s+(?:erase|partitionDisk)/i,
  /(?:>|>>)\s*\/dev\/(?:sda|hda|nvme)/,
  /\brm\s+(?:-[a-z]*\s+)*-[a-z]*[rf][a-z]*\s+(?:-[a-z]+\s+)*\/(?:etc|usr|var|bin|sbin|boot|lib)\b/,
];

/** Patterns that warrant explicit confirmation before running. */
export const ASK_PATTERNS: RegExp[] = [
  /\bsudo\s/,
  /\bchmod\s+(?:-[a-zA-Z]+\s+)*777\b/,
  /\bchown\s+-R\b/,
  /\beval\s/,
  /(?:>|>>|\btee\b)\s*\/etc\//,
  /\bsu\s/, /\bdoas\s/, /\bpasswd\b/,
  /\brm\s/, /\bunlink\s/, /\bdel\s/,
];

/**
 * Strip heredoc bodies so their content isn't matched as a command (false positives).
 * Two-phase scan: a backreference-free opener regex finds `<<[-]DELIM`, then the body
 * is cut up to the closing delimiter via `indexOf` — O(n), no catastrophic backtracking.
 */
function stripHeredoc(cmd: string): string {
  const opener = /<<-?\s*['"]?(\w+)['"]?/g;
  let out = cmd;
  let m: RegExpExecArray | null;
  while ((m = opener.exec(out)) !== null) {
    const delim: string = m[1] ?? "";
    // Closer may be indented (the `<<-` form strips leading tabs); `\b` ends the word.
    const closer = new RegExp(`\\n[ \\t]*${delim}\\b`);
    const rest: string = out.slice(m.index + m[0].length);
    const hit: RegExpMatchArray | null = closer.exec(rest);
    if (!hit || hit.index === undefined) break;
    const end: number = m.index + m[0].length + hit.index + hit[0].length;
    out = `${out.slice(0, m.index)} ${out.slice(end)}`;
    opener.lastIndex = m.index;
  }
  return out;
}

/** Guards against dangerous Bash commands (critical → block, sensitive → ask). */
export function securityGuard(ctx: GuardContext): Prompt | null {
  if (ctx.tool !== "Bash" || !ctx.command) return null;
  const cmd: string = stripHeredoc(ctx.command);

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
