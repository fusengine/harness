import { evaluate, type PolicyResult } from "../policy/evaluate";
import { existingLineCounts, isApexScoped } from "./gate-helpers";
import { FAIL_CLOSED } from "../policy/guards";
import { loadTrack } from "../tracking/store";
import { dryGate } from "./dry";
import { preCommitGate } from "./precommit";
import { modularGate } from "./modular";
import { frameworkSkillGate } from "./framework-skill-gate";
import { isShadcnWrite, shadcnSkillGate } from "../policy/shadcn-skill-gate";
import { apexScopedGate } from "./gate-apex";
import type { GateInput } from "./gate-input";
import type { Prompt } from "../prompt/types";

export type { GateInput } from "./gate-input";

/** Prior agents the freshness gate requires before a code edit. */
export const REQUIRED_AGENTS: ReadonlyArray<string> = ["explore-codebase", "research-expert"];

/**
 * Default freshness window for {@link REQUIRED_AGENTS}, in ms. Matches the
 * plugin's `FUSE_ENFORCE_TTL_SEC` default (120s). Only a fallback for direct
 * programmatic callers that omit `windowMs` (e.g. tests) — the real CLI path
 * always supplies `windowMs` from `resolveTtlSec()` (`src/config/ttl.ts`).
 */
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

  const { raw: existingLines, code: existingCodeLines } = existingLineCounts(input.filePath);
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
  const filePath = input.filePath;
  const window = input.windowMs ?? DEFAULT_WINDOW_MS;
  const track = await loadTrack(input.trackFile);

  const solidOrSkill = frameworkSkillGate(input, track.refsRead, existingCodeLines);
  if (solidOrSkill) return solidOrSkill;

  // Standalone shadcn/ui gate (ports check-skill-loaded.py): runs independently
  // of `framework` since a components.json / .css write may detect as "generic",
  // and mirrors the real plugin running its own PreToolUse hook alongside react's.
  if (isShadcnWrite(input.tool, filePath)) {
    const shadcnBlock = shadcnSkillGate(input.tool, filePath, input.content ?? "", {
      refsRead: track.refsRead,
      authorizations: track.authorizations,
      sessionId: input.sessionId,
    });
    if (shadcnBlock) return shadcnBlock;
  }

  // The freshness/doc/SOLID APEX gates only police code files (require-apex-agents.py
  // parity): non-code and exempt paths skip straight to the DRY check below.
  if (isApexScoped(input.filePath)) {
    const apex = await apexScopedGate(input, track, window);
    if (apex) return apex;
  }

  // DRY duplication (effectful: greps the codebase) — runs once the APEX gates pass.
  return dryGate(input.tool, input.filePath, input.content, input.cwd);
}
