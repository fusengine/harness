import { evaluate, type PolicyResult } from "../policy/evaluate";
import { existingLineCount, isApexScoped } from "./gate-helpers";
import { FAIL_CLOSED } from "../policy/guards";
import { loadTrack } from "../tracking/store";
import { dryGate } from "./dry";
import { preCommitGate } from "./precommit";
import { modularGate } from "./modular";
import { frameworkSkillGate } from "./framework-skill-gate";
import { apexScopedGate } from "./gate-apex";
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
  // Pre-commit lint hard-block runs FIRST: evaluate()'s GIT_ASK branch would
  // otherwise short-circuit a `git commit` before the linters get to veto it.
  const precommit = preCommitGate(input.tool, input.command, input.cwd);
  if (precommit) return precommit;

  const existingLines = existingLineCount(input.filePath);
  let quick: PolicyResult;
  try {
    quick = evaluate({ tool: input.tool, filePath: input.filePath, content: input.content, command: input.command, agentType: input.agentType, existingLines });
  } catch {
    return FAIL_CLOSED;
  }
  if (quick.decision !== "allow" && quick.prompt) return quick.prompt;

  const modular = modularGate(input.tool, input.filePath, input.content, input.cwd);
  if (modular) return modular;
  if (!input.filePath) return null;
  const window = input.windowMs ?? DEFAULT_WINDOW_MS;
  const track = await loadTrack(input.trackFile);

  const solidOrSkill = frameworkSkillGate(input, track.refsRead, existingLines);
  if (solidOrSkill) return solidOrSkill;

  // The freshness/doc/SOLID APEX gates only police code files (require-apex-agents.py
  // parity): non-code and exempt paths skip straight to the DRY check below.
  if (isApexScoped(input.filePath)) {
    const apex = await apexScopedGate(input, track, window);
    if (apex) return apex;
  }

  // DRY duplication (effectful: greps the codebase) — runs once the APEX gates pass.
  return dryGate(input.tool, input.filePath, input.content, input.cwd);
}
