# Implementation notes

Living log of **how we implemented** relative to plan docs (`docs/PLAN.md`, `docs/RENAME_TO_LOOM.md`, review findings).

**Rule (session standing order):**  
When an edge case forces a choice that diverges from the written plan, pick the **more conservative** option, record it under **Deviations** below, and continue. Do not silently improvise.

| Field | Value |
|-------|--------|
| **Maintained** | Yes — update on every non-trivial deviation |
| **Related** | `docs/WORKFLOW.md` (§3.5 Unknowns), `docs/UNKNOWNS.md`, `docs/PLAN.md`, `docs/plan_review.md`, `HANDOFF.md` |
| **Last updated** | 2026-07-17 (0.22.0 loom bridge) |

---

## How to use

1. Hit a plan vs reality conflict (compat, security, testability, circular deps, missing API).
2. Prefer the option that **preserves data, security invariants, and dual-compat** over purity or speed.
3. Append a row under **Deviations** with: date, plan ref, choice, why conservative, follow-up if any.
4. Keep implementing; do not block the wave for aesthetic renames.

**Pre-wave unknowns** (MINOR / new surface) live in **`docs/UNKNOWNS.md`**, not here.  
This file is for **during-implementation** plan deviations only.

---

## Deviations

### 0.9.0 / 0.9.1 — Loom rename + R11 patch

