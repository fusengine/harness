# Contributing to @fusengine/harness

## Principles

1. **Core stays pure.** Anything under `src/` except `src/adapters/` must have
   **zero harness coupling** — no reading a specific harness's payload, no
   emitting a specific harness's response format. If it needs that, it's an
   adapter.
2. **Bun-native.** `exports` points at `src/*.ts`; no build step. Use
   `node:`-prefixed imports so the core stays portable (Node + Bun).
3. **One file = one reason to change.** Keep files small and focused.
4. **Every export is documented** with JSDoc (`@param`, one-line summary).

## Workflow

```sh
bun install
bun test          # all tests must pass
bunx tsc --noEmit # zero type errors
```

- Add a test in `test/<module>.test.ts` for every new export. Cover the edge
  cases (empty / invalid input, boundaries), not just the happy path.
- Inject I/O dependencies (paths, `now`, `env`) as parameters so units are
  testable without touching the real filesystem/clock.

## Adding a harness

See [docs/adapters.md](./docs/adapters.md#adding-a-harness). In short: write
`src/adapters/<harness>/index.ts` that maps the harness payload → `evaluate()` →
the harness response, register a subpath in `package.json` `exports`, and add a
test.

## Commits

Conventional Commits (`feat:`, `fix:`, `docs:`, `chore:`). Update
[CHANGELOG.md](./CHANGELOG.md) under `[Unreleased]`.
