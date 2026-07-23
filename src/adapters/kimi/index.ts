/**
 * Kimi Code CLI adapter (hook-mode). Moonshot AI's Kimi Code CLI (v0.27.0,
 * 2026) configures hooks in `~/.kimi-code/config.toml` (`[[hooks]]`: event,
 * matcher, command, timeout — exactly 4 fields, any extra breaks config
 * loading) and pipes a JSON payload to `command` on stdin, reading JSON back
 * on stdout. Verified against kimi.com/code/docs/en/kimi-code-cli/
 * customization/hooks.html (2026): the INPUT base shape
 * (`hook_event_name`/`session_id`/`cwd`, `PreToolUse`/`Bash` carrying
 * `tool_name` + `tool_input.command`) matches Claude Code's snake_case wire
 * shape, so the Claude reader is reused — verified live against kimi-code
 * v0.27.0 for both `PreToolUse`/`Bash` and `PreToolUse`/`Write`. Tool fields
 * verified: `Bash` takes `command`; `Write` takes `path` + `content`; `Edit`
 * takes `path` + `old_string`/`new_string` (per `docs/en/reference/tools.md`,
 * moonshotai/kimi-code). The path key is `path`, NOT Claude's `file_path`
 * (see interfaces/types.ts).
 *
 * OUTPUT does not match Claude: only `UserPromptSubmit`, `PreToolUse`, `Stop`
 * are blockable, and the only documented decision is
 * `{"hookSpecificOutput":{"permissionDecision":"deny","permissionDecisionReason"}}`
 * (camelCase, despite the snake_case input — a real Kimi inconsistency). No
 * `"ask"`/`"allow"`/`additionalContext` is documented. Verified live against
 * kimi-code v0.27.0: that deny envelope on stdout at exit 0 blocks the call
 * (exit 2 is NOT required) and `permissionDecisionReason` is re-injected to
 * the model; empty stdout at exit 0 lets the call run. Exit 2 = block, stderr
 * = reason; any other exit/timeout/crash fails open (allow). Whether raw-text
 * stdout at exit 0 (the `inform` case) reaches the context is documented only
 * as "may be" — unverified, needs live test.
 */
import { evaluate } from "../../policy/evaluate";
import { formatPrompt, type Prompt } from "../../prompt/types";
import { readClaudeInput } from "../claude";
import { commandToString } from "../../runtime/command-string";
import type { KimiHookInput, KimiResponse } from "./interfaces/types";

export type { KimiHookInput, KimiResponse } from "./interfaces/types";

/**
 * Downgrade prefix for `ask` — Kimi has no interactive approval channel
 * reachable from a hook. Kimi DOES have an `ask` decision, but only via
 * `[[permission.rules]] decision = "ask"` in config.toml, a separate system
 * a hook's return value cannot invoke.
 */
const ASK_PREFIX = "[downgraded from ask — Kimi Code has no interactive approval]";

/** Read & parse the Kimi hook stdin payload (same wire shape as Claude for the fields we consume). */
export async function readKimiInput(): Promise<KimiHookInput> {
  return await readClaudeInput();
}

/**
 * Render a portable {@link Prompt} as a Kimi hook response string:
 * `block`/`ask` -> `{hookSpecificOutput:{permissionDecision:"deny",...}}`
 * (only `"deny"` is documented; `ask` is downgraded with {@link ASK_PREFIX});
 * `inform` -> raw text (Kimi appends stdout to context on exit 0 — no
 * documented JSON envelope for non-blocking context injection).
 * @param prompt - The portable policy prompt.
 * @returns The native Kimi response string.
 */
export function toKimiResponse(prompt: Prompt): string {
  const msg = formatPrompt(prompt);
  if (prompt.kind === "inform") return msg;
  const reason = prompt.kind === "ask" ? `${ASK_PREFIX}\n${msg}` : msg;
  const res: KimiResponse = { hookSpecificOutput: { permissionDecision: "deny", permissionDecisionReason: reason } };
  return JSON.stringify(res);
}

/**
 * Render a raw deny reason as a Kimi hook response — for callers that already
 * hold a fully-formatted message (e.g. the MCP cache-hit notice) rather than a
 * portable {@link Prompt}. Same envelope as {@link toKimiResponse}, minus the
 * `[BLOCKED]` prompt framing and without `hookEventName` (undocumented upstream).
 * @param reason - The fully-formatted deny message.
 * @returns The native Kimi response string.
 */
export function kimiDenyResponse(reason: string): string {
  const res: KimiResponse = { hookSpecificOutput: { permissionDecision: "deny", permissionDecisionReason: reason } };
  return JSON.stringify(res);
}

/**
 * Run the bundled policy over a Kimi hook payload and return the native
 * response string, or null to allow (the hook then exits 0 with empty stdout).
 * @param input - Parsed hook stdin payload.
 * @returns Native response string, or null when the tool use is allowed.
 */
export function guard(input: KimiHookInput): string | null {
  const t = input.tool_input;
  const r = evaluate({
    tool: input.tool_name ?? "Write",
    filePath: t?.path ?? t?.file_path,
    content: t?.content ?? t?.new_string,
    command: commandToString(t?.command),
  });
  if (r.decision === "allow" || !r.prompt) return null;
  return toKimiResponse(r.prompt);
}
