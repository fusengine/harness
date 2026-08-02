/**
 * @module design-read-credit
 * Shared credit path for a design-corpus/ref read, reused by both the native
 * `Read` branch and the shell-read branch (Codex Code Mode `exec_command`,
 * canonicalized to `"Bash"` by `codex-shell-tool.ts`) in
 * `design-helpers.ts::recordPost`. Split out to keep that file within the
 * SOLID size budget — zero new parser, zero new store: both callers hit the
 * SAME `recordCorpusRead`/`recordRead` transitions.
 * @packageDocumentation
 */
import { existsSync } from "node:fs";
import type { DesignState } from "../policy/design/state";
import { saveDesignState } from "../policy/design/state";
import { recordCorpusRead, recordRead } from "../policy/design/transitions";
import { classifyCorpusRead } from "../policy/design/corpus";
import { shellReadRefPaths } from "../policy/shell-read-refs";

/** Credit one read path as a corpus read (anchored + on-disk) or a plain ref read. */
export function creditRead(cacheDir: string, state: DesignState, corpusRoot: string, corpusRequired: boolean, fp: string): void {
  if (classifyCorpusRead(fp, corpusRoot) && existsSync(fp)) {
    saveDesignState(cacheDir, recordCorpusRead(state, fp.slice(corpusRoot.length + 1), corpusRequired));
  } else saveDesignState(cacheDir, recordRead(state, fp, corpusRequired));
}

/** Credit every `.md` path a read-only shell `command` targets, same path as {@link creditRead}. */
export function creditShellReads(cacheDir: string, state: DesignState, corpusRoot: string, corpusRequired: boolean, command: string): void {
  for (const fp of shellReadRefPaths(command)) creditRead(cacheDir, state, corpusRoot, corpusRequired, fp);
}
