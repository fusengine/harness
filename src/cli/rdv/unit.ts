/**
 * Run ONE registration's scope inside the leader process with the isolation a
 * separate process would have had: its own environment (in-place, restored),
 * and its own stdout/stderr (captured per unit). A throw becomes exit 1 +
 * stack on stderr — what an uncaught crash of a standalone process looks like
 * to the host (non-zero exit, nothing on stdout).
 */
import { runHookOnce } from "../hook-run";
import type { Registration, UnitResult } from "./types";

/** Env keys read ONCE at import time by the runtime: a registration differing on them cannot be served. */
const FROZEN_ENV_KEYS = ["FUSE_MCP_TTL_SEC", "FUSE_WEBFETCH_TTL_SEC", "HOME"] as const;

/** Signature of the env values that cannot change inside an already-loaded process. */
export function envSignature(env: Record<string, string | undefined>): string {
  return FROZEN_ENV_KEYS.map((k) => env[k] ?? "\0").join("|");
}

/**
 * Make `process.env` equal `target` IN PLACE (so child processes and Node's
 * `os.homedir()` follow), returning the function that restores the previous state.
 */
export function applyEnv(target: Record<string, string>): () => void {
  const before = { ...process.env } as Record<string, string | undefined>;
  const sync = (to: Record<string, string | undefined>): void => {
    for (const k of Object.keys(process.env)) if (!(k in to)) delete process.env[k];
    for (const [k, v] of Object.entries(to)) if (v !== undefined && process.env[k] !== v) process.env[k] = v;
  };
  sync(target);
  return () => sync(before);
}

/** Patch stdout/stderr writes; `take()` returns what was written, `restore()` unpatches. */
function captureStreams(): { take: () => { out: string; err: string }; restore: () => void } {
  const out: string[] = [];
  const err: string[] = [];
  const realOut = process.stdout.write;
  const realErr = process.stderr.write;
  const sink = (buf: string[]) => (chunk: unknown, a?: unknown, b?: unknown): boolean => {
    buf.push(typeof chunk === "string" ? chunk : Buffer.from(chunk as Uint8Array).toString("utf8"));
    const cb = typeof a === "function" ? a : b;
    if (typeof cb === "function") (cb as () => void)();
    return true;
  };
  process.stdout.write = sink(out) as typeof process.stdout.write;
  process.stderr.write = sink(err) as typeof process.stderr.write;
  return {
    take: () => ({ out: out.join(""), err: err.join("") }),
    restore: () => { process.stdout.write = realOut; process.stderr.write = realErr; },
  };
}

/**
 * Execute a registration's scope against the shared stdin text.
 * @param reg - The registration (id, scope argument, spawn-time env).
 * @param text - The stdin bytes every sibling received.
 */
export async function runRegistration(reg: Registration, text: string): Promise<UnitResult> {
  const restoreEnv = applyEnv(reg.env);
  const cap = captureStreams();
  let result: { stdout: string; exit: number };
  let crash = "";
  try {
    result = await runHookOnce({ id: reg.id, scopeArg: reg.scopeArg, read: { kind: "ok", text }, errSink: (m) => void process.stderr.write(m) });
  } catch (e) {
    crash = `${e instanceof Error ? (e.stack ?? e.message) : String(e)}\n`;
    result = { stdout: "", exit: 1 };
  } finally {
    cap.restore();
    restoreEnv();
  }
  const { out, err } = cap.take();
  return { stdout: out + result.stdout, stderr: err + crash, exit: result.exit };
}
