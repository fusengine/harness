import { test, expect } from "bun:test";
import { frameworkFromQuery, docQueryOf, docFramework } from "../src/freshness/query-framework";

test("frameworkFromQuery: Python-verbatim keyword map, first match wins", () => {
  expect(frameworkFromQuery("next app router streaming")).toBe("nextjs");
  expect(frameworkFromQuery("tailwind v4 container queries")).toBe("tailwind");
  expect(frameworkFromQuery("golang goroutine leak")).toBe("go");
  expect(frameworkFromQuery("Laravel eloquent attributes PHP")).toBe("laravel");
  expect(frameworkFromQuery("SwiftUI observable macro")).toBe("swift");
  // Parity track_doc_helpers.detect_framework: no keyword -> null (Python returned
  // "generic"; the TS fallback is supplied by the caller via docFramework).
  expect(frameworkFromQuery("hooks useState")).toBeNull();
});

test("frameworkFromQuery: collision + case-sensitivity quirks pinned (silent-regression guards)", () => {
  // `cargo` must slide past `\b(go|Go|golang)\b` (no word boundary inside "cargo")
  // and land on the rust rule's unbounded `cargo` substring — pins BOTH quirks.
  expect(frameworkFromQuery("cargo build failure")).toBe("rust");
  // `go` embedded in a word never matches (word boundary parity).
  expect(frameworkFromQuery("django models migration")).toBeNull();
  expect(frameworkFromQuery("logo rendering pipeline")).toBeNull();
  // Case-sensitive alternations are deliberate Python parity: "NEXT" misses.
  expect(frameworkFromQuery("NEXT ROUTING")).toBeNull();
  // `javascript` hits the unbounded `java` substring (rule ordered before go).
  expect(frameworkFromQuery("javascript event loop")).toBe("java");
});

test("docQueryOf: extracts the query across MCP tool input shapes", () => {
  expect(docQueryOf({ query: "next caching" })).toContain("next caching");
  expect(docQueryOf({ libraryId: "/vercel/next.js" })).toContain("next.js");
  expect(docQueryOf({ url: "https://tailwindcss.com/docs" })).toContain("tailwindcss");
  expect(docQueryOf(undefined)).toBe("");
});

test("docFramework: query keyword wins over the file-detected fallback, else fallback", () => {
  expect(docFramework({ query: "laravel queues" }, "react")).toBe("laravel");
  expect(docFramework({ query: "hooks useState" }, "react")).toBe("react");
  expect(docFramework(undefined, "generic")).toBe("generic");
});
