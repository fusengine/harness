import { test, expect } from "bun:test";
import { compactJson } from "../src/util/compact-json";

test("compactJson: primitives", () => {
  expect(compactJson(42)).toBe("42\n");
  expect(compactJson("x")).toBe('"x"\n');
  expect(compactJson(null)).toBe("null\n");
});

test("compactJson: empty array", () => {
  expect(compactJson([])).toBe("[]\n");
});

test("compactJson: object top-level indented", () => {
  expect(compactJson({ a: 1, b: "y" })).toBe('{\n  "a": 1,\n  "b": "y"\n}\n');
});

test("compactJson: nested array expanded", () => {
  expect(compactJson({ items: [1, 2] })).toBe('{\n  "items": [\n    1,\n    2\n  ]\n}\n');
});
