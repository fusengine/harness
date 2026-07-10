import { test, expect } from "bun:test";
import { tmpdir } from "node:os";
import { mkdtempSync } from "node:fs";
import { join } from "node:path";
import figures from "figures";
import { parseApplyPatch } from "../src/adapters/codex/apply-patch";
import { guard, toCodexResponse } from "../src/adapters/codex";
import { normalizeEvent } from "../src/runtime/normalize";
import { handleHook } from "../src/runtime/handle";

const root = (): string => mkdtempSync(join(tmpdir(), "fh-ap-"));
const wrap = (body: string): string => `*** Begin Patch\n${body}*** End Patch\n`;
const addFile = (path: string, n: number): string => `*** Add File: ${path}\n${"+x\n".repeat(n)}`;
const hook = (command: string) => ({ hook_event_name: "PreToolUse", tool_name: "apply_patch", session_id: "s1", tool_input: { command } });
const deny = (stdout: string): string | undefined => (JSON.parse(stdout) as { hookSpecificOutput?: { permissionDecision?: string } }).hookSpecificOutput?.permissionDecision;

test("parseApplyPatch: multi-file envelope → one entry per hunk, correct ops/paths", () => {
  const files = parseApplyPatch(wrap(`${addFile("foo.ts", 2)}*** Update File: bar.ts\n@@\n ctx\n-old\n+new\n*** Delete File: baz.ts\n`));
  expect(files.map((f) => [f.op, f.path])).toEqual([["add", "foo.ts"], ["update", "bar.ts"], ["delete", "baz.ts"]]);
  expect(files[0]!.content).toBe("x\nx"); // Add: exact new content (the two `+x` lines)
  expect(files[1]!.content).toBe("ctx\nnew"); // Update: new side only (context + added, `-old` dropped)
});

test("parseApplyPatch: Move to renames the update target; malformed input → []", () => {
  const [f] = parseApplyPatch(wrap("*** Update File: old.ts\n*** Move to: new.ts\n@@\n+z\n"));
  expect(f).toMatchObject({ op: "update", path: "new.ts" });
  expect(parseApplyPatch("not a patch at all")).toEqual([]);
});

test("normalizeEvent: apply_patch fans into event.files; no filePath leaks to the git guard", () => {
  const e = normalizeEvent("codex", hook(wrap(addFile("a.ts", 3))));
  expect(e.files?.length).toBe(1);
  expect(e.filePath).toBeUndefined();
  expect(e.command).toBeUndefined(); // patch text must NOT ride `command` (would false-match git patterns)
  // Non-apply_patch stays byte-identical: single-file filePath/content, no `files`.
  const w = normalizeEvent("codex", { tool_name: "Write", session_id: "s", tool_input: { file_path: "a.ts", content: "x" } });
  expect(w.files).toBeUndefined();
  expect(w.filePath).toBe("a.ts");
});

test("NEGATIVE: apply_patch adding a 150-line file triggers the SOLID deny (was 0% enforcement)", async () => {
  const out = await handleHook("codex", hook(wrap(addFile("huge.ts", 150))), { now: 1000, cwd: root() });
  expect(deny(out.stdout)).toBe("deny");
  expect(out.stdout).toContain("max");
  // The patchPrompt deny path (handle-pre.ts's applyPatchGate branch) now also
  // carries the human-visible notice, same as the main gate() deny path.
  expect((JSON.parse(out.stdout) as { systemMessage?: string }).systemMessage).toBe(`${figures.cross} SOLID file-size limit`);
});

test("apply_patch: small add allowed; one oversized hunk among many blocks the whole patch (OR)", async () => {
  const ok = await handleHook("codex", hook(wrap(addFile("small.ts", 3))), { now: 1000, cwd: root() });
  expect(ok.stdout).not.toContain('"deny"');
  const mixed = await handleHook("codex", hook(wrap(`${addFile("small.ts", 3)}${addFile("huge.ts", 150)}`)), { now: 1000, cwd: root() });
  expect(deny(mixed.stdout)).toBe("deny");
});

test("codex guard: 150-line apply_patch add → deny; ask (git push) → explicit deny with honest prefix", () => {
  expect(deny(guard(hook(wrap(addFile("huge.ts", 150))) as never)!)).toBe("deny");
  const askDeny = guard({ tool_name: "Bash", tool_input: { command: "git push origin main" } });
  expect(askDeny).not.toBeNull();
  const reason = (JSON.parse(askDeny!) as { hookSpecificOutput: { permissionDecision: string; permissionDecisionReason: string } }).hookSpecificOutput;
  expect(reason.permissionDecision).toBe("deny");
  expect(reason.permissionDecisionReason).toContain("downgraded from ask");
});

test("toCodexResponse: ask never emits a Codex-unhonored permissionDecision:ask", () => {
  const r = JSON.parse(toCodexResponse({ kind: "ask", title: "t", reason: "r" })) as { hookSpecificOutput: { permissionDecision: string } };
  expect(r.hookSpecificOutput.permissionDecision).toBe("deny");
});
