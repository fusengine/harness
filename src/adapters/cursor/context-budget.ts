/**
 * @module context-budget
 * Cursor-only shared `additional_context` budget registry. Cursor 3.18.25
 * runs every hook plugin configured on an event in its OWN process, then
 * merges their `additional_context` outputs with a 9-char `"\n\n---\n\n"`
 * separator and drops the WHOLE merge past 10,000 UTF-16 units — so no
 * single process can know the total by itself. This module gives every
 * plugin's process a shared, best-effort view of that total via a small
 * JSON registry file under the project's state dir (see `../../runtime/paths.ts`),
 * keyed by `${sessionId}|${event}|${generationId ?? ""}|${toolUseId ?? ""}`
 * (one key per merge group — Cursor merges preToolUse/postToolUse/
 * postToolUseFailure PER TOOL CALL, so `toolUseId` joins the key on those
 * three events), with entries older than 10s ignored (concurrent hooks on one
 * event fire within the same second). Best-effort, fail-open throughout: any
 * I/O or JSON error degrades to "no shared budget", i.e. the flat
 * per-response cap in `./context-limit.ts` alone — never a thrown error, and
 * never a Cursor-side regression.
 */
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { atomicWrite } from "../../util/json-io";
import {
  ADDITIONAL_CONTEXT_LIMIT, TRUNCATION_MARKER, additionalContextLength, capAdditionalContext, omitAdditionalContext,
} from "./context-limit";
import type { CursorBudgetContext } from "./interfaces/context-budget";

const REGISTRY_FILE = "cursor-context-budget.json";
/** Matches Cursor 3.18.25's observed `"\n\n---\n\n"` merge separator length. */
const SEPARATOR_LENGTH = 9;
const ENTRY_WINDOW_MS = 10_000;
/** Below this, a truncated value would carry more marker than budget — omit the field instead. */
const OMIT_THRESHOLD = TRUNCATION_MARKER.length + 100;

interface BudgetEntry {
  at: number;
  length: number;
}
type BudgetRegistry = Record<string, BudgetEntry[]>;

function isRegistry(value: unknown): value is BudgetRegistry {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function registryPath(stateDir: string): string {
  return join(stateDir, REGISTRY_FILE);
}

function budgetKey(ctx: Pick<CursorBudgetContext, "sessionId" | "event" | "generationId" | "toolUseId">): string {
  return `${ctx.sessionId}|${ctx.event}|${ctx.generationId ?? ""}|${ctx.toolUseId ?? ""}`;
}

function loadRegistry(path: string): BudgetRegistry {
  try {
    if (!existsSync(path)) return {};
    const parsed: unknown = JSON.parse(readFileSync(path, "utf8"));
    return isRegistry(parsed) ? parsed : {};
  } catch {
    return {};
  }
}

function freshEntries(entries: BudgetEntry[] | undefined, now: number): BudgetEntry[] {
  return (entries ?? []).filter((entry) => now - entry.at <= ENTRY_WINDOW_MS);
}

/** Sum of a key's fresh entry lengths plus the separators already joining them. */
function consumed(entries: BudgetEntry[]): number {
  return entries.reduce((total, entry) => total + entry.length, 0) + SEPARATOR_LENGTH * Math.max(0, entries.length - 1);
}

/** {@link reserveAdditionalContext} input: budget context plus the length the caller wants to emit. */
export type ReserveInput = CursorBudgetContext & { wanted: number };
/** {@link recordAdditionalContext} input: budget context plus the length actually emitted. */
export type RecordInput = CursorBudgetContext & { emitted: number };

/**
 * Reserve room in the shared budget for one hook's `additional_context`
 * contribution to one (session, event, generation) merge group. `wanted` is
 * accepted for a symmetric call shape with {@link recordAdditionalContext}
 * but does not shrink `allowed` itself — the ceiling only depends on what
 * OTHER entries already hold; a smaller `wanted` simply means the caller
 * won't need all of it. Best-effort, fail-open: any I/O/JSON error returns
 * the full flat ceiling, as if no other plugin had run.
 * @param input - Registry location, reservation key, and the wanted length.
 */
export function reserveAdditionalContext(input: ReserveInput): { allowed: number } {
  try {
    const now = input.now ?? Date.now();
    const registry = loadRegistry(registryPath(input.stateDir));
    const fresh = freshEntries(registry[budgetKey(input)], now);
    const separator = fresh.length > 0 ? SEPARATOR_LENGTH : 0;
    return { allowed: Math.max(0, ADDITIONAL_CONTEXT_LIMIT - consumed(fresh) - separator) };
  } catch {
    return { allowed: ADDITIONAL_CONTEXT_LIMIT };
  }
}

/**
 * Record the length actually emitted for one reservation, best-effort.
 * Prunes every key's stale entries while it holds the write so the registry
 * file stays bounded. Silently no-ops on any I/O error (fail-open).
 * @param input - Registry location, reservation key, and the emitted length.
 */
export function recordAdditionalContext(input: RecordInput): void {
  try {
    const now = input.now ?? Date.now();
    const path = registryPath(input.stateDir);
    const registry = loadRegistry(path);
    const pruned: BudgetRegistry = {};
    for (const [key, entries] of Object.entries(registry)) {
      const fresh = freshEntries(entries, now);
      if (fresh.length > 0) pruned[key] = fresh;
    }
    const key = budgetKey(input);
    pruned[key] = [...(pruned[key] ?? []), { at: now, length: input.emitted }];
    atomicWrite(path, JSON.stringify(pruned));
  } catch {
    // Best-effort: a lost entry only makes the NEXT reservation over-generous
    // (never under), which is the safe direction to fail in.
  }
}

/**
 * Cap a Cursor stdout JSON's `additional_context` against the shared budget
 * instead of the flat per-response ceiling alone. Falls back to the plain
 * cap (`./context-limit.ts`), unbudgeted, when `budget` is `undefined` or
 * the stdout carries no `additional_context` at all.
 * @param stdout - A native Cursor JSON stdout candidate.
 * @param budget - Shared budget context, or `undefined` to skip it.
 */
export function capAdditionalContextWithBudget(stdout: string, budget: CursorBudgetContext | undefined): string {
  if (!budget) return capAdditionalContext(stdout);
  const wanted = additionalContextLength(stdout);
  if (wanted === 0) return stdout;
  const { allowed } = reserveAdditionalContext({ ...budget, wanted });
  if (allowed < OMIT_THRESHOLD) {
    process.stderr.write(`[fuse-harness] cursor: additional_context budget exhausted for ${budget.event} (allowed=${allowed})\n`);
    return omitAdditionalContext(stdout);
  }
  const limit = Math.min(ADDITIONAL_CONTEXT_LIMIT, allowed);
  const capped = capAdditionalContext(stdout, limit);
  recordAdditionalContext({ ...budget, emitted: additionalContextLength(capped) });
  return capped;
}
