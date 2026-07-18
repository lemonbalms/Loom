# Loom — Multiplayer AI Terminal (Mosaic-class)

| Field | Value |
|-------|--------|
| **Document** | `docs/PLAN.md` |
| **Version** | **0.23.9** |
| **Status** | **`approved`** (R34 author-close `approved` no R34b — **M-1 lock**(② done_proposal 탐지 도달성: delta/폴백 chrome-필터본 **말미 비공백 K줄(K=3) line-anchored** 판정 + 안내 문구 "최종 줄(들)로" + 규약 블록 문안 마커 비-줄-선두 + 테스트 ⑬ 교체) 반영 + **L-1**(동시 스폰 race cosmetic 수용)·**L-2**(재시작 후 풀 탭 재발견 미지원 인지) author-close — 상세 `docs/plan_review.md` R34) — **conv done_proposal 규약 완결 + conv.open deny 클레임 정합 + 브릿지 pane 배치 정책 (후보 ②③⑧)** (PATCH): 브릿지에만 존재하고 워커는 알 길이 없던 done_proposal 탐지 규약(0.23.6 L-4 구현·규약 미고지로 라이브 도달 불가)을 conv open 규약 블록 안내 + 타워 보드 표면화로 완결하고(② — 자동 close 없음, 타워 전권 유지), 비인가 conv.open을 선클레임 후 버리던 카드-관례 divergence를 무클레임 ignore+log로 정합하며(③ — turn/close는 현행), 무힌트 스폰이 글로벌 포커스 탭을 분할-침입하던 것(라이브 프로브 실증)을 브릿지-로컬 워커 풀 탭 정책(tab_id/split 힌트 + pane.list 실사, 탭당 최대 4 워커, 만석 시 새 탭, fail-open 폴백, opt-out `panePlacement:"legacy"`)으로 대체한다(⑧ — §1.3 self-enforcing). **wire 무변경 · MCP 도구 무변경 · herdr 기존 op의 파라미터 전달·기존 op 신규 호출 2종(tab.create/pane.list)만.** 직전: 0.23.8 **`approved` → implemented `93c6283`** (R33 author-close `approved` no R33b — M-1·M-2 lock + L-1·L-2 반영 · 구현+독립 검증+라이브 스모크(⑥ 자동 close·chrome 소거·⑦ CLI 왕복 실증) 완료 — §0.23.8 Implemented 참조) — **워커 pane 정리 정책 + conv-hosts CLI + chrome known-hint 2종 (후보 ⑥⑦ + 0.23.7 부수 관찰)** (PATCH): 카드 done·conv close 후 워커 pane이 무기한 잔존해 수동 정리 관례에 의존한다(0.23.0 스모크부터 "후보 ⑥ 미구현 관례", 오너 pane 배치 규칙 §1.3(탭당 최대 4개)과 충돌). 완료-확신 시점(지표-소거 done·conv.close 수신)에만 결과 전송 성공 후 best-effort `pane.close`를 수행하고(**exhausted·failed 경로는 pane 유지** — 진행-중 작업 kill·진단 표면 상실 배제, 로컬 opt-out `paneCleanup:"keep"`), conv scp 호스트 매핑(M-2 해석의 유일 출처)에 검증된 CLI `loom conv-hosts set|list|rm`을 제공하며(현행 손편집 — corrupt 시 침묵 miss), 라이브 3회 실증된 chrome 미커버 2종(grok 상태줄 콘텐츠-포함 box줄·claude `⏵⏵ auto mode on` 힌트줄)을 보수 필터에 추가한다(summary·conv inline만 — R31 M-1 경계 유지). **wire 무변경 · MCP 도구 무변경 · herdr RPC 표면 무변경(기존 `pane.close` op 재사용).** 직전: 0.23.7 **`approved` → implemented `1160b38`** (R32 author-close `approved` no R32b · 구현+독립 검증+라이브 스모크(유예 실발화·실완료본 회신 실증) 완료 — §0.23.7 Implemented 참조) — **카드 완료 판정 still-running 유예 (card.done 조기 회신 수정)** (PATCH): herdr가 워커 백그라운드 커맨드 실행 중에도 idle을 방출해 브릿지가 미완 화면("1 command still running")을 그대로 card.done `output`으로 조기 회신한다(2026-07-19 카드 웨이브 라이브 2회 실증 — 실완주는 ~4분 뒤). 완료 판정 시 스크레이프 말미의 still-running 지표를 보수 감지하면 결과 회신을 상한부 유예(폴링)하고, 유예 사실을 additive optional `note`로 관측 가능하게 한다. **herdr RPC 표면 무변경 · MCP 도구 무변경 · wire는 additive optional 1필드(`note`)만.** 직전: 0.23.6 **`approved` → implemented `5bdeae7`** (R31 author-close `approved` no R31b · 구현+독립 검증 완료, codex 자문 부분 종결(공회전 — Med 표면화 없음), M-1 라이브 검증 불요 — §0.23.6 Implemented 참조) — **워커 pane 스크레이프 delta화 + TUI chrome 필터 (후보 ⑤ + 관찰 ⓐⓒ)** (PATCH): conv 워커 턴·카드 결과가 pane 최근 200줄 전체를 매번 실어 보내 이전 턴 전문·TUI chrome이 좁은 스크레이프 창(실측 상한 claude ~5.3k/grok ~2.2k/codex ~1.4k)을 잠식한다. delta 앵커(직전 턴 꼬리, 공백-정규화 매치)로 신규 내용만 싣고, 명백한 chrome 줄(box-drawing·키 힌트)을 보수 필터하며, idle 직후 렌더 미완 스크레이프를 settle 재독으로 안정화한다. **wire·MCP·herdr RPC 표면 무변경, 신규 신뢰 표면 없음(untrusted 콘텐츠 read-only shaping).** |
| **Supersedes** | 0.23.8 |
| **Last updated** | 2026-07-19 |
| **Approval** | **R32 author-close `approved`**(0.23.7) → implemented `1160b38` + 라이브 스모크(SMOKE-0237 유예 실발화) · 직전: **R31 author-close `approved`**(0.23.6) → implemented `5bdeae7` · **R30 author-close `approved`**(0.23.5) → implemented `8148642` + codex 자문 REJECT 7건 반영. 스펙 정본 `docs/CONV_SPEC.md`는 R24 approved 유지(재론 없음 — 이 PATCH는 브릿지 pane 수명·로컬 CLI·필터 패턴 추가, conv/card 프로토콜 의미 무변경). |
| **Fable 5 when** | **R34 완료(2026-07-19)**: `pending-revision` → **author-close `approved`**(M-1(② 탐지 도달성 — 말미 K줄 line-anchored) lock + L-1·L-2 author-close, no R34b — Fable 사전 승인). 직전: R33 완료(2026-07-19) `pending-revision` → author-close `approved`(M-1(close 적격 명시 파라미터)·M-2(charset `:` 제거) lock + L-1·L-2, no R33b — Fable 사전 승인) → implemented `93c6283`. |
| **Priorities** | [`docs/PRIORITIES.md`](./PRIORITIES.md) — launcher UX after work bus |
| **Canonical path** | `docs/PLAN.md` (repo). Session copy is non-authoritative. |
| **Original design** | ⛔ **`docs/ORIGIN.md`** — 최초 설계안(v0.1.0) 불변 baseline + delta. 이 PLAN은 **as-built**이며 R1 피벗 당일 원래 비전을 제자리 덮어썼다. 원래 목적지(Mosaic-parity·presence·Phase 0~5) 대조는 ORIGIN 참조. |
| **Related** | `docs/WORKFLOW.md` (작업 규칙·§3.5 Unknowns), `docs/UNKNOWNS.md`, `docs/plan_review.md`, `docs/ARCHITECTURE.md`, `docs/PROTOCOL.md` |
| **Naming** | **Loom** = product. **Fable 5 / fable-advisor** = review agent (not the product). |
| **Workflow** | 구현·리뷰·ship 절차 → **[`docs/WORKFLOW.md`](./WORKFLOW.md)** |

---

## Version control (계획 버전 관리)

이 파일이 **제품 계획의 단일 원본(SSOT)** 이다. 구현·리뷰·승인 게이트는 아래 규칙을 따른다.

### 버전 번호 (SemVer 유사)

| 자리 | 의미 | 예 |
|------|------|-----|
| **MAJOR** (`1.0.0`) | 제품 방향·성공 정의 변경, 이전 계획과 양립 불가 | 멀티휴먼 포기 등 |
| **MINOR** (`0.2.0`) | 아키텍처 전제·수신 모델·페이즈 범위 변경 (리뷰 재요청) | MCP push 폐기, 큐 모드 기본 |
| **PATCH** (`0.2.1`) | 완료 기준 보강, 보안 범위 명확화, 일정·경로 (재리뷰 선택) | R2 H-1/M-1 → M1.1 |

### 상태 값

| Status | 의미 |
|--------|------|
| `draft` | 작성 중 |
| `pending-review` | 리뷰 요청 가능 / 대기 |
| `approved` | 이 버전 기준 구현 진행 허용 |
| `superseded` | 상위 버전에 대체됨 |
| `on-hold` | 블로커로 의도적 중단 |

### 변경 시 필수 절차

1. 상단 **Version** 올리고 **Status**를 `draft` 또는 `pending-review`로 둔다.
2. 아래 **Changelog**에 항목을 추가한다 (What / Why / Review impact).
3. 재리뷰가 필요하면 Status = `pending-review`, 리뷰어는 `docs/plan_review.md`에 **대상 버전**을 명시해 결과를 남긴다.
4. 승인 시 Status = `approved`, Changelog에 `Approved by …` 한 줄 추가.
5. 구현은 **approved 버전만** 기준으로 한다. 코드가 앞서 나가면 다음 PATCH/MINOR에 “Implemented as of …”로 동기화한다.

### Changelog

#### 0.23.9 — 2026-07-19 (`pending-revision` R34 — **conv done_proposal 규약 완결 + conv.open deny 클레임 정합 + 브릿지 pane 배치 정책 (후보 ②③⑧)** (PATCH))

**Product one-liner:** 브릿지에만 존재하고 워커는 알 길이 없던 done_proposal 탐지 규약을 워커-발견가능하게 완결하고(②), 비인가 conv.open을 클레임 후 버리던 카드-관례 divergence를 정합하며(③), 무힌트 스폰이 오너가 보고 있는 탭을 분할-침입하던 것을 브릿지-로컬 워커 풀 탭 정책(§1.3 self-enforcing, 탭당 최대 4 워커)으로 대체한다(⑧).

**Why:**
- **② done_proposal 규약 미완결**: 0.23.0 follow-up ②. 브릿지 탐지(`[DONE_PROPOSAL]` prefix → kind=done_proposal, 0.23.6 R31 L-4 — delta 선두 판정)는 구현돼 있으나 **규약을 워커에게 알려주는 곳이 없다** — conv open 주입의 브릿지-저작 규약 블록(§5.1 artifact convention, R28 L-2)에 done_proposal 항목 부재. 워커가 모르는 브릿지-로컬 규약은 라이브에서 사실상 도달 불가(우연 방출만). 타워측(conv-ops.ts)은 kind=done_proposal을 `doing` 유지 + notes `kind=done_proposal` 병기뿐이라 완료 제안이 보드에서 구별되지 않는다.
- **③ conv.open M-1 deny 클레임 순서 divergence**: 0.23.0 follow-up ③. 카드 경로는 M-1 deny를 **클레임 없이** ignore+log(processedHandoffs 마킹만 — 스펙 관례). conv 경로는 라벨 불문 **선클레임 후** processConvIntent 내부에서 deny — 비인가 발신의 conv.open handoff를 브릿지가 소비(claim)한다. 저위험이나 "비인가 입력은 무소비" 원칙 훼손.
- **⑧ pane 배치 정책 부재 (오너 질문발, 2026-07-19)**: DOGFOOD_LOOP §1.3(탭당 최대 4개 2×2)은 문서 관례일 뿐 스폰 시 강제 지점이 없다. **라이브 프로브 실측(2026-07-19, 이 초안 선행)**: 무힌트 `agent.start`는 **글로벌 포커스 탭의 포커스 pane을 분할** — 워커 pane이 오너가 보고 있는 화면에 직접 침입하며, 이것이 pane 누적·수동 재배치 관례의 근원.

**⑧ 라이브 프로브 확정 사실 (2026-07-19 — 스펙 전제, [가정] 아님):**
| 표면 | 실측 |
|------|------|
| `agent.start` RPC 파라미터 | `tab_id`·`split`("right"\|"down") 수용 — **snake_case(CLI 플래그 `--tab`/`--split`과 명칭 상이)**. `pane_id`(분할-기점 타깃)는 **무시됨** — 분할 기점은 항상 **해당 탭의 포커스 pane** 고정. |
| 무힌트/`workspace_id`-만 스폰 | 글로벌 포커스 탭의 포커스 pane 분할 — 오너 화면 침입 실증(프로브 A·E). |
| `tab.create` RPC | `{workspace_id?, focus:false, label?}` — 글로벌 포커스 불변, root shell pane 포함 반환. |
| 크로스-탭 `agent.focus` | **보이는 탭을 전환**(글로벌 포커스 절도 실증) → 포커스 댄스 기반 완전 2×2는 기각. |
| `focus:false` 스폰 | 탭 내 포커스 불이동 — root shell close 후 탭 내 포커스는 첫 워커에 고정, 이후 split 기점이 결정론적. |
| 4-워커 시퀀스 실증 | tab.create → W1(split right) → root close → W2(right)·W3(down)·W4(down) = 좌열 3-스택 + 우열 전고(근사 2×2, 탭당 4 bounded). |
| `pane.list` RPC | 실재 — pane별 `pane_id`/`tab_id`/`workspace_id`/`agent_status` 반환(풀 실사 가능). |

**What (범위 — PATCH; wire 무변경 · MCP 도구 무변경 · herdr RPC는 기존 op의 기존 파라미터 전달만(agent.start `tab_id`/`split`)·기존 op 신규 호출 2종(`tab.create`/`pane.list`) — 신규 신뢰 표면 없음(로컬 소켓 기존 권한 내)):**
| 항목 | 내용 |
|------|------|
| **② 워커-발견가능 규약** | conv open 주입의 브릿지-저작 규약 블록(untrusted 래퍼 **밖** — R28 L-2 선례 그대로)에 done_proposal 항목 추가: 목표 완료 판단 시 **응답의 최종 줄(들)로 `[DONE_PROPOSAL] <한 줄 요약>`을 출력**하라는 안내(R34 M-1 — 탐지기 실의미론과 일치하는 문구). **규약 블록 문안 자체는 마커를 줄-선두에 두지 않는다**(R34 M-1 — `:1042` `[ARTIFACT]` "print a final line exactly: …" 선례 동형 — 규약 에코가 말미 판정에 위양성을 주지 않게). 카드 lane 비대상(카드는 done_proposal 개념 없음 — conv 한정). |
| **② 탐지 로직 변경 (R34 M-1 lock — "탐지 무변경" 전제 삭제)** | kind=done_proposal 판정 = 판정 입력 텍스트의 **말미 비공백 K줄(K=3) 내에 `[DONE_PROPOSAL]`로 시작하는 줄 존재**(line-anchored — 0.23.7 still-running 말미-10줄·`ARTIFACT_MARKER_LINE` 선례 동형). 판정 입력 = delta 적용 턴은 delta 텍스트, **폴백(anchor miss·no anchor·32k) 턴은 chrome-필터본 full scrape(raw 아님 — 입력 통일)**, scrapeFailed 턴은 현행 비판정 유지. 근거: delta는 직전 턴 꼬리 앵커 이후 신규 콘텐츠 **전부**(타워 턴 에코 + 중간 출력 + 최종 메시지)라 기존 delta-전체-선두 판정으로는 규약-준수 워커도 구조적 미탐지(에코 잔존은 `isInjectProbeHit`가 의존하는 실측 사실). blocked kindHint 우선은 현행 유지. |
| **② 타워 표면화** | `applyConvTurn`: kind=done_proposal 수신 시 보드 notes를 구별 가능한 고정 문구로 — `[DONE_PROPOSAL] worker proposes completion — conv.close(reason done) to accept (last turnSeq=N)`. **status는 `doing` 유지** — done 전이는 conv.close(reason "done")만(§3.4 타워 전권, 자동 close 없음). notes는 브릿지/타워 생성 고정 문구 + seq만(스크레이프 본문 미인용 — 0.23.7 선례). `last turnSeq=` 표기는 표시 전용(재파싱 없음 — 코드 확인). |
| **③ 클레임 정합** | `processInboxEntry` conv 분기: label이 **conv.open이고** `!isAuthorizedDispatcher` → processedHandoffs 마킹 + log만, **클레임 없이 return**(카드 M-1 deny와 동일 형태). **turn/close 라벨은 현행 유지**(선클레임 후 pin 검사 — pin 판정은 conv state가 필요하고, 기존 pin 관계 내 메시지라 신뢰 수립 intent가 아니며, 비인가 turn의 인박스 잔류 방지 이점 유지). `processConvIntent` 내부 M-1 검사는 이중 방어로 잔존(도달 불가 경로여도 계약 유지). |
| **⑧ 워커 풀 탭 정책** | 브릿지가 스폰하는 모든 워커 pane(카드+conv 공통)을 **브릿지-로컬 풀 탭**으로: in-memory `workerPool { tabId, paneIds: Set }` + **스폰 직전 `pane.list` 실사가 SSOT**(수동 close·탭 소멸 반영 — in-memory는 후보 키). ① 풀 탭 실재 + live 브릿지 pane <4 → `agent.start { tab_id, split }` (split은 live 수 기준 1→"right", 2→"down", 3→"down") ② 풀 탭 부재/소멸/만석 → 신규 풀 탭 시퀀스: `tab.create { focus:false, label:"loom-workers" (+ config workspace) }` → 첫 워커 `agent.start { tab_id, split:"right" }` → **root shell `pane.close`**(탭 워커-전용화; best-effort — 실패 무시, 대상은 방금 만든 탭의 root뿐). 만석 풀 탭은 풀에서 제거(기존 워커 pane은 불이동 — 재배치·리밸런싱 없음). **동시 스폰 race 인지(R34 L-1 author-close)**: 인박스 폴 사이클 중첩 시 실사→스폰 비원자 구간에서 두 스폰이 같은 탭을 선택해 탭당 4 초과 배치가 날 수 있다 — **초과 배치는 cosmetic으로 수용**(다음 스폰의 실사가 만석 판정으로 신규 탭 전이·워커 가용성 무영향, 직렬화 기계 도입은 스코프 밖). **재시작 경계 인지(R34 L-2 author-close)**: in-memory 풀 소실 + `pane.list`는 tab label 미반환이라 **재시작 후 기존 풀 탭 재발견은 미지원 — 새 풀 탭을 생성**한다. 구 풀 탭(잔존 워커 포함 가능)은 0.23.8 자동 close가 빈 탭화까지는 진행하나 탭 소거는 미보장 — **잔존 빈 탭은 수동 정리 관례**(운영 문서화). |
| **⑧ 실패 폴백 (fail-open)** | `tab.create` 또는 힌트 스폰 실패 시 **무힌트 `agent.start` 1회 재시도**(현행 배치) + stderr 로그 — 배치는 cosmetic, 워커 가용성 우선. 폴백 성공 pane은 풀에 미등록(다음 스폰은 다시 풀 경로 시도). |
| **⑧ opt-out** | 브릿지 config `panePlacement?: "pool" \| "legacy"`(기본 `"pool"`, load 시 비정상 값 sanitize — R33 paneCleanup 선례) + `paneWorkspaceId?: string`(풀 탭 생성 워크스페이스; 미설정 시 `workspace_id` 생략 = herdr 기본). `"legacy"` = 현행 무힌트 스폰. `bridge status`에 현재 정책 표기. |
| **HerdrClient** | `agentStart` opts에 optional `tabId`/`split` passthrough · 신규 메서드 `tabCreate`/`paneList`(기존 herdr op 래핑, 1 RPC = 1 연결 관례 동일). |
| **테스트** | fake-herdr 요청 기록으로: **⑧** ① 첫 스폰 = tab.create → tab_id/split 스폰 → root pane.close 시퀀스 ② 2·3·4번째 스폰 = 동일 tab_id + split right/down/down ③ 5번째 = 신규 tab.create(만석 전이) ④ pane.list 실사 — 수동 닫힌 pane 제외 후 재사용 ⑤ 풀 탭 소멸(pane.list에 tab 부재) → 신규 탭 ⑥ tab.create 실패 → 무힌트 폴백 스폰 + 카드 정상 진행 ⑦ 힌트 스폰 실패 → 무힌트 폴백 ⑧ `panePlacement:"legacy"` → 현행 무힌트(tab.create 미호출) ⑨ conv lane도 풀 경유 ⑩ 기존 카드·conv 왕복 회귀(스폰 파라미터 외 무변경) **②** ⑪ conv open 주입 프롬프트에 done_proposal 규약 문구 포함(+ artifact convention 공존) ⑫ 타워 done_proposal notes 고정 문구 + status doing 유지 ⑬ **(R34 M-1 교체)** 규약-준수 워커 시나리오 — delta에 타워 턴 에코 + 중간 출력 + 말미 `[DONE_PROPOSAL] …` 줄 → kind=done_proposal + 타워 notes 고정 문구(⑫ 결합) · **본문 중간에 마커 인용(말미 아님) → 미탐지**(경계) · 폴백 턴(anchor miss)의 chrome-필터본 말미 마커 → 탐지 **③** ⑭ 비인가 conv.open → claim 미호출(fake client claim 기록 부재) + processedHandoffs 마킹(재처리 없음) ⑮ 인가 conv.open 회귀(클레임 + accept) ⑯ 비인가 turn/close = 현행(선클레임 후 pin 무시) 유지. |

**Out of scope:** 후보 ④(agentKind 확장) · 완전 2×2 기하(포커스 댄스 = 보이는-탭 절도 실증이라 기각 — 근사 배치로 충분, 탭당 4 bounded가 §1.3의 핵심) · 기존 pane 재배치/리밸런싱(스폰 시점 정책만) · done_proposal 자동 close(타워 전권 유지 — 표면화만) · herdr 자체 개조 · 카드 lane의 done_proposal(conv 한정 개념) · 아키텍트/오너가 수동 스폰하는 pane(브릿지 스폰만).

**Security / trust (R34 판단 대상):**
- **② 규약 블록은 브릿지 저작**(untrusted 래퍼 밖) — goal 콘텐츠가 규약 문구를 위조해도 판정은 워커 **출력** 기준이라 무관. 워커(untrusted)가 done_proposal을 조기/허위 방출해도 결과는 **보드 노트 표시뿐**(자동 close·상태 전이 없음 — 타워 결정 유지). notes는 고정 문구+seq만(본문 미인용). **탐지 완화(전체-선두 → 말미 line-anchored, R34 M-1)는 위양성 표면을 넓히나 최악이 위와 동일하게 보드 노트 표시뿐이라 bounded** — `[ARTIFACT]` 마커가 이미 수용한 동일 노출 클래스.
- **③은 처리 표면 축소 방향** — 비인가 입력을 소비하지 않게 됨. processedHandoffs 마킹은 카드 경로와 동일(재시작 후 드레인 재조우 시 재마킹, 무한 루프 없음).
- **⑧ 신규 원격 표면 없음** — 배치는 브릿지 로컬 정책, wire 필드로 제어 불가. `tab.create`/`pane.list`/`agent.start` 파라미터는 로컬 herdr 소켓의 기존 권한 내. root shell close 대상은 **브릿지가 방금 생성한 탭의 root pane뿐**(타 pane 대상 아님). 폴백은 현행 동작과 동일하므로 악화 없음. 워커 pane이 오너 포커스 탭에 침입하지 않게 되는 것은 보안 관점에서도 개선(오너 오입력 표면 축소).
- **프로브 산출물**: 스크래치패드 1회성 스크립트만 — 제품 코드 무영향.

**Review impact:** ③은 M-1 신뢰 경계의 처리 순서 변경(축소 방향) + ⑧은 스폰 배치 정책 신설(herdr 호출 표면 확장 — 기존 op이나 신규 호출 2종) + ②는 주입 프롬프트 표면 추가(브릿지 저작 블록) — **R34 요청**(§5.1 보수 관례). 프로브 실측이 스펙 전제를 전부 해소해 [가정] 없음.

**Approved by:** Fable 5 (fable-advisor consulted, claude-rev pane) R34 — `pending-revision` → **M-1 lock**(② done_proposal 탐지 도달성: 기존 delta-전체-선두 판정은 에코·중간 출력 선행으로 규약-준수 워커도 구조적 미탐지 — "탐지 무변경" 전제 삭제, 탐지 = 판정 입력(delta / 폴백은 chrome-필터본 full scrape) **말미 비공백 K줄(K=3) line-anchored** + 안내 문구 "응답의 최종 줄(들)로" 정정 + 규약 블록 문안 마커 비-줄-선두(`[ARTIFACT]` 선례) + 테스트 ⑬ 교체) 본문 반영 + **L-1**(동시 스폰 race — 탭 4 초과는 cosmetic 수용, 다음 실사가 회복)·**L-2**(재시작 후 풀 탭 재발견 미지원 — 새 풀 탭 생성 + 잔존 탭 수동 정리 관례) author-close → **author-close `approved`**(Fable 사전 승인, no R34b), 2026-07-19. 상세 `docs/plan_review.md` R34.

#### 0.23.8 — 2026-07-19 (`approved` R33 — **워커 pane 정리 정책 + conv-hosts CLI + chrome known-hint 2종 (후보 ⑥⑦ + 0.23.7 부수 관찰)** (PATCH))

**Product one-liner:** 카드 완료·conv 종료 후 워커 pane이 무기한 잔존해 수동 정리에 의존하던 것을 브릿지가 **완료-확신 시점에만** best-effort로 닫고(⑥), 스모크에서 손편집으로만 등록되던 conv scp 호스트 매핑에 검증된 CLI 표면을 제공하며(⑦), 라이브 3회 실증된 chrome 미커버 2종(grok 상태줄·claude 힌트줄)을 보수 필터에 추가한다.

**Why:**
- **⑥ pane 정리**: 0.23.0 conv 스모크부터 "워커 pane 수동 close(후보 ⑥ 미구현 관례)"로 기록 — 매 웨이브 아키텍트가 수동 정리. 오너 pane 배치 규칙(DOGFOOD_LOOP §1.3 — 탭당 최대 4개 2×2)으로 pane 누적은 이제 운영 제약. R25 실증 교훈(조기 close 시 브릿지 스크레이프 회신 유실)이 있어 "언제 닫아도 안전한가"의 **정책**이 필요했고, 0.23.7 still-running 유예로 done `output` 신뢰가 회복되어 자동 close의 전제가 성립했다.
- **⑦ conv-hosts CLI**: 0.23.1 R26 M-1이 만든 `~/.loom/conv-node-hosts.json`(scp host 해석의 유일 출처, fail-closed)은 0.23.3 스모크에서 **수동 편집**으로 등록됐다. `setConvNodeHost()` 함수는 존재하나 CLI 표면 부재 — M-2 신뢰 표면을 손편집에 의존하면 오타·형식 오류가 침묵 miss(corrupt 시 빈 매핑)로 이어져 fail-closed의 진단성이 나쁘다.
- **chrome 2종**: 0.23.7 카드 웨이브에서 보드 노트 유입 3회 실증 — grok 상태줄(`╰─ Grok 4.5 (high)…─╯`)은 **콘텐츠 포함 box-drawing 줄**이라 0.23.6의 "box-drawing 전용 줄" 필터 미커버, claude autoaccept 힌트줄(`⏵⏵ auto mode on…`)은 known-hint 목록 부재.

**What (범위 — PATCH; wire 무변경 · MCP 도구 무변경 · herdr RPC 표면 무변경(기존 `pane.close` op 재사용)):**
| 항목 | 내용 |
|------|------|
| **pane 정리 정책 (⑥)** | 완료-확신 시점에만 자동 close. **(a) 카드 done**: `finishCard`에서 `sendResult` **성공 후** best-effort `pane.close` — 단 **지표-소거 확신 완료만**(무지표 즉시 완료·유예 후 소거 완료). **상한 소진(exhausted) 경로는 닫지 않는다** — 백그라운드 커맨드가 실제 진행 중일 수 있어 close가 작업을 죽인다. **close 적격 판별(R33 M-1 lock)**: 적격은 `finishCard` **명시 파라미터**(예: `opts.closePane`)로만 전달한다 — 설정 주체는 **지표-소거 확신 완료 2개 호출부**(무지표 즉시 완료·유예 후 소거 완료)뿐. **status·note로부터의 추론 금지** — exhausted도 `finishCard(status:"done", note:"…exhausted…")`로 동일 시그니처 수렴하므로 status-키 구현은 exhausted pane kill을, note-추론 구현은 지표 미검사 settle-실패 폴백을 적격 오분류한다. **settle-실패 폴백(지표 미검사)·exhausted·`sendFailedResult` 경로는 비대상 명시.** close는 **실제 전송된 최종 status가 done일 때만**(pane.read 실패 시 finishCard 내부 done→failed 플립 대비 — 적격 호출부는 항상 scrape를 전달하므로 플립과 공존 불가하나 계약으로 명문화). **(b) conv close 수신**: 기존 정리(convFlights 삭제·`eventsPrune`) 후 best-effort `pane.close` — tower의 명시적 종료 의사(후보 ⑥의 원 관찰). **working 중에도 close가 의미상 옳다(R33 L-1 — 비대칭은 의도)**: exhausted를 닫지 않는 논거(진행-중 kill 배제)와 달리 conv close는 타워의 명시 종료 전권(§1.4)이므로 mid-work kill이 정당 — 진단 보존이 필요하면 `paneCleanup:"keep"`. **(c) 실패 경로 무변경**: failed 회신(`agent_blocked` 포함)은 pane 유지 — 관찰 ⓔ(codex 승인 후 실작업 계속)·진단 표면 보존. 기존 close 경로(subscribe 실패·`inject_unconfirmed`)는 현행 유지. **순서 불변식(계약 명문화)**: flight 제거·prune → 결과 전송 성공 → `pane.close` — 자기 유발 `pane.closed` 이벤트가 완료된 카드를 failed로 오판정하는 경로 배제(done 경로는 현행도 flight 삭제가 `finishCard`에 선행함을 코드 확인). close 실패는 무시(best-effort)·결과 전송에 역영향 없음(전송 후에만 호출). |
| **opt-out** | 브릿지 config `paneCleanup?: "auto" \| "keep"`(기본 `"auto"`, load 시 비정상 값은 기본으로 sanitize) — `"keep"`이면 **신설** 자동 close 전부 비활성(기존 실패-경로 close는 유지). 진단·pane 마커 이중 확인이 필요한 운용을 위한 로컬 opt-out(와이어 무관, `bridge status`에 현재 정책 표기). |
| **conv-hosts CLI (⑦)** | `loom conv-hosts set <peerId> <host>` / `loom conv-hosts list` / `loom conv-hosts rm <peerId>` — tower-로컬 `~/.loom/conv-node-hosts.json`(0600, 기존 `saveConvNodeHosts` 재사용). **검증(set)**: peerId는 `p_[a-f0-9]{16}` 정확 매치(비매치 거부) · host는 비공백 + **선행 `-` 거부**(scp 인자 위치 옵션 주입 완충) + 허용 charset **`[A-Za-z0-9._@\-]`(`:` 제외 — R33 M-2 lock)**: scp 제시 조립이 `posixSingleQuote(host:path)` 단일 토큰이라 host 내 `:`는 host:path 분리를 오파싱시킨다(`user@host:2222` → path가 `2222:…`). **포트·IPv6 literal은 ssh_config alias 경유가 정문**(scp 포트는 `-P`라 host 표기로 커버되지 않음 — 초안의 "포트 표기 커버" 논거 정정). set=upsert, rm=부재 시 no-op 명시 메시지, list=peerId→host 표(빈 매핑 안내 포함, **형식 위반 항목에 표식 — R33 L-2**). **손편집 기존 항목은 CLI 검증을 우회함을 명시(R33 L-2)** — 로드 계층(`loadConvNodeHosts`)은 비공백 수용 유지(로드 검증 추가는 R26 M-1 fail-closed 의미 변경이라 스코프 밖), 입구 검증은 신규 `set`에만 적용. 검증 실패 시 비-0 exit + 사유 출력. |
| **chrome known-hint 2종** | `stripTuiChrome`에 추가 — 적용 대상·비대상은 0.23.6/R31 M-1 그대로(카드 `summary`·conv inline만, **카드 `output` 본문 무적용**): ① **콘텐츠 포함 box 하단 상태줄** — trimmed 줄이 `╰─`로 시작하고 `─╯`로 끝나는 전체-매치(`^╰─.*─╯$`; grok 상태줄 실측 커버, box 프레임에 감싸인 줄은 3종 TUI 공통 chrome) ② known-hint 마커 `⏵⏵ auto mode on`(claude autoaccept 힌트줄 실측 — 기존 `KEY_HINT_MARKERS` substring 방식). 보수 원칙 유지 — 미지 chrome은 통과가 기본, 망라 수집 아님. |
| **VERSION** | CLI `VERSION` 문자열 0.23.6 → **0.23.8** 동기화(0.23.7 구현이 CLI 버전 문자열을 미갱신 — 부수 정정). |
| **테스트** | fake-herdr `pane.close` 호출 기록으로: ① 카드 done(무지표 즉시) → `sendResult` 후 `pane.close` 정확 1회 ② 유예 소거 완료 → close 1회 ③ exhausted → close 미호출 ④ failed(`agent_blocked`) → close 미호출(현행 유지) ⑤ conv close 수신 → 상태 정리 + close 1회 ⑥ `paneCleanup:"keep"` → 신설 close 전부 미호출 + 기존 실패-경로 close(subscribe 실패)는 유지 ⑦ `sendResult` throw → close 미호출 ⑧ `pane.close` reject → 결과 흐름 무영향(예외 전파 없음) ⑨ conv-hosts set/list/rm 왕복 + 거부 케이스(peerId 형식 위반·선행 `-` host·charset 밖 host·**`:` 포함 host(R33 M-2)**) ⑩ set 후 파일 mode 0600 유지 ⑪ chrome 2종 — grok 상태줄·claude 힌트줄 제거 + 경계 보존 케이스(`╰─`로 시작하나 `─╯` 미종결 콘텐츠 줄·`auto mode on`을 본문 인용하되 `⏵⏵` 마커 없는 줄) ⑫ 카드 `output` 본문 무적용 회귀(R31 M-1) ⑬ 기존 카드·conv 왕복 회귀(close 추가 외 무변경) ⑭ **settle-실패 폴백(지표 미검사 무-scrape `finishCard`) → close 미호출**(R33 M-1). |

