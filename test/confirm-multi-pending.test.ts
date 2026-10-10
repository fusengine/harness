/**
 * Multi-pending CONFIRM (incident replay): several denied actions may each hold
 * a pending code per session — a new denial must never erase a code already
 * given, and an armed token must survive the denial of ANOTHER command.
 */
import { test, expect } from "bun:test";
import { tmpdir } from "node:os";
import { mkdtempSync } from "node:fs";
import { join } from "node:path";
import { randomUUID } from "node:crypto";
import { handleHook, type HandleOptions } from "../src/runtime/handle";

const cwd = (): string => mkdtempSync(join(tmpdir(), "fh-multi-cwd-"));
const home = (): string => mkdtempSync(join(tmpdir(), "fh-multi-home-"));
const sid = (label: string): string => `${label}-${randomUUID()}`;

const pre = (id: string, s: string, command: string, toolUseId?: string, workdir?: string) => ({
  hook_event_name: "PreToolUse", session_id: s, tool_use_id: toolUseId ?? randomUUID(),
  ...(workdir ? { cwd: workdir } : {}), tool_name: "Bash", tool_input: { command },
});
const submit = (s: string, prompt: string) => ({ hook_event_name: "UserPromptSubmit", session_id: s, prompt });

function codeFromDeny(stdout: string): string {
  const code = stdout.match(/CONFIRM ([0-9a-f]{4})/i)?.[1];
  if (!code) throw new Error(`no CONFIRM code in: ${stdout}`);
  return code;
}
const denied = (stdout: string): boolean => stdout.includes('"permissionDecision":"deny"');
const allowed = (stdout: string): boolean => !denied(stdout);

test("incident replay (codex): deny A, deny B, CONFIRM B passes, then CONFIRM A still passes", async () => {
  const h = home();
  const workdir = cwd();
  const opts: HandleOptions = { now: 1000, cwd: workdir, home: h };
  const s = sid("incident-codex");
  const cmdA = "git push -u origin codex/feature-a";
  const cmdB = "git commit -m incident-b";
  const denyA = await handleHook("codex", pre("codex", s, cmdA, "tool-a", workdir), opts);
  const denyB = await handleHook("codex", pre("codex", s, cmdB, "tool-b", workdir), { ...opts, now: 1010 });
  const codeA = codeFromDeny(denyA.stdout);
  const codeB = codeFromDeny(denyB.stdout);
  await handleHook("codex", submit(s, `CONFIRM ${codeB}`), { ...opts, now: 1020 });
  expect(allowed((await handleHook("codex", pre("codex", s, cmdB, "tool-b", workdir), { ...opts, now: 1030 })).stdout)).toBe(true);
  // The stale-looking code from the FIRST denial must still arm its action.
  await handleHook("codex", submit(s, `CONFIRM ${codeA}`), { ...opts, now: 1040 });
  expect(allowed((await handleHook("codex", pre("codex", s, cmdA, "tool-a", workdir), { ...opts, now: 1050 })).stdout)).toBe(true);
});

test("incident replay (kimi): deny A, deny B, CONFIRM B passes, then CONFIRM A still passes", async () => {
  const h = home();
  const opts: HandleOptions = { now: 1000, cwd: cwd(), home: h };
  const s = sid("incident-kimi");
  const cmdA = "git push -u origin kimi/feature-a";
  const cmdB = "git commit -m incident-kimi-b";
  const denyA = await handleHook("kimi", pre("kimi", s, cmdA), opts);
  const denyB = await handleHook("kimi", pre("kimi", s, cmdB), { ...opts, now: 1010 });
  const codeA = codeFromDeny(denyA.stdout);
  const codeB = codeFromDeny(denyB.stdout);
  await handleHook("kimi", submit(s, `CONFIRM ${codeB}`), { ...opts, now: 1020 });
  expect(allowed((await handleHook("kimi", pre("kimi", s, cmdB), { ...opts, now: 1030 })).stdout)).toBe(true);
  await handleHook("kimi", submit(s, `CONFIRM ${codeA}`), { ...opts, now: 1040 });
  expect(allowed((await handleHook("kimi", pre("kimi", s, cmdA), { ...opts, now: 1050 })).stdout)).toBe(true);
});

test("an armed token survives the denial of ANOTHER command (codex)", async () => {
  const h = home();
  const workdir = cwd();
  const opts: HandleOptions = { now: 1000, cwd: workdir, home: h };
  const s = sid("armed-survives");
  const cmdA = "git commit -m armed-a";
  const cmdB = "git commit -m armed-b";
  const denyA = await handleHook("codex", pre("codex", s, cmdA, "tool-a", workdir), opts);
  await handleHook("codex", submit(s, `CONFIRM ${codeFromDeny(denyA.stdout)}`), { ...opts, now: 1010 });
  const denyB = await handleHook("codex", pre("codex", s, cmdB, "tool-b", workdir), { ...opts, now: 1020 });
  expect(denyB.stdout).toContain("rejection: mismatch");
  // A's armed token must NOT have been erased by B's denial.
  expect(allowed((await handleHook("codex", pre("codex", s, cmdA, "tool-a", workdir), { ...opts, now: 1030 })).stdout)).toBe(true);
});

test("a code arms ONLY its own action: confirming B leaves A denied (kimi)", async () => {
  const h = home();
  const opts: HandleOptions = { now: 1000, cwd: cwd(), home: h };
  const s = sid("own-hash");
  const denyA = await handleHook("kimi", pre("kimi", s, "git commit -m own-a"), opts);
  const denyB = await handleHook("kimi", pre("kimi", s, "git commit -m own-b"), { ...opts, now: 1010 });
  codeFromDeny(denyA.stdout);
  await handleHook("kimi", submit(s, `CONFIRM ${codeFromDeny(denyB.stdout)}`), { ...opts, now: 1020 });
  expect(denied((await handleHook("kimi", pre("kimi", s, "git commit -m own-a"), { ...opts, now: 1030 })).stdout)).toBe(true);
});

test("two armed codes are each consumable exactly once (kimi)", async () => {
  const h = home();
  const opts: HandleOptions = { now: 1000, cwd: cwd(), home: h };
  const s = sid("one-shot");
  const cmdA = "git commit -m shot-a";
  const cmdB = "git commit -m shot-b";
  const denyA = await handleHook("kimi", pre("kimi", s, cmdA), opts);
  const denyB = await handleHook("kimi", pre("kimi", s, cmdB), { ...opts, now: 1010 });
  await handleHook("kimi", submit(s, `CONFIRM ${codeFromDeny(denyA.stdout)}`), { ...opts, now: 1020 });
  await handleHook("kimi", submit(s, `CONFIRM ${codeFromDeny(denyB.stdout)}`), { ...opts, now: 1030 });
  expect(allowed((await handleHook("kimi", pre("kimi", s, cmdA), { ...opts, now: 1040 })).stdout)).toBe(true);
  expect(denied((await handleHook("kimi", pre("kimi", s, cmdA), { ...opts, now: 1050 })).stdout)).toBe(true); // replay: one-shot
  expect(allowed((await handleHook("kimi", pre("kimi", s, cmdB), { ...opts, now: 1060 })).stdout)).toBe(true);
  expect(denied((await handleHook("kimi", pre("kimi", s, cmdB), { ...opts, now: 1070 })).stdout)).toBe(true);
});
