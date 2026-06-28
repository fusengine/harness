/**
 * PostToolUse (Bash) memory handler. Ports `auto-capture-error.py`: on a
 * non-zero Bash exit with stderr, store an episode in Graphiti and surface a
 * `<memory-capture>` hint to search past errors / store the eventual solution.
 */
import { contextResponse } from "../../../adapters/claude";
import { isoUtc } from "../security/skill-state";
import { postEpisode } from "./client";
import { SALIENCE_THRESHOLD, bashSeverity, salience } from "./salience";

/** Extract exit code + stderr from a PostToolUse Bash payload (either field). */
function bashResult(payload: Record<string, unknown>): { exit: string; stderr: string } {
  const r = (payload.tool_result ?? payload.tool_response) as { exit_code?: unknown; stderr?: unknown } | undefined;
  return { exit: String(r?.exit_code ?? "0"), stderr: typeof r?.stderr === "string" ? r.stderr : "" };
}

/**
 * Handle a Bash PostToolUse: capture a failed command's error in neural memory
 * and return the native additionalContext stdout (or "" when nothing to emit).
 * @param payload - The raw hook payload.
 * @param now - Clock.
 * @returns The native stdout (possibly empty).
 */
export async function captureBashError(payload: Record<string, unknown>, now: number): Promise<string> {
  const { exit, stderr } = bashResult(payload);
  if (exit === "0" || !stderr) return "";
  const sev = bashSeverity(stderr);
  if (salience(sev) <= SALIENCE_THRESHOLD) return "";
  const errorMsg = stderr.slice(0, 500);
  await postEpisode({
    name: "bash_error",
    episode_body: `Bash error (exit ${exit}): ${errorMsg}`,
    source_description: "auto-capture",
    reference_time: isoUtc(now),
  });
  const ctx =
    `Error captured in neural memory (Graphiti).\n` +
    `Search for similar past errors: use mcp__qdrant__qdrant-find with query "${errorMsg}"\n` +
    `If you solve this, store the solution: use mcp__qdrant__qdrant-store`;
  return contextResponse("PostToolUse", ctx);
}