**Out of scope:** 후보 ②③(conv 프로토콜 의미 — done_proposal 탐지·deny 클레임 순서) · 카드 failed pane의 자동 정리(진단 표면 — 수동 유지) · pane 배치/포커스/탭 제어(herdr 영역) · chrome 패턴 망라 수집 · conv-hosts 매핑의 원격 배포·동기화(로컬 파일만) · conv 턴 조기 회신(~7–10s) 타이밍(관찰 지속).

**Security / trust (R33 판단 대상):**
- **pane.close는 기존 herdr RPC op 재사용** — 신규 원격 표면 없음. close 결정은 브릿지 로컬 정책(wire 필드로 제어 불가) — 타워/워커가 와이어로 임의 pane close를 유발할 수 없다(conv close는 기존 pin 검증 경유만).
- **위양성 close의 최악 결과**: 완료-확신 경로에서만 발동하고 결과 전송 **성공 후**이므로 회신 유실 없음(R25 시나리오 구조적 배제). exhausted·failed 미적용으로 진행-중 작업 kill 리스크 배제.
- **conv-hosts CLI**: 입력은 오퍼레이터 로컬(신뢰 주체)이나 scp 조립의 유일 출처이므로 형식 검증(선행 `-`·charset)으로 옵션-주입·오타 클래스를 입구에서 축소. 기존 R26 M-1 fail-closed·POSIX-quote 조립은 무변경. 파일 0600 유지.
- **chrome 2종**: R31 M-1 경계 유지(카드 `output` 무적용) — 위양성 손실은 summary·inline 한정이고 artifact 원문 경로(§5.1 필터-전 스캔) 무영향. `^╰─.*─╯$` 전체-매치는 부분 포함 줄을 건드리지 않는다.

**Review impact:** 브릿지 pane 수명 정책 신설(조기 close 스크레이프 유실 이력 R25 인접 — "전송 성공 후·확신 완료만" 불변식이 게이트 대상) + M-2 신뢰 표면의 CLI 쓰기 경로 신설 — **R33 요청**(§5.1 보수 관례). chrome 2종·VERSION 동기화는 Low급이나 동일 표면 변경이라 게이트에 포함.

**Approved by:** Fable 5 (fable-advisor consulted, claude-rev pane) R33 — `pending-revision` → **M-1 lock**(close 적격 = `finishCard` 명시 파라미터로만, 설정 주체 = 지표-소거 확신 완료 2개 호출부, status·note 추론 금지 + settle-실패 폴백·exhausted·`sendFailedResult` 비대상 명시 + 최종 status done일 때만) · **M-2 lock**(host charset `:` 제거 — `posixSingleQuote(host:path)` 단일 토큰 조립 오파싱, 포트·IPv6는 ssh_config alias 경유 정문) 본문 반영 + **L-1**(conv close mid-work kill 비대칭은 의도 — 타워 명시 종료 전권) · **L-2**(손편집 기존 항목 CLI 검증 우회 명시 + list 형식 위반 표식) author-close + 테스트 ⑨ 보강·⑭ 신설 → **author-close `approved`**(Fable 사전 승인, no R33b), 2026-07-19. 상세 `docs/plan_review.md` R33.

**Implemented as of `93c6283` (2026-07-19, grok pane 구현 · 아키텍트 독립 검증):** 8파일 +1,331/-21(docs 포함) — `finishCard` `opts.closePane`(M-1: 지표-소거 확신 완료 2개 호출부만 설정 · `sendResult` boolean 반환으로 전송 성공 + 최종 status done 게이트 · exhausted/settle-실패 폴백/`sendFailedResult` 비대상) · conv close 수신 시 정리 후 best-effort close · `paneCleanup "auto"|"keep"`(load sanitize, `bridge status` 표기) · `loom conv-hosts set|list|rm`(`validateConvNodePeerId`/`validateConvNodeHost` export — charset `:` 제외(M-2)·선행 `-` 거부·list 형식 위반 표식(L-2)·0600 유지) · `stripTuiChrome`에 `BOX_STATUS_LINE_RE`(`^╰─.*─╯$`)·`⏵⏵ auto mode on` 추가 · VERSION 0.23.8(CLI+MCP 동기화) · `pane-cleanup.test.ts` 신설(테스트 ①–⑭, +18건). `bun test` **404/0**(386→404) · 6패키지 typecheck green · biome 변경분 clean(경고는 diff 밖 기존 CLI 코드). **라이브 스모크(SMOKE-0238) 완주**: ① ⑦ CLI 왕복 라이브 — 잘못된 peerId·`:` 포함 host 거부(비-0 exit)·정상 set(0600)·rm·재rm no-op ② 브릿지 0.23.8 재기동(pid 61448) — status에 `paneCleanup:"auto"` 표기 ③ 스모크 카드(grok pane) — card.done `output`에 `[SMOKE-0238-OK]` 실완료 마커 + **summary에서 grok 상태줄 chrome 소거**(0.23.7 웨이브까지 보드 노트 오염 5회 실증 → 해소) + **card.done 회신 직후 pane 자동 close 실증**(pane list 부재 확인·회신 무유실 — R25 시나리오 재발 없음). 부수 관찰: 필터 후 summary가 grok 타이밍줄("Worked for 9.5s.")로 잡힘 — chrome 아닌 정보성 줄이라 결함 아님(개선 여지만 기록).

#### 0.23.7 — 2026-07-19 (`approved` R32 — **카드 완료 판정 still-running 유예 (card.done 조기 회신 수정)** (PATCH))

**Product one-liner:** herdr가 워커 백그라운드 커맨드 실행 중에도 idle을 방출해 브릿지가 미완 화면("1 command still running")을 card.done으로 조기 회신하던 것을 — 완료 판정 시 스크레이프 말미의 still-running 지표를 보수 감지하면 결과 회신을 상한부 유예(폴링)해 실제 완료 화면을 싣는다.

**Why (2026-07-19 카드 웨이브 라이브 2회 실증 — `tasks/lessons.md` 2026-07-19 (2)):**
- **FIX-0236 카드**: 워커가 백그라운드 테스트 루프 실행 중인데 herdr가 idle 방출 → 브릿지가 "Worked for 48s. 1 command still running" 화면을 스크레이프해 card.done 회신. **실제 완주 마커는 ~4분 뒤** pane 출력 — 결과 `output`이 미완 상태 스냅샷으로 확정됨.
- **BUNX-FIX 카드**: 동일 패턴 재현(1m15s 시점 "1 command still running") — 아키텍트의 pane 마커 재확인(이중 방어)으로만 조기 클레임을 방지.
- **0.23.6 settle 재독은 계층이 다르다**: settle(≤3독, settleMs 간격)은 idle 직후 **렌더 미완**(수백 ms) 완충이고, 이 결함은 **작업 미완**(분 단위 백그라운드 커맨드) — settle 상수를 키워도 구조적으로 커버 불가. 완료 판정 자체가 지표를 봐야 한다.

**What (범위 — PATCH; herdr RPC 표면 무변경 · MCP 도구 무변경 · wire는 additive optional 1필드만):**
| 항목 | 내용 |
|------|------|
| **still-running 지표 감지** | 헬퍼 `hasStillRunningIndicator(scrape)`: stripAnsi 스크레이프의 **말미 비공백 10줄** 내에서 공백-정규화 매치 `\d+ command(s) still running`(대소문자 무시) — 실측된 TUI 상태 문구만(보수적 최소 셋, 상수 배열로 유지). 미지 TUI/무매치 = 현행 즉시 회신. **말미 한정**은 브리프 echo(본문 인용— 이 레포의 lessons 자체가 해당 문자열 포함) 위양성 축소. |
| **완료 유예(deferral)** | `onCardHerdrEvent` 완료 분기(status `done` / `idle`&&sawWorking)에서 flight 삭제·`eventsPrune`·`finishCard` **전에** settle 스크레이프로 지표 검사. hit → **flight 유지**(삭제·prune 안 함) + 유예 폴링 진입: `stillRunningPollMs`(기본 10s) 간격 pane 재독 — 지표 소거 시 정상 `finishCard`, 폴링 중 `working` 재전이 관찰 시 폴링 취소·통상 이벤트 흐름 복귀(재-idle에서 재판정). **유예 재진입 가드(R32 M-1 lock)**: 유예 진입 플래그는 settle 검사 `await` **전에** flight에 동기 설정한다. 플래그 설정 중(검사·폴링 포함) 도착하는 done/idle 완료-계열 이벤트는 **no-op** — 완료 판정 소유권은 유예 폴링 단일 경로. 유예 중 blocked 이벤트 = 폴링·타이머 정리 후 현행 즉시 failed 회신. 유예 중 working 재전이 = 폴링 취소·플래그 해제·통상 복귀. **재독·output 소스 단일화(R32 L-1)**: 유예 폴링 재독 = `settlePaneRead`; 지표 소거를 판정한 **그 settle 독본을 `finishCard`에 파라미터로 전달**해 output으로 사용(finishCard 내 재스크레이프 없음 — 소거 판정 독본과 output 독본의 어긋남 배제). |
| **유예 상한 (fail-visible)** | `stillRunningMaxMs`(기본 5분) 소진 시 그 시점 스크레이프로 `finishCard`(status 판정 유지) + note `still_running deferral exhausted (Ns)` — 무한 대기 금지. 지표 위양성의 최악 결과 = **상한 bounded 지연**(내용 손실·상태 오판 없음). |
| **관측성 note** | `CardResultPayload`에 **additive optional** `note?: string(≤500)` — 유예 발생 시 `completion deferred Ns (still-running indicator)` / 상한 소진 시 위 exhausted 문구. zod strip 호환(구 타워는 무시, `CARD_CONTRACT_VERSION` 무변경). `applyCardResult`는 note 존재 시 보드 태스크 노트에 병기(표시 전용). note 값은 **브릿지 생성 문자열만** — 스크레이프 본문 미인용. **`last_seq` 생존(R32 M-2 lock)**: notes 조립 시 `last_seq=` 토큰은 1000자 캡 절단에서 **항상 생존**해야 한다 — note는 잔여 예산 내에서만 병기(`last_seq=`를 선두/고정 위치에 두거나, note를 마지막에 두되 note 몫만 절단). seq 멱등성 가드(`/last_seq=(\d+)/` 파싱)가 note 병기로 무음 파손되지 않는 것이 조립 순서의 불변식. |
| **실패 경로 무변경** | `blocked`·`pane_closed` 분기는 유예 없이 현행 즉시 회신 — 유예는 성공 판정에만. |
| **conv 경로 무변경** | conv 턴 조기 회신(~7–10s 관찰)은 멀티턴 후속 턴으로 자연 복구 — 스코프 밖(관찰 지속). |
| **타이머 주입** | `stillRunningPollMs`/`stillRunningMaxMs`는 `startBridgeRuntime` opts 주입(테스트는 소값 실타이머 — fake-timer 불요, 0.23.4 ⑭ 교훈). 유예 타이머는 flight 삭제 전 경로(pane_closed·bridge stop) 전부에서 정리. |
| **테스트** | fake-herdr paneRead 시퀀스 제어로: ① 지표 hit → 유예 → 소거 후 done(`output`=완료본·note 기록) ② 유예 중 working 재전이 → 폴링 취소·후속 idle 재판정 ③ 상한 소진 → exhausted note와 회신 ④ 지표 없음 = 현행 즉시 회신(회귀) ⑤ 말미 밖(스크롤백 echo) 지표 = 미유예 ⑥ blocked 즉시 회신 유지(유예 없음) ⑦ 유예 중 pane_closed → 타이머 정리·failed 회신(누수 없음) ⑧ note additive 파싱 왕복 + 구 스키마(필드 부재) 호환 ⑨ **유예 중 중복 done/idle 이벤트 → 회신 1회·폴링 단일**(M-1) ⑩ **유예 중 blocked → 타이머 정리 + failed 1회**(M-1) ⑪ **note 최대 길이(500자) 병기에도 `last_seq` 파싱 생존**(M-2). |

**Out of scope:** conv 턴 settle/조기 회신 타이밍 · herdr 자체의 agent_status 판정 수정(브릿지-로컬 완충만) · 지표 패턴 망라 수집(미지 TUI는 통과가 기본) · 후보 ②③⑥⑦.

**Security / trust (R32 판단 대상):**
- **신규 신뢰 표면 없음**: untrusted 스크레이프 텍스트를 **회신 타이밍 판단에만** 사용 — 콘텐츠 shaping 없음, 주입 경로(M-2/M-4)·herdr RPC·MCP 도구 무변경.
- **악의/우연 지표 잔존**(워커가 말미에 지표 문자열을 지속 노출) → 회신 지연 최대 `stillRunningMaxMs`로 bounded. 현행도 워커가 working을 지속하면 무기한 미회신이므로 **악화 아님**; 유예는 소진 시 반드시 회신(fail-visible note)한다.
- **note는 브릿지 생성 문자열만**(고정 문구 + 경과 초) — 스크레이프 본문을 note에 인용하지 않아 보드 노트 오염 표면 없음.
- 타이머 수명: 유예 타이머는 flight 정리 경로 전부에서 해제(테스트 ⑦) — 0.23.4 superseded 타이머 누수 교훈 반영.

**Review impact:** 카드 완료 판정 의미(회신 타이밍) 변경 + 스크레이프 기반 판정 신설 — R30(스크레이프 기반 verify)·R31(스크레이프 shaping) 전례에 따라 **R32 요청**(§5.1 보수 관례). wire는 additive optional 1필드(Low class)나 판정 변경과 결합돼 게이트에 포함.

**Approved by:** Fable 5 (fable-advisor consulted, claude-rev pane) R32 — `pending-revision` → **M-1 lock**(유예 재진입 가드: 진입 플래그 `await` 전 동기 설정 + 유예 중 done/idle no-op(판정 소유권 = 폴링 단일 경로) + 유예 중 blocked = 정리 후 즉시 failed — 동기 flight 삭제가 현행 유일한 중복 이벤트 가드였음을 코드 확증) · **M-2 lock**(`applyCardResult` notes 조립에서 `last_seq=` 토큰 절단 배제 — note ≤500 병기 시 최대 ~1412자로 1000자 캡 구조적 초과, seq 멱등성 가드 무음 파손 = M-1 중복 송신의 최후 방어 상실) 본문 반영 + **L-1**(폴링 재독 = `settlePaneRead` + 소거 판정 독본을 `finishCard` 파라미터로 전달, 재스크레이프 없음) author-close + 테스트 ⑨⑩⑪ 신설 → **author-close `approved`**(Fable 사전 승인, no R32b), 2026-07-19. 상세 `docs/plan_review.md` R32.

**Implemented as of `1160b38` (2026-07-19, grok pane 구현 · 아키텍트 독립 검증):** 6파일 +884/-8 — `hasStillRunningIndicator`(export, 말미 10줄·보수 패턴)·`beginCardCompletion`/`scheduleStillRunningPoll`(유예 상태기계, M-1 동기 플래그 + 완료-계열 no-op + blocked/working/pane_closed/stop 전 경로 타이머 정리)·`finishCard` opts(`scrape` 전달 = L-1 재스크레이프 배제, `note` ≤500)·`CardResultPayload.note` additive optional·`applyCardResult` notes 조립 `last_seq` 예산 생존(M-2)·`still-running.test.ts` ①–⑦⑨⑩ + 계약 ⑧ + 보드 ⑪(+12건). `bun test` **386/0**(374→386) · 6패키지 typecheck green · biome clean. **라이브 스모크(SMOKE-0237) 완주**: grok 워커 백그라운드 75s 명령 → 브릿지 stderr `still-running indicator — deferring completion`(유예 실발화) → 워커 재개 시 `deferral cancelled (working re-entry)` → 재-idle 정상 완료 — **card.done `output`에 `[SMOKE-0237-REAL-DONE]` 실완료본 포함·still-running 잔존 없음**(0.23.7 이전이면 미완 화면 회신 시나리오). 유예-폴링-소거 분기 note는 유닛 ①③ 커버(라이브는 working 재전이 경로로 완료 — 결함 아님). 부수 관찰: 카드 summary에 grok 상태줄 chrome(`╰─ Grok 4.5 (high)…─╯`)·claude 힌트줄(`⏵⏵ auto mode on…`) 잔존 — 0.23.6 보수 필터 미커버 패턴 2종(후속 후보).

#### 0.23.6 — 2026-07-18 (`approved` R31 — **워커 pane 스크레이프 delta화 + TUI chrome 필터 (후보 ⑤ + 관찰 ⓐⓒ)** (PATCH))

**Product one-liner:** conv 워커 턴·카드 결과가 워커 pane 전체 창(최근 200줄)을 매번 그대로 실어 보내던 것을, (1) 이전 턴 이후 **새로 생긴 내용만**(delta) 싣고 (2) TUI chrome(컴포저 박스·키 힌트 상태바)을 걸러내고 (3) idle 직후 렌더 미완 스크레이프를 안정화해 — 좁은 스크레이프 창의 실효 정보량을 회복한다.

**Why (관찰 ⓐⓒ + 후보 ⑩ 조사 실측 — 2026-07-18):**
- **관찰 ⓐ (0.23.0 스모크)**: conv 워커 턴 inline text = `paneRead(recent, 200)` 전체 — claude-mem 스타트업 노이즈 + **이전 턴 전문이 매 턴 누적 반복** 전송. 타워 LLM 컨텍스트를 중복 콘텐츠로 오염.
- **관찰 ⓒ (0.23.2 스모크)**: idle 직후 스크레이프가 최종 답 줄을 **중간 절단** + 카드 summary(마지막 non-empty 줄, `bridge-runtime.ts:1303`)가 TUI 키 힌트(`Shift+Tab:mode │ Ctrl+.:shortcuts`)로 오염 — 보드 태스크 노트에 그대로 유입(0.23.5 수정 카드 회수에서도 재확인: note=`"Shift+Tab:mode │ Ctrl+.:shortcuts last_seq=1"`).
- **후보 ⑩ 조사(이번 세션 라이브 실측)가 가치를 배가**: 워커 TUI 스크레이프 상한 = **claude ~5.3k / grok ~2.2k / codex ~1.4k**(소스·줄수 무관 포화 — grok·codex는 툴 출력을 접힌 블록으로만 렌더). 창이 이렇게 좁으므로 반복 콘텐츠+chrome이 잠식하는 비용이 절대적. (⑩ 자체는 조사로 종결: (a) 워커 직접 파일 쓰기 = §5.1로 이미 shipped·179KB 라이브 실증 / (b) herdr 심층 스크롤백 = CLI 표면에 부재(`pane read` 소스 3종뿐) / (c) 32k 임계 하향 = 접힌 스크레이프를 패키징하는 것이라 기각. §5.2 32k 분기는 방어적 잔존 — 삭제 아님.)

**What (범위 — PATCH; wire·MCP·herdr RPC 표면 무변경):**
| 항목 | 내용 |
|------|------|
| **TUI chrome 필터** | 스크레이프 후처리 헬퍼 `stripTuiChrome(text)`: **명백한 chrome 줄만** 보수적으로 제거 — ① box-drawing 전용/테두리 줄(`╭╰│─` 계열로만 구성 또는 `│ ❯` 컴포저 프롬프트 줄) ② 알려진 키 힌트 줄(`Shift+Tab:mode`·`Ctrl+.:shortcuts`·`Ctrl+c:cancel` 등 포함 줄) ③ 말미 빈 줄 정리. **적용 대상 = conv 턴 inline text + 카드 `summary` 산출 입력. 카드 결과 `output` 본문에는 적용하지 않는다**(R31 M-1 — 카드 lane은 artifact 복구 경로 부재(파일 규약은 conv 한정)라 손실 비가역이고, 200k 상한에서 chrome 몇 줄의 잠식 실익 없음; "포함 줄" substring 매치는 키-힌트 문자열을 본문 인용하는 콘텐츠(이 레포의 PLAN·lessons 자체가 해당)에서 위양성 소실을 낳는다). **artifact 마커 스캔은 필터 전 원문 대상 유지**(마커 유실 방지). 과필터 리스크는 아래 Security. |
| **conv 턴 delta화** | `ConvFlight`에 직전 턴 스크레이프의 **꼬리 앵커**(chrome-필터 후 마지막 유효 줄 최대 3줄, 공백-정규화 저장) 보관. 다음 턴 스크레이프에서 앵커를 공백-정규화 매치로 **마지막 출현** 탐색 → 이후 내용만 inline text로. **슬라이스 메커니즘(R31 M-2)**: 공백-정규화 문자열 생성 시 **정규화 오프셋→원문 오프셋 인덱스 맵을 동반 구축**하고, 앵커의 마지막 출현 매치 **끝**에 대응하는 **원문** 오프셋에서 (chrome-필터된) 원문 텍스트를 슬라이스한다 — **정규화본 슬라이스 금지**(공백·개행 파괴). "0.23.5 프로브와 동일 기법"은 공백-정규화 **매칭 원리**의 재사용만을 뜻하며 존재-검사 헬퍼(`isInjectProbeHit`)의 재사용이 아니다. **앵커 미발견 시 전체 스크레이프 폴백 + note `delta anchor miss (full scrape)`**(fail-open — 내용 유실보다 중복이 낫다). **delta 적용 턴엔 상시 통계 note `delta: kept N/M chars`**(R31 L-2 — late-false-match 무음 드롭을 타워가 식별할 유일 채널), **빈 delta면 note `delta empty (no new output)`**(R31 L-3). 앵커 갱신은 턴 전송 성공 후. 카드 lane은 flight당 결과 1회라 delta 비적용(summary 필터·안정화만). |
| **32k 트리거와의 관계 (R31 L-1)** | 임계 판정·`packageConvTurnArtifact` 입력 = **chrome-필터 후 full scrape(delta 미적용)**; delta는 ≤32k 인라인 분기에만 적용; 앵커는 패키징 발화 턴에도 full-scrape 꼬리에서 갱신. (TUI 상한 실측상 near-moot이나 비-TUI pane에서 도달 가능.) |
| **done_proposal 판정 입력 (R31 L-4)** | `[DONE_PROPOSAL]` kind 판정은 **delta 텍스트 선두** 기준(이전 턴 잔존이 선두를 차지해 사실상 도달 불가였던 기존 취약의 자연 해소); **폴백(전체 스크레이프) 턴은 현행(raw 선두) 유지**. |
| **idle-scrape 안정화** | 스크레이프 직전 settle 재독: `paneRead` 1회 → 250ms 대기 → 재독 → 불일치 시 1회 더(최대 3독). 마지막 독본 사용 — 관찰 ⓒ의 렌더 미완 중간 절단 완화. conv 턴·카드 결과 공통. **불일치 비교는 `stripAnsi` 후 텍스트 기준**(R31 L-5 — raw 비교는 ANSI 커서/스피너 churn으로 영구 불일치 → 항상 3독 낭비). (verify 루프의 paneRead는 대상 아님 — 거긴 존재 프로브라 정밀도 불요.) |
| **카드 summary 정합** | summary = chrome-필터 후 마지막 non-empty 줄(기존 로직 유지, 입력만 필터본으로). 보드 노트 오염 제거. `output` 본문은 무필터 원문 유지(M-1). |
| **테스트** | fake-herdr paneRead 시퀀스 제어로: ① chrome 필터 — claude/grok/codex 실측 chrome 샘플 각각 제거·비-chrome 유사 줄 보존 ② conv 2턴 delta — 턴2 inline에 턴1 내용 부재·신규만 ③ 앵커 미발견 → 전체 폴백 + note ④ 앵커 wrap-변형(정규화 매치) + **슬라이스 결과의 원문 무결성(공백·개행 보존) 어서션**(M-2) ⑤ 카드 summary 키-힌트 줄 배제 ⑥ artifact 마커가 chrome 필터와 무관하게 스캔됨(필터 전 원문) ⑦ settle 재독 — 1·2독 불일치 시 3독 사용 ⑧ delta 앵커가 턴 전송 실패 시 미갱신(다음 턴 재시도 시 중복 허용) ⑨ 기존 conv 왕복·카드 결과 회귀 ⑩ **키-힌트 문자열을 본문 인용하는 카드 `output`이 무손실 보존**(M-1) ⑪ **>32k 스크레이프 턴 — 패키징 입력 = 필터 후 full scrape·delta 미적용·앵커 갱신 정상**(L-1). |

**Out of scope:** §5.2 임계·패키징 로직 변경(⑩ 종결 — 잔존 유지) · 후보 ⑥(pane 정리 정책)·⑦(conv-hosts CLI)·②③ · TUI별 chrome 패턴의 망라적 수집(보수적 최소 셋만 — 미지 chrome은 통과가 기본). 

**Security / trust (R31 판단 대상):**
- **신규 신뢰 표면 없음**: 주입 경로(M-2/M-4)·wire 스키마 무변경. 변경은 이미-untrusted인 스크레이프 콘텐츠의 **선별(shaping)뿐** — 필터·delta 모두 read-only 후처리.
- **과필터/과-delta 리스크**: 워커 출력이 chrome 패턴과 유사하거나 앵커가 후속 내용에 우연 재출현하면 실내용 일부가 inline text에서 누락될 수 있다. 완충: ① chrome 필터는 명백 패턴만(box-drawing 전용 줄·알려진 키 힌트) + **카드 `output` 본문 무적용**(R31 M-1 — 복구 경로 없는 lane 보호) ② delta는 **마지막 출현** 매치 + 미발견 시 전체 폴백(fail-open) + **상시 통계 note**(R31 L-2 — miss뿐 아니라 적용 턴에도 `delta: kept N/M chars`로 이상 드롭 가시화) ③ **artifact 경로(§5.1)는 필터 전 원문 스캔이라 무손실 유지** — 대용량·정밀 전달은 이미 artifact가 정답 경로(⑩ 결론), inline text는 요약적 관찰용. **conv lane 한정** 최악 결과 = inline 일부 누락(타워는 note로 인지 가능, artifact로 복구 가능); **카드 lane은 output 원문 무필터라 손실 표면 자체가 없다**(R31 M-1 정정 — summary만 필터본).
- 카드 summary는 보드 노트로 유입되는 표시 문자열 — chrome 제거는 오염 감소 방향만.

**Review impact:** protocol v1 무변경 · MCP 도구 무변경 · ConvFlight 내부 필드 추가뿐. M-lock 인접 없음이 저자 판단이나 스크레이프→wire 콘텐츠 shaping이므로 **R31 요청**(§5.1 보수 관례).

**Approved by:** Fable 5 (fable-advisor consulted, claude-rev pane) R31 — `pending-revision` → **M-1 lock**(chrome 필터 적용 대상 = conv inline + 카드 summary 입력만, 카드 `output` 본문 무적용 — artifact 복구 경로 없는 lane의 비가역 손실 차단 + Security 최악-결과 문장 conv-한정 정정) · **M-2 lock**(delta 슬라이스 = 정규화 오프셋→원문 오프셋 **인덱스 맵** 동반 구축 후 원문 슬라이스, 정규화본 슬라이스 금지 — "0.23.5 프로브 동일 기법" 인용은 매칭 원리 한정으로 정정) 본문 반영 + **L-1**(32k 트리거 입력 = 필터 후 full scrape·delta 미적용)·**L-2**(delta 상시 통계 note)·**L-3**(빈 delta note)·**L-4**(done_proposal 판정 = delta 선두, 폴백 턴 현행)·**L-5**(settle 비교 = stripAnsi 후) author-close + 테스트 ④ 보강·⑩⑪ 신설 → **author-close `approved`**(Fable 사전 승인, no R31b), 2026-07-18. 상세 `docs/plan_review.md` R31.

**Implemented as of `5bdeae7` (2026-07-19, grok pane 구현 · 아키텍트 독립 검증):** 5파일 +1,199/-27 — `stripTuiChrome`/`normalizeWithIndexMap`/`buildDeltaAnchor`/`applyDeltaAnchor`(export, 단위 테스트 가능)·`settlePaneRead`(settleMs 옵션 주입)·`sendWorkerTurnFromPane` delta 통합(L-1 32k 분기·L-2/L-3 note·L-4 doneProposalHead)·`finishCard` summary만 필터(M-1, output 원문)·`scrape-delta.test.ts` ①–⑪+2(13건). R31 M-1/M-2/L-1..L-5 diff 반영 육안 확인 완료. `bun test` **374/0**(+13) · 6패키지 typecheck green · biome clean. **codex 자문(ADV-0236) 부분 종결**: 전체 스위트 374 pass 재현·typecheck 6패키지 green·lint 경미 1건(lone-block, 자동수정 적용)·기존 conv artifact·마커·카드 경로 회귀 통과까지 인라인 확인 후 **verdict 마커 미산출 채 턴 공회전**(스텝 리셋 반복, 촉구 2회·인터럽트에도 미완 — 총 6h+, pane close). Med finding 표면화 없음. **Follow-up**: `inject-verify.test.ts` ③이 card 결과 수신 직후 `pane.close` 즉시 어서션 — 결과 전송 후 close라 레이스(~1/3 플레이키, 0.23.5 잠재 테스트측 결함) → waitFor 대기로 수정 예정.

#### 0.23.5 — 2026-07-18 (`approved` R30 — **브릿지 주입 verify 루프 3분기 확장 (후보 ⑨ + 관찰 ⓓ)** (PATCH))

**Product one-liner:** 워커 pane에 주입한 프롬프트가 TUI 스타트업 레이스로 통째로 유실되거나 composer에 담긴 채 미제출로 방치될 때, 브릿지가 composer 상태를 직접 관찰해 재주입·CR 재전송으로 자가 복구하고, 소진 시엔 무음 포기 대신 fail-visible 실패를 발행한다 — "주입 유실 = 무신호 고착"의 제거.

**Why (후보 ⑨ + 관찰 ⓓ — 2026-07-18 누적 실측):**
- **⑫ 수정 후에도 잔여 레이스 실존**: 0.23.4 세션에서 grok pane 스폰 직후 주입 유실 2회 추가 재현(이벤트 구독은 정상 성립 — ⑫와 무관한 순수 TUI 스타트업 레이스). 에이전트 무관(claude 2회·grok 3회 누적). 0.23.3 스모크에선 미발생 — 간헐.
- **현행 verify 루프는 paste 유실을 복구 못 한다**: `verifySubmitOrRetry`/`verifyConvSubmitOrRetry`(`bridge-runtime.ts:1033,823`)는 working 미도달 시 `BARE_ENTER`만 재전송(4s×3). paste 자체가 유실됐으면 빈 composer에 Enter만 반복 — 소진 후 **log 한 줄 남기고 무음 포기**(카드는 doing 영구 고착, 수동 보드 정리 필요). 수동 복구 절차(리터럴 재주입 + 별도 `$'\r'`)는 5회+ 전회 유효 실증(lessons (2)).
- **관찰 ⓓ (미제출 잔류 사각지대)**: composer에 텍스트가 담긴 채 미제출인 상태는 어떤 모니터링에도 안 잡힌다(0.23.3 조사 카드 실증 — pane은 조용한 idle, 브릿지 verify는 소진 후 무신호, stderr는 당시 ignore). `pane send-keys Enter`는 codex TUI에서 미제출 — 신뢰 경로는 `agentSend`의 실제 CR뿐(lessons (2) 갱신 2).

**What (범위 — PATCH; wire·MCP·herdr RPC 표면 무변경):**
| 항목 | 내용 |
|------|------|
| **공용 verify 헬퍼 통합** | `verifySubmitOrRetry`(카드)·`verifyConvSubmitOrRetry`(conv)를 단일 헬퍼로 통합(플라이트 조회·정리 콜백만 분리). 호출부는 **주입 프롬프트 원문(최초 `injectPromptAndSubmit`에 넘긴 동일 문자열 — 카드는 `wrapUntrustedPrompt` 산출물, conv 최초 턴은 + 브릿지 artifact 규약 접미 포함 전체)** 을 헬퍼에 전달한다(재주입·프로브 계산용 — conv는 턴마다 재계산). **재주입은 이 캐시 문자열 그대로 — 재파생 금지**(R30 L-1). |
| **verify 라운드 3분기** | working 대기 timeout 시 매 라운드: ① **flight 존재 재확인**(R30 L-3 — timeout 판정과 액션 사이 창에서 카드 완료·conv.close로 소멸 가능; gone = 성공 종료) ② `paneRead(paneId, {source:"recent", lines:60})` — **read 실패 시 현행 CR 재전송 폴백**(스크레이프 불가 ≠ 주입 실패) ③ **프로브 판정**: 주입 프롬프트와 스크레이프 양쪽을 공백 정규화(모든 연속 whitespace 제거)한 뒤 프로브 substring 존재 확인(TUI 자동 줄바꿈 대응). **TUI paste-플레이스홀더 패턴(예: `[Pasted text`)이 스크레이프에 존재하면 probe-hit으로 인정**(R30 M-1 — Claude Ink composer는 멀티라인 paste를 `[Pasted text #N +M lines]` 플레이스홀더로 접어 원문을 표시하지 않음; 플레이스홀더 = composer에 내용 존재 = (b) CR 분기, 안전한 쪽 라우팅) ④ 분기 — **(a) 프로브 부재 = paste 유실** → 동일 프롬프트 재주입: `agentSend(prompt)` → 별도 `agentSend(BARE_ENTER)`(수동 복구 실증 경로 그대로; **verify 호출(주입 시도)당 재주입 최대 1회**(R30 M-2 — "flight당"이 아님: ConvFlight는 멀티턴 생존이라 flight-단위 상한은 1턴 소진 후 전 턴 복구 불능·타워 턴 재전송 재시도 근거와 자기모순; 상한의 본질은 프롬프트별 중복 제출 완충이므로 주입 시도별이 정문) — 아래 Security) · **(b) 프로브 존재(플레이스홀더 hit 포함) = 미제출 잔류(관찰 ⓓ) 또는 제출-후 status 지연** → `BARE_ENTER` 재전송(현행 동작, 이미-제출 composer엔 무해 no-op) · **(c) retries 소진** → fail-visible(아래 행). working/gone 감지 시 즉시 종료(현행 fast-path 유지). **claude 워커에선 미제출-잔류의 내용 식별(ⓓ 정밀 감지)이 플레이스홀더 수준으로 저하됨**(원문 비표시 — 내용-일치 커버리지 주장 금지, R30 M-1). **구현 시 워커 TUI 3종(claude/codex/grok)별 composer 가시성(대량 paste 시 스크레이프에 무엇이 보이는지) 라이브 검증 1회 수행·결과 기록**(R30 M-1). |
| **프로브 정의** | 공백 정규화된 주입 프롬프트의 **마지막 48자 슬라이스**(48자 미만 프롬프트는 전문). 앞부분은 `⚠ Untrusted handoff content` 상수 마커 + 규약 문구라 이전 턴 echo·규약 재주입과 구분 불가 — 꼬리 선택은 이를 피한다. 단 **conv 최초 턴의 주입 문자열은 브릿지 artifact 규약 접미(`--- end convention ---` 상수)로 끝나므로 꼬리가 goal-특이적이지 않음**(R30 L-2) — 신규 pane엔 선행 잔류물이 없어 존재-검사로는 유효(기능상 무해); 턴 2+는 규약 접미 없이 턴 본문 꼬리라 특이적. |
| **fail-visible (c) — 카드** | `sendFailedResult(reason: "inject_unconfirmed")` + flight 제거 + `eventsPrune` + pane close 시도 — 0.23.4 `events_subscribe_failed` 정리 계열과 동일(자유 문자열 reason 필드 재사용, wire 스키마 무변경). 현행 "log 후 방치"(doing 영구 고착) 폐기. |
| **fail-visible (c) — conv** | `sendWorkerTurnFromPane(flight, "blocked", "inject_unconfirmed")` — 타워에 blocked 턴으로 통지. **convFlight·pane은 유지**(conv는 타워가 턴을 다시 보내 재시도 가능 — 카드와 달리 flight 파기 불필요, §1.4 conv.close는 타워 전권). |
| **관측성** | 각 라운드의 분기 결과를 stderr 로그에 기록(`[loom-bridge] verify round N: probe=hit|miss|read-fail action=reinject|cr|fail`) — **프롬프트 본문·프로브 문자열은 비기록**(본문 비기록 원칙 유지, 매치 여부만). |
| **테스트** | fake herdr에 composer 시뮬레이션 훅(paneRead 반환 제어 + agentSend 호출 기록): ① 빈 composer(프로브 부재) → 재주입(프롬프트+CR 분리 2호출) 후 working = 복구 성공 ② composer 잔류(프로브 존재)+idle → CR만 재전송 ③ 카드 소진 → `inject_unconfirmed` failed result + flight 제거 + prune + pane close ④ conv 소진 → blocked 턴 + convFlight 유지 ⑤ **재주입 1회 상한**: 재주입 후에도 프로브 부재면 재주입 반복 없이 CR/소진 경로 ⑥ 첫 대기 내 working = paneRead 미호출(fast-path 회귀) ⑦ paneRead 실패 → CR 폴백 ⑧ gone(flight 소멸) = 성공 처리 회귀 ⑨ 프로브 공백 정규화 — TUI 줄바꿈으로 쪼개진 프롬프트 매치 ⑩ conv 2번째 턴 — 턴별 프로브 재계산(1턴 프롬프트 echo가 있어도 2턴 프로브로 판정) ⑪ 기존 M-2 정상 제출 경로 회귀(주입→working 즉시) ⑫ **composer가 플레이스홀더만 노출(원문 비표시) → 재주입 없이 CR 분기**(R30 M-1) ⑬ **conv 1턴 재주입 후 2턴 paste 유실 → 2턴에서 재주입 가능(주입 시도별 상한 리셋)**(R30 M-2). |

