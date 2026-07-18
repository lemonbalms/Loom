# Plan Review — Loom

> **버전 관리:** 계획 SSOT는 `docs/PLAN.md`이다. 리뷰는 반드시 **대상 Plan version**을 헤더에 적는다.  
> **최신:** **R31** PLAN **v0.23.6**(워커 pane 스크레이프 delta화 + TUI chrome 필터 — 후보 ⑤+관찰 ⓐⓒ, PATCH) **`pending-revision` → author-close `approved`**(2026-07-18, M-1·M-2 문안 lock + L-1..L-5 author-close + 테스트 ④ 보강·⑩⑪ 신설, no R31b) — 갭 실재(스크레이프 상한 실측 claude ~5.3k/grok ~2.2k/codex ~1.4k + 이전 턴 누적·summary chrome 오염 실증)·delta fail-open 폴백·보수 필터 총론·artifact 마커 pre-filter 원문 스캔·앵커 send-성공-후 갱신 전부 타당. M-1(chrome 필터 substring 매치를 **카드 결과 output 본문**에 적용 — 카드 lane은 artifact 복구 경로 부재(§5.5 out of scope)라 손실 비가역인데 Security 최악-결과 주장("artifact로 복구 가능")이 conv 전제·이 dogfood 레포 자체가 키-힌트 문자열을 본문 인용) + M-2(delta 슬라이스 "0.23.5 프로브와 동일 기법" 지칭 오류 — 프로브는 존재-검사 boolean(`.includes`)뿐, delta는 **위치**가 필요: 정규화 오프셋→원문 오프셋 인덱스 맵 없이는 공백-파괴 슬라이스 또는 re-wrap에 깨지는 라인 매치가 스펙 준수의 결과물) **문안 lock 2건** + L-1..L-5. 직전: R30 v0.23.5 author-close `approved` → implemented `8148642`.
> **직전:** **R30** PLAN **v0.23.5**(브릿지 주입 verify 루프 3분기 확장 — 후보 ⑨+관찰 ⓓ, PATCH) **`pending-revision` → author-close `approved`**(2026-07-18, M-1(플레이스홀더=probe-hit + TUI 3종 라이브 검증)·M-2(재주입 상한 주입 시도당 1회) lock + L-1..L-3 + 테스트 ⑫⑬, no R30b) → **implemented `8148642`**(codex 자문 F-1..F-7 반영 + M-1 라이브 검증 표 + 라이브 스모크 재주입 복구 실증). 직전: R29 v0.23.4 author-close `approved` → implemented `c7df503`.  
> **규칙:** PLAN `Status=approved`는 **Fable 5 R{n} 사인오프 후**가 원칙. Low author-close 시 출처 명시. **언제 R{n} 필수?** → [`WORKFLOW.md` §5.0–5.1](./WORKFLOW.md).  
> **이름:** 제품 = **Loom** (`loom`, `@loom/*`); 검토자 **Fable 5** / fable-advisor = 에이전트, not product.  
> **아카이브:** R1–R11 전문 → [`docs/plan_review_archive.md`](./plan_review_archive.md)  
> **스냅샷:** 닫힌 R{n} 본문의 줄 번호·패키지명은 **검토 당시** 기준. 현재 코드는 follow-up 표 + PLAN을 볼 것.

---

## Active review

| Review | Plan | Status | Gate |
|--------|------|--------|------|
| **R31** | **v0.23.6** | **closed (pending-revision → author-close approved 2026-07-18)** | **워커 pane 스크레이프 delta화 + TUI chrome 필터 (후보 ⑤ + 관찰 ⓐⓒ)** (PATCH) — `stripTuiChrome`(box-drawing·키 힌트 보수 필터) + conv 턴 delta 앵커(꼬리 ≤3줄 공백-정규화, fail-open 폴백) + settle 재독 + summary 정합. 갭 실재(상한 실측·오염 실증)·총론 타당. M-1: 카드 output 본문 필터 = artifact 복구 경로 없는 lane의 비가역 손실 + Security 주장 conv 전제 → 카드 output 본문 필터 제외(summary 입력만) lock. M-2: delta 슬라이스는 위치 필요 — 정규화↔원문 오프셋 인덱스 맵 명시 lock("프로브 동일 기법" 인용은 존재-검사 boolean이라 부적합). |
| **R30** | **v0.23.5** | **closed (pending-revision → author-close approved 2026-07-18)** | **브릿지 주입 verify 루프 3분기 확장 (후보 ⑨ + 관찰 ⓓ — 주입 유실·미제출 잔류 fail-visible 복구)** (PATCH) — 프로브(공백 정규화 꼬리 48자) 기반 (a) 재주입 1회 (b) CR 재전송 (c) fail-visible. 갭 실재·설계 총론·보안(동일 캐시 문자열 재주입) 타당. M-1: Claude Ink composer paste-플레이스홀더로 프로브 (b) 분기 구조적 도달 불가 + 비어 있지 않은 composer 이중 append → 플레이스홀더=hit 판정 + TUI별 composer 가시성 라이브 검증 lock. M-2: 재주입 상한 "flight당"이 conv 멀티턴 flight에서 1턴 소진 → "verify 호출당 1회"로 lock. |
| **R29** | **v0.23.4** | **closed (pending-revision → author-close approved 2026-07-18)** | **HerdrClient 이벤트 구독 수명주기 수정 (후보 ⑫ — card.done 유실 / "스타트업 레이스" 실체)** (PATCH) — 구독 prune + pre-ACK reject/ACK 타임아웃 + `pane.closed` 글로벌 1회 + fail-visible + 관측성. root cause·라인 참조 전수 실증, 설계 건전. M-1: `eventsSubscribe` 선-push(`:279-285`) + reject 롤백 부재 → 신설 실패 경로가 pane 닫고 구독 잔존 = 자기 재감염(이후 dispatch 연쇄 실패) → reject-시-롤백 문안 lock 반영 + L-1..L-5 author-close. |
| **R28** | **v0.23.3** | **closed (pending-revision → author-close approved 2026-07-18)** | **conv 워커 산출물 파일-기반 artifact 트리거 (§5.1 자가 적용 규약)** (PATCH) — 워커 직접 파일 쓰기 + `[ARTIFACT] <파일명>` 마커 → 브릿지 4계층 검증 후 기존 방출 경로로 ref. 갭 실재(TUI ~5.3k 실측)·스펙 정렬·소비부 무변경 확인. M-1: 방출 경로 "재사용" 문안이 `packageConvTurnArtifact` 실계약과 모순(다건 마커 클로버·inline text 대체·파일명 불일치 + `turn-*` 네임스페이스 충돌 미규정) → 문안 lock. |
| **R27** | **v0.23.2** | **closed (approved 즉시 승인 2026-07-18)** | **dispatch/conv agentKind allowlist 확장 (codex·grok)** (PATCH) — 공용 enum 1→3종, 실행 게이트는 브릿지 로컬 `agentArgv` 명시 등록(기본 미등록 = 0.23.1 동일 fail-closed)·wire argv 금지(§4.4.2) 유지. M-lock 없음(보수 결정이 본문 기명문 + 원시 기존재). L-1(`agentArgv` 형상 필터)·L-2(등록 고지) author-close → 구현 PATCH 포함. |
| **R26** | **v0.23.1** | **closed (pending-revision → author-close approved 2026-07-18)** | **§5.2 artifact 패키징 호출부** (PATCH) — 브릿지 truncate 폴백 제거→scp 규약 패키징(전문 보존) + 타워 M-2 검증 통과 fetch 명령 **제시**(자동 실행 없음). 갭 실재·§5 이전 충실·스코프(자동 git push 유예 포함) 확인. 단 scp host 해석 출처가 "로컬 conv state"로 옮겨져 §5.3③ "수신측 로컬 설정" 왜곡(M-1) + 셸 복붙이 예정된 제시 문자열 표면의 안전 규약 미규정(M-2) → PLAN 문안 lock 2건 + L-1·L-2 author-close 완료. |
| **R25** | **v0.23.0** | **closed (approved → implemented `e4dab9e` 2026-07-18)** | **conv 멀티턴 수직 슬라이스** — approved CONV_SPEC(R24)의 구현 PLAN. 스펙 이전 충실·스코프 minimal-but-sufficient·왜곡 없음. 단 R24 M-1 "양측 pin"의 **브릿지 측 집행 서술 공백**(M-1) + **미지 convId fail-closed 기본값 미고정**(M-2) → PLAN 문안 lock 2건 + L-1..L-4 author-close. |
| **R24** | **CONV_SPEC v1 (스펙 문서, PLAN 버전 아님)** | **closed (pending-revision → author-close approved 2026-07-18)** | **크로스머신 CLI 멀티턴 대화 1단계 스펙** — 티켓 #2·#5·#6·#7·#8·#9 결정 통합 충실·relay 무변경 원칙 일관. 단 선언된 M-4 경계가 신규 표면 2곳에 미적용: **M-1 conv↔peer pin**(타워 측 턴 발신자 바인딩) + **M-2 artifact ref 검증 규약**(fetch 명령 기계 조립 방어). L-1..L-5 author-close. 구현 PLAN은 locks 반영 스펙 기준. |
| **R23** | **v0.22.0** | **closed (approved → implemented 2026-07-17)** | **Loom×Herdr 노드 브릿지** (`loom bridge` 수직 슬라이스) — 새 데몬 표면 + MCP `dispatch_card`/`apply_card_result` + 원격 프롬프트 주입 신뢰 경계. M-1/M-2 locks 충족(코드+테스트). L-1..L-3 author-close. 와이어 무변경. FREEZE 예외=오너 pull. |
| **R22** | **v0.21.0→0.21.1** | **closed (approved → implemented `d05d714`)** | **PTY handoff inject** — Claude-first · opt-in · accept-gated · **no-auto-submit paste**. M-1…M-6 locks. Fable 5 사전 승인(no R22b). codex-impl 구현 → 아키텍트 독립 검증(bun test 190/0, M-1..M-6 코드 확인). 와이어 변경 없음. FREEZE 예외=오너 pull. |
| **R21** | **v0.20.0** | **closed (approved→shipped `c15de88`)** | Tier A3 `loom doctor` (read-only 진단) — no wire change. All binding M-1..M-4 met (architect-verified: bun test 180/0, live run exit 0), L-1..L-3 author-closed. Implemented via codex-impl lane. |
| R20 | v0.19.0 | closed (approved→shipped `a9cefd0`) | Tier A1 install script — install/doc/string surface, zero relay coupling. M-1..M-4 impl-bound (done), L-1..L-4 author-close. Docker harness caught + fixed a bash-login `set -e` abort. |
| R19 | v0.18.0 | closed (approved→shipped `2b59dee`) | Self-contained invite (portable join blob) — no wire change; token-in-blob sound vs H-5/UC-10.5. |

---

## Open (blocking)

*(없음 — R31 M-1·M-2 lock + L-1..L-5 author-close 완료, 2026-07-18. 상세 R31 author-close 로그.)*

### R31 author-close 로그 (2026-07-18, 아키텍트)

- **M-1 반영**: PLAN 0.23.6 "TUI chrome 필터" 행에 적용 대상 lock 문안 명기(conv inline + 카드 summary 입력만, 카드 `output` 본문 무적용 + 근거) · "카드 summary 정합" 행에 output 무필터 명시 · Security ①에 카드 output 무적용, 최악-결과 문장 conv-한정 정정 · 테스트 ⑩ 신설.
- **M-2 반영**: "conv 턴 delta화" 행에 슬라이스 메커니즘 단락(정규화 오프셋→원문 오프셋 인덱스 맵 동반 구축 → 마지막 출현 매치 끝의 원문 오프셋에서 원문 슬라이스, 정규화본 슬라이스 금지) + "0.23.5 프로브 동일 기법" 인용을 매칭 원리 한정으로 정정 · 테스트 ④에 슬라이스 원문 무결성 어서션 보강.
- **L-1**: "32k 트리거와의 관계" 행 신설(임계 판정·패키징 입력 = 필터 후 full scrape·delta 미적용·앵커는 패키징 턴에도 갱신) + 테스트 ⑪ 신설. **L-2**: delta 적용 턴 상시 통계 note `delta: kept N/M chars` 명기 + Security ② 정정. **L-3**: 빈 delta note `delta empty (no new output)` 명기. **L-4**: "done_proposal 판정 입력" 행 신설(delta 텍스트 선두 기준 + 폴백 턴 현행 유지 — 권고안 채택). **L-5**: settle 비교 = `stripAnsi` 후 텍스트 기준 명기.
- PLAN 헤더 Status/Fable-when·섹션 헤더·Approved by 갱신 → **`approved`** (no R31b, Fable 사전 승인 조건 충족).

---

## Review R31 — Plan v0.23.6 (워커 pane 스크레이프 delta화 + TUI chrome 필터 — 후보 ⑤ + 관찰 ⓐⓒ, PATCH)

**검토 대상:** `docs/PLAN.md` `#### 0.23.6` changelog(:53-80) + header + 코드 대조(`packages/host/src/bridge-runtime.ts` — `:876-1032` `sendWorkerTurnFromPane`(`:891-895` raw `paneRead(recent,200)`+`stripAnsi` — 필터·delta·settle 삽입 지점 / `:904` `[DONE_PROPOSAL]` kind 판정이 **raw 스크레이프 선두** 기준(L-4 근거) / `:922-963` artifact 마커 스캔이 원문 `output` 대상 + R28 L-1 dedup(`:948-951`) — pre-filter 유지 주장의 정합 근거 / `:972-991` 32k 측정 트리거 `output.length > MAX_CONV_TURN_INLINE_CHARS` → `packageConvTurnArtifact(fullText: output)` — delta·필터와의 입력 관계 미규정(L-1 근거) / `:1009-1028` send 성공 후 `lastOwnSeq`·`pendingDedup` 커밋 — 앵커 send-성공-후 갱신과 동형 패턴 실증)·`:1279-1323` `finishCard`(`:1287-1294` scrape+`truncateTail(200k)`·`:1301-1304` summary=마지막 non-empty 줄 — 관찰 ⓒ 오염 지점 실증; **카드 lane엔 artifact 방출 경로 부재**(파일 규약은 conv 한정, §5.5 out of scope — M-1 근거))·`:113-115` `normalizeForProbe`(**모든 공백 제거**)·`:128-134` `isInjectProbeHit`(**존재-검사 boolean `.includes` — 위치 반환 없음, M-2 근거**)·`:1034-1069` `verifyInjectOrRetry`(settle 비대상 주장 — 이 PATCH 무접촉 확인, M-2/M-4 주입 불변식 무변경 성립)·`:148-156` `ConvFlight`(앵커 필드 추가 지점·`:154` `emittedArtifacts`), `packages/host/src/conv-artifact-pack.ts:51` `ARTIFACT_MARKER_LINE` 정확-라인 앵커 regex·`:134-141` `scanArtifactMarkers`, `packages/protocol/src/conv-contract.ts:26` 32k 상수·`:127` turn `text`는 max-only(빈 delta 스키마 유효 — L-3 근거), `packages/host/src/herdr-client.ts:598` `stripAnsi`) + `HANDOFF.md`·PLAN Why 절(관찰 ⓐⓒ + 상한 실측 claude ~5.3k/grok ~2.2k/codex ~1.4k — 0.23.5 수정 카드 회수 note 오염 재확인 포함) + `docs/plan_review.md` R30(직전 형식·M 기준 선례)
**검토자:** Fable 5 (fable-advisor) — claude-rev 필수 컨설트 완료. **Advisor: fable-advisor consulted: yes.**
**날짜:** 2026-07-18
**결론:** **`pending-revision`** — M-1·M-2 문안 lock + L-1..L-5 author-close 후 **재리뷰 없이 `approved` 전환 가능** (Fable 사전 승인, no R31b).

### 결정적 발견 (성패 지점)
delta 앵커의 핵심 문안 — *"앵커를 공백-정규화 매치(0.23.5 프로브와 동일 기법)로 마지막 출현 위치 탐색 → 이후 내용만 inline text로"* — 가 지칭하는 0.23.5 프로브는 **존재-검사 boolean**(`isInjectProbeHit` `:128-134`의 `.includes`)이고, `normalizeForProbe`(`:113-115`)는 **모든 공백을 제거**한다. delta는 존재가 아니라 **슬라이스 위치**가 필요하다 — 정규화 공간의 매치 오프셋을 원문 오프셋으로 되돌리는 **인덱스 맵** 없이는, 문안대로의 구현이 (i) 정규화본을 슬라이스해 공백·개행이 전부 파괴된 inline text를 방출하거나 (ii) 라인 단위 매치로 후퇴해 TUI re-wrap(공백-정규화를 채택한 바로 그 이유)에서 앵커 miss를 양산한다. R25–R30 M 기준("문안대로 구현하면 결함이 스펙 준수의 결과물") 정확히 부합 → M-2. 같은 기준으로, chrome 필터를 **카드 결과 output 본문**에 적용하는 문안은 artifact 복구 경로가 없는 lane(§5.5 out of scope)에서 비가역 손실을 낳는데 Security 최악-결과 주장("artifact로 복구 가능")은 conv 전제다 → M-1.

### Checklist
- [x] **갭 실재 — 실측·코드 이중 확인** — conv 턴(`:891-895`)·카드 결과(`:1287-1294`) 모두 매번 `recent 200` 전체 스크레이프를 그대로 실음(delta 커서 없음). summary = 마지막 non-empty 줄(`:1301-1304`)이라 관찰 ⓒ의 키-힌트 오염이 구조적(0.23.5 수정 카드 회수 note로 당일 재확인). 상한 실측(claude ~5.3k/grok ~2.2k/codex ~1.4k)과 결합하면 반복 콘텐츠+chrome의 잠식 비용 주장 성립.
- [x] **delta 설계 총론 타당 (M-2 제외)** — 꼬리 앵커 ≤3줄·마지막 출현 매치·**미발견 시 전체 폴백 + note(fail-open — 유실보다 중복)**·앵커 갱신 send-성공-후(기존 `lastOwnSeq`/`pendingDedup` 커밋-후 패턴 `:1009-1028`과 동형)·카드 lane delta 비적용(flight당 결과 1회) 전부 건전. 단 슬라이스 메커니즘 미규정이 M-2, last-occurrence의 인용-재출현 무음 드롭이 L-2.
- [x] **chrome 필터 보수성 방향 타당 (적용 lane 제외)** — 명백 패턴 한정(box-drawing 전용/테두리·`│ ❯` 컴포저·알려진 키 힌트)·미지 chrome 통과 기본·망라 수집 out of scope 명시. 단 "포함 줄" substring 매치를 카드 output 본문에 적용하는 것이 M-1(이 dogfood 레포 자체가 PLAN·lessons에 키-힌트 문자열을 본문 인용 — 워커가 그 문서를 다루는 카드에서 실내용 줄 소실).
- [x] **artifact 마커 pre-filter 원문 스캔 정합** — `scanArtifactMarkers`는 정확-라인 앵커 regex(`conv-artifact-pack.ts:51`)로 원문 `output`을 스캔(`:922-963`); 필터 전 원문 유지 시 마커 유실 없음 + 이전 턴 잔존 마커는 R28 L-1 dedup(`:948-951`)이 이미 처리. 스펙 주장 성립 — 테스트 ⑥이 커버.
- [x] **settle 재독 유계·부작용 수용** — 최대 3독·250ms 간격이라 idle 전이 지연 상한 ~500ms+2 read. verify 루프 paneRead는 비대상(스펙 명시 — `:1034-1069` 무접촉 확인, **M-2/M-4 주입 불변식 무변경 성립**). 단 비교 대상이 raw면 ANSI 커서/스피너 churn으로 영구 불일치 → 항상 3독(유계라 안전하나 무의미) — 비교는 `stripAnsi` 후 텍스트로 명시(L-5).
- [x] **wire·스키마 무변경 성립** — turn `text`는 max-only(`conv-contract.ts:127` — 빈 delta도 유효), note는 기존 자유 문자열 관례, summary는 표시용 자유 문자열(하위 호환 무해 — 오염 감소 방향만). ConvFlight 내부 필드 추가뿐. 신규 신뢰 표면 없음(read-only shaping) 주장 성립.
- [x] **테스트 표 ①–⑨** — chrome 3종 샘플·비-chrome 보존(①)·2턴 delta(②)·miss 폴백+note(③)·wrap-변형(④)·summary(⑤)·마커 pre-filter(⑥)·settle(⑦)·send 실패 시 앵커 미갱신(⑧)·회귀(⑨) 커버. 단 M-1 카드 output 실내용 보존(⑩ 신설)·M-2 슬라이스 원문 무결성(④ 보강)·L-1 delta/32k 상호작용(⑪ 신설) 보강 필요.

### Findings (Sev: High|Med|Low)
- **M-1 (Med, binding — PLAN 문안 lock): chrome 필터의 카드 결과 output 본문 적용 — artifact 복구 경로 없는 lane의 비가역 손실 + Security 최악-결과 주장의 lane 불일치.** 카드 lane엔 파일-기반 artifact 규약이 없고(0.23.3은 conv 한정, §5.5 out of scope) `finishCard`의 `output`(≤200k, `:1287-1294`)이 유일 전달 표면이다 — "최악 결과 = inline 일부 누락, artifact로 복구 가능"(Security ②③)은 conv에만 성립. "포함 줄" substring 매치는 이 dogfood 레포에서 실제 위양성을 낳는다(PLAN 0.23.6 Why 절·lessons.md·plan_review.md가 `Shift+Tab:mode │ Ctrl+.:shortcuts`를 본문 인용 — 그 문서를 읽고 출력하는 카드의 결과에서 해당 줄이 무복구 소실). 카드 output은 200k 상한이라 chrome 몇 줄의 잠식 실익도 없다. 잠글 문안: **"chrome 필터 적용 대상 = conv 턴 inline text + 카드 `summary` 산출 입력. 카드 결과 `output` 본문에는 적용하지 않는다(카드 lane은 artifact 복구 경로 부재 — 손실 비가역; 200k 상한에서 chrome 잠식 실익 없음)."** + Security 최악-결과 문장을 conv-한정으로 정정. + 테스트 ⑩: 키-힌트 문자열을 본문 인용하는 카드 output이 무손실 보존. High 아님: 손실이 특정 콘텐츠 패턴 한정 + summary·conv 방향은 건전. (advisor 일치 — 카드 lane 복구 경로 부재 코드 확증은 advisor 보강.)
- **M-2 (Med, binding — PLAN 문안 lock): delta 슬라이스 메커니즘 미규정 — "0.23.5 프로브와 동일 기법" 지칭이 존재-검사 boolean이라 위치 산출 불가.** 근거는 결정적 발견 참조. 잠글 문안: **"공백-정규화 문자열 생성 시 정규화 오프셋→원문 오프셋 인덱스 맵을 동반 구축한다. 앵커의 마지막 출현 매치 **끝**에 대응하는 원문 오프셋에서 (chrome-필터된) 원문 텍스트를 슬라이스한다 — 정규화본 슬라이스 금지(공백·개행 파괴). '0.23.5 프로브와 동일 기법'은 공백-정규화 매칭 원리의 재사용만을 뜻하며 존재-검사 헬퍼(`isInjectProbeHit`)의 재사용이 아니다."** + 테스트 ④를 wrap-변형 매치 성공에 더해 **슬라이스 결과의 원문 무결성(공백·개행 보존)** 어서션까지 보강. High 아님: 오동작이 콘텐츠 정형 손상(공백 소실)이지 유실·보안 표면이 아니고 fail-open 폴백은 별개 경로로 생존. (advisor 일치 — 결정 리스크 지목도 advisor 일치.)
- **L-1 (Low, author-close): delta·chrome 필터와 32k 측정 트리거의 입력 관계 미규정.** 현행 트리거·패키징은 raw `output` 기준(`:972-991`). 한 줄 고정: **임계 판정·`packageConvTurnArtifact` 입력 = chrome-필터 후 full scrape(delta 미적용); delta는 ≤32k 인라인 분기에만 적용; 앵커는 패키징 발화 턴에도 full-scrape 꼬리에서 갱신.** TUI 상한 실측상 near-moot이나 비-TUI pane에서 도달 가능.
- **L-2 (Low, author-close): 앵커 late-false-match의 무음 드롭 — note는 miss에만 발화.** 워커가 직전 턴 꼬리를 인용하면(이 dogfood 레포에서 개연) 마지막-출현 매치가 인용 지점 뒤로 슬라이스해 그 앞의 실내용을 **note 없이** 드롭한다 — Security의 "note로 가시화" 완충은 miss 폴백에만 성립. 마지막-출현 선택은 이 드롭을 극대화하는 방향임을 인지하고, 닫기: delta 적용 턴에 상시 통계 note(예: `delta: kept N/M chars`) 부가 — 타워가 이상 드롭을 식별할 유일한 채널. (advisor 보강 — 극대화 논증.)
- **L-3 (Low, author-close): 빈 delta 턴 무규정.** 앵커가 스크레이프 말미에 매치하면 text=""(스키마 유효 `:127`). 타워 가독성을 위해 note `delta empty (no new output)` 한 줄 명시.
- **L-4 (Low, author-close): `[DONE_PROPOSAL]` kind 판정 입력 미규정.** 현행 판정은 raw 스크레이프 선두(`:904`) — 이전 턴 잔존 콘텐츠가 선두를 차지하는 다중턴에선 사실상 도달 불가(기존 취약, 이 PATCH 도입 아님). delta 텍스트 선두 기준으로 옮기면 이 취약이 자연 해소되나 의미 변경이므로 어느 쪽인지 한 줄 고정(권고: delta 텍스트 기준 + 폴백 턴은 현행 유지).
- **L-5 (Low, author-close): settle 재독 비교 대상 미규정.** raw 비교면 ANSI 커서/스피너 churn으로 영구 불일치 → 항상 3독. 비교는 `stripAnsi` 후 텍스트 기준 명시(유계라 안전 문제는 아님 — 정밀도·낭비 문제). (advisor 발견.)

