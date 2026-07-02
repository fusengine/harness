/** Known AI coding harnesses detectable at runtime. */
export type HarnessId =
  | "claude-code" | "codex" | "cursor" | "cline" | "gemini-cli"
  | "opencode" | "windsurf" | "copilot" | "aider" | "kiro"
  | "goose" | "amp" | "hermes" | "unknown";

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
