import type { RefMeta } from "../refs/types";

/** A tool-use to gate, plus the session pointers needed for the stateful gates. */
export interface GateInput {
  sessionId: string;
  framework: string;
  tool: string;
  filePath?: string;
  content?: string;
  command?: string;
  cwd?: string;
  refs?: RefMeta[];
  now: number;
  trackFile: string;
  windowMs?: number;
  isReplaceAll?: boolean;
  /** Edit only: the tool_input.old_string being replaced (runtime/normalize.ts) — threaded to evaluate()'s file-size gate so it can compute the post-edit outcome (policy/edit-outcome.ts) instead of judging the stale on-disk count alone. */
  oldString?: string;
  agentType?: string;
  /** Claude `agent_id` when the tool-use comes from a subagent (parity require-apex-agents.py:41 — subagents inherit the lead's brainstorm decision). */
  agentId?: string;
  /** Absolute path to the session transcript (Claude `transcript_path`) for evidence-based freshness. */
  transcriptPath?: string;
  /** See PolicyContext.neverApproval — populated only by handle-pre.ts for id==="codex" (approval_policy=never has no interactive ask channel). */
  neverApproval?: boolean;
}
