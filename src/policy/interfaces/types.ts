import type { Prompt } from "../../prompt/types";

/** Harness-agnostic input to {@link evaluate}. */
export interface PolicyContext {
  /** Tool name (e.g. "Write", "Edit", "Bash"). */
  tool: string;
  filePath?: string;
  content?: string;
  command?: string;
  /** Optional override for the SOLID max-lines limit. */
  maxLines?: number;
  /** Subagent type — `Explore`/`Plan` are exempt from the file-size gate. */
  agentType?: string;
  /** Line count of the existing on-disk file (so an Edit on an oversized file blocks). */
  existingLines?: number;
}

/** Harness-agnostic policy decision (+ a portable prompt for adapters to render). */
export interface PolicyResult {
  decision: "allow" | "deny" | "warn";
  message: string | null;
  prompt?: Prompt;
  meta?: Record<string, unknown>;
}
