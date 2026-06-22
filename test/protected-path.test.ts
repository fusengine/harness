import { test, expect } from "bun:test";
import { protectedPathGuard } from "../src/policy/guards/protected-path";

test("blocks Write/Edit inside protected dirs", () => {
  expect(protectedPathGuard({ tool: "Write", filePath: "/x/.claude/plugins/marketplaces/foo/bar.ts" })?.kind).toBe("block");
  expect(protectedPathGuard({ tool: "Edit", filePath: "/x/project/.git/config" })?.kind).toBe("block");
});

test("null for normal source + non-mutating tools", () => {
  expect(protectedPathGuard({ tool: "Write", filePath: "/x/project/src/index.ts" })).toBeNull();
  expect(protectedPathGuard({ tool: "Read", filePath: "/x/.claude/plugins/cache/foo.ts" })).toBeNull();
});
