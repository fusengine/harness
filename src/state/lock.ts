import { mkdir, rmdir } from "node:fs/promises";

const sleep = (ms: number): Promise<void> => new Promise((r) => setTimeout(r, ms));

/**
 * Acquire a directory-based lock (atomic `mkdir`, EEXIST = already held) with a timeout.
 * @returns a release function, or null if the lock could not be acquired in time.
 */
export async function acquireLock(
  lockDir: string,
  timeoutMs = 5000,
): Promise<(() => Promise<void>) | null> {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    try {
      await mkdir(lockDir, { recursive: false });
      return async () => {
        try { await rmdir(lockDir); } catch { /* noop */ }
      };
    } catch {
      await sleep(100);
    }
  }
  return null;
}
