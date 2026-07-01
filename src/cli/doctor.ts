/**
 * `harness doctor` — diagnose which `@fusengine/harness` is actually running.
 *
 * A confirmed, still-open bun bug (oven-sh/bun #5791; scoped-pkg behaviour
 * reinforced by #32019/#32150) makes `bunx <pkg>` (unpinned) prefer a stale
 * GLOBAL install over npm-latest, so a consumer can silently run an old harness
 * after a publish. This command surfaces the truth: the resolved version +
 * package path of the code executing right now, the runtime binary, and the
 * latest version published on npm. It queries the registry over HTTP (not
 * `npm view`, whose exit code is 0 even on an empty result — npm/cli#6408) and
 * never throws: an offline environment yields `latest: null`, never a crash.
 */
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const PKG = "@fusengine/harness";

/** Diagnostic snapshot printed by `harness doctor`. */
export interface DoctorReport {
  /** Version from the running `package.json` (`"unknown"` if not resolvable). */
  running: string;
  /** Absolute path to the running package root. */
  packagePath: string;
  /** Runtime binary executing this code (`process.execPath`). */
  runtime: string;
  /** Latest version on npm, or `null` when offline / unreachable. */
  latest: string | null;
  /** True when npm advertises a version different from the one running. */
  stale: boolean;
}

/** Walk up from `startDir` for the `@fusengine/harness` `package.json`. */
function findPackage(startDir: string): { version: string; path: string } | null {
  let dir = startDir;
  for (let depth = 0; depth < 6; depth++) {
    try {
      const pkg = JSON.parse(readFileSync(join(dir, "package.json"), "utf8")) as { name?: string; version?: string };
      if (pkg.name === PKG) return { version: pkg.version ?? "unknown", path: dir };
    } catch { /* not here — keep walking up */ }
    const parent = dirname(dir);
    if (parent === dir) break;
    dir = parent;
  }
  return null;
}

/** Resolve the running version + package path (no network), from a module URL. */
export function runningVersion(moduleUrl: string): { version: string; path: string } {
  const found = findPackage(dirname(fileURLToPath(moduleUrl)));
  return { version: found?.version ?? "unknown", path: found?.path ?? "unknown" };
}

/** One-line `pkg vX.Y.Z` banner (stderr, only on explicit `--version`/`doctor` commands — never on `hook`, to avoid spamming automated invocations). */
export function versionBanner(moduleUrl: string): string {
  return `${PKG} v${runningVersion(moduleUrl).version}`;
}

/** Latest published version via the npm registry HTTP API. `null` on any failure. */
export async function npmLatest(): Promise<string | null> {
  try {
    const res = await fetch(`https://registry.npmjs.org/${PKG}/latest`, { signal: AbortSignal.timeout(8000) });
    if (!res.ok) return null;
    const body = (await res.json()) as { version?: string };
    return body.version ?? null;
  } catch {
    return null;
  }
}

/** Build the full diagnostic report for the module at `moduleUrl`. */
export async function buildDoctorReport(moduleUrl: string): Promise<DoctorReport> {
  const { version, path } = runningVersion(moduleUrl);
  const latest = await npmLatest();
  return { running: version, packagePath: path, runtime: process.execPath, latest, stale: latest !== null && latest !== version };
}

/** Render a {@link DoctorReport} as human-readable stdout text. */
export function formatDoctor(r: DoctorReport): string {
  const lines = [
    `${PKG} doctor`,
    `  running:    ${r.running}`,
    `  package:    ${r.packagePath}`,
    `  runtime:    ${r.runtime}`,
    `  npm latest: ${r.latest ?? "(unavailable — offline or unreachable)"}`,
  ];
  if (r.stale) lines.push(`  ! stale — npm serves ${r.latest}. Pin "@fusengine/harness@${r.latest}" in hooks.json (see README).`);
  else if (r.latest !== null) lines.push(`  ok — running the latest published version.`);
  return lines.join("\n");
}

/** Run `harness doctor`: print the diagnostic to stdout. Always resolves 0 (pure info). */
export async function runDoctor(moduleUrl: string): Promise<number> {
  process.stdout.write(formatDoctor(await buildDoctorReport(moduleUrl)) + "\n");
  return 0;
}
