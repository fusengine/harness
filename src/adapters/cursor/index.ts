/**
 * Cursor adapter (hook-mode). Schemas per cursor.com/docs/hooks (2026):
 * `beforeShellExecution` can block; `afterFileEdit` is observe-only.
 */
import { evaluate } from "../../policy/evaluate";
import { formatPrompt, type PromptKind } from "../../prompt/types";
import type { CursorShellPayload, CursorEditPayload, CursorResponse, CursorEditResponse } from "./interfaces/types";

export type { CursorShellPayload, CursorEditPayload, CursorResponse, CursorEditResponse } from "./interfaces/types";

function toPermission(kind: PromptKind): "allow" | "deny" | "ask" {
  return kind === "block" ? "deny" : kind === "ask" ? "ask" : "allow";
}

/** Guard a shell command (git/install policies). */
export function beforeShellExecution(payload: CursorShellPayload): CursorResponse {
  const r = evaluate({ tool: "Bash", command: payload.command });
  if (r.decision === "allow" || !r.prompt) return { permission: "allow" };
  const msg = formatPrompt(r.prompt);
  return { permission: toPermission(r.prompt.kind), continue: false, user_message: msg, agent_message: msg };
}

/**
 * Advise on a file edit AFTER Cursor has written it — a HUMAN-VISIBLE audit note,
 * never a gate. This is an "after" hook: the edit is already on disk. On a
 * SOLID/DRY violation we surface the correction through `user_message` (the only
 * channel afterFileEdit exposes — no `agent_message`, so the model is never
 * re-informed) while ALWAYS returning `permission: "allow"`.
 *
 * We deliberately never emit `permission: "deny"` here, for two distinct reasons:
 * (1) structural — afterFileEdit was "informational only" at launch (Chacon,
 * Cursor hooks beta 1.7, 2025-09: no channel to stop the agent), and a post-write
 * deny has no documented rollback; (2) empirical — Cursor staff confirm the
 * deny-enforcement path is broken for file operations (forum.cursor.com/t/154377,
 * v2.6.18, 2026-03, open) — proven for file READS, plausibly the same for writes.
 * So a `deny` would be a false blocking signal; `allow` + `user_message` is the
 * only proven-safe shape.
 * @param payload - The `afterFileEdit` stdin payload.
 * @returns Always an allow; carries the user-visible correction on a violation.
 */
export function afterFileEdit(payload: CursorEditPayload): CursorEditResponse {
  const content = payload.edits?.map((e) => e.new_string).join("\n") ?? "";
  const r = evaluate({ tool: "Edit", filePath: payload.file_path, content });
  if (r.decision !== "deny" || !r.prompt) return { permission: "allow" };
  return { permission: "allow", user_message: formatPrompt(r.prompt) };
}
