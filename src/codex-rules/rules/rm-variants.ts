import type { CodexPrefixRule } from "../types";

/**
 * `rm` prefix rules — hand-mapped from `security.ts`'s two `rm -rf`-family
 * CRITICAL_PATTERNS labels. Both source regexes accept `-rf`/`-fr` combined
 * or `-r -f`/`-f -r` split flags, so each label needs 3 prefix_rule variants
 * (combined flag + 2 split-flag orders) to avoid a flag-order gap.
 */
export const RM_VARIANT_RULES: CodexPrefixRule[] = [
  {
    sourceLabel: "DANGEROUS PATTERN: recursive delete of / or ~",
    pattern: ["rm", ["-rf", "-fr"], ["/", "~"]],
    decision: "forbidden",
    justification: "Recursive force-delete of the filesystem root or home directory.",
    match: ["rm -rf /", "rm -fr ~"],
    notMatch: ["rm -rf /tmp/build"],
  },
  {
    sourceLabel: "DANGEROUS PATTERN: recursive delete of / or ~",
    pattern: ["rm", "-r", "-f", ["/", "~"]],
    decision: "forbidden",
    justification: "Recursive force-delete of the filesystem root or home directory (split flags).",
    match: ["rm -r -f /", "rm -r -f ~"],
    notMatch: ["rm -r -f /tmp/build"],
  },
  {
    sourceLabel: "DANGEROUS PATTERN: recursive delete of / or ~",
    pattern: ["rm", "-f", "-r", ["/", "~"]],
    decision: "forbidden",
    justification: "Recursive force-delete of the filesystem root or home directory (split flags, reversed).",
    match: ["rm -f -r /", "rm -f -r ~"],
    notMatch: ["rm -f -r /tmp/build"],
  },
  {
    sourceLabel: "DANGEROUS PATTERN: recursive delete of a system directory",
    pattern: ["rm", ["-rf", "-fr"], ["/etc", "/usr", "/var", "/bin", "/sbin", "/boot", "/lib"]],
    decision: "forbidden",
    justification: "Recursive force-delete of a core system directory.",
    match: ["rm -rf /etc", "rm -fr /usr"],
    notMatch: ["rm -rf /home/user/project"],
  },
  {
    sourceLabel: "DANGEROUS PATTERN: recursive delete of a system directory",
    pattern: ["rm", "-r", "-f", ["/etc", "/usr", "/var", "/bin", "/sbin", "/boot", "/lib"]],
    decision: "forbidden",
    justification: "Recursive force-delete of a core system directory (split flags).",
    match: ["rm -r -f /var", "rm -r -f /bin"],
    notMatch: ["rm -r -f /home/user"],
  },
  {
    sourceLabel: "DANGEROUS PATTERN: recursive delete of a system directory",
    pattern: ["rm", "-f", "-r", ["/etc", "/usr", "/var", "/bin", "/sbin", "/boot", "/lib"]],
    decision: "forbidden",
    justification: "Recursive force-delete of a core system directory (split flags, reversed).",
    match: ["rm -f -r /sbin", "rm -f -r /lib"],
    notMatch: ["rm -f -r /tmp"],
  },
];
