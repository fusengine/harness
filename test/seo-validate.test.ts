import { test, expect } from "bun:test";
import { isHtmlLike, missingSeoElements } from "../src/policy/seo/validate";

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

test("isHtmlLike: .tsx true, .md false, .astro true, .ts false", () => {
  expect(isHtmlLike("a/b/page.tsx")).toBe(true);
  expect(isHtmlLike("README.md")).toBe(false);
  expect(isHtmlLike("x.astro")).toBe(true);
  expect(isHtmlLike("logic.ts")).toBe(false);
});
