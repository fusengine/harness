/** @module motion/paths — shared pure path containment. */
import { sep } from "node:path";

/** True when the absolute path equals or lies beneath the absolute directory. */
export function isUnder(path: string, dir: string): boolean {
  return path === dir || path.startsWith(dir.endsWith(sep) ? dir : dir + sep);
}
