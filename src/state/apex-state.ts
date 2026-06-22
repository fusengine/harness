import type { AuthEntry } from "../freshness/doc-helpers";
import { ensureDir, readJsonFile, writeJsonFile } from "../util/json-io";

const DEFAULT_STATE = {
  $schema: "apex-state-v1",
  description: "APEX/SOLID state - sessions[] + 2min expiry",
  target: {} as Record<string, string>,
  authorizations: {} as Record<string, AuthEntry & { doc_consulted?: string }>,
};

/** APEX state shape. */
export type ApexState = typeof DEFAULT_STATE;

/** APEX state directory under a home dir. */
export function apexStateDir(home: string = process.env.HOME ?? ""): string {
  return `${home}/.claude/logs/00-apex`;
}

/** Daily state file path: `<home>/.claude/logs/00-apex/<YYYY-MM-DD>-state.json`. */
export function stateFilePath(
  home: string = process.env.HOME ?? "",
  today: string = new Date().toISOString().slice(0, 10),
): string {
  return `${apexStateDir(home)}/${today}-state.json`;
}

/** Ensure the state directory exists and return its path. */
export async function ensureStateDir(home?: string): Promise<string> {
  const dir = apexStateDir(home);
  await ensureDir(dir);
  return dir;
}

/** Load APEX state, or a fresh default. */
export async function loadState(path: string): Promise<ApexState> {
  return (await readJsonFile<ApexState>(path)) ?? { ...DEFAULT_STATE };
}

/** Save APEX state. */
export async function saveState(path: string, state: ApexState): Promise<void> {
  await writeJsonFile(path, state);
}
