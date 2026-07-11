import { afterEach, describe, expect, test } from "bun:test";
import { existsSync, lstatSync, mkdirSync, mkdtempSync, rmSync, unlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { resyncCodexAgents } from "../src/runtime/lifecycle/codex-resync/resync";

/** Seed a minimal Codex plugin cache: one agent TOML + one command MD under an unversioned plugin root. */
function seedCache(codexHome: string, plugin = "demo"): void {
  const root = join(codexHome, "plugins", "cache", "fusengine-codex", plugin);
  mkdirSync(join(root, "skills"), { recursive: true }); // presence of skills/ marks the unversioned root
  mkdirSync(join(root, "agents"), { recursive: true });
  mkdirSync(join(root, "commands"), { recursive: true });
  writeFileSync(join(root, "agents", "foo.toml"), 'name = "foo"\npath = "./skills/x"\n');
  writeFileSync(join(root, "commands", "bar.md"), "# bar\n");
}

const homes: string[] = [];
/** A throwaway codexHome tmpdir, cleaned up after each test. */
function freshHome(): string {
  const h = mkdtempSync(join(tmpdir(), "codex-resync-"));
  homes.push(h);
  return h;
}
afterEach(() => { for (const h of homes.splice(0)) rmSync(h, { recursive: true, force: true }); });

describe("resyncCodexAgents", () => {
  test("first run materializes agents, symlinks commands, writes fingerprint", () => {
    const home = freshHome();
    seedCache(home);
    resyncCodexAgents(home);
    expect(existsSync(join(home, "agents", "foo.toml"))).toBe(true);
    expect(lstatSync(join(home, "prompts", "bar.md")).isSymbolicLink()).toBe(true);
    expect(existsSync(join(home, "fusengine", "state", "agents-cache-fingerprint.json"))).toBe(true);
  });

  test("repeat run is a no-op when the fingerprint is unchanged", () => {
    const home = freshHome();
    seedCache(home);
    resyncCodexAgents(home);
    unlinkSync(join(home, "agents", "foo.toml")); // drop the materialized output
    resyncCodexAgents(home); // fingerprint still matches → must skip re-materialization
    expect(existsSync(join(home, "agents", "foo.toml"))).toBe(false);
  });

  test("a held lock (O_EXCL wx) blocks the resync", () => {
    const home = freshHome();
    seedCache(home);
    mkdirSync(join(home, "fusengine", "state"), { recursive: true });
    writeFileSync(join(home, "fusengine", "state", "agents-resync.lock"), String(process.pid), { flag: "wx" });
    resyncCodexAgents(home); // needsResync true (never applied) but lock held → skip
    expect(existsSync(join(home, "agents", "foo.toml"))).toBe(false);
  });

  test("no plugin cache present is a silent no-op", () => {
    const home = freshHome();
    expect(() => resyncCodexAgents(home)).not.toThrow();
    expect(existsSync(join(home, "agents"))).toBe(false);
  });
});
