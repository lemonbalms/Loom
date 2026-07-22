# herdr 0.7.5 compatibility checkpoint

| Field | Value |
|---|---|
| **Date** | 2026-07-22 |
| **Reviewed** | 2026-07-22 — official release notes + live `herdr api schema --json` vs `fixtures/herdr-v0.7.4` |
| **Local herdr** | `0.7.5` · protocol **17** (`~/.local/bin/herdr`; brew core stable may still advertise 0.7.4) |
| **Loom adapter** | `HERDR_PROTOCOL_EXPECTED = 17` · protocol **17** · shipped through `6e2df8a` |
| **Verdict** | **shipped** through `6e2df8a` — dogfood unblocked; Loom **0.28.1** release close complete |

**Authority for this gate:** this file. Product PLAN/PANE-DEATH locks are orthogonal and must not be rewritten here.

Official sources:

- [herdr v0.7.5 release notes](https://github.com/ogulcancelik/herdr/releases/tag/v0.7.5) (2026-07-21, tag `ef4c23f`)
- [herdr repository / install](https://github.com/ogulcancelik/herdr)

---

## 1. Trigger

The local herdr installation upgraded from **0.7.4 / protocol 16** to **0.7.5 / protocol 17**.

Changing only `~/.loom/bridge/mac-node.json` `herdrProtocol` (or equivalent) to **17** makes the bridge **pass startup ping** and may keep the global event subscription alive, but does **not** establish card dispatch compatibility. The first worker spawn still uses protocol-16 `agent.start` / `agent.send` shapes and fails.

`scripts/dogfood-herdr-check.sh` therefore fail-closes **before** room/bridge mutation in `dogfood:up`: live herdr must be 0.7.5/17 **and** committed `HERDR_PROTOCOL_EXPECTED` must be 17. That gate is now green under the shipped adapter.

---

## 2. Release notes → Loom impact map

### 2.1 Breaking (must adapt)

| Release note | Wire / schema fact (live 0.7.5) | Loom impact |
|---|---|---|
| Live-agent facade: start targets an **existing pane**; validates interactive **kind** and strict **name**; native args after `--` | `agent.start` params: required `name`, `kind`, `pane_id`; optional `args[]`, `timeout_ms` (3000–300000]. **Removed:** `argv`, `cwd`, `env`, `focus`, `tab_id`, `workspace_id`, `split` | **P0.** Entire `spawnWorkerAgent*` path rewired. Topology + env move to `tab.create` / `pane.split` **before** start. |
| `agent send` replaced by `agent send-keys`; atomic **`agent prompt`** added | Methods present: `agent.prompt`, `agent.send_keys`. **`agent.send` is not a protocol-17 method.** Old `AgentSendParams` only in 0.7.4 fixture | **P0.** `injectPromptAndSubmit` uses atomic `agent.prompt`; dual-`agent.send` + `BARE_ENTER` removed. |
| Wait CLI moved to server-owned workflows | `agent.wait{target, until?, timeout_ms?}`; `pane.wait_for_output` retained | Monitoring / smoke / retry helpers prefer these where appropriate; idle wait is **not** a launch barrier. |
| Plugins install/link/enable are **user-global**, not session-isolated | Ops only | Multi-node (WSL/VPS/Windows) must reinstall/relink plugins once per user after upgrade from session-local 0.7.3-era state. |

### 2.2 Added (relevant to Loom)

| Item | Loom relevance |
|---|---|
| Named `start` + atomic `prompt` + logical `send-keys` + server `wait` | Core of the adapter PATCH — **shipped** |
| `agent.view.set` / `agent.view.clear` | **Non-goal** for Loom |
| Plugin `[[startup]]` hooks | Non-goal unless Loom becomes a herdr plugin |
| UI knobs (`ui.sidebar_start_collapsed`, prompt new workspace name, sidebar styling) | Non-goal |
| macOS `HERDR_AGENT=<agent>` foreground-process hint | Optional ops note for wrapped agents (`nono`, etc.) |
| CLI `agent start --kind` includes **`grok`** (also claude, codex, …) | Kind map includes `grok` for dogfood default impl lane |

### 2.3 Fixed (design-relevant, not separate features)

| Fix | Adapter implication |
|---|---|
| Machine-readable **`protocol_mismatch`** when client/server protocols differ | Prefer structured handling over opaque RPC errors in client/logs |
| **`agent_prompt_stalled`** after ~5s without observed state change on waited prompt | Inject retry policy names this error; duplicate-prevention probe-first policy retained |
| Named prompts honor **bracketed-paste** before Enter | Atomic `agent.prompt` is safer for text like `A != B` than hand-rolled CR |
| Grok/Codex/OpenCode/Kimi/Pi lifecycle reporting improvements | Observation quality dump; no Loom API change required |
| `agent wait` returns **`agent_not_running`** promptly when pane closes | Align wait helpers with fail-fast cleanup |
| Oversized bracketed paste no longer disconnects client | Indirect inject stability |

### 2.4 Not in scope for the adapter PATCH

- Session navigator UX, sound notifications, mouse/selection, graphics teardown
- Windows CPU / Ceph cwd cache / remote mise path discovery
- Downgrade to 0.7.4 or dual-version herdr sessions (owner rejected)
- PANE-DEATH completion-authority semantics (U1–U11 / v0.28.0) — only **tolerate** new event fields; do not redefine done authority here

---

## 3. Schema evidence (0.7.4 fixture vs live 0.7.5)

| Surface | Protocol 16 (pre-adapter) | Protocol 17 (shipped) |
|---|---|---|
| Schema version field | `1` | `1` (unchanged) — **contract still breaking** |
| `agent.start` | `name` + `argv` (+ env/cwd/tab_id/split/focus) | `name` + `kind` + `pane_id` (+ args?/timeout_ms?) |
| Text inject | `agent.send{target,text}` | **gone** → `agent.prompt{target,text,wait?}` |
| Key inject | (via `agent.send("\r")`) | `agent.send_keys{target,keys[]}` |
| Env / cwd | On `agent.start` | On **`tab.create`** and **`pane.split`** (`env`, `cwd` still supported there) |
| Wait | top-level wait CLI era | `agent.wait`; `pane.wait_for_output` |
| Event additive | (no release fields) | `pane_agent_detected` may carry **`final_status`**, **`released`** |
| Method count (request oneOf) | 0.7.4 fixture methods list | Live: **89** methods; new agent.*: `prompt`, `send_keys`, `wait`, `view.set`, `view.clear` |

### 3.1 Measured spawn/inject migration target (shipped shape)

```text
1. tab.create / pane.split  → shell pane  (cwd + env: LOOM_CARD, LOOM_HOOK_SOCK, …)
2. agent.start({ name, kind, pane_id, args? })
   // live ACK may be launch_pending — poll agent.get → interactive_ready
   // agent.wait idle is NOT a launch barrier
3. agent.prompt({ target: exact agent name, text })  // named target, not pane id
   // agent.send_keys only for explicit key chords / Enter nudge; not primary prompt path
4. events / agent.wait / scrape / pane.close  (existing completion policy unchanged)
```

Pool equalize (`pane.layout` / `pane.resize`) stays after panes exist; do not pass `split` on `agent.start`.

### 3.2 M-2 (untrusted prompt vs submit) policy note

Protocol 16 M-2: two independent `agent.send` calls so untrusted text never interpolates into a submit command, with fixed `BARE_ENTER = "\r"`.

Protocol 17 atomic `agent.prompt` binds paste+Enter server-side (and respects bracketed-paste). That **collapses the split-call axis**.

**Deviation (shipped):** Treat `agent.prompt` as the trusted submit primitive; herdr owns paste/Enter; prompt body remains opaque text param only. Dual-`agent.send` and `BARE_ENTER` removed; `submitDelayMs` removed. Duplicate-prevention probe policy and reinject cap retained (R46 M-1). See `implementation-notes.md` §0.28.1.

---

## 4. Code surfaces (shipped)

| Area | Path (indicative) | Change |
|---|---|---|
| Protocol constant | `packages/host/src/herdr-client.ts` | `HERDR_PROTOCOL_EXPECTED` **16 → 17** with adapter |
| Client API | same | `agentStart` existing-pane+kind; `tabCreate`/`paneSplit` env+cwd; `agentPrompt` / `agentSendKeys` / `agentWait`; rewrite `injectPromptAndSubmit` |
| Spawn / pool | `packages/host/src/bridge-runtime.ts` | Create shell pane with env → start(kind) → equalize; named exact-name targets; launch_pending poll |
| Inject callers | `bridge-runtime.ts` (dispatch + conv re-inject paths) | New inject; `verifyInjectOrRetry` vs `agent_prompt_stalled` with probe-first duplicate prevention |
| Fake + tests | `fake-herdr.ts`, `bridge.test.ts`, `herdr-lifecycle.test.ts`, `conv.test.ts`, `inject-live.test.ts`, … | Drop `agent.send` assumptions; lock new call order |
| Fixture | `docs/spikes/fixtures/herdr-v0.7.4/` | **Immutable historical** |
| Fixture (new) | `docs/spikes/fixtures/herdr-v0.7.5/` | Live schema/methods/RPC samples captured at implement time |
| Dogfood gate | `scripts/dogfood-herdr-check.sh` | Green under expected 17 + live 0.7.5/17 |
| Ops docs | `HANDOFF_WINDOWS.md`, node boot packs | Version pin; plugin reinstall after upgrade |

Event parser: tolerate `final_status` / `released` on detect events. **Do not** use them alone as completion authority (PANE-DEATH locks U1–U11).

---

## 5. Operating decisions (locked)

1. Owner standard is **current** herdr **0.7.5 / protocol 17**. Downgrade, brew-pin to 0.7.4, or side-by-side 0.7.4 sessions are **not** the target architecture.
2. Never bump only `herdrProtocol` / config to 17 as a bypass — adapter + constant must ship together.
3. Keep 0.7.4 fixtures immutable; 0.7.5 fixture tree coexists.
4. 0.7.5 support is a **product compatibility PATCH** (tests-first): pane creation, env (`LOOM_CARD` / hook sock), named agent start by kind, atomic prompt, event/scrape/cleanup. It is **outside** SESSION-CONTINUITY Phase B/C.
5. `dogfood:herdr` / `dogfood:up` are unblocked under the shipped adapter; persisted dogfood configs with `herdrProtocol:16` auto-migrate before ready early-exit.
6. Product public card/relay/conv/MCP input surfaces and PANE-DEATH U1–U11 remain unchanged.

---

## 6. Implementation order (executed)

1. **Fixture lock** — `docs/spikes/fixtures/herdr-v0.7.5/` + expected-red (`194d901`).
2. **`HerdrClient` surface** — new start/prompt/keys/wait; tab/split env; `HERDR_PROTOCOL_EXPECTED = 17` (`c0fcc00`).
3. **`bridge-runtime` spawn rewire** — pool + legacy paths (`1284eef`).
4. **fake-herdr + unit suite** green (`e538cad`).
5. **Live corrections** — launch readiness (`848675f`/`5ac6d31`); named prompt target (`edf3b59`/`48ecba3`); persisted dogfood protocol migration (`9f13b47`/`8ebfd11`); collision-free strict target identity after Fable advice (`1351add`/`6e2df8a`).
6. **Live smoke + dogfood** — claude/codex/grok each: interactive readiness, env, named prompt, working→idle, scrape, close; `dogfood:herdr` ok; `dogfood:up` exit 0.

### Done when

- [x] `HERDR_PROTOCOL_EXPECTED === 17` and live server 0.7.5/17
- [x] Host herdr/bridge surfaces green (**462 pass / 0 fail / 1899 expect / 34 files / 302.02s**). Diagnostic first full-tree after version bump: **761 pass / 2 fail / 2746 expect / 58 files / 302.64s** — both failures were stale `scripts/handoff-checkpoint.test.ts` hardcodes (release-checkpoint drift). Checkpoint suite after correction: **24 pass / 0 fail / 120 expect**. Authoritative final full tree: **763 pass / 0 fail / 2760 expect / 58 files / 302.48s**.
- [x] Live single-card smoke for default dogfood kinds (`claude` · `codex` · `grok`)
- [x] `bun run dogfood:herdr` prints compatibility ok; `dogfood:up` exited 0 after persisted config migration
- [x] M-2 / inject policy recorded under `implementation-notes.md` **Deviations** §0.28.1
- [x] This file verdict flipped to **shipped** through `6e2df8a`; dogfood unblocked; Loom **0.28.1** release close complete

---

## 7. Evidence log

| When | What |
|---|---|
| 2026-07-22 | Local `herdr --version` = 0.7.5; `status server --json` protocol 17, `live_handoff` capability true |
| 2026-07-22 | Live schema `AgentStartParams` required `name,kind,pane_id`; 0.7.4 fixture required `name,argv` |
| 2026-07-22 | Live methods include `agent.prompt` / `agent.send_keys` / `agent.wait`; no `agent.send` method entry |
| 2026-07-22 | `tab.create` / `pane.split` still accept `env` + `cwd` (CLI + schema) |
| 2026-07-22 | Official release notes matched schema on agent facade + send→send-keys/prompt |
| 2026-07-22 | COMPAT doc expanded with full impact map |
| 2026-07-22 | **Fixture + expected-red** `194d901` — tests-first lock |
| 2026-07-22 | **Client** `c0fcc00` — protocol-17 HerdrClient surface |
| 2026-07-22 | **Bridge** `1284eef` — spawn/inject rewire |
| 2026-07-22 | **Coverage** `e538cad` — fake-herdr + unit suite green |
| 2026-07-22 | **Live launch readiness** `848675f`/`5ac6d31` — `agent.start` ACK may be `launch_pending`; poll `agent.get` → `interactive_ready` (`agent.wait` idle ≠ launch barrier) |
| 2026-07-22 | **Named prompt targeting** `edf3b59`/`48ecba3` — submit targets stored exact agent name (not pane id); live Claude pane-id prompt silently misdelivered |
| 2026-07-22 | **Persisted dogfood protocol migration** `9f13b47`/`8ebfd11` — `herdrProtocol:16` configs migrate before ready early-exit; config-only bump still forbidden as adapter bypass |
| 2026-07-22 | **Fable collision-free name identity** `1351add`/`6e2df8a` — exact `loom-${cardId}-${seq}`, strict lowercase/safe seq/length≤32, fail-closed `agent_name_unrepresentable`, no hash/truncation |
| 2026-07-22 | **Live 3-kind smoke** — claude, codex, grok each: interactive readiness, env, named prompt submission, working→idle event, scrape marker, close |
| 2026-07-22 | **`bun run dogfood:herdr`** compatibility ok; **`dogfood:up`** exit 0 after persisted config migration |
| 2026-07-22 | **Host full** 462 pass / 0 fail / 1899 expect / 34 files / 302.02s |
| 2026-07-22 | **Diagnostic first full-tree** 761 pass / 2 fail / 2746 expect / 58 files / 302.64s — stale `scripts/handoff-checkpoint.test.ts` hardcodes (checkpoint-hardcode drift) |
| 2026-07-22 | **Correction** checkpoint suite 24 pass / 0 fail / 120 expect |
| 2026-07-22 | **Final full green** 763 pass / 0 fail / 2760 expect / 58 files / 302.48s |
| 2026-07-22 | Adapter source complete through **`6e2df8a`**; Loom **0.28.1** release close complete; dist guard green; CLI Loom v0.28.1 |

---

## 8. Cross-refs

| Doc | Role |
|---|---|
| `packages/host/src/herdr-client.ts` | Socket adapter SSOT |
| `packages/host/src/bridge-runtime.ts` | Spawn + inject orchestration |
| `scripts/dogfood-herdr-check.sh` | Fail-closed gate (now green under adapter) |
| `docs/spikes/fixtures/herdr-v0.7.4/` | Immutable protocol-16 capture |
| `docs/spikes/fixtures/herdr-v0.7.5/` | Protocol-17 capture (implement-time) |
| `docs/spikes/STEP0.5-HERDR.md` | Historical 0.7.4 measurement notes |
| `docs/HERDR_DESIGN.md` | Design narrative |
| `implementation-notes.md` §0.28.1 | M-2 / inject / launch / name / config-migration deviations |
| `docs/PLAN.md` §0.28.1 | Product gate decomposition |
| `HANDOFF_WINDOWS.md` | Windows ops pin + plugin reinstall |
