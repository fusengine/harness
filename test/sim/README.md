# Hook simulator (`test/sim/`)

Data-driven end-to-end harness for the Claude Code hook pipeline. Each scenario
is a JSON file replayed against the CLI: `simulator.test.ts` discovers every
`scenarios/*.json`, and `run-scenario.ts` drives the CLI for each one and
asserts the declared expectations.

## Scenario schema

```jsonc
{
  "name": "pretooluse-blocks-git-push",   // human label (file basename is the test name)
  "env": { "HARNESS_FRAMEWORK": "react" }, // optional: env applied to every step
  "steps": [
    {
      "scope": "PreToolUse",               // hook scope passed to the CLI
      "event": { /* hook payload piped to stdin */ },
      "expect": { /* assertion contract enforced by run-scenario */ }
    }
  ]
}
```

- **Placeholders** — `$TMP` (per-run temp dir) and `$FIXTURES` (this suite's
  fixtures) are substituted inside `env` and `event` before each step runs.
- **`steps`** run in order, sharing the same `$TMP`, so a scenario can assert
  cross-step state (dedup windows, receipts, deny-loop counters).

## How the CLI is invoked

By default `run-scenario.ts` spawns the source CLI:

```
bun src/cli/bin.ts hook claude-code <scope>
```

with the step's `event` piped to stdin. This is the fast local mode.

## `SIM_BIN` — run against the built binary

`SIM_BIN` is a **test-only** environment variable (not a product config). When
set, `run-scenario.ts` invokes the built binary instead of the source:

```
SIM_BIN=dist/cli/bin.mjs bun test test/sim/
```

This is the "works in src, broken in dist" guard: CI builds the bundle and
re-runs the whole corpus through `node $SIM_BIN` to catch bundling/packaging
regressions the source run cannot see. Build first (`bun run build`).

## Adding a scenario

1. Drop a new `scenarios/<slug>.json` following the schema above.
2. Run `bun run sim` (or `bun test test/sim/`) — the new file is picked up
   automatically, no wiring needed.
3. Keep it deterministic: use `$TMP`/`$FIXTURES`, never absolute host paths.

When `scenarios/` is empty or absent the suite skips cleanly rather than
failing (see `describe.skipIf` in `simulator.test.ts`).
