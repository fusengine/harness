/**
 * Hermes Agent adapter (hook-mode). Nous Research's hermes-agent (2026) pipes a
 * JSON payload to shell hooks on stdin and reads stdout back as JSON — config
 * `~/.hermes/config.yaml` under `hooks:`, event `pre_tool_call`, scripts in
 * `~/.hermes/agent-hooks/`. The INPUT shape matches Claude Code
 * (`hook_event_name`/`tool_name`/`tool_input`/`cwd`), so the Claude reader is
 * reused; the OUTPUT does not: a block is `{ decision: "block", reason }`
 * (no `permissionDecision`, no interactive "ask"), `{}` allows, and
 * `{ context }` injects LLM context. Tool fields verified: `terminal` takes
 * `command`; `write_file` takes `path` + `content`.
 */
import { evaluate } from "../../policy/evaluate";
import { formatPrompt, type Prompt } from "../../prompt/types";
import { readClaudeInput } from "../claude";
import type { HermesHookInput, HermesResponse } from "./interfaces/types";

export type { HermesHookInput, HermesResponse } from "./interfaces/types";

/** Read & parse the Hermes hook stdin payload (same wire shape as Claude). */
export async function readHermesInput(): Promise<HermesHookInput> {
  return await readClaudeInput();
}

/**
 * Render a portable {@link Prompt} as a Hermes hook response string:
 * `block` -> `{decision:"block",reason}`; `ask`/`inform` -> non-blocking
 * `{context}` — Hermes has no interactive "ask" state, so both degrade to
 * context injection, mirroring the gemini-cli/cline routing in `respond()`.
 * @param prompt - The portable policy prompt.
 * @returns The native Hermes JSON response string.
 */
export function toHermesResponse(prompt: Prompt): string {
  const msg = formatPrompt(prompt);
  const res: HermesResponse = prompt.kind === "block" ? { decision: "block", reason: msg } : { context: msg };
  return JSON.stringify(res);
}

/**
 * Run the bundled policy over a Hermes `pre_tool_call` payload and return the
 * native response string, or null to allow (the hook then prints `{}`).
 * @param input - Parsed `pre_tool_call` stdin payload.
 * @returns Native response JSON, or null when the tool use is allowed.
 */
export function guard(input: HermesHookInput): string | null {
  const t = input.tool_input;
  const r = evaluate({
    tool: input.tool_name ?? "write_file",
    filePath: t?.path ?? t?.file_path,
    content: t?.content,
    command: t?.command,
  });
  if (r.decision === "allow" || !r.prompt) return null;
  return toHermesResponse(r.prompt);
}
