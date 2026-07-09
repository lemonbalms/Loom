# HANDOFF — Loom (next session)

**Date:** 2026-07-09  
**Workspace (local path):** `/Users/kyoungsiklee/projects/fable-advisor`  
**GitHub:** https://github.com/lemonbalms/Loom (`origin` → `main`)  
**Audience:** next agent (fresh context)  
**Language:** user often Korean (`진행해`, `리뷰해`, `단계적으로 진행해`, …)

---

## One-line resume

> `HANDOFF.md` + `docs/WORKFLOW.md` 읽고, **PLAN 0.10.0 R12 리뷰**부터 진행해. 승인되면 PLAN approved 처리 후 backlog(L-5 / Tauri / bin alias 제거 등).

---

## Goal

**Loom** = Mosaic-class multiplayer AI terminal: rooms, presence, offline handoff inbox, sticky host, context pack, task board, MCP for Claude/Codex/Grok.

North star: *connect your agents — and your teammates.*

---

## Where we are (read first)

| Item | Value |
|------|--------|
| **Product CLI** | `loom` v**0.10.0** (`fable` bin **alias still exists**) |
| **Packages** | `@loom/*` Bun monorepo |
| **PLAN SSOT** | `docs/PLAN.md` **v0.10.0** — status **`pending-review`** |
| **Review gate** | **R12 requested** — dual-compat drop (env + slash) |
| **Workflow rules** | **`docs/WORKFLOW.md`** (Plan → Review → Implement → Ship) |
| **Deviations log** | `implementation-notes.md` |
| **Tests** | last full run **132 pass / 0 fail** (`bun test`) |
| **Git** | `main` tracking `origin/main`; latest push includes `fe4719d` (0.10.0) |
| **Remote account** | GitHub auth: **lemonbalms** |
| **Tauri** | **Blocked** — no `cargo` / `rustc` in env |
| **Open blocking** | R12 review only (not a code bug — gate) |

### Naming (critical)

| Name | Meaning |
|------|---------|
| **Loom** | **Product** — CLI, packages, docs |
| **fable-advisor / Fable 5** | **Review agent** — not the product |
| **FABLE_*** / `/fable` | **Legacy** — env dual-read **removed in 0.10**; slash dual-accept **removed** |

---

## What just shipped (recent commits)

| Commit | Version | Summary |
|--------|---------|---------|
| `fe4719d` | **0.10.0** | Drop `FABLE_*` env dual-read + `/fable` slash; keep data-path compat |
| `e79dbcd` | docs | `docs/WORKFLOW.md` workflow rules |
| `e15bf3a` | 0.9.4 | L-4 requestOnce FIFO waiter queue |
| `9267af2` | 0.9.3 | L-14 shared timing-safe + L-16 caps as chars |
| `fd37b01` | 0.9.2 | R11 Low branding + INSECURE warn |
| `2351065` | 0.9.1 | R11 M-14/15/16 migration gate |
| `891d7a5` | init | Initial Loom monorepo |

### 0.10.0 dual-compat drop (detail)

**Removed (runtime):**

- Env dual-read: only `LOOM_*` values used; if only `FABLE_*` set → **warn, do not use**
- Slash: `/loom` only; `/fable …` → help (no dual-accept)
- sticky-spawn writes `LOOM_SESSION` / `LOOM_PROFILE` only
- Relay host/port/token from `LOOM_*` only

**Kept (conservative — see implementation-notes):**

- Join with legacy invite codes `FABLE-XXXX` (full-code match, no prefix rewrite)
- Import `fable-board-snapshot` kind/label
- MCP strip of legacy `mcp_servers.fable` tables
- Root/`package.json` **`fable` bin alias** → same CLI entry

Key files: `packages/protocol/src/env.ts`, `env.test.ts`, `packages/host/src/slash.ts`, `sticky-spawn.ts`, `relay` server/cli, `docs/PLAN.md` 0.10.0, `plan_review.md` R12 section.

---

## Immediate next steps (ordered)

### 1. Preferred — **R12 review** (gate)

