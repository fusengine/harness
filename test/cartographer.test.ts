import { test, expect } from "bun:test";
import { tmpdir, homedir } from "node:os";
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, existsSync } from "node:fs";
import { join } from "node:path";
import { parseField, parseBodyDesc } from "../src/policy/cartographer/frontmatter";
import { parseEntry, parseEnrichment } from "../src/policy/cartographer/entry";
import { firstHeading, firstComment, descFromText } from "../src/policy/cartographer/describe";
import { generateProjectMap, isProject } from "../src/runtime/lifecycle/cartographer/project-map";
import { mergeLines } from "../src/runtime/lifecycle/cartographer/merge";
import { trackEnrichment } from "../src/runtime/lifecycle/cartographer/track-enrichment";

const root = (): string => mkdtempSync(join(tmpdir(), "fh-carto-"));

test("parseField / parseBodyDesc", () => {
  const md = "---\nname: x\ndescription: My desc\n---\nBody line\nmore";
  expect(parseField(md, "description")).toBe("My desc");
  expect(parseField(md, "missing")).toBe("");
  expect(parseField("---\ndescription: |\n---\nbody", "description")).toBe("");
  expect(parseBodyDesc(md)).toBe("Body line");
  expect(parseBodyDesc("no frontmatter")).toBe("");
});

test("parseEntry / parseEnrichment", () => {
  const e = parseEntry("├── [foo](./foo) — the foo");
  expect(e).toEqual({ prefix: "├── ", name: "foo", path: "./foo", desc: "the foo" });
  expect(parseEntry("plain text")).toBeNull();
  expect(parseEnrichment("├── [foo](./foo) — the foo")).toEqual(["./foo", "the foo"]);
  expect(parseEnrichment("├── [foo](./foo) — ")).toBeNull();
});

test("firstHeading / firstComment / descFromText", () => {
  expect(firstHeading("# Title\nbody")).toBe("Title");
  expect(firstComment("// my module\ncode")).toBe("my module");
  expect(firstComment("#!/usr/bin/env\n# real")).toBe("real");
  expect(firstComment('"""docstring"""')).toBe("docstring");
  expect(descFromText(".md", "# H", "front")).toBe("front");
  expect(descFromText(".md", "# H", "")).toBe("H");
  expect(descFromText(".ts", "// c", "")).toBe("c");
  expect(descFromText(".json", "x", "")).toBe("");
});

test("generateProjectMap: writes project tree with file desc", () => {
  const dir = root();
  writeFileSync(join(dir, "package.json"), "{}");
  mkdirSync(join(dir, "src"));
  writeFileSync(join(dir, "src", "a.ts"), "// my module\nexport const x = 1;");
  generateProjectMap(dir);
  const idx = join(dir, ".cartographer", "project", "index.md");
  expect(existsSync(idx)).toBe(true);
  const text = readFileSync(idx, "utf-8");
  expect(text).toContain("[src/]");
  const sub = readFileSync(join(dir, ".cartographer", "project", "src", "index.md"), "utf-8");
  expect(sub).toContain("[a.ts]");
  expect(sub).toContain("my module");
});

test("isProject: false for bare dir and homedir", () => {
  expect(isProject(root())).toBe(false);
  expect(isProject(homedir())).toBe(false);
  const p = root();
  writeFileSync(join(p, "go.mod"), "module x");
  expect(isProject(p)).toBe(true);
});

test("mergeLines: preserves enriched sidecar", () => {
  const dir = root();
  const idx = join(dir, "index.md");
  writeFileSync(join(dir, ".enriched.json"), JSON.stringify({ entries: { "./a": "rich desc" } }));
  const merged = mergeLines(["├── [a](./a) — auto"], idx);
  expect(merged[0]).toBe("├── [a](./a) — rich desc");
});

test("trackEnrichment: writes .enriched.json entry", () => {
  const dir = join(root(), ".cartographer", "x");
  mkdirSync(dir, { recursive: true });
  const idx = join(dir, "index.md");
  writeFileSync(idx, "├── [a](./a) — manual desc\n");
  trackEnrichment(idx);
  const sidecar = JSON.parse(readFileSync(join(dir, ".enriched.json"), "utf-8")) as { entries: Record<string, string> };
  expect(sidecar.entries["./a"]).toBe("manual desc");
});
