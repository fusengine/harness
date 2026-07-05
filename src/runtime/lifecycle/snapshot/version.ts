import { readFileSync } from "node:fs";
import { join } from "node:path";
import { runningVersion } from "../../../cli/doctor";

/** Read the `version` field of `<root>/package.json`, or `""` if absent/unreadable. */
function pkgVersion(root: string): string {
  try {
    const pkg = JSON.parse(readFileSync(join(root, "package.json"), "utf8")) as { version?: string };
    return pkg.version ?? "";
  } catch {
    return "";
  }
}

/**
 * Collect the version reconciliation section: the harness version actually
 * running (resolved from {@link runningVersion}, no network) and, when `root`
 * carries its own `package.json`, whether that project's version has drifted
 * from the running harness.
 * @param root - The project root (cwd repo).
 * @param moduleUrl - `import.meta.url` of the calling module (locates the running package.json).
 * @returns The rendered version section body (never `""`).
 */
export function collectVersion(root: string, moduleUrl: string): string {
  const running = runningVersion(moduleUrl).version;
  const lines = [`- harness running: v${running}`];
  const project = pkgVersion(root);
  if (project && project !== running) {
    lines.push(`- project package.json: v${project} (DRIFT — running harness differs)`);
  } else if (project) {
    lines.push(`- project package.json: v${project} (in sync)`);
  }
  return lines.join("\n");
}
