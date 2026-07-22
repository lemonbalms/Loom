# herdr 0.7.5 compatibility checkpoint

| Field | Value |
|---|---|
| **Date** | 2026-07-22 |
| **Reviewed** | 2026-07-22 — official release notes + live `herdr api schema --json` vs `fixtures/herdr-v0.7.4` |
| **Local herdr** | `0.7.5` · protocol **17** (`~/.local/bin/herdr`; brew core stable may still advertise 0.7.4) |
| **Loom adapter** | `HERDR_PROTOCOL_EXPECTED = 16` in `packages/host/src/herdr-client.ts` |
| **Verdict** | **blocked for dogfood dispatch** — owner standard is current herdr **0.7.5 / protocol 17**; migrate Loom adapter before any real card spawn |

**Authority for this gate:** this file. Product PLAN/PANE-DEATH locks are orthogonal and must not be rewritten here.

Official sources:

- [herdr v0.7.5 release notes](https://github.com/ogulcancelik/herdr/releases/tag/v0.7.5) (2026-07-21, tag `ef4c23f`)
- [herdr repository / install](https://github.com/ogulcancelik/herdr)

---

## 1. Trigger

The local herdr installation upgraded from **0.7.4 / protocol 16** to **0.7.5 / protocol 17**.

Changing only `~/.loom/bridge/mac-node.json` `herdrProtocol` (or equivalent) to **17** makes the bridge **pass startup ping** and may keep the global event subscription alive, but does **not** establish card dispatch compatibility. The first worker spawn still uses protocol-16 `agent.start` / `agent.send` shapes and fails.

`scripts/dogfood-herdr-check.sh` therefore fail-closes **before** room/bridge mutation in `dogfood:up`: live herdr must be 0.7.5/17 **and** committed `HERDR_PROTOCOL_EXPECTED` must be 17.

---

## 2. Release notes → Loom impact map

### 2.1 Breaking (must adapt)

| Release note | Wire / schema fact (live 0.7.5) | Loom impact |
|---|---|---|
| Live-agent facade: start targets an **existing pane**; validates interactive **kind** and strict **name**; native args after `--` | `agent.start` params: required `name`, `kind`, `pane_id`; optional `args[]`, `timeout_ms` (3000–300000]. **Removed:** `argv`, `cwd`, `env`, `focus`, `tab_id`, `workspace_id`, `split` | **P0.** Entire `spawnWorkerAgent*` path is wrong. Topology + env must move to `tab.create` / `pane.split` **before** start. |
| `agent send` replaced by `agent send-keys`; atomic **`agent prompt`** added | Methods present: `agent.prompt`, `agent.send_keys`. **`agent.send` is not a protocol-17 method.** Old `AgentSendParams` only in 0.7.4 fixture | **P0.** `injectPromptAndSubmit` / M-2 dual-`agent.send` + `BARE_ENTER` is invalid. |
| Wait CLI moved to server-owned workflows | `agent.wait{target, until?, timeout_ms?}`; `pane.wait_for_output` retained | Monitoring / smoke / retry helpers should prefer these over ad-hoc scrape loops where appropriate. |
| Plugins install/link/enable are **user-global**, not session-isolated | Ops only | Multi-node (WSL/VPS/Windows) must reinstall/relink plugins once per user after upgrade from session-local 0.7.3-era state. |

### 2.2 Added (relevant to Loom)

| Item | Loom relevance |
|---|---|
| Named `start` + atomic `prompt` + logical `send-keys` + server `wait` | Core of the adapter PATCH |
| `agent.view.set` / `agent.view.clear` | **Non-goal** for Loom |
| Plugin `[[startup]]` hooks | Non-goal unless Loom becomes a herdr plugin |
| UI knobs (`ui.sidebar_start_collapsed`, prompt new workspace name, sidebar styling) | Non-goal |
| macOS `HERDR_AGENT=<agent>` foreground-process hint | Optional ops note for wrapped agents (`nono`, etc.) |
| CLI `agent start --kind` includes **`grok`** (also claude, codex, …) | Kind map must include `grok` for dogfood default impl lane |

### 2.3 Fixed (design-relevant, not separate features)

| Fix | Adapter implication |
|---|---|
| Machine-readable **`protocol_mismatch`** when client/server protocols differ | Prefer structured handling over opaque RPC errors in client/logs |
| **`agent_prompt_stalled`** after ~5s without observed state change on waited prompt | Replaces “infinite wait after bad Enter”; inject retry policy must name this error |
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

| Surface | Protocol 16 (Loom today) | Protocol 17 (live) |
|---|---|---|
| Schema version field | `1` | `1` (unchanged) — **contract still breaking** |
| `agent.start` | `name` + `argv` (+ env/cwd/tab_id/split/focus) | `name` + `kind` + `pane_id` (+ args?/timeout_ms?) |
| Text inject | `agent.send{target,text}` | **gone** → `agent.prompt{target,text,wait?}` |
| Key inject | (via `agent.send("\r")`) | `agent.send_keys{target,keys[]}` |
| Env / cwd | On `agent.start` | On **`tab.create`** and **`pane.split`** (`env`, `cwd` still supported there) |
| Wait | top-level wait CLI era | `agent.wait`; `pane.wait_for_output` |
| Event additive | (no release fields) | `pane_agent_detected` may carry **`final_status`**, **`released`** |
| Method count (request oneOf) | 0.7.4 fixture methods list | Live: **89** methods; new agent.*: `prompt`, `send_keys`, `wait`, `view.set`, `view.clear` |

### 3.1 Measured spawn/inject migration target

**Current Loom (broken under 0.7.5):**

```text
agent.start({ name, argv, env:{LOOM_CARD, LOOM_HOOK_SOCK?}, cwd, tab_id?, split? })
→ injectPromptAndSubmit: agent.send(prompt) → delay → agent.send("\r")
```

**Target shape:**

```text
1. tab.create / pane.split  → shell pane  (cwd + env: LOOM_CARD, LOOM_HOOK_SOCK, …)
2. agent.start({ name, kind, pane_id, args? })
3. agent.prompt({ target, text })  // prefer atomic; optional wait/until
   // agent.send_keys only for explicit key chords; not primary prompt path
4. events / agent.wait / scrape / pane.close  (existing completion policy unchanged)
```

Pool equalize (`pane.layout` / `pane.resize`) can stay after panes exist; do not pass `split` on `agent.start`.

### 3.2 M-2 (untrusted prompt vs submit) policy note

Protocol 16 M-2: two independent `agent.send` calls so untrusted text never interpolates into a submit command, with fixed `BARE_ENTER = "\r"`.

Protocol 17 atomic `agent.prompt` binds paste+Enter server-side (and now respects bracketed-paste). That **collapses the split-call axis**. Implementation must pick one and record a **Deviation**:

- **(Preferred default)** Treat `agent.prompt` as the trusted submit primitive; document that herdr owns paste/Enter; keep prompt body as opaque text param only (never shell interpolation).
- **(Strict M-2 preserve)** Only if live re-measurement finds a safe non-atomic path that still submits reliably without reintroducing composer races.

Do not silently keep dual-`agent.send` — the method is gone.

---

## 4. Code surfaces that must change

| Area | Path (indicative) | Change |
|---|---|---|
| Protocol constant | `packages/host/src/herdr-client.ts` | `HERDR_PROTOCOL_EXPECTED` **16 → 17** only **with** adapter, never alone |
| Client API | same | `agentStart` existing-pane+kind; `tabCreate`/`paneSplit` env+cwd; `agentPrompt` / `agentSendKeys` / `agentWait`; rewrite `injectPromptAndSubmit` |
| Spawn / pool | `packages/host/src/bridge-runtime.ts` | Create shell pane with env → start(kind) → equalize; rewrite legacy unhinted fallback the same way |
| Inject callers | `bridge-runtime.ts` (dispatch + conv re-inject paths) | Call new inject; revisit `verifySubmitOrRetry` vs `agent_prompt_stalled` |
| Fake + tests | `fake-herdr.ts`, `bridge.test.ts`, `herdr-lifecycle.test.ts`, `conv.test.ts`, `inject-live.test.ts`, … | Drop `agent.send` assumptions; lock new call order |
| Fixture | `docs/spikes/fixtures/herdr-v0.7.4/` | **Immutable historical** |
| Fixture (new) | `docs/spikes/fixtures/herdr-v0.7.5/` | Capture live schema/methods/RPC samples at implement time |
| Dogfood gate | `scripts/dogfood-herdr-check.sh` | Already requires 0.7.5/17; turns green when Loom expects 17 |
| Ops docs | `HANDOFF_WINDOWS.md`, node boot packs | Version pin text; plugin reinstall after upgrade |

Event parser: tolerate `final_status` / `released` on detect events. **Do not** use them alone as completion authority (PANE-DEATH locks).

---

## 5. Operating decisions (locked)

1. Owner standard is **current** herdr **0.7.5 / protocol 17**. Downgrade, brew-pin to 0.7.4, or side-by-side 0.7.4 sessions are **not** the target architecture.
2. Never bump only `herdrProtocol` / config to 17 as a bypass.
3. Keep 0.7.4 fixtures immutable; add a separate 0.7.5 fixture tree when implementing.
4. 0.7.5 support is a **product compatibility PATCH** (tests-first): pane creation, env (`LOOM_CARD` / hook sock), named agent start by kind, atomic prompt, event/scrape/cleanup. It is **outside** SESSION-CONTINUITY Phase B/C.
5. Until the adapter ships, `dogfood:herdr` / `dogfood:up` stay fail-closed before host mutation.
6. Prefer sequencing relative to PANE-DEATH PATCH 1: both touch `herdr-client` / `bridge-runtime`. Run as an **independent wave** (before or after PATCH 1) — do not interleave meaning changes with U1–U11 tests-only expected-red.

---

## 6. Recommended implementation order

1. **Fixture lock** — write `docs/spikes/fixtures/herdr-v0.7.5/` from live schema/methods; expected-red tests against protocol-16 client if useful.
2. **`HerdrClient` surface** — new start/prompt/keys/wait; tab/split env; `HERDR_PROTOCOL_EXPECTED = 17`.
3. **`bridge-runtime` spawn rewire** — pool + legacy paths.
4. **fake-herdr + unit suite** green.
5. **Live smoke** — at least one each of `claude` / `codex` / `grok`: env present in worker, prompt submits, status events, scrape, close.
6. **`dogfood:herdr` / `dogfood:up`** green → refresh HANDOFF / Windows / node notes.

### Done when

- [ ] `HERDR_PROTOCOL_EXPECTED === 17` and live server 0.7.5/17
- [ ] `bun test` green for host herdr/bridge surfaces; tree-only full-suite delta documented
- [ ] Live single-card smoke for default dogfood kinds
- [ ] `bun run dogfood:herdr` prints compatibility ok
- [ ] M-2 / inject policy recorded under `implementation-notes.md` **Deviations**
- [ ] This file verdict flipped to **shipped** with commit SHA; HANDOFF dogfood row unblocked

---

## 7. Evidence log

| When | What |
|---|---|
| 2026-07-22 | Local `herdr --version` = 0.7.5; `status server --json` protocol 17, `live_handoff` capability true |
| 2026-07-22 | Live schema `AgentStartParams` required `name,kind,pane_id`; 0.7.4 fixture required `name,argv` |
| 2026-07-22 | Live methods include `agent.prompt` / `agent.send_keys` / `agent.wait`; no `agent.send` method entry |
| 2026-07-22 | `tab.create` / `pane.split` still accept `env` + `cwd` (CLI + schema) |
| 2026-07-22 | Official release notes matched schema on agent facade + send→send-keys/prompt |
| 2026-07-22 | COMPAT doc expanded with full impact map (this revision) |

---

## 8. Cross-refs

| Doc | Role |
|---|---|
| `packages/host/src/herdr-client.ts` | Socket adapter SSOT |
| `packages/host/src/bridge-runtime.ts` | Spawn + inject orchestration |
| `scripts/dogfood-herdr-check.sh` | Fail-closed gate |
| `docs/spikes/fixtures/herdr-v0.7.4/` | Immutable protocol-16 capture |
| `docs/spikes/STEP0.5-HERDR.md` | Historical 0.7.4 measurement notes |
| `docs/HERDR_DESIGN.md` | Design narrative (protocol-16 era — revise when adapter ships) |
| `implementation-notes.md` | M-2 / bare Enter deviations (protocol-16) — add 0.7.5 inject deviation at ship |
| `HANDOFF.md` | Dogfood axis points here while fail-closed |
| `tasks/todo.md` | Backlog line for the compatibility PATCH |
