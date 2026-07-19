import type { CodexPrefixRule } from "../types";

/**
 * Absolute-path executable aliases — Codex only resolves an absolute path
 * to its basename rule when the CLI is run with `--resolve-host-executables`
 * (opt-in, off by default; this generated `.rules` file cannot assume it).
 * `/bin/rm -rf /` and a bare `rm -rf /` are two DIFFERENT argv prefixes to
 * execpolicy, so every rule keyed on one of these bare names is mirrored
 * onto its common absolute-path forms.
 */
const ABSOLUTE_PATH_ALIASES: Record<string, string[]> = {
  rm: ["/bin/rm", "/usr/bin/rm"],
  chmod: ["/bin/chmod", "/usr/bin/chmod"],
  diskutil: ["/usr/sbin/diskutil"],
  dd: ["/bin/dd", "/usr/bin/dd"],
  sudo: ["/usr/bin/sudo"],
};

/** Escape regex metacharacters so a dynamic token can be safely embedded in a `RegExp` literal. */
function escapeRegExp(token: string): string {
  return token.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/** Replace a match/notMatch example's leading token with an absolute-path alias. */
function aliasExample(example: string, from: string, to: string): string {
  return example.replace(new RegExp(`^${escapeRegExp(from)}\\b`), to);
}

/**
 * Clone every rule in `rules` whose first pattern token has a known
 * absolute-path alias, producing one variant per alias (same decision,
 * same sourceLabel — traced back to the same `security.ts` label).
 */
export function withAbsolutePathAliases(rules: CodexPrefixRule[]): CodexPrefixRule[] {
  const out: CodexPrefixRule[] = [];
  for (const rule of rules) {
    const first = rule.pattern[0];
    if (typeof first !== "string") continue;
    const aliases = ABSOLUTE_PATH_ALIASES[first];
    if (!aliases) continue;
    for (const alias of aliases) {
      out.push({
        ...rule,
        pattern: [alias, ...rule.pattern.slice(1)],
        match: rule.match.map((m) => aliasExample(m, first, alias)),
        notMatch: rule.notMatch?.map((m) => aliasExample(m, first, alias)),
        justification: `${rule.justification} (absolute-path form; Codex does not resolve executable basenames by default).`,
      });
    }
  }
  return out;
}
