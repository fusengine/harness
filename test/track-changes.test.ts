import { test, expect } from "bun:test";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { trackSessionChanges } from "../src/runtime/lifecycle/track-changes";
import { loadSessionState } from "../src/runtime/home-state";

/** Isolated fake `$HOME` per test — avoids polluting the real session-state dir. */
function fakeHome(): string {
  return mkdtempSync(join(tmpdir(), "fuse-track-changes-"));
}

test("trackSessionChanges: .dart file is now tracked (shared CODE_EXTENSIONS)", () => {
  const home = fakeHome();
  try {
    const out = trackSessionChanges("sess-dart", "lib/main.dart", home, Date.now());
    expect(out).toContain("SNIPER VALIDATION REQUIRED");
    const state = loadSessionState("sess-dart", home);
    const changes = state.changes as { cumulativeCodeFiles: number; modifiedFiles: string[] };
    expect(changes.cumulativeCodeFiles).toBe(1);
    expect(changes.modifiedFiles).toContain("lib/main.dart");
  } finally {
    rmSync(home, { recursive: true, force: true });
  }
});

test("trackSessionChanges: non-code extension is ignored", () => {
  const home = fakeHome();
  try {
    expect(trackSessionChanges("sess-txt", "notes.txt", home, Date.now())).toBe("");
  } finally {
    rmSync(home, { recursive: true, force: true });
  }
});
