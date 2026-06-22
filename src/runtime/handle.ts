import { detectFramework } from "../policy/detect-framework";
import { loadRefs } from "../refs/loader";
import type { HarnessId } from "../detect/harness";
import { activityFor } from "./activity";
import { gate } from "./gate";
import { normalizeEvent } from "./normalize";
import { trackFile } from "./paths";
import { recordActivity } from "./record";
import { respond } from "./respond";
import { harnessTrackDir } from "./storage";

/** Options for {@link handleHook} (caller supplies the clock + project root). */
export interface HandleOptions {
  now: number;
  cwd: string;
  /** Directory of SOLID reference `.md` files for `solidReadGate` (else inert). */
  refsDir?: string;
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
  const file = trackFile(event.sessionId, harnessTrackDir(id as HarnessId, opts.cwd));
  const framework = detectFramework(event.filePath ?? "", event.content ?? "");

  if (event.phase === "post") {
    const activity = activityFor({ tool: event.tool, input: event.input, sessionId: event.sessionId, framework, now: opts.now });
    if (activity) await recordActivity(file, activity);
    return { stdout: "", exit: 0 };
  }

  const prompt = await gate({
    sessionId: event.sessionId,
    framework,
    tool: event.tool,
    filePath: event.filePath,
    content: event.content,
    command: event.command,
    refs: opts.refsDir ? await loadRefs(opts.refsDir) : undefined,
    now: opts.now,
    trackFile: file,
  });
  return prompt ? { stdout: respond(id, prompt), exit: 0 } : { stdout: "", exit: 0 };
}
