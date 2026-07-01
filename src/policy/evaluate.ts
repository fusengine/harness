import { isCodeFile } from "../util/project-root";
import { countLines, evaluateFileSize } from "./file-size";
import { detectFramework } from "./detect-framework";
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
  if (ctx.filePath && isCodeFile(ctx.filePath) && ctx.agentType !== "Explore" && ctx.agentType !== "Plan") {
    const incoming = ctx.content !== undefined ? countLines(ctx.content) : 0;
    // Write provides the full new content → judge it. Edit is partial → judge the on-disk file.
    const lines = ctx.tool === "Edit" ? Math.max(incoming, ctx.existingLines ?? 0) : incoming || (ctx.existingLines ?? 0);
    const verdict = evaluateFileSize(lines, ctx.maxLines);
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
        meta: { framework: detectFramework(ctx.filePath, ctx.content ?? ""), lines: verdict.lines, max: verdict.max },
      };
    }
  }
  return { decision: "allow", message: null };
}
