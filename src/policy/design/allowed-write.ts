/**
 * @module allowed-write
 * The design-agent write allowlist, split out of `gates.ts` to keep that file
 * within the SOLID size budget (SRP).
 * @packageDocumentation
 */
import { basename } from "node:path";

/** Extensions the design agent may always write: .html/.css/.md/.json. */
export const ALLOWED_WRITE: RegExp = /\.(html|css|md|json)$/;

/**
 * C4: `motion*.js` ONLY, matched on the BASENAME — every one of the 11
 * corpus references ships its animation as a separate `motion.js` /
 * `motion-nav.js` / `motion-scroll.js` file, so banning every `.js` forced
 * the agent to inline scripts the corpus explicitly teaches out-of-band.
 * Deliberately NOT `\.js$` in general (that would open arbitrary app code,
 * the exact thing this gate exists to block) — after the `motion` prefix,
 * either nothing (`motion.js`) or `.`/`-` then more (`motion-nav.js`) must
 * lead into `.js`; `app.js` and `motionless-app.js` — a bare `^motion`
 * prefix would wrongly pass this — do not match.
 */
const MOTION_JS: RegExp = /^motion([.-].*)?\.js$/;

/** True when `filePath` is a write the design agent may make: .html/.css/.md/.json, or a `motion*.js` file. */
export function isAllowedWrite(filePath: string): boolean {
  return ALLOWED_WRITE.test(filePath) || MOTION_JS.test(basename(filePath));
}