### Decision notes
- **verdict 구조 (R25–R30 동형):** M-1·M-2 모두 "문안대로 구현하면 결함이 스펙 준수의 결과물" 부류 — M-1은 적용 lane 열거가 복구-불가 표면을 포함하고 Security 논증이 그 lane에 부적용, M-2는 인용된 기법이 필요한 원시(위치)를 제공하지 않아 충실 구현이 정형 손상 또는 re-wrap 취약으로 귀결. 둘 다 설계 재작업이 아닌 문안 lock(적용 대상 한 줄 + 메커니즘 한 단락) + 테스트 2건이고, 나머지 설계(fail-open 폴백·보수 필터 방향·pre-filter 마커 스캔·send-성공-후 앵커 갱신·settle 유계)는 전부 건전함을 코드 대조로 확인. M-1·M-2 반영 + L-1..L-5 author-close 후 재리뷰 없이 `approved` 전환 (no R31b).
- **결정을 가르는 리스크:** delta가 "위치"를 요구하는데 스펙이 "존재"용 도구를 지칭하는 것 — 매칭 원리(공백-정규화)는 옳지만 원시가 다르다. 인덱스 맵 한 단락으로 잠그면 나머지는 문구·테스트 보강.
- **보안 판단 요지:** 신규 신뢰 표면 없음 주장 성립 — 필터·delta·settle 전부 이미-untrusted 스크레이프의 read-only 후처리, 주입 경로(M-2/M-4)·verify 루프(`:1034-1069`) 무접촉 확인, wire 스키마 무변경(text max-only·note/summary 자유 문자열). 격상 finding 없음. 위험의 실체는 보안이 아니라 **가용성(콘텐츠 손실)** — M-1·L-2가 그 경계.
- **스펙-코드 정합:** 스펙 라인 참조(`sendWorkerTurnFromPane` ~:876·카드 스크레이프 ~:1284·summary ~:1301) 실코드 일치. 32k 트리거(`:972`)·마커 스캔(`:922`)·앵커 갱신 대상 커밋 패턴(`:1009-1028`) 대조 완료.
- **수정 파일 범위:** 이 리뷰는 `docs/plan_review.md` + PLAN 헤더 Status `pending-revision` 동기화만 수정(디스패치 브리프 지시). M/L 문안 반영·author-close·`approved` 전환은 아키텍트/implementer 수행.
- Advisor: fable-advisor consulted: yes. (verdict 일치: pending-revision, M-1·M-2 확정 — "둘 다 문안 lock으로 해소 가능, 재설계 불요" 일치. M-2를 결정 리스크로 지목 일치. 카드 lane 복구 경로 부재 코드 확증·L-2 last-occurrence 극대화 논증·L-5 settle 비교 대상은 advisor 보강/발견.)

---

## Review R30 — Plan v0.23.5 (브릿지 주입 verify 루프 3분기 확장 — 후보 ⑨ + 관찰 ⓓ, PATCH)

**검토 대상:** `docs/PLAN.md` `#### 0.23.5` changelog + header + 코드 대조(`packages/host/src/bridge-runtime.ts` — `:1033-1065` `verifySubmitOrRetry`(현행: timeout 시 `BARE_ENTER`만 4s×3, `:1059-1064` 소진 시 log-만 무음 포기 실증)·`:823-854` `verifyConvSubmitOrRetry`(동형)·주입 3지점 `:541-542`(카드 `wrapUntrustedPrompt`→`injectPromptAndSubmit`)/`:699-701`(conv 턴, 턴마다 재래핑)/`:798-811`(conv 최초 — **untrusted goal 뒤에 브릿지 작성 artifact 규약 블록 접미, `"--- end convention ---"` 상수로 끝남**)·`:1228-1258` `sendFailedResult`(reason 자유 문자열 필드 — `inject_unconfirmed` 신설은 wire 스키마 무변경 주장 성립)·`:518-536` 0.23.4 `events_subscribe_failed` 정리 계열(fail-visible 카드 경로 선례)·`:111-131` Flight(주입 1회) vs ConvFlight(멀티턴 생존 — M-2 근거), `packages/host/src/herdr-client.ts` — `:329-331` `agentSend`(literal, no Enter)·`:342-347` `injectPromptAndSubmit`(paste → 500ms → 별도 `BARE_ENTER`; `bridge-runtime.ts:100` 모듈 주석 "paste-grouping window" = **paste 방식 전달 실증, M-1 근거**)·`:579-590` `paneRead`(source/lines 지원 — 스펙 호출 형태 성립)·`:33` `BARE_ENTER` 상수, `packages/protocol/src/card-contract.ts:129-134` `wrapUntrustedPrompt`(마커+본문 — 스펙이 지칭한 `prepareInjectText`는 별개 구버전 PTY 경로 `handoff-inject.ts:44`, L-1 근거)) + `tasks/lessons.md` (2)(주입 유실 5회+·수동 복구 실증 경로 = 스펙 (a) 분기와 동일)·(6)(관찰 ⓓ — codex composer 미제출 잔류 실증)·(3)(0.23.1 실측 = **트랜스크립트** 접힘만 검사, composer 렌더 거동 미검사 — Security 완충 ② 인용 초과의 근거) + `docs/plan_review.md` R29(직전 형식·M 기준 선례)
**검토자:** Fable 5 (fable-advisor) — claude-rev 필수 컨설트 완료. **Advisor: fable-advisor consulted: yes.**
**날짜:** 2026-07-18
**결론:** **`pending-revision`** — M-1·M-2 문안 lock + L-1..L-3 author-close 후 **재리뷰 없이 `approved` 전환 가능** (Fable 사전 승인, no R30b).

### 결정적 발견 (성패 지점)
프로브 설계의 전제 — *"주입 프롬프트의 꼬리 48자가 composer 영역 스크레이프에 남는다"* — 가 **Claude Ink TUI에서 미검증이며, 유력하게 거짓**이다. 전달은 paste 방식이고(`injectPromptAndSubmit` + `bridge-runtime.ts:100` "paste-grouping window" 주석), Claude Code TUI는 멀티라인 paste를 composer에 **`[Pasted text #N +M lines]` 플레이스홀더로 접어 표시**한다(원문 비표시). 그러면 composer에 프롬프트가 실제로 담겨 있어도 프로브는 구조적으로 miss → **(b) 분기(미제출 잔류 = CR 재전송)가 claude 워커에서 도달 불가**하고, (a) 재주입이 **비어 있지 않은 composer에 두 번째 사본을 append** → 뒤따르는 CR 1회가 두 배 프롬프트를 제출한다 — 관찰 ⓓ를 잡겠다는 분기가 ⓓ 상황에서 오동작을 낳는다. Security 완충 ②("트랜스크립트 접힘은 composer에 미적용 — 0.23.1 실측")는 **0.23.1 실측이 검사하지 않은 전제**(lessons (3)은 트랜스크립트 영역만 측정)를 실측처럼 인용한다. R25/R26/R28/R29 M 기준("문안대로 구현하면 결함이 스펙 준수의 결과물") 부합 → M-1.

### Checklist
- [x] **갭 실재 — 실측·코드 이중 확인** — 현행 `verifySubmitOrRetry`/`verifyConvSubmitOrRetry`는 timeout 시 `BARE_ENTER`만 재전송하고 소진 시 log 한 줄 후 무음 복귀(`:1059-1064`·`:848-853` — 카드 doing 영구 고착 서술과 정합). 주입 유실은 당일 누적 5회+(claude/grok, lessons (2))·미제출 잔류는 codex 실증(lessons (6)·관찰 ⓓ). 수동 복구 절차(리터럴 재주입 + 별도 CR)가 5회+ 유효 — 스펙 (a) 분기는 이 실증 경로의 기계화가 맞다.
- [x] **3분기 설계 총론 타당** — read 실패 시 CR 폴백(스크레이프 불가 ≠ 주입 실패 — 보수적), working/gone fast-path 유지(현행 회귀 없음), 프로브 공백 정규화(TUI 자동 줄바꿈 대응) 방향 성립. 단 프로브 가시성 전제가 M-1.
- [x] **M-2 불변식 확장 보안 판단** — 재주입 페이로드는 최초 `injectPromptAndSubmit`에 넘긴 **동일 캐시 문자열**(relay sanitize + untrusted 마커 기통과)·임의/신규 텍스트 표면 없음·1회 상한·working 즉시 중단. 확장 수용 타당(advisor 일치). 단 스펙의 함수 지칭이 부정확(L-1)하고 상한 단위가 모호(M-2).
- [x] **중복 제출 잔여 리스크 수용** — 오탐 재주입(제출 성공 + status 지연 + echo 접힘 소실) 시 동일 프롬프트 2회 제출이 최악. 상한 1회 + wire 측 `processedHandoffs` dedup·conv seq 단조성으로 유계 — 현행 무음 고착 대비 보수적으로 우월, §5.1 기준 수용 타당(advisor 일치).
- [x] **fail-visible 정리 범위 비대칭 정합** — 카드 = flight 파기 + `eventsPrune` + pane close 시도(0.23.4 `events_subscribe_failed` 계열 `:518-536`과 동형; verify 단계는 구독 성립 후이므로 M-1 롤백 아닌 명시 prune이 맞음 — 스펙 포함 확인) / conv = blocked 턴 + convFlight·pane 유지(타워 턴 재전송 재시도 가능·§1.4 conv.close 타워 전권 정합). 타당(advisor 일치).
- [x] **관측성** — 라운드별 `probe=hit|miss|read-fail action=...` stderr 기록, 프롬프트 본문·프로브 문자열 비기록(마커+규약이 섞인 프로브 원문도 로그 제외 — 본문 비기록 원칙 유지). 신설 표면 없음(0.23.4 stderr 로그 파일 재사용). 격상 없음.
- [x] **reason 어휘 신설만** — `inject_unconfirmed`는 자유 문자열 필드(`sendFailedResult` `reason: string` `:1232`) 재사용 — wire 스키마 무변경 주장 성립.
- [x] **테스트 11항목** — 유실 복구(①)·잔류 CR(②)·fail-visible 카드/conv(③④)·상한(⑤)·fast-path(⑥)·read 폴백(⑦)·gone(⑧)·정규화(⑨)·턴별 프로브(⑩)·정상 회귀(⑪) 커버. 단 M-1 플레이스홀더 시나리오(⑫ 신설)·M-2 conv 턴별 상한 리셋(⑬ 신설) 보강 필요.

### Findings (Sev: High|Med|Low)
- **M-1 (Med, binding — PLAN 문안 lock): 프로브 가시성 전제 미검증 — Claude Ink composer의 paste-플레이스홀더 접힘.** 근거는 결정적 발견 참조. 잠글 문안: **"프로브 판정은 꼬리 48자 매치에 더해 TUI paste-플레이스홀더 패턴(예: `[Pasted text`)을 probe-hit으로 인정한다(플레이스홀더 = composer에 내용 존재 = (b) CR 분기 — 안전한 쪽으로 라우팅). 구현 시 워커 TUI 3종(claude/codex/grok)별 composer 가시성(대량 paste 시 스크레이프에 무엇이 보이는지) 라이브 검증 1회 수행·결과 기록. claude에서 미제출-잔류의 내용 식별(ⓓ 정밀 감지)은 플레이스홀더 수준으로 저하됨을 본문에 명시(커버리지 주장 금지)."** + Security 완충 ② 문장을 "0.23.1 실측" 인용 없이 미검증 전제로 정정. + 테스트 ⑫: "composer가 플레이스홀더만 노출(원문 비표시) → 재주입 없이 CR 분기". High 아님: 최악이 이중 append 제출(유계·wire 무해)이고 트리거가 이미 비정상 조건 + 재주입 상한 1회. (advisor 일치 — 플레이스홀더=hit 라우팅이 안전한 쪽이라는 판단 advisor 보강.)
- **M-2 (Med, binding — PLAN 문안 lock): 재주입 상한 "flight당 1회"의 단위 모호 — conv ConvFlight는 멀티턴 생존.** 카드는 flight=주입 1회라 무해하나, conv를 문자 그대로 구현하면 스타트업 레이스가 가장 흔한 1턴에서 상한을 소진하고 **이후 모든 턴의 paste 유실이 재주입 불가**(CR→소진→blocked 반복; 타워 재전송도 동일 경로라 스펙 자신의 (c) 근거 — "타워가 턴을 다시 보내 재시도 가능" — 가 자기모순이 된다). 중복 제출 완충으로서의 상한은 본질상 프롬프트(주입 시도)별이므로 **"verify 호출(주입 시도)당 1회"** 로 고정 — 보안 손실 없음. + 테스트 ⑬: "conv 1턴 재주입 후 2턴 paste 유실 → 2턴에서 재주입 가능(상한 리셋)". (advisor 일치 — 자기모순 지적은 advisor 보강.)
- **L-1 (Low, author-close): 재주입 페이로드 지칭 함수 오기.** 헤더 "Fable 5 when"·Security 절의 "동일한 `prepareInjectText` 산출물"은 오기 — 실제 주입 문자열은 `wrapUntrustedPrompt` 산출물(conv 최초 턴은 + 브릿지 artifact 규약 접미, `bridge-runtime.ts:810`)이고 `prepareInjectText`는 구버전 PTY inject 경로(`handoff-inject.ts:44`)다. What 표의 "최초 `injectPromptAndSubmit`에 넘긴 동일 문자열"이 정문 — 헤더·Security도 이 표현으로 통일하고, **재주입은 그 캐시 문자열 그대로(재파생 금지)** 한 줄 명시(conv 최초 턴은 규약 접미 포함 전체가 캐시 대상).
- **L-2 (Low, author-close): conv 최초 턴 프로브 꼬리 = 규약 상수.** conv-open 주입 문자열은 `"--- end convention ---"` 상수로 끝나므로 꼬리 48자 프로브가 goal-특이적이지 않다 — 프로브 정의 행의 근거 문장("꼬리가 goal/턴 본문 특이적")은 conv 최초 턴에 성립하지 않음(기능상 무해 — 신규 pane엔 선행 잔류물이 없어 존재-검사로는 유효). 근거 문장 정정 또는 "conv 최초 턴은 untrusted 본문 꼬리로 프로브 계산" 중 택일 명시.
- **L-3 (Low, author-close): 라운드 액션 전 flight 재확인 미명시.** timeout 판정과 paneRead·재주입/CR 사이 창에서 flight가 소멸(카드 완료·conv.close)할 수 있다 — 각 라운드 액션 직전 flight 존재 재확인(gone = 성공 종료) 한 줄 명시. 현행 CR-만 루프에선 무해했으나 재주입은 전체 프롬프트를 보내므로 명시 가치 있음.

### Decision notes
- **verdict 구조 (R25/R26/R28/R29 동형):** M-1·M-2 모두 "문안대로 구현하면 결함이 스펙 준수의 결과물" 부류 — M-1은 신설 분기의 판정 전제가 주력 워커 TUI에서 유력하게 거짓이라 오분기·이중 제출을 낳고, M-2는 스펙 문안이 conv 재시도 근거와 자기모순. 둘 다 설계 재작업이 아닌 문안 lock(판정 규칙 1건 + 단위 1단어) + 테스트 2건이고, 나머지 설계(3분기·fail-visible 비대칭·불변식 확장·관측성)는 전부 건전함을 코드·실측 대조로 확인. M-1·M-2 반영 + L-1..L-3 author-close 후 재리뷰 없이 `approved` 전환 (no R30b).
- **결정을 가르는 리스크:** 프로브가 "안 보임 = 없음"으로 단정하는 것 — TUI 렌더는 존재를 숨길 수 있다(플레이스홀더·접힘). miss 판정의 기본 동작이 "전체 재주입"이므로 가시성 전제는 실측으로 잠가야 한다.
- **보안 판단 요지:** M-2 불변식 확장은 수용 — 재주입은 이미 sanitize+마커를 통과한 동일 캐시 문자열 1회뿐, 임의 텍스트 표면 없음. 신설 관측성도 매치 여부만 기록(본문 비기록 유지). 신뢰 경계 무변경·wire 무변경 주장 성립. 격상 finding 없음.
- **스펙-코드 정합:** 스펙 라인 참조(`:1033`/`:823`/`:542`/`:701`/`:811`) 전수 실코드 일치. `paneRead` 호출 형태(`source`/`lines`) 클라이언트 지원 확인. reason 자유 문자열 주장 확인(`:1232`).
- **수정 파일 범위:** 이 리뷰는 `docs/plan_review.md`만 수정(디스패치 브리프 지시) — PLAN 헤더 `pending-revision` 동기화·M/L 문안 반영·author-close는 아키텍트/implementer 수행.
- Advisor: fable-advisor consulted: yes. (verdict 일치: pending-revision, M-1·M-2 확정 — "둘 다 문안 lock으로 해소 가능, 재설계 불요" 일치. M-1 플레이스홀더=hit 안전 라우팅·M-2 자기모순 논증·L-1 재파생-금지 조건은 advisor 보강.)

### Author-close (2026-07-18, plan author)

- **M-1 반영**: What "verify 라운드 3분기" 행 — 플레이스홀더 패턴(`[Pasted text`) = probe-hit 인정((b) CR 분기 라우팅) + claude ⓓ 정밀 감지 저하(커버리지 주장 금지) 명시 + TUI 3종(claude/codex/grok) composer 가시성 라이브 검증 1회 명시. Security 완충 ② "0.23.1 실측" 인용 제거 — "composer 렌더는 존재를 숨길 수 있다"를 전제로 명기. 테스트 ⑫ 추가.
- **M-2 반영**: 재주입 상한 "flight당 1회" → **"verify 호출(주입 시도)당 1회"** (What·Security·헤더 전부). 테스트 ⑬ 추가.
- **L-1**: `prepareInjectText` 지칭 오기 → "최초 `injectPromptAndSubmit`에 넘긴 동일 캐시 문자열(카드 `wrapUntrustedPrompt` 산출물 / conv 최초 턴 + 규약 접미 포함 전체)" + **재파생 금지** 명시 (What·Security·헤더).
- **L-2**: 프로브 정의 행 — conv 최초 턴 꼬리 = 규약 상수임을 명시, 신규 pane 존재-검사로 유효(기능상 무해) + 턴 2+는 턴 본문 특이적.
- **L-3**: verify 라운드 ①에 액션 전 flight 존재 재확인(gone = 성공 종료) 명시.
- PLAN Status `pending-revision` → **`approved`** (사전 승인 경로, no R30b).

---

## Review R29 — Plan v0.23.4 (HerdrClient 이벤트 구독 수명주기 수정 — 후보 ⑫, PATCH)

**검토 대상:** `docs/PLAN.md` `#### 0.23.4` changelog + header + 코드 대조(`packages/host/src/herdr-client.ts` — `:278-286` `eventsSubscribe` append-only 병합·**`:279-285` 연결 개설 전 리스트 push(M-1 근거)**, `:288-365` `openEventConnection` — `:306` 재개설 시 저장 리스트 전체 재전송·`:307-346` ACK promise 정착 경로·`:348-356` error 핸들러(정착함)·`:357-363` close 핸들러(**pre-ACK 무정착·ACK 타임아웃 부재 — root cause ② 실증**)·`:359` superseded 세대 조기 return(무정착)·`:362` `if (this.subscriptions.length)` 재연결 가드, `:367-378` `scheduleEventReconnect` 백오프, `packages/host/src/bridge-runtime.ts` — `:495-502` 카드 구독(catch 후 log-만-하고 blind 진행)·`:496` await→`:507` 주입 순서(고착 지점)·`:741-748` conv 구독 동형·`:1023-1040` `onHerdrEvent` paneId→flights/convFlights 맵 라우팅·flight 제거 전수 grep(`:509`·`:699-700`·`:771-772`·`:1050`·`:1079`·`:1084`·`:1104-1105` — 스펙 열거 7지점과 일치, 현행 코드 기준 완전)·`:271-282` status op(현행 `inFlight`만), `packages/host/src/bridge-spawn.ts:61-67` — `:64-65` `stdout/stderr: "ignore"` 실증) + `HANDOFF.md` ⭐ 후보 ⑫ 블록(codex pane 조사 — 재현·반증 3종: A 생존 시 B ACK 106ms / A 닫힌 후 B 타임아웃·이벤트 0 / A prune 시 즉시 복구) + `docs/plan_review.md` R28(직전 형식·M 기준 선례)
**검토자:** Fable 5 (fable-advisor) — claude-rev 필수 컨설트 완료. **Advisor: fable-advisor consulted: yes.**
**날짜:** 2026-07-18
**결론:** **`pending-revision`** — M-1 lock 본문 반영 + L-1..L-5 author-close 후 **재리뷰 없이 `approved` 전환 가능** (Fable 사전 승인, no R29b).

**Author-close 완료 (2026-07-18, claude-impl):** M-1 — PLAN 0.23.4 What 표에 "구독 실패 롤백 (R29 M-1 lock)" 행 신설(reject-시 신규 추가분 롤백·기존 항목 유지·불변식 클라이언트 한 곳·호출부별 prune 의존 금지) + prune 행에 "신설 실패 경로 오염은 M-1 롤백이 클라이언트 측 커버" 명시 + 테스트 ⑬(자기 재감염 회귀). L-1 — pre-ACK 행에 superseded promise 신세대-결과-채택 문안(advisor 권고 채택). L-2 — 글로벌 1회 행에 기동 구독 실패 fail-fast 문안(advisor 권고 채택). L-3 — Out of scope에 established 스트림 강제 종료 미검증 명시 + 구현 시 events-probe 라이브 검증 1회·재연결 안전망(테스트 ④) 기록. L-4 — pre-ACK 행에 "정착 시 타이머 해제" + 테스트 ⑭(fake timer). L-5 — 테스트 ⑤를 HerdrClient 단위(글로벌 구독 부재 조건) 한정으로 교체. 사전 승인 경로(no R29b)에 따라 재리뷰 없이 `approved` 전환.

