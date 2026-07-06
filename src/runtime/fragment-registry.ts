/**
 * @module fragment-registry
 * Per-process registry of injected fragment sizes, populated by
 * {@link module:inject-budget.capFragment} as a side effect and consumed by
 * {@link module:inject-budget-recap} to build ONE event-level recap instead
 * of the scattered per-injection-point reports (each caller of `capFragment`
 * only ever saw its OWN fragment, never the total for the whole event).
 *
 * Module-level state is safe here: each hook invocation is a fresh short-lived
 * CLI process (one per Claude Code hook event), so there is no cross-event
 * leakage in production. {@link resetFragmentRegistry} exists so a single
 * process handling several events in sequence (unit tests; any future
 * long-lived host) can still isolate one event's fragments from the next.
 * @packageDocumentation
 */
import type { FragmentSize } from "./inject-budget";

let registry: FragmentSize[] = [];

/** Clear the registry. Call once before dispatching a hook event. */
export function resetFragmentRegistry(): void {
  registry = [];
}

/** Record one fragment's post-cap size. Called by {@link module:inject-budget.capFragment}. */
export function recordFragment(label: string, chars: number): void {
  registry.push({ label, chars });
}

/** Snapshot of every fragment recorded since the last {@link resetFragmentRegistry}. */
export function fragmentRegistry(): FragmentSize[] {
  return [...registry];
}
