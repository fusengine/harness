import type { Prompt } from "../../prompt/types";
import type { GuardContext } from "./context";
import { hasSafeWriteTarget, isSafeCommandTarget, isSafeWritePath } from "./bash-write-safe-paths";
import {
  ASK_WRITERS, CODE_COMMAND_WRITE, CODE_MUTATORS, CODE_REDIRECT, FILE_REDIRECT, NODE_WRITES,
  RUBY_WRITES, SAFE_PREFIXES, SESSION_STATE_FRAGMENT,
} from "./bash-write-patterns";

export { ASK_WRITERS, CODE_MUTATORS, CODE_REDIRECT, FILE_REDIRECT, SAFE_PREFIXES, SESSION_STATE_FRAGMENT } from "./bash-write-patterns";

function blockCodeWrite(reason: string): Prompt {
  return { kind: "block", title: "Bash write to code file", reason, actions: ["Use the Write/Edit tool instead"] };
}
function askFileWrite(reason: string): Prompt {
  return { kind: "ask", title: "Bash file write", reason, actions: ["Use the Write/Edit tool instead"] };
}

/**
 * Blocks shell commands that mutate code files in place (and heredocs/redirects
 * to source files); asks before other file-writing shell commands unless the
 * target is a harness-owned safe path. Forces use of the Write/Edit tool so
 * APEX/SOLID checks are not bypassed.
 *
 * The code-write detectors (CODE_MUTATORS, CODE_COMMAND_WRITE) run BEFORE the
 * SAFE_PREFIXES short-circuit: they are command-position anchored
 * (bash-command-anchor.ts), so a transparent wrapper (`env sed -i src/x.ts`,
 * `timeout 5 patch`, `cp a b; tee src/y.ts`) can no longer smuggle a code write
 * past its safe first token, while a quoted mention (`git commit -m "fix sed -i"`)
 * still falls through. The short-circuit becomes the terminal allow — "first
 * token never writes, nothing above matched".
 */
export function bashWriteGuard(ctx: GuardContext): Prompt | null {
  if (ctx.tool !== "Bash" || !ctx.command) return null;
  const cmd: string = ctx.command;
  const stripped = cmd.trim();

  const mutator = CODE_MUTATORS.find((m) => m.re.test(cmd));
  if (mutator) return blockCodeWrite(`${mutator.desc} — Use Edit/Write tools instead`);
  if (CODE_COMMAND_WRITE.test(cmd)) return blockCodeWrite("tee/dd into a code file — Use Edit/Write tools instead");

  if (SAFE_PREFIXES.some((p) => stripped.startsWith(p)) && !FILE_REDIRECT.test(stripped)) {
    return null;
  }

  if (cmd.includes(SESSION_STATE_FRAGMENT)) {
    return {
      kind: "block",
      title: "Session-state tampering",
      reason: "Bash access to the harness session-state directory is a hook-bypass vector — the freshness/APEX enforcement reads it to decide block/allow.",
      actions: ["Never read or write session state from the shell"],
    };
  }

  if (FILE_REDIRECT.test(cmd)) {
    if (isSafeWritePath(cmd)) return null;
    return CODE_REDIRECT.test(cmd)
      ? blockCodeWrite("Bash redirect to code file — Use Write/Edit tools (enforces APEX + SOLID specs)")
      : askFileWrite("Shell redirect to file detected. Authorize?");
  }

  if (/\bnode\s+-e\b/.test(cmd) && NODE_WRITES.test(cmd)) {
    return hasSafeWriteTarget(cmd) ? null : askFileWrite("Node.js write operation detected. Authorize?");
  }
  if (/\bruby\s+-e\b/.test(cmd) && RUBY_WRITES.test(cmd)) return askFileWrite("Ruby write operation detected. Authorize?");

  const asker = ASK_WRITERS.find((a) => a.re.test(cmd));
  if (asker) {
    return isSafeCommandTarget(cmd) ? null : askFileWrite(`${asker.desc} detected. Authorize?`);
  }
  return null;
}
