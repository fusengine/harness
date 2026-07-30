/**
 * @module test/helpers/inform-matrix
 * Builds the full 32-cell golden matrix: (id × event × emitter) triples,
 * captured DETERMINISTICALLY inside the hermetic fixture tree from
 * `inform-matrix-env`. Runs inside the capture child (see `capture-run`) so
 * every ambient read resolves against the fixtures, never the real machine.
 */
import { injectRules } from "../../src/runtime/lifecycle/inject-rules";
import { promptSubmitContext } from "../../src/runtime/inject-context";
import { dispatchLessons } from "../../src/runtime/lifecycle/lessons/dispatch";
import { NOW, makeProject } from "./inform-matrix-env";
import type { MatrixPaths } from "./inform-matrix-env";

/** Harness targets covered by the matrix. */
export const IDS = ["claude-code", "codex", "gemini-cli", "kimi"] as const;

/** Hook events covered by the matrix. */
export const EVENTS = ["SessionStart", "UserPromptSubmit", "SubagentStart"] as const;

/**
 * Prompts for `promptSubmitContext`: "dev" matches both `DEV_VERBS`
 * (`src/policy/claude-md-context.ts`) and `DEV_KEYWORDS`
 * (`src/policy/detect-project.ts`), so it exercises the APEX preamble path.
 * "plain" matches NEITHER regex (verified against both patterns before
 * writing this fixture) — it exercises the plain CLAUDE.md-only path.
 */
const PROMPTS = [
  ["dev", "implement the parser"],
  ["plain", "quelle heure est-il"],
] as const;

/**
 * Capture every (id × event) cell for the three emitters under test, plus the
 * two prompt-kind variants of `promptSubmitContext`. Iteration is purely
 * synchronous — order comes from the loop structure, never from scheduling —
 * and the final map is key-sorted so the golden JSON is diffable line by line
 * regardless of iteration order.
 * @param paths - The hermetic fixture tree (see {@link buildFixtures}).
 * @returns The 32-cell golden map, keyed `emitter|id|event|extra`.
 */
export function captureMatrix(paths: MatrixPaths): Record<string, string> {
  const cells: Array<[string, string]> = [];
  for (const id of IDS) {
    for (const event of EVENTS) {
      cells.push([`injectRules|${id}|${event}|-`, injectRules(paths.pluginRoot, event, id)]);
      const lessonsDir = makeProject(paths.root, `${id}-${event}`);
      cells.push([`lessons|${id}|${event}|-`, dispatchLessons(event, {}, lessonsDir, NOW, id)]);
      if (event === "UserPromptSubmit") {
        for (const [kind, prompt] of PROMPTS) {
          cells.push([`promptSubmit|${id}|UserPromptSubmit|${kind}`, promptSubmitContext(prompt, paths.project, id)]);
        }
      }
    }
  }
  cells.sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0));
  return Object.fromEntries(cells);
}

/**
 * Guard against a non-portable golden: a captured value that embeds the
 * fixture's own temp root would tie the golden to this run's random path and
 * break on every future capture.
 * @param cells - The captured golden map.
 * @param root - The fixture root whose path must never leak into a value.
 */
export function assertPortable(cells: Record<string, string>, root: string): void {
  for (const [key, value] of Object.entries(cells)) {
    if (value.includes(root)) throw new Error(`non-portable golden cell "${key}" embeds fixture root ${root}`);
  }
}
