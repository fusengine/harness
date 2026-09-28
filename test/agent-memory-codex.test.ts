import { test, expect } from "bun:test";
import { tmpdir } from "node:os";
import { mkdtempSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { trackAgentMemory } from "../src/runtime/lifecycle/agent-memory";
import { saveSessionState } from "../src/runtime/home-state";

/** Keys Codex's `SubagentStopCommandOutputWire` accepts (serde `deny_unknown_fields`). */
const CODEX_SUBAGENT_STOP_KEYS = new Set(["continue", "stopReason", "suppressOutput", "systemMessage", "decision", "reason"]);

/** True when `stdout` is a SubagentStop output Codex parses: empty, or a JSON object of allowed keys only. */
const codexAccepts = (stdout: string): boolean =>
  stdout.trim() === "" || Object.keys(JSON.parse(stdout) as object).every((k) => CODEX_SUBAGENT_STOP_KEYS.has(k));

/** Home + session with one code file owned by the stopping agent (triggers the sniper reminder). */
function ownedChange(sid: string): { home: string; file: string } {
  const home = mkdtempSync(join(tmpdir(), "fh-cx-"));
  const file = join(mkdtempSync(join(tmpdir(), "fh-cx-disk-")), "a.ts");
  writeFileSync(file, "x");
  saveSessionState(sid, { changes: { cumulativeCodeFiles: 1, modifiedFiles: [file] } }, home);
  return { home, file };
}

test("codex: skipped agent and no-change agent → same text as `systemMessage`, never `message`", () => {
  const home = mkdtempSync(join(tmpdir(), "fh-cx-"));
  const a = trackAgentMemory({ agent_type: "explore-codebase", session_id: "c1" }, home, 1000, "codex");
  const b = trackAgentMemory({ agent_type: "react-expert", session_id: "c2" }, home, 1000, "codex");
  expect(a).toBe('{"systemMessage":"Agent explore-codebase completed"}');
  expect(b).toBe('{"systemMessage":"Agent react-expert completed (no code changes)"}');
  expect(codexAccepts(a) && codexAccepts(b)).toBe(true);
});

test("codex: sniper reminder → only `systemMessage`, accepted by Codex's schema", () => {
  const { home, file } = ownedChange("c3");
  const out = trackAgentMemory({ agent_type: "react-expert", session_id: "c3" }, home, 1000, "codex");
  expect(codexAccepts(out)).toBe(true);
  const o = JSON.parse(out) as { systemMessage: string };
  expect(o.systemMessage).toContain(`SNIPER VALIDATION REQUIRED: Agent 'react-expert' modified 1 code file(s): ${file}`);
});

test("non-regression: default id and claude-code keep the exact previous bytes", () => {
  const home = mkdtempSync(join(tmpdir(), "fh-cx-"));
  for (const id of [undefined, "claude-code", "kimi", "cursor"]) {
    expect(trackAgentMemory({ agent_type: "explore-codebase", session_id: "n1" }, home, 1000, id)).toBe('{"message":"Agent explore-codebase completed"}');
    expect(trackAgentMemory({ agent_type: "react-expert", session_id: "n2" }, home, 1000, id)).toBe('{"message":"Agent react-expert completed (no code changes)"}');
  }
  const { home: h2, file } = ownedChange("n3");
  const out = trackAgentMemory({ agent_type: "react-expert", session_id: "n3" }, h2, 1000);
  const o = JSON.parse(out) as { hookSpecificOutput: { hookEventName: string; additionalContext: string } };
  expect(o.hookSpecificOutput.hookEventName).toBe("SubagentStop");
  expect(o.hookSpecificOutput.additionalContext).toContain(`modified 1 code file(s): ${file}`);
});
