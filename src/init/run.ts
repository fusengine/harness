import { chmodSync, mkdirSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import type { HarnessId } from "../detect/harness";
import { claudeInit, clineInit, codexInit, cursorInit, geminiInit, type InitFile } from "./templates";
import { STATE_GITIGNORE, STATE_ROOT } from "../config/layout";

const RUNNERS: Partial<Record<HarnessId, (command: string) => InitFile[]>> = {
  "claude-code": claudeInit,
  codex: codexInit,
  cursor: cursorInit,
  "gemini-cli": geminiInit,
  cline: clineInit,
};

/**
 * Build the wiring file(s) for a harness, or null when it has no hook
 * integration (cli-mode harnesses use `harness check` in a pre-commit step).
 */
export function initFor(id: HarnessId, command: string = `npx -y @fusengine/harness hook ${id}`): InitFile[] | null {
  const make = RUNNERS[id];
  if (!make) return null;
  return [...make(command), { path: `${STATE_ROOT}/.gitignore`, content: STATE_GITIGNORE }];
}

/** Write an {@link InitFile} under `root` (creates dirs; `chmod +x` when executable). */
export function writeInitFile(root: string, file: InitFile): string {
  const full = join(root, file.path);
  mkdirSync(dirname(full), { recursive: true });
  writeFileSync(full, file.content);
  if (file.executable) chmodSync(full, 0o755);
  return full;
}
