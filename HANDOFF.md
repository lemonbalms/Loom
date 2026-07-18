# HANDOFF — Loom (next session)

**Date:** 2026-07-18  
**Workspace:** `/Users/kyoungsiklee/projects/fable-advisor`  
**GitHub:** https://github.com/lemonbalms/Loom (`main`)  
**Language:** user often Korean · **Autonomy:** brief status → execute gate (no mid-wave "할까요?")

> ### Windows에서 볼 때
> **→ [`HANDOFF_WINDOWS.md`](./HANDOFF_WINDOWS.md)** — **git pull 후 Windows 전용 실행 핸드오프**  
> (Step 0 사실 + ⭐ **Tailscale 팀 공용 relay 상시화** 복붙 절차). 제품 코드는 Mac만.  
> 이 파일(`HANDOFF.md`) = Mac/다음 세션 에이전트 진입점.

---

## ⭐ Current action (read first)

> **🎯 크로스머신 CLI 멀티턴 대화 — 1단계 스펙 차팅 완료 (wayfinder 맵 [#1](https://github.com/lemonbalms/Loom/issues/1) 🏁 목적지 도달, 티켓 10건 전부 closed).**  
> 산출물: **[`docs/CONV_SPEC.md`](./docs/CONV_SPEC.md)** (main `cc23c3d`) — relay 컨벤션 멀티턴 대화 스펙 + 2+3 진화 가드.
>
> | 스펙 섹션 | 출처 (닫힌 티켓) |
> |------|------|
> | §1 세션 의미론 (convId·half-duplex·완료·abort) | [#2](https://github.com/lemonbalms/Loom/issues/2) |
> | §2 가드레일·신뢰 모델 (scope 고정·턴 20·2h·M-4) | [#5](https://github.com/lemonbalms/Loom/issues/5) |
> | §3 와이어 컨벤션 (open→accept·card 패턴+kind·보드=카드 1장) | [#6](https://github.com/lemonbalms/Loom/issues/6) |
> | §4 MCP 4도구 (`conv_open/send/await/close`, 블로킹 await) | [#7](https://github.com/lemonbalms/Loom/issues/7) |
> | §5 긴 산출물 (32k 임계·git 주수단 `conv/<convId>/…`·scp 폴백) | [#8](https://github.com/lemonbalms/Loom/issues/8) |
> | §6 2+3 진화 가드 (불변식·relay=제어판/직결=데이터판·전환 신호 3) | [#9](https://github.com/lemonbalms/Loom/issues/9) |
> | §7 기반 사실 (herdr 장수명 워커 · CLI headless resume) | [#3](https://github.com/lemonbalms/Loom/issues/3)·[#4](https://github.com/lemonbalms/Loom/issues/4) — research 브랜치에 상세 |
>
> ### 다음 액션
> - **FREEZE 해제 시**: `docs/CONV_SPEC.md`를 `docs/plan_review.md` **R 사이클에 투입** (claude-rev가 fable-advisor 자문 필수) → 승인 후 구현 PLAN.
> - 2+3 직결 상세는 스펙 **§6.3 전환 기준**(턴>10 상시·ref 전환율≥30%·주 conv≥10) 충족 시 **새 wayfinder 맵**으로.
>
> ### 하지 말 것 (스펙 관련)
> - FREEZE 중 conv_* 도구·relay wire·제품 코드 구현 착수 (스펙 문서만 산출된 상태)
> - 결정 재론 — 각 결정의 상세·근거는 닫힌 티켓의 resolution 코멘트가 SSOT (맵=인덱스)
> - wayfinder 맵 #1 재개봉 — 목적지 재정의는 새 맵으로

---

## One-line resume

> **0.22.0 shipped + 멀티턴 대화 1단계 스펙 완성.** wayfinder 맵 #1 완주 — `docs/CONV_SPEC.md`(cc23c3d) R 사이클 투입 대기. dispatch 시연 §3-2 완료(M-4 거부 실증, `1811aa9`). FREEZE 유지.

---

## Where we are

| Item | Value |
|------|--------|
| **CLI / code** | **0.22.0** — `loom bridge` + MCP card tools |
| **PLAN** | **v0.22.0** `approved` → **implemented** |
| **Open blocking** | none · GitHub Issues 전부 closed |
| **Tests** | `bun test` **218 pass / 0 fail** · 6 pkg typecheck green |
| **Herdr design** | `docs/HERDR_DESIGN.md` · **Conv spec: `docs/CONV_SPEC.md`** |
| **Remote** | `origin/main` **`cc23c3d`** (스펙 커밋) · 시연 `docs/spikes/DISPATCH-DEMO.md` |
| **Untracked (커밋 제외)** | `.playwright-mcp/` · `docs/agents/` + CLAUDE.md 수정분은 mattpocock-skills 셋업분 — 커밋 여부 오너 판단 |

### Access cheat-sheet

```bash
# Mac → Windows
ssh -i ~/.ssh/id_ed25519_loom_windows 34970@100.65.103.113

# Windows → Mac (status/파일 — 카드캡처·Taildrop 불가 확정)
ssh -i ~/.ssh/id_mac_auto kyoungsiklee@100.69.230.114

# Bridge (node with herdr)
loom --profile node-wsl-1 bridge start --allow <towerPeerId>
loom bridge status && loom bridge stop

# herdr
herdr status   # LOOM_HERDR_SOCKET overrides socket path (tests/fake)
```

### Already shipped / done (don't redo)

| Area | Version / note |
|------|----------------|
| Durable inbox … doctor · PTY inject | 0.14–0.21.1 |
| **loom bridge (Herdr)** | **0.22.0** · PLAN R23 · live herdr smoke |
| Step 0 / 0.5 spikes | done 2026-07-17 |
| dispatch 시연 §3-2 + bun.lock 완수 | M-4 거부 실증 · `1811aa9` 3곳 정렬 |
| **멀티턴 대화 1단계 스펙 차팅** | **wayfinder 맵 #1 완주 · `docs/CONV_SPEC.md`** |

### 실증 확정 사실 (재시도 금지)

- **카드 상태-회신 = 짧은 요약만 신뢰** (~35s 왕복). raw/긴 출력은 pane 스크레이프 붕괴 → 스펙 §5가 이를 32k 임계 + artifact ref로 프로토콜화함.
- **Mac↔Windows Taildrop 불가**(양방향, 샌드박스+버전 스큐) → SSH/scp가 정답.

### Naming
**Loom** = product · **Fable 5** = review agent

---

## This session (2026-07-18) — 스펙 차팅 완주

wayfinder 맵 방식(티켓당 1세션 그릴링, HITL)으로 4세션에 걸쳐 완료:

| 세션 | 티켓 | 방식 |
|------|------|------|
| 차팅 | 맵 #1 + 티켓 9건 생성, research 2건 병렬 발사 | grilling + /research 서브에이전트 |
| 그릴링 5회 | #2 → #5 → #6 → #7 → #8 → #9 | AskUserQuestion 1문항씩, 전부 사용자 확정 |
| 조립 | #10 — `docs/CONV_SPEC.md` 작성·커밋·맵 close | task (AFK) |

**What worked**: 티켓당 1세션 규칙 + 지도=인덱스(결정 상세는 티켓 보유) + research 병렬 선행이 그릴링 근거를 만들어 줌. 권장안 제시 → 사용자 선택 패턴 전 세션 일관.  
**What didn't**: 없음 — 전 결정 1회 왕복으로 확정 (수정 요청 0건).

---

## Strategic context

> Loom = 오너 6인 팀 내부 도구. FREEZE = 팀-pull 요구만.  
> 공용 relay = Windows Tailscale 상시화 완료. 온보딩 = `docs/DRY_RUN_RUNBOOK.md`.  
> 0.22.0 브릿지 수직 슬라이스 shipped. **다음 제품 단계 후보 = conv 멀티턴 (스펙 준비 완료, FREEZE 해제 대기).**  
> 저널·supervision·멀티노드·wire 변경은 여전히 out of scope.

---

## Process notes

- 이번 세션 lane: 직접 세션(그릴링은 HITL이라 위임 불가) · research만 서브에이전트.
- Deviations: `implementation-notes.md` (변경 없음 — 이번 세션은 docs만).
