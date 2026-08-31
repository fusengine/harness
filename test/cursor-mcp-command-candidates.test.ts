import { expect, test } from "bun:test";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { handleHook } from "../src/runtime/handle";
import { gateCommandCandidates, type GateInput } from "../src/runtime/gate";
import { normalizeEvent } from "../src/runtime/normalize";
import { clearUserGuards, registerGuard } from "../src/policy/guards";
import { loadState, SIDECAR as ONE_SHOT_SIDECAR } from "../src/tracking/one-shot";

const destructive = ["rm", "-rf", "/"].join(" ");
const rootBenign = ["node", "server.mjs"].join(" ");
const nestedBenign = ["git", "status"].join(" ");
const nestedWriter = `node -e "require('fs').writeFileSync('result.txt', 'x')"`;

async function runPayload(payload: Record<string, unknown>) {
  const cwd = mkdtempSync(join(tmpdir(), "cursor-mcp-candidates-"));
  try {
    return {
      event: normalizeEvent("cursor", payload),
      outcome: await handleHook("cursor", payload, { now: 1000, cwd }),
    };
  } finally {
    rmSync(cwd, { recursive: true });
  }
}

async function run(rootCommand: string, nestedCommand?: string) {
  const toolInput = nestedCommand === undefined ? { query: "value" } : { command: nestedCommand };
  return runPayload({
    hook_event_name: "beforeMCPExecution",
    session_id: "mcp-candidates",
    tool_name: "run_command",
    command: rootCommand,
    tool_input: JSON.stringify(toolInput),
  });
}

function expectDenied(stdout: string): void {
  expect(JSON.parse(stdout).permission).toBe("deny");
}

function gateInput(cwd: string, now = 1000): GateInput {
  return {
    sessionId: "mcp-candidate-gate",
    framework: "generic",
    tool: "Bash",
    command: rootBenign,
    cwd,
    now,
    windowMs: 10_000,
    trackFile: join(cwd, "track.json"),
  };
}

test("Cursor gates a destructive nested command when the MCP root launcher is benign", async () => {
  const result = await run(rootBenign, destructive);
  expect([result.event.command, result.event.commandCandidates]).toEqual([rootBenign, [rootBenign, destructive]]);
  expectDenied(result.outcome.stdout);
});

test("Cursor gates a destructive MCP root launcher when the nested command is benign", async () => {
  const result = await run(destructive, nestedBenign);
  expect([result.event.command, result.event.commandCandidates]).toEqual([destructive, [destructive, nestedBenign]]);
  expectDenied(result.outcome.stdout);
});

test("Cursor allows independent benign MCP command candidates", async () => {
  const result = await run(rootBenign, nestedBenign);
  expect([result.event.command, result.event.commandCandidates]).toEqual([rootBenign, [rootBenign, nestedBenign]]);
  expect(result.outcome).toEqual({ stdout: '{"permission":"allow"}', exit: 0 });
});

test("Cursor still gates a root-only MCP launcher", async () => {
  const result = await run(destructive);
  expect(result.event.command).toBe(destructive);
  expect(result.event.commandCandidates).toEqual([destructive]);
  expectDenied(result.outcome.stdout);
});

test("Cursor safe root prefixes cannot hide a nested MCP writer", async () => {
  const result = await run(nestedBenign, nestedWriter);
  expect(result.event.commandCandidates).toEqual([nestedBenign, nestedWriter]);
  expectDenied(result.outcome.stdout);
});

test("Cursor evaluates MCP candidates independently across heredoc-looking boundaries", async () => {
  const rootTemplate = `node server.mjs --template "<<EOF"`;
  const nestedDelete = `${destructive}\nEOF`;
  const result = await run(rootTemplate, nestedDelete);
  expect(result.event.commandCandidates).toEqual([rootTemplate, nestedDelete]);
  expectDenied(result.outcome.stdout);
});

test("Cursor keeps a legitimate single-candidate heredoc body read-only", async () => {
  const command = `cat <<EOF\n${destructive}\nEOF`;
  const result = await run(command);
  expect(result.event.commandCandidates).toEqual([command]);
  expect(result.outcome).toEqual({ stdout: '{"permission":"allow"}', exit: 0 });
});

test("Cursor deduplicates identical MCP command candidates", async () => {
  const result = await run(destructive, destructive);
  expect([result.event.command, result.event.commandCandidates]).toEqual([destructive, [destructive]]);
  expectDenied(result.outcome.stdout);
});

test("Cursor malformed JSON still gates the root MCP launcher", async () => {
  const result = await runPayload({
    hook_event_name: "beforeMCPExecution",
    session_id: "mcp-malformed",
    tool_name: "run_command",
    command: destructive,
    tool_input: "{not-json",
  });
  expect([result.event.command, result.event.commandCandidates]).toEqual([destructive, [destructive]]);
  expectDenied(result.outcome.stdout);
});

test("Cursor candidate aggregation lets a later block dominate an earlier ask", async () => {
  const cwd = mkdtempSync(join(tmpdir(), "cursor-candidate-rank-"));
  try {
    const prompt = await gateCommandCandidates(gateInput(cwd), ["apt-get install jq", destructive]);
    expect(prompt).toMatchObject({ kind: "block", title: "Dangerous command" });
  } finally {
    rmSync(cwd, { recursive: true });
  }
});

test("Cursor candidate aggregation lets an ask dominate an earlier inform", async () => {
  const cwd = mkdtempSync(join(tmpdir(), "cursor-candidate-rank-"));
  clearUserGuards();
  registerGuard((ctx) => ctx.command === "echo advisory"
    ? { kind: "inform", title: "Advisory", reason: "test advisory" }
    : null);
  try {
    const prompt = await gateCommandCandidates(gateInput(cwd), ["echo advisory", "apt-get install jq"]);
    expect(prompt).toMatchObject({ kind: "ask", title: "Dependency install" });
  } finally {
    clearUserGuards();
    rmSync(cwd, { recursive: true });
  }
});

test("Cursor candidate bookkeeping records only the decisive outcome", async () => {
  const cwd = mkdtempSync(join(tmpdir(), "cursor-candidate-one-shot-"));
  try {
    await gateCommandCandidates(gateInput(cwd), [rootBenign, destructive]);
    const state = loadState(join(cwd, ONE_SHOT_SIDECAR));
    expect(state.firstTry).toBe(0);
    expect(state.gates["Dangerous command"]?.denies).toBe(1);
  } finally {
    rmSync(cwd, { recursive: true });
  }
});

test("Cursor deny-loop identity uses the decisive candidate, not the shared root", async () => {
  const cwd = mkdtempSync(join(tmpdir(), "cursor-candidate-deny-loop-"));
  try {
    const first = await gateCommandCandidates(gateInput(cwd, 1000), [rootBenign, destructive]);
    const second = await gateCommandCandidates(gateInput(cwd, 4000), [rootBenign, "rm -rf /etc"]);
    const retry = await gateCommandCandidates(gateInput(cwd, 7000), [rootBenign, "rm -rf /etc"]);
    expect(first?.title).toBe("Dangerous command");
    expect(second?.title).toBe("Dangerous command");
    expect(retry?.title).toBe("[REPEAT] Dangerous command");
  } finally {
    rmSync(cwd, { recursive: true });
  }
});
