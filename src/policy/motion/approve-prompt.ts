/**
 * @module motion/approve-prompt
 * Parse the owner's `MOTION-APPROVE <stage> <code>` prompt and decide whether a
 * UserPromptSubmit payload is genuinely human-typed (it also fires for
 * scheduled tasks, /loop, background sub-agent returns and cross-session
 * messages — none of which may ever approve).
 */
import type { ApprovableStage } from "../interfaces/motion";

const APPROVE_RE = /^MOTION-APPROVE\s+(stills|draft)\s+([0-9a-f]{4})$/i;
const AUTOMATED_MARKERS = ["<teammate-message", "<task-notification", "<cross-session-message", "<channel", "<system-reminder"];

/**
 * Parse an approval prompt; the WHOLE trimmed prompt must match.
 * @returns The stage and lower-cased code, or `null`.
 */
export function parseMotionApprove(text: string): { stage: ApprovableStage; code: string } | null {
  const m = APPROVE_RE.exec(text.trim());
  if (!m) return null;
  return { stage: m[1]?.toLowerCase() === "draft" ? "draft" : "stills", code: (m[2] ?? "").toLowerCase() };
}

/** False for any sub-agent payload (`agent_id`/`agent_type`) or automated envelope text. */
export function isHumanPrompt(payload: Record<string, unknown>, text: string): boolean {
  if (Object.hasOwn(payload, "agent_id") || Object.hasOwn(payload, "agent_type")) return false;
  return !AUTOMATED_MARKERS.some((marker) => text.includes(marker));
}
