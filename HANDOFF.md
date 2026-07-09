# HANDOFF — Fable Advisor

**Date:** 2026-07-09  
**Workspace:** `/Users/kyoungsiklee/projects/fable-advisor`  
**Audience:** next agent session (fresh context)  
**Language:** user often replies in Korean (`진행해`, `리뷰해`, …) — follow that preference.

---

## Goal

Ship a **Mosaic-class multiplayer AI terminal**: room bus + offline handoff inbox + multi-agent CLI wrap (Claude/Codex/Grok), with plan-gated security fixes from `docs/plan_review.md`.

**Immediate product goal after this handoff:** PLAN **v0.9.0** Loom rename **implemented** (`pending-review` / **R11**). Product CLI is **`loom`**. Next: R11 review, then Low backlog (L-14/L-16/L-4) or Tauri.

### Naming boundary (critical)

| Name | Meaning |
|------|---------|
| **Loom** | **Product** (planned rename from Fable) — CLI/packages/docs after 0.9.0 |
| **Fable** (today) | Current product name in code (`fable`, `@fable/*`, `~/.fable`) until rename ships |
| **fable-advisor / Fable 5** | **Review agent / model** — not the product; do not rename with product |

See `docs/RENAME_TO_LOOM.md` (status `draft`).

---

## Where we are (read this first)

| Item | Value |
|------|--------|
| **PLAN SSOT** | `docs/PLAN.md` **v0.9.0** — status **`pending-review`** (Loom rename) |
| **Review gate** | **R11** requested; M-7 done in 0.8.1 |
| **CLI version** | `loom` / `VERSION = "0.9.0"` (`fable` alias still works) |
| **Tests** | `bun test` → **116 pass / 0 fail** |
| **Git** | Workspace may **not** be a git repo (`fatal: not a git repository` observed). Do not assume `git status` works. |
| **Tauri** | Deferred — **no cargo/rustc** in environment |

**Do not mark PLAN `approved` without review sign-off** (project rule). 0.8.1 already signed via R10 follow-up.

---

## Current progress (shipped through 0.8.1)

Work was done **incrementally** from plan reviews R5→R10 findings:

| Plan | What shipped |
|------|----------------|
| 0.3.1 | H-5 fail-open refuse, H-6 Bearer/token split, M-5 timing-safe token, M-6 stale socket |
| 0.4.x | Sticky host IPC (F-1/F-2/F-3) |
| 0.5.x | Context pack (room-scoped, path allowlist) |
| 0.6.x | Task board + atomic JSON locks (H-7/M-8/M-9) |
| 0.7.x | Board snapshot share; M-10/11/12 trust; L-11 caps; L-12 lock pid ownership |
| **0.8.0** | **M-7 per-peer rejoin secret** (code + docs + tests) |
| **0.8.1** | **R10 M-13** run join fail-fast + onError; **L-15** sticky peerSecret save |

### M-7 design (implemented)

- First `create`/`join` for a `peer.id` → relay mints **`peerSecret`** (base64url, 24 random bytes via `generatePeerSecret()`).
- Secret returned **only** on that peer’s `room.state.peerSecret` (not roster broadcast / not other peers).
- Rejoin same `peer.id` requires `peer.secret` matching stored secret (**timing-safe** `secretsEqual` in `room.ts`).
- Fail → `error.code = peer_auth_failed`.
- Client persists `peerSecret` on `FableSession` with file mode **0600** (`saveSession`).
- Sticky host / CLI reconnect paths pass `session.peerSecret`.

**Residual (documented):** lost session file ⇒ cannot reclaim that peer id → join as **new** peer id.

---

## Key files (M-7 and gate)

| Path | Role |
|------|------|
| `packages/protocol/src/codes.ts` | `generatePeerSecret()` |
| `packages/protocol/src/envelope.ts` | `ClientPeerSchema.secret?`, `room.state.peerSecret?` |
| `packages/relay/src/room.ts` | `Member.secret`, `addPeer` auth, `roomStateEnvelope({ peerSecret })` |
| `packages/relay/src/server.ts` | create/join → secret only on room.state to joiner |
| `packages/host/src/session-store.ts` | `FableSession.peerSecret?`, mode 0600 |
| `packages/host/src/relay-client.ts` | capture/send secret |
| `packages/host/src/sticky-server.ts`, `room-ops.ts` | sticky rejoin with secret |
| `packages/cli/src/index.ts` | join/create/listen/run; VERSION **0.8.1**; M-13 fail-fast |
| `packages/host/src/relay-client.ts` | secret + `setReconnectPeerSecret` / onError |
| `packages/host/src/sticky-server.ts` | L-15 saveSession peerSecret |
| `apps/relay-cloud/README.md` | threat model table (0.8.0+) |
| `docs/PROTOCOL.md` | Peer ownership (M-7) section |
| `docs/PLAN.md` | **0.8.1** approved + risk register |
| `docs/plan_review.md` | R10 closed via 0.8.1 follow-up |
| `tasks/todo.md` | short checklist (synced) |

