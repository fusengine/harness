import { test, expect } from "bun:test";
import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { solidFileSizeGate } from "../src/runtime/solid-file-size-gate";
import { resolveMaxLines } from "../src/config/limits";

// Tracks the gate's own resolver (`FUSE_SOLID_MAX_LINES` ?? default) so these
// fixtures stay oversized regardless of the ambient env override.
const L = resolveMaxLines();
const big = "const x = 1;\n".repeat(L + 50);
const small = "const x = 1;\n";

test("solid file-size: oversized Write blocks; compliant Write, non-code and other tools pass", () => {
  expect(solidFileSizeGate("Write", "/p/a.ts", big)?.title).toBe("SOLID file-size limit");
  expect(solidFileSizeGate("Write", "/p/a.ts", small)).toBeNull();
  expect(solidFileSizeGate("Write", "/p/a.md", big)).toBeNull();
  expect(solidFileSizeGate("Bash", "/p/a.ts", big)).toBeNull();
});

test("solid file-size: Explore/Plan subagents are exempt (parity evaluate.ts)", () => {
  expect(solidFileSizeGate("Write", "/p/a.ts", big, undefined, false, "Explore")).toBeNull();
  expect(solidFileSizeGate("Write", "/p/a.ts", big, undefined, false, "Plan")).toBeNull();
});

test("solid file-size: Edit that grows a file past the ceiling blocks", () => {
  const dir = mkdtempSync(join(tmpdir(), "solid-gate-"));
  const file = join(dir, "grow.ts");
  writeFileSync(file, small.repeat(L - 10));
  const prompt = solidFileSizeGate("Edit", file, "const y = 2;\n".repeat(20), small.trim(), false);
  expect(prompt?.kind).toBe("block");
});

test("solid file-size: Edit that strictly shrinks an oversized file passes (parity evaluate.ts)", () => {
  const dir = mkdtempSync(join(tmpdir(), "solid-gate-"));
  const file = join(dir, "shrink.ts");
  writeFileSync(file, big);
  expect(solidFileSizeGate("Edit", file, small, "const x = 1;\nconst x = 1;\n", false)).toBeNull();
});

test("solid file-size: Write that shrinks an oversized file to compliant passes", () => {
  const dir = mkdtempSync(join(tmpdir(), "solid-gate-"));
  const file = join(dir, "rewrite.ts");
  writeFileSync(file, big);
  expect(solidFileSizeGate("Write", file, small)).toBeNull();
});
