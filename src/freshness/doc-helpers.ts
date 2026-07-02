/**
 * Documentation-consultation freshness: was ANY documentation source consulted
 * this session — Context7, Exa, or WebSearch/WebFetch — via a live call or a
 * Read on a cached MCP result file?
 */

/** Authorization entry from APEX state (legacy session + new sessions[]). */
export interface AuthEntry {
  source?: string;
  sources?: string[];
  sessions?: string[];
  session?: string;
  doc_sessions?: string[];
  read_paths?: string[];
  /** ISO stamp of the latest doc/skill consultation for this framework (Check-1 TTL, parity enforce-apex-phases.ts). */
  doc_consulted?: string;
}

/** Resolve the sessions array from an auth entry (legacy fallback). */
export function resolveSessions(auth: AuthEntry | undefined): string[] {
  if (!auth) return [];
  return auth.sessions ?? (auth.session ? [auth.session] : []);
}

function sessionAuthsFor(
  authorizations: Record<string, AuthEntry> | undefined,
  sessionId: string,
): AuthEntry[] {
  if (!authorizations) return [];
  return Object.values(authorizations).filter((a) => a.doc_sessions?.includes(sessionId));
}

/** Per-source satisfaction status for a session. */
export interface DocSatisfactionStatus {
  context7: boolean;
  exa: boolean;
  web: boolean;
  viaCache: boolean;
}

function evaluateDoc(auths: AuthEntry[]): DocSatisfactionStatus {
  const sources = auths.flatMap((a) => a.sources ?? [a.source ?? ""]);
  const readPaths = auths.flatMap((a) => a.read_paths ?? []);
  const liveC7 = sources.some((s) => /context7/i.test(s));
  const liveExa = sources.some((s) => /exa/i.test(s));
  const liveWeb = sources.some((s) => /web(search|fetch)|fuse-browser/i.test(s));
  const cacheC7 = readPaths.some((p) => /\/context\/mcp\/context7-/.test(p));
  const cacheExa = readPaths.some((p) => /\/context\/mcp\/(exa-search|exa-code-context)-/.test(p));
  return {
    context7: liveC7 || cacheC7,
    exa: liveExa || cacheExa,
    web: liveWeb,
    viaCache: (!liveC7 && cacheC7) || (!liveExa && cacheExa),
  };
}

/**
 * True when documentation research is satisfied for the session. Primary path
 * is parity with the Python `mcp_research_done`
 * (`_shared/scripts/check_skill_common.py`): `"context7:" in content and
 * "exa:" in content`, a strict AND (the Python source has no web-alone path).
 * `web` (WebSearch/WebFetch/fuse-browser) is a deliberate TS-side addition —
 * it alone satisfies the gate, since fuse-browser is this harness's preferred
 * doc-research fast-path (see CLAUDE.md) and Context7/Exa can be unavailable.
 */
export function isDocConsulted(
  authorizations: Record<string, AuthEntry> | undefined,
  sessionId: string,
): boolean {
  const s = evaluateDoc(sessionAuthsFor(authorizations, sessionId));
  return (s.context7 && s.exa) || s.web;
}

/** Report how each doc source was satisfied for a session. */
export function formatDocSatisfactionStatus(
  authorizations: Record<string, AuthEntry> | undefined,
  sessionId: string,
): DocSatisfactionStatus {
  return evaluateDoc(sessionAuthsFor(authorizations, sessionId));
}

/** Deny message when online documentation has not been consulted. */
export function formatDocDeny(framework: string): string {
  return [
    `BLOCKED: No MCP research done for ${framework}. Use BOTH:`,
    "1) mcp__context7__query-docs AND 2) mcp__exa__web_search_exa",
    "— OR a web fallback alone: mcp__fuse-browser__browser_fetch / browser_crawl / browser_serp_batch, WebSearch, or WebFetch.",
    "This check is once per session — after consulting the required source(s), Write/Edit will be allowed.",
  ].join("\n");
}
