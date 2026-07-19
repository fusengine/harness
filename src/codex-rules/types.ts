/**
 * Types for the Codex execpolicy `.rules` (Starlark) generator.
 * Verified contract (openai/codex `codex-rs/execpolicy/README.md` +
 * learn.chatgpt.com/docs/agent-configuration/rules): `prefix_rule(pattern,
 * decision, justification?, match?, not_match?)`; decisions are
 * allow < prompt < forbidden (strictest wins across matching rules);
 * `match`/`not_match` are validated as inline unit tests at file-load time.
 */

/** Codex execpolicy decision severity. */
export type CodexDecision = "allow" | "prompt" | "forbidden";

/**
 * One argv-prefix rule, hand-mapped from a single `security.ts`
 * `LabeledPattern`. `pattern` entries are exact argv tokens; a nested
 * array element means "any of these tokens at this position" (Codex
 * execpolicy alternation) — never a mechanical regex-to-prefix derivation.
 */
export interface CodexPrefixRule {
  /** Exact `label` string from `CRITICAL_PATTERNS`/`ASK_PATTERNS` this rule maps to. */
  sourceLabel: string;
  /** Argv-prefix tokens; an element may be `string[]` for alternation. */
  pattern: (string | string[])[];
  decision: CodexDecision;
  justification: string;
  /** Example invocations that must satisfy this rule (validated at load time). */
  match: string[];
  /** Example invocations that must NOT satisfy this rule (validated at load time). */
  notMatch?: string[];
}

/** A `security.ts` label with no argv-prefix equivalent — named, never dropped silently. */
export interface CodexSkipEntry {
  sourceLabel: string;
  reason: string;
}
