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

> **🎯 v0.23.11 완주 (2026-07-19 오전) — 잔여 후보 ①③④⑤ 일괄 웨이브(오너 지시) + ② 병렬 완주 — R35 게이트 → grok 구현 → 라이브 스모크(보정 3건) → `0ee8c50`+.** 오너 지시("모두 다음 세션에서 적용해") 전 5건 해소: **① claude 상태줄 chrome 필터**(` │ `+`⚡`/`🧠` 시그니처 — R31 M-1 경계 유지) **③ summary 실내용 우선 선별**(`selectCardSummaryLine` 말미→앞 순회, 타이밍-전용 줄 전체-매치 스킵 — `1m49s` 복합형·`█` 잔재 라이브 실측 반영) **④ 동시 스폰 직렬화**(`spawnWorkerAgent` promise chain — 동시 디스패치 2건 단일 풀 탭 합류 라이브 실증, R34 L-1 결정 대체) **⑤ still-running supersession**(원인 규명 라이브 프로브: grok TUI가 지표줄을 **영구 트랜스크립트로 잔존** — R35 M-1 lock으로 **줄-앵커드** 판정(마지막 지표-포함 줄 이후 타이밍-전용 전체-매치 줄·줄 특정 실패 시 미발동), sleep 20 스모크 무유예 즉시 회수+pane 자동 close 실증(0.23.10에서 3/3 300s 소진하던 클래스)) **② `scripts/pane-inject.sh`**(병렬 트랙 `08d6091` — 5단계 원자화, FIX 2건(agent read JSON 봉투·verify settle 0.3s×3) 후 라이브 5단계 왕복 성공, **read-guard가 오너 사용-중 pane 개입을 실제 차단**). R35(claude-rev pane + fable-advisor) `pending-revision` → M-1(⑤ 오소거 최악 = 확신-완료 closePane의 진행-중 pane kill — 비앵커드 substring이면 "구현 카드 자체가 첫 위양성 후보") lock 반영 → author-close approved(no R35b). 구현 grok pane(`0ee8c50`, 450/0·+24) → **SMOKE-02311**: A(⑤③)·B(④③) 동시 + D 시리즈(①). **라이브 보정 3건(Deviations §0.23.11, 0.23.9 K 보정 동일 클래스)**: claude TUI 말미 비콘텐츠 3가족 순차 표면화 — bare `❯`(`a47aaae`)·`✻ Sautéed for 9s` 가변-동사 타이밍줄(`20972a4`, `\p{L}+`/u)·`● high · /effort` 힌트줄(`c4f5a55`) → D-4 최종 summary=실내용 마커. **이 계열 추가 가족은 개별 보정 종결 — 후속 후보 등재로 전환.** **오너 지시 신규(상비)**: claude **스모크** 카드는 sonnet 강제 — config 스왑→스모크→**원복** 절차(lessons (5), R{n} 리뷰는 Fable 유지). 브릿지 **0.23.11 재기동**(agentArgv 원복본). 보드 정리 완료. 부수: 오너 병렬 세션이 같은 리포에서 COMPETITIVE_NOTES 커밋(`e4a432f`·`754a30f`) push — 정상(무단 아님).
>
> (직전) **🎯 v0.23.10 완주 (2026-07-19 아침) — 오너 지시 → author-close → grok 구현 → 라이브 스모크 → `cf7d867`.** 워커 풀 탭 **수평(좌우) 배치**: 오너 지시("pane 배치 좌우로 해")로 `spawnWorkerAgent` 2·3번째 split down→`"right"` 통일. **경위 특이**: 직전 세션이 초안까지 갔다가 rewind로 유실 → 메모리 기록으로 복원 재작성. R{n} 불요(author-close, Low backlog — 배치 상수+문서 동기화만, wire·MCP·herdr RPC 무변경, R34 M-1 비인접). 실측 제약(재조사 금지): herdr `agent.start` **ratio 무시** — 균등 폭 불가(right-split 반감 누적: 2개 50/50·3개 25/25/50), `pane.resize` 후처리는 후속 후보. grok pane 구현(426/0·typecheck green — 1차 425/1은 워커 검증 스위트 동시 실행 경합 플레이크 판정, 단독 2회 green) → **SMOKE-02310 라이브**: 순차 2번째 워커 기존 풀 탭 합류 + `pane.layout` 실측 좌우 50/50(y=1, x=26/136) 실증 · card.done 3건 회수. **부수 관찰 2건(후속 후보)**: ① 동시 디스패치 2건이 각자 풀 탭 생성(workerPool 인메모리 경합 — 0.23.9 설계 잔존, 무침입 유지라 무해) ② `sleep`형 스모크 페이로드 3건 전부 `still_running deferral exhausted (300s)` → 비확신 경로 pane 유지(0.23.8 M-1 정합·수동 정리) — grok TUI 잔재가 지표에 계속 매치된 추정. 브릿지 **0.23.10 재기동**(pid 15267, `panePlacement:"pool"`). 커밋: `cf7d867`(feat) · `a085f24`(dist).
>
> (직전) **🎯 v0.23.9 완주 (2026-07-19 아침) — R34 게이트 → grok 구현 → 라이브 스모크(보정 1건) → `201e2db`+`5f8bf12`.** 후보 ②③⑧ 일괄 해소: **② done_proposal 규약 완결**(conv open 규약 블록 안내(마커 비-줄-선두) + 탐지 말미 비공백 K줄 line-anchored(R34 M-1 — delta-전체-선두 판정은 규약-준수 워커도 구조적 미탐지) + 타워 보드 notes 고정 문구(doing 유지·자동 close 없음)) + **③ conv.open deny 클레임 정합**(비인가 conv.open 무클레임 ignore+log 호이스트 — 카드 관례 동형, turn/close 현행) + **⑧ 워커 풀 탭 배치**(`spawnWorkerAgent`: pane.list 실사 SSOT·탭당 4·`tab.create`→root close·fail-open 폴백·opt-out `panePlacement:"legacy"` — **사전 라이브 프로브 7종**으로 herdr RPC 의미론([가정] 없음) 확정: snake_case `tab_id`/`split`·`pane_id` 타깃 무시·크로스-탭 focus 절도 실증으로 완전 2×2 기각). R34(claude-rev pane + fable-advisor 자문) `pending-revision` → M-1 lock + L-1·L-2 author-close → approved(no R34b) → grok pane 구현(**426/0**, +22) → **SMOKE-0239 라이브**: ⑧ 카드 — `loom-workers` 탭 신설·**포커스 탭 무침입**·card.done 후 pane 자동 close·**빈 풀 탭 herdr 자동 소거**(L-2 우려 자연 해소, 2회 관찰) · ② conv 1차 **미탐지 발견**(claude TUI 트레일링 3줄이 말미 3줄 창 점유) → **K 3→10 라이브 보정**(`5f8bf12`, still-running 선례 정합, Deviations §0.23.9) → 재스모크 `kind=done_proposal` + notes 고정 문구 실증. 브릿지 **0.23.9 재기동**(pid 99760, status `panePlacement:"pool"`). 커밋: `a94fd40`(draft) · `2ba5391`(R34) · `201e2db`(feat) · `5f8bf12`(fix) · `0fcd07f`(dist). **부수 관찰**: claude 상태줄 chrome(`Fable 5 ⚡high 🧠 │ …`) summary·노트 유입 2회 — 콘텐츠-포함 줄이라 미커버(후속 후보). R34 리뷰 pane·IMPL·SMOKE pane 전부 0.23.8 정책으로 자동 close(3회 실증).
>
> (직전) **🎯 v0.23.8 완주 (2026-07-19 아침) — R33 게이트 → grok 구현 → 라이브 스모크 → `93c6283`.** 후보 ⑥⑦ + chrome 미커버 2종 일괄 해소: **워커 pane 정리 정책**(지표-소거 확신 done·conv close 수신 시에만 결과 전송 성공 후 best-effort `pane.close` — 적격은 `finishCard` 명시 파라미터로만(R33 M-1, status·note 추론 금지), exhausted·failed·settle-실패 폴백은 pane 유지, opt-out `paneCleanup:"keep"`) + **`loom conv-hosts set|list|rm`**(peerId 정확 매치·선행 `-` 거부·charset `:` 제외(R33 M-2 — scp `host:path` 조립 오파싱, 포트·IPv6는 ssh alias 정문)·list 형식 위반 표식) + **chrome 2종**(`^╰─.*─╯$` 콘텐츠 box 상태줄·`⏵⏵ auto mode on`) + VERSION 0.23.8(CLI+MCP — 0.23.7 미갱신 부수 정정). R33(claude-rev pane + fable-advisor 자문) `pending-revision` → M-1·M-2 lock + L-1·L-2 → author-close approved(no R33b) → grok pane 구현(`bun test` **404/0**, +18) → **SMOKE-0238 라이브 실증**: ⑦ CLI 왕복(거부 2종·0600·no-op) · **card.done 직후 pane 자동 close**(pane list 부재·회신 무유실) · **summary chrome 소거**(grok 상태줄 오염 5회 → 해소). 브릿지 **0.23.8 재기동**(pid 61448, status에 `paneCleanup:"auto"` 표기). 커밋: `93c6283`(feat) · `36a71a8`(dist). **신규 후보 ⑧(오너 질문발, 2026-07-19)**: 브릿지 pane 배치 정책 — §1.3(탭당 4개 2×2)은 문서 관례일 뿐 스폰 시 강제 지점이 없음. herdr `agent.start`는 tab/split 지정을 지원(CLI 플래그 실재)하나 브릿지 `agentStart` 래퍼가 미전달 → 스폰 시 배치 힌트 전달로 self-enforcing 가능(additive 로컬, 후속 PATCH 후보). 이번 세션 수동 재배치 실증: 구독-중 워커 pane은 불이동 원칙 하에 임시 탭 경유 `--target-pane` split으로 2×2 구성(워커 좌측 전고·아키텍트 우상·로그 우하 — split right/down만 지원이라 §1.3 슬롯 관례와 좌우 반전은 구조적).
>
> (직전) **🎯 v0.23.7 완주 (2026-07-19 아침) — R32 게이트 → grok 구현 → 라이브 스모크 → `1160b38`.** card.done 조기 회신(직전 웨이브 2회 실증) 수정: **카드 완료 판정 still-running 유예** — 지표 감지(말미 10줄 보수 패턴) → 10s 폴링·5분 상한 → 실완료 화면 회신 + additive optional `note`. R32(claude-rev pane + fable-advisor 자문) M-1(유예 재진입 가드)·M-2(`last_seq` 절단 배제)·L-1(판정 독본 전달) lock → author-close approved(no R32b) → grok pane 구현(`bun test` 386/0) → **SMOKE-0237 라이브 실증**(브릿지 stderr `deferring completion` → `cancelled (working re-entry)` → card.done output에 실완료 마커, 미완 화면 아님). 병렬: **dist 드리프트 가드**(`eb05310` — `check:dist` + pre-push 훅, 이번 push부터 가동) · **pane 배치 규칙 §1.3**(오너 지시: 탭당 최대 4개 2×2, 초과 시 새 탭 — DOGFOOD_LOOP `79ab0f9`). 브릿지 **0.23.7 코드로 재기동 완료**(pid 28154). **신규 관찰**: 카드 summary chrome 필터 미커버 2종 — grok 상태줄(`╰─ Grok 4.5 (high)…─╯`)·claude 힌트줄(`⏵⏵ auto mode on…`) 보드 노트 유입 3회 실증(0.23.6 보수 필터의 "콘텐츠 포함 box-drawing 줄" 갭 — 후속 후보, known-hint 패턴 2종 추가면 충분).
>
> (직전) **🎯 카드 레인 웨이브 완주 (2026-07-19 아침)** — 전부 **grok pane 카드**(브릿지 0.23.6 라이브)로: ① 잔여 테스트 ③ 플레이키 해소(`fae51bc`) ② 경쟁분석 B bunx 원커맨드 설치(`5874dc3` → 번들 수정 `652a856`, **git 의존성은 workspaces 미설치** → 커밋된 `dist/loom.js` 381KB 번들로 해소, `bunx github:`·`bun install -g` **E2E 양 경로 라이브 검증**) ③ 경쟁분석 C 이미지 README(`docs/images/` mermaid 3컷 PNG + Quick start 재배치). **신규 관찰 3건 → lessons(`20a233d`)**: card.done 조기 회신 2회 실증("1 command still running" 스크레이프 — settle의 card 경로 이식 = 신규 PATCH 후보) · grok 워커 무단 커밋·push 1회(`fae51bc`, diff 무결 확인 후 유지 — brief에 금지 조항 표준화) · 카드 완료 감시는 board 폴링(자기참조) 아닌 **inbox card.done + pane 마커 이중 확인**.
>
> (직전) **v0.23.6 완주 (2026-07-19 새벽) — R31 게이트 → grok 구현 → `5bdeae7` push.** 스크레이프 delta화+chrome 필터+settle 재독 shipped. 그 전: v0.23.5 완주 + 후보 ⑩ 조사 종결(아래).
>
> ### ⚠️ v0.23.6 웨이브 잔여·관찰 (다음 세션)
> - ~~**Follow-up(Low)**: `inject-verify.test.ts` ③ 플레이키~~ → **해소(`fae51bc`, 2026-07-19)**: waitFor/waitForAsync 폴링 전환, ③ 단독 12+5연속 green·스위트 374/0.
> - **codex 자문(ADV-0236) 공회전 신규 관찰**: 검증(전체 스위트 374 pass·typecheck·lint·회귀 경로)은 완주했으나 **verdict 보고 단계에서 턴이 스텝-리셋 반복으로 영구 미완**(컨텍스트 69% 여유, 촉구 2회+Esc 인터럽트에도 재발, 총 6h+) → pane close로 부분 종결. Med finding 표면화 없음. 관찰 ⓔ(승인 고착)와 별개의 실패 모드 — codex 자문 카드에 **턴당 데드라인+부분 보고 회수** 운영 절차 필요.
> - ~~**브릿지 라이브 미배포**~~ → **해소 + delta note 라이브 관찰 완료(2026-07-19 새벽)**: 브릿지 **0.23.6 코드로 재기동** 후 conv 스모크 2회(`conv_7e7d06cef44b52f1`·`conv_540c219d25ae555b`, claude 워커 3턴)에서 delta 분기 3종 모두 라이브 실증 — turn1 첫 턴 full(무 note) / turn2 `delta anchor miss (full scrape)`(워커 스타트업 화면 재드로우로 앵커 유실 → full 폴백) / turn3 **`delta empty (no new output); delta: kept 0/2056 chars`**(앵커 적중, 중복 2,056자 전량 제거·note만 인라인 전송). applied(kept>0) 분기는 유닛 13건 커버 — 라이브는 워커가 턴 사이 신규 출력을 내는 시점 문제라 미관찰(결함 아님). 부수 관찰: conv 턴 회신이 워커 실응답 완료 전 pane 상태를 스크레이프해 돌아옴(~7–10s) — settle 타이밍 관찰 소재.
> - **relay 다운 지속** → **맥 단독(standalone) 모드 전환(2026-07-19 새벽)**: 로컬 relay `ws://127.0.0.1:7842/ws`(무토큰 loopback, durable, log `~/.loom/relay-local.log`) + 신규 로컬 룸 **`LOOM-SQSB`**(`loom-local`). 프로필 7종 조인 — **새 peer ID**: tower `p_726870658689123e`(claude-impl) / node `p_a7964227d1b25e61`(mac-node) / `p_2446562652574305`(claude-rev) / `p_adbae2d2524ae49e`(codex-impl) / `p_4e804720a846ba87`(codex-rev) / `p_dc9b8502be627724`(grok-impl) / `p_d84a46664eaacafa`(grok-rev, 신설). **프로필 `impl` → `grok-impl` 개명 완료(2026-07-19, 오너 지시)** — `~/.loom/profiles/grok-impl.json` + DOGFOOD_LOOP.md 표·dogfood-up.sh·dogfood-room-up.sh 참조 일괄 갱신(백업 디렉터리는 구명 `impl.json` 유지). `grok-rev`는 reserve로 신설 + **리뷰 독트린을 오너-구성형으로 전환(2026-07-19, 오너 지시)**: DOGFOOD_LOOP.md §1 로스터 표가 역할 배정 SSOT — 기본값은 종전대로(주 리뷰 claude-rev·적대적 codex-rev), 변경은 오너가 표의 Role 칸 수정으로 기록(모델 성능 진화·피어 추가에 대비, 주 사용 모델 추종 원칙). 별개로 브릿지 `agentArgv.grok` 워커 레인도 존재(피어와 무관한 pane 실행 경로). **codex-rev pane 레인 스모크 통과(2026-07-19)**: `herdr agent start` + `loom --profile codex-rev run codex -- -a never -s workspace-write`로 pane 구동 → loom MCP 신원(codex-review)·`check_handoffs` 인박스 왕복(claude-impl발 handoff 조회) 실증, `[CODEX-REV-SMOKE-OK] peer=codex-review inbox=1`. 테스트 handoff accept 처리·pane close로 정리 완료. (부수: herdr pane 첫 스폰 1회 즉시 소멸 — 재스폰으로 정상, 일회성 관찰.) 브릿지 allowlist·`conv-node-hosts.json`에 신규 ID 추가(구 ID 병존 유지). **구 LOOM-SGLR 프로필 백업 = `~/.loom/profiles.bak-sglr-20260719`** — Windows relay 복귀 시 복원해서 보드 북키핑(R31 card.done 미클레임) 정리.
>
> ### ✅ 후보 ⑩ 조사 종결 (2026-07-18 저녁 — 재조사 금지)
> - **워커 TUI 3종 스크레이프 상한 라이브 실측**: claude ~5.3k(0.23.1) / **grok ~2.2k** / **codex ~1.4k**(오늘 — `cat docs/PLAN.md` 147k 프로브, 소스 3종·줄수 200/500/1000 무관 포화). grok·codex TUI는 툴 출력을 접힌 블록(`◆ Run …`)으로만 렌더 — 전문이 트랜스크립트에 아예 안 펼쳐짐.
> - **결론**: (a) 워커 직접 파일 쓰기 = **§5.1로 이미 shipped·179KB 라이브 실증(0.23.3)** — 정답 경로 / (b) herdr 심층 스크롤백 = CLI 표면 부재(`pane read` 소스 visible/recent/recent-unwrapped뿐, `agent-session-path`는 에이전트 자가-보고 훅이라 기본 미보고) / (c) 32k 임계 하향 = 접힌 스크레이프 패키징이라 기각. **§5.2 32k 분기는 방어적 잔존(삭제 아님)**. ⑪(capable 워커 benign 페이로드)은 §5.2 목적으론 무의미해짐 — Sonnet/Opus 워커의 benign §5.1 작업 수행 여부만 선택적 미지로 잔존.
> - 부수 발견: **codex "Create a plan?" 오버레이가 주입 후 첫 CR을 소비** — 미제출 잔류(관찰 ⓓ 변형). 두 번째 CR로 제출됨(lessons (2) 갱신).
>
> ### ✅ 0.23.5 웨이브 마무리 기록 (이번 세션 — 재작업 금지)
> 1. **수정 카드**: `.loom-fix-0235-brief.md`(F-1 Med + F-3..F-7 Low)를 grok pane 디스패치 → 스폰 주입 레이스 재현(당시 브릿지 0.23.4) → lessons (2) 수동 복구 → `[FIX-0235-DONE] tests=361/0 typecheck=ok` + card.done 정상 회수(⑫ 신뢰 4연속) → 보드 done·pane close.
> 2. **아키텍트 독립 검증**: 수정 6건 diff 육안 확인(F-1 `isInjectProbeHit` 정규화 매치·F-3 send 직전 flight 재확인·F-4 `lastProbe` 기록·F-5/F-6/F-7 테스트 어서션·⑫ wrap-split 변형) + `bun test` 361/0 + 6패키지 typecheck green + biome 변경분 clean(경고 2건은 diff 밖 기존 CLI 코드).
> 3. **커밋 `8148642`** `fix(bridge): 주입 verify 루프 3분기 (PLAN 0.23.5, R30)` — 구현+수정 일괄 5파일 +1,142/-85.
> 4. **F-2(Med) 해소**: PLAN 0.23.5에 **Implemented as of `8148642`** 블록 + **M-1 TUI 3종 composer 가시성 라이브 검증 표** 이관 완료.
> 5. **브릿지 0.23.5 재기동** (pid 87939) — agentArgv 3종(claude/grok/codex)·allowlist(`p_ed676195eecd9488` 전체 ID)·이벤트 구독 정상 유지.
> 6. **라이브 실증 (목표 달성)**: 스모크 카드(`task_b0c9f42c`, grok)에서 스타트업 레이스 **실발화** → stderr `verify round 1: probe=miss action=reinject` → 워커 자동 복구·정상 완료(`[SMOKE-0235-OK] head=8148642`) → card.done 정상 회수. **후보 ⑨의 "주입 유실 자동 복구"가 첫 실전 기회에서 그대로 작동 — 수동 복구 불필요.**
>
> ### 이전 세션 R30 웨이브 기록 (2026-07-18 저녁)
> - PLAN 0.23.5 draft(`6036345`) → **R30 리뷰**(claude pane + fable-advisor 자문): `pending-revision` M-1(플레이스홀더=probe-hit + TUI 3종 라이브 검증 요구)·M-2(재주입 상한 "flight당"→**주입 시도당 1회**) + L-1..L-3 → author-close `approved`(`cf02728`).
> - 구현: grok pane 카드 → `[IMPL-0235-DONE] tests=361/0` · codex pane 자문 REJECT 7건(F-1..F-7) 회수(관찰 ⓔ 재재현 — `agent_blocked` 회신이지만 실작업 완료, 보드 수동 done).
> - M-1 라이브 검증 표·자문 findings 상세는 이제 **PLAN 0.23.5 Implemented 섹션이 SSOT** (이 파일에서 이관 완료).
>
> ### (참고) 직전 완료: v0.23.4 (후보 ⑫) + 0.23.3 실물 스모크  
> 체인(당일 6연속): … 0.23.3 `95cc81e` → **후보 ⑫ root cause 확정**(codex pane 조사) → PLAN 0.23.4 R29 `pending-revision`(M-1: `eventsSubscribe` reject-시-롤백 lock — 신설 fail-visible 경로의 자기 재감염 + L-1..L-5) → author-close `approved`(`b8eb452`) → **전 레인 herdr pane**(오너 지시): grok pane 구현 → codex pane 자문 REJECT 5건(pane close 누락·stderr profile 미검증·테스트 ④⑩ 실장애 미재현·superseded 타이머 누수+⑭ fake-timer 무효·⑧ 정리 미실증) → grok pane 수정 → `c7df503`.
>
> ### ✅ 후보 ⑫ 해소 (2026-07-18, 0.23.4) — 라이브 검증 3종 완료
> `eventsPrune`(flight 종료 시 구독 정리) + M-1 롤백 + pre-ACK reject/ACK 타임아웃 + `pane.closed` 글로벌 1회(기동 fail-fast) + fail-visible(`events_subscribe_failed`) + 관측성(`bridge status`에 `eventConnected`/`lastSubscribeAck`/`eventSubscriptions` · stderr `loomDir()/bridge/<profile>.stderr.log` 0600). **라이브 증거**: ① 동일 브릿지 2번째 카드 구독 성립·card.done 정상 도착(수정 전 2회 연속 유실 시나리오 그대로 통과) ② flight 종료 후 `eventSubscriptions` 글로벌만으로 복귀 ③ L-3 프로브 — herdr는 established 스트림을 강제 종료하지 않음(prune-without-reopen 전제 실증). **워크어라운드 해제: 새 카드 전 브릿지 재시작 불필요. 카드 결과 인박스(card.done) 신뢰 회복.** pane 마커 감시는 이중 방어로 유지 권장.
>
> ### ✅ 0.23.3 실물 스모크 완료 (2026-07-18 저녁) — §5.1 마커 경로 라이브 실증
> `conv_50f5fa521d5d9687` (tower=claude-impl → mac-node, 워커 claude/Fable, benign 페이로드 "docs/PLAN.md 전문 artifact 전달"):
> - **규약 프롬프트·env**: 브릿지가 실측 경로(`~/.loom/artifacts/<convId>`) 삽입된 §5.1 규약 블록 주입 확인(R28 L-2). 워커는 untrusted 마커를 보고 로컬 근거 확인 후 자율 수행 — **benign 페이로드는 capable 모델 거부 없음(후보 ⑪ 설계 실증)**.
> - **마커 소비**: `[ARTIFACT] plan-full.md` → artifacts[] ref 방출 — 틸드-리터럴 path·sha256 **로컬 파일과 정확 일치**·chars=147,258(UTF-8 코드포인트; 바이트 178,996)·gist. inline text = pane 스크레이프+notice(파일 tail 아님). 파일은 원본 docs/PLAN.md와 **바이트 동일**, 디렉터리 0700. §5.1 "절단 금지"가 32k 초과 실물(179KB)에서 성립.
> - **M-2 양 분기**: 매핑 부재 시 `artifactCommands ok=false "no local conv→node mapping"`(fail-closed) → `~/.loom/conv-node-hosts.json`에 `{p_ae186d3ee88d1037: kyoungsiklee@localhost}` 등록 후 2번째 턴에서 `ok=true` POSIX-quoted scp 명령 제시(로컬 매핑 기반, wire host 미사용, untrusted note 포함). **매핑은 등록 유지**(후보 ⑦ CLI 선행 상태).
> - **dedup(R28 L-1)**: 2번째 턴 스크레이프 창에 이전 `[ARTIFACT] plan-full.md` 잔존했으나 재방출 없음 — 신규 `smoke-note.txt` ref 1건만 방출(sha 일치 확인).
> - **부수 재확인**: 스폰 주입 1발 성공(이번엔 ⑨ 레이스 미발생 — 간헐 재확인), conv 2턴 왕복 동일 브릿지 정상(⑫ 회귀 무), close 후 `eventSubscriptions` 글로벌만 복귀·inFlight=0, 보드 task done 자동 전이. 워커 pane 수동 close(후보 ⑥ 미구현 관례).
>
> ### 다음 액션 (우선순위 순)
> 0. ~~**⭐ 잔여 후보 일괄 적용 웨이브 (오너 지시)**~~ → **전부 완주(2026-07-19 오전, v0.23.11 — 위 Current action 참조)**. ①③④⑤ = `0ee8c50`+보정 3건, ② = `08d6091`.
> 0-a. **npm publish 보류 (오너 결정 2026-07-19: "계정이 없어 일단 보류 해")** — 진행분(재조사 금지): `loom` 선점·`loom-cli` npm 보안 홀드 확정 / **가용 = `loom-terminal`(무조건) · `@lemonbalms/loom`(계정·org가 lemonbalms일 때만)** / 오너 선택(보류 전) = `@lemonbalms/loom` + **UNLICENSED** / 타르볼 형태 검증 완료(dry-run 3파일 87.5kB — package.json + `dist/loom.js`(bun shebang, bunx 실행 전제) + README.md 자동 포함, 루트 devDependencies 미포함). **재개 절차**: ① 오너 npmjs.com 가입(계정명이 lemonbalms 아니면 org 생성 또는 `loom-terminal` 전환) → ② `! npm login` → ③ package.json 발행 메타 재적용(name·version 0.23.x 정합·license UNLICENSED·private 해제·`files:["dist/loom.js"]`·`publishConfig.access:public`·repository·engines.bun) → ④ `npm publish` → ⑤ `npm view`·`bunx` 검증 → ⑥ package.json은 발행 직후에도 **`private: true` 복원 여부 오너 확인**(현재는 원복해 가드 유지). |
> 0-b. **잔여 후속 후보(Low)**: claude TUI 말미 비콘텐츠 줄 **추가 가족** 표면화 시 개별 보정 대신 여기 등재(보정 3까지로 종결 — Deviations §0.23.11 누적 원칙) · summary 말미 TUI 타임스탬프(`10:50 AM`) 잔존(cosmetic) · 풀 pane 균등 폭 `pane.resize` 후처리(0.23.10 잔존).
> 1. **잔여 PATCH 후보**: ~~② done_proposal 탐지 규약~~·~~③ conv.open deny 클레임 순서~~·~~⑧ 브릿지 pane 배치 정책~~ → **전부 해소(0.23.9 `201e2db`+`5f8bf12`, 2026-07-19)**. ~~⑥ close 시 pane 정리 정책~~·~~⑦ conv-hosts CLI~~ → **해소(0.23.8 `93c6283`)**. ~~④ agentKind 확장~~ → **이미 0.23.2 `91bee75`(R27)로 해소된 스테일 항목이었음(2026-07-19 확인 — enum 3종+`agentArgv` fail-closed 기구현, 0.23.9 핸드오프 재작성 때 오등재)**. 잔존: **신규 후속: claude 상태줄 chrome**(`Fable 5 ⚡high 🧠 │ …` — summary·보드 노트 유입 2회 실증, 콘텐츠-포함 줄이라 0.23.8 필터 미커버 — grok 상태줄 해소 선례 동형) · summary 정보성 타이밍줄("Worked for Ns.") 개선 여지(Low) · **0.23.10 신규 관찰 2건**: 동시 디스패치 풀 탭 레이스(workerPool 인메모리 경합 — 무침입 유지라 무해·Low) · sleep형 페이로드 still-running 유예 상한 소진(pane 수동 정리 필요 — 스모크 페이로드 특이·Low). (⑩ 조사 종결·⑪ 선택적 잔존 — 위 참조.)
> 1-b. **신규 후보**: ~~settle card 경로 이식(조기 card.done)~~ → **해소(0.23.7 `1160b38`)** · ~~dist 드리프트 가드~~ → **완료(`eb05310`)** · ~~카드 summary chrome 미커버 2종~~ → **해소(0.23.8 — grok 상태줄·claude 힌트줄, 라이브 소거 실증)**. 잔여: conv 턴 조기 회신(~7–10s) 관찰 지속 · summary가 정보성 타이밍줄("Worked for Ns.")로 잡히는 개선 여지(Low, 결함 아님).
> 2-b. **경쟁 분석발 후보 (2026-07-19, `docs/COMPETITIVE_NOTES.md` §1.3)**: ~~B bunx 온보딩~~·~~C 이미지 README~~ → **완료(2026-07-19 카드 웨이브)**. 잔여: A `scripts/pane-inject.sh`(수동 pane 레인 read-guard 원자화, R-gate 불요) · npm publish는 오너 결정.
> 3. **관찰 ⓔ (Low)**: codex pane 카드는 승인 프롬프트 대기 중 herdr가 `blocked`를 방출 → 브릿지가 `failed reason=agent_blocked`를 회신하지만 **작업 자체는 승인 후 완료**됨(0.23.4·0.23.5 자문 카드 2회 실증). codex 무인 운용은 오퍼레이터 argv 자율 플래그 결정 선행(lessons (5)).
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
> - 워커 pane 정리는 **card.done 수신 후** (조기 close 시 브릿지 스크레이프 회신 유실 — R25에서 실증). → **0.23.8부터 확신-done·conv close는 브릿지가 자동 close**(`paneCleanup:"auto"`) — 수동 정리는 failed·exhausted·구-브릿지 카드 pane만.
> - `bun test`는 셸에 `LOOM_RELAY_TOKEN`/`LOOM_RELAY_URL`이 있으면 relay 테스트가 깨짐 — `env -u LOOM_RELAY_TOKEN -u LOOM_RELAY_URL bun test`.
>
> ### 하지 말 것
> - R25 결정·CONV_SPEC 재론 — plan_review R24·R25 본문이 SSOT
> - artifact 패키징 등 후속 PATCH를 리뷰 게이트 없이 착수 (M-lock 인접이면 R{n} 필요 여부 WORKFLOW §5.1 확인)

