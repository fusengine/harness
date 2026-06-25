import { appendFileSync, mkdirSync } from "node:fs";
import { join } from "node:path";
import { homedir } from "node:os";

/**
 * Handle PostToolUseFailure: append a `TOOL_FAILURE` line to
 * `~/.claude/logs/tool-failures.log`, skipping user interrupts. Ports
 * `post-tool-use/log-tool-failure.py`. No stdout (logging only).
 * @param data - The raw hook payload.
 * @param home - Home dir (defaults to `~`).
 * @param now - Clock (defaults to `Date.now()`).
 */
export function logToolFailure(data: Record<string, unknown>, home: string = homedir(), now: number = Date.now()): void {
  if (data.is_interrupt === true) return;
  const tool = String(data.tool_name ?? "unknown");
  const error = String(data.error ?? "unknown error");
  const sessionId = String(data.session_id ?? "unknown");
  const ts = new Date(now).toISOString().replace(/\.\d{3}Z$/, "Z");
  const dir = join(home, ".claude", "logs");
  try {
    mkdirSync(dir, { recursive: true });
    appendFileSync(join(dir, "tool-failures.log"), `[${ts}] TOOL_FAILURE session=${sessionId} tool=${tool} error=${error}\n`, "utf-8");
  } catch { /* best effort */ }
}
