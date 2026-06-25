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
| `FUSE_DESIGN_GEMINI` | _(off)_ | opt-in design Gemini gates — set `1`/`true` to enable |

```ts
const max = resolveMaxLines();                       // process.env
const ttl = resolveTtlSec({ FUSE_ENFORCE_TTL_SEC: "240" }); // 240
```
