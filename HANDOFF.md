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

> **🎯 v0.23.6 완주 (2026-07-19 새벽) — R31 게이트(pending-revision→author-close approved) → grok 구현 → 커밋 `5bdeae7` push.** 스크레이프 delta화+chrome 필터+settle 재독 shipped. 직전: v0.23.5 완주 + 후보 ⑩ 조사 종결(아래).
>
> ### ⚠️ v0.23.6 웨이브 잔여·관찰 (다음 세션)
> - **Follow-up(Low)**: `inject-verify.test.ts` ③ — card 결과 수신 직후 `pane.close` 즉시 어서션 레이스(~1/3 플레이키, 0.23.5 잠재 테스트측 결함). waitFor 대기로 수정 카드 1건.
> - **codex 자문(ADV-0236) 공회전 신규 관찰**: 검증(전체 스위트 374 pass·typecheck·lint·회귀 경로)은 완주했으나 **verdict 보고 단계에서 턴이 스텝-리셋 반복으로 영구 미완**(컨텍스트 69% 여유, 촉구 2회+Esc 인터럽트에도 재발, 총 6h+) → pane close로 부분 종결. Med finding 표면화 없음. 관찰 ⓔ(승인 고착)와 별개의 실패 모드 — codex 자문 카드에 **턴당 데드라인+부분 보고 회수** 운영 절차 필요.
> - ~~**브릿지 라이브 미배포**~~ → **해소 + delta note 라이브 관찰 완료(2026-07-19 새벽)**: 브릿지 **0.23.6 코드로 재기동** 후 conv 스모크 2회(`conv_7e7d06cef44b52f1`·`conv_540c219d25ae555b`, claude 워커 3턴)에서 delta 분기 3종 모두 라이브 실증 — turn1 첫 턴 full(무 note) / turn2 `delta anchor miss (full scrape)`(워커 스타트업 화면 재드로우로 앵커 유실 → full 폴백) / turn3 **`delta empty (no new output); delta: kept 0/2056 chars`**(앵커 적중, 중복 2,056자 전량 제거·note만 인라인 전송). applied(kept>0) 분기는 유닛 13건 커버 — 라이브는 워커가 턴 사이 신규 출력을 내는 시점 문제라 미관찰(결함 아님). 부수 관찰: conv 턴 회신이 워커 실응답 완료 전 pane 상태를 스크레이프해 돌아옴(~7–10s) — settle 타이밍 관찰 소재.
> - **relay 다운 지속** → **맥 단독(standalone) 모드 전환(2026-07-19 새벽)**: 로컬 relay `ws://127.0.0.1:7842/ws`(무토큰 loopback, durable, log `~/.loom/relay-local.log`) + 신규 로컬 룸 **`LOOM-SQSB`**(`loom-local`). 프로필 7종 조인 — **새 peer ID**: tower `p_726870658689123e`(claude-impl) / node `p_a7964227d1b25e61`(mac-node) / `p_2446562652574305`(claude-rev) / `p_adbae2d2524ae49e`(codex-impl) / `p_4e804720a846ba87`(codex-rev) / `p_dc9b8502be627724`(grok-impl) / `p_d84a46664eaacafa`(grok-rev, 신설). **프로필 `impl` → `grok-impl` 개명 완료(2026-07-19, 오너 지시)** — `~/.loom/profiles/grok-impl.json` + DOGFOOD_LOOP.md 표·dogfood-up.sh·dogfood-room-up.sh 참조 일괄 갱신(백업 디렉터리는 구명 `impl.json` 유지). `grok-rev`는 reserve로 신설 + **리뷰 독트린을 오너-구성형으로 전환(2026-07-19, 오너 지시)**: DOGFOOD_LOOP.md §1 로스터 표가 역할 배정 SSOT — 기본값은 종전대로(주 리뷰 claude-rev·적대적 codex-rev), 변경은 오너가 표의 Role 칸 수정으로 기록(모델 성능 진화·피어 추가에 대비, 주 사용 모델 추종 원칙). 별개로 브릿지 `agentArgv.grok` 워커 레인도 존재(피어와 무관한 pane 실행 경로). 브릿지 allowlist·`conv-node-hosts.json`에 신규 ID 추가(구 ID 병존 유지). **구 LOOM-SGLR 프로필 백업 = `~/.loom/profiles.bak-sglr-20260719`** — Windows relay 복귀 시 복원해서 보드 북키핑(R31 card.done 미클레임) 정리.
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
> 1. **v0.23.6 웨이브 진행 중**: PLAN draft(후보 ⑤ — delta화+chrome 필터+settle 재독) → **R31 리뷰 카드(claude pane) 디스패치** → author-close → grok 구현 카드 → codex 자문 카드 → 검증·커밋.
> 2. **잔여 PATCH 후보**: ② done_proposal 탐지 규약 ③ conv.open deny 클레임 순서 ⑥ close 시 pane 정리 정책(관찰 ⓑ) ⑦ `loom conv-hosts set` CLI(매핑 파일은 스모크에서 수동 등록됨). (⑩ 조사 종결·⑪ 선택적 잔존 — 위 참조.)
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
> - 워커 pane 정리는 **card.done 수신 후** (조기 close 시 브릿지 스크레이프 회신 유실 — R25에서 실증).
> - `bun test`는 셸에 `LOOM_RELAY_TOKEN`/`LOOM_RELAY_URL`이 있으면 relay 테스트가 깨짐 — `env -u LOOM_RELAY_TOKEN -u LOOM_RELAY_URL bun test`.
>
> ### 하지 말 것
> - R25 결정·CONV_SPEC 재론 — plan_review R24·R25 본문이 SSOT
> - artifact 패키징 등 후속 PATCH를 리뷰 게이트 없이 착수 (M-lock 인접이면 R{n} 필요 여부 WORKFLOW §5.1 확인)

