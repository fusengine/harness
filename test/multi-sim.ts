/**
 * @module test/multi-sim
 * Turn a test/sim scenario into a rendezvous differential case: every step's
 * event is replayed with the scopes the host would really spawn for it (the
 * scenario's own scope plus the siblings from the real declarations), so the
 * guard / evidence / deny-loop logic of the sim runs under fan-out.
 */
import { join } from "node:path";
import { loadScenario, substitute } from "./sim/load";
import { claudeScopesFor, codexScopesFor } from "./multi-routes";
import { put, type Case } from "./multi-differential";
import type { Sandbox } from "./multi-spawn";

const FIXTURES = join(import.meta.dir, "sim", "fixtures");

/** Cap on processes per step so a full replay stays tractable. */
const MAX_SCOPES = 14;

/** The scopes the host spawns for `event`: its derived set, with the step's own scope guaranteed present. */
function fanout(host: string, own: string, event: Record<string, unknown>): string[] {
  const derived = host === "codex" ? codexScopesFor(event) : host === "claude-code" ? (claudeScopesFor(event).map((s) => s ?? "core")) : ["core", "core", own];
  const all = derived.includes(own) ? derived : [own, ...derived];
  return all.slice(0, MAX_SCOPES).includes(own) ? all.slice(0, MAX_SCOPES) : [own, ...all.slice(0, MAX_SCOPES - 1)];
}

/**
 * Convert a scenario file to a {@link Case}.
 * @param path - Absolute path to a scenario JSON.
 */
export function scenarioToCase(path: string): Case {
  const sc = loadScenario(path);
  const host = sc.harness ?? "claude-code";
  const vars = (sb: Sandbox): Record<string, string> => ({ TMP: sb.cwd, FIXTURES });
  return {
    host,
    shared: true,
    env: (sb) => ({ FUSE_HARNESS_DEBUG: "1", CI: "true", ...substitute(sc.env ?? {}, vars(sb)) }),
    setup: (sb) => { for (const f of sc.setup ?? []) { const s = substitute(f, vars(sb)); put(sb, s.path.replace(sb.cwd, ""), s.content); } },
    steps: sc.steps.map((step) => ({
      delayMs: step.delayMs,
      payloadFor: (sb) => substitute(step.event, vars(sb)),
      scopes: fanout(host, step.scope, step.event),
    })),
  };
}
