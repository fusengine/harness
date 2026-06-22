import type { Prompt } from "../../prompt/types";
import type { GuardContext } from "./context";

/** Path fragments that mark a location as internal/generated state (off-limits to Write/Edit). */
export const PROTECTED_FRAGMENTS: readonly string[] = [
  ".claude/plugins/marketplaces",
  ".claude/plugins/cache",
  ".claude/logs/00-apex",
  ".claude/fusengine-cache",
  ".git/",
];

/** Blocks direct edits to internal/generated state directories. */
export function protectedPathGuard(ctx: GuardContext): Prompt | null {
  const isMutation: boolean = ctx.tool === "Write" || ctx.tool === "Edit";
  if (isMutation && ctx.filePath) {
    const path: string = ctx.filePath;
    if (PROTECTED_FRAGMENTS.some((fragment: string): boolean => path.includes(fragment))) {
      return {
        kind: "block",
        title: "Protected path",
        reason: "This is internal/generated state — do not edit it directly.",
        actions: ["Edit the source, not the generated/cache copy"],
      };
    }
  }
  return null;
}
