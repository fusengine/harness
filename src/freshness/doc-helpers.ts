/**
 * Documentation-consultation freshness: was Context7 AND Exa consulted this
 * session (via live MCP query, or a Read on a cached MCP result file)?
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
  viaCache: boolean;
}

function evaluateDoc(auths: AuthEntry[]): DocSatisfactionStatus {
  const sources = auths.flatMap((a) => a.sources ?? [a.source ?? ""]);
  const readPaths = auths.flatMap((a) => a.read_paths ?? []);
  const liveC7 = sources.some((s) => /context7/.test(s));
  const liveExa = sources.some((s) => /exa/.test(s));
  const cacheC7 = readPaths.some((p) => /\/context\/mcp\/context7-/.test(p));
  const cacheExa = readPaths.some((p) => /\/context\/mcp\/(exa-search|exa-code-context)-/.test(p));
  return {
    context7: liveC7 || cacheC7,
    exa: liveExa || cacheExa,
    viaCache: (!liveC7 && cacheC7) || (!liveExa && cacheExa),
  };
}

/** True when BOTH Context7 and Exa were satisfied for the session. */
export function isDocConsulted(
  authorizations: Record<string, AuthEntry> | undefined,
  sessionId: string,
): boolean {
  const s = evaluateDoc(sessionAuthsFor(authorizations, sessionId));
  return s.context7 && s.exa;
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
    "Use BOTH: 1) mcp__context7__query-docs AND 2) mcp__exa__web_search_exa.",
    "This check is once per session — after consulting both, Write/Edit will be allowed.",
  ].join("\n");
}
