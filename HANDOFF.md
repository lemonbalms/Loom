# HANDOFF — Loom (next session)

**Date:** 2026-07-10  
**Workspace:** `/Users/kyoungsiklee/projects/fable-advisor`  
**GitHub:** https://github.com/lemonbalms/Loom (`main`)  
**Language:** user often Korean · **Autonomy:** brief status → execute gate (no mid-wave “할까요?”)

---

## One-line resume

> PLAN **0.17.0** `pending-review` — **Launcher UX** (`dogfood:up` / `loom up`, join auto-host, work-first, run only when working).  
> **Next session:** **R18** (`/advisor fable` → plan_review) → if approved implement → test → commit/push.  
> Code still **0.16.1**. **Do not implement 0.17 until R18 approved.**

---

## Where we are

| Item | Value |
|------|--------|
| **CLI / code** | **0.16.1** (work bus shipped) |
| **PLAN** | **v0.17.0** `pending-review` |
| **Open blocking** | none yet (R18 not written) |
| **Review** | **R18 awaiting** |

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

### 2) R18 (Claude reviewer — if not done)
```bash
# Receiver online
bun run loom --profile claude-rev host start   # until 0.17 ships
bun run loom --profile claude-rev run claude
# Paste: scripts/dogfood-reviewer-boot.txt
# claim [R-REQUEST] PLAN 0.17.0 → /advisor fable → plan_review.md R18
```

Or impl re-sends:
```bash
bun run loom --profile impl handoff @claude-review "[R-REQUEST] PLAN v0.17.0 … R18 …"
```

### 3) If R18 `pending-revision`
- Apply PLAN PATCH only (locks table) → author-close if R18 says so → **then** implement

### 4) If R18 `approved` (or author-close after PATCH)
Implement 0.17 In scope:
1. `dogfood:up` / `loom up|down` — multi-profile sticky host background  
2. `room create|join` auto-host (default on; `--no-host` / `LOOM_NO_AUTO_HOST`)  
3. Docs: daily path = up → board/handoff → run only when work  
4. Optional `up --watch` only (not default)  
5. `bun test` · VERSION · USER_GUIDE / DOGFOOD_LOOP rewrite  
6. commit + push  

### 5) Forbidden until R18 approved
- Product code for up/auto-host  
- Author-close of 0.17.0 without R18 path  

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
