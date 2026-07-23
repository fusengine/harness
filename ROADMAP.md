# ROADMAP — @fusengine/harness

Améliorations futures (hors parité Python, déjà faite). Une case = une tâche.

> État au **2026-07-22** · version publiée **0.1.80** (npm).
> Légende : `[x]` livré et vérifié · `[~]` partiel/assumé · `[ ]` à faire. Chaque ligne est ancrée sur `fichier:ligne`.

---

## 🛡️ Lot A — Durcissement hooks (deny plus large, pas de flag) — décidé 2026-07-22

> ANALYZE complet fait (explore + research + typescript-expert). Cible : contournements CONNUS du
> pattern-matching (LESSON : heredoc, eval inline, encodage). Tout vit dans
> `src/policy/guards/bash-write.ts` — JAMAIS `security.ts`. Risque n°1 = faux positif
> (leçon `dd` 19/07) : chaque motif audité contre des commandes légitimes, le douteux part en
> `ask`/skip-list documentée, jamais en deny approximatif.

- [ ] **A1** — `bun -e`/`node -e`/`python -c` qui ÉCRIVENT sur disque (writeFileSync, open(...,'w'))
      → deny ; l'eval read-only (`bun -e 'console.log(...)'`, sonde légitime) reste allow — `src/policy/guards/bash-write.ts`
