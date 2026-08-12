/**
 * SubagentStop (matcher "research-expert") for the ai-pilot scope: extract the
 * agent's synthesis text from the transcript and cache it as documentation.
 * Ports `cache-doc-from-transcript.ts`. SubagentStop output here is a pure
 * side-effect (no stdout needed).
 */
import { homedir } from "node:os";
import { join } from "node:path";
import { readJsonFile, writeJsonFile } from "../../../util/json-io";
import { readText, writeText, pathExists, sleep } from "../../../util/runtime-io";
import { hashText16, cacheDirFor } from "./cache-base";
import { transcriptFilePaths, projectRootFromPaths } from "./transcript";
import { canonicalizeMcpToolName } from "../../mcp-tool-name";
import type { CacheEntry, CacheIndex } from "./types";

const TOOL_PATTERN = /context7__query-docs|exa__get_code_context|exa__web_search/;
const MAX_DOC_SIZE = 20480;
const MIN_TEXT_SIZE = 200;
const MAX_DOCS = 15;
const RETRY_DELAYS = [500, 1000, 2000];

/**
 * Extract the longest assistant synthesis + queried library ids from a transcript.
 * @param id - Harness adapter id, used to canonicalize `block.name` (Codex-mangled
 *   underscore tool names) before the {@link TOOL_PATTERN} match — see
 *   {@link cacheDocFromTranscript} for why this is a defensive, unconfirmed-case cover.
 */
async function extractSynthesis(path: string, id: string): Promise<{ text: string; libraries: string[] }> {
  const lines = readText(path).split("\n").filter(Boolean);
  const libraries: string[] = [];
  let synthesis = "";
  for (const line of lines) {
    try {
      const entry = JSON.parse(line) as { type?: string; role?: string; message?: { content?: unknown } };
      const role = entry?.type ?? entry?.role;
      const contents = entry?.message?.content;
      if (!Array.isArray(contents)) continue;
      for (const block of contents) {
        if (block.type === "tool_use" && TOOL_PATTERN.test(canonicalizeMcpToolName(id, block.name ?? ""))) {
          const lib = block.input?.libraryId ?? block.input?.query ?? "";
          if (lib && !libraries.includes(lib)) libraries.push(lib);
        }
        if (role === "assistant" && block.type === "text" && typeof block.text === "string" && block.text.length > synthesis.length) {
          synthesis = block.text;
        }
      }
    } catch { /* skip malformed */ }
  }
  return { text: synthesis, libraries };
}

/**
 * SubagentStop research-expert: cache the synthesis text from the transcript.
 * @param transcript - Path to the agent JSONL transcript.
 * @param cwd - Fallback project root.
 * @param home - Home dir (defaults to `~`).
 * @param id - Harness adapter id (defaults to "claude-code"). On `"codex"`,
 *   every `tool_use.name` read from the transcript is canonicalized before the
 *   {@link TOOL_PATTERN} match, defensively covering the SAME Codex-mangled
 *   underscore form as `doc-cache-gate.ts`'s `docCacheGate`. UNLIKE that gate,
 *   this is NOT a confirmed-reproduced bug: the proof that Codex emits the
 *   underscore form (`sanitize_responses_api_tool_name()`, openai/codex#14605,
 *   `SCENARIO_DASH_TOOL` in #18385) is about the live PreToolUse HOOK payload,
 *   never observed here against transcript `tool_use.name` content. The
 *   canonicalization is a no-op when the transcript already carries the dash
 *   form (idempotence proven in `test/mcp-tool-name.test.ts`, test 2), so this
 *   costs nothing if the hypothesis turns out false.
 */
export async function cacheDocFromTranscript(transcript: string | undefined, cwd: string, home: string = homedir(), id: string = "claude-code"): Promise<void> {
  if (!transcript || !pathExists(transcript)) return;
  const allPaths = await transcriptFilePaths(transcript);
  const projPath = projectRootFromPaths(allPaths) ?? process.env.CLAUDE_PROJECT_DIR ?? cwd;
  const cacheDir = cacheDirFor("doc", projPath, home);
  const docsDir = join(cacheDir, "docs");

  let result = await extractSynthesis(transcript, id);
  for (const delay of RETRY_DELAYS) {
    if (result.text.length >= MIN_TEXT_SIZE && result.libraries.length > 0) break;
    await sleep(delay);
    result = await extractSynthesis(transcript, id);
  }
  const { text, libraries } = result;
  if (text.length < MIN_TEXT_SIZE || libraries.length === 0) return;

  const indexFile = join(cacheDir, "index.json");
  const index = (await readJsonFile<CacheIndex>(indexFile)) ?? { project: projPath, docs: [] };
  const timestamp = new Date().toISOString();
  const content = text.slice(0, MAX_DOC_SIZE);
  const topic = libraries.join(", ");
  const docHash = hashText16(topic);
  writeText(join(docsDir, `${docHash}.md`), content);

  const sizeKb = Math.floor(content.length / 1024);
  for (const lib of libraries) {
    index.docs = index.docs.filter((d: CacheEntry) => d.library !== lib);
    index.docs.push({ hash: docHash, library: lib, topic, timestamp, size_kb: sizeKb });
  }
  if (index.docs.length > MAX_DOCS) index.docs = index.docs.slice(-MAX_DOCS);
  await writeJsonFile(indexFile, index, true);
}
