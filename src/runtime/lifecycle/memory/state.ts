/**
 * fuse-memory-neural scope state: per-line logs under
 * `~/.claude/logs/00-memory` + project-type detection. Ports the shared
 * filesystem helpers of the four memory-neural scripts.
 */
import { appendFileSync, existsSync, mkdirSync, readFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import { claudeHome } from "../../home-state";
import { atomicWrite } from "../../../util/json-io";

/** `~/.claude/logs/00-memory` log directory. */
export function memoryLogDir(home: string = homedir()): string {
  return join(claudeHome(home), "logs", "00-memory");
}

/**
 * Append a line to a memory log file, creating the dir. When `rotateAt > 0` and
 * the file exceeds it, keep only the newest `keep` lines. Best-effort (errors
 * swallowed), so a hook never fails on a logging issue.
 * @param name - Log file name (e.g. `operations.log`).
 * @param line - Line to append (newline added).
 * @param rotateAt - Rotate when line count exceeds this (0 disables).
 * @param keep - Lines to keep on rotation.
 * @param home - Home dir.
 */
export function appendMemoryLog(name: string, line: string, rotateAt = 0, keep = 0, home: string = homedir()): void {
  const dir = memoryLogDir(home);
  try {
    mkdirSync(dir, { recursive: true });
    const file = join(dir, name);
    appendFileSync(file, `${line}\n`, "utf-8");
    if (rotateAt > 0) {
      const lines = readFileSync(file, "utf-8").split("\n").filter((l) => l.length > 0);
      if (lines.length > rotateAt) atomicWrite(file, `${lines.slice(-keep).join("\n")}\n`);
    }
  } catch { /* best effort */ }
}

/** Detect the project type from cwd markers (mirrors recall-on-session.py). */
export function detectProjectType(cwd: string): string {
  const markers: Array<[string, string]> = [
    ["package.json", "node"], ["composer.json", "php"],
    ["Package.swift", "swift"], ["Cargo.toml", "rust"], ["go.mod", "go"],
  ];
  for (const [f, t] of markers) if (existsSync(join(cwd, f))) return t;
  if (existsSync(join(cwd, "requirements.txt")) || existsSync(join(cwd, "pyproject.toml"))) return "python";
  return "unknown";
}
