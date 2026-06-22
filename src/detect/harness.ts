/**
 * Runtime detection of the AI coding harness, and its integration mode.
 * Env-signal names verified 2026 (agentx, agents.md#136, @vercel/detect-agent,
 * official Claude Code / Cursor / Gemini / Codex docs). Presence-based: the
 * value is ignored except for the `AGENT` / `AI_AGENT` standards.
 */

/** Known AI coding harnesses detectable at runtime. */
export type HarnessId =
  | "claude-code" | "codex" | "cursor" | "cline" | "gemini-cli"
  | "opencode" | "windsurf" | "copilot" | "aider" | "kiro"
  | "goose" | "amp" | "unknown";

/** Integration mode: `hook` = native lifecycle hooks; `cli` = run as an external step. */
export type HarnessMode = "hook" | "cli";

/** How the harness was identified. */
export type HarnessVia = "agent-std" | "ai-agent-std" | "env" | "fallback";

/** Result of {@link detectHarness}. */
export interface HarnessInfo {
  id: HarnessId;
  mode: HarnessMode;
  via: HarnessVia;
}

/** Tool-specific env var (presence) -> harness id. Order = detection priority. */
const ENV_SIGNALS: ReadonlyArray<readonly [string, HarnessId]> = [
  ["CLAUDECODE", "claude-code"], ["CODEX_SANDBOX", "codex"],
  ["CURSOR_AGENT", "cursor"], ["CLINE", "cline"], ["CLINE_AGENT", "cline"],
  ["GEMINI_CLI", "gemini-cli"], ["OPENCODE", "opencode"],
  ["WINDSURF_AGENT", "windsurf"], ["CODEIUM_AGENT", "windsurf"],
  ["COPILOT_AGENT", "copilot"], ["AIDER", "aider"], ["KIRO", "kiro"],
  ["GOOSE", "goose"], ["AMP", "amp"],
];

/** `AGENT=<name>` / `AI_AGENT=<name>` standard value -> harness id. */
const STD_NAMES: Record<string, HarnessId> = {
  goose: "goose", amp: "amp", claude: "claude-code", "claude-code": "claude-code",
  cursor: "cursor", codex: "codex", cline: "cline", aider: "aider",
  opencode: "opencode", gemini: "gemini-cli", copilot: "copilot", kiro: "kiro",
};

/** Harnesses exposing a native hook system (vs CLI-only integration). */
const HOOK_CAPABLE: ReadonlySet<HarnessId> = new Set([
  "claude-code", "cursor", "cline", "gemini-cli", "opencode",
]);

/** Integration mode for a harness id. */
export function modeFor(id: HarnessId): HarnessMode {
  return HOOK_CAPABLE.has(id) ? "hook" : "cli";
}

/**
 * Detect the current AI coding harness from environment signals.
 * Priority: `AGENT` standard -> `AI_AGENT` standard -> tool-specific vars -> unknown.
 * @param env - environment map (defaults to `process.env`)
 */
export function detectHarness(
  env: Record<string, string | undefined> = process.env,
): HarnessInfo {
  const agent = env.AGENT?.trim().toLowerCase();
  const agentId = agent ? STD_NAMES[agent] : undefined;
  if (agentId) return { id: agentId, mode: modeFor(agentId), via: "agent-std" };

  const ai = env.AI_AGENT?.trim().toLowerCase();
  const aiId = ai ? STD_NAMES[ai] : undefined;
  if (aiId) return { id: aiId, mode: modeFor(aiId), via: "ai-agent-std" };

  for (const [key, id] of ENV_SIGNALS) {
    if (env[key]?.trim()) return { id, mode: modeFor(id), via: "env" };
  }
  return { id: "unknown", mode: "cli", via: "fallback" };
}

/** Convenience: the integration mode of the current harness. */
export function detectMode(
  env: Record<string, string | undefined> = process.env,
): HarnessMode {
  return detectHarness(env).mode;
}
