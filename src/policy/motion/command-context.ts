/** @module motion/command-context Shared sequential shell path contexts. */
import { homedir } from "node:os";
import { basename, resolve } from "node:path";
import { commandTokens, literalShellPayload, shellSegments } from "./shell-verbs";

/** Resolve a literal explicit home path without executing shell expressions. */
export function homePath(path: string, cwd: string, home: string): string {
  return resolve(cwd, path.replace(/^(?:~|\$HOME|\$\{HOME\})(?=\/|$)/, home));
}

/** Yield each shell segment with the directory in effect before it executes. */
export function* commandContexts(command: string, cwd: string, home: string = homedir(), depth = 0): Generator<readonly [string, string]> {
  if (depth > 64) throw new Error("Motion shell nesting exceeds safe analysis depth");
  let current = cwd;
  let previous = cwd;
  for (const segment of shellSegments(command)) {
    const inner = literalShellPayload(segment);
    if (inner) {
      yield* commandContexts(inner, current, home, depth + 1);
      continue;
    }
    yield [segment, current];
    const tokens = commandTokens(segment);
    if (tokens[0] !== "cd") continue;
    let at = 1;
    while (tokens[at] === "-L" || tokens[at] === "-P") at++;
    if (tokens[at] === "--") at++;
    const target = tokens[at] ?? home;
    if (/[$*?[]/.test(target) && !/^(?:\$HOME|\$\{HOME\})(?:\/|$)/.test(target)) continue;
    const next = target === "-" ? previous : homePath(target, current, home);
    previous = current;
    current = next;
  }
}

/** Literal executable/script operands, never arbitrary data inputs such as cp sources. */
export function renderEntryPaths(segment: string): string[] {
  const tokens = commandTokens(segment);
  const verb = basename(tokens[0] ?? "");
  const interpreted = /^(?:bun|node|python[0-9.]*|deno|bash|sh|zsh|dash|npx|tsx)$/.test(verb);
  return (interpreted ? tokens.slice(1) : tokens.slice(0, 1))
    .filter((token) => !token.startsWith("-") && token.includes("/") && !/[$*?[]/.test(token));
}
