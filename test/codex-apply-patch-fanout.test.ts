/**
 * Codex runs every sibling plugin hook of ONE tool call concurrently with the same
 * `tool_use_id`: the trivial-edit budget must be charged exactly as N separate Claude
 * Edits would be — once per patch entry, never once per sibling, never collapsed.
 */
import { expect, test } from "bun:test";
import { join } from "node:path";
import { gatePatchFiles } from "../src/runtime/apply-patch-apex";
import { apexScopedGate } from "../src/runtime/gate-apex";
import { loadTrack } from "../src/tracking/store";
import { NOW, TRIVIAL, WINDOW, base, body, setup, type Scenario } from "./codex-apply-patch-helpers";
import type { GateInput } from "../src/runtime/gate-input";
import type { NormalizedFile } from "../src/runtime/normalize";

const patchInput = (s: Scenario, cwd: string, trackFile: string): GateInput => ({ ...base(s, cwd, trackFile, "generic"), tool: "apply_patch" });

test("12 sibling hooks of ONE apply_patch charge the trivial budget once; a new call charges again", async () => {
  const { cwd, trackFile } = await setup(TRIVIAL, "fan");
  const files: NormalizedFile[] = [{ filePath: TRIVIAL.rel, content: body(2, "f"), op: "update" }];
  const input = patchInput(TRIVIAL, cwd, trackFile);
  for (let i = 0; i < 12; i++) expect(await gatePatchFiles({ ...input, now: NOW + i }, files, "call-A")).toBeNull();
  expect((await loadTrack(trackFile)).trivialEdits?.length).toBe(1);
  expect(await gatePatchFiles({ ...input, now: NOW + 50 }, files, "call-B")).toBeNull();
  expect((await loadTrack(trackFile)).trivialEdits?.length).toBe(2);
});

test("at the last trivial slot (3 prior, stale agents) the charging sibling's write never flips a later sibling to a deny", async () => {
  const s: Scenario = { ...TRIVIAL, priorTrivial: 3 };
  const { cwd, trackFile } = await setup(s, "last");
  const files: NormalizedFile[] = [{ filePath: s.rel, content: body(2, "l"), op: "update" }];
  const input = patchInput(s, cwd, trackFile);
  // Claude parity: the same 4th trivial Edit is allowed.
  for (let i = 0; i < 12; i++) expect(await gatePatchFiles({ ...input, now: NOW + i }, files, "call-L")).toBeNull();
  expect((await loadTrack(trackFile)).trivialEdits?.length).toBe(4);
  // A NEW call is the 5th trivial edit → the full APEX chain applies (stale agents → deny), as for Claude.
  expect((await gatePatchFiles({ ...input, now: NOW + 99 }, files, "call-M"))?.title).toBe("APEX: explore + research required");
});

test("K Update blocks on ONE file in one patch are K edits: blocks 1-4 charged, block 5 hits APEX; every sibling agrees", async () => {
  const { cwd, trackFile } = await setup(TRIVIAL, "multi");
  const files: NormalizedFile[] = Array.from({ length: 10 }, (_, k) => ({ filePath: TRIVIAL.rel, content: body(2, `k${k}`), op: "update" as const }));
  const input = patchInput(TRIVIAL, cwd, trackFile);
  // Claude parity: 10 separate trivial Edits → 4 allowed, the 5th denied by APEX (stale agents).
  for (let sibling = 0; sibling < 12; sibling++) {
    expect((await gatePatchFiles({ ...input, now: NOW + sibling }, files, "call-K"))?.title).toBe("APEX: explore + research required");
  }
  expect((await loadTrack(trackFile)).trivialEdits?.length).toBe(4);
});

test("two siblings with skewed clocks charging two different entries never collapse into one charge", async () => {
  const { cwd, trackFile } = await setup(TRIVIAL, "skew");
  const abs = join(cwd, TRIVIAL.rel);
  const one = (slot: number, now: number): GateInput => ({
    ...base(TRIVIAL, cwd, trackFile, "generic"), tool: "Edit", filePath: abs, content: body(2, `w${slot}`),
    now, trivialClaimKey: `call-W:${slot}:${abs}`, trivialSlot: slot,
  });
  // Sibling A charges entry 0 at T+1; sibling B charges entry 1 at T (its clock is 1 ms behind).
  expect(await apexScopedGate(one(0, NOW + 1), await loadTrack(trackFile), WINDOW)).toBeNull();
  expect(await apexScopedGate(one(1, NOW), await loadTrack(trackFile), WINDOW)).toBeNull();
  expect((await loadTrack(trackFile)).trivialEdits?.length).toBe(2);
});

test("without tool_use_id, K blocks on one file still cost K charges (never collapsed)", async () => {
  const { cwd, trackFile } = await setup(TRIVIAL, "nokeyk");
  const files: NormalizedFile[] = Array.from({ length: 10 }, (_, k) => ({ filePath: TRIVIAL.rel, content: body(2, `q${k}`), op: "update" as const }));
  expect((await gatePatchFiles(patchInput(TRIVIAL, cwd, trackFile), files, undefined))?.title).toBe("APEX: explore + research required");
  expect((await loadTrack(trackFile)).trivialEdits?.length).toBe(4);
});

test("without tool_use_id the former per-call charging is kept (no key → no dedup)", async () => {
  const { cwd, trackFile } = await setup(TRIVIAL, "nokey");
  const files: NormalizedFile[] = [{ filePath: TRIVIAL.rel, content: body(2, "n"), op: "update" }];
  for (let i = 0; i < 3; i++) await gatePatchFiles({ ...patchInput(TRIVIAL, cwd, trackFile), now: NOW + i }, files, undefined);
  expect((await loadTrack(trackFile)).trivialEdits?.length).toBe(3);
});
