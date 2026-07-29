/**
 * @module design-content-gate
 * PRE content gate for design-system.md — the nominal path (validateDesignSystem
 * used to run only behind the opt-in Gemini branch, so designSystemValid meant
 * "a write happened", not "the content is valid"). Split out of
 * `design-helpers.ts` to keep both files within the SOLID size budget (SRP).
 * @packageDocumentation
 */
import { readFileSync, existsSync } from "node:fs";
import type { Prompt } from "../prompt/types";
import type { DesignState } from "../policy/design/state";
import { deny, validateDesignSystem } from "../policy/design/gates";
import { citedCorpusRefs, citationJoinsReads } from "../policy/design/corpus";
import { substituteLiteral } from "./design-files-gate";

/** Inputs for {@link designSystemContentGate} — the PRE write event plus resolved corpus context. */
interface ContentGateInput {
  filePath: string;
  tool: string;
  content: string;
  oldString?: string;
  replaceAll: boolean;
  state: DesignState;
  corpusRoot: string;
  corpusRequired: boolean;
}

/**
 * Every content violation of a design-system.md text, GRANULAR (one entry per
 * unmet requirement and per unread cited reference — so a worsening check can
 * diff two violation sets): the four hard requirements, plus the citation↔read
 * jointure when the corpus is delivered.
 */
export function designSystemProblems(content: string, reads: readonly string[], corpusRequired: boolean): string[] {
  const problems = validateDesignSystem(content, corpusRequired);
  if (corpusRequired) {
    for (const ref of citedCorpusRefs(content)) {
      if (!citationJoinsReads(ref, reads)) problems.push(`cited corpus reference never read: ${ref}`);
    }
  }
  return problems;
}

/** Content check for a design-system.md already on disk (the Gemini create_frontend path). */
export function checkDesignSystemContent(content: string, reads: readonly string[], corpusRequired: boolean): Prompt | null {
  const problems = designSystemProblems(content, reads, corpusRequired);
  return problems.length ? deny(`BLOCKED: design-system.md too generic. Missing: ${problems.join(", ")}.`) : null;
}

/**
 * The content a Write/Edit would LEAVE in design-system.md, and the on-disk
 * original when the file exists (for BOTH tools). Edit reconstructs via
 * literal substitution (first occurrence, or all under replace_all — the Edit
 * tool's own semantics, mirroring edit-outcome.ts). Null when unverifiable
 * (unreadable file or stale old_string) — fail-closed, such an Edit fails at
 * tool level anyway.
 */
function effectiveContents(i: ContentGateInput): { result: string; original: string | null } | null {
  if (i.tool !== "Edit") {
    let original: string | null = null;
    try {
      if (existsSync(i.filePath)) original = readFileSync(i.filePath, "utf8");
    } catch {
      original = null;
    }
    return { result: i.content, original };
  }
  let disk: string;
  try {
    disk = readFileSync(i.filePath, "utf8");
  } catch {
    return null;
  }
  if (!i.oldString || !disk.includes(i.oldString)) return null;
  return { result: substituteLiteral(disk, i.oldString, i.content, i.replaceAll), original: disk };
}

/**
 * Block only the violations the change INTRODUCES (`problems(result) ⊄
 * problems(original)`): a legacy design-system.md that predates the doctrine
 * stays editable — and rewritable — including byte-identically or toward
 * conformance; a change that adds a NEW problem (or writes an invalid file
 * from scratch) is blocked.
 */
export function designSystemContentGate(i: ContentGateInput): Prompt | null {
  if (!i.filePath.endsWith("design-system.md")) return null;
  const pair = effectiveContents(i);
  if (pair === null) return deny("BLOCKED: cannot verify the edit result (unreadable file or stale old_string). RECOVERY: re-read design-system.md, then retry.");
  const result = designSystemProblems(pair.result, i.state.corpusReads, i.corpusRequired);
  if (!result.length) return null;
  const original = pair.original !== null ? designSystemProblems(pair.original, i.state.corpusReads, i.corpusRequired) : [];
  const introduced = result.filter((p) => !original.includes(p));
  if (!introduced.length) return null;
  return deny(`BLOCKED: design-system.md too generic. Missing: ${introduced.join(", ")}. RECOVERY: fix the content (read cited refs-design references with the Read tool), then retry.`);
}
