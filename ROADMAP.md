# ROADMAP — @fusengine/harness

Améliorations futures (hors parité Python, déjà faite). Une case = une tâche.

## Harnais (adapters)

- [ ] **Support Hermes** — ajouter `hermes: ".hermes"` à `HOME_DIR` (`src/config/dotenv.ts`)
      + la détection dans `src/detect/harness.ts` (+ l'adapter `src/adapters/hermes/` si
      Hermes a un format de hook propre). Aujourd'hui un `~/.hermes/.env` est ignoré
      (fallback `.claude`). Ajouter aussi le wiring `init` (`src/init/templates.ts`).

## Configuration `.env`

- [ ] **TTL de cache configurables par env** — `WEBFETCH_TTL_MS` (24h) et `MCP_TTL_MS` (48h)
      sont des constantes en dur dans `src/runtime/mcp-key.ts`. Les exposer via
      `FUSE_WEBFETCH_TTL_SEC` / `FUSE_MCP_TTL_SEC` (parser `parseEnvInt`, `src/config/env.ts`).
- [ ] **Variantes `.env.local` / `.env.*`** — le loader (`src/config/dotenv.ts` `envCandidates`)
      ne sonde que `~/.<harness>/.env` et `<cwd>/.env`. Ajouter `.env.local` (et l'ordre de
      précédence) si besoin d'un override non versionné.

## Qualité / preuve de parité

- [ ] **Harnais de test différentiel Python↔TS** — envoyer N commandes/inputs au plugin Python
      ET au harness TS, asserter l'égalité des décisions (block/ask/allow), en excluant
      explicitement les écarts volontaires documentés. Donne une garantie « clone » mesurable.

## Écarts volontaires (assumés — à revoir si clone strict souhaité)

- interface-separation déclenche sur Edit (Python: Write seul)
- Edit sur fichier surdimensionné bloqué (Python: Edit exempté)
- doc gate accepte WebSearch/WebFetch en plus de context7/exa
- crédite `Agent` ET `Task` (Python: `Agent`)
- freshness ancrée sur le transcript (anti-forge) vs self-report Python

## Phase 2 — reliquats (LOW, non bloquants)

- [ ] **Chemins harness-agnostiques** — plusieurs handlers hardcodent `~/.claude/fusengine-cache`,
      `~/.claude/logs/00-*`, `~/.claude/.../state` (Claude-only). Les dériver du home du harness
      détecté (réutiliser `HOME_DIR` de `src/config/dotenv.ts` + `src/detect/harness.ts`). Chantier transverse.
- [ ] **design** : regex « emoji-as-icon » (`content-checks.ts`) flagge tout non-ASCII → faux positif
      sur texte accenté (français/CJK) ; restreindre à la classe emoji du Python.
- [ ] **SEO** : matcher PostToolUse limité à `Write|Edit|MultiEdit` ; whitespace/entities/casse (port plus strict).
- [ ] **cartographer** : tri `localeCompare` → code-point (parité octet) ; diagnostics stderr absents.
- [ ] **rules/sécurité** : `??` vs `||` (query vide loggée), glob inclut dotfiles, forme de state.
- [ ] **aipilot** : `cache-doc` précédence cwd vs env.
- [ ] **Doc-honnêteté** : `src/runtime/lifecycle/memory/*` est une feature net-new (source `memory-neural`,
      autre repo) — reformuler les JSDoc « Ports X.py » trompeuses.

## Abandonné (décision)

- ~~Ralph-mode~~ (bypass git/install) — non porté volontairement
- ~~enforce-gemini-mcp~~ (guard Tailwind) — non porté volontairement
