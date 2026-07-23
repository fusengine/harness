/**
 * Shared store/query-definition exemption (owner F0.2): a file is governed
 * by the store/query conventions — NOT by the hook-location rule — ONLY when
 * its signature is validated AND its ecosystem is confirmed:
 * - store: the real `zustand`/`pinia` import (or the v5 curried signature);
 * - query: a TanStack Query definition AND the `@tanstack/*-query` cap in
 *   the nearest manifest. Without the cap, a fake `useQuery(` caller is just
 *   a hook — the legacy hook rule applies, byte-identical.
 */
import { declaresStore } from "./stores";
import { declaresQueryHook, queryCapActive } from "./query";

/**
 * True when the file is a store or query definition (exempt from hook rules).
 * @param filePath - The file being judged (manifest resolution for the cap).
 * @param content - Its RAW content (detectors mask internally).
 */
export function isStoreOrQueryDefinition(filePath: string, content: string): boolean {
  if (declaresStore(content, "zustand") || declaresStore(content, "pinia")) return true;
  return declaresQueryHook(content) && queryCapActive(filePath);
}