---

## One-line resume

> **v0.23.6 완주 상태로 세션 종료 (2026-07-19 새벽).** 체인: … → R30/0.23.5 완주(`8148642`) → 후보 ⑩ 조사 종결 → **R31/0.23.6 완주**(delta화+chrome 필터+settle — M-1 카드 output 무필터·M-2 인덱스 맵 lock, 구현 `5bdeae7`, bun test 374/0). R31·구현·자문 전부 **수동 pane 레인**(relay 다운). 자문은 공회전으로 부분 종결(Med 없음). **다음 세션 = ⭐ 잔여 3건**(테스트 ③ 플레이키 수정 카드 · 브릿지 0.23.6 재기동+delta note 라이브 관찰 · relay 복귀 시 보드 정리). **맥 단독 모드 전환 + 잔여 2번 해소(2026-07-19)**: 로컬 relay(127.0.0.1:7842)+로컬 룸 `LOOM-SQSB`(피어 7종, `impl`→`grok-impl` 개명·`grok-rev` 신설)+브릿지 **0.23.6 코드** 온라인, conv 스모크로 **`delta: kept N/M chars` note 라이브 관찰 완료**(miss/empty 분기 실증). 구 `LOOM-SGLR` 프로필은 `~/.loom/profiles.bak-sglr-20260719` 백업(relay 복귀 시 복원). mac-node agentArgv 3종·conv-node-hosts 매핑 유지(신규 ID 추가). 잔여 = 테스트 ③ 플레이키 수정 카드 · relay 복귀 시 보드 정리.

---

## Where we are

| Item | Value |
|------|--------|
| **CLI / code** | **0.23.5** — 주입 verify 루프 3분기(⑨+ⓓ, 라이브 자동복구 실증) + conv 멀티턴 + artifact 트리거 + agentKind 3종 + 이벤트 구독 수명주기(⑫) |
| **PLAN** | **v0.23.5** `approved` (R30 author-close) → **implemented** (`8148642`) |
| **Open blocking** | none — R24–R30 모두 closed · GitHub Issues 전부 closed |
| **Tests** | `bun test` **361 pass / 0 fail** · 6 pkg typecheck green |
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
