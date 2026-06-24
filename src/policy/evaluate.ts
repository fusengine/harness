import { isCodeFile } from "../util/project-root";
import { countLines, evaluateFileSize } from "./file-size";
import { detectFramework } from "./detect-framework";
import { matchPatterns, GIT_BLOCKED, GIT_ASK } from "./patterns";
import { runGuards } from "./guards";
import type { Prompt } from "../prompt/types";

/** Harness-agnostic input to {@link evaluate}. */
export interface PolicyContext {
  /** Tool name (e.g. "Write", "Edit", "Bash"). */
  tool: string;
  filePath?: string;
  content?: string;
  command?: string;
  /** Optional override for the SOLID max-lines limit. */
  maxLines?: number;
}

/** Harness-agnostic policy decision (+ a portable prompt for adapters to render). */
export interface PolicyResult {
  decision: "allow" | "deny" | "warn";
  message: string | null;
  prompt?: Prompt;
  meta?: Record<string, unknown>;
}

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
  if (ctx.filePath && isCodeFile(ctx.filePath) && ctx.content !== undefined) {
    const verdict = evaluateFileSize(countLines(ctx.content), ctx.maxLines);
    if (!verdict.ok) {
      return {
        decision: "deny",
        message: verdict.message,
        prompt: {
          kind: "block",
          title: "SOLID file-size limit",
          reason: verdict.message ?? "",
          actions: [`Split into modules under ${verdict.max} lines (Single Responsibility)`, "Then re-run the write"],
        },
        meta: { framework: detectFramework(ctx.filePath, ctx.content), lines: verdict.lines, max: verdict.max },
      };
    }
  }
  return { decision: "allow", message: null };
}
