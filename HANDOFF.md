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
> ### 0.23.1 실물 스모크 시도 기록 (2026-07-18 오후) — ⚠️ 구조적 블로커 발견, §5.2 라이브 미도달
> **결론: Claude Code(Ink TUI) 워커로는 §5.2 32k artifact 경로가 라이브에서 절대 트리거되지 않는다.** 브릿지 스크레이프(`herdr paneRead recent 200`)는 Ink TUI의 렌더 버퍼만 읽는데, TUI가 트랜스크립트를 접어/스크롤아웃해서 워커가 40k+를 출력해도 스크레이프는 **소스·줄수 무관 ~5.3k 상한**(200줄 요청 중 실제 콘텐츠 22줄만 잔존). 대조 검증: 원시 shell pane에 60k cat → `recent 200`=20.6k, `recent 500`=51.7k로 스크롤백 보존 → **차이의 원인은 herdr 상한이 아니라 Claude Ink TUI의 트랜스크립트 접힘**. HANDOFF 종전 "216컬럼×200줄≈43k" 추정은 raw shell 기준이었고 TUI 워커엔 적용 안 됨(정정).
> - 워커 모델별 거동(사용자 요청: fable→opus/sonnet 교체 테스트, `agentArgv.claude`에 `--model` 부여):
>   - **Fable**(기본): 마커 붙은 대량출력 턴 **수행** (구 conv에서 AAAA 190줄 생성 — 단 구 브릿지에서 회신 유실).
>   - **Sonnet 5**: 마커(`⚠ Untrusted handoff content`) 붙은 대량출력 지시를 **프롬프트 인젝션으로 판단·반복 거부** (conv 채널 설득 턴에도 불응, "직접 대화창에 지시하라" 요구). goal-ack 등 정상 턴은 응답함 — 거부는 injection형 콘텐츠 한정.
>   - **Opus 4.8**: **동일하게 거부** — conv 채널로 온 마커 붙은 대량출력 턴을 자발 수행하지 않음. 출력이 나온 것은 **오너가 pane에 직접(사람이 in-pane) "승인된 자동화 테스트"라고 입력**한 뒤였음(자발 생성 아님 — 종전 기록 정정). 그렇게 나온 dense 200줄(`SMOKE-0231-BULK-END`)조차 위 TUI 접힘으로 스크레이프 4.7k → `artifacts=null`(패키징 미발동). 패키징 코드 자체는 무결(309 유닛테스트 green), 라이브 도달 불가가 원인.
>   - **정리**: Fable만 마커 대량출력을 자율 수행. **Sonnet 5·Opus 4.8은 둘 다 거부** — 사람이 pane에 직접 개입해야 통과. → capable 모델 워커엔 injection형(무의미 filler 강제) 대신 **benign goal-ack형 턴**이 필요(아래 후보 ⑪).
> - **후속 후보 ⑩(신규·상위)**: §5.2 트리거 전제 재검토 — (a) 워커 출력을 pane 스크레이프가 아니라 워커가 직접 파일로 쓰게 하는 경로, 또는 (b) `herdr pane read`가 TUI raw 스크롤백을 더 깊이 노출하는 모드 조사, 또는 (c) 32k 임계를 TUI 스크레이프 실측 상한(~5k) 기준으로 재조정. 후보 ⑤(delta 스크레이프)도 이 상한에 종속.
> - **후속 후보 ⑪(신규)**: capable 모델(Sonnet 5/Opus 4.8) 워커용 스모크 페이로드를 injection형(무의미 대량 filler) 대신 **benign goal-ack형**으로 재설계 — 예: "이 저장소의 실제 대용량 파일(예: docs/PLAN.md)을 정당한 목적으로 출력"처럼 워커가 거부하지 않을 정상 작업으로 volume 확보. 단 후보 ⑩ TUI 상한이 선결이라 ⑪ 단독으론 §5.2 도달 불가.
> - 다음 (선택): conv-node-hosts.json에 상대 peerId 매핑 등록 후 fail-closed↔제시 분기만이라도 별도 확인(32k 도달과 무관하게 M-1/M-2 제시 파이프라인 단위 검증 — 유닛 커버되어 우선순위 낮음).
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

> **v0.23.2 implemented (`91bee75`) + 실물 스모크 완료 (2026-07-18).** 당일 체인: R24 스펙 → R25/0.23.0 구현 → conv 실물 스모크 → R26/0.23.1(artifact 패키징) → R27/0.23.2(agentKind codex·grok 확장) → **0.23.2 스모크 A/B 완주**(codex fail-closed + grok 라이브 pane) → **0.23.1 스모크 시도**(⚠️ Claude Ink TUI 스크레이프 ~5k 상한으로 §5.2 32k 라이브 미도달 — ⭐ 블록 "0.23.1 실물 스모크 시도 기록" + 후보 ⑩ 참조. fable/sonnet/opus 워커 거동 차이도 기록). 다음 = **후속 후보 ⑩**(§5.2 트리거 전제 재검토, 상위) 또는 ②③⑤⑥⑦⑨. 룸 `LOOM-SGLR`+브릿지 **0.23.2 코드·기본 argv로 온라인**(pid는 세션마다 다름 — `loom --profile mac-node bridge status`로 확인. mac-node config엔 grok argv 등록 유지, claude는 기본 `["claude"]`로 복원됨).

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
