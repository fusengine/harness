import { expect, test } from "bun:test";
import { realpathSync, rmSync, writeFileSync } from "node:fs";
import { listApprovals, listPending } from "../src/policy/motion/approvals";
import { bash, codeOf, makeFixture, prompt, run } from "./motion-handle-fixture";

test("automated refusals preserve pending approval and its valid human code", async () => {
  for (const extra of [{ agent_id: "worker" }, { agent_type: "motion-expert" }, {}]) {
    const fx = makeFixture();
    const code = codeOf(await run(fx, bash("human", "bash render.sh --stage draft")));
    const root = realpathSync(fx.proj);
    const pending = listPending(root, fx.home);
    expect(pending).toHaveLength(1);
    const text = Object.keys(extra).length ? "non" : "<task-notification>non</task-notification>";
    expect(await run(fx, prompt("human", text, extra))).toBe("");
    expect(listPending(root, fx.home)).toEqual(pending);
    expect(await run(fx, prompt("human", `MOTION-APPROVE stills ${code}`))).toContain("approved for");
  }
});

test("well-formed invalid approval reports rejection without granting", async () => {
  for (const invalid of ["wrong-code", "changed-artifact", "missing-artifact", "no-pending"]) {
    const fx = makeFixture();
    const code = codeOf(await run(fx, bash("human", "bash render.sh --stage draft")));
    let supplied = code;
    if (invalid === "wrong-code") supplied = code === "0000" ? "ffff" : "0000";
    if (invalid === "changed-artifact") writeFileSync(fx.contact, "contact-v2");
    if (invalid === "missing-artifact") rmSync(fx.contact);
    if (invalid === "no-pending") await run(fx, prompt("human", "non"));
    const out = await run(fx, prompt("human", `MOTION-APPROVE stills ${supplied}`));
    expect(out).toContain("Motion approval not granted");
    expect(listApprovals(realpathSync(fx.proj), fx.home)).toEqual([]);
  }
});
