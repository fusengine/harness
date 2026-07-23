/**
 * Rollout control for NEW convention denies (owner decision, inverted
 * 2026-07): new convention rules BLOCK by default — `FUSE_CONVENTIONS_MODE`
 * is an opt-OUT. Set it to `advisory` to observe without blocking (`inform`
 * output); any absent or invalid value means `deny`. Denies that already
 * existed before the conventions module are unaffected (byte-parity); this
 * module only ever MODULATES the new ones.
 */
import type { Prompt } from "../../prompt/types";

/** Rollout mode for new convention denies. */
export type ConventionsMode = "advisory" | "deny";

/**
 * Current rollout mode: `advisory` ONLY on the exact explicit value —
 * anything else (absent, typo, empty) is `deny` (owner decision: deny-first).
 * @param env - Environment (defaults to `process.env`).
 */
export function conventionsMode(env: Record<string, string | undefined> = process.env): ConventionsMode {
  return env.FUSE_CONVENTIONS_MODE === "advisory" ? "advisory" : "deny";
}

/**
 * Resolve a convention verdict under the rollout flag: a NEW rule yields an
 * `inform` prompt in advisory mode (explicit opt-out), the blocking prompt
 * otherwise; an EXISTING rule always yields the blocking prompt unchanged.
 * @param prompt - The blocking prompt the rule would emit.
 * @param isNew - True when the rule is new (post-conventions module).
 * @param env - Environment (defaults to `process.env`).
 */
export function rolloutVerdict(
  prompt: Prompt,
  isNew: boolean,
  env: Record<string, string | undefined> = process.env,
): Prompt {
  if (!isNew || conventionsMode(env) === "deny") return prompt;
  return { kind: "inform", title: prompt.title, reason: prompt.reason, actions: prompt.actions };
}
