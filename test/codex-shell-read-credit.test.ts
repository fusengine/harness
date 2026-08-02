import { test, expect } from "bun:test";
import { mkdtempSync, mkdirSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { normalizeEvent } from "../src/runtime/normalize";
import { activityFor } from "../src/runtime/activity";
import { designGate } from "../src/runtime/design";
import { handleHook } from "../src/runtime/handle";
import { projectLayout } from "../src/config/layout";
import { setActiveDesignAgent } from "../src/policy/design/flag";
import { loadDesignState, saveDesignState, initDesignState } from "../src/policy/design/state";

/**
 * A Codex Code Mode exec dispatch (`functions.exec` -> `tools.exec_command(...)`)
 * surfaces `tool_name: "exec_command"` instead of `"Bash"` — the harness's ref/
 * design credit paths only ever recognized `"Bash"`, so a skill read through
 * this path was invisible (0% credit, matching a real measured session).
 * `codex-shell-tool.ts` canonicalizes it; `design-read-credit.ts` wires the
 * SAME `shellReadRefPaths` whitelist into `recordPost`'s new shell branch.
 */
const execEv = (id: string, command: string, sessionId = "s") =>
  normalizeEvent(id, { hook_event_name: "PostToolUse", tool_name: "exec_command", tool_input: { command }, session_id: sessionId });

test("1) exec_command + sed -n skill read -> credited in refsRead (activityFor)", () => {
  const path = "/proj/skills/design-web/SKILL.md";
  const event = execEv("codex", `sed -n '1,40p' ${path}`);
  const activities = activityFor({ tool: event.tool, input: event.input, sessionId: "s", framework: "generic", now: 1000 });
  expect(activities).toContainEqual({ kind: "ref", path, ts: 1000 });
});

test("2) same event -> design state progresses phase 0 -> 1 (production entry point: handleHook)", async () => {
  const cwd = mkdtempSync(join(tmpdir(), "fh-cxr-proj-"));
  const cache = projectLayout(cwd).cacheDir;
  setActiveDesignAgent(cache, "ag");
  saveDesignState(cache, initDesignState("ag", "full", false));
  const path = join(cwd, "skills", "design-system", "SKILL.md");
  const payload = { hook_event_name: "PostToolUse", tool_name: "exec_command", tool_input: { command: `sed -n '1,40p' ${path}` }, session_id: "s", agent_id: "ag" };
  await handleHook("codex", payload, { now: 1000, cwd });
  expect(loadDesignState(cache, "ag")!.currentPhase).toBe(1);
});

test("3) corpus read via cat -> recordCorpusRead, not a plain ref read", () => {
  const cache = mkdtempSync(join(tmpdir(), "fh-cxr-c-"));
  const root = join(mkdtempSync(join(tmpdir(), "fh-cxr-root-")), "refs-design");
  mkdirSync(root, { recursive: true });
  writeFileSync(join(root, "README.md"), "# index");
  setActiveDesignAgent(cache, "ag");
  saveDesignState(cache, initDesignState("ag", "component", false));
  const event = execEv("codex", `cat ${join(root, "README.md")}`);
  expect(designGate({ agent_id: "ag" }, event, cache, "/proj", root)).toBeNull();
  const state = loadDesignState(cache, "ag")!;
  expect(state.corpusReads).toEqual(["README.md"]);
  // component mode needs >=1 corpus read and >=1 screenshot for phase 2 — a
  // read alone proves recordCorpusRead ran without asserting the full quota.
});

test("4) a WRITE command (sed -i / tee / >) never credits a read", () => {
  const cache = mkdtempSync(join(tmpdir(), "fh-cxr-w-"));
  setActiveDesignAgent(cache, "ag");
  saveDesignState(cache, initDesignState("ag", "full", false));
  const path = join(cache, "skills", "design-system", "SKILL.md");
  mkdirSync(join(cache, "skills", "design-system"), { recursive: true });
  writeFileSync(path, "# skill");
  for (const cmd of [`sed -i 's/a/b/' ${path}`, `echo hi | tee ${path}`, `echo hi > ${path}`]) {
    const event = execEv("codex", cmd);
    expect(activityFor({ tool: event.tool, input: event.input, sessionId: "s", framework: "generic", now: 1000 }).some((a) => a.kind === "ref")).toBe(false);
  }
  expect(loadDesignState(cache, "ag")!.currentPhase).toBe(0);
});

test("5) non-regression: Claude Code Read/Bash are byte-identical, and exec_command is NOT canonicalized off Codex", () => {
  // tool_name: "Read" — unaffected by the new branch (parity with activity-shell-read.test.ts).
  const readEvent = normalizeEvent("claude-code", { hook_event_name: "PostToolUse", tool_name: "Read", tool_input: { file_path: "skills/solid/references/srp.md" }, session_id: "s" });
  expect(activityFor({ tool: readEvent.tool, input: readEvent.input, sessionId: "s", framework: "generic", now: 4000 })).toEqual([{ kind: "ref", path: "skills/solid/references/srp.md", ts: 4000 }]);
  // tool_name: "Bash" + cat — unaffected (existing behavior, untouched branch).
  const bashEvent = normalizeEvent("claude-code", { hook_event_name: "PostToolUse", tool_name: "Bash", tool_input: { command: "cat skills/react/references/hooks.md" }, session_id: "s" });
  expect(activityFor({ tool: bashEvent.tool, input: bashEvent.input, sessionId: "s", framework: "generic", now: 2000 })).toContainEqual({ kind: "ref", path: "skills/react/references/hooks.md", ts: 2000 });
  // Scope proof: "exec_command" is CODEX-ONLY — every other harness id passes it through raw.
  expect(normalizeEvent("claude-code", { hook_event_name: "PostToolUse", tool_name: "exec_command", tool_input: { command: "x" }, session_id: "s" }).tool).toBe("exec_command");
  expect(normalizeEvent("kimi", { hook_event_name: "PostToolUse", tool_name: "exec_command", tool_input: { command: "x" }, session_id: "s" }).tool).toBe("exec_command");
  expect(normalizeEvent("codex", { hook_event_name: "PostToolUse", tool_name: "exec_command", tool_input: { command: "x" }, session_id: "s" }).tool).toBe("Bash");
});

test("6) exec_command running a non-read command (npm test) credits nothing", () => {
  const event = execEv("codex", "npm test");
  expect(activityFor({ tool: event.tool, input: event.input, sessionId: "s", framework: "generic", now: 1000 }).some((a) => a.kind === "ref")).toBe(false);
});

test("7) owner's exact terrain case, absolute path, verbatim command", () => {
  const path = "/Users/brunoazoulay/.codex/plugins/cache/fusengine-codex/design-expert/2.1.40/skills/design-web/SKILL.md";
  const event = execEv("codex", `sed -n '1,40p' ${path}`);
  expect(event.tool).toBe("Bash");
  const activities = activityFor({ tool: event.tool, input: event.input, sessionId: "s", framework: "generic", now: 1000 });
  expect(activities).toContainEqual({ kind: "ref", path, ts: 1000 });
});
