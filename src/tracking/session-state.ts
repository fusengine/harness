import type { AuthEntry } from "../freshness/doc-helpers";

/** Recorded session activity that feeds the APEX gates. */
export interface SessionTrack {
  authorizations: Record<string, AuthEntry>;
  refsRead: string[];
  agents: { name: string; ts: number }[];
}

/** A fresh, empty track. */
export function emptyTrack(): SessionTrack {
  return { authorizations: {}, refsRead: [], agents: [] };
}

/** Record a doc consultation (Context7/Exa) for a framework in this session. Immutable. */
export function recordDoc(track: SessionTrack, framework: string, sessionId: string, source: string): SessionTrack {
  const prev = track.authorizations[framework] ?? {};
  const sessions = new Set(prev.doc_sessions ?? []);
  sessions.add(sessionId);
  const sources = new Set(prev.sources ?? (prev.source ? [prev.source] : []));
  sources.add(source);
  return {
    ...track,
    authorizations: { ...track.authorizations, [framework]: { ...prev, doc_sessions: [...sessions], sources: [...sources] } },
  };
}

/** Record that a SOLID reference file was read (deduped). Immutable. */
export function recordRefRead(track: SessionTrack, path: string): SessionTrack {
  return track.refsRead.includes(path) ? track : { ...track, refsRead: [...track.refsRead, path] };
}

/** Record an agent/tool call with a timestamp. Immutable. */
export function recordAgent(track: SessionTrack, name: string, ts: number): SessionTrack {
  return { ...track, agents: [...track.agents, { name, ts }] };
}

/** True when ALL of `names` were called within `windowMs` before `now`. */
export function agentsFresh(track: SessionTrack, names: string[], windowMs: number, now: number): boolean {
  const cutoff = now - windowMs;
  return names.every((n) => track.agents.some((a) => a.name === n && a.ts > cutoff));
}