**Out of scope (이 버전 아님):** TUI 스타트업 레이스 자체의 근본 해결(워커 CLI upstream 영역) · 후보 ⑩(pane 스크레이프 상한 재설계) · ②③⑤⑥⑦ 기존 후보 · 관찰 ⓔ(codex 승인 프롬프트 → 가짜 `agent_blocked`) · 재주입 상한 초과 시의 지수 백오프류 고도화(1회 상한 + fail-visible로 충분, 필요 시 후속).

**Security / trust (R30 판단 대상):**
- **M-2 불변식 확장이 핵심**: 현행 "verify 루프 재전송은 `BARE_ENTER` 상수만" → "+ **최초 `injectPromptAndSubmit`에 넘긴 동일 캐시 문자열**(카드 `wrapUntrustedPrompt` 산출물 / conv는 + 규약 접미 포함 전체 — R30 L-1, 재파생 금지) 재주입 최대 1회(주입 시도당)". 임의/신규 텍스트 표면은 열리지 않는다 — 재주입 페이로드는 이미 sanitize + untrusted 마커를 통과한 그 문자열 그대로다.
- **중복 제출 리스크 신설**: 프로브 오탐(프롬프트가 실제로는 pane에 있는데 부재 판정)이면 동일 프롬프트가 2회 제출될 수 있다. **composer 렌더는 존재를 숨길 수 있다는 것이 전제**(R30 M-1 — Claude Ink는 멀티라인 paste를 플레이스홀더로 접음; 트랜스크립트 접힘 0.23.1 실측은 composer 영역을 검사하지 않았으므로 근거로 삼지 않는다). 완충: ① 재주입 주입 시도당 1회 상한(R30 M-2) ② **플레이스홀더 패턴 = probe-hit**(안전한 쪽 라우팅 — 오분기 재주입의 주 시나리오 차단, R30 M-1) ③ working 감지 시 즉시 중단 ④ TUI 3종 composer 가시성 라이브 검증 1회로 전제 실측(R30 M-1). 최악 결과는 동일 지시 중복 수행(중복 카드 결과는 기존 `processedHandoffs` dedup·conv seq 단조성으로 와이어 측 무해).
- **실패 의미 변경**: 무음 포기(doing 영구 고착 + 수동 정리) → fail-visible(재-dispatch/턴 재전송 가능). 오탐 시에도 현행 고착보다 보수적으로 우월 — 0.23.4 `events_subscribe_failed`와 동일 논리.

**Review impact:** protocol v1 무변경 · MCP 도구 수 무변경 · reason 어휘만 신설(자유 문자열 필드). M-2 주입 불변식 확장 + 중복 제출 리스크 → **R30 요청** (§5.1 보수 판단 — 신뢰 경계 인접).

**R30 질의:** *(현재 없음.)*

**Approved by:** Fable 5 (fable-advisor consulted, claude-rev pane) R30 — `pending-revision` → **M-1 lock**(TUI paste-플레이스홀더 = probe-hit 인정 + claude ⓓ 정밀 감지 저하 명시 + TUI 3종 composer 가시성 라이브 검증 1회) · **M-2 lock**(재주입 상한 "flight당" → **주입 시도당 1회** — ConvFlight 멀티턴 자기모순 해소) PLAN 본문 반영 + **L-1**(재주입 페이로드 지칭 `prepareInjectText` 오기 → 최초 주입 캐시 문자열·재파생 금지)·**L-2**(conv 최초 턴 프로브 꼬리 = 규약 상수 — 존재-검사 유효 명시)·**L-3**(라운드 액션 전 flight 재확인) author-close + 테스트 ⑫⑬ 추가 → **author-close `approved`**(Fable 사전 승인, no R30b), 2026-07-18. 상세 `docs/plan_review.md` R30.

**Implemented as of `8148642` (2026-07-18, grok pane 구현·수정 · codex pane 자문 · 아키텍트 독립 검증):** 5파일 +1,142/-85 — `verifySubmitOrRetry`/`verifyConvSubmitOrRetry` → `verifyInjectOrRetry` 단일 헬퍼 통합(3분기: miss→캐시 프롬프트 재주입 시도당 1회 / hit·read-fail→CR / 소진→fail-visible `inject_unconfirmed`), 프로브 공백-정규화 꼬리 48자 + 플레이스홀더 wrap-tolerant 매치, fake-herdr composer 시뮬 훅, `inject-verify.test.ts` ①–⑬ 신설, VERSION 0.23.5(CLI+MCP). **codex pane 자문(GPT-5.6) REJECT 7건 반영**: F-1(Med) 플레이스홀더 raw substring이 TUI 줄바꿈 시 miss → 정규화 매치로 수정+⑫ wrap 변형 · F-2(Med) M-1 라이브 검증 기록 저장소 부재 → 아래 표로 해소 · F-3 send 직전 flight 재확인 추가 · F-4 소진 로그 실분기(`lastProbe`) 기록 · F-5 ③에 `eventsPrune` 어서션 · F-6 ④에 convFlight 유지+후속 턴 어서션 · F-7 ② CR-수 단위 불일치 대기 조건 수정. `bun test` **361/0**(+13) · 6패키지 typecheck green · biome 변경분 clean. 이탈 없음.

**R30 M-1 라이브 검증 (TUI 3종 composer 가시성, 2026-07-18 — `herdr agent start` 스폰 → 41줄 paste 미제출 → `pane read` → close):**
| TUI | 대형 paste composer 거동 | 꼬리 프로브 |
|-----|------|------|
| claude (Ink) | `[Pasted text #1 +25 lines]` 플레이스홀더(head 접힘) + **꼬리줄 원문 노출**. 소형(7줄)은 전체 원문. **플레이스홀더 문자열 자체가 줄바꿈으로 쪼개짐**(`[Pasted`+개행+`text`) — F-1 근거 | **hit** (양 레짐) |
| grok | 원문 전체 노출(플레이스홀더 없음) | hit |
| codex | 원문 전체 노출(플레이스홀더 없음) | hit |

→ 꼬리-48 프로브는 3종 전부 유효(M-1 "claude에서 (b) 도달 불가" 우려는 꼬리 노출로 해소 — 플레이스홀더 hit 규칙은 이중 안전망). 두 번째 paste가 기존 composer에 **append**되는 것도 실측(M-1 이중-append 리스크 실재 — 재주입 시도당 1회 상한의 근거 보강).

#### 0.23.4 — 2026-07-18 (`approved` — **HerdrClient 이벤트 구독 수명주기 수정 (후보 ⑫)** (PATCH))

**Product one-liner:** 같은 브릿지에서 첫 pane이 닫힌 뒤 dispatch한 카드/conv가 이벤트 구독 고착으로 프롬프트 주입조차 못 받던 버그(card.done 유실 + "스타트업 레이스"로 오인되던 composer 빈 현상의 실체)를 수정한다 — 닫힌 pane 구독 정리, 구독 실패의 즉시 정착(fail-visible), 이벤트 스트림 상태의 관측성 확보.

**Why (후보 ⑫ root cause — 2026-07-18 codex pane 조사로 확정, 재현·반증 완료):**
- **`HerdrClient.subscriptions`는 append-only** (`herdr-client.ts:278-286`) — flight가 끝나 pane이 닫혀도 해당 구독이 리스트에 남는다. 다음 카드의 `eventsSubscribe`는 오염된 전체 리스트로 이벤트 연결을 재개설하고, herdr는 무효(닫힌 pane) 구독이 포함된 스트림을 **ACK 전에 close**한다.
- **`openEventConnection`의 close 핸들러는 pending promise를 정착시키지 않는다** (`:357-363` — pre-ACK close 시 resolve/reject 없음, ACK 타임아웃도 없음) → `bridge-runtime.ts:496`의 `await herdr.eventsSubscribe(...)`가 **영구 미정착** → `:507` 프롬프트 주입 미실행. grok/codex 카드에서 관찰된 "composer 빈 현상"(당일 6회+)의 상당수가 타이밍 레이스가 아니라 이 버그였다(첫 pane close 후 dispatch한 카드에서만 재현된 사실과 일치).
- **재연결도 오염 리스트를 재전송** (`:306` — `this.subscriptions` 그대로) → 백오프 무한 반복. stderr는 데몬 spawn 시 `"ignore"`(`bridge-spawn.ts:64-65`)라 전 과정이 무신호.
- 재현·반증: pane A 생존 시 B 구독 ACK 106ms 정상 / A 닫힌 후 B 구독 타임아웃·이벤트 0건 / A 구독 prune 시 즉시 복구.
- 부차: `pane.closed`는 글로벌 스키마인데 pane별로 중복 구독 중.

**What (범위 — PATCH; herdr RPC 표면·wire 무변경):**
| 항목 | 내용 |
|------|------|
| **`herdr-client.ts` — 구독 prune API** | `eventsPrune(paneId: string)` 신설: 저장 리스트에서 해당 `pane_id`의 구독 항목을 제거한다. **소켓 재개설 없음** — 열린 이벤트 연결의 잔존 구독은 무해하고(닫힌 pane은 이벤트를 내지 않음), 오염은 다음 재개설 시 리스트로만 전파되므로 저장 리스트 정리로 충분하다. pane_id 없는 글로벌 항목(`pane.closed`)은 대상 아님. **prune 후 리스트가 비면** 이벤트 소켓 close + 재연결 타이머 취소(빈 리스트 재연결 루프 방지 — 기존 `:362` `if (this.subscriptions.length)` 가드와 정합). `close()`는 구독 리스트도 비운다(위생). |
| **`herdr-client.ts` — pre-ACK close reject + ACK 타임아웃** | `openEventConnection`: ① `close` 핸들러에서 **미정착(pre-ACK) 상태면 reject**(현행: 무정착 방치) ② ACK 대기 타임아웃(`opts.timeoutMs ?? 15s`) — 초과 시 reject + 소켓 destroy, **정착(resolve/reject) 시 타이머 해제**(R29 L-4 — 미해제 시 정상 ACK 15s 뒤 건강한 소켓을 destroy). reject 후에도 저장 리스트가 남아 있으면 기존 `scheduleEventReconnect` 백오프는 유지하되, 호출자(`eventsSubscribe`)에게는 실패가 **즉시 전파**된다(브릿지 fail-visible의 전제). **superseded 세대(`myGeneration !== this.eventGeneration`)의 pending promise는 reject 대신 신세대 연결의 결과를 채택**(R29 L-1 — 신세대 ACK 성공 = resolve, 실패 = 그 실패로 정착; 동시 `eventsSubscribe` 경합 시 앞 호출의 구독이 신세대 연결에서 실제 성립하는데도 오탐 reject되는 구조적 오류 방지). |
| **`herdr-client.ts` — 구독 실패 롤백 (R29 M-1 lock)** | **`eventsSubscribe`는 reject 시 이번 호출이 새로 추가한 구독 항목을 저장 리스트에서 롤백한다**(기존 `exists` 중복 체크가 신규분을 식별하므로 추가분만 제거 — 이전부터 있던 항목은 유지). 이로써 실패 정리 경로(카드/conv)가 pane을 닫아도 오염이 잔존하지 않는다 — 롤백 없이는 신설 fail-visible 경로가 pane을 닫으면서 방금 push된 구독(닫힌 pane 참조)을 리스트에 남겨, **이 PATCH가 제거하려는 오염을 신설 경로가 재생산**(이후 dispatch 연쇄 실패 + 백오프 오염 지속). 불변식은 클라이언트 한 곳에 두어 카드·conv·미래 호출자를 일괄 커버한다(**호출부별 prune 의존 금지**). |
| **`herdr-client.ts` — `pane.closed` 글로벌 1회** | 브릿지 시작 시(herdr ping 직후) `eventsSubscribe([{ type: "pane.closed" }])` 1회로 전환하고, 카드/conv 스폰 시 구독은 `pane.agent_status_changed`(pane별)만 추가한다. `onHerdrEvent`(`bridge-runtime.ts:1023`)는 이미 paneId로 flight 맵을 조회해 라우팅하므로 소비부 무변경(맵 미스 = no-op — R29 실증). 부수 효과: 브릿지 기동 직후부터 이벤트 연결이 열려 `eventConnected` 관측 가능. **기동 시 이 글로벌 구독이 실패하면 fail-fast(기동 실패)** — 이벤트를 못 받는 브릿지는 카드/conv 완료를 전달할 수 없으므로 뜨는 것 자체가 무의미(R29 L-2, advisor fail-fast 권고 채택; 기존 herdr ping fail-fast와 동일 계열). |
| **`bridge-runtime.ts` — prune 호출 지점** | flight/convFlight가 맵에서 제거되는 **모든** 지점에서 `herdr.eventsPrune(paneId)` 호출: 카드 — inject 실패(`:509`), pane_closed(`:1050`), blocked(`:1079`), done/idle(`:1084`); conv — conv.close(`:699`), inject 실패(`:771`), pane_closed(`:1104`). 신설 구독-실패 정리 경로(아래 행)의 오염 잔존은 M-1 롤백 불변식이 클라이언트 측에서 커버(호출부 prune 추가 불요·의존 금지). |
| **`bridge-runtime.ts` — 구독 실패 fail-visible** | 카드 경로(`:495-502`): `eventsSubscribe` 실패 시 현행 "log 후 blind 진행"을 폐기 — flight 정리 + `sendFailedResult(reason: "events_subscribe_failed")` + pane close 시도. 이벤트를 못 받는 카드는 완료를 영원히 전달 못 하므로 진행이 무의미하다. conv 경로(`:741-748`): convFlights/convPaneByConvId 정리 + `sendWorkerTurnFromPane(flight, "blocked", "events_subscribe_failed")`로 타워에 통지(기존 pane_closed blocked 턴과 동일 표면). |
| **관측성 — status 노출** | 브릿지 status op(`bridge-runtime.ts:271-282`)에 추가: `eventConnected: boolean`(이벤트 소켓 ACK 후 연결 상태) · `lastSubscribeAck: string \| null`(마지막 ACK ISO 시각) · `eventSubscriptions: number`(저장 리스트 크기). `loom bridge status` 표시에 반영. |
| **관측성 — stderr 유한 로그** | `bridge-spawn.ts:64-65` `stderr: "ignore"` → `loomDir()/bridge/<profile>.stderr.log`로 리다이렉트(스폰 시 **truncate** — 데몬 실행 1회분만 보존해 유한 보장, 0600). `[loom-bridge]` log()가 처음으로 프로덕션에서 관찰 가능해진다. 로그에 워커 프롬프트 본문·핸드오프 body를 쓰지 않는 기존 원칙 유지(현행 log() 호출은 에러·상태만 — 회귀 확인 항목). stdout은 `"ignore"` 유지. |
| **테스트** | fake herdr fixture: ① flight 종료 → prune → 다음 `eventsSubscribe` 요청 payload에 닫힌 pane 부재 ② pre-ACK close(FIN) → `eventsSubscribe` reject 전파 ③ ACK 타임아웃 → reject ④ prune 후 재연결 리스트에 닫힌 pane 부재(오염 재전송 회귀) ⑤ 마지막 구독 prune → 소켓 close + 재연결 타이머 취소 — **HerdrClient 단위 테스트(글로벌 구독 부재 조건)로 한정**(R29 L-5: 운용 중 브릿지는 글로벌 `pane.closed` 항목이 prune 비대상이라 리스트가 빌 수 없음 — 브릿지 시나리오로는 성립 불가한 케이스임을 명시) ⑥ `pane.closed` 글로벌 항목은 prune 비대상·카드 2건에도 1개 유지 ⑦ 카드 subscribe 실패 → `events_subscribe_failed` failed result + flights 제거 ⑧ conv subscribe 실패 → blocked 턴 + convFlights 정리 ⑨ status op `eventConnected`/`lastSubscribeAck`/`eventSubscriptions` 반영 ⑩ **버그 재현 통합 테스트**: 카드 A done → pane close → 카드 B dispatch 시 구독·주입 정상(수정 전이면 고착) ⑪ 정상 단일 카드 working→idle→done 회귀 ⑫ `close()` 시 리스트·타이머 정리 ⑬ **M-1 롤백**: subscribe 실패(pre-ACK close) → 저장 리스트에 이번 호출 추가분 부재 → 다음 dispatch의 `eventsSubscribe` 정상(자기 재감염 회귀) ⑭ **L-4 타이머 해제**: 정상 ACK 정착 후 타임아웃 시간 경과에도 소켓 생존(fake timer — ⑪은 15s를 실제로 기다리지 않아 미해제를 못 잡음). |

**Out of scope (이 버전 아님):** 브릿지 주입 verify 루프 확장(후보 ⑨ — composer 잔류 감지·재주입·fail-visible 3분기; ⑫ 수정 후 잔여 레이스만 재평가) · stderr 로그 로테이션/사이즈 캡(truncate-on-spawn으로 충분, 필요 시 후속) · herdr upstream 구독 프로토콜 개선 제안(관찰 대상) · 이벤트 스트림 heartbeat/능동 재구독 검증(단, R29 L-3: herdr가 닫힌 pane 구독을 가진 **established** 스트림을 나중에 강제 종료하는지는 미검증 — 구현 시 events-probe 재사용으로 라이브 검증 1회 수행·결과 기록; 강제 종료가 실재해도 재연결이 prune된 리스트로 복구(테스트 ④ 안전망), 잔여 리스크는 백오프 동안의 이벤트 갭뿐) · ②③⑤⑥⑦ 기존 후보들.

**Security / trust (R29 판단 대상):**
- **신뢰 경계 무변경** — 이벤트 소켓은 로컬 herdr 유닉스 소켓(기존 신뢰 모델), wire·MCP·핸드오프 표면 전부 무변경. 신설 표면은 로컬 stderr 로그 파일뿐: `loomDir()` 내부 0600, 프롬프트 본문·핸드오프 body 비기록 원칙 유지.
- **실패 의미 변경이 핵심 리뷰 대상**: 구독 실패 시 무음 blind 진행 → fail-visible failed result/blocked 턴. 오탐(일시 herdr 재시작 중 dispatch 도착) 시 카드가 failed로 회신되지만, 이는 현행 "영원히 doing 고착 + 수동 정리"보다 보수적으로 우월(재-dispatch 가능). 
- **dedup/재전송 안전**: prune은 브릿지 내부 상태만 변경 — 카드 결과 dedup(`processedHandoffs`)·conv seq 단조성에 영향 없음.

**Review impact:** protocol v1 무변경 · MCP 도구 수 무변경 · 신뢰 경계 무변경. 카드/conv 완료 전달 핵심 경로의 수명주기 재설계 + 실패 가시화 의미 변경 → **R29 요청** (HANDOFF 기지정).

**R29 질의:** *(현재 없음.)*

**Approved by:** Fable 5 (fable-advisor) R29 — `pending-revision` → **M-1 lock**(`eventsSubscribe` reject-시 신규 추가분 롤백 — 신설 fail-visible 경로의 자기 재감염 차단, 불변식은 클라이언트 한 곳) PLAN 본문 반영 + **L-1**(superseded 세대 promise는 신세대 연결 결과 채택)·**L-2**(기동 시 글로벌 `pane.closed` 구독 실패 = fail-fast)·**L-3**(established 스트림 강제 종료 미검증 — 구현 시 events-probe 라이브 검증 1회 명시)·**L-4**(ACK 타임아웃 타이머 정착 시 해제 + fake-timer 테스트 ⑭)·**L-5**(테스트 ⑤ HerdrClient 단위 한정 명시) author-close → **author-close `approved`**(Fable 사전 승인, no R29b), 2026-07-18. 상세 `docs/plan_review.md` R29.

**Implemented as of `c7df503` (2026-07-18, grok pane 구현 · codex pane 자문 · 아키텍트 독립 검증):** 7파일 +1,342/-65 — `eventsPrune`/M-1 롤백/pre-ACK reject/ACK 타임아웃(L-4 해제·superseded 타이머 정리)/L-1 신세대-결과 채택/`eventConnected`·`lastSubscribeAck`·`eventSubscriptions` getter(`herdr-client.ts`) · 기동 글로벌 `pane.closed` fail-fast + prune 7지점 + fail-visible 양 경로(카드 failed result+pane close 시도 / conv blocked 턴) + status op 3필드(`bridge-runtime.ts`) · stderr 유한 로그 truncate-on-spawn 0600 + profile sanitize(`bridge-spawn.ts`) · 테스트 ①–⑭(`herdr-lifecycle.test.ts` 신설 + fake-herdr closed-pane pre-ACK FIN 모드) · VERSION 0.23.4. **codex pane 자문 REJECT 5건 반영**: F-1 카드 구독실패 pane close 누락 · F-2 stderr profile 미검증(slash/`..` 탈출) · F-3 테스트 ④⑩ 실장애 미재현 → closed-pane FIN 모드로 재작성 · F-4 superseded 타이머 누수+⑭ Bun fake-timer 무효 → 실타이머 재작성 · F-5 ⑧ 정리 실증 보강. `bun test` **348/0** · 6패키지 typecheck green. **R29 L-3 라이브 검증 완료**: herdr는 닫힌 pane 구독을 가진 established 스트림을 강제 종료하지 않음(90s 관찰, 프로브) — prune-without-reopen 전제 실증. **라이브 스모크(수정 코드 브릿지)**: 동일 브릿지 2번째 카드 구독 정상 성립·card.done 정상 도착(수정 전 2회 연속 유실됐던 정확한 시나리오) + flight 종료 후 `eventSubscriptions` 글로벌만으로 복귀(prune 동작) + stderr 로그 0600 생성 확인. 이탈 없음.

#### 0.23.3 — 2026-07-18 (`approved` author-close after R28 `pending-revision` — **conv 워커 산출물 파일-기반 artifact 트리거 (§5.1 자가 적용 규약)** (PATCH))

**Product one-liner:** 32k 초과 산출물을 워커가 규약 디렉터리(`~/.loom/artifacts/<convId>/`)에 직접 파일로 쓰고 턴 끝에 `[ARTIFACT] <파일명>` 마커로 알리면, 브릿지가 파일명 검증 후 기존 0.23.1 패키징 경로(sha256·chars·틸드-리터럴 ref)로 artifacts[] ref를 회신한다 — pane 스크레이프 상한과 무관하게 §5.1 "절단 금지"가 라이브에서 실제로 성립한다.

**Why (후보 ⑩ 조사 결론, 2026-07-18 실측):** 0.23.1의 artifact 트리거는 브릿지가 pane 스크레이프 길이(>32k)를 측정하는 구조인데, 실물 스모크에서 **Claude Ink TUI pane 스크레이프는 소스 모드(`visible|recent|recent-unwrapped`)·요청 줄수 무관 ~5.3k 상한**이 실측됐다(TUI가 트랜스크립트를 접어 렌더 버퍼만 남김 — 원시 shell pane은 `recent 500`=51.7k로 스크롤백 보존, 차이 원인은 herdr가 아니라 TUI). 따라서 32k 측정 트리거는 **라이브에서 구조적으로 도달 불가**. 옵션 검토: **(b) herdr 노출 확대** — herdr 0.7.4의 `pane.read` 소스 3종 전부 렌더 버퍼 종속, 더 깊은 raw 모드 없음(upstream 기능 요청 외 불가, 기각) · **(c) 임계 하향(~5k)** — CONV_SPEC §5.1(32k) 위반 + TUI chrome 오염 스크레이프(관찰 ⑤ⓒ)를 패키징하게 됨(기각) · **(a) 워커 직접 파일 쓰기** — CONV_SPEC §5.1이 애초에 *"판정이 기계적이라 워커 CLI가 프롬프트 규약만으로 자가 적용"*으로 명시한 원의도와 일치(**채택**). 부수 효과: capable 모델(Sonnet 5/Opus 4.8) 워커가 injection형 대량 filler 지시를 거부하던 스모크 블로커(후보 ⑪)도 benign "실파일 artifact 전달"형으로 함께 해소된다.

**What (범위 — PATCH; 설계 정본 = CONV_SPEC §5, 스펙 재론 없음):**
| 항목 | 내용 |
|------|------|
| **워커 프롬프트 규약 (§5.1 자가 적용)** | conv goal 프롬프트(브릿지가 워커 pane에 주입하는 규약 문구)에 추가: 산출물이 인라인 32k를 초과하거나 pane 표시로 온전 전달이 불가능하면, 전문을 artifacts 디렉터리에 직접 기록하고 턴 마지막에 **`[ARTIFACT] <파일명>`** 라인을 출력하라. **기록 경로는 브릿지가 스폰 시 실측 경로로 전달**(R28 L-2 — env `LOOM_ARTIFACTS_DIR=<loomDir()/artifacts/<convId>>` 주입 + 규약 문구에도 브릿지가 실경로를 삽입; `~/.loom` 리터럴 고정 시 legacy `~/.fable` 등 `loomDir()` divergence 환경에서 마커가 항상 파일 부재로 귀결) + 규약 문구에 `mkdir -p -m 700` 권고(기존 0700/0600 관례 정합). `<convId>`는 기존 `LOOM_CONV` env로 워커에 이미 전달됨(0.23.0). 파일명 규약: **파일명만**(경로 구분자 금지), charset `[A-Za-z0-9._-]`, 선행 `-`·`.` 금지, **`turn-*` 패턴은 브릿지 예약 네임스페이스라 금지**(R28 M-1 — 32k 측정 트리거 산출물 `turn-<seq>.txt`와의 충돌 방지; 규약 문구로 고지하고 브릿지는 해당 마커를 거부). |
| **브릿지 — 마커 소비부 (R28 M-1 lock 문안)** | `sendWorkerTurnFromPane` 스크레이프에서 `[ARTIFACT] <파일명>` 라인 탐지 — **정확 라인 앵커**(행 전체가 `[ARTIFACT] <파일명>` 일치, R28 L-1: 타워 주입 문구 echo·대화 중 마커 언급 오탐 축소; 마커는 턴 말미라 ~5.3k 접힘 창에도 잔존) → 파일명 검증(위 규약 — 위반·`turn-*` 예약 침범 시 해당 마커 무시 + bridge note 사유 회신) → `loomDir()/artifacts/<convId>/<파일명>`로만 해석(**realpath containment**: 해석 결과가 conv 디렉터리 내부임을 심링크 추적 후 확인 — **비교 시 root 쪽도 realpath**(R28 L-3③, macOS `/var→/private/var`류 오판 방지), 탈출 시 fail-closed) → 크기 상한(10MB, 초과 fail-closed) → 파일 읽어 sha256·chars 계산 → **방출 계약만 재사용**(R28 M-1: 틸드-리터럴 ref.path root(R26 L-1)·sha256/chars/gist·scp transport 양식만 재사용하고, **`packageConvTurnArtifact`의 파일 쓰기 단계는 파일-기반 입력에 적용하지 않는다** — 파일은 워커가 이미 썼다, 재기록·이중 저장 금지). **ref 파일명 = 검증 통과한 마커 파일명 그대로.** **inline turn text = pane 스크레이프 원문(±마커 라인) + artifact notice 부가 — 파일 tail로 대체하지 않는다.** **다건 마커는 파일별 ref 1건씩 artifacts[]에 누적**(상한 턴당 4건 — 스키마 max 16 이내, 초과분 무시 + note). **32k 측정 트리거와 마커가 같은 턴에 동시 발화하면 양쪽 ref를 병존 방출**(측정 트리거는 `turn-<seq>.txt`, 마커는 자체 파일명 — 예약 네임스페이스로 충돌 없음). **conv별 방출 기억 (파일명, sha256)으로 잔존 마커 재탐지 dedup**(R28 L-1 — 스크레이프 창이 턴 경계로 리셋되지 않아 이전 턴 마커가 다음 턴에 재탐지됨; sha 동일하면 skip, 파일 갱신으로 sha가 다르면 정당 재방출). 파일 부재/검증 실패 시 턴 자체는 정상 진행(artifact 미방출 + note 사유). |
| **기존 트리거 유지 (회귀 없음)** | 브릿지 측정 32k 트리거(`output.length > MAX_CONV_TURN_INLINE_CHARS`)는 그대로 유지 — 스크레이프가 실제로 32k를 넘는 환경(비 TUI 워커 등)에서는 여전히 동작. |
| **스모크 재설계 (후보 ⑪ 흡수)** | §5.2 라이브 스모크 페이로드를 benign형으로 교체: "repo의 실제 대용량 파일(예: docs/PLAN.md, 154k) 전문을 artifact 규약으로 전달하라" — capable 모델이 거부할 이유가 없는 정상 작업으로 32k+ 전달을 실증. |
| **테스트** | 마커 탐지 → artifact 파일 읽기·sha256/chars·ref 방출(틸드-리터럴형·**ref 파일명=마커 파일명**) fake herdr fixture; 파일명 검증 거부 케이스(경로 구분자·`..`·선행 `-`/`.`·charset 위반·빈 이름·**`turn-*` 예약 침범**); realpath 탈출(심링크로 conv 디렉터리 밖 지시) fail-closed + **root 쪽 realpath 케이스**(R28 L-3③ — symlink root에서 정당 파일 오거부 없음); 파일 부재 → note 회신·턴 정상 진행; 크기 상한 초과 fail-closed; **다건 마커 → ref별 path·sha256 상이 검증**(R28 M-1)·상한 초과분 무시; **32k 측정 트리거+마커 동시 발화 → 양쪽 ref 병존**(R28 M-1); **이전 턴 마커 잔존 스크레이프 → 중복 ref 미방출, 파일 갱신(sha 변경) 시 재방출**(R28 L-1); inline text가 파일 tail로 대체되지 않음(스크레이프 원문+notice); 기존 32k 스크레이프 트리거 회귀(무변경 확인); 32k 이하 + 마커 없음 = 기존 인라인 경로 회귀. |

**Out of scope (이 버전 아님):** herdr upstream raw 스크롤백 노출 모드(⑩(b) — 기각이 아니라 upstream 관찰 대상); 워커 턴 pane 스크레이프 delta화(⑤)·close 시 pane 정리 정책(⑥)·`loom conv-hosts set` CLI(⑦)·브릿지 주입 verify 루프 개선(⑨); artifact fetch 자동 실행(0.23.0 원칙 승계 — 제시까지만); 단발 card result 경로의 파일 규약 적용(§5.5 별도 유지 — conv 한정); 브릿지 자동 git push(0.23.1 Out 승계).

**Security / trust (R28 판단 대상):**
- **워커 제어 입력이 브릿지 파일 읽기를 유도한다** — 신설 신뢰 경계. 방어 4계층: ① 파일명-only(경로 구분자·`..` 금지) ② charset allowlist + 선행 `-`/`.` 금지 ③ realpath containment(`loomDir()/artifacts/<convId>/` 밖 해석 = fail-closed, 심링크 포함, root 쪽도 realpath — R28 L-3③) ④ 크기 상한. 워커는 이미 해당 노드에서 자율 실행 중인 로컬 프로세스이므로(R23 신뢰 모델) 워커가 읽을 수 있는 파일은 원리상 pane 출력으로도 전달 가능 — 이 PATCH가 새로 주는 능력은 "브릿지가 전송 주체가 되는 것"뿐이고, 위 검증으로 워커 홈 임의 파일 지정 경로를 차단한다. **방어심층 한정 명시(R28 L-3①②):** realpath 검사→read 사이 TOCTOU(심링크 스왑)·hardlink(realpath로 미포착)는 위 신뢰 모델상 신규 능력이 아니므로(동일 사용자 자율 워커) 추가 방어를 요구하지 않는다 — 후속 리뷰의 재발굴 방지용 기명 한정.
- **wire 무변경:** artifacts[] 스키마·M-2 수신 검증·타워 제시 표면(0.23.1) 전부 무변경 — 생산 트리거만 추가.
- **마커 위조:** conv pane에 제3자가 쓸 수 없다(herdr pane은 브릿지 스폰 전용, M-2 주입 경로 공용) — 마커 출처는 워커 자신뿐이며 워커는 이미 신뢰 모델상 자율 주체.

