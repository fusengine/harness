import { evaluate } from "../policy/evaluate";
import { evaluateApex, type ApexContext } from "../policy/apex";
import { agentsFresh } from "../tracking/session-state";
import { loadTrack } from "../tracking/store";
import type { RefMeta } from "../refs/types";
import type { Prompt } from "../prompt/types";

/** Prior agents the freshness gate requires before a code edit. */
export const REQUIRED_AGENTS: ReadonlyArray<string> = ["explore-codebase", "research-expert"];

/** Default freshness window for {@link REQUIRED_AGENTS} (4 min, the APEX TTL). */
export const DEFAULT_WINDOW_MS = 240_000;

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
}

/**
 * Full gate: the stateless guards (file-size, git) first, then the stateful
 * APEX gates fed from the session track. Returns the first blocking prompt, or
 * null to allow. APEX gates apply only to code edits (a `filePath`).
 */
export async function gate(input: GateInput): Promise<Prompt | null> {
  const quick = evaluate({ tool: input.tool, filePath: input.filePath, content: input.content, command: input.command });
  if (quick.decision !== "allow" && quick.prompt) return quick.prompt;

  if (!input.filePath) return null;
  const track = await loadTrack(input.trackFile);
  const ctx: ApexContext = {
    sessionId: input.sessionId,
    framework: input.framework,
    filePath: input.filePath,
    content: input.content ?? "",
    authorizations: track.authorizations,
    refs: input.refs,
    refsRead: track.refsRead,
    agentsFresh: agentsFresh(track, [...REQUIRED_AGENTS], input.windowMs ?? DEFAULT_WINDOW_MS, input.now),
  };
  return evaluateApex(ctx);
}
