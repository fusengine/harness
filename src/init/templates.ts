/**
 * Wiring file templates per harness, registering `harness hook <id>` for BOTH
 * phases: PRE (gate the edit) and POST (catch-all → `activityFor` filters what
 * to record). Formats verified against each harness's 2026 hook docs.
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

/** Claude Code: `.claude/settings.json` — PreToolUse(Write|Edit) + PostToolUse(all). */
export function claudeInit(command: string): InitFile[] {
  return [{
    path: ".claude/settings.json",
    content: json({ hooks: {
      PreToolUse: [{ matcher: "Write|Edit|Bash", hooks: [{ type: "command", command }] }],
      PostToolUse: [{ matcher: "", hooks: [{ type: "command", command }] }],
    } }),
  }];
}

/** Codex CLI: `.codex/hooks.json` (Claude-compatible shape). */
export function codexInit(command: string): InitFile[] {
  return [{
    path: ".codex/hooks.json",
    content: json({ hooks: {
      PreToolUse: [{ matcher: "Bash|apply_patch", hooks: [{ type: "command", command }] }],
      PostToolUse: [{ matcher: "", hooks: [{ type: "command", command }] }],
    } }),
  }];
}

/** Cursor: `.cursor/hooks.json` (version 1) — shell + tool gate + file-edit observe. */
export function cursorInit(command: string): InitFile[] {
  return [{
    path: ".cursor/hooks.json",
    content: json({ version: 1, hooks: {
      beforeShellExecution: [{ command }],
      preToolUse: [{ command }],
      afterFileEdit: [{ command }],
    } }),
  }];
}

/** Gemini CLI: `.gemini/settings.json` — BeforeTool(edits) + AfterTool(all, regex). */
export function geminiInit(command: string): InitFile[] {
  return [{
    path: ".gemini/settings.json",
    content: json({ hooks: {
      BeforeTool: [{ matcher: "write_file|edit_file|replace", hooks: [{ type: "command", command, timeout: 30000 }] }],
      AfterTool: [{ matcher: ".*", hooks: [{ type: "command", command, timeout: 30000 }] }],
    } }),
  }];
}

/** Cline: executable `.clinerules/hooks/PreToolUse` + `PostToolUse` piping stdin. */
export function clineInit(command: string): InitFile[] {
  const script = (phase: string): string => `#!/usr/bin/env bash\n# fuse-harness Cline ${phase} hook\ncat | ${command}\n`;
  return [
    { path: ".clinerules/hooks/PreToolUse", content: script("pre"), executable: true },
    { path: ".clinerules/hooks/PostToolUse", content: script("post"), executable: true },
  ];
}
