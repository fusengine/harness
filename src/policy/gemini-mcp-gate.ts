/**
 * @module gemini-mcp-gate
 * OPT-IN gate porting core-guards `enforce-gemini-mcp.py`: when enabled via
 * `FUSE_ENFORCE_GEMINI_MCP`, blocks a UI write (`.tsx/.jsx/.vue/.svelte`) that
 * hand-writes >= 3 Tailwind utility classes unless a `mcp__gemini-design__*`
 * call was made this session. DISABLED BY DEFAULT — the flag is read fresh on
 * every call, so nothing is gated unless the owner explicitly turns it on (a
 * gate blocking a common dev action must never be always-on).
 * @packageDocumentation
 */
import type { Prompt } from "../prompt/types";
import type { AuthEntry } from "../freshness/doc-helpers";

/** UI file extensions the gate polices (parity enforce-gemini-mcp.py UI_EXT). */
const UI_EXT_RE = /\.(tsx|jsx|vue|svelte)$/;
/** Paths exempt from the gate (parity EXEMPT_DIRS). */
const GEMINI_EXEMPT_RE = /(node_modules|dist|build|\.next|\.claude)\//;
/** A live `mcp__gemini-design__*` call recorded this session proves consultation. */
const GEMINI_MCP_SOURCE_RE = /gemini-mcp/i;
/** Tailwind utility patterns (parity TAILWIND_PATTERNS). */
const TW_PATTERNS: readonly RegExp[] = [
  /\bflex\b/, /\bgrid\b/, /\bp-\d/, /\bpx-\d/, /\bpy-\d/,
  /\bm-\d/, /\bmx-\d/, /\bmy-\d/, /\bmt-\d/, /\bmb-\d/,
  /\bbg-\w+/, /\btext-\w+/, /\brounded/, /\bshadow/,
  /\bborder\b/, /\bgap-\d/, /\bw-\w+/, /\bh-\w+/,
  /\bjustify-\w+/, /\bitems-\w+/, /\bspace-\w+-\d/,
];
/** Min distinct Tailwind patterns before the gate fires (parity MIN_TAILWIND_CLASSES). */
const MIN_TW = 3;
/** Min newlines an Edit's new_string must have to be gated (parity MIN_LINES_FOR_EDIT). */
const MIN_LINES_EDIT = 2;

/** OPT-IN: off unless `FUSE_ENFORCE_GEMINI_MCP` is `1`/`true`. Read fresh each call (dynamic). */
export function geminiMcpEnforced(): boolean {
  const v = process.env.FUSE_ENFORCE_GEMINI_MCP;
  return v === "1" || v === "true";
}

/** Count distinct Tailwind utility patterns present in `content` (parity count_tailwind_classes). */
function countTailwindClasses(content: string): number {
  return TW_PATTERNS.reduce((n, re) => (re.test(content) ? n + 1 : n), 0);
}

/** Session evidence the gate consumes. */
export interface GeminiEvidence {
  authorizations?: Record<string, AuthEntry>;
  sessionId: string;
}

/** True when a `mcp__gemini-design__*` call was recorded this session (parity gemini_was_called). */
export function geminiMcpConsulted(authorizations: Record<string, AuthEntry> | undefined, sessionId: string): boolean {
  if (!authorizations) return false;
  return Object.values(authorizations).some(
    (a) => a.doc_sessions?.includes(sessionId) && (a.sources ?? (a.source ? [a.source] : [])).some((s) => GEMINI_MCP_SOURCE_RE.test(s)),
  );
}

/**
 * Gate a UI write when `FUSE_ENFORCE_GEMINI_MCP` is on: block hand-written
 * Tailwind (>= 3 classes) in a `.tsx/.jsx/.vue/.svelte` file unless a Gemini
 * Design MCP call was made this session. Returns `null` when disabled (default),
 * out of scope, or already satisfied.
 * @param tool - the tool name.
 * @param filePath - the file being written.
 * @param content - the written content (new_string on Edit).
 * @param ev - session evidence (authorizations + sessionId).
 */
export function geminiMcpGate(tool: string, filePath: string, content: string, ev: GeminiEvidence): Prompt | null {
  if (!geminiMcpEnforced()) return null;
  if (tool !== "Write" && tool !== "Edit") return null;
  if (!filePath || !UI_EXT_RE.test(filePath) || GEMINI_EXEMPT_RE.test(filePath)) return null;
  if (!content) return null;
  if (tool === "Edit" && (content.match(/\n/g)?.length ?? 0) < MIN_LINES_EDIT) return null;
  if (countTailwindClasses(content) < MIN_TW) return null;
  if (geminiMcpConsulted(ev.authorizations, ev.sessionId)) return null;
  return {
    kind: "block",
    title: "Gemini Design MCP",
    reason:
      "BLOCKED: UI code with Tailwind detected but Gemini Design MCP not used. Use mcp__gemini-design__create_frontend, modify_frontend, or snippet_frontend BEFORE writing UI code manually.",
    actions: ["Call mcp__gemini-design__create_frontend / modify_frontend / snippet_frontend, then retry"],
  };
}
