import { test, expect } from "bun:test";
import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { isHtmlLike, missingSeoElements } from "../src/policy/seo/validate";
import { seoPostToolUseResponse } from "../src/runtime/lifecycle/seo/post-tool-use";

const COMPLETE = `<!doctype html><html><head>
  <title>Hello</title>
  <meta name="description" content="A page about hello">
  <meta property="og:title" content="Hello">
  <meta property="og:description" content="Hi there">
  <meta property="og:image" content="https://x/og.png">
  <link rel="canonical" href="https://x/">
  <script type="application/ld+json">{"@type":"WebPage"}</script>
</head><body>hi</body></html>`;

test("missingSeoElements: empty doc -> all 7 labels", () => {
  const missing = missingSeoElements("");
  expect(missing).toEqual([
    "<title>",
    "<meta name='description'>",
    "og:title",
    "og:description",
    "og:image",
    "canonical",
    "JSON-LD schema",
  ]);
  expect(missing.length).toBe(7);
});

test("missingSeoElements: complete doc -> []", () => {
  expect(missingSeoElements(COMPLETE)).toEqual([]);
});

test("seoPostToolUseResponse: missing meta -> top-level decision:block (not permissionDecision)", () => {
  const dir = mkdtempSync(join(tmpdir(), "fuse-seo-"));
  writeFileSync(join(dir, ".fuse-seo"), "");
  const file = join(dir, "page.html");
  writeFileSync(file, "<html><head></head><body>hi</body></html>");
  const out = seoPostToolUseResponse({ cwd: dir, tool_input: { file_path: file } });
  expect(out).not.toBeNull();
  const parsed = JSON.parse(out as string) as { decision?: string; reason?: string; hookSpecificOutput?: unknown };
  expect(parsed.decision).toBe("block");
  expect(parsed.reason).toContain("missing SEO elements");
  expect(parsed.hookSpecificOutput).toBeUndefined();
});

test("seoPostToolUseResponse: no .fuse-seo marker -> null (allow)", () => {
  const dir = mkdtempSync(join(tmpdir(), "fuse-seo-"));
  const file = join(dir, "page.html");
  writeFileSync(file, "<html><head></head><body>hi</body></html>");
  expect(seoPostToolUseResponse({ cwd: dir, tool_input: { file_path: file } })).toBeNull();
});

test("isHtmlLike: .tsx true, .md false, .astro true, .ts false", () => {
  expect(isHtmlLike("a/b/page.tsx")).toBe(true);
  expect(isHtmlLike("README.md")).toBe(false);
  expect(isHtmlLike("x.astro")).toBe(true);
  expect(isHtmlLike("logic.ts")).toBe(false);
});
