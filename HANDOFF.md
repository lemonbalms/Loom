# HANDOFF — Loom (next session)

**Date:** 2026-07-10  
**Workspace:** `/Users/kyoungsiklee/projects/fable-advisor`  
**GitHub:** https://github.com/lemonbalms/Loom (`main`)  
**Language:** user often Korean · **Autonomy:** brief status → execute gate (no mid-wave “할까요?”)

---

## One-line resume

> PLAN **0.17.0** `pending-revision` — **Launcher UX** (`dogfood:up` / `loom up`, join auto-host, work-first, run only when working).  
> **R18 done** (`docs/plan_review.md` R18) — **M-27** (`down` kill-safety needs real process-identity check, not just pid+sessionPath string match) + **M-28** (multi-profile `up` can't guarantee "no LOOM_SESSION mixing" with current `startStickyHostProcess`/`stopStickyHostProcess` primitive — needs sequential processing or `forSessionPath` parameterization).  
> **Next:** @grok-impl applies **PATCH 0.17.1** (M-27/M-28 lock rows in PLAN, mirror 0.16.1 pattern) → author-close (no R18b per WORKFLOW §5.1) → implement → test → commit/push.  
> Code still **0.16.1**. **Do not implement 0.17 until PATCH 0.17.1 locks land.**

---

## Where we are

| Item | Value |
|------|--------|
| **CLI / code** | **0.16.1** (work bus shipped) |
| **PLAN** | **v0.17.0** `pending-revision` |
| **Open blocking** | **M-27, M-28** (see `docs/plan_review.md` Open (blocking)) |
| **Review** | **R18 done** — pending-revision; PATCH 0.17.1 required before implement |

### Already shipped (context, don’t redo)

| Area | Version |
|------|---------|
| Durable inbox | 0.14.x |
| Purpose + verify | 0.15.1 |
| Work bus (board→handoff, `loom work`) | 0.16.1 |

### Naming
**Loom** = product · **Fable 5** = review agent

---

## Next session playbook (ordered)

### 1) Status (30s)
```bash
cd /Users/kyoungsiklee/projects/fable-advisor
bun run status
```

### 2) R18 — done, see `docs/plan_review.md` Review R18
No further reviewer action needed unless PATCH reintroduces new risk (would be R18b).

### 3) PATCH 0.17.1 (impl — required before implement)
Apply as PLAN lock rows (mirror 0.16.1 pattern at `docs/PLAN.md` Changelog):
- **M-27**: `down`'s SIGTERM fallback must pass an independent identity check (cmdline contains `sticky-main.ts`, or start-time ≈ `meta.startedAt`) before killing; on failure, clear meta + warn instead of killing.
- **M-28**: multi-profile `up` must process profiles **sequentially** (no `Promise.all`) or pass `forSessionPath` explicitly through spawn/stop — current primitive re-reads global `sessionPath()` mid-poll, so concurrent profiles can mix.
- (Low, non-blocking but should ride along) **L-33** CI hygiene (`LOOM_NO_AUTO_HOST=1` in test harness), **L-34** doc the join double-stop/8s-delay interaction, **L-35** acceptance additions (idempotent double-up, `LOOM_NO_AUTO_HOST` path, down-safety unit test).

Then author-close (no R18b needed — WORKFLOW §5.1 PATCH-then-author-close path).

### 4) After author-close → implement 0.17.1
In scope:
1. `dogfood:up` / `loom up|down` — multi-profile sticky host background (sequential per M-28)  
2. `room create|join` auto-host (default on; `--no-host` / `LOOM_NO_AUTO_HOST`)  
3. Docs: daily path = up → board/handoff → run only when work  
4. Optional `up --watch` only (not default)  
5. `bun test` · VERSION · USER_GUIDE / DOGFOOD_LOOP rewrite  
6. commit + push  

### 5) Forbidden until PATCH 0.17.1 locks land
- Product code for up/auto-host  
- Author-close of 0.17.0 without the M-27/M-28 lock rows  

---

## Plan pointer
Read: `docs/PLAN.md` Changelog **0.17.0** (user journey + four pillars + locks + acceptance).  
Unknowns: `docs/UNKNOWNS.md` §0.17.0.

---

## User journey (target UX — for implement after R18)

```text
bun run dogfood:up          # morning once; close terminal OK
loom board add "…" --as claude-review
# later:
loom --profile claude-rev run claude   # only when processing
loom work
```
