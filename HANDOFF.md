# HANDOFF — Loom (next session)

**Date:** 2026-07-09  
**Workspace (local path):** `/Users/kyoungsiklee/projects/fable-advisor`  
**GitHub:** https://github.com/lemonbalms/Loom (`origin` → `main`)  
**Audience:** next agent (fresh context)  
**Language:** user often Korean (`진행해`, `리뷰해`, `단계적으로 진행해`, …)

### Session entry (for agents)

On first reply of a new session: read this file + `docs/WORKFLOW.md` §0, then **tell the user the status table** (PLAN / open gate / next action).  
**Codex:** loads root `AGENTS.md` natively. **All:** `bun run status` for a quick table.

---

## One-line resume

> `bun run status` 출력 후 사용자에게 세션 상태 알려줘. PLAN **0.11.1 approved**. 다음: **implement `apps/desktop`** (Status/Peers/Inbox; Rust invoke; textContent-only; no Board v1).

---

## Goal

**Loom** = Mosaic-class multiplayer AI terminal: rooms, presence, offline handoff inbox, sticky host, context pack, task board, MCP for Claude/Codex/Grok.

North star: *connect your agents — and your teammates.*

---

## Where we are (read first)

| Item | Value |
|------|--------|
| **Product CLI** | `loom` v**0.10.3** (bumps with desktop implement wave) |
| **Packages** | `@loom/*` Bun monorepo |
| **PLAN SSOT** | `docs/PLAN.md` **v0.11.1** — status **`approved`** (R13 closed) |
| **Review gate** | Open blocking **none** — implement M4.3b shell |
| **Workflow rules** | **`docs/WORKFLOW.md`** (§3.5 Unknowns) · **`docs/UNKNOWNS.md`** · session entry **`AGENTS.md`** |
| **Status script** | `bun run status` |
| **Deviations log** | `implementation-notes.md` |
| **Tests** | `bun test` green |
| **Git** | `main` → `origin` https://github.com/lemonbalms/Loom.git |
| **Remote account** | GitHub auth: **lemonbalms** |
| **Tauri** | **Unblocked** — `cargo`/`rustc` 1.96 present; `@tauri-apps/cli` in root devDeps |
| **Open blocking** | none (R13 M-18/19/20 locked in 0.11.1) |

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
| `baa2c90` | **0.11.1** | R13 close: M-18 C, M-19 Rust invoke, M-20 textContent |
| `539930e` | R13 | plan_review hygiene + first R13 body |
| `5a5b356` | **0.11.0** / 0.10.3 | PLAN draft M4.3b Tauri shell |
| `c3d2de2` | **0.10.2** | Remove `fable`/`fable-mcp` bin aliases; CLI is `loom`/`loom-mcp` only |
| `ae4f693` | **0.10.1** | M-17 env wiring + Codex `AGENTS.md`/`bun run status` |
| `50d46c5` | docs | plan_review hygiene after 0.10.1 gate close |
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
- (0.10.2) **`fable` / `fable-mcp` bins removed** — CLI entry is `loom` / `loom-mcp` only

Key files: `packages/protocol/src/env.ts`, `env.test.ts`, `packages/host/src/slash.ts`, `sticky-spawn.ts`, `relay` server/cli, `docs/PLAN.md` 0.10.x, `plan_review.md` R12.

---

## Immediate next steps (ordered)

### 1. Preferred next work

| Priority | Item | Notes |
|----------|------|--------|
| **Next** | **Implement `apps/desktop`** | PLAN 0.11.1: Status/Peers/Inbox; Rust invoke; textContent; no Board |
| Later | Board UI | After shell; sticky board ops or explicit path |
| Later | L-5 pack embed TOCTOU | When file-body embed ships |
| Later | Wire `requestId` | Optional beyond L-4 FIFO |

### 2. Smoke commands

```bash
cd /Users/kyoungsiklee/projects/fable-advisor   # or clone Loom
bun install
bun test
bun run loom --version    # expect 0.10.3
bun run status            # PLAN/Open briefing (Codex/Claude/human)
cargo --version && rustc --version   # Tauri prerequisite
git status -sb
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
| Loom rename + R11/R12 + 0.10.2 (no fable bin) | L-5 when embed |
| plan_review hygiene + Codex entry + `bun run status` | Tauri (cargo) |

**Resume prompt (copy-paste):**

```
HANDOFF.md와 docs/WORKFLOW.md 읽고 bun run status 출력 후 상태를 알려줘.
PLAN 0.10.1 approved 기준으로 다음 backlog 제안해.
```

---

*Update this file when the next session finishes a gate or changes direction.*
