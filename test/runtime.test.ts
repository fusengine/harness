import { test, expect } from "bun:test";
import { tmpdir } from "node:os";
import { mkdtempSync } from "node:fs";
import { join } from "node:path";
import { trackFile } from "../src/runtime/paths";
import { recordActivity } from "../src/runtime/record";
import { gate, type GateInput } from "../src/runtime/gate";
import { loadTrack, saveTrack } from "../src/tracking/store";
import { recordBrainstormRequired } from "../src/tracking/session-state";

const fresh = (): string => join(mkdtempSync(join(tmpdir(), "fh-rt-")), "t.json");

test("trackFile: sanitizes the session id", () => {
  expect(trackFile("a/b 1", "/base")).toBe("/base/track-a_b_1.json");
});

test("recordActivity: agent + doc persist via the store", async () => {
  const f = fresh();
  await recordActivity(f, { kind: "agent", name: "explore-codebase", ts: 1000 });
  await recordActivity(f, { kind: "doc", framework: "react", sessionId: "s1", source: "context7" });
  const t = await loadTrack(f);
  expect(t.agents[0]?.name).toBe("explore-codebase");
  expect(t.authorizations.react?.sources).toContain("context7");
});

test("gate: stateless deny short-circuits (oversized file)", async () => {
  const p = await gate({ sessionId: "s1", framework: "generic", tool: "Write", filePath: "a.ts", content: "x\n".repeat(150), now: 5000, trackFile: fresh() });
  expect(p?.title).toContain("file-size");
});

test("gate: APEX chain — freshness blocks, then docs once agents recorded", async () => {
  const f = fresh();
  const input: GateInput = { sessionId: "s1", framework: "react", tool: "Write", filePath: "a.ts", content: "a\nb\nc\nd\ne\nf", now: 5000, trackFile: f, windowMs: 10000 };
  expect((await gate(input))?.title).toContain("explore");
  await recordActivity(f, { kind: "agent", name: "explore-codebase", ts: 4000 });
  await recordActivity(f, { kind: "agent", name: "research-expert", ts: 4500 });
  expect((await gate(input))?.title).toContain("documentation");
});

test("gate: freshness deny message carries the default-window TTL label (2min)", async () => {
  // No windowMs → gate() falls back to DEFAULT_WINDOW_MS (120000ms = 2min).
  const input: GateInput = { sessionId: "s1", framework: "react", tool: "Write", filePath: "a.ts", content: "a\nb\nc\nd\ne\nf", now: 5000, trackFile: fresh() };
  const p = await gate(input);
  expect(p?.title).toContain("explore");
  expect(p?.reason).toContain("(2min TTL)");
  expect(p?.reason).not.toContain("undefined");
});

test("gate: trivial fast-path applies to a small Edit but NEVER to a small Write (parity: only Edit is trivial)", async () => {
  const base = { sessionId: "s1", framework: "react", filePath: "a.ts", content: "a\nb\nc", now: 5000, windowMs: 10000 };
  expect(await gate({ ...base, tool: "Edit", trackFile: fresh() })).toBeNull();
  expect((await gate({ ...base, tool: "Write", trackFile: fresh() }))?.title).toContain("explore");
});

test("gate: Edit is always exempt from brainstormRequired (parity require-apex-agents.py, only Write creates files)", async () => {
  const f = fresh();
  await saveTrack(f, recordBrainstormRequired(await loadTrack(f), true));
  const editInput: GateInput = { sessionId: "s1", framework: "react", tool: "Edit", filePath: "a.ts", content: "a\nb\nc\nd\ne\nf", now: 5000, trackFile: f, windowMs: 10000 };
  expect((await gate(editInput))?.title).not.toBe("APEX: brainstorm first");
  const writeInput: GateInput = { ...editInput, tool: "Write" };
  expect((await gate(writeInput))?.title).toBe("APEX: brainstorm first");
});
