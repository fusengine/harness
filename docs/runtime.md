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
  windowMs: resolveTtlSec(process.env) * 1000, // FUSE_ENFORCE_TTL_SEC (default 2 min)
});
```

- **PRE event** → MCP cache intercept (a fresh cached context7/exa hit is served
  **and** recorded as doc-consulted), then `gate()`: stateless guards → trivial-edit
  fast path → APEX gates (from the track) → native response via `respond(id, prompt)`.
- **POST event** → `activityFor(event)` → `recordActivity` (fills the track; agent
  `quality` is derived from the response length), and `mcpPostStore` caches responses.
- **UserPromptSubmit** (payload carries `prompt`) → `detectCreationIntent` →
  `recordBrainstormRequired`, so `brainstormGate` can fire on the next edit.

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
through without the APEX gates. The gate reads the existing **on-disk** line count
so an `Edit` on an already-oversized file blocks; pass `agentType` to exempt
`Explore`/`Plan` agents.

After the stateless guards, the gate runs **effectful** checks (each fail-open):
`preCommitGate` (runs eslint/tsc/prettier/ruff on a `git commit`), `modularGate`
(Next.js `modules/` and Laravel FuseCore structure + cross-module imports), and
`dryGate` (greps the codebase for duplicate declarations). The design-agent
pipeline is dispatched separately and is inert unless a design agent is active —
see [design.md](./design.md).

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

State splits across two roots — don't assume everything is under one directory:

- **Session track + gate sidecars — out-of-tree.** `defaultStateDir(cwd)` /
  `trackFile(sessionId, dir)` (`./runtime/paths.ts`) resolve to
  `~/.fuse-harness/state/<8-char-md5-of-project-path>/` — deliberately outside
  the repo, so the protected-path guard never has to bless writes to its own
  enforcement state. `handle.ts` derives the track file this way
  (`trackFile(event.sessionId, defaultStateDir(opts.cwd))`), and the one-shot
  metric sidecar (`one-shot.json`) lives alongside it in the same directory.
- **MCP/WebFetch cache + curated lessons — in-tree.** `projectLayout(root)`
  (`./config/layout.ts`) resolves `<root>/.harness/{cache,memory}`:
  `cacheDir` for the MCP/WebFetch response cache, `memoryDir`/`lessonsFile` for
  `MEMORY/LESSON.md`. `.harness/` is gitignored except `memory/LESSON.md`
  (`STATE_GITIGNORE`), which is meant to be committed.
- `mcpPreIntercept` returns `{ stdout, docSource? }`: it serves a fresh cached
  MCP/WebFetch result (deny + content) or caps verbosity (exa `numResults`/`tokensNum`,
  Context7 `tokens`). A served context7/exa hit reports `docSource`, so `handleHook`
  records the doc consultation (the cache counts as consulted). `mcpPostStore`
  caches the response. See `./cache`.

## Multi-plugin fan-out (`./runtime/burst-window.ts`)

Every deployed sibling plugin registers its own hook for the same Claude event,
so one real tool call can spawn ~11 processes recording the same deny / one-shot
entry / sniper reminder within milliseconds. `BURST_DEDUP_MS` (2000ms) treats a
same-operation-hash record landing inside that window as the same event rather
than a new one — this is a heuristic tuned to the observed fan-out latency, not
a protocol guarantee. See `deny-loop.ts`'s `dedupMs` param and `one-shot.ts`'s
`burstFirst` for the two consumers.

## Sidechain evidence harvest (`SubagentStop`)

Sub-agent `PostToolUse` hooks don't reliably fire on Claude Code (documented
platform issues #43612/#27655/#34692). `SubagentStop` — which *is* reliably
dispatched on the main session — parses the finishing sub-agent's own
`agent_transcript_path` and backfills its research/explore calls and `.md` ref
reads into the session track **before** the freshness gate runs next
(`src/freshness/evidence-harvest-io.ts`, wired in `dispatch.ts`'s `SubagentStop`
case). This is a per-checkpoint reconciliation, not a continuous fix for the
underlying hook-reliability gap.
