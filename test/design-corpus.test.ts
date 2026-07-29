import { test, expect } from "bun:test";
import { mkdtempSync, mkdirSync, realpathSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  classifyCorpusRead, corpusReady, resolveCorpusRoot, resolvePluginsRoot, pluginsWriteGuard,
} from "../src/policy/design/corpus";

const ROOT = "/plugins/design-expert/skills/design-web/references/refs-design";

test("classifyCorpusRead: index vs tokens vs outside the delivered corpus", () => {
  expect(classifyCorpusRead(`${ROOT}/README.md`, ROOT)).toBe("index");
  expect(classifyCorpusRead(`${ROOT}/umbrel-recode/tokens-umbrel.md`, ROOT)).toBe("tokens");
  expect(classifyCorpusRead(`${ROOT}/elysian/tokens-elysian.md`, ROOT)).toBe("tokens");
  expect(classifyCorpusRead(`${ROOT}/umbrel-recode/index.html`, ROOT)).toBeNull();
  // A refs-design/ dir fabricated outside the delivered plugin never counts.
  expect(classifyCorpusRead("/tmp/scratch/refs-design/tokens-fake.md", ROOT)).toBeNull();
  expect(classifyCorpusRead("/proj/docs/refs-design/README.md", ROOT)).toBeNull();
});

test("corpusReady: per-mode thresholds (component >= 1, page >= 2, full = index + 2 tokens)", () => {
  const idx = ["README.md"];
  const one = ["README.md", "umbrel-recode/tokens-umbrel.md"];
  const two = [...one, "fora-recode/tokens-fora.md"];
  expect(corpusReady([], "component")).toBe(false);
  expect(corpusReady(idx, "component")).toBe(true);
  expect(corpusReady(idx, "page")).toBe(false);
  expect(corpusReady(one, "page")).toBe(true);
  expect(corpusReady(one, "full")).toBe(false); // one tokens file only
  expect(corpusReady(two.filter((r) => r !== "README.md"), "full")).toBe(false); // no index
  expect(corpusReady(two, "full")).toBe(true);
});

test("pluginsWriteGuard: writes under the delivered corpus are denied, anything else passes", () => {
  expect(pluginsWriteGuard(`${ROOT}/fake/tokens-fake.md`, ROOT)?.kind).toBe("block");
  expect(pluginsWriteGuard("/proj/refs-design/tokens-fake.md", ROOT)).toBeNull();
  expect(pluginsWriteGuard(`${ROOT}/x.md`, "")).toBeNull(); // no corpus → guard inert
});

test("pluginsWriteGuard: RELATIVE paths (the normal form of Codex patches) are resolved against cwd", () => {
  const plugins = mkdtempSync(join(tmpdir(), "fh-rel-"));
  const rel = "design-expert/skills/design-web/references/refs-design/fake/tokens-fake.md";
  expect(pluginsWriteGuard(rel, join(plugins, "design-expert"), plugins)?.kind).toBe("block");
  expect(pluginsWriteGuard(rel, join(plugins, "design-expert"), "/elsewhere")).toBeNull();
});

test("resolveCorpusRoot: empty when refs-design is absent, real path when present", () => {
  const plugins = mkdtempSync(join(tmpdir(), "fh-corpus-"));
  const refs = join(plugins, "design-expert", "skills", "design-web", "references", "refs-design");
  expect(resolveCorpusRoot(plugins)).toBe("");
  mkdirSync(refs, { recursive: true });
  expect(resolveCorpusRoot(plugins)).toBe(refs);
});

test("resolveCorpusRoot WITHOUT override: a corpus sitting at the cwd is NEVER retained", () => {
  // Fake home with NO plugin structure; a valid-looking corpus sits at the cwd.
  // There is no cwd fallback anywhere in the resolution: "" must come from the
  // refusal, not from chance — the corpus is present and still not retained.
  const fakeHome = realpathSync(mkdtempSync(join(tmpdir(), "fh-home-")));
  const proj = join(fakeHome, "project");
  mkdirSync(join(proj, "design-expert", "skills", "design-web", "references", "refs-design"), { recursive: true });
  const prev = process.cwd();
  process.chdir(proj);
  try {
    expect(resolveCorpusRoot(undefined, fakeHome, "claude-code", {})).toBe("");
    expect(resolvePluginsRoot(undefined, fakeHome, "claude-code", {})).toBe("");
  } finally {
    process.chdir(prev);
  }
});
