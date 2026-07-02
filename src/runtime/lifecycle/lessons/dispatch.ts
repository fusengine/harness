/**
 * fuse-lessons scope dispatch (TS port of the 4 handler scripts). Routes by
 * event: SessionStart/SubagentStart inject `MEMORY/LESSON.md`; Stop reminds
 * across every project with unsaved code edits; PostToolUse marks the write to
 * arm/silence the per-project throttle. Non-fatal by design.
 */
import { existsSync, readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { attachSystemMessage, contextResponse } from "../../../adapters/claude";
import { addRoot, readRoots } from "../../../memory/registry";
import { nowStamp, readState, setStateField, throttleMs } from "../../../memory/state";
import { isCodeFile, projectRoot, projectRootOrNull } from "../../../util/project-root";
import { atomicWrite } from "../../../util/json-io";
import { curateLessons } from "../aipilot/curate-lessons";
import { lessonsFileFor, lessonsStateFileFor } from "./state";

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

/** Select roots with unsaved code edits past the throttle, bumping their state. */
function collectPending(now: number, window: number): string[] {
  const pending: string[] = [];
  for (const root of readRoots()) {
    const stateFile = lessonsStateFileFor(root);
    const { lastRemindedAt, lastCodeEditAt } = readState(stateFile);
    if (lastCodeEditAt <= lastRemindedAt) continue;
    if (now - lastRemindedAt < window) continue;
    pending.push(root);
    setStateField(stateFile, "lastRemindedAt", now);
  }
  return pending;
}

/** Stop: emit one reminder covering every project with pending lessons. */
function remindWrite(now: number): string {
  const pending = collectPending(now, throttleMs());
  if (pending.length === 0) return "";
  const stamp = nowStamp();
  const targets = pending.map((r) => `- ${r}/MEMORY/LESSON.md`).join("\n");
  const ctx = `Before ending: if this session hit a mistake/blocker worth never ` +
    `reproducing, append 1-3 COMPACT bullets OR sharpen/merge existing ones ` +
    `(format \`- [${stamp}] what went wrong → do instead\`, use exactly this ` +
    `timestamp) in each project's lessons file below. Skip if nothing ` +
    `notable.\n${targets}`;
  return contextResponse("Stop", ctx);
}

/** PostToolUse: record the relevant throttle timestamp for the edited file. */
function markWrite(payload: Record<string, unknown>, now: number): void {
  const input = payload.tool_input as { file_path?: string } | undefined;
  if (!input?.file_path) return;
  const abs = resolve(input.file_path);
  const root = projectRootOrNull(dirname(abs));
  if (!root) return;
  const stateFile = lessonsStateFileFor(root);
  if (abs === resolve(root, "MEMORY", "LESSON.md")) {
    setStateField(stateFile, "lastRemindedAt", now);
  } else if (isCodeFile(abs)) {
    setStateField(stateFile, "lastCodeEditAt", now);
    addRoot(root);
  }
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
      return remindWrite(now);
    case "PostToolUse":
      markWrite(payload, now);
      return "";
    default:
      return "";
  }
}
