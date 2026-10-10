/**
 * Multi-pending CONFIRM — state semantics: cap 10 (oldest evicted), pendings
 * NEVER expire (CONFIRM 20 min later still arms), a shared-path refusal drops
 * only the armed tokens (pendings survive; codex clears both as before),
 * arming does not consume the pending, and backward-compatible reading of the
 * legacy single-slot state files.
 */
import { test, expect } from "bun:test";
import { tmpdir } from "node:os";
import { mkdtempSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { randomUUID } from "node:crypto";
import { handleHook, type HandleOptions } from "../src/runtime/handle";
import { hashForAction, displayCodeForAction } from "../src/runtime/confirm/confirm-code";
import { codexAction } from "../src/runtime/confirm/codex-confirm";
import { sessionStatePath, sessionsDir } from "../src/runtime/home-state";

const cwd = (): string => mkdtempSync(join(tmpdir(), "fh-multistate-cwd-"));
const home = (): string => mkdtempSync(join(tmpdir(), "fh-multistate-home-"));
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

test("cap 10: the oldest pending is evicted beyond 10, the 10 freshest stay confirmable (kimi)", async () => {
  const h = home();
  const opts: HandleOptions = { now: 1000, cwd: cwd(), home: h };
  const s = sid("cap10");
  const codes: string[] = [];
  for (let i = 1; i <= 11; i++) {
    const d = await handleHook("kimi", pre("kimi", s, `git commit -m cap-${i}`), { ...opts, now: 1000 + i });
    codes.push(codeFromDeny(d.stdout));
  }
  // Code #2 (oldest RETAINED) still confirms its action — checked FIRST: the
  // re-denial of cap-1 below re-appends it and would evict cap-2 (11 entries).
  await handleHook("kimi", submit(s, `CONFIRM ${codes[1]}`), { ...opts, now: 2000 });
  expect(allowed((await handleHook("kimi", pre("kimi", s, "git commit -m cap-2"), { ...opts, now: 2010 })).stdout)).toBe(true);
  // Code #1 (evicted) arms nothing.
  await handleHook("kimi", submit(s, `CONFIRM ${codes[0]}`), { ...opts, now: 2020 });
  expect(denied((await handleHook("kimi", pre("kimi", s, "git commit -m cap-1"), { ...opts, now: 2030 })).stdout)).toBe(true);
});

test("a refusal drops the armed tokens but KEEPS the pending denies (kimi, pre-multi semantics)", async () => {
  const h = home();
  const opts: HandleOptions = { now: 1000, cwd: cwd(), home: h };
  const s = sid("refusal-all");
  const cmdA = "git commit -m refusal-a";
  const cmdB = "git commit -m refusal-b";
  const denyA = await handleHook("kimi", pre("kimi", s, cmdA), opts);
  const denyB = await handleHook("kimi", pre("kimi", s, cmdB), { ...opts, now: 1010 });
  const codeA = codeFromDeny(denyA.stdout);
  const codeB = codeFromDeny(denyB.stdout);
  await handleHook("kimi", submit(s, `CONFIRM ${codeA}`), { ...opts, now: 1020 });
  await handleHook("kimi", submit(s, "non, annule tout"), { ...opts, now: 1030 });
  // The armed token is gone...
  expect(denied((await handleHook("kimi", pre("kimi", s, cmdA), { ...opts, now: 1040 })).stdout)).toBe(true);
  // ...but the pending denies SURVIVE: re-typing a code re-arms it.
  await handleHook("kimi", submit(s, `CONFIRM ${codeB}`), { ...opts, now: 1050 });
  expect(allowed((await handleHook("kimi", pre("kimi", s, cmdB), { ...opts, now: 1060 })).stdout)).toBe(true);
});

test("an incidental refusal word does not clear pendings: 'no worries' then CONFIRM arms (kimi)", async () => {
  const h = home();
  const opts: HandleOptions = { now: 1000, cwd: cwd(), home: h };
  const s = sid("refusal-incidental");
  const cmd = "git commit -m refusal-incidental";
  const deny = await handleHook("kimi", pre("kimi", s, cmd), opts);
  const code = codeFromDeny(deny.stdout);
  await handleHook("kimi", submit(s, "no worries, explain the diff first"), { ...opts, now: 1010 });
  await handleHook("kimi", submit(s, `CONFIRM ${code}`), { ...opts, now: 1020 });
  expect(allowed((await handleHook("kimi", pre("kimi", s, cmd), { ...opts, now: 1030 })).stdout)).toBe(true);
});

test("arming does NOT consume the pending: an expired token re-arms by retyping the code (kimi)", async () => {
  const h = home();
  const opts: HandleOptions = { now: 1000, cwd: cwd(), home: h };
  const s = sid("rearm");
  const cmd = "git commit -m rearm";
  const deny = await handleHook("kimi", pre("kimi", s, cmd), opts);
  const code = codeFromDeny(deny.stdout);
  await handleHook("kimi", submit(s, `CONFIRM ${code}`), { ...opts, now: 1010 });
  // 6 minutes later the armed token is expired; the pending is still listed.
  const later = 1010 + 6 * 60 * 1000;
  await handleHook("kimi", submit(s, `CONFIRM ${code}`), { ...opts, now: later });
  expect(allowed((await handleHook("kimi", pre("kimi", s, cmd), { ...opts, now: later + 10 })).stdout)).toBe(true);
});

test("a refusal empties ALL pendings and tokens of the session (codex)", async () => {
  const h = home();
  const workdir = cwd();
  const opts: HandleOptions = { now: 1000, cwd: workdir, home: h };
  const s = sid("refusal-all-codex");
  const cmdA = "git commit -m refusal-codex-a";
  const cmdB = "git commit -m refusal-codex-b";
  const denyA = await handleHook("codex", pre("codex", s, cmdA, "tool-a", workdir), opts);
  const denyB = await handleHook("codex", pre("codex", s, cmdB, "tool-b", workdir), { ...opts, now: 1010 });
  const codeA = codeFromDeny(denyA.stdout);
  const codeB = codeFromDeny(denyB.stdout);
  await handleHook("codex", submit(s, `CONFIRM ${codeA}`), { ...opts, now: 1020 });
  await handleHook("codex", submit(s, "stop"), { ...opts, now: 1030 });
  expect(denied((await handleHook("codex", pre("codex", s, cmdA, "tool-a", workdir), { ...opts, now: 1040 })).stdout)).toBe(true);
  await handleHook("codex", submit(s, `CONFIRM ${codeB}`), { ...opts, now: 1050 });
  expect(denied((await handleHook("codex", pre("codex", s, cmdB, "tool-b", workdir), { ...opts, now: 1060 })).stdout)).toBe(true);
});

test("a pending code NEVER expires: CONFIRM 20 min after the denial still arms (kimi)", async () => {
  const h = home();
  const opts: HandleOptions = { now: 1000, cwd: cwd(), home: h };
  const s = sid("pending-no-ttl");
  const cmd = "git commit -m pending-no-ttl";
  const deny = await handleHook("kimi", pre("kimi", s, cmd), opts);
  const code = codeFromDeny(deny.stdout);
  const twentyMinLater = 1000 + 20 * 60 * 1000;
  await handleHook("kimi", submit(s, `CONFIRM ${code}`), { ...opts, now: twentyMinLater });
  expect(allowed((await handleHook("kimi", pre("kimi", s, cmd), { ...opts, now: twentyMinLater + 10 })).stdout)).toBe(true);
});

test("a pending code NEVER expires: CONFIRM 20 min after the denial still arms (codex)", async () => {
  const h = home();
  const workdir = cwd();
  const opts: HandleOptions = { now: 1000, cwd: workdir, home: h };
  const s = sid("pending-no-ttl-codex");
  const cmd = "git commit -m pending-no-ttl-codex";
  const deny = await handleHook("codex", pre("codex", s, cmd, "tool-a", workdir), opts);
  const code = codeFromDeny(deny.stdout);
  const twentyMinLater = 1000 + 20 * 60 * 1000;
  await handleHook("codex", submit(s, `CONFIRM ${code}`), { ...opts, now: twentyMinLater });
  expect(allowed((await handleHook("codex", pre("codex", s, cmd, "tool-a", workdir), { ...opts, now: twentyMinLater + 10 })).stdout)).toBe(true);
});

test("legacy single-slot state files stay readable (kimi pendingDeny)", async () => {
  const h = home();
  const opts: HandleOptions = { now: 1000, cwd: cwd(), home: h };
  const s = sid("legacy-kimi");
  const cmd = "git commit -m legacy-kimi";
  const hash = hashForAction(cmd);
  const code = displayCodeForAction(cmd);
  mkdirSync(sessionsDir(h), { recursive: true });
  writeFileSync(join(sessionsDir(h), `session-${s}.json`), JSON.stringify({ pendingDeny: { hash, code, ts: 900 } }, null, 2));
  await handleHook("kimi", submit(s, `CONFIRM ${code}`), { ...opts, now: 1000 });
  expect(allowed((await handleHook("kimi", pre("kimi", s, cmd), { ...opts, now: 1010 })).stdout)).toBe(true);
});

test("legacy single-slot state files stay readable (codex codexConfirmPending)", async () => {
  const h = home();
  const workdir = cwd();
  const opts: HandleOptions = { now: 1000, cwd: workdir, home: h };
  const s = sid("legacy-codex");
  const cmd = "git commit -m legacy-codex";
  const action = codexAction("Bash", workdir, cmd, 900);
  if (!action) throw new Error("expected a codex action");
  mkdirSync(sessionsDir(h), { recursive: true });
  writeFileSync(join(sessionsDir(h), `codex-confirm-${s}.json`), JSON.stringify({ codexConfirmPending: action }, null, 2));
  await handleHook("codex", submit(s, `CONFIRM ${action.code}`), { ...opts, now: 1000 });
  expect(allowed((await handleHook("codex", pre("codex", s, cmd, "tool-a", workdir), { ...opts, now: 1010 })).stdout)).toBe(true);
});

test("a refusal with NO armed token never rewrites the session file (corrupt file preserved byte for byte)", async () => {
  const h = home();
  const opts: HandleOptions = { now: 1000, cwd: cwd(), home: h };
  const s = sid("refusal-noop");
  mkdirSync(sessionsDir(h), { recursive: true });
  const corrupt = "{ this is not json !!!";
  writeFileSync(sessionStatePath(s, h), corrupt);
  await handleHook("kimi", submit(s, "non"), { ...opts, now: 1010 });
  expect(readFileSync(sessionStatePath(s, h), "utf8")).toBe(corrupt);
});

test("a refusal WITH an armed token rewrites the file (token gone, pendings kept)", async () => {
  const h = home();
  const opts: HandleOptions = { now: 1000, cwd: cwd(), home: h };
  const s = sid("refusal-writes");
  const cmd = "git commit -m refusal-writes";
  const deny = await handleHook("kimi", pre("kimi", s, cmd), opts);
  const code = codeFromDeny(deny.stdout);
  await handleHook("kimi", submit(s, `CONFIRM ${code}`), { ...opts, now: 1010 });
  await handleHook("kimi", submit(s, "non"), { ...opts, now: 1020 });
  const state = JSON.parse(readFileSync(sessionStatePath(s, h), "utf8")) as Record<string, unknown>;
  expect(state.confirmTokens).toBeUndefined();
  expect(state.confirmToken).toBeUndefined();
  expect(Array.isArray(state.pendingDenies)).toBe(true);
});