**Review impact:** 와이어 무변경·MCP 도구 수 무변경. M-2 신뢰 경계 **인접**(artifact 생산 트리거에 워커 제어 입력 도입) + §5.2 트리거 의미 변경 → §5.1 보수 판단으로 **R28 요청**.

**R28 질의:** *(현재 없음.)*

**Approved by:** Fable 5 (fable-advisor) R28 — `pending-revision` → **M-1 lock**(방출 계약만 재사용·파일 쓰기 생략·ref 파일명=마커 파일명·inline text 부가·다건 누적·동시 발화 병존·`turn-*` 예약 네임스페이스) PLAN 본문 반영 + **L-1**(잔존 마커 dedup (파일명, sha256)·정확 라인 앵커)·**L-2**(실측 artifacts 경로 전달 env `LOOM_ARTIFACTS_DIR` + `mkdir -p -m 700` 권고)·**L-3**(TOCTOU·hardlink 신뢰 모델 한정 명시 + root 쪽 realpath) author-close → **author-close `approved`**(Fable 사전 승인, no R28b), 2026-07-18. 상세 `docs/plan_review.md` R28.

**Implemented as of `95cc81e` (2026-07-18, grok pane 레인 · 아키텍트 독립 검증 · codex pane 자문):** 6파일 +1,151줄 — `scanArtifactMarkers`/`validateArtifactMarkerFilename`/`packageWorkerFileArtifact`/`workerArtifactInlineNotice`(`conv-artifact-pack.ts`)·`sendWorkerTurnFromPane` 마커 소비부+`ConvFlight.emittedArtifacts`·`startConvPane` `LOOM_ARTIFACTS_DIR` env+규약 프롬프트(`bridge-runtime.ts`)·VERSION 0.23.3(CLI+MCP). 구현·자문·수정 전부 herdr pane 레인(오너 지시): grok pane 구현 → **codex pane 자문(GPT-5.6, 오너 지시로 fable-advisor 대체) REJECT 2건** — ① dedup 메모리 전송-성공-전 기록(전송 실패 시 미전달 artifact 영구 억제) → commit-after-send로 수정 ② 위반 파일명 마커가 스캔 정규식에 걸러져 검증 미도달(무음 무시, R28-lock "note 회신" 위반) → 스캔 `\S+` 확장으로 수정 → grok pane 수정 적용. `bun test` **335/0**(+26) · 6패키지 typecheck green · biome clean. 이탈 없음. **관찰(신규 후보 ⑫ 근거): grok pane 카드 2건 모두 브릿지 card.done 유실**(브릿지당 2번째+ pane 이벤트 구독 사망 가설) — 수동 보드 정리, 별도 조사 카드 진행.

**라이브 스모크 (2026-07-18 저녁, ⑫ 해소 후):** `conv_50f5fa521d5d9687` — benign 페이로드(docs/PLAN.md 전문 179KB)로 §5.1 마커 경로 전 구간 실증: 규약 프롬프트 실경로 주입(L-2)·`[ARTIFACT]` 마커 소비·틸드-리터럴 ref·sha256 로컬 파일 정확 일치·원본 바이트 동일·M-2 fail-closed↔제시(conv-node-hosts 매핑 등록 후) 양 분기·잔존 마커 dedup(L-1, 2번째 턴 신규 ref만 방출). capable 워커 거부 없음(후보 ⑪ benign 설계 실증). 상세 `HANDOFF.md`.

#### 0.23.2 — 2026-07-18 (`approved` R27 즉시 승인 — **dispatch/conv agentKind allowlist 확장 (codex·grok)** (PATCH))

**Product one-liner:** 타워가 카드 dispatch와 `conv.open`에서 `agentKind`로 codex/grok 워커를 지정할 수 있다 — 실행은 각 브릿지 오퍼레이터가 로컬 설정(`agentArgv`)에 해당 kind의 argv를 명시 등록한 노드에서만 성립하고(기본 fail-closed), wire에는 여전히 argv가 실리지 않는다(HERDR_DESIGN §4.4.2 원칙 유지).

**Why:** 0.22.0 슬라이스 allowlist는 `claude`만이었고(`card-contract.ts:19` — "Slice allowlist: claude only"), 0.23.0 Out-of-scope가 "agentKind allowlist 확장(codex/grok 등) = 후속 PATCH"로 명시 예약해 뒀다. dogfood에서 grok/codex 구현 레인은 현재 headless 서브에이전트로만 위임 가능한데(HANDOFF 실측 제약: "herdr dispatch allowlist = claude만"), herdr pane 레인에서도 같은 레인 선택지가 필요하다. herdr는 grok/codex pane agent 감지를 이미 지원한다(pane list 실측: `agent:"grok"` 감지, 2026-07-18).

**What (범위 — PATCH; 신규 표면·도구 없음):**
| 항목 | 내용 |
|------|------|
| **protocol — enum 확장** | `DispatchAgentKindSchema` `z.enum(["claude"])` → `z.enum(["claude","codex","grok"])` (`card-contract.ts`) — 카드 dispatch(`CardDispatchPayloadSchema.agentKind`)·conv scope(`ConvScopeSchema.agentKind`, `conv-contract.ts`) **공용 enum이라 두 표면이 동시 확장**된다. attachment 컨벤션 확장이며 **relay 와이어 protocol v1 무변경**. 하위호환: 구버전(≤0.23.1) 브릿지는 미지 kind payload를 zod parse 실패로 거부(카드 `payload_invalid` failed result / conv open 무시) — fail-closed. |
| **브릿지 로컬 설정 (변경 없음이 곧 설계)** | `DEFAULT_AGENT_ARGV`는 **`claude`만 유지**(`bridge-config.ts:21-23`) — codex/grok은 기본 미등록이라 `resolveAgentArgv` null → 카드 `agent_kind_not_allowed` failed result(`bridge-runtime.ts:434`)·conv reject(`:589`) 기존 fail-closed 경로 그대로. 스폰 활성화는 오퍼레이터가 `~/.loom/bridge/<profile>.json`의 `agentArgv`에 `"codex": ["codex"]` / `"grok": ["grok"]` 형태로 명시 등록할 때만. `shell`/`sh`/`bash` 영구 금지 가드(`resolveAgentArgv`) 불변. **R27 L-1(author-close): `loadBridgeConfig` 병합 시 `agentArgv` 값이 비어있지 않은 문자열 배열이 아니면 필터(무시=미등록과 동일 fail-closed)** — 오설정 값(예: `"codex": "codex"` 문자열)이 `resolveAgentArgv`에서 TypeError로 pollTimer 포괄 catch에 삼켜져 claim된 카드가 무신호 `doing` 고착되는 경로 차단(R23 L-1 재발 방지). |
| **MCP/타워 표면** | `dispatch_card`는 `agentKind` 파라미터 기노출(스키마 description만 3종 반영 갱신). `conv_open`에 optional `agentKind`(기본 `"claude"`) 추가 — `convOpen()`(`conv-ops.ts`)의 하드코딩 `"claude"`를 인자화. **도구 수 무변경.** |
| **문서** | HERDR_DESIGN §4.4.2 allowlist 서술 3종 반영 + 브릿지 설정 예시 1블록. **R27 L-2(author-close): 예시 블록에 등록 의미 고지 명시** — "argv 등록 = 해당 CLI의 기본 자율성(권한 모델·자동 실행 특성) 수용, 가드레일 플래그는 오퍼레이터가 argv에 직접 포함"(R23 "워커 pane = 자율 실행 전용" 신뢰 모델의 오퍼레이터 측 절반). |
| **테스트** | enum 왕복(codex/grok payload 유효 parse); 미등록 kind → 카드 `agent_kind_not_allowed` failed + conv reject(양 표면); `agentArgv` 등록 시 스폰 argv 반영(fake herdr — `agentStart` argv 검증); shell/sh/bash 가드 회귀(codex/grok 키에도 적용); `convOpen` agentKind 전파(기본값 claude 회귀 포함); 미지 kind 문자열(예: `"shell"`, `"gpt"`)은 스키마 거부; **비배열/오형상 `agentArgv` 값 → 병합 시 무시되어 미등록과 동일 fail-closed(R27 L-1)**. |

**Out of scope (이 버전 아님):** grok/codex pane **주입 UX 튜닝**(스타트업 레이스 프로파일은 CLI별 상이 — 실물 스모크에서 관찰 후 필요 시 별도 후보, 기존 후보 ⑤와 인접); **agentKind별 차등 인가**(per-kind dispatcher allowlist — 현행 M-1 단일 allowlist 유지, 필요 근거 없음); headless 레인(서브에이전트 위임) 대체 아님 — 병행 유지; agentKind별 cwd/writes 정책 차등(§2.1 scope 의미 무변경).

**Security / trust (R27 판단 대상):**
- **이 PATCH의 본질 = 원격 실행 표면 확대:** 인가된 dispatcher(M-1)가 원격 브릿지에 스폰 지정할 수 있는 CLI가 1종→3종. 방어선은 기존 2계층 그대로 — ① wire에 argv 금지(§4.4.2, enum kind만 전달) + ② 브릿지 로컬 argv 매핑(오퍼레이터 명시 opt-in, **신규 kind의 기본값을 등록하지 않는 것이 이 PATCH의 핵심 보수 결정**). 등록하지 않은 노드의 동작은 0.23.1과 완전 동일.
- **M-2 제출 분리(리터럴 send + 고정 상수 별도 Enter)는 agentKind 불문 공용 주입 경로** — 주입 코드 무변경, 신규 kind에 자동 적용.
- **하위호환 fail-closed:** 구버전 브릿지는 미지 kind를 parse 거부 — 확장 kind가 구노드에서 조용히 claude로 강등되는 경로 없음.

**R27 질의:** *(현재 없음.)*

**Approved by:** Fable 5 (fable-advisor) R27 — **즉시 `approved`**(M-lock 없음 — fail-closed 불변식(기본 미등록 = 0.23.1 동일 동작 + wire argv 금지 §4.4.2)이 코드로 보증됨을 확인), 2026-07-18. L-1(`loadBridgeConfig` `agentArgv` 병합 시 비배열 값 필터 + "비배열 `agentArgv` 값 → 무시(=미등록 fail-closed)" 테스트 — 오설정 시 TypeError가 pollTimer catch에 삼켜져 claim 후 무신호 증발=doing 고착 방지)·L-2(브릿지 설정 예시에 "argv 등록 = 해당 CLI의 기본 자율성 수용, 가드레일 플래그는 argv에 직접 포함" 고지)는 구현 PATCH 내 author-close(`docs/plan_review.md` R27).

**Implemented as of `91bee75` (2026-07-18, grok-impl 레인 · 아키텍트 독립 검증):** 13파일 +518줄 — enum 3종 확장(`card-contract.ts`)·`sanitizeAgentArgv()`(R27 L-1, `bridge-config.ts`)·`convOpen` agentKind 인자화(`conv-ops.ts`)·MCP `conv_open` agentKind 노출+`dispatch_card` 설명 갱신(`stdio.ts`/`tools.ts`)·HERDR_DESIGN §4.4.2 예시 블록+L-2 고지·VERSION 0.23.2(CLI+MCP). L-1·L-2 author-close 구현 포함 완료. 신규 테스트 15개 — `bun test` **309/0** · 6패키지 typecheck green. 이탈 없음(`implementation-notes.md` 추가 기록 없음).

#### 0.23.1 — 2026-07-18 (`approved` author-close after R26 `pending-revision` — **§5.2 artifact 패키징 호출부** (PATCH))

**Product one-liner:** 32k를 넘는 워커 턴이 잘려나가는 대신, 브릿지가 산출물 전문을 규약 디렉터리(`~/.loom/artifacts/<convId>/`)에 보존하고 artifacts[] ref로 회신하며, 타워는 M-2 검증을 통과한 fetch 명령을 **제시**받는다 — CONV_SPEC §5.1 "절단 금지"의 코드 회복.

**Why:** 0.23.0 구현은 M-2 검증 함수(`conv-contract.ts` `validateGitArtifactRef`/`validateScpArtifactRef`)를 완성·테스트했으나 **호출부가 없다** — 브릿지 `sendWorkerTurnFromPane`은 32k 초과 시 0.22.0 관례 tail-truncate 폴백(`bridge-runtime.ts:808,826,831`, 구현 노트에 문서화된 MVP 갭)으로 §5.1 "무조건 out-of-band 전환·절단 금지"와 불일치. conv 실물 스모크(2026-07-18, HANDOFF)로 0.23.0 왕복 경로가 검증된 지금이 이 정합 회복의 적기다.

**What (범위 — PATCH; 설계 정본 = CONV_SPEC §5):**
| 항목 | 내용 |
|------|------|
| **브릿지 — 패키징 호출부(§5.1→§5.2)** | `sendWorkerTurnFromPane`에서 인라인 32k 초과 시 truncate 대신: pane 산출물 **전문**(=회수된 스크레이프의 전문 — R26 L-2, 아래 참조)을 `~/.loom/artifacts/<convId>/turn-<seq>.txt`(디렉터리 0700·파일 0600, `loomDir()` 경유 M-14)에 기록 → `sha256`·`chars` 계산 → `artifacts:[{transport:"scp", ref:{host:<브릿지 노드 displayName>, path}, sha256, chars, gist}]` 방출. **wire의 `ref.path`는 규약형 틸드-리터럴 `~/.loom/artifacts/<convId>/…`로 방출**(R26 L-1) — 브릿지는 `loomDir()` 절대경로에 기록하되 wire엔 리터럴형만 싣는다(절대경로 방출 시 크로스머신 prefix 전량 불일치 + 브릿지 홈경로 노출). 인라인 `text` = 32k 이내 **gist**(tail 발췌 + artifact 안내 문구 — **회수 창(현행 `pane.read` recent 200줄) 명시 포함**, R26 L-2: 창 밖 출력은 artifact 파일에도 없으므로 "전문"은 회수분에 한정된 정직한 주장이어야 한다). truncate 폴백 제거. pane 스크레이프는 로그성 산출물이므로 §5.2 분류상 **scp 규약**이 정본 경로 — git 주수단은 repo-적합 산출물용(아래 Out). |
| **타워 — fetch 명령 제시(M-2 소비부)** | `conv_await`가 artifacts[] 포함 턴 수신 시, ref별로 M-2 검증 수행 후 **통과한 것만** fetch 명령 문자열(scp/git argv 조립, 셸 연결 없음)을 결과에 포함해 **제시**한다. **scp `host`는 수신측 로컬 명시 구성(설정)의 peer/node→ssh host 매핑에서만 해석한다 — conv state에 기록된 자기신고 displayName을 host로 쓰는 것 금지. 매핑 부재 시 명령 미조립 + 사유 표시(fail-closed)**(R26 M-1 — `validateScpArtifactRef`의 resolveHost null 경로가 fail-closed 원시로 기존재, 문안 고정). git ref는 `validateGitArtifactRef` — 기존 remote만. 타워 검증 root도 틸드-리터럴 규약형(R26 L-1 — 브릿지 방출형과 동일, 확장은 원격측). 검증 실패 ref는 명령 미조립 + 사유 표시. **자동 실행 없음** — 0.23.0 "제시까지" 원칙 그대로. |
| **제시 문자열 렌더링 규약 (R26 M-2)** | fetch 명령 제시 문자열 렌더링 시 **POSIX 단일인용 필수**(내장 `'`는 `'\''` 이스케이프) + branch·path의 convId-prefix 이후 접미에 **charset allowlist `[A-Za-z0-9._/-]`**(세그먼트 선행 `-` 금지)를 심층방어로 병행. 근거: M-2 검증 함수는 argv-수준 방어이고 스키마는 charset 무제약이라 `conv/<convId>/$(cmd)` 형 값이 검증을 통과하는데, 제시 문자열의 유력 복붙 실행자는 `conv_await` 결과를 컨텍스트로 받는 **타워 LLM 에이전트 자신**이라 "사람이 눈으로 거른다" 가정이 약하다. 인용 상호작용(R26 L-1): 단일인용 시 로컬 셸 틸드 확장이 죽으므로, 틸드-리터럴 path는 scp **원격 경로 위치**에서만 유효한 형태로 렌더링한다. (권고, non-binding: 제시 문자열에 "untrusted 출처 — 실행 전 검증" 프리픽스.) |
| **테스트** | fake herdr fixture: 32k 초과 스크레이프 → artifact 파일 생성·회수분 전문 보존(절단 없음)·sha256/chars 일치·ref 방출(틸드-리터럴형)·인라인 gist+안내 문구 합 ≤32k; 32k 이하는 기존 인라인 경로 무변경(회귀); 타워 측 M-2 검증 통과 시 fetch 명령 조립(단일인용 렌더링·charset allowlist)·실패 시(traversal path·**host 매핑 부재 fail-closed**·선행 `-`·allowlist 위반 접미) 미조립+사유 케이스; **생산 측 규약 위반 시 수신 검증이 정당 거부**하는 케이스. |

**Out of scope (이 버전 아님):** 브릿지의 **자동 git push** 패키징(원격 실행 표면 확대 — 워커 에이전트가 repo 산출물을 스스로 conv 브랜치에 push하는 경우의 ref 전달은 스키마상 이미 가능, 브릿지가 git을 실행하는 것은 별도 게이트); artifact fetch **자동 실행**(0.23.0 out-of-scope 승계); §5.4 정리 자동화(R25 L-4 승계); 워커 턴 pane 스크레이프 delta화·close 시 pane 정리 정책(스모크 관찰 ⑤⑥ — 별도 후보); done_proposal 탐지 규약·conv.open deny 클레임 순서·agentKind 확장(후보 ②③④).

**Security / trust (R26 판단 대상):**
- **브릿지가 M-2 ref 생산자가 된다:** 지금까지 M-2는 수신 방어만 존재했다. 이 PATCH로 브릿지가 규약 준수 ref를 만들기 시작하므로, 생산 측이 규약(path prefix·convId charset)을 어기면 수신 검증이 정당하게 거부함을 테스트로 고정한다.
- **타워 fetch 명령 제시 표면:** 제시 문자열은 M-2 검증 통과분만, argv 배열 조립(셸 보간 금지). wire의 host 필드는 표시용으로도 신뢰하지 않는다(로컬 매핑 해석 결과만 표시).
- **파일 기록은 브릿지 로컬 쓰기뿐** — 네트워크 실행(scp/git push) 없음. 원격 실행 표면 무증가.

**Review impact:** 와이어 무변경(artifacts 스키마 기존)·MCP 도구 수 무변경. M-2 신뢰 경계 **인접**(생산자 신설 + 소비부 제시 표면) → §5.1 보수 판단으로 **R26 요청**. 구현 중 CONV_SPEC과 충돌 발견 시 구현 보류 + 아래 "R26 질의"에 기록. **fetch 자동 실행을 도입하는 미래 버전은 M-1/M-2가 즉시 High로 승격 — 반드시 별도 R{n} 게이트**(R26 decision note).

**R26 질의:** *(현재 없음.)*

**Approved by:** Fable 5 (fable-advisor) R26 — `pending-revision` → M-1(scp host 해석 출처 = 수신측 로컬 명시 구성 + 매핑 부재 fail-closed)/M-2(제시 문자열 POSIX 단일인용 + charset allowlist) locks PLAN 본문 반영 → **author-close `approved`**(Fable 사전 승인, no R26b), 2026-07-18. L-1(ref.path 틸드-리터럴 규약형 — 브릿지 방출·타워 검증 양형 고정 + 인용 상호작용)·L-2("전문"=회수 스크레이프 전문 한정, gist 안내 문구에 회수 창 명시) author-close.

**Implemented as of `e5ccc4d` (2026-07-18, grok-impl 레인 · 아키텍트 독립 검증):** 16파일 +1,060줄 — 신규 `conv-artifact-pack.ts`(브릿지 패키징)·`conv-artifact-present.ts`(타워 제시)·`conv-node-hosts.ts`(M-1 로컬 매핑, `loomDir()/conv-node-hosts.json` 0600, **pinned peerId 키잉**) 각 +tests·계약 렌더 함수(`posixSingleQuote`/`presentGit|ScpFetchCommand`/`convArtifactsRootLiteral`)·`bridge-runtime.ts` truncate 폴백 제거·`conv_await` `artifactCommands[]`·VERSION 0.23.1(CLI+MCP — MCP 0.22.0 드리프트 동시 정정). `bun test` **294/0** · 6패키지 typecheck green. M-lock 코드 확인: M-1 fail-closed(`conv-node-hosts.ts:67-72` + pinnedPeerId 해석 `conv-artifact-present.ts:25-29`), M-2 렌더(`conv-contract.ts` allowlist+단일인용, 제시-only). 이탈 5건 `implementation-notes.md` §0.23.1. **Follow-up(후속 PATCH 후보):** `loom conv-hosts set` CLI 서브커맨드(현재 conv-node-hosts.json 수동 편집 — fail-closed 기본값과 일관하나 UX 갭).

#### 0.23.0 — 2026-07-18 (`approved` author-close after R25 `pending-revision` — **conv 멀티턴 수직 슬라이스**)

**Product one-liner:** 타워 에이전트와 원격 워커 에이전트가 하나의 목표를 두고 `conv.open`→`conv.accept` 개시 후 **엄격 교대 half-duplex**로 여러 턴을 왕복하며, 원격 done-제안을 타워가 검증·확정한다 — `docs/CONV_SPEC.md`(approved, R24 author-close 2026-07-18)의 1단계 스펙을 relay 와이어 protocol v1 무변경으로 구현한다.

**FREEZE 관계:** 오너가 conv 멀티턴 트랙 자체를 명시 승인(HANDOFF.md, 2026-07-18: *"FREEZE 해제됨 — conv 멀티턴 트랙 진행 승인"*) — 0.21.0/0.22.0처럼 개별 게이트 예외를 받는 구조가 아니라 이 트랙이 곧 해제 대상이다. 0.22.0 브릿지 수직 슬라이스가 herdr 연결점(데몬·dispatch/done 컨트랙트·M-1 dispatcher 인가)을 이미 검증했고, 이 PLAN은 그 위에 멀티턴을 얹는다.

**Why:** 0.22.0은 단발 card dispatch만 지원한다(타워→워커 1왕복, `[DONE]` 1회 회신). 목표 진행 중 왕복 대화(보완 요청·중간 확인·완료 협상)가 필요한 실사용 패턴이 wayfinder 맵 #1에서 확정됐고, 티켓 [#2 세션 의미론](https://github.com/lemonbalms/Loom/issues/2)·[#5 가드레일](https://github.com/lemonbalms/Loom/issues/5)·[#6 와이어](https://github.com/lemonbalms/Loom/issues/6)·[#7 MCP 표면](https://github.com/lemonbalms/Loom/issues/7)·[#8 긴 산출물](https://github.com/lemonbalms/Loom/issues/8)·[#9 진화 가드](https://github.com/lemonbalms/Loom/issues/9) 결정이 `docs/CONV_SPEC.md`로 통합됐다. R24(2026-07-18)가 스펙 자체를 M-1(conv↔peer pin)·M-2(artifact ref 검증 규약) locks 반영 + L-1..L-5 author-close로 `approved` 닫았으므로, 이 PLAN은 그 **승인된 스펙을 구현 계획으로 옮기는 것**이지 스펙 결정을 재론하지 않는다.

**What (범위 — 타워↔워커 1:1 대화 왕복이 실제로 도는 최소 수직 슬라이스; 설계 정본 = `docs/CONV_SPEC.md` §1–§6):**
| 항목 | 내용 |
|------|------|
| **protocol — conv 계약** | `card-contract.ts`(0.22.0) 선례를 미러하는 신규 클라이언트 로컬 zod 계약(`conv-contract.ts` **[가정]**, `packages/protocol`) — `loom-conv-open\|accept\|reject\|turn\|close` label attachment payload, `convId` 형식 `conv_[a-f0-9]{16}`(CONV_SPEC §1.1(개념)·§5.3①(형식), R25 L-2), `turnSeq` 배정 규약(open=0 타워/accept=1 워커/이후 짝=타워·홀=워커, §3.3), `kind: normal\|blocked\|done_proposal`(§1.3), artifact ref 스키마(§5.3) + **M-2 검증 함수**(②git ref는 `conv/<convId>/` prefix 매치 + `--` 구분자 + 선행 `-` 거부 + remote는 로컬 기존 remote만, ③scp host는 로컬 conv 상대 노드 매핑에서 해석 + path는 **정규화 후**(R25 L-3) `~/.loom/artifacts/<convId>/` prefix 강제, ④sha256은 fetch 후 무결성 검증일 뿐). **relay 와이어 protocol v1 무변경** — 전부 attachment 컨벤션(CONV_SPEC §0). |
| **host(타워 측) — conv 세션 상태** | conv별 상태 저장: **pin된 상대 peerId**(M-1, §2.1·§3.3) · last-seen `turnSeq`(멱등 폐기, §3.3) · 한도 카운터(턴 20·2h, §2.2). **M-1 pin 집행** — `turn`·`close`·`done_proposal` 등 모든 intent에서 pin된 peerId 불일치 시 무시+로그(R23 M-1 dispatcher 인가의 타워 측 대칭 짝). 한도 초과 시 **타워 로컬 보드 전이**로 pause(§2.2 — pause는 wire 어휘 아님, 워커 측은 advisory blocked 턴). 보드 매핑 = 대화 전체 카드 1장(§3.4, TaskStatus 5종 재사용·신규 컬럼 없음). 32k 인라인 임계 초과 턴은 artifact ref 강제(§5.1) — 절단 금지. |
| **host(워커/브릿지 측) — bridge-runtime 확장** | `bridge-runtime.ts`(0.22.0)에 conv 경로 추가: `conv.open` 수신 시 scope를 authorizedDispatchers·로컬 allowlist와 대조 후 `conv.accept`/`conv.reject`(§3.1 — M-1 dispatcher 인가 재사용). **conv↔peer pin (R25 M-1):** 브릿지는 `conv.open` 수신(accept) 시 `fromPeerId`를 해당 conv에 pin하고, 이후 `turn`·`close`는 pin 불일치 시 무시+로그; 브릿지 측도 conv별 last-seen `turnSeq`를 유지하며 `seq ≤ last` 멱등 폐기한다 — CONV_SPEC §2.1 "양측이 고정"·§3.3 "수신측은 conv별 last-seen 유지"(양측 수신자)의 브릿지 측 집행이며, 0.22.0 `bridge-runtime.ts:314-320`의 authorizedDispatchers **집합** 검사와는 별도로 **conv별 pin** 대조가 필요하다(인가 dispatcher 2명 시나리오에서 집합 검사만으로는 상호 conv 주입을 막지 못함). **conv.open 중복/재전달**은 이미 active/closed인 convId면 기존 accept 재송신 또는 reject(§4.1.3 멱등 확장). 2번째 이후 턴은 `conv_await` 폴링이 아니라 브릿지가 herdr `agent send`로 워커 pane에 직접 주입(§4.2) — **R23 M-2(제출 분리 — untrusted는 리터럴 send, 제출은 고정 상수 별도 호출)가 첫 프롬프트뿐 아니라 매 턴 적용**. |
| **mcp-server — 4도구** | `conv_open` / `conv_send` / `conv_await`(블로킹, timeoutSec) / `conv_close`만(CONV_SPEC §4.1). 내부는 기존 경로 재사용(opsHandoff sticky-RPC 우선·claim·mutateBoard·resolveTaskIndex) + §3.4 board 전이 자동 처리. 별도 conv_apply 없음 — `conv_await`가 claim+파싱+보드 반영 후 payload 반환(M-6 수신 경로 불변). 노드 조회는 기존 `list_peers`의 `node/` prefix 필터 재사용. |
| **artifact 전달(§5.2)** | git push/pull(conv 전용 throwaway 브랜치 `conv/<convId>/…`) 주수단, scp 폴백(`~/.loom/artifacts/<convId>/`). **1단계는 M-2 검증을 통과한 fetch 명령 문자열을 조립해 제시하는 데까지** — 자동 실행은 하지 않는다(실행은 에이전트/사람 판단, 비-스코프 참조). |
| **테스트** | `bun test` — conv 계약 스키마 왕복(open/accept/reject/turn/close), **M-1 pin 위조 거부 — 타워 수신 + 브릿지 수신 양측 케이스**(불일치 peerId 무시+로그, R25 M-1), turnSeq 멱등 폐기 + 배정 규약(짝/홀 검증), M-2 검증 함수 부정 케이스(선행 `-` 브랜치명·`conv/<convId>/` prefix 불일치·path traversal·wire의 host/URL 신뢰 거부), **미지 convId fail-closed 거부**(pin 상태 없는 convId의 turn/close/done_proposal 무시+로그, R25 M-2), §3.4 보드 매핑 전이, **L-5 중복 `conv.open` → accept 재송신 케이스**, **한도 초과 시 pause 보드 전이 케이스**(R25 L-1), 브릿지 턴 주입은 기존 fake herdr fixture(`docs/spikes/fixtures/herdr-v0.7.4/`) 재사용. |

**Fail-closed 기본값 (R25 M-2):** 타워/브릿지가 모르는(pin 상태가 없는) convId의 `turn`/`close`/`done_proposal`은 무시+로그 — **재시작으로 상태를 잃은 경우 포함**. 미지 convId 수신을 계기로 발신자에게 re-pin하는 관대한 재입양(re-adopt)은 금지한다. 영속화 설계 자체(재시작 시 conv 상태를 어디까지 보존할지)는 이 PLAN이 고정하지 않는다 — 구현 중 결정(in-memory 수용형 vs 최소 영속형 어느 쪽이든 이 기본값 하에서 보안 성질이 보존된다). 근거: R24 M-1 "pin 부재 = 거부"의 자연 귀결 + R23 M-1 "설정 부재 시 기본 거부"의 대칭.

**Out of scope (이 버전 아님 — `docs/CONV_SPEC.md` §8 승계 + 아키텍트 확정):** agentKind allowlist 확장(codex/grok 등 — 0.22.0과 동일하게 슬라이스는 `claude` 유지, 확장은 후속 PATCH); **artifact fetch 자동 실행**(M-2는 명령 조립을 방어하지 실행 여부를 결정하지 않음 — 1단계는 제시까지); 2+3 직결 채널(시그널링·재연결·폴백 상세 — §6 가드만 고정); crash 저널·bridge supervision(0.22.0과 동일 유보); 타워 stateless-relaunch(§4.2 — 2+3 진화 옵션 기록만); 실시간 관전 UX; 멀티파티 conv(1:1만, §8); **§5.4 정리(7일 삭제) 자동화**(R25 L-4 — 이 슬라이스는 삭제를 자동화하지 않는다; 1단계 삭제는 수동/생성측 판단, Security 섹션의 "위조 close = 삭제 시계 조기 가동" 논거는 그 수동 시계에 대한 것).

**Security / trust (R25 필수 이유):**
- **conv↔peer pin 미집행 시 위험(M-1, §2.1·§3.3):** authorizedDispatchers는 집합 검사라 인가 dispatcher가 2명이면 상호 conv 주입이 가능하다. 위조 턴은 타워 에이전트의 대화 입력으로 반복 소비되는 프롬프트 주입면이고, 위조 close는 §5.4의 7일 삭제 시계를 조기 가동(데이터 손실 인접)한다. `fromPeerId` 서버 지정(M-9)이라 집행 원시는 이미 존재 — 이 PLAN이 그 집행을 코드로 옮긴다.
- **artifact ref 기계 조립 방어(M-2, §5.3):** 수신 CLI가 검증 없이 fetch 명령을 조립하면 인자 주입(선행 `-` 브랜치명)·임의 host scp·path traversal이 스펙 준수의 결과물이 된다. 서버 sanitize는 방어가 아니다(제어문자·ESC만 제거, `sanitize.ts:18-50`) — M-2 검증 함수가 클라이언트 로컬 1차 방어선.
- **R23 M-2 매 턴 적용(§4.2):** 워커 pane 주입 경로는 R23이 잠근 제출 분리를 상속하며, 2번째 이후 턴에도 예외 없이 적용해야 프롬프트 자동 제출 위험이 재발하지 않는다.

**Review impact:** 새 MCP 표면(4도구) + 신뢰 경계 집행 코드(M-1 pin, M-2 검증 함수) + 와이어 인접(artifact fetch 명령의 로컬 조립 표면) → **R25 필수(Fable 5)**, §5.1 3중 해당(새 MINOR 표면·보안 경계 변경·프로토콜 인접). **relay 와이어 protocol v1은 무변경** — CONV_SPEC §0 원칙 그대로. 구현 중 스펙과 충돌하는 지점을 발견하면 **구현하지 말고** 아래 "R25 질의"에 기록한다(CONV_SPEC 재해석 금지).

**Unknowns (§3.5 → `docs/UNKNOWNS.md` §0.23.0):** `conv_await` 블로킹의 MCP 클라이언트별 tool-call 타임아웃 상호작용(실측 필요); 워커 pane 수명과 conv 수명 불일치(pane이 죽으면 conv는 pause인가 abort인가 — CONV_SPEC 미명시); 32k 임계 판정에서 herdr pane 스크레이프 기반 요약 회신과의 정합(`pane.read` 단발 회수가 실시간 턴 크기를 정확히 반영하는가); artifact fetch 명령 "제시"의 UX 표면(워커 CLI 프롬프트 노출 vs 사람 승인 큐 — 미정).

**R25 질의:** *(현재 없음. R25 검토는 PLAN 문안 lock 2건(M-1/M-2)으로 종결됐다 — 실제 구현 중 CONV_SPEC과 충돌을 발견하면 이 항목에 기록하고 해당 부분 구현을 보류한다.)*

**Approved by:** Fable 5 (fable-advisor) R25 — `pending-revision` → M-1(브릿지 측 conv↔peer pin·last-seen 집행 명문화)/M-2(미지 convId fail-closed 기본값) locks PLAN 본문 반영 → **author-close `approved`**(Fable 사전 승인, no R25b), 2026-07-18. L-1(테스트 열거 보강)·L-2(convId 형식 출처 표기)·L-3("정규화 후" 문구 복원)·L-4(§5.4 삭제 자동화 out-of-scope 명시) author-close.

