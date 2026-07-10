# HANDOFF — Loom (next session)

**Date:** 2026-07-10  
**Workspace:** `/Users/kyoungsiklee/projects/fable-advisor`  
**GitHub:** https://github.com/lemonbalms/Loom (`main`)  
**Language:** user often Korean · **Autonomy:** brief status → execute gate (no mid-wave "할까요?")

---

## One-line resume

> PLAN **0.17.1** `approved` (author-close, R18 M-27/M-28 locks) — **Launcher UX shipped**:  
> `loom up`/`down` (multi-profile background sticky host, **M-28 sequential**), **auto-host on `room create`/`join`** (default on; `--no-host` / `LOOM_NO_AUTO_HOST=1`), **M-27** down kill-safety (verify process cmdline is `sticky-main.ts` before SIGTERM), `dogfood:up` one-command online.  
> **Code + PLAN both 0.17.1.** `bun test` **167 pass / 0 fail**. Committed + pushed.

---

## Where we are

| Item | Value |
|------|--------|
| **CLI / code** | **0.17.1** (Launcher UX shipped) |
| **PLAN** | **v0.17.1** `approved` (author-close per R18; no R18b) |
| **Open blocking** | **none** — R18 M-27/M-28 locked + implemented; L-33/L-34/L-35 done |
| **Tests** | `bun test` 167 pass / 0 fail |

### Already shipped (context, don't redo)

| Area | Version |
|------|---------|
| Durable inbox | 0.14.x |
| Purpose + verify | 0.15.1 |
| Work bus (board→handoff, `loom work`) | 0.16.1 |
| **Launcher UX (up/down, auto-host, work-first)** | **0.17.1** |

### Naming
**Loom** = product · **Fable 5** = review agent

---

## What shipped in 0.17.1 (this wave)

| Area | Change |
|------|--------|
| **M-27** | `sticky-meta.ts` `pidLooksLikeStickyHost(pid)` (ps cmdline ~ `sticky-main.ts`); `stopStickyHostProcess` gates raw SIGTERM on it — else clear meta + warn ("NOT killed (M-27)") |
| **M-28** | `cmdUp`/`cmdDown` process profiles **sequentially** (no `Promise.all`), `setActiveProfile(explicit)` per profile before spawn/stop |
| **Auto-host** | `cmdRoomCreate`/`cmdRoomJoin` call `autoHostAfterSession(flags)` before exit; fail-soft; `--no-host` / `LOOM_NO_AUTO_HOST=1` opt-out; success prints `host auto-started …` |
| **CLI** | `loom up [--profiles a,b] [--status]` / `loom down [--profiles a,b]`; dispatch + usage + BOOLEAN_FLAGS (`no-host`, `status`) |
| **L-33** | `bunfig.toml` preload `scripts/test-setup.ts` sets `LOOM_NO_AUTO_HOST=1` for `bun test` |
| **Script** | `scripts/dogfood-up.sh` + `dogfood:up` alias (join-all w/ auto-host suppressed, then batched `loom up`) |
| **Tests** | `packages/host/src/sticky-down-safety.test.ts` (M-27 guard: unrelated alive pid not killed) |
| **Docs** | USER_GUIDE §3 (host default + up/down), DOGFOOD_LOOP §1 (dogfood:up journey + L-34 8s note), PLAN 0.17.1, plan_review R18 closed, VERSION 0.17.1 (CLI + MCP) |

---

## Next session playbook

### 1) Status (30s)
```bash
cd /Users/kyoungsiklee/projects/fable-advisor
bun run status
```

### 2) Optional manual smoke (not a blocker; L-33 keeps `bun test` clean)
```bash
# real dogfood online path (spawns background hosts):
bun run dogfood:up -- --status     # report only
# or full: bun run dogfood:up   →   bun run loom down --profiles impl,claude-impl,codex-impl,claude-rev,codex-rev
```

### 3) No open blocking. Next work = Owner priorities (docs/PRIORITIES.md)
Launcher UX (P after work bus) is done. Candidate next: L-30/L-28/L-29 Low backlog,
or a new MINOR — open a PLAN version + R{n} gate first (WORKFLOW §5.1).

---

## Plan pointer
Read: `docs/PLAN.md` Changelog **0.17.1** (M-27/M-28/L-33/L-34/L-35 locks) + **0.17.0** (four pillars, journey, acceptance).  
Review: `docs/plan_review.md` R18 (closed, author-close).
