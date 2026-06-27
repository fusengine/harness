import { readJsonFile, writeJsonFile } from "../util/json-io";
import { emptyTrack, type SessionTrack } from "./session-state";
import { signTrack, verifyTrack, writeLastNonce, type TrackEnvelope } from "./integrity";

/**
 * Load and verify a session track from a signed envelope file.
 *
 * Returns {@link emptyTrack} (fail closed) when the file is absent, corrupt, or
 * fails MAC validation — so the gates re-require real agents rather than trust a
 * forged track. Only a MAC mismatch triggers fail-closed; the nonce is advisory
 * and is never checked during load.
 */
export async function loadTrack(file: string): Promise<SessionTrack> {
  const envelope = await readJsonFile<TrackEnvelope>(file);
  if (!envelope) return emptyTrack();
  return verifyTrack(envelope) ?? emptyTrack();
}

/**
 * Sign and persist a session track as a tamper-evident envelope, then write the
 * advisory nonce watermark.
 */
export async function saveTrack(file: string, track: SessionTrack): Promise<void> {
  const envelope = signTrack(track);
  await writeJsonFile(file, envelope);
  writeLastNonce(envelope.nonce);
}
