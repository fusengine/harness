import { afterEach, expect, test } from "bun:test";
import { createHmac } from "node:crypto";
import { existsSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { makeFixture, run, bash, prompt, codeOf, type MotionFixture } from "./motion-handle-fixture";
import { motionKeyPath, projectStoreDir, writeJsonObject } from "../src/policy/motion/store";
import { rootKey, sha256File } from "../src/policy/motion/hash";
import { canonicalRoot, canonicalFilePath } from "../src/runtime/prd/prd-canon";

const fixtures: MotionFixture[] = [];
afterEach(() => { for (const f of fixtures.splice(0)) rmSync(f.base, { recursive: true, force: true }); });

for (const plantedLedger of [false, true]) test(`a cold preexisting signed approval is not a harness grant (planted ledger: ${plantedLedger})`, async () => {
  const f = makeFixture(); fixtures.push(f);
  const root = canonicalRoot(f.proj), key = Buffer.alloc(32, 7), keyPath = motionKeyPath(root, f.home);
  mkdirSync(dirname(keyPath), { recursive: true }); writeFileSync(keyPath, key, { mode: 0o600 });
  const a = { version: 1, rootKey: rootKey(root), stage: "draft", artifact: canonicalFilePath(f.draft), sha256: sha256File(f.draft), approvedAt: 1, code: "1234", sessionId: "cold5" };
  const signature = createHmac("sha256", key).update(JSON.stringify([a.version, a.rootKey, a.stage, a.artifact, a.sha256, a.approvedAt, a.code, a.sessionId])).digest("hex");
  writeJsonObject(join(projectStoreDir(root, f.home), "approvals.json"), { approvals: [{ ...a, signature }] });
  if (plantedLedger) writeJsonObject(join(projectStoreDir(root, f.home), "grants.json"), { signatures: [signature] });
  expect(await run(f, bash("cold5", "bash render.sh --stage master"))).toContain('"permissionDecision":"deny"');
});

test("failed draft terminal never upgrades a cold output into G2 provenance", async () => {
  const f = makeFixture(); fixtures.push(f);
  const draft = await run(f, bash("failed-cold5", "bash render.sh --stage draft"));
  await run(f, prompt("failed-cold5", `MOTION-APPROVE stills ${codeOf(draft)}`));
  const render = bash("failed-cold5", "bash render.sh --stage draft", { tool_use_id: "failed-draft5" });
  await run(f, render); writeFileSync(f.draft, "failed draft output");
  await run(f, { ...render, hook_event_name: "PostToolUseFailure" });
  expect(await run(f, bash("failed-cold5", "bash render.sh --stage master"))).not.toMatch(/MOTION-APPROVE draft/);
});

test("cold outputs stay present but cannot grant G2 before an authorized draft receipt", async () => {
  const f = makeFixture(); fixtures.push(f);
  expect(await run(f, bash("cold5", "ls"))).toContain("not approved");
  expect(existsSync(f.draft)).toBe(true);
  const master = await run(f, bash("cold5", "bash render.sh --stage master"));
  expect(master).toContain('"permissionDecision":"deny"');
  expect(master).not.toMatch(/MOTION-APPROVE draft/);
  const draft = await run(f, bash("cold5", "bash render.sh --stage draft"));
  await run(f, prompt("cold5", `MOTION-APPROVE stills ${codeOf(draft)}`));
  const render = bash("cold5", "bash render.sh --stage draft", { tool_use_id: "fresh-draft5" });
  await run(f, render); writeFileSync(f.draft, "fresh authorized draft");
  await run(f, { ...render, hook_event_name: "PostToolUse" });
  expect(await run(f, bash("cold5", "bash render.sh --stage master"))).toMatch(/MOTION-APPROVE draft/);
});
