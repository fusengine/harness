import { expect, test } from "bun:test";
import { randomUUID } from "node:crypto";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { handleHook, type HandleOptions } from "../src/runtime/handle";

const pre = (sid: string, command: string, toolUseId: string, cwd: string) => ({
  hook_event_name: "PreToolUse", session_id: sid, tool_use_id: toolUseId,
  cwd, tool_name: "Bash", tool_input: { command },
});
const submit = (sid: string, prompt: string) => ({ hook_event_name: "UserPromptSubmit", session_id: sid, prompt });
const code = (stdout: string): string => stdout.match(/CONFIRM ([0-9a-f]{4})/i)?.[1] ?? "missing";

test("pending token stays stable, while the consumed receipt expires", async () => {
  const home = mkdtempSync(join(tmpdir(), "fh-receipt-home-"));
  const cwd = mkdtempSync(join(tmpdir(), "fh-receipt-cwd-"));
  const sid = `receipt-${randomUUID()}`, command = "git commit -m receipt";
  const opts: HandleOptions = { now: 1000, cwd, home };
  const first = await handleHook("codex", pre(sid, command, "tool-a", cwd), opts);
  const repeated = await handleHook("codex", pre(sid, command, "tool-a", cwd), { ...opts, now: 1050 });
  expect(code(repeated.stdout)).toBe(code(first.stdout));
  await handleHook("codex", submit(sid, `CONFIRM ${code(first.stdout)}`), { ...opts, now: 1100 });
  expect((await handleHook("codex", pre(sid, command, "tool-a", cwd), { ...opts, now: 1200 })).stdout).not.toContain('"permissionDecision":"deny"');
  const expired = await handleHook("codex", pre(sid, command, "tool-a", cwd), { ...opts, now: 1200 + 5 * 60 * 1000 + 1 });
  expect(expired.stdout).toContain("rejection: expired");
});
