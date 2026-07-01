import { isFileSizeScoped, resolveSolidRefFramework } from "./file-size-scope";
import { countLines, evaluateFileSize } from "./file-size";
import { matchPatterns, GIT_BLOCKED, GIT_ASK } from "./patterns";
import { runGuards } from "./guards";
import type { PolicyContext, PolicyResult } from "./interfaces/types";

export type { PolicyContext, PolicyResult } from "./interfaces/types";

/**
 * Evaluate a single tool-use against the bundled policies, returning a pure
 * decision plus a portable {@link Prompt}. Adapters translate the prompt into
 * their harness's native response (Claude `permissionDecision`, etc.).
 */
export function evaluate(ctx: PolicyContext): PolicyResult {
  const guard = runGuards(ctx);
  if (guard) return { decision: "deny", message: guard.reason, prompt: guard };
  if (ctx.command && matchPatterns(ctx.command, GIT_BLOCKED)) {
    const reason = `Destructive git command: ${ctx.command}`;
    return {
      decision: "deny",
      message: reason,
      prompt: {
        kind: "block",
        title: "Destructive git command",
        reason,
        actions: ["Use a non-destructive alternative (e.g. --force-with-lease; avoid --hard / -D)"],
      },
    };
  }
  if (ctx.command && matchPatterns(ctx.command, GIT_ASK)) {
    return {
      decision: "deny",
      message: `Git operation requires confirmation: ${ctx.command}`,
      prompt: {
        kind: "ask",
        title: "Confirm git operation",
        reason: `Authorize: ${ctx.command.trim()}`,
        actions: ["Approve if this git operation is intended"],
      },
    };
  }
  if (ctx.filePath && isFileSizeScoped(ctx.filePath) && ctx.agentType !== "Explore" && ctx.agentType !== "Plan") {
    const incoming = ctx.content !== undefined ? countLines(ctx.content) : 0;
    // Write provides the full new content → judge it. Edit is partial → judge the on-disk file.
    const lines = ctx.tool === "Edit" ? Math.max(incoming, ctx.existingLines ?? 0) : incoming || (ctx.existingLines ?? 0);
    const framework = resolveSolidRefFramework(ctx.filePath);
    // Python parity (enforce-file-size.py:44-57): the block message always
    // reports the pre-existing on-disk count, even for a Write whose new
    // content is itself over the limit — the incoming count only ever gates
    // an early "shrunk to compliant" allow, it's never what gets displayed.
    const displayLines = ctx.tool === "Write" ? ctx.existingLines ?? lines : lines;
    const verdict = evaluateFileSize(lines, ctx.maxLines, ctx.filePath, framework, displayLines);
    if (lines > 0 && !verdict.ok) {
      return {
        decision: "deny",
        message: verdict.message,
        prompt: {
          kind: "block",
          title: "SOLID file-size limit",
          reason: verdict.message ?? "",
          actions: [`Split into modules under ${verdict.max} lines (Single Responsibility)`, "Then re-run the write"],
        },
        meta: { framework, lines: verdict.lines, max: verdict.max },
      };
    }
  }
  return { decision: "allow", message: null };
}
