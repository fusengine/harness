import { projectLayout } from "../config/layout";
import { detectFramework } from "../policy/detect-framework";
import { detectCreationIntent } from "../policy/creation-intent";
import { recordBrainstormRequired } from "../tracking/session-state";
import { loadTrack, saveTrack } from "../tracking/store";
import { normalizeEvent } from "./normalize";
import { defaultStateDir, trackFile } from "./paths";
import { designLifecycle } from "./design-lifecycle";
import { promptSubmitContext } from "./inject-context";
import { lifecycleStdout } from "./lifecycle-bridge";
import { handlePre } from "./handle-pre";
import { handlePost } from "./handle-post";
import { asyncScopeStdout } from "./handle-scope-async";
import { resetFragmentRegistry } from "./fragment-registry";
import { attachBudgetRecap } from "./inject-budget-recap";
import type { PluginScope } from "./lifecycle";

/** Raw Claude hook event name from a payload (empty when absent). */
function rawEventName(payload: Record<string, unknown>): string {
  return typeof payload.hook_event_name === "string" ? payload.hook_event_name : "";
}

/** Options for {@link handleHook} (caller supplies the clock + project root). */
export interface HandleOptions {
  now: number;
  cwd: string;
  /** Directory of SOLID reference `.md` files for `solidReadGate` (else inert). */
  refsDir?: string;
  /** APEX freshness window in ms (from `FUSE_ENFORCE_TTL_SEC`). */
  windowMs?: number;
  /** Which plugin's hooks.json invoked the harness (selects lifecycle behavior). */
  scope?: PluginScope;
}

/** What the hook bin should print + exit with. */
export interface HandleOutcome {
  stdout: string;
  exit: number;
}

/**
 * The full hook handler: on a PRE event it gates the tool-use (stateless guards
 * then APEX gates from the session track) and returns the native response; on a
 * POST event it records the activity into the track. The loop that makes the
 * package behave like the Claude plugin, on any harness.
 */
export async function handleHook(id: string, payload: Record<string, unknown>, opts: HandleOptions): Promise<HandleOutcome> {
  const event = normalizeEvent(id, payload);
  // Fresh slate for this invocation's capFragment tally — one hook event is
  // exactly one lifecycle branch below (see dispatchLifecycle), so a single
  // reset here can never mix fragments across unrelated events.
  resetFragmentRegistry();
  const layout = projectLayout(opts.cwd);
  const file = trackFile(event.sessionId, defaultStateDir(opts.cwd));
  const mcpDir = layout.cacheDir;
  const framework = detectFramework(event.filePath ?? "", event.content ?? "");

  // Design-agent lifecycle (SubagentStart/Stop): init/cleanup the pipeline state machine.
  // Claude-Code-only: `agent_type`/`agent_id`/Subagent hooks are Claude's Agent SDK
  // vocabulary — Codex/Cursor/etc. have no equivalent, so this is gated explicitly
  // rather than relying on those fields being merely absent from other harnesses.
  if (id === "claude-code" && designLifecycle(payload, mcpDir, opts.cwd, String(opts.now), opts.now)) {
    return { stdout: "", exit: 0 };
  }

  // Async per-scope lifecycle (aipilot cache handlers + memory-neural Graphiti).
  const asyncOut = await asyncScopeStdout(opts.scope, rawEventName(payload), payload, opts.cwd, opts.now);
  if (asyncOut !== null) return { stdout: asyncOut, exit: 0 };

  // Ported lifecycle/session/context hooks (SessionStart, SubagentStart/Stop, etc.).
  const life = lifecycleStdout(payload, opts.cwd, opts.scope ?? "core", opts.now);
  if (life !== null) {
    // Claude-Code-only: attachBudgetRecap's systemMessage envelope assumes the
    // Claude adapter's stdout shape (mirrors the designLifecycle gate above).
    const stdout = id === "claude-code" ? attachBudgetRecap(life, rawEventName(payload), event.sessionId, opts.cwd, opts.now) : life;
    return { stdout, exit: 0 };
  }

  // UserPromptSubmit (core scope): brainstorm flag + CLAUDE.md injection.
  const userPrompt = typeof payload.prompt === "string" ? payload.prompt : undefined;
  if (userPrompt !== undefined) {
    const track = await loadTrack(file);
    await saveTrack(file, recordBrainstormRequired(track, detectCreationIntent(userPrompt)));
    return { stdout: promptSubmitContext(userPrompt, opts.cwd), exit: 0 };
  }

  if (event.phase === "post") {
    return handlePost({ id, payload, event, framework, mcpDir, file, opts });
  }

  return handlePre({ id, payload, event, framework, mcpDir, file, opts });
}
