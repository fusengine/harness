import { test, expect } from "bun:test";
import { tmpdir } from "node:os";
import { mkdtempSync, mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { sessionStartCore } from "../src/runtime/lifecycle/session-start";
import { promptSubmitContext } from "../src/runtime/inject-context";
import { attachSystemMessage, contextResponse } from "../src/adapters/claude";
import { devContext } from "../src/runtime/dev-context";

/**
 * Target-aware (Claude/Codex/Kimi) coverage for `sessionStartCore` and
 * `promptSubmitContext` — the root instructions doc + its dynamic
 * "<doc> injected" label now flow through `apexDocName`/`harnessHomeSegment`
 * instead of a hardcoded `.claude/CLAUDE.md` path and label.
 */
const root = (): string => mkdtempSync(join(tmpdir(), "fh-sst-"));

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
  const prevHome = process.env.HOME;
  try {
    const home = root();
    mkdirSync(join(home, ".codex"), { recursive: true });
    writeFileSync(join(home, ".codex", "AGENTS.md"), "# Codex Rules");
    mkdirSync(join(home, ".claude"), { recursive: true });
    writeFileSync(join(home, ".claude", "CLAUDE.md"), "# Claude Rules");
    process.env.HOME = home;
    const codexOut = JSON.parse(promptSubmitContext("hello", root(), "codex"));
    expect(codexOut.systemMessage).toBe("AGENTS.md injected");
    const claudeOut = JSON.parse(promptSubmitContext("hello there", root()));
    expect(claudeOut.systemMessage).toBe("CLAUDE.md injected");
  } finally {
    if (prevHome === undefined) delete process.env.HOME;
    else process.env.HOME = prevHome;
  }
});

// bin.ts's FUSE_HARNESS_DEBUG gate is a stderr trace helper wired directly off
// process.env at module load — not unit-testable in-process (would require a
// child-process spawn per branch). No runtime test added here; the closest
// integration-level coverage is the sim harness (test/sim/exec.ts).
