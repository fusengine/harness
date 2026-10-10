/**
 * Codex receipts regressions (passe 4):
 * 1. Fan-out after a SECOND confirmation of the same command: the twin
 *    callback carrying the NEWEST receipt's tool_use_id must be allowed —
 *    keeping a stale same-hash receipt next to the fresh one made the twin
 *    fall to "already-consumed" (pre-fix: the single receipt slot was
 *    overwritten, so the twin passed).
 * 2. Deny-reason parity with the former single slot: the reason is computed
 *    from the NEWEST token even when expired (different hash → "mismatch",
 *    same hash + expired → "expired"), never degraded to "no-token".
 */
import { test, expect } from "bun:test";
import { tmpdir } from "node:os";
import { mkdtempSync } from "node:fs";
import { join } from "node:path";
import { randomUUID } from "node:crypto";
import { handleHook, type HandleOptions } from "../src/runtime/handle";

const cwd = (): string => mkdtempSync(join(tmpdir(), "fh-rcpt4-cwd-"));
const home = (): string => mkdtempSync(join(tmpdir(), "fh-rcpt4-home-"));
const sid = (label: string): string => `${label}-${randomUUID()}`;

const codexPre = (s: string, command: string, toolUseId: string, workdir: string) => ({
  hook_event_name: "PreToolUse", session_id: s, tool_use_id: toolUseId,
  cwd: workdir, tool_name: "Bash", tool_input: { command },
});
const submit = (s: string, prompt: string) => ({ hook_event_name: "UserPromptSubmit", session_id: s, prompt });

function codeFromDeny(stdout: string): string {
  const code = stdout.match(/CONFIRM ([0-9a-f]{4})/i)?.[1];
  if (!code) throw new Error(`no CONFIRM code in: ${stdout}`);
  return code;
}
const deniedOut = (stdout: string): boolean => stdout.includes('"permissionDecision":"deny"');

test("fan-out: the twin of a SECOND confirmation of the same command is allowed too", async () => {
  const h = home();
  const workdir = cwd();
  const opts: HandleOptions = { now: 1000, cwd: workdir, home: h };
  const s = sid("fanout2");
  const cmd = "git push origin fanout2";
  // First cycle: deny → CONFIRM → T1 allow + twin T1 allow.
  const deny1 = await handleHook("codex", codexPre(s, cmd, "tool-t1", workdir), opts);
  await handleHook("codex", submit(s, `CONFIRM ${codeFromDeny(deny1.stdout)}`), { ...opts, now: 1100 });
  expect(deniedOut((await handleHook("codex", codexPre(s, cmd, "tool-t1", workdir), { ...opts, now: 1200 })).stdout)).toBe(false);
  expect(deniedOut((await handleHook("codex", codexPre(s, cmd, "tool-t1", workdir), { ...opts, now: 1201 })).stdout)).toBe(false);
  // Second cycle: a NEW tool_use_id is denied, confirmed, allowed — and ITS twin must pass too.
  const deny2 = await handleHook("codex", codexPre(s, cmd, "tool-t2", workdir), { ...opts, now: 1300 });
  expect(deniedOut(deny2.stdout)).toBe(true);
  await handleHook("codex", submit(s, `CONFIRM ${codeFromDeny(deny2.stdout)}`), { ...opts, now: 1400 });
  expect(deniedOut((await handleHook("codex", codexPre(s, cmd, "tool-t2", workdir), { ...opts, now: 1500 })).stdout)).toBe(false);
  const twin2 = await handleHook("codex", codexPre(s, cmd, "tool-t2", workdir), { ...opts, now: 1501 });
  expect(deniedOut(twin2.stdout)).toBe(false);
  // A THIRD tool_use_id (never confirmed) stays denied.
  expect(deniedOut((await handleHook("codex", codexPre(s, cmd, "tool-t3", workdir), { ...opts, now: 1600 })).stdout)).toBe(true);
});

test("deny-reason parity: an expired token of ANOTHER command still reads 'mismatch', not 'no-token'", async () => {
  const h = home();
  const workdir = cwd();
  const opts: HandleOptions = { now: 1000, cwd: workdir, home: h };
  const s = sid("parity-mismatch");
  const denied = await handleHook("codex", codexPre(s, "git commit -m parity-b", "tool-b", workdir), opts);
  await handleHook("codex", submit(s, `CONFIRM ${codeFromDeny(denied.stdout)}`), { ...opts, now: 1100 });
  const later = 1100 + 6 * 60 * 1000; // token for B is now expired
  const out = await handleHook("codex", codexPre(s, "git commit -m parity-a", "tool-a", workdir), { ...opts, now: later });
  expect(out.stdout).toContain("rejection: mismatch");
  expect(out.stdout).not.toContain("rejection: no-token");
});

test("deny-reason parity: an expired token of the SAME command still reads 'expired'", async () => {
  const h = home();
  const workdir = cwd();
  const opts: HandleOptions = { now: 1000, cwd: workdir, home: h };
  const s = sid("parity-expired");
  const cmd = "git commit -m parity-expired";
  const denied = await handleHook("codex", codexPre(s, cmd, "tool-a", workdir), opts);
  await handleHook("codex", submit(s, `CONFIRM ${codeFromDeny(denied.stdout)}`), { ...opts, now: 1100 });
  const later = 1100 + 6 * 60 * 1000;
  const out = await handleHook("codex", codexPre(s, cmd, "tool-a", workdir), { ...opts, now: later });
  expect(out.stdout).toContain("rejection: expired");
  expect(out.stdout).not.toContain("rejection: no-token");
});