**Implemented as of `e4dab9e` (2026-07-18, grok-impl 레인 · 아키텍트 독립 검증):** 13파일 +2,636줄 — `conv-contract.ts`(+tests)·`conv-ops.ts`·`conv-state.ts`(+tests)·`bridge-runtime.ts` conv 경로·MCP 4도구·CLI 0.23.0 범프. `bun test` **261/0** · 6패키지 typecheck green. M-lock 코드 확인: 양측 pin(`conv-state.ts:107` + conv-ops/bridge-runtime 호출부), fail-closed(`conv-state.ts:61-75,137`), M-2 검증(`conv-contract.ts:166-234` — argv 배열, 셸 연결 없음). 이탈 6건 `implementation-notes.md` §0.23.0. **Follow-up(후속 PATCH 후보):** ① §5.2 artifact 패키징 호출부(M-2 검증 함수는 완성·테스트됐으나 브릿지가 git push/scp 조립을 실제 호출하지 않음 — 32k 초과는 0.22.0 관례 tail-truncate 폴백, §5.1 "절단 금지"와의 정합은 이 PATCH에서 회복) ② done_proposal 탐지 휴리스틱(`[DONE_PROPOSAL]` prefix — 스펙 침묵 영역, 기본 normal) ③ conv.open M-1 deny 시 클레임 순서(카드 관례는 미클레임 — 저위험 divergence).

#### 0.22.0 — 2026-07-17 (`pending-review` R23 — **Loom×Herdr 노드 브릿지 수직 슬라이스 (`loom bridge`)**)

**Product one-liner:** 오너가 board 카드 한 장을 `dispatch_card`로 원격 노드에 보내면, 그 노드의 `loom bridge` 데몬이 herdr pane에서 에이전트를 실행하고 `[DONE]` 결과가 durable handoff로 돌아온다 — **relay 와이어(protocol v1) 무변경.**

**FREEZE 관계:** 오너 pull에 의한 **명시적 예외**(2026-07-17, 오너 승인: *"0.22.0 Loom×Herdr bridge — 오너 pull, FREEZE 예외 승인"*) — 이 게이트 **하나만**. 나머지 백로그(work-watch·MCP·C1/C2)는 동결 유지.

**Why:** Loom(휴먼 컨트롤 타워)과 herdr(에이전트 실행 멀티플렉서)의 결합점은 handoff 계층이고, herdr 소켓이 로컬 전용이라 각 노드에 브릿지가 구조적으로 강제된다 — 설계 전체는 **`docs/HERDR_DESIGN.md`**(멀티에이전트 워크플로 작성, 적대적 코드 대조 검증 반영). 선행 게이트 둘 다 **go**: **Step 0** WSL→Windows relay 인바운드 네트워킹(`docs/spikes/STEP0-WSL2-NETWORKING.md` — Win10 NAT 경로, health `version:1` + `LOOM-D3FT` join 왕복) + **Step 0.5** herdr 실측(`docs/spikes/STEP0.5-HERDR.md` — v0.7.4 / protocol 16, NDJSON 프레이밍, 보정 C1–C3, fixture `docs/spikes/fixtures/herdr-v0.7.4/`).

**What (범위 — 노드 1개 WSL 수직 슬라이스; 설계 정본 = HERDR_DESIGN §2–§5):**
| 항목 | 내용 |
|------|------|
| **`loom bridge` 데몬** | CLI 서브커맨드 + detach 데몬(별도 바이너리 아님). sticky host 데몬 관례 3종 재사용: spawn+unref+ping 폴링, `<session>.bridge.json` 메타 사이드카(0600, `profilesWithSession()` 제외 필터 1줄 동반), M-27형 안전 stop. herdr `ping` 성공 후에만 room join(fail-fast) (§2.1–§2.3) |
| **dispatch/done 컨트랙트** | 새 envelope 타입 **없음** — `mode:'task'` handoff + `[GOAL]`/`[DONE]` body 태그 + `intent:`/`task:`/`seq:` 독립 줄 헤더 + 라벨된 JSON attachment(`loom-card-dispatch`/`loom-card-result`). 상관관계 키 = `cardId`(M-9: handoff id 사용 불가). 클라이언트 로컬 zod 계약 `card-contract.ts` (§3.1–§3.3) |
| **herdr 클라이언트** | NDJSON 소켓(Step 0.5 fixture 고정) — `ping`/`agent.start`(env `LOOM_CARD`만)/`agent.send`(no-Enter)/`events.subscribe`(C2 이원 네이밍)/`pane.read` 단발/`session.snapshot` reconcile. 완료 감지는 C1 반영(report `done` 쓰기 불가 → detection/idle 조합) (§2.3–§2.5) |
| **네트워크 lock** | WSL 브릿지의 relay attach = **host NAT 게이트웨이 IP**(Win10, mirrored 불가 — Step 0 실측 `ws://172.27.80.1:7842/ws` 패턴). `127.0.0.1` 가정 금지 |
| **MCP 도구 (타워 측)** | `dispatch_card`(카드→handoff 발행 + `doing`/assignee/handoffId 기록) · `apply_card_result`(result JSON→board 반영: done→`done`, failed→`blocked`). 기존 3단계 등록 관례 (§3.6) |
| **보드 매핑** | `TaskStatus` 5종 그대로(컬럼 신설 없음). board는 local-only 유지 — `[DONE]` 반영은 오너 노드 로컬 갱신만 (§3.5) |
| **전달 시맨틱** | **at-most-once**(저널 없음) — claim 후 crash는 사람이 board에서 재발행. 타임아웃·자동재시도·supervision 의도적 생략 (§4.2–§4.3) |
| **테스트** | relay는 **in-process 실물**(ephemeral port), herdr는 **fixture 기반 fake 소켓 서버**(`Bun.listen({unix})`) — 오프라인 dispatch·peerSecret rejoin·fail-fast 부정 경로 포함. 실물 herdr는 수동 라이브 스모크 1회 (§5.3–§5.4) |

**Out of scope (이 버전 아님 — HERDR_DESIGN §7):** 진행 로그 스트리밍(pane.read 루프); 멀티 노드/Mac·Linux 복제; Windows 네이티브 herdr(named pipe — 구조적 회피가 존재 이유); relay 와이어·envelope 스키마 변경(별도 R{n}); board relay 동기화; 브릿지 supervision/자동 재시작; herdr 포크·벤더링(AGPL — 소켓 호출만); 카드발 argv/env 전달(영구 금지); crash 복구 저널(확장 1순위 §2.6).

**Security / trust (R23 필수 이유):**
- **원격 프롬프트 주입 신뢰 경계(판정 대상):** untrusted handoff body가 원격 노드의 에이전트 프롬프트로 주입됨. 브릿지 워커 pane은 **자율 실행 전용**(오너의 dispatch 행위 = 실행 승인)이라 0.21.1 M-2(no-auto-submit)와 **별도 신뢰 모델** — 이 구분 자체가 R23 명시 승인 대상(§2.5-4, §4.4.1). M-4의 절반(sanitize 산출물만 + `⚠ Untrusted` 마커)은 유지.
- **임의-argv 원격 실행 차단:** wire에 argv **금지** — `agentKind`만 싣고 argv 매핑은 브릿지 로컬 allowlist(슬라이스: `claude` 하나, `shell` 영구 제외). env는 브릿지 생성 `LOOM_CARD` 하나만 (§4.4.2).
- **자격증명:** relayToken(Bearer 헤더, URL 금지 H-6)·peerSecret(M-7 rejoin 열쇠) 0600 영속, `loomDir()` 경유(M-14) (§4.4.3).
- **AGPL 경계:** herdr는 무수정 바이너리 + 소켓 호출만 — 링크·벤더링 금지 (§4.4.4).

**Review impact:** 새 데몬 표면 + MCP 표면 확대 + 신뢰 경계 → **R23 필수(Fable 5)** (§5.1 기준 3중 해당). **relay 와이어 protocol v1 무변경** — handoff 옵셔널 필드 추가가 필요해지는 순간 별도 R{n}으로 분리(HERDR_DESIGN §3.1 비교표: 옵셔널 필드도 `resolveHandoff` 재구성 수정을 강제).

**Unknowns (§3.5 → `docs/UNKNOWNS.md` §0.22.0):** 장기 `events.subscribe` 구독 안정성(절단→재구독 공백); inbox 100건 trim vs 장기 오프라인 노드 유실 수용; 워커 pane 자동 제출의 별도 신뢰 모델 승인 가능성(R23 판단); herdr `done` 롤업 정확도(실제 Claude/Codex detection 미검증 — Step 0.5 잔여); WSL 절전/Windows 재부팅 시 소켓 생존.

**Binding on impl (R23 M-1…M-2 locks — 구현 필수):**
- **M-1 (High):** **dispatcher 인가** — 브릿지는 dispatch handoff의 `fromPeerId`가 브릿지 로컬 설정의 **authorized-dispatcher allowlist**(타워 peer id)에 있을 때만 실행한다. **label 매치 단독으로 실행 금지.** 비인가 dispatch는 무시+로그. 설정 부재 시 **기본 거부**. (근거: attachment label은 room 내 **모든** peer가 붙일 수 있어 "오너 dispatch = 실행 승인" 전제가 미집행 — `fromPeerId`는 서버 지정·peerSecret 없이 탈취 불가(room.ts:443, 241-251)이므로 집행 원시는 존재.)
- **M-2 (Med):** **제출 분리** — untrusted 텍스트는 오직 `agent.send` **리터럴로만** 전달. 제출은 untrusted 내용을 전혀 포함하지 않는 **고정 상수 입력(bare Enter)의 별도 호출**로 수행 — prompt를 `pane.run` 인자로 보간하는 것 **영구 금지**. 실제 제출 메커니즘은 fixture 검증 + 라이브 스모크로 확인. (근거: `agent.send`는 no-Enter 리터럴(Step 0.5 실측)인데 설계 §2.5-4 "send + 제출"의 제출 방식이 미정의 + §4.4.1 `pane.run` 금지와 자기모순이었음.)
- **L-1 (author-close):** label 매치 + zod 파싱 실패 시 조용한 무시 금지 — `failed reason=payload_invalid` 결과 회신(카드 `doing` 고착 방지).
- **L-2 (author-close):** `apply_card_result`는 claim한 handoff의 `fromPeerId`/`node`를 카드 `assignee`와 대조 — 불일치 시 경고·거부(위조 `[DONE]` 차단).
- **L-3 (author-close):** attachment 크기 사슬 보정 — relay는 초과 attachment를 truncate가 아니라 **거부**(bad_message)하므로 송신 측(타워·브릿지)이 직렬화 후 크기를 사전 검증. zero-width/bidi는 JSON.stringify가 이스케이프하지 않음(파싱 안전, 내용 무손실은 아님). 스키마 초안 `.nonneg()` → `.nonnegative()`.

**Approved by:** Fable 5 (fable-advisor) R23 — `pending-revision` → M-1/M-2 locks 본문 반영 → **author-close `approved`** (Fable 사전 승인, no R23b), 2026-07-17.

**Implemented as of 2026-07-17** — Grok impl lane. 신규: `card-contract.ts` · `herdr-client.ts` · `bridge-{config,meta,runtime,main,spawn}.ts` · `card-ops.ts` · MCP `dispatch_card`/`apply_card_result` · CLI `loom bridge start|stop|status`. **M-1** allowlist 기본 거부 · **M-2** `agent.send`+`BARE_ENTER` 분리 · L-1 payload_invalid 회신 · L-2 assignee/node 대조 · L-3 직렬화 사전 검증. 테스트: fake herdr + in-process relay (authorized dispatch, M-1 deny, offline queue+rejoin, fail-fast). VERSION **0.22.0** (CLI+MCP). `bun test` 213 pass/0 fail · 6-pkg typecheck green. **알려진 갭:** 실물 herdr 라이브 스모크는 수동 1회(§5.3) — 자동화는 fixture 전용.

#### 0.21.0 → 0.21.1 — 2026-07-11 (`approved` author-close after R22 `pending-revision` — **PTY handoff inject (원래 설계 유보 수신 경로 고도화)**)

**Product one-liner:** 수락한 handoff를 실행 중인 에이전트 **입력창에 유휴일 때만 붙여넣되(자동 제출 없이) 사람이 Enter** — 원래 v0.1.0 설계의 PTY 수신 경로를 R1이 정한 안전조건대로 고도화한다.

**Why:** 원래 설계(`docs/ORIGIN.md` §1)의 코어 수신 메커니즘은 **PTY stdin 주입**이었다. R1은 이를 **폐기가 아니라 Phase 1.5 유보**로 판정했다(`docs/spikes/PHASE-1.5-PTY.md`: default **no-go**, opt-in **deferred** — idle 감지 + 사람 수락 우선 필요). 기반코드(`handoff-inject.ts`의 `prepareInjectText`/`injectIntoStdin` — experimental 플래그 뒤, 기본경로 미호출)는 이미 있으나 고도화 미착수. 오너가 이 고도화를 **pull**(내부 도구 필수 기능, 2026-07-11) → **FREEZE 예외**. R1이 "가장 어려운 부분·결정적 리스크"로 지목한 영역이므로 **좁고 안전한 첫 슬라이스**로 착수한다.

**What (범위 — Claude-first · opt-in · accept+idle-gated):**
| 항목 | 내용 |
|------|------|
| **opt-in 플래그** | `loom run claude --inject-handoffs` — **기본경로(큐+`check_handoffs`/`inbox`)는 불변**(회귀 없음). 플래그 없으면 주입 코드 미도달. |
| **accept-gated** | auto-inject **금지**. 사람이 `inbox accept` / `claim_handoff`한 **특정** handoff만 주입 대상. |
| **idle-gated** | 에이전트가 **생성 중이 아닐 때만** 주입(R1 입력 레이스 방지). **1차 신호 = Claude Code hooks(Stop/idle), quiescence는 AND-보조만**(M-3). 감지 방식 상세는 Unknown(아래). |
| **no-auto-submit (M-2)** | trailing `\n` **금지** — bracketed-paste로 입력창에 채우고 **제출은 사람이 Enter**. 권한 프롬프트 대기 중 오판 주입이 위험 액션을 자동 승인하는 R1 최악형을 **구조적으로 차단**. |
| **주입 내용** | `prepareInjectText`로 sanitize + `⚠ Untrusted handoff content` 마커 포함(기존 함수 재사용, 단 M-2 모드에서 `\n` 강제 우회). |
| **제어 채널** | 실행 중 `loom run`(PTY 래퍼)에 "이 handoff 지금 주입" 신호를 넣는 경로. 구현 방식 Unknown. |
| **Claude Code만** | Codex/Grok(ratatui)은 idle 신호가 불명확 → **이 MINOR 범위 밖**(큐+폴링 유지). |

**Out of scope (이 버전 아님):** auto-inject(사람 수락 없이); Codex/Grok/기타 에이전트 주입; **생성 중(busy) 주입**; presence 오버레이/VT 에뮬레이터; MCP notify 경로 주입; 기본 수신 경로(큐+폴링) 변경; 와이어 프로토콜 변경.

**Security / trust (R{n} 필수 이유):** 주입은 에이전트 입력 스트림에 **untrusted peer 텍스트**를 쓰는 행위 → sanitize(`prepareInjectText`) + untrusted 마커 + **사람 수락 게이트**로 방어. opt-in 없으면 경로 비활성. R1의 결정적 리스크(입력 큐 꼬임·의도치 않은 제출)를 idle-gated로 완화하나, 완화의 신뢰성이 판정 대상.

**Review impact:** 수신 모델에 **새 경로 추가**(아키텍처 전제 변경) + R1 결정적 리스크 영역 → **R22 필수(Fable 5).** 와이어 프로토콜 **변경 없음**(주입은 클라이언트 로컬).

**Unknowns (§3.5 → `docs/UNKNOWNS.md` §0.21.0):**
- **에이전트 유휴 감지 메커니즘(판정 리스크):** Claude Code **hooks**(idle 이벤트) vs PTY 출력 **정적(quiescence) 휴리스틱**(N ms 무출력). 어느 게 신뢰 가능하며 오탐 시 어떻게 되나.
- **제어 채널:** `run-with-pty.py`(또는 Bun 래퍼)에 주입 트리거를 넣는 방식 — named pipe / unix socket / sticky RPC / 별도 fd.
- **accept→inject 구동 위치:** `loom run` 프로세스 vs sticky host 중 누가 주입을 실행하나(둘의 생명주기·소유권).
- **에이전트별 실제 동작 검증:** 주입 텍스트를 에이전트가 사용자 입력으로 처리하는가(Phase 1.5 수동 매트릭스 미완 — Claude Code부터 채운다).

**Binding on impl (R22 M-1…M-6 locks — 구현 필수):**
- **M-1 (High):** auto-inject 경로 **코드상 부재.** `injectIntoStdin` 호출부는 `--inject-handoffs` **AND** 명시 `accept`/`claim` 뒤에만 도달. flag off → 미호출 **테스트 필수**.
- **M-2 (High):** **no-auto-submit** — trailing `\n` 금지(paste-only, bracketed-paste), 제출은 사람 Enter. `prepareInjectText`의 `\n` 강제를 이 모드에서 우회. (권한 프롬프트 자동 승인 차단 — 이 lock 없이는 approve 불가.)
- **M-3 (High):** **fail-safe = no-inject.** hook 부재·불확실·busy면 취소 + 큐 유지(손실 없음). **buffer-and-apply-later 금지**(Phase 1.5 `busy_sleep_then_read` 실패 모드). accept당 **at-most-once**.
- **M-4 (High):** 주입 페이로드는 **`prepareInjectText` 산출물만**(sanitize + untrusted 마커). 임의 텍스트 주입 불가.
- **M-5 (Med):** 제어 채널은 **로컬 same-UID 전용**(0600 socket/pipe). **relay 발 트리거 금지.**
- **M-6 (Med):** 기본 큐+폴링 경로 + flag 없는 `loom run` **회귀 테스트 불변.**

**Approved by:** Fable 5 (fable-advisor) R22 — `pending-revision` → PATCH 0.21.1에 M-1…M-6 lock → **author-close `approved`** (Fable 사전 승인, no R22b).

**Implemented as of `d05d714`** (2026-07-12) — via codex-impl lane (GPT-5.5), 아키텍트 독립 검증. 신규: `inject-control.ts`(로컬 0600 소켓 제어채널)·`inject-handoffs.ts`(flag+Stop-hook). `handoff-inject.ts` paste 함수군, `run-with-pty.py` env-gated 주입(마커 ≤30s + quiescence ≥300ms + bracketed-paste no-newline). **M-1..M-6 전부 TS·python 양 레이어 코드 확인.** `bun test` 190 pass/0 fail, 6-pkg typecheck, biome(touched) clean, VERSION 0.21.1(CLI+MCP). **알려진 갭:** python 주입 경로는 코드리뷰만(런타임 미실행) — flag 활성화 전 라이브 스모크 권장(`implementation-notes.md`).

**FREEZE 관계:** 오너 pull에 의한 **명시적 예외**(2026-07-11) — 이 게이트 **하나만**. 나머지 백로그(work-watch·MCP·C1/C2)는 **동결 유지** — 팀 실사용 pull 전엔 열지 않음.

#### 0.20.0 — 2026-07-11 (`approved` R21 — **Tier A3: `loom doctor` 자가진단** · 구현 다음 세션)

**Product one-liner:** 낯선 사람이 막혔을 때 `loom doctor` 한 번으로 **어디가 문제인지** 스스로 안다.

**Why:** Tier A3(`docs/DOGFOOD_FEATURES.md` · `PRIORITIES.md §3 #4`). A1(설치)·invite(join)로 경로는 열렸지만, 첫-5분에 막히면(잘못된 profile, host 미기동, relay 미도달, loopback blob) **낯선 사람은 원인을 모른 채 이탈**한다(A2 마찰). 읽기전용 진단 한 명령이 "지금 상태 + 다음 한 걸음"을 알려주면 마찰이 준다. Docker 하네스가 이미 드러낸 실패 모드(PATH 미활성, unzip 부재, loopback relay)를 진단 항목으로 흡수.

**What (범위 — read-only, 상태 변경 없음):** `loom doctor`가 섹션별 `ok`/`warn`/`fail` + 다음 조치 힌트를 출력:
| 검사 | 내용 | 근거 표면 |
|------|------|-----------|
| **Install/env** | `loom` on PATH? (아니면 `scripts/install.sh` 안내) · `bun` 존재 · VERSION | `Bun.which`(loomCmd), `VERSION` |
| **Home/profile** | `~/.loom` 존재·쓰기가능 · active profile | `loomDir`, `getActiveProfile`, `resolveStateHomeDir` |
| **Session** | 방 참여 상태 · `inviteCode`/`relayUrl` 유무 | `loadSession` |
| **Relay** | `relayUrl` 파싱 · `/health` 도달성 · **loopback 경고(M-2: blob 타 머신 불가)** · non-loopback인데 token 없음 경고 | `parseRelayUrl`, `isLoopbackHost`, health GET |
| **Host** | sticky host online/offline · pid alive · relay connected | `resolveLiveHostMeta`, `describeHostMeta`, `stickyRpc({op:"status"})` |

**Out of scope (이 버전 아님):** 상태 **변경/자동수정**(진단만 — `--fix` 없음). 네트워크 프로브는 자기 relay `/health` GET만(스캔·외부 호출 금지). 새 의존성. MCP 표면 확대.

**Security / trust:** read-only. token/peerSecret 값 **출력 금지**(존재 여부만 `present`/`missing`). health GET은 세션의 relayUrl로만.

**Review impact:** 와이어/프로토콜 변경 없음. 새 CLI 서브커맨드(표면) → **R21 필수**.

**Unknowns (§3.5, MINOR 권장 → `docs/UNKNOWNS.md`):**
- exit code 계약 — 항상 0인가, `fail` 시 non-zero인가(스크립트/CI 사용), `--strict` 여부.
- `/health` 프로브 타임아웃·오프라인 relay에서 매달림 방지.
- 세션 없음(설치 직후)일 때 출력이 도움이 되는가(막 설치한 낯선 사람의 첫 실행 케이스).
- `loom doctor`가 auto-host를 절대 안 띄우는지(LOOM_NO_AUTO_HOST 무관 read-only 보장).

**Binding on impl (R21 M-1…M-4 locks):**
- **M-1:** relay 검사는 **`ensureRelay` 절대 호출 금지**(죽은 local relay를 spawn+pid write, `relay-daemon.ts:91-105`). `parseRelayUrl` + 직접 `fetch(origin+"/health", { signal: AbortSignal.timeout(3000) })`만.
- **M-2:** host 검사는 **`resolveAliveHostMeta` 금지**(stale meta를 `clearStickyMeta`로 삭제, `sticky-client.ts:25-27`). `loadStickyMeta`+`isPidAlive`로 stale을 **보고만**.
- **M-3:** exit code — `fail`≥1 → exit 1, `warn`만 → exit 0. `--strict`(warn도 non-zero)는 범위 밖.
- **M-4:** no-session(설치 직후)은 `fail` 아님 — Session/Relay/Host는 `info: no session — next: loom room join <blob>`.

**Approved by:** Fable 5 (fable-advisor) R21 `approved`, 2026-07-11 — binding M-1…M-4; L-1..L-3 author-close.

**Implemented as of `c15de88`** (2026-07-11) — via codex-impl lane (GPT-5.5), architect-verified. All M-1…M-4 met (M-1 direct /health+3s no ensureRelay · M-2 loadStickyMeta+isPidAlive report-only no resolveAliveHostMeta · M-3 exit 1 iff fail · M-4 no-session=info, live-confirmed exit 0). L-1..L-3 author-closed (`implementation-notes.md`). Read-only deviation documented (hand-rolled home/session resolution to avoid `resolveStateHomeDir` migration side-effect). `bun test` 180 pass/0 fail (5 new), 6 pkg typecheck green, biome clean, live `loom doctor` run verified. VERSION 0.20.0 (CLI + MCP).

#### 0.19.0 — 2026-07-11 (`approved` R20 — **Tier A1: 5분 설치 경로 (install script)**)

**Product one-liner:** 낯선 사람이 **한 줄**로 설치하고 5분 안에 방에 참여한다 — `curl -fsSL … | bash` → `loom room join <blob>`.

**Why:** 전략 최우선(Tier A1, `docs/DOGFOOD_FEATURES.md` · `LOOM_PURPOSE_REVIEW` #1)은 "다른 머신의 실제 사람 ≥2명 태우기". 0.18.0이 join의 3-비밀 문제를 blob으로 해소했으나, **설치(get-`loom`-runnable) 반쪽**이 여전히 막혀 있다. 현 README 경로는 수동 실패점 4개(Bun 유무·clone·`link`·PATH export)이고 `scripts/link-loom.sh`는 PATH 안내만 **출력하고 종료** → 낯선 사람은 거기서 멈춘다(첫-5분 마찰). Fable 5 방향 자문(2026-07-11): **Option 1 설치 스크립트** 커밋(②는 스크립트 내부 fallback 텍스트, ③ 바이너리는 spawn 리팩터 선행+비목표라 유보). repo는 PUBLIC 확인(익명 클론 가능) — Option 1 성립 전제 충족.

**What (범위):**
| 항목 | 내용 |
|------|------|
| **`scripts/install.sh`** | `curl \| bash` 가능. (a) Bun 없으면 설치, (b) 고정 디렉토리로 clone/update, (c) `bun install`, (d) `bun link`(packages/cli), (e) **절대경로 `$HOME/.bun/bin/loom --version`로 검증**, (f) 사용자 shell rc에 PATH 라인 **멱등 append**, (g) 마지막에 `exec $SHELL` 후 `loom room join <blob>` 명시 |
| **README 원라이너** | Quick start 최상단에 `curl -fsSL <raw-url> \| bash` 한 줄. 기존 A/B/C 표는 fallback으로 하단 유지(=Option 2 텍스트) |
| **명령 접두 스윕** | share/next-step 문자열의 `bun run loom`을 설치 감지 시 `loom`으로 해석하는 단일 helper(`loomCmd`)로 통일. 설치 안 됐으면 `bun run loom` 유지(회귀 없음) — cli `index.ts` share 라인(478/479)·next 라인(492/601) 등 |

**Security / trust (R{n} 필수 이유):**
- **`curl \| bash` 신뢰 경계** — 스크립트는 사용자 홈 디렉토리·shell rc만 건드림(sudo 없음), PATH append는 멱등(중복 금지), clone는 고정 URL(`lemonbalms/Loom`). 원격 스크립트 실행은 명시적 raw URL로만 안내(핀 대상=브랜치 vs 태그는 Unknown).
- **낯선 머신 first-run** = 새 제품 표면. Bun 설치 경로(공식 `bun.sh` installer 위임)의 신뢰 체인 명시.

**Review impact:** 프로토콜 **와이어 변경 없음**, 제품 런타임 로직 변경 없음(설치/문서/문자열 표면만). 새 표면 + `curl\|bash` 신뢰 경계 → **R20 필수**.

**Out of scope (이 버전 아님):**
- Prebuilt binary / `bun compile`(유보 — spawn `import.meta.url` 리팩터 선행). npm/npx·Homebrew·서명 설치본·Windows 서비스(비목표 유지). VPS relay 배포(병렬 **ops** 트랙 — A1과 무결합; 단 2머신 수용 테스트는 양쪽 필요). 기본 share 라인 토큰 자동 삽입(0.18.0 불변).

**Unknowns (§3.5, MINOR 권장 → `docs/UNKNOWNS.md`):**
- **PATH 활성화(판정 리스크):** `curl\|bash`는 호출자 셸을 못 바꿈 → "done인데 command not found". 완화=절대경로 검증 + rc append + `exec $SHELL` 안내. 검증 방법 충분한가?
- shell rc 감지 — bash/zsh/fish 중 어디에 append할지(멱등·다중 셸).
- 고정 clone 디렉토리 선택 + 기존 디렉토리/repo 충돌 시 update vs 거부.
- 재실행 멱등성(두 번 돌려도 안전).
- `curl\|bash` 핀 — main 브랜치 vs 태그(공급망 신뢰).

**Binding on impl (R20 M-1…M-4 locks):**
- **M-1:** bin dir는 `bun pm bin -g`(또는 `${BUN_INSTALL:-$HOME/.bun}/bin`)로 해석 — verify(`loom --version`)·rc append 양쪽 동일 값. `$HOME/.bun/bin` 하드코딩 금지.
- **M-2:** `exec $SHELL`를 마지막 실행 단계로 두지 말 것(`curl\|bash`는 stdin=파이프 → 즉시 EOF 종료). 안내로 출력하거나 tty 체크 후 `</dev/tty`로만 exec.
- **M-3:** `loomCmd` 스윕은 문자열별 열거형 — self-ref fallback 노트(`index.ts:495,604`)와 **실행되는** spawnSync(`index.ts:2350`)는 제외(리터럴/절대경로 유지).
- **M-4:** Bun을 script 내에서 설치하면 직후 해석된 bin dir를 `export PATH`(또는 절대경로 bun) — 이후 `bun install`/`bun link` 성공 보장.

**Approved by:** Fable 5 (fable-advisor) R20 `approved`, 2026-07-11 — binding M-1…M-4; L-1..L-4 author-close.

#### 0.18.0 — 2026-07-11 (`approved` R19 — **Self-contained invite (portable join blob)**)

**Product one-liner:** 낯선 사람을 다른 머신에서 **한 명령으로** 방에 넣는다 — `loom room join <blob>`.

**Why:** 전략 최우선(Tier A1, `docs/DOGFOOD_FEATURES.md` · `LOOM_PURPOSE_REVIEW`)은 "다른 머신의 실제 사람 ≥2명 태우기". 지금 원격 온보딩은 **비밀 3개 수동 전달**(invite `LOOM-XXXX` + `--relay ws://…` + `--token …`, cli `index.ts:160,180`)이 필요해 5분 안에 불가. 초대 하나에 relay 도달정보를 담으면 join이 단일 명령이 된다. (Fable 자문 R-consult: binary는 spawn 경로가 `.ts` 소스를 파일시스템에서 찾아 `bun compile`에서 깨지므로 **유보**; repo-clone(~3분)은 첫 사용자에 수용 가능. 진짜 병목은 3-비밀.)

**What (범위):**
| 항목 | 내용 |
|------|------|
| **Portable invite blob** | `{ relayUrl, token, inviteCode }`(현 `index.ts:473`이 이미 shell 문자열로 조립하는 3종)을 단일 문자열로 인코딩 — `loom://join/<base64url>` 또는 base64url blob |
| **`loom room invite --link`** | **opt-in** 명령: 현재 세션의 portable blob 출력. 기본 share 라인은 **token-less 유지**(UC-10.5 불변) — blob은 명시적 opt-in에서만 |
| **`room join <blob>`** | bare `LOOM-XXXX`(기존) **또는** blob 수용. blob이면 relayUrl+token+code 파싱해 `--relay`/`--token` 수동 없이 join |

**Security / trust (R{n} 필수 이유):**
- blob이 relay **token**을 운반 → 토큰 경로 변경. **H-5 불변**(non-loopback bind은 여전히 token 요구), 기본 share는 token-less 유지, blob은 bearer capability로 **명시적 opt-in**만. `LOOM-XXXX`도 이미 bearer secret(Fable 자문: H-5 안 깨짐).
- 새 제품 표면(`room invite --link`, invite 포맷).

**Review impact:** 프로토콜 **와이어 변경 없음**(join envelope 불변, blob은 CLI측 인코딩). 새 표면 + 토큰 경로 → **R19 필수**.

**Out of scope (이 버전 아님):**
- Prebuilt binary / `bun compile` (유보 — spawn이 `.ts` 경로 참조, 리팩터 선행). VPS relay 배포(ops). npm/npx publish. per-user 토큰 rotation·계정(멀티테넌트 유보 유지). 기본 share 라인에 토큰 자동 삽입(금지 — blob opt-in만).

**Unknowns (§3.5, MINOR 권장):**
- blob 포맷 `loom://` URL vs bare base64url — 파싱·복붙 견고성.
- 터미널/히스토리에 token 노출(blob) — 신뢰 코호트엔 수용, bearer secret임을 안내로 명시할지.
- relayUrl 정규화(ws:// vs wss://, 호스트 도달성) 검증 범위.

**Approved by:** Fable 5 (fable-advisor) R19 `approved`, 2026-07-11 — binding: M-1 (`loom://join/` prefix + parse order), M-2 (loopback guard); L-1/L-2 author-close.

#### 0.17.1 — 2026-07-10 (`approved` — **author-close**, R18 M-27/M-28 + L-33/L-34/L-35 locks)

**Why:** R18 `pending-revision` — `down`의 kill-safety가 프로세스 신원을 실제로 검증하지 않음(M-27) + multi-profile `up`이 전역 `sessionPath()`를 매 호출 재평가해 동시 처리 시 세션 혼선 가능(M-28). PLAN 텍스트 lock rows only; 새 아키텍처·표면·프로토콜 변경 없음. **No R18b.**

| Finding | Lock |
|---------|------|
| **M-27** | `down`/`host stop`이 쓰는 `stopStickyHostProcess`의 raw `SIGTERM` 폴백 전 **독립적 프로세스 신원 확인**을 통과해야 한다: 대상 pid의 cmdline에 `sticky-main.ts`가 포함되는지(`ps -p <pid> -o command=`) 확인(또는 시작 시각이 `meta.startedAt`과 근사). 확인 실패 시 **SIGTERM을 보내지 않고** meta만 정리한 뒤 경고를 출력한다. `pid alive` + `sessionPath` 문자열 일치만으로는 신원을 증명하지 못한다(reboot 후 pid 재사용). |
| **M-28** | multi-profile `up`/`down`은 profile을 **순차 처리(no `Promise.all`)** 하며, 각 profile 처리 직전 `setActiveProfile(profile, { explicit: true })`로 전역 세션을 고정한 뒤 `startStickyHostProcess`/`stopStickyHostProcess`를 **완전히 await** 한다. 동시 처리로 인한 `LOOM_SESSION` 혼입을 구조적으로 배제한다. |
| **L-33** | 테스트 하네스(`bun test` 실행 환경)는 `LOOM_NO_AUTO_HOST=1`을 기본 적용하여 auto-host가 CI/비대화형에서 sticky host를 조용히 스폰하지 않게 한다. Acceptance에 "bun test는 sticky host를 스폰하지 않는다"를 추가한다. |
| **L-34** | join의 auto-host는 기존 `stopStickyBeforeSessionChange()`(구세션 host 정지) 위에 겹쳐 정지→재시작 이중 동작이 되며 `startStickyHostProcess` 폴링이 최대 8초 걸릴 수 있다 — USER_GUIDE/DOGFOOD_LOOP에 명시하고, auto-host 성공 시 `host auto-started (pid N); disable with --no-host` 안내를 출력한다. |
| **L-35** | Acceptance에 ①idempotent double-`up`(meta 미손상) ②`LOOM_NO_AUTO_HOST=1` 시 join이 host 미시작 ③`down` 신원 확인 가드 단위테스트 존재를 추가한다. |

**Approved by:** plan author after R18 Decision notes (author-close per WORKFLOW §5.1; **no R18b**). **Implement next** under 0.17.1.

#### 0.17.0 — 2026-07-10 (`superseded` by 0.17.1; was `pending-revision` — **Launcher UX: up + host-default + work-first**)

**Why:** Work bus (0.16) delivers via handoff, but **operator UX still forces multi-terminal host/run mental model**. Owner feedback: “online 유지에 창이 왜 필요?” / “왜 터미널마다 구동?”. Sticky host is already a **background process** (`unref`), but **entry surface** still looks like per-role terminal ops. Goal: **background online by default; send work with board/handoff; open `run` only when working.**

**Product one-liner:**  
*`loom up` / `dogfood:up` brings room peers online in the background; join auto-starts sticky; users live on work bus; TUI `run` is opt-in for actual agent work.*

**Review impact:** MINOR — default behavior change on join, new multi-profile launcher, optional background watch. **No wire protocol change.** **R18 required.**

##### User journey (target — lock for docs/acceptance)

```text
아침 1회:  bun run dogfood:up     # 또는 loom up --profiles impl,claude-rev,codex-rev
           → 창 닫아도 peers online

낮 송신:   loom board add "…" --as claude-review
           loom handoff @claude-review "[R-REQUEST] …"
           → 끝 (host 수동 start 없음)

수신 인지: (옵션) dogfood:up 이 work-watch 데몬도 띄움
           또는 나중에 loom work

처리 시:   loom --profile claude-rev run claude   # TUI 창 1개만
           boot → check_handoffs → claim

결과:      loom work / inbox
```

##### In (scope) — four pillars

**1) `loom up` / `dogfood:up` (background multi-host)**

| What | Why |
|------|-----|
| `bun run dogfood:up` | Prefer enhance existing `scripts/dogfood-room-up.sh` (or sibling): ensure room + **start sticky host for each dogfood profile** (impl, claude-rev, codex-rev) if session exists |
| `loom up [--profiles a,b]` | Product CLI: for each profile with a session file, `startStickyHostProcess` in background; print summary table (profile, peer, host pid, online) |
| `loom down [--profiles …]` | Stop sticky hosts for those profiles (idempotent) |
| `loom up --status` / reuse dogfood:status | Show hosts alive + peers |
| No TUI spawned by up | **run is separate** (pillar 4) |
| Idempotent | Already-running host → “already running”, not error |

**2) Host default on join (hide host start for normal path)**