### Tests touching M-7

- `packages/relay/src/auth.integration.test.ts` — `M-7 peer secret`
- `packages/relay/src/server.integration.test.ts` — offline rejoin **with** `aliceSecret`
- `packages/host/src/sticky-host.integration.test.ts` — session must include `peerSecret` from create
- `packages/protocol/src/envelope.test.ts` — schema accepts secret fields
- `packages/relay/src/room.test.ts` — `mustAdd` helper (must call `room.addPeer`, **not** recurse)

---

## What worked

1. **Plan SSOT + review gate loop:** implement finding → bump PLAN → `plan_review` → user says `진행해` for next backlog.
2. **Thin M-7:** no mTLS/JWT; just server-minted secret + session file. Enough to close “token+invite takeover” for remote multiuser.
3. **Room-scoped packs/boards** (not profile-scoped) — intentional multi-profile same machine share.
4. **Sticky host first** (Phase 4.0a) before Tauri — UI blocked on Rust toolchain.

---

## What didn’t work / traps for the next agent

1. **`mustAdd` infinite recursion** in `room.test.ts`: a bulk rewrite turned the helper body into `mustAdd(...)` instead of `room.addPeer(...)` → stack overflow. If you regenerate helpers, **never** call the helper from itself.
2. **Integration tests after M-7** must rejoin with secret from first `room.state`. Without it: timeout waiting for `room.state` (server sends `peer_auth_failed`).
3. **Sticky host** fails to rejoin if session JSON lacks `peerSecret` after create (same root cause).
4. **Do not default-inject PTY** — Phase 1.5 spike verdict is **no-go**; inject stays experimental/off.
5. **Tauri** — do not burn time scaffolding if `cargo`/`rustc` missing; leave Product backlog.
6. **Marking `approved` without review** — project forbids it; 0.8.1 was R10 follow-up close of M-13/L-15.

---

## Open backlog (after 0.8.1)

| ID | Sev | Notes |
|----|-----|--------|
| **Loom rename** | Product | `docs/RENAME_TO_LOOM.md` draft → PLAN 0.9.0 |
| L-14 | Low | shared timing-safe util |
| L-16 | Low | attachment cap chars wording |
| L-4 | Low | `requestOnce` envelope-type matching / correlation id |
| L-5 | Low | v2 pack embed TOCTOU re-resolve (only when embed ships) |
| Tauri UI | Product | Needs Rust/cargo install first |

Historical closed items (R7–R9 L/M/H) are in `docs/plan_review.md` and `docs/plan_review_archive.md` — do not re-open without cause.

---

## Next steps (copy-paste for next session)

### A. Preferred first action — Loom rename (owner gate)

1. Read `docs/RENAME_TO_LOOM.md`; get explicit owner approval.
2. Implement as PLAN **0.9.0** Phase A→B (do not mix with other features).

### B. Or Low backlog

- **L-14** shared timing-safe util in `@fable/protocol`
- **L-16** document attachment cap as chars
- **L-4** `requestOnce` correlation id

### C. Smoke before any code change

```bash
cd /Users/kyoungsiklee/projects/fable-advisor
bun test
bun run fable --version   # expect 0.8.1
```

---

## Repo layout (quick)

```
packages/
  protocol/   # envelopes, sanitize, codes, relay-url
  relay/      # Room, RelayServer, auth
  host/       # session, sticky, pack, board, inject, slash
  cli/        # fable entry
  mcp-server/ # agent-facing MCP tools
  adapters/   # claude/codex/grok MCP config writers
apps/relay-cloud/README.md
docs/PLAN.md, plan_review.md, PROTOCOL.md, ARCHITECTURE.md
tasks/todo.md
```

Scripts (root `package.json`):

- `bun test`
- `bun run fable …`
- `bun run dev:relay` / `relay:lan` (LAN needs `FABLE_RELAY_TOKEN`)

---

## Workflow conventions (do not skip)

1. **PLAN is SSOT** — version + status + changelog for every non-trivial change.
2. **Reviews** go in `docs/plan_review.md` with **target plan version**.
3. **Implementation gate:** only `approved` is “blessed”; authors often implement then set `pending-review` (as with 0.8.0).
4. **User phrase `진행해`** = implement next backlog / continue current gate (not re-plan from zero).
5. Prefer **minimal, root-cause fixes**; run tests before claiming done.
6. Global user prefs: plan multi-step work; verify with tests; capture lessons if corrected.

---

## Session status snapshot

| Done | Pending |
|------|---------|
| M-7 + R10 M-13/L-15 | Loom rename owner approval |
| PLAN **0.8.1 approved** | L-14 / L-16 / L-4 backlog |
| 116 tests green | Tauri (cargo) |

**One-line resume prompt for next chat:**

> `HANDOFF.md` 읽고 PLAN 0.8.1 기준. 다음: `RENAME_TO_LOOM.md` 승인 후 0.9.0 구현, 또는 L-14/L-16.

---

*End of handoff. Update this file when the next session finishes a gate or changes direction.*
