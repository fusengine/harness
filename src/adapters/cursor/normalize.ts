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

/**
 * Closed table: Cursor's `MCP:<tool>` tool_name form on preToolUse/
 * postToolUse/postToolUseFailure LOSES the MCP server name (ground truth:
 * Cursor CLI 3.18.25 + official docs — only beforeMCPExecution/
 * afterMCPExecution carry `mcp_server_name`). This reconstructs the real
 * server for the closed set of tool names this repo's gates actually depend
 * on (GATED_TOOLS in doc-cache-gate.ts, CONTEXT7_SOURCE, RESEARCH_TOOLS,
 * SHOT_TOOLS, gemini-mcp-gate, shadcn-skill-gate) — same closed-table
 * philosophy as `mcp-tool-name.ts`'s Codex aliasing, never a blanket
 * reversal. Coordinator decision: a tool name OUTSIDE this table (server
 * genuinely unrecoverable, and no safe placeholder) is left as Cursor's raw
 * `MCP:<tool>` string — `test/cursor-followup-normalize.test.ts` pins this
 * as the committed contract ("commandless MCP tools keep their name"), so a
 * fabricated `mcp__cursor__<tool>` placeholder is never introduced for the
 * unknown case.
 */
const CURSOR_MCP_TOOL_SERVERS: Readonly<Record<string, string>> = Object.assign(Object.create(null), {
  "query-docs": "context7",
  "resolve-library-id": "context7",
  web_search_exa: "exa",
  get_code_context_exa: "exa",
  deep_researcher_start: "exa",
  deep_researcher_check: "exa",
  create_frontend: "gemini-design",
  modify_frontend: "gemini-design",
  snippet_frontend: "gemini-design",
  search_items_in_registries: "shadcn",
  view_items_in_registries: "shadcn",
  get_item_examples_from_registries: "shadcn",
  get_add_command_for_items: "shadcn",
  get_audit_checklist: "shadcn",
});

/**
 * The real MCP server for a bare Cursor tool name (the part after `MCP:`),
 * or `undefined` when it isn't in the closed table. fuse-browser is inferred
 * from the `browser_*` prefix — every fuse-browser tool is named that way
 * and no other server in this ecosystem uses it — the remaining,
 * non-distinctive tool names go through {@link CURSOR_MCP_TOOL_SERVERS}.
 * NO placeholder fallback (coordinator decision, see {@link CURSOR_MCP_TOOL_SERVERS}):
 * an unknown tool name means the server is genuinely unrecoverable, so the
 * caller leaves the raw `MCP:<tool>` string untouched instead of fabricating one.
 */
function cursorMcpServer(bareTool: string): string | undefined {
  if (bareTool.startsWith("browser_")) return "fuse-browser";
  return CURSOR_MCP_TOOL_SERVERS[bareTool];
}

/**
 * Canonicalize Cursor's `MCP:<tool>` tool_name (preToolUse/postToolUse/
 * postToolUseFailure) into the shared `mcp__<server>__<tool>` shape every
 * other harness/gate expects. Returns `undefined` — meaning "leave the raw
 * `MCP:<tool>` string as-is" — both when `tool` isn't the `MCP:` form and
 * when the bare tool name is outside the closed {@link CURSOR_MCP_TOOL_SERVERS}
 * table (server unrecoverable, no placeholder fabricated).
 */
function cursorBareMcpToolName(tool: string | undefined): string | undefined {
  if (!tool || !tool.startsWith("MCP:")) return undefined;
  const bare = tool.slice(4);
  const server = cursorMcpServer(bare);
  return server ? `mcp__${server}__${bare}` : undefined;
}

function cursorToolName(raw: Record<string, unknown>, event: string, tool: string | undefined, hasCommand: boolean): string {
  if (hasCommand) return "Bash";
  const server = str(raw.mcp_server_name)?.trim().replace(/[^A-Za-z0-9_-]+/g, "_");
  if (/^(before|after)MCPExecution$/i.test(event) && server && tool && !tool.startsWith("mcp__")) {
    return `mcp__${server}__${tool}`;
  }
  const bareMcp = cursorBareMcpToolName(tool);
  if (bareMcp) return bareMcp;
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
