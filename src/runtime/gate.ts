import { existsSync, readFileSync } from "node:fs";
import { evaluate, type PolicyResult } from "../policy/evaluate";
import { evaluateApex, type ApexContext } from "../policy/apex";
import { FAIL_CLOSED } from "../policy/guards";
import { agentsFresh, recordTrivialEdit, trivialCount } from "../tracking/session-state";
import { loadTrack, saveTrack } from "../tracking/store";
import type { RefMeta } from "../refs/types";
import type { Prompt } from "../prompt/types";

/** Prior agents the freshness gate requires before a code edit. */
export const REQUIRED_AGENTS: ReadonlyArray<string> = ["explore-codebase", "research-expert"];

/** Default freshness window for {@link REQUIRED_AGENTS} (2 min — matches the plugin's `FUSE_ENFORCE_TTL_SEC` default). */
export const DEFAULT_WINDOW_MS = 120_000;

/** Trivial edits allowed within the window before the full APEX gates apply. */
export const TRIVIAL_BUDGET = 4;

/** A tool-use to gate, plus the session pointers needed for the stateful gates. */
export interface GateInput {
  sessionId: string;
  framework: string;
  tool: string;
  filePath?: string;
  content?: string;
  command?: string;
  refs?: RefMeta[];
  now: number;
  trackFile: string;
  windowMs?: number;
  isReplaceAll?: boolean;
  agentType?: string;
}

/** Line count of the existing on-disk file (undefined if absent/unreadable). */
function existingLineCount(path: string | undefined): number | undefined {
  if (!path) return undefined;
  try {
    return existsSync(path) ? readFileSync(path, "utf8").split("\n").length : undefined;
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
  let quick: PolicyResult;
  try {
    quick = evaluate({ tool: input.tool, filePath: input.filePath, content: input.content, command: input.command, agentType: input.agentType, existingLines: existingLineCount(input.filePath) });
  } catch {
    return FAIL_CLOSED;
  }
  if (quick.decision !== "allow" && quick.prompt) return quick.prompt;

  if (!input.filePath) return null;
  const window = input.windowMs ?? DEFAULT_WINDOW_MS;
  const track = await loadTrack(input.trackFile);

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
    return evaluateApex(ctx);
  } catch {
    return FAIL_CLOSED;
  }
}