| Date | Plan / review ref | Deviation (what we did) | Why conservative | Follow-up |
|------|-------------------|-------------------------|------------------|-----------|
| 2026-07-09 | RENAME §4.1 write path = `LOOM_*` only | **M-15:** sticky-spawn sets **both** `LOOM_SESSION`/`LOOM_PROFILE` **and** `FABLE_*` | Avoids silent break if an old sticky child or tool only reads `FABLE_*` during the dual-read window | Drop `FABLE_*` write when dual-read is removed (0.10 / 1.0) |
| 2026-07-09 | RENAME §4.2 EXDEV copy: remove legacy only after verified | Copy success → remove legacy if `~/.loom` exists (session.json optional). Not a full file-count audit | Still avoids deleting legacy when copy clearly failed; full tree checksum deferred | Optional: hash/count verify before `rmSync` |
| 2026-07-09 | RENAME §4.2 / M-14 “unify on loomDir” | `mcp-server` imports `loomDir` from `@loom/host` (already a dep) instead of only CLI-injected `dir` | One resolver path for default state home; CLI can still pass `dir` override | None unless host↔mcp cycle appears (none today) |
| 2026-07-09 | RENAME Phase D tests | Introduced **`LOOM_TEST_HOME`** + `resetStateHomeDirCache()` rather than full DI of `homedir()` | Avoids broad refactor of every path helper; tests isolate migration without touching real `$HOME` | Could later inject `stateRoot` for purity |
| 2026-07-09 | Invite dual-accept tests | `RoomRegistry.create(name, inviteCode?)` optional second arg for legacy `FABLE-…` rooms | Needed to register non-minted codes without prefix rewrite; production mint path unchanged (`generateInviteCode` → `LOOM-` only) | Keep optional; do not add prefix-normalization helpers |
| 2026-07-09 | Symbol rename completeness | Kept **`FableSession`**, **`fableSystemHint`**, **`fable` bin**, **`ensureFableDir`** as deprecated aliases | Zero-break for any leftover internal imports / user muscle memory | Remove aliases when dual-read ends |
| 2026-07-09 | RENAME / RN1 L-14 timing-safe util share | **Did not** merge `secretsEqual` + `timingSafeTokenEqual` into `@loom/protocol` in 0.9.x | Out of R11 blocking scope; copy is correct, shared util is cleanup | Backlog L-14 |
| 2026-07-09 | RENAME §4.1 INSECURE: strong stderr if only `FABLE_RELAY_INSECURE_OPEN` set | **Still silent ignore** of legacy insecure env (no dual-read) | Safer than dual-read fail-open; warning is UX-only (R11 Low) | Optional one-shot warn on relay start |
| 2026-07-09 | R11 residual branding | Left some “Fable” strings in usage examples / adapter headers / stale version strings | Non-blocking per R11 Low; avoided drive-by doc thrash in security PATCH | Branding sweep backlog |
| 2026-07-09 | Gate process: re-review after 0.9.1 | PLAN marked **0.9.1 `approved`** by implementer after R11 required fixes; no second full R11 body rewrite | Matches prior series (0.7.1, 0.8.1): required PATCH + author close when review said “PATCH then approve” | If owner wants independent re-review, add R11.1 note only |
| 2026-07-09 | R11 Low branding sweep (0.9.2) | User-facing strings → loom; left intentional dual-compat (`FABLE_*` dual-read, `/fable` slash, deprecated type aliases, legacy MCP markers) | Avoid breaking transition paths while cleaning product UI | Drop dual-compat in 0.10 |
| 2026-07-09 | RENAME §4.1 INSECURE warn | Emit stderr when only `FABLE_RELAY_INSECURE_OPEN` is set; still **does not** enable open bind | Matches plan “strong warn” without reintroducing fail-open | Done |
| 2026-07-09 | L-14 | Moved compare to `@loom/protocol`; relay re-exports `timingSafeTokenEqual` for API stability | One impl; sticky imports protocol directly | Done |
| 2026-07-09 | L-16 | Documented caps as **chars** only (no silent byte-cap behavior change) | Avoids breaking large board snapshots that fit char limit but not a naive byte limit | Optional future byte cap = new MINOR |
| 2026-07-09 | L-4 | **Client FIFO waiter queue** instead of wire `requestId` | Fixes concurrent ack steal without protocol bump; sticky F-3 still serializes RPC | Wire correlation only if multi-multiplex still fails |
| 2026-07-09 | L-4 claim match | Match `inbox.claim_result` by `entry.handoff.id` when present | Concurrent claims less cross-wired; failed claims without entry still FIFO | OK |
| 2026-07-09 | 0.10 dual-compat | **Removed env dual-read and /fable slash**; kept FABLE- invites, fable-board-snapshot, MCP strip, `fable` bin | Avoid breaking on-disk/wire data and shell muscle memory for bin | Remove bin in later minor if desired |
| 2026-07-09 | 0.10 /fable | Returns `help` kind (not peers) | Surfaces deprecation via help text rather than silent no-op | OK |
| 2026-07-09 | R12 M-17 | Wired `envRelay*` into resolveRelayEndpoint / relay cli / loom relay | Prevent silent local join when only FABLE_RELAY_URL set | Done 0.10.1 |
| 2026-07-09 | Codex entry | AGENTS.md + `bun run status` + systemHint line | Codex natively loads AGENTS.md | Done |
| 2026-07-09 | plan_review hygiene | Deferred table open-only; R12 checklist marked as-reviewed @0.10.0 + follow-up table | Prevent “M-17 still open” false reads | Done |
| 2026-07-09 | 0.10.2 bins | Removed `fable` / `fable-mcp` bins and root `fable` script | Product surface = loom only; kept invite/board/MCP strip | Done |
| 2026-07-11 | R19 L-1/L-2 | `room join` explicit `--relay` / `--token` flags override embedded invite-link values with stderr notes; `room invite --link` prints a bearer-secret notice | Least surprise: an explicitly typed CLI flag should win over a pasted blob; bearer-secret notice keeps token-bearing output visible as sensitive | Done 0.18.0 |
| 2026-07-11 | R20 L-1 | `scripts/install.sh` body wrapped in `main(){…}; main "$@"` + `need_cmd git`/`curl` guards | Truncated `curl\|bash` download can't execute a partial function body; explicit tool checks fail fast with a clear message | Done 0.19.0 |
| 2026-07-11 | R20 L-2 | Pin = `main` via `LOOM_INSTALL_REF` (default main), clone the same ref the raw URL serves; overridable to a tag/SHA | Trusted-cohort dogfood; raw URL is `.../main/scripts/install.sh` so default matches. Tag pin available when a release exists | Done 0.19.0 |
| 2026-07-11 | R20 L-3 | `loomCmd()` display helper resolves `loom` vs `bun run loom` via `Bun.which("loom")`; the "if loom is not on PATH…" note now only prints when not installed | Heuristic is acceptable — post-install strangers have `loom`; fallback preserved for repo-only users. Executed spawn (`index.ts` REPL) intentionally excluded (R20 M-3) | Done 0.19.0 |
| 2026-07-11 | R20 L-4 | fish handled via `fish_add_path` in `~/.config/fish/config.fish` with a marker-line idempotence guard | fish does not read POSIX rc PATH syntax; `fish_add_path` is the idiomatic path mutation | Done 0.19.0 |
| 2026-07-11 | 0.19.0 install.sh **bug (Docker-caught)** | `ensure_path` bash branch ended on `[ -e ~/.bash_profile ] && …` → returned 1 when absent → `set -e` aborted install before the ✅ message; added `return 0` + write `~/.profile` (login shells) instead of the conditional `.bash_profile` | Test B/A on clean Ubuntu (bash login) exposed it; macOS zsh branch never hit it. Fix makes both interactive + login shells work | Done 0.19.0 |
| 2026-07-11 | 0.19.0 install.sh testability | Added `LOOM_INSTALL_REPO` (git URL or local path; default GitHub) so the Docker harness clones the local checkout offline | Additive optional env, sibling to `LOOM_INSTALL_DIR`/`_REF`; author-close Low | Done 0.19.0 |
| 2026-07-11 | 0.19.0 install.sh unzip hint | Before installing Bun, if `unzip` absent print a hint (Bun installer unpacks a zip) | Docker A2 diagnostic: minimal Ubuntu lacks unzip → Bun install failed opaquely | Done 0.19.0 |
| 2026-07-11 | Docker dry-run harness | `test/docker/` — Test A (install.sh cold-start on clean ubuntu:24.04, M-4) + Test B (relay + peerA + cold-install peerB → offline handoff across containers). Both pass | Single-host stand-in for the 2-machine dry-run; QA not demand-validation (LOOM_PURPOSE_REVIEW). Caught the ensure_path bug above | Done 0.19.0 |
| 2026-07-11 | R21 A3 `loom doctor` read-only | `cmdDoctor` resolves the expected `~/.loom` home/session path without calling `loomDir()`/`sessionPath()`/`loadSession()`, because those helpers may migrate legacy state as part of normal operation | Stronger read-only interpretation: diagnosis must not rename/copy/delete state even on first run or legacy homes | Done 0.20.0 |
| 2026-07-11 | R21 L-1/L-2/L-3 | Writable check uses `accessSync(home, W_OK)` only; renderer redacts `token` query params defensively; host RPC uses `stickyRpc({ op: "status" }, { meta, timeoutMs: 2500 })` | Closes all R21 Low items without expanding scope or adding mutation | Done 0.20.0 |
| 2026-07-11 | R22 / 0.21.1 PTY inject implementation detail | `run-with-pty.py` services the inject Unix socket from the existing PTY `select` loop instead of a background daemon thread | Keeps all PTY master writes serialized in one loop while preserving the binding locks: env-gated only, no buffering, fresh Stop marker + output quiescence, bracketed paste only | Optional future refactor to daemon thread if the select-loop handler proves too much latency |
| 2026-07-12 | R22 / 0.21.1 known limitations (disclosed) | (a) idle signal = Claude `Stop` hook marker + PTY output-quiescence AND-gate; there is **no `UserPromptSubmit`/pre-generation hook**, so marker staleness is cleared heuristically on human stdin activity. (b) The python inject path (`run-with-pty.py`) is exercised by `py_compile` + architect line-review only — **no runtime/e2e test** (no python test runner in repo). | Conservative: any uncertainty → no-inject (M-3), and the feature is opt-in/dormant unless `--inject-handoffs` (zero default-path blast radius). | **Live smoke recommended before the team enables `--inject-handoffs`**: drive a real `loom run claude --inject-handoffs`, accept a handoff, confirm paste-not-submit + no inject while busy. |
| 2026-07-17 | R23 / 0.22.0 M-2 bare Enter | herdr socket surface has no `pane.run` (methods: `agent.send` / `pane.send_keys`…). M-2 implemented as **two `agent.send` calls**: untrusted prompt, then fixed constant `BARE_ENTER` (`"\n"`). Never interpolates prompt into a submit command. | Matches Step 0.5 “send is no-Enter”; second call is untrusted-free constant only — equivalent to bare Enter without `pane.run` prompt interpolation ban. | Live smoke with real herdr/claude to confirm Enter reaches the agent input. |
| 2026-07-17 | R23 / 0.22.0 bridge stop semantics | `bridge stop` **disconnects without `leave`** so the peer stays on roster as offline (durable inbox + peerSecret rejoin). Explicit leave would drop the peer and make offline dispatch `peer_unknown`. | Preserves F1 offline queue durability from HERDR_DESIGN §2.4. | If permanent de-register is needed later, add `bridge leave` subcommand. |
| 2026-07-17 | R23 / 0.22.0 author-close L-1..L-3 | L-1: zod fail → claim + `failed reason=payload_invalid` result. L-2: `apply_card_result` rejects `result.node` ≠ card `assignee` (+ optional fromNode). L-3: `serializeCardAttachment` pre-checks 256k; schema uses `.nonnegative()`. | All three author-close items implemented without scope expansion. | Done 0.22.0 |
| 2026-07-17 | R23 / 0.22.0 inbox drain | Bridge polls `listInbox` every 1.5s in addition to initial drain (online handoff push does not always deliver full body to the bridge handler). | Conservative: at-most-once processing with `processedHandoffs` set; no journal. | Optional: sticky-style envelope push of full handoff when addressed to self. |

