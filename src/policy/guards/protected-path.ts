import type { Prompt } from "../../prompt/types";
import type { GuardContext } from "./context";

/** Path fragments that mark a location as internal/generated state. */
export const PROTECTED_FRAGMENTS: readonly string[] = [
  ".claude/plugins/marketplaces",
  ".claude/plugins/cache",
  ".claude/logs/00-apex",
  ".claude/fusengine-cache",
  ".git/",
  ".claude/apex/",
  "/fuse-harness/",
  ".harness/track",
  ".harness/memory/state",
];

/** Standard block response for any protected-path violation. */
const BLOCK: Prompt = {
  kind: "block",
  title: "Protected path",
  reason: "This is internal/generated enforcement state — do not edit it directly.",
  actions: ["Edit the source, not the generated/cache/state copy"],
};

/** Returns true if `str` contains any protected fragment. */
function containsProtected(str: string): boolean {
  return PROTECTED_FRAGMENTS.some((f: string): boolean => str.includes(f));
}

/**
 * Returns true if `cmd` contains a recognisable shell write operation.
 *
 * Best-effort: matches `>` / `>>` redirections, `tee`, `cp`, `mv`, `dd`, `sed -i`.
 * Obfuscated shell (base64-decoded payloads, variable indirection, process
 * substitution) can still evade this check — residual risk, documented. The
 * real guarantee against a forged track is the transcript-grounded freshness
 * gate (see `freshness/agent-evidence`), not this guard.
 */
function bashHasWriteOp(cmd: string): boolean {
  return (
    />/.test(cmd) ||
    /\btee\b/.test(cmd) ||
    /\bcp\b/.test(cmd) ||
    /\bmv\b/.test(cmd) ||
    /\bdd\b/.test(cmd) ||
    /\bsed\s+-[a-zA-Z]*i/.test(cmd)
  );
}

/**
 * Blocks direct edits to internal/generated state directories.
 *
 * Covers:
 *  - Write / Edit tool calls whose `filePath` targets a protected fragment.
 *  - Bash commands that both reference a protected fragment *and* contain a
 *    recognisable shell write operation (best-effort; see `bashHasWriteOp`).
 *
 * @param ctx - The guard context (tool, filePath, command).
 * @returns A blocking {@link Prompt}, or null to allow.
 */
export function protectedPathGuard(ctx: GuardContext): Prompt | null {
  if ((ctx.tool === "Write" || ctx.tool === "Edit") && ctx.filePath) {
    if (containsProtected(ctx.filePath)) return BLOCK;
  }
  if (ctx.tool === "Bash" && ctx.command) {
    if (containsProtected(ctx.command) && bashHasWriteOp(ctx.command)) return BLOCK;
  }
  return null;
}
