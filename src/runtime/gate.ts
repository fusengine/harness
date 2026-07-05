import { evaluate, type PolicyResult } from "../policy/evaluate";
import { protectedPathGate } from "../policy/trivial-edits";
import { existingLineCounts, isApexScoped } from "./gate-helpers";
import { FAIL_CLOSED } from "../policy/guards";
import { loadTrack } from "../tracking/store";
import { dryGate } from "./dry";
import { preCommitGate } from "./precommit";
import { modularGate } from "./modular";
import { frameworkSkillGate } from "./framework-skill-gate";
import { isShadcnWrite, shadcnSkillGate } from "../policy/shadcn-skill-gate";
import { isTailwindWrite, tailwindSkillGate } from "../policy/tailwind-skill-gate";
import { geminiMcpGate } from "../policy/gemini-mcp-gate";
import { apexScopedGate } from "./gate-apex";
import { withDenyLoop } from "./deny-loop-store";
import { recordOneShot } from "../tracking/one-shot";
import { dirname } from "node:path";
import type { GateInput } from "./gate-input";
import type { Prompt } from "../prompt/types";

export type { GateInput } from "./gate-input";

/** Prior agents the freshness gate requires before a code edit. */
export const REQUIRED_AGENTS: ReadonlyArray<string> = ["explore-codebase", "research-expert"];

/**
 * Default freshness window (ms). Matches the plugin's `FUSE_ENFORCE_TTL_SEC`
 * default (120s); only a fallback for callers that omit `windowMs` (e.g. tests) —
 * the real CLI path always supplies it from `resolveTtlSec()` (`src/config/ttl.ts`).
 */
export const DEFAULT_WINDOW_MS = 120_000;

/** Trivial edits allowed within the window before the full APEX gates apply. */
export const TRIVIAL_BUDGET = 4;

/**
 * Full gate: {@link runGates} yields the first blocking prompt (or null); the tail
 * records the one-shot metric ({@link recordOneShot}, observation-only) then lets
 * {@link withDenyLoop} rewrite an identical retried deny (decision unchanged).
 */
export async function gate(input: GateInput): Promise<Prompt | null> {
  const prompt = await runGates(input);
  const op = { filePath: input.filePath, content: input.content, command: input.command };
  const dir = dirname(input.trackFile);
  recordOneShot(prompt, op, { now: input.now, dir });
  return withDenyLoop(prompt, input.tool, op, { now: input.now, dir, windowMs: input.windowMs ?? DEFAULT_WINDOW_MS });
}

/** Stateless guards, then the trivial fast path, then the stateful APEX gates. */
async function runGates(input: GateInput): Promise<Prompt | null> {
  // Pre-commit lint hard-block runs FIRST: evaluate()'s GIT_ASK branch would
  // otherwise short-circuit a `git commit` before the linters get to veto it.
  const precommit = preCommitGate(input.tool, input.command, input.cwd);
  if (precommit) return precommit;
  // Hook-managed paths: absolute deny on ALL extensions, BEFORE the code-ext/exempt filters (parity enforce-apex-phases.ts:48-52 — isApexScoped never routes a non-code/exempt path to the guard).
  const protectedDeny = protectedPathGate(input.tool, input.filePath);
  if (protectedDeny) return protectedDeny;
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
  // Standalone shadcn/ui gate (ports check-skill-loaded.py): runs independently of `framework` since a components.json / .css write may detect as "generic", mirroring the real plugin's own PreToolUse hook alongside react's.
  if (isShadcnWrite(input.tool, filePath)) {
    const shadcnBlock = shadcnSkillGate(input.tool, filePath, input.content ?? "", {
      refsRead: track.refsRead,
      authorizations: track.authorizations,
      sessionId: input.sessionId,
    });
    if (shadcnBlock) return shadcnBlock;
  }
  // Standalone Tailwind base-skill gate (ports check-tailwind-skill.py Phase 1): a .tsx/.jsx write with Tailwind classes needs a base Tailwind skill read, independent of framework.
  if (isTailwindWrite(input.tool, filePath, input.content ?? "")) {
    const twBlock = tailwindSkillGate(input.tool, filePath, input.content ?? "", track.refsRead);
    if (twBlock) return twBlock;
  }
  // OPT-IN Gemini Design MCP gate (ports enforce-gemini-mcp.py) — a no-op unless FUSE_ENFORCE_GEMINI_MCP is set, then blocks hand-written Tailwind UI until a mcp__gemini-design__* call is made this session.
  const geminiBlock = geminiMcpGate(input.tool, filePath, input.content ?? "", {
    authorizations: track.authorizations,
    sessionId: input.sessionId,
  });
  if (geminiBlock) return geminiBlock;
  // The freshness/doc/SOLID APEX gates only police code files (require-apex-agents.py parity): non-code and exempt paths skip straight to the DRY check below.
  if (isApexScoped(input.filePath)) {
    const apex = await apexScopedGate(input, track, window);
    if (apex) return apex;
  }
  // DRY duplication (effectful: greps the codebase) — runs once the APEX gates pass.
  return dryGate(input.tool, input.filePath, input.content, input.cwd);
}
