import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";
import { projectLayout } from "../config/layout";
import { ensureMemoryGitignore } from "./gitignore";

/** Per-project reminder throttle state, stored at `<root>/MEMORY/state.json`. */
export interface ReminderState {
  lastRemindedAt: number;
  lastCodeEditAt: number;
}

/** Absolute path of the per-project throttle state file. */
export function stateFileFor(root: string): string {
  return projectLayout(root).memoryStateFile;
}

/** Absolute path of the per-project curated lessons file (committable). */
export function lessonsFileFor(root: string): string {
  return projectLayout(root).lessonsFile;
}

function num(v: unknown): number {
  return typeof v === "number" && Number.isFinite(v) ? v : 0;
}

/** Read both throttle timestamps; missing/corrupt fields default to 0. */
export function readState(file: string): ReminderState {
  try {
    const parsed = JSON.parse(readFileSync(file, "utf8")) as Partial<ReminderState>;
    return { lastRemindedAt: num(parsed?.lastRemindedAt), lastCodeEditAt: num(parsed?.lastCodeEditAt) };
  } catch {
    return { lastRemindedAt: 0, lastCodeEditAt: 0 };
  }
}

/** Persist one field without clobbering the other (read-modify-write). */
export function setStateField(file: string, key: keyof ReminderState, value: number): void {
  const next: ReminderState = { ...readState(file), [key]: value };
  const dir = dirname(file);
  mkdirSync(dir, { recursive: true });
  ensureMemoryGitignore(dir);
  writeFileSync(file, JSON.stringify(next));
}

/** Local wall-clock timestamp for a lesson bullet: `YYYY-MM-DD HH:MM`. */
export function nowStamp(): string {
  const d = new Date();
  const p = (n: number): string => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}`;
}

/** Throttle window (ms) from `FUSE_LESSONS_THROTTLE_MIN` (default 5 min). */
export function throttleMs(env: Record<string, string | undefined> = process.env): number {
  const raw = env.FUSE_LESSONS_THROTTLE_MIN?.trim();
  const min = raw ? Number(raw) : 5;
  return (Number.isFinite(min) ? Math.max(0, min) : 5) * 60_000;
}
