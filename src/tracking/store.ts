import { readJsonFile, writeJsonFile } from "../util/json-io";
import { emptyTrack, type SessionTrack } from "./session-state";
import { signTrack, verifyTrack, writeLastNonce, type TrackEnvelope } from "./integrity";
import { LOCK_FAILED, withTrackLock } from "./track-lock";
import { dirname } from "node:path";

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

/**
 * Locked read-modify-write on a session track (the fan-out-safe way to mutate
 * it): loads under the lock, applies `mutate`, persists atomically. On lock
 * contention the write is SKIPPED (fail-open, stderr already logged) and
 * `false` is returned — a named lost write, never a crash.
 * @param file - The session track file.
 * @param mutate - Pure mutation over the freshly loaded track.
 * @returns True when the write landed.
 */
export async function withTrack(
  file: string,
  mutate: (track: SessionTrack) => SessionTrack | Promise<SessionTrack>,
): Promise<boolean> {
  const ran = await withTrackLock(dirname(file), async () => {
    const track = await loadTrack(file);
    await saveTrack(file, await mutate(track));
  });
  return ran !== LOCK_FAILED;
}
