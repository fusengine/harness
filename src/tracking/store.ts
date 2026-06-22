import { readJsonFile, writeJsonFile } from "../util/json-io";
import { emptyTrack, type SessionTrack } from "./session-state";

/** Load a session track from a file (an empty track if absent/corrupt). */
export async function loadTrack(file: string): Promise<SessionTrack> {
  return (await readJsonFile<SessionTrack>(file)) ?? emptyTrack();
}

/** Persist a session track. */
export async function saveTrack(file: string, track: SessionTrack): Promise<void> {
  await writeJsonFile(file, track);
}
