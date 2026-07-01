/**
 * SubagentStop (matcher "") for the ai-pilot scope: check SOLID file-size and
 * interface-location compliance for every file a sub-agent wrote/edited, per
 * the transcript. Ports `check-solid-from-transcript.py`. Fires unconditionally
 * for every sub-agent, unlike the sniper/research-expert-scoped caches here.
 */
import { readText, pathExists } from "../../../util/runtime-io";
import { contextResponse } from "../../../adapters/claude";
import { resolveMaxLines } from "../../../config/limits";
import { transcriptFilePaths } from "./transcript";
import { countCodeLines } from "./solid-compliance";

const CODE_EXTENSIONS = /\.(ts|tsx|js|jsx|py|go|rs|java|php|cpp|c|rb|swift|kt|dart|vue|svelte|astro)$/;
const INTERFACE_PATTERN = /^(export )?(interface|type) [A-Z]/m;
const INTERFACE_DIRS = ["components/", "pages/", "views/", "app/"];

/**
 * Check every Write/Edit target in a subagent transcript against the SOLID
 * line-count ceiling and interface-location convention.
 * @param transcript - Path to the agent JSONL transcript (`agent_transcript_path`).
 * @returns The SubagentStop `additionalContext` response, or `""` when clean.
 */
export async function checkSolidFromTranscript(transcript: string | undefined): Promise<string> {
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
    if (INTERFACE_DIRS.some((prefix) => fp.includes(prefix)) && INTERFACE_PATTERN.test(content)) {
      violations.push(`SOLID: ${name}: move interfaces to interfaces/`);
    }
  }

  if (violations.length === 0) return "";
  return contextResponse("SubagentStop", `## SOLID VIOLATIONS DETECTED (subagent output)\n${violations.join("\n")}\nRun sniper to fix these issues.`);
}
