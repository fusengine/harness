import { test, expect } from "bun:test";
import { evaluate } from "../src/policy/evaluate";

const big = "x\n".repeat(150);

test("file-size: Write judges new content; Explore/Plan exempt", () => {
  expect(evaluate({ tool: "Write", filePath: "a.ts", content: big }).prompt?.kind).toBe("block");
  expect(evaluate({ tool: "Write", filePath: "a.ts", content: big, agentType: "Explore" }).decision).toBe("allow");
  expect(evaluate({ tool: "Write", filePath: "a.ts", content: big, agentType: "Plan" }).decision).toBe("allow");
});

test("file-size: Edit judges the on-disk file; Write can shrink an oversized file", () => {
  expect(evaluate({ tool: "Edit", filePath: "a.ts", content: "x", existingLines: 150 }).prompt?.kind).toBe("block");
  expect(evaluate({ tool: "Write", filePath: "a.ts", content: "x", existingLines: 150 }).decision).toBe("allow");
});
