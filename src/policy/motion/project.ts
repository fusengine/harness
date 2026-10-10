/**
 * @module motion/project
 * Locate and resolve a motion project's `.motion/project.json`.
 *
 * Contract (every path relative to the project root, all optional):
 * `{ "render": "render.sh" | "bun scripts/render.ts", "draft": "out/draft.mp4",
 *    "masters": ["out/master.mp4"] | "out/master.mp4", "sourceDir": "src",
 *    "reviewDir": ".motion/review" }`.
 * A missing/corrupt file resolves to defaults (the gates then fail closed on
 * the artifacts they cannot locate).
 */
import { existsSync, readFileSync } from "node:fs";
import { homedir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { canonicalRoot } from "../../runtime/prd/prd-canon";
import type { MotionProject } from "../interfaces/motion";
import { recordObject } from "../../util/record-object";

/**
 * Walk up from `cwd` to the nearest directory holding a `.motion/` dir; `null`
 * when none. The OS home itself never counts (a stray `~/.motion` would
 * otherwise turn every project under it into a motion project).
 * @param cwd - Starting directory.
 * @param home - OS home (injectable for tests).
 */
export function findMotionRoot(cwd: string, home: string = homedir()): string | null {
  let dir = resolve(cwd);
  const homeDir = resolve(home);
  for (;;) {
    if (existsSync(join(dir, ".motion")) && canonicalRoot(dir) !== canonicalRoot(homeDir)) return canonicalRoot(dir);
    const up = dirname(dir);
    if (up === dir) return null;
    dir = up;
  }
}

/** Parse `.motion/project.json` into a plain object (`{}` when missing/corrupt). */
function readProjectJson(root: string): Record<string, unknown> {
  try {
    const data: unknown = JSON.parse(readFileSync(join(root, ".motion", "project.json"), "utf8"));
    return recordObject(data);
  } catch {
    return {};
  }
}

const str = (v: unknown): string | undefined => (typeof v === "string" && v.trim() ? v.trim() : undefined);

/**
 * Resolve the motion project containing `cwd`.
 * @param cwd - Hook working directory.
 * @param home - OS home (injectable for tests).
 * @returns The resolved project, or `null` outside any motion project.
 */
export function loadMotionProject(cwd: string, home: string = homedir()): MotionProject | null {
  const root = findMotionRoot(cwd, home);
  if (!root) return null;
  const raw = readProjectJson(root);
  const abs = (p: string): string => resolve(root, p);
  const mastersRaw = [...(Array.isArray(raw.masters) ? raw.masters : [raw.masters]), raw.master];
  const draft = str(raw.draft);
  return {
    root,
    render: str(raw.render),
    draft: draft ? abs(draft) : undefined,
    masters: mastersRaw.map(str).filter((m): m is string => m !== undefined).map(abs),
    sourceDir: abs(str(raw.sourceDir) ?? "."),
    reviewDir: abs(str(raw.reviewDir) ?? join(".motion", "review")),
    contact: join(root, ".motion", "stills", "contact.png"),
  };
}
