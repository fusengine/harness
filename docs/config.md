# config — env-driven configuration

`import { resolveTtlSec, resolveMaxLines, parseEnvInt } from "@fusengine/harness/config";`

Robust integer-from-env parsing: `undefined` / empty / whitespace / `NaN` /
float / `<= 0` all fall back to the default.

## API

| Export | Description |
|--------|-------------|
| `parseEnvInt(raw, fallback)` | the robust parser (`Number("")` is 0, so the empty guard is required) |
| `resolveTtlSec(env?, key?)` | enforcement TTL in seconds — `FUSE_ENFORCE_TTL_SEC`, default `120` |
| `ttlLabel(sec)` | `120 → "2min"`, `240 → "4min"`, `90 → "90s"` |
| `resolveMaxLines(env?, key?)` | SOLID max lines — `FUSE_SOLID_MAX_LINES`, default `100` |
| `splitTarget(maxLines)` | advisory split headroom = `max - 10` (min 1) |
| `DEFAULT_TTL_SEC`, `DEFAULT_MAX_LINES`, `TTL_ENV_KEY`, `MAX_LINES_ENV_KEY` | constants |

## Environment variables

| Variable | Default | Used by |
|----------|---------|---------|
| `FUSE_ENFORCE_TTL_SEC` | `120` | freshness windows |
| `FUSE_SOLID_MAX_LINES` | `100` | file-size policy |
| `FUSE_LESSONS_THROTTLE_MIN` | `5` | project-memory reminders |
| `FUSE_HARNESS_REFS` | _(auto)_ | explicit SOLID-reference dirs (`path.delimiter` list); overrides auto-discovery |
| `FUSE_HARNESS_MARKETPLACES` | `fusengine-plugins` | marketplaces auto-scanned for `solid-*` skill refs when `FUSE_HARNESS_REFS` is unset |
| `FUSE_ENFORCE_GEMINI_MCP` | _(off)_ | opt-in — blocks hand-written Tailwind UI (`.tsx/.jsx/.vue/.svelte`) until a `mcp__gemini-design__*` call is made this session (`policy/gemini-mcp-gate.ts`) |
| `FUSE_DESIGN_GEMINI` | _(off)_ | opt-in — a **different** gate from the one above: enables the design-pipeline's own Gemini gates (`policy/design/gates.ts`), inert unless a design agent is active — see [design.md](./design.md) |
| `FUSE_MCP_TTL_SEC` | `172800` (48h) | Context7/Exa cache freshness (`runtime/mcp-key.ts`) |
| `FUSE_WEBFETCH_TTL_SEC` | `86400` (24h) | WebFetch cache freshness — pages stale faster than docs |
| `RALPH_MODE` | _(off)_ | opt-in autonomous mode — exempts safe git commands (`add`/`commit`/`checkout -b`/`status`/`diff`/`log`) from the confirmation ask and auto-approves project installs; destructive git and system installs still gate (`policy/patterns.ts`) |

```ts
const max = resolveMaxLines();                       // process.env
const ttl = resolveTtlSec({ FUSE_ENFORCE_TTL_SEC: "240" }); // 240
```
