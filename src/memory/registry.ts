import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";

/** Registry path relative to the home dir. */
const SUBPATH = ".fuse-harness/cache/lessons/roots.json";

/** Absolute path of the global roots registry, or null when home is unusable. */
export function registryFile(home: string | undefined = process.env.HOME): string | null {
  const h = home?.trim();
  if (!h || !h.startsWith("/")) return null;
  return `${h}/${SUBPATH}`;
}

/** Read the registered project roots (deduplicated string entries only). */
export function readRoots(home?: string): string[] {
  const file = registryFile(home);
  if (!file) return [];
  try {
    const parsed: unknown = JSON.parse(readFileSync(file, "utf8"));
    return Array.isArray(parsed) ? parsed.filter((e): e is string => typeof e === "string") : [];
  } catch {
    return [];
  }
}

/** Register a project root once (deduplicated, read-modify-write, non-throwing). */
export function addRoot(root: string, home?: string): void {
  const file = registryFile(home);
  if (!file) return;
  try {
    const roots = new Set(readRoots(home));
    if (roots.has(root)) return;
    roots.add(root);
    mkdirSync(dirname(file), { recursive: true });
    writeFileSync(file, JSON.stringify([...roots]));
  } catch {
    /* non-fatal: a missed root never blocks the session */
  }
}
