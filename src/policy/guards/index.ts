import type { Prompt } from "../../prompt/types";
import type { Guard, GuardContext } from "./context";
import { securityGuard } from "./security";
import { protectedPathGuard } from "./protected-path";
import { bashWriteGuard } from "./bash-write";
import { interfaceSeparationGuard } from "./interface-separation";
import { installGuard } from "./install";

export * from "./context";
export * from "./security";
export * from "./protected-path";
export * from "./bash-write";
export * from "./interface-separation";
export * from "./install";

/** Ordered guard chain: critical/security + protected first, then writes/installs. */
export const GUARDS: ReadonlyArray<Guard> = [
  securityGuard,
  protectedPathGuard,
  bashWriteGuard,
  interfaceSeparationGuard,
  installGuard,
];

/** Run the guard chain; the first firing guard's Prompt wins, else null. */
export function runGuards(ctx: GuardContext): Prompt | null {
  for (const guard of GUARDS) {
    const hit = guard(ctx);
    if (hit) return hit;
  }
  return null;
}
