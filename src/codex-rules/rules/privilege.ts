import type { CodexPrefixRule } from "../types";

/**
 * Privilege-escalation binaries — hand-mapped 1:1 from `security.ts`'s
 * `sudo`/`su`/`doas`/`passwd`/`del` CRITICAL_PATTERNS labels (parity
 * `security_rules.PRIVILEGE_COMMANDS`).
 */
export const PRIVILEGE_RULES: CodexPrefixRule[] = [
  {
    sourceLabel: "PRIVILEGE ESCALATION: sudo",
    pattern: ["sudo"],
    decision: "forbidden",
    justification: "Runs a command with elevated privileges.",
    match: ["sudo rm -rf /tmp"],
    notMatch: ["echo sudo"],
  },
  {
    sourceLabel: "PRIVILEGE ESCALATION: su",
    pattern: ["su"],
    decision: "forbidden",
    justification: "Switches to another user, typically root.",
    match: ["su -", "su root"],
    notMatch: ["sudo ls"],
  },
  {
    sourceLabel: "PRIVILEGE ESCALATION: doas",
    pattern: ["doas"],
    decision: "forbidden",
    justification: "BSD-style sudo alternative for elevated privileges.",
    match: ["doas reboot"],
    notMatch: ["ls"],
  },
  {
    sourceLabel: "PRIVILEGE ESCALATION: passwd",
    pattern: ["passwd"],
    decision: "forbidden",
    justification: "Changes a user's password.",
    match: ["passwd root"],
    notMatch: ["cat /etc/passwd"],
  },
  {
    sourceLabel: "CRITICAL: Detected dangerous command 'del'",
    pattern: ["del"],
    decision: "forbidden",
    justification: "Windows-style file deletion (parity security_rules.CRITICAL_COMMANDS).",
    match: ["del file.txt"],
    notMatch: ["delete.sh"],
  },
];