1. Read `docs/PLAN.md` (0.10.0 changelog) + R12 checklist in `docs/plan_review.md`.
2. Code-verify dual-compat drop (env LOOM-only, slash, sticky, keep data-path).
3. Write R12 findings **or** mark **approved** under `## Review R12`.
4. If approved:
   - PLAN header → `approved`
   - Open blocking clear; decision log row
5. If findings → PATCH 0.10.1, fix, re-check.

**Do not mark PLAN `approved` without R12 sign-off** (WORKFLOW rule). Author-close only if review text says “PATCH then approve” pattern.

### 2. After R12 approved

| Priority | Item | Notes |
|----------|------|--------|
| Optional | Remove `fable` bin alias | If R12 agrees |
| Later | L-5 pack embed TOCTOU | Only when file-body embed ships (v1 is paths-only) |
| Product | Tauri UI | Needs Rust toolchain install first |
| Later | Wire `requestId` | Optional beyond L-4 FIFO waiters |

### 3. Smoke commands

```bash
cd /Users/kyoungsiklee/projects/fable-advisor   # or clone Loom
bun install
bun test
bun run loom --version    # expect 0.10.0
git status -sb            # expect clean if no local edits
git log -3 --oneline
```

---

## Repo structure (quick)

```
packages/
  protocol/   # envelopes, codes, sanitize, env, timing-safe
  relay/      # Room, RelayServer, auth
  host/       # session, sticky, pack, board, slash, relay-client
  adapters/   # claude/codex/grok/shell
  mcp-server/ # MCP tools stdio
  cli/        # loom entry, VERSION
apps/relay-cloud/README.md
docs/PLAN.md, WORKFLOW.md, plan_review.md, PROTOCOL.md, ARCHITECTURE.md
implementation-notes.md   # Deviations
HANDOFF.md                # this file
```

Scripts: `bun test`, `bun run loom …`, `bun run dev:relay`, `relay:lan` (needs `LOOM_RELAY_TOKEN`).

---

## Workflow conventions (do not skip)

Full text: **`docs/WORKFLOW.md`**.

1. **PLAN** = product plan SSOT (version + status + changelog).
2. **plan_review.md** = R{n} results; target version in header.
3. **implementation-notes.md** = plan deviations (conservative choice + continue).
4. **`진행해`** = next gate step → implement → `bun test` → docs sync → often commit/push.
5. Review needed: MINOR/security Med+/new surface; **not** required for pure Low if already approved pattern — but **0.10.0 is pending-review → R12 required**.
6. Naming: Loom product ≠ Fable 5 reviewer.
7. Ship remote: `https://github.com/lemonbalms/Loom.git` as **lemonbalms**.

---

## Security invariants (do not regress)

- Peer string allowlist sanitize (ESC/CSI/OSC)
- Timing-safe compare via `@loom/protocol` (`timingSafeStringEqual`)
- M-7 peerSecret rejoin; session file mode 0600
- H-5: non-loopback without token refuses; **no** dual-read of `*_INSECURE_OPEN`
- H-6: Bearer preferred; no token in default WS URL
- H-4: MCP upsert never duplicates tables; exact-anchor strip (no bare `loom` word wipe)
- Home migrate: live sticky/relay PID → no `~/.fable`→`~/.loom` rename; use `loomDir()` everywhere (M-14)

---

## Traps

1. **Hardcoding `~/.loom`** bypasses migration gate (M-14) — always `loomDir()`.
2. **Invite prefix rewrite** `FABLE-X`→`LOOM-X` is forbidden (room collision).
3. **PTY inject** default is no-go (Phase 1.5).
4. **Tauri** without cargo = waste of time.
5. Approving PLAN without R12 while status is `pending-review` violates gate.

---

## Session status snapshot

| Done | Pending |
|------|---------|
| Loom rename 0.9.x + R11 closed | **R12 on 0.10.0** |
| L-4 / L-14 / L-16 | R12 findings or approve |
| WORKFLOW.md | Optional: drop `fable` bin |
| 132 tests green (at 0.10.0 ship) | L-5, Tauri |

**Resume prompt (copy-paste):**

```
HANDOFF.md와 docs/WORKFLOW.md 읽고 PLAN 0.10.0 R12 리뷰부터 진행해.
승인되면 plan approved 처리하고 다음 backlog로.
```

---

*Update this file when the next session finishes a gate or changes direction.*