| What | Why |
|------|-----|
| After successful `room create` / `room join` | **Auto `host start`** for that profile (default **on**) |
| Escape hatch | `--no-host` on create/join **or** `LOOM_NO_AUTO_HOST=1` |
| Docs | USER_GUIDE: host is default; `host start/stop` advanced/power-user |
| CLI help | Deprioritize host in “daily path”; keep commands for stop/debug |
| Do **not** remove `host start/stop/status` | Power users + recovery |

**3) Work bus front-and-center (docs + thin CLI polish)**

| What | Why |
|------|-----|
| Docs rewrite daily path | Send = board/handoff; receive = work / run; not “6 terminals” |
| `loom work` already 0.16 | Ensure up/status mention work |
| Optional: `dogfood:up --watch` | Start `work watch` as background for listed profiles (log file under loomDir) — **opt-in flag** to avoid surprise CPU |
| Default up **without** watch | Watch is optional (L-31 CPU concern) |

**4) `run` only when working**

| What | Why |
|------|-----|
| Docs + dogfood loop | Explicit: online ≠ agent TUI; open run only to process |
| No auto-run on up | Never spawn claude/codex from up (cost, secrets, TUI) |
| Boot prompt path unchanged | `scripts/dogfood-reviewer-boot.txt` still first message on run |

##### Out (non-goals)

| Out | Why |
|-----|-----|
| CRDT / live multi-writer board | P3; orthogonal |
| Single process multi-peer in one OS process | Larger redesign; up multi-process is enough |
| Auto-claim | Untrusted; stays out |
| PTY inject | no-go |
| Auto `run` agents on up | User must opt into TUI/cost |
| Killing unrelated user processes | down only stops **our** sticky meta pids |
| Windows service installer | macOS/Linux dogfood first; launchd plist optional later not required in 0.17 |

##### Security / failure locks (authoritative — **0.17.1**)

| Case | Required behavior |
|------|-------------------|
| up only starts host for **profiles with existing session** | No invent peer / no join without invite |
| **M-27** `down` kill-safety | `pid alive` + `sessionPath` 문자열 일치만으로는 신원 증명 불가. raw `SIGTERM` 폴백 전 **독립 신원 확인**(cmdline에 `sticky-main.ts` 포함, `ps -p <pid> -o command=`; 또는 start-time ≈ `meta.startedAt`)을 통과해야 한다. 확인 실패 시 **SIGTERM 안 보냄** — meta만 정리 + 경고. |
| **M-28** Profile isolation | multi-profile `up`/`down`은 **순차 처리(no `Promise.all`)**; 각 profile 직전 `setActiveProfile(profile,{explicit:true})`로 전역 세션 고정 후 spawn/stop을 완전히 await. 절대 `LOOM_SESSION`을 profile 간에 섞지 않는다. |
| **L-34** Auto-host on join | Fail soft: host start 실패해도 join 성공(경고 + `host status` tip). 기존 `stopStickyBeforeSessionChange()`(구세션 정지) 위에 정지→재시작 이중 동작이며 폴링 최대 8초 소요 가능 — docs에 명시. 성공 시 `host auto-started (pid N); disable with --no-host` 출력. |
| **L-33** CI/test hygiene | 테스트 하네스는 `LOOM_NO_AUTO_HOST=1` 기본 — `bun test`가 sticky host를 스폰하지 않는다. |
| Logs | sticky remains stdout/stderr ignore (or optional log file path under loomDir, 0600) — no secrets in logs |
| Concurrent up | Idempotent; second up does not corrupt meta (already-running → "already running") |
| watch daemon (if --watch) | Same clamp as L-31; log path not world-writable |

##### Acceptance (0.17.1 — implement)

1. Fresh dogfood: `dogfood:up` (or room + up) → profiles host running; `peers` shows online without any `host start` typed manually.  
2. Terminal closed after up → `host status` still running (daemon).  
3. `room join` without `--no-host` → sticky auto-started for that profile.  
4. `room join --no-host` **or** `LOOM_NO_AUTO_HOST=1` → no sticky (L-33/L-35).  
5. `loom down` stops hosts; peers go offline (after presence update).  
6. Docs daily path matches journey above; no “6 terminals required” as default (L-34: join 정지→재시작 + 최대 8초 명시).  
7. **Idempotent double-`up`** does not corrupt meta (second run → "already running") (L-35).  
8. **`down` identity guard** unit test: pid alive but cmdline ≠ `sticky-main.ts` → meta cleared, **no SIGTERM** (M-27/L-35).  
9. **`bun test` does not spawn a sticky host** (harness sets `LOOM_NO_AUTO_HOST=1`) (L-33).  
10. `bun test` green; VERSION **0.17.1** on implement.

##### Implementation sketch (not approved work)

| Area | Touch |
|------|--------|
| `scripts/dogfood-room-up.sh` or `dogfood-up.sh` | multi host start after room ready |
| `packages/cli` `up` / `down` commands | loop profiles |
| `cmdRoomCreate` / `cmdRoomJoin` | auto host unless --no-host |
| package.json `dogfood:up` | alias |
| docs USER_GUIDE, DOGFOOD_LOOP, HANDOFF | journey rewrite |
| tests | unit: auto-host flag parsing; script dry-run if feasible |

**Unknowns:** `docs/UNKNOWNS.md` §0.17.0.

**R18 done → `pending-revision`** (`docs/plan_review.md` R18: M-27/M-28). **PATCH 0.17.1 applied** (M-27/M-28/L-33/L-34/L-35 locks above) → **author-close `approved`**. Implement Launcher UX under **0.17.1**.

#### 0.16.1 — 2026-07-10 (`superseded` by 0.17.0; was `approved` — **author-close**, R17 M-26/L-31/L-32 + work bus)

**Why:** R17 `pending-revision` — template line injection (M-26) + watch interval + MCP notify default.

| Finding | Lock |
|---------|------|
| **M-26** | Before substituting into handoff template, **flatten single-line fields** (title): replace `\r` `\n` `\t` with space. Parsers trust header only until first blank line. Board-stored title may keep newlines for display. |
| **L-31** | `loom work watch --interval`: **clamp ≥ 250ms** (warn if raised); default **2000ms** |
| **L-32** | MCP `add_task`/`update_task` **`notify` default false** (opt-in). CLI: assignee set ⇒ notify default on (CLI-only policy). |

**Approved by:** plan author after R17 Decision notes. **Implement next.**

#### 0.16.0 — 2026-07-10 (`superseded` by 0.16.1; was `pending-revision` — **Work bus**)

**Why:** Owner goal: **작업 내역을 실시간으로 전달하고, 받아서 바로 처리**. Purpose (0.15) + durable handoff (0.14) exist, but **board cards do not push work** and there is **no first-class “my work” CLI feed**. Dogfood still requires humans to remember `handoff` text; assignees do not learn about board tasks unless someone handoffs manually.

**Product one-liner:**  
*Board (and explicit work CLI) creates/assigns work → **handoff is the delivery bus** → assignee inbox notifies when online → `loom work` / receive path surfaces items for immediate claim/process. Not multi-writer CRDT board.*

**Review impact:** MINOR — behavior change on board mutations (optional/default notify), new CLI commands, possibly sticky poll. **Wire protocol v1 unchanged** (reuse handoff envelopes). **R17 required.**

##### Architecture lock (SSOT)

| Concern | SSOT |
|---------|------|
| **Delivery / queue / notify / durable** | **Handoff + inbox** (existing) |
| **Status tracking** | Board task (`handoffId` link when notify used) |
| **Purpose alignment** | Purpose card + body tags `[GOAL]` / `[R-REQUEST]` / … (0.15) |
| **Live multi-writer board** | **Out** — P3 CRDT later |

```text
board add/assign --notify (or policy default)
    → opsHandoff @assignee  body with tags + task:<id>
    → enqueue (+ notify if online)
    → assignee: sticky/run banner + loom work [watch] + check_handoffs → claim → process
    → [DONE]/board set done
```

##### In (scope) — S1 + S2

**S1 — Board → handoff bridge**

| What | Why |
|------|-----|
| `loom board add "title" --as @peer` **with notify** | Card UX creates real work delivery |
| Flag: `--notify` **or** default when `--as` present | Review: lock **default = notify when assignee set**; bare `board add` without `--as` = no handoff |
| `loom board assign <taskId> @peer --notify` | Re-assign pushes new handoff (or only if status still todo/doing) |
| Handoff body template (fixed shape) | Machine + human parse |
| Set `task.handoffId` from ack when notify succeeds | Board ↔ inbox link |
| MCP `add_task` / `update_task` optional `notify: true` | Agents can create work the same way |
| Fail closed if handoff `peer_unknown` | Do not pretend card was delivered; print error; task may still exist locally |

**Body template (plan lock):**

```text
[GOAL]
task:<taskId>
title: <sanitized title>
assignee: @name or peerId

<optional notes>

(Untrusted handoff — review before acting.)
```

For review-shaped work, caller may use `[R-REQUEST]` instead of `[GOAL]` via `--tag R-REQUEST` (optional; default `[GOAL]` for board notify).

**S2 — CLI work feed**

| What | Why |
|------|-----|
| `loom work` | List **my** open work: (1) inbox pending, (2) board tasks where assignee matches me and status ∈ todo\|doing\|blocked |
| `loom work watch` | Poll interval default **2s** (flag `--interval ms`); print new inbox ids / task changes to stderr; exit on Ctrl+C |
| `loom run *` start banner | Extend 0.15 banner: pending inbox **and** count of my open board tasks |
| Hint text | “Prefer loom work / check_handoffs; board --notify delivers via handoff” |
| Docs | USER_GUIDE “Work bus”; DOGFOOD_LOOP one-liner |

**Watch implementation (plan lock):**  
v1 = **client poll** of `list_inbox` + local `loadTaskBoard` (and sticky RPC when host up). **No new relay envelope** for board.changed in 0.16.0.

##### Out (non-goals)

| Out | Why |
|-----|-----|
| CRDT / multi-machine live board merge | P3; not required for deliver-and-process |
| Auto-claim without agent/human | Untrusted body; remains out (0.15) |
| PTY inject into agent stdin | Phase 1.5 no-go |
| sticky `board.changed` fanout / new wire types | Can be 0.16.x follow-up if poll insufficient |
| Desktop-only work UI | CLI first |
| Changing durable inbox / claim first-wins | Orthogonal |
| Default notify on **every** board set (status spam) | Only add/assign notify; status changes do not auto-handoff unless explicit later flag |

##### Security / failure locks (authoritative — **0.16.1**)

| Case | Required behavior |
|------|-------------------|
| Notify body | Full sanitize; untrusted banner on receive unchanged |
| **M-26** template fields | **Single-line flatten** for title (and any other header field): `\r` `\n` `\t` → space **at template insertion only**. Header block ends at first blank line. |
| Assignee resolution | Same as handoff (`@name` / peer id / unknown → error, no silent drop to `*`) |
| Spam | One handoff per add/assign notify; no loop on board set done |
| Local board residual | Same-UID multi-profile share board file — accepted (like today) |
| **L-31** watch interval | Default **2000ms**; CLI `--interval` **clamped ≥ 250ms** (stderr warn if clamped) |
| **L-32** MCP notify | **`notify` default false**; must pass `notify: true` explicitly. CLI assignee-implies-notify is CLI-only |
| MCP notify | If `notify: true` and no session/room → error |
| Partial failure | Task created but handoff fails → non-zero CLI + message; do not set handoffId |

##### Acceptance (implement under 0.16.1)

1. `board add "T" --as @bob` (bob on roster) → bob inbox has `[GOAL]` body with `task:task_…`; task.handoffId set.  
2. Without `--as`, `board add` does **not** handoff.  
3. Unknown assignee → handoff not silent-success; error visible.  
4. Title with embedded newlines does **not** inject extra `task:`/`assignee:` header lines in body.  
5. `loom work` as bob shows that task and/or inbox row.  
6. `loom work watch --interval 100` effectively ≥250ms.  
7. MCP add_task without notify does not handoff.  
8. `bun test` green; no protocol version bump.

##### Implementation sketch (approved under 0.16.1)

| Area | Touch |
|------|--------|
| `packages/host` `work-bus.ts` + task-board | template flatten, notifyTask |
| `packages/cli` board flags, `cmdWork`, run banner | |
| `packages/mcp-server` add_task notify opt-in | |
| `packages/adapters` hints | |
| tests | M-26 flatten; work list; interval clamp |
| docs | USER_GUIDE Work bus |
| VERSION | **0.16.1** on ship |

**Unknowns:** `docs/UNKNOWNS.md` §0.16.0.

**Implement under PLAN 0.16.1 `approved`.**

#### 0.15.1 — 2026-07-10 (`superseded` by 0.16.0; was `approved` — **author-close**, R16 M-24/M-25 locks + purpose implement)

**Why:** R16 `pending-revision` — verify[] exec trust boundary. PLAN-text locks only; no architecture change. **No R16b.**

| Finding | Lock (now in Failure/security locks) |
|---------|--------------------------------------|
| **M-24** | MCP `set_purpose` **must reject** create/modify of `verify[]` with **explicit error** (no silent drop). `verify[]` writable **only** via CLI `loom purpose set` (agent harness exec-permission stays on the only path that plants recipes). Remove “owner-controlled” wording for verify. |
| **M-25** | `loom verify` **prints full command list verbatim** before run. If `verify[]` hash ≠ last-acknowledged hash under `loomDir()`, require **TTY confirm** or explicit **`--yes`** (still echoes). Never silently run unacknowledged recipe. |

Also: L-30 last-writer-wins residual accepted (like board); `updatedByPeerId` OK.

**Approved by:** plan author after R16 Decision notes (author-close). **Implement next.**

#### 0.15.0 — 2026-07-10 (`superseded` by 0.15.1; was `pending-revision` — **Purpose-based sprint 1**)

**Why:** Loom exists for **purpose-based multiplayer development** (agents + humans aligned on a stated goal). P0–P2 shipped connect/handoff/durable queue, but work is still **task-shaped** (raw handoff text + board todos) without a **room-scoped purpose**, **intent contracts**, or a **receive path that starts execution**. Dogfood showed: handoff arrives, Claude/Codex UI stays empty until a human pastes or the agent happens to `check_handoffs`.

**Product one-liner (this MINOR):**  
*Anchor a Purpose on the room; stamp handoffs with intent; force receive-side claim loop; optional local verify recipe.*

**Review impact:** MINOR — new local data surface + agent receive contract + CLI. **R16 required.** Wire protocol v1 **unchanged** (purpose is local file + optional handoff attachment text; no new envelope types required in v1).

##### In (scope) — sprint 1

| What | Why |
|------|-----|
| **Purpose card** room-scoped local file | Single “why / DoD / out-of-scope” anchor for the room |
| CLI `loom purpose show \| set \| clear` | Human/agent can read/write purpose without editing JSON by hand |
| Schema v1 (below) | Stable fields for tools + docs |
| Optional attach on handoff: `--with-purpose` | Receivers see purpose without separate fetch |
| MCP `get_purpose` / `set_purpose` (**M-24:** set cannot write `verify[]`) | Agents pull purpose; cannot plant recipes via MCP |
| **Handoff intent tags** (convention + light parse) | `[GOAL]` `[R-REQUEST]` `[R-RESULT]` `[VERIFY]` `[DONE]` prefixes documented + helper to detect |
| Optional structured fields on handoff body header lines | `intent:` `goalId:` `round:` as first-line metadata (still body text — no wire change) |
| **Receive path (run start)** | On `loom run *`: after join, print pending inbox count + **force system/agent hint**: “NOW call check_handoffs; claim [R-REQUEST]/[GOAL]” |
| Strengthen `loomSystemHint` | Same contract for MCP-configured agents |
| Dogfood templates | `docs/DOGFOOD_LOOP.md` + `scripts/dogfood-reviewer-boot.txt` first-message paste |
| Board helper (optional thin) | `loom board add` from purpose next-gate line **or** document manual; prefer **auto-suggest print** not silent board mutation |
| **`loom verify` (lite)** | Run purpose.`verify[]` commands (default cwd repo); print pass/fail; optional handoff body template `[VERIFY]` |
| Docs | USER_GUIDE purpose section; PROTOCOL note “local only”; ARCHITECTURE purpose flow |
| Tests | purpose file round-trip; sanitize; path under loomDir; tag detect helper; verify dry-run empty recipe |
| VERSION bump on implement | CLI/MCP match PLAN after approve |

##### Purpose schema v1 (plan lock)

```ts
// ~/.loom/purposes/<sha256(roomId)[0:16]>.json  mode 0600
type PurposeV1 = {
  v: 1;
  roomId: string;
  roomName?: string;
  /** One-line north star */
  purpose: string;       // max ~500 chars sanitized
  /** Falsifiable success checks (human-readable) */
  successCriteria: string[];  // max 12 × ~300 chars
  /** Explicit non-goals */
  outOfScope: string[];       // max 12
  /** Shell recipes relative to process cwd when loom verify runs */
  verify: string[];           // max 8 × ~200 chars; e.g. "bun test"
  /** Free notes */
  notes?: string;
  updatedAt: string; // ISO
  updatedByPeerId?: string;
};
```

Atomic write pattern = host `atomic-json` (same as board/pack). Scope = **roomId** (shared across profiles same UID — intentional, like board).

##### Handoff contract (plan lock — body convention, not new wire types)

| Prefix | Intent | Expected receiver action |
|--------|--------|---------------------------|
| `[GOAL]` | Align / set work against purpose | Read purpose; optionally `purpose set` only if owner role |
| `[R-REQUEST]` | Plan/code review request | Reviewer: `fable-advisor` subagent if Claude; write plan_review; no product implement |
| `[R-RESULT]` | Review outcome | Implementer: apply Open blocking only or ship |
| `[VERIFY]` | Evidence of DoD | Record pass/fail; do not invent green |
| `[DONE]` | Claim work complete | Point to evidence (sha, tests) |

Detection helper in `@loom/protocol` or host: `parseHandoffContract(body) → { tags, intent? }` — best-effort, never blocks send.

##### Receive path (plan lock)

| Step | Behavior |
|------|----------|
| `loom run` after successful join | `list_inbox`; if count>0 stderr: yellow banner + top ids/tags |
| Agent hint | **Must** include: on start and between tasks → `check_handoffs` then `claim_handoff` for `[R-REQUEST]`/`[GOAL]`/`[VERIFY]` |
| Auto-claim | **Out of v1** (too dangerous unattended). Human/agent still claims. |
| PTY inject of body into agent stdin | **Out** (Phase 1.5 no-go) |

##### Out (non-goals for 0.15.0)

| Out | Why |
|-----|-----|
| Wire protocol new envelope types | Keep v1; body convention + local files first |
| Auto-claim without agent | Untrusted body risk |
| PTY inject / wake dead agent process | Prior no-go; OS-specific |
| Full playbook orchestrator YAML | Later; docs templates enough for sprint 1 |
| Live CRDT board / cloud accounts | P3 |
| Purpose encryption / multi-tenant | Overkill |
| Changing claim first-wins or durable inbox | Orthogonal (0.14 done) |
| Desktop UI purpose tab | Later; CLI/MCP first |

##### Security / failure locks (authoritative — **0.15.1**)

| Case | Required behavior |
|------|-------------------|
| Purpose strings | Same sanitize as peer text before store/display |
| Path | Only under `loomDir()/purposes/`; hash roomId filename |
| Corrupt purpose file | backup `.corrupt-*` + throw/empty with error (board pattern) — **not** silent empty success |
| Purpose fields (non-verify) | Same-UID room peers may write purpose/successCriteria/outOfScope/notes via CLI or MCP (board-class residual; document) |
| **M-24** `verify[]` write path | **MCP `set_purpose` MUST reject** any request that creates or modifies `verify[]` with an **explicit error** (not silent drop). **`verify[]` writable only via CLI** `loom purpose set` (and related CLI-only paths). Do **not** call this “owner-controlled” — gate is **CLI vs MCP**, not peer role. |
| **M-25** `loom verify` run gate | Before executing: **print every command verbatim**. Compute hash of `verify[]`; if ≠ last-ack hash stored under `loomDir()` (e.g. `purposes/<id>.verify-ack`), require **interactive TTY confirm** or **`--yes`** (still prints list). Persist ack hash only after successful confirm/`--yes`. Never silent unacknowledged run. |
| `verify` execution | Run only **local disk** `purpose.verify[]` via controlled spawn (no remote handoff argv injection; no freeform `shell: true` of handoff body) |
| Untrusted handoff | Tags do not skip untrusted banner |
| L-30 multi-profile | last-writer-wins on purpose file — accepted residual like board; `updatedByPeerId` optional |

##### Acceptance (implement under 0.15.1)

1. `loom purpose set "…"` then `show` round-trips; file 0600 under purposes/.  
2. `loom handoff @x "…" --with-purpose` includes purpose summary in attachments or body section.  
3. `loom run shell` (or mock) after queued `[R-REQUEST]` prints pending inbox banner.  
4. System hint text contains check_handoffs/claim contract (unit string test).  
5. `parseHandoffContract("[R-REQUEST] …")` detects tag.  
6. `loom verify` with `verify: ["bun test"]` prints commands; first run needs confirm/`--yes`; exits non-zero on fail (or skip if recipe empty).  
7. MCP `set_purpose` with `verify` field → **error** (M-24).  
8. `bun test` green; no protocol version bump required.  
9. Docs: USER_GUIDE + DOGFOOD_LOOP boot prompt committed.

##### Implementation sketch (approved under 0.15.1)

| Area | Touch |
|------|--------|
| `packages/host/src/purpose.ts` (+ test) | load/save/schema; verify ack hash; CLI vs MCP set |
| `packages/cli` purpose + verify + run banner | M-25 gate |
| `packages/adapters/src/hints.ts` | receive contract |
| `packages/mcp-server` | get_purpose; set_purpose **rejects verify[]** |
| `packages/protocol` (optional) | parseHandoffContract |
| `docs/DOGFOOD_LOOP.md`, `scripts/dogfood-reviewer-boot.txt` | |
| VERSION | bump on implement ship |

**Unknowns:** `docs/UNKNOWNS.md` §0.15.0.

**Implemented as of 0.15.1** (purpose.ts, CLI purpose/verify, MCP get/set_purpose M-24, verify M-25, hints receive path).

#### 0.14.2 — 2026-07-10 (`superseded` by 0.15.0; was `approved` — **author-close**, P2 durable security harden)

**Why:** Adversarial dogfood (Codex) showed (1) `writeAtomicJson` could write-through a final-path symlink (TOCTOU) and (2) `removePeer`/mutations swallowed persist I/O errors → leave appeared OK but peer/inbox **resurrected** after restart.

| What | Why |
|------|-----|
| `writeAtomicJson`: realpath parent, unlink symlink at final, no write-through | Symlink TOCTOU |
| `saveRoomSnapshot` path must stay under realpath(stateDir) | Path escape |
| Persist failures **throw**; leave/claim/addPeer/routeHandoff **rollback** memory | Fail closed durability |
| Server replies `persist_failed` instead of half-applied leave | Wire honesty |
| Tests: symlink victim untouched; leave EACCES no resurrection | Regression |
| VERSION **0.14.2** | CLI/MCP parity |

**author-close, Low security harden** (no re-R{n}; tightens 0.14.1 locks).

#### 0.14.1 — 2026-07-10 (`superseded` by 0.14.2; was `approved` — **author-close**, R15 M-21/M-22/M-23 locks)

**Why:** R15 `pending-revision` — three Med findings, all **PLAN-text lock rows** only (no architecture change). Decision notes: PATCH → **author-close, no re-review (no R15b)**.

| Finding | Lock (now in Failure/security locks table) |
|---------|-----------------------------------------------|
| **M-21** | Auto-daemon **must** pass `LOOM_RELAY_STATE_DIR=join(loomDir(),"relay-state")` to child; standalone/remote `loom relay` documents independent default (gate-exempt) |
| **M-22** | Hydrate reconstructs `members`/`inboxes` from stored `secret` — **never** `addPeer` / `generatePeerSecret` |
| **M-23** | **(a) required:** pid-ownership exclusive lock on state dir / per-room write (same class as `atomic-json.ts` `withFileLock`) in relay-local `persist.ts` — not “optional” |

Also: L-28/L-29 remain Low backlog (non-blocking). Cross-ref L-29 disk growth residual under locks table.

**Approved by:** plan author after R15 Decision notes (author-close). **Implement next** under 0.14.1.

**Implemented as of 0.14.1** (CLI/MCP VERSION **0.14.1**).

#### 0.13.15 — 2026-07-10 (`approved` — **author-close**, dogfood multi-profile / Codex MCP)

**Why:** Inside `loom run`, inherited `LOOM_SESSION` overrode CLI `--profile` (wrong peer inbox). Codex global config still had legacy `mcp_servers.fable` → `/tmp/fake-stdio.ts`. MCP `serverInfo.version` lagged at 0.13.3.

| What | Why |
|------|-----|
| CLI `--profile` → `setActiveProfile(..., { explicit: true })` beats `LOOM_SESSION` | Dogfood multi-peer ops from agent shells |
| MCP `serverInfo.version` **0.13.15** | Parity with CLI |
| DOGFOOD_LOOP §6.1 | Codex MCP + sticky host recovery |
| (ops, not git) `~/.codex/config.toml` → strip fable, install `mcp_servers.loom` (codex-rev) | Unblock Codex tools |

**Not** P2 durable inbox / not R15 scope. **author-close, Low dogfood DX.**

#### 0.14.0 — 2026-07-10 (`superseded` by 0.14.1; was `pending-revision` — **P2 durable relay state**)

**Why:** PRIORITIES **P2** — relay restart currently wipes in-memory rooms, roster (`peerSecret`), and per-peer handoff inboxes. Offline-safe handoff is only process-lifetime durable; product north star needs handoffs to survive local/remote relay restarts.

**Review impact:** MINOR + **security/data** surface → **R15** → pending-revision → **0.14.1** locks + author-close. Wire protocol stays v1.

##### In (scope)

| What | Why |
|------|-----|
| Persist **room meta** (id, name, inviteCode, createdAt) on disk | Rejoin same invite after relay restart |
| Persist **roster** incl. **peerSecret** (M-7) | Identity rejoin proof survives process death |
| Persist **pending inbox** (`queued` \| `notified` only) | Handoff bodies/attachments not lost on restart |
| Load all room snapshots at relay start into `RoomRegistry` | Transparent recovery; clients use existing session |
| Atomic write (temp + rename + **mode 0600**) | Same pattern as board/pack; no torn JSON |
| Default state dir `~/.loom/relay-state/` (override `LOOM_RELAY_STATE_DIR`) | Align with `~/.loom` local-first; remote relay = host machine disk |
| Per-room file `<sha256(roomId)[0:16]>.json` | Bound path; no raw roomId in filename |
| Persist after create / join-mutate / leave / enqueue / claim | Durability = last successful mutation |
| On load: all peers **offline** (`socket = null`) | No fake online; presence reattaches on rejoin |
| Production `loom relay` / auto-daemon: durable **ON** by default | Real dogfood path recovers |
| Tests: `persist: false` or `LOOM_RELAY_EPHEMERAL=1` | Unit tests stay hermetic; no home pollution |
| Caps unchanged (100 inbox/peer, attach size, etc.) | Disk DoS bound same as memory L-11/L-16 |
| leave still drops peer inbox + roster entry + flush | Explicit leave semantics unchanged |
| claim/accept first-wins + delete terminal entry + flush | No re-claim after restart |
| Docs: ARCHITECTURE, RISK, PROTOCOL residual, USER_GUIDE restart, TEST_PLAN UC | Honesty after implement |
| CLI/MCP **VERSION** bump on implement ship (0.14.x) | Plan was ahead of code; ship with implement |

##### Schema (snapshot v1 — plan lock)

```ts
// packages/relay — conceptual; exact field names free in impl if zod-validated
type RoomSnapshotV1 = {
  v: 1;
  room: { id: string; name: string; inviteCode: string; createdAt: string };
  members: Array<{
    peer: { id: string; displayName: string; color: string; agentKind: string; joinedAt: string };
    secret: string; // M-7 — never log; file 0600 only
  }>;
  inboxes: Record<string /* peerId */, Array<{
    status: "queued" | "notified";
    toPeerId: string;
    handoff: HandoffPayload; // existing protocol shape
  }>>;
  colorIndex: number;
  updatedAt: string; // ISO
};
```

##### Out (non-goals for 0.14.0)

| Out | Why |
|-----|-----|
| Protocol wire / envelope changes | Transparent server-side durability |
| Chat history persistence | Separate product surface |
| Live board CRDT / multi-writer board | P3 |
| Encryption at rest / KMS | Residual: OS-user file perms (document) |
| Multi-relay HA / shared-disk multi-writer | Single relay process owns state dir |
| Claimed/accepted archive | Terminal entries already deleted (L-11) |
| Room auto-GC / TTL eviction of disk rooms | Keep process+disk; GC later if needed |
| Client session / sticky / desktop API changes | Reuse existing rejoin + list_inbox |
| Moving `atomic-json` into protocol (optional later) | Relay may ship small `persist.ts` (host→relay cycle if import host) |

##### Failure / security locks (authoritative for implement — 0.14.1)

| Case | Required behavior |
|------|-------------------|
| Missing state file | Treat as empty; create on first write |
| Corrupt JSON | Backup `*.corrupt-<ts>`; **skip that room**; log error; never silently treat as empty success for that file |
| Write I/O error | Log; keep in-memory truth for process life; retry on next mutation |
| **M-21** state dir / M-14 | **Auto-daemon** (`ensureLocalRelay` / `relay-daemon` spawn) **must** set child env `LOOM_RELAY_STATE_DIR = join(loomDir(), "relay-state")` so durable path honors the same home migration gate as sessions. **Standalone / remote** `loom relay` (no host parent): default may be `~/.loom/relay-state` or `LOOM_RELAY_STATE_DIR` if set — **documented as gate-exempt** (operator owns home layout). Never invent a second home that ignores live `.fable` PID gate without docs. |
| **M-22** hydrate secrets | **Hydrate must NOT call `addPeer` / `generatePeerSecret`.** Reconstruct `members` Map and `inboxes` Map **directly** from snapshot fields (including stored `secret`). New joins after load still use `addPeer` as today. |
| **M-23** multi-writer | **Required (a):** relay-local `persist.ts` uses **pid-ownership exclusive lock** (same class as `packages/host/src/atomic-json.ts` `withFileLock` — lock dir + owner.pid, reclaim only if owner dead). Apply around load-all and each room snapshot write. Port bind + `relay.pid` remain; lock is **not optional**. (Option b — ephemeral-only `dev:relay` — is **not** the sole control.) |
| Two processes same state dir | Port bind + `relay.pid` **and** M-23 file lock; second process must fail loud (log/exit), not silent last-write-wins |
| peerSecret on disk | **0600**; never in logs/health; same residual class as `session.json` peerSecret |
| Remote operator | Host UID can read secrets — **accepted** local-first residual (document) |
| Load order / invite index | Rebuild `byId` + `byCode` from all snapshots; **L-28** invite-code collision → log (do not silent last-wins without log) |
| **L-29** disk growth | Room files accumulate until explicit leave/GC — residual accepted (Out: no auto-GC in v1); document in USER_GUIDE/ARCHITECTURE on ship |

##### Acceptance (implement under 0.14.1)

1. handoff → kill relay → restart same state dir → target `list_inbox` still has entry; `claim`/`accept` works once.  
2. After claim, restart → entry gone (first-wins).  
3. leave peer → restart → peer + inbox absent.  
4. Rejoin with correct `peerSecret` OK; wrong/missing → `peer_auth_failed`.  
5. Corrupt one room file → other rooms still load.  
6. `LOOM_RELAY_EPHEMERAL=1` → no state files written.  
7. Auto-daemon child has `LOOM_RELAY_STATE_DIR` under `loomDir()` (M-21).  
8. Restart does **not** mint new secrets for existing peers (M-22).  
9. Second writer against locked state dir fails loud (M-23).  
10. `bun test` + `bun run smoke:uc` green.

