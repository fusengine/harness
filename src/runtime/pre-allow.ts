/**
 * PreToolUse ALLOW-path response assembly. Reached only after every gate
 * allowed (a deny/ask already returned upstream), so nothing here can block nor
 * override a decision. Combines the Python-parity pass notice (systemMessage)
 * with the single most-specific decision-time lesson (additionalContext).
 */
import { designPassNotice } from "../policy/design/gates";
import { lessonFor } from "../policy/lessons/lesson-gate";
import { lessonsFileFor } from "./lifecycle/lessons/state";
import { projectRoot } from "../util/project-root";
import { oncePerWindow } from "./inject-dedup";
import { respond } from "./respond";
import type { NormalizedEvent } from "./normalize";
import type { HandleOutcome } from "./handle";

/**
 * Build the native outcome for a PreToolUse call that passed every gate: emit a
 * user-visible pass notice (once per allowed call) and, when its TRIGGERS match
 * this call, the one cooldown-guarded decision-time lesson. Both channels ride a
 * single response (lesson → additionalContext, notice → systemMessage).
 * @param id - Harness id for {@link respond}.
 * @param event - The normalized PreToolUse event.
 * @param payload - The raw hook payload (for `agent_id`).
 * @param mcpDir - MCP state dir backing the pass-notice throttle.
 * @param cwd - Project root (lesson file + notice scope).
 * @returns The native hook outcome (empty stdout when nothing to emit).
 */
export function allowOutcome(id: string, event: NormalizedEvent, payload: Record<string, unknown>, mcpDir: string, cwd: string): HandleOutcome {
  const notice = designPassNotice({
    agentId: typeof payload.agent_id === "string" ? payload.agent_id : "",
    tool: event.tool, filePath: event.filePath ?? "", content: event.content ?? "",
    url: typeof event.input.url === "string" ? event.input.url : "", phase: "pre",
  }, mcpDir);
  const lesson = lessonFor(event.tool, event.input, { file: lessonsFileFor(projectRoot(cwd)), once: oncePerWindow });
  if (lesson) {
    const merged = notice?.userMessage ? { ...lesson, userMessage: notice.userMessage } : lesson;
    return { stdout: respond(id, merged), exit: 0 };
  }
  return { stdout: notice ? respond(id, notice) : "", exit: 0 };
}
