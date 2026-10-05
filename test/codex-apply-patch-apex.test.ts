/**
 * Codex `apply_patch` now runs the file-keyed skill/APEX gates (runtime/apply-patch-apex.ts).
 *  - Differential: for the same file, content and session state, the Codex patch verdict
 *    (applyPatchGate → gatePatchFiles, as wired in handle-pre.ts) equals the Write (add) /
 *    Edit (update) verdict of {@link gate}, framework detected as handle.ts does.
 *  - Identity guard: a non-codex `apply_patch` keeps its former (unpoliced) outcome.
 * Sibling fan-out / trivial-budget accounting lives in codex-apply-patch-fanout.test.ts.
 */
import { expect, test } from "bun:test";
import { join } from "node:path";
import { gate } from "../src/runtime/gate";
import { gatePatchFiles } from "../src/runtime/apply-patch-apex";
import { applyPatchGate } from "../src/runtime/apply-patch-gate";
import { detectFramework } from "../src/policy/detect-framework";
import { base, body, freshDir, hookCli, rng, scenario, setup, verdict } from "./codex-apply-patch-helpers";
import type { GateInput } from "../src/runtime/gate-input";
import type { NormalizedFile } from "../src/runtime/normalize";

test("differential: codex apply_patch verdict === Write/Edit verdict (2000 random scenarios)", async () => {
  const mismatches: string[] = [];
  const seen = new Map<string, number>();
  for (let seed = 1; seed <= 2000; seed++) {
    const s = scenario(rng(seed));
    const content = body(s.lines, `s${seed}`, s.rel);
    const a = await setup(s, "w");
    const single = await gate({ ...base(s, a.cwd, a.trackFile, detectFramework(a.abs, content, a.cwd)), tool: s.op === "add" ? "Write" : "Edit", filePath: a.abs, content });
    const b = await setup(s, "p");
    const files: NormalizedFile[] = [{ filePath: s.rel, content, op: s.op }];
    const patchInput: GateInput = { ...base(s, b.cwd, b.trackFile, detectFramework("", "", b.cwd)), tool: "apply_patch" };
    const patched = applyPatchGate(files.map((f) => ({ ...f, filePath: join(b.cwd, f.filePath) })), b.cwd)
      ?? await gatePatchFiles(patchInput, files, `call-${seed}`);
    if (verdict(single) !== verdict(patched)) mismatches.push(`seed=${seed} ${JSON.stringify(s)} single=${verdict(single)} patch=${verdict(patched)}`);
    seen.set(verdict(single), (seen.get(verdict(single)) ?? 0) + 1);
  }
  expect(mismatches.slice(0, 5)).toEqual([]);
  // Positive witness: the corpus really exercises allows AND the APEX blocks under test.
  expect(seen.get("allow") ?? 0).toBeGreaterThan(50);
  for (const title of ["APEX: explore + research required", "APEX: brainstorm first"]) {
    expect(seen.get(`block|${title}`) ?? 0).toBeGreaterThan(20);
  }
  expect([...seen.keys()].some((k) => k.includes("documentation"))).toBe(true);
  // Framework-specific denies (only reachable with per-file detection) are really exercised.
  expect([...seen.keys()].filter((k) => /swift|react|laravel|php|skill/i.test(k)).length).toBeGreaterThan(0);
}, 120_000);

test("identity guard: only codex apply_patch is APEX-policed; claude-code apply_patch is unchanged", () => {
  const cwd = freshDir("id-");
  const patch = "*** Begin Patch\n*** Add File: src/halo.ts\n+/** Halo. */\n+export function halo(w: number): number {\n+  return w * 0.5;\n+}\n*** End Patch\n";
  const payload = { hook_event_name: "PreToolUse", session_id: "id1", cwd, tool_use_id: "call-id", tool_name: "apply_patch", tool_input: { command: patch } };
  expect(hookCli("codex", payload, cwd)).toContain("APEX: explore + research required");
  const claude = hookCli("claude-code", payload, cwd);
  expect(claude).not.toContain("APEX");
  expect(claude).not.toContain('"deny"');
}, 60_000);
