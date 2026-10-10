/** @module motion/guard-scope Safe scope probe before fallible command discovery. */
import { statSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { commandContexts, homePath, renderEntryPaths } from "./command-context";
import { shellMotionWriteTargets } from "./command";

/** Detect local motion scope without JSON parsing/canonicalization; unreadable scope is not absence. */
export function protectedMotionDirectory(cwd: string, home: string): boolean {
  let directory = resolve(cwd);
  for (;;) {
    if (directory !== resolve(home)) {
      try { if (statSync(join(directory, ".motion"))) return true; }
      catch (error) {
        const code = (error as NodeJS.ErrnoException).code;
        if (code !== "ENOENT" && code !== "ENOTDIR") return true;
      }
    }
    const parent = dirname(directory);
    if (parent === directory) return false;
    directory = parent;
  }
}

/** Probe child invocation/output marker directories before fallible project discovery. */
export function protectedMotionCommand(command: string | undefined, cwd: string, home: string): boolean {
  if (!command) return false;
  const checked = new Set<string>();
  for (const [segment, directory] of commandContexts(command, cwd, home)) {
    if (protectedMotionDirectory(directory, home)) return true;
    for (const path of [...renderEntryPaths(segment), ...shellMotionWriteTargets(segment)]) {
      if (/[$*?[]/.test(path)) continue;
      const parent = dirname(homePath(path, directory, home));
      if (checked.has(parent)) continue;
      checked.add(parent);
      if (protectedMotionDirectory(parent, home)) return true;
    }
  }
  return false;
}
