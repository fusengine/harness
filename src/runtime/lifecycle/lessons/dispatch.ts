/**
 * fuse-lessons scope dispatch (TS port of the 4 handler scripts). Routes by
 * event: SessionStart/SubagentStart inject `MEMORY/LESSON.md`; Stop reminds the
 * stopping session about ITS OWN projects with unsaved code edits; PostToolUse
 * marks the write to arm/silence the throttle. The reminder + mark logic (incl.
 * the per-`session_id` scoping that fixes the multi-session misdirection) lives
 * in {@link module:runtime/lifecycle/lessons/reminder}; this module keeps the
 * event router + lesson-file injection. Non-fatal by design.
 */
import { existsSync, readFileSync } from "node:fs";
import { attachSystemMessage, contextResponse } from "../../../adapters/claude";
import { projectRoot } from "../../../util/project-root";
import { atomicWrite } from "../../../util/json-io";
import { curateLessons } from "../aipilot/curate-lessons";
import { lessonsFileFor } from "./state";
import { markWrite, remindWrite } from "./reminder";

/** Inject `MEMORY/LESSON.md` for `event`, after mechanical curation (a strict dedup rewrites the file in place; any report surfaces to the user via systemMessage). */
function injectMemory(cwd: string, event: string, now: number): string {
  const root = projectRoot(cwd);
  const file = lessonsFileFor(root);
  if (!existsSync(file)) return "";
  let content = "";
  try { content = readFileSync(file, "utf-8").trim(); } catch { return ""; }
  if (!content) return "";
  const { content: curated, report } = curateLessons(content, now, root);
  if (curated !== content) try { atomicWrite(file, curated); content = curated; } catch { /* keep original on write failure */ }
  const ctx = `Project lessons — never reproduce these:\n${content}\nYou may append OR refine/merge/dedupe bullets in MEMORY/LESSON.md — keep it terse.`;
  return report ? attachSystemMessage(contextResponse(event, ctx), `LESSON.md curation:\n${report}`) : contextResponse(event, ctx);
}

/**
 * Route a fuse-lessons event to its handler. Returns the native stdout for
 * context-injecting events (SessionStart/SubagentStart/Stop) or "" for the
 * side-effect-only PostToolUse mark.
 * @param event - The raw hook event name.
 * @param payload - The raw hook payload.
 * @param cwd - Project root for memory injection.
 * @param now - Clock.
 * @returns The native stdout (possibly empty).
 */
export function dispatchLessons(event: string, payload: Record<string, unknown>, cwd: string, now: number): string {
  switch (event) {
    case "SessionStart":
    case "SubagentStart":
      return injectMemory(cwd, event, now);
    case "Stop":
      return remindWrite(payload, now);
    case "PostToolUse":
      markWrite(payload, now);
      return "";
    default:
      return "";
  }
}
