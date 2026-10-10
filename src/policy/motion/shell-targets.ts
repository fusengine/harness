/** @module motion/shell-targets Shared motion-local write-target extraction. */
import { shellOutputRedirects } from "../guards/bash-write-redirects";
import { extraBashWriteTargets } from "../../runtime/prd/prd-bash-targets";

/** Include Bash combined-output redirects while preserving quoted literal operators and fd duplication. */
export function motionRedirectTargets(command: string): string[] {
  let normalized = "";
  let quote = "";
  for (let i = 0; i < command.length; i++) {
    const ch = command[i] ?? "";
    if (ch === "\\" && quote !== "'") { normalized += ch + (command[++i] ?? ""); continue; }
    if (quote) { normalized += ch; if (ch === quote) quote = ""; continue; }
    if (ch === "'" || ch === '"') { quote = ch; normalized += ch; continue; }
    if (ch === "&" && command[i + 1] === ">") continue;
    if (ch === ">" && command[i + 1] === "&") {
      // >&N and >&- duplicate/close descriptors; >&file opens a real file.
      const tail = command.slice(i + 2);
      if (/^\s*(['"]?)(?:\d+|-)\1(?=\s|[;&|]|$)/.test(tail)) { normalized += ch; continue; }
      normalized += ">";
      i++;
      continue;
    }
    normalized += ch;
  }
  return shellOutputRedirects(normalized).map((redirect) => redirect.target);
}

/** Shared first-line extraction of redirects and known shell writers; never execute shell expressions. */
export function motionShellWriteTargets(command: string): string[] {
  return [...motionRedirectTargets(command), ...extraBashWriteTargets(command)];
}
