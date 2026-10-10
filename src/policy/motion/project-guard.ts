/** @module motion/project-guard Owner-managed contract mutation protection. */
import { resolve } from "node:path";
import type { Prompt } from "../../prompt/types";
import type { NormalizedEvent } from "../../runtime/normalize";
import { canonicalFilePath } from "../../runtime/prd/prd-canon";
import { shellMotionWriteTargets } from "./command";
import { findMotionRoot } from "./project";
import { commandTokens, literalShellPayload, segmentVerb, shellSegments } from "./shell-verbs";
import { MOTION_WRITE_TOOLS } from "./constants";

const MUTATORS = new Set(["rm", "mv", "cp", "ln", "rsync", "ditto", "install", "rmdir", "unlink", "chmod", "chown", "truncate", "touch", "mkdir", "mkfifo"]);
const COPIERS = new Set(["cp", "rsync", "ditto", "install", "ln"]);

/** Identify obvious Git writes to the working tree, while allowing read-only and unrelated path operations. */
function gitContractMutation(tokens: string[]): boolean {
  let at = 1;
  while (tokens[at]?.startsWith("-")) {
    if (["-C", "-c", "--git-dir", "--work-tree", "--namespace"].includes(tokens[at] ?? "")) at++;
    at++;
  }
  const subcommand = tokens[at];
  if (!subcommand || !/^(?:checkout|switch|reset|restore|stash|clean|read-tree|checkout-index|update-index)$/.test(subcommand)) return false;
  const args = tokens.slice(at + 1);
  const contract = args.some((arg) => /(?:^|[,/])\.motion(?:\/|$)/.test(arg) || arg === ".");
  if (contract) return true;
  if (subcommand === "switch" || subcommand === "stash") return true;
  if (subcommand === "checkout") return !args.includes("--");
  if (subcommand === "reset") return args.some((arg) => /^(?:--hard|--merge|--keep)$/.test(arg));
  if (subcommand === "read-tree") return args.some((arg) => /^-[^-]*u/.test(arg));
  return subcommand === "checkout-index" && args.some((arg) => arg === "--all" || /^-[^-]*a/.test(arg));
}

/** Protect the owner-managed motion contract, including removal/replacement of its root directory.
 * @param event - Normalized agent tool call.
 * @param cwd - Directory used to resolve relative tool paths.
 * @param home - Injected OS home used to locate the motion project.
 * @returns A denial for contract mutations, or null for reads and harmless scaffolds.
 */
export function projectContractViolation(event: NormalizedEvent, cwd: string, home: string): Prompt | null {
  const root = findMotionRoot(cwd, home);
  // Evaluation performs no filesystem writes; cache only within this tool call.
  const decisions = new Map<string, boolean>();
  const protectedPath = (path: string, mode: "write" | "copy" | "mkdir" = "write"): boolean => {
    const lexical = resolve(cwd, path);
    const key = `${mode}:${lexical}`;
    const cached = decisions.get(key);
    if (cached !== undefined) return cached;
    const canonical = canonicalFilePath(lexical);
    const blocked = [lexical, canonical].some((p) => /\/\.motion\/project\.json$/.test(p)
      || (mode !== "mkdir" && (/\/\.motion$/.test(p) || (mode !== "copy" && root !== null && (p === root || root.startsWith(p + "/"))))));
    decisions.set(key, blocked);
    return blocked;
  };
  const paths = MOTION_WRITE_TOOLS.has(event.tool) ? [event.filePath, ...(event.files ?? []).map((f) => f.filePath)] : [];
  // Move-to patch markers are not retained in NormalizedFile, but still mutate a target.
  if (event.tool === "apply_patch" || (event.tool === "Edit" && event.files)) {
    const raw = typeof event.input.command === "string" ? event.input.command : typeof event.input.patch === "string" ? event.input.patch : "";
    for (const m of raw.matchAll(/^\*\*\* (?:Add File|Update File|Delete File|Move to): (.+)$/gm)) paths.push(m[1]);
  }
  let violation = paths.some((p) => p !== undefined && protectedPath(p));
  const bashViolation = (command: string): boolean => {
    return shellSegments(command).some((segment) => {
      const inner = literalShellPayload(segment);
      if (inner && bashViolation(inner)) return true;
      const verb = segmentVerb(segment);
      const mode = COPIERS.has(verb) ? "copy" : verb === "mkdir" ? "mkdir" : "write";
      if (shellMotionWriteTargets(segment).some((path) => protectedPath(path, mode))) return true;
      if (root && verb === "find" && /(?:-delete|-exec|-execdir)/.test(segment)) return true;
      if (root && verb === "git" && gitContractMutation(commandTokens(segment))) return true;
      if (COPIERS.has(verb)) return false;
      return MUTATORS.has(verb) && commandTokens(segment).slice(1).filter((p) => p !== "--" && !p.startsWith("-"))
        .some((p) => protectedPath(p, mode));
    });
  };
  if (event.tool === "Bash" && event.command) violation ||= bashViolation(event.command);
  return violation ? { kind: "block", title: "Motion project contract guard",
    reason: "The owner-managed .motion/project.json contract and its containing project directory cannot be modified, removed, or moved by an agent. The owner must edit the contract outside the agent." } : null;
}
