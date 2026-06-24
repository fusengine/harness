# Runtime — `@fusengine/harness/runtime`

The loop that makes the package behave like the Claude plugin, on any harness.

## `handleHook(id, payload, opts)`

The single entry point a hook calls (via `harness hook <id>`):

```ts
import { handleHook } from "@fusengine/harness/runtime";

const { stdout, exit } = await handleHook(id, payload, {
  now: Date.now(),
  cwd: process.cwd(),
  refsDir: process.env.FUSE_HARNESS_REFS,
});
```

- **PRE event** → `gate()`: stateless guards → trivial-edit fast path → APEX
  gates (from the session track) → native response via `respond(id, prompt)`.
- **POST event** → `activityFor(event)` → `recordActivity` (fills the track), and
  `mcpPostStore` caches MCP/WebFetch responses.

`normalizeEvent(id, payload)` unifies the payload shapes (Claude/Codex/Gemini/
Cursor `tool_name`+`tool_input`; Cline nested `preToolUse`).

## `gate(input)`

The composable gate, independent of any harness:

```ts
const prompt = await gate({
  sessionId, framework: "react", tool: "Write",
  filePath: "src/Button.tsx", content,
  refs,                 // from loadRefs(FUSE_HARNESS_REFS)
  now: Date.now(), trackFile,
});
```

Returns the first blocking `Prompt`, or `null` to allow. The trivial-edit fast
path lets up to `TRIVIAL_BUDGET` (4) tiny non-`replace_all` edits per window
through without the APEX gates.

## Tracking (`./tracking`)

The session track feeds the stateful gates. An adapter records activity on POST
and the gate reads it on PRE:

- `recordAgent(track, name, ts, quality?)` — `insufficient` quality is ignored by `agentsFresh`.
- `recordDoc` / `recordRefRead` — doc consultation + SOLID ref reads.
- `recordTrivialEdit` / `trivialCount` — sliding-window trivial-edit counter.
- `recordBrainstormRequired` — set from `detectCreationIntent(prompt)`.

`activityFor(event)` maps a live tool-use to the activity to record (MCP doc →
`doc`, `Task`+`subagent_type` → `agent`, a `.md` read → `ref`).

## Storage & MCP

- `projectLayout(root)` (`./config`) → the single source of truth: all state
  lives under one neutral `<root>/.harness/` (`track/`, `cache/`, `memory/`).
  `harnessStateDir(root)` returns `<root>/.harness`.
- `mcpPreIntercept` serves a fresh cached MCP/WebFetch result (deny + content) or
  caps exa `numResults`; `mcpPostStore` caches the response. See `./cache`.
