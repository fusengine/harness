#!/usr/bin/env node
/**
 * harness — CLI for @fusengine/harness.
 *   harness check          cli-mode: check staged files (pre-commit), exit non-zero on a violation
 *   harness init [id]      write the wiring file for a harness (defaults to the detected one)
 *   harness hook <id>      runtime: read a hook payload on stdin, route to the adapter, print the response
 *   harness changelog      fetch + diff the Claude Code changelog, print a JSON summary (changelog-watcher)
 */
import { detectHarness, type HarnessId } from "../detect/harness";
import { initFor, writeInitFile } from "../init/run";
import { scanChangelog } from "../changelog/fetch";
import { runSecurityScan } from "../runtime/lifecycle/security/scan";
import { handleHook } from "../runtime/handle";
import type { PluginScope } from "../runtime/lifecycle";
import { resolveTtlSec } from "../config/ttl";
import { loadDotenv } from "../config/dotenv";
import { discoverRefs } from "../refs/discover";
import { homedir } from "node:os";
import { checkStaged, stagedContent, stagedFiles } from "./run";
import { runDoctor, runningVersion, versionBanner } from "./doctor";
import { readStdin as readRawStdin } from "../util/runtime-io";
import { maybePlaySound } from "./hook-sound";

// Inline trace helper (kept in this file, not a separate module) — stderr-only, on only under FUSE_HARNESS_DEBUG=1 (set by test/sim/exec.ts).
const hookDebug = process.env.FUSE_HARNESS_DEBUG === "1";
function traceHook(label: string, data: unknown): void {
  if (hookDebug) process.stderr.write(`[hook-debug] ${label}: ${typeof data === "string" ? data : JSON.stringify(data)}\n`);
}

async function readStdin(): Promise<Record<string, unknown>> {
  const text = (await readRawStdin()).trim();
  traceHook("stdin-text-length", text.length);
  if (!text) return {};
  try {
    const parsed: unknown = JSON.parse(text);
    return typeof parsed === "object" && parsed !== null ? (parsed as Record<string, unknown>) : {};
  } catch (e) { traceHook("stdin-parse-error", e instanceof Error ? e.message : String(e)); return {}; }
}

const cmd = process.argv[2];

if (cmd === "--version" || cmd === "-v") {
  process.stderr.write(versionBanner(import.meta.url) + "\n");
  process.stdout.write(runningVersion(import.meta.url).version + "\n");
  process.exit(0);
} else if (cmd === "doctor") {
  process.stderr.write(versionBanner(import.meta.url) + "\n");
  process.exit(await runDoctor(import.meta.url));
} else if (cmd === "hook") {
  const id = process.argv[3] ?? detectHarness().id;
  loadDotenv(id as HarnessId);
  const scopeArg = process.argv[4];
  const validScopes = new Set<string>(["solid", "rules", "carto", "security", "changelog", "aipilot", "lessons", "seo", "memory", "tailwindcss"]);
  const scope: PluginScope = scopeArg !== undefined && validScopes.has(scopeArg) ? (scopeArg as PluginScope) : "core";
  if (maybePlaySound(process.argv)) process.exit(0);
  const marketplaces = (process.env.FUSE_HARNESS_MARKETPLACES ?? "fusengine-plugins").split(",").map((s) => s.trim()).filter(Boolean);
  const refsDir = process.env.FUSE_HARNESS_REFS || discoverRefs(homedir(), process.cwd(), marketplaces) || undefined;
  traceHook("args", { id, scope });
  let outcome: Awaited<ReturnType<typeof handleHook>>;
  try {
    outcome = await handleHook(id, await readStdin(), { now: Date.now(), cwd: process.cwd(), refsDir, windowMs: resolveTtlSec(process.env) * 1000, scope });
  } catch (e) { traceHook("handleHook-threw", e instanceof Error ? `${e.message}\n${e.stack}` : String(e)); throw e; }
  traceHook("outcome", { stdoutLength: outcome.stdout.length, exit: outcome.exit });
  if (outcome.stdout) process.stdout.write(outcome.stdout);
  process.exit(outcome.exit);
} else if (cmd === "init") {
  const id = (process.argv[3] as HarnessId | undefined) ?? detectHarness().id;
  const files = initFor(id);
  if (!files) {
    process.stderr.write(`harness: no hook integration for "${id}" — use \`harness check\` in a pre-commit step\n`);
    process.exit(1);
  }
  const written = files.map((f) => writeInitFile(process.cwd(), f));
  process.stdout.write(`harness: wired ${id} -> ${written.join(", ")}\n`);
  process.exit(0);
} else if (cmd === "changelog") {
  try {
    process.stdout.write(JSON.stringify(await scanChangelog()) + "\n");
    process.exit(0);
  } catch (e) {
    process.stdout.write(JSON.stringify({ status: "error", message: e instanceof Error ? e.message : "changelog fetch failed" }) + "\n");
    process.exit(1);
  }
} else if (cmd === "scan") {
  const dir = process.argv[3] ?? process.cwd();
  process.stdout.write(JSON.stringify(runSecurityScan(dir), null, 2) + "\n");
  process.exit(0);
} else {
  const files = stagedFiles();
  if (files.length === 0) process.exit(0);
  const violations = checkStaged(files, stagedContent);
  if (violations.length > 0) {
    process.stderr.write(`harness check: policy violations\n\n${violations.join("\n\n")}\n`);
    process.exit(1);
  }
  process.exit(0);
}
