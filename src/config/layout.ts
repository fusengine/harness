import { join } from "node:path";

/** Top-level project state dir — neutral + harness-agnostic (not `.claude/…`). */
export const STATE_ROOT = ".harness";

/**
 * The selective `.gitignore` for `.harness/`: ignore the machine-local session
 * state (track, cache, throttle) but keep the curated `memory/LESSON.md`.
 */
export const STATE_GITIGNORE = "track/\ncache/\nmemory/state.json\n";

/** Every project-state path the package uses, derived from one project root. */
export interface ProjectLayout {
  root: string;
  /** `<root>/.harness` — the single state dir. */
  stateDir: string;
  /** `<root>/.harness/track` — session track files. */
  trackDir: string;
  /** `<root>/.harness/cache` — MCP/WebFetch cache. */
  cacheDir: string;
  /** `<root>/.harness/memory` — lessons + throttle. */
  memoryDir: string;
  /** `<root>/.harness/memory/LESSON.md` — curated, committable. */
  lessonsFile: string;
  /** `<root>/.harness/memory/state.json` — machine-local throttle. */
  memoryStateFile: string;
  /** `<root>/.harness/.gitignore`. */
  gitignoreFile: string;
}

/**
 * The single source of truth for where every package file lives under a project
 * root. All modules (runtime storage, memory, init) derive their paths here —
 * nothing hardcodes a directory name elsewhere.
 */
export function projectLayout(root: string): ProjectLayout {
  const stateDir = join(root, STATE_ROOT);
  const memoryDir = join(stateDir, "memory");
  return {
    root,
    stateDir,
    trackDir: join(stateDir, "track"),
    cacheDir: join(stateDir, "cache"),
    memoryDir,
    lessonsFile: join(memoryDir, "LESSON.md"),
    memoryStateFile: join(memoryDir, "state.json"),
    gitignoreFile: join(stateDir, ".gitignore"),
  };
}
