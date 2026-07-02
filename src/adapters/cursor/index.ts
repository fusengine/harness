/**
 * Cursor adapter (hook-mode). Schemas per cursor.com/docs/hooks (2026):
 * `beforeShellExecution` can block; `afterFileEdit` is observe-only.
 */
import { evaluate } from "../../policy/evaluate";
import { formatPrompt, type PromptKind } from "../../prompt/types";
import type { CursorShellPayload, CursorEditPayload, CursorResponse } from "./interfaces/types";

export type { CursorShellPayload, CursorEditPayload, CursorResponse } from "./interfaces/types";

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

/** Observe a file edit (Cursor cannot block here). Returns the verdict for logging. */
export function afterFileEdit(payload: CursorEditPayload): { violation: string | null } {
  const content = payload.edits?.map((e) => e.new_string).join("\n") ?? "";
  const r = evaluate({ tool: "Edit", filePath: payload.file_path, content });
  return { violation: r.decision === "deny" ? r.message : null };
}