### 결정적 발견 (성패 지점)
이 PATCH의 핵심 신설물은 **"구독 실패 fail-visible"** 인데, 바로 그 신설 경로가 **이 PATCH가 제거하려는 오염을 재생산**한다. `eventsSubscribe`는 연결 개설 **전에** 신규 구독을 저장 리스트에 push 하고(`herdr-client.ts:279-285`) reject 시 롤백이 없다. 스펙의 실패 처리 문안("flight 정리 + `sendFailedResult(events_subscribe_failed)` + pane close 시도")을 문자 그대로 구현하면: 구독 실패 → pane close → **방금 push된 구독이 닫힌 pane을 참조한 채 리스트에 잔존** → 다음 dispatch의 `eventsSubscribe`가 오염 리스트로 재개설 → herdr pre-ACK close → (신설 reject 덕에 가시적이긴 하나) **연쇄 실패가 브릿지 재시작까지 지속** + 백그라운드 `scheduleEventReconnect` 백오프도 오염 리스트로 무한. 스펙의 prune 원칙("flight가 맵에서 제거되는 **모든** 지점")은 이 신설 제거 지점을 포괄한다고 읽을 수 있으나, 열거된 7지점(현행 코드의 제거 지점 전수와 일치함은 확인)에 **이 PATCH 자신이 만드는 8번째 지점이 빠져 있고** 실패 처리 행 문안에도 prune이 없다 — R25/R26/R28 M 기준("문안대로 구현하면 결함이 스펙 준수의 결과물") 정확히 부합 → M-1.

### Checklist
- [x] **root cause 서술 = 코드 실증 (라인 전수 검증)** — append-only 병합(`:278-286`), pre-ACK close 무정착 + ACK 타임아웃 부재(`:357-363` — close 핸들러에 resolve/reject 없음; error 핸들러 `:348-356`는 정착하지만 herdr의 정상 FIN close는 error 없이 close만 발화), 재개설 시 오염 리스트 재전송(`:306` + `scheduleEventReconnect`→`openEventConnection` 재호출), `bridge-runtime.ts:496` await → `:507` 주입 순서(고착 시 주입 미실행 — "스타트업 레이스" 실체 주장과 정합), stderr `"ignore"`(`bridge-spawn.ts:64-65`). HANDOFF 재현·반증 3종과 서술 일치.
- [x] **prune-without-reopen 설계 타당** — 열린 연결의 잔존 구독은 이벤트를 내지 않는 pane이라 무해하고, 오염은 재개설 요청 payload로만 전파되므로 저장 리스트 정리로 충분하다는 논증 성립. herdr가 닫힌 pane 구독을 가진 **열린** 스트림을 나중에 강제 종료하는지는 미검증(조사서는 신규 subscribe의 pre-ACK close만 실증)이나, 강제 종료가 실재해도 재연결이 prune된 리스트로 복구(테스트 ④가 이 안전망을 커버) — 잔여 리스크는 재연결 백오프 동안의 이벤트 갭뿐이며 L-3으로 명시.
- [x] **prune 호출 지점 열거 완전성** — grep 전수 대조: 카드 `:509`/`:1050`/`:1079`/`:1084` + conv `:699-700`/`:771-772`/`:1104-1105` = 현행 코드의 flight 제거 지점 전부. 단 **신설 실패 경로가 8번째 제거 지점**(M-1).
- [x] **`pane.closed` 글로벌 1회 전환 — 소비부 무변경 주장 실증** — `onHerdrEvent`(`:1023-1040`)는 paneId로 flights/convFlights 맵을 조회해 라우팅하고 맵 미스는 무시 → 글로벌 구독으로 비관리 pane의 pane.closed가 유입돼도 no-op. 카드/conv 핸들러(`:1049`/`:1103`)도 paneId 키 동작. 주장 성립.
- [x] **promise 정착 경로** — pre-ACK close reject + ACK 타임아웃 + superseded 자기-promise 정착으로 현행 3개 무정착 경로(FIN close·타임아웃 부재·세대 교체 `:359` 조기 return) 전부 커버. 이중 정착은 기존 `settled` 가드 패턴으로 방지 가능 — 단 superseded reject의 오탐 각도(L-1)와 타임아웃 타이머 해제(L-4) 문안 보강 필요.
- [x] **fail-visible 보수성** — 오탐(일시 herdr 재시작 중 dispatch) 시 failed 회신은 현행 "무음 doing 고착 + 수동 정리" 대비 우월(재-dispatch 가능, 카드 상태 SSOT 정합). conv 쪽 blocked 턴도 기존 pane_closed 표면 재사용이라 타워 소비부 무변경. 방향 타당.
- [x] **stderr 유한 로그 보안·프라이버시** — 신설 표면은 로컬 `loomDir()/bridge/<profile>.stderr.log`뿐(0600·truncate-on-spawn 유한 보장·stdout ignore 유지). 현행 `[loom-bridge]` log() 호출은 에러·상태·paneId만 — 프롬프트 본문·핸드오프 body 비기록 원칙과 정합(스펙이 회귀 확인 항목으로 자체 명시). wire·MCP·herdr RPC 무변경 주장 성립. 격상 없음.
- [x] **테스트 12항목** — 버그 재현(⑩ 통합)·오염 재전송 회귀(④)·prune payload(①)·reject 전파(②③)·fail-visible(⑦⑧)·관측성(⑨)·정상 회귀(⑪)·정리(⑤⑫) 커버. 단 M-1 케이스(⑬ 신설 필요)·⑤ 문안 내부 모순(L-5)·타임아웃 타이머 해제(L-4 — ⑪은 15s를 안 기다려 못 잡음) 보강 필요.

### Findings (Sev: High|Med|Low)
- **M-1 (Med, binding — PLAN 문안 lock): 신설 구독-실패 fail-visible 경로의 자기 재감염 — `eventsSubscribe` 선-push(`herdr-client.ts:279-285`) + reject 롤백 부재.** 근거는 결정적 발견 참조. 잠글 문안: **"`eventsSubscribe`는 reject 시 이번 호출이 새로 추가한 구독 항목을 저장 리스트에서 롤백한다(기존 `exists` 중복 체크가 신규분을 식별하므로 추가분만 제거 — 이전부터 있던 항목은 유지). 이로써 실패 정리 경로(카드/conv)가 pane을 닫아도 오염이 잔존하지 않는다. 불변식을 클라이언트 한 곳에 두어 카드·conv·미래 호출자를 일괄 커버한다(호출부별 prune 의존 금지)."** + 테스트 ⑬ 추가: "subscribe 실패(pre-ACK close) → 저장 리스트에 이번 호출 추가분 부재 → 다음 dispatch의 `eventsSubscribe` 정상". High 아님: 실패가 가시적(failed result)이고 브릿지 재시작으로 복구 가능하며 트리거가 이미 비정상 조건. (advisor 확정 — 롤백 위치를 호출부 prune이 아닌 `eventsSubscribe` 자체로 두는 설계는 advisor 권고.)
- **L-1 (Low, author-close): superseded 세대 자기-promise reject의 구조적 오탐.** 동시 `eventsSubscribe` 경합 시(카드 A 대기 중 카드 B가 재개설) A의 구독은 이미 리스트에 병합돼 B의 연결에서 실제 성립하는데도 A는 reject → 오탐 failed. 인박스 처리 직렬이라 희귀하나, 닫기: superseded promise는 reject 대신 **신세대 연결의 결과를 채택**(신세대 ACK 성공 = resolve)하는 문안으로 교체 — 또는 현행 reject 유지 시 "오탐 재-dispatch 수용" 명시. (advisor 보강 — 신세대 결과 채택 권고.)
- **L-2 (Low, author-close): 브릿지 시작 시 글로벌 `pane.closed` 구독 실패 동작 미규정.** 이벤트를 못 받는 브릿지는 카드/conv 완료를 전달할 수 없으므로 **fail-fast(기동 실패) 권고** — 최소한 status `eventConnected:false` 노출과 함께 어느 쪽인지 본문에 한 줄 고정.
- **L-3 (Low, author-close): herdr의 열린-스트림 강제 종료 경로 미검증.** 조사서는 신규 subscribe의 pre-ACK close만 실증. 닫힌 pane 구독을 가진 established 스트림을 herdr가 나중에 close하는 경우 재연결(prune된 리스트)로 복구되지만 백오프 동안 이벤트 갭(동시 진행 카드의 done 유실 가능). 구현 시 라이브 검증 한 줄 명시(events-probe 재사용) — heartbeat/능동 재구독은 스펙 명시대로 out-of-scope 유지.
- **L-4 (Low, author-close): ACK 타임아웃 타이머의 정착-시 해제 미명시.** 스펙은 "초과 시 reject + destroy"만 명시 — 정상 ACK 후 타이머를 해제하지 않으면 15s 뒤 건강한 소켓을 destroy. 문안에 "정착(resolve/reject) 시 타이머 해제" 한 줄 + fake-timer 테스트 1건(테스트 ⑪은 15s를 안 기다려 못 잡음). (advisor 발견.)
- **L-5 (Low, author-close): 테스트 ⑤ 문안 내부 모순.** 글로벌 `pane.closed` 항목은 prune 비대상이므로 운용 중 브릿지의 리스트는 빌 수 없음 — "마지막 pane prune → 소켓 close + 타이머 취소"는 글로벌 구독이 없는 클라이언트 단위 테스트로만 성립. ⑤를 "HerdrClient 단위(글로벌 구독 부재 조건)" 명시로 교체. (advisor 발견.)

### Decision notes
- **verdict 구조 (R25/R26/R28 동형):** M-1은 "문안대로 구현하면 결함이 스펙 준수의 결과물" 부류 — PATCH의 핵심 신설물(fail-visible)이 PATCH의 제거 대상(오염 잔존)을 재생산하는 내부 모순이라 즉시 approved 부적합. 재리뷰 필수까지 갈 사유는 없음 — lock은 설계 재작업이 아닌 롤백 불변식 1줄 + 테스트 1건이고, 나머지 설계(prune-without-reopen·글로벌 1회·fail-visible·관측성)는 전부 건전함을 코드 대조로 확인. M-1 반영 + L-1..L-5 author-close 후 재리뷰 없이 `approved` 전환 (no R29b).
- **결정을 가르는 리스크:** 신설 실패 경로가 pane은 닫으면서 구독은 남겨 자기 자신을 재감염시키는 것 — 이것만 잠그면 나머지는 문구·테스트 보강.
- **보안 판단 요지:** 신뢰 경계 무변경 주장 성립 — 신설 표면은 로컬 stderr 로그뿐(0600·truncate·프롬프트 비기록), 이벤트 소켓은 기존 로컬 herdr 유닉스 소켓 신뢰 모델 그대로. 실패 의미 변경(무음→fail-visible)은 보수성 강화 방향. 격상 finding 없음.
- **스펙-코드 정합:** 스펙의 모든 라인 참조(herdr-client·bridge-runtime·bridge-spawn) 전수 실코드 일치 — 검토 대상 절 참조. flight 제거 7지점 열거도 현행 코드 기준 완전(신설 8번째 지점만 M-1).
- **PATCH 적용자는 implementer** — 리뷰어는 plan_review.md + PLAN 헤더 Status/Approval 동기화만 수행(헤더 `pending-revision` 전환은 이 리뷰에서 반영). M-1 문안·L-1..L-5 닫기와 author-close 후 `approved` 전환은 구현 PATCH에 포함할 것.
- Advisor: fable-advisor consulted: yes. (verdict 일치: pending-revision, M-1 캘리브레이션 "M 유지 — High도 L도 아님" 확정. 롤백-위치-클라이언트 설계·L-1 신세대 결과 채택·L-2 fail-fast 권고는 advisor 보강, L-4 타이머 해제·L-5 테스트 ⑤ 모순은 advisor 발견.)

---

## Review R28 — Plan v0.23.3 (conv 워커 산출물 파일-기반 artifact 트리거 — §5.1 자가 적용 규약, PATCH)

**검토 대상:** `docs/PLAN.md` `#### 0.23.3` changelog + header + `docs/CONV_SPEC.md` §5.1–5.3(R24 approved 정본 — 스펙 재론 없음, 이전 충실도만 심사) + 코드 대조(`packages/host/src/bridge-runtime.ts:696-745` startConvPane — `:706` `LOOM_CONV` env 전달·`:737-738` goal 프롬프트 주입 지점(규약 문구 추가 지점 실재), `:790-877` sendWorkerTurnFromPane — `:831` 기존 32k 측정 트리거(`output.length > MAX_CONV_TURN_INLINE_CHARS`) 유지 확인·마커 소비부 삽입 지점, `packages/host/src/conv-artifact-pack.ts:44-99` packageConvTurnArtifact — `:58-60` seq 키 파일 쓰기·`:79-81` inline text 대체(M-1 근거), `packages/protocol/src/conv-contract.ts:109-128` ArtifactRefEntrySchema·artifacts max 16·`:212-236` validateScpArtifactRef prefix 강제·`:240-251` convArtifactsRootLiteral + loomDir() divergence 주석(L-2 근거)·`:270-340` 제시 렌더 charset allowlist) + `docs/plan_review.md` R23(브릿지 신뢰 경계)·R26(§5.2 생산자 선례) + `HANDOFF.md` 0.23.1 실물 스모크 기록·`tasks/lessons.md` 2026-07-18 (3)(실측 근거)
**검토자:** Fable 5 (fable-advisor) — claude-rev 필수 컨설트 완료. **Advisor: fable-advisor consulted: yes.**
**날짜:** 2026-07-18
**결론:** **`pending-revision` → M-1 lock PLAN 본문 반영 + L-1..L-3 author-close → author-close `approved`** (Fable 사전 승인, no R28b).

**Author-close 완료 (2026-07-18, claude-impl):** M-1 — PLAN 0.23.3 "브릿지 — 마커 소비부" 행을 lock 문안으로 교체(방출 계약만 재사용·파일 쓰기 생략·ref 파일명=마커 파일명·inline text 부가·다건 누적·동시 발화 병존·`turn-*` 예약) + 테스트 행 보강(다건 ref path/sha 상이·동시 발화 병존). L-1 — 정확 라인 앵커 + conv별 (파일명, sha256) dedup 문안·테스트 행. L-2 — 실측 경로 전달(env `LOOM_ARTIFACTS_DIR` + 규약 문구 실경로 삽입) + `mkdir -p -m 700` 권고. L-3 — TOCTOU·hardlink 신뢰 모델 한정 명시 + root 쪽 realpath 문안·테스트 행. 사전 승인 경로(no R28b)에 따라 재리뷰 없이 `approved` 전환.

### 결정적 발견 (성패 지점)
이 PATCH의 실질은 **artifact 생산 트리거의 측정 주체를 브릿지(스크레이프 길이)에서 워커(마커 선언)로 옮기면서, 워커 제어 입력(파일명)이 브릿지의 파일 읽기·전송을 유도하는 신뢰 경계 인접 경로를 신설**하는 것이다. 보안 설계는 건전함을 확인했다: charset `[A-Za-z0-9._-]` + 선행 `-`/`.` 금지가 `..`·경로 구분자·인자 주입을 원천 차단하고, realpath containment가 심링크 탈출을 fail-closed로 막으며, "워커가 읽을 수 있는 파일은 원리상 pane 출력으로도 (분할) 전달 가능 — 새 능력은 브릿지가 전송 주체가 되는 것뿐"이라는 신뢰 모델 논증(R23 승계)도 타당하다(워커=브릿지 동일 사용자 로컬 자율 프로세스). 그러나 **방출 측 문안이 실코드 계약과 모순**된다: PLAN은 "파일 읽어 sha256·chars 계산 → 기존 0.23.1 방출 경로 재사용(`packageConvTurnArtifact` 계약)"이라 쓰면서 같은 표에서 "마커 다건 허용(파일별 ref 1건, 상한 예: 턴당 4건)"을 명시하는데, 이 함수는 fullText를 **`turn-<seq>.txt`로 직접 쓰고**(`conv-artifact-pack.ts:58-60`) **inline text를 파일 tail+notice로 대체**하며(`:79-81`) ref 파일명이 seq 기반이다 — 문안대로 호출하면 다건 마커가 같은 seq → 같은 파일 클로버 → 복수 ref가 같은 path에 다른 sha256(선행 ref 무결성 즉시 파탄), inline 턴은 워커의 실제 pane 메시지를 잃고, ref 파일명 ≠ 마커 파일명이 된다. R25/R26 M 기준("문안대로 구현하면 결함이 스펙 준수의 결과물") 정확히 부합 → M-1.

### Checklist
- [x] **갭 실재 (Why 정확)** — 2026-07-18 실물 스모크 실측: Claude Ink TUI pane 스크레이프는 소스 모드·줄수 무관 ~5.3k 상한(원시 shell pane은 `recent 500`=51.7k — 차이 원인은 TUI 렌더 버퍼), 32k 측정 트리거(`bridge-runtime.ts:831`) 라이브 도달 불가. HANDOFF·lessons 기록과 일치.
- [x] **대안 기각 근거 타당** — (b) herdr `pane.read` 소스 3종 전부 렌더 버퍼 종속(upstream 기능 요청 외 불가), (c) 임계 ~5k 하향은 CONV_SPEC §5.1(32k) 위반 + TUI chrome 오염 스크레이프 패키징. (a)가 §5.1 *"판정이 기계적이라 워커 CLI가 프롬프트 규약만으로 자가 적용"* 원문과 직접 정렬 — 스펙 재론 없음 확인.
- [x] **규약 문구 삽입 지점 실재** — conv 스폰 경로 `startConvPane`(`bridge-runtime.ts:696-745`)에서 `LOOM_CONV` env 전달(`:706`) 기존재, goal 주입(`:737-738` `wrapUntrustedPrompt(payload.goal)`)에 브릿지-저작 규약 문구를 덧붙일 지점 실재. 워커는 `LOOM_CONV`로 `<convId>`를 이미 안다(0.23.0).
- [x] **기존 트리거 유지 (회귀 없음 주장)** — `:831` `output.length > MAX_CONV_TURN_INLINE_CHARS` 경로 실재·무변경 계획 확인. 단 마커와 동시 발화 시 조합이 미규정(M-1에 포함).
- [x] **소비부 무변경 주장 실증** — 워커 파일명 charset `[A-Za-z0-9._-]`은 타워 측 검증·렌더를 그대로 통과: `ArtifactRefEntrySchema` path max 1000(`conv-contract.ts:105`)·artifacts max 16(`:128` — 턴당 4건 상한과 정합), `validateScpArtifactRef` 정규화 후 `~/.loom/artifacts/<convId>/` prefix 강제(`:212-236`), 제시 렌더 allowlist `[A-Za-z0-9._/-]`(`:272`) ⊇ 마커 charset. wire 스키마·M-2 검증·제시 표면 전부 무변경 — 생산 트리거만 추가라는 주장 성립.
- [x] **보안 4계층 (판단 핵심)** — ① 파일명-only(경로 구분자 charset 밖) ② charset + 선행 `-`/`.` 금지(`..`은 선행 `.` 금지로 커버) ③ realpath containment fail-closed(심링크 탈출 차단) ④ 10MB 상한. 신뢰 모델 논증 타당(위 결정적 발견). 보강 각도는 L-3(hardlink 명시·root 쪽 realpath·TOCTOU 방어심층).
- [x] **마커 위조** — conv pane은 브릿지 스폰 전용(herdr pane 주입은 M-2 경로 공용)이라 제3자 기입 불가. 단 **타워 주입 턴 문구가 pane에 echo되어 스크레이프에 잔존하는 경로는 실존** — containment 덕에 영향이 해당 conv의 artifacts 디렉터리 내로 한정되고(그 파일들은 어차피 같은 peer 앞으로 방출될 것들), L-1 정확-라인-앵커로 오탐을 축소한다. 격상 불요.
- [x] **fail-open/fail-closed 배치** — 파일 부재·검증 실패 = 턴 정상 진행 + note 사유(적절: 산출물 전달 실패가 conv를 죽이면 안 됨), containment 탈출·크기 초과 = fail-closed(적절). 스모크 재설계(후보 ⑪ 흡수 — benign 실파일 전달형)도 실측 블로커(capable 모델의 injection형 거부)에 대한 정확한 대응.
- [x] **테스트 열거** — 거부 케이스·realpath 탈출·부재 note·상한·다건·기존 32k 회귀·인라인 회귀 커버. 단 M-1(다건 sha 구별·동시 발화)·L-1(잔존 마커 dedup)·L-3(root realpath) 케이스 추가 필요 — 각 finding에 명시.

### Findings (Sev: High|Med|Low)
- **M-1 (Med, binding — PLAN 문안 lock): "기존 0.23.1 방출 경로 재사용" 문안이 `packageConvTurnArtifact` 실계약과 모순 — 문안대로 구현하면 다건 마커 무결성 파탄.** 근거는 결정적 발견 참조. 잠글 문안: **"방출 계약(틸드-리터럴 ref.path root·sha256/chars/gist·scp transport — R26 L-1 양식)만 재사용하고, 파일-기반 입력에는 `packageConvTurnArtifact`의 파일 쓰기 단계를 적용하지 않는다(파일은 워커가 이미 썼다 — 재기록·이중 저장 금지). ref 파일명 = 검증 통과한 마커 파일명 그대로. inline turn text = pane 스크레이프 원문(±마커 라인) + artifact notice 부가 — 파일 tail로 대체하지 않는다. 다건 마커는 파일별 ref 1건씩 artifacts[]에 누적(상한 초과분 무시 + note). 32k 측정 트리거와 마커가 같은 턴에 동시 발화하면 양쪽 ref를 병존 방출하되, 측정 트리거 산출물 파일명 `turn-<seq>.txt`와의 충돌 방지를 위해 `turn-*` 파일명 패턴을 브릿지 예약 네임스페이스로 규정(마커 파일명으로 거부 또는 문구로 금지 고지)."** + 테스트 행 추가: 다건 마커 → ref별 path·sha256 상이 검증, 동시 발화 병존 케이스. (advisor 확정 — `turn-*` 네임스페이스 충돌은 advisor 발견.)
- **L-1 (Low, author-close): 접힌 렌더 버퍼의 이전 턴 마커 잔존 → 다음 턴 재탐지·중복 ref 재방출.** 스크레이프 창(recent 200줄, 실측 ~5.3k)은 턴 경계로 리셋되지 않으므로 턴 N의 `[ARTIFACT]` 라인이 턴 N+1 스크레이프에 그대로 남는다. 닫기: conv별 방출 기억 (파일명, sha256) — 재탐지 시 sha 동일하면 skip(파일 갱신으로 sha가 다르면 정당 재방출), 마커 매치는 정확 라인 앵커(행 전체 `[ARTIFACT] <파일명>` 일치)로 한정해 타워 주입 문구 echo·대화 중 마커 언급 오탐도 함께 축소 + 테스트 행("이전 턴 마커 잔존 스크레이프 → 중복 ref 미방출").
- **L-2 (Low, author-close): 규약 문구의 `~/.loom/...` 리터럴 vs 브릿지 실제 `loomDir()` divergence.** 워커에게 지시하는 기록 경로는 `~/.loom/artifacts/<convId>/`인데 브릿지는 `loomDir()/artifacts/<convId>/`에서 읽으며, legacy `~/.fable` divergence가 코드에 문서화된 실재 케이스(`conv-contract.ts:240-251` 주석). 해당 환경에선 마커가 항상 파일 부재 note로 귀결(fail-closed라 안전하나 기능 불성립). 닫기: 스폰 시 실측 디렉터리를 워커에 전달(예: env `LOOM_ARTIFACTS_DIR` 또는 규약 문구에 브릿지가 실경로 삽입) + 규약 문구에 `mkdir -p -m 700` 권고(기존 0700/0600 관례 정합).
- **L-3 (Low, author-close): containment 계층의 방어심층 보강 3점 명시.** ① realpath 검사→read 사이 TOCTOU(심링크 스왑)와 ② hardlink(realpath로 미포착)는 신뢰 모델상 신규 능력이 아님(동일 사용자 자율 워커 — PLAN §Security 논리 그대로)을 본문에 한 줄 명시해 후속 리뷰의 재발굴 방지, ③ containment 비교 시 **root 쪽도 realpath**(파일만 resolve하고 root를 리터럴 비교하면 macOS `/var→/private/var`류에서 오판) — 테스트 행 1건 추가. (③ advisor 발견.)

