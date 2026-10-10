/** @module motion/guard-artifact Prevent destructive replacement of approved artifacts. */
import { dirname } from "node:path";
import { statSync } from "node:fs";
import type { MotionProject } from "../interfaces/motion";
import type { Prompt } from "../../prompt/types";
import { canonicalFilePath } from "../../runtime/prd/prd-canon";
import { listApprovals } from "./approvals";
import { commandTokens, segmentVerb } from "./shell-verbs";
import { commandContexts, homePath } from "./command-context";
import { shellMotionWriteTargets } from "./command";
import { isUnder } from "./paths";

/** Refuse destructive shell mutations of paths with recorded owner approvals. */
export function artifactMutationViolation(command: string, project: MotionProject, cwd: string, home: string): Prompt | null {
  const approved = new Set(listApprovals(project.root, home).map((a) => typeof a?.artifact === "string" ? canonicalFilePath(a.artifact) : ""));
  if (!approved.size) return null;
  for (const [segment, directory] of commandContexts(command, cwd, home)) {
    const verb = segmentVerb(segment);
    if (!/^(?:rm|rmdir|unlink|mv|cp|ln|mkfifo|truncate|install|rsync|ditto|find)$/.test(verb)) continue;
    if (verb === "find" && !/(?:-delete|-exec|-execdir)/.test(segment)) continue;
    const copy = /^(?:cp|ln|install)$/.test(verb);
    const targets = copy ? shellMotionWriteTargets(segment) : commandTokens(segment).slice(1);
    const expandedParents = new Set(targets.map((token) => dirname(canonicalFilePath(homePath(token, directory, home)))));
    for (const token of targets) {
      if (token.startsWith("-")) continue;
      const path = canonicalFilePath(homePath(token, directory, home));
      // Copies place the source basename inside an existing directory, not over the directory itself.
      if (copy && !approved.has(path) && expandedParents.has(path)) {
        try { if (statSync(path).isDirectory()) continue; } catch { /* A missing destination is a file candidate. */ }
      }
      if ([...approved].some((artifact) => artifact && isUnder(artifact, path))) {
        return { kind: "block", title: "Motion approved artifact guard", reason: "An approved stills/draft artifact cannot be removed or destructively replaced by an agent." };
      }
    }
  }
  return null;
}
