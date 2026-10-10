import { afterEach, expect, test } from "bun:test";
import { existsSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { HOSTS, makeFixture, runHost, shell, postShell, userPrompt, type MotionFixture } from "./motion-hosts-fixture";
import { codeOf } from "./motion-handle-fixture";
import { motionKeyPath, projectStoreDir } from "../src/policy/motion/store";
import { canonicalRoot } from "../src/runtime/prd/prd-canon";
import { completeDraft } from "./motion-hardening5-fixture";

const fixtures: MotionFixture[] = [];
afterEach(() => { for (const f of fixtures.splice(0)) rmSync(f.base, { recursive: true, force: true }); });

for (const host of HOSTS) test(`${host}: existing baseline survives, unrelated after-tool write is quarantined`, async () => {
  const f = makeFixture(); fixtures.push(f);
  await runHost(f, host, shell(host, "matrix", "ls", f.proj));
  expect(existsSync(f.draft)).toBe(true);
  writeFileSync(join(f.proj, "out/master.mp4"), "unapproved");
  const out = await runHost(f, host, postShell(host, "matrix", "ls", f.proj));
  expect(existsSync(join(f.proj, "out/master.mp4"))).toBe(false);
  if (host === "cursor") expect(out).toBe("{}"); // Native afterShellExecution is observation-only.
  else expect(out).toContain("quarantin");
});

for (const target of ["key", "store"] as const) test(`${target}: benign external replacement invalidates owner approvals`, async () => {
  const f = makeFixture(); fixtures.push(f);
  await completeDraft(f);
  const denied = await runHost(f, "claude-code", shell("claude-code", "tamper", "bash render.sh --stage master", f.proj));
  await runHost(f, "claude-code", userPrompt("claude-code", "tamper", `MOTION-APPROVE draft ${codeOf(denied)}`, f.proj));
  const root = canonicalRoot(f.proj);
  writeFileSync(target === "key" ? motionKeyPath(root, f.home) : join(projectStoreDir(root, f.home), "approvals.json"), target === "key" ? Buffer.alloc(32, 3) : '{"approvals":[]}');
  const out = await runHost(f, "claude-code", postShell("claude-code", "tamper", "ls", f.proj));
  expect(out).toContain("invalidated");
});

test("Kimi native tool_call_id allows capped unique master and its receipt", async () => {
  const f = makeFixture(); fixtures.push(f);
  await completeDraft(f);
  const original = process.env.FUSE_MOTION_MAX_MASTER_RENDERS;
  process.env.FUSE_MOTION_MAX_MASTER_RENDERS = "1";
  try {
    const pre = { ...shell("kimi", "kimi-native", "bash render.sh --stage master", f.proj), tool_use_id: undefined, tool_call_id: "native-kimi" };
    const denied = await runHost(f, "kimi", pre);
    await runHost(f, "kimi", userPrompt("kimi", "kimi-native", `MOTION-APPROVE draft ${codeOf(denied)}`, f.proj));
    expect(await runHost(f, "kimi", pre)).not.toContain('"permissionDecision":"deny"');
    writeFileSync(join(f.proj, "out/master.mp4"), "authorized");
    expect(await runHost(f, "kimi", { ...pre, hook_event_name: "PostToolUse" })).not.toContain("quarantin");
    expect(existsSync(join(f.proj, "out/master.mp4"))).toBe(true);
  } finally { if (original === undefined) delete process.env.FUSE_MOTION_MAX_MASTER_RENDERS; else process.env.FUSE_MOTION_MAX_MASTER_RENDERS = original; }
});

test("Kimi Stop uses its existing native deny contract", async () => {
  const f = makeFixture(); fixtures.push(f);
  await runHost(f, "kimi", shell("kimi", "stop-kimi", "ls", f.proj));
  writeFileSync(join(f.proj, "out/master.mp4"), "unapproved");
  const out = await runHost(f, "kimi", { hook_event_name: "Stop", session_id: "stop-kimi" });
  expect(out).toContain('"permissionDecision":"deny"');
  expect(existsSync(join(f.proj, "out/master.mp4"))).toBe(false);
});

for (const host of ["gemini-cli", "cline", "hermes", "cursor"] as const) test(`${host}: a unique no-native-id authorized master remains usable`, async () => {
  const f = makeFixture(); fixtures.push(f);
  await completeDraft(f);
  const cmd = "bash render.sh --stage master";
  const pre = shell(host, "noid-owner", cmd, f.proj);
  const denied = await runHost(f, host, pre);
  await runHost(f, host, userPrompt(host, "noid-owner", `MOTION-APPROVE draft ${codeOf(denied)}`, f.proj));
  expect(await runHost(f, host, pre)).not.toContain("BLOCKED");
  writeFileSync(join(f.proj, "out/master.mp4"), "authorized-noid");
  await runHost(f, host, postShell(host, "noid-owner", cmd, f.proj));
  expect(existsSync(join(f.proj, "out/master.mp4"))).toBe(true);
});