### Decision notes
- **verdict 구조 (R25/R26 동형):** M-1은 R25 M-1·R26 M-1과 같은 부류 — 문안대로 구현하면 결함(다건 클로버·메시지 소실·파일명 불일치)이 스펙 준수의 결과물이 되는 왜곡이라 본문 반영 전 착수를 허용한 선례가 없다. PLAN이 다건 허용을 명시하면서 단일-파일-클로버 함수 재사용을 지시하는 **내부 모순**이므로 즉시 approved 부적합. 재리뷰 필수까지 갈 사유도 없음 — lock은 설계 재작업이 아닌 방출 계약 문안 고정이고 원시(검증·해시·ref 조립·렌더)는 전부 기존재. M-1 반영 + L-1..L-3 author-close 후 재리뷰 없이 `approved` 전환(no R28b).
- **결정을 가르는 리스크:** M-1을 잠그지 않으면 구현 lane이 `packageConvTurnArtifact` 호출을 문자 그대로 재사용해 다건 케이스에서 무결성 파탄 코드를 정확히 스펙대로 작성하게 된다. 나머지는 전부 문구·테스트 보강.
- **보안 판단 요지:** 신설 신뢰 경계(워커 제어 파일명 → 브릿지 읽기·전송)는 4계층 + 신뢰 모델 논증으로 충분 — 이 PATCH가 부여하는 새 능력이 "브릿지가 전송 주체가 되는 것"뿐이라는 서술이 정확하고, 탈출 각도(traversal·심링크·마커 위조)는 전부 fail-closed 또는 conv 디렉터리 내 한정임을 코드·설계 양면에서 확인. 격상 finding 없음.
- **기존 게이트 승계 무변:** artifact fetch 자동 실행 금지(제시까지 — 0.23.0/R26)·자동 git push 유예·단발 card result 경로 분리(§5.5) 그대로.
- **PATCH 적용자는 implementer** — 리뷰어는 plan_review.md + PLAN 헤더 Status/Approval 동기화만 수행(헤더 `pending-revision` 전환은 이 리뷰에서 반영). M-1 문안·L-1..L-3 닫기와 author-close 후 `approved` 전환은 구현 PATCH에 포함할 것.
- Advisor: fable-advisor consulted: yes. (verdict 일치: pending-revision → author-close approved, no R28b. M-1 캘리브레이션 "M 맞음 — PLAN 내부 모순" 확정 + `turn-*` 네임스페이스 충돌·root 쪽 realpath는 advisor 발견, L-1 dedup의 (파일명, sha256) 기준·L-2 mkdir 권고는 advisor 보강.)

---

## Review R27 — Plan v0.23.2 (dispatch/conv agentKind allowlist 확장 codex·grok, PATCH)

**검토 대상:** `docs/PLAN.md` `#### 0.23.2` changelog + header + 코드 대조(`packages/protocol/src/card-contract.ts:18-19` 현행 enum claude-only, `packages/protocol/src/conv-contract.ts:11,50` 공용 enum import — 두 표면 동시 확장 확인, `packages/host/src/bridge-config.ts:21-23` DEFAULT_AGENT_ARGV claude-only·`:59-64` loadBridgeConfig 병합·`:101-112` resolveAgentArgv null-guard + shell/sh/bash 금지, `packages/host/src/bridge-runtime.ts:434-440` 카드 `agent_kind_not_allowed` fail-closed·`:589-591` conv reject·`:344-350` pollTimer 예외 삼킴 경로·`:372-377` claim 선행, `packages/host/src/conv-ops.ts:94` agentKind `"claude"` 하드코딩, `packages/mcp-server/src/stdio.ts:254-259` dispatch_card agentKind 기노출·`:289-307` conv_open 스키마 agentKind 현재 부재) + `docs/plan_review.md` R23(브릿지 신뢰 경계·§4.4.2 argv 금지 원칙)·R25·R26 선례(심각도 캘리브레이션)
**검토자:** Fable 5 (fable-advisor) — claude-rev 필수 컨설트 완료. **Advisor: fable-advisor consulted: yes.**
**날짜:** 2026-07-18
**결론:** **`approved`** (즉시 승인 — M-lock 없음. L-1·L-2는 구현 PATCH 내 author-close, 재리뷰 불요.)

**Author-close 완료 (2026-07-18, claude-impl):** L-1 — `bridge-config.ts` 신규 `sanitizeAgentArgv()`(비배열/빈배열/비문자열-요소 값 병합 시 드롭 = 미등록 fail-closed) + 테스트 4종. L-2 — HERDR_DESIGN §4.4.2 설정 예시 블록에 등록 의미 고지 문장 삽입. 구현 커밋에 포함(아래 PLAN Implemented-as-of).

### 결정적 발견 (성패 지점)
이 PATCH의 실질은 **원격 실행 표면 1종→3종 확대의 유일한 게이트가 "브릿지 로컬 argv 명시 등록(기본 미등록 = 0.23.1과 완전 동일 동작)"이라는 fail-closed 불변식**이다. 코드가 이를 실제로 보증함을 확인했다: 기본값은 claude만(`bridge-config.ts:21-23`), 미등록 kind는 `resolveAgentArgv` null → 카드 failed(`bridge-runtime.ts:434-440`)·conv reject(`:589-591`), wire에는 enum kind만 실리고 argv 매핑은 로컬 설정 전유(§4.4.2 유지). R25/R26과 달리 스펙 이전-충실 왜곡이나 경계 미규정이 없다 — 핵심 보수 결정("신규 kind의 기본값을 등록하지 않는 것")이 PLAN 본문에 이미 명문이므로 문안 lock이 필요 없다.

### Checklist
- [x] **필요 실재** — 0.23.0 Out-of-scope가 이 확장을 후속 PATCH로 명시 예약, HANDOFF 실측 제약("herdr dispatch allowlist = claude만") 실재, herdr의 grok/codex pane agent 감지 기지원(pane list 실측) — Why 서술 정확.
- [x] **코드 현행 대조** — PLAN이 주장하는 6개 파일 사실관계(공용 enum·DEFAULT claude-only·fail-closed 경로 2곳·convOpen 하드코딩·dispatch_card 기노출/conv_open 미노출) 전부 실코드 일치. 인용 줄번호 미세 드리프트(:434→실제 reason 문자열 :440, :589→:591)는 경로 시작점 표기로 무해.
- [x] **2계층 방어 유지(보안 판단 핵심)** — ① wire argv 금지(enum kind만) + ② 로컬 opt-in 등록. 기본 미등록 노드의 동작은 0.23.1과 완전 동일 — "변경 없음이 곧 설계" 서술 타당.
- [x] **envelope `AgentKindSchema`(peer identity)와 별개 enum** — 이미 codex/grok 수용 중인 별도 스키마라 충돌 없음 (advisor 확인).
- [x] **하위호환 fail-closed** — 구버전 브릿지: 카드는 `payload_invalid` failed result 회신, conv.open은 무시. 후자는 reject 미송신(무신호)이라 타워가 timeout까지 대기하는데, kind 확장과 무관한 기존 parse-fail 동작이고 PLAN "무시" 서술이 정확 — 기록만, lock 가치 없음.
- [x] **per-kind dispatcher 차등 인가 out-scope 수용** — agentArgv 등록 자체가 노드 단위 per-kind 게이트(미등록 kind는 인가 dispatcher여도 스폰 불가). dispatcher×kind 매트릭스는 현행 단일-타워 모델에서 필요 근거 없음.
- [x] **shell/sh/bash 가드 성격** — 오퍼레이터가 임의 바이너리를 등록할 수 있는 이상 보안 경계가 아니라 footgun 가드 — codex/grok 키에도 동일 적용됨을 테스트로 고정하는 계획으로 충분, 가드 확장(zsh 등) 무의미.
- [x] **M-2 제출 분리 공용 경로** — 주입 코드 무변경으로 신규 kind 자동 적용. 주입 UX 튜닝(CLI별 스타트업 레이스) out-scope + 기존 후보 ⑤ 인접 표기 타당.
- [x] **테스트 열거** — 양 표면 미등록 fail·enum 왕복·argv 반영·가드 회귀·convOpen 전파·미지 kind 스키마 거부 충분. L-1 케이스 1건 추가.

### Findings (Sev: High|Med|Low) — author-close
- **L-1 (Low, author-close): `loadBridgeConfig`의 `agentArgv` 값 형상 미검증 — 오설정 시 fail-closed가 아니라 무신호 증발.** 병합(`bridge-config.ts:59-64`)이 `raw.agentArgv` 값 타입을 검증하지 않아, 오퍼레이터가 `"codex": "codex"`(배열 아닌 문자열)로 오기입하면 `resolveAgentArgv`의 `argv.some`(`:108`)에서 TypeError → 호출부가 아니라 pollTimer의 포괄 catch(`bridge-runtime.ts:344-350`)가 삼키는데, 이 시점엔 handoff가 **이미 claim된 후**(`:372-377`·conv도 동일)라 failed result/reject 없이 카드가 `doing` 고착 — R23 L-1(payload_invalid 회신으로 doing 고착 방지)이 막으려던 실패 모드의 재발 경로다. 이 PATCH의 활성화 경로가 정확히 "오퍼레이터 수기 JSON 편집"이라 지금 노출이 커진다. 닫기: 병합 시 배열-of-문자열 아닌 값 필터 한 줄 + PLAN 테스트 행에 "비배열 `agentArgv` 값 → 무시(=미등록 fail-closed)" 케이스 추가. Low 근거: 트리거가 오퍼레이터 자신의 로컬 오설정(신뢰 입력)이고 보안 경계 아님 — 견고성 결함. (advisor 발견, claude-rev 코드 재검증으로 귀결 구체화.)
- **L-2 (Low, author-close): 브릿지 설정 예시 블록에 등록 의미 고지 한 줄.** PLAN이 약속한 "브릿지 설정 예시 1블록"(HERDR_DESIGN §4.4.2)에 "argv 등록 = 해당 CLI의 기본 자율성(권한 모델·자동 실행 특성) 수용 — 가드레일 플래그는 오퍼레이터가 argv에 직접 포함하라"를 명시. 근거: codex/grok CLI의 자율실행 가드레일은 claude CLI와 다르고, 신뢰 결정 지점이 등록 행위 자체이므로 그 의미를 문서가 고지해야 R23 "워커 pane = 자율 실행 전용" 신뢰 모델의 오퍼레이터 측 절반이 완성된다. M 불요 — 경계 자체는 R23 모델에 이미 포섭.

### Decision notes
- **즉시 `approved` 근거 (R25/R26과 다른 verdict 구조):** M-lock 부재 — 선례상 M은 "문안대로 구현하면 오독이 유도되는 왜곡"(R25 M-1, R26 M-1) 또는 "신규 표면에 선언된 경계 미적용"(R24, R26 M-2)인데, 이 PATCH는 핵심 보수 결정이 본문에 이미 명문이고 fail-closed 원시가 코드에 기존재·기동작한다. L 2건은 설계 재작업이 아닌 한 줄 필터+문서 고지라 구현 PATCH 내 author-close로 충분(R19–R21 pure-L 선례), 재리뷰 불요.
- **결정을 가르는 리스크:** 원격 실행 표면 1→3종 확대의 유일한 게이트가 로컬 명시 등록 fail-closed 불변식이라는 것 — 이 불변식이 코드로 보증됨을 확인했으므로 승인. 이 불변식을 약화시키는 미래 변경(신규 kind 기본 등록, wire 유래 argv 힌트 등)은 반드시 별도 R{n}.
- **기존 게이트 승계 무변:** fetch 자동 실행·자동 git push의 "별도 R{n} 게이트"(R26 decision note) 그대로. per-kind 차등 인가는 필요 근거 발생 시(멀티 dispatcher 등) 재론.
- **PATCH 적용자는 implementer** — 리뷰어는 plan_review.md + PLAN 헤더 Status/Approval 동기화만 수행. L-1 필터·테스트 케이스와 L-2 고지 문안은 구현 PATCH에 포함할 것.
- Advisor: fable-advisor consulted: yes. (verdict 일치: approved, M 없음; L-1은 advisor 발견을 claude-rev가 코드 재검증으로 귀결 구체화 — "예외"가 아니라 "claim 후 무신호 증발 = doing 고착"임을 확인.)

---

## Review R26 — Plan v0.23.1 (§5.2 artifact 패키징 호출부 PATCH)

**검토 대상:** `docs/PLAN.md` `#### 0.23.1` changelog + header + `docs/CONV_SPEC.md` §5.1–§5.5(approved 정본 — 스펙 결정 재론 없음, 이전 충실도만 심사) + 코드 대조(`packages/host/src/bridge-runtime.ts:780-860` truncateTail 폴백·MVP 갭 주석·paneRead 회수 창, `packages/protocol/src/conv-contract.ts:85-237` artifact 스키마·M-2 검증 함수 2종 — **호출부 부재 확인**, `packages/host/src/conv-ops.ts:75-82` open 시 displayName 조회) + `docs/plan_review.md` R24·R25 선례(심각도 캘리브레이션)
**검토자:** Fable 5 (fable-advisor) — claude-rev 필수 컨설트 완료. **Advisor: fable-advisor consulted: yes.**
**날짜:** 2026-07-18
**결론:** **`pending-revision` → M-1/M-2 locks PLAN 본문 반영 + L-1/L-2 author-close → author-close `approved`** (Fable 사전 승인, no R26b).

**Author-close 완료 (2026-07-18):** claude-impl이 M-1(scp host 해석 출처 = 수신측 로컬 명시 구성 + 매핑 부재 fail-closed)을 `docs/PLAN.md` 0.23.1 타워 행에, M-2(POSIX 단일인용 + charset allowlist)를 신설 "제시 문자열 렌더링 규약" 행에 반영. L-1(ref.path 틸드-리터럴 — 브릿지 방출·타워 검증 양형 + 인용 상호작용)·L-2("전문"=회수 스크레이프 전문 한정, gist 안내 문구에 회수 창 명시)를 author-close 완료. 사전 승인 경로(no R26b)에 따라 재리뷰 없이 `approved` 전환.

### 결정적 발견 (성패 지점)
이 PATCH의 실질 신뢰 경계는 **pin된 상대가 만든 wire-유래 문자열이 타워의 ssh·셸 인접 표면에 도달하는 경로**다. 두 곳에서 그 경계가 문안으로 고정되지 않았다: (a) PLAN은 CONV_SPEC §5.3③ "수신측 **로컬 설정**의 conv 상대 노드 매핑"을 "**로컬 conv state의** pinned peer→node 매핑"으로 옮겼는데, conv state의 node 식별자는 open 시점 자기신고 displayName 조회(`conv-ops.ts:81-82`)에서 온 wire-유래 값이고 타워에 peerId→ssh host의 수신측 명시 로컬 구성은 존재하지 않는다 — 이 문안대로 구현하면 자기신고 displayName이 scp host로 흘러 §5.3③이 신뢰 입력에서 제거한 것이 되살아난다(M-1). (b) M-2 검증 함수는 argv-수준 방어(`--`·선행 `-`·known-remote — `conv-contract.ts:175-193`)인데 이 PATCH가 신설하는 산출물은 **셸에 붙여넣어질 것이 예정된 문자열**이고, branch/path 스키마는 charset 무제약(`:92`,`:105`)이라 `$(…)`·공백·`;` 포함 값이 검증을 통과한다(M-2). "제시-only"(자동 실행 없음) 매개가 둘을 Med에 묶어두는 유일한 끈이므로, 그 끈 자체를 PLAN 문안으로 고정하는 것이 이번 리뷰의 실질이다. 둘 다 문안 lock으로 닫히고 wire 변경 불요.

### Checklist
- [x] **갭 실재** — truncateTail 폴백(`bridge-runtime.ts:808,826,831` + MVP 갭 주석)·M-2 검증 함수 완성+호출부 부재(`conv-contract.ts:166-237`) 코드 대조로 사실 확인 — PLAN Why 서술 정확.
- [x] **§5.1 이전 충실(절단 금지)** — 전문 파일 기록 + truncate 폴백 제거 + 인라인 gist ≤32k. 단 "전문"의 회수 창 한정 필요(L-2).
- [x] **§5.2 수단 분류** — pane 스크레이프 = 로그성 산출물 → scp 규약 정본 경로(§5.2 ② 정확 부합). 브릿지 **자동 git push out-of-scope 유예 타당** — 브릿지의 git 실행은 원격 실행 표면 확대라 0.22.0 이래 보수 절삭 선례와 일관; 워커 에이전트 자체 push의 ref 전달은 스키마상 이미 가능하므로 기능 공백도 아님.
- [x] **§5.3 M-2 소비부 규약** — 검증 통과분만 조립·실패 ref 미조립+사유 표시·wire host 표시조차 불신·argv 배열 조립 전부 충실. 단 host 해석 **출처** 문안 왜곡(M-1) + 제시 문자열 표면 미규정(M-2).
- [x] **§5.4 수명** — 정리 자동화 out-of-scope 승계(R25 L-4)와 일관.
- [x] **브릿지 = M-2 ref 생산자 표면(보안 판단 ①)** — 패키징 대상 convId는 스키마 검증·pin된 flight state에서만 오고(fail-closed가 미지 convId를 패키징 전에 차단), `turn-<seq>.txt` 파일명 구성요소 전부 로컬 생성값 — 경로 주입면 없음. 0700/0600·`loomDir()` 경유 M-14 정합. "생산 측 규약 위반 시 수신 검증이 정당 거부"를 테스트로 고정하는 계획 타당.
- [x] **자동 실행 없음 원칙 유지(보안 판단 ②)** — 유지 확인. fetch 자동 실행을 도입하는 미래 버전은 M-1/M-2가 즉시 High로 승격되므로 R{n} 재리뷰 필수 — out-of-scope의 "별도 게이트" 문안이 취지 커버.
- [ ] **scp host 해석의 수신측 로컬 설정 출처 고정** — binding lock (M-1).
- [ ] **제시 문자열 셸 안전성 규약** — binding lock (M-2).

### Findings (Sev: High|Med|Low) — binding locks
- **M-1 (Med, binding): scp host 해석 출처를 수신측 로컬 명시 구성으로 고정.** PLAN 타워 행의 "로컬 conv state의 pinned peer→node 매핑에서 해석"을 교체: "host는 **수신측 로컬 명시 구성(설정)**의 peer/node→ssh host 매핑에서만 해석한다 — conv state에 기록된 자기신고 displayName을 host로 쓰는 것 금지. **매핑 부재 시 명령 미조립 + 사유 표시(fail-closed)**." `validateScpArtifactRef`의 resolveHost null 경로(`conv-contract.ts:222-227`)가 fail-closed 원시로 이미 존재 — 문안 고정만 필요. 근거: §5.3③ 충실 이전 교정(신규 결정 아님) — R25 M-1과 동일 부류(이전 중 누락에 의한 왜곡, 문안대로 구현 시 오독 유도). 위장 displayName(`internal-backup` 등)으로 타워 ssh 자격이 임의 host에 연결 시도되는 경로 차단.
- **M-2 (Med, binding): fetch 명령 제시 문자열 렌더링 규약.** PLAN에 고정: 제시 문자열 렌더링 시 **POSIX 단일인용 필수**(내장 `'`는 `'\''` 이스케이프) + branch·path의 convId-prefix 이후 접미에 **charset allowlist**(`[A-Za-z0-9._/-]`, 세그먼트 선행 `-` 금지)를 심층방어로 병행. 근거: 검증 함수는 argv-수준 방어이고 스키마는 charset 무제약이라 `conv/<convId>/$(cmd)` 형 branch·path가 통과 — 제시 문자열의 유력 복붙 실행자는 `conv_await` 결과를 컨텍스트로 받는 **타워 LLM 에이전트 자신**이라 "사람이 눈으로 거른다" 가정이 약하다. 스펙 재론 아님 — §5.3은 조립을 방어했고 "셸에 붙여넣어질 문자열" 표면은 0.23.1이 신설(R24 M-1/M-2와 같은 "신규 표면에 선언된 경계 적용" 부류).
- **L-1 (Low): ref.path wire 형식 규약 — 틸드-리터럴 고정.** 브릿지는 `loomDir()` 절대경로에 기록하지만 wire의 `ref.path`는 규약형 `~/.loom/artifacts/<convId>/…` **틸드-리터럴**로 방출, 타워 검증 root도 동일 리터럴형, 확장은 원격측. 절대경로 방출 시 크로스머신에서 prefix 전량 불일치(기능 불성립) 또는 브릿지 홈경로 노출. M-2 인용과의 상호작용 한 줄 포함(단일인용 시 로컬 셸 틸드 확장이 죽으므로 scp 원격 경로 위치에서만 유효한 형태로 렌더링). **브릿지 방출·타워 검증 양쪽 형태를 정하므로 구현 착수 전 author-close 필수.**
- **L-2 (Low): "전문 보존" 주장의 정직한 한정.** 현행 paneRead는 `recent` 200줄 창(`bridge-runtime.ts:803-806`) — 창 밖 출력은 artifact 파일에도 없으므로 "전문"은 "회수된 스크레이프의 전문"이다. gist/안내 문구에 회수 창 명시로 한정하거나, herdr가 지원하면 패키징 경로에서 회수 범위 확대. 회수 범위를 늘리는 후속 버전에서는 artifact 파일 크기 상한 질문이 되살아남(그때 재론 — 현재 non-finding). author-close.

### Decision notes
- **verdict 구조:** R23/R24/R25 선례 — **M-lock 문안이 PLAN 본문에 그대로 들어가는 것**이 author-close 조건. 즉시 approved 부적합: M-1이 R25 M-1과 동일하게 문안대로 구현하면 오독이 유도되는 스펙 왜곡 교정이라 본문 반영 전 착수를 허용한 선례가 없다. 재리뷰 필수까지 갈 사유도 없음 — 두 lock 모두 설계 재작업이 아닌 문안 고정이고 원시(resolveHost fail-closed·argv 조립)는 코드에 이미 존재. Med 2건 반영 + Low 2건 author-close 후 재리뷰 없이 `approved` 전환(no R26b). PATCH 적용자는 implementer — 리뷰어는 plan_review.md 외 수정 금지이므로 PLAN 헤더 Status 동기화도 PATCH에 포함할 것.
- **M-1 심각도 근거 (High 아님):** (a) 제시-only라 실행에 사람/에이전트 매개가 남고 (b) 공격자는 이미 accept된 pinned 상대여야 함 — R24 M-2를 Med로 둔 논거("M-1 pin 전제 시 상대 오염 선행 필요")와 동일 구조.
- **M-2 심각도 근거:** 같은 매개("제시-only")가 상한을 Med에 묶는다. **fetch 자동 실행을 도입하는 순간 M-1/M-2 둘 다 즉시 High 승격** — 반드시 별도 R{n} 게이트(현행 out-of-scope 문안의 "별도 게이트" 취지 재확인).
- **(권고, non-binding)** 제시 문자열에 untrusted 출처 표지 프리픽스("untrusted 출처 — 실행 전 검증") 부착; gist + 안내 문구 합 ≤32k를 테스트 케이스에 포함(현행 `:828-831`의 note 후첨 `slice` 재클램프는 truncate 폴백 제거와 함께 재작성 예정이라 별도 조치 불요).
- **결정을 가르는 리스크:** pin된 상대의 wire-유래 문자열(자기신고 displayName·branch/path 접미)이 타워의 ssh·셸 인접 표면에 도달하는 경로 — M-1/M-2는 같은 부류의 두 구멍이고 "제시-only" 매개가 이를 Med에 묶어두는 유일한 끈이므로, 그 끈을 PLAN 문안으로 고정하는 것이 이번 리뷰의 실질이다.
- Advisor: fable-advisor consulted: yes.

---

## Review R25 — Plan v0.23.0 (conv 멀티턴 수직 슬라이스)

**검토 대상:** `docs/PLAN.md` `#### 0.23.0` changelog + header + `docs/UNKNOWNS.md` §0.23.0 + `docs/CONV_SPEC.md`(approved 정본 — 스펙 결정 재론 없음, 이전 충실도만 심사) + `docs/plan_review.md` R23·R24 locks 선례 + 코드 대조(`packages/protocol/src/card-contract.ts` 전문, `packages/host/src/bridge-runtime.ts:314-320` authorizedDispatchers 집합 검사·`:112-114` in-memory 상태 선례, `packages/protocol/src/sanitize.ts:18-50`)
**검토자:** Fable 5 (fable-advisor) — claude-rev 필수 컨설트 완료. **Advisor: fable-advisor consulted: yes.**
**날짜:** 2026-07-18
**결론:** **`pending-revision` → M-1/M-2 locks PLAN 본문 반영 + L-1..L-4 author-close → author-close `approved`** (Fable 사전 승인, no R25b).

