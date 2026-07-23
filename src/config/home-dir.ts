/**
 * Harness home-dir resolution with env overrides. `dotenv.ts`'s static
 * `HOME_DIR` table knows every harness's default config dir but cannot move
 * with the user's data root — Kimi Code CLI documents `KIMI_CODE_HOME` for
 * exactly that (isolated data roots get isolated skills/agents/hooks), so the
 * override is honored here instead of hardcoding `~/.kimi-code`.
 *
 * Deliberately consumed only where a USER-HOME path is built (`envCandidates`
 * today): `harnessHomeSegment` (`policy/apex-target.ts`) also serves
 * project-relative joins (`<project>/.kimi-code/apex`), which an absolute
 * override would corrupt — those sites stay segment-based.
 */
import { homedir } from "node:os";
import { join } from "node:path";
import type { HarnessId } from "../detect/harness";
import { HOME_DIR } from "./dotenv";

/** Documented env var relocating a harness home dir, when one exists. */
const HOME_ENV: Partial<Record<HarnessId, string>> = { kimi: "KIMI_CODE_HOME" };

/**
 * Resolve a harness's home config dir as an absolute path.
 * @param id - Harness id.
 * @param env - Environment (defaults to `process.env`).
 * @param home - OS home dir (injectable for tests).
 * @returns The override path when set, else `join(home, HOME_DIR[id])`.
 */
export function harnessHome(
  id: string,
  env: Record<string, string | undefined> = process.env,
  home: string = homedir(),
): string {
  const key = HOME_ENV[id as HarnessId];
  const override = key ? env[key] : undefined;
  return override ?? join(home, HOME_DIR[id as HarnessId] ?? ".claude");
}
