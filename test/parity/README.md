# Parity / non-regression harness (`test/parity/`)

This directory closes the ROADMAP debt **"Harnais de test différentiel Python↔TS"**:
until now nothing proved the TS harness stayed behaviourally equivalent to the
Python `core-guards` plugin it was ported from.

Two complementary layers, both driven by one curated payload matrix
(`fixtures.ts`, 38 Bash `PreToolUse` cases):

## 1. Real differential — `differential.test.ts`

Sends every payload to **both** engines and asserts identical verdicts
(`block` / `ask` / `allow`):

- **TS** — `guard()` from `src/adapters/claude` (the production decision path),
  normalized by `tsDecision()`.
- **Python** — the actual `core-guards` guard chain
  (`bash-write-guard.py`, `git-guard.py`, `install-guard.py`, `security-guard.py`)
  executed via `python3`, reduced with `block > ask > allow` (`py-runner.ts`).

The Python guards run in a fresh non-git temp `cwd` so their `ralph_mode`
git-branch sniffing is disabled → deterministic across machines.

**Reference location:** `~/Downloads/agents-main/plugins/core-guards`, override
with `FUSE_PARITY_PYTHON_ROOT`. When the reference (or `python3`) is absent —
e.g. in CI — the suite **auto-skips** (`test.skipIf`).

## 2. Golden snapshot — `golden.test.ts` (CI-safe)

Locks the exact native Claude response for each payload in
`golden.snapshot.json`. Runs everywhere (no Python needed) and is the
non-regression guarantee in CI. Regenerate after an **intentional** policy
change:

```sh
bun run test/parity/gen-golden.ts
```

## Intentional divergences (excluded on purpose)

The matrix only contains cases where TS and Python **agree**. The TS harness is
deliberately stricter in several spots (documented in `ROADMAP.md`), so these are
NOT asserted here: fork bomb, `mkfs.ext4`, `dd of=/dev/*`, `chmod 777`, `eval`
(TS blocks/asks, Python allows), plus the file-size / interface-separation
Write-vs-Edit deltas.
