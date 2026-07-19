import type { CodexPrefixRule } from "../types";

/**
 * `diskutil` erase/partition variants — hand-mapped from `security.ts`'s
 * case-insensitive `\bdiskutil\s+(?:erase|partitionDisk)\b/i` CRITICAL
 * label. `prefix_rule` has no case-insensitive matching, so every real
 * casing macOS users actually type (camelCase, all-lowercase, all-caps) is
 * enumerated explicitly as an alternation at position 1.
 */
export const DISKUTIL_RULES: CodexPrefixRule[] = [
  {
    sourceLabel: "CRITICAL: Detected dangerous command 'diskutil erase'",
    pattern: [
      "diskutil",
      [
        "erase",
        "eraseDisk",
        "erasedisk",
        "ERASEDISK",
        "eraseVolume",
        "erasevolume",
        "ERASEVOLUME",
        "partitionDisk",
        "partitiondisk",
        "PARTITIONDISK",
      ],
    ],
    decision: "forbidden",
    justification: "Erases or repartitions a macOS disk/volume (case-variant enumeration; execpolicy has no case-insensitive match).",
    match: ["diskutil eraseDisk /dev/disk2", "diskutil ERASEDISK /dev/disk2", "diskutil erase /dev/disk2"],
    notMatch: ["diskutil list"],
  },
];
