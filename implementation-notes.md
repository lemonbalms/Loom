# Implementation notes

Living log of **how we implemented** relative to plan docs (`docs/PLAN.md`, `docs/RENAME_TO_LOOM.md`, review findings).

**Rule (session standing order):**  
When an edge case forces a choice that diverges from the written plan, pick the **more conservative** option, record it under **Deviations** below, and continue. Do not silently improvise.

| Field | Value |
|-------|--------|
| **Maintained** | Yes — update on every non-trivial deviation |
| **Related** | `docs/WORKFLOW.md` (§3.5 Unknowns), `docs/UNKNOWNS.md`, `docs/PLAN.md`, `docs/plan_review.md`, `HANDOFF.md` |
| **Last updated** | 2026-07-09 |

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
