# Hermes live-test protocol

Resolve the open unknowns in the Hermes adapter against a **real** `hermes-agent`
session. Every wire shape the harness emits for Hermes today was verified against
the published docs (`hermes-agent.nousresearch.com/docs/user-guide/features/hooks`),
**not** against a running binary. The tests below are the ones that need a live
session to settle; each is a command to run, the result to expect **if the adapter's
assumption holds**, and how to read a divergence.

Run each test, paste the observed stdout/exit/agent-behaviour back into the adapter
audit. Where the observed result differs from "expected if supported", the adapter
assumption is wrong and `src/adapters/hermes/` (and possibly `src/runtime/respond.ts`
+ `normalize.ts`) must change.

## 0. Prerequisites

```bash
# Build the binary the hook will call.
bun run build   # produces dist/cli/bin.mjs

# Point Hermes hooks at it. hermes-agent reads ~/.hermes/config.yaml under `hooks:`
# and runs scripts from ~/.hermes/agent-hooks/. There is no `harness init hermes`
# wiring file yet — wire it by hand:
mkdir -p ~/.hermes/agent-hooks
cat > ~/.hermes/agent-hooks/fuse-guard.sh <<'SH'
#!/usr/bin/env bash
exec node /ABSOLUTE/PATH/TO/fuse-harness/dist/cli/bin.mjs hook hermes core
SH
chmod +x ~/.hermes/agent-hooks/fuse-guard.sh
```

Add to `~/.hermes/config.yaml` (adjust to Hermes' real key names — **confirming those
is Test 5**):

```yaml
hooks:
  pre_tool_call: ~/.hermes/agent-hooks/fuse-guard.sh
```

`HERMES_SESSION_ID` must be set in the session env for the harness to detect Hermes;
verify with `node dist/cli/bin.mjs doctor` (should report `harness: hermes`).

---

## Test 1 — Allow: empty stdout vs `{}`  **(highest-priority unknown)**

The `hook` command prints **empty stdout** (not `{}`) on an allow. The Hermes adapter's
own `guard()` would print `{}`, but that path is unused by `hook`. Whether Hermes treats
an empty stdout as "allow" or as a malformed/blocking response is the load-bearing unknown.

```bash
echo '{"hook_event_name":"pre_tool_call","tool_name":"terminal","tool_input":{"command":"ls -la"}}' \
  | node dist/cli/bin.mjs hook hermes core ; echo "exit=$?"
```

- **Expected if supported:** stdout is empty, `exit=0`, and in a live session the `ls`
  tool call **runs** (not blocked).
- **How to interpret:**
  - Tool runs → empty stdout = allow. Current behaviour is correct; keep it.
  - Tool is blocked / Hermes logs a parse error → Hermes requires a non-empty JSON body
    (likely `{}`) to allow. The `hook` allow path must emit `{}` for Hermes instead of
    "". Fix in `respond.ts` / the allow-path assembly, add a sim scenario asserting `{}`.

---

## Test 2 — Block: `{decision:"block",reason}` cancels the tool

```bash
echo '{"hook_event_name":"pre_tool_call","tool_name":"terminal","tool_input":{"command":"git push origin main --force"}}' \
  | node dist/cli/bin.mjs hook hermes core ; echo "exit=$?"
```

- **Expected if supported:** stdout `{"decision":"block","reason":"[BLOCKED] Destructive
  git command…"}`, `exit=0`, and the live tool call is **cancelled** with the reason shown.
- **How to interpret:**
  - Tool cancelled + reason surfaced → block shape is correct.
  - Tool runs anyway → Hermes does not honour `decision:"block"` on `pre_tool_call`, or
    expects a different key (e.g. `permission`, `allow:false`). Capture what Hermes' own
    docs/examples show a hook returning to cancel, and re-map in `toHermesResponse`.
  - `exit=0` but Hermes only cancels on a **non-zero exit** → the block must set
    `outcome.exit` ≠ 0 for Hermes, not just emit JSON.

---

## Test 3 — Context injection: `{context}` on allow-with-note

`ask`/`inform` prompts degrade to `{"context": …}` (Hermes has no interactive "ask").
The docs say `context` is honoured on `pre_llm_call`, **not** `pre_tool_call` — so a
`context` returned from a `pre_tool_call` hook may be silently dropped.

```bash
# A git push is an `ask` on Claude Code → degrades to {context} on Hermes.
echo '{"hook_event_name":"pre_tool_call","tool_name":"terminal","tool_input":{"command":"git push origin main"}}' \
  | node dist/cli/bin.mjs hook hermes core ; echo "exit=$?"
```

