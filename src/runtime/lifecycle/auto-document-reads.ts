/**
 * PostToolUse (matcher "Read") for the core scope: auto-document important
 * reads (SKILL.md/README/CLAUDE.md/docs/references) into
 * `.claude/apex/docs/task-<current>-<framework>.md`, once per file per task.
 * Ports `post-tool-use/auto-document-reads.py`.
 */
import { appendFileSync, existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { basename, dirname, join } from "node:path";
import { readJsonFile } from "../../util/json-io";
import { detectProjectType } from "../../policy/detect-project";
import { projectRootOrNull } from "../../util/project-root";
import { systemMessage } from "../../adapters/claude";
import type { ApexTaskFile } from "./aipilot/types";

/** Read-tool file paths worth auto-documenting. */
const DOC_PATTERNS = [
  /(SKILL\.md|README\.md|CLAUDE\.md)$/,
  /\/docs\/.*\.md$/,
  /\/references\/.*\.md$/,
  /skills\/[^/]+\/SKILL\.md$/,
];

/** First matching marker (in order) labels the doc-type; "File" otherwise. */
const TYPE_MAP: Array<[string, string]> = [
  ["SKILL.md", "Skill"], ["README.md", "README"], ["CLAUDE.md", "Rules"],
  ["/references/", "Reference"], ["/docs/", "Doc"],
];

/** The doc-type label for a matched file path. */
function docTypeOf(filePath: string): string {
  return TYPE_MAP.find(([marker]) => filePath.includes(marker))?.[1] ?? "File";
}

/**
 * Auto-document a Read of a SKILL.md/README/CLAUDE.md/docs/references file
 * into `.claude/apex/docs/task-<current>-<framework>.md` (skipped when the
 * file is already logged, or no project root is found from `filePath`).
 * @param filePath - The path passed to the Read tool.
 * @param now - Clock (defaults to `Date.now()`).
 * @returns The native `systemMessage` stdout, or "" when nothing was logged.
 */
export async function autoDocumentRead(filePath: string, now: number = Date.now()): Promise<string> {
  if (!filePath || !DOC_PATTERNS.some((p) => p.test(filePath))) return "";
  const root = projectRootOrNull(dirname(filePath));
  if (!root) return "";

  const framework = detectProjectType(root);
  const taskData = await readJsonFile<ApexTaskFile>(join(root, ".claude", "apex", "task.json"));
  const current = taskData?.current_task ?? "1";

  const docDir = join(root, ".claude", "apex", "docs");
  const docFile = join(docDir, `task-${current}-${framework}.md`);
  const ts = new Date(now).toISOString().replace(/\.\d{3}Z$/, "Z");
  const fname = basename(filePath);
  const docType = docTypeOf(filePath);

  try {
    mkdirSync(docDir, { recursive: true });
    if (!existsSync(docFile)) {
      const fc = framework.charAt(0).toUpperCase() + framework.slice(1);
      writeFileSync(docFile, `# Task ${current} - ${fc} Documentation\n## Consulted: ${ts} | Source: skill:Read\n## Key Info\n\n`, "utf-8");
    }
    if (readFileSync(docFile, "utf-8").includes(`\`${fname}\``)) return "";
    appendFileSync(docFile, `- **[${docType}]** \`${fname}\` - ${ts}\n`, "utf-8");
  } catch {
    return "";
  }
  return systemMessage(`📖 [${docType}] ${fname} logged`);
}
