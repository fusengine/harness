/**
 * @module motion/critic-flag
 * Per-session set of active `motion-critic` agent ids, in the harness-owned
 * store. Removal is by `agent_id` ALONE (never by agent type), so a stuck flag
 * cannot outlive its agent (cf. the design-agent flag lesson). Writes merge
 * into the session file, preserving any other key.
 */
import { homedir } from "node:os";
import { lstatSync, readdirSync, unlinkSync, utimesSync } from "node:fs";
import { dirname, join } from "node:path";
import { readJsonObject, sessionStateFile, writeJsonObject } from "./store";

/** True for the `motion-critic` agent type, bare or plugin-prefixed (`fuse-motion:motion-critic`). */
export function isCriticAgentType(agentType: string): boolean {
  return agentType === "motion-critic" || agentType.endsWith(":motion-critic");
}

const idsOf = (state: Record<string, unknown>): string[] =>
  Array.isArray(state.critics) ? state.critics.filter((a): a is string => typeof a === "string" && a !== "") : [];

/** Active critic agent ids of a session (`[]` on an invalid session id or missing state). */
export function activeCritics(sessionId: unknown, home: string = homedir()): string[] {
  const file = sessionStateFile(sessionId, home);
  if (!file) return [];
  const ids = idsOf(readJsonObject(file));
  try { const now = new Date(); if (lstatSync(file).isFile()) utimesSync(file, now, now); } catch { /* absent state */ }
  return ids;
}

/** Mark a critic agent active (idempotent). */
export function addActiveCritic(sessionId: unknown, agentId: string, home: string = homedir()): void {
  const file = sessionStateFile(sessionId, home);
  if (!file || !agentId) return;
  try {
    const state = readJsonObject(file);
    const cur = idsOf(state);
    if (!cur.includes(agentId)) writeJsonObject(file, { ...state, critics: [...cur, agentId] });
  } catch {
    /* state is best effort — never throws in a hook */
  }
}

/** Clear a critic agent by id alone; an unknown id is a no-op. */
export function removeActiveCritic(sessionId: unknown, agentId: string, home: string = homedir()): void {
  const file = sessionStateFile(sessionId, home);
  if (!file) return;
  try {
    const state = readJsonObject(file);
    const cur = idsOf(state);
    if (cur.includes(agentId)) writeJsonObject(file, { ...state, critics: cur.filter((a) => a !== agentId) });
  } catch {
    /* best effort */
  }
}

/** Clear critic bookkeeping at the parent session's terminal Stop, including missing child-stop events. */
export function clearSessionCritics(sessionId: unknown, home: string = homedir()): void {
  const file = sessionStateFile(sessionId, home);
  if (!file) return;
  try {
    const state = readJsonObject(file);
    if (idsOf(state).length) writeJsonObject(file, { ...state, critics: [] });
  } catch { /* bookkeeping cleanup is best effort */ }
  purgeMotionSessions(home);
}

/** Purge only regular harness session JSON files unused for seven days; never follows links or touches project artifacts. */
export function purgeMotionSessions(home: string = homedir(), now: number = Date.now()): void {
  const file = sessionStateFile("purge", home);
  if (!file) return;
  const directory = dirname(file);
  try {
    if (!lstatSync(directory).isDirectory()) return;
    for (const name of readdirSync(directory)) {
      if (!name.endsWith(".json")) continue;
      const path = join(directory, name), stat = lstatSync(path);
      if (stat.isFile() && now - stat.mtimeMs > 7 * 24 * 60 * 60 * 1000) unlinkSync(path);
    }
  } catch { /* cleanup never weakens a currently recorded reservation */ }
}
