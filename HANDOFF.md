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

> **🎯 v0.23.2 dispatch/conv agentKind allowlist 확장 (codex·grok) — R27 게이트→구현 완주. `implemented` (`91bee75`), bun test 309/0.**  
> 체인(당일 4연속): 0.23.0 구현 → conv 실물 스모크 → 0.23.1 구현 `e5ccc4d` → **PLAN 0.23.2 R27 즉시 approved**(M-lock 없음 — 리뷰는 herdr dispatch claude 워커+fable-advisor, 실전 4회째, 이번엔 스타트업 레이스 없이 완주) → 구현 `91bee75` (grok-impl 레인 · 아키텍트 독립 검증). enum 3종 확장 + 브릿지 로컬 argv opt-in(기본 미등록 = fail-closed, DEFAULT는 claude만) + L-1 `sanitizeAgentArgv`·L-2 등록 고지 author-close.
>
> ### 다음 액션 (우선순위 순)
> 1. **후속 PATCH 후보** (구 ④=agentKind 확장은 0.23.2로, 구 ⑧=codex/grok 스모크는 완료): ② done_proposal 탐지 규약 ③ conv.open deny 클레임 순서 ⑤ 워커 턴 pane 스크레이프 delta화(관찰 ⓐ claude-mem 노이즈+이전 턴 누적 반복 · **관찰 ⓒ** grok 스모크에서 idle-scrape가 최종 답 줄을 중간 절단 + summary가 TUI chrome("Shift+Tab:mode…")으로 오염 — 카드 lane도 동일 개선 필요) ⑥ close 시 pane 정리 정책(관찰 ⓑ) ⑦ `loom conv-hosts set` CLI(0.23.1 follow-up — conv-node-hosts.json 현재 수동 편집) ⑨ **브릿지 주입 verify 루프 개선**(composer 비면 프롬프트 재주입 — 레이스 수동 복구 3회째, grok에서도 재현 확정).
>
> ### 0.23.2 실물 스모크 기록 (2026-07-18 오후, ⑧ 완료)
> - **A (fail-closed)**: codex 미등록 dispatch → `failed reason=agent_kind_not_allowed` 회신·태스크 blocked 전이. ✅
> - **B (grok 라이브)**: `agentArgv.grok=["~/.grok/bin/grok" 전체경로]` 등록 → grok pane 스폰(`loom-task_…-1`, herdr가 agent=grok 인식) → **스타트업 레이스 재현**(composer 비어 있음) → 수동 복구(리터럴 재주입+별도 Enter `$'\r'`) → working→idle→card.done, 회신 `SMOKE-B OK version=0.1.0 head=9ca06bb`, 태스크 done. ✅
> - mac-node 브릿지 config에 grok 등록 유지됨(로컬 opt-in 상태). codex는 의도적 미등록 유지(fail-closed 검증용 겸 미사용 레인).
> 2. (선택) 0.23.1 실물 스모크 — 32k 초과 턴 유도해 artifact 파일 생성·conv_await artifactCommands 제시 라이브 확인. conv-node-hosts.json에 상대 peerId 매핑 수동 등록 필요(없으면 fail-closed 사유 표시 — 그것도 정상 동작 확인임). 사전 실측(2026-07-18 오후): pane 폭 216컬럼 → 200줄 스크레이프 최대 ~43k로 32k 초과 유도 가능 확인.
> 3. 2+3 직결 상세는 스펙 §6.3 전환 기준 충족 시 새 wayfinder 맵.
>
> ### conv 실물 스모크 기록 (2026-07-18, 0.23.0)
> `conv_ec40e20b1ea246ba`: conv_open → accept → 실물 herdr pane 스폰(cwd·`LOOM_CONV` env 확인) → turn 왕복 3회 → conv_close(보드 task done). 양측 pin·seq 단조·`inFlight` 0 복귀 실증. R26 리뷰 dispatch에서는 스타트업 레이스 재발 → lessons 수동 복구 절차(리터럴 재주입+별도 Enter) 2회째 실증.
>
> ### 실측 제약·교훈 (재확인 금지 — 상세 `tasks/lessons.md` 2026-07-18)
> - herdr dispatch allowlist = `claude`만 (`card-contract.ts:19`). codex/grok은 headless 레인(grok-implementer 서브에이전트)으로 위임 — 오너 승인된 방식.
> - M-1 allowlist엔 **전체 peer ID** (`loom peers` 표시값은 잘린 ID).
> - 브릿지 주입은 워커 TUI 스타트업 레이스에 질 수 있음 — composer 비면 `herdr agent send` 리터럴 재주입 + 별도 Enter로 수동 복구 (0.23.0 후속 개선 후보).
> - 워커 pane 정리는 **card.done 수신 후** (조기 close 시 브릿지 스크레이프 회신 유실 — R25에서 실증).
> - `bun test`는 셸에 `LOOM_RELAY_TOKEN`/`LOOM_RELAY_URL`이 있으면 relay 테스트가 깨짐 — `env -u LOOM_RELAY_TOKEN -u LOOM_RELAY_URL bun test`.
>
> ### 하지 말 것
> - R25 결정·CONV_SPEC 재론 — plan_review R24·R25 본문이 SSOT
> - artifact 패키징 등 후속 PATCH를 리뷰 게이트 없이 착수 (M-lock 인접이면 R{n} 필요 여부 WORKFLOW §5.1 확인)

---

## One-line resume

> **v0.23.2 implemented (`91bee75`) + 실물 스모크 완료 (2026-07-18).** 당일 체인: R24 스펙 → R25/0.23.0 구현 → conv 실물 스모크 → R26/0.23.1(artifact 패키징) → R27/0.23.2(agentKind codex·grok 확장, 즉시 approved) → **0.23.2 스모크 A/B 완주**(codex fail-closed + grok 라이브 pane). 다음 = **후속 PATCH**(⭐ 블록 후보 ②③⑤⑥⑦⑨) 또는 0.23.1 실물 스모크(32k artifact). 룸 `LOOM-SGLR`+브릿지 **0.23.2 코드로 온라인**(pid는 세션마다 다름 — `loom --profile mac-node bridge status`로 확인).

---

## Where we are

| Item | Value |
|------|--------|
| **CLI / code** | **0.23.2** — conv 멀티턴 + artifact 패키징 + agentKind 3종(codex/grok은 브릿지 로컬 opt-in) |
| **PLAN** | **v0.23.2** `approved` (R27) → **implemented** (`91bee75`) |
| **Open blocking** | none — R24–R27 모두 closed · GitHub Issues 전부 closed |
| **Tests** | `bun test` **309 pass / 0 fail** · 6 pkg typecheck green |
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