**Author-close 완료 (2026-07-18):** grok-impl이 M-1(브릿지 측 conv↔peer pin·last-seen 집행)을 `docs/PLAN.md` 0.23.0 "host(워커/브릿지 측)" 행에, M-2(미지 convId fail-closed 기본값)를 What 표 직후 신설 단락("Fail-closed 기본값")에 반영. L-1(테스트 열거에 L-5 재송신 케이스 + 한도초과 pause 전이 케이스 명시)·L-2(convId 형식 출처를 "§1.1(개념)·§5.3①(형식)"로 정정)·L-3("정규화 후" 문구 복원)·L-4(§5.4 삭제 자동화 out-of-scope 명시)를 author-close 완료. 사전 승인 경로(no R25b)에 따라 재리뷰 없이 `approved` 전환.

### 결정적 발견 (성패 지점)
CONV_SPEC R24 M-1은 "conv.open/accept 시점에 convId↔상대 fromPeerId를 **양측이** 고정(pin)"인데, PLAN의 pin·last-seen·불일치 무시+로그 서술은 **host(타워 측) 행에만** 있다("타워 측 대칭 짝" 프레이밍). 브릿지 행은 open 시점 authorizedDispatchers 대조 + L-5 멱등만 — 이후 `turn`/`close`에 대한 브릿지 측 per-conv pin 대조·last-seen turnSeq가 없다. 이 공백은 실질적이다: (a) 브릿지가 수신하는 `turn`은 pane 주입으로 **매 턴 반복되는 프롬프트 주입면**이고 위조 `close`는 생성측(워커)의 §5.4 7일 삭제 시계를 가동한다. (b) authorizedDispatchers는 **집합** 검사라 인가 dispatcher 2명 시나리오 — M-1의 존재 이유 — 가 브릿지 측에서 정확히 미방어로 남는다. (c) PLAN이 미러 대상으로 지정한 0.22.0 코드(bridge-runtime.ts:314-320)가 바로 set-membership만 검사하는 선례라 "pin은 타워만" 오독이 우연이 아니라 유도된다. 문안 lock으로 닫히고 wire 변경 불요.

### Checklist
- [x] **스펙 이전 충실도(핵심 질문 a)** — turnSeq 배정 규약(L-1: open=0 타워/accept=1 워커/짝=타워·홀=워커)·kind 3종·M-2 ①~④·32k 절단 금지·한도/pause=타워 로컬 보드 전이(L-3)·L-4 매 턴 제출 분리·L-5 open 멱등·§3.4 카드 1장·4도구/no conv_apply 전부 충실, **왜곡 없음**. 누락은 M-1 브릿지 측(아래)과 "정규화 후" 문구(L-3)뿐.
- [x] **M-2 집행 계획 스펙 일치(핵심 질문 b)** — ①convId charset ②git ref prefix+`--`+선행 `-` 거부+로컬 기존 remote만 ③scp host 로컬 매핑 해석+path prefix ④sha256=post-fetch 전부 §5.3 문안 그대로. 검증 함수의 protocol 패키지 공유 배치 타당(양측 수신자 동일 함수).
- [x] **스코프 minimal-but-sufficient(핵심 질문 c)** — 계약·타워 상태·브릿지 확장·4도구·테스트 각각이 왕복 성립의 필요 조건 — 추가 절삭 불가. "fetch 명령 제시까지, 자동 실행 안 함"은 스펙보다 보수적 절삭으로 정당. agentKind `claude` 유지·직결 유보는 0.22.0 선례와 일관. 필수 추가는 lock 문안 외 없음.
- [x] **Unknowns 해소 시점(핵심 질문 d)** — 4건 모두 구현 중 해소 가능: ①conv_await 타임아웃은 timeoutSec 파라미터로 방어된 실측 문제 ②pane 수명은 스펙이 골격 제공(워커 일방 종료 불가 → pane 사망 = 브릿지 발 advisory blocked 턴, 타워가 continue/abort — 0.22.0 pane_closed→failed의 conv 버전; 선택을 `implementation-notes.md`에 기록) ③32k 정합 실측 ④제시 UX는 자동 실행 배제로 저위험. Unknown unknowns 중 **영속화는 M-2 lock으로 안전 기본값만 고정 후 구현 중 결정**, pane 컨텍스트 누적은 dogfood 관찰 사안.
- [x] **보안 섹션 위협 서술 정확** — 집합 검사·sanitize 한계(제어문자·ESC만 제거) 주장 코드 대조로 사실 확인.
- [ ] **R24 M-1 "양측 pin"의 브릿지 측 집행 명문화** — binding lock (M-1).
- [ ] **미지 convId fail-closed 기본값** — binding lock (M-2).

### Findings (Sev: High|Med|Low) — binding locks
- **M-1 (Med, binding): 브릿지 측 conv↔peer pin + last-seen 명문화.** PLAN 브릿지 행에 추가: "브릿지는 `conv.open` 수신(accept) 시 fromPeerId를 해당 conv에 pin하고, 이후 `turn`·`close`는 pin 불일치 시 무시+로그; 브릿지 측도 conv별 last-seen turnSeq를 유지하며 `seq ≤ last` 멱등 폐기." 테스트 열거의 "M-1 pin 위조 거부"도 **양측**(타워 수신 + 브릿지 수신) 케이스로 명시. 근거: CONV_SPEC §2.1 "양측이 고정" + §3.3 "수신측은 conv별 last-seen 유지"(양측 수신자) — 스펙 문안의 충실 이전이지 신규 결정 아님.
- **M-2 (Med, binding): 미지 convId fail-closed 기본값.** PLAN 본문에 한 줄 고정: "타워/브릿지가 모르는(pin 상태가 없는) convId의 `turn`/`close`/`done_proposal`은 무시+로그 — **재시작으로 상태를 잃은 경우 포함**. 미지 convId 수신을 계기로 발신자에게 re-pin하는 관대한 재입양(re-adopt) 금지." 영속화 설계 전체는 고정하지 않음 — 이 기본값만 고정되면 in-memory 수용(재시작 = conv 사망 → 재-open) vs 최소 영속 어느 쪽이든 보안 성질이 보존되어 구현 중 결정으로 안전. 근거: R24 M-1 "pin 부재 = 거부"의 자연 귀결 + R23 M-1 "설정 부재 시 기본 거부"의 대칭. UNKNOWNS 기록만으로는 부족 — 발명 방향 하나(re-adopt)가 재시작 후 하이재킹을 연다.
- **L-1 (Low): 테스트 열거 보강** — L-5(중복 `conv.open` → accept 재송신) 케이스와 한도 초과 pause 보드 전이 케이스 명시 추가("§3.4 보드 매핑 전이"에 묵시 포함이나 명시가 낫다). author-close.
- **L-2 (Low): convId 형식 출처 표기** — PLAN의 "§1.1·§5.3①"에서 §1.1엔 형식 규정 없음(개념만) — `§5.3①` 단독 또는 "§1.1(개념)·§5.3①(형식)"으로 정정. author-close.
- **L-3 (Low): "정규화 후" 문구 복원** — CONV_SPEC §5.3③은 "path는 **정규화 후** prefix 강제"인데 PLAN protocol 행은 "prefix 강제"만. 정규화 없는 prefix 검사는 `…/<convId>/../../` traversal을 통과시키므로 이 문구가 load-bearing(테스트 열거의 traversal 부정 케이스로 의도는 보존됐으나 문안 복원 필요). author-close.
- **L-4 (Low): §5.4 정리(7일 삭제)의 스코프 명시** — 이번 슬라이스가 삭제 자동화를 포함하는지 in/out 어디에도 없음. Security 섹션이 "위조 close = 삭제 시계 조기 가동"을 논거로 쓰므로 스코프 명시가 논거·구현 정합 조건 — 권고: out-of-scope 명시(1단계 삭제는 수동/생성측 판단). author-close.

### Decision notes
- **verdict 구조:** R23/R24 선례 — **M-lock 문안이 PLAN 본문에 그대로 들어가는 것**이 author-close 조건. 즉시 approved(R20/R21형)는 부적합: M-1이 스펙 왜곡(누락) 교정이라 본문 반영 전 구현 착수 시 오독이 유도됨. Med 2건 반영 + Low 4건 author-close 후 재리뷰 없이 `approved` 전환(no R25b). PATCH 적용자는 implementer(claude-impl) — 리뷰어는 plan_review.md 외 수정 금지이므로 PLAN 헤더 Status(`pending-review` → `pending-revision` → author-close 후 `approved`) 동기화도 PATCH에 포함할 것.
- **M-1 심각도 근거 (High 아님):** R24 M-1과 동일 논거(멀티턴 증폭으로 Med) — 단 이번엔 스펙이 이미 "양측"을 확정했으므로 신규 결정이 아니라 이전 누락 교정. 인가 dispatcher가 현재 dogfood 룸에서 1명이라 즉발 위험은 낮으나 M-1의 존재 이유가 2명 시나리오이므로 Low 불가.
- **M-2 심각도 근거:** 스펙 재론 아님 — 영속화 여부는 스펙이 침묵하는 영역이고, lock은 그 침묵 하에서도 보안 성질이 보존되는 기본값만 고정(WORKFLOW §3.5 Unknown을 안전하게 좁히는 전형).
- **(참고, non-finding)** conv 계약 열거에 `close`의 `reason: done|abort` 필드 미명시 — "§3.2 미러" 원칙과 스키마 왕복 테스트로 커버, 조치 불요.
- **결정을 가르는 리스크:** 인가 dispatcher 2명 시나리오에서 브릿지 측 pin 부재 — M-1이 존재하는 이유인 시나리오가 PLAN 문안대로 구현하면 워커 쪽(위조 턴이 pane에 매 턴 주입되는 반복성 프롬프트 주입면)에서 그대로 열린 채 남는다. 이것이 즉시 approved와 pending-revision을 가른다.
- Advisor: fable-advisor consulted: yes.

---

## Review R24 — docs/CONV_SPEC.md (크로스머신 CLI 멀티턴 대화 1단계 스펙)

