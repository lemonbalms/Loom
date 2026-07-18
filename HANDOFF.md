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

> **🎯 R24 완주: [`docs/CONV_SPEC.md`](./docs/CONV_SPEC.md) `approved` (author-close, 2026-07-18, `f7adfdc`) — 다음 = conv 멀티턴 구현 PLAN 작성.**  
> (스펙 출처: wayfinder 맵 [#1](https://github.com/lemonbalms/Loom/issues/1) · 리뷰 상세: `docs/plan_review.md` R24 — M-1 conv↔peer pin·M-2 artifact ref 검증 규약 문안 반영 + L-1..L-5 author-close, no R24b.)
>
> ### R24 사이클 실행 방식 (dogfood 실증 — 이 세션)
> - **리뷰**: 룸 `LOOM-SGLR` 재생성 → 카드 `task_40cd8e16807e0800` → `dispatchCard`(claude-impl 타워) → **mac-node 브릿지가 herdr로 claude 워커 스폰**(M-2 프롬프트 주입) → fable-advisor 자문 포함 R24 작성 → `[R-RESULT]`+card.done 회신 → `applyCardResult`(L-2 검증) 보드 반영. **0.22.0 브릿지 경로 첫 실전 사용 성공.**
> - **PATCH**: grok-impl 레인(카드 `task_06b468b9893a9e08`) → 아키텍트 diff 검증 → `f7adfdc` 커밋 · `[VERIFY]` 발송.
> - 리뷰어 워커 pane 정리 완료. 브릿지(`mac-node`, pid 14480)와 sticky host 6개는 온라인 유지 — 다음 게이트에서 재사용.
>
> ### 실측 제약 (재확인 금지)
> - **herdr dispatch allowlist = `claude`만** (`card-contract.ts:19`). codex/grok dispatch 확장 = 구현 PLAN 후보 항목.
> - **M-1 allowlist엔 전체 peer ID** (`~/.loom/profiles/<name>.json`의 `peerId`) — `loom peers` 표시값은 잘린 ID (`tasks/lessons.md` 2026-07-18).
> - codex/grok 구동은 `loom run` 경로: `bun run loom --profile codex-impl run codex --write-user-config -- -a never -s workspace-write` · `bun run loom --profile impl run grok`
>
> ### 다음 액션
> - **conv 멀티턴 구현 PLAN 초안** (PLAN vNext): approved CONV_SPEC 기준. 구현 lane = DOGFOOD §1.2 체인 (grok 기본). PLAN은 R{n} 게이트 필요 (MINOR+protocol 인접).
> - 후보 스코프: conv_* MCP 4도구 · conv↔peer pin 집행 · dispatch allowlist codex/grok 확장.
> - 2+3 직결 상세는 스펙 §6.3 전환 기준 충족 시 새 wayfinder 맵.
>
> ### 하지 말 것
> - PLAN 승인(R25) 전 conv_* 구현 착수 — 스펙 approved ≠ PLAN approved
> - 결정 재론 — 티켓 resolution + R24 본문이 SSOT · wayfinder 맵 #1 재개봉 금지

---

## One-line resume

> **CONV_SPEC.md R24 `approved` (`f7adfdc`).** 리뷰=herdr dispatch 워커(브릿지 첫 실전), PATCH=grok-impl 레인, 아키텍트 검증 완료. 다음 = conv 멀티턴 **구현 PLAN 초안 → R25**. 룸 `LOOM-SGLR`+브릿지 온라인 유지.

---

## Where we are

| Item | Value |
|------|--------|
| **CLI / code** | **0.22.0** — `loom bridge` + MCP card tools |
| **PLAN** | **v0.22.0** `approved` → **implemented** |
| **Open blocking** | none — **R24 closed `approved`** (author-close, `f7adfdc`) · GitHub Issues 전부 closed |
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

> Loom = 오너 6인 팀 내부 도구. **FREEZE 해제됨 (오너, 2026-07-18) — conv 멀티턴 트랙 진행 승인.**  
> 공용 relay = Windows Tailscale 상시화 완료. 온보딩 = `docs/DRY_RUN_RUNBOOK.md`.  
> 0.22.0 브릿지 수직 슬라이스 shipped. **다음 제품 단계 = conv 멀티턴 (R24 승인 게이트 → 구현 PLAN).**  
> 저널·supervision·멀티노드는 여전히 out of scope. wire 변경은 CONV_SPEC 승인 범위 내에서만.

---

## Process notes

- 이번 세션 lane: 직접 세션(그릴링은 HITL이라 위임 불가) · research만 서브에이전트.
- Deviations: `implementation-notes.md` (변경 없음 — 이번 세션은 docs만).
