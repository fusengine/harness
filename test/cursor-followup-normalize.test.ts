import { expect, test } from "bun:test";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { handleHook } from "../src/runtime/handle";
import { normalizeEvent } from "../src/runtime/normalize";

const destructive = ["rm", "-rf", "/"].join(" ");

test("Cursor afterFileEdit remains post for degenerate edits payloads", () => {
  const variants: unknown[] = [[], undefined, null, { old_string: "a", new_string: "b" }];
  for (const edits of variants) {
    const payload: Record<string, unknown> = {
      hook_event_name: "afterFileEdit",
      file_path: "/project/app.ts",
    };
    if (edits !== undefined) payload.edits = edits;
    const event = normalizeEvent("cursor", payload);
    expect([event.phase, event.tool, event.filePath]).toEqual(["post", "Edit", "/project/app.ts"]);
  }
});

test("Cursor postToolUse shell commands are post and never denied", async () => {
  const cwd = mkdtempSync(join(tmpdir(), "cursor-post-tool-"));
  const payload = {
    hook_event_name: "postToolUse",
    session_id: "post-tool",
    tool_name: "Shell",
    tool_input: { command: destructive },
  };
  try {
    expect(normalizeEvent("cursor", payload).phase).toBe("post");
    const outcome = await handleHook("cursor", payload, { now: 1000, cwd });
    expect(outcome).toEqual({ stdout: "{}", exit: 0 });
  } finally {
    rmSync(cwd, { recursive: true });
  }
});

test("Cursor afterShellExecution commands are post and never denied", async () => {
  const cwd = mkdtempSync(join(tmpdir(), "cursor-after-shell-"));
  const payload = {
    hook_event_name: "afterShellExecution",
    session_id: "after-shell",
    command: destructive,
  };
  try {
    expect(normalizeEvent("cursor", payload).phase).toBe("post");
    const outcome = await handleHook("cursor", payload, { now: 1000, cwd });
    expect(outcome).toEqual({ stdout: "{}", exit: 0 });
  } finally {
    rmSync(cwd, { recursive: true });
  }
});

test("Cursor beforeReadFile remains pre and returns native allow", async () => {
  const cwd = mkdtempSync(join(tmpdir(), "cursor-before-read-"));
  const payload = {
    hook_event_name: "beforeReadFile",
    session_id: "before-read",
    file_path: "/project/app.ts",
  };
  try {
    const event = normalizeEvent("cursor", payload);
    expect([event.phase, event.tool, event.filePath]).toEqual(["pre", "Read", "/project/app.ts"]);
    expect(event.input.file_path).toBe("/project/app.ts");
    expect(await handleHook("cursor", payload, { now: 1000, cwd })).toEqual({ stdout: '{"permission":"allow"}', exit: 0 });
  } finally {
    rmSync(cwd, { recursive: true });
  }
});

test("Cursor beforeShellExecution and preToolUse still deny destructive commands", async () => {
  const cwd = mkdtempSync(join(tmpdir(), "cursor-pre-controls-"));
  const payloads = [
    { hook_event_name: "beforeShellExecution", command: destructive },
    { hook_event_name: "preToolUse", tool_name: "Shell", tool_input: { command: destructive } },
  ];
  try {
    for (const payload of payloads) {
      expect(normalizeEvent("cursor", payload).phase).toBe("pre");
      const outcome = await handleHook("cursor", payload, { now: 1000, cwd });
      expect(JSON.parse(outcome.stdout).permission).toBe("deny");
    }
  } finally {
    rmSync(cwd, { recursive: true });
  }
});

test("Cursor command-bearing tool aliases normalize to Bash and deny", async () => {
  const cwd = mkdtempSync(join(tmpdir(), "cursor-command-aliases-"));
  try {
    for (const tool_name of ["Terminal", "shell", "MCP:run_command"]) {
      const payload = {
        hook_event_name: "preToolUse",
        session_id: `alias-${tool_name}`,
        tool_name,
        tool_input: { command: destructive },
      };
      expect(normalizeEvent("cursor", payload).tool).toBe("Bash");
      const outcome = await handleHook("cursor", payload, { now: 1000, cwd });
      expect(JSON.parse(outcome.stdout).permission).toBe("deny");
    }
  } finally {
    rmSync(cwd, { recursive: true });
  }
});

test("Cursor beforeMCPExecution parses JSON input and gates root plus nested commands", async () => {
  const cwd = mkdtempSync(join(tmpdir(), "cursor-before-mcp-"));
  const nestedSafe = ["git", "status"].join(" ");
  const rootPayload = {
    hook_event_name: "beforeMCPExecution",
    session_id: "mcp-root",
    tool_name: "run_command",
    command: destructive,
    tool_input: JSON.stringify({ command: nestedSafe, arguments: { cwd } }),
  };
  const nestedPayload = {
    hook_event_name: "beforeMCPExecution",
    session_id: "mcp-nested",
    tool_name: "run_command",
    tool_input: JSON.stringify({ command: destructive }),
  };
  try {
    const root = normalizeEvent("cursor", rootPayload);
    expect([root.tool, root.command, root.commandCandidates, root.input.command])
      .toEqual(["Bash", destructive, [destructive, nestedSafe], nestedSafe]);
    const nested = normalizeEvent("cursor", nestedPayload);
    expect([nested.tool, nested.command]).toEqual(["Bash", destructive]);
    for (const payload of [rootPayload, nestedPayload]) {
      const outcome = await handleHook("cursor", payload, { now: 1000, cwd });
      expect(JSON.parse(outcome.stdout).permission).toBe("deny");
    }
  } finally {
    rmSync(cwd, { recursive: true });
  }
});

test("Cursor malformed JSON fails safely and commandless MCP tools keep their name", () => {
  const invalid = normalizeEvent("cursor", {
    hook_event_name: "beforeMCPExecution",
    tool_name: "lookup",
    tool_input: "{not-json",
  });
  expect([invalid.tool, invalid.command, invalid.input.tool_input]).toEqual(["lookup", undefined, "{not-json"]);

  const commandless = normalizeEvent("cursor", {
    hook_event_name: "preToolUse",
    tool_name: "MCP:lookup",
    tool_input: JSON.stringify({ query: "value" }),
  });
  expect([commandless.tool, commandless.command, commandless.input.query]).toEqual(["MCP:lookup", undefined, "value"]);
});

test("Cursor JSON tool input preserves prototype keys without polluting prototypes", () => {
  const before = (Object.prototype as Record<string, unknown>).polluted;
  const event = normalizeEvent("cursor", {
    hook_event_name: "beforeMCPExecution",
    tool_name: "lookup",
    tool_input: '{"__proto__":{"polluted":true},"constructor":{"prototype":{"polluted":true}}}',
  });
  expect(Object.hasOwn(event.input, "__proto__")).toBe(true);
  expect(Object.getPrototypeOf(event.input)).toBe(Object.prototype);
  expect((Object.prototype as Record<string, unknown>).polluted).toBe(before);
});
