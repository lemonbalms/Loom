# HANDOFF — Loom (next session)

**Date:** 2026-07-11 (PM)  
**Workspace:** `/Users/kyoungsiklee/projects/fable-advisor`  
**GitHub:** https://github.com/lemonbalms/Loom (`main`)  
**Language:** user often Korean · **Autonomy:** brief status → execute gate (no mid-wave "할까요?")

---

## ⭐ Next action (strategic — read first)

> **최우선 = Tier A1: 5분 설치 경로** (`docs/DOGFOOD_FEATURES.md` Tier A).
> 전략 판정(`docs/LOOM_PURPOSE_REVIEW.md`)은 그대로 유효: 제품 검증 0 → **단일 최고가치 =
> "다른 머신의 실제 사람 ≥2명에게 태우기"**. 그 유일한 잠금해제가 **5분 설치 경로**다
> (지금은 `bun link`라 외부인 불가). 방향이 갈리는 설계 결정(설치 스크립트 vs 상시
> relay+초대코드) → **착수 전 `fable-advisor` 자문**.
> 선행 2·3: 첫-5분 마찰 제거 + 수요 신호 1줄 기록.
> 전체 후보·티어: `docs/DOGFOOD_FEATURES.md` · 트립와이어/리스크: `docs/LOOM_PURPOSE_REVIEW.md`.

---

## One-line resume

> PLAN **0.17.1** `approved` (author-close, R18 M-27/M-28 locks) — **Launcher UX shipped**:  
> `loom up`/`down` (multi-profile background sticky host, **M-28 sequential**), **auto-host on `room create`/`join`** (default on; `--no-host` / `LOOM_NO_AUTO_HOST=1`), **M-27** down kill-safety (verify process cmdline is `sticky-main.ts` before SIGTERM), `dogfood:up` one-command online.  
> **Code + PLAN both 0.17.1.** `bun test` **168 pass / 0 fail** (+1: dup-peer fix test). Committed + pushed.
> **2026-07-11 PM 세션:** 도그푸드 UC-12/13/14 신설·라이브 검증 + **중복 peer 버그 수정**(`bcd7504`).

---

## Where we are

| Item | Value |
|------|--------|
| **CLI / code** | **0.17.1** (Launcher UX shipped) |
| **PLAN** | **v0.17.1** `approved` (author-close per R18; no R18b) |
| **Open blocking** | **none** — R18 M-27/M-28 locked + implemented; L-33/L-34/L-35 done |
| **Tests** | `bun test` 168 pass / 0 fail |
| **Latest fix** | `bcd7504` dup-peer (room join identity reuse + relay prefer-online) — C4 in `docs/DOGFOOD_FEATURES.md` |

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

## This session (2026-07-11 PM) — dogfood loop, one full turn

| 영역 | 결과 |
|------|------|
| 플러그인 | fable-advisor **v3.0.0 → v3.1.0** 업데이트(codex 레인 GPT-5.5→GPT-5.6 Sol), 구 캐시 정리 |
| 도그푸드 문서 | 루트 `index.md`(문서 인덱스+최신성) · `docs/DOGFOOD_FEATURES.md`(Tier A~D 기능 리스트업) 신설 |
| UC 신설 | `TEST_PLAN.md` **UC-12/13/14**(Launcher UX / Work bus / Purpose+verify) — 실제 CLI 표면 근거 |
| 라이브 검증 | `dogfood:up` 5호스트 실구동 → UC 핵심 경로 ✅; 초안 오류 2건 정정, 실배송 버그 1건 발견 |
| **버그 수정** | **중복 peer**(`bcd7504`): room join 재조인 시 정체성 재사용(+`peer_auth_failed` fallback), relay `findPeerByName` online 우선. 자문(Fable)→codex(GPT-5.6 Sol) 구현→아키텍트 검증→라이브 재현 |
| 정리 | 5호스트 down, relay 재시작(새 코드), 구 비영속 room 소멸(테스트 태스크 정리됨) |

### ⚠ 운영 노트 (다음 세션 주의)
- **grok CLI 인증 만료** — 기본 impl 레인 사용 불가. 복구: `! grok login` (사용자 실행). 이번엔 codex 레인으로 우회함.
- **dogfood room 소멸** — `.loom/dogfood-room.env`의 `LOOM-UPSJ` 죽음. 재개 시 `bun run dogfood:room --fresh` → `bun run dogfood:up` (이제 재조인해도 중복 peer 없음).
- **미검증 UC**(낮은 우선순위): 13.E work watch, 13.F/14.G MCP 경로, 14.F claim 계약.
- 유보 항목: 기존 stale peer GC(L-29), name-dedup-on-join.

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

### 3) Priority = Tier A1 (5분 설치 경로), not another feature
`docs/DOGFOOD_FEATURES.md` Tier A1. 착수 전 **`fable-advisor` 자문**으로 방향 확정
(설치 스크립트 vs 상시 relay+초대코드). 목표: 낯선 사람이 5분 내 설치→방 참여.
그다음 A2(첫-5분 마찰)·A4(수요 신호). Low 백로그/새 MINOR는 그 이후 — PLAN 버전 + R{n} 게이트(WORKFLOW §5.1).

---

## Plan pointer
Read: `docs/PLAN.md` Changelog **0.17.1** (M-27/M-28/L-33/L-34/L-35 locks) + **0.17.0** (four pillars, journey, acceptance).  
Review: `docs/plan_review.md` R18 (closed, author-close).
