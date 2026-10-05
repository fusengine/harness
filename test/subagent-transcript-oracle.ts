/**
 * VERBATIM copies of the former whole-file sub-agent transcript readers
 * (pre bounded-memory scan), operating on the file text. Test oracle only.
 */
interface Use { name: string; input: Record<string, unknown> | undefined; ts?: number }
interface Edit { file: string; oldStr: string; newStr: string }

function parseTs(raw: string | number | undefined): number | undefined {
  if (raw === undefined) return undefined;
  if (typeof raw === "number") return raw;
  const ms = Date.parse(raw);
  return Number.isFinite(ms) ? ms : undefined;
}

/** Old `readAgentToolUses` body (minus the file read). */
export function oldToolUses(text: string): Use[] | null {
  const out: Use[] = [];
  for (const line of text.split("\n")) {
    if (!line.trim()) continue;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    let entry: any;
    try { entry = JSON.parse(line); } catch { continue; }
    // Sole intentional difference: a literal `null` line made the old code THROW
    // (TypeError on `null.message`, crashing the hook); the new reader skips it.
    if (entry === null) continue;
    const content = entry.message?.content;
    if (!Array.isArray(content)) continue;
    const ts = parseTs(entry.timestamp);
    for (const block of content) {
      if (block?.type !== "tool_use" || !block.name) continue;
      out.push({ name: block.name, input: block.input, ts });
    }
  }
  return out;
}

/** Old `transcriptFilePaths`. */
export function oldFilePaths(text: string, toolNames?: readonly string[]): string[] {
  const paths = new Set<string>();
  for (const line of text.split("\n").filter(Boolean)) {
    try {
      const content = (JSON.parse(line) as { message?: { content?: unknown } })?.message?.content;
      if (!Array.isArray(content)) continue;
      for (const block of content) {
        if (block?.type !== "tool_use") continue;
        if (toolNames && !toolNames.includes(block.name)) continue;
        const fp = block.input?.file_path ?? block.input?.path ?? "";
        if (typeof fp === "string" && fp.startsWith("/")) paths.add(fp);
      }
    } catch { /* skip malformed */ }
  }
  return [...paths];
}

/** Old `transcriptEdits`. */
export function oldEdits(text: string): Edit[] {
  const edits: Edit[] = [];
  for (const line of text.split("\n").filter(Boolean)) {
    try {
      const content = (JSON.parse(line) as { message?: { content?: unknown } })?.message?.content;
      if (!Array.isArray(content)) continue;
      for (const block of content) {
        if (block?.type === "tool_use" && block.name === "Edit" && block.input?.file_path) {
          edits.push({ file: block.input.file_path, oldStr: block.input.old_string ?? "", newStr: block.input.new_string ?? "" });
        }
      }
    } catch { /* skip malformed */ }
  }
  const seen = new Map<string, Edit>();
  for (const e of edits) seen.set(e.file.split("/").pop() ?? e.file, e);
  return [...seen.values()];
}

/** Old `transcriptReport`. */
export function oldReport(text: string): string {
  let lastReport = "";
  for (const line of text.split("\n").filter(Boolean)) {
    try {
      const entry = JSON.parse(line) as { message?: { role?: string; content?: { type?: string; text?: string }[] } };
      if (entry?.message?.role !== "assistant") continue;
      for (const block of entry.message.content ?? []) {
        if (block.type === "text" && block.text) lastReport = block.text;
      }
    } catch { /* skip malformed */ }
  }
  return lastReport.split("\n").slice(0, 500).join("\n");
}
