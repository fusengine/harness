import { appendFileSync, mkdirSync } from "node:fs";
import { join } from "node:path";
import { homedir } from "node:os";

/**
 * Handle InstructionsLoaded: append `load_reason | memory_type | file_path` to
 * the per-session debug log. Ports `instructions-loaded/validate-rules-loaded.py`.
 * No stdout (logging only; InstructionsLoaded has no decision control).
 * @param data - The raw hook payload.
 * @param home - Home dir (defaults to `~`).
 */
export function validateRulesLoaded(data: Record<string, unknown>, home: string = homedir()): void {
  const filePath = String(data.file_path ?? "");
  const loadReason = String(data.load_reason ?? "");
  const memoryType = String(data.memory_type ?? "");
  const sessionId = String(data.session_id ?? "unknown");
  const dir = join(home, ".claude", "logs", "instructions-loaded");
  try {
    mkdirSync(dir, { recursive: true });
    appendFileSync(join(dir, `${sessionId}.log`), `${loadReason} | ${memoryType} | ${filePath}\n`, "utf-8");
  } catch { /* best effort */ }
}
