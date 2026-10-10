/** @module motion/guard-detach First-line denial of visible detached shell execution. */
import type { Prompt } from "../../prompt/types";
import { commandTokens, literalShellPayload, segmentVerb, shellSegments } from "./shell-verbs";

const COMMAND_PREFIX = /^(?:\s*[({]\s*|\s*(?:if|elif|then|else|while|until|do|!|time(?:\s+-p)?)\s+)+/;

/** Remove only a leading case pattern's unquoted terminator, never command arguments. */
function caseArmBody(segment: string): string {
  let quote = "";
  for (let i = 0; i < segment.length; i++) {
    const ch = segment[i] ?? "";
    if (ch === "\\" && quote !== "'") { i++; continue; }
    if (quote) { if (ch === quote) quote = ""; continue; }
    if (ch === "'" || ch === '"') { quote = ch; continue; }
    if (ch === ")") return segment.slice(i + 1).trimStart();
    if (/\s/.test(ch)) {
      const end = /^\s*\)/.exec(segment.slice(i));
      return end ? segment.slice(i + end[0].length).trimStart() : segment;
    }
  }
  return segment;
}

/** Preserve literal syntax while removing comments; null means a live background operator (`|&`, `;&`, `;;&` stay foreground). */
function foregroundCommand(command: string): string | null {
  let quote = "";
  let visible = "";
  for (let i = 0; i < command.length; i++) {
    const ch = command[i] ?? "";
    if (ch === "\\" && quote !== "'") { visible += ch + (command[++i] ?? ""); continue; }
    if (quote) { visible += ch; if (ch === quote) quote = ""; continue; }
    if (ch === "'" || ch === '"') { visible += ch; quote = ch; continue; }
    if (ch === "#" && (i === 0 || /\s|[;(&|]/.test(command[i - 1] ?? ""))) {
      const newline = command.indexOf("\n", i);
      if (newline < 0) break;
      i = newline - 1;
      continue;
    }
    visible += ch;
    if (ch !== "&" || /[<>]/.test(command[i - 1] ?? "") || command[i + 1] === ">") continue;
    // `|&` pipes stderr and `;&`/`;;&` end case arms: foreground operators, never a detach.
    if (/[|;]/.test(command[i - 1] ?? "") && command[i - 2] !== "\\") continue;
    if (command[i + 1] === "&") { visible += command[++i]; continue; }
    return null;
  }
  return visible;
}

function detached(command: string, depth: number): boolean {
  const visible = foregroundCommand(command);
  if (depth > 64 || visible === null) return true;
  let caseDepth = 0;
  let awaitingIn = false;
  for (const segment of shellSegments(visible)) {
    // Reserved words introduce command positions; quoted/escaped spellings are ordinary words.
    let current = segment.replace(COMMAND_PREFIX, "");
    if (awaitingIn && /^in(?:\s|$)/.test(current)) {
      awaitingIn = false;
      caseDepth++;
      current = current.replace(/^in\s*/, "");
    }
    // shellSegments leaves the `&` of a `;&` fall-through on the next segment.
    if (caseDepth) current = caseArmBody(current.replace(/^&/, "")).replace(COMMAND_PREFIX, "");
    for (;;) {
      const header = /^case\s+(?:"[^"]*"|'[^']*'|[^\s]+)(?=\s|$)/.exec(current);
      if (!header) break;
      current = current.slice(header[0].length).trimStart();
      if (!/^in(?:\s|$)/.test(current)) { awaitingIn = current === ""; break; }
      caseDepth++;
      current = caseArmBody(current.replace(/^in\s*/, "")).replace(COMMAND_PREFIX, "");
    }
    if (/^esac(?:\s|$)/.test(current)) caseDepth = Math.max(0, caseDepth - 1);
    let tokens = commandTokens(current);
    while (["env", "command", "exec"].includes(segmentVerb(current))) {
      const wrapper = segmentVerb(current);
      tokens = tokens.slice(1);
      if (wrapper === "command" && /^-[vV]+$/.test(tokens[0] ?? "")) { tokens = []; current = ""; break; }
      while (tokens[0]?.startsWith("-") || /^[A-Za-z_][A-Za-z0-9_]*=/.test(tokens[0] ?? "")) {
        const option = tokens.shift();
        if ((wrapper === "env" && ["-u", "--unset", "-C", "--chdir"].includes(option ?? ""))
          || (wrapper === "exec" && option === "-a")) tokens.shift();
      }
      current = tokens.map((token) => JSON.stringify(token)).join(" ");
    }
    if (/^(?:nohup|setsid|disown|at|batch|launchctl)$/.test(segmentVerb(current))) return true;
    const inner = literalShellPayload(current);
    if (inner && detached(inner, depth + 1)) return true;
  }
  return false;
}

/** Refuse visible detach forms; quoted text, escaped operators and redirects remain literal. */
export function detachedProcessViolation(command: string): Prompt | null {
  return detached(command, 0) ? { kind: "block", title: "Motion detached process guard",
    reason: "Detached processes cannot be observed reliably by motion tool hooks. Run the command in the foreground." } : null;
}
