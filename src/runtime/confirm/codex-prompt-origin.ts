/** Provenance classification for a Codex `UserPromptSubmit` payload. */
export type CodexPromptOrigin = "root" | "subagent" | "unknown";

const AGENT_FIELDS = ["agent_id", "agent_type"] as const;

/**
 * Classify Codex prompt provenance from its optional agent metadata.
 * Missing metadata is the observed root shape; malformed metadata fails closed.
 */
export function codexPromptOrigin(payload: Record<string, unknown>): CodexPromptOrigin {
  const present = AGENT_FIELDS.filter((field) => Object.hasOwn(payload, field));
  if (present.length === 0) return "root";
  return present.every((field) => typeof payload[field] === "string" && payload[field].trim().length > 0)
    ? "subagent"
    : "unknown";
}
