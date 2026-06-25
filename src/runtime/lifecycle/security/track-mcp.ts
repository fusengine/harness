/**
 * Security MCP-research tracker (PostToolUse context7/exa). Ports
 * `track-mcp-research.py`: logs documentation queries to today's state.
 */
import { homedir } from "node:os";
import { isoUtc, loadSecurityState, saveSecurityState } from "./skill-state";

/** A recorded MCP research call. */
interface ResearchEntry {
  timestamp: string;
  tool: string;
  query: string;
}

/**
 * Append a context7/exa research call to today's security state. No-op for other
 * tools. No stdout.
 * @param tool - The tool name.
 * @param input - The tool input (query/libraryId/libraryName).
 * @param now - Clock.
 * @param home - Home dir.
 */
export function trackMcpResearch(tool: string, input: Record<string, unknown>, now: number = Date.now(), home: string = homedir()): void {
  if (!tool.includes("context7") && !tool.includes("exa")) return;
  const query = String(input.query ?? input.libraryId ?? input.libraryName ?? "");
  const state = loadSecurityState(now, home) as { skill_read?: boolean; reads?: unknown[]; research?: ResearchEntry[] };
  (state.research ??= []).push({ timestamp: isoUtc(now), tool, query });
  saveSecurityState(state, now, home);
}
