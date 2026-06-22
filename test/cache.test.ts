import { test, expect } from "bun:test";
import { compactMarkdown, queryHash, jaccardSimilar } from "../src/cache/compact";
import { extractText } from "../src/cache/mcp-response";
import { summarizeIndex } from "../src/cache/io";

test("compactMarkdown: entities, blank lines, boilerplate", () => {
  expect(compactMarkdown("a &amp; b")).toBe("a & b");
  expect(compactMarkdown("a\n\n\n\n\nb")).toBe("a\n\nb");
  expect(compactMarkdown("Accept cookie banner here\nreal content").toLowerCase()).not.toContain("cookie");
});

test("compactMarkdown: truncates oversized", () => {
  expect(compactMarkdown("x\n".repeat(5000))).toContain("truncated");
});

test("queryHash: 8 chars, stable, distinct", () => {
  const h = queryHash("search", "foo bar");
  expect(h.length).toBe(8);
  expect(h).toBe(queryHash("search", "foo bar"));
  expect(queryHash("a", "x")).not.toBe(queryHash("b", "x"));
});

test("jaccardSimilar", () => {
  expect(jaccardSimilar("the quick brown fox", "the quick brown fox jumps", 0.5)).toBe(true);
  expect(jaccardSimilar("hello world", "completely different terms")).toBe(false);
  expect(jaccardSimilar("", "anything")).toBe(false);
});

test("extractText: string / blocks / fallback", () => {
  expect(extractText("hi")).toBe("hi");
  expect(extractText([{ type: "text", text: "a" }, { type: "image" }, { type: "text", text: "b" }])).toBe("a\n\nb");
  expect(extractText({ x: 1 })).toContain("x");
  expect(extractText(null)).toBe("");
});

test("summarizeIndex", () => {
  const s = summarizeIndex([{ tool: "a", ts: "2026-01-01" }, { tool: "a", ts: "2026-02-01" }, { tool: "b" }]);
  expect(s.total).toBe(3);
  expect(s.byTool).toEqual({ a: 2, b: 1 });
  expect(s.oldestTs).toBe("2026-01-01");
  expect(s.newestTs).toBe("2026-02-01");
});
