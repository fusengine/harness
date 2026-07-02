/**
 * Interfaces for the decision-time lesson engine: a lesson may carry an optional
 * `[TRIGGERS ...]` tag that indexes it by tool/path/error/keyword so the ONE
 * relevant lesson can be injected at the PreToolUse it applies to (instead of
 * the whole LESSON.md block dumped at SessionStart).
 */

/** Parsed predicates from a lesson's optional `[TRIGGERS ...]` tag. */
export interface Triggers {
  /** Exact tool names (e.g. `Write`, `Bash`) — highest-specificity match. */
  readonly tools: readonly string[];
  /** Globs (`*`, `**`) matched against `tool_input.file_path`. */
  readonly paths: readonly string[];
  /** Regex source matched against a prior error, when supplied. */
  readonly error?: string;
  /** Substrings matched against the JSON of `tool_input` — lowest specificity. */
  readonly keywords: readonly string[];
}

/** A compiled lesson: compact text (≤3 lines) plus its trigger predicates. */
export interface LessonEntry {
  readonly text: string;
  readonly triggers: Triggers;
}

/**
 * Cooldown gate reused from `../../runtime/inject-dedup`: `true` = emit now
 * (first hit / window elapsed), `false` = still inside the window. Injected so
 * the gate never grows its own window mechanism (team DRY).
 */
export type OncePerWindow = (key: string, windowMs: number) => boolean;
