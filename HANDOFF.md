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

> **🎯 FREEZE 해제 (오너, 2026-07-18) → [`docs/CONV_SPEC.md`](./docs/CONV_SPEC.md) R24 리뷰 사이클 투입 — Loom+herdr dogfood 경로.**  
> (스펙 출처: wayfinder 맵 [#1](https://github.com/lemonbalms/Loom/issues/1) 완주, 티켓 #2~#10 closed — 결정 상세는 티켓 resolution이 SSOT.)
>
> ### 준비 완료 (이 세션, 2026-07-18)
> - dogfood 룸 **`LOOM-SGLR`** (`loom-dev`) 재생성 (구 룸 만료) — 5 프로필 sticky host 온라인 + **`mac-node`** 브릿지 노드 프로필(`p_ae186d3e`) 합류. relay = Windows 공용 `ws://100.65.103.113:7842`.
> - 보드 카드 **`task_40cd8e16807e0800`** (R24 리뷰) 생성 + `[R-REQUEST]` handoff **`ho_28a44d2b128555c7`** → `@claude-review` 발송됨 (WORKFLOW §5.2 · DOGFOOD §4.1 형식).
> - CLI 인증 3종 확인: claude 2.1.212 · codex(ChatGPT 로그인) · grok 0.2.102 (auth 유효). herdr 0.7.4 서버 실행 중 (protocol 16).
> - dispatch 스크립트 준비: **`.loom/dispatch-r24.ts`** (gitignored) — claude-impl 세션으로 `dispatchCard` 호출, 리뷰어 mandate 전문 포함.
>
> ### 오너가 직접 실행 (에이전트 classifier 차단분, 2건)
> ```bash
> # 1) 브릿지 기동 — M-1 allowlist에 타워(claude-impl p_ed676195) 인가 포함
> bun run loom --profile mac-node bridge start --allow p_ed676195
> # 2) R24 카드 dispatch → herdr가 Mac에서 claude 스폰 + 리뷰 프롬프트 주입(M-2)
> LOOM_SESSION=$HOME/.loom/profiles/claude-impl.json bun run .loom/dispatch-r24.ts
> ```
> 스폰된 claude는 **기본 권한 모드**(승인 프롬프트 있음) — herdr pane attach로 승인하며 진행. 무인 실행을 원하면 `~/.loom/bridge/mac-node.json`의 `agentArgv.claude`에 권한 플래그 추가 (오너 판단; 에이전트가 쓰는 것은 차단됨).
>
> ### 제약 (실측, 이 세션)
> - **herdr dispatch allowlist = `claude`만** (`packages/protocol/src/card-contract.ts:19` `z.enum(["claude"])`). codex/grok dispatch 확장은 후속 PATCH (HERDR_DESIGN §5 "agentKind allowlist 확장") — R24 승인 후 구현 PLAN 후보.
> - codex/grok 구동은 `loom run` 경로 (herdr dispatch 아님):  
>   `bun run loom --profile codex-impl run codex --write-user-config -- -a never -s workspace-write` · `bun run loom --profile impl run grok`
>
> ### 다음 액션
> - `[R-RESULT]` R24 수신 → **approved** 시 구현 PLAN 착수 (impl 레인 = DOGFOOD §1.2 체인: grok → codex → in-harness) · **pending-revision** 시 PATCH → R24b.
> - 2+3 직결 상세는 스펙 §6.3 전환 기준 충족 시 새 wayfinder 맵.
>
> ### 하지 말 것
> - R24 verdict 전 conv_* 도구·relay wire·제품 코드 구현 착수 (리뷰 게이트 선행)
> - 결정 재론 — 티켓 resolution 코멘트가 SSOT · wayfinder 맵 #1 재개봉 금지

---

## One-line resume

> **FREEZE 해제(2026-07-18) → CONV_SPEC.md R24 투입.** 룸 `LOOM-SGLR` 온라인(5 프로필+mac-node), `[R-REQUEST]` 발송 완료. 오너 액션 2건 대기: ① `bridge start --allow p_ed676195` ② `.loom/dispatch-r24.ts` 실행 → herdr가 claude 리뷰어 스폰.

---

## Where we are

| Item | Value |
|------|--------|
| **CLI / code** | **0.22.0** — `loom bridge` + MCP card tools |
| **PLAN** | **v0.22.0** `approved` → **implemented** |
| **Open blocking** | **R24** (CONV_SPEC.md) pending-review — 카드 `task_40cd8e16807e0800` · GitHub Issues 전부 closed |
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
