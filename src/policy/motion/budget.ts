/**
 * @module motion/budget
 * Render counters per stage + accumulated wall time, in the harness-owned
 * store. A render is opened at PreToolUse (allowed) keyed by `tool_use_id`
 * and closed at PostToolUse, which counts it and adds its duration.
 */
import { existsSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import { parseEnvInt } from "../../config/env";
import { LOCK_FAILED } from "../../tracking/track-lock-sync";
import { withMotionProjectLock as withBudgetLock } from "./project-lock";
import type { Prompt } from "../../prompt/types";
import { projectStoreDir, readJsonObject, writeJsonObject } from "./store";
import type { MotionBudget, MotionStage } from "../interfaces/motion";
import { isRecordObject as isObject, recordObject as obj } from "../../util/record-object";

/** Env var capping master renders (unset/invalid = no cap). */
export const MAX_MASTER_ENV = "FUSE_MOTION_MAX_MASTER_RENDERS";

const STAGES: readonly string[] = ["stills", "draft", "master"];
const budgetPath = (root: string, home: string): string => join(projectStoreDir(root, home), "budget.json");
const num = (v: unknown): number => (typeof v === "number" && Number.isFinite(v) ? v : 0);
const block = (reason: string): Prompt => ({ kind: "block", ruleId: "motion-budget", title: "Motion render budget", reason });

function decodeBudget(raw: Record<string, unknown>): MotionBudget {
  return {
    renders: obj(raw.renders) as MotionBudget["renders"],
    wallMs: obj(raw.wallMs) as MotionBudget["wallMs"],
    inflight: obj(raw.inflight) as MotionBudget["inflight"],
  };
}

/** Load the budget (all-empty when missing/corrupt). */
export function loadBudget(root: string, home: string = homedir()): MotionBudget {
  return decodeBudget(readJsonObject(budgetPath(root, home)));
}

function validBudget(raw: Record<string, unknown>): boolean {
  if (!isObject(raw.renders) || !isObject(raw.wallMs) || !isObject(raw.inflight)) return false;
  if (!Object.entries(raw.renders).every(([stage, n]) => STAGES.includes(stage) && typeof n === "number" && Number.isSafeInteger(n) && n >= 0)) return false;
  if (!Object.entries(raw.wallMs).every(([stage, n]) => STAGES.includes(stage) && typeof n === "number" && Number.isFinite(n) && n >= 0)) return false;
  return Object.values(raw.inflight).every((start) => isObject(start) && typeof start.stage === "string"
    && STAGES.includes(start.stage) && typeof start.ts === "number" && Number.isFinite(start.ts));
}

/** Reject a corrupt existing render budget rather than resetting its allowance. */
export function budgetViolation(root: string, home: string = homedir()): Prompt | null {
  const path = budgetPath(root, home);
  return existsSync(path) && !validBudget(readJsonObject(path)) ? block("Motion budget is corrupt; the render allowance cannot be safely determined.") : null;
}

/**
 * Atomically reserve a render before allowing PreToolUse; masters include
 * completed and in-flight renders in their cap. Without an id, uncapped
 * renders remain a no-op, but capped masters cannot be safely admitted.
 * @returns A block prompt on cap/lock failure, otherwise `null`.
 */
export function openRender(root: string, toolUseId: string | undefined, stage: MotionStage, now: number, home: string = homedir(), env: Record<string, string | undefined> = process.env): Prompt | null {
  const cap = stage === "master" ? maxMasterRenders(env) : 0;
  if (!toolUseId) return budgetViolation(root, home) ?? (cap > 0 ? block("A capped master render requires a tool_use_id for its reservation.") : null);
  const result = withBudgetLock(root, home, () => {
    const path = budgetPath(root, home), raw = readJsonObject(path);
    if (existsSync(path) && !validBudget(raw)) return block("Motion budget is corrupt; the render allowance cannot be safely determined.");
    const b = decodeBudget(raw);
    if (Object.hasOwn(b.inflight, toolUseId)) return block("This tool_use_id already has an in-flight render reservation; use a unique invocation id.");
    const used = num(b.renders.master) + Object.values(b.inflight).filter((start) => start?.stage === "master").length;
    if (cap > 0 && used >= cap) return block(`Master render cap reached (${used}/${cap}, ${MAX_MASTER_ENV}; includes in-flight reservations).`);
    writeJsonObject(budgetPath(root, home), { ...b, inflight: { ...b.inflight, [toolUseId]: { stage, ts: now } } });
    return null;
  });
  return result === LOCK_FAILED ? block("Motion budget lock busy; retry the render after the current update finishes.") : result;
}

/**
 * Close a render (PostToolUse): count it and add its wall time.
 * @param fallbackStage - Stage parsed from the command, used when no start was recorded.
 * @returns The updated budget.
 */
export function closeRender(root: string, toolUseId: string | undefined, fallbackStage: MotionStage, now: number, home: string = homedir()): MotionBudget {
  const result = withBudgetLock(root, home, () => {
    if (budgetViolation(root, home)) throw new Error("Motion budget is corrupt; completion was not recorded.");
    const b = loadBudget(root, home);
    const start = toolUseId ? b.inflight[toolUseId] : undefined;
    const stage: MotionStage = start && STAGES.includes(start.stage) ? start.stage : fallbackStage;
    const inflight = { ...b.inflight };
    if (toolUseId) delete inflight[toolUseId];
    const elapsed = start && typeof start.ts === "number" ? Math.max(0, now - start.ts) : 0;
    const next: MotionBudget = {
      renders: { ...b.renders, [stage]: num(b.renders[stage]) + 1 },
      wallMs: { ...b.wallMs, [stage]: num(b.wallMs[stage]) + elapsed },
      inflight,
    };
    writeJsonObject(budgetPath(root, home), next);
    return next;
  });
  if (result === LOCK_FAILED) throw new Error("Motion budget lock busy; completion was not recorded.");
  return result;
}

/** Release one matching failed/completed-inactive invocation without counting; never infer inactivity from age. */
export function releaseRender(root: string, toolUseId: string | undefined, home: string = homedir()): MotionBudget {
  const result = withBudgetLock(root, home, () => {
    if (budgetViolation(root, home)) throw new Error("Motion budget is corrupt; reservation was not released.");
    const b = loadBudget(root, home);
    if (!toolUseId || !Object.hasOwn(b.inflight, toolUseId)) return b;
    const inflight = { ...b.inflight };
    delete inflight[toolUseId];
    const next = { ...b, inflight };
    writeJsonObject(budgetPath(root, home), next);
    return next;
  });
  if (result === LOCK_FAILED) throw new Error("Motion budget lock busy; reservation was not released.");
  return result;
}

/** The master-render cap from {@link MAX_MASTER_ENV} (0 = no cap). */
export function maxMasterRenders(env: Record<string, string | undefined> = process.env): number {
  return parseEnvInt(env[MAX_MASTER_ENV], 0);
}

/** One-line human summary, e.g. `renders stills 2 · draft 1 · master 0 — wall 3m12s`. */
export function budgetLine(b: MotionBudget, env: Record<string, string | undefined> = process.env): string {
  const n = (s: MotionStage): number => num(b.renders[s]);
  const ms = Object.values(b.wallMs).reduce<number>((a, v) => a + num(v), 0);
  const cap = maxMasterRenders(env);
  const wall = `${Math.floor(ms / 60000)}m${String(Math.floor((ms % 60000) / 1000)).padStart(2, "0")}s`;
  return `Motion budget: renders stills ${n("stills")} · draft ${n("draft")} · master ${n("master")}${cap ? `/${cap}` : ""} — wall ${wall}`;
}
