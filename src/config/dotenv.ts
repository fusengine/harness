/**
 * Native .env loader. Ports the claude-plugins `services/env-file.ts`
 * (`loadEnvFile`) into the engine so a hook run hydrates `process.env` from the
 * harness home `.env` (`~/.claude/.env`, `~/.codex/.env`, …) plus the project
 * `<cwd>/.env`, instead of relying on Bun auto-dotenv or `BASH_ENV`. A value
 * already present in the environment always wins (the file never overwrites it).
 */
import { existsSync, readFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import { harnessHome } from "./home-dir";
import type { HarnessId } from "../detect/harness";

/** Home config dir holding the `.env` for each harness (defaults to `.claude`). */
export const HOME_DIR: Partial<Record<HarnessId, string>> = {
  "claude-code": ".claude", codex: ".codex", cursor: ".cursor",
  cline: ".clinerules", "gemini-cli": ".gemini", opencode: ".opencode",
  hermes: ".hermes", kimi: ".kimi-code",
};

/** Parse a `.env` file into a key→value map (`export KEY="v"` or `KEY=v`). */
export function parseEnvFile(path: string): Record<string, string> {
  if (!existsSync(path)) return {};
  let content = "";
  try { content = readFileSync(path, "utf-8"); } catch { return {}; }
  const out: Record<string, string> = {};
  for (const line of content.split(/\r?\n/)) {
    if (line.trimStart().startsWith("#")) continue;
    const m = line.match(/^\s*(?:export\s+)?(\w+)\s*=\s*["']?([^"'\n]*)["']?\s*$/);
    if (m?.[1]) out[m[1]] = m[2] ?? "";
  }
  return out;
}

/** The `.env` paths probed for a harness: home `.env` then `<cwd>/.env`. */
export function envCandidates(id: HarnessId, home: string = homedir(), cwd: string = process.cwd()): string[] {
  return [join(harnessHome(id, process.env, home), ".env"), join(cwd, ".env")];
}

/**
 * Load `.env` files into `env` without overwriting existing keys. Reads the
 * harness home `.env` then `<cwd>/.env`. Best-effort (missing/unreadable files
 * are skipped) so a hook never fails on env loading.
 * @param id - Detected harness id (selects the home dir).
 * @param env - Target environment (defaults to `process.env`).
 * @param home - Home dir.
 * @param cwd - Project root.
 */
export function loadDotenv(id: HarnessId, env: NodeJS.ProcessEnv = process.env, home: string = homedir(), cwd: string = process.cwd()): void {
  for (const path of envCandidates(id, home, cwd)) {
    for (const [k, v] of Object.entries(parseEnvFile(path))) {
      if (env[k] === undefined) env[k] = v;
    }
  }
}
