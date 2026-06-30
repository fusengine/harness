/**
 * Classifier crediting DIRECT (lead-agent) exploration/research tool use as the
 * matching APEX phase, so the freshness gate's self-recorded fallback accepts
 * genuine direct work — not only `Task`/`Agent` sub-agent spawns. Mirrors the
 * Python core-guards `_shared/apex_constants.py` + `track-subagent-research.py`.
 */

/** A REQUIRED_AGENTS name credited for a classified direct tool use. */
export type ExplorePhase = "explore-codebase" | "research-expert";

/** Outcome of classifying one direct tool use. */
export interface ExploreHit {
  /** APEX phase credited (a REQUIRED_AGENTS name). */
  phase: ExplorePhase;
  /** Reads of a cached MCP result count as `sufficient` regardless of length. */
  cacheHit: boolean;
}

/** Native exploration tools (parity `apex_constants.EXPLORE_TOOLS`). */
const EXPLORE_TOOLS = new Set(["Glob", "Grep"]);

/** Research tools — MCP docs + web (parity `apex_constants.RESEARCH_TOOLS`). */
const RESEARCH_TOOLS = new Set([
  "mcp__context7__query-docs",
  "mcp__context7__resolve-library-id",
  "mcp__exa__web_search_exa",
  "mcp__exa__get_code_context_exa",
  "mcp__exa__deep_researcher_start",
  "WebSearch",
  "WebFetch",
]);

/** Bash executables that count as exploration (parity `EXPLORE_BASH_CMDS`). */
const EXPLORE_BASH_CMDS = new Set(["grep", "rg", "find", "ls", "fd", "ast-grep", "tree", "cat", "head", "tail"]);

/** Cached MCP result reads count as research (parity `CACHE_READ_RE` + doc-helpers). */
const CACHE_READ_RE = /\/context\/mcp\/(exa-search|exa-code-context|context7)-/;

/**
 * First non-assignment shell token's basename, or "" — mirrors Python
 * `_bash_executable` (skips leading `VAR=value` env prefixes, e.g. `FOO=1 grep`).
 * @param cmd - Raw Bash `command` string.
 * @returns The executable basename, or "" when none.
 */
function bashExecutable(cmd: string): string {
  for (const token of cmd.trim().split(/\s+/)) {
    if (!token) continue;
    const last = token.split("/").pop() ?? token;
    if (!last.includes("=")) return last;
  }
  return "";
}

/**
 * Classify a direct tool use into an APEX phase, or `null` when it is neither
 * exploration nor research. Mirrors Python `track-subagent-research._classify`.
 * @param tool - Harness tool name (e.g. "Glob", "Bash", "WebSearch").
 * @param input - Tool input payload.
 * @returns The credited phase + cache flag, or `null`.
 */
export function classifyExplore(tool: string, input: Record<string, unknown> | undefined): ExploreHit | null {
  if (RESEARCH_TOOLS.has(tool)) return { phase: "research-expert", cacheHit: false };
  if (EXPLORE_TOOLS.has(tool)) return { phase: "explore-codebase", cacheHit: false };
  if (tool === "Read") {
    const path = String(input?.file_path ?? input?.path ?? "");
    if (path && CACHE_READ_RE.test(path)) return { phase: "research-expert", cacheHit: true };
    return null;
  }
  if (tool === "Bash") {
    const cmd = String(input?.command ?? "").trim();
    if (EXPLORE_BASH_CMDS.has(bashExecutable(cmd))) return { phase: "explore-codebase", cacheHit: false };
  }
  return null;
}
