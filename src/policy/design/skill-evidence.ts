/**
 * @module design/skill-evidence
 * IO side of the UI design-skill gate: read the verified session track and
 * derive {@link DesignEvidence} (read references + doc-consulted) for
 * {@link uiDesignSkillGate}. Kept separate from the pure gate logic (SRP).
 * @packageDocumentation
 */
import { readFileSync } from "node:fs";
import type { SessionTrack } from "../../tracking/session-state";
import { verifyTrack, type TrackEnvelope } from "../../tracking/integrity";
import { defaultStateDir, trackFile } from "../../runtime/paths";
import { isDocConsulted } from "../../freshness/doc-helpers";
import type { DesignEvidence } from "./skill-gate";

/**
 * Read the verified session track and derive {@link DesignEvidence}. Fail-closed
 * on a missing/corrupt/tampered track (no evidence → the gate blocks).
 * @param sessionId - the Claude session id.
 * @param cwd - the project root (selects the per-project state dir).
 * @param baseDir - override the track base dir (tests); defaults to the project state dir.
 */
export function collectDesignEvidence(sessionId: string, cwd: string, baseDir: string = defaultStateDir(cwd)): DesignEvidence {
  let track: SessionTrack | null = null;
  try {
    const env = JSON.parse(readFileSync(trackFile(sessionId, baseDir), "utf8")) as TrackEnvelope;
    track = verifyTrack(env);
  } catch {
    track = null;
  }
  return {
    refsRead: track?.refsRead ?? [],
    docConsulted: track ? isDocConsulted(track.authorizations, sessionId) : false,
  };
}
