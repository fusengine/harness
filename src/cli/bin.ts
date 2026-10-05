#!/usr/bin/env node
/**
 * harness — CLI for @fusengine/harness.
 *   harness check          cli-mode: check staged files (pre-commit), exit non-zero on a violation
 *   harness init [id]      write the wiring file for a harness (defaults to the detected one)
 *   harness hook <id>      runtime: read a hook payload on stdin, route to the adapter, print the response
 *   harness changelog      fetch + diff the Claude Code changelog, print a JSON summary (changelog-watcher)
 *   harness codex-rules    generate a Codex execpolicy .rules (Starlark) file from security.ts; stdout or --out <path>
 *
 * `hook` is the hot path (one process per event): only the modules it needs are
 * imported statically; every other command is loaded on demand via `import()`.
 */
import { detectHarness, type HarnessId } from "../detect/harness";

const cmd = process.argv[2];

if (cmd === "--version" || cmd === "-v") {
  const { runningVersion, versionBanner } = await import("./doctor");
  process.stderr.write(versionBanner(import.meta.url) + "\n");
  process.stdout.write(runningVersion(import.meta.url).version + "\n");
  process.exit(0);
} else if (cmd === "doctor") {
  const { runDoctor, versionBanner } = await import("./doctor");
  process.stderr.write(versionBanner(import.meta.url) + "\n");
  process.exit(await runDoctor(import.meta.url));
} else if (cmd === "hook") {
  // Light entry: decides rendezvous vs legacy BEFORE the heavy runtime is imported (see hook-entry.ts).
  const { hookEntry } = await import("./hook-entry");
  await hookEntry(process.argv);
} else if (cmd === "init") {
  const { initFor, writeInitFile } = await import("../init/run");
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
    const { scanChangelog } = await import("../changelog/fetch");
    process.stdout.write(JSON.stringify(await scanChangelog()) + "\n");
    process.exit(0);
  } catch (e) {
    process.stdout.write(JSON.stringify({ status: "error", message: e instanceof Error ? e.message : "changelog fetch failed" }) + "\n");
    process.exit(1);
  }
} else if (cmd === "scan") {
  const { runSecurityScan } = await import("../runtime/lifecycle/security/scan");
  const dir = process.argv[3] ?? process.cwd();
  process.stdout.write(JSON.stringify(runSecurityScan(dir), null, 2) + "\n");
  process.exit(0);
} else if (cmd === "prd") {
  const { runPrd } = await import("./prd");
  process.exit(await runPrd(process.argv.slice(3), process.cwd(), process.env));
} else if (cmd === "codex-rules") {
  const [{ buildCodexRules }, { writeFileSync }] = await Promise.all([import("../codex-rules"), import("node:fs")]);
  const outIdx = process.argv.indexOf("--out");
  const outPath = outIdx !== -1 ? process.argv[outIdx + 1] : undefined;
  const rules = buildCodexRules();
  if (outPath) {
    writeFileSync(outPath, rules);
    process.stderr.write(`harness: wrote Codex execpolicy rules -> ${outPath}\n`);
  } else {
    process.stdout.write(rules);
  }
  process.exit(0);
} else {
  const { checkStaged, stagedContent, stagedFiles } = await import("./run");
  const files = stagedFiles();
  if (files.length === 0) process.exit(0);
  const violations = checkStaged(files, stagedContent);
  if (violations.length > 0) {
    process.stderr.write(`harness check: policy violations\n\n${violations.join("\n\n")}\n`);
    process.exit(1);
  }
  process.exit(0);
}
