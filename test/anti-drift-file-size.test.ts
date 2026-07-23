import { test, expect } from "bun:test";
import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { evaluate } from "../src/policy/evaluate";
import { solidFileSizeGate } from "../src/runtime/solid-file-size-gate";
import { existingLineCounts } from "../src/runtime/gate-helpers";
import { resolveMaxLines } from "../src/config/limits";

/**
 * ANTI-DRIFT lock between the core file-size gate (policy/evaluate.ts — frozen,
 * do not modify) and its solid-scope twin (runtime/solid-file-size-gate.ts).
 * Every case asserts the equivalence UNCONDITIONALLY in both directions:
 * core blocks ⟺ solid blocks, with the identical message. If either
 * implementation drifts, this test fails — no existence guard, ever.
 */
const L = resolveMaxLines();
const big = "const x = 1;\n".repeat(L + 50);
const small = "const x = 1;\n";

/** Core verdict for the file-size gate only (mirrors gate.ts ctx building). */
function coreVerdict(tool: string, filePath: string, content: string, oldString?: string, agentType?: string): string | null {
  const { raw: existingLines, content: existingContent } = existingLineCounts(filePath);
  const r = evaluate({ tool, filePath, content, existingLines, existingContent, oldString, agentType });
  return r.prompt?.title === "SOLID file-size limit" ? (r.prompt.reason ?? "") : null;
}

/** Solid-scope verdict (same inputs as the production call site). */
function solidVerdict(tool: string, filePath: string, content: string, oldString?: string, agentType?: string): string | null {
  const p = solidFileSizeGate(tool, filePath, content, oldString, false, agentType);
  return p?.title === "SOLID file-size limit" ? p.reason : null;
}

/** Both directions, unconditionally: identical deny or identical allow. */
function assertParity(tool: string, filePath: string, content: string, oldString?: string, agentType?: string): void {
  const core = coreVerdict(tool, filePath, content, oldString, agentType);
  const solid = solidVerdict(tool, filePath, content, oldString, agentType);
  expect(solid).toBe(core);
  expect(core).toBe(solid);
}

test("anti-drift: Write new file — oversized, compliant, non-code, Explore/Plan exempt", () => {
  assertParity("Write", "/p/new-big.ts", big);
  assertParity("Write", "/p/new-small.ts", small);
  assertParity("Write", "/p/doc.md", big);
  assertParity("Write", "/p/new-big.ts", big, undefined, "Explore");
  assertParity("Write", "/p/new-big.ts", big, undefined, "Plan");
});

test("anti-drift: Write over an existing oversized file — shrink passes, stay-big blocks", () => {
  const dir = mkdtempSync(join(tmpdir(), "fh-drift-"));
  const file = join(dir, "existing.ts");
  writeFileSync(file, big);
  assertParity("Write", file, small);
  assertParity("Write", file, big);
});

test("anti-drift: Edit — grow past the ceiling blocks, shrink oversized passes", () => {
  const dir = mkdtempSync(join(tmpdir(), "fh-drift-"));
  const grow = join(dir, "grow.ts");
  writeFileSync(grow, small.repeat(L - 10));
  assertParity("Edit", grow, "const y = 2;\n".repeat(20), small.trim());
  const shrink = join(dir, "shrink.ts");
  writeFileSync(shrink, big);
  assertParity("Edit", shrink, small, "const x = 1;\nconst x = 1;\n");
});

test("anti-drift: empty path agrees on allow; Bash never carries content in production", () => {
  assertParity("Write", "", big);
  // By design the solid gate only judges Write/Edit; core only sees `content`
  // on Write/Edit too (Bash events carry `command`, never `content`).
  assertParity("Bash", "/p/a.ts", undefined as unknown as string);
});
