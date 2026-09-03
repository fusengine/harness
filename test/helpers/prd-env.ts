/**
 * @module test/helpers/prd-env
 * Materializes the PRD contract's on-disk fixtures (test/fixtures/prd/) under a
 * fresh `<root>/<homeSeg>/apex/` tree, for tests that need a project with a
 * real router + task PRD + one agent report already on disk (prd-design.md §0).
 * Kept out of test/sim/* on purpose: this is a plain fs helper reused by BOTH
 * the sim regression suite (test/sim/prd-regression.test.ts) and any future
 * unit test that needs a populated PRD project without going through the
 * scenario runner's own `setup` mechanism.
 */
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

/** Absolute path to `test/fixtures/prd`, resolved from this file. */
const FIXTURES_DIR: string = join(import.meta.dir, "..", "fixtures", "prd");

/** A populated tmp project root plus its cleanup callback. */
export interface PrdEnv {
  /** Project root (`CLAUDE_PROJECT_DIR`/cwd equivalent) — also used as `HOME`. */
  root: string;
  /** Home-dir segment the fixtures were materialized under (e.g. ".claude"). */
  homeSeg: string;
  /** Removes the whole tmp tree. Idempotent, safe to call more than once. */
  cleanup: () => void;
}

/**
 * Copies the three synthetic PRD fixtures (router, task PRD, one agent report —
 * test/fixtures/prd/README.md §1) verbatim into `<root>/<homeSeg>/apex/`. Byte-
 * exact copy (no JSON re-serialization), so this is always the SAME content the
 * documentation's worked example shows.
 *
 * The router fixture's SOURCE file is named `router.json` (test/fixtures/prd/
 * router.json — the fixture's own on-disk name), but the CONTRACT (prd-design.md
 * §0) requires it live at `<homeSeg>/apex/prd.json`, not `.../apex/router.json`.
 * `isPrdEnabled()`'s activation check looks for `prd.json` specifically — the
 * wrong destination name means the module is silently never activated by this
 * helper. Do not "fix" this by renaming the fixture source file instead: that
 * source name is the one test/fixtures/prd/README.md documents.
 * @param root - Project root to materialize under.
 * @param homeSeg - Home-dir segment (e.g. ".claude", ".codex", ".cursor").
 */
export function materializePrdFixtures(root: string, homeSeg: string): void {
  const apex = join(root, homeSeg, "apex");
  const copy = (srcRel: string, destRel: string): void => {
    const dest = join(apex, destRel);
    mkdirSync(join(dest, ".."), { recursive: true });
    writeFileSync(dest, readFileSync(join(FIXTURES_DIR, srcRel)));
  };
  copy("router.json", "prd.json");
  copy(join("prd", "auth-refactor-prd.json"), join("prd", "auth-refactor-prd.json"));
  copy(join("prd", "agents", "backend-expert-prd.json"), join("prd", "agents", "backend-expert-prd.json"));
}

/**
 * Creates an isolated tmp project already populated with the PRD fixtures, and
 * returns it. `HOME` is set to the same tmp root by every caller that spawns
 * the harness against `env.root` (mirrors `test/sim/exec.ts`'s own HOME=$TMP
 * isolation contract — never the real `~/.fuse-harness`).
 * @param homeSeg - Home-dir segment to materialize under; defaults to ".claude".
 * @returns The populated {@link PrdEnv}.
 */
export function createPrdEnv(homeSeg: string = ".claude"): PrdEnv {
  const root = mkdtempSync(join(tmpdir(), "fh-prd-env-"));
  materializePrdFixtures(root, homeSeg);
  return { root, homeSeg, cleanup: () => rmSync(root, { recursive: true, force: true }) };
}
