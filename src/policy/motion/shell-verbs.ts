/**
 * @module motion/shell-verbs
 * Small shell helpers shared by the self-approval and critic guards: split a
 * command into segments and read each segment's verb. Conservative by design —
 * an odd shape yields an unknown verb, which the guards treat as "not allowed".
 */
import { basename, dirname } from "node:path";
import { tokenize } from "../shell-read-refs";
import { commandToString } from "../../runtime/command-string";

/** Absolute directories whose binaries count as the bare command name. */
const SYSTEM_DIRS = new Set(["/bin", "/usr/bin", "/usr/local/bin", "/opt/homebrew/bin"]);
const ENV_ASSIGN = /^[A-Za-z_][A-Za-z0-9_]*=/;
/** Split on command separators (a lone `&` included, redirection `&` excluded); blank segments dropped. */
export function shellSegments(command: string): string[] {
  const out: string[] = [];
  let quote = "";
  let start = 0;
  for (let i = 0; i < command.length; i++) {
    const ch = command[i] ?? "";
    if (ch === "\\" && quote !== "'") { i++; continue; }
    if (quote) { if (ch === quote) quote = ""; continue; }
    if (ch === "'" || ch === '"') { quote = ch; continue; }
    const separator = ch === ";" || ch === "|" || ch === "\n"
      || (ch === "&" && !/[<>&]/.test(command[i - 1] ?? "") && !/[<>]/.test(command[i + 1] ?? ""));
    if (!separator) continue;
    const segment = command.slice(start, i).trim();
    if (segment) out.push(segment);
    if ((ch === "&" || ch === "|") && command[i + 1] === ch) i++;
    start = i + 1;
  }
  const tail = command.slice(start).trim();
  if (tail) out.push(tail);
  return out;
}

/** Tokens of a segment with leading `VAR=value` assignments removed. */
export function commandTokens(segment: string): string[] {
  const tokens = tokenize(segment);
  let i = 0;
  while (i < tokens.length && ENV_ASSIGN.test(tokens[i] ?? "")) i++;
  return tokens.slice(i);
}

/** Return a strictly shorter literal shell -c payload for bounded recursive policy scans. */
export function literalShellPayload(command: string): string | undefined {
  const tokens = commandTokens(command);
  const inner = tokens[2];
  return inner && inner.length < command.length && commandToString(tokens) === inner ? inner : undefined;
}

/** True when the segment starts with a `VAR=value` assignment (e.g. `FFREPORT=file=/x ffmpeg`). */
export function hasEnvPrefix(segment: string): boolean {
  return ENV_ASSIGN.test(tokenize(segment)[0] ?? "");
}

/**
 * Verb of a segment (after `VAR=val` prefixes): the bare name, or the basename
 * of a path under a system bin dir. Any other path (`/tmp/ls`, `./ls`) is
 * returned unchanged so it never matches a verb allow-list. `""` when none.
 */
export function segmentVerb(segment: string): string {
  const first = commandTokens(segment)[0];
  if (!first) return "";
  if (!first.includes("/")) return first;
  return SYSTEM_DIRS.has(dirname(first)) ? basename(first) : first;
}

/** True when the command embeds a substitution (`$(`, backtick, `<(`, `>(`). */
export function hasSubstitution(command: string): boolean {
  return command.includes("$(") || command.includes("`") || command.includes("<(") || command.includes(">(");
}

/** Remove shell quoting while masking expansion characters that remain literal. */
export function expansionText(command: string): string {
  let quote = "";
  let out = "";
  const literal = (ch: string): string => /[$~*?\[\]]/.test(ch) ? "#" : ch;
  for (let i = 0; i < command.length; i++) {
    const ch = command[i] ?? "";
    if (ch === "\\" && quote !== "'") {
      const next = command[i + 1] ?? "";
      if (!quote || /[$`"\\\n]/.test(next)) {
        i++;
        if (next !== "\n") out += literal(next);
        continue;
      }
    }
    if (quote) {
      if (ch === quote) quote = "";
      else out += quote === "'" || /[~*?\[\]]/.test(ch) ? literal(ch) : ch;
    } else if (ch === "'" || ch === '"') quote = ch;
    else out += ch;
  }
  return out;
}
