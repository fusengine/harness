import { dirname } from "node:path";
import { loadRefs } from "../refs/loader";
import { gate } from "./gate";
import { MCP_TTL_MS, mcpPreIntercept } from "./mcp";
import type { NormalizedEvent } from "./normalize";
import { recordActivity } from "./record";
import { respond } from "./respond";
import { withDenyNotice } from "./deny-notice";
import { designGate } from "./design";
import { taskContext } from "./inject-context";
import { securityAdvisory } from "./lifecycle/security/check-skill";
import { validateSolidGate } from "./lifecycle";
import { allowOutcome } from "./pre-allow";
import { applyPatchGate } from "./apply-patch-gate";
import { isBypassPermissions } from "../adapters/codex/permission-mode";
import type { HandleOptions, HandleOutcome } from "./handle";

/** Context the PreToolUse pipeline needs (resolved once by {@link handleHook}). */
export interface PreContext {
  id: string;
  payload: Record<string, unknown>;
  event: NormalizedEvent;
  framework: string;
  mcpDir: string;
  file: string;
  opts: HandleOptions;
}

/**
 * Run the PreToolUse pipeline: MCP/WebFetch cache intercept, design gate, APEX Task context injection, then the stateless+APEX gate chain, returning the native hook outcome (deny/ask/inject or allow).
 * @param ctx - The resolved pre-context.
 * @returns The hook outcome.
 */
export async function handlePre(ctx: PreContext): Promise<HandleOutcome> {
  const { id, payload, event, framework, mcpDir, file, opts } = ctx;
  const intercept = mcpPreIntercept(id, event.tool, event.input, mcpDir, MCP_TTL_MS, opts.now);
  if (intercept !== null) {
    if (intercept.docSource) await recordActivity(file, { kind: "doc", framework, sessionId: event.sessionId, source: intercept.docSource });
    return { stdout: intercept.stdout, exit: 0 };
  }

  const designBlock = designGate(payload, event, mcpDir, opts.cwd);
  if (designBlock) return { stdout: withDenyNotice(id, respond(id, designBlock), designBlock, event.sessionId, dirname(file), opts.now), exit: 0 };

  // Security scope is advisory-only (ports check-security-skill.py): emit the
  // non-blocking advisory when the skill is unread, else allow — NEVER run the
  // core APEX/SOLID/file-size gate chain (the security plugin never did).
  if (opts.scope === "security") {
    return { stdout: securityAdvisory(event.tool, event.filePath ?? "", opts.now), exit: 0 };
  }

  // Solid scope mirrors security above: run ONLY the ported validate-solid
  // check (deny on violation, else allow) and ALWAYS return — NEVER fall
  // through to the core APEX/SOLID/file-size gate chain: core-guards owns
  // it, so falling through would run gate() twice per edit when both
  // plugins wire PreToolUse Write|Edit (duplicate denies + added latency).
  if (opts.scope === "solid") {
    return { stdout: validateSolidGate(event.tool, event.filePath ?? "", event.content ?? ""), exit: 0 };
  }

  // PreToolUse Task: inject APEX sub-agent context when .claude/apex/ exists.
  if (event.tool === "Task") {
    const taskCtx = taskContext(opts.cwd);
    if (taskCtx) return { stdout: taskCtx, exit: 0 };
  }

  // Codex `apply_patch`: normalize.ts fanned the freeform patch into per-file
  // changes. OR their static file-size/DRY/protected-path verdict — one violating
  // hunk blocks the whole envelope. `event.files` is undefined for every other
  // tool/harness, so the single-file gate() below is unchanged there.
  if (event.files && event.files.length > 0) {
    const patchPrompt = applyPatchGate(event.files, opts.cwd);
    if (patchPrompt) return { stdout: withDenyNotice(id, respond(id, patchPrompt), patchPrompt, event.sessionId, dirname(file), opts.now), exit: 0 };
  }

  const prompt = await gate({
    sessionId: event.sessionId,
    framework,
    tool: event.tool,
    filePath: event.filePath,
    content: event.content,
    command: event.command,
    cwd: opts.cwd,
    refs: opts.refsDir ? await loadRefs(opts.refsDir) : undefined,
    isReplaceAll: event.input.replace_all === true,
    oldString: event.oldString,
    agentType: event.agentType,
    agentId: typeof payload.agent_id === "string" ? payload.agent_id : undefined,
    windowMs: opts.windowMs,
    now: opts.now,
    trackFile: file,
    transcriptPath: typeof payload.transcript_path === "string" ? payload.transcript_path : undefined,
    neverApproval: id === "codex" && isBypassPermissions(event.permissionMode),
  });
  if (prompt) return { stdout: withDenyNotice(id, respond(id, prompt), prompt, event.sessionId, dirname(file), opts.now), exit: 0 };
  // Every gate allowed: hand off to the ALLOW-path assembly (pass notice +
  // decision-time lesson + evidence-fresh notice). A deny/ask already returned
  // above, so nothing it emits can block nor override a decision.
  return allowOutcome(id, event, payload, mcpDir, opts.cwd, { trackFile: file, windowMs: opts.windowMs, now: opts.now });
}
