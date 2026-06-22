import type { Prompt } from "../../prompt/types";

/** Context handed to every guard in the chain. */
export interface GuardContext {
  tool: string;
  filePath?: string;
  content?: string;
  command?: string;
}

/** A single guard: returns a blocking/asking Prompt, or null to continue. */
export type Guard = (ctx: GuardContext) => Prompt | null;
