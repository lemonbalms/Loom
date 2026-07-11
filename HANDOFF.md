# HANDOFF — Loom (next session)

**Date:** 2026-07-10  
**Workspace:** `/Users/kyoungsiklee/projects/fable-advisor`  
**GitHub:** https://github.com/lemonbalms/Loom (`main`)  
**Language:** user often Korean · **Autonomy:** brief status → execute gate (no mid-wave "할까요?")

---

## ⭐ Next action (strategic — read first)

> **2026-07-11 전략 검토 완료 → `docs/LOOM_PURPOSE_REVIEW.md`.**
> 판정: 현 단계(학습/도그푸드 벡터) 타당하나 **제품 검증은 아직 0**. 2인 검토(Opus +
> fable-advisor/Fable 5, PARTIALLY AGREE).
> **단일 최고가치 다음 수 = 기능 추가가 아니라 "며칠 내 다른 머신의 실제 사람 ≥2명에게
> 태우기"** (1인 도그푸드로는 이 멀티휴먼 제품을 구조적으로 검증 불가).
> 선행: 최소 배포 경로(설치 5분) + 첫-5분 마찰 제거 + 수요 신호 1줄 기록.
> 상세·트립와이어·리스크: `docs/LOOM_PURPOSE_REVIEW.md`.

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

### 3) No feature blocking — but the priority is STRATEGIC, not the next feature
전략 검토(`docs/LOOM_PURPOSE_REVIEW.md`) 결론: **기능을 더 얹지 말고 "실제 사람 ≥2명에게
태우기"가 단일 최고가치.** 그 선행 작업(최소 배포 경로 + 첫-5분 마찰 제거)을 먼저.
Low 백로그(L-30/L-28/L-29)나 새 MINOR는 그 다음 — 필요 시 PLAN 버전 + R{n} 게이트(WORKFLOW §5.1).

---

## Plan pointer
Read: `docs/PLAN.md` Changelog **0.17.1** (M-27/M-28/L-33/L-34/L-35 locks) + **0.17.0** (four pillars, journey, acceptance).  
Review: `docs/plan_review.md` R18 (closed, author-close).