### Earlier waves (pointer only)

| Range | Notes |
|-------|--------|
| 0.3.x–0.8.x | Security PATCHes followed `plan_review` findings; historical detail lives in `docs/plan_review.md` / archive. Add new rows here only when **new** deviations occur. |

---

## Non-deviations (confirmed plan-aligned)

Record successes so the next agent does not “fix” what was intentional.

| Topic | Status |
|-------|--------|
| Live-PID gate before `~/.fable` → `~/.loom` rename | Implemented; M-16 tests cover live vs dead pid |
| No dual-read of `*_RELAY_INSECURE_OPEN` | LOOM only |
| Invite: mint `LOOM-`; lookup full-code case-fold; **no** FABLE→LOOM rewrite | Tested |
| MCP strip: exact `Loom multiplayer` / `mcp_servers.(fable\|loom)` only | “deadline looming” preserved |
| M-7 peerSecret + session 0600 | Unchanged through rename |
| Primary CLI `loom`; `fable` alias kept one minor | Intentional |

---

## Open decisions still deferred (not yet deviations)

These remain as plan defaults; no forced fork yet.

- Drop dual-read `FABLE_*` and `/fable` slash (target 0.10 / 1.0)
- Workspace folder rename `fable-advisor` → `Loom` on disk (optional; remote is already `lemonbalms/Loom`)
- Tauri UI (blocked on cargo/rustc)

---

## Template (copy for next entry)

```markdown
| YYYY-MM-DD | PLAN/RENAME/Rn §… | What we did instead | Why conservative | Follow-up |
```

---

*End of implementation notes. Append; do not rewrite history of old deviations except to mark follow-ups done.*
