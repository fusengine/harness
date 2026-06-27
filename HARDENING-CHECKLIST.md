# Hardening Checklist — #8 tamper-resistant enforcement state

> Goal: an agent with shell + FS access can no longer **forge its own compliance**
> (fake "explore/research ran", "docs consulted", "SOLID refs read") to pass the
> APEX gates. Honest premise: 100% tamper-proofing is impossible against a process
> on the same machine — so the strategy is **(B) stop trusting self-reports, verify
> from platform-authored evidence (the transcript)** + **(C/A/D) raise the cost and
> fail closed** for everything else.

## Current state (verified in code)

- The gate state (`SessionTrack`: `agents[]`, `refsRead[]`, `authorizations`) is read by
  `src/runtime/gate.ts` via `loadTrack(input.trackFile)`.
- `src/runtime/paths.ts` already stores the track **outside the repo**: `/tmp/fuse-harness/track-<session>.json`.
- `freshnessGate` (`src/policy/apex.ts`) trusts `ctx.agentsFresh`, computed by `agentsFresh(track,…)`
  from the **self-recorded** `track.agents[]` → forgeable by writing the JSON directly.
- `protectedPathGuard` (`src/policy/guards/protected-path.ts`) blocks only `Write`/`Edit` and does
  **not** list the track dir nor `.claude/apex` → a `Bash` `echo > track.json` bypasses it.

## Ownership (exclusive — no two agents touch the same file)

| Item | Owner | Owned file(s) (exclusive) | Contract exposed to lead |
|------|-------|---------------------------|--------------------------|
| **B** transcript-grounded freshness | agent-B | NEW `src/freshness/agent-evidence.ts` | `export function agentsRanFromTranscript(transcriptPath, names, windowMs, now): boolean` |
| **C** protected-path + Bash redirect | agent-C | `src/policy/guards/protected-path.ts` | add fragments + a `Bash`-command path-scan |
| **A** stable out-of-tree state dir | agent-A | `src/runtime/paths.ts` | `trackFile(sessionId, baseDir?)` → default `~/.claude/fuse-harness/state/<projectHash>/track-*.json` |
| **D** integrity / fail-closed | agent-D | `src/tracking/store.ts` + NEW `src/tracking/integrity.ts` | `loadTrack` returns empty (fail-closed) on signature/nonce mismatch |
| **Integration** | **lead** | `src/runtime/gate.ts`, `src/runtime/gate-input.ts`, `src/runtime/handle-pre.ts` | wires B's verifier + A's path + threads `transcriptPath` |

## Tasks

### B — Verify freshness from the transcript (keystone)
- [ ] NEW `src/freshness/agent-evidence.ts`: parse the Claude transcript JSONL (reuse the pattern in
      `runtime/lifecycle/aipilot/transcript.ts`), find genuine `tool_use` of `Task` whose `subagent_type`
      ∈ `names`, with the entry timestamp within `windowMs`. Return true only on real evidence.
- [ ] Pure, <100 lines, JSDoc, isolatedDeclarations (explicit return types). No `Bun.*`.
- [ ] Lead wires it into `gate.ts`: `agentsFresh(track,…) OR agentsRanFromTranscript(transcriptPath,…)`
      → during transition accept either; once stable, **prefer transcript** and treat a track-only
      "fresh" with no transcript evidence as **not fresh**.

### C — Protected-path covers state + Bash
- [ ] Add to `PROTECTED_FRAGMENTS`: `.claude/apex/`, `/fuse-harness/`, `.harness/track`, `.harness/memory/state`.
- [ ] Extend the guard: when `tool === "Bash"`, scan `command` for redirections / `tee` / `cp`/`mv`
      whose target path includes a protected fragment → block. (Best-effort: documents the residual
      risk of obfuscated shell.)
- [ ] Keep the existing Write/Edit behaviour; <100 lines, JSDoc.

### A — Stable, per-project, out-of-tree state dir
- [ ] `trackFile` default base → `~/.claude/fuse-harness/state/<projectHash>/` (projectHash = hash of
      `CLAUDE_PROJECT_DIR`/cwd, reuse `hashText`), not `tmpdir` (persistent + not world-writable `/tmp`).
- [ ] Backward-compatible signature (keep optional `baseDir` for tests). <100 lines, JSDoc.

### D — Integrity / fail-closed
- [ ] NEW `src/tracking/integrity.ts`: HMAC-sign the serialized track with a per-machine key at
      `~/.claude/fuse-harness/.key` (0600, created on first use) + a monotonic `nonce`.
- [ ] `saveTrack` writes `{ data, nonce, mac }`; `loadTrack` recomputes the MAC and checks the nonce is
      ≥ the last seen → on mismatch return `emptyTrack()` (**fail closed**: gates re-require real agents).
- [ ] Honest note in JSDoc: the key is readable by the agent, so this stops *naive* forging and
      detts *out-of-band* tampering, not a determined re-sign — B is the real guarantee.

## Coordination protocol (agents communicate via SendMessage)
- Each agent FIRST replies to the lead with its exact exported signature (the "contract" column) before
  editing, so the lead can wire the integration without guessing.
- B and A both affect data the lead threads through `gate-input.ts`; they must NOT edit it — they tell
  the lead the field they need (`transcriptPath` for B, nothing extra for A).
- If the harness's own APEX gate blocks an edit: launch `explore-codebase` + `research-expert` (Task),
  read the named SOLID ref, call `context7` + `exa` once, then retry — do not loop.

## Acceptance (lead verifies before release)
- [ ] `bun run typecheck` clean, `bun run build` clean, `grep -rl 'from "bun"' dist` empty.
- [ ] Unit tests green + NEW tests: forging `track.agents` no longer passes `freshnessGate` when the
      transcript shows no real `Task(explore-codebase/research-expert)`.
- [ ] `node dist/cli/bin.mjs hook claude-code` still exits 0 (dual-runtime intact).
- [ ] Release via branch → commit → bump → CHANGELOG → tag → PR → CI → merge → npm.

## Deferred
- **#9** (doc over-promise / finish non-Claude adapters) — LAST, separate PR.