**검토 대상:** `docs/CONV_SPEC.md` 전문(초안 v1, `cc23c3d` — PLAN 버전 아님, 구현 PLAN의 전제 게이트) + 닫힌 티켓 resolution 대조(lemonbalms/Loom #2 세션 의미론 · #5 가드레일 · #6 와이어 · #7 MCP 표면 · #8 긴 산출물 · #9 진화 가드) + `docs/HERDR_DESIGN.md` §3.1–3.7·§4.1–4.4 + 코드 대조(`packages/protocol/src/sanitize.ts:18-50`)
**검토자:** Fable 5 (fable-advisor) — claude-rev 필수 컨설트 완료. **Advisor: fable-advisor consulted: yes.**
**날짜:** 2026-07-18
**결론:** **`pending-revision` → M-1/M-2 locks 스펙 본문 문안 반영 + L-1..L-5 author-close → author-close `approved`** (Fable 사전 승인, no R24b).

**Author-close 완료 (2026-07-18):** grok-impl이 M-1/M-2 locks 문안을 `docs/CONV_SPEC.md` §2.1·§3.3(M-1 pin), §5.3(M-2 artifact ref 검증)에 반영하고, L-1(§3.3 turnSeq 배정)·L-2(§3.2 참조 표기)·L-3(§2.2 한도 집행 주체)·L-4(§4.2 워커 측 턴 수신)·L-5(§3.3 conv.open 중복 처리)를 author-close 완료. 사전 승인 경로(no R24b)에 따라 재리뷰 없이 `approved` 전환.

### 결정적 발견 (성패 지점)
스펙은 M-4 신뢰 경계를 §0에서 **선언**했으나, 멀티턴이 새로 여는 두 표면에는 그 경계를 **적용하지 않았다**. 특히 §5.3이 untrusted wire 입력인 artifact ref(branch·path·host)에 대해 "수신 CLI가 기계적으로 fetch 명령 조립"을 검증 규약 없이 명문화 — 구현자가 이 문장을 그대로 따르면 인자 주입(선행 `-` 브랜치명 등)·임의 host scp·path traversal이 **스펙 준수의 결과물**이 된다. 서버 sanitize는 방어가 아니다(제어문자·ESC만 제거, 셸 메타문자·경로 문자 통과 — sanitize.ts:18-50). 둘 다 R23이 잠근 것과 같은 부류("label/포맷 매치 ≠ 인가")이며 문안 lock으로 닫히고 wire 변경 불요.

### Checklist
- [x] **티켓 결정 8건 통합 충실도** — §1↔#2, §2↔#5, §3↔#6, §4↔#7, §5↔#8, §6↔#9 1:1 대응, 재해석·범위 확대 없음. §7이 research #3/#4 결론 정확 반영. §8 non-goal이 맵의 안개를 정직 승계.
- [x] **relay/protocol 무변경 원칙 일관** — 신규 시맨틱 전부 body 헤더+label attachment 컨벤션, 구 클라이언트 하위호환(best-effort 파싱).
- [x] **HERDR_DESIGN 정합** — §3.7 크기 사슬 재사용(conv 32k / card 200k tail-keep / relay 256k 분리 논거 §5.5 타당), M-9 상관키(`convId`), §4.1.3 이중 seq의 conv 확장(`turnSeq` last-seen 멱등 폐기).
- [x] **보드 매핑 §3.4** — TaskStatus 5종 재사용·신규 컬럼 없음·타워 로컬 보드 SSOT (HERDR §3.5 원칙 그대로).
- [x] **MCP 표면 §4** — 최소 4도구, `conv_await`가 기존 check/claim 재사용(M-6 수신 경로 불변), 별도 conv_apply 없음, 노드 조회는 기존 `list_peers` 필터.
- [x] **진화 가드 §6** — 전송-중립 불변식 + relay=제어판/직결=데이터판 + 정량 3신호는 필요조건·투자 결정은 사람. 내적 결함 없음 (#9 확정안 유지).
- [ ] **M-4 경계의 신규 표면 적용** — 타워 측 턴 발신자 바인딩(M-1)·artifact ref 검증(M-2) 미명시 → binding locks.

### Findings (Sev: High|Med|Low) — binding locks
- **M-1 (Med, binding): conv↔peer pin.** `conv.open`/`conv.accept` 시점에 convId↔상대 fromPeerId를 **양측이 고정(pin)**하고, 이후 모든 intent(turn·close·done_proposal 포함)는 pin된 peerId 불일치 시 무시+로그. 현행 §2.1의 authorizedDispatchers는 **집합** 검사라 인가 dispatcher가 2명이면 상호 conv 주입 가능하고, 타워 측 수신은 label+convId 라우팅뿐. 위조 턴 = 타워 에이전트의 대화 입력으로 소비되는 프롬프트 주입면, 위조 done_proposal = 완료 확정 플로우 구동, 위조 close = §5.4의 7일 삭제 시계 조기 가동(데이터 손실 인접). `fromPeerId` 서버 지정(M-9)이라 집행 원시는 이미 존재. R23 M-1(dispatcher 인가)의 타워 측 대칭 짝.
- **M-2 (Med, binding): artifact ref 검증 규약 (§5.3).** 최소 포함: ① `convId` 형식 규약(예: `conv_[a-f0-9]{16}`, 생성 주체=타워) — 브랜치명·경로에 쓰이므로 charset 고정이 traversal·인자 주입의 1차 방어. ② git ref는 `conv/<convId>/` prefix 패턴 매치 필수 + `--` 구분자 사용 + 선행 `-` 거부, remote는 수신측 로컬 설정의 기존 remote만(wire의 host/URL로 remote 추가 금지). ③ scp `host`는 wire 필드가 아니라 **수신측 로컬 설정의 conv 상대 노드 매핑**에서 해석(신뢰 입력에서 제거), path는 정규화 후 `~/.loom/artifacts/<convId>/` prefix 강제. ④ sha256은 fetch **후** 무결성 검증일 뿐 fetch 행위 자체의 방어가 아님을 명시.
- **L-1 (Low): turnSeq 배정 규약** — 시작값·홀짝 배정·open/accept의 seq 소비 여부 명시(예: open=0 타워, accept=1 워커, 이후 타워=짝/워커=홀). §3.3 "홀짝으로 검증 가능"은 배정 규약 없이는 미완. author-close.
- **L-2 (Low): §3.2 자기참조 오독** — CONV_SPEC.md:71 "모든 메시지는 §3.2 패턴"은 `HERDR_DESIGN §3.2` 지칭으로 명기. author-close.
- **L-3 (Low): 한도 집행 주체 명문화** — 타워=권위적 집행자(목표 소유자·보드 SSOT), **pause는 wire 어휘가 아니라 타워 로컬 보드 전이**(§3.2 intent에 pause 없음이 방증), 워커 측 한도 인지는 advisory blocked 턴. 미명시 시 구현자가 pause 메시지 타입을 발명할 위험. author-close.
- **L-4 (Low): 워커 측 턴 수신 메커니즘 + R23 M-2 턴별 적용** — 2번째 이후 턴이 워커에 도달하는 경로(워커도 conv_await를 도는가 vs 브릿지가 herdr `agent send`로 pane 주입) 명시. 후자라면 R23 M-2(제출 분리 — untrusted는 리터럴 send, 제출은 고정 상수 별도 호출)가 **매 턴** 적용됨을 명기 — 첫 프롬프트만 M-2 대상으로 오독될 여지 차단. author-close.
- **L-5 (Low): conv.open 중복/재전달 처리** — inbox 재통지·타워 재시도로 같은 convId의 open이 재도달 시 브릿지 동작(active/closed convId면 기존 accept 재송신 또는 reject) — §4.1.3 멱등 폐기 원칙의 conv.open 확장. L-1과 같은 단락에서 함께 닫기 가능. author-close.

### Decision notes
- **통합 충실도 판정(핵심 질문 a):** 8건 결정이 §1–§6에 1:1 대응, 왜곡·재론 없음. 티켓 resolution이 SSOT라는 전제 하에 이 리뷰는 결정 자체를 재심하지 않았고, 스펙 텍스트의 공백만 다뤘다.
- **verdict 구조:** R22·R23 선례 — **M-lock 문안이 스펙 본문에 그대로 들어가는 것**이 author-close 조건. Med 2건 반영 + Low 5건 author-close 후 재리뷰 없이 `approved` 전환(no R24b). PATCH 적용자는 implementer(claude-impl) — 리뷰어는 plan_review.md 외 수정 금지이므로 CONV_SPEC.md 상태 헤더(`초안 v1` → approved) 동기화도 PATCH에 포함할 것.
- **M-1 심각도 근거 (Low 아님):** R23 L-2(위조 [DONE])는 보드 반영 1회 방어였으나, conv에서는 위조 턴이 반복적·지시 전달성 대화 입력으로 소비되고 위조 close가 산출물 삭제 시계를 가동 — 멀티턴 증폭으로 Med.
- **M-2 심각도 근거 (High 아님):** WORKFLOW §5 엄격 해석 시 High 인접(기계 조립 fetch = 잠재적 임의 명령 실행)이나, 스펙 전용 문서 + M-1 pin 전제 시 공격자가 conv 상대방을 먼저 오염시켜야 함 → Med-binding blocking으로 충분. 단 M-4가 바로 그 오염 시나리오를 신뢰 모델 전제로 삼으므로 Low 불가.
- **한도 집행(L-3) 해석:** 스펙 구조에 이미 내재(타워=보드 SSOT·§1.4 "언제든 abort" = 발언권 무관) — 명문화만 필요, 설계 변경 아님.
- **스코프:** non-goal(§8) 부재 항목(2+3 상세·관전 UX·crash 저널·구현)은 결함 아님 — 티켓 #9가 의도적으로 안개 유지.
- Advisor: fable-advisor consulted: yes.

---

## Review R23 — Plan v0.22.0 (Loom×Herdr 노드 브릿지 수직 슬라이스)

**검토 대상:** `docs/PLAN.md` `#### 0.22.0` changelog + header + `docs/UNKNOWNS.md` §0.22.0 + `docs/HERDR_DESIGN.md` 전체(§2–§7) + `docs/spikes/STEP0-WSL2-NETWORKING.md` · `STEP0.5-HERDR.md`(fixtures 포함) + 코드 대조(relay room/server, protocol envelope/handoff-contract/sanitize, host task-board/sticky-*, cli index)
**검토자:** Fable 5 (fable-advisor) — claude-rev 필수 컨설트 완료. **Advisor: fable-advisor consulted: yes.**
**날짜:** 2026-07-17
**결론:** **`pending-revision` → M-1/M-2 locks PLAN 본문 반영 → author-close `approved`** (Fable 사전 승인, no R23b). FREEZE 예외 타당(오너 pull 2026-07-17, 이 게이트 하나만).

### 결정적 발견 (성패 지점)
설계의 신뢰 모델 전제 "오너의 dispatch 행위 = 실행 승인"이 **코드로 미집행**이었다. §3.2가 "브릿지는 label로만 라우팅"인데 attachment label은 room 내 **모든 peer**가 붙일 수 있으므로, 프롬프트 주입당한 room 내 에이전트 하나가 `loom-card-dispatch` handoff를 보내면 원격 노드에서 자율 실행 에이전트가 임의 프롬프트로 기동된다. `fromPeerId`는 서버 지정 + peerSecret 없이 탈취 불가(room.ts:443, 241-251)이므로 집행 원시는 이미 존재 → **M-1 dispatcher 인가**가 이를 잠근다. 이 lock 없이는 "별도 신뢰 모델" 승인 불가.

### Checklist
- [x] **resolveHandoff 재구성**(옵셔널 필드 유실 → §3.1 경로 B 기각 타당) — room.ts:417-450.
- [x] **M-9 서버 id 재생성 / fromPeerId 서버 지정**(스푸핑 불가) — room.ts:442-443, server.ts:381.
- [x] **claim first-wins + inbox 삭제 / trim 100 / peerSecret rejoin** — room.ts:594-640, 464-488, 261-266.
- [x] **health `version:1` / persist_failed fail-closed / rejoin unsolicited inbox.state** — server.ts:106-115, 392-405, 357-363.
- [x] **attachment 256k·32개 캡, AgentKind 닫힌 enum** — envelope.ts:34-44, 9-15.
- [x] **JSON.stringify sanitize-통과** — sanitize.ts:18-50; 단 zero-width/bidi 미이스케이프(L-3 보정).
- [x] **`intent:` 줄 시작 파싱 / `task:` 헤더 선례** — handoff-contract.ts:46, work-bus.ts:39.
- [x] **`.host.json`만 제외 → `.bridge.json` 필터 1줄 필요 주장 사실** — cli/index.ts:381.
- [x] **TaskStatus 5종·MAX_NOTE·mutateBoard 잠금** — task-board.ts:27-40, 64, 215-236.
- [x] **Step 0/0.5 go + fixture 고정 + C1–C3 설계 반영** — 두 spike 문서, UNKNOWNS §0.22.0.
- [x] **와이어 불변** — 기존 handoff 스키마(mode/attachments/label)만 사용, relay 변경을 암묵 요구하는 항목 없음. `node/wsl-1` displayName sanitize 생존(sanitize.ts:83-85).

### Findings (Sev: High|Med|Low) — binding locks
- **M-1 (High, binding):** **dispatcher 인가** — dispatch handoff의 `fromPeerId`가 브릿지 로컬 authorized-dispatcher allowlist(타워 peer id)에 있을 때만 실행. label 매치 단독 실행 금지. 비인가 dispatch 무시+로그. 설정 부재 시 기본 거부.
- **M-2 (Med, binding):** **제출 분리** — untrusted 텍스트는 `agent.send` 리터럴로만; 제출은 untrusted 무포함 고정 상수 입력(bare Enter) 별도 호출; prompt의 `pane.run` 인자 보간 영구 금지. (설계 §2.5-4 "send + 제출"이 no-Enter 실측·§4.4.1 `pane.run` 금지와 자기모순 — 메커니즘 미정의였음.)
- **L-1 (Low):** label 매치 + zod 파싱 실패 시 조용한 무시 금지 — `failed reason=payload_invalid` 회신(카드 `doing` 고착 방지). author-close.
- **L-2 (Low):** `apply_card_result`는 claim한 handoff의 `fromPeerId`/`node`를 카드 `assignee`와 대조 — 위조 `[DONE]` 차단. author-close.
- **L-3 (Low):** 크기 사슬 보정 — relay는 초과 attachment를 truncate가 아니라 **거부**(bad_message); 송신 측 사전 검증 필수. "무손실 통과"는 zero-width/bidi 한정 과장. `.nonneg()` → `.nonnegative()`. author-close.

### Decision notes
- **별도 신뢰 모델 판정(핵심 질문): 원리상 건전, M-1 없이는 불건전.** 워커 pane에는 자동 제출이 승인해버릴 "사람의 대기 중 권한 프롬프트"가 없고 pane의 존재 이유가 카드 실행 그 자체 → 승인 시점을 Enter-time에서 dispatch-time으로 옮기는 것은 정당. 단 dispatch-time 인가가 실제로 집행될 때만 성립 — M-1이 그 집행. **M-1 반영 조건부로 0.21.1 M-2(no-auto-submit)와의 구분을 승인한다.**
- **스코프:** minimal-but-sufficient — 저널·타임아웃·supervision 생략은 §2.6/§4.3 확장 경로 보존과 함께 정직하게 기록. 추가 절삭·필수 추가 없음.
- **at-most-once:** 6인 내부 도구 + board `doing` 가시성 + 사람 재발행 경로로 수용 가능.
- **테스트 전략:** 정직 — fixture 커밋됨(protocol 16 고정), relay 실물 in-process, 라이브 스모크 이원화는 0.21.1 선례 준수.
- **Unknowns:** 적정. "dispatcher 인가"만 register 부재였고 M-1 lock으로 흡수 — 별도 등록 불요.
- Advisor: fable-advisor consulted: yes.

---

## Review R22 — Plan v0.21.0 → 0.21.1 (PTY handoff inject)

**검토 대상:** `docs/PLAN.md` `#### 0.21.0→0.21.1` changelog + header + `docs/UNKNOWNS.md` §0.21.0 + `docs/ORIGIN.md` §1·§2 + Phase 1.5 verdict(`docs/spikes/PHASE-1.5-PTY.md`) + `packages/host/src/handoff-inject.ts`
**검토자:** Fable 5 (fable-advisor) — claude-rev 필수 컨설트 완료. **Advisor: fable-advisor consulted: yes.**
**날짜:** 2026-07-11
**결론:** **`pending-revision` → PATCH 0.21.1 (M-1…M-6) → author-close `approved`** (Fable 사전 승인, no R22b). FREEZE 예외 타당(오너 pull, 이 게이트 하나만).

### 결정적 발견 (성패 지점)
권한 승인 프롬프트 대기 중은 quiescence로 "유휴"처럼 보이나, `prepareInjectText`의 **trailing `\n`이 대기 중 위험 액션을 자동 승인**함 = R1 "의도치 않은 제출"의 최악형. → **M-2 no-auto-submit(paste-only, 사람 Enter)**가 이를 구조적으로 차단. 이 lock 없이는 approve 불가.

### Findings (Sev: High|Med|Low) — binding locks
- **M-1 (High):** auto-inject 경로 코드상 부재 — `injectIntoStdin` 호출부는 `--inject-handoffs` AND 명시 accept/claim 뒤에만 도달; flag off → 미호출 테스트.
- **M-2 (High):** no-auto-submit — trailing `\n` 금지(bracketed-paste), 제출은 사람 Enter. `prepareInjectText` `\n` 강제 우회.
- **M-3 (High):** fail-safe = no-inject — hook 부재·불확실·busy면 취소+큐 유지; buffer-and-apply-later 금지(Phase 1.5 `busy_sleep_then_read`); accept당 at-most-once. 1차 신호=Claude hooks, quiescence는 AND-보조.
- **M-4 (High):** 페이로드는 `prepareInjectText` 산출물만(sanitize+untrusted 마커).
- **M-5 (Med):** 제어 채널 로컬 same-UID 0600 socket/pipe; relay 발 트리거 금지.
- **M-6 (Med):** 기본 큐+폴링 + flag 없는 `loom run` 회귀 불변.

### 스코프 판정
Claude-first 타당(Codex/Grok ratatui idle 신호 불명확). "알림만" 슬라이스는 불필요(이미 존재). no-auto-submit paste가 **배송 가치(복붙 제거) 유지 + R1 리스크 구조적 제거**의 안전한 최소.

**Implement next** under 0.21.1 (레인 위임 — 세션 모델 직접 코딩 금지). 재리뷰 불요.

---

## Review R21 — Plan v0.20.0
**검토 대상:** `docs/PLAN.md` v0.20.0 `#### 0.20.0` changelog (Tier A3 `loom doctor` 자가진단) + header block + `docs/UNKNOWNS.md` 0.20.0
**검토자:** Fable 5 (fable-advisor)
**날짜:** 2026-07-11
**결론:** approved (binding M-1…M-4 전제; 구현은 다음 세션, 재리뷰 불요)

### Checklist
- [x] **Check-set vs real surfaces** — 전부 실재: `loomDir`(`session-store.ts:209`), `getActiveProfile`(:244), `resolveStateHomeDir`(:154), `loadSession`(:288, 순수 읽기), `isPidAlive`(:76); `loomCmd`/`Bun.which`(`cli/index.ts:137–139`), `parseRelayUrl`, host status(:1446–1456), `isLoopbackHost` dynamic import(:645); relay `/health` `{ok,rooms,auth,version}`(`relay/src/server.ts:106–112`), 토큰 없이 열려 있어 프로브 성립(`auth.integration.test.ts:27–32`).
- [x] **Security** — `describeHostMeta`는 token 미출력; session relayUrl은 H-6로 토큰 미포함(`relay-daemon.ts:69`). present/missing만 출력.
- [x] **Read-only 의도는 맞음** — 단, 두 helper에 실제 부작용 → M-1/M-2로 잠금.
- [x] **Out-of-scope / Unknowns** — 깨끗; Unknowns 4개가 실제 리스크(exit code·health timeout·no-session·auto-host) 정확히 짚음.

### Findings (Sev: High|Med|Low)
- **M-1 (High, binding):** doctor의 relay 검사는 **절대 `ensureRelay` 호출 금지**. `relay-daemon.ts:91–105` — local relay가 죽어 있으면 spawn + pid 파일 write → read-only 파기. `parseRelayUrl` + 직접 `fetch(httpOrigin + "/health", { signal: AbortSignal.timeout(3000) })`로만.
- **M-2 (Med, binding):** **`resolveAliveHostMeta` 호출 금지** — `sticky-client.ts:25–27`에서 stale meta를 `clearStickyMeta`로 삭제(mutation). doctor는 `loadStickyMeta` + `isPidAlive`를 직접 조합해 stale을 **보고만** 한다(stale 자체가 진단 정보).
- **M-3 (Med, binding):** exit code 계약 — `fail`≥1 → exit 1, `warn`만 → exit 0. `--strict`(warn도 non-zero)는 범위 밖. 항상 0이면 Docker 하네스/CI에서 활용 불가.
- **M-4 (Med, binding):** no-session(설치 직후 첫 실행)은 `fail` 아님 — Session/Relay/Host 섹션은 `info: no session — next: loom room join <blob>`. 안 그러면 정상 설치가 3-fail로 보여 A3 목적(안심) 역행.
- **L-1 (Low):** `~/.loom` writable 검사는 probe-write 말고 `accessSync(W_OK)`. author-close.
- **L-2 (Low):** relayUrl 출력 시 `?token=` 방어적 redact(H-6로 미포함이나 1줄 가드). author-close.
- **L-3 (Low):** host RPC는 `stickyRpc({op:"status"}, {timeoutMs: 2000-3000})` — 기본 8s(`sticky-client.ts:79`)는 doctor엔 김. author-close.

### Decision notes
- **5-섹션 구성은 최소·충분** — 유지(health `auth:true` × 세션 token missing 교차검사가 relay 섹션의 실질 가치).
- M-1…M-4를 binding-on-impl로 잠그면 **다음 세션 구현 허용**. 재리뷰 불요, 0.20.0 그대로 진행. L-1..L-3 author-close(`implementation-notes.md`).
- Advisor: fable-advisor consulted: yes.

---

## Review R20 — Plan v0.19.0
**검토 대상:** `docs/PLAN.md` v0.19.0 `#### 0.19.0` changelog (Tier A1 5분 설치 경로 / install script) + header block + `docs/UNKNOWNS.md` 0.19.0
**검토자:** Fable 5 (fable-advisor)
**날짜:** 2026-07-11
**결론:** approved (binding M-1…M-4; PLAN에 lock 기록 후 착수 허용 — PATCH급 텍스트 수정, 재리뷰 불요)

### Checklist
- [x] **Scope** — install/doc/string 표면만; relay 무결합 확인 (blob이 `relayUrl`+`token`+`inviteCode` 운반, `packages/protocol/src/invite-link.ts:1-12,42`; install.sh는 relay 지식 불요).
- [x] **새 표면 식별** — `curl\|bash`, 낯선 머신 first-run.
- [x] **Security/trust** — sudo 없음·홈 한정·멱등 append·공식 `bun.sh` 위임 명시(PLAN.md:66-67); 핀(main vs 태그)은 Unknown으로 정당하게 유보.
- [x] **Out-of-scope 정합** — binary 유보가 R19 spawn 제약과 일치(PLAN.md:72,87).
- [x] **Unknowns 충분** — 판정 리스크(PATH 활성화) 명시(UNKNOWNS.md:45-58). 보강: git 존재(macOS xcode-select 프롬프트)·mid-script bun PATH(M-4).
- [x] **"낯선 사람 멈춤" 주장 검증** — `scripts/link-loom.sh:20-31`이 PATH 안내만 출력하고 종료 확인.

### Findings (Sev: High|Med|Low)
- **M-1 (Med, binding):** verify/append 경로가 `$HOME/.bun/bin` 하드코딩(PLAN.md:61(e)) — Bun은 `BUN_INSTALL` 존중, 기존 `link-loom.sh:19`도 `${BUN_INSTALL:-$HOME/.bun}/bin` 사용. Fix: `bun pm bin -g`(또는 `BUN_INSTALL` fallback)로 bin dir 해석해 verify·rc append 양쪽 동일 값 사용.
- **M-2 (Med, binding):** `exec $SHELL`를 script 마지막 실행 단계로 두면(PLAN.md:61(g)) `curl\|bash`에서 깨짐 — stdin이 파이프라 exec된 셸이 EOF 읽고 즉시 종료. Fix: `exec $SHELL`/`source <rc>`를 **안내로 출력**, 또는 tty 체크 후 `</dev/tty`로만 exec.
- **M-3 (Med, binding):** `loomCmd` 스윕은 blanket 아님·열거형 per-string 스왑이어야 함. (a) `index.ts:495,604`는 self-ref fallback 노트("if `loom` is not on PATH, always use `bun run loom`") — 스왑 시 무의미해짐, 리터럴 유지. (b) `index.ts:2350`은 **실행되는** spawnSync 명령(표시 텍스트 아님) — global `loom`으로 스왑하면 실행 중 체크아웃 대신 링크된 clone 실행, 스윕에서 제외.
- **M-4 (Med, binding, trivial):** script 내에서 Bun 설치 직후 `bun`이 script 자신의 PATH에 없음 → 이후 `bun install`/`bun link` 실패. Fix: 해석된 bin dir를 `export PATH` 또는 절대경로 `$BUN/bin/bun` 사용.
- **L-1 (Low):** script 본문을 `main(){…}; main "$@"`로 감싸 truncated-download 안전성 확보 + `git` 존재 체크. author-close.
- **L-2 (Low):** 핀 결정 — main은 신뢰 코호트엔 수용 가능; 기록하고 raw URL이 fetch한 것과 동일 ref를 clone하게 보장. author-close.
- **L-3 (Low):** share 라인(`index.ts:478-479`)은 *joiner* 머신 기준; 로컬 `loomCmd` 감지는 휴리스틱 — 설치 후 낯선 사람은 `loom` 보유라 수용, fallback 노트 유지. author-close.
- **L-4 (Low):** fish — `fish_add_path`/config.fish + marker-line 멱등 체크. author-close.

### Decision notes
- **구현 승인** — 방향·스코프 건전. 단 plan-text 메커니즘 (e)/(g)가 작성된 그대로는 실패 → M-1/M-2가 교정. M-1…M-4를 PLAN에 binding lock으로 기록(PATCH급 텍스트, 재리뷰 불요)하면 0.19.0 하에 착수 허용.
- L-1..L-4 implementation-time author-close (`implementation-notes.md` 기록).
- Advisor: fable-advisor consulted: yes.

---

## Review R19 — Plan v0.18.0
**검토 대상:** `docs/PLAN.md` v0.18.0 `#### 0.18.0` changelog (portable join blob) + header block
**검토자:** Fable 5 (fable-advisor)
**날짜:** 2026-07-11
**결론:** approved

### Checklist
- [x] **Token-in-blob vs H-5/UC-10.5** — sound. H-5 enforcement is server-side bind refusal (`packages/relay/src/server.ts:81-91`, tested `auth.integration.test.ts:133-141`); blob changes nothing there. Default share line stays token-less: token only printed under `--show-token` gate (`packages/cli/src/index.ts:469-480`), blob strictly opt-in via `invite --link` (PLAN.md 기본 share 토큰 자동 삽입 금지). `LOOM-XXXX` is already a bearer secret (`codes.ts:4-11`). No new leak surface: token already persists in session file 0600 (`index.ts:450,556`), not in presence/roster.
- [x] **"No wire change" claim** — verified. Join request `{type:"join", inviteCode, peer}` (`envelope.ts:190-196`); relay token travels as transport auth (Bearer/`?token=`, `server.ts:203-210`), never in the envelope. relayUrl+token flow via `relayOptsFromFlags`→`ensureRelay` (`index.ts:268-275,502`), saved to session (`index.ts:449-450,555-556`). Blob = pure CLI-side encoding of `index.ts:473`'s three fields.
- [x] **Scope** — bounded MINOR. New surface = one subcommand + one arg-parser branch (`index.ts:2352-2358`). No accounts/rotation/hosted-relay code pulled in.
- [x] **Backward compat** — bare `LOOM-XXXX` path unchanged (`cmdRoomJoin` index.ts:497-527); blob path supplies relayFlag/tokenFlag before the same call.
- [x] **Binary deferral** — correct. Auto-daemon spawns `["bun","run",relayCli]` resolving a `.ts` file (`relay-daemon.ts:87-92`) → breaks under `bun compile`; defer + refactor-first is right.

### Findings (Sev: High|Med|Low)
- **M-1 (Med):** blob/invite-code parse ambiguity is real — `LOOM-7K2M` (alphabet `codes.ts:1`) is itself valid base64url. A "try base64-decode first" parser silently mis-parses bare codes.
- **M-2 (Med):** loopback blob footgun — `invite --link` against `ws://127.0.0.1` emits a blob dead on other machines. `isLoopbackHost` exists (`server.ts:42`, exported `relay/src/index.ts:11`).
- **L-1 (Low):** precedence undefined when both a blob and explicit `--relay`/`--token` are passed to `room join`.
- **L-2 (Low):** token in shell history via blob (ack'd in Unknowns) — add "bearer secret" notice to `invite --link` output.

### Decision notes
- **Approved for implementation** with two binding constraints resolving the plan's own Unknowns: (1) blobs **must** carry `loom://join/` prefix; parser checks `^LOOM-[A-Z2-9-]+$` bare-code shape **before** blob decode — never bare base64url (closes M-1). (2) `invite --link` warns/refuses on loopback relayUrl (closes M-2).
- L-1/L-2 are implementation-time fixes; **author-close allowed** after Low fixes with a note in `implementation-notes.md`. No re-review unless the blob carries fields beyond `{relayUrl, token, inviteCode}`.
- Advisor: fable-advisor consulted: yes.

---

## Deferred / backlog (open only)

| ID | Sev | 요약 | 상태 |
|----|-----|------|------|
| BR-M1 | High | R23/0.22.0 브릿지 dispatcher 인가 — label 매치 단독 실행은 room 내 임의 peer의 원격 실행 허용 | **binding on impl** — `fromPeerId` allowlist, 기본 거부 |
| BR-M2 | Med | R23/0.22.0 프롬프트 제출 메커니즘 미정의(no-Enter 실측 vs "send+제출" 자기모순) | **binding on impl** — send 리터럴 + bare-Enter 별도 호출, `pane.run` 보간 금지 |
| BR-L1 | Low | R23/0.22.0 payload_invalid 조용한 무시 → 카드 `doing` 고착 | author-close — `failed reason=payload_invalid` 회신 |
| BR-L2 | Low | R23/0.22.0 `apply_card_result` 발신자 미검증(위조 `[DONE]`) | author-close — `fromPeerId`/`node` vs `assignee` 대조 |
| BR-L3 | Low | R23/0.22.0 attachment 초과는 truncate 아닌 거부 + zero-width/bidi 미이스케이프 | author-close — 송신 측 사전 검증, 서술 보정 |
| A3-M1 | High | R21/0.20.0 `loom doctor`가 `ensureRelay` 호출 시 죽은 local relay를 spawn+pid write(read-only 파기) | **binding on impl** — 직접 `fetch(origin+"/health",{signal:AbortSignal.timeout(3000)})`만 |
| A3-M2 | Med | R21/0.20.0 `resolveAliveHostMeta`는 stale meta를 `clearStickyMeta`로 삭제(mutation) | **binding on impl** — `loadStickyMeta`+`isPidAlive` 조합, stale은 보고만 |
| A3-M3 | Med | R21/0.20.0 exit code 계약 미정 | **binding on impl** — fail≥1→exit 1, warn만→0; `--strict` 범위 밖 |
| A3-M4 | Med | R21/0.20.0 no-session(설치 직후)이 fail로 보이면 A3 목적 역행 | **binding on impl** — Session/Relay/Host를 `info: no session — next: room join` |
| A3-L1 | Low | R21/0.20.0 `~/.loom` writable 검사 방식 | author-close — probe-write 말고 `accessSync(W_OK)` |
| A3-L2 | Low | R21/0.20.0 relayUrl 출력 `?token=` 방어 redact | author-close — 1줄 가드(H-6로 현재 미포함) |
| A3-L3 | Low | R21/0.20.0 host RPC 타임아웃 8s는 doctor엔 김 | author-close — `stickyRpc(...,{timeoutMs:2000-3000})` |
| A1-M1 | Med | R20/0.19.0 install.sh verify/append `$HOME/.bun/bin` 하드코딩 | **done 0.19.0** (`a9cefd0`) — `bun pm bin -g` 해석 |
| A1-M2 | Med | R20/0.19.0 `exec $SHELL` curl\|bash 무효 | **done 0.19.0** — 안내 출력 |
| A1-M3 | Med | R20/0.19.0 `loomCmd` 열거형 스왑(spawn/self-ref 제외) | **done 0.19.0** — helper + 열거 스왑 |
| A1-M4 | Med | R20/0.19.0 Bun 설치 후 script PATH | **done 0.19.0** — export PATH |
| A1-L1..L4 | Low | R20/0.19.0 main 래핑·핀·share 휴리스틱·fish | **done 0.19.0** (+ Docker-caught bash-login `set -e` fix, `~/.profile`) |
| M-1 | Med | R19/0.18.0 blob·invite-code 파싱 모호성 — `LOOM-7K2M`이 그 자체로 유효 base64url | **done 0.18.0** (`2b59dee`) — `loom://join/` 프리픽스 + bare 형태 선검사 |
| M-2 | Med | R19/0.18.0 loopback relayUrl로 만든 blob은 타 머신에서 죽음(footgun) | **done 0.18.0** (`2b59dee`) — `invite --link` loopback 경고 |
| L-1 | Low | R19/0.18.0 blob + 명시 `--relay`/`--token` 동시 전달 시 우선순위 미정 | **done 0.18.0** — 명시 flag override (author-close) |
| L-2 | Low | R19/0.18.0 blob의 token이 shell 히스토리 노출 | **done 0.18.0** — bearer secret 안내 (author-close) |
| L-35 | Low | 0.17.0 acceptance 목록이 idempotent double-up / `LOOM_NO_AUTO_HOST` 경로 / down-safety 단위테스트를 명시 안 함 | **done 0.17.1** — acceptance #7–#9 추가 |
| L-34 | Low | 0.17.0 auto-host on join이 기존 `stopStickyBeforeSessionChange`(join 시 구세션 host 정지) 위에 겹침 — 문서화 필요, 8s 지연 가능성도 명시 필요 | **done 0.17.1** — locks 표 + docs 명시, 성공 안내 문구 |
| L-33 | Low | 0.17.0 auto-host 기본 on이 `bun test`/CI에서 데몬을 조용히 띄울 위험 | **done 0.17.1** — 테스트 하네스 `LOOM_NO_AUTO_HOST=1` 기본 + acceptance #9 |
| L-32 | Low | 0.16.0 MCP `add_task`/`update_task`의 `notify` 기본값이 PLAN에 명시 안 됨 (CLI만 `--as`→notify 기본 lock) | R17 — MCP는 기본 off(opt-in)로 lock 필요, scripted-loop spam 방지 |
| L-31 | Low | 0.16.0 `loom work watch --interval`에 코드 강제 최솟값 없음 ("document"만) — tight-loop 폴링 가능 | R17 — CLI에서 ≥250ms 클램프 + 경고 lock 필요 |
| L-30 | Low | 0.15.0 purpose 파일 last-writer-wins (board와 동일 residual) | R16 — backlog, `updatedByPeerId`로 충분, board 문서 재사용 |
| L-28 | Low | 0.14.0 `byCode` 재로드 시 invite-code 충돌이 silent last-wins | R15 — log 권고, backlog (PLAN locks cross-ref) |
| L-29 | Low | 0.14.0 room 파일이 GC 없이 재시작 간 누적 | R15 — residual; cross-ref in 0.14.1 locks table |
| L-23 | Low | sticky `GET /health` unauth loopback | **accepted** in 0.11.1 (document only) |
| L-26 | Low | Desktop sticky F-2 room/peer match | **done 0.13.5** |
| L-27 | Low | Pack embed check/read TOCTOU residual | **done 0.13.5** |
| L-5 | Low | pack embed allowlist at send | **done 0.13.0** (+ L-27 harden) |
| L-4 residual | Low | wire `requestId` | **done 0.13.1** |
| Product | — | Board UI / sticky board ops | **done 0.12.0** (M-18 A) |

---

## Recent follow-ups (last waves)

| Finding | 처리 |
|---------|------|
| **R19 M-1/M-2** | **approved 0.18.0** — self-contained invite blob. Binding on impl: M-1 (`loom://join/` prefix + parse order), M-2 (loopback guard); L-1/L-2 author-close. Implement pending. |
| **R18 M-27/M-28** | **0.17.1 done** — PLAN Failure/security locks: down 프로세스 신원 검증(cmdline `sticky-main.ts`) + multi-profile up 순차(no Promise.all); L-33/L-34/L-35 ride-along; author-close (no R18b) |
| **R17 M-26** | **0.16.1 (required)** PLAN Failure/security locks — 템플릿 단일행 필드 개행 제거 + watch interval 클램프 + MCP notify 기본 off; then author-close (no R17b) |
| **R16 M-24/M-25** | **0.15.1 done** — locks author-close; implement next |
| **R15 M-21/M-22/M-23** | **0.14.1** PLAN Failure/security locks + author-close (no R15b) |
| **0.13.5 L-26/L-27** | desktop `load_live_meta` F-2; pack embed O_NOFOLLOW+fd; tests; author-close |
| **R14** | cumulative 0.11–0.13.3 trust → **approved**; L-26/L-27 closed in 0.13.5 |
| **0.13.3 install DX** | PRIORITIES.md; scripts/loom; link:loom / unlink:loom; README install A/B/C |
| **0.13.2 dogfood** | inbox displayName + att count; Share uses `bun run loom`; host stop profile tip |
| **0.13.1 L-4** | wire `requestId` — **author-close** (not R{n}; not Owner approve). Commit `676d4f3` 2026-07-10 |
| **0.13.0 L-5** | `--with-pack-embed` / `withPackEmbed`; re-resolve allowlist at send; caps |
| **0.12.2 send** | desktop Send tab (handoff/chat) + invite display + smoke handoff/chat |
| **0.12.1 polish** | auto-refresh, tab badges, peer names, board groups, PITCH 0.12 |
| **0.12.0 board** | sticky board RPC + desktop Board + `smoke:desktop` |
| **0.11.2 desktop** | shell Status/Peers/Inbox; Rust sticky; `cargo test` |
| **R13 M-18 / M-19 / M-20** | **0.11.1** locks → **0.11.2** code |
| **R13 L-21** | **superseded by M-20** (closed as Med) |
| **R13 L-22** | UNKNOWNS 0.11 filled |
| **R13 L-24** | folded into M-19 token boundary in 0.11.1 |
| **R13 L-25** | acceptance host-absent cases split in 0.11.1 |
| **R13** | **closed** — pending-revision → 0.11.1 approved (body below) |
| **Unknowns §3.5** | WORKFLOW + `docs/UNKNOWNS.md` |
| **0.10.3** docs honesty / Tauri unblocked | done |
| **R12** M-17 + L-17/18/20; L-19 residual | **0.10.1** / closed residual |
| Older | [`plan_review_archive.md`](./plan_review_archive.md) |

---

## Review index

| Review | Plan | Conclusion | Notes |
|--------|------|------------|-------|
| **R18** | v0.17.0 → **0.17.1** | pending-revision → **closed (author-close)** | M-27/M-28 locked in PLAN 0.17.1; L-33/L-34/L-35 applied — body below |
| **R17** | v0.16.0 → **0.16.1** | pending-revision → **closed (author-close)** | M-26/L-31/L-32 + work bus — body below |
| **R16** | v0.15.0 → **0.15.1** | pending-revision → **closed (author-close)** | M-24/M-25 locked — body below |
| **R15** | v0.14.0 → **0.14.1** | pending-revision → **closed (author-close)** | M-21/22/23 locked in PLAN 0.14.1 — body below |
| **R14** | v0.13.3 code · **0.13.4** plan | **approved** | P1-B cumulative trust — body below |
| **R13** | v0.11.0 | pending-revision → **0.11.1 approved** | M-18/19/20 closed — body below |
| **R12** | v0.10.0 | pending-revision → **0.10.1 approved** | M-17 closed — body below |
| **R11** | v0.9.0 | → **0.9.1 approved** | [archive](./plan_review_archive.md) |
| **R10** | v0.8.0 | → **0.8.1 approved** | [archive](./plan_review_archive.md) |
| **R9** | v0.7.0 | → **0.7.1 approved** | [archive](./plan_review_archive.md) |
| **R8** | v0.6.0 | → **0.6.1 approved** | [archive](./plan_review_archive.md) |
| **R7** | v0.5.0 | **approved** | [archive](./plan_review_archive.md) |
| R6–R1 | … | … | [archive](./plan_review_archive.md) |

---

## Review R18 — Plan v0.17.0 (Launcher UX: `up`/`down`, host-default, work-first)

**검토 대상:** `docs/PLAN.md` **v0.17.0** — `loom up`/`down` (multi-profile 백그라운드 sticky host), `room create`/`join` 시 auto-host 기본 on(`--no-host`/`LOOM_NO_AUTO_HOST` 탈출구), work bus 문서 전면화, `run`(TUI)은 작업 시에만. **MINOR, wire protocol 변경 없음.** 코드 없음 — plan-vs-territory 리뷰 (`packages/cli/src`에 `cmdUp`/`cmdDown`/`LOOM_NO_AUTO_HOST`/`--no-host` 전부 0건 확인; `scripts/dogfood-room-up.sh`는 join만 하고 host start는 수동 — 클린한 스코프 경계 확인).  
**검토자:** Claude (Sonnet 5, `claude-review`) + **Fable 5 second opinion** (`/advisor fable`, agent `fable-advisor`, 필수 컨설트 완료)  
**날짜:** 2026-07-10  
**결론:** **`pending-revision`** — Med 2건(M-27/M-28)은 PLAN 텍스트 lock row로 해소 가능. **PATCH(0.17.1) 적용 후 author-close 허용, 전체 재리뷰(R18b) 불필요** (WORKFLOW §5.1, R15–R17 선례 준용). 아키텍처(MINOR 프레이밍, wire/신뢰 경계 불변, per-host loopback 토큰 모델은 단순히 개수만 늘어남)는 타당함(sound).

### Checklist

| Area | Result | Evidence |
|------|--------|----------|
| MINOR 프레이밍 (wire/trust-boundary 변경 없음) | Pass | `sticky-client.ts` loopback 토큰 모델 불변, `up`/`down`은 기존 `startStickyHostProcess`/`stopStickyHostProcess` primitive를 profile 수만큼 반복 호출하는 것뿐 |
| `up`은 기존 세션 파일 있는 profile만 대상 (peer 위조/무단 join 없음) | Pass | PLAN Security/failure locks 표 명시, 기존 `sessionPath()`가 profile별 파일 경로만 반환 (`session-store.ts:248-260`) — invite 없이 join 불가한 기존 경로 재사용 |
| `up` 자체는 agent TUI 미실행 | Pass | PLAN Out 표 "Auto `run` agents on up" 명시적 제외; `startStickyHostProcess`는 `sticky-main.ts`만 spawn (`sticky-spawn.ts:57-64`), TUI 프로세스 아님 |
| 로그에 비밀값 없음 / 0600 | Pass | 기존 sticky 관례 그대로(옵션 로그 경로만 0600 lock 예정), 신규 표면 아님 |
| **`down` kill-safety (pid+sessionPath 일치)** | **Fail (Med)** | 현재 `stopStickyHostProcess`는 RPC `{op:"stop"}`이 실패했을 때만 raw `process.kill(meta.pid, "SIGTERM")`로 폴백한다(`sticky-spawn.ts:103-114`) — 이 폴백 경로가 실행되는 정확한 조건이 "그 pid가 우리 sticky 프로세스라는 걸 RPC로 확인 못 한 상태"다. `meta.sessionPath` 일치는 우리 자신이 쓴 파일 문자열 대조일 뿐이고 `isPidAlive`(`sticky-meta.ts:79-88`)는 `process.kill(pid, 0)` 성공 여부만 본다 — reboot 후 pid 재사용 시나리오에서 무관 프로세스에 SIGTERM 전달 가능 |
| **multi-profile `up`의 LOOM_SESSION 미혼입 보장** | **Fail (Med)** | `startStickyHostProcess`/`stopStickyHostProcess`는 세션 인자를 받지 않고 모듈 전역/env 기반 `sessionPath()`를 매 호출 시점에 재평가한다(`sticky-spawn.ts:51,72,98,100,115`; `session-store.ts:248-261`) — polling 루프 중간(`sticky-spawn.ts:72`)에도 재평가되므로, `Promise.all` 등으로 profile을 동시 처리하면 프로세스 간 세션이 뒤섞일 수 있는 구조. 순차 처리 또는 `forSessionPath` 명시 전달로 프로세스 자체를 fix해야 함 (client 함수들은 이미 `forSessionPath` 인자를 받는 패턴 존재 — `sticky-meta.ts:70` 등) |
| CI/테스트에서 auto-host 침묵 스폰 방지 | **Fail (Low)** | PLAN에 `LOOM_NO_AUTO_HOST` 탈출구는 있으나 "테스트 하네스가 기본으로 이걸 켠다"는 lock/acceptance가 없음 |
| auto-host on join의 기존 부작용과의 상호작용 문서화 | **Fail (Low)** | join은 이미 `stopStickyBeforeSessionChange()`를 호출한다(`packages/cli/src/index.ts:352`, `cmdRoomJoin` 진입 직후) — 구세션 host를 내린 뒤 새 host를 auto-start하는 이중 동작이 되는데 PLAN에 이 상호작용이 명시되어 있지 않음. 또한 `startStickyHostProcess`의 polling은 최대 8초 소요 가능(`sticky-spawn.ts:69` `deadline = Date.now() + 8000`)하므로 join 커맨드 자체가 그만큼 느려질 수 있음 — acceptance에 명시 필요 |

### Findings (Sev: High|Med|Low, ID)

| Sev | ID | Finding | Evidence | Lock (PLAN 텍스트 추가 필요) |
|-----|-----|---------|----------|-------------------------------|
| **Med** | **M-27** | `down`(및 `host stop`이 사용하는 동일 primitive)의 kill-safety가 "pid alive AND sessionPath 일치"만으로는 프로세스 신원을 증명하지 못한다. 현재 `stopStickyHostProcess`는 RPC 정지가 실패한 경우에만 raw SIGTERM 폴백을 쓰는데, 바로 그 실패 상황(RPC 불응)이 "그 pid가 더 이상 우리 sticky 프로세스가 아닐 수 있다"는 신호이기도 하다. reboot 후 meta 파일은 남고 pid가 무관 프로세스에 재사용된 경우, `down`이 그 무관 프로세스를 죽일 수 있다 | `sticky-spawn.ts:103-114`(SIGTERM 폴백), `sticky-meta.ts:79-88`(`isPidAlive`가 `kill(pid,0)`만 확인) | `down kill-safety (M-27)` — **SIGTERM 폴백 전, 최소 하나의 독립적 신원 확인(프로세스 cmdline에 `sticky-main.ts` 포함, 또는 시작 시각이 `meta.startedAt`과 근사)을 통과해야 한다. 확인 실패 시 SIGTERM을 보내지 않고 meta만 정리한 뒤 경고를 출력한다.** |
| **Med** | **M-28** | multi-profile `up`이 plan이 스스로 요구한 "profile 간 LOOM_SESSION 미혼입" 락을 현재 primitive(`startStickyHostProcess`/`stopStickyHostProcess`)로 보장할 수 없다 — 두 함수 모두 세션 인자를 받지 않고 매 호출 시점(폴링 루프 도중 포함)에 전역 `sessionPath()`를 재평가하므로, profile을 동시(Promise.all)로 처리하면 경쟁 상태에서 세션이 섞일 수 있다 | `sticky-spawn.ts:51,72,98,100,115`(재평가 지점), `session-store.ts:248-261`(`sessionPath()` 전역 상태 의존) | `multi-profile up isolation (M-28)` — **`up`은 profile을 순차적으로(sequential, no `Promise.all`) 처리하거나, spawn/stop 경로에 `forSessionPath`를 명시 파라미터로 통과시켜 프로세스별 세션을 고정한다. 둘 중 하나를 구현 전 확정한다.** |
| Low | **L-33** | auto-host 기본 on이 `bun test`/비대화형 스크립트에서 조용히 데몬을 띄울 위험 — PLAN에 탈출구(`LOOM_NO_AUTO_HOST`)는 있지만 테스트 하네스가 이를 기본 적용한다는 lock이 없음 | PLAN 0.17.0 Security/failure locks 표 (auto-host 행만 있고 CI 행 없음) | `CI hygiene (L-33)` — **테스트 하네스(`bun test` 실행 환경)는 `LOOM_NO_AUTO_HOST=1`을 기본 설정한다. Acceptance에 "bun test는 sticky host를 스폰하지 않는다"를 추가한다.** |
| Low | **L-34** | auto-host on join이 기존 `stopStickyBeforeSessionChange()`(join 시 구세션 host 정지, `cli/index.ts:352`) 위에 겹쳐 이중 동작(정지→재시작)이 되는데 PLAN에 미문서화. 또한 `startStickyHostProcess`의 폴링이 최대 8초 걸릴 수 있어(`sticky-spawn.ts:69`) join 커맨드 체감 지연이 늘 수 있음 | `cli/index.ts:352`(`cmdRoomJoin`의 기존 `stopStickyBeforeSessionChange` 호출), `sticky-spawn.ts:69`(8초 deadline) | `auto-host join interaction (L-34)` — **문서(USER_GUIDE/DOGFOOD_LOOP)에 "join은 구세션 host를 내리고 새 host를 자동 시작하며 최대 8초 소요될 수 있다"를 명시. auto-host 성공 시 `"host auto-started (pid N); disable: --no-host"` 안내를 출력한다.** |
| Low | **L-35** | acceptance 목록(`docs/PLAN.md:144-152`)이 idempotent double-`up`, `LOOM_NO_AUTO_HOST` 경로, down-safety 단위테스트를 명시하지 않음 | PLAN 0.17.0 Acceptance 절 | `acceptance completeness (L-35)` — **acceptance에 "①두 번 연속 `up` 호출이 meta를 손상시키지 않는다 ②`LOOM_NO_AUTO_HOST=1` 시 join이 host를 시작하지 않는다 ③down의 신원 확인 가드에 대한 단위테스트가 존재한다"를 추가한다.** |

### Decision notes

- 아키텍처 자체는 타당함(sound): `up`/`down`은 이미 존재하는 `startStickyHostProcess`/`stopStickyHostProcess` primitive를 profile 목록에 반복 적용하는 것뿐이고, per-host loopback 토큰 모델(`sticky-client.ts`)도 변경되지 않는다. MINOR·wire-불변 프레이밍은 정확하다. auto-host on join의 fail-soft 방향(RPC/host-start 실패해도 join은 성공)도 옳은 설계 — 이 프로젝트의 dogfood 도구 성격상 default-on + `--no-host`/`LOOM_NO_AUTO_HOST` 탈출구 조합이면 충분하며, TTY 감지 같은 휴리스틱을 추가로 넣을 필요는 없다.
- M-27/M-28은 R16 verify[] 및 R17 M-26과 같은 계열의 실수 패턴이다: **"파일에 적힌 문자열 일치"를 "프로세스/신원 확인"으로 착각**하는 것. sessionPath 문자열 일치나 pid 존재만으로는 시간차(TOCTOU)와 pid 재사용을 못 막는다 — 실제 신원 신호(cmdline, 시작 시각)가 필요하다. 마찬가지로 "전역 상태를 참조하는 함수를 루프에서 병렬 호출하면 안전하다"는 암묵적 가정도 검증되지 않았다.
- M-27/M-28 모두 **PLAN Failure/security locks 표에 lock row 추가**로 해소되는 범위이며 새 아키텍처·새 표면·프로토콜 변경이 아니다. **따라서 PATCH(0.17.1) 적용 후 — 두 항목이 Failure/security locks 표에 반영되고 PLAN Status가 이를 반영하면 — 전체 재리뷰(R18b) 없이 author-close를 허용한다.** (WORKFLOW §5.1 "PATCH 후 author-close 가능" 조항 적용, R15–R17 선례.)
- **구현은 여전히 금지** — PATCH가 적용되고 PLAN Status가 `approved`(author-close 포함)로 동기화되기 전까지 `loom up`/`down`, auto-host on join, `--no-host`/`LOOM_NO_AUTO_HOST` 등 실제 코드 작성 금지.

### R18 follow-up (0.17.1 — applied)

| Finding | 처리 |
|---------|------|
| **M-27** | Failure/security locks: `down` SIGTERM 폴백 전 독립 신원 확인(cmdline `sticky-main.ts` via `ps`) 필요, 실패 시 meta만 정리 + 경고 |
| **M-28** | Failure/security locks: multi-profile `up`/`down`은 **순차 처리(no `Promise.all`)** + profile별 `setActiveProfile(explicit)` 확정 |
| **L-33** | Failure/security locks: 테스트 하네스 `LOOM_NO_AUTO_HOST=1` 기본 + acceptance #9 |
| **L-34** | 문서화: join의 host 정지→재시작 이중 동작 + 최대 8초 지연 명시, auto-host 성공 안내 문구 |
| **L-35** | Acceptance 보강: idempotent double-up / `LOOM_NO_AUTO_HOST` 경로 / down-safety 단위테스트 (#7–#9) |
| PLAN | **v0.17.1** `approved` (author-close per R18 Decision notes; **no R18b**) |

**Implement Launcher UX under 0.17.1 now allowed.**

---

## Review R17 — Plan v0.16.0 (Work bus: board → handoff + `loom work`)

**검토 대상:** `docs/PLAN.md` **v0.16.0** — board add/assign가 handoff를 딜리버리 버스로 사용(기존 handoff/inbox 재사용, 새 wire 타입 없음), fixed-shape body 템플릿, `loom work` / `loom work watch` (client poll). 코드 없음 — plan-vs-territory 리뷰 (`task-board.ts`/`cli/index.ts`에 `notify` 관련 코드, `loom work` 커맨드 전부 미생성 확인).  
**검토자:** Claude (Sonnet 5, `claude-review`) + **Fable 5 second opinion** (`/advisor fable`, agent `fable-advisor`, 필수 컨설트 완료)  
**날짜:** 2026-07-10  
**결론:** **`pending-revision`** — Med 1건(M-26) + Low 2건(L-31/L-32)은 PLAN 텍스트 lock row로 해소 가능. **PATCH(0.16.1) 적용 후 author-close 허용, 전체 재리뷰(R17b) 불필요** (WORKFLOW §5.1, R15/R16 선례 준용). 아키텍처(handoff-as-bus, poll v1, no new wire types)는 타당함(sound).

### Checklist

| Area | Result | Evidence |
|------|--------|----------|
| Architecture (handoff as delivery SSOT, no CRDT/new wire) | Pass | PLAN 0.16.0 Architecture lock 표; wire v1 불변 |
| peer_unknown fail-closed | Pass | 기존 `loom handoff --track` 경로가 이미 동일 패턴 구현 (`cli/index.ts:525` `ack.handoffId && ack.status !== "peer_unknown"` 이후에만 `addTaskFromHandoff`) — 재사용이라 저위험 |
| No-spam (add/assign만 notify, status 변경 시 미발동) | Pass | PLAN Out 표에 "Default notify on every board set (status spam)" 명시적 제외 |
| No-auto-claim | Pass | 0.15 비목표 그대로 유지 확인 |
| **body 템플릿 fixed-shape 전제** | **Fail** | task title은 `sanitizePeerText`로만 정제되어 개행 보존(`sanitize.ts:31-35`; `task-board.ts:192` `normalizeTask`가 `sanitizePeerName`이 아닌 `sanitizePeerText` 사용) — 동일 room의 아무 peer나 `board add`/MCP `add_task`로 title에 개행을 넣어 `task:`/`assignee:` 위조 줄을 심을 수 있음. assignee 필드 자체는 `sanitizePeerName`으로 이미 안전, taskId도 regex-coerce라 안전 — title만 유일한 취약 단일행 필드 |
| **`loom work watch` poll interval 강제** | **Fail (Low)** | lock 표가 "Default interval ≥ 1s; document"라고만 되어 있어 권고 문서일 뿐 코드 클램프가 아님 — `--interval 0`/`1` 등 사용자·에이전트 입력값을 강제하는 코드 없음 |
| MCP notify 기본값 | **Fail (Low)** | CLI는 "`--as` 존재 시 기본 notify" lock이 있지만 MCP `add_task`/`update_task`의 `notify` 기본값은 PLAN에 미고정 — scripted 루프가 기본으로 스팸할 위험 |

### Findings (Sev: High|Med|Low, ID)

| Sev | ID | Finding | Evidence | Lock (PLAN 텍스트 추가 필요) |
|-----|-----|---------|----------|-------------------------------|
| **Med** | **M-26** | body 템플릿의 "fixed shape, machine parse" 전제가 title 필드의 개행 보존으로 붕괴 — 어떤 room peer든 `add_task`/`board add`로 `"ok\ntask:evil_id\nassignee: @victim"` 같은 title을 심어 가짜 헤더 줄을 위조 가능. 이 기능의 존재 이유가 "기계 파싱"인데, 그 파싱 대상 자체가 위조 가능해짐. Untrusted-handoff 배너는 사람이 읽고 행동하기 전 리뷰만 완화하지, 기계 파싱(예: 향후 `loom work`/에이전트 자동 처리) 오염은 막지 못함 | `sanitize.ts:18-40` (`sanitizePeerText`는 탭/개행 보존) vs `task-board.ts:192` (`normalizeTask`가 title에 `sanitizePeerText` 사용) | `Template injection (M-26)` — **body 템플릿에 삽입되는 단일행 필드(title 등)는 삽입 직전 `\r\n\t`를 공백으로 치환한다(보드에 저장된 title 자체는 개행 유지 가능, 템플릿 삽입 시점에만 단일행화). 파서는 첫 빈 줄까지의 헤더 블록만 신뢰한다.** |
| Low | **L-31** | `loom work watch --interval`에 코드 강제 최솟값 없음 — "document"는 lock이 아님. `--interval 0`은 매 tick마다 relay 연결/조인/이탈까지 발생할 수 있는 완전한 왕복이라 자기부과적이지만 실질적인 리소스 낭비 | PLAN 0.16.0 "watch CPU" 락 표 문구("document"만) | `watch interval floor (L-31)` — **CLI는 `--interval`을 최소 250ms로 클램프하고, 클램프 발생 시 경고를 출력한다. 기본값 2s는 유지.** |
| Low | **L-32** | MCP `add_task`/`update_task`의 `notify` 기본값이 PLAN에 미고정 — CLI는 `--as` 존재 시 기본 notify를 lock했지만 MCP 경로는 "optional"이라고만 되어 있어 스크립트형 루프가 기본으로 스팸할 위험을 UNKNOWNS.md 자신이 이미 지적 | PLAN 0.16.0 S1 표 "MCP add_task/update_task optional notify: true" | `MCP notify default (L-32)` — **MCP `add_task`/`update_task`는 `notify` 기본값을 off로 lock한다. `notify: true`를 명시해야만 handoff가 발생한다 (CLI `--as`→기본 notify는 CLI 전용 관례로 유지).** |

### Decision notes

- 아키텍처 자체는 타당함(sound): handoff를 딜리버리 버스로 재사용하고 board를 상태 추적으로만 쓰는 설계는 CRDT 없이도 "board=work queue" 기대를 충족시키는 합리적 다음 스텝이며, wire protocol v1도 그대로 유지된다. peer_unknown fail-closed는 이미 `loom handoff --track` 경로에 구현된 패턴을 그대로 재사용하는 것이라 신규 설계 위험이 낮다. no-auto-claim 비목표도 견고함.
- M-26은 R16의 verify[] 교훈과 같은 계열의 실수다: sanitize가 "표시 안전성(display-safety)"은 보장하지만 이 기능이 요구하는 "구조적 안전성(structural-safety, fixed-shape 파싱 신뢰)"까지는 보장하지 않는다. `sanitizePeerText`가 개행을 보존하는 것은 handoff 자유 텍스트에는 맞는 설계지만, 그 결과를 고정 위치 헤더 템플릿에 그대로 삽입하는 새 용도에는 안 맞는다 — 삽입 시점에 단일행화가 필요하다.
- M-26/L-31/L-32 모두 **PLAN Failure/security locks 표에 lock row 추가**로 해소되는 범위이며 새 아키텍처·새 표면·프로토콜 변경이 아니다. **따라서 PATCH(0.16.1) 적용 후 — 세 항목이 Failure/security locks 표에 반영되고 PLAN Status가 이를 반영하면 — 전체 재리뷰(R17b) 없이 author-close를 허용한다.** (WORKFLOW §5.1 "PATCH 후 author-close 가능" 조항 적용, R15/R16 선례.)
- **구현은 여전히 금지** — PATCH가 적용되고 PLAN Status가 `approved`(author-close 포함)로 동기화되기 전까지 `board add/assign --notify`, `loom work`/`loom work watch`, MCP `notify` 파라미터 등 실제 코드 작성 금지.

### R17 follow-up (0.16.1 — required before implement)

| Finding | 처리 |
|---------|------|
| **M-26** | Failure/security locks: 템플릿 단일행 필드(title)는 삽입 전 `\r\n\t` → 공백 치환; 파서는 첫 빈 줄까지만 헤더로 신뢰 |
| **L-31** | Failure/security locks: `--interval` 최소 250ms 클램프 + 경고; 기본 2s 유지 |
| **L-32** | Failure/security locks: MCP `add_task`/`update_task` `notify` 기본 off, 명시적 `notify:true` 필요 |
| PLAN | 0.16.1 `approved` 예정 (author-close per R17 Decision notes; **no R17b**) — PATCH 적용 시 |

**Implement Work bus는 0.16.1 PATCH 적용 후 허용.**

---

## Review R16 — Plan v0.15.0 (Purpose-based sprint 1)

**검토 대상:** `docs/PLAN.md` **v0.15.0** — Purpose 카드(room-scoped 로컬 파일) + handoff intent 태그 + receive-path 강제 + `loom verify` (lite). 코드 없음 — plan-vs-territory 리뷰 (`packages/host/src/purpose.ts`, CLI `purpose`/`verify` 서브커맨드, MCP `get_purpose`/`set_purpose` 전부 미생성 확인).  
**검토자:** Claude (Sonnet 5, `claude-review`) + **Fable 5 second opinion** (`/advisor fable`, agent `fable-advisor`, 필수 컨설트 완료)  
**날짜:** 2026-07-10  
**결론:** **`pending-revision`** — Med 2건(M-24/M-25)은 PLAN 텍스트 lock row로 해소 가능. **PATCH(0.15.1) 적용 후 author-close 허용, 전체 재리뷰(R16b) 불필요** (WORKFLOW §5.1 "PATCH 후 author-close" 조항, R15 선례 준용). 아키텍처 자체는 타당함(sound).

### Checklist

| Area | Result | Evidence |
|------|--------|----------|
| Purpose schema v1 (sanitize/caps) | Pass | `task-board.ts` 패턴과 동일 (`sanitizePeerText`, length caps, atomic-json) |
| Path safety | Pass | `loomDir()/purposes/<sha256(roomId)[:16]>.json`, mode 0600 — board와 동일 |
| Corrupt file handling | Pass | backup + throw (board 패턴), silent empty 아님 |
| Handoff intent tags / receive-path | Pass | best-effort parse, never blocks send; no-auto-claim / no-PTY-inject 명시적 non-goal 유지 확인 |
| **verify[] 쓰기 권한 vs "owner-controlled" 주장** | **Fail** | PLAN.md 보안락 표는 "owner-controlled"라 쓰지만, 동일 UID의 어떤 peer든 MCP `set_purpose`/CLI로 `verify[]`를 쓸 수 있음 — 표 내부 모순 (UNKNOWNS.md §0.15.0 "Unknown unknowns"가 이미 이 남용 가능성을 인정) |
| **`loom verify` 실행 권한 경계** | **Fail** | `verify[]`는 실행되는 shell 문자열. untrusted handoff(`hints.ts` "review before destructive actions") → prompt-injected peer → `set_purpose`로 주입 → 이 repo의 "autonomy default: no mid-step approval" 관례상 확인 없이 `loom verify` 실행 가능 → unattended 로컬 코드 실행 경로 |
| set_purpose multi-profile 동시쓰기 | Pass (Low) | `withFileLock`로 파일 손상은 방지; last-writer-wins는 board와 동일한 수용된 residual |

### Findings (Sev: High|Med|Low, ID)

| Sev | ID | Finding | Evidence | Lock (PLAN 텍스트 추가 필요) |
|-----|-----|---------|----------|-------------------------------|
| **Med** | **M-24** | `verify[]` 쓰기 경로가 "owner-controlled" 전제를 무력화 — 동일 UID의 어떤 room peer(에이전트 포함)든 MCP `set_purpose` 또는 CLI로 `verify[]`를 쓸 수 있음 | PLAN.md 0.15.0 "Security / failure locks" 표 vs 쓰기 권한 서술 모순 | `verify[] write path (M-24)` — **MCP `set_purpose`는 `verify[]`를 생성/수정할 수 없다 (silent drop 아닌 명시적 에러로 거부). `verify[]`는 CLI `loom purpose set`으로만 쓸 수 있다 — 실행 가능한 문자열을 심는 유일한 경로에 에이전트 하네스의 exec-permission 게이트를 그대로 유지하기 위함. "owner-controlled" 표현 삭제.** |
| **Med** | **M-25** | `loom verify`의 무인 실행 위험 — MCP `set_purpose`는 에이전트 하네스의 실행 권한 게이트를 우회하는 "무해해 보이는" tool call이고, `loom verify`는 그 결과로 심어진 문자열을 하네스가 안전하다고 보는 커맨드로 실행함. 이 repo의 autonomy-default 웨이브 관례상 사람 확인 없이 자동 실행될 수 있음 | `AGENTS.md`/`HANDOFF.md` autonomy default; `hints.ts` untrusted-handoff 서술 | `loom verify execution (M-25)` — **실행 전 정확한 커맨드 목록을 verbatim 출력한다. `verify[]`가 마지막으로 확인(acknowledge)된 해시(loomDir() 하위 저장)와 다르면 TTY confirm 또는 명시적 `--yes`를 요구한다 — `--yes`도 커맨드를 echo한다. 미확인 레시피를 조용히 실행하지 않는다.** |
| Low | **L-30** | Purpose 파일 last-writer-wins (board와 동일한 수용된 residual) — `withFileLock`가 파일 손상은 막지만 갱신 유실은 막지 않음; `updatedByPeerId`로 충분 | `task-board.ts` `withFileLock` 패턴 대비 | backlog — board와 동일 residual, 별도 lock row 불필요 |

### Decision notes

- 아키텍처 자체는 타당함(sound): Purpose 카드 / handoff intent 태그 / receive-path 강제 / `loom verify`는 P0–P2가 남긴 "task-shaped, purpose-less" 간극을 메우는 합리적 다음 스텝이고, wire protocol v1도 그대로 유지된다. no-auto-claim / no-PTY-inject 비목표도 견고함 — 그대로 유지.
- 그러나 board 선례를 그대로 `verify[]`에 적용하는 것은 **범주 오류**다: board 데이터는 inert(제목/메모)라 동시쓰기 residual이 "손상 없음"으로 충분하지만, `verify[]`는 **실행되는 셸 문자열**이라 같은 residual이 곧 "임의 로컬 코드 실행 경로"가 된다. `sanitizePeerText`는 표시 안전성(display-safety)이지 실행 안전성(exec-safety)이 아니다 — "sanitized니까 실행해도 안전하다"는 함의를 문서에 남기지 말 것.
- M-24/M-25는 둘 다 **PLAN Failure/security locks 표에 lock row 3줄 추가**로 해소되는 범위이며 새 아키텍처·새 표면·프로토콜 변경이 아니다 (R15 Decision notes와 동일 논리: 방향은 맞고 표기만 비어 있었거나 모순이었을 뿐). **따라서 PATCH(0.15.1) 적용 후 — M-24/M-25가 Failure/security locks 표에 반영되고 PLAN Status가 이를 반영하면 — 전체 재리뷰(R16b) 없이 author-close를 허용한다.** (WORKFLOW §5.1 "PATCH 후 author-close 가능" 조항 적용.) L-30은 Low backlog로 선택 사항이며 PATCH를 막지 않는다.
- **구현은 여전히 금지** — PATCH가 적용되고 PLAN Status가 `approved`(author-close 포함)로 동기화되기 전까지 `packages/host/src/purpose.ts`, CLI `purpose`/`verify` 서브커맨드, MCP `get_purpose`/`set_purpose` 등 실제 코드 작성 금지.

### R16 follow-up (0.15.1 — required before implement)

| Finding | 처리 |
|---------|------|
| **M-24** | Failure/security locks: MCP `set_purpose`가 `verify[]` 생성/수정 시 명시적 에러로 거부; `verify[]`는 CLI `loom purpose set`으로만 쓰기 가능; "owner-controlled" 표현 삭제 |
| **M-25** | Failure/security locks: `loom verify` 실행 전 커맨드 verbatim 출력; `verify[]` 해시 미확인 시 TTY confirm 또는 `--yes` 필요(둘 다 echo) |
| L-30 | Low backlog; board와 동일 residual로 문서화 |
| PLAN | 0.15.1 `approved` 예정 (author-close per R16 Decision notes; **no R16b**) — PATCH 적용 시 |

### R16 follow-up applied (0.15.1)

| Finding | 처리 |
|---------|------|
| **M-24** | Failure/security locks: MCP rejects `verify[]`; CLI-only write |
| **M-25** | Failure/security locks: verbatim print + ack hash / TTY / `--yes` |
| PLAN | **v0.15.1** `approved` (author-close; **no R16b**) |

**Implement Purpose sprint 1 under 0.15.1 now allowed.**

---

## Review R15 — Plan v0.14.0 (P2 durable relay state)

**검토 대상:** `docs/PLAN.md` **v0.14.0** 52~148줄 — relay 재시작 내구성(room meta/roster incl. peerSecret/pending inbox 디스크 스냅샷). 코드 없음 — plan-vs-territory 리뷰 (`packages/relay/src/persist.ts` 미생성 확인).  
**검토자:** Claude (Sonnet 5, `claude-review`) + **Fable 5 second opinion** (`/advisor fable`, agent `fable-advisor`, 필수 컨설트 완료)  
**날짜:** 2026-07-10  
**결론:** **`pending-revision`** — Med 3건, 전부 **PLAN 텍스트(Failure/security locks 표에 lock row 추가)** 수정으로 해소 가능. 신규 아키텍처 변경 아님.

> Snapshot: 코드가 전혀 없는 상태의 설계 리뷰. `packages/relay/src/room.ts`(517줄)에 serialize/hydrate 훅 없음, `packages/host/src/atomic-json.ts`(198줄) 패턴이 relay-local로 복제될 예정.

### Checklist

| Area | Result | Evidence (as reviewed) |
|------|--------|-------------------------|
| Wire protocol v1 무변경 | **Pass** | PLAN Out "Protocol wire / envelope changes" 명시 |
| Atomic write + 0600 패턴 재사용 | **Pass** | `atomic-json.ts:25-39` temp+rename+chmod 0600, relay-local 복제 계획 (host→relay import 순환 회피, package.json 확인: `@loom/relay`는 `@loom/protocol`만 의존, `@loom/host`가 `@loom/relay`를 의존) |
| Corrupt JSON fail-closed(단일 room만) | **Pass (설계 수준)** | `atomic-json.ts:45-68` backup+throw; PLAN Failure 표 "skip that room" + Acceptance #5 |
| leave/claim 시맨틱 유지 | **Pass** | `room.ts:186-192`(removePeer: members+inboxes 동시 삭제), `room.ts:433-467`(claimHandoff: first-wins, terminal entry 즉시 delete) — PLAN "leave still drops…", "claim… delete terminal entry" 표기와 코드 현재 동작 일치 |
| 캡 불변(L-11/L-16) | **Pass** | `room.ts:317-341`(trimInbox) 로직 변경 없음, PLAN "Caps unchanged" |
| Ephemeral 테스트 격리 | **Pass (설계 수준)** | PLAN "Tests: `persist:false` or `LOOM_RELAY_EPHEMERAL=1`" — home 오염 방지 |
| **홈 디렉터리 해석 / M-14 게이트** | **Fail** → **M-21** | `relay-daemon.ts:86-99` — 로컬 auto-daemon spawn이 `LOOM_RELAY_HOST/PORT/TOKEN`만 자식 프로세스에 전달, 상태 디렉터리는 미전달. `loomDir()`은 `@loom/host/src/session-store.ts:209`에만 존재하고 relay는 import 불가(순환) |
| **Hydration secret 재생성** | **Fail** → **M-22** | `room.ts:106-161`(addPeer) — 미등록 id는 `generatePeerSecret()`으로 새 secret 발급. PLAN Implementation sketch "hydrate ctor" 한 줄뿐, lock 표에 미반영 |
| **다중 writer 충돌** | **Fail** → **M-23** | `relay-daemon.ts:60-65` — remote 안내 문구가 운영자에게 수동 `bun run dev:relay` 실행을 유도; auto-daemon과 동일 기본 state dir을 공유하면 조율 없이 스냅샷 상호 덮어쓰기 가능. `atomic-json.ts:80-198`에 이미 pid-ownership lock 패턴 존재하나 relay는 미채택 |

### Findings

| Sev | ID | Finding | Evidence | 요구 조치 |
|-----|-----|---------|----------|-----------|
| Med | **M-21** | Relay 기본 상태 디렉터리(`~/.loom/relay-state/`)가 M-14 마이그레이션 게이트(`loomDir()`)를 우회할 수 있음 — auto-daemon spawn이 상태 디렉터리를 자식에 전달하지 않고, relay는 host의 `loomDir()`을 import할 수 없음(패키지 의존 방향 역전) | `packages/host/src/relay-daemon.ts:86-99`, `packages/host/src/session-store.ts:209-215`, PLAN Out "host→relay cycle if import host" | Failure/security locks에 추가: **auto-daemon은 `LOOM_RELAY_STATE_DIR=join(loomDir(), "relay-state")`를 자식 env로 반드시 전달**; standalone/remote `loom relay`(호스트 프로세스 없이 직접 실행)는 게이트 예외로 독립 기본값 사용을 명시적으로 문서화 |
| Med | **M-22** | Hydration이 기존 `addPeer()`/`generatePeerSecret()` 경로를 재사용하면 재시작마다 **모든 peer의 M-7 rejoin secret이 새로 발급**되어 기존 클라이언트 rejoin이 전원 깨짐 (Acceptance #4에서 뒤늦게 드러날 위험) | `packages/relay/src/room.ts:106-161` | Failure/security locks에 추가: **hydrate는 저장된 `secret`으로 `members`/`inboxes` Map을 직접 재구성하며 `addPeer`/`generatePeerSecret`을 호출하지 않는다** |
| Med | **M-23** | 동일 state dir에 대한 다중 writer(로컬 auto-daemon + 운영자가 안내에 따라 수동 실행한 `dev:relay`) 충돌이 "optional lockfile"로 미확정 방치 — 데이터 유실이 에러 없이 조용히 발생 가능 | `packages/host/src/relay-daemon.ts:60-65`(수동 실행 안내), `packages/host/src/atomic-json.ts:80-198`(withFileLock 패턴 기존 존재) | Failure/security locks에서 "optional"을 확정으로 교체: **(a)** `atomic-json.ts`의 pid-ownership lock 패턴을 relay-local `persist.ts`에 채택 **또는** **(b)** `dev:relay` 스크립트 기본값을 ephemeral로 강제 — 둘 중 하나를 PLAN에 명시 |
| Low | **L-28** | 재로드 시 `RoomRegistry.byCode` 재구축에서 invite-code 충돌이 silent last-wins될 수 있음 | `room.ts:479-496`(byId/byCode 구조) | 충돌 시 로그 남기는 로직 권고 — backlog |
| Low | **L-29** | Room 파일이 GC 없이 재시작 간 누적(기존 in-memory는 relay 프로세스 종료마다 자연 소거됨 — 지속성 도입으로 신규 잔여 위험) | PLAN Out "Room auto-GC / TTL eviction of disk rooms \| Keep process+disk; GC later if needed" (이미 명시됨) | 이미 Out 표에 있으나 Failure/security locks 표에도 교차참조 한 줄 권고 — backlog, blocking 아님 |

### R15 second opinion (Fable 5) — 요약

fable-advisor 에이전트가 PLAN 0.14.0, `room.ts`, `atomic-json.ts`, UNKNOWNS §0.14.0, WORKFLOW §5, `relay-daemon.ts`를 독립적으로 Read/Grep 후 다음을 확인:
- M-21/M-22 **동의, Med** — "두 불변식이 스케치는 됐지만 Failure/security lock 표에 없어, lock을 지키는 구현이라도 기능이 깨질 수 있음"이 pending-revision의 핵심 근거.
- M-23 **대체로 동의, Med-Low** — `relay-daemon.ts:63`이 사용자에게 수동 `dev:relay` 실행을 유도하는 실제 코드 경로가 있어 충돌이 가상이 아님. "optional"로 방치하지 말고 작성자가 (a)/(b) 중 하나를 확정할 것을 권고.
- L-28/L-29 추가 제시 (byCode 충돌 로깅, disk growth residual) — 둘 다 non-blocking으로 합의.
- 나머지(schema, caps 재사용, offline-on-load, leave/claim flush 시맨틱, ephemeral 테스트 게이트, 잔여 위협 모델)는 "sound"로 확인.
- **독립 결론:** `pending-revision` — "narrow, PLAN-text-only fixes; PATCH 후 author-close 가능, 전체 재리뷰 불필요."

### Decision notes

M-21/M-22/M-23은 전부 **PLAN 텍스트(Failure/security locks 표에 lock row 3줄 추가)** 로 해소되는 범위이며, 새 아키텍처·새 표면·프로토콜 변경이 아니다. 근거: (1) M-21/M-22는 "이미 스케치된 의도를 명문화"하는 것뿐 — 스키마에 `secret` 필드가 이미 있고 Out 표가 host→relay 순환을 이미 인지하고 있어 방향은 맞고 표기만 비어 있었음. (2) M-23은 기존 `atomic-json.ts` lock 패턴을 재사용하거나 스크립트 기본값 하나를 바꾸는 결정이면 충분.

**따라서 PATCH(0.14.1) 적용 후 — Open blocking M-21/M-22/M-23이 Failure/security locks 표에 반영되고 PLAN Status가 이를 반영하면 — 전체 재리뷰(R15b) 없이 author-close를 허용한다.** (WORKFLOW §5.1 "PATCH 후 author-close 가능" 조항 적용.) L-28/L-29는 Low backlog로 선택 사항이며 PATCH를 막지 않는다.

**구현은 여전히 금지** — PATCH가 적용되고 PLAN Status가 `approved`(author-close 포함)로 동기화되기 전까지 `packages/relay/src/persist.ts` 등 실제 코드 작성 금지.

### R15 follow-up (0.14.1 — applied)

| Finding | 처리 |
|---------|------|
| **M-21** | Failure/security locks: auto-daemon **must** pass `LOOM_RELAY_STATE_DIR=join(loomDir(),"relay-state")`; standalone gate-exempt docs |
| **M-22** | Hydrate **must not** call `addPeer`/`generatePeerSecret`; direct Map reconstruct from stored secret |
| **M-23** | **Required (a)** pid-ownership exclusive lock in relay `persist.ts` (not optional) |
| L-28/L-29 | Low backlog; L-29 residual cross-ref in locks table |
| PLAN | **v0.14.1** `approved` (author-close per R15 Decision notes; **no R15b**) |

**Implement P2** under 0.14.1 now allowed.

---

## Review R14 — Cumulative trust (0.11–0.13.3 code / PLAN v0.13.4)

**검토 대상:** 제품 코드 **0.11.0 … 0.13.3** (desktop sticky, pack embed L-5, requestId L-4, dogfood, install DX) + PLAN **v0.13.4** (이 리뷰 기록)  
**검토자:** Fable 5–equivalent security/consistency lane (code Read/Grep; Owner P1-B)  
**날짜:** 2026-07-10  
**결론:** **`approved`** (no High/Med; Low L-26 / L-27 → backlog)

> Snapshot: post-ship cumulative trust review, not a greenfield plan. Author-close series 0.12–0.13 gets external R{n} coverage for P1.

### Checklist

| Area | Result | Evidence (as reviewed) |
|------|--------|------------------------|
| Sticky token / RPC | **Pass** | `sticky-server.ts` `127.0.0.1` only; Bearer + `timingSafeTokenEqual`; meta `0o600`; desktop Rust-only token (`sticky.rs`); UI `invoke` only |
| Pack embed (L-5) | **Pass** | `embedPackFileBodies` re-`resolveAllowlistedPath` at send; caps; symlink-out skip; tests |
| Inbox claim first-wins | **Pass** | `room.claimHandoff` delete-on-claim; peer-scoped; tests |
| Desktop XSS (M-20) | **Pass** | `app.js` `setText` → `textContent`; no `innerHTML` |
| requestId (L-4) | **Pass** | wire echo same-socket; FIFO legacy fallback; no privilege use |
| Install DX (0.13.3) | **Pass** | `scripts/loom` / `link:loom` local path only; no secret surface |

### Findings

| Sev | ID | Finding | Evidence | Outcome |
|-----|-----|---------|----------|---------|
| Low | **L-26** | Desktop sticky client does not enforce CLI **F-2** roomId/peerId match; after re-join without host restart, desktop can RPC old host (same OS user only) | CLI `resolveLiveHostMeta` vs Rust `load_meta` (pid only) | **backlog** |
| Low | **L-27** | Pack embed residual TOCTOU: realpath then read can race same-path symlink swap | `context-pack.ts` embed path | **backlog** (primary L-5 closed) |

### Non-findings / accepted

| Item | Note |
|------|------|
| L-23 | `/health` unauth loopback — accepted since 0.11.1 |
| Relay in-memory inbox | MVP; P2 durable candidate — not a 0.11–0.13 regression |
| M-19 / M-20 | Hold through 0.12–0.13 |
| sanitize ≠ HTML | Terminal sanitize; desktop XSS via textContent (by design) |

### Decision notes

No High/Med issues and no plan-vs-code security drift that blocks trust for the 0.11–0.13.3 surface. Token stays loopback-Bearer + file-0600 and never reaches the webview; pack embed re-resolves allowlist at send; claim is first-wins and peer-scoped; desktop UI is textContent-only. **P1-B closed.** Next product gate: **P2 durable inbox** requires MINOR + new R{n}. Low L-26/L-27 optional.

### R14 follow-up (0.13.5 — applied)

| Finding | 처리 |
|---------|------|
| **L-26** | `StickyClient::load_live_meta` + all desktop RPC; CTA `session_mismatch` |
| **L-27** | `readAllowlistedFileText` O_NOFOLLOW open + fd read + re-resolve; test symlink swap |
| PLAN | **v0.13.5** author-close (R14 Low; no re-R{n}) |

---

## Review R13 — Plan v0.11.0 (M4.3b Tauri desktop shell)

**검토 대상:** `docs/PLAN.md` **v0.11.0** — thin Tauri 2 shell via sticky host loopback RPC  
**검토자:** implementer lane + **Fable 5 second opinion**  
**날짜:** 2026-07-09  
**결론:** **`pending-revision`** → **0.11.1 applied / approved**

> Snapshot: plan-vs-territory review (no `apps/desktop` yet at review time).

### Checklist (summary)

| # | Item | Result |
|---|------|--------|
| A2 | Sticky: status/peers/inbox/claim | **Yes** |
| A3 | Sticky board ops | **No** → M-18 |
| A7 | webview fetch / CORS | **Broken** → M-19 |
| A9 / M-20 | sanitize ≠ HTML escape | **Med** after second opinion |
| P4 | cargo/rustc / tauri CLI | **Yes** (build cross-check) |

### Findings → outcomes

| Sev | ID | Finding | Outcome |
|-----|-----|---------|---------|
| **Med** | **M-18** | Board promised; not on sticky RPC | **0.11.1 C** — Board **out of v1** |
| **Med** | **M-19** | Transport + session + (L-24) token boundary | **0.11.1** Rust invoke-only; session order; token Rust-only |
| **Med** | **M-20** | sanitize ≠ HTML; textContent required | **0.11.1** locked + XSS acceptance |
| Low | L-21 | (original) peer XSS | **→ M-20** |
| Low | L-22 | UNKNOWNS stub | **filled** |
| Low | L-23 | /health unauth | **accepted** document |
| Low | L-24 | token to webview | **→ M-19** |
| Low | L-25 | host-absent cases | **0.11.1** acceptance #4a–c |

### Decision notes (as-reviewed)

Direction sound (sticky reuse, no second join). Blockers were plan blanks, not code bugs. Second opinion correctly raised L-21→M-20.

### R13 follow-up (0.11.1 — applied)

| Finding | 처리 |
|---------|------|
| **M-18** | Option **C** — no Board view/ops in v1 |
| **M-19** | Rust `invoke` → HTTP loopback + Bearer; session `LOOM_SESSION` → profile → default; token never to JS |
| **M-20** | textContent-only; sanitize not HTML; XSS acceptance test |
| **L-25** | meta missing / stale pid / 401 CTAs |
| PLAN | **v0.11.1** `approved` |
| Gate | Implement `apps/desktop` next; CLI VERSION on implement wave |

### R13 second opinion (Fable 5) — retained summary

Independent Read/Grep agreed M-18/M-19; promoted HTML/XSS to **M-20**; L-24/L-25 added (folded/closed in 0.11.1). Toolchain `cargo build` cross-check OK.

---

## Review R12 — Plan v0.10.0 (dual-compat drop)

**결론:** **`pending-revision`** → **0.10.1 approved** (M-17 + L-17/L-18/L-20). **L-19** closed residual.

### R12 follow-up (0.10.1)

| Finding | 처리 |
|---------|------|
| **M-17** | `envRelay*` wiring |
| **L-17/L-18/L-20** | tests + `envTokenInQuery` |
| **L-19** | won't-fix residual legacy |

---

## How to add a new review

1. Bump `docs/PLAN.md` Version / Status = `pending-review`.  
2. Append `## Review R{N}` here; update Active review, Open, index, header.  
3. On approve: PLAN `approved`; findings → Recent follow-ups.  
4. Archive older full bodies if active file grows past ~250 lines historical.  
5. MINOR: WORKFLOW §3.5 / `docs/UNKNOWNS.md` pre-check.
