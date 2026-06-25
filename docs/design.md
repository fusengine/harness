# Design pipeline

A state machine that enforces the fuse design-agent workflow (phases 0→4). It is
**inert unless a design agent is active** — every gate returns `null` when there is
no `design-agent-active` flag, so it never affects generic agents or other harnesses.

## Activation (lifecycle)

- `SubagentStart` of an agent whose `agent_type` contains `design` →
  `designLifecycle` (`runtime/design-lifecycle.ts`) initializes
  `.design-state-<id>.json` (mode inferred from the launch prompt + an existing
  `design-system.md`) and raises the `design-agent-active` flag.
- `SubagentStop` → archives the state file (timestamp suffix) and clears the flag.
  Archives older than 7 days are pruned.

## State (`policy/design/state.ts`)

`DesignState`: `mode` (`full`/`page`/`component`), `currentPhase` (0→4),
`phasesCompleted`, `inspirationRead`, `scrolledSinceNav`, `screenshotsCount`,
`designSystemExists`, `designSystemValid`, `geminiCalls`. Persisted per agent id;
**fail-open** (absent/corrupt → `null` → no gating).

## Gates (`policy/design/gates.ts`)

| Gate | Tool | Blocks when |
|---|---|---|
| `stateFileGate` | Write/Edit | editing a `.design-state-*` file (hooks own it) |
| `htmlCssOnlyGate` | Write/Edit | writing a non-`.html/.css/.md/.json` file |
| `designSystemWriteGate` | Write `design-system.md` | phase < 2, or screenshots < quota (`MIN_SCREENSHOTS` = full 4 / page 2 / component 0) |
| `browserNavigateGate` | fuse-browser navigate | phase < 1, inspiration not read, or URL not in the catalog |
| `screenshotScrollGate` | fuse-browser screenshot | no scroll since the last navigate |
| `geminiCreateGate` + `validateDesignSystem` | gemini `create_frontend` | phase < 3, or `design-system.md` invalid (missing `## Design Reference`, OKLCH chroma, reference URL, or a forbidden font) — **opt-in, see below** |

## Transitions (`policy/design/transitions.ts`)

`PostToolUse` advances the machine: Read of the identity templates → phase 1; Read
of `design-inspiration` → `inspirationRead`; navigate → resets the scroll guard;
scroll → satisfies it; each screenshot → `screenshotsCount++` (→ phase 2 once the
quota is met); writing `design-system.md` → phase 3 + validated.

## Content checks (`policy/design/content-checks.ts`)

After a `.tsx/.jsx/.css` write, `runDesignChecks` emits **non-blocking**
`additionalContext` warnings: accessibility (aria-label / alt), anti-patterns
(colored left borders, AI-slop purple/pink gradients, emoji-as-icons), forbidden
fonts (Roboto/Inter/Arial/Open Sans/Lato), hard-coded hex colors.

## Opt-in: Gemini gates

The Gemini gates — `create_frontend` validation **and** the "generate the frontend
before hand-writing HTML/CSS" gate — are **OFF by default**. Enable them with:

```sh
FUSE_DESIGN_GEMINI=1   # or "true"
```

When unset, `geminiEnabled()` returns `false` and both Gemini gates pass through;
the rest of the pipeline (phases, screenshots, content checks) is unaffected.
