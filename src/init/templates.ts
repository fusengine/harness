/**
 * Wiring file templates per harness, to register `harness hook <id>` as a
 * tool-use hook. Formats verified against each harness's 2026 hook docs.
 */

/** A file to write during `harness init`. */
export interface InitFile {
  path: string;
  content: string;
  executable?: boolean;
}

function json(obj: unknown): string {
  return `${JSON.stringify(obj, null, 2)}\n`;
}

/** Claude Code: PreToolUse(Write|Edit) -> command. Target: `.claude/settings.json`. */
export function claudeInit(command: string): InitFile {
  return {
    path: ".claude/settings.json",
    content: json({ hooks: { PreToolUse: [{ matcher: "Write|Edit", hooks: [{ type: "command", command }] }] } }),
  };
}

/** Codex CLI: `.codex/hooks.json` — PreToolUse (Claude-compatible shape). */
export function codexInit(command: string): InitFile {
  return {
    path: ".codex/hooks.json",
    content: json({ hooks: { PreToolUse: [{ matcher: "Bash|apply_patch", hooks: [{ type: "command", command }] }] } }),
  };
}

/** Cursor: `.cursor/hooks.json` (version 1) — shell + file-edit hooks. */
export function cursorInit(command: string): InitFile {
  return {
    path: ".cursor/hooks.json",
    content: json({ version: 1, hooks: { beforeShellExecution: [{ command }], afterFileEdit: [{ command }] } }),
  };
}

/** Gemini CLI: `.gemini/settings.json` — BeforeTool, timeout in ms. */
export function geminiInit(command: string): InitFile {
  return {
    path: ".gemini/settings.json",
    content: json({ hooks: { BeforeTool: [{ matcher: "write_file|edit_file|replace", hooks: [{ type: "command", command, timeout: 30000 }] }] } }),
  };
}

/** Cline: an executable `.clinerules/hooks/PreToolUse` that pipes stdin to the command. */
export function clineInit(command: string): InitFile {
  return {
    path: ".clinerules/hooks/PreToolUse",
    content: `#!/usr/bin/env bash\n# fuse-harness Cline hook — evaluate each tool use\ncat | ${command}\n`,
    executable: true,
  };
}
