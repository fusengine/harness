import type { CodexPrefixRule } from "../types";

/**
 * Single-purpose destructive binaries — hand-mapped 1:1 from `security.ts`'s
 * `chmod 777 on /`, `shred`, `fdisk` CRITICAL_PATTERNS labels. `mkfs`,
 * `dd`, and `diskutil erase` live in their own files (`mkfs.ts`, `dd.ts`,
 * `diskutil.ts`) — each needed a wider case/variant enumeration than fits
 * this file's SRP scope. The root-chmod rule needs the same flag-order
 * alternation as `chmod-ask.ts` — source security.ts accepts flags before
 * `777` for the root case too (`chmod -R 777 /` is still CRITICAL there).
 */
export const SINGLE_COMMAND_RULES: CodexPrefixRule[] = [
  {
    sourceLabel: "DANGEROUS PATTERN: chmod 777 on /",
    pattern: ["chmod", "777", "/"],
    decision: "forbidden",
    justification: "World-writable permissions on the filesystem root.",
    match: ["chmod 777 /"],
  },
  {
    sourceLabel: "DANGEROUS PATTERN: chmod 777 on /",
    pattern: ["chmod", "-R", "777", "/"],
    decision: "forbidden",
    justification: "World-writable permissions on the filesystem root, recursive.",
    match: ["chmod -R 777 /"],
  },
  {
    sourceLabel: "DANGEROUS PATTERN: chmod 777 on /",
    pattern: ["chmod", "-r", "777", "/"],
    decision: "forbidden",
    justification: "World-writable permissions on the filesystem root, recursive (lowercase flag).",
    match: ["chmod -r 777 /"],
  },
  {
    sourceLabel: "DANGEROUS PATTERN: chmod 777 on /",
    pattern: ["chmod", "-v", "777", "/"],
    decision: "forbidden",
    justification: "World-writable permissions on the filesystem root, verbose flag.",
    match: ["chmod -v 777 /"],
  },
  {
    sourceLabel: "CRITICAL: Detected dangerous command 'shred'",
    pattern: ["shred"],
    decision: "forbidden",
    justification: "Irreversibly overwrites file contents.",
    match: ["shred -u secrets.txt"],
    notMatch: ["cat secrets.txt"],
  },
  {
    sourceLabel: "CRITICAL: Detected dangerous command 'fdisk'",
    pattern: ["fdisk"],
    decision: "forbidden",
    justification: "Edits disk partition tables.",
    match: ["fdisk /dev/sda"],
    notMatch: ["cat /proc/partitions"],
  },
];
