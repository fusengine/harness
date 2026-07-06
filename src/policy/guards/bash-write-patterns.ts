import { CMD } from "./bash-command-anchor";

/** Code-file extensions the write guards police (shared by CODE_REDIRECT and
 *  CODE_COMMAND_WRITE). Case-sensitive, parity with the Python guard's list. */
const CODE_EXT = "ts|tsx|js|jsx|py|go|rb|rs|java|kt|php|swift|vue|svelte|astro|css|c|cpp|h";

/** Redirect (`>`/`>>`) targeting a code-file extension. */
export const CODE_REDIRECT: RegExp = new RegExp(`(?:>>?)\\s*[^\\s|;&]*\\.(?:${CODE_EXT})\\b`);

/**
 * Interpreters / tools that mutate source in place, plus heredoc-into-file —
 * split into labeled sub-patterns (parity bash-write-guard.py `DENY_PATTERNS`,
 * each with its own `desc`) so the deny reason names which motif matched
 * instead of a single generic message. Every command-named motif is
 * {@link CMD}-anchored (start/separator + optional wrapper chain); only the
 * structural heredoc-into-file motif is position-free.
 */
export const CODE_MUTATORS: readonly { re: RegExp; desc: string }[] = [
  { re: new RegExp(`${CMD}python3?\\s+-\\s*<<`), desc: "Python heredoc input" },
  { re: new RegExp(`${CMD}python3?\\s+-c\\b`), desc: "Python inline script" },
  { re: new RegExp(`${CMD}sed\\b[^|]*\\s-i`), desc: "sed in-place edit" },
  { re: new RegExp(`${CMD}perl\\b[^|]*\\s-[pi]i?\\b`), desc: "perl in-place edit" },
  { re: new RegExp(`${CMD}awk\\b[^|]*-i\\s*inplace`), desc: "awk in-place edit" },
  // `patch` as a command token (start/separator + optional wrapper chain), then a
  // metachar/space/EOL. Never the bare word merely NAMING a path in a read-only
  // command (`jq . apply-patch.json`, `grep patch src/`). Prefix-wrapped forms
  // (`env patch`, `timeout 5 patch`) are now DENIED — the previously accepted gap
  // was closed (owner decision 2026-07-06): the wrapper chain folds into CMD.
  { re: new RegExp(`${CMD}patch(?=\\s|<|[;&|)>]|$)`), desc: "patch file modification" },
  { re: /<<[-~]?\s*['"]?\w+['"]?[\s\S]*?>/, desc: "heredoc redirected into a file" },
];

/**
 * `tee`/`dd of=` whose TARGET is a code file — the command-form parallel to
 * CODE_REDIRECT. {@link CMD}-anchored so `env`/`timeout` wrappers don't shield
 * it; the `tee` branch scans ALL args up to the next `;&|` separator so a
 * decoy-first-target (`tee log.txt src/x.ts`) can't hide the code write. A tee
 * to a NON-code target (`cmd | tee results.txt`) does not match — it stays a
 * plain ASK_WRITERS ask, never a hard block, so ordinary logging is untouched.
 */
export const CODE_COMMAND_WRITE: RegExp = new RegExp(
  `${CMD}(?:tee\\s+[^;&|\\n]*?|dd\\b[^|]*\\bof=\\S*)\\.(?:${CODE_EXT})\\b`,
);

/** File-mutating one-liners via `node -e` / `ruby -e` (parity NODE_WRITES/RUBY_WRITES). */
export const NODE_WRITES: RegExp =
  /writeFile|appendFile|createWriteStream|fs\.(?:write|rename|unlink|mkdir|rmdir|copyFile)|execSync|spawnSync|child_process/;
export const RUBY_WRITES: RegExp =
  /File\.(?:write|open|delete|rename)|IO\.write|FileUtils|\bsystem\b|\bexec\b|`[^`]/;

/** Redirect to a non-code file. Excludes `/dev/null`, `2>`/`N>` and `>&N` fd
 * redirects via the `(?<![0-9&])` lookbehind + `(?!…|&)` (parity has_file_redirect). */
export const FILE_REDIRECT: RegExp =
  /(?<![0-9&])\s*>>?\s*(?!\/dev\/null|&)[a-zA-Z./~$]/;

/** Other ambiguous file writers (ASK): `tee <file>` (not `tee -a`/path) and `dd … of=` —
 * labeled sub-patterns (parity bash-write-guard.py `ASK_PATTERNS`). */
export const ASK_WRITERS: readonly { re: RegExp; desc: string }[] = [
  { re: /\btee\s+[^-/\s]/, desc: "tee to file" },
  { re: /\bdd\b[^|]*\bof=/, desc: "dd output to file" },
];

/** Commands whose first token never writes, skipped when a real redirect is
 * present (parity bash-write-guard.py `SAFE_PREFIXES`). */
export const SAFE_PREFIXES: readonly string[] = [
  "ls", "pwd", "which", "cat ", "head ", "tail ", "wc ", "file ", "stat ", "tree", "du ", "df ",
  "find ", "grep ", "rg ", "git ", "cd ", "source ", "export ", "unset ", "env ", "printenv",
  "bun test", "bun run", "bunx ", "npm test", "npm run", "npx ", "biome ", "eslint ",
  "prettier ", "ruff ", "pyright ", "tsc ", "mkdir ", "mv ", "cp ",
];

/**
 * Session-state directory the freshness/APEX gates rely on. Any Bash command
 * touching it is a hook-bypass vector, so it is blocked outright — a blunt
 * substring match (read OR write), parity with bash-write-guard.py DENY_PATTERNS
 * `fusengine-cache/sessions` (rebranded to the harness cache path).
 */
export const SESSION_STATE_FRAGMENT = ".fuse-harness/cache/sessions";
