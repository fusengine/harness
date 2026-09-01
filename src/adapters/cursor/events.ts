import type { CursorEventContract } from "./interfaces/types";

const EVENT_CONTRACTS = {
  sessionStart: { phase: "pre", lifecycle: "SessionStart", response: "session-context", blockable: false, known: true },
  sessionEnd: { phase: "post", lifecycle: "SessionEnd", response: "neutral", blockable: false, known: true },
  beforeSubmitPrompt: { phase: "pre", lifecycle: "UserPromptSubmit", response: "submit-control", blockable: true, known: true },
  preCompact: { phase: "pre", lifecycle: "PreCompact", response: "compact-notice", blockable: false, known: true },
  subagentStart: { phase: "pre", lifecycle: "SubagentStart", response: "permission", blockable: true, known: true },
  subagentStop: { phase: "post", lifecycle: "SubagentStop", response: "followup", blockable: false, known: true },
  preToolUse: { phase: "pre", lifecycle: "PreToolUse", response: "permission", blockable: true, known: true },
  postToolUse: { phase: "post", lifecycle: "PostToolUse", response: "post-context", blockable: false, known: true },
  postToolUseFailure: { phase: "post", lifecycle: "PostToolUseFailure", response: "neutral", blockable: false, known: true },
  beforeShellExecution: { phase: "pre", lifecycle: "BeforeShellExecution", response: "permission", blockable: true, known: true },
  afterShellExecution: { phase: "post", lifecycle: "AfterShellExecution", response: "neutral", blockable: false, known: true },
  beforeMCPExecution: { phase: "pre", lifecycle: "BeforeMCPExecution", response: "permission", blockable: true, known: true },
  afterMCPExecution: { phase: "post", lifecycle: "AfterMCPExecution", response: "neutral", blockable: false, known: true },
  beforeReadFile: { phase: "pre", lifecycle: "BeforeReadFile", response: "permission", blockable: true, known: true },
  afterFileEdit: { phase: "post", lifecycle: "AfterFileEdit", response: "neutral", blockable: false, known: true },
  beforeTabFileRead: { phase: "pre", lifecycle: "BeforeTabFileRead", response: "permission", blockable: true, known: true },
  afterTabFileEdit: { phase: "post", lifecycle: "AfterTabFileEdit", response: "neutral", blockable: false, known: true },
  afterAgentResponse: { phase: "post", lifecycle: "AfterAgentResponse", response: "neutral", blockable: false, known: true },
  afterAgentThought: { phase: "post", lifecycle: "AfterAgentThought", response: "neutral", blockable: false, known: true },
  stop: { phase: "post", lifecycle: "Stop", response: "followup", blockable: false, known: true },
  workspaceOpen: { phase: "pre", lifecycle: "WorkspaceOpen", response: "plugin-paths", blockable: false, known: true },
} as const satisfies Record<string, CursorEventContract>;

const UNKNOWN_EVENT: CursorEventContract = {
  phase: "post",
  lifecycle: null,
  response: "neutral",
  blockable: false,
  known: false,
};

/** Return explicit routing and response metadata for a Cursor event name. */
export function cursorEventContract(eventName: string): CursorEventContract {
  return EVENT_CONTRACTS[eventName as keyof typeof EVENT_CONTRACTS] ?? UNKNOWN_EVENT;
}
