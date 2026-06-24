import type { Prompt } from "../../prompt/types";
import type { GuardContext } from "./context";
import { matchPatterns, PROJECT_INSTALL, SYSTEM_INSTALL } from "../patterns";

/** Asks for confirmation before a dependency or system package install. */
export function installGuard(ctx: GuardContext): Prompt | null {
  if (ctx.tool !== "Bash" || !ctx.command) return null;
  if (matchPatterns(ctx.command, PROJECT_INSTALL) || matchPatterns(ctx.command, SYSTEM_INSTALL)) {
    return {
      kind: "ask",
      title: "Dependency install",
      reason: `This command installs packages: ${ctx.command.trim()}`,
      actions: ["Confirm this install is intended"],
    };
  }
  return null;
}
