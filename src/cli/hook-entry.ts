/**
 * `harness hook <id> <scope>` entry. LIGHT: it statically imports no runtime
 * module, so a process that ends up a rendezvous follower reads its payload,
 * meets its siblings and exits without ever loading the heavy graph.
 *
 * Flow: eligible? -> read stdin -> rendezvous -> print the answer (the leader's
 * for followers, its own for the leader) or, whenever the rendezvous cannot
 * serve, run the scope standalone exactly like `hook-legacy.ts` would.
 * Ineligible invocations and `FUSE_HARNESS_RENDEZVOUS=0` take the legacy path.
 */
import { loadDotenv } from "../config/dotenv";
import type { HarnessId } from "../detect/harness";
import { rdvEnabled, resolveTuning } from "./rdv/config";
import { rdvRoot } from "./rdv/layout";
import { rendezvous } from "./rdv/follower";
import type { RdvOutcome, UnitResult } from "./rdv/types";
import { parseScope } from "./scope";
import { exitHook, stdinReaderBlocked } from "./stdin-source";
import { readStdinRead, traceHook, type StdinRead } from "./stdin-text";

/**
 * `hook <id>` or `hook <id> <scope>` with nothing else on the line (flags like
 * `--sound` stay legacy). The bare form is the default `core` scope.
 */
function eligible(argv: string[]): boolean {
  const [, , , id, scope] = argv;
  if (!rdvEnabled() || !id || id.startsWith("-") || argv.length < 4 || argv.length > 5) return false;
  return scope === undefined || !scope.startsWith("-");
}

/** Print a unit result like the legacy path does (stderr, then stdout) and exit. */
async function finish(result: UnitResult): Promise<never> {
  if (result.stderr) process.stderr.write(result.stderr);
  if (result.stdout) process.stdout.write(result.stdout);
  return exitHook(result.exit);
}

/** Read stdin with the legacy failure handling (a fault is a crash, never a silent pass). */
async function readOrCrash(id: string): Promise<StdinRead> {
  try {
    return await readStdinRead(id);
  } catch (e) {
    traceHook("handleHook-threw", e instanceof Error ? `${e.message}\n${e.stack}` : String(e));
    if (stdinReaderBlocked()) { process.stderr.write(`${e instanceof Error ? (e.stack ?? e.message) : String(e)}\n`); await exitHook(1); }
    throw e;
  }
}

/**
 * Run the `hook` command and exit.
 * @param argv - `process.argv`.
 */
export async function hookEntry(argv: string[]): Promise<never> {
  if (!eligible(argv)) return (await import("./hook-legacy")).runLegacyHook(argv);
  const id = argv[3] as string;
  const scopeArg = argv[4];
  const env = { ...process.env } as Record<string, string>; // spawn-time env, pre-dotenv
  loadDotenv(id as HarnessId); // legacy order: before the stdin read (it may set stdin limits)
  traceHook("args", { id, scope: parseScope(scopeArg, () => undefined) }); // legacy order: before the read (the warning itself is emitted by the unit)
  const read = await readOrCrash(id);
  const tuning = resolveTuning();
  let outcome: RdvOutcome = { kind: "standalone", why: "ineligible-payload" };
  if (read.kind === "ok" && read.text.trim() !== "" && read.text.length <= tuning.maxTextBytes) {
    const root = rdvRoot();
    const ctx = { id, scopeArg, text: read.text, cwd: process.cwd(), env, tuning, root };
    outcome = await rendezvous(ctx, async (c, dir, name) => (await import("./rdv/leader")).lead(c, dir, name));
  }
  if (outcome.kind === "result") return finish(outcome.result);
  const { runHookOnce } = await import("./hook-run");
  const run = await runHookOnce({ id, scopeArg, read });
  return finish({ stdout: run.stdout, stderr: "", exit: run.exit });
}
