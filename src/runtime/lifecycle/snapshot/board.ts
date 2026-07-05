import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";

/** Max board characters injected — a persistent board should stay small; over-long boards are truncated. */
const MAX_BOARD = 4000;

/**
 * Collect the persistent task board: the contents of `<root>/.claude/BOARD.md`
 * (truncated to {@link MAX_BOARD}) plus an instruction to keep it current. The
 * board lives on disk so it survives context purges — rehydrated every session.
 * Missing/empty/unreadable board → `""` (section omitted).
 * @param root - The project root.
 * @returns The rendered board section body, or `""` when there is no board.
 */
export function collectBoard(root: string): string {
  const path = join(root, ".claude", "BOARD.md");
  try {
    if (!existsSync(path)) return "";
    let body = readFileSync(path, "utf8").trim();
    if (!body) return "";
    if (body.length > MAX_BOARD) body = `${body.slice(0, MAX_BOARD)}\n… (truncated)`;
    const note = "- .claude/BOARD.md (keep current — Write to it as tasks start/finish):";
    return `${note}\n\n${body}`;
  } catch {
    return "";
  }
}
