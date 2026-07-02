import { test, expect } from "bun:test";
import { tmpdir } from "node:os";
import { mkdtempSync } from "node:fs";
import { join } from "node:path";
import { isTrivialEdit, protectedPathGate, SKIP_DIRS, TRIVIAL_MAX_LINES } from "../src/policy/trivial-edits";
import { emptyTrack } from "../src/tracking/session-state";
import { loadTrack } from "../src/tracking/store";
import { apexScopedGate } from "../src/runtime/gate-apex";
import { gate } from "../src/runtime/gate";
import type { GateInput } from "../src/runtime/gate-input";

const NOW = 1_000_000_000_000;
const WINDOW = 120_000;
const fresh = (): string => join(mkdtempSync(join(tmpdir(), "fh-triv-")), "t.json");

/** Byte-for-byte Python wording (enforce-apex-phases.ts:50). */
const PY_MSG = "[APEX Hook Guard] Write blocked — this path is managed automatically by APEX hooks. Manual edits are forbidden and would corrupt tracked state.";

function edit(file: string, n: number, extra: Partial<GateInput> = {}): GateInput {
  return { sessionId: "s1", framework: "react", tool: "Edit", filePath: "/proj/src/a.ts", content: "x = 1;\n", now: NOW + n, windowMs: WINDOW, trackFile: file, ...extra };
}

test("isTrivialEdit: only a small, non-replace-all Edit qualifies", () => {
  expect(isTrivialEdit("Edit", "a\nb\nc\nd", false)).toBe(true); // 4 lines < TRIVIAL_MAX_LINES
  expect(isTrivialEdit("Edit", "a\nb\nc\nd\ne", false)).toBe(false); // 5 lines -> full APEX
  expect(isTrivialEdit("Write", "a", false)).toBe(false); // Write never trivial
  expect(isTrivialEdit("Edit", "a", true)).toBe(false); // replace_all NEVER trivial
  expect(isTrivialEdit("Edit", undefined, false)).toBe(false); // no content -> fail closed
  expect(TRIVIAL_MAX_LINES).toBe(5);
});

test("gate: 4 trivial Edits pass without APEX; the 5th requires the full chain", async () => {
  const file = fresh();
  for (let i = 0; i < 4; i++) {
    expect(await apexScopedGate(edit(file, i), await loadTrack(file), WINDOW)).toBeNull();
  }
  const p = await apexScopedGate(edit(file, 4), await loadTrack(file), WINDOW);
  expect(p?.kind).toBe("block"); // budget exhausted -> full APEX (freshness gate first)
});

test("gate: replace_all is NEVER trivial — the full APEX chain applies immediately", async () => {
  const p = await apexScopedGate(edit(fresh(), 0, { isReplaceAll: true }), emptyTrack(), WINDOW);
  expect(p?.kind).toBe("block");
});

test("protectedPathGate: exact Python wording; all four protected roots; Write/Edit only", () => {
  const p = protectedPathGate("Write", "/u/.claude/logs/00-apex/2026-07-02-state.json");
  expect(p?.kind).toBe("block");
  expect(p?.reason).toBe(PY_MSG);
  for (const path of ["plugins/marketplaces/m/a.ts", "plugins/cache/p/x.json", "logs/00-apex/s.json", "fusengine-cache/skill-tracking/t.json"]) {
    expect(protectedPathGate("Edit", `/u/.claude/${path}`)?.kind).toBe("block");
  }
  expect(protectedPathGate("Read", "/u/.claude/logs/00-apex/x.json")).toBeNull();
  expect(protectedPathGate("Write", "/proj/src/a.ts")).toBeNull();
});

test("gate: protected path denies BEFORE the trivial fast path (Python order :49-54 before :58)", async () => {
  const file = fresh();
  const p = await apexScopedGate(edit(file, 0, { filePath: "/u/.claude/plugins/marketplaces/m/a.ts" }), emptyTrack(), WINDOW);
  expect(p?.reason).toBe(PY_MSG);
  expect((await loadTrack(file)).trivialEdits).toEqual([]); // never counted as a trivial edit
});

test("gate() FULL chain: a non-code-extension Write under a protected path is blocked (gate.ts early guard)", async () => {
  // The exact hole fixed by the early protectedPathGate call: .json is not a code
  // extension, so isApexScoped/apexScopedGate never ran — only the early guard
  // in gate() (parity enforce-apex-phases.ts:48-52, PROTECTED_PATHS before CODE_EXT).
  const p = await gate(edit(fresh(), 0, { tool: "Write", filePath: "/u/.claude/logs/00-apex/state.json", content: "{}" }));
  expect(p?.kind).toBe("block");
  expect(p?.reason).toBe(PY_MSG);
});

test("gate: dependency/build dirs skip the APEX gates entirely (SKIP_DIRS parity)", async () => {
  expect(SKIP_DIRS.test("/proj/node_modules/pkg/i.ts")).toBe(true);
  const p = await apexScopedGate(edit(fresh(), 0, { tool: "Write", filePath: "/proj/node_modules/pkg/i.ts", content: "x\n".repeat(20) }), emptyTrack(), WINDOW);
  expect(p).toBeNull();
});
