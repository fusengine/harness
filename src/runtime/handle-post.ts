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
import { classifyAgentEvidence, recordAgentEvidence } from "../freshness/agent-evidence-record";
import { recordCodexSpawnEvidence } from "../freshness/codex-spawn-evidence";
import { captureReceipt } from "../tracking/receipts";
import { recordCodexPostFailure } from "../tracking/codex-post-failure";
import { designPassNotice } from "../policy/design/gates";
import { attachSystemMessage } from "../adapters/claude";
import { refCreditNoticeFor } from "./notices";
import { defaultStateDir } from "./paths";
import { fanOutFiles, firstFileMatch } from "./post-fanout";
import type { PreContext } from "./handle-pre";
import type { HandleOutcome } from "./handle";
import type { Prompt } from "../prompt/types";

/**
 * Run the PostToolUse pipeline: store the MCP response, emit a design warning,
 * record the activity into the session track, apply per-scope side-effects (SEO
 * deny, aipilot task cache), then inject the post-edit context. Codex
 * `apply_patch` is fanned into per-file events ({@link fanOutFiles}) before the
 * per-file gates (tracking, SOLID size, Tailwind, post-edit context) run.
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
  // Session-scoped evidence (parity track-subagent-research.py): sub-agent hooks
  // carry the LEAD's session_id — Task/Agent launches excluded (credited above).
  const evidence = classifyAgentEvidence(event.tool, event.input, response);
  if (evidence) await recordAgentEvidence(file, evidence, opts.now, typeof payload.agent_id === "string" ? payload.agent_id : undefined);
  // Codex multi_agent_v2 `spawn_agent` -> same session track (no-op for every
  // other harness / non-spawn tool / missing `agent_type`; see module doc).
  await recordCodexSpawnEvidence(file, id, event.tool, event.input, opts.now);
  // Verification receipts: a Bash `tsc`/`bun test` run is parsed (exit code +
  // pass/fail counts) into a signed receipt the TaskCompleted gate later demands.
  if (event.tool === "Bash" && event.command) {
    const r = (payload.tool_result ?? response) as { exit_code?: unknown; stdout?: unknown; stderr?: unknown } | undefined;
    const out = `${typeof r?.stdout === "string" ? r.stdout : ""}\n${typeof r?.stderr === "string" ? r.stderr : ""}`;
    const exit = Number(r?.exit_code ?? 0);
    await captureReceipt(file, event.command, out, Number.isFinite(exit) ? exit : 0, opts.now);
  }
  if (id === "codex") recordCodexPostFailure(event.tool, payload.tool_result ?? response, { now: opts.now, dir: defaultStateDir(opts.cwd), sessionId: event.sessionId });
  // Codex `apply_patch` fans into per-file events here; every other tool is a
  // single-element identity array, so behavior below is unchanged for them.
  const files = fanOutFiles(event);
  for (const f of files) postTrackingSideEffects(opts.scope ?? "core", f, f.input, opts.now, payload, opts.cwd);
  const seoDeny = opts.scope === "seo" ? seoPostToolUseResponse(payload) : null;
  if (seoDeny) return { stdout: seoDeny, exit: 0 };
  if (opts.scope === "solid") {
    const solidWarn = firstFileMatch(files, checkFileSize);
    if (solidWarn) return { stdout: solidWarn, exit: 0 };
  }
  if (opts.scope === "tailwindcss") {
    const tailwindWarn = firstFileMatch(files, validateTailwind);
    if (tailwindWarn) return { stdout: tailwindWarn, exit: 0 };
  }
  if (opts.scope === "aipilot" && (event.tool === "TaskCreate" || event.tool === "TaskUpdate" || event.tool === "Write" || event.tool === "Edit")) {
    const out = await aipilotPostToolUse(payload, opts.cwd);
    if (out) return { stdout: out, exit: 0 };
  }
  let extra = "";
  for (const f of files) {
    extra = await postEditContext(opts.scope ?? "core", f, opts.now);
    if (extra) break;
  }
  // Python-parity `post_pass`: user-visible pass notice, merged into whatever else fires
  // (deny paths above returned already — a deny stays byte-identical).
  const notice = designPassNotice({
    agentId: typeof payload.agent_id === "string" ? payload.agent_id : "",
    tool: event.tool, filePath: event.filePath ?? "", content: event.content ?? "", url: "", phase: "post",
  }, mcpDir);
  // Compact compliance notice: a skill/SOLID `.md` reference credited by THIS
  // PostToolUse call (dedup'd against the ×11 hook fan-out inside refCreditNoticeFor).
  const refNotice = refCreditNoticeFor(activities, event.sessionId, opts.now, defaultStateDir(opts.cwd));
  const userMessage = [notice?.userMessage, refNotice].filter(Boolean).join("\n") || undefined;
  if (designWarn) return { stdout: respond(id, userMessage ? { ...designWarn, userMessage } : designWarn), exit: 0 };
  if (!userMessage) return { stdout: extra, exit: 0 };
  const withUserMessage: Prompt = notice ? { ...notice, userMessage } : { kind: "inform", title: "Compliance", reason: "", userMessage };
  if (!extra) return { stdout: respond(id, withUserMessage), exit: 0 };
  // `extra` is already-rendered Claude-shaped stdout (postEditContext): claude/codex get the
  // notice attached onto it; other harnesses cannot parse `extra` anyway, so the notice —
  // rendered natively by respond() — replaces it (cline's pure notice is "", keeping extra).
  if (id === "claude-code" || id === "codex") return { stdout: attachSystemMessage(extra, userMessage), exit: 0 };
  return { stdout: respond(id, withUserMessage) || extra, exit: 0 };
}
