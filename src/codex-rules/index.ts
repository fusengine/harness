/**
 * Codex execpolicy `.rules` (Starlark) generator, derived from the harness's
 * own `security.ts` dangerous-command patterns. Pure, no I/O — see
 * `../cli/bin.ts`'s `codex-rules` subcommand for stdout/`--out` wiring.
 */
export { buildCodexRules } from "./build";
export { ALL_RULES, CRITICAL_RULES, ASK_RULES, SKIP_LIST } from "./mapping";
export type { CodexDecision, CodexPrefixRule, CodexSkipEntry } from "./types";
