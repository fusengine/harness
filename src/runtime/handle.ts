import { projectLayout } from "../config/layout";
import { detectFramework } from "../policy/detect-framework";
import { detectCreationIntent } from "../policy/creation-intent";
import { loadRefs } from "../refs/loader";
import { extractText } from "../cache/mcp-response";
import { recordBrainstormRequired } from "../tracking/session-state";
import { loadTrack, saveTrack } from "../tracking/store";
import { activityFor } from "./activity";
import { gate } from "./gate";
import { MCP_TTL_MS, mcpPostStore, mcpPreIntercept } from "./mcp";
import { normalizeEvent } from "./normalize";
import { trackFile } from "./paths";
import { recordActivity } from "./record";
import { respond } from "./respond";

/** Options for {@link handleHook} (caller supplies the clock + project root). */
export interface HandleOptions {
  now: number;
  cwd: string;
  /** Directory of SOLID reference `.md` files for `solidReadGate` (else inert). */
  refsDir?: string;
  /** APEX freshness window in ms (from `FUSE_ENFORCE_TTL_SEC`). */
  windowMs?: number;
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

  // UserPromptSubmit: flag whether the prompt expresses creation intent (brainstorm gate).
  const userPrompt = typeof payload.prompt === "string" ? payload.prompt : undefined;
  if (userPrompt !== undefined) {
    const track = await loadTrack(file);
    await saveTrack(file, recordBrainstormRequired(track, detectCreationIntent(userPrompt)));
    return { stdout: "", exit: 0 };
  }

  if (event.phase === "post") {
    const response = payload.tool_response ?? payload.tool_output;
    mcpPostStore(event.tool, event.input, response, mcpDir);
    const activity = activityFor({ tool: event.tool, input: event.input, sessionId: event.sessionId, framework, now: opts.now, responseLength: extractText(response).length });
    if (activity) await recordActivity(file, activity);
    return { stdout: "", exit: 0 };
  }

  const intercept = mcpPreIntercept(id, event.tool, event.input, mcpDir, MCP_TTL_MS, opts.now);
  if (intercept !== null) return { stdout: intercept, exit: 0 };

  const prompt = await gate({
    sessionId: event.sessionId,
    framework,
    tool: event.tool,
    filePath: event.filePath,
    content: event.content,
    command: event.command,
    refs: opts.refsDir ? await loadRefs(opts.refsDir) : undefined,
    isReplaceAll: event.input.replace_all === true,
    windowMs: opts.windowMs,
    now: opts.now,
    trackFile: file,
  });
  return prompt ? { stdout: respond(id, prompt), exit: 0 } : { stdout: "", exit: 0 };
}
