# PRD fixtures

Two kinds of fixture, matching the two needs of the PRD module's test suite
(see `prd-design.md` §4/§5 for the full design this fixture set backs).

## 1. Synthetic contract example (`router.json`, `prd/`)

`router.json`, `prd/auth-refactor-prd.json`, `prd/agents/backend-expert-prd.json`
are a hand-authored, minimal instance of the PRD contract (`prd-design.md` §0)
— **exactly** the worked example the module's documentation (README.md §5) will
show end-to-end: task `auth-refactor`, two agents (`backend-expert`,
`backend-expert-2`), `backend-expert` already `done` on its `jwt-validation`
sub-task. No live capture involved; these are synthetic data mirroring the
on-disk shape `<homeSeg>/apex/{prd.json, prd/<task>-prd.json,
prd/agents/<agent>-prd.json}` one level down (the `<homeSeg>/apex/` prefix is
added by the consumer — `test/helpers/prd-env.ts` or a scenario's own
`setup`/materialization step — not baked into these fixture paths).

## 2. Authentic sanitized payloads (`authentic/{claude,cursor,kimi}/`)

Real hook stdin payloads captured live against each harness on 2026-09-02 (see
`…/codex-plugins/b561ad52-…/scratchpad/probe/out/{claude,cursor,kimi}.jsonl`,
format `cli<TAB>event<TAB>json`), reduced to the events the PRD ownership/
lifecycle gates need real field shapes for:

| File | Event | Why it matters for PRD |
|---|---|---|
| `claude/pretooluse-lead.json` | `PreToolUse` (Agent tool) | Lead session dispatching a sub-agent — **no** `agent_id`/`agent_type` on the event. Structural proof of `lead: true` (PRD design §1.1 `PrdIdentity`). |
| `claude/pretooluse-subagent-write.json` | `PreToolUse` (Write) | The sub-agent's OWN Write — `agent_id`+`agent_type` both present. The exact shape the ownership guard (`prd-ownership.ts`) resolves identity from. |
| `claude/subagentstart.json` | `SubagentStart` | `agent_id`+`agent_type` present — feeds the SubagentStart slice injection (§2.3). |
| `claude/subagentstop.json` | `SubagentStop` | `agent_id`+`agent_type` present, plus `agent_transcript_path`/`background_tasks` — feeds the block-once gate (§2.4). |
| `claude/stop.json` | `Stop` | Lead-scoped, no agent fields — feeds the lead block-once gate (§2.5). |
| `cursor/pretooluse-subagent-write.json` | `preToolUse` (Write) | The sub-agent's OWN Write, running under a `session_id`/`conversation_id` (`22222222-…0002`) that shares **zero** field with the lead's own id (`11111111-…0001`) or with `subagentStart`'s `subagent_id`/`parent_conversation_id`. **No** `agent_id`/`agent_type` field exists at all. This is the live evidence behind `prd-design.md` §6 Risk 1 (never attempt per-write identity correlation on Cursor — advisory only). |
| `cursor/subagentstart.json` | `subagentStart` | Carries `subagent_type` and runs under the **lead's** `conversation_id` — the later re-keyed Write (above) is what becomes unlinkable, not this event itself. |
| `cursor/subagentstop.json` | `subagentStop` | Back on the lead's `conversation_id`, response ignored by Cursor per `docs/adapters.md`. |
| `cursor/stop.json` | `stop` | Cursor's terminal observation event (not gated today per `docs/adapters.md`). |
| `kimi/pretooluse-bash.json` | `PreToolUse` (Bash) | No `agent_id`/`agent_type` field on any Kimi payload observed — structurally excluded per `adapters/kimi/index.ts`'s documented field set (`hook_event_name, session_id, cwd, client_type, tool_name, tool_input, tool_call_id`). |
| `kimi/stop.json` | `Stop` | Kimi's documented **blocking** event (unlike `SubagentStop`, which is observation-only per `docs/adapters.md`) — feeds `prd-design.md` §6 Risk 9. |

Each file is `{ "provenance": {...}, "stdin": {...} }` — same two-key shape as
`test/fixtures/cursor/README.md`'s own authentic captures, `stdin` being the
exact (post-sanitization) bytes a hook would receive.

### Sanitization (v1)

Applied uniformly, mirroring `test/fixtures/cursor/README.md`'s own method:

- Real absolute project/workspace paths → the sim harness's own placeholder
  tokens, `$TMP` (project cwd) — substituted at scenario-run time by
  `test/sim/load.ts`'s `substitute()` when a fixture is embedded in a scenario
  `event`; left as the literal string `$TMP` otherwise.
- Real absolute *host* paths unrelated to the project cwd (Claude's own
  `~/.claude/projects/...` transcript store, Cursor's own
  `~/.cursor/projects/...` transcript store) → `/Users/user/...` — never the
  real home directory.
- `user_email` — **removed** entirely (not replaced) on every Cursor payload.
- Real session/conversation/generation/tool-call/agent UUIDs → deterministic
  fake ids, internally consistent within one harness's fixture set (the same
  real id always maps to the same fake id across that harness's files — e.g.
  Cursor's lead `conversation_id` is the same fake value in
  `subagentstart.json`, `subagentstop.json`, and `stop.json`; the sub-agent's
  own re-keyed `session_id`/`conversation_id` in
  `pretooluse-subagent-write.json` is a DIFFERENT fake value, preserving the
  live "no shared field" finding — see the table above).
- Free-text prompts / task descriptions / assistant messages →
  `<redacted …, N chars>` placeholders preserving the original approximate
  length.
- No real project name, username, or email appears anywhere in this
  directory (verified by grepping this directory for the real username, the
  real company domain, and any `mailto`-style local-part, plus every
  `/Users/` occurrence other than the placeholder home `/Users/user` — zero
  hits besides this sentence's own description of the check).

Everything else (field names, types, presence/absence, key order, numeric
values, harness-specific quirks like Cursor's embedded-newline tool-call ids)
is **unchanged** from the real capture.
