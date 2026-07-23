import { test, expect } from "bun:test";
import { mkdtempSync, mkdirSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { solidScopeOutcome } from "../src/runtime/solid-pre";
import { resolveMaxLines } from "../src/config/limits";
import { evaluate } from "../src/policy/evaluate";
import type { NormalizedEvent } from "../src/runtime/normalize";

// Tracks the gate's own resolver (`FUSE_SOLID_MAX_LINES` ?? default) so the
// fixture stays oversized regardless of the ambient env override.
const L = resolveMaxLines();
const big = "const x = 1;\n".repeat(L + 50);

/** Minimal PreToolUse Write event over a (non-existent) code path. */
function evt(content: string): NormalizedEvent {
  return { phase: "pre", tool: "Write", input: {}, sessionId: "sp1", filePath: "/p/big.ts", content };
}

/** Isolated env: empty HOME (no plugins) unless `withCore` — then core-guards is installed AND active (marketplace copy + settings with no disabling entry). */
function env(withCore: boolean): Record<string, string> {
  const home = mkdtempSync(join(tmpdir(), "solid-pre-home-"));
  if (withCore) {
    mkdirSync(join(home, ".claude", "plugins", "marketplaces", "mkt", "plugins", "core-guards"), { recursive: true });
    writeFileSync(join(home, ".claude", "settings.json"), JSON.stringify({ enabledPlugins: {} }));
  }
  return { HOME: home };
}

test("solid scope outcome: kimi gets a native hookSpecificOutput deny (no core-guards installed)", () => {
  const dir = mkdtempSync(join(tmpdir(), "solid-pre-"));
  const out = solidScopeOutcome("kimi", evt(big), join(dir, "track.json"), 1000, env(false));
  expect(out.exit).toBe(0);
  const parsed = JSON.parse(out.stdout);
  expect(parsed.hookSpecificOutput.permissionDecision).toBe("deny");
  expect(parsed.hookSpecificOutput.permissionDecisionReason).toContain("SOLID file-size limit");
});

test("solid scope outcome: claude-code gets its deny envelope (no core-guards installed)", () => {
  const dir = mkdtempSync(join(tmpdir(), "solid-pre-"));
  const out = solidScopeOutcome("claude-code", evt(big), join(dir, "track.json"), 1000, env(false));
  const parsed = JSON.parse(out.stdout);
  expect(parsed.hookSpecificOutput.hookEventName).toBe("PreToolUse");
  expect(parsed.hookSpecificOutput.permissionDecision).toBe("deny");
});

test("dedup: core-guards installed -> solid abstains, core denies — exactly ONE deny", () => {
  const dir = mkdtempSync(join(tmpdir(), "solid-pre-"));
  const e = env(true);
  const solid = solidScopeOutcome("claude-code", evt(big), join(dir, "track.json"), 1000, e);
  expect(solid.stdout).toBe(""); // abstention: no second deny from the solid scope
  const core = evaluate({ tool: "Write", filePath: "/p/big.ts", content: big });
  expect(core.prompt?.title).toBe("SOLID file-size limit"); // the single, core-owned deny
});

test("dedup: core-guards installed but DISABLED -> solid fires (never zero deny)", () => {
  const dir = mkdtempSync(join(tmpdir(), "solid-pre-"));
  const home = mkdtempSync(join(tmpdir(), "solid-pre-home-"));
  mkdirSync(join(home, ".claude", "plugins", "marketplaces", "mkt", "plugins", "core-guards"), { recursive: true });
  writeFileSync(join(home, ".claude", "settings.json"), JSON.stringify({ enabledPlugins: { "core-guards@mkt": false } }));
  const out = solidScopeOutcome("claude-code", evt(big), join(dir, "track.json"), 1000, { HOME: home });
  expect(JSON.parse(out.stdout).hookSpecificOutput.permissionDecision).toBe("deny");
});

test("solid scope outcome: compliant Write allows with empty stdout on both harnesses", () => {
  const dir = mkdtempSync(join(tmpdir(), "solid-pre-"));
  expect(solidScopeOutcome("kimi", evt("const a = 1;\n"), join(dir, "track.json"), 1000, env(false)).stdout).toBe("");
  expect(solidScopeOutcome("claude-code", evt("const a = 1;\n"), join(dir, "track.json"), 1000, env(false)).stdout).toBe("");
});
