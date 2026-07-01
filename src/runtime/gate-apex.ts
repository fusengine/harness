import { evaluateApex, type ApexContext } from "../policy/apex";
import { FAIL_CLOSED } from "../policy/guards";
import { agentsFresh, recordTrivialEdit, trivialCount, type SessionTrack } from "../tracking/session-state";
import { agentsRanFromTranscript } from "../freshness/agent-evidence";
import { saveTrack } from "../tracking/store";
import { REQUIRED_AGENTS, TRIVIAL_BUDGET } from "./gate";
import type { GateInput } from "./gate-input";
import type { Prompt } from "../prompt/types";

/**
 * The APEX-scoped portion of {@link gate}: a trivial-edit fast path, then the
 * freshness/doc/SOLID gates fed from the session track. Freshness prefers
 * platform-authored transcript evidence (an agent cannot forge a `Task` in the
 * runtime-owned transcript); the self-recorded track is only a fallback when no
 * transcript path is available (tests / other harnesses).
 * @param input - The tool-use to gate.
 * @param track - The loaded session track.
 * @param window - Freshness window in ms.
 * @returns The first blocking prompt, or null to fall through to the DRY check.
 */
export async function apexScopedGate(input: GateInput, track: SessionTrack, window: number): Promise<Prompt | null> {
  // Trivial-edit fast path: a few tiny, non-replace edits skip the APEX gates.
  // Parity enforce-apex-phases.ts: only Edit ever qualifies as "trivial" — Write
  // always creates/replaces a file wholesale and must go through the full gate.
  const lineCount = input.content === undefined ? Number.POSITIVE_INFINITY : input.content.split("\n").length;
  if (input.tool === "Edit" && !input.isReplaceAll && lineCount < 5 && trivialCount(track, window, input.now) < TRIVIAL_BUDGET) {
    await saveTrack(input.trackFile, recordTrivialEdit(track, input.now, window, input.now));
    return null;
  }

  const freshnessFor = (names: string[], windowMs: number = window): boolean =>
    input.transcriptPath
      ? agentsRanFromTranscript(input.transcriptPath, names, windowMs, input.now)
      : agentsFresh(track, names, windowMs, input.now);

  const ctx: ApexContext = {
    sessionId: input.sessionId,
    framework: input.framework,
    filePath: input.filePath ?? "",
    content: input.content ?? "",
    authorizations: track.authorizations,
    refs: input.refs,
    refsRead: track.refsRead,
    agentsFresh: freshnessFor([...REQUIRED_AGENTS]),
    missingAgents: REQUIRED_AGENTS.filter((name) => !freshnessFor([name])),
    windowMs: window,
    // Parity require-apex-agents.py: only Write creates new files, so Edit is
    // always exempt from the brainstorm requirement, regardless of the flag.
    brainstormRequired: input.tool === "Edit" ? false : track.brainstormRequired,
    brainstormFresh: freshnessFor(["brainstorming"], Number.MAX_SAFE_INTEGER),
  };
  try {
    return evaluateApex(ctx);
  } catch {
    return FAIL_CLOSED;
  }
}