##### Implementation sketch (approved under 0.14.1)

| Area | Touch |
|------|--------|
| `packages/relay/src/persist.ts` (new) | snapshot schema, path, atomic write 0600, **pid lock (M-23)**, loadAll |
| `packages/relay/src/room.ts` | serialize hooks; **hydrate without addPeer (M-22)**; registry load/save |
| `packages/relay/src/server.ts` / `cli.ts` | wire stateDir from env; ephemeral flag |
| `packages/host/src/relay-daemon.ts` | **must** pass `LOOM_RELAY_STATE_DIR` (M-21) |
| Tests | unit persist + restart simulation; hydrate secret stability; lock contention; no live port required |

**Unknowns:** see `docs/UNKNOWNS.md` §0.14.0.

**Implemented as of 0.14.1** (`packages/relay/src/persist.ts`, Room hydrate M-22, `relay-daemon` M-21, process lock M-23). R15 Med closed by lock rows above.

#### 0.13.14 — 2026-07-10 (`superseded` by 0.14.0; was `approved` — **author-close**, TUI resize robust)

**Why:** Owner still saw fixed Claude layout after 0.13.13; SIGWINCH often delivered only to Loom parent.

| What | Why |
|------|-----|
| `run-with-pty.py` openpty + 200ms winsize poll | resize without relying on signal delivery |
| Loom parent `forwardWinch` → python child | parent is foreground process group |
| VERSION **0.13.14** | PATCH dogfood |

#### 0.13.13 — 2026-07-10 (`superseded` by 0.13.14; was `approved` — **author-close**, TUI resize / SIGWINCH)

**Why:** `script(1)` PTY fixed Claude kqueue but frozen terminal size at launch; resize ignored.

| What | Why |
|------|-----|
| `scripts/run-with-pty.py` (python3 `pty.spawn`) | forwards SIGWINCH + TIOCSWINSZ |
| Prefer python-pty over `script` for TUI agents | dynamic cols/rows |
| VERSION **0.13.13** | PATCH dogfood |

#### 0.13.12 — 2026-07-10 (`superseded` by 0.13.13; was `approved` — **author-close**, TUI PTY for Claude)

**Why:** `loom run claude` started then Claude (Bun TUI) crashed with EINVAL kqueue on inherited tty.

| What | Why |
|------|-----|
| `runTuiAgent`: script PTY → fds → /dev/tty | real PTY for Claude/Codex/Grok |
| stdio `[0,1,2]` instead of inherit | less Bun stream wrapping |
| workaround tip if all fail | direct `claude --mcp-config` |
| VERSION **0.13.12** | PATCH UC-9.3 |

#### 0.13.11 — 2026-07-10 (`superseded` by 0.13.12; was `approved` — **author-close**, shell fd-only)

**Why:** Even `process.stdout.isTTY` / stdin stream APIs trigger Bun TTY WriteStream kqueue crash.

| What | Why |
|------|-----|
| REPL reads `readSync(0)` only | no process.stdin |
| spawn stdio `[0,1,2]` | no inherit streams |
| VERSION **0.13.11** | PATCH |

#### 0.13.10 — 2026-07-10 (`superseded` by 0.13.11; was `approved` — **author-close**, writeSync stderr)

**Why:** Crash was on `process.stderr.write` itself (`WriteStream` / kqueue), not only readline.

| What | Why |
|------|-----|
| `eprint`/`print` via `writeSync(1|2)` | bypass Bun TTY stream layer |
| `cmdRun` / shell REPL use eprint | UC-9.2 dogfood |
| VERSION **0.13.10** | PATCH |

#### 0.13.9 — 2026-07-10 (`superseded` by 0.13.10; was `approved` — **author-close**, shell REPL no node:tty)

**Why:** Owner hit Bun `EINVAL kqueue` / `WriteStream` crash via readline `terminal:true`.

| What | Why |
|------|-----|
| REPL = raw `stdin` line loop | avoid `node:tty` WriteStream |
| try/catch around run shell | no hard crash |
| VERSION **0.13.9** | PATCH |

#### 0.13.8 — 2026-07-10 (`superseded` by 0.13.9; was `approved` — **author-close**, shell REPL default)

**Why:** Nested zsh under Bun still returned to the outer prompt with no fallback message (Owner dogfood). Default `run shell` is now an in-process **Loom REPL**.

| What | Why |
|------|-----|
| `run shell` → `loom-shell>` REPL | reliable interactive UC-9.2 |
| `run shell --nested` | optional real $SHELL |
| shortcuts: `peers` → `bun run loom peers` | less typing |
| VERSION **0.13.8** | PATCH |

#### 0.13.7 — 2026-07-10 (`superseded` by 0.13.8; was `approved` — **author-close**, UC-9.2 shell robust)

**Why:** Nested zsh still exited immediately for Owner after 0.13.6.

| What | Why |
|------|-----|
| shell spawn: `/dev/tty` → `script` PTY → inherit → **Loom REPL** | always leave an interactive prompt |
| VERSION **0.13.7** | PATCH dogfood |

#### 0.13.6 — 2026-07-10 (`superseded` by 0.13.7; was `approved` — **author-close**, UC-9.2 shell)

**Why:** `loom run shell` exited immediately after “Starting Shell…” (non-interactive zsh under Bun spawn).

| What | Why |
|------|-----|
| shell adapter `-i` | force interactive zsh/bash |
| `cmdRun` uses `node:child_process` stdio inherit | better TTY for agent child |
| immediate-exit tip | dogfood diagnosis |
| VERSION **0.13.6** | PATCH |

#### 0.13.5 — 2026-07-10 (`superseded` by 0.13.6; was `approved` — **author-close**, R14 Low L-26/L-27)

**Why:** Owner chose Low backlog before P2; close R14 residuals.

| What | Why |
|------|-----|
| **L-26** desktop `load_live_meta` F-2 room/peer match | parity with CLI `resolveLiveHostMeta` |
| UI CTA `session_mismatch` | clear host restart guidance |
| **L-27** pack embed open `O_NOFOLLOW` + fd read + re-check | reduce check→read TOCTOU |
| VERSION **0.13.5** | PATCH Low |

**Review impact:** R14 said Low may author-close; no re-R{n} required.

#### 0.13.4 — 2026-07-10 (`superseded` by 0.13.5; was `approved` — **R14** cumulative trust)

**Why:** Owner chose **P1-B** — external R{n} over author-close series 0.11–0.13.3.

| What | Why |
|------|-----|
| R14 code review (sticky / pack embed / claim / XSS / requestId / install DX) | Trust gate before next MINOR |
| `docs/plan_review.md` R14 | Findings L-26, L-27 Low only |
| PRIORITIES P1 → done | Next = P2 durable inbox |
| No CLI feature change | Review/docs PATCH only |

**Review impact:** R14 **approved**. No blocking fixes required.

#### 0.13.3 — 2026-07-10 (`superseded` by 0.13.4; was `approved` — **author-close**, P0 install DX)

**Why:** Short-term priorities doc + make `loom` easy to run without guessing PATH.

| What | Why |
|------|-----|
| `docs/PRIORITIES.md` | P0=install DX, P1=trust, P2=durable inbox, P3=big features |
| `scripts/loom` | Repo-local wrapper (`PATH=…/scripts`) |
| `bun run link:loom` / `unlink:loom` | Bun global bin for `loom` |
| README / USER_GUIDE install options A/B/C | Dogfood friction |
| VERSION **0.13.3** | PATCH DX |

#### 0.13.2 — 2026-07-10 (`superseded` by 0.13.3; was `approved` — **author-close**, dogfood UX)

**Why:** Real-use dogfood fixes after Owner request.

| What | Why |
|------|-----|
| `renderInbox` resolves fromPeerId → displayName + attachment count | List showed raw `p_…` only; pack embed invisible until accept |
| inbox accept loads peers for `formatIncomingHandoff` from-name | Same dogfood pain |
| Share/Next tips: `bun run loom …` + PATH note | `loom: command not found` after create |
| host stop tip when no host: same `--profile` | Stop without profile looked broken |
| VERSION **0.13.2** | PATCH dogfood |

#### 0.13.1 — 2026-07-10 (`superseded` by 0.13.2; was `approved` — **author-close**, Low backlog)

**Why:** Close backlog **L-4 residual** — wire-level `requestId` on RPC request/reply (beyond FIFO waiters).

| What | Why |
|------|-----|
| Client messages optional `requestId` | Correlation token |
| Reply envelopes optional `requestId` (BaseEnvelope) | Relay echo |
| `RelayServer.reply` echoes id on create/join/handoff/list_*/claim errors | End-to-end match |
| `RelayClient.requestOnce` always sends id; match by id when present | Concurrent same-type RPCs |
| FIFO type-match remains if reply has no id | Backward compatible with older relays |
| VERSION **0.13.1** | PATCH: protocol optional field |

**Approval provenance (honest):**

| | |
|--|--|
| **When** | 2026-07-10 (commit `676d4f3`, ~11:01 +0900) |
| **Who** | Plan author / implementer (agent session under Owner “다음 진행해”) — **not** Reviewer Fable 5, **not** explicit Owner approve |
| **How** | Author-close after Low backlog implement; declared “no re-review required” |
| **Not** | R14 / formal review sign-off / Owner decision log row |

Git author on machine: local `skywk` account (agent commit via that identity).

#### 0.13.0 — 2026-07-10 (`superseded` by 0.13.1; was `approved`)

**Why:** Close backlog **L-5** with **opt-in** pack file-body embed — re-resolve allowlist at **send/read** time (TOCTOU).

| What | Why |
|------|-----|
| `packToAttachments({ embedFiles })` + `embedPackFileBodies` | L-5: re-check path under cwd allow root before read |
| CLI `--with-pack-embed` (implies pack attach) | Explicit opt-in; default paths-only unchanged |
| MCP `withPackEmbed` | Agent parity |
| Caps: 8 files, 64k chars/file, skip binary/dirs/oversized | Keep handoffs bounded |
| Host tips use `bun run loom host …` | UX (PATH without global bin) |
| VERSION **0.13.0** | MINOR: new attach surface |

Default `--with-pack` still **paths/notes only**. Receivers treat path attachments as metadata (not auto-open FS).

No full re-review required (Low backlog L-5; security-conservative caps + re-resolve).

#### 0.12.2 — 2026-07-10 (`superseded` by 0.13.0; was `approved`)

**Why:** Desktop can **send** handoffs/chat (not only receive); show invite code for share.

| What | Why |
|------|-----|
| sticky `handoff` / `chat` via desktop invoke | Complete human loop without CLI |
| Send tab: to peer / `*` / modes message\|task\|chat | Sticky RPC already supported |
| Status: invite code + `loom room join …` hint | Share without leaving app |
| `smoke:desktop` covers handoff + chat | Regression |
| VERSION **0.12.2** | Parity |

No re-review (uses existing sticky ops; M-19/M-20 unchanged).

#### 0.12.1 — 2026-07-10 (`superseded` by 0.12.2; was `approved`)

**Why:** GUI polish after 0.12.0 dogfood; keep external pitch honest.

| What | Why |
|------|-----|
| Desktop: auto-refresh 5s, R key, last-updated, tab badges | Scanability / less manual refresh |
| Inbox: resolve fromPeerId → displayName via peers map | UX |
| Board: group tasks by status | Scanability |
| `docs/PITCH.md` → v0.12.0 (Board shipped, smoke) | Pitch was stale (said Board deferred) |
| CLI / desktop VERSION **0.12.1** | Parity |

No re-review (UX + docs honesty only).

#### 0.12.0 — 2026-07-10 (`superseded` by 0.12.1; was `approved`)

**Why:** Close M-18 deferral with **option A** — board via sticky host RPC + desktop Board tab. Dogfood sticky path automated.

| What | Why |
|------|-----|
| sticky `list_tasks` / `add_task` / `update_task` | Same local board file as CLI/MCP; F-3 serialized |
| Desktop Board tab + add/status update | Product surface; textContent-only (M-20) |
| `bun run smoke:desktop` | Headless dogfood (status/peers/inbox/board/401) |
| CLI / desktop VERSION **0.12.0** | Parity |

Security: titles/notes sanitized on sticky out; no token to webview; no new bind.

No re-review required beyond R13 locks (Board path A was listed option; XSS/transport unchanged).

#### 0.11.2 — 2026-07-09 (`superseded` by 0.12.0; was `approved`)

**Why:** Implement M4.3b thin **Tauri desktop shell** per **0.11.1** locks.

| What | Why |
|------|-----|
| `apps/desktop` Tauri 2 + static `ui/` | Product desktop surface |
| Rust sticky client (`sticky.rs`) + invoke commands | M-19: no webview fetch/token |
| Views: Status / Peers / Inbox (claim/accept) | Sticky RPC surface |
| Host CTAs: none / stale_pid / unauthorized / refused | L-25 |
| textContent-only UI (`app.js` setText) | M-20 |
| No Board UI | M-18 C |
| `bun run desktop` / `cargo test` in src-tauri | Dev path |
| CLI / MCP VERSION **0.11.2** | PLAN parity |

**Implemented as of 0.11.2.** No re-review (implements approved 0.11.1).

#### 0.11.1 — 2026-07-09 (`superseded` by 0.11.2; was `approved`)

**Why:** R13 **pending-revision** close — lock M-18 / M-19 / M-20 before any `apps/desktop` code.

| Finding | Decision (locked) |
|---------|-------------------|
| **M-18** | **Option C** — **Board out of v1** shell. Views = Status / Peers / Inbox only. Board UI deferred (needs sticky board ops or explicit file path later). |
| **M-19** | **Rust-side sticky RPC only** — Tauri `invoke` → Rust HTTP to `127.0.0.1` + Bearer. **No** webview `fetch` to sticky. **No** CORS on sticky required. |
| **M-19** session | Resolve session file: `LOOM_SESSION` → profile via `LOOM_PROFILE` / `~/.loom/profiles/<name>.json` → default `~/.loom/session.json`. Meta = that path’s `*.host.json`. |
| **M-19** / **L-24** token | Token + raw `*.host.json` **Rust only**. Webview never receives token or meta file contents; only invoke results (peers/inbox/status DTOs). |
| **M-20** | Peer strings: **textContent / text binding only** — **no `innerHTML`**. `@loom/protocol` sanitize is **terminal ESC**, not HTML escape — do not treat sanitize as XSS fix. |
| **L-25** | Acceptance host-absent cases split (below). |
| L-22 | UNKNOWNS 0.11 filled from R13. |
| L-23 | `GET /health` unauthenticated on loopback — **accepted** (ok:true only). |

No re-review required (R13 said PATCH then author-close). **Implement next** under this approved plan.

##### Scope (v1 shell — **in**) — supersedes 0.11.0 tables

| What | Why |
|------|-----|
| `apps/desktop` Tauri **2** (Rust + web UI) | Product desktop surface |
| Data via **sticky host** loopback `POST /rpc` only | No second WS join; reuse F-3 |
| Transport: **Rust invoke → HTTP** (not webview fetch) | M-19; no sticky CORS |
| Views: **Status**, **Peers**, **Inbox** (list / claim / accept) | Sticky RPC already covers |
| Host required: CTA if missing / stale / unauthorized | L-25 |
| Peer UI: textContent-only; optional terminal sanitize for ESC | M-20 |
| Loopback sticky only; CSP default-deny | H-5 / XSS surface |
| Dev: `bun run desktop` / `cargo tauri dev` | Contributors |

##### Explicitly **out** of 0.11.1 v1

| Out | Why |
|-----|-----|
| **Board UI / board sticky ops** | M-18 **C** — defer |
| Live multi-writer board CRDT | Later |
| Pack file-body embed (L-5) | Paths-only |
| Agent TUI embed / PTY inject | Spike no-go |
| Cloud relay / accounts | Local-first |
| Webview holding host token or calling sticky HTTP | M-19 / L-24 |

##### Architecture sketch (locked)

```
[ Tauri webview ]  ──invoke only──►  [ Rust commands ]
                                        │ read *.host.json (token never to JS)
                                        │ HTTP POST 127.0.0.1:<port>/rpc + Bearer
                                        ▼
                                 [ loom sticky host ] ──WS──► [ relay ]
```

##### Security checklist (locked)

| Topic | Rule |
|-------|------|
| Host token | Rust-only; 0600 meta; never log; never to webview |
| Bind | Sticky loopback; desktop opens no public server |
| XSS | textContent only; sanitize.ts ≠ HTML escape |
| Path attachments | Display only |
| CSP | default-deny; no remote script CDN |

##### Acceptance (v1)

1. Room + `loom host start` → desktop shows peers online/offline.  
2. Inbox list + claim/accept; first-wins vs CLI.  
3. **No Board view** in v1 (M-18 C).  
4. Host problems — distinct CTAs: (a) no meta / host not running → start host; (b) stale pid / dead meta → clear+restart; (c) 401/refused → token/meta mismatch. No crash.  
5. XSS: payload displayName/body containing `<img onerror=…>` renders as **text only** (automated or manual).  
6. `bun test` green; desktop smoke optional separate.

##### Review impact

R13 closed by this PATCH. **Approved by** plan author after R13 required locks (0.8.1/0.10.1 pattern).

#### 0.11.0 — 2026-07-09 (`superseded` by 0.11.1; was `pending-revision`)

**Why:** Phase **M4.3b** draft — thin Tauri shell via sticky RPC.  
**R13:** `pending-revision` (M-18/M-19/M-20) — resolved in **0.11.1**.

Draft scope (Board “if RPC covers”, webview fetch wording) **superseded** — do not implement 0.11.0 tables.

#### 0.10.3 — 2026-07-09 (`superseded` by 0.11.0; was `approved`)

**Why:** Docs honesty + backlog hygiene after dual-compat cutover; unlock next product gate (Tauri) now that Rust toolchain is present.

| What | Why |
|------|-----|
| `docs/ADAPTERS.md` → Loom paths / `loom` CLI / `mcp_servers.loom` | User-facing docs still said `fable` / `.fable` / `FABLE_*` |
| Open follow-ups defaults: bin `loom`, session `~/.loom` | Stale pre-rename defaults |
| plan_review: close optional `fable` bin row; note L-19 residual only intentional legacy | 0.10.2 already removed bins |
| HANDOFF: Tauri unblocked (`cargo`/`rustc` available) | Product next gate was wrongly still “no Rust” |
| CLI / MCP VERSION **0.10.3** | PLAN ↔ runtime string parity |

No re-review required (docs + status honesty only; no runtime surface change beyond version string).

#### 0.10.2 — 2026-07-09 (`superseded` by 0.10.3; was `approved`)

**Why:** Complete dual-compat cutover for **CLI entrypoints** — remove transitional `fable` / `fable-mcp` bins.

| What | Why |
|------|-----|
| `@loom/cli` bin: `loom` only | Product surface is Loom |
| `@loom/mcp-server` bin: `loom-mcp` only | Same |
| Root script `fable` removed | Use `bun run loom` |
| **Still keep:** `FABLE-` invites, `fable-board-snapshot` import, MCP strip of legacy fable tables | On-disk/wire data compat |

No re-review required (documented Owner optional after R12; Low surface break for alias only).

#### 0.10.1 — 2026-07-09 (`superseded` by 0.10.2; was `approved`)

**Why:** R12 **M-17** — wire relay URL/host/port/token through `envLoom` so FABLE_* warns; Codex session-entry.

| What | Why |
|------|-----|
| `resolveRelayEndpoint` / relay cli / `loom relay` use `envRelay*` | M-17 no silent local fallback without warn |
| `envTokenInQuery` for relay-client | L-20 pattern |
| L-17 warn test + L-18 legacy board snapshot test | R12 Low |
| `AGENTS.md` Codex ritual + `bun run status` | Codex/Claude session entry |

#### 0.10.0 — 2026-07-09 (`superseded` by 0.10.1; was `pending-review` → R12 `pending-revision`)

**Why:** Drop **runtime dual-compat** for rename transition (RENAME Phase E / 0.10).

| What | Why |
|------|-----|
| Env: **LOOM_* only** (FABLE_* warns, not read) | End dual-read window |
| Slash: **/loom only** (`/fable` → help / no dual-accept) | Product CLI surface |
| sticky-spawn: LOOM_SESSION/PROFILE only | Match write-path policy |
| Relay token/host/port: LOOM only | Same |
| **Keep:** `FABLE-` invite join, `fable-board-snapshot` import, MCP strip of legacy fable tables, `fable` bin alias | Data/tooling compat (conservative) |

**Implemented as of 0.10.0.** Awaiting **R12**.

**Not in 0.10.0:** remove `fable` bin; remove legacy invite/board accept; L-5 embed; Tauri.

#### 0.9.4 — 2026-07-09 (`superseded` by 0.10.0; was `approved`)

**Why:** Backlog **L-4** — concurrent `requestOnce` stole acks by replacing `onEnvelope`.

| What | Why |
|------|-----|
| FIFO `pendingRequests` queue on RelayClient | Concurrent handoffs each get an ack |
| Do not hijack `opts.onEnvelope` | User listen handlers always see envelopes |
| claim_result match prefers handoff id | Concurrent claims less ambiguous |
| Reject pending on close/leave | No hung promises |
| Integration test concurrent handoffs | L-4 regression guard |

**Not in 0.9.4:** wire-level `requestId` correlation (optional later if multi-multiplex needs it). Sticky RPC serialization (F-3) remains.

No re-review required (Low backlog PATCH; conservative client-only fix).

#### 0.9.3 — 2026-07-09 (`superseded` by 0.9.4; was `approved`)

**Why:** Backlog **L-14** / **L-16** (R10 Low).

| What | Why |
|------|-----|
| `timingSafeStringEqual` / `timingSafeTokenEqual` in `@loom/protocol` | Single compare impl for relay token + peer secret (L-14) |
| room/server/sticky import shared util | No divergent copy drift |
| Attachment/body caps documented as **chars** (JS string length), not bytes | L-16 honesty |

No re-review required (Low backlog PATCH).

#### 0.9.2 — 2026-07-09 (`superseded` by 0.9.3; was `approved`)

**Why:** R11 Low residual — product-facing “Fable” strings, MCP WARNING scope, legacy INSECURE env warn.

| What | Why |
|------|-----|
| User-facing CLI/adapter/sticky tips → `loom` | Branding consistency |
| `isManagedComment` scoped WARNING to mcp_servers only | Avoid deleting unrelated comments |
| Warn if only `FABLE_RELAY_INSECURE_OPEN` set | RENAME §4.1 UX; still no dual-read open |
| MCP serverInfo version 0.9.2 | Stale 0.7.3 cleanup |

No re-review required (Low residual PATCH).

#### 0.9.1 — 2026-07-09 (`superseded` by 0.9.2; was `approved`)

**Why:** R11 **pending-revision** — M-14 migration bypass, M-15 sticky env, M-16 missing tests.

| What | Why |
|------|-----|
| `relay-daemon` / `mcp-server` config use `loomDir()` | M-14: no hardcode `~/.loom` that orphans `~/.fable` under live-PID gate |
| sticky-spawn writes `LOOM_SESSION`/`LOOM_PROFILE` (+ FABLE dual) | M-15 write-path LOOM_* |
| Tests: live-PID gate + `FABLE-` full-code join (no rewrite) | M-16 RN1 Phase D |
| `LOOM_TEST_HOME` + `resetStateHomeDirCache` | testable migration |

**Approved by:** plan author after R11 M-14/15/16 fix (rename baseline).

#### 0.9.0 — 2026-07-09 (`superseded` by 0.9.1; was `pending-review` → R11 `pending-revision`)

**Why:** Product rename **Fable → Loom** (disambiguate review agent fable-advisor / Fable 5). Plan: `docs/RENAME_TO_LOOM.md` (RN1-patched).

| What | Why |
|------|-----|
| CLI `loom`, packages `@loom/*`, env `LOOM_*`, `~/.loom` | Public identity |
| Dual-read most `FABLE_*` (not `INSECURE_OPEN`) | Compat without H-5 regression |
| Home migrate with live-PID gate | No sticky/relay split-brain |
| Invite mint `LOOM-`; join exact full code (no prefix rewrite) | No room collision |
| MCP `mcp_servers.loom` + exact-anchor dual-strip | H-4 + no bare “loom” wipe |
| Slash `/loom` + `/fable`; `[LOOM HANDOFF]`; loom system hint | User/agent surfaces |
| `fable` bin alias 1 minor | Transition |

**Implemented as of 0.9.0** (code + tests 116 pass). Awaiting **R11**.

#### 0.8.1 — 2026-07-09 (`approved`)

**Why:** R10 **pending-revision** — M-13 silent join failure on `fable run`; L-15 sticky peerSecret persist.

| What | Why |
|------|-----|
| `fable run` checks `joinRoom` result; exit 1 on `error` | Do not spawn agent off-room (M-13) |
| run/listen/sticky `onError` → stderr | Reconnect `peer_auth_failed` not silent |
| run `onEnvelope` handles `error` | Live error envelopes visible |
| sticky (+ run) save `peerSecret` from `room.state` | L-15 parity with room-ops |
| `RelayClient.setReconnectPeerSecret` | Keep auto-reconnect creds in sync |

**Approved by:** plan author after R10 M-13/L-15 fix (re-review of M-7 core not required per R10).

L-14 (shared timing-safe util), L-16 (KB vs chars) remain backlog.

#### 0.8.0 — 2026-07-09 (`superseded` by 0.8.1; was `pending-review` → R10 `pending-revision`)

**Why:** R5/R9 backlog **M-7** — token + invite alone must not allow taking over another peer’s roster identity / inbox.

| What | Why |
|------|-----|
| Relay mints `peerSecret` (base64url 24B) on first join/create | Unforgeable rejoin proof bound to `peer.id` |
| Rejoin with existing `peer.id` requires matching `peer.secret` (timing-safe) | Blocks identity takeover by invite+token holders |
| `room.state.peerSecret` only to the joining socket (never roster broadcast) | Secret not leaked to other peers |
| Session stores `peerSecret` (mode **0600**); sticky/CLI reconnect sends it | Survive disconnect / sticky host restart |
| Error `peer_auth_failed` on mismatch / missing secret | Explicit failure mode |
| Threat model updated in `apps/relay-cloud/README.md` + PROTOCOL | Operators know residual risk |

**Implemented as of 0.8.0** (code + tests). Awaiting **R10** review.

**Not in 0.8.0:** rotating secrets; mTLS/JWT peer certs; secret recovery if session file lost (must rejoin as **new** peer id).

#### 0.7.3 — 2026-07-09 (`superseded` by 0.8.0; was `approved`)

**Why:** R9 L-12 backlog — safer file locks for board/pack concurrent updates.

| What | Why |
|------|-----|
| Lock `owner.pid` — only reclaim if owner **dead** and lock **stale** | Two waiters must not rmdir a live lock |
| Release only if pid matches (or force reclaim dead) | Accidental unlock of peer process |
| `sleepMs` via `Bun.sleepSync` / `Atomics.wait` | No busy-spin CPU burn |

Re-review not required (Low backlog PATCH).

#### 0.7.2 — 2026-07-09 (`superseded` by 0.7.3)

**Why:** R9 L-11 backlog — bound relay memory for large handoff attachments / board snapshots.

| What | Why |
|------|-----|
| Attachment content max **256_000 chars** (JS length, not bytes), max **32** attachments, body max **100_000 chars** | DoS / memory (L-11; units clarified L-16) |
| Inbox max **100** entries/peer with trim | Bound growth |
| Claim/accept **deletes** entry (no permanent claimed retention) | Repeated `--with-board` cannot pin memory |

Re-review not required (Low backlog PATCH).

#### 0.7.1 — 2026-07-09 (`superseded` by 0.7.2; Phase 4.3a baseline)

**Why:** R9 `pending-revision` — board snapshot trust boundary.

| What | Why |
|------|-----|
| **M-10:** ISO timestamp + clamp to now in `normalizeTimestamp` | peer spoofed `updatedAt` cannot dominate merge |
| **M-11:** always `parseBoardSnapshot` (no kind cast shortcut) | malformed tasks crash |
| **M-12:** `resolveHandoffEntryIndex` for import-handoff | M-8 regression |
| **L-9:** foreign `sourceRoomId` requires `--force` | accidental cross-room merge |
| **L-10/L-13:** sanitize timestamps/names; format who/id/mode | peer-controlled strings |

**Merge trust model:** after clamp, higher `updatedAt` wins; spoofed future times become import-time.

#### 0.7.0 — 2026-07-09 (`superseded` — R9 pending-revision)

**Why:** Phase 4.3a — multi-machine board **share** without live relay sync (Tauri deferred: no Rust toolchain in env).

| What | Why |
|------|-----|
| `fable board export` / `import` (merge\|replace) | Portable snapshot JSON |
| `handoff --with-board` + MCP `withBoard` | Attach `fable-board-snapshot` attachment |
| `fable board import-handoff <ho_id>` | Apply snapshot from inbox |
| MCP `export_board` / `import_board` | Agent-side portability |
| Honest scope: **not** live multi-writer remote board | Avoid false "synced" claims |

**R9:** M-10/M-11/M-12 → **0.7.1**.

**Not in 0.7.0:** relay-persisted board CRDT, Tauri UI, auto-merge conflicts UI.

#### 0.6.1 — 2026-07-09 (`superseded` by 0.7.0; Phase 4.2 baseline)

**Why:** R8 `pending-revision` — task board integrity + handoff id sanitize.

| What | Why |
|------|-----|
| **H-7:** `writeAtomicJson` + `withFileLock` + corrupt backup (board **and** pack) | Concurrent agents must not wipe board |
| **M-8:** task id exact/suffix only; empty/ambiguous error | Silent wrong-task updates |
| **M-9:** relay always generates handoff id; sanitize id/from/mode on output | Peer-controlled string invariant |
| L-6 id format on normalize; L-7 `clear-done --yes`; L-8 Security docs | R8 Lows |

#### 0.6.0 — 2026-07-09 (`superseded` — R8 pending-revision)

**Why:** Phase 4.2 task board — track work without leaving the multiplayer room workflow.

| What | Why |
|------|-----|
| Local room-scoped board (`~/.fable/boards/<hash(roomId)>.json`, 0600) | Same model as context pack (UID+room shared) |
| Statuses: todo / doing / done / blocked / cancelled | Minimal kanban |
| `fable board show\|add\|set\|assign\|note\|rm\|clear-done` | Human CLI |
| MCP `list_tasks` / `add_task` / `update_task` | Agent tooling |
| `handoff --board` or `mode=task` → create linked task | Handoff ↔ board |
| Optional `handoffId` on tasks | Traceability (no referential integrity after relay restart) |

**R8:** H-7 concurrent write, M-8 id match, M-9 handoff id → **0.6.1**.

**Not in 0.6.0:** relay-synced board, multi-machine live board, Tauri UI, dependency graph.

#### 0.5.1 — 2026-07-09 (`superseded` by 0.6.0; Phase 4.1 baseline)

**Why:** R7 Low follow-ups (L-1–L-3); re-review not required.

| What | Why |
|------|-----|
| **L-1:** document room-scoped pack sharing (same UID + roomId) | Intentional; not profile-isolated |
| **L-2:** symlink→outside-cwd rejection test | Regression guard for allowlist |
| **L-3:** path attachment label prefix `context-pack-path:`; hint sender-relative warning | Receiver identification + trust |
| Security invariant: receivers never fs-open pack paths | Display/metadata only until v2 redesign |
| Review docs: `plan_review_archive.md` for R1–R6 | Structure debt |

**Deferred:** L-4 requestOnce correlation id; L-5 v2 embed TOCTOU re-resolve.

#### 0.5.0 — 2026-07-09 (`superseded` by 0.5.1; R7 **approved**)

**Why:** Phase 4.1 context pack — portable room context without reimplementing agents.

| What | Why |
|------|-----|
| Local **room-scoped** pack (`~/.fable/packs/<hash(roomId)>.json`, 0600) | summary + cwd-allowlisted paths + notes; **same OS user + same roomId → one pack file (all profiles)** |
| `fable pack show\|set\|add\|remove\|note\|clear` | Human manage pack |
| `handoff --with-pack` / MCP `withPack` | Share pack only on send (attachments) |
| MCP `get_context_pack` | Agents read local pack |
| Path allowlist = cwd realpath | Security (no escape to /etc etc.) |
| No file body embed in v1 | Keep envelopes small; paths only |

**R7:** approved; L-1–L-5 → 0.5.1 / backlog.

**Not in 0.5.0:** relay-shared pack across machines, auto-sync, full file content embed, task board, Tauri.

#### 0.4.1 — 2026-07-09 (`superseded` by 0.5.0; Phase 4.0a baseline)

**Why:** R6 `pending-revision` — sticky host correctness/security PATCH.

| What | Why |
|------|-----|
| **F-2:** `resolveLiveHostMeta` requires meta.roomId/peerId == session; room create/join stops host | 구 room으로 handoff 오배달 방지 |
| **F-3:** sticky `/rpc` handlers serialized (promise chain) | 동시 handoff/claim ack 혼선 방지 |
| **F-1:** sticky Bearer uses `timingSafeTokenEqual` | M-5 회귀 제거 |
| Tests: session mismatch; concurrent RPC | 회귀 가드 |

**Implemented as of 2026-07-09.** Re-review optional (PATCH).

#### 0.4.0 — 2026-07-09 (`superseded` — R6 pending-revision)

**Why:** Phase 4.0a — sticky long-lived host as foundation for context pack / task board.

| What | Why |
|------|-----|
| `fable host start\|stop\|status` | Opt-in daemon holds one WS + auto-reconnect per session |
| Loopback IPC `POST /rpc` + Bearer token in `*.host.json` (0600) | CLI/MCP avoid join→close per call |
| `opsListPeers` / handoff / inbox / claim prefer host, **fallback one-shot** | Backward compatible |
| MCP tools return `via: host\|oneshot` | Observability |
| Integration tests sticky IPC | Regression |

**R6:** F-2 host/session mismatch, F-3 concurrent ack, F-1 timing → **0.4.1**.

**Not in 0.4.0:** context pack, task board, Tauri, force-host mode, M-7 peer ownership.

#### 0.3.1 — 2026-07-09 (`superseded` by 0.4.0 sticky host)

**Why:** R5 `pending-revision` on 0.3.0 — first network exposure must not fail-open; token handling hardened.

