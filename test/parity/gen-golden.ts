import { writeFileSync } from "node:fs";
import { join } from "node:path";
import { guard } from "../../src/adapters/claude";
import { CASES, bashInput } from "./fixtures";

/** Regenerate golden.snapshot.json — run after an INTENTIONAL policy change. */
const snap: Record<string, string | null> = {};
for (const kase of CASES) snap[kase.name] = guard(bashInput(kase.command));
writeFileSync(join(import.meta.dir, "golden.snapshot.json"), `${JSON.stringify(snap, null, 2)}\n`);
console.log(`wrote ${Object.keys(snap).length} golden entries`);
