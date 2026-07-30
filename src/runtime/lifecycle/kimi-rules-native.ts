/**
 * Guard for the kimi notice-only rules injection. Kimi Code CLI has no
 * model-only hook channel (`src/runtime/inform.ts`) — every `UserPromptSubmit`
 * stdout is BOTH appended to the model's context AND rendered raw in the
 * user's terminal. `injectRules` (`inject-rules.ts`) normally re-injects the
 * full ~18 Ko rules corpus on every prompt; when the installer has already
 * merged that same corpus into `<kimiHome>/AGENTS.md` — which Kimi loads
 * natively at session start via its documented `${agents_md}` mechanism,
 * independent of hooks — the re-injection is pure noise the user has to
 * scroll past. Confirmed present, fenced, in the local install:
 * `~/.kimi-code/AGENTS.md:87` / `:335`.
 *
 * Fail-safe semantics: fences absent, file absent, or any read error ⟹
 * `false` — the caller then falls back to the full corpus. A dump is
 * verbose but never wrong; a false `true` would silently drop the rules.
 */
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { harnessHome } from "../../config/home-dir";

/** Opening fence the fusengine installer writes around the merged corpus. */
const FENCE_START = "<!-- fusengine:kimi-rules:start -->";

/** Closing fence the fusengine installer writes around the merged corpus. */
const FENCE_END = "<!-- fusengine:kimi-rules:end -->";

/**
 * Check whether the kimi rules corpus is already present, fenced, inside
 * `<kimiHome>/AGENTS.md`.
 * @param home - Kimi home dir override (defaults to `harnessHome("kimi")`,
 * which honors `KIMI_CODE_HOME`).
 * @returns `true` only when both fences are found in a readable file.
 */
export function rulesInAgentsMd(home?: string): boolean {
  try {
    const kimiHome = home ?? harnessHome("kimi");
    const agentsMd = join(kimiHome, "AGENTS.md");
    if (!existsSync(agentsMd)) return false;
    const content = readFileSync(agentsMd, "utf-8");
    return content.includes(FENCE_START) && content.includes(FENCE_END);
  } catch {
    return false;
  }
}
