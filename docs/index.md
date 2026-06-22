# @fusengine/harness — documentation

Harness-agnostic toolkit for AI coding agents. **One Bun-native package**, modular
subpaths, no build step (the `exports` map points at the TypeScript source).

## Architecture

```
        pure, harness-agnostic core            thin per-harness adapters
  ┌───────────────────────────────────┐      ┌─────────────────────────┐
  │ config · policy(evaluate) · cache  │ ───► │ adapters/claude  (hook) │
  │ freshness · refs · state · memory  │      │ adapters/cursor  (todo) │
  │ detect · statusline · util         │      │ bin/cli-mode     (todo) │
  └───────────────────────────────────┘      └─────────────────────────┘
```

- **Core** knows *nothing* about any harness. `evaluate(ctx)` takes a generic
  context and returns `{ decision, message }`.
- **`detect`** identifies the running harness (`hook` vs `cli` mode).
- **Adapters** are the only harness-specific code: parse that harness's payload →
  call the core → serialize that harness's response.

## Pages

| Page | Module |
|------|--------|
| [detect.md](./detect.md) | runtime harness detection |
| [policy.md](./policy.md) | `evaluate`, file-size, framework, guard patterns |
| [config.md](./config.md) | env-driven config (TTL, max-lines) |
| [modules.md](./modules.md) | cache · freshness · refs · state · memory · statusline · util |
| [adapters.md](./adapters.md) | Claude adapter + **how to add a harness** |

See also: [CHANGELOG](../CHANGELOG.md) · [CONTRIBUTING](../CONTRIBUTING.md) · [README](../README.md).

## Install & develop

```sh
bun add @fusengine/harness
bun test          # 48 tests
bunx tsc --noEmit # typecheck
```