---

## One-line resume

> **v0.23.11 완주 (2026-07-19 오전).** 잔여 후보 ①③④⑤ 일괄(오너 지시) + ② 병렬 — ⑤ 원인 규명 라이브 프로브(grok TUI 지표줄 영구 잔존) → PLAN 초안 → **R35 게이트**(claude-rev pane + fable-advisor, M-1 ⑤ 줄-앵커드 lock) → author-close approved → grok pane 구현(`0ee8c50`, **450/0**) → **SMOKE-02311 라이브**(④ 동시 2건 단일 풀 탭 · ⑤ sleep 무유예 회수+pane 자동 close · ③① summary 실내용 마커) + 라이브 보정 3건(claude 말미 비콘텐츠 3가족 — bare `❯`·`✻` 타이밍줄·`/effort` 힌트줄, D-4 최종 실증). ② pane-inject.sh(`08d6091`) — read-guard 오너-사용-중 pane 차단 실증. **오너 지시 상비 2건**: claude 스모크 카드 sonnet 강제(config 스왑→원복, lessons (5)) · 잔여 = npm publish(오너 결정)·후속 Low 3건(다음 액션 0-b). 브릿지 0.23.11 재기동(agentArgv 원복본). 보드 정리 완료.
>
> (직전) **v0.23.10 완주 (2026-07-19 아침).** 워커 풀 탭 수평(좌우) 배치 — 오너 지시 → author-close(Low backlog, R{n} 불요) → grok pane 구현(`cf7d867`, 426/0) → **SMOKE-02310 라이브**(순차 스폰 풀 탭 합류·`pane.layout` 좌우 50/50 실측). 브릿지 0.23.10 재기동(pid 15267). dist `a085f24`. 신규 관찰: 동시 디스패치 풀 탭 레이스(무해) · sleep형 페이로드 유예 상한 소진. **다음 세션 = 잔여 후보 5건 일괄 적용 웨이브(오너 지시 — 다음 액션 0번 참조: 상태줄 필터·pane-inject.sh·타이밍줄·풀 탭 레이스·still-running 잔존, PLAN 0.23.11 → §5.1 게이트 판단)**. npm publish는 별도 오너 결정 잔존 (④ agentKind 확장은 0.23.2 기해소 스테일로 판명·목록 제거).
>
> (직전) **v0.23.9 완주 (2026-07-19 아침).** 후보 ②③⑧ 일괄 해소 — R34 게이트(claude-rev pane + fable-advisor, M-1 탐지 말미-K줄 lock + L-1·L-2) → grok pane 구현(`201e2db`, 426/0) → **SMOKE-0239 라이브**(⑧ 풀 탭 무침입 배치·② 1차 미탐지 → K 3→10 보정 `5f8bf12` → done_proposal 라이브 탐지·pane/빈-탭 자동 정리). 브릿지 0.23.9 재기동(pid 99760). dist `0fcd07f`. 잔여 PATCH 후보 = ④(agentKind 확장, 선택) · 신규: claude 상태줄 chrome 미커버. 다음 = 경쟁분석 A · npm publish(오너).
>
> (직전) **v0.23.8 완주 (2026-07-19 아침).** 후보 ⑥⑦+chrome 2종 일괄 해소 — R33 게이트(claude-rev pane + fable-advisor, M-1 close 적격 명시 파라미터·M-2 charset `:` 제거 lock + L-1·L-2) → grok pane 구현(`93c6283`, 404/0) → **SMOKE-0238 라이브 실증**(card.done 직후 pane 자동 close·summary chrome 소거·⑦ CLI 왕복). 브릿지 0.23.8 재기동(pid 61448). dist 번들 `36a71a8`. 신규 후보 ⑧ = 브릿지 pane 배치 정책(§1.3 self-enforcing). 다음 = 후보 ②③⑧ · 경쟁분석 A · npm publish(오너).
>
> (직전) **v0.23.7 완주 (2026-07-19 아침).** card.done 조기 회신 수정 — R32 게이트(claude-rev pane + fable-advisor, M-1·M-2 lock + L-1) → grok pane 구현(`1160b38`, 386/0) → **SMOKE-0237 라이브 실증**(유예 발화 → working 재전이 → 실완료본 회신). 병렬: dist 드리프트 가드(`eb05310`, pre-push 훅 가동) · pane 배치 규칙 §1.3(`79ab0f9`, 탭당 최대 4개 2×2). 브릿지 0.23.7 재기동(pid 28154). 다음 = 후보 ②③⑥⑦ · summary chrome 미커버 2종(Low) · 경쟁분석 A · npm publish(오너).
>
> (직전) **카드 레인 웨이브 완주 (2026-07-19 아침).** 잔여① 테스트③ 플레이키 해소(`fae51bc`) + 경쟁분석 B(bunx 원커맨드 설치 — git 의존성 workspaces 미설치 발견 → 커밋 번들 `dist/loom.js`로 해소, `5874dc3`+`652a856`, E2E 양 경로 검증) + C(이미지 README — `docs/images/` mermaid 3컷 PNG + Quick start 재배치) 전부 **grok pane 카드**로 완주. lessons 3건(`20a233d`): inbox가 완료 신호(보드 폴링 자기참조)·card.done 조기 회신 2회(settle card 경로 이식 후보)·워커 무단 ship(brief 금지 조항 표준화). 다음 = 후보 ②③⑥⑦ · settle card 이식 · dist 드리프트 가드 · 경쟁분석 A(pane-inject.sh) · npm publish 오너 결정.
>
> (직전) **v0.23.6 완주 상태로 세션 종료 (2026-07-19 새벽).** 체인: … → R30/0.23.5 완주(`8148642`) → 후보 ⑩ 조사 종결 → **R31/0.23.6 완주**(delta화+chrome 필터+settle — M-1 카드 output 무필터·M-2 인덱스 맵 lock, 구현 `5bdeae7`, bun test 374/0). R31·구현·자문 전부 **수동 pane 레인**(relay 다운). 자문은 공회전으로 부분 종결(Med 없음). **다음 세션 = ⭐ 잔여 3건**(테스트 ③ 플레이키 수정 카드 · 브릿지 0.23.6 재기동+delta note 라이브 관찰 · relay 복귀 시 보드 정리). **맥 단독 모드 전환 + 잔여 2번 해소(2026-07-19)**: 로컬 relay(127.0.0.1:7842)+로컬 룸 `LOOM-SQSB`(피어 7종, `impl`→`grok-impl` 개명·`grok-rev` 신설)+브릿지 **0.23.6 코드** 온라인, conv 스모크로 **`delta: kept N/M chars` note 라이브 관찰 완료**(miss/empty 분기 실증). 구 `LOOM-SGLR` 프로필은 `~/.loom/profiles.bak-sglr-20260719` 백업(relay 복귀 시 복원). mac-node agentArgv 3종·conv-node-hosts 매핑 유지(신규 ID 추가). 잔여 = 테스트 ③ 플레이키 수정 카드 · relay 복귀 시 보드 정리.