- **Expected if supported:** stdout `{"context":"[CONFIRM] Confirm git operation…"}`,
  `exit=0`, tool **runs** (context is non-blocking), and the text reaches the model.
- **How to interpret:**
  - Text appears in the model's context → injection works on `pre_tool_call`.
  - Tool runs but text never reaches the model → `context` is ignored on `pre_tool_call`.
    Either wire the guard on `pre_llm_call` too, or accept that risky-but-not-destructive
    ops are un-gated on Hermes and say so in the compat matrix (no interactive ask exists).

---

## Test 4 — Which events Hermes actually fires

The `hook` command's lifecycle bridge handles `SessionStart`, `Stop`, `SubagentStart/Stop`,
`UserPromptSubmit`, `pre_llm_call`/`post_tool_call` **using Claude's event names**. It is
unverified that Hermes emits any of these, or under these names.

Wire a probe hook that logs every event Hermes sends:

```bash
cat > ~/.hermes/agent-hooks/probe.sh <<'SH'
#!/usr/bin/env bash
cat >> /tmp/hermes-events.jsonl ; echo '{}'
SH
chmod +x ~/.hermes/agent-hooks/probe.sh
```

Point **every** hook key you can find in Hermes' config schema at `probe.sh`, run a short
session (start, one tool call, stop), then:

```bash
cat /tmp/hermes-events.jsonl | python3 -c 'import sys,json;[print(json.loads(l).get("hook_event_name","<none>")) for l in sys.stdin]'
```

- **Expected if supported:** one line per event, showing the real `hook_event_name`
  values Hermes uses (e.g. `pre_tool_call`, `pre_llm_call`, `post_tool_call`, and whatever
  session-lifecycle names exist).
- **How to interpret:** any event the harness' lifecycle bridge keys on (`SessionStart`,
  `Stop`, `SubagentStart`, `UserPromptSubmit`) that is **absent** from this list is a
  no-op on Hermes — the corresponding feature (session snapshot, lessons-on-stop, CLAUDE.md
  injection, failure lessons) does **not** run. Record the real names; if they differ from
  Claude's, `normalize.ts` / `lifecycle-bridge.ts` need a Hermes event-name mapping.

---

## Test 5 — Tool field names

The adapter assumes `terminal` → `{command}` and `write_file` → `{path, content}`. Confirm
against a real payload captured by the probe from Test 4.

```bash
# Inspect a real tool_input Hermes sent for a shell command and a file write:
grep -m1 terminal   /tmp/hermes-events.jsonl | python3 -m json.tool
grep -m1 write_file /tmp/hermes-events.jsonl | python3 -m json.tool
```

- **Expected if supported:** the terminal payload has `tool_input.command`; the write payload
  has `tool_input.path` **and** `tool_input.content`.
- **How to interpret:** if the field names differ (e.g. `file_path` instead of `path`, or the
  shell tool is not named `terminal`), `normalize.ts` extracts `undefined` and the gates
  silently no-op on that tool. Add the real field names to the `str(input.…)` fallbacks in
  `normalizeEvent` and add a sim scenario with the real shape.

---

## Test 6 — Error / malformed-output handling

What Hermes does when a hook exits non-zero or prints non-JSON decides whether a harness
crash **fails open** (tool runs) or **fails closed** (tool blocked) on Hermes.

```bash
# Non-JSON stdout:
printf 'not json\n' > ~/.hermes/agent-hooks/broken.sh
chmod +x ~/.hermes/agent-hooks/broken.sh
# Point pre_tool_call at broken.sh, run one tool call.

# Non-zero exit:
cat > ~/.hermes/agent-hooks/fail.sh <<'SH'
#!/usr/bin/env bash
echo '{}'; exit 3
SH
chmod +x ~/.hermes/agent-hooks/fail.sh
# Point pre_tool_call at fail.sh, run one tool call.
```

- **Expected if supported (safe default):** a broken hook does **not** silently allow a
  dangerous tool call — Hermes either blocks or surfaces an error.
- **How to interpret:**
  - Tool runs despite the broken hook → Hermes **fails open** on hook error. The harness
    must never crash on Hermes (any unhandled path = silent bypass); confirm the adapter's
    try/catch fails **closed** or at least logs loudly.
  - Tool blocked / error surfaced → Hermes fails closed; a harness crash is safe (blocks the
    tool), and non-zero exit is itself a usable "block" signal (relevant to Test 2's exit
    question).

---

## Reporting

For each test, record: **observed stdout**, **observed exit**, **observed agent behaviour**
(tool ran / was blocked / text reached model). Anything that diverges from "expected if
supported" is an adapter bug to file against `src/adapters/hermes/`. Tests 1, 2, and 4 are
the blockers — resolve those first; they decide whether Hermes enforcement is real or theatre.
