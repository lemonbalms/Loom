# Phase 1.5 — PTY / stdin inject spike

| Field | Value |
|-------|--------|
| **Phase** | 1.5 (optional) |
| **Status** | **done** (automated) · manual TUI matrix optional |
| **Verdict** | **defaultPathInject = no-go** · experimental opt-in = **deferred** |
| **Date** | 2026-07-09 |
| **PLAN** | does not change receive model (still queue + pull) |

## Goal

Decide whether agent **stdin / PTY inject** is safe enough to build as a receive path for handoffs (R1 risk: fullscreen TUI input races).

Failure of inject does **not** fail the product — default remains:

- terminal notify / `fable listen`
- `check_handoffs` / `claim_handoff` MCP
- `fable inbox` / `accept`

## Automated harness

```bash
bun run fable spike pty
# or: bun test packages/host/src/pty-spike.test.ts
```

| Case | What it proves |
|------|----------------|
| `policy_blocks_without_flag` | `injectIntoStdin` requires `{ experimental: true }` |
| `idle_line_reader` | Plumbing works: idle line-oriented child accepts inject + `FABLE HANDOFF` marker |
| `busy_sleep_then_read` | Inject **while busy is buffered** and applied later → **unintended submit** risk on a pipe model (TUI analogue) |

## Manual matrix (optional operator notes)

Run only if you want agent-specific evidence. Keep product default **off** regardless.

| Agent | Idle inject | Generating inject | Notes |
|-------|-------------|-------------------|-------|
| Claude Code (Ink) | ? | ? | Expected fragile mid-generation |
| Codex (ratatui) | ? | ? | Expected fragile mid-generation |
| Grok CLI | ? | ? | Confirm TUI vs line mode |
| Shell | often OK | N/A | Not a coding-agent TUI |

**Suggested manual protocol (do not automate against live agents in CI):**

1. `fable run <agent>` in one pane; keep agent idle at prompt.
2. From another process with experimental inject flag only (not wired to CLI default), write one sanitized handoff block to that child's stdin.
3. Observe: does the agent treat it as user input? Does the TUI redraw break?
4. Repeat while the agent is generating a long response.

## Verdict (locked for product)

| Decision | Choice |
|----------|--------|
| Default receive path | **Queue + pull only** (no stdin inject) |
| Product feature `fable run --inject-handoffs` | **Deferred** — needs idle detection (hooks) + human accept first |
| Dead code risk | `injectIntoStdin` kept behind `experimental: true`; default path never calls it |

### Rationale

1. Automated busy case confirms **late application** of buffered stdin — the core R1 failure mode.
2. Fullscreen agent TUIs are stricter than line readers; success on idle shell ≠ success on Claude/Codex.
3. Pull tools already deliver the multiplayer value hypothesis without PTY complexity.

## Exit criteria (met)

- [x] Spike harness runnable via `fable spike pty`
- [x] Policy guard on inject API
- [x] Documented go/no-go: **no-go for default**
- [x] PLAN Phase 1.5 marked done with verdict
- [ ] Optional: fill manual matrix rows when operators have free time

## Out of scope

- Enabling inject on `fable run` / MCP notify path
- Presence overlay / VT emulator
- Changing MCP tools
