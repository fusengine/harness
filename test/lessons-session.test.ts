import { test, expect } from "bun:test";
import { tmpdir } from "node:os";
import { mkdtempSync, mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { dispatchLessons } from "../src/runtime/lifecycle/lessons/dispatch";
import { lessonsStateFileFor } from "../src/runtime/lifecycle/lessons/state";
import { collectSessionPending, markSessionRoot } from "../src/memory/session-roots";
import { readState } from "../src/memory/state";

/** A tmp HOME (shared registry root) + `count` sibling project dirs each carrying a `package.json` marker. */
function scaffold(count: number): { home: string; roots: string[] } {
  const home = mkdtempSync(join(tmpdir(), "fh-home-"));
  process.env.HOME = home;
  const roots: string[] = [];
  for (let i = 0; i < count; i++) {
    const root = mkdtempSync(join(tmpdir(), `fh-proj${i}-`));
    writeFileSync(join(root, "package.json"), "{}");
    roots.push(root);
  }
  return { home, roots };
}

/** Fixture root known to exist by construction; fails fast (not a silent cast) if absent. */
function nth(roots: string[], i: number): string {
  const r = roots[i];
  if (r === undefined) throw new Error(`fixture root ${i} missing`);
  return r;
}

/** Emit a code-edit PostToolUse for `root` under session `sid` (or the legacy global path when null). */
function edit(root: string, sid: string | null, now: number): void {
  const payload: Record<string, unknown> = { tool_input: { file_path: join(root, "src", "f.ts") } };
  if (sid) payload.session_id = sid;
  dispatchLessons("PostToolUse", payload, root, now);
}

// `now` exceeds the 5-min (300000 ms) throttle so reminders fire from a 0 baseline.
const T1 = 10_000_000;
const T2 = 20_000_000;

test("Stop is session-scoped: each session's Stop lists ONLY its own edited root", () => {
  const { roots } = scaffold(2);
  const a = nth(roots, 0), b = nth(roots, 1);
  edit(a, "s1", T1);
  edit(b, "s2", T1);

  const stopB = dispatchLessons("Stop", { session_id: "s2" }, b, T2);
  expect(stopB).toContain(b);
  expect(stopB).not.toContain(a);

  const stopA = dispatchLessons("Stop", { session_id: "s1" }, a, T2);
  expect(stopA).toContain(a);
  expect(stopA).not.toContain(b);
});

test("Stop of one session does NOT throttle/consume another session's reminder", () => {
  const { roots } = scaffold(2);
  const a = nth(roots, 0), b = nth(roots, 1);
  edit(a, "s1", T1);
  edit(b, "s2", T1);

  expect(dispatchLessons("Stop", { session_id: "s2" }, b, T2)).toContain(b);
  // s2 re-Stop within the window is now throttled (its own remindedAt bumped)...
  expect(dispatchLessons("Stop", { session_id: "s2" }, b, T2 + 1)).toBe("");
  // ...but s1's pending reminder for root A was never touched by s2's Stop.
  expect(dispatchLessons("Stop", { session_id: "s1" }, a, T2)).toContain(a);
});

test("session-roots: legacy array (old format) tolerated, never crashes", () => {
  const { home } = scaffold(0);
  const reg = join(home, ".fuse-harness", "cache", "lessons", "session-roots.json");
  mkdirSync(join(home, ".fuse-harness", "cache", "lessons"), { recursive: true });
  writeFileSync(reg, JSON.stringify(["/legacy/root"])); // pre-session-scope shape
  expect(collectSessionPending("s1", T2, 0)).toEqual([]);
  // A malformed inner entry (roots not an object) must not crash the hook.
  writeFileSync(reg, JSON.stringify({ bad: { roots: null } }));
  expect(collectSessionPending("bad", T2, 0)).toEqual([]);
  // A subsequent write upgrades the shape in place without throwing.
  markSessionRoot("s1", "/new/root", "editedAt", T1);
  expect(collectSessionPending("s1", T2, 0)).toEqual(["/new/root"]);
});

test("Stop without session_id falls back to the legacy global registry", () => {
  const { roots } = scaffold(1);
  const a = nth(roots, 0);
  edit(a, null, T1); // legacy mark: project state.json + global flat registry
  expect(readState(lessonsStateFileFor(a)).lastCodeEditAt).toBe(T1);
  expect(dispatchLessons("Stop", {}, a, T2)).toContain(a);
});