- [ ] **A2** — pipe-décodage vers shell : `base64 -d | sh`, `echo … | bash`, `curl | sh` (compléter
      l'existant) + liste négative de commandes légitimes testée
- [ ] **A3** — redirections `>`/`>>` vers fichiers code (compléter heredoc) ; logs/tmp restent allow
- [ ] **A4** — tests unitaires par motif (positifs + négatifs) + 2 scénarios sim (deny/allow)
- [ ] **A5** — eLicit + Verify + sniper + challenger (audit faux-positifs dédié) → commit `feat/harden-bash-guard`

## 🛡️ Lot B — Sandbox OS opt-in `FUSE_HARNESS_SANDBOX` — décidé 2026-07-22

> Le harness DÉTECTE, ne lance jamais (`sandbox-exec` déprécié ; `srt` = outil externe).
> Flag absent/`off` (défaut) = zéro changement sur les 15 cibles · `warn` = message SessionStart
> non-bloquant · `require` = deny des Bash à risque si non sandboxé. Moule exact :
> `src/policy/gemini-mcp-gate.ts` (opt-in off par défaut). Génération de config sandbox par cible :
> REJETÉE (1 cible/15 la supporte — à reconsidérer si un 2e harness expose un équivalent `sandbox_mode`).

- [ ] **B1** — `detectSandbox(env, fs)` injectable — signaux : Codex `CODEX_SANDBOX`/`CODEX_SANDBOX_NETWORK_DISABLED`
      (documentés openai/codex AGENTS.md), Claude Code `settings.json sandbox.enabled`, containers
      `/.dockerenv`+`/run/.containerenv`, Linux `NoNewPrivs: 1` (/proc/self/status) ; Kimi → `unavailable`
      (aucun sandbox natif confirmé) — `src/detect/sandbox.ts` (nouveau)
- [ ] **B2** — gate opt-in `warn` au SessionStart (append `attachSystemMessage`, jamais remplaçant) ;
      flag absent = sortie byte-identique v0.1.80, test dédié — `src/policy/sandbox-gate.ts` (nouveau)
- [ ] **B3** — mode `require` : deny Bash à risque si `detectSandbox` = non sandboxé — activable
      seulement par flag ; documenté « après validation terrain de `warn` »
- [ ] **B4** — scénarios sim `4x-sandbox-*` env-based (pattern scénarios 28/29) + tests unitaires
- [ ] **B5** — docs `config.md` + `detect.md` avec incertitudes NOMMÉES (pas de signal srt documenté,
      valeur Linux de `CODEX_SANDBOX` non confirmée)
- [ ] **B6** — eLicit + Verify + sniper + challenger + E2E binaire déployé → commit `feat/sandbox-gate`

**Séquence :** Lot A → merge → Lot B → merge ; après chaque merge : rebuild dist + déploiement plugin + sondes E2E.
**En réserve :** re-test délégation nommée Kimi 0.28.1 (`extra_agent_dirs`, caveat CHANGELOG 0.1.80) ·
2 checks `isCodex`-only à trancher (`handle.ts:50`, `deny-notice.ts:47`).

---

## 🎯 Gouvernance & Loops (axe stratégique — post article Anthropic « Getting started with loops », 2026-06-30)

### Adapters — support multi-harnais
- [x] **claude** complet (pre/post + `commandToString`) — `src/adapters/claude/index.ts:92`
- [x] **codex** complet (apply_patch par fichier, `ask`→deny, array-command) — `src/adapters/codex/index.ts`, `apply-patch.ts:37`
- [~] **cursor** — shell deny/ask OK ; `afterFileEdit` advisory-only (deny cassé côté Cursor, décision produit) — `src/adapters/cursor/index.ts:23`
- [~] **hermes** — `pre_tool_call` seul prouvé, pas d'`ask` interactif — `src/adapters/hermes/index.ts:27`
- [~] **cline / gemini** — minimal (un seul event) — `src/adapters/{cline,gemini}/index.ts`
- [ ] hermes : dispatch cycle de vie complet + `harness init` (absent de `src/init/templates.ts:29`)
- [ ] hermes/cline/gemini : prouver le deny par scénario sim dédié (invariant compat)

### 🐛 Bug live confirmé — faux positif git flags
- [x] **`GIT_BLOCKED` non ancré** — livré 0.1.62 : flags destructifs ancrés sur frontière de token (`src/policy/patterns.ts`), `fix/api-keys-fossil` et consorts ne matchent plus.
- [x] scénario sim `27-git-guard-flag-anchoring.json` : noms avec `-f`/`-D` collés → **allow**, livré 0.1.62.

### 🐛 Bug live confirmé — RALPH inline ignoré + sur-match motif (Codex, 2026-07-08)
- [ ] **Préfixe inline `RALPH_MODE=1 <cmd>` non honoré** — le guard lit `process.env.RALPH_MODE` (`src/policy/patterns.ts:52`), il ne parse **jamais** un préfixe env collé dans la commande jugée. Donc `RALPH_MODE=1 git add -A` reste OFF côté hook → hard-deny malgré l'autorisation utilisateur. Le hook s'exécute **avant** le shell, il ne voit pas l'assignation inline. **UX piège** : le prompt « Authorize: RALPH_MODE=1 … » laisse croire que ça débloque, mais le guard re-bloque derrière. Fix : réutiliser le skip de préfixes `VAR=value` déjà présent (`src/freshness/explore-tools.ts:61`) pour détecter `RALPH_MODE` en tête de commande, OU documenter que RALPH ne s'active QUE via l'env du process (jamais inline). **Aucun test.**
- [ ] **Sur-match motif-dans-texte** — une recherche texte contenant l'expression (`grep "git add"`, body de PR, message citant un motif) est interceptée comme opération git/mutator. Même classe que les faux positifs LESSON (`jq …apply-patch…`, `env sed` inline, `gh pr create --body "…"`). Fix : matcher le motif en **position de commande réelle** (frontière de token / premier exécutable), pas en sous-chaîne. Scénario sim dédié à ajouter.

### ⚡ Crédit synchrone des gates — friction n°1 des agents (postmortem 2026-07-11 : 3 acteurs, ~25 tentatives perdues sur UN fichier)
> Racine : le crédit refsRead est **transcript-first** (`reconcileRefReadsFromTranscript` puis journal, `src/runtime/gate.ts:73-76`) or le transcript est flushé en **fin de tour** (lag ~230s > TTL 2-4min) → les Reads d'un tour long n'existent pas pour les gates du même tour. S'ajoutent : exigences de refs **rotatives** (le set demandé change à chaque block), et compteur `[REPEAT]`/deny-loop qui ne se réinitialise **pas** quand la cause du deny est corrigée (constaté « identical attempt #5 » après lectures complètes).
- [ ] **Journal-first** : inverser l'ordre de reconcile — le journal append-only (`ref-journal.ts:51`, déjà O_APPEND atomique) devient la source PRIMAIRE, le transcript le fallback historique. Clé : le PostToolUse d'un Read s'exécute AVANT le PreToolUse du tool suivant → crédit écrit en PostToolUse + lu en PreToolUse = **synchrone par construction**, le lag disparaît.
- [ ] **Couverture totale du journal** : écrire l'entrée journal au PostToolUse de CHAQUE contexte — lead, teammates, ET lectures shell (`shell-read-refs.ts` du chantier parité) — aujourd'hui le lead dépend encore du transcript.
- [ ] **Set de refs requis DÉTERMINISTE** par (fichier, framework), figé pour la session — fin de la rotation : l'agent sait exactement quoi lire, une fois. Le message de block liste TOUJOURS le même set tant qu'il n'est pas satisfait.
- [ ] **Deny-loop conscient de la cause** : clé du compteur = (tool, file, contenu, RAISON du deny) + invalidation du compteur quand un crédit requis vient d'atterrir — fin des `[REPEAT]` sur tentative corrigée. `src/runtime/deny-loop-store.ts`.
- [ ] **Warning version au SessionStart** : le harness déployé compare sa version au npm latest (cache 24h) et affiche `⚠ deployed harness N versions behind` — aurait évité le mur du 2026-07-11 (déployé 6 versions en retard).
- [ ] Télémétrie : compter les « deny évitables » (deny suivi d'un allow sur contenu identique après crédit) pour mesurer le gain réel.

### 🔒 `ask` sur Codex — déléguer au canal natif `rules` au lieu du deny dur (recherche doc, 2026-07-08)
> Doc Codex vérifiée en intégral : un hook `PreToolUse` **ne peut PAS** demander de confirmation interactive. `permissionDecision:"ask"` existe dans le schéma mais est **« parsed but not supported yet »** et **fail-OPEN** (le hook échoue, la commande passe quand même) → l'émettre serait PIRE que deny. `PermissionRequest` (allow/deny only) ne peut pas *créer* un prompt, juste trancher un prompt déjà déclenché par la config statique. Issues openai/codex #15311 + #16301 fermées sans valeur `ask`.
- [x] **`ask→deny` est le choix SÛR sur Codex** — confirmé, pas un bug : `src/adapters/codex/index.ts:32`. Mapper vers `"ask"` casserait l'approbation (fail-open). Ne PAS « corriger » en ce sens.
- [ ] **Vrai canal d'approbation = Codex `rules`** (`.codex/rules/*.rules`, Starlark, `prefix_rule(pattern=["git","commit"], decision="prompt")`) → prompt natif « autoriser ce commit ? ». Chantier : l'installeur fusengine **génère** un `.codex/rules/git-approval.rules` (gouvernance toujours possédée par fusengine, exprimée dans le canal natif), et l'adapter Codex **cesse de hard-deny la catégorie « ask »** pour la déléguer aux rules. Preuve : `developers.openai.com/codex/rules`.
- [ ] **Pré-requis à vérifier avant de coder** : ordre d'évaluation Codex `PreToolUse` (hook) **vs** `rules` — si le hook deny d'abord, le prompt `rules` ne s'affiche jamais. Le hook doit laisser passer (`allow`/no-match) la catégorie ask pour déléguer. **Invariant compat** : claude/cursor/hermes gardent le `ask` interactif natif, changement scoped Codex uniquement.

### ⭐ Loop-gate — boucles autonomes gouvernées (chantier principal)
- [x] **RALPH_MODE** opt-in strict (`RALPH_MODE=1|true`, pas d'auto-activation) — `src/policy/patterns.ts:51`
- [x] **RALPH_SAFE** exempte git sûr, jamais le destructif — `patterns.ts:39`
- [x] **Journal append-only** des refs (O_APPEND atomique + reconcile) — `src/freshness/ref-journal.ts:51`
- [ ] **Cap d'itérations** hard-deny possédé par le harness (≈ `max_turns`) — **absent** (grep maxTurns = 0)
- [ ] **Plafond budget tokens/coût** (≈ `max_budget_usd`) — **absent** (seul `FRAGMENT_CHAR_CAP` d'injection existe, sans rapport)
- [ ] **Completion-promise déterministe** — sortie de loop autorisée UNIQUEMENT sur `bun test` + `tsc --noEmit 0` + sim green + lint 0, jamais sur jugement d'agent
- [ ] **State-from-disk générique** — `task.json`/état durable relu à chaque itération (referme aussi le gap solidRead / lag transcript ~230s, `ref-journal.ts:8`)
- [ ] **Une tâche par itération** (anti-batching) + **signaux de sortie** standardisés (`COMPLETE`/cap/`BLOCKED`/`DECIDE`)
- [ ] **Composition avec le plugin officiel `ralph-loop`** (Stop hook Anthropic) — vérifier non-duplication côté Claude Code

### Observabilité / trackers
- [x] Comptage reads SOLID (`refsRead` + journal) — `src/freshness/ref-journal.ts`
- [~] Budget contexte = cap **caractère** par fragment (8000), pas par skill — `inject-budget.ts`
- [ ] Décider du sort du **tracker exa** (pas de module dédié ; Exa vit dans `docConsultedGate`)
- [ ] **Budget par skill** (~2% contexte) — sélection de plugins à l'install
- [ ] **Télémétrie par itération** (tokens/guard-hits/fichiers touchés → journal, ≈ `/usage`)

### Correction de note périmée
- [x] **Gap `env sed` FERMÉ** (v0.1.60) — mutators testés avant SAFE_PREFIXES, `env sed -i x.ts`→deny — `src/policy/guards/bash-write.ts:37`. (L'ancienne mémoire « accepted gap » est obsolète.)

**Priorité :** 1) fix git `-f`/`-D` (faible effort, gêne prouvée) → 2) loop-gate socle (cap+budget+completion-promise+state-from-disk, plus haut ROI) → 3) télémétrie loop → 4) complétion adapters.

---

## Reliquats parité (batch `fix/parity-audit-batch3` — 2026-07-01)

- [ ] **trackframework (G2) — `tracking.py::track_mcp_research` classification framework par mots-clés**
      — DÉFÉRÉ volontairement. Le Python classe le framework depuis le texte de la query MCP
      (`react`/`next`/`tailwind`/`swift`…) pour créditer un fichier `{framework}-{session_id}`.
      Le TS a remplacé tout ce mécanisme fichier par `SessionTrack` signé (`src/tracking/`) ; la
      pertinence de cette dérivation par-query est incertaine et toucher `activity.ts` (crédit
      doc-consultation) est risqué. À reprendre seulement si un cas réel le motive.
- [x] **`enforce-apex-phases.ts::isAuthorized`** — 2e mécanisme de doc-consultation par-skill/TTL
      (distinct de `isDocConsulted`, déjà porté). Livré en 0.1.49 : `src/policy/apex-authorization.ts`
      exporte `isAuthorized` (même nom que la source Python), `doc_consulted` par framework
      re-validé contre `FUSE_ENFORCE_TTL_SEC`, `target` cross-crédité (parité `track-doc-consultation.py`) — cf. CHANGELOG 0.1.49.
- [x] **Préambule APEX** — le texte trompeur a été corrigé : `claude-md-context.ts:51` dit
      maintenant « created by the /apex command », plus « auto-created on first Write/Edit ».

### Faux « gaps » confirmés — NE PAS re-porter (vérifiés absents/morts côté Python)

- **`init-apex-tracking.py`** — N'EXISTE PAS. Aucun hook Python ne crée `task.json`/`AGENTS.md`/`.gitignore`
  (ils viennent de la commande LLM `/apex`). La seule infra créée (`.claude/apex/docs/`) est déjà portée
  fidèlement (`auto-document-reads.ts`). Hallucination de l'audit.
- **`detectProjectType` (16 branches) pour le préambule APEX** — le vrai `read-claude-md.py` n'a que 4 branches
  (= `detectClaudeMdProjectType`). Swapper introduirait des régressions (Laravel+Tailwind → « tailwind »,
  perte du fallback `*.xcodeproj`). NE PAS swapper.
- **`check-browser-browsing.py` / `preScreenshotWriteGate`** — script mort (non câblé dans aucun `hooks.json`).
  RETIRÉ du port au batch 3 (le quota screenshot vit dans `designSystemWriteGate`).

## Harnais (adapters)

- [x] **Support Hermes** — livré en 0.1.49 : `hermes: ".hermes"` dans `HOME_DIR`
      (`src/config/dotenv.ts:17`), détection + adapter `src/adapters/hermes/index.ts`
      (`pre_tool_call`, protocole `{decision:"block",reason}`/`{context}`), wiring `respond()`.
      `harness init` n'a volontairement pas de runner Hermes : sa config vit hors-projet
      (`~/.hermes/config.yaml`), voir `hermes/index.ts:3-4`.

## Configuration `.env`

- [x] **TTL de cache configurables par env** — livré : `FUSE_WEBFETCH_TTL_SEC` /
      `FUSE_MCP_TTL_SEC` lues dans `src/runtime/mcp-key.ts` (`parseEnvInt`, defaults 24h/48h).
- [ ] **Variantes `.env.local` / `.env.*`** — le loader (`src/config/dotenv.ts` `envCandidates`)
      ne sonde que `~/.<harness>/.env` et `<cwd>/.env`. Ajouter `.env.local` (et l'ordre de
      précédence) si besoin d'un override non versionné.

## Qualité / preuve de parité

- [x] **Harnais de test différentiel Python↔TS** — fait (`test/parity/`). Chaque payload d'une
      matrice de 38 commandes Bash `PreToolUse` est envoyé AU plugin Python `core-guards`
      (chaîne `bash-write`/`git`/`install`/`security`, via `python3`) ET au harness TS
      (`guard()`), avec assertion d'égalité des décisions (block/ask/allow) — `differential.test.ts`.
      Le différentiel tourne en local quand la référence Python est présente
      (`~/Downloads/agents-main/plugins/core-guards`, override `FUSE_PARITY_PYTHON_ROOT`) et
      s'auto-skippe en CI. Un **golden-snapshot** (`golden.test.ts` + `golden.snapshot.json`)
      verrouille la sortie exacte du harness et sert de filet anti-régression CI (sans Python).
      Écarts volontaires exclus de la matrice (cf. section suivante) + trouvés par le diff :
      fork bomb, `mkfs.ext4`, `dd of=/dev/*`, `chmod 777`, `eval` (TS bloque/ask, Python laisse passer).
      Limite connue restante : la matrice ne couvre que les guards de décision `PreToolUse` Bash ;
      les events de cycle de vie (SessionStart/injections) et les caches TTL restent non diffés.
- [x] **Audit de parité complet agents-main → fuse-harness (2026-07-01)** — les 20 plugins de
      `agents-main/plugins/` audités script-par-script (logique réelle comparée, pas seulement les
      JSDoc « Ports X.py ») par une équipe de 4 : core-guards/claude-rules/solid/cartographer/
      changelog-watcher (100% portés sauf `solid`, cf. reliquats) ; ai-pilot/design-expert/
      security-expert/fuse-lessons/commit-pro (couverture solide, 2 scripts ai-pilot manquants —
      portés, cf. CHANGELOG) ; react/nextjs/astro/shadcn/tailwindcss (shadcn-expert entièrement
      absent — porté ; routage tailwind cassé — corrigé) ; laravel/swift/prompt-engineer/seo/_shared
      (2 divergences comportementales réelles trouvées, non corrigées — cf. reliquats). Régression
      systémique confirmée par 3 équipes indépendantes sans coordination : le gate MCP doc
      `context7 ET exa` (Python, `check_skill_common.py::mcp_research_done`) était devenu
      `context7 OU exa OU web` (OR pur) côté TS — corrigé en `(context7 ET exa) OU fuse-browser
      seul` (le fallback web reste une addition TS délibérée, `fuse-browser` étant le fast-path de
      recherche doc documenté dans le CLAUDE.md de l'utilisateur — pas une divergence à corriger).

## Écarts volontaires (assumés — à revoir si clone strict souhaité)

- interface-separation déclenche sur Edit (Python: Write seul)
- Edit sur fichier surdimensionné : depuis 0.1.68 jugé sur le RÉSULTAT calculé (`policy/edit-outcome.ts`) — réduction/mise en conformité autorisée, croissance bloquée (ferme aussi le trou grow-via-Edit que le Python avait). Écart assumé et durci vs Python (Edit exempté côté source).
- doc gate exige `context7` ET `exa` (parité stricte) OU un fallback web (WebSearch/WebFetch/
  fuse-browser) seul — le fallback web-seul est une addition TS délibérée (fast-path documenté),
  pas une divergence de rigueur comme l'était l'ancien `context7 OU exa OU web` pur (corrigé)
- crédite `Agent` ET `Task` (Python: `Agent`)
- freshness ancrée sur le transcript (anti-forge) vs self-report Python
- pipeline design (`SubagentStart`/`SubagentStop`/`agent_id`) explicitement limité à
  `detectHarness().id === "claude-code"` (`src/runtime/handle.ts`) — ces concepts sont le
  vocabulaire du Agent SDK Claude Code ; Codex/Cursor n'ont pas d'équivalent sous-agent
- `gate-helpers.ts::isApexScoped` (`CODE_EXT`) exclut délibérément `.css`/`.html`/`.json` du
  périmètre des gates APEX (doc/SOLID) — le Python `enforce-apex-phases.ts` inclut `.css` dans
  son `CODE_EXT` ; décision produit explicite de ne PAS porter ce point, pas un oubli
- Routage JS des gates SOLID **manifest-first** (H1, `src/policy/js-gate-route.ts`) : un projet
  déclarant `next` route TOUT vers nextGate (règle `'use client'` systématique, crash runtime
  in-vivo corrigé) ; conséquence assumée — dans un projet next la règle legacy react
  d'emplacement des hooks (reactGate) ne s'applique plus, sa couverture était déjà
  marqueur-dépendante. Sans manifest / hors projet JS : routage contenu legacy byte-identique.

## Phase 2 — reliquats (LOW, non bloquants)

- [x] **Chemins harness-agnostiques (cache/état fuse-harness)** — le cache/état propre à
      fuse-harness (sessions, lessons, MCP cache, analytics) est déparenté de `~/.claude/` vers
      `~/.fuse-harness/cache/` (neutre, partagé entre tous les harnais). Les logs par-harness
      (`~/.claude/logs/00-*`) restent volontairement sous le home du harness détecté — hors scope
      de ce point (cache propre au harness vs logs par-harness sont deux choses différentes).
- [x] **cartographer** : tri `localeCompare` → code-point (parité octet), fait (`.sort()` bare).
- [x] **Doc-honnêteté** : `src/runtime/lifecycle/memory/*` — JSDoc « Ports X.py » corrigées pour
      référencer explicitement le plugin séparé `fuse-memory-neural` (pas agents-main).
- [ ] **design** : regex « emoji-as-icon » (`content-checks.ts`) flagge tout non-ASCII → faux positif
      sur texte accenté (français/CJK) ; restreindre à la classe emoji du Python.
- [ ] **SEO** : matcher PostToolUse limité à `Write|Edit|MultiEdit` ; whitespace/entities/casse (port plus strict).
- [ ] **rules/sécurité** : `??` vs `||` (query vide loggée), glob inclut dotfiles, forme de state.
- [ ] **aipilot** : `cache-doc` précédence cwd vs env.
- [x] **SOLID — comptage de lignes** : Python (`validate_solid_common.py::count_code_lines`) exclut
      lignes vides/commentaires du comptage ; le TS (`file-size.ts::countLines`,
      `framework-solid-gates.ts`) comptait les lignes physiques brutes. Corrigé : nouveau
      `countFrameworkCodeLines` (exclut vide/`//`/`*`) utilisé par les 4 gates react/next/laravel/swift ;
      `evaluate.ts` (core-guards générique, parité `enforce-file-size.py`) garde volontairement le
      comptage brut — ce n'est pas la même règle Python.
- [x] **`solid/validate-solid.py`** : les règles spécifiques Go (`check_go`) et Python/ABC
      (`check_python`) n'avaient aucun équivalent TS. Portées dans `runtime/lifecycle/validate-solid.ts`
      (scope `solid`, PreToolUse) — `check_nextjs`/`check_laravel`/`check_swift` du même script
      délibérément NON repris car déjà couverts, plus rigoureusement, par `framework-solid-gates.ts`.
- [x] **`tailwindcss/validate-tailwind.py`** : avertissements PostToolUse (directive `@tailwind`
      dépréciée, `@apply` excessif >10, `className` >150 caractères) — porté dans
      `runtime/lifecycle/validate-tailwind.ts` (nouveau scope `tailwindcss`).
- [x] **`_shared/project_detect.py::is_tailwind_project`** : fallback « `tailwindcss` en dépendance
      `package.json` » (Tailwind v4 CSS-first sans fichier de config) — ajouté à
      `detect-project.ts::detectProjectType` (`hasTailwindDependency`).
- [x] **`ai-pilot/lib/apex/doc-helpers.ts` (Python source, malgré l'extension `.ts`) — reformulé,
      correction d'une erreur d'attribution** : le TS harness (`freshness/doc-helpers.ts`) porte
      bien ce fichier (mêmes noms `isDocConsulted`/`resolveSessions`/`formatDocSatisfactionStatus`,
      même AND strict context7+exa côté source — pas `_shared/tracking.py::check_skill_common.py`
      comme précédemment écrit par erreur dans ce ROADMAP). CE mécanisme (pooling session-wide
      des sources par framework, `isDocConsulted`) est correctement porté. Le SECOND mécanisme
      Python distinct qui restait ouvert ici — `enforce-apex-phases.ts::isAuthorized` +
      `track-doc-consultation.py` (un `doc_consulted` horodaté PAR FRAMEWORK, cross-update vers
      `state.target.framework`) — est livré en 0.1.49 : `src/policy/apex-authorization.ts`
      (fonction `isAuthorized`, même nom que la source), câblé dans `src/runtime/gate-apex.ts`.
      Cf. CHANGELOG 0.1.49.
- [x] **`bash-write-safe-paths.ts`** : `target.startsWith(safe)` sans frontière de segment,
      `stripped.startsWith("~")` sur-expansant `~foo`/`~1`, `hasSafeWriteTarget` non ancré au
      chemin extrait — les 3 corrigés (frontière `+"/"`, tilde POSIX strict, ancrage par guillemets
      incl. sous-chemin `'p/`). Note : ancrage `hasSafeWriteTarget` est un durcissement AU-DELÀ de
      la parité stricte (le Python `safe_paths.py` a le même défaut sur ce point précis) — volontaire.
- [x] **ai-pilot — audit des ~34 scripts `.ts` source (36 avec 2 supplémentaires trouvés)** : 28 bien
      portés (logique vérifiée équivalente). 2 manquants : `detect-and-inject-apex.ts` (aucun hook
      UserPromptSubmit n'injecte "Use APEX methodology" ni n'auto-initialise `.claude/apex/` —
      `getExpertAgent`/`AGENT_MAP` absents, les helpers portés dans `detect-project.ts` sont orphelins)
      et `init-apex-tracking.ts` (rien ne crée `.claude/apex/task.json` + `AGENTS.md` + entrée
      `.gitignore` — le harness ne fait que LIRE un `.claude/apex/` déjà existant). 6 divergences
      comportementales réelles trouvées, non corrigées cette session (impact pratique jugé faible à
      moyen) :
      - [x] `doc-cache-gate.ts` : la branche Context7 de `libraryOf()` était un gate mort en
        pratique — corrigée pour exiger `libraryId` ET `query`. Note : le diagnostic initial
        (« source exige `topic` ») était FAUX — vérifié contre le schéma MCP context7 réel
        (upstash/context7 2026 : `{libraryId, query}`, aucun champ/alias `topic`) et contre les
        usages internes déjà cohérents (`cache-doc.ts`, `mcp-key.ts`, tous deux sur `query`).
      - [x] `enforce-apex-phases.ts`/`lib/apex/trivial-edit-counter.ts` : le fast-path "trivial edit"
        source ne s'applique qu'à `Edit` ; corrigé (`gate-apex.ts` teste maintenant `input.tool === "Edit"`)
        — un `Write` passe désormais toujours par le gate complet.
      - `lib/apex/detection.ts` : logique portée (`detect-project.ts`) mais orpheline (cf. les 2
        scripts manquants ci-dessus) — jamais appelée par un gate. Non corrigé.
      - `lib/apex/state.ts` : fonctions portées à l'identique (`state/apex-state.ts`) mais jamais
        appelées des deux côtés (code mort confirmé, pas une divergence de comportement).
- [ ] **Course TTL fraîcheur vs latence async des sous-agents (2026-07-01, reliquat rouvert)** :
      `agentsRanFromTranscript` ancre la fraîcheur sur l'horodatage de l'entrée `Task`/`Agent` — le
      moment du LANCEMENT (asynchrone, non-bloquant), pas de la fin. Un sous-agent imbriqué
      (`explore-codebase`/`research-expert`) peut mettre >60s à finir dans la pratique (68s observés
      réellement cette session), ce qui, cumulé au temps de retry d'un sniper qui échoue puis
      réessaie un Edit, dépasse facilement la fenêtre de 120s (2min, parité stricte Python
      `apex_agent_helpers.py::_enforce_ttl_seconds`). Une tentative d'élargir `DEFAULT_TTL_SEC`/
      `DEFAULT_WINDOW_MS` à 300s (5min) a été appliquée puis **explicitement revertée sur décision
      utilisateur** (parité stricte préférée à une divergence produit) — le Python n'a pas cette race
      grâce à son écriture temps-réel par appel (`track-subagent-research.py`), indépendante du
      lancement du sous-agent parent. Reste donc un problème réel, non résolu : une piste alternative
      (hors élargissement de fenêtre) serait d'ancrer la fraîcheur sur la FIN du `Task`/`Agent`
      plutôt que son lancement, si le transcript expose cette info — non explorée cette session.
- [x] **`TTL_SECONDS = 604_800` (cache doc Context7/Exa, 7j) dupliqué en 2 littéraux indépendants** :
      `inject-doc.ts` et `doc-cache-gate.ts` définissaient chacun leur propre constante pour le MÊME
      cache — corrigé en extrayant `DOC_CACHE_TTL_SECONDS` dans `cache-base.ts`, importée des deux
      côtés. `inject-explore.ts`/`inject-test.ts` gardent leurs propres `TTL_SECONDS` (86400/172800) —
      caches différents, pas concernés.
- [x] **`solidReadGate` (`apex.ts`) message pauvre vs Python `formatRoutedDeny`** : n'affichait ni le
      label TTL, ni les refs `optional`, ni le `Full skill:` (chemin du skill complet) — corrigé,
      `reason` inclut désormais les 3. `actions` reste `required` seul (inchangé). **Reliquat signalé
      par le sniper** : `routed.skillPath` est garanti vide en pratique — `solidReadGate` appelle
      `routeReferences(ctx.refs, ctx.filePath, ctx.content)` sans 4e argument, et rien dans
      `ApexContext`/`GateInput`/`gate-apex.ts` ne fournit de `skillPath` résolu à ce jour. La ligne
      "Full skill:" s'affichera donc vide tant que ce câblage n'est pas fait — hors scope de ce fix.
- [x] **Message `enforce-file-size.py` (SOLID) jamais enrichi côté port** : le Python inclut le nom
      de fichier, un chemin de référence SOLID résolu par framework
      (`react-expert/skills/solid-react/` etc.) et un plan en 3 étapes ; le TS ne disait que "File
      has N lines (max: M)." — corrigé, `evaluateFileSize()` accepte maintenant `filePath`/`framework`
      optionnels et produit le même message enrichi. Le chemin `~/.claude/plugins/marketplaces/
      fusengine-plugins/plugins` reste en dur, non résolu dynamiquement — VRAIE parité avec Python
      (dont le littéral est aussi non résolu), pas un nouveau bug ; signalé comme incohérent avec la
      convention multi-harnais du reste du repo (`discoverRefs`), mais corriger ça est un changement
      d'architecture plus large, hors scope ici.

## Abandonné (décision) — puis réintroduits, cf. CHANGELOG 0.1.47

Décision initiale inversée : les deux items ci-dessous, notés « non porté volontairement »,
ont en fait été livrés en 0.1.47 (`RALPH_MODE` / `FUSE_ENFORCE_GEMINI_MCP`) — la note
« Abandonné » ci-dessous est obsolète, gardée pour l'historique de la décision.

- [x] ~~Ralph-mode~~ (bypass git/install) — livré 0.1.47 : `RALPH_MODE` (opt-in, défaut off),
      exempte les commandes git sûres, n'exempte jamais le git destructif ni les installs système.
- [x] ~~enforce-gemini-mcp~~ (guard Tailwind) — livré 0.1.47 : `FUSE_ENFORCE_GEMINI_MCP` (opt-in,
      défaut off), `src/policy/gemini-mcp-gate.ts`.

## Écarts volontaires (conventions module, 2026-07)

Ruptures assumées de la parité avec les scripts Python d'origine, introduites par le module
`src/policy/conventions/` (Plan v4 + amendements propriétaires). Chaque écart est couvert par
un test dédié ; les deny NOUVEAUX sont gouvernés par `FUSE_CONVENTIONS_MODE` (défaut deny ;
advisory en opt-out explicite via `FUSE_CONVENTIONS_MODE=advisory`).

- **Masquage commentaires/strings (toutes couches interfaces)** : les regex historiques
  tiraient dans les commentaires, strings, template literals et heredocs — ces faux positifs
  ne bloquent plus (ex. `// export interface Fake`, fixture en template literal, heredoc PHP,
  `type Foo struct{} // satisfies interface { Bar() }`). Fichiers : `guards/interface-separation.ts`,
  `framework-solid-gates.ts`, `framework-solid-gates-systems.ts`, `runtime/lifecycle/validate-solid.ts`,
  `runtime/lifecycle/aipilot/solid-compliance.ts`.
- **`PY_ABC_RE` non ancrée** (`validate-solid.ts`) : `class ABCParser` et les mentions d'ABC en
  commentaire ne sont plus déniées ; la détection exige désormais `class X(…ABC|ABCMeta|Protocol…)`
  sur contenu masqué.
- **Alias `type X =` exportés** : redirigés vers `modules/[feature]/src/types/` (message dédié,
  Amendement 2) au lieu du message interfaces/ — NOUVEAU verdict, advisory-first.
- **`CLIENT_HOOK_RE` (nextGate)** : word boundaries ajoutées — `onChangeHandler`, `useStateMachine`
  ne déclenchent plus l'avertissement `'use client'`.
- **`solid-compliance.ts`** : exclusion `node_modules|vendor|dist|build|.next|coverage` ajoutée ;
  matching par extension (la regex TS ne s'applique plus aux `.py`, ni la regex PHP aux `.ts`).
- **Comptage de lignes** : sur contenu masqué, les intérieurs de strings multi-lignes ne comptent
  plus comme lignes de code dans les limites de taille des gates framework (plus juste, légèrement
  plus permissif sur les fichiers riches en templates).
- **Preuve de parité — rectificatif (contre-audit D0.5)** : le golden snapshot
  (`test/parity/golden.test.ts`) est 100 % Bash PreToolUse — il ne traverse AUCUN gate
  Write/Edit et ne prouve donc RIEN sur les conventions. Les preuves de non-régression
  des conventions sont `test/interface-separation-conventions.test.ts`,
  `test/parity-b3-interfacesep.test.ts` et les sondes live du rapport Patch C.
- **Rust `impl<T> Trait for X` (FN)** : la détection d'impl générique reste un faux
  négatif connu (parité legacy), documenté — non corrigé, advisory-first.
- **Règle hook-location (legacy + étendue) vs stores/query (Patch E)** : un fichier avec
  signature store (zustand/pinia) ou définition TanStack Query est EXEMPTÉ de la règle
  « custom hook hors hooks/ » — sinon `useAuthStore`/`useUsers` étaient hard-deny vers
  `hooks/`, masquant les conventions stores/query (règles propriétaires E1/E5). Cas
  legacy couverts : désormais gouvernés par les règles stores/query (advisory-first).
- **E2 réduit au cas déterministe** : seul le composant `.tsx/.vue` placé dans
  `src/hooks|stores|query|interfaces|types/` est signalé (advisory) ; la règle
  « composant réutilisable dans app/ ou pages/ » est NON implémentée — indécidable
  statiquement sans faux positifs (importé nulle part localement ≠ non réutilisable).
- **Inversion du rollout (décision propriétaire F1.2, 2026-07)** : `FUSE_CONVENTIONS_MODE`
  était advisory-first ; le défaut devient DENY — les règles nouvelles bloquent sauf
  `FUSE_CONVENTIONS_MODE=advisory` explicite (opt-out d'observation). `routeTree.gen.ts`
  dur dans tous les cas. Doc : `docs/conventions.md`.
- **FP `'use client'` (contre-audit F1.1)** : le check de directive tournait sur contenu
  masqué — la directive étant une string, tout composant client Next légitime était dénié.
  La directive est lue sur contenu commentaires-masqués uniquement (`// "use client"` n'est
  pas une directive).
- **Exemption hook-location = signature + cap (contre-audit F0.2)** : un fichier n'est
  exempté de la règle hook que si la signature store est validée par l'import RÉEL
  (commentaires masqués, strings intactes — `maskCommentsOnly`) ou si la définition
  query est validée ET `@tanstack/*-query` présent au manifest. Sans cap/import, la
  règle hook legacy tire, byte-identique (test-verrou : faux `useQuery` sans dep → block).
- **Vue SFC couverte (option F0 pris)** : `export default {}` / `defineComponent(` comptent
  comme composants pour la règle E2, et `.vue` entre dans le chemin du gate étendu.
- **Câblé en Patch E (fin du report)** : `public protocol` Swift, `sealed`/`fun interface`
  Kotlin, interface Go non exportée top-level, gardes stores (Zustand/Pinia), query/
  (cap-gatée), components/ (cas sûr). Rust `impl<T>` reste le seul FN connu.
- **Stdin cap (F2.1)** : lecture bornée (`FUSE_HOOK_STDIN_MAX_BYTES`, défaut 16 MiB —
  seule nouvelle var de la mission, acceptée par le propriétaire), fail-CLOSED sur les
  events bloquants (« denied uninspected »), neutre sur les observation-only. Payload
  légitime max mesuré : 3 757 octets (108 events sim).
- **Verrou track (F2.2)** : `withTrackLock`/`withTrack` — wx + retry borné 400 ms, échec
  → écriture sautée nommée (stderr) jamais de crash, lock orphelin récupéré après 10 s.
  Test réel : 8 process simultanés × 3 écritures, zéro perte.
- **Ancrage des matchers de dossiers (G3)** : les fragments de chemins sont désormais
  ancrés sur segment (`/views/`, jamais `reviews/` ni `livetest-app/`) dans
  `solid-transcript.ts`, `solid-compliance.ts` et le `inAny` d'`interface-separation.ts`
  — écart assumé avec la sémantique substring historique (FP `overview/` tué).
  Exemption propriétaire : `/interfaces/` et `/types/` sont canoniques (jamais violés).
- **Exemption Contracts/ (Laravel in-vivo)** : `Contracts/` (les deux casses) est canonique
  au même titre qu'`interfaces/`/`types/` dans le checker SubagentStop ; le message PHP
  vise `app/Contracts/` (aligné laravelGate), les autres langages `interfaces/`.
- **Dédup anti-boucle SubagentStop** : empreinte SHA-256 du set trié fichier:message,
  sidecar `.harness/track/solid-notice.json` sous verrou sync, TTL dérivé de
  `FUSE_ENFORCE_TTL_SEC` — émission unique par fenêtre, ré-émission si set modifié ou TTL
  expiré. Sur contention du verrou : émis sans enregistrement (visibilité > silence).
- **Restes connus (post-mission)** : Rust `impl<T>` FN ; composant réutilisable
  indécidable (E2 réduit) ; Vue template pur ; migration des hooks locaux kimi sur
  `hook kimi solid` une fois publié ; `tool_response` structuré côté Kimi (plateforme).
