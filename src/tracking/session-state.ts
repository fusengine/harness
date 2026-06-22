import type { AuthEntry } from "../freshness/doc-helpers";

/** Quality of a recorded agent call (the freshness gate ignores insufficient ones). */
export type AgentQuality = "sufficient" | "insufficient";

/** Recorded session activity that feeds the APEX gates. */
export interface SessionTrack {
  authorizations: Record<string, AuthEntry>;
  refsRead: string[];
  agents: { name: string; ts: number; quality?: AgentQuality }[];
  trivialEdits: number[];
  brainstormRequired?: boolean;
}

/** A fresh, empty track. */
export function emptyTrack(): SessionTrack {
  return { authorizations: {}, refsRead: [], agents: [], trivialEdits: [] };
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

/** Record an agent/tool call with a timestamp + optional quality. Immutable. */
export function recordAgent(track: SessionTrack, name: string, ts: number, quality?: AgentQuality): SessionTrack {
  const entry = quality ? { name, ts, quality } : { name, ts };
  return { ...track, agents: [...track.agents, entry] };
}

/** True when ALL of `names` ran within `windowMs` with non-insufficient quality. */
export function agentsFresh(track: SessionTrack, names: string[], windowMs: number, now: number): boolean {
  const cutoff = now - windowMs;
  return names.every((n) => track.agents.some((a) => a.name === n && a.ts > cutoff && a.quality !== "insufficient"));
}

/** Record a trivial edit timestamp (sliding window; old evicted). Immutable. */
export function recordTrivialEdit(track: SessionTrack, ts: number, windowMs: number, now: number): SessionTrack {
  const cutoff = now - windowMs;
  return { ...track, trivialEdits: [...(track.trivialEdits ?? []).filter((t) => t > cutoff), ts] };
}

/** Count trivial edits within the sliding window. */
export function trivialCount(track: SessionTrack, windowMs: number, now: number): number {
  const cutoff = now - windowMs;
  return (track.trivialEdits ?? []).filter((t) => t > cutoff).length;
}

/** Set the brainstorm-required flag (from creation-intent detection). Immutable. */
export function recordBrainstormRequired(track: SessionTrack, required: boolean): SessionTrack {
  return { ...track, brainstormRequired: required };
}
