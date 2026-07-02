import { evaluateApex, PRE_AUTH_GATES, POST_AUTH_GATES, type ApexContext } from "../policy/apex";
import { apexAuthorizationGate } from "../policy/apex-authorization";
import { isTrivialEdit, protectedPathGate, SKIP_DIRS } from "../policy/trivial-edits";
import { FAIL_CLOSED } from "../policy/guards";
import { agentsFresh, recordTarget, recordTrivialEdit, trivialCount, type SessionTrack } from "../tracking/session-state";
import { agentsRanFromTranscript } from "../freshness/agent-evidence";
import { agentsFreshInTrack } from "../freshness/agent-evidence-record";
import { saveTrack } from "../tracking/store";
import { REQUIRED_AGENTS, TRIVIAL_BUDGET } from "./gate";
import type { GateInput } from "./gate-input";
import type { Prompt } from "../prompt/types";

/**
 * The APEX-scoped portion of {@link gate}, in the Python enforce-apex-phases.ts
 * order: protected-paths guard, skip-dirs allow, trivial-edit fast path, then
 * brainstorm/freshness, Check 1 (per-framework doc authorization — a deny
 * persists `track.target` so recordDoc can cross-credit the framework) and
 * Check 2 + SOLID refs. Freshness scans the SESSION track first (parity
 * _scan_agents: sub-agent hooks share the lead's session_id, so sidechain/
 * Workflow research is visible); the platform-authored transcript scan and the
 * legacy exact-name track check are fallbacks.
 * @param input - The tool-use to gate.
 * @param track - The loaded session track.
 * @param window - Freshness window in ms.
 * @returns The first blocking prompt, or null to fall through to the DRY check.
 */
export async function apexScopedGate(input: GateInput, track: SessionTrack, window: number): Promise<Prompt | null> {
  // (1) Hook-managed paths: absolute deny BEFORE any other filter (parity :49-52).
  const protectedDeny = protectedPathGate(input.tool, input.filePath);
  if (protectedDeny) return protectedDeny;
  // (2) CODE_EXT runs upstream (gate.ts isApexScoped); dependency/build dirs skip (parity :53-54).
  if (SKIP_DIRS.test(input.filePath ?? "")) return null;

  // (3) Trivial-edit fast path: a few tiny, non-replace Edits skip the APEX gates
  // (parity :58-65 — only Edit ever qualifies as "trivial"; a Write always
  // creates/replaces a file wholesale and must go through the full gate).
  if (isTrivialEdit(input.tool, input.content, input.isReplaceAll) && trivialCount(track, window, input.now) < TRIVIAL_BUDGET) {
    await saveTrack(input.trackFile, recordTrivialEdit(track, input.now, window, input.now));
    return null;
  }

  const freshnessFor = (names: string[], windowMs: number = window): boolean =>
    agentsFreshInTrack(track, names, windowMs, input.now) ||
    (input.transcriptPath ? agentsRanFromTranscript(input.transcriptPath, names, windowMs, input.now) : agentsFresh(track, names, windowMs, input.now));

  const ctx: ApexContext = {
    sessionId: input.sessionId,
    framework: input.framework,
    filePath: input.filePath ?? "",
    content: input.content ?? "",
    authorizations: track.authorizations,
    refs: input.refs,
    refsRead: track.refsRead,
    refsReadAt: track.refsReadAt, // SOLID-read TTL stamps (absent → no expiry)
    now: input.now,
    agentsFresh: freshnessFor([...REQUIRED_AGENTS]),
    missingAgents: REQUIRED_AGENTS.filter((name) => !freshnessFor([name])),
    windowMs: window,
    // Parity require-apex-agents.py:41 — Edit never creates a file (skip brainstorm),
    // and a subagent (agent_id present) inherits the lead's brainstorm decision, so
    // only a lead Write is ever brainstorm-gated.
    brainstormRequired: input.tool === "Edit" || input.agentId ? false : track.brainstormRequired,
    brainstormFresh: freshnessFor(["brainstorming"], Number.MAX_SAFE_INTEGER),
  };
  try {
    // (4) Brainstorm + explore/research freshness (pre-existing harness gates).
    const pre = evaluateApex(ctx, PRE_AUTH_GATES);
    if (pre) return pre;
    // (5) Check 1 — a deny persists `target` (parity :80-81) for recordDoc's cross-credit.
    const authDeny = apexAuthorizationGate(ctx);
    if (authDeny) {
      const set_at = new Date(input.now).toISOString();
      await saveTrack(input.trackFile, recordTarget(track, { project: input.cwd ?? "", framework: input.framework, set_by: "apex-authorization", set_at }));
      return authDeny;
    }
    // (6) Check 2 (doc consulted once per session) + SOLID refs.
    return evaluateApex(ctx, POST_AUTH_GATES);
  } catch {
    return FAIL_CLOSED;
  }
}
