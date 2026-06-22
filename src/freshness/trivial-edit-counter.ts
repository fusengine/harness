import { dirname } from "node:path";
import { ensureDir, readJsonFile, writeJsonFile } from "../util/json-io";

interface TrivialEditState {
  trivial_edits?: number[];
  [key: string]: unknown;
}

/**
 * Increment a session's trivial-edit counter, evicting timestamps older than
 * `windowMs`. Decoupled + injectable `now` for testability.
 * @param filePath - session state file path
 * @param windowMs - sliding window in ms
 * @param now - current epoch ms (defaults to `Date.now()`)
 * @returns number of trivial edits within the window (including this one)
 */
export async function incrementTrivialEditCounter(
  filePath: string,
  windowMs: number,
  now: number = Date.now(),
): Promise<number> {
  await ensureDir(dirname(filePath));
  const state: TrivialEditState = (await readJsonFile<TrivialEditState>(filePath)) ?? {};
  const cutoff = now - windowMs;
  const edits = (state.trivial_edits ?? []).filter((ts) => ts > cutoff);
  edits.push(now);
  state.trivial_edits = edits;
  await writeJsonFile(filePath, state);
  return edits.length;
}
