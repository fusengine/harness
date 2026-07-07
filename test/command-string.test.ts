import { test, expect } from "bun:test";
import { commandToString } from "../src/runtime/command-string";
import { normalizeEvent } from "../src/runtime/normalize";
import { evaluate } from "../src/policy/evaluate";

test("commandToString: string passes through unchanged (no-op for Claude/Cursor/Hermes)", () => {
  expect(commandToString("git commit -m x")).toBe("git commit -m x");
  expect(commandToString("")).toBe("");
});

test("commandToString: Codex argv [shell, -lc/-c, script] → the script", () => {
  expect(commandToString(["bash", "-lc", "git commit -m test"])).toBe("git commit -m test");
  expect(commandToString(["sh", "-c", "rm -rf /"])).toBe("rm -rf /");
  expect(commandToString(["/bin/bash", "-lc", "sed -i s/a/b/ f.ts"])).toBe("sed -i s/a/b/ f.ts");
  expect(commandToString(["/usr/bin/zsh", "-ic", "echo hi"])).toBe("echo hi");
});

test("commandToString: non-shell / non -c array → join with spaces", () => {
  expect(commandToString(["git", "commit", "-m", "x"])).toBe("git commit -m x");
  expect(commandToString(["bash", "script.sh"])).toBe("bash script.sh");
});

test("commandToString: undefined for empty, non-string, and non-array inputs", () => {
  expect(commandToString([])).toBeUndefined();
  expect(commandToString(["bash", "-lc", 5])).toBeUndefined();
  expect(commandToString({ command: "x" })).toBeUndefined();
  expect(commandToString(undefined)).toBeUndefined();
  expect(commandToString(42)).toBeUndefined();
  expect(commandToString(null)).toBeUndefined();
});

const codexPayload = (command: unknown) => ({
  hook_event_name: "PreToolUse",
  session_id: "s",
  tool_name: "Bash",
  tool_input: { command },
});

const verdict = (command: unknown) => {
  const ev = normalizeEvent("codex", codexPayload(command));
  return evaluate({ tool: ev.tool, command: ev.command });
};

test.each([
  ["git commit", "git commit -m test", ["bash", "-lc", "git commit -m test"]],
  ["rm -rf", "rm -rf /tmp/x", ["bash", "-lc", "rm -rf /tmp/x"]],
  ["sed -i", "sed -i s/a/b/ f.ts", ["bash", "-lc", "sed -i s/a/b/ f.ts"]],
])("pipeline: Codex ARRAY reaches the same verdict as STRING (%s)", (_name, asString, asArray) => {
  const s = verdict(asString);
  const a = verdict(asArray);
  // Before the fix the array collapsed to command=undefined → allow (fail-open).
  expect(s.decision).toBe("deny");
  expect(a.decision).toBe(s.decision);
});

test("pipeline: an unwrappable array does not fabricate a command (no false deny)", () => {
  expect(verdict(["bash", "-lc", 5]).decision).toBe("allow");
  expect(normalizeEvent("codex", codexPayload(["bash", "-lc", 5])).command).toBeUndefined();
});
