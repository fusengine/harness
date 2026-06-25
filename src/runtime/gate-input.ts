import type { RefMeta } from "../refs/types";

/** A tool-use to gate, plus the session pointers needed for the stateful gates. */
export interface GateInput {
  sessionId: string;
  framework: string;
  tool: string;
  filePath?: string;
  content?: string;
  command?: string;
  cwd?: string;
  refs?: RefMeta[];
  now: number;
  trackFile: string;
  windowMs?: number;
  isReplaceAll?: boolean;
  agentType?: string;
}