---

## Where we are

| Item | Value |
|------|--------|
| **CLI / code** | **0.23.11** — claude 상태줄 chrome 필터·summary 실내용 선별·스폰 직렬화·still-running supersession(줄-앵커드) + pane-inject.sh + 워커 풀 탭 수평 배치(0.23.10) + done_proposal 규약 완결·conv.open deny 정합·풀 탭 배치(0.23.9) + pane 정리 정책·conv-hosts CLI(0.23.8) + still-running 유예(0.23.7) + 스크레이프 delta화·chrome 필터(0.23.6) + 주입 verify 3분기(0.23.5) + conv 멀티턴 + artifact 트리거 + agentKind 3종 |
| **PLAN** | **v0.23.11** `approved` (R35 author-close) → **implemented** (`0ee8c50` + 보정 `a47aaae`·`20972a4`·`c4f5a55`) |
| **Open blocking** | none — R24–R35 모두 closed · GitHub Issues 전부 closed |
| **Tests** | `bun test` **450 pass / 0 fail** · 6 pkg typecheck green |
| **Herdr design** | `docs/HERDR_DESIGN.md` · **Conv spec: `docs/CONV_SPEC.md`** |
| **Remote** | `origin/main` **`cc23c3d`** (스펙 커밋) · 시연 `docs/spikes/DISPATCH-DEMO.md` |
| **Untracked (커밋 제외)** | `.playwright-mcp/` · `docs/agents/` (mattpocock-skills 셋업분) · `docs/ANALYSIS_NOTES_2026-07-19.md` (오너 병렬 세션 작업 파일) — 커밋 여부 오너 판단 |

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
