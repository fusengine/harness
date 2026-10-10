import { test, expect } from "bun:test";
import { writeFileSync } from "node:fs";
import { bash, codeOf, isDeny, makeFixture, prompt, run } from "./motion-handle-fixture";
import { completeDraft } from "./motion-hardening5-fixture";

const DRAFT = "bash render.sh --stage draft";
const MASTER = "bash render.sh --stage master";

test("G1: deny, owner MOTION-APPROVE stills <code>, then allow (other session)", async () => {
  const fx = makeFixture();
  const denied = await run(fx, bash("s1", DRAFT));
  expect(isDeny(denied)).toBe(true);
  expect(denied).toContain("Owner: type MOTION-APPROVE stills");
  const granted = await run(fx, prompt("s1", `MOTION-APPROVE stills ${codeOf(denied)}`));
  expect(granted).toContain("approved");
  expect(isDeny(await run(fx, bash("s2", DRAFT)))).toBe(false);
});

test("UPS refusal drops the pending: a later correct code no longer grants", async () => {
  const fx = makeFixture();
  const code = codeOf(await run(fx, bash("s1", DRAFT)));
  expect(await run(fx, prompt("s1", "non"))).toBe("");
  expect(await run(fx, prompt("s1", `MOTION-APPROVE stills ${code}`))).toContain("Motion approval not granted");
  expect(isDeny(await run(fx, bash("s2", DRAFT)))).toBe(true);
});

test("wrong code and wrong stage grant nothing", async () => {
  const fx = makeFixture();
  const code = codeOf(await run(fx, bash("s1", DRAFT)));
  const wrong = code === "0000" ? "ffff" : "0000";
  expect(await run(fx, prompt("s1", `MOTION-APPROVE stills ${wrong}`))).toContain("Motion approval not granted");
  expect(await run(fx, prompt("s1", `MOTION-APPROVE draft ${code}`))).toContain("Motion approval not granted");
  expect(isDeny(await run(fx, bash("s2", DRAFT)))).toBe(true);
});

test("a UPS carrying agent_id (sub-agent / non-human origin) never approves", async () => {
  const fx = makeFixture();
  const code = codeOf(await run(fx, bash("s1", DRAFT)));
  expect(await run(fx, prompt("s1", `MOTION-APPROVE stills ${code}`, { agent_id: "a1" }))).toBe("");
  expect(isDeny(await run(fx, bash("s2", DRAFT)))).toBe(true);
});

test("G2: master needs the draft approval; a changed draft makes it stale", async () => {
  const fx = makeFixture();
  const stills = codeOf(await run(fx, bash("s1", DRAFT)));
  await run(fx, prompt("s1", `MOTION-APPROVE stills ${stills}`));
  await completeDraft(fx, true);
  const denied = await run(fx, bash("s3", MASTER));
  expect(denied).toContain("Owner: type MOTION-APPROVE draft");
  await run(fx, prompt("s3", `MOTION-APPROVE draft ${codeOf(denied)}`));
  expect(isDeny(await run(fx, bash("s4", MASTER)))).toBe(false);
  writeFileSync(fx.draft, "draft-v2");
  const stale = await run(fx, bash("s5", MASTER));
  expect(isDeny(stale)).toBe(true);
  expect(stale).toContain("stale: artifact changed since approval");
});

test("G2: a stale contact sheet invalidates the stills approval", async () => {
  const fx = makeFixture();
  await run(fx, prompt("s1", `MOTION-APPROVE stills ${codeOf(await run(fx, bash("s1", DRAFT)))}`));
  writeFileSync(fx.contact, "contact-v2");
  expect(await run(fx, bash("s2", DRAFT))).toContain("stale");
});
