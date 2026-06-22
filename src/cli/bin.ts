#!/usr/bin/env node
/**
 * harness-check — cli-mode entry for harnesses without hooks (Aider, Windsurf,
 * OpenHands...). Run it as a pre-commit step: it checks staged files against the
 * policy core and exits non-zero on a violation.
 */
import { checkStaged, stagedContent, stagedFiles } from "./run";

const files = stagedFiles();
if (files.length === 0) process.exit(0);

const violations = checkStaged(files, stagedContent);
if (violations.length > 0) {
  process.stderr.write(`harness-check: policy violations\n\n${violations.join("\n\n")}\n`);
  process.exit(1);
}
process.exit(0);
