import type { CodexPrefixRule } from "../types";

/**
 * `mkfs` filesystem-formatting variants — hand-mapped from `security.ts`'s
 * `\bmkfs(?:\.[a-z0-9]+)?\b` CRITICAL_PATTERNS label. The source regex
 * accepts ANY `.suffix`; `prefix_rule` cannot express an open-ended suffix,
 * so every real-world `mkfs.*` filesystem type is enumerated explicitly as
 * an alternation at position 0 (exhaustive, not a mechanical derivation).
 */
export const MKFS_RULES: CodexPrefixRule[] = [
  {
    sourceLabel: "CRITICAL: Detected dangerous command 'mkfs'",
    pattern: [
      [
        "mkfs",
        "mkfs.ext2",
        "mkfs.ext3",
        "mkfs.ext4",
        "mkfs.xfs",
        "mkfs.btrfs",
        "mkfs.exfat",
        "mkfs.vfat",
        "mkfs.fat",
        "mkfs.ntfs",
        "mkfs.f2fs",
        "mkfs.hfsplus",
        "mkfs.apfs",
        "mkfs.msdos",
        "mkfs.minix",
        "mkfs.jfs",
        "mkfs.reiserfs",
        "mkfs.udf",
        "mkfs.bfs",
        "mkfs.cramfs",
      ],
    ],
    decision: "forbidden",
    justification: "Formats a block device, destroying its contents (exhaustive mkfs.* variant enumeration).",
    match: ["mkfs.exfat /dev/sda1", "mkfs.f2fs /dev/sdb1", "mkfs /dev/sdb1", "mkfs.ext4 /dev/sda1"],
    notMatch: ["ls /dev"],
  },
];
