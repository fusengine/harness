import { expect, spyOn, test } from "bun:test";
import * as fs from "node:fs";
import { dirname, join } from "node:path";
import { bannedListPath } from "../src/policy/motion/sensitive";
import { bash, codeOf, isDeny, makeFixture, prompt, run } from "./motion-handle-fixture";
import { completeDraft } from "./motion-hardening5-fixture";

test("critic agent type is sandboxed when SubagentStart was missed", async () => {
  for (const agentType of ["motion-critic", "fuse-motion:motion-critic"]) {
    const fx = makeFixture();
    const out = await run(fx, {
      hook_event_name: "PreToolUse", session_id: "missed", agent_id: "critic", agent_type: agentType,
      tool_name: "Write", tool_input: { file_path: join(fx.proj, "src", "x.ts"), content: "hello" },
    });
    expect(isDeny(out)).toBe(true);
  }
});

test("NotebookEdit scans new_source for banned terms and currency", async () => {
  const fx = makeFixture();
  fs.mkdirSync(dirname(bannedListPath(fx.home)), { recursive: true });
  fs.writeFileSync(bannedListPath(fx.home), "ConfidentialName\n");
  for (const new_source of ["ConfidentialName", "total: 40 EUR"]) {
    const out = await run(fx, {
      hook_event_name: "PreToolUse", session_id: "notebook", tool_name: "NotebookEdit",
      tool_input: { notebook_path: join(fs.realpathSync(fx.proj), "src", "demo.ipynb"), new_source },
    });
    expect(isDeny(out)).toBe(true);
    expect(out).not.toContain("ConfidentialName");
  }
});

test("one banned-list read supplies source and fanned-out patch scans", async () => {
  const fx = makeFixture();
  const path = bannedListPath(fx.home);
  fs.mkdirSync(dirname(path), { recursive: true });
  fs.writeFileSync(path, "ConfidentialName\n");
  const read = spyOn(fs, "readFileSync");
  try {
    const out = await run(fx, {
      hook_event_name: "PreToolUse", session_id: "single-read", tool_name: "Write",
      tool_input: { file_path: join(fs.realpathSync(fx.proj), "src", "clean.ts"), content: "hello" },
    });
    expect(isDeny(out)).toBe(false);
    expect(read.mock.calls.filter((args) => String(args[0]) === path)).toHaveLength(1);
  } finally {
    read.mockRestore();
  }
});

test("missing agentId while a critic is active keeps the existing conservative sandbox", async () => {
  const fx = makeFixture();
  await run(fx, { hook_event_name: "SubagentStart", session_id: "active", agent_id: "critic", agent_type: "motion-critic" });
  expect(isDeny(await run(fx, {
    hook_event_name: "PreToolUse", session_id: "active", tool_name: "Write",
    tool_input: { file_path: join(fx.proj, "src", "x.ts"), content: "hello" },
  }))).toBe(true);
});

test("master cap denial is returned before a second reservation or when its id is absent", async () => {
  const fx = makeFixture();
  const prior = process.env["FUSE_MOTION_MAX_MASTER_RENDERS"];
  process.env["FUSE_MOTION_MAX_MASTER_RENDERS"] = "1";
  try {
    const master = "bash render.sh --stage master";
    await completeDraft(fx);
    const code = codeOf(await run(fx, bash("owner", master)));
    expect(await run(fx, prompt("owner", `MOTION-APPROVE draft ${code}`))).toContain("approved for");
    expect(isDeny(await run(fx, bash("missing-id", master, { tool_use_id: undefined })))).toBe(true);
    expect(isDeny(await run(fx, bash("first", master)))).toBe(false);
    const denied = await run(fx, bash("second", master));
    expect(isDeny(denied)).toBe(true);
    expect(denied).toContain("in-flight reservations");
  } finally {
    if (prior === undefined) delete process.env["FUSE_MOTION_MAX_MASTER_RENDERS"];
    else process.env["FUSE_MOTION_MAX_MASTER_RENDERS"] = prior;
  }
});
