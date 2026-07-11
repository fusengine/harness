import { describe, test, expect } from "bun:test";
import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { notify, resolvePlayer, soundEnabled } from "../src/runtime/notifications";
import { resolveSound } from "../src/runtime/notification-sound";

/** A real, existing sound-file path (a tmp file), for the env-override branch. */
function soundFile(): string {
  const f = join(mkdtempSync(join(tmpdir(), "fh-snd-")), "s.mp3");
  writeFileSync(f, "x");
  return f;
}

/** A spawn stub recording the bin it was asked to run; optionally throws (fail-open probe). */
function fakeSpawn(calls: string[], throwIt = false) {
  return ((bin: string) => {
    calls.push(bin);
    if (throwIt) throw new Error("spawn boom");
    return { on() {}, unref() {} };
  }) as unknown as typeof import("node:child_process").spawn;
}

describe("soundEnabled", () => {
  test("ON by default, OFF only for FUSE_HARNESS_SOUND=0", () => {
    expect(soundEnabled({})).toBe(true);
    expect(soundEnabled({ FUSE_HARNESS_SOUND: "1" })).toBe(true);
    expect(soundEnabled({ FUSE_HARNESS_SOUND: "0" })).toBe(false);
  });
});

describe("resolvePlayer", () => {
  test("maps platform to a file-playing command, undefined when unsupported", () => {
    expect(resolvePlayer("darwin", "/s.mp3")).toEqual({ bin: "afplay", args: ["/s.mp3"] });
    expect(resolvePlayer("linux", "/s.mp3")?.bin).toBe("paplay");
    expect(resolvePlayer("plan9", "/s.mp3")).toBeUndefined();
  });
});

describe("resolveSound cascade", () => {
  test("explicit env override wins", () => {
    const f = soundFile();
    expect(resolveSound("stop", { FUSE_HARNESS_SOUND_STOP: f })).toBe(f);
  });
  test("falls back to the packaged asset (walk-up) when no override", () => {
    const r = resolveSound("stop", {});
    expect(typeof r === "string" && r.endsWith("finish.mp3")).toBe(true);
  });
  test("null when override missing, package unresolvable, and no plugin root", () => {
    const r = resolveSound("permission", { FUSE_HARNESS_SOUND_PERMISSION: "/no/such/file.mp3" }, "file:///nowhere/x.mjs");
    expect(r).toBeNull();
  });
});

describe("notify", () => {
  test("plays the resolved sound (fire-and-forget spawn)", () => {
    const calls: string[] = [];
    notify("stop", { platform: "darwin", env: { FUSE_HARNESS_SOUND_STOP: soundFile() }, spawnFn: fakeSpawn(calls) });
    expect(calls).toEqual(["afplay"]);
  });
  test("silent when opted out (FUSE_HARNESS_SOUND=0)", () => {
    const calls: string[] = [];
    notify("stop", { platform: "darwin", env: { FUSE_HARNESS_SOUND: "0", FUSE_HARNESS_SOUND_STOP: soundFile() }, spawnFn: fakeSpawn(calls) });
    expect(calls).toEqual([]);
  });
  test("fail-open: a throwing spawn never propagates", () => {
    const env = { FUSE_HARNESS_SOUND_STOP: soundFile() };
    expect(() => notify("stop", { platform: "darwin", env, spawnFn: fakeSpawn([], true) })).not.toThrow();
  });
});
