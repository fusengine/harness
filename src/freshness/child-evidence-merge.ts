/**
 * Cursor runs every sub-agent under its OWN `conversation_id`, so the evidence its
 * tools leave (explore/research agents, SOLID `.md` reads, doc consultations) lands
 * in the CHILD session track — the parent that then writes code never sees it
 * (Claude sub-agents share the lead's session id, so this never arises there).
 * This folds a finished child track into the parent track. PURE: the caller owns I/O.
 *
 * Never makes the parent LESS fresh: agents are de-duplicated (same name within
 * ±2 s), a ref read / doc consultation is copied only when the child's stamp is
 * newer than the parent's.
 */
import { recordAgent, recordRefRead, type SessionTrack } from "../tracking/session-state";
import { creditDocConsultation } from "../policy/apex-authorization";
import { agentAlreadyRecorded } from "./evidence-harvest";
import { resolveSessions } from "./doc-helpers";

function mergeAgents(parent: SessionTrack, child: SessionTrack): SessionTrack {
  let next = parent;
  for (const a of child.agents) {
    if (agentAlreadyRecorded(next, a.name, a.ts)) continue;
    next = recordAgent(next, a.name, a.ts, a.quality);
  }
  return next;
}

function mergeRefs(parent: SessionTrack, child: SessionTrack): SessionTrack {
  let next = parent;
  for (const path of child.refsRead) {
    const ts = child.refsReadAt?.[path];
    const prev = next.refsReadAt?.[path];
    if (ts === undefined) {
      if (!next.refsRead.includes(path)) next = recordRefRead(next, path);
    } else if (prev === undefined || prev < ts) {
      next = recordRefRead(next, path, ts);
    }
  }
  return next;
}

/**
 * Credit the parent session with each framework credited in the child track (no
 * parent-side `recordDoc` `target` cross-credit: the parent gains nothing the child
 * did not hold). Stamped with the newer of the child's time and the parent's OWN
 * earned stamp, so a merge never regresses the parent and never freshens a stale read.
 */
function mergeDocs(parent: SessionTrack, child: SessionTrack, parentSessionId: string): SessionTrack {
  let next = parent;
  for (const [framework, entry] of Object.entries(child.authorizations)) {
    const childAt = entry.doc_consulted ? Date.parse(entry.doc_consulted) : NaN;
    if (Number.isNaN(childAt)) continue;
    const prev = next.authorizations[framework];
    const parentAt = Date.parse(prev?.doc_consulted ?? "");
    // The parent's stamp counts only when the PARENT session earned it (Check 1 = `sessions`,
    // Check 2 = `doc_sessions`); a stamp left by another session must never refresh a stale child read.
    const parentEarned = resolveSessions(prev).includes(parentSessionId) && (prev?.doc_sessions ?? []).includes(parentSessionId) && !Number.isNaN(parentAt);
    if (parentEarned && parentAt >= childAt) continue;
    const stampIso = new Date(parentEarned ? Math.max(parentAt, childAt) : childAt).toISOString();
    const sources = entry.sources ?? (entry.source ? [entry.source] : []);
    let credited = prev;
    for (const source of sources.length ? sources : ["subagent"]) credited = creditDocConsultation(credited, parentSessionId, source, stampIso);
    if (credited) next = { ...next, authorizations: { ...next.authorizations, [framework]: credited } };
  }
  return next;
}

/**
 * Fold a child (sub-agent) track's evidence into its parent session track.
 * @param parent - The parent session track.
 * @param child - The finished sub-agent's own track.
 * @param parentSessionId - The parent session id (doc consultations are credited to it).
 * @returns The merged parent track, or `parent` itself when nothing was added.
 */
export function mergeChildEvidence(parent: SessionTrack, child: SessionTrack, parentSessionId: string): SessionTrack {
  return mergeDocs(mergeRefs(mergeAgents(parent, child), child), child, parentSessionId);
}
