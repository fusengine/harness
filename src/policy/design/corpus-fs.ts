/**
 * @module corpus-fs
 * Shared fs primitives for corpus/plugins root resolution, split out of
 * `corpus-resolve.ts` so `corpus-resolve-cache.ts` can reuse them without a
 * circular import (both modules feed `corpus-resolve.ts`'s `probeClaude`).
 * @packageDocumentation
 */
import { readdirSync } from "node:fs";
import { join } from "node:path";

/** The refs-design/ path suffix common to every design-corpus-bearing plugin tree. */
export const CORPUS_SUFFIX: string = join("skills", "design-web", "references", "refs-design");

/** Immediate child dir names of `dir`, alphabetically sorted, or [] when unreadable. */
export function children(dir: string): string[] {
  try {
    return readdirSync(dir).sort();
  } catch {
    return [];
  }
}
