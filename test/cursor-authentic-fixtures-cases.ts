/** One fixture's expected outcome + which normalized-extraction fields are meaningful to check. */
export interface FixtureCase {
  /** Path under `test/fixtures/cursor/`, e.g. `preToolUse/05-read-minimal.json`. */
  relPath: string;
  /** MCP fixtures assert stdout bytes + exit ONLY (mandate scope). */
  isMcp: boolean;
  /**
   * Expected exact stdout bytes, or `null` for the one fixture (`sessionStart`)
   * whose `additional_context` embeds this repo's own live harness version and
   * git-branch reconciliation snapshot — asserted structurally instead (see
   * cursor-native-bytes.test.ts for the identical, more-detailed rationale).
   */
  expectedStdout: string | null;
  /** Where the raw stdin carries the file path to compare against `normalized.filePath`. */
  filePathSource?: "top" | "tool_input";
  /** True when the raw stdin carries a top-level `cwd` (Shell-shaped events). */
  hasTopCwd?: boolean;
}

/**
 * All 23 fixtures under `test/fixtures/cursor/` (8 authentic + 14
 * binary-verified synthetic + 1 synthetic multi-root augmentation), each
 * mapped to its neutral/allow-path stdout — captured via direct `handleHook`
 * invocation (rebased onto an isolated temp project dir) and cross-checked
 * against the documented native contract in native-schemas.ts.
 */
export const FIXTURE_CASES: FixtureCase[] = [
  { relPath: "afterFileEdit/01-synthetic.json", isMcp: false, expectedStdout: "{}", filePathSource: "top" },
  { relPath: "afterMCPExecution/01-synthetic.json", isMcp: true, expectedStdout: "{}" },
  { relPath: "afterShellExecution/01-synthetic.json", isMcp: false, expectedStdout: "{}", hasTopCwd: true },
  { relPath: "beforeMCPExecution/01-synthetic.json", isMcp: true, expectedStdout: '{"permission":"allow"}' },
  { relPath: "beforeReadFile/01-synthetic.json", isMcp: false, expectedStdout: '{"permission":"allow"}', filePathSource: "top" },
  { relPath: "beforeShellExecution/01-synthetic.json", isMcp: false, expectedStdout: '{"permission":"allow"}', hasTopCwd: true },
  { relPath: "beforeSubmitPrompt/01-agent-mode-no-attachments.json", isMcp: false, expectedStdout: "{}" },
  { relPath: "postToolUse/01-synthetic.json", isMcp: false, expectedStdout: "{}", filePathSource: "tool_input", hasTopCwd: true },
  { relPath: "postToolUseFailure/01-synthetic.json", isMcp: false, expectedStdout: "{}", filePathSource: "tool_input" },
  { relPath: "preCompact/01-synthetic.json", isMcp: false, expectedStdout: "{}" },
  { relPath: "preToolUse/01-task-main-conversation.json", isMcp: false, expectedStdout: '{"permission":"allow"}' },
  { relPath: "preToolUse/02-shell-top-level-cwd.json", isMcp: false, expectedStdout: '{"permission":"allow"}', hasTopCwd: true },
  { relPath: "preToolUse/03-write-subagent-null-transcript.json", isMcp: false, expectedStdout: '{"permission":"allow"}', filePathSource: "tool_input" },
  { relPath: "preToolUse/04-grep-glob-output-mode.json", isMcp: false, expectedStdout: '{"permission":"allow"}', filePathSource: "tool_input" },
  { relPath: "preToolUse/05-read-minimal.json", isMcp: false, expectedStdout: '{"permission":"allow"}', filePathSource: "tool_input" },
  { relPath: "preToolUse/06-task-resume-interrupt.json", isMcp: false, expectedStdout: '{"permission":"allow"}' },
  { relPath: "preToolUse/07-multi-root-synthetic.json", isMcp: false, expectedStdout: '{"permission":"allow"}', filePathSource: "tool_input" },
  { relPath: "sessionEnd/01-synthetic.json", isMcp: false, expectedStdout: "{}" },
  { relPath: "sessionStart/01-empty-window-claude-user-config.json", isMcp: false, expectedStdout: null },
  { relPath: "stop/01-synthetic.json", isMcp: false, expectedStdout: "{}" },
  { relPath: "subagentStart/01-synthetic.json", isMcp: false, expectedStdout: '{"permission":"allow"}' },
  { relPath: "subagentStop/01-synthetic.json", isMcp: false, expectedStdout: "{}" },
  { relPath: "workspaceOpen/01-synthetic.json", isMcp: false, expectedStdout: "{}" },
];
