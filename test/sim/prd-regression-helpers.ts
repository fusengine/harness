/**
 * @module test/sim/prd-regression-helpers
 * Pure/spawn helpers backing `prd-regression.test.ts`, split out to keep that
 * file under the repo's file-size ceiling. Owns: per-row scenario replay
 * (fresh `mkdtemp` tmp+HOME per row, never shared), the sandbox-escape guard
 * for `setup` files (byte-identical twin of run-scenario.ts's own
 * `materializeSetup`, kept in lockstep — see its own doc comment), and the
 * cross-row output normalizer that neutralizes the two known LEGITIMATE
 * sources of per-row difference without hiding anything else:
 * - the row's own fresh `$TMP`, embedded verbatim by some scenarios' stdout
 *   (e.g. `13-lessons-stop-session-scope`'s Stop reminder path);
 * - the Codex CONFIRM display code (`CONFIRM <4-hex>`), a hash of
 *   `{..., cwd}` (`codex-confirm.ts`'s `codexAction`) — it changes with a
 *   fresh tmp even though the tmp string itself never appears literally, so
 *   substituting `$TMP` alone cannot neutralize it; scenarios
 *   `23/26/28/29-codex-*` need this second substitution too.
 * Exit codes are never touched by either substitution — they carry no path
 * or hash data, so a real exit-code regression still fails loudly. Neither
 * substitution depends on, or pins, the literal text any policy guard emits
 * (PRD guards included) — both only erase a KNOWN per-run identifier.
 */
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve, sep } from "node:path";
import { loadScenario, substitute } from "./load";
import { runHook, spawnEnv } from "./exec";
import { materializePrdFixtures } from "../helpers/prd-env";
import { harnessHomeSegment } from "../../src/policy/apex-target";
import type { SetupFile } from "./types";

/** Absolute path to `test/sim/fixtures`, resolved from this file. */
export const FIXTURES: string = join(import.meta.dir, "fixtures");

/** One step's outcome kept for comparison — stdout AND exit, never stdout alone. */
export interface RowStep {
  stdout: string;
  exit: number;
}

/** One full replay: the row's own tmp dir (needed to neutralize it) plus its ordered per-step results. */
export interface ReplayRow {
  tmp: string;
  steps: RowStep[];
}

// Deliberate local twin of run-scenario.ts's own (non-exported) materializeSetup:
// that file is owned by a parallel lot in this same PR and out of this file's
// scope to modify just to add an export. Byte-identical body (including the
// sandbox-escape guard), kept in lockstep with the original.
/**
 * Materialize each declared setup file under `tmp`. Each path is token-
 * substituted and containment-checked: it MUST resolve inside `tmp`, so a
 * typo'd scenario can never write outside the per-run sandbox (same contract
 * as run-scenario.ts's own materializeSetup).
 * @throws Error when a resolved path escapes `tmp`.
 */
export function materializeSetupFiles(setup: SetupFile[], tmp: string, vars: Record<string, string>): void {
  for (const raw of setup) {
    const f = substitute(raw, vars);
    const abs = resolve(f.path);
    if (abs !== tmp && !abs.startsWith(tmp + sep)) throw new Error(`setup path escapes $TMP: ${f.path}`);
    mkdirSync(dirname(abs), { recursive: true });
    writeFileSync(abs, f.content);
  }
}

/**
 * Replays one scenario end-to-end in a BRAND-NEW `mkdtemp` tmp dir (also used
 * as `HOME` — {@link import("./exec").spawnEnv}'s own isolation contract),
 * under an env overlay applied on top of the scenario's own `env`, optionally
 * pre-seeding the PRD fixtures. Cleans up its own tmp dir before returning.
 * @returns The row's tmp dir plus its ordered per-step `{stdout, exit}`.
 */
export async function replayFresh(path: string, envOverlay: Record<string, string>, seedPrd: boolean): Promise<ReplayRow> {
  const tmp = mkdtempSync(join(tmpdir(), "fh-prdreg-"));
  try {
    const scenario = loadScenario(path);
    const vars = { TMP: tmp, FIXTURES };
    const harness = scenario.harness ?? "claude-code";
    const env = spawnEnv(FIXTURES, tmp, substitute({ ...(scenario.env ?? {}), ...envOverlay }, vars));
    materializeSetupFiles(scenario.setup ?? [], tmp, vars);
    if (seedPrd) materializePrdFixtures(tmp, harnessHomeSegment(harness));
    const steps: RowStep[] = [];
    for (const rawStep of scenario.steps) {
      const step = substitute(rawStep, vars);
      if (step.delayMs && step.delayMs > 0) await Bun.sleep(step.delayMs);
      const r = runHook(harness, step.scope, step.event, tmp, env);
      steps.push({ stdout: r.stdout, exit: r.exit });
    }
    return { tmp, steps };
  } finally {
    rmSync(tmp, { recursive: true, force: true });
  }
}

/** `CONFIRM <4-hex-chars>`, case-insensitive — same shape confirm-submit.ts parses (see its own CONFIRM_RE). */
const CONFIRM_CODE_RE = /CONFIRM [0-9a-f]{4}\b/gi;

/**
 * Neutralize a replay row's own fresh `$TMP` and any Codex CONFIRM display
 * code before it is compared to another row. Both are legitimate per-row
 * differences (see the module doc comment) — never a signal of a real
 * behavior change — so both are substituted with a stable token, and nothing
 * else, before the byte-identical comparison in the test file.
 * @param row - A {@link ReplayRow} returned by {@link replayFresh}.
 * @returns The row's steps with `$TMP`/CONFIRM-code differences erased; `exit` untouched.
 */
export function normalizeRow(row: ReplayRow): RowStep[] {
  return row.steps.map((s) => ({
    stdout: s.stdout.split(row.tmp).join("$TMP").replace(CONFIRM_CODE_RE, "CONFIRM $HASH"),
    exit: s.exit,
  }));
}
