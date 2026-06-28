/**
 * Graphiti neural-memory HTTP client (best-effort). Ports the urllib calls in
 * the memory-neural scripts: POST /episodes (store) + POST /search (recall).
 * Every call swallows network errors and honors a 5s timeout, so a hook never
 * fails or hangs when the Graphiti server is absent.
 */

const TIMEOUT_MS = 5000;

/** Base URL `http://<NEURAL_MEMORY_HOST>:<GRAPHITI_PORT>` (env-overridable). */
export function neuralBase(env: NodeJS.ProcessEnv = process.env): string {
  const host = env.NEURAL_MEMORY_HOST ?? "localhost";
  const port = env.GRAPHITI_PORT ?? "8000";
  return `http://${host}:${port}`;
}

/** A Graphiti episode payload. */
export interface Episode {
  name: string;
  episode_body: string;
  source_description: string;
  reference_time: string;
}

/** POST an episode to Graphiti `/episodes`. Resolves silently on any failure. */
export async function postEpisode(ep: Episode, env: NodeJS.ProcessEnv = process.env): Promise<void> {
  try {
    await fetch(`${neuralBase(env)}/episodes`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(ep),
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
  } catch { /* best effort */ }
}

/** A single recall hit (content or name). */
export interface RecallHit {
  content?: string;
  name?: string;
}

/**
 * POST a query to Graphiti `/search`; returns hits or `[]` on any failure
 * (network error, timeout, non-2xx, malformed JSON).
 * @param query - The search query.
 * @param numResults - Max results requested.
 * @param env - Env (for host/port overrides).
 * @returns The recall hits, possibly empty.
 */
export async function searchMemory(query: string, numResults: number, env: NodeJS.ProcessEnv = process.env): Promise<RecallHit[]> {
  try {
    const resp = await fetch(`${neuralBase(env)}/search`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ query, num_results: numResults }),
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
    if (!resp.ok) return [];
    const data = (await resp.json()) as { results?: RecallHit[] };
    return Array.isArray(data.results) ? data.results : [];
  } catch {
    return [];
  }
}
