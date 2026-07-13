import { test, expect } from "bun:test";
import { evaluate } from "../src/policy/evaluate";
import { resolveMaxLines } from "../src/config/limits";

// Tracks the gate's own resolver (`FUSE_SOLID_MAX_LINES` ?? default) so these
// fixtures stay oversized regardless of the ambient env override.
const L = resolveMaxLines();
const big = "x\n".repeat(L + 50);

test("file-size: Write judges new content; Explore/Plan exempt", () => {
  expect(evaluate({ tool: "Write", filePath: "a.ts", content: big }).prompt?.kind).toBe("block");
  expect(evaluate({ tool: "Write", filePath: "a.ts", content: big, agentType: "Explore" }).decision).toBe("allow");
  expect(evaluate({ tool: "Write", filePath: "a.ts", content: big, agentType: "Plan" }).decision).toBe("allow");
});

test("file-size: Edit judges the on-disk file; Write can shrink an oversized file", () => {
  expect(evaluate({ tool: "Edit", filePath: "a.ts", content: "x", existingLines: L + 50 }).prompt?.kind).toBe("block");
  expect(evaluate({ tool: "Write", filePath: "a.ts", content: "x", existingLines: L + 50 }).decision).toBe("allow");
});
