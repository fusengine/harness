import { extractText } from "../cache/mcp-response";
import { activityFor } from "./activity";
import { mcpPostStore } from "./mcp";
import { recordActivity } from "./record";
import { respond } from "./respond";
import { designGate } from "./design";
import { postEditContext } from "./lifecycle-bridge";
import { postTrackingSideEffects } from "./lifecycle/post-tracking";
import { aipilotPostToolUse, checkFileSize, validateTailwind } from "./lifecycle";
import { seoPostToolUseResponse } from "./lifecycle/seo/post-tool-use";
import type { PreContext } from "./handle-pre";
import type { HandleOutcome } from "./handle";

/**
 * Run the PostToolUse pipeline: store the MCP response, emit a design warning,
 * record the activity into the session track, apply per-scope side-effects (SEO
 * deny, aipilot task cache), then inject the post-edit context.
 * @param ctx - The resolved context (same shape as the pre pipeline).
 * @returns The native hook outcome.
 */
export async function handlePost(ctx: PreContext): Promise<HandleOutcome> {
  const { id, payload, event, framework, mcpDir, file, opts } = ctx;
  const response = payload.tool_response ?? payload.tool_output;
  mcpPostStore(event.tool, event.input, response, mcpDir);
  const designWarn = designGate(payload, event, mcpDir, opts.cwd);
  const activities = activityFor({ tool: event.tool, input: event.input, sessionId: event.sessionId, framework, now: opts.now, responseLength: extractText(response).length });
  for (const activity of activities) await recordActivity(file, activity);
  postTrackingSideEffects(opts.scope ?? "core", event, event.input, opts.now, payload, opts.cwd);
  const seoDeny = opts.scope === "seo" ? seoPostToolUseResponse(payload) : null;
  if (seoDeny) return { stdout: seoDeny, exit: 0 };
  if (opts.scope === "solid" && event.filePath) {
    const solidWarn = checkFileSize(event.tool, event.filePath);
    if (solidWarn) return { stdout: solidWarn, exit: 0 };
  }
  if (opts.scope === "tailwindcss" && event.filePath) {
    const tailwindWarn = validateTailwind(event.tool, event.filePath);
    if (tailwindWarn) return { stdout: tailwindWarn, exit: 0 };
  }
  if (opts.scope === "aipilot" && (event.tool === "TaskCreate" || event.tool === "TaskUpdate" || event.tool === "Write" || event.tool === "Edit")) {
    const out = await aipilotPostToolUse(payload, opts.cwd);
    if (out) return { stdout: out, exit: 0 };
  }
  const extra = await postEditContext(opts.scope ?? "core", event, opts.now);
  return { stdout: designWarn ? respond(id, designWarn) : extra, exit: 0 };
}
