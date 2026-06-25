import { existsSync, readFileSync, writeFileSync, rmSync, mkdirSync } from "node:fs";
import { join } from "node:path";

const flagPath = (cacheDir: string): string => join(cacheDir, "design-agent-active");

/** The active design agent id (the flag), or "" when no design agent is running. */
export function activeDesignAgent(cacheDir: string): string {
  const path = flagPath(cacheDir);
  if (!existsSync(path)) return "";
  try {
    return readFileSync(path, "utf8").trim();
  } catch {
    return "";
  }
}

/** Mark a design agent active (writes its id to the flag file). */
export function setActiveDesignAgent(cacheDir: string, agentId: string): void {
  mkdirSync(cacheDir, { recursive: true });
  writeFileSync(flagPath(cacheDir), agentId);
}

/** Clear the active-design-agent flag. */
export function clearActiveDesignAgent(cacheDir: string): void {
  try {
    rmSync(flagPath(cacheDir));
  } catch {
    /* already absent */
  }
}
