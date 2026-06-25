import { projectLayout } from "../config/layout";
import { detectFramework } from "../policy/detect-framework";
import { detectCreationIntent } from "../policy/creation-intent";
import { extractText } from "../cache/mcp-response";
import { recordBrainstormRequired } from "../tracking/session-state";
import { loadTrack, saveTrack } from "../tracking/store";
import { activityFor } from "./activity";
import { mcpPostStore } from "./mcp";
import { normalizeEvent } from "./normalize";
import { trackFile } from "./paths";
import { recordActivity } from "./record";
import { respond } from "./respond";
import { designGate } from "./design";
import { designLifecycle } from "./design-lifecycle";
import { promptSubmitContext } from "./inject-context";
import { lifecycleStdout, postEditContext } from "./lifecycle-bridge";
import { postTrackingSideEffects } from "./lifecycle/post-tracking";
import { handlePre } from "./handle-pre";
import { dispatchAipilot, aipilotPostToolUse } from "./lifecycle";
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
  const layout = projectLayout(opts.cwd);
  const file = trackFile(event.sessionId, layout.trackDir);
  const mcpDir = layout.cacheDir;
  const framework = detectFramework(event.filePath ?? "", event.content ?? "");

  // Design-agent lifecycle (SubagentStart/Stop): init/cleanup the pipeline state machine.
  if (designLifecycle(payload, mcpDir, opts.cwd, String(opts.now), opts.now)) return { stdout: "", exit: 0 };

  // ai-pilot scope async lifecycle (SubagentStart/Stop, SessionEnd cache handlers).
  if (opts.scope === "aipilot") {
    const ai = await dispatchAipilot(rawEventName(payload), payload, opts.cwd, opts.now);
    if (ai !== null) return { stdout: ai, exit: 0 };
  }

  // Ported lifecycle/session/context hooks (SessionStart, SubagentStart/Stop, etc.).
  const life = lifecycleStdout(payload, opts.cwd, opts.scope ?? "core", opts.now);
  if (life !== null) return { stdout: life, exit: 0 };

  // UserPromptSubmit (core scope): brainstorm flag + CLAUDE.md injection.
  const userPrompt = typeof payload.prompt === "string" ? payload.prompt : undefined;
  if (userPrompt !== undefined) {
    const track = await loadTrack(file);
    await saveTrack(file, recordBrainstormRequired(track, detectCreationIntent(userPrompt)));
    return { stdout: promptSubmitContext(userPrompt, opts.cwd), exit: 0 };
  }

  if (event.phase === "post") {
    const response = payload.tool_response ?? payload.tool_output;
    mcpPostStore(event.tool, event.input, response, mcpDir);
    const designWarn = designGate(payload, event, mcpDir, opts.cwd);
    const activity = activityFor({ tool: event.tool, input: event.input, sessionId: event.sessionId, framework, now: opts.now, responseLength: extractText(response).length });
    if (activity) await recordActivity(file, activity);
    postTrackingSideEffects(opts.scope ?? "core", event, event.input, opts.now);
    if (opts.scope === "aipilot" && (event.tool === "TaskCreate" || event.tool === "TaskUpdate")) {
      const out = await aipilotPostToolUse(payload, opts.cwd);
      if (out) return { stdout: out, exit: 0 };
    }
    const extra = postEditContext(opts.scope ?? "core", event, opts.now);
    return { stdout: designWarn ? respond(id, designWarn) : extra, exit: 0 };
  }

  return handlePre({ id, payload, event, framework, mcpDir, file, opts });
}
