import { test, expect } from "bun:test";
import { tmpdir } from "node:os";
import { mkdtempSync, mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { spawnSync } from "node:child_process";
import { sessionStartCore } from "../src/runtime/lifecycle/session-start";
import { attachSystemMessage, contextResponse } from "../src/adapters/claude";
import { devContext } from "../src/runtime/dev-context";

/**
 * Target-aware (Claude/Codex/Kimi) coverage for `sessionStartCore` and
 * `promptSubmitContext` — the root instructions doc + its dynamic
 * "<doc> injected" label now flow through `apexDocName`/`harnessHomeSegment`
 * instead of a hardcoded `.claude/CLAUDE.md` path and label.
 */
const root = (): string => mkdtempSync(join(tmpdir(), "fh-sst-"));

/**
 * Run `promptSubmitContext` in a fresh Bun subprocess with `HOME` fixed at
 * spawn time. A runtime `process.env.HOME = ...` mutation has **no effect**
 * on a later `os.homedir()` call under Bun (verified: Bun resolves/caches it
 * once, unlike Node's per-call POSIX read) — `buildClaudeMdContext` (which
 * `promptSubmitContext` wraps) has no injectable `home` parameter, so a real
 * process boundary is the only hermetic option without touching `src/`. This
 * fixes the flaky-locally/red-in-CI split: locally the real `$HOME` happened
 * to already contain the fixture docs, masking that the override was inert.
 * @param home - `HOME` to set before the child process starts.
 * @param prompt - Raw user prompt.
 * @param cwd - Project root passed through.
 * @param id - Harness target id.
 * @returns The captured stdout (native hook response, or "").
 */
function promptSubmitContextWithHome(home: string, prompt: string, cwd: string, id?: string): string {
  const entry = join(import.meta.dir, "..", "src", "runtime", "inject-context.ts");
  const script = `const { promptSubmitContext } = await import(${JSON.stringify(entry)});
process.stdout.write(promptSubmitContext(${JSON.stringify(prompt)}, ${JSON.stringify(cwd)}, ${JSON.stringify(id ?? "claude-code")}));`;
  const r = spawnSync("bun", ["-e", script], { env: { ...process.env, HOME: home }, encoding: "utf8" });
  return (r.stdout ?? "").trim();
}

test("sessionStartCore: id='claude-code' (default) is byte-identical to the pre-target-aware output", () => {
  const home = root();
  mkdirSync(join(home, ".claude"), { recursive: true });
  writeFileSync(join(home, ".claude", "CLAUDE.md"), "# Rules");
  const cwd = root();
  writeFileSync(join(cwd, "package.json"), "{}");
  const md = "# Rules";
  const dev = devContext(cwd);
  const expected = attachSystemMessage(contextResponse("SessionStart", [md, dev].filter(Boolean).join("\n")), "CLAUDE.md injected");
  expect(sessionStartCore(cwd, home)).toBe(expected);
  expect(sessionStartCore(cwd, home, Date.now(), "claude-code")).toBe(expected);
});

test("sessionStartCore: id='codex' reads <home>/.codex/AGENTS.md and labels 'AGENTS.md injected'", () => {
  const home = root();
  mkdirSync(join(home, ".codex"), { recursive: true });
  writeFileSync(join(home, ".codex", "AGENTS.md"), "# Codex Rules");
  const cwd = root();
  const out = sessionStartCore(cwd, home, Date.now(), "codex");
  const parsed = JSON.parse(out);
  expect(parsed.hookSpecificOutput.additionalContext).toContain("# Codex Rules");
  expect(parsed.systemMessage).toBe("AGENTS.md injected");
});

test("sessionStartCore: id='kimi' reads <home>/.kimi-code/AGENTS.md and labels 'AGENTS.md injected'", () => {
  const home = root();
  mkdirSync(join(home, ".kimi-code"), { recursive: true });
  writeFileSync(join(home, ".kimi-code", "AGENTS.md"), "# Kimi Rules");
  const cwd = root();
  const out = sessionStartCore(cwd, home, Date.now(), "kimi");
  const parsed = JSON.parse(out);
  expect(parsed.hookSpecificOutput.additionalContext).toContain("# Kimi Rules");
  expect(parsed.systemMessage).toBe("AGENTS.md injected");
});

test("promptSubmitContext: codex target labels 'AGENTS.md injected', claude-code (default) labels 'CLAUDE.md injected'", () => {
  const home = root();
  mkdirSync(join(home, ".codex"), { recursive: true });
  writeFileSync(join(home, ".codex", "AGENTS.md"), "# Codex Rules");
  mkdirSync(join(home, ".claude"), { recursive: true });
  writeFileSync(join(home, ".claude", "CLAUDE.md"), "# Claude Rules");
  const codexOut = JSON.parse(promptSubmitContextWithHome(home, "hello", root(), "codex"));
  expect(codexOut.systemMessage).toBe("AGENTS.md injected");
  const claudeOut = JSON.parse(promptSubmitContextWithHome(home, "hello there", root()));
  expect(claudeOut.systemMessage).toBe("CLAUDE.md injected");
}, 15000);

// bin.ts's FUSE_HARNESS_DEBUG gate is a stderr trace helper wired directly off
// process.env at module load — not unit-testable in-process (would require a
// child-process spawn per branch). No runtime test added here; the closest
// integration-level coverage is the sim harness (test/sim/exec.ts).
