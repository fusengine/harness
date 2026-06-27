import { evaluate, type PolicyResult } from "../policy/evaluate";
import { existingLineCount } from "./gate-helpers";
import { evaluateApex, type ApexContext } from "../policy/apex";
import { FAIL_CLOSED } from "../policy/guards";
import { agentsFresh, recordTrivialEdit, trivialCount } from "../tracking/session-state";
import { agentsRanFromTranscript } from "../freshness/agent-evidence";
import { loadTrack, saveTrack } from "../tracking/store";
import { dryGate } from "./dry";
import { preCommitGate } from "./precommit";
import { modularGate } from "./modular";
import { frameworkSkillGate } from "./framework-skill-gate";
import type { GateInput } from "./gate-input";
import type { Prompt } from "../prompt/types";

export type { GateInput } from "./gate-input";

/** Prior agents the freshness gate requires before a code edit. */
export const REQUIRED_AGENTS: ReadonlyArray<string> = ["explore-codebase", "research-expert"];

/** Default freshness window for {@link REQUIRED_AGENTS} (2 min — matches the plugin's `FUSE_ENFORCE_TTL_SEC` default). */
export const DEFAULT_WINDOW_MS = 120_000;

/** Trivial edits allowed within the window before the full APEX gates apply. */
export const TRIVIAL_BUDGET = 4;

/**
 * Full gate: the stateless guards (file-size, git, security...) first, then a
 * trivial-edit fast path, then the stateful APEX gates fed from the session
 * track. Returns the first blocking prompt, or null to allow.
 */
export async function gate(input: GateInput): Promise<Prompt | null> {
  const existingLines = existingLineCount(input.filePath);
  let quick: PolicyResult;
  try {
    quick = evaluate({ tool: input.tool, filePath: input.filePath, content: input.content, command: input.command, agentType: input.agentType, existingLines });
  } catch {
    return FAIL_CLOSED;
  }
  if (quick.decision !== "allow" && quick.prompt) return quick.prompt;

  const precommit = preCommitGate(input.tool, input.command, input.cwd);
  if (precommit) return precommit;
  const modular = modularGate(input.tool, input.filePath, input.content, input.cwd);
  if (modular) return modular;
  if (!input.filePath) return null;
  const window = input.windowMs ?? DEFAULT_WINDOW_MS;
  const track = await loadTrack(input.trackFile);

  const solidOrSkill = frameworkSkillGate(input, track.refsRead, existingLines);
  if (solidOrSkill) return solidOrSkill;

  // Trivial-edit fast path: a few tiny, non-replace edits skip the APEX gates.
  const lineCount = input.content === undefined ? Number.POSITIVE_INFINITY : input.content.split("\n").length;
  if (!input.isReplaceAll && lineCount < 5 && trivialCount(track, window, input.now) < TRIVIAL_BUDGET) {
    await saveTrack(input.trackFile, recordTrivialEdit(track, input.now, window, input.now));
    return null;
  }

  // Freshness: prefer platform-authored transcript evidence (the agent cannot
  // forge a Task tool_use in the runtime-owned transcript). The self-recorded
  // track is only a fallback when no transcript path is available (tests / other
  // harnesses) — so a forged track can no longer satisfy the gate.
  const freshnessFor = (names: string[]): boolean =>
    input.transcriptPath
      ? agentsRanFromTranscript(input.transcriptPath, names, window, input.now)
      : agentsFresh(track, names, window, input.now);

  const ctx: ApexContext = {
    sessionId: input.sessionId,
    framework: input.framework,
    filePath: input.filePath,
    content: input.content ?? "",
    authorizations: track.authorizations,
    refs: input.refs,
    refsRead: track.refsRead,
    agentsFresh: freshnessFor([...REQUIRED_AGENTS]),
    brainstormRequired: track.brainstormRequired,
    brainstormFresh: freshnessFor(["brainstorming"]),
  };
  try {
    const apex = evaluateApex(ctx);
    if (apex) return apex;
  } catch {
    return FAIL_CLOSED;
  }

  // DRY duplication (effectful: greps the codebase) — runs once the APEX gates pass.
  return dryGate(input.tool, input.filePath, input.content, input.cwd);
}
