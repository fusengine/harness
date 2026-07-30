/**
 * @module test/helpers/inform-matrix-env
 * Hermetic fixture tree for the zero-regression golden capture.
 *
 * The emitters under capture read AMBIENT state: `$HOME` (root instructions doc,
 * the marketplace scan, the dedup sidecar), the project dir (`MEMORY/LESSON.md`,
 * project-type detection), `process.env` (harness detection, SOLID ceiling), and
 * a clock. Left ambient, the golden would encode THIS machine on THIS day and
 * prove nothing. This module builds the fixtures; the capture itself runs in a
 * CHILD process (see `inform-matrix-run`) because Bun snapshots `$HOME` at
 * process start — `os.homedir()` ignores a later `process.env.HOME` mutation
 * (measured on Bun 1.3.14), so in-process pinning silently reads the real home.
 */
import { mkdirSync, mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

/** Pinned clock for every emitter that takes one (lessons curation). */
export const NOW = 1_700_000_000_000;

/**
 * Home segment → root instructions doc, mirroring `harnessHomeSegment` /
 * `apexDocName`. Bodies differ per segment on purpose: `claude-code` and
 * `gemini-cli` both read `CLAUDE.md`, and identical bodies would collide on the
 * `oncePerWindow` content hash — blanking one cell of the golden in silence.
 */
const HARNESS_DOCS: ReadonlyArray<readonly [string, string]> = [
  [".claude", "CLAUDE.md"],
  [".codex", "AGENTS.md"],
  [".gemini", "CLAUDE.md"],
  [".kimi-code", "AGENTS.md"],
];

/** Fixture lesson: one dated bullet, stable under curation at {@link NOW}. */
const LESSON = "- [2026-01-01 10:00] Fixture lesson body. → Fixture rule. [TRIGGERS keyword:fixture]\n";

/**
 * `package.json` marker. NOT cosmetic: `projectRoot()` walks up for `.git` then
 * `package.json` and falls back to `process.cwd()` — without this marker the
 * lessons emitter would read AND REWRITE this repo's own `MEMORY/LESSON.md`.
 * Its content must match no framework probe, so detection stays "generic".
 */
const PKG = '{"name":"golden-fixture","version":"0.0.0"}\n';

/** Absolute paths of one fixture tree, shared by the parent and the capture child. */
export interface MatrixPaths {
  /** Temp root holding `home/`, `plugin/` and the project dirs. */
  root: string;
  /** `$HOME` of the capture child. */
  home: string;
  /** Plugin root passed to `injectRules` (holds `rules/*.md`). */
  pluginRoot: string;
  /** Stable project dir, for the emitters that only READ it. */
  project: string;
}

/** Derive every fixture path from the root, so parent and child never disagree. */
export function pathsFor(root: string): MatrixPaths {
  return {
    root,
    home: join(root, "home"),
    pluginRoot: join(root, "plugin"),
    project: join(root, "project-stable"),
  };
}

/**
 * Create a project dir carrying the markers `projectRoot` + detection need.
 * Lessons curation REWRITES `LESSON.md`, so each lessons cell gets its OWN dir —
 * a shared one would make cell N depend on cell N-1.
 * @param root - Fixture root.
 * @param tag - Unique suffix for this project dir.
 * @returns The created project dir.
 */
export function makeProject(root: string, tag: string): string {
  const dir = join(root, `project-${tag}`);
  mkdirSync(join(dir, "MEMORY"), { recursive: true });
  writeFileSync(join(dir, "package.json"), PKG);
  writeFileSync(join(dir, "MEMORY", "LESSON.md"), LESSON);
  return dir;
}

/**
 * Build the fixture tree under a fresh temp root.
 * @returns The fixture paths.
 */
export function buildFixtures(): MatrixPaths {
  const paths = pathsFor(mkdtempSync(join(tmpdir(), "inform-golden-")));
  for (const [seg, doc] of HARNESS_DOCS) {
    mkdirSync(join(paths.home, seg), { recursive: true });
    writeFileSync(join(paths.home, seg, doc), `# fixture ${doc} for ${seg}\nBODY ${seg}\n`);
  }
  mkdirSync(join(paths.pluginRoot, "rules"), { recursive: true });
  writeFileSync(join(paths.pluginRoot, "rules", "00-alpha.md"), "# 00 alpha\nalpha body\n");
  writeFileSync(join(paths.pluginRoot, "rules", "01-beta.md"), "# 01 beta\nbeta body\n");
  makeProject(paths.root, "stable");
  return paths;
}

/**
 * Environment of the capture child — an ALLOWLIST, never an inherit. Inheriting
 * would leak `CLAUDECODE` (or any of the 15 other harness markers), making
 * `detectHarness()` answer "claude-code" here and "unknown" in CI, plus every
 * ambient `FUSE_*` that moves the SOLID ceiling.
 * @param paths - The fixture tree.
 * @returns The exact env handed to the child.
 */
export function childEnv(paths: MatrixPaths): Record<string, string> {
  return { PATH: process.env.PATH ?? "", HOME: paths.home, MATRIX_ROOT: paths.root };
}
