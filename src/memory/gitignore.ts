import { existsSync, readFileSync, writeFileSync } from "node:fs";

/** Ensure `<memoryDir>/.gitignore` ignores the machine-local `state.json`. */
export function ensureMemoryGitignore(memoryDir: string): void {
  const file = `${memoryDir}/.gitignore`;
  try {
    const existing = existsSync(file) ? readFileSync(file, "utf8") : "";
    if (/^state\.json$/m.test(existing)) return;
    const next = existing.trim() ? `${existing.trimEnd()}\nstate.json\n` : "state.json\n";
    writeFileSync(file, next);
  } catch {
    /* non-fatal: memory must never block a session */
  }
}
