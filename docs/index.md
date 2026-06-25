# @fusengine/harness — documentation

A harness-agnostic enforcement engine for AI coding agents. **One Bun-native
package**, modular subpaths. The `exports` map points at the TypeScript source
for Bun; a built `dist` (`.mjs` + `.d.mts`) serves Node/bundler consumers.

## Architecture

```
        pure, harness-agnostic core                 thin per-harness adapters
  ┌─────────────────────────────────────────┐      ┌──────────────────────────┐
  │ detect · policy(evaluate + 10 guards)    │      │ adapters/claude          │
  │ policy/apex(gates) · tracking · refs     │ ───► │ adapters/codex           │
  │ cache · freshness · memory · state       │      │ adapters/cursor          │
  │ config · prompt · statusline · util      │      │ adapters/cline           │
  │ runtime(handle · gate · mcp · storage)   │      │ adapters/gemini          │
  └─────────────────────────────────────────┘      │ cli (init · hook · check)│
                                                    └──────────────────────────┘
```

- **Core** knows *nothing* about any harness. `evaluate(ctx)` → `{ decision, prompt }`.
- **`detect`** identifies the running harness (`hook` vs `cli` mode).
- **`runtime`** is the loop: `handleHook` gates on a PRE event and records on a
  POST event, fed from a per-harness session track.
- **Adapters** parse a harness payload → core → that harness's native response.

## Pages

| Page | Module |
|------|--------|
| [detect.md](./detect.md) | runtime harness detection |
| [policy.md](./policy.md) | `evaluate`, file-size, framework, APEX gates |
| [guards.md](./guards.md) | the 10 portable guards + `runGuards` chain |
| [runtime.md](./runtime.md) | `handleHook`, `gate`, tracking, MCP intercept — the loop |
| [config.md](./config.md) | env-driven config (TTL, max-lines, refs dir) |
| [modules.md](./modules.md) | cache · freshness · refs · state · memory · statusline · util |
| [adapters.md](./adapters.md) | adapters + `harness init`/`hook` wiring |
| [design.md](./design.md) | design-agent pipeline — state machine, gates, opt-in Gemini |

Generated API reference: `bun run docs:api` → `docs/api/`.
See also: [CHANGELOG](../CHANGELOG.md) · [CONTRIBUTING](../CONTRIBUTING.md) · [README](../README.md).

## Install & develop

```sh
bun add @fusengine/harness
bun test            # 117 tests
bunx tsc --noEmit   # typecheck (isolatedDeclarations)
bun run build       # dist + .d.mts
```
