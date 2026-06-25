#!/usr/bin/env node
/**
 * harness — CLI for @fusengine/harness.
 *   harness check          cli-mode: check staged files (pre-commit), exit non-zero on a violation
 *   harness init [id]      write the wiring file for a harness (defaults to the detected one)
 *   harness hook <id>      runtime: read a hook payload on stdin, route to the adapter, print the response
 */
import { detectHarness, type HarnessId } from "../detect/harness";
import { initFor, writeInitFile } from "../init/run";
import { handleHook } from "../runtime/handle";
import type { PluginScope } from "../runtime/lifecycle";
import { resolveTtlSec } from "../config/ttl";
import { checkStaged, stagedContent, stagedFiles } from "./run";

async function readStdin(): Promise<Record<string, unknown>> {
  const chunks: Buffer[] = [];
  for await (const c of process.stdin) chunks.push(c as Buffer);
  const text = Buffer.concat(chunks).toString("utf8").trim();
  if (!text) return {};
  try {
    const parsed: unknown = JSON.parse(text);
    return typeof parsed === "object" && parsed !== null ? (parsed as Record<string, unknown>) : {};
  } catch {
    return {};
  }
}

const cmd = process.argv[2];

if (cmd === "hook") {
  const id = process.argv[3] ?? detectHarness().id;
  const scopeArg = process.argv[4];
  const validScopes = new Set<string>(["solid", "rules", "carto", "security", "changelog", "aipilot", "lessons", "seo"]);
  const scope: PluginScope = scopeArg !== undefined && validScopes.has(scopeArg) ? (scopeArg as PluginScope) : "core";
  const outcome = await handleHook(id, await readStdin(), { now: Date.now(), cwd: process.cwd(), refsDir: process.env.FUSE_HARNESS_REFS, windowMs: resolveTtlSec(process.env) * 1000, scope });
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
