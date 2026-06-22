import type { Prompt } from "../../prompt/types";
import type { GuardContext } from "./context";

/** Project-level dependency installs (npm/yarn/pnpm/bun/pip/cargo/go/gem/composer). */
export const PROJECT_INSTALL_RE: RegExp =
  /\b(?:npm\s+(?:install|i)|(?:yarn|pnpm|bun)\s+add|pip3?\s+install|cargo\s+install|go\s+install|gem\s+install|composer\s+require)\b/;

/** System-level package installs (brew/apt/apt-get/dnf/pacman). */
export const SYSTEM_INSTALL_RE: RegExp =
  /\b(?:brew\s+install|apt(?:-get)?\s+install|dnf\s+install|pacman\s+-S)\b/;

/** Asks for confirmation before a dependency or system package install. */
export function installGuard(ctx: GuardContext): Prompt | null {
  if (ctx.tool !== "Bash" || !ctx.command) return null;
  const cmd: string = ctx.command;
  if (PROJECT_INSTALL_RE.test(cmd) || SYSTEM_INSTALL_RE.test(cmd)) {
    return {
      kind: "ask",
      title: "Dependency install",
      reason: `This command installs packages: ${cmd.trim()}`,
      actions: ["Confirm this install is intended"],
    };
  }
  return null;
}
