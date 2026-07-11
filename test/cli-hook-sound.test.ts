import { describe, test, expect } from "bun:test";
import { soundArg, maybePlaySound } from "../src/cli/hook-sound";

// Mute real sound spawn for this test file — notify() is fail-open and
// respects FUSE_HARNESS_SOUND=0, so maybePlaySound() never spawns a player.
process.env.FUSE_HARNESS_SOUND = "0";

describe("soundArg", () => {
  test("--sound permission -> permission", () => {
    expect(soundArg(["--sound", "permission"])).toBe("permission");
  });

  test("--sound=human -> human", () => {
    expect(soundArg(["--sound=human"])).toBe("human");
  });

  test("--sound stop -> stop", () => {
    expect(soundArg(["--sound", "stop"])).toBe("stop");
  });

  test("absent flag -> null", () => {
    expect(soundArg(["hook", "claude-code", "core"])).toBeNull();
  });

  test("--sound bogus -> null (fail-closed on unknown value)", () => {
    expect(soundArg(["--sound", "bogus"])).toBeNull();
  });
});

describe("maybePlaySound", () => {
  test("returns true for a valid kind", () => {
    expect(maybePlaySound(["--sound", "human"])).toBe(true);
  });

  test("returns false when absent", () => {
    expect(maybePlaySound(["hook", "claude-code", "core"])).toBe(false);
  });

  test("returns false for an invalid kind", () => {
    expect(maybePlaySound(["--sound", "bogus"])).toBe(false);
  });
});

describe("soundArg fail-closed edges", () => {
  test("--sound as trailing arg with no value -> null", () => {
    expect(soundArg(["hook", "claude-code", "--sound"])).toBeNull();
  });

  test("--sound= with an empty value -> null", () => {
    expect(soundArg(["--sound="])).toBeNull();
  });

  test("--sound followed by a flag-like token -> null", () => {
    expect(soundArg(["--sound", "--other"])).toBeNull();
  });
});