| What | Why | Review impact |
|------|-----|----------------|
| **H-5:** non-loopback bind without token → **refuse start** unless `--insecure-open` / `FABLE_RELAY_INSECURE_OPEN` | fail-open 기본값 제거 | Phase 3 done |
| **H-6:** WS **Bearer preferred**; Share hides token unless `--show-token`; session `relayToken` + URL strip; file **0600** | access log / Share 유출 | Phase 3 done |
| **M-5:** `timingSafeTokenEqual` on Bearer + query | 타이밍 누출 완화 | PATCH |
| **M-6:** `setOfflineIfSocket` — stale close ignored after reconnect | 재연결 offline 오판 방지 | PATCH |
| Threat model (M-7 peerId) in `apps/relay-cloud/README.md` | **0.8.0** | done |

**Implemented as of 2026-07-09.** Tests: auth Bearer, H-5 refuse, M-5 equal, M-6 unit, relay-url no-token-in-wsUrl. Re-review optional (PATCH).

#### 0.3.0 — 2026-07-09 (`superseded` — R5 pending-revision)

**Why:** Phase 3 remote multiplayer (skeleton). **Not done for production LAN** until 0.3.1.

| What | Why |
|------|-----|
| `FABLE_RELAY_URL` / `--relay` + `FABLE_RELAY_TOKEN` / `--token` | Multi-machine clients |
| Relay bind `0.0.0.0`, token on WS/HTTP | LAN/cloud host |
| `ensureRelay` remote health check (no auto-spawn) | Don't spawn daemon against remote |
| `RelayClient` auto-reconnect + re-join | listen/run survive brief drops |
| `apps/relay-cloud/README.md` | Deploy notes (TLS terminate at proxy) |
| Auth integration tests | 401 without token; create with token |

**R5:** H-5 fail-open, H-6 token-in-query/Share, M-5 timing, M-6 stale close → **0.3.1**.

**Not in 0.3.0:** durable inbox; mTLS/JWT; peerId ownership (M-7).

#### 0.2.4 — 2026-07-09 (`superseded` by 0.3.0)

**Why:** R4 conditional approve — H-4 legacy TOML duplicate table on `--write-user-config`.

| What | Why |
|------|-----|
| `stripAllFableMcpSections` before upsert | Remove unmarker v0.2.2 `[mcp_servers.fable]` so TOML stays valid |
| Legacy auto-added comments stripped | Migration path for existing ~/.codex and ~/.grok |
| Test: H-4 unmarker block | Regression guard |
| parseArgs boolean allowlist | `--write-user-config codex` no longer swallows agent id |
| usage PLAN version string | Match VERSION 0.2.4 |
| Grok MCP path documented from official user-guide | R4 M-4 format evidence |

**R4:** approved with H-4 PATCH — this version.

#### 0.2.3 — 2026-07-09 (`superseded` by 0.2.4 H-4)

**Why:** R3 `pending-revision` — Phase 2 wiring honesty (M-3 + post-R3 Grok).

| What | Why |
|------|-----|
| Codex/Grok **user-global MCP write = opt-in** (`--write-user-config`) | R3 M-3 무단 append 제거 |
| Managed TOML block + **FABLE_SESSION env** + upsert | multi-profile MCP 세션 바인딩 |
| Gemini removed earlier; Grok same policy as Codex | M-2 obsolete; Grok not re-introduce M-3 |
| `isOnline` unregistered → false | R3 Low bug |
| sanitize bidi/ZW; check/claim re-sanitize | R3 Low |
| Claude ensureMcpConfig returns null (global --mcp-config SSOT) | R3 Low 중복 제거 |
| ADAPTERS matrix: `userConfigWrite: opt-in` | 정직한 표기 |

#### 0.2.2 — 2026-07-09 (`superseded` — Phase 2 wiring incomplete per R3)

**Why:** Phase 2 multi-agent adapter depth after M1.1.

| What | Why |
|------|-----|
| Adapter `capabilities` + `ensureMcpConfig` per CLI | Codex/Grok MCP paths beyond env-only |
| Shared `fableSystemHint` with check/claim | Hetero agents same receive contract |
| `fable run` auto-pick; `agents --matrix` | UX |
| Claude/Codex/Grok project MCP config writers | Practical multi-CLI |
| Hetero handoff unit tests (claude→codex claim) | Phase 2 done criterion without requiring all CLIs installed |
| ADAPTERS.md matrix | Docs |

**Next optional:** Phase 1.5 PTY spike · Phase 3 remote relay

#### 0.2.1 — 2026-07-09 (`superseded` by 0.2.2 implementation notes; still the M1.1 contract baseline)

**Why:** `docs/plan_review.md` **Review R2** (Plan v0.2.0) 조건부 승인 — High/Med finding을 M1.1 완료 기준에 반영. MINOR 재리뷰 불필요 (PATCH).

| What | Why | Review impact |
|------|-----|----------------|
| **H-1:** roster(멤버십)와 live socket **분리**; offline 멤버 대상 handoff **enqueue** | 소켓 close 시 `removePeer`면 수신자 거의 항상 offline → inbox 무의미 | M1.1 필수 |
| **`*` broadcast** inbox 적재 규칙 정의 | offline 포함 전원 queued | M1.1 필수 |
| peers에 **online/offline** 표시 | roster 분리 후 UX | M1.1 |
| **M-1:** `FABLE_SESSION` env 및/또는 `--profile` 로 세션 파일 분리 | 같은 머신 2-peer 시 `~/.fable/session.json` 덮어쓰기 | 데모 전제 |
| sanitize 범위 = **모든 peer-controlled 문자열** (body, chat, displayName, roomName); **allowlist** (인쇄 가능 + `\n\t`) | body만 잡으면 우회 | Security 필수 |
| handoff MCP 반환: `queued` \| `delivered` \| `peer_unknown` (무조건 `ok:true` 금지) | offline enqueue 후 의미 명확화 | Low→M1.1 |
| claim vs `inbox accept`: **first-wins** 상태 전이 | 경합 | Low→M1.1 |
| `handoff.ack` envelope (room.state 재전송 잔재 제거) | server.ts ack 정리 | Low→M1.1 |
| `injectIntoStdin` = **unused / Phase 1.5 only** 표기 | dead path 혼동 방지 | docs |
| Inbox 저장 = **relay 메모리, room 수명** (프로세스 재시작 시 유실 OK for MVP) | 공수 통제 | 명시 |
| leave 명시 시에만 roster 제거; socket close = **offline** | H-1 정책 | M1.1 |

**Approved by:** Fable 5 (R2, conditional) + plan owner acceptance of 0.2.1 PATCH.  
**Next:** 구현 단위 **M1.1** 착수. 완료 후 Changelog에 `Implemented as of …` PATCH 가능.

#### 0.2.0 — 2026-07-09 (`superseded`)

**Why:** R1 보류 사유 반영 (큐 수신, 오버레이 제외, ANSI body, PTY 후순위).  
**Review R2:** `approved` 조건부 → findings는 **0.2.1**에 흡수.

| What | Why | Review impact |
|------|-----|----------------|
| 수신 = 큐 + 알림 + `check_handoffs` | MCP non-push | 재리뷰 필수였음 |
| PTY/오버레이 비목표 | 일정·실현성 | 해소 |
| 버전 관리 도입 | 추적 | 프로세스 |

#### 0.1.0 — 2026-07-09 (`superseded` / R1 **on-hold**)

- PTY 주입·오버레이 가정. R1 보류.

---

## Review resolution

### R1 (v0.1.0 → v0.2.0) — 해소

| # | 지적 | 결정 |
|---|------|------|
| 1 | MCP 송신 전용 / PTY 위험 | 큐 + 폴링 |
| 2 | presence 오버레이 | 비목표 |
| 3 | 얇은 데몬+MCP | 코어 아키텍처 |
| 4 | 일정·속도·ANSI body | 반영 |

### R2 (v0.2.0 → v0.2.1) — 해소 (본 버전)

| Sev | Finding | 0.2.1 반영 |
|-----|---------|------------|
| H-1 | roster/socket 결합, offline handoff 실패 | 분리 + offline enqueue + broadcast 규칙 |
| M-1 | 전역 session.json | `FABLE_SESSION` / `--profile` |
| Med | sanitize body only | peer-controlled 전체 + allowlist |
| Low | handoff 무조건 ok | `queued\|delivered\|peer_unknown` |
| Low | claim/accept 경합 | first-wins |
| Low | room.state ack 잔재 | `handoff.ack` |

---

## Context

Mosaic-class: 여러 사람 + 여러 에이전트 CLI가 Room에서 협업하고 handoff로 작업/메시지를 넘긴다.

**제품 한 줄:** 선호 에이전트 CLI를 유지한 채 Room + presence + **safe handoff inbox**로 연결.

| 결정 | 선택 |
|------|------|
| 협업 범위 | 로컬 → 원격 |
| 배포 | CLI 우선 |
| AI 런타임 | multi-CLI: claude, codex, grok, shell |
| 수신 모델 | **큐 + 알림 + MCP 폴링** (offline enqueue 포함) |
| 포지셔닝 | 속도 (해자 주장 최소화) |

---

## Recommended approach

### 핵심 통찰

1. 에이전트 재구현 안 함.  
2. MCP = 송신·폴링 only.  
3. Handoff는 **roster 기준 inbox**에 쌓임 (live socket 불필요).  
4. PTY 주입 = 선택 (Phase 1.5).

### 아키텍처 (v0.2.1 코어)

```
Agent CLIs ──MCP/CLI──► Fable Host ──WebSocket──► Relay
                              │                      │
                         session profile         roster (members)
                         sanitize all out        sockets (online map)
                         inbox CLI/MCP           per-peer inbox queue
```

- **Roster member:** join 후 명시 `leave` 또는 TTL까지 유지.  
- **Socket close:** member는 남고 `online=false`.  
- **Handoff to offline member:** inbox enqueue, 송신 결과 `queued`.  
- **Online + connected listener:** enqueue + 실시간 notify envelope, 결과 `delivered` (또는 `queued`+notify — 구현 시 하나로 통일, 권장: 항상 inbox 적재 후 online이면 push notify → ack `queued` with `notified: true`).

**권장 ack 의미 (M1.1 고정):**

| Result | 의미 |
|--------|------|
| `queued` | inbox에 적재됨 (offline이거나 online 알림 여부 무관; 최소 보장) |
| `delivered` | 적재 + 현재 online socket에 notify 성공 |
| `peer_unknown` | roster에 대상 없음 |

### 비목표 (MVP)

- pair-programming 공유 커서  
- 에이전트 루프 재구현  
- presence **인라인 오버레이**  
- 기본 경로 PTY stdin 주입 (`injectIntoStdin` unused until 1.5)  
- Windows 1급  
- 데스크톱 스토어  
- inbox disk 영속 (MVP = relay 메모리)

---

## Product surface

### CLI

```bash
# 프로필 (같은 머신 2인 데모 필수)
export FABLE_SESSION=~/.fable/profiles/alice.json
# 또는
fable --profile alice room create --name demo --as alice
fable --profile bob room join FABLE-XXXX --as bob

fable peers                 # id, name, agent, online/offline
fable handoff @alice "…"
fable listen
fable inbox                 # queued list
fable inbox accept <id>     # human accept (first-wins vs claim)
fable run claude
```

### Presence

- 배지 + `fable peers` (color, **online**)  
- listen/run stderr 알림  
- 오버레이 없음  

### Handoff + inbox 상태

```
queued → notified (optional) → accepted | claimed → (done)
         └ first-wins: accept 또는 claim 중 먼저 성공한 쪽만 body 확정
```

| status | 의미 |
|--------|------|
| `queued` | inbox 대기 |
| `notified` | online peer에 push 알림 보냄 (여전히 claim/accept 가능) |
| `accepted` | 사람이 `inbox accept` |
| `claimed` | 에이전트 `claim_handoff` |
| `expired` | (optional) TTL |

### 수신 경로

```
handoff → sanitize → resolve roster targets
       → enqueue each target inbox
       → if online: send notify envelope
       → ack sender: queued | delivered | peer_unknown
```

Agent: `check_handoffs` → `claim_handoff(id)`.  
Human: `fable inbox` → `accept`.

### MCP 도구

| Tool | 설명 |
|------|------|
| `handoff` | 송신; 반환 `{ status, to, id? }` |
| `list_peers` | peers + online |
| `room_chat` | 채팅 (text sanitize) |
| `check_handoffs` | 내 queued/notified 목록 (body preview sanitized) |
| `claim_handoff` | id claim; first-wins |

---

## Security

| 규칙 | 수준 |
|------|------|
| invite code join | 로컬 MVP |
| 모든 **peer-controlled** 문자열 sanitize 후 터미널/도구 응답 | **필수** |
| Allowlist: printable Unicode + `\n` + `\t`; strip ESC/CSI/OSC 등 | **필수** |
| 적용 대상: handoff body, chat text, displayName, roomName, attachment labels, **handoff id/from/mode**, board title/notes/assignee | **필수** |
| 프롬프트 인젝션 배너 | 보조 |
| context pack path: cwd **realpath** allowlist on add | **필수** |
| **Invariant:** receivers must **not** open pack/path attachments as filesystem paths | **필수** (display/metadata only; v2 embed needs redesign) |
| pack file key = roomId (room-scoped; shared across profiles on same UID) | 문서화된 의도 |
| pack leave room on wire only via `--with-pack` / `withPack` | **필수** |
| relay 본문 디스크 로그 | off |

---

## Implementation status & phases

### 완료 (M0 / M1)

| ID | 상태 |
|----|------|
| M0 protocol monorepo | **done** |
| M1-core local room CLI/MCP send | **done** |
| M1-demo human handoff (listen) | **done** (주의: 세션 파일 수동 분리 시에만 안정) |

### M1.1 — **done** (2026-07-09)

**목표:** offline-safe inbox + multi-profile + sanitize + pull tools.

| # | 작업 | 상태 |
|---|------|------|
| 1 | Roster ≠ socket | **done** |
| 2 | Offline enqueue | **done** (E2E verified) |
| 3 | `*` broadcast inbox | **done** (unit tests) |
| 4 | online 플래그 | **done** |
| 5 | `--profile` / `FABLE_SESSION` | **done** |
| 6 | Sanitize allowlist | **done** (tests) |
| 7 | Inbox API (relay memory) | **done** |
| 8 | MCP check/claim + status enum | **done** |
| 9 | CLI inbox / accept | **done** |
| 10 | `handoff.ack` | **done** |
| 11 | Docs | **done** |
| 12 | `injectIntoStdin` unused | **done** |

**Verified demo:** bob handoff @alice while offline → `queued` → alice `inbox` + `accept`.

### Phase 1.5 — PTY spike — **done** (verdict: **no-go** for default inject)

- Harness: `fable spike pty` + `packages/host/src/pty-spike.ts`
- Automated: idle line-reader works; **busy inject buffers → late submit risk**
- `injectIntoStdin` requires `{ experimental: true }`; default path never calls it
- Report: `docs/spikes/PHASE-1.5-PTY.md`
- **Product receive path unchanged:** queue + `check_handoffs` / inbox only
- Manual Claude/Codex/Grok matrix optional; not required to close phase

### Phase 2 — Multi-CLI depth — **done** (0.2.3 wiring fixed)

- Adapter capabilities + `ensureMcpConfig` (claude json, codex/grok toml)
- **Default: project-only MCP**; `--write-user-config` opt-in with session env + managed upsert
- Gemini **removed**; **Grok** added (same opt-in policy as Codex)
- Hetero room tests; `fable agents --matrix` shows `user-cfg`
- Docs: `docs/ADAPTERS.md`

### Phase 3 — Remote relay — **done** (0.3.0 + **0.3.1** security)

- Token-auth relay (`FABLE_RELAY_TOKEN`), bind `0.0.0.0`
- Clients: `--relay` / `FABLE_RELAY_URL` + `--token` (Bearer header preferred)
- Auto-reconnect on `listen` / `run` (M-6 stale-close safe)
- H-5: non-loopback without token refused (`--insecure-open` opt-in only)
- H-6: session `relayToken` separate; Share default no token; file 0600
- TLS: terminate at reverse proxy (`wss://` → local `ws://`)
- Docs: `apps/relay-cloud/README.md`

### Phase 4.0a — Sticky host — **done** (0.4.0 + **0.4.1** R6)

- `fable host start|stop|status` — long-lived `RelayClient` + reconnect
- Loopback RPC for peers / handoff / chat / inbox / claim
- Without host: previous one-shot behavior unchanged
- Meta: `~/.fable/session.host.json` (or profile sibling), mode 0600
- **0.4.1:** session match (F-2), serialized RPC (F-3), timing-safe token (F-1)

### Phase 4.1 — Context pack — **done** (0.5.0 R7 + **0.5.1** Lows)

- Local pack per **roomId** (not per profile): summary, paths (cwd-allowlisted), notes
- Same machine + same room + same OS user → **shared pack file** across `--profile`s (L-1 intentional)
- CLI `fable pack …`; attach via `handoff --with-pack` only
- MCP `get_context_pack` + handoff `withPack`
- Path attachments: `context-pack-path` / `context-pack-path:<label>`; **display only** (never auto-open as FS)
- Uses existing handoff `attachments` (no wire protocol version bump)

### Phase 4.2 — Task board — **done** (0.6.0 + **0.6.1** R8)

- Local board per roomId: tasks with status/assignee/notes/handoffId
- CLI `fable board …`; MCP list/add/update
- Handoff can spawn task (`--board` or `mode=task`)
- Not relay-synced across machines (honest local room-scope)
- **0.6.1:** atomic write+lock; strict task id match; server-only handoff ids

### Phase 4.3a — Board snapshot share — **done** (0.7.0 + **0.7.1** R9)

- Export/import board JSON; attach via handoff `--with-board`
- Import from file or inbox handoff attachment
- Merge by task id (clamped `updatedAt` wins) or replace; foreign room needs `--force`
- **Not** live remote sync — intentional
- **0.7.1:** timestamp clamp, always-parse snapshot, strict handoff id match

### Phase 8 — Launcher UX (up / host-default) — **planned 0.17.0** (`pending-review`)

**목표:** 백그라운드 multi-host, join 시 sticky 기본, work bus 일상 경로, run은 작업 시에만.

| Item | Status |
|------|--------|
| dogfood:up / loom up·down | planned |
| join auto-host + --no-host | planned |
| docs journey rewrite | planned |
| R18 | **open** |
| Implement | **blocked on R18** |

### Phase 7 — Work bus (deliver & process) — **done 0.16.1**

### Phase 6 — Purpose-based sprint 1 — **done 0.15.1**

### Phase 5 — Durable relay state (P2) — **done 0.14.1–0.14.2**

**목표:** Relay 프로세스 재시작 후에도 room invite · roster(+peerSecret) · pending handoff inbox 유지.

| Item | Status |
|------|--------|
| Disk snapshot schema v1 | planned (locked) |
| Atomic 0600 write + load-at-start | planned |
| M-21/M-22/M-23 locks | **locked in 0.14.1** |
| leave / claim / caps semantics unchanged | planned |
| Wire protocol v1 unchanged | planned |
| R15 Fable review | **closed** (pending-revision → PATCH author-close) |
| Implement | **done 0.14.1** |

### Phase 4+

Tauri UI (done through 0.12.x); optional live relay board later (P3).

---

## Risk register

| 리스크 | 완화 |
|--------|------|
| offline handoff 유실 | roster+inbox (H-1) |
| 세션 덮어쓰기 | profiles (M-1) |
| ANSI/OSC | allowlist sanitize all peer strings |
| MCP push 환상 | pull only |
| PTY 오염 | default off |
| claim/accept race | first-wins |
| relay restart 유실 inbox | **done 0.14.1** — disk snapshot + M-21/22/23 locks |
| 오버레이 일정 | 비목표 |
| **비루프백 무토큰 바인드 (H-5)** | 기동 거부; `--insecure-open` only (0.3.1) |
| **토큰 쿼리/Share/session 유출 (H-6)** | Bearer 우선; Share 기본 숨김; `relayToken` 분리 + 0600 (0.3.1) |
| **stale close → offline 오판 (M-6)** | current-socket 비교 후 setOffline (0.3.1) |
| peerId 클라이언트 제공 (M-7) | **0.8.0** per-peer `peerSecret` rejoin proof; session 0600; residual: lost secret ⇒ new peer id |
| 토큰 보유자 room/rate 남용 | MVP 수용; room GC / rate limit later |
| context pack path escape | cwd realpath allowlist; no body embed v1; symlink test (0.5.1) |
| pack 오공유 (remote) | opt-in `--with-pack` / `withPack` only |
| pack 프로필 간 공유 (local) | **intentional room-scope** — same UID+roomId shares file; document, not a bug |
| pack path attachment 오해석 | rel path + label prefix; agents must not treat as local FS (invariant) |
| requestOnce ack 상관 (L-4) | sticky RPC serialize; correlation id backlog |
| v2 pack embed TOCTOU (L-5) | re-resolve allowlist at read time when embed lands |

---

## Verification

### 자동

- Existing protocol/room/slash tests  
- Sanitize allowlist fixtures  
- Offline enqueue → rejoin → check/claim  
- Broadcast to mixed online/offline  
- Profile isolation (two session files)  
- first-wins claim vs accept  

### 수동 E2E

1. Offline-at-send handoff (M1.1 데모)  
2. Two profiles same machine  
3. ANSI in body/chat/name — no raw ESC on terminal  
4. Online notify path still works with listen  
5. Phase 2+ hetero agents  

---

## Milestone map

| Milestone | 상태 |
|-----------|------|
| M0 | **done** |
| M1 | **done** |
| **M1.1** | **done** (roster/offline inbox, profiles, sanitize, check/claim) |
| M1.5 PTY spike | **done** — default inject **no-go**; see `docs/spikes/PHASE-1.5-PTY.md` |
| M2 multi-CLI depth | **done** (0.2.3 R3 wiring) |
| M3 remote relay | **done** (0.3.1 H-5/H-6/M-5/M-6) |
| **M4.0a sticky host** | **done** (0.4.1 F-1/F-2/F-3) |
| **M4.1 context pack** | **done** (0.5.0 R7 + 0.5.1 L-1–L-3) |
| **M4.2 task board** | **done** (0.6.1 H-7/M-8/M-9) |
| **M4.3a board snapshot share** | **done** (0.7.1 M-10/M-11/M-12) |
| M4.3b Tauri desktop shell | **0.11.2** shell + **0.12.0** Board via sticky |
| **M5 durable relay state (P2)** | **0.14.1–0.14.2** done |
| **M6 purpose-based sprint 1** | **0.15.1** done |
| **M7 work bus (board notify + work CLI)** | **0.16.1** done |
| **M8 launcher UX (up / host-default)** | **0.17.0** plan `pending-review` (R18) |

---

## Open follow-ups (defaults)

| 항목 | 기본값 |
|------|--------|
| bin | `loom` (mcp: `loom-mcp`) |
| port | `7842` |
| session | `~/.loom/session.json` or `~/.loom/profiles/<name>.json` |
| state home | `~/.loom` (migrate from `~/.fable` when no live sticky/relay PID) |
| inbox store | **0.14.0:** disk under `~/.loom/relay-state/` (memory + snapshot); ephemeral for tests |
| roster TTL | **0.14.0:** room process **and** disk snapshot lifetime (leave still removes) |
| PTY inject | off |
| overlay | never MVP |
| context pack scope | **roomId** (shared across profiles, same UID) |
| context pack attach | opt-in `--with-pack` only |
| task board scope | **roomId** (local file; not multi-machine live) |
| handoffId on tasks | traceability string only — **no** referential integrity after relay restart |
| board snapshot merge | timestamps clamped to now; ISO only; foreign roomId needs force |
| handoff attachment size | max 256_000 **chars** content, 32 attachments, 100 inbox/peer; claim evicts (L-16) |

### Backlog (non-blocking)

| ID | Item |
|----|------|
| L-4 | ~~wire-level `requestId`~~ | **done 0.13.1** (echo + client match; FIFO fallback) |
| L-5 | ~~v2 pack file-body embed~~ | **done 0.13.0** (`--with-pack-embed` / `withPackEmbed`) |
| M4.3b | Tauri desktop shell — **0.11.1 approved**; implement next (Board deferred M-18 C) |

---

## Success definition

- 서로 다른 에이전트/프로필로 Room 참가  
- peers에서 online/offline 확인  
- **상대가 offline이어도** handoff가 inbox에 쌓임  
- 알림 또는 `check_handoffs` / `loom inbox`로 안전 수신  
- sanitize된 출력만 터미널에 표시  
- 원격: **토큰 없이 비루프백 바인드 거부**; 클라이언트는 Bearer(헤더) 우선; Share에 토큰 기본 미포함  
- room context pack 로컬 관리 + opt-in handoff attach; path attachments are **not** auto-opened as FS  


---

## Approval block

| Role | Name | Decision | Date | Version |
|------|------|----------|------|---------|
| Reviewer | Fable 5 | R2 **approved** (conditional → PATCH findings) | 2026-07-09 | 0.2.0 reviewed |
| Reviewer | Fable 5 | R4 **approved** (conditional H-4) | 2026-07-09 | 0.2.3 reviewed |
| Plan author | implementation | **0.2.4** H-4 fixed | 2026-07-09 | **0.2.4** |
| Reviewer | Fable 5 | R5 **pending-revision** (H-5/H-6 block Phase 3 done) | 2026-07-09 | 0.3.0 reviewed |
| Plan author | implementation | **0.3.1** H-5/H-6/M-5/M-6 **implemented** | 2026-07-09 | **0.3.1** |
| Owner | | treat **0.3.1** as Phase 3 baseline | 2026-07-09 | **0.3.1** |
| Plan author | implementation | **0.4.0** sticky host **implemented** | 2026-07-09 | **0.4.0** |
| Reviewer | Fable 5 | R6 **pending-revision** (F-1/F-2/F-3) | 2026-07-09 | 0.4.0 reviewed |
| Plan author | implementation | **0.4.1** F-1/F-2/F-3 **implemented** | 2026-07-09 | **0.4.1** |
| Owner | | treat **0.4.1** as Phase 4.0a baseline | 2026-07-09 | **0.4.1** |
| Plan author | implementation | **0.5.0** context pack **implemented** | 2026-07-09 | **0.5.0** |
| Reviewer | Fable 5 | R7 **approved** (L-1–L-5 → PATCH/backlog) | 2026-07-09 | 0.5.0 reviewed |
| Plan author | implementation | **0.5.1** L-1–L-3 **implemented** | 2026-07-09 | **0.5.1** |
| Owner | | treat **0.5.1** as Phase 4.1 baseline | 2026-07-09 | **0.5.1** |
| Plan author | implementation | **0.6.0** task board **implemented** | 2026-07-09 | **0.6.0** |
| Reviewer | Fable 5 | R8 **pending-revision** (H-7/M-8/M-9) | 2026-07-09 | 0.6.0 reviewed |
| Plan author | implementation | **0.6.1** H-7/M-8/M-9 **implemented** | 2026-07-09 | **0.6.1** |
| Owner | | treat **0.6.1** as Phase 4.2 baseline | 2026-07-09 | **0.6.1** |
| Plan author | implementation | **0.7.0** board snapshot share **implemented** | 2026-07-09 | **0.7.0** |
| Reviewer | Fable 5 | R9 **pending-revision** (M-10/M-11/M-12) | 2026-07-09 | 0.7.0 reviewed |
| Plan author | implementation | **0.7.1** M-10/M-11/M-12 **implemented** | 2026-07-09 | **0.7.1** |
| Owner | | treat **0.7.1** as Phase 4.3a baseline | 2026-07-09 | **0.7.1** |
| Plan author | implementation | **0.7.2** L-11 caps/eviction | 2026-07-09 | **0.7.2** |
| Plan author | implementation | **0.7.3** L-12 lock pid + sleep | 2026-07-09 | **0.7.3** |
| Plan author | implementation | **0.8.0** M-7 peer rejoin secret **implemented** | 2026-07-09 | **0.8.0** |
| Reviewer | Fable 5 | R10 **pending-revision** (M-13; L-14–L-16) | 2026-07-09 | 0.8.0 reviewed |
| Plan author | implementation | **0.8.1** M-13 + L-15 **implemented** | 2026-07-09 | **0.8.1** |
| Owner | | treat **0.8.1** as M-7 baseline (done) | 2026-07-09 | **0.8.1** |
| Plan author | implementation | **0.9.0** Loom rename **implemented** | 2026-07-09 | **0.9.0** |
| Reviewer | Fable 5 | R11 **pending-revision** (M-14/M-15/M-16) | 2026-07-09 | 0.9.0 reviewed |
| Plan author | implementation | **0.9.1** M-14/15/16 **implemented** | 2026-07-09 | **0.9.1** |
| Owner | | treat **0.9.1** as Loom rename baseline | 2026-07-09 | **0.9.1** |
| Plan author | implementation | **0.9.2** R11 Low residual branding | 2026-07-09 | **0.9.2** |
| Plan author | implementation | **0.9.3** L-14 timing-safe share + L-16 chars | 2026-07-09 | **0.9.3** |
| Plan author | implementation | **0.9.4** L-4 requestOnce waiter queue | 2026-07-09 | **0.9.4** |
| Plan author | implementation | **0.10.0** dual-compat drop (env/slash) | 2026-07-09 | **0.10.0** |
| Reviewer | Fable 5 | R12 **pending-revision** (M-17) | 2026-07-09 | 0.10.0 reviewed |
| Plan author | implementation | **0.10.1** M-17 + Codex entry | 2026-07-09 | **0.10.1** |
| Plan author | implementation | **0.10.2** remove fable bin aliases | 2026-07-09 | **0.10.2** |
| Plan author | implementation | **0.10.3** docs honesty + Tauri unblocked | 2026-07-09 | **0.10.3** |
| Plan author | plan | **0.11.0** M4.3b Tauri shell draft | 2026-07-09 | **0.11.0** pending-review |
| Reviewer | Fable 5 + implementer | R13 **pending-revision** (M-18/M-19/M-20) | 2026-07-09 | 0.11.0 reviewed |
| Plan author | plan | **0.11.1** R13 locks (M-18 C, M-19 Rust, M-20 textContent) | 2026-07-09 | **0.11.1** `approved` |
| Plan author | implementation | **0.11.2** `apps/desktop` thin shell | 2026-07-09 | **0.11.2** |
| Plan author | implementation | **0.12.0** sticky board + desktop Board + smoke | 2026-07-10 | **0.12.0** |
| Plan author | implementation | **0.12.1** desktop polish + PITCH sync | 2026-07-10 | **0.12.1** |
| Plan author | implementation | **0.12.2** desktop Send handoff/chat + invite | 2026-07-10 | **0.12.2** |
| Plan author | implementation | **0.13.0** L-5 pack file embed opt-in | 2026-07-10 | **0.13.0** |
| Plan author | implementation | **0.13.1** L-4 wire requestId — **`approved` author-close (Low)**; no R{n}, no Owner sign-off | 2026-07-10 | **0.13.1** |
| Plan author | implementation | **0.13.2** dogfood UX (inbox names, share tips) author-close | 2026-07-10 | **0.13.2** |
| Plan author | implementation | **0.13.3** PRIORITIES + link:loom install DX author-close | 2026-07-10 | **0.13.3** |
| Reviewer | Fable 5–equivalent | **R14 approved** (cumulative trust 0.11–0.13.3); L-26/L-27 Low | 2026-07-10 | **0.13.4** |
| Plan author | plan/docs | **0.13.4** record R14 + P1 close | 2026-07-10 | **0.13.4** |
| Plan author | implementation | **0.13.5** L-26/L-27 — **author-close** (R14 Low; no re-R{n}) | 2026-07-10 | **0.13.5** |
| Plan author | implementation | **0.13.6** run shell interactive fix — author-close | 2026-07-10 | **0.13.6** |
| Plan author | implementation | **0.13.7** shell multi-strategy + REPL fallback — author-close | 2026-07-10 | **0.13.7** |
| Plan author | implementation | **0.13.8** run shell REPL default — author-close | 2026-07-10 | **0.13.8** |
| Plan author | implementation | **0.13.9** shell REPL raw stdin (no node:tty) — author-close | 2026-07-10 | **0.13.9** |
| Plan author | implementation | **0.13.10** eprint writeSync(2) for run shell — author-close | 2026-07-10 | **0.13.10** |
| Plan author | implementation | **0.13.11** shell REPL readSync(0) only — author-close | 2026-07-10 | **0.13.11** |
| Plan author | implementation | **0.13.12** TUI agent script PTY (Claude kqueue) — author-close | 2026-07-10 | **0.13.12** |
| Plan author | implementation | **0.13.13** TUI python pty SIGWINCH resize — author-close | 2026-07-10 | **0.13.13** |
| Plan author | implementation | **0.13.14** TUI winsize poll + parent SIGWINCH forward — author-close | 2026-07-10 | **0.13.14** |
| Plan author | plan | **0.14.0** P2 durable relay inbox/roster MINOR draft | 2026-07-10 | **0.14.0** `pending-review` |
| Reviewer | Claude + Fable 5 | **R15 pending-revision** (M-21/M-22/M-23) | 2026-07-10 | 0.14.0 reviewed |
| Plan author | plan | **0.14.1** R15 locks PATCH — **author-close** (no R15b) | 2026-07-10 | **0.14.1** `approved` |
| Plan author | implementation | **0.14.1** P2 durable relay (persist + M-21/22/23) | 2026-07-10 | **0.14.1** |
| Plan author | implementation | **0.14.2** durable symlink/fail-closed harden | 2026-07-10 | **0.14.2** |
| Plan author | plan | **0.15.0** Purpose-based sprint 1 MINOR draft | 2026-07-10 | **0.15.0** `pending-review` |
| Reviewer | Claude + Fable 5 | **R16 pending-revision** (M-24/M-25) | 2026-07-10 | 0.15.0 reviewed |
| Plan author | plan | **0.15.1** R16 locks — **author-close** (no R16b) | 2026-07-10 | **0.15.1** `approved` |
| Plan author | implementation | **0.15.1** purpose + receive path + verify lite | 2026-07-10 | **0.15.1** |
| Plan author | plan | **0.16.0** work bus (board notify + loom work) MINOR draft | 2026-07-10 | **0.16.0** `pending-review` |
| Reviewer | Claude + Fable 5 | **R17 pending-revision** (M-26; L-31/L-32) | 2026-07-10 | 0.16.0 reviewed |
| Plan author | plan+impl | **0.16.1** R17 locks + work bus implement | 2026-07-10 | **0.16.1** `approved` |
| Plan author | plan | **0.17.0** launcher UX (up / host-default / work-first) draft | 2026-07-10 | **0.17.0** `pending-review` |

**구현 게이트:** code **0.16.1**. PLAN **0.17.0** `pending-review` — **next session: R18 then implement**.
