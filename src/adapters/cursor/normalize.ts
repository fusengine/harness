import { commandToString } from "../../runtime/command-string";
import { cursorEventContract } from "./events";
import { cursorAbsolutePath, cursorPath, cursorWorkspaceRoots } from "./context";
import type { CursorExtractedEvent } from "./interfaces/types";

function record(value: unknown): Record<string, unknown> | undefined {
  return typeof value === "object" && value !== null && !Array.isArray(value)
    ? value as Record<string, unknown>
    : undefined;
}

function str(value: unknown): string | undefined {
  return typeof value === "string" ? value : undefined;
}

function inputRecord(value: unknown): Record<string, unknown> | undefined {
  const direct = record(value);
  if (direct || typeof value !== "string") return direct;
  try {
    return record(JSON.parse(value));
  } catch {
    return undefined;
  }
}

const MCP_ROOT_FIELDS = ["mcp_server_name", "mcp_server_url", "url", "result_json", "duration"] as const;

function cursorMcpInput(raw: Record<string, unknown>, input: Record<string, unknown>): Record<string, unknown> {
  const merged = { ...input };
  for (const field of MCP_ROOT_FIELDS) {
    if (Object.hasOwn(raw, field)) merged[field] = raw[field];
  }
  return merged;
}

function sanitizedCursorInput(input: Record<string, unknown>): Record<string, unknown> {
  const safe = { ...input };
  if (typeof safe.file_path === "string" && cursorPath(safe.file_path) === undefined) delete safe.file_path;
  if (typeof safe.path === "string" && cursorPath(safe.path) === undefined) delete safe.path;
  if (Object.hasOwn(safe, "cwd")) {
    const cwd = cursorAbsolutePath(safe.cwd);
    if (cwd) safe.cwd = cwd;
    else delete safe.cwd;
  }
  if (Object.hasOwn(safe, "workspace_roots")) {
    if (Array.isArray(safe.workspace_roots)) safe.workspace_roots = cursorWorkspaceRoots(safe.workspace_roots);
    else delete safe.workspace_roots;
  }
  return safe;
}

function cursorToolName(raw: Record<string, unknown>, event: string, tool: string | undefined, hasCommand: boolean): string {
  if (hasCommand) return "Bash";
  const server = str(raw.mcp_server_name)?.trim().replace(/[^A-Za-z0-9_-]+/g, "_");
  if (/^(before|after)MCPExecution$/i.test(event) && server && tool && !tool.startsWith("mcp__")) {
    return `mcp__${server}__${tool}`;
  }
  if (tool === "Write") return "Edit";
  return tool ?? "";
}

function cursorCommands(raw: Record<string, unknown>, input: Record<string, unknown>): string[] {
  const candidates = [commandToString(raw.command), commandToString(input.command)]
    .filter((candidate): candidate is string => candidate !== undefined);
  return [...new Set(candidates)];
}

/**
 * Extract one Cursor hook payload into the shared runtime shape.
 *
 * @param payload - Cursor hook stdin payload.
 * @returns Cursor-specific phase, tool, command, and edit fields.
 */
export function extractCursorEvent(payload: object): CursorExtractedEvent {
  const raw = payload as Record<string, unknown>;
  const hookEvent = str(raw.hook_event_name) ?? "";
  const parsedInput = inputRecord(raw.tool_input);
  const mcpInput = parsedInput && /^(before|after)MCPExecution$/i.test(hookEvent)
    ? cursorMcpInput(raw, parsedInput)
    : parsedInput;
  const input = sanitizedCursorInput(mcpInput ?? raw);
  const contract = cursorEventContract(hookEvent);
  const metadata = {
    eventName: hookEvent,
    lifecycleEvent: contract.lifecycle,
    responseKind: contract.response,
    blockable: contract.blockable,
    cwd: cursorAbsolutePath(raw.cwd),
    workspaceRoots: cursorWorkspaceRoots(raw.workspace_roots),
  };
  if (!contract.known) {
    return { ...metadata, phase: contract.phase, tool: "", input };
  }
  const afterFileEdit = /^afterFileEdit$/i.test(hookEvent);
  const beforeReadFile = /^beforeReadFile$/i.test(hookEvent);
  const beforeTabFileRead = /^beforeTabFileRead$/i.test(hookEvent);
  const edits = Array.isArray(raw.edits)
    ? raw.edits.map(record).filter((edit): edit is Record<string, unknown> => edit !== undefined)
    : [];
  const filePath = cursorPath(raw.file_path);
  if (filePath && edits.length > 0) {
    const files = edits.map((edit) => ({
      filePath,
      oldString: str(edit.old_string),
      content: str(edit.new_string) ?? "",
      op: "update" as const,
    }));
    return { ...metadata, phase: contract.phase, tool: "Edit", input, filePath, content: files.map((file) => file.content).join("\n"), files };
  }
  const commands = cursorCommands(raw, input);
  const command = commands[0];
  return {
    ...metadata,
    phase: contract.phase,
    tool: afterFileEdit ? "Edit" : beforeReadFile || beforeTabFileRead ? "Read" : cursorToolName(raw, hookEvent, str(raw.tool_name), command !== undefined),
    input,
    filePath: cursorPath(input.file_path) ?? cursorPath(input.path),
    content: str(input.content) ?? str(input.new_string),
    oldString: str(input.old_string),
    command,
    commandCandidates: /^beforeMCPExecution$/i.test(hookEvent) && commands.length > 0 ? commands : undefined,
  };
}
