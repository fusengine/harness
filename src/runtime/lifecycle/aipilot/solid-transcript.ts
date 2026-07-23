/**
 * SubagentStop (matcher "") for the ai-pilot scope: check SOLID file-size and
 * interface-location compliance for every file a sub-agent wrote/edited, per
 * the transcript. Ports `check-solid-from-transcript.py`. Fires unconditionally
 * for every sub-agent, unlike the sniper/research-expert-scoped caches here.
 */
import { readText, pathExists } from "../../../util/runtime-io";
import { contextResponse } from "../../../adapters/claude";
import { resolveMaxLines } from "../../../config/limits";
import { resolveTtlSec } from "../../../config/ttl";
import { projectLayout } from "../../../config/layout";
import { transcriptFilePaths } from "./transcript";
import { countCodeLines } from "./solid-compliance";
import { noticeFingerprint, shouldEmitNotice } from "./solid-notice";

const CODE_EXTENSIONS = /\.(ts|tsx|js|jsx|py|go|rs|java|php|cpp|c|rb|swift|kt|dart|vue|svelte|astro)$/;
const INTERFACE_PATTERN = /^(export )?(interface|type) [A-Z]/m;
/** Segment-anchored dirs (a substring like `app/` matched `livetest-app/`). */
const INTERFACE_DIRS_RE = /\/(components|pages|views|app)\//;
/** Canonical homes — never a violation there (owner decision: types/ is
 * canonical; Contracts/ is the Laravel home taught by solid-php/laravelGate). */
const INTERFACE_EXEMPT_RE = /\/(interfaces|types|Contracts|contracts)\//;

/**
 * Check every Write/Edit target in a subagent transcript against the SOLID
 * line-count ceiling and interface-location convention. Deduped per
 * transcript (`solid-notice.ts`): an unchanged violation set is emitted once
 * per TTL window, never in a loop.
 * @param transcript - Path to the agent JSONL transcript (`agent_transcript_path`).
 * @param cwd - Project root (locates the `.harness/track` dedup sidecar).
 * @param now - Clock (tests inject it).
 * @returns The SubagentStop `additionalContext` response, or `""` when clean/deduped.
 */
export async function checkSolidFromTranscript(transcript: string | undefined, cwd: string = process.cwd(), now: number = Date.now()): Promise<string> {
  if (!transcript || !pathExists(transcript)) return "";
  const files = await transcriptFilePaths(transcript, ["Write", "Edit"]);
  const max = resolveMaxLines();
  const violations: string[] = [];

  for (const fp of files.sort()) {
    if (!pathExists(fp) || !CODE_EXTENSIONS.test(fp)) continue;
    const name = fp.split("/").pop() ?? fp;
    let content: string;
    try {
      content = readText(fp);
    } catch {
      continue;
    }
    const lc = countCodeLines(content);
    if (lc > max) violations.push(`SOLID: ${name} = ${lc} lines (max ${max})`);
    if (INTERFACE_DIRS_RE.test(fp) && !INTERFACE_EXEMPT_RE.test(fp) && INTERFACE_PATTERN.test(content)) {
      const dest = fp.endsWith(".php") ? "app/Contracts/" : "interfaces/";
      violations.push(`SOLID: ${name}: move interfaces to ${dest}`);
    }
  }

  if (violations.length === 0) return "";
  if (!shouldEmitNotice(projectLayout(cwd).solidNoticeFile, transcript, noticeFingerprint(violations), now, resolveTtlSec(process.env) * 1000)) return "";
  return contextResponse("SubagentStop", `## SOLID VIOLATIONS DETECTED (subagent output)\n${violations.join("\n")}\nRun sniper to fix these issues.`);
}
