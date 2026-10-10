import { expect, test } from "bun:test";
import { realpathSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { makeFixture } from "./motion-handle-fixture";
import { shell, userPrompt, runHost } from "./motion-hosts-fixture";
import { listApprovals, listPending } from "../src/policy/motion/approvals";

test("13: Hermes reread of consumed human approval is silent, not rejected", async () => {
  const f = makeFixture();
  writeFileSync(join(f.proj, ".motion", "stills", "contact.png"), "sheet");
  await runHost(f, "hermes", shell("hermes", "session", "bash render.sh --stage draft", f.proj));
  const pending = listPending(realpathSync(f.proj), f.home)[0]!;
  const payload = userPrompt("hermes", "session", `MOTION-APPROVE stills ${pending.code}`, f.proj);
  const first = await runHost(f, "hermes", payload);
  expect(first).toContain("approved");
  expect(await runHost(f, "hermes", payload)).toBe("");
  expect(listApprovals(realpathSync(f.proj), f.home)).toHaveLength(1);
});
