import { existsSync, readFileSync } from "node:fs";
import { evaluate, type PolicyResult } from "../policy/evaluate";
import { countLines } from "../policy/file-size";
import { evaluateApex, type ApexContext } from "../policy/apex";
import { FAIL_CLOSED } from "../policy/guards";
import { agentsFresh, recordTrivialEdit, trivialCount } from "../tracking/session-state";
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
 * Code-only line count of the existing on-disk file (undefined if
 * absent/unreadable). Uses {@link countLines} (skips blank/comment lines) to
 * mirror the Python `count_code_lines(get_full_file_content(...))`, so a partial
 * Edit judges the full file by the SAME metric as the incoming snippet — a raw
 * `split("\n").length` would over-count JSDoc/blank lines (and add a
 * trailing-newline off-by-one), falsely blocking well-documented files.
 */
function existingLineCount(path: string | undefined): number | undefined {
  if (!path) return undefined;
  try {
    return existsSync(path) ? countLines(readFileSync(path, "utf8")) : undefined;
  } catch {
    return undefined;
  }
}

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

  const ctx: ApexContext = {
    sessionId: input.sessionId,
    framework: input.framework,
    filePath: input.filePath,
    content: input.content ?? "",
    authorizations: track.authorizations,
    refs: input.refs,
    refsRead: track.refsRead,
    agentsFresh: agentsFresh(track, [...REQUIRED_AGENTS], window, input.now),
    brainstormRequired: track.brainstormRequired,
    brainstormFresh: agentsFresh(track, ["brainstorming"], window, input.now),
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
