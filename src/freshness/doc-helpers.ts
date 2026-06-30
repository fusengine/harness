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

/** True when ANY documentation source (Context7, Exa, or web) was satisfied for the session. */
export function isDocConsulted(
  authorizations: Record<string, AuthEntry> | undefined,
  sessionId: string,
): boolean {
  const s = evaluateDoc(sessionAuthsFor(authorizations, sessionId));
  return s.context7 || s.exa || s.web;
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
    `APEX: Online documentation not consulted for ${framework}!`,
    "Use ANY ONE of: mcp__context7__query-docs, mcp__exa__web_search_exa (or — if Exa is down — mcp__fuse-browser__browser_fetch / browser_crawl / browser_serp_batch), WebSearch, or WebFetch.",
    "This check is once per session — after consulting one source, Write/Edit will be allowed.",
  ].join("\n");
}
