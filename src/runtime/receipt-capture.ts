/**
 * Bash verification-receipt extraction for PostToolUse: a `tsc`/`bun test`
 * run is parsed (exit code + output) into a signed receipt the TaskCompleted
 * gate later demands. Structured responses ONLY: Kimi Code CLI sends
 * `tool_output` as a truncated STRING (no exit_code, no stdout/stderr
 * channels) — parsing it would forge a success receipt (`exit 0`, empty
 * output) for possibly-failed runs, so a non-object source is skipped.
 */
import { captureReceipt } from "../tracking/receipts";

/**
 * Record a verification receipt for a Bash run when the response is structured.
 * @param file - Session track file.
 * @param tool - The tool name (only "Bash" receipts exist).
 * @param command - The executed command.
 * @param toolResult - `payload.tool_result` (preferred), when present.
 * @param response - `payload.tool_response ?? payload.tool_output` fallback.
 * @param now - Clock.
 */
export async function captureBashReceipt(
  file: string,
  tool: string,
  command: string | undefined,
  toolResult: unknown,
  response: unknown,
  now: number,
): Promise<void> {
  if (tool !== "Bash" || !command) return;
  const r = (toolResult ?? response) as { exit_code?: unknown; stdout?: unknown; stderr?: unknown } | undefined;
  if (!r || typeof r !== "object") return;
  const out = `${typeof r.stdout === "string" ? r.stdout : ""}\n${typeof r.stderr === "string" ? r.stderr : ""}`;
  const exit = Number(r.exit_code ?? 0);
  await captureReceipt(file, command, out, Number.isFinite(exit) ? exit : 0, now);
}
