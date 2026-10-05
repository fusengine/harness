import { accessSync, constants, readdirSync, statSync } from "node:fs";
import { delimiter, join } from "node:path";
import { loadRefs } from "./loader";
import type { RefMeta } from "./types";

/** Lazy, memoized refs thunk handed to the gate chain (see {@link lazyRefs}). */
export type RefsThunk = () => Promise<RefMeta[] | undefined>;

/**
 * Cheap pre-flight of {@link loadRefs}: lists the same files and checks every
 * `.md` is a regular, readable file (stat + access) WITHOUT reading or parsing
 * any content. False means "the real scan might throw" — the caller then runs it.
 */
function refsReadable(dirs: string): boolean {
  for (const dir of dirs.split(delimiter).filter(Boolean)) {
    let entries: string[];
    try {
      entries = readdirSync(dir, { recursive: true }) as string[];
    } catch {
      continue; // loadRefs skips an absent/unlistable dir too
    }
    for (const rel of entries) {
      if (!rel.endsWith(".md")) continue;
      const file = join(dir, rel);
      try {
        if (!statSync(file).isFile()) return false;
        accessSync(file, constants.R_OK);
      } catch {
        return false;
      }
    }
  }
  return true;
}

/**
 * Defer the ~160 file reads + frontmatter parses of {@link loadRefs} until a gate
 * consumes the refs (the APEX-scoped gate, past the protected-path / skip-dir /
 * trivial-edit early returns and the PRE gates) instead of paying them on every
 * PreToolUse. FAILURE SEMANTICS ARE UNCHANGED: when any `.md` is not a readable
 * regular file this runs the real {@link loadRefs} right here, so the same error
 * surfaces at the same point (handle-pre) as the former eager load. The thunk
 * memoizes one promise, so each Cursor command candidate shares a single load.
 * @param dirs - `delimiter`-joined refs dirs (`opts.refsDir`), or undefined.
 * @returns A memoized thunk resolving to the loaded refs (or undefined without dirs).
 * @throws The error {@link loadRefs} would throw for an unreadable ref.
 */
export async function lazyRefs(dirs: string | undefined): Promise<RefsThunk> {
  if (!dirs) return async () => undefined;
  if (!refsReadable(dirs)) {
    const eager = await loadRefs(dirs); // throws the genuine error (as before), else the refs we already paid for
    return async () => eager;
  }
  let pending: Promise<RefMeta[]> | undefined;
  return () => (pending ??= loadRefs(dirs));
}
