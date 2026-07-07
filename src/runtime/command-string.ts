/** Shell basenames whose `-c`-style argv carries the real script in argv[2]. */
const SHELLS = new Set(["bash", "sh", "zsh", "dash"]);

/** True when `arg` is (a path to) a POSIX shell we know wraps a `-c` script. */
function isShell(arg: string | undefined): boolean {
  if (arg === undefined) return false;
  const base = arg.slice(arg.lastIndexOf("/") + 1);
  return SHELLS.has(base);
}

/** True for a shell command flag (`-c`, `-lc`, `-ic`, …) — anything ending in `c`. */
function isCommandFlag(arg: string | undefined): boolean {
  return arg !== undefined && /^-[a-z]*c$/.test(arg);
}

/**
 * Coerce a hook payload's `command` field to the shell string the guard chain
 * expects. Harnesses disagree on the wire shape: Claude Code, Cursor, and Hermes
 * send a plain string, but Codex CLI sends an argv ARRAY
 * (`["bash", "-lc", "git commit -m x"]`). A naive `typeof === "string"` check
 * dropped the array to `undefined`, blinding every `ctx.command` guard
 * (destructive-git, mutators, install…) into a silent fail-open. This restores
 * the script so the array and string payloads reach an identical verdict.
 *
 * @param v - Raw `command` value off the payload (string, argv array, or other).
 * @returns A string as-is; a `[shell, -c|-lc, script]` argv reduced to its
 *   script; any other all-string array joined with spaces; and `undefined` for
 *   empty arrays, arrays holding non-strings, or any other type.
 */
export function commandToString(v: unknown): string | undefined {
  if (typeof v === "string") return v;
  if (!Array.isArray(v)) return undefined;
  if (v.length === 0 || !v.every((e) => typeof e === "string")) return undefined;
  const argv = v as string[];
  if (argv.length >= 3 && isShell(argv[0]) && isCommandFlag(argv[1])) return argv[2];
  return argv.join(" ");
}
