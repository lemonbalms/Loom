# Plan Review Archive — Fable Advisor

> **Archived history:** R1–R11 full text (R7–R11 also below as 2026-07-09 dump) (and older follow-ups).  
> **Current Open + latest review index:** `docs/plan_review.md`  
> Do not update approval state only here — update `docs/plan_review.md` + `docs/PLAN.md`.

---

# Plan Review — Fable Advisor

> **버전 관리:** 계획 SSOT는 `docs/PLAN.md`이다. 리뷰는 반드시 **대상 Plan version**을 헤더에 적는다.  
> **최신:** PLAN **v0.5.0** `pending-review` — Phase 4.1 context pack.  
> **규칙:** PLAN `Status=approved`는 리뷰 사인오프 **후에만** 기재 (R4/R5 선기재 금지).

## Open (blocking)

| ID | Sev | 요약 | 상태 |
|----|-----|------|------|
| **R7** | Review | PLAN **v0.5.0** context pack MINOR | **user review requested** |

### R6 follow-up (0.4.1 — 2026-07-09)

| Finding | 처리 |
|---------|------|
| **F-2** host↔session | `resolveLiveHostMeta` roomId/peerId match; create/join stops host; mismatch status |
| **F-3** concurrent RPC | `runSerializedRpc` promise chain on sticky `/rpc` |
| **F-1** timing | `timingSafeTokenEqual` for Bearer |
| Tests | F-2 mismatch + F-3 concurrent handoffIds |
| PLAN | **v0.4.1** `approved`, Phase 4.0a **done** |

### Deferred

| ID | Sev | 요약 | 상태 |
|----|-----|------|------|
| M-7 | Med | peerId 소유 증명 없음 | docs in relay-cloud README / 0.3.x later |

### R5 follow-up (0.3.1 — 2026-07-09)

| Finding | 처리 |
|---------|------|
| **H-5** fail-open non-loopback | `assertBindAllowed` refuse; `--insecure-open` / `FABLE_RELAY_INSECURE_OPEN` only |
| **H-6** token in query/Share/session | Bearer preferred on client; `relayToken` field; Share default hide; session 0600; `wsUrl` never embeds token |
| **M-5** timing | `timingSafeTokenEqual` |
| **M-6** stale close | `Room.setOfflineIfSocket` |
| PLAN | **v0.3.1** `approved`, Phase 3 **done** |

---

## Review R1 — Plan v0.1.0

**검토 대상:** `docs/PLAN.md` **v0.1.0** (Fable Advisor — Multiplayer AI Terminal, Mosaic-class)  
**검토자:** Fable 5 (fable-advisor 세컨드 오피니언)  
**날짜:** 2026-07-09  
**결론:** **보류 (on-hold)** — 핵심 전제 수정 후 재승인 권고  
**후속:** 지적 사항 → **PLAN v0.2.0** (`pending-review`)에 반영됨. 다음 리뷰는 v0.2.0 섹션에 작성.

방향성(에이전트 재구현 안 함, 어댑터 패턴, 로컬→원격 순서) 자체는 타당하다. 문제는 계획이 **가장 어려운 부분을 이미 풀린 것처럼 취급**한다는 점이다.

---

## 1. 결정적 리스크: MCP는 송신 전용이다

MCP 도구는 에이전트가 **호출**하는 것이지, 서버가 에이전트 컨텍스트로 **push**하는 채널이 아니다.

- **발신** (A의 에이전트가 `handoff` 도구 호출): MCP로 세 CLI 모두 깔끔하게 동작
- **수신** (B의 에이전트에 메시지 도착): 계획상 PTY stdin 주입이 유일한 경로

Claude Code(Ink), Codex(ratatui), Gemini CLI 모두 풀스크린 TUI라, 에이전트가 응답을 생성 중일 때 stdin에 주입하면 **입력 큐 꼬임 · 의도치 않은 제출**로 깨지기 쉽다. Risk register의 "전용 마커 블록" 완화책은 이 문제를 해결하지 못한다 — 마커가 있어도 주입 시점 자체가 문제이기 때문이다.

**권장 수정:**
- 수신 경로의 기본값을 **큐 모드**로 전환: 터미널에 알림만 먼저 표시 → 사람이 수락 → 에이전트가 유휴 상태일 때만 실제 주입
- Claude Code는 hooks를 활용해 유휴 시점을 감지
- 폴링용 `check_handoffs` MCP 도구를 병행 제공 (에이전트가 스스로 확인하러 갈 수 있게)

## 2. 두 번째 리스크: presence 오버레이

다른 프로그램의 TUI 위에 컬러 라벨을 그리려면 사실상 **tmux급 터미널 에뮬레이터**(VT 파서 + 가상 스크린 버퍼)가 필요하다. 이는 Phase 1의 3–5일 일정에 절대 들어가지 않는 규모의 작업이다.

**권장 수정:**
- MVP에서는 인라인 오버레이를 제외
- 별도 상태 라인 또는 `fable peers` 명령으로 대체

## 3. 더 얇은 대안 (권장 첫 실행 단위)

모노레포 6패키지 + PTY 래퍼 전체를 갖추기 전에, **데몬 + MCP 서버만으로** 시작할 수 있다 — 에이전트들이 handoff를 송신/폴링만 하는 형태(수신 시 PTY 주입 없음).

- 이 얇은 버전으로 핵심 가치 가설("이종 에이전트 간 handoff가 실제로 유용한가")을 **2일 내** 검증 가능
- PTY 계층은 검증 이후 "수신 UX 개선"으로 나중에 얹는 순서가 더 안전

**최소 조치:** 최소한 **Phase 0에 PTY 주입 스파이크(1일)**를 추가 — 세 CLI 각각에 대해 유휴 상태/생성 중 상태에서 주입을 실험하여, 본 scaffold 작업 전에 실현 가능성을 판정해야 한다.

## 4. 기타 지적 사항

| 항목 | 지적 |
|------|------|
| Phase 1 일정 | presence 오버레이를 포함할 경우 실제 소요는 계획 대비 **2–3배** 낙관적으로 추정됨 |
| 차별화 논리 | "다인 + 이종 에이전트" 포지셔닝은 방어 가능하나 해자는 아님 — Mosaic도 어댑터를 추가할 수 있음. 결국 **속도**가 곧 포지셔닝 |
| 보안 구멍 (신규) | handoff 본문에 포함될 수 있는 **ANSI 이스케이프 시퀀스**(예: OSC 52 클립보드 조작)를 주입 전 반드시 제거해야 함. 기존 계획의 "프롬프트 인젝션 경고 배너"로는 이 벡터를 막지 못함 |

---

## Action items (plan.md 반영 제안)

- [x] Phase 0에 "PTY 주입 스파이크 (1일)" → **PLAN 0.2.x Phase 1.5**로 반영
- [x] Handoff 수신 **큐 모드** + `check_handoffs` → **PLAN 0.2.0+**
- [x] presence 인라인 오버레이 제거 → **PLAN 0.2.0+**
- [x] Phase 1 일정 재산정 → M1.1 1–2일
- [x] ANSI sanitize → **0.2.0 body / 0.2.1 peer-controlled 전체 allowlist**
- [x] 데몬+MCP 얇은 MVP → 코어 아키텍처로 승격

---

## Review R2 — Plan v0.2.0

**검토 대상:** `docs/PLAN.md` **v0.2.0**
**검토자:** Fable 5 (fable-advisor 세컨드 오피니언) — 코드베이스(`packages/relay`, `mcp-server`, `host`, `cli`) 직접 확인
**날짜:** 2026-07-09
**결론:** **`approved`** (조건부: 아래 High/Med finding을 **0.2.1 PATCH**로 M1.1 완료 기준에 반영. 재리뷰 불필요)

v0.1.0 지적 5건은 모두 실질적으로 해소되었고, "done" 표기도 코드 실태와 일치한다. 수신을 pull(큐/폴링)로 교체하고 PTY/오버레이를 게이트 뒤로 내린 방향은 옳으며, 남은 문제는 아키텍처가 아니라 **M1.1 완료 기준의 공백** 수준이다.

### Checklist (from PLAN re-review section)

- [x] 수신 큐/폴링 모델이 MCP 제약과 합치하는가? — **Yes.** `check_handoffs`/`claim_handoff`는 순수 pull이고, 플랜이 "에이전트 자율 폴링은 사용자 지시/주기"임을 솔직히 명시함.
- [x] PTY/오버레이가 기본 경로에서 제외되었는가? — **Yes.** 비목표 명시 + Phase 1.5 go/no-go 게이트. (코드에 `host/src/handoff-inject.ts`의 `injectIntoStdin`이 잔존 — 미사용 표기 권장.)
- [~] ANSI sanitize가 필수 보안으로 충분한가? — **Partial.** handoff body 범위·픽스처는 명시됐으나, `cli/src/index.ts:302,414`에서 chat text가, `:295`에서 displayName이 터미널에 raw 출력됨. 범위를 "터미널로 나가는 모든 peer-controlled 문자열"로 확장하고, blocklist가 아닌 allowlist(인쇄 가능 문자 + `\n\t`) 방식 명시 필요.
- [~] M1.1 범위가 재승인 후 바로 실행 가능한가? — **Partial.** 두 가지 설계 공백이 완료 기준에 빠짐 (Findings H-1, M-1).
- [x] 성공 정의가 PTY 없이도 데모 가능한가? — **Yes.** 데모 스크립트가 명시적으로 PTY 없는 성공을 정의.

### Findings

| Sev | Finding | Suggested change |
|-----|---------|------------------|
| **High (H-1)** | 릴레이가 소켓 close 시 `removePeer`로 멤버십 자체를 삭제 (`server.ts:112`, `room.ts:89`). offline 피어 대상 handoff는 `peer_not_found`로 실패하는데, MCP 도구는 호출마다 join→close하므로 수신자는 **거의 항상 offline**. 현 완료 기준("수신 후 disconnect 재접속해도 조회")은 **offline-at-send** 케이스를 안 다룸 | M1.1에 "roster(멤버십)와 소켓 연결 분리 + offline 멤버 대상 handoff enqueue" 명시. `*` broadcast의 inbox 적재 규칙도 함께 정의 |
| **Med (M-1)** | 세션이 단일 전역 파일 `~/.fable/session.json` (`session-store.ts:22`) — 같은 머신 2-peer 데모 시 B의 join이 A의 세션을 덮어써 이후 A의 CLI/MCP 호출이 B 신원으로 동작 | `FABLE_SESSION` env 또는 `--profile` 플래그를 M1.1에 추가 (데모 전제조건) |
| **Med** | sanitize 범위가 handoff body 한정 — chat/displayName/roomName도 동일한 터미널 공격 벡터 | Security 표의 sanitize 규칙을 peer-controlled 문자열 전체로 확장 |
| Low | `toolHandoff`가 `Bun.sleep(150)` 후 무조건 `ok:true` (`tools.ts:67`) — `peer_not_found` 미감지. 인박스 도입 시 의미 자체가 "queued"로 바뀜 | M1.1에서 반환값을 `queued\|delivered` enum으로 재정의 |
| Low | `claim_handoff` vs `inbox accept` 경합 — 상태 전이 first-wins 미명시 | status 전이 규칙 1줄 추가 |
| Low | `server.ts:211-217` handoff ack가 room.state 전체를 재전송하는 잔재 코드 | M1.1에서 `handoff.ack` envelope로 정리 |

### Decision notes

H-1은 구현 착수 즉시 드러날 문제라 지금 완료 기준에 넣는 편이 1–2일 공수 산정의 신뢰도를 지킨다 (roster 분리 포함해도 2일 내 가능). 버전 관리 규칙상 이 보강은 **PATCH(0.2.1)**로 처리 가능하며 MINOR 재리뷰 사유는 아니다. v0.1.0 리뷰에서 놓쳤던 부분은 M-1(전역 세션 파일)이며, M1-demo가 "두 터미널"에서 동작한 것은 실행 순서에 따른 우연일 가능성이 높다 — 재현 순서 바꿔서 재확인 권장.

관련 파일: `packages/relay/src/server.ts`, `packages/relay/src/room.ts`, `packages/mcp-server/src/tools.ts`, `packages/host/src/session-store.ts`, `packages/cli/src/index.ts`

승인 시: `docs/PLAN.md` Version → **0.2.1** (PATCH), Status → `approved`, Changelog에 H-1/M-1 반영 항목 추가 + Approval block 갱신.

### R2 follow-up (적용 완료)

| 항목 | 상태 |
|------|------|
| PLAN **v0.2.1** + Status **`approved`** | **done** (2026-07-09) |
| H-1 / M-1 / sanitize 확장 / ack·status enum / first-wins → M1.1 완료 기준 | **done** (PLAN 본문) |
| 다음 단계 | **M1.1 구현 착수** (재리뷰 불필요) |

---

## Review R3 — Plan v0.2.2

**검토 대상:** `docs/PLAN.md` **v0.2.2** (Status: `approved`, M1.1 + Phase 2 "implemented" 주장)
**검토자:** Fable 5 (fable-advisor 세컨드 오피니언) — 코드 직접 확인 (`packages/relay`, `mcp-server`, `host`, `cli`, `adapters`, `protocol`)
**날짜:** 2026-07-09
**결론:** **`pending-revision`**

M1.1(H-1/M-1/sanitize/MCP 계약)은 코드·테스트로 실증되어 "done" 주장이 사실이다. 그러나 Phase 2 "done"은 과장이다 — **Gemini MCP 연동은 어떤 CLI도 읽지 않는 파일을 쓰는 것뿐이라 실질 미동작**이고, Codex는 사용자 전역 `~/.codex/config.toml`을 무단 append하면서 session env를 누락해 **M-1을 codex 경로에서 부분 재발**시킨다. M1.1은 승인 유지, Phase 2는 아래 두 건(M-2, M-3) 수정 후 승인 권장.

### Checklist

| # | 항목 | 판정 | 근거 |
|---|------|------|------|
| 1 | H-1 roster/socket 분리 | **Yes** | `relay/src/room.ts:132-139`(`setOffline`), `server.ts:110-121`(close→setOffline, removePeer 아님); offline enqueue `room.ts:278-313`; `*`는 `listPeers()` 기반이라 offline 포함 `room.ts:250-257`; E2E `server.integration.test.ts:52-118`, unit `room.test.ts:31-85` |
| 2 | M-1 세션 분리 | **Yes** | `host/src/session-store.ts:39-48`(FABLE_SESSION > FABLE_PROFILE > default); `--profile` 파싱 `cli/src/index.ts:105-109`; `fable run`이 자식 env에 FABLE_SESSION 주입 `cli/src/index.ts:515-519` |
| 3 | Sanitize 범위/allowlist | **Yes (부분 caveat)** | `protocol/src/sanitize.ts` — ESC/CSI/OSC/C0/C1 제거, `\n\t` 허용; roomName `room.ts:51`, displayName `room.ts:103`+`server.ts:155,185`, chat `room.ts:219`, body/attachments/label `room.ts:234-247`, MCP 송신 `mcp-server/src/tools.ts:69,89`; 테스트 `sanitize.test.ts`(OSC 52 포함). Caveat: U+00A0 이상 전부 통과 → bidi override/zero-width 스푸핑 미차단 |
| 4 | MCP 계약 (enum, first-wins) | **Yes** | enum `protocol/src/envelope.ts:64-69`; `toolHandoff` 반환 타입 `tools.ts:54-82`; first-wins `room.ts:348-379`(claimed/accepted 재-claim 거부), 테스트 `room.test.ts:95-106`; 도구 설명에도 enum 명시 `mcp-server/src/stdio.ts:34` |
| 5 | Phase 2 | **Partial** | capabilities+ensureMcpConfig 3종 실재(`adapters/src/claude.ts`, `codex.ts`, `gemini.ts`); `fable run` auto `cli:486-490`, `agents --matrix` `cli:338-352` 실동작 코드. hetero 테스트 `relay/src/hetero.handoff.test.ts` 실재·비형식적(offline→queue→reconnect→claim) — room 계층만 검증, 어댑터/MCP는 미경유(문서의 자체 기준은 충족). **Gemini/Codex 배선 결함으로 전체는 Partial** |

### Findings

| Sev | Finding | Suggested change |
|-----|---------|------------------|
| **Med (M-2)** | Gemini 어댑터가 `.fable/gemini.mcp.json`을 쓰지만(`gemini.ts:37-53`) Gemini CLI는 이 경로를 읽지 않음(`.gemini/settings.json`을 읽음). env `FABLE_MCP_CONFIG`도 무의미. capabilities `mcp:"gemini-json", receive:"both"`는 과대 표기 | 프로젝트 `.gemini/settings.json`에 merge-write하거나, 될 때까지 capabilities를 `env-only`/`cli-inbox`로 강등하고 ADAPTERS.md 수정 |
| **Med (M-3)** | Codex 어댑터가 `~/.codex/config.toml`에 무단 append(`codex.ts:76-85`)하는데 append 블록에 `[mcp_servers.fable.env]`(FABLE_SESSION) 누락 — `fable run` 밖에서 codex를 직접 띄우면 MCP 서버가 default 세션으로 붙어 **M-1이 codex 경로에서 부분 재발**. 블록 존재 시 갱신도 안 되어 절대경로 stale 위험 | append 전 사용자 확인(또는 `--write-config` opt-in); env 블록 포함; 기존 fable 블록은 마커 주석 기반으로 교체 |
| Low | `Room.isOnline`이 미등록 peer에 `true` 반환 (`undefined !== null`, `room.ts:150-152`). 현재 호출처 없음(잠복 버그) | `m ? m.socket !== null : false`로 수정 또는 삭제 |
| Low | sanitize가 U+00A0 이상 전 코드포인트 허용 — PLAN의 "printable Unicode allowlist" 표현 대비 bidi override/zero-width 스푸핑 미방어 | U+202A-202E, U+2066-2069, zero-width류 strip 추가 |
| Low | claude `ensureMcpConfig` 산출물(`.fable/claude.mcp.json`)은 `cmdRun`에서 미사용 — `mcpCliFlag`면 globalMcp 사용(`cli:537-540`). 무해한 중복 | 하나로 통일 |
| Low | `check_handoffs`는 "preview"가 아니라 전체 body 반환(`tools.ts:96-107`); sanitize는 relay ingest 시점에만 적용 | PLAN 문구 수정 또는 출력측 재-sanitize(심층방어) |

### Decision notes

테스트는 코드에서 존재·정합성을 확인했으나 이번 리뷰에서 직접 실행은 하지 않음(read-only 검토) — API 시그니처는 테스트와 일치. hetero 테스트는 "claude→codex"라는 이름과 달리 agentKind 문자열만 다른 동일 코드 경로다. Phase 2의 자체 기준("CLI 설치 불요")은 충족하나, "hetero handoff done"의 실증 강도는 claude(`--mcp-config`, 실동작) > codex(전역 config 경유, M-3 조건부) > gemini(미배선) 순으로 불균등하다. **M-2/M-3 해소 또는 capability matrix의 정직한 강등** 후 Phase 2를 `approved`로 전환 권장.

관련 파일: `packages/adapters/src/{claude,codex,gemini}.ts`, `packages/relay/src/room.ts`, `packages/cli/src/index.ts`, `packages/protocol/src/sanitize.ts`, `packages/relay/src/hetero.handoff.test.ts`

승인 시: `docs/PLAN.md` Version → **0.2.3** (PATCH) — M-2/M-3를 Phase 2 완료 기준에 반영하거나 capability matrix를 코드 실태에 맞게 하향 조정 후 Status 유지.

---

## Review R4 — Plan v0.2.3

**검토 대상:** `docs/PLAN.md` **v0.2.3** (R3 M-3/Grok wiring 수정 주장 검증)
**검토자:** Fable 5 — 코드 직접 확인 (`packages/adapters`, `relay`, `protocol`, `mcp-server`, `cli`)
**날짜:** 2026-07-09
**결론:** **`approved`** (조건부: 신규 **H-4**를 **0.2.4 PATCH**로 수정. 재리뷰 불필요)

R3의 6개 수정 주장은 모두 코드와 실질 일치한다 — opt-in 게이트·managed upsert·session env·isOnline·bidi/ZW sanitize·출력측 재-sanitize·claude null 반환 전부 실재하며 테스트도 있다. 단, **upsert의 legacy 분기가 v0.2.2가 만든 바로 그 무마커 블록을 만나면 `[mcp_servers.fable]` 테이블을 중복 정의해 TOML 전체를 무효화**한다(중복 테이블은 TOML 파스 에러) — M-3 수정 자체의 주 마이그레이션 경로에 결함이 있어 이것만 PATCH 필수.

### Checklist

| # | 항목 | 판정 | 근거 |
|---|------|------|------|
| 1 | Codex opt-in / env / upsert | **Yes** | 게이트 `adapters/src/codex.ts:63-73`(`opts.writeUserConfig`일 때만 `~/.codex` 기록), 플래그 배선 `cli/src/index.ts:528,546-553`; `FABLE_SESSION` env 블록 `user-mcp-config.ts:26-31` + `cli:522-524`; 마커 기반 교체 `user-mcp-config.ts:52-63`, 테스트 `user-mcp-config.test.ts:28-49`. **단 legacy 무마커 블록 분기(`:64-71`)는 H-4 참조** |
| 2 | Grok 추가 / Gemini 제거 | **Partial** | `grok.ts` 실재, registry 등록 `adapters/src/index.ts:15-20`, gemini 잔재 없음(부재 단언 테스트 `adapters.test.ts:22-27`). Codex와 동일한 opt-in 게이트 `grok.ts:64-72`. **그러나 grok CLI가 `~/.grok/config.toml`의 `[mcp_servers.*]` TOML을 실제로 읽는다는 근거가 레포에 없음** — M-2 판정 불가(하단 M-4) |
| 3 | `isOnline` 수정 | **Yes** | `relay/src/room.ts:150-154` — 미등록 peer `false` |
| 4 | bidi/ZW strip + 재-sanitize | **Yes** | `protocol/src/sanitize.ts:5-16,44-46` (U+202A-E, U+2066-9, ZWSP/ZWNJ/ZWJ/WJ/BOM/SHY), 테스트 `sanitize.test.ts:26-30`; `sanitizeHandoffForOutput`(`sanitize.ts:88-100`)을 `check_handoffs`(`mcp-server/src/tools.ts:103-107`), `claim_handoff`(`tools.ts:128-133`)에 적용 |
| 5 | Claude null + 글로벌 `--mcp-config` SSOT | **Yes** | `claude.ts:59-61` null 반환; `cli:557-558`에서 globalMcp 선택; spawn 시 `--mcp-config` `claude.ts:31-34`. (미사용 mirror `.fable/claude.mcp.json`은 여전히 기록 — 문서화됨, 무해) |
| 6 | ADAPTERS.md `opt-in` 표기 | **Yes** | `docs/ADAPTERS.md:8-13` matrix, `:21-47` opt-in 정책·managed block·교체 규칙 명시. `agents --matrix`도 `user-cfg` 컬럼 출력 `cli:341-353` |

### Findings

| Sev | Finding | Suggested change |
|-----|---------|------------------|
| **High (H-4, 신규)** | `upsertUserMcpConfig`의 legacy 분기(`user-mcp-config.ts:64-71`): 마커 없는 기존 `[mcp_servers.fable]`(= **v0.2.2 M-3 append가 남긴 정확히 그 형태**)이 있으면 경고 주석 + managed 블록을 그냥 append → `[mcp_servers.fable]` 테이블 **중복 정의로 config.toml 전체가 invalid TOML**. codex(Rust toml)는 파스 에러로 config를 통째로 거부 — 사용자의 codex 자체가 깨짐. v0.2.2→0.2.3 업그레이드 + `--write-user-config`가 트리거 | legacy 섹션을 헤더(`[mcp_servers.fable]`)부터 다음 최상위 `[` 헤더 직전까지 제거 후 managed 블록 삽입하거나, 제거 불가 시 **쓰지 말고** actionable 에러로 중단. legacy-present 케이스 테스트 추가 (현 테스트 3종엔 이 케이스 없음) |
| **Med (M-4)** | Grok CLI 설정 스펙 미검증 — `~/.grok/config.toml` + TOML `[mcp_servers]` + `enabled = true`가 실제 grok CLI 스펙이라는 근거가 코드·문서 어디에도 없음. 만약 grok이 JSON settings 등 다른 경로/포맷을 쓰면 **M-2가 opt-in 경로에서 재발** | ADAPTERS.md의 `grok mcp list` 스모크를 Phase 2 수용 기준으로 승격(1회 수동 검증 기록이라도). 검증 전까지 grok capabilities를 `receive:"cli-inbox"`로 하향하는 것도 정직한 대안 |
| Low | 기본(플래그 없음) 경로에서 codex/grok의 project `.fable/*.mcp.toml`은 **어떤 CLI도 읽지 않는 관성 파일** — M-2 패턴의 잔재. 다만 이번엔 문서·런타임 힌트(`cli:563-566`)로 정직하게 고지되어 있어 과대표기는 아님 | codex는 `-c mcp_servers.fable.command=...` CLI override(글로벌 config 무접촉, 세션 스코프)를 지원하므로, 이를 쓰면 M-3류 문제를 근본 제거 가능 — 0.3.x 검토 권장 |
| Low | `parseArgs`(`cli:85-106`)가 `--write-user-config codex`처럼 플래그 뒤 positional을 값으로 삼킴 → agent 인자가 사라져 auto-pick으로 **의도치 않은 어댑터**에 대해 동작할 수 있음 | boolean 플래그 allowlist로 파싱 |
| Low | usage 배너 `cli:44` "PLAN 0.2.1" 표기 (VERSION은 0.2.3) | 문자열 갱신 |

### Decision notes

R3 follow-up 표의 8개 항목 전부 코드로 실증됨 — 이번 사이클의 수정 성실도는 높다. H-4는 "무단 append 제거"라는 M-3 수정의 취지를 마이그레이션 케이스에서 뒤집는 단일 함수 결함이므로 PATCH로 충분하며, 기본 경로(opt-in 미사용)는 안전하다. 절차 메모: PLAN이 R4 사인오프 전에 자체적으로 `approved`(PLAN.md:7,410-411)를 선기재했다 — H-4 반영한 0.2.4에서 Approval block에 R4 참조를 넣을 것. M-4는 외부 CLI 스펙 문제라 read-only 리뷰로는 판정 불가 — `grok mcp list`에 `fable`이 뜨는지 1회 확인이 판정 기준이며, 뜨면 M-4 종결, 안 뜨면 M-2 재발로 grok capabilities 하향 필요.

관련 파일: `packages/adapters/src/user-mcp-config.ts`, `packages/adapters/src/{codex,grok,claude}.ts`, `packages/cli/src/index.ts`, `packages/protocol/src/sanitize.ts`, `packages/mcp-server/src/tools.ts`, `packages/relay/src/room.ts`, `docs/ADAPTERS.md`

승인 조건: **0.2.4 PATCH**에 H-4 수정 + legacy-block 테스트 추가. M-4는 스모크 검증 기록으로 종결 가능(재리뷰 불필요).

---

## Review R5 — Plan v0.3.0

**검토 대상:** `docs/PLAN.md` **v0.3.0** (Part A: 0.2.4 H-4 이월 검증 + Part B: Phase 3 원격 relay 신규 검증)
**검토자:** Fable 5 — 코드 직접 확인 (`packages/adapters/src/user-mcp-config.ts`, `packages/relay`, `packages/protocol/src/relay-url.ts`, `packages/cli`, `packages/mcp-server`)
**날짜:** 2026-07-09
**결론:** **`pending-revision`**

Part A(H-4)는 **완결**이다. `stripAllFableMcpSections`가 마커 없는 v0.2.2 잔재를 정확히 제거하고, 회귀 테스트가 해당 케이스를 커버하며, `parseArgs`의 boolean allowlist도 확인됐다. 그러나 Part B는 "구현했다"는 주장 자체는 사실이지만(토큰 인증, 원격 no-spawn, 재연결+백오프, 동일 sanitize 경로, README), **첫 네트워크 노출 치고 fail-open 기본값과 토큰 취급이 허술하다**. 특히 (a) 0.0.0.0 무토큰 바인드가 경고만 출력하고 그대로 기동하고, (b) 토큰이 WS URL 쿼리로 전달되어 권장 배포 구성(리버스 프록시)의 access log에 매 연결마다 기록되며, `/rooms`가 모든 inviteCode를 반환하므로 토큰 유출 = 전 룸 접근이 된다. High 2건이 해소되는 PATCH(0.3.1) 전까지 Phase 3를 done으로 표기하지 말 것.

### Checklist

| # | 항목 | 판정 | 근거 |
|---|------|------|------|
| A-1 | H-4 strip + 회귀 테스트 + parseArgs | **Yes** | `adapters/src/user-mcp-config.ts:44-116` — 마커 블록 루프 제거 후, 라인 기반으로 fable 주석·`[mcp_servers.fable(.env)]` 헤더부터 다음 `[` 헤더 직전까지 제거, `upsertUserMcpConfig`(125-160)가 항상 strip 후 append. 테스트 `user-mcp-config.test.ts:76-118`이 v0.2.2 정확한 잔재 형태(주석+마커 없는 테이블, 뒤에 `[ui]` 존재)로 단일 테이블 헤더·주변 섹션 보존을 검증. `cli/src/index.ts:44-52,106-115` — `BOOLEAN_FLAGS`에 `write-user-config` 포함, 값 삼킴 없음. 잔여 미비: 테스트가 실제 TOML 파서 검증 없이 문자열 단정만 함 (Low) |
| B-1 | 모든 WS/HTTP 경로 인증 | **Partial** | `/ws`·`/` 업그레이드(`server.ts:91-97`), `/rooms`(80-90) 인증. `/health`(69-79)와 catch-all 배너(99-102)는 무인증 — health는 의도적(테스트 `auth.integration.test.ts:22-27`)이나 room 수·버전 노출 (Low) |
| B-2 | 타이밍 안전 비교 | **No** | `server.ts:165,167` — `q === this.authToken`, `auth === \`Bearer ${...}\`` 단순 비교 |
| B-3 | 토큰 전달: 쿼리 vs 헤더 | **Partial(쿼리가 주 경로)** | 서버는 둘 다 수용(`server.ts:162-169`)하고 헬스체크는 Bearer 사용(`relay-daemon.ts:22-25`)하나, 실제 WS 연결은 `?token=` 포함 URL(`relay-url.ts:89-92` → `relay-client.ts:64`). 이 URL이 `session.json`에 평문 저장(`cli/src/index.ts:163-172`)되고 Share 힌트에 토큰 출력(189-191) |
| B-4 | 기본 토큰 / fail-open 여부 | **Partial** | 예측 가능한 기본값은 없음 — 빈 문자열은 `||`로 unset 처리(`server.ts:43`). 그러나 토큰 미설정 시 `authorizeHttp`가 무조건 true(**fail-open**, `server.ts:163`)이고, 0.0.0.0 무토큰 바인드는 `relay/src/cli.ts:25-29` console.warn 후 그대로 기동. `fable relay` 서브커맨드(`cli/src/index.ts:838-863`)는 경고도 아닌 힌트 문자열뿐 |
| B-5 | 재연결 시 peer 신원 재사용 | **Yes** | `relay-client.ts:230-235`(joinRoom이 peerId 고정 저장) + 126-129(재조인 시 재사용); 서버는 `room.ts:104-114` upsert로 소켓 재부착, `server.ts:221-241` wasMember→presence 브로드캐스트. 유령/중복 피어 없음. 단, stale close 레이스 존재 (M-6) |
| B-6 | 재연결 backoff/제한 | **Yes** | `relay-client.ts:105-119` — 지수 백오프 1s·2^n, 15s cap, 기본 20회 제한. 주의: open 성공 시 카운터 리셋(:69)이라 플래핑 연결은 사실상 무한 재시도 (Low) |
| B-7 | sanitize/inbox/roster 동일 경로 | **Yes** | 원격 클라이언트도 동일한 `RelayServer.handleMessage` → `Room`(sanitize: `room.ts:103,216-250`, inbox/roster 동일). MCP 도구도 `session.relayUrl`로 같은 `RelayClient` 사용(`mcp-server/src/tools.ts:20-24`). 원격 전용 우회 경로 없음 |
| B-8 | TLS 프록시 전제 문서화·강제 | **Partial** | `apps/relay-cloud/README.md:45-57` 문서화 O. 코드는 항상 평문 ws(`server.ts:47`), 프록시 부재 감지·경고 없음. 무토큰 원격 바인드 경고만 존재. 토큰 설정 + 평문 0.0.0.0이면 공유 시크릿이 평문+쿼리로 인터넷에 노출 가능 |

### Findings

| Sev | Finding | Suggested change |
|-----|---------|------------------|
| **High H-5** | 0.0.0.0(비루프백) 바인드 + 무토큰 = fail-open, 경고만 출력하고 기동 (`relay/src/cli.ts:25-29`, `server.ts:163`) | 비루프백 바인드 시 토큰 없으면 **기동 거부**; 명시적 `--insecure-open` 플래그로만 허용 |
| **High H-6** | 토큰이 WS URL 쿼리로 전달 → 권장 프록시(nginx/Caddy) access log에 매 연결 기록; `session.json`에 평문 저장 + `Share:` 라인에 터미널 출력. `/rooms`가 전체 inviteCode 반환(`room.ts:416-430`)이라 토큰 유출 = 전 룸 접근 | WS도 `Authorization: Bearer` 헤더 우선(Bun WebSocket은 headers 옵션 지원), 쿼리는 fallback. 세션에는 토큰을 relayUrl에서 분리 저장하고 파일 0600. Share 힌트에 토큰 기본 미출력(`--show-token` opt-in) |
| Med M-5 | 토큰 비교가 단순 `===` (`server.ts:165,167`) | `crypto.timingSafeEqual`(길이 정규화 포함)로 교체 — 한 줄 수정 |
| Med M-6 | **stale-socket 레이스**: 재연결로 새 소켓이 붙은 뒤 구 소켓의 지연된 close 이벤트가 `setOffline`을 무조건 호출(`server.ts:141-151` → `room.ts:133-139`, 소켓 동일성 비교 없음) → 재연결된 피어가 offline 처리되어 notify가 죽고 `queued`로 강등. 자동 재연결(~1s)과 서버의 TCP 사망 감지(수 초~분) 시차 때문에 재현 확률 높음 | close 핸들러에서 해당 ws가 member의 **현재** 소켓일 때만 offline 처리 |
| Med M-7 | peerId가 클라이언트 제공값이고 소유 증명 없음 — 토큰+초대코드를 가진 누구나 타 피어 id로 join해 신원 탈취·상대 inbox claim 가능(`server.ts:221-231`, `room.ts:104-114`). 로컬에선 무해했으나 원격 멀티유저에선 실질 위협 | 0.3.0 "Not in scope" 인정하되 README 위협모델에 명시; 0.3.x에서 join 시 per-peer secret 발급·재조인 시 검증 |
| Low | `/health`가 무인증으로 room 수·프로토콜 버전 노출 (`server.ts:69-79`) | `{ok:true}`만 반환하거나 상세는 인증 후 |
| Low | `sendTo`가 half-open 소켓에도 send 성공 처리 → `notified`/`delivered` 오탐 (`room.ts:156-165`, ping/heartbeat 없음) | WS ping 또는 ack 기반 notified로 후속 개선 |
| Low | H-4 테스트가 문자열 단정만 하고 TOML 파서로 유효성 검증 안 함 (`user-mcp-config.test.ts:113-117`) | `Bun.TOML.parse`(또는 smol-toml)로 결과 파싱 단정 1줄 추가 |
| Low | 재연결 카운터가 open 시 리셋되어 플래핑 시 무한 재시도(`relay-client.ts:69`); room GC 없음(`room.ts:412-414`)·rate limit 없음 — 토큰 보유자의 메모리 고갈 가능 | MVP 수용 가능, PLAN Risk register에 명시 |

### Decision notes

Part A는 종결됐다. H-4의 실패 모드(중복 `[mcp_servers.fable]` 테이블)는 strip-then-append 구조상 재발 불가 — `upsertUserMcpConfig`가 항상 strip을 먼저 실행하므로 legacy 분기 자체가 사라졌다.

Part B의 골격은 건전하다. 특히 원격/로컬이 별도 코드 경로 없이 동일한 `handleMessage`→`Room`을 타는 설계(B-7)와 roster upsert 기반 신원 재사용(B-5)은 R2 H-1 계약을 원격에서도 그대로 유지한다. `ensureRelay`의 원격 no-spawn(`relay-daemon.ts:57-73`)도 주장대로다.

재리뷰 조건: **H-5, H-6 수정 + M-5(1줄), M-6 수정**을 담은 0.3.1 PATCH. M-7은 위협모델 문서화만으로 0.3.x 이연 가능. H-5/H-6은 코드 양이 아니라 기본값의 문제라 반나절 작업이다 — 이 제품의 첫 네트워크 노출에서 "경고 후 열어줌"을 기본값으로 승인하면 이후 버전에서 되돌리기 훨씬 어렵다.

관련 파일: `packages/adapters/src/user-mcp-config.ts`, `packages/relay/src/{server,cli,room}.ts`, `packages/protocol/src/relay-url.ts`, `packages/host/src/relay-client.ts`, `packages/cli/src/index.ts`, `apps/relay-cloud/README.md`

승인 시: `docs/PLAN.md` Version → **0.3.1** (PATCH) — H-5/H-6/M-5/M-6 반영 후 Phase 3를 `done`으로 유지, 미반영 시 Phase 3 상태를 `in-progress`로 하향 표기.

---

## Review R6 — Plan v0.4.0

**검토 대상:** `docs/PLAN.md` **v0.4.0** (Part A: 0.3.1 H-5/H-6/M-5/M-6 이월 검증 + Part B: Phase 4.0a Sticky Host 신규 검증)
**검토자:** Fable 5 — 코드 직접 확인 (`packages/relay`, `packages/host`, `packages/protocol/src/relay-url.ts`, `packages/cli`, `packages/mcp-server`)
**날짜:** 2026-07-09
**결론:** **`pending-revision`**

Part A(0.3.1 이월 4건)는 **전부 코드·테스트로 실증 확인** — Phase 3 baseline 승인 유지. Part B는 설계 방향(루프백 고정, 랜덤 토큰, 폴백)은 건전하나 **신규 RPC 경로가 M-5에서 고친 단순 `===` 토큰 비교로 회귀**했고(예측된 회귀 패턴 그대로), **host 기동 후 room 재-join 시 host가 구 세션으로 계속 응답**하는 정합성 결함, **동시 RPC 시 ack 혼선** 2건의 신규 결함이 있다. 셋 다 국소 수정(PATCH 0.4.1)으로 해소 가능.

### Checklist

**Part A — 0.3.1 이월**

| # | 항목 | 판정 | 근거 |
|---|------|------|------|
| H-5 | 비루프백+무토큰 기동 거부 | **Yes** | `relay/src/server.ts:93-106` — `assertBindAllowed()`가 `start()` 첫 줄에서 **throw**(경고 아님); `relay/src/cli.ts:22-27`, `cli/src/index.ts:959-964` 모두 `exit(1)`. 테스트 `auth.integration.test.ts:133-152` |
| H-6 | Bearer 우선 / 토큰 분리 / Share 숨김 / 0600 | **Yes** | `host/src/relay-client.ts:74-89`(query는 `FABLE_RELAY_TOKEN_IN_QUERY` opt-in만); `session-store.ts:24,67-77,100-108`(`relayToken` 분리+strip+0600); `cli/src/index.ts:209-219`(`--show-token` opt-in); `relay-url.ts:77-102` `buildWsUrl` 기본 토큰 미포함, 테스트 `relay-url.test.ts:34-56` |
| M-5 | 타이밍 세이프 비교 | **Yes** | `server.ts:43-55` 패딩+`timingSafeEqual`, `authorizeHttp:217-219`에서 Bearer/query 모두 사용 |
| M-6 | 소켓 동일성 비교 후 offline | **Yes** | `room.ts:145-152` `m.socket !== socket`이면 무시; `server.ts:193-197` close 핸들러 적용; 테스트 `auth.integration.test.ts:180-198` |

**Part B — Phase 4.0a**

| # | 항목 | 판정 | 근거 |
|---|------|------|------|
| 1 | 루프백 전용 바인드 | **Yes** | `sticky-server.ts:180` `hostname: "127.0.0.1"` 하드코딩, env 오버라이드 없음 |
| 2 | 토큰 생성/0600 race | **Yes** | `sticky-meta.ts:37-39` `randomBytes(24).base64url`; `:45-48` `writeFileSync(..., mode: 0o600)` — 생성 시점에 모드 적용되어 창 없음 |
| 3 | RPC 토큰 타이밍 세이프 | **No** | `sticky-server.ts:192` **`if (bearer !== token)`** — 단순 비교 회귀 (F-1) |
| 4 | 중복 start / stale meta | **Partial** | 순차 재실행은 idempotent(`sticky-spawn.ts:32-39` ping 후 재사용); kill -9 후 `isPidAlive` false → meta 정리 후 재기동(`sticky-meta.ts:80-88`, `sticky-client.ts:25-29`); PID 재사용도 ping 실패→oneshot 폴백으로 안전. 단 **동시 start 2회는 check-then-act race**로 고아 데몬 발생 (F-4) |
| 5 | H-1 계약 충돌 | **Partial** | inbox는 항상 enqueue(`room.ts:293-328`), claim은 `queued\|notified` 대상이라 **유실 없음**; kill -9는 fd 즉시 닫혀 offline 전환 빠름. 단 WS heartbeat 미설정으로 원격 half-open 시 `delivered` 오판 창 존재 + host가 notify envelope를 **무시**(어디에도 표출 안 함) (F-5) |
| 6 | `via` + 타임아웃 폴백 | **Yes** | `mcp-server/src/tools.ts:22,45,53,62,85` `via: r.source`; `sticky-client.ts:50` `AbortSignal.timeout(8s)` → `rpc_failed` → `tryStickyRpc` null(`:79-82`) → `room-ops.ts` 각 op에서 one-shot 폴백. 무한 대기 없음(최악 +8s) |
| 7 | 로컬 유저 전용 강제 | **Partial** | 루프백+Bearer+0600 조합으로 타 계정 접근 불가(파일 못 읽음, 무토큰 401). 단 포트 자체는 모든 로컬 유저가 접근 가능하므로 유일한 방벽이 토큰이고, 그 비교가 F-1로 약화됨. F-1 수정 시 Yes |

### Findings

| Sev | Finding | Suggested change |
|-----|---------|------------------|
| **High (F-2)** | **host↔세션 불일치.** host 기동 후 `fable room join/create`로 세션이 바뀌어도 `resolveLiveHostMeta`(`sticky-client.ts:16-30`)는 roomId/peerId를 현 세션과 비교하지 않고, `cmdRoomJoin/Create`(`cli/src/index.ts:231-280`)도 host를 정리하지 않음 → 이후 `fable handoff`가 **구 room으로 조용히 전송**(내용 오배달, M-1 1:1 계약 위반) | `resolveLiveHostMeta`에서 `meta.roomId/peerId !== loadSession()` 이면 stale 취급(oneshot 폴백)+경고; room join/create 시 기존 host stop 또는 재기동 |
| Med (F-1) | **M-5 회귀.** `sticky-server.ts:192` `bearer !== token` 단순 비교 — 0.3.1에서 고친 취약점 클래스를 신규 특권 표면(로컬 IPC, 저지터 환경)에 재도입 | `timingSafeTokenEqual`을 `@fable/protocol`로 이동 후 relay·sticky 양쪽에서 사용 |
| Med (F-3) | **동시 RPC ack 혼선.** Bun.serve는 `/rpc`를 동시 처리하는데 단일 `RelayClient.requestOnce`(`relay-client.ts:378-411`)는 **envelope 타입으로만 매칭** → 동시 handoff 2건이 같은 첫 `handoff.ack`로 둘 다 resolve(잘못된 handoffId/status 반환), `inbox.claim_result`도 동일(first-wins 결과 오귀속 가능) | `handleRpc`를 promise 체인으로 직렬화(최소 수정) 또는 프로토콜에 correlation id |
| Low (F-4) | **동시 `host start` race.** `sticky-spawn.ts:32-56` check-then-act → 데몬 2개가 같은 peerId로 join, 나중 것이 meta 덮어써 먼저 것은 `host stop`으로 못 죽이는 고아가 됨 | 데몬이 주기적으로 meta.pid==자기 pid 확인 후 아니면 자진 종료, 또는 lock 파일 |
| Low (F-5) | **notify 삼킴 + delivered 의미 약화.** host는 `onEnvelope` 없이 notify를 버림 — 송신자는 `delivered`를 받지만 수신측 인간/에이전트는 폴링 전까지 아무것도 못 봄; 원격 relay에서 WS ping 미설정 시 half-open으로 오판 창 연장 | host가 notify를 로그/`host status`에 표출; PLAN에 "delivered = 데몬 수신" 명시; relay WS `idleTimeout`/ping 설정 |
| Low (F-6) | `/health`(`sticky-server.ts:184-186`) 무인증 pid 노출; `sticky-client.ts:22-24` 빈 비교 dead code | 정리 (선택) |

### Decision notes

**sanitize 우회 없음**: host RPC는 입력(`sanitizePeerText`)·출력(`sanitizeHandoffForOutput`) 모두 적용(`sticky-server.ts:118-121,134,105-108`), relay 서버측 sanitize도 그대로 통과 — 이중 방어 유지.

프로파일 매핑 자체는 정확: meta 경로가 `sessionPath()` 파생(`sticky-meta.ts:27-35`), spawn 시 `FABLE_SESSION`/`FABLE_PROFILE` 전파(`sticky-spawn.ts:42-47`). 문제는 F-2의 "세션 파일이 나중에 바뀌는" 경우뿐.

통합 테스트(`sticky-host.integration.test.ts`)는 ping/status/peers/handoff/401을 커버하나 **동시 RPC·재-join 불일치 케이스 없음** — F-2/F-3 수정 시 테스트 추가 권장.

**재리뷰 경로**: F-1·F-2·F-3 수정 후 0.4.1 PATCH로 제출하면 approve 가능성 높음. F-4/F-5는 0.4.1 문서화+후속으로 수용 가능.

관련 파일: `packages/host/src/{sticky-server,sticky-meta,sticky-spawn,sticky-client,relay-client,session-store}.ts`, `packages/relay/src/{server,cli,room}.ts`, `packages/protocol/src/relay-url.ts`, `packages/cli/src/index.ts`, `packages/mcp-server/src/tools.ts`

승인 시: `docs/PLAN.md` Version → **0.4.1** (PATCH) — F-1(타이밍 세이프)/F-2(host-세션 불일치)/F-3(동시 RPC ack) 반영 후 Phase 4.0a를 `done`으로 유지, 미반영 시 `in-progress`로 하향 표기.

---

## Review R7 — Plan v0.5.0

**검토 대상:** `docs/PLAN.md` **v0.5.0** (Part A: 0.4.1 F-1/F-2/F-3 이월 검증 + Part B: Phase 4.1 Context Pack 신규 검증)
**검토자:** Fable 5 — 코드 직접 확인 (`packages/host/src/{sticky-server,sticky-client,sticky-spawn,room-ops,context-pack}.ts`, `packages/cli`, `packages/mcp-server`, `packages/protocol`, `packages/relay`)
**날짜:** 2026-07-09
**결론:** **`approved`** (Low follow-up 5건은 0.5.1 PATCH로 처리 가능, 재리뷰 불필요)

Part A의 세 가지 수정은 모두 코드에 실재하며 각각 회귀 테스트가 있다. Part B의 context pack은 주장대로 구현됐다 — allowlist는 root와 candidate 양쪽에 `realpathSync`를 적용해 symlink/`..` 탈출을 모두 차단하고, 공유는 opt-in이며, **전송되는 것은 cwd-상대 경로 문자열뿐이고 수신측에서 path attachment를 파일시스템 접근에 사용하는 코드는 코드베이스 어디에도 없다**(가장 우려했던 "송신자 경로를 수신자가 그대로 해석" 시나리오는 해소됨). 발견된 문제는 전부 Low로, 승인 차단 사유가 아니다.

### Checklist

**Part A — 0.4.1 이월**

| # | 항목 | 판정 | 근거 |
|---|------|------|------|
| A-1 (F-1) | sticky Bearer timing-safe 비교 | **Yes** | `host/src/sticky-server.ts:202-210` — `timingSafeTokenEqual(bearer, token)`(`@fable/relay` import, :22). 401 테스트 `sticky-host.integration.test.ts:121-131` |
| A-2 (F-2) | 세션 변경 감지 + host stop | **Yes** | `host/src/sticky-client.ts:36-50` `resolveLiveHostMeta`가 meta.roomId/peerId ≠ session이면 null → one-shot fallback. `cli/src/index.ts:173-181` `stopStickyBeforeSessionChange`가 `cmdRoomCreate`(:184), `cmdRoomJoin`(:258), `cmdRoomLeave`(:950)에서 호출. `sticky-spawn.ts:37-48`도 stale host를 재시작 전에 stop. 테스트 `sticky-host.integration.test.ts:133-173` |
| A-3 (F-3) | 동시 RPC 직렬화 | **Yes** | `host/src/sticky-server.ts:75,182-189` `runSerializedRpc` promise chain, fetch 핸들러 :220에서 사용. 테스트 :175-191 — 기존 버그(중첩 `onEnvelope` 핸들러가 동일 ack로 둘 다 resolve → 동일 handoffId)를 정확히 잡는 assert |

**Part B — Phase 4.1 Context Pack**

| # | 항목 | 판정 | 근거 |
|---|------|------|------|
| B-1 | cwd realpath allowlist / symlink·`..` 차단 | **Yes** (테스트는 Partial) | `host/src/context-pack.ts:126-160` — root와 candidate 모두 `realpathSync` 후 `relative()`가 `..`로 시작하면 거부. symlink→`/etc/passwd`는 realpath가 밖으로 풀려 거부됨. 단 `context-pack.test.ts:71-77`은 `../` 순회만 테스트, **symlink 케이스 테스트 없음** (L-2) |
| B-2 | 파일명 해시에 roomId 포함/충돌 | **Yes** | `context-pack.ts:54-57` `sha256(roomId)` 상위 16hex(64bit) — 충돌 사실상 불가. load 시 `raw.roomId !== id`면 empty 반환(:81-83). 단 profile별 분리는 안 됨 (L-1) |
| B-3 | `--with-pack`/`withPack` opt-in | **Yes** | CLI `cli/src/index.ts:372` `Boolean(flags["with-pack"])` 기본 false; MCP `mcp-server/src/stdio.ts:145` `Boolean(args.withPack)`; `host/src/room-ops.ts:105` `if (args.withPack)`일 때만 첨부 |
| B-4 | summary/notes sanitize | **Yes** | 4중 방어: 저장 시(`context-pack.ts:104-107`), 첨부 생성 시(:273-297), relay ingest(`relay/src/room.ts:249-258`), 출력 시(`protocol/src/sanitize.ts:88-100`, `format.ts:25-31`) |
| B-5 | 수신측이 path attachment로 파일 접근? | **No (안전)** | 전 패키지 grep 결과 attachment `content`를 fs API에 넘기는 코드 없음 — `protocol/src/format.ts:25-31`은 sanitize 후 텍스트 출력만. `handoff-inject.ts`는 표시/미사용 스파이크뿐. 또한 전송값은 절대경로가 아닌 **cwd-상대 rel 경로**(`context-pack.ts:193,285`)라 송신자 홈경로 노출도 없음. 잔여 리스크는 수신 *에이전트*가 자체 도구로 경로를 여는 out-of-band 행동 (L-3) |
| B-6 | `get_context_pack` 로컬 전용 | **Yes** | `mcp-server/src/tools.ts:55-67` → `loadContextPack()` — 자기 session.roomId로 `~/.fable/packs`만 읽음. relay/peer 조회 경로 없음 |

### Findings

| Sev | Finding | Suggested change |
|-----|---------|------------------|
| Low (L-1) | pack이 roomId로만 키잉되어 같은 머신·같은 OS 유저의 **두 프로필이 같은 room이면 pack 파일을 공유** — M-1 2-프로필 데모에서 bob의 `--with-pack`이 alice가 작성한 pack을 전송. UID 경계 침해는 아니나 의도치 않은 귀속 | 의도된 "room-scoped shared" 동작이면 PLAN에 명시; 아니면 `sha256(roomId + sessionPath)` 키잉 |
| Low (L-2) | symlink 탈출 회귀 테스트 부재 (코드는 방어함) | `context-pack.test.ts`에 cwd 내 symlink→외부 파일 add 거부 테스트 추가 |
| Low (L-3) | pack path attachment label이 사용자 label로 대체 가능(`context-pack.ts:285`)해 수신측이 pack 경로임을 식별 불가 + hint에 "경로는 송신자 머신 기준" 경고 없음 | label을 `context-pack-path:<label>`로 고정 prefix; `adapters/src/hints.ts`에 sender-relative 경고 1줄 |
| Low (L-4) | F-3의 근본 원인(`relay-client.ts:378-397` `requestOnce`의 envelope **타입** 매칭)은 남아 있고 sticky RPC 계층 직렬화로만 봉합 — 향후 RelayClient를 동시 공유하는 코드가 생기면 재발 | 클라이언트 생성 handoff id + ack 상관관계 매칭을 백로그에 기록 |
| Low (L-5) | v2에서 파일 본문 embed 시 add-시점 검증만으로는 TOCTOU(add 후 symlink 교체) 노출 | v2 착수 시 read-시점 `resolveAllowlistedPath` 재검증을 완료 기준에 포함 |

### Decision notes

0.4.1 Changelog 주장과 코드가 정확히 일치. F-3 테스트는 "distinct handoffIds" assert가 약해 보이지만, 실제 버그 모드(중첩 핸들러가 첫 ack로 양쪽 모두 resolve → 동일 id)를 잡으므로 유효하다.

Part B의 설계상 가장 위험한 지점(수신측 경로 해석)은 **코드가 존재하지 않는 방식**으로 해소됐고, rel 경로만 전송하는 선택이 프라이버시·오해석 양쪽을 줄인다. 이 속성("수신측은 경로를 절대 fs 접근에 사용하지 않는다")을 PLAN Security 표에 invariant로 명문화할 것을 권장 — v2 embed 논의 때 이 선이 지켜져야 한다.

L-1~L-5는 PATCH(0.5.1)로 묶어 처리 가능하며 재리뷰 불요. **0.5.0을 Phase 4.1 baseline으로 승인.**

관련 파일: `packages/host/src/context-pack.ts`, `packages/host/src/sticky-{server,client,spawn}.ts`, `packages/host/src/room-ops.ts`, `packages/cli/src/index.ts`, `packages/mcp-server/src/{stdio,tools}.ts`, `packages/protocol/src/{sanitize,format}.ts`, `packages/relay/src/room.ts`

승인 시: `docs/PLAN.md` Version → **0.5.0** Status `approved`, Phase 4.1 `done` 표기. L-1~L-5는 0.5.1 PATCH 백로그.

### R4 follow-up (적용 완료 — 2026-07-09)

| Finding | 처리 |
|---------|------|
| **H-4** legacy unmarker append → duplicate table | **`stripAllFableMcpSections`** then single managed upsert; test `H-4: legacy v0.2.2 unmarker block` |
| M-4 Grok format | Official `~/.grok/docs/user-guide/07-mcp-servers.md` confirms `[mcp_servers.*]` TOML; smoke: `grok mcp list` after `--write-user-config` |
| Low parseArgs boolean | `BOOLEAN_FLAGS` includes `write-user-config` |
| Low usage PLAN string | `PLAN ${VERSION}` → 0.2.4 |
| PLAN | **v0.2.4** `approved` with R4 in Approval block |

### R3 follow-up (적용 완료 — 2026-07-09)

| Finding | 처리 |
|---------|------|
| M-2 Gemini 미배선 | **Gemini 어댑터 제거** (Grok으로 교체) — obsolete |
| M-3 Codex 전역 append / session env | **opt-in `--write-user-config`** + managed block + `FABLE_SESSION` env + upsert. 기본은 project `.fable/*.toml` only |
| Grok (post-R3) 동형 이슈 | Codex와 **동일 정책** 적용 |
| `isOnline` bug | **fixed** (`false` if unregistered) |
| bidi/ZW sanitize | **added** |
| check/claim re-sanitize | **added** |
| Claude dual mcp path | ensureMcpConfig returns **null**; CLI uses global `--mcp-config` |
| PLAN | **v0.2.3** `approved` |

**Note:** R3 본문은 당시 `gemini.ts` 기준 스냅샷으로 유지. 현재 코드는 `grok.ts` + opt-in user config.

---

# Archived from plan_review.md (2026-07-09 hygiene)

> Full R7–R11 bodies moved out of active `docs/plan_review.md` to keep the live file short.
> R12 remains in active file. Snapshots are as-reviewed; do not treat line numbers as current code.

## Review R11 — Plan v0.9.0 (Fable → Loom rename)

**검토 대상:** `docs/PLAN.md` **v0.9.0** + `docs/RENAME_TO_LOOM.md`(RN1-patched) — product Fable → Loom 구현 diff
**검토자:** Fable 5 — 코드 직접 확인 (Read/Grep; 이 세션은 셸 실행 불가 → `bun test`는 정적 검증으로 대체)
**날짜:** 2026-07-09
**결론:** **`pending-revision`** → **0.9.1 applied / Loom rename baseline approved** (M-14/M-15/M-16 closed)

RN1 필수 5건의 핵심 로직은 모두 실제로 구현됐고(A1~A5 아래 근거), R2~R10 보안 불변식(sanitize, timing-safe, M-7, H-4, H-5)도 리네임 과정에서 손상 없이 보존됐다. 그러나 **live-PID gate를 사후에 무력화하는 하드코딩 `~/.loom` 경로 2곳(M-14)** — RN1 지적 1번이 막으려던 split-brain을 다른 경로로 재도입 — 과 sticky spawn의 레거시 env 기록(M-15), RN1이 요구한 신규 테스트 2종 누락(M-16)이 남아 승인 불가.

### Checklist

| # | 항목 | 판정 | 근거 |
|---|------|------|------|
| A1 | 홈 디렉터리 live-PID gate | **Partial** | `host/src/session-store.ts:141-190` — `~/.loom` 우선, legacy에 live PID(`*.host.json`·`relay.pid`, `collectLivePidsUnder`:73-113) 있으면 rename 중단+안내(:157-167), EXDEV copy는 `.lock`/`.tmp.*` 제외(:115-136). 단 `isPidAlive`는 재사용이 아닌 3번째 복제(:63-71, `sticky-meta.ts:80`과 중복)이고, **M-14가 gate를 우회**하며, gate 단위 테스트 부재(M-16) |
| A2 | MCP dual-strip 정확 구문 앵커 | **Yes** | `adapters/src/user-mcp-config.ts:4-11` 정확 마커, `:11` `\[mcp_servers\.(?:fable\|loom)(?:\.\|])`, `isManagedComment`(:65-73) 정확 구문만 — bare `/loom/i` 없음. `# deadline looming` 보존 테스트 존재(`user-mcp-config.test.ts:137-148`). `hadLegacy` dual(:154-160). H-4 불변식 유지 |
| A3 | Invite prefix 재작성 금지 | **Yes**(테스트만 미비) | mint `LOOM-`(`protocol/src/codes.ts:10`); join은 `registry.getByCode` 전체 코드 `toUpperCase()` 정확 일치(`relay/src/room.ts:503-505`, `server.ts:280`); rewrite 헬퍼 grep 0건. 단 `FABLE-` 코드 join 호환 테스트 없음(M-16) |
| A4 | `INSECURE_OPEN` dual-read 제외 | **Yes** | `protocol/src/env.ts:36-39`, `relay/src/server.ts:76-79`, `relay/src/cli.ts:27-28` 모두 `LOOM_`만 인식; `FABLE_RELAY_INSECURE_OPEN` 읽기 grep 0건 — H-5 재발 없음. 단 계획 §4.1의 "구 env만 설정 시 강한 stderr 경고"는 미구현(Low, 무시 자체는 안전한 방향) |
| A5 | Blast radius 3종 | **Yes** | `/loom`+`/fable` dual(`host/src/slash.ts:13`, 테스트 `slash.test.ts:13-15`); `[LOOM HANDOFF from …]`(`protocol/src/format.ts:23`, 테스트 갱신); `loomSystemHint` 본문 Loom 카피(`adapters/src/hints.ts:2-24`). 잔재: `shell.ts:41` 힌트에 "fable inbox…" 등(Low) |
| B6 | sanitize.ts 무손상 | **Yes** | `protocol/src/sanitize.ts` — ESC/CSI/OSC skip, C0/C1, bidi, zero-width strip 전부 동일; 제품명 문자열 0건; `sanitizeHandoffForOutput`(M-9) 유지 |
| B7 | timing-safe 비교 무손상 | **Yes** | `relay/src/room.ts:41-52` `secretsEqual`, `server.ts:43-55` `timingSafeTokenEqual` — 본문 R5/R10 하드닝 버전 그대로(길이 XOR + `crypto.timingSafeEqual`) |
| B8 | M-7 peerSecret 무손상 | **Yes** | CSPRNG 24B(`codes.ts:32-35`); rejoin 시 secret 필수(`room.ts:131-139`); `peerSecret`은 join 소켓에만(`server.ts:275,321` — roster broadcast 미포함); 세션 0600(`session-store.ts:275-283`); L-15 sticky persist + `setReconnectPeerSecret`(`sticky-server.ts:77-85`, `relay-client.ts:48-53`) 유지 |
| B9 | `@fable/`·`@loom/` 혼재 | **Yes(없음)** | `@fable/` grep 0건; 6개 package.json 전부 `@loom/*`; cli bin `loom`+`fable` alias, root `loom`+`fable` 스크립트 — 계획대로 |
| B10 | 테스트 116 통과 | **미확인(실행 불가)/Partial** | 정적으로는 일관: 16개 파일 `test(` 118건(주장 116과 근사), `FABLE-` 하드코딩 assert 0건(잔존 2건은 CLI usage 텍스트), `envelope.test.ts:151` `/^LOOM-…/`, board·adapters 테스트 신규 이름 기준. 단 RN1 요구 테스트 2종 부재(M-16) — "RN1 tests 포함 green" 기준 미충족 |

### Findings

| Sev | ID | Finding | Suggested change |
|-----|----|---------|------------------|
| **Med** | **M-14** | **하드코딩 `~/.loom`이 migration resolver를 우회** — `host/src/relay-daemon.ts:12-18,85,100`(pidPath/mkdir/pid write)과 `mcp-server/src/config.ts:16,39`(mcp.json/AGENT_HINT)가 `join(homedir(), ".loom")` 직접 사용. live-PID로 migration이 차단된 상태(state home=`~/.fable`)에서 `loom run`(cli `index.ts:1072` `writeMcpConfig`)이나 로컬 relay spawn이 `~/.loom`을 생성하면, 다음 프로세스의 `resolveStateHomeDir`가 `existsSync(loom)`(:147)에서 단락 → `~/.fable`은 영구히 미이관·무경고 방치(세션/보드/팩 고아화, "not in a room"). RN1 지적 1번의 acceptance("no split-brain") 위반 | 두 파일 모두 `loomDir()`/`resolveStateHomeDir()` 경유로 통일(mcp-server는 CLI가 dir를 넘기거나 helper를 protocol/host로 이동). 또는 `resolveStateHomeDir`가 "loom 존재 + legacy 존재 + 미이관" 상태를 감지해 경고/재시도 |
| Med | **M-15** | sticky host spawn이 자식 env에 레거시 이름만 기록 — `host/src/sticky-spawn.ts:53,56` `FABLE_SESSION`/`FABLE_PROFILE`. 계획 §4.1 "write path는 LOOM_*만" 위반; 모든 sticky host가 deprecation 경고를 출력하고, 0.10에서 dual-read 제거 시 조용히 파손 | `LOOM_SESSION`/`LOOM_PROFILE`로 기록(전환기 양쪽 기록도 가) |
| Med | **M-16** | RN1 Phase D 필수 테스트 2종 누락: (1) live-PID gate 단위 테스트(`session-store` 테스트 파일 자체가 없음), (2) `FABLE-` 전체 코드 join 호환 + "no prefix rewrite" 테스트(`room.test.ts:196`은 신규 mint 코드만) | 두 테스트 추가 후 `bun test` 결과 재보고 |
| Low | | `isManagedComment`의 `/WARNING: legacy/i`(`user-mcp-config.ts:71`)가 fable/loom과 무관한 일반 구문 — 사용자 주석 `# WARNING: legacy config` 오삭제 가능 | `WARNING: legacy \[mcp_servers\.(fable\|loom)\]` 등으로 스코프 한정 |
| Low | | §4.1 약속한 "구 `FABLE_RELAY_INSECURE_OPEN`만 설정 시 강한 stderr" 미구현(조용히 무시) | 기동 시 구 env 감지 → 1회 경고 출력 |
| Low | | copy fallback이 검증 없이 legacy 삭제 — `session-store.ts:176-182` 주석("leave legacy in place")과 코드(`rmSync`) 모순; 계획은 "verified 후 제거" | 파일 수/크기 대조 후 삭제 또는 주석·정책 일치화 |
| Low | | 잔존 Fable 브랜딩(기능 무관): `relay/server.ts:151` "Fable Relay", `cli/index.ts:129,133` usage의 `fable … join FABLE-XXXX`, `:613` "fable-board-snapshot" 메시지, `codex.ts:56`/`grok.ts:56` 헤더, `shell.ts:41` 힌트, `mcp-server/stdio.ts:210` serverInfo version `"0.7.3"` stale | 일괄 정리(0.9.1 PATCH 가) |

### Decision notes

보안 diff 3곳(B2 migration / B5 MCP strip / B3 invite)에 집중 검토한 결과, **B5·B3은 깨끗하고 B2만 문제** — 그것도 gate 로직 자체가 아니라 gate를 우회하는 인접 코드(M-14)다. 55파일 치환에도 sanitize/timing-safe/M-7 로직 본문은 바이트 단위로 무손상임을 확인했다.

M-14는 RN1 High(#1)의 변종이므로 0.9.1 PATCH로 수정 후 재리뷰는 해당 diff만 보면 된다. M-15·M-16은 같은 PATCH에 동봉 가능.

"116 pass" 주장은 이 세션 도구 제약으로 실행 검증 불가 — 정적 근거상 신빙성 있으나, 0.9.1 재리뷰 요청 시 `bun test` 출력 첨부 요망.

**요약:** 리네임 자체는 성실하게 구현됐고 보안 회귀는 없다. 승인을 막는 것은 단 하나의 실질 결함 — `relay-daemon.ts:12-18`과 `mcp-server/config.ts:16,39`의 하드코딩 `~/.loom`이 migration 차단 상태에서 `~/.loom`을 조기 생성해 `session-store.ts:147`의 단락 조건을 트리거, `~/.fable` 상태를 무경고로 고아화한다(M-14). 여기에 `sticky-spawn.ts:53,56` 레거시 env 기록(M-15)과 RN1 필수 테스트 2종 누락(M-16)을 더해 **pending-revision**. 세 건 모두 소규모 PATCH로 해소 가능하다.

관련 파일: `packages/host/src/{session-store,relay-daemon,sticky-spawn,sticky-meta}.ts`, `packages/mcp-server/src/config.ts`, `packages/adapters/src/user-mcp-config.ts`, `packages/relay/src/{room,server,cli}.ts`, `packages/protocol/src/{env,codes,sanitize,format}.ts`

승인 시: `docs/PLAN.md` Version → **0.9.1** (PATCH) — M-14(migration 우회 경로 통일)/M-15(sticky spawn env)/M-16(누락 테스트 2종) 반영 후 rename을 `done`으로 표기.

### R11 follow-up (0.9.1 — applied)

| Finding | 처리 |
|---------|------|
| **M-14** | `relay-daemon.ts` + `mcp-server/config.ts` → `loomDir()` / `resolveStateHomeDir` |
| **M-15** | `sticky-spawn.ts` writes `LOOM_SESSION`/`LOOM_PROFILE` (+ FABLE dual for transition) |
| **M-16** | `session-store.test.ts` live-PID gate; `room.test.ts` FABLE- full-code lookup (no LOOM- rewrite) |
| PLAN | **v0.9.1** `approved`; Loom rename **done** |
| Tests | `bun test` **124 pass** |

---

## Review R10 — Plan v0.8.0

**검토 대상:** `docs/PLAN.md` **v0.8.0** (`pending-review`) — Part A: 0.7.2 L-11 / 0.7.3 L-12 이월 + Part B: M-7 per-peer rejoin secret
**검토자:** Fable 5 — 코드 직접 확인
**날짜:** 2026-07-09
**결론:** **`pending-revision`** → **0.8.1 applied / M-7 baseline approved** (Med M-13 + L-15 closed; L-14/L-16 backlog)

M-7 코어 메커니즘은 견고함: CSPRNG 24B secret, 타이밍-세이프 비교, 소켓 단독 전달, 동기 처리로 race 부재, 레거시 bypass 경로 없음, 문서 정직. 그러나 계획이 명시한 "Explicit failure mode"가 **`fable run` 경로에서 지켜지지 않음** — join 결과를 검사하지 않아 `peer_auth_failed`가 완전히 무음으로 삼켜지고, 에이전트는 room에 없는 채로 기동한다(M-9/M-12와 같은 "인접 경로 누락" 패턴 재발). 신원 탈취는 막혔으므로 High는 아니나, 사용자가 handoff를 받고 있다고 착각하는 상태가 되므로 Med 블로커.

### Checklist

| # | 항목 | 판정 | 근거 |
|---|------|------|------|
| A-1 | 0.7.2 L-11 caps/eviction | **Yes** | `protocol/src/envelope.ts:30-33,35-39,56-61`(zod max); `relay/src/room.ts:290-307`(slice), `:326-350`(trim 100/peer), `:472-475`(claim 시 삭제) |
| A-2 | 0.7.3 L-12 lock pid + sleep | **Yes** | `host/src/atomic-json.ts:85-105`(owner.pid), `:148-157`(stale**AND**dead만 reclaim), `:120-134`(pid 불일치 release 거부), `:160-176`(Bun.sleepSync/Atomics.wait) |
| B-1 | secret 생성 CSPRNG | **Yes** | `protocol/src/codes.ts:32-35` — `crypto.getRandomValues` 24B base64url |
| B-2 | 타이밍-세이프 비교 | **Partial** | `relay/src/room.ts:41-52` `secretsEqual` — 동작은 `timingSafeTokenEqual`(`server.ts:43-55`)과 동일(패딩+길이플래그)하나 **재사용이 아닌 복사본** (L-14) |
| B-3 | 첫 join race | **Yes** | `relay/src/server.ts:242-332` create/join 핸들러 완전 동기(내부 await 없음) + `room.ts:118-170` addPeer 동기 → 단일 스레드에서 직렬화; 두 번째 동시 first-join은 existing 경로로 빠져 `peer_auth_failed`. 이중 발급/무방비 창 없음 |
| B-4 | 레거시 bypass | **Yes** | `room.ts:34` `secret: string` 비옵셔널, `:164` 생성 시 항상 발급; RoomRegistry는 인메모리 전용(영속 없음) → secret 없는 member 존재 불가. `:132` `!partial.secret ||`로 빈 문자열도 거부 |
| B-5 | secret 전달 채널 | **Yes** | `server.ts:270,316` join한 소켓의 room.state에만; `:363` list_peers는 secret 없는 envelope(`room.ts:241`); URL 경로 없음 — `relay-client.ts:77-92`는 relay token만 다루며 header 우선(H-6 유지) |
| B-6 | 세션 0600 / host.json | **Yes** | `session-store.ts:105-113` 생성 시점 `mode: 0o600`(race 없음)+chmod; `sticky-meta.ts:14-25` StickyHostMeta에 peerSecret **없음**(IPC token만) |
| B-7 | host↔CLI secret 공유 | **Yes** | 단일 SSOT=세션 파일: sticky `sticky-server.ts:56,66`, one-shot `room-ops.ts:50` 모두 `session.peerSecret` 전송; one-shot은 재발급 시 저장(`room-ops.ts:56-63`). host 우선(tryStickyRpc)이라 동시 동일-id 소켓도 정상 흐름엔 없음. 단 sticky는 미저장 (L-15) |
| B-8 | `peer_auth_failed` 처리 | **Partial** | 무음 새-peerId 폴백은 **없음**(모든 경로가 session.peerId 재사용). create/join/listen/one-shot/sticky는 에러 노출(`cli:293-296,949-952`, `room-ops.ts:52-54`, `sticky-server.ts:68-71`). **그러나 `fable run`은 join 결과 미검사**(`cli/src/index.ts:1149-1156`) + run의 onEnvelope가 error envelope 미출력 + reconnect join 실패는 `onError`로만 전달되는데(`relay-client.ts:157-160`) listen/run/sticky 모두 onError 미설정 → 무음 (M-13) |
| B-9 | threat model 문서 | **Yes** | `apps/relay-cloud/README.md:54-64`(표+residual: lost session, rate limit 없음, 로그 위생); `docs/PROTOCOL.md:25-32`; 로테이션/mTLS 부재는 PLAN 0.8.0 "Not in" 명시. 테스트도 실재: `auth.integration.test.ts:209-235`, `server.integration.test.ts:97-110`, `hetero.handoff.test.ts:58-65` |

### Findings

| Sev | ID | Finding | Suggested change |
|-----|----|---------|------------------|
| Med | **M-13** | `fable run`이 joinRoom 반환 미검사 → `peer_auth_failed`(및 room_not_found)가 무음; 에이전트가 room 밖에서 기동, notify 경로 사망. reconnect 후 join 실패도 onError 미배선으로 무음(계획의 "explicit failure mode" 위반; M-9/M-12류 인접경로 누락 재발) | `cli/src/index.ts:1149` 반환값 검사 후 cmdListen(:949-952)처럼 에러 종료; run onEnvelope에 `error` 케이스 추가; listen/run/sticky RelayClient에 `onError` 배선(stderr) |
| Low | **L-14** | `secretsEqual`이 `timingSafeTokenEqual`의 복사본 — 향후 한쪽만 수정되는 F-1류 회귀 벡터 | 유틸을 `@fable/protocol`로 이동, `room.ts`/`server.ts`/`sticky-server.ts` 모두 import |
| Low | **L-15** | sticky host는 join 응답의 `env.peerSecret`을 세션에 미저장(one-shot은 저장). 현재는 도달 어려운 경로지만 host만 secret을 아는 상태 가능 | `sticky-server.ts:67` 이후 room-ops와 동일하게 saveSession |
| Low | **L-16** | 0.7.2 "256KB"는 실제로 256k **chars**(UTF-16 ≈ 최대 512KB 메모리/1MB UTF-8) — 단위 부정확 | PLAN/문서에 chars 명시 또는 byte 기준 cap으로 변경 |

### Decision notes

**Part A 실증 완료.** L-11/L-12는 주장대로 코드에 반영됨. `sleepMs`의 최후 폴백(:169-175)만 busy-loop이나 SharedArrayBuffer 실패 시에만 도달 — 수용.

**race/bypass 부재의 근거는 "동기성"**: create/join 핸들러에 await가 하나라도 들어가면 B-3 보장이 깨진다. 향후 relay에 async 저장소(durable inbox 등)를 넣을 때 이 불변식을 테스트로 고정할 것.

명시 `leave` 후에는 peerId 슬롯이 해제되어 재점유 가능(secret 무의미) — 의도된 설계이나 PROTOCOL에 이미 암시됨, 추가 조치 불요.

**M-13이 0.8.1 PATCH로 닫히면 approve** — 코어 메커니즘(B-1~B-6)은 재리뷰 불요, run/listen 에러 표면화만 확인하면 됨.

관련 파일: `packages/relay/src/{room,server}.ts`, `packages/protocol/src/{codes,envelope}.ts`, `packages/host/src/{session-store,sticky-server,sticky-meta,room-ops,atomic-json}.ts`, `packages/cli/src/index.ts`, `apps/relay-cloud/README.md`, `docs/PROTOCOL.md`

승인 시: `docs/PLAN.md` Version → **0.8.1** (PATCH) — M-13(run/listen/sticky join 실패 표면화) 반영 후 M-7을 `done`으로 표기; L-14~L-16은 backlog.

### R10 follow-up (0.8.1 — applied)

| Finding | 처리 |
|---------|------|
| **M-13** | `cli` `fable run`: join 반환 검사 후 exit 1; `onEnvelope` error; run/listen/sticky `onError` → stderr |
| **L-15** | `sticky-server` saveSession(peerSecret); `RelayClient.setReconnectPeerSecret` (room.state 시 reconnectJoin 동기화) |
| L-14, L-16 | backlog 유지 |
| PLAN | **v0.8.1** `approved`; M-7 **done** |

---

## Review R7 — Plan v0.5.0

**검토 대상:** `docs/PLAN.md` **v0.5.0** (Part A: 0.4.1 F-1/F-2/F-3 이월 + Part B: Phase 4.1 Context Pack)  
**검토자:** Fable 5 — 코드 직접 확인  
**날짜:** 2026-07-09  
**결론:** **`approved`** (Low follow-up → 0.5.1 / backlog; 재리뷰 불필요)

Part A 수정은 코드·테스트로 실증. Part B context pack은 allowlist(realpath), opt-in attach, **수신측 fs 비사용**으로 핵심 위협이 해소됨. High/Med finding 없음.

### Checklist (요약)

| # | 항목 | 판정 |
|---|------|------|
| A-1 F-1 sticky timing-safe | **Yes** |
| A-2 F-2 host↔session match | **Yes** |
| A-3 F-3 RPC serialize | **Yes** |
| B-1 cwd realpath allowlist | **Yes** (symlink test → 0.5.1) |
| B-2 roomId hash key | **Yes** (room-scoped, not profile) |
| B-3 with-pack opt-in | **Yes** |
| B-4 sanitize multi-layer | **Yes** |
| B-5 receiver no FS open | **Safe** |
| B-6 get_context_pack local | **Yes** |

### Findings (R7)

| Sev | ID | Status (0.5.1) |
|-----|-----|----------------|
| Low | L-1 room-scoped multi-profile share | **done** — intentional + PLAN/README |
| Low | L-2 symlink regression test | **done** |
| Low | L-3 label prefix + sender-relative hint | **done** |
| Low | L-4 requestOnce correlation | **deferred** backlog |
| Low | L-5 v2 embed TOCTOU | **deferred** until embed |

### Decision notes

- **Invariant (PLAN Security):** receivers must not open pack path attachments as filesystem paths.
- **L-1 choice:** keep room-scoped key (`sha256(roomId)`); document same-UID profile sharing.
- Approve **0.5.0** as Phase 4.1 baseline; **0.5.1** closed L-1–L-3.

### R7 follow-up (0.5.1 — applied)

| Finding | 처리 |
|---------|------|
| L-1 | PLAN Security + Open follow-ups + README room-scope wording |
| L-2 | `context-pack.test.ts` symlink outside cwd |
| L-3 | `context-pack-path:` / `context-pack-path:<label>`; `hints.ts` warning |
| PLAN | **v0.5.1** `approved`, Phase 4.1 **done** |
| Docs structure | R1–R6 → `plan_review_archive.md`; this file stays current |

---

## Review R8 — Plan v0.6.0

**검토 대상:** `docs/PLAN.md` **v0.6.0** (Part A: 0.5.1 L-1/L-2/L-3 이월 + Part B: Phase 4.2 Task Board)
**검토자:** Fable 5 — 코드 직접 확인
**날짜:** 2026-07-09
**결론:** **`pending-revision`**

Part A(L-1~L-3)는 코드·테스트·문서로 전부 실증됨. Part B는 키잉/권한/로컬 전용/sanitize 큰 틀은 맞으나, **보드 파일 동시 쓰기 경로에 잠금·원자적 쓰기가 전혀 없고, torn read 시 빈 보드로 폴백 후 저장하면 보드 전체가 유실되는 증폭 경로(H-7)**가 있어 승인 보류. 부수적으로 partial-id 매칭 버그(M-8)와 기존 handoff 경로의 sanitize 우회(M-9)를 발견.

### Checklist

| # | 항목 | 판정 | 근거 |
|---|------|------|------|
| A-1 | L-1 room-scope 공유 문서화 | **Yes** | `docs/PLAN.md`:396, 471–473, 509, 565; `README.md`:107 |
| A-2 | L-2 symlink 회귀 테스트 | **Yes** | `packages/host/src/context-pack.test.ts`:85–97 (cwd 밖 symlink → throw) |
| A-3 | L-3 label prefix + sender-relative 힌트 | **Yes** | `packages/host/src/context-pack.ts`:284–294; `packages/adapters/src/hints.ts`:20; 테스트 111–130 |
| B-1 | `sha256(roomId)` 키 + 0600 | **Yes** | `packages/host/src/task-board.ts`:68–71, 149–157 — pack(`context-pack.ts`:56–59, 114–122)과 동일 패턴 |
| B-2 | 자유 텍스트 sanitize (터미널+MCP 양쪽) | **Partial** | title/notes/assignee는 저장(`saveTaskBoard`:146)과 로드(`loadTaskBoard`:105–108) 양쪽에서 `normalizeTask`(121–138)로 sanitize; CLI show·MCP list 모두 `loadTaskBoard` 경유. 단 `id`/`handoffId`는 미소독 통과 후 `formatTaskBoard`:290–291에 raw 출력 (→ L-6) |
| B-3 | MCP 도구 로컬 전용 (relay 미노출) | **Yes** | relay src grep — board 코드 경로 없음(handoff `mode:"task"` 문자열뿐); `sticky-server.ts`·`room-ops.ts`에도 없음; `add_task`/`update_task`는 stdio MCP에서 로컬 파일 직접 접근 (`tools.ts`:114–160) |
| B-4 | handoffId가 실존 handoff 참조 | **Partial** | 생성 경로는 실제 송신 ack의 `handoffId`만 사용하고 `peer_unknown` 제외 (`cli/src/index.ts`:400–408, `tools.ts`:57–76). 임의 문자열 주입 경로는 CLI/MCP에 없음(`updateTask` patch.handoffId 미노출). 단 이후 재검증 없음 — inbox는 relay 메모리이므로 relay 재시작 시 dangling(설계상 불가피, 문서화 필요) |
| B-5 | 공유 수정 의도 + 동시 쓰기 안전 | **Partial** | same-UID 내 임의 수정은 pack L-1과 동일 논리로 의도(PLAN 0.6.0 changelog:53, `createdByPeerId` 기록만·미강제). **동시 쓰기 보호는 없음 → H-7** |
| B-6 | clear-done 확인 절차 | **Partial** | MCP 미노출 확인(`stdio.ts` TOOLS:24–150 — list/add/update만; rm/clear 없음). CLI는 확인 프롬프트 없음 + `clear` alias (`cli/src/index.ts`:514–517) → L-7 |

### Findings

| Sev | ID | Finding | Suggested change |
|-----|----|---------|------------------|
| **High** | H-7 | 보드 파일 load-modify-save에 잠금·원자쓰기 없음. `writeFileSync`가 O_TRUNC로 직접 최종 경로에 쓰므로(`task-board.ts`:149) 동시 reader가 빈/부분 파일을 읽음 → `loadTaskBoard` catch가 `emptyBoard` 반환(116–118) → 그 프로세스가 `addTask`로 저장하면 **보드 전체 유실**. 단순 last-writer-wins 유실도 존재. 여러 에이전트가 doing/done을 동시 갱신하는 이 기능의 핵심 시나리오에서 발생 확률 높음 | (1) temp 파일 + `renameSync` 원자 교체, (2) lockfile(O_EXCL/mkdir + stale timeout) 또는 재시도로 read-modify-write 직렬화, (3) parse 실패 시 빈 보드 취급 금지 — `.corrupt-<ts>` 백업 후 에러. `context-pack.ts`:114도 동일 패턴이므로 같이 수정 권장 |
| Med | M-8 | `updateTask`/`findTask`의 id 매칭이 `t.id.includes(taskId)`(`task-board.ts`:209–211, 270–272) — 짧은 부분 문자열이 **첫 매치에 조용히 적용**되고, `id=""`이면 `includes("")===true`로 첫 task가 수정됨(`stdio.ts`:228 `String(args.id ?? "")` 경유 실제 도달 가능). relay claim의 모호성 에러(`room.ts`:370–377)·`removeTask`의 endsWith(247–249)와도 불일치 | 빈 id 거부; prefix/suffix 매칭으로 통일하고 복수 매치 시 에러(relay claim 방식) |
| Med | M-9 | (신규 발견, 기존 handoff 경로) relay가 **peer 제공 handoff id를 그대로 수용**(`room.ts`:255 `partial.id ?? generateHandoffId()`; 정상 클라이언트는 id를 안 보냄)하고, `sanitizeHandoffForOutput`은 body/attachments만 소독(`sanitize.ts`:88–99). `renderInbox`가 `handoff.id`/`fromPeerId`/`mode`를 raw 출력(`presence.ts`:54–55, `fable inbox`·listen pending 경로) → 악성 peer가 id에 ESC/OSC를 넣어 수신자 터미널에 도달 가능. "모든 peer-controlled 문자열 sanitize" 불변식 위반 | relay에서 client 제공 id 무시(항상 `generateHandoffId()`) 또는 `/^ho_[A-Za-z0-9]+$/` 검증; 방어층으로 `sanitizeHandoffForOutput`에 id/mode/fromPeerId 포함 |
| Low | L-6 | `normalizeTask`가 `id`/`handoffId`를 미소독 통과(`task-board.ts`:126, 132), `formatTaskBoard`:290–291에서 raw 출력. 오염 경로는 악성 relay ack 또는 same-UID 파일 조작 정도로 낮음 | normalizeTask에서 id류 필드 형식 검증(`^(task|ho)_[A-Za-z0-9]+$`) 또는 sanitize |
| Low | L-7 | `clear-done`에 확인 프롬프트 없음 + 축약 alias `clear`(`cli/src/index.ts`:514). MCP 미노출이라 파괴 범위는 done/cancelled 한정 | bare `clear` alias 제거, N건 초과 삭제 시 `--yes` 요구 (선택) |
| Low | L-8 | 문서 갭: PLAN Security 표의 sanitize 대상 목록에 board title/notes/assignee 누락; handoffId dangling(relay 재시작 후) 미명시 | Security 표에 board 필드 추가; "handoffId는 traceability 문자열, 참조 무결성 미보장" 1줄 명시 |

### Decision notes

**Part A 종결:** L-1~L-3 모두 코드로 확인. Phase 4.1 baseline(0.5.1) 유지.

**B-3/B-5 의도 판정:** "not relay-synced"는 정직함 — relay 프로토콜·sticky RPC 어디에도 board 경로 없음. same-UID 임의 수정은 R7 L-1과 동일한 신뢰 모델로 수용.

**차단 사유:** H-7 하나. context pack은 사람이 저빈도로 관리하지만 board는 다중 에이전트 동시 갱신이 기본 시나리오이므로 R7 때와 달리 원자쓰기+잠금 없이는 done 처리 불가. H-7+M-8 수정 시 PATCH(0.6.1)로 재리뷰 없이 승인 가능; M-9는 board 밖 기존 경로이므로 0.6.1 동승 또는 별도 PATCH 허용.

관련 파일: `packages/host/src/task-board.ts`, `packages/host/src/context-pack.ts`, `packages/mcp-server/src/stdio.ts`, `packages/relay/src/room.ts`, `packages/host/src/presence.ts`, `packages/protocol/src/sanitize.ts`

승인 시: `docs/PLAN.md` Version → **0.6.1** (PATCH) — H-7/M-8/M-9 반영 후 Phase 4.2 `done`.

### R8 follow-up (0.6.1 — applied)

| Finding | 처리 |
|---------|------|
| H-7 | `packages/host/src/atomic-json.ts` — `writeAtomicJson`, `withFileLock`, `readJsonFile` corrupt backup; used by task-board + context-pack |
| M-8 | `resolveTaskIndex` exact then unique endsWith; no `includes`; empty throws |
| M-9 | `room.resolveHandoff` always `generateHandoffId()`; `sanitizeHandoffForOutput` + `renderInbox` sanitize id/from/mode |
| L-6 | task/handoff id regex on normalize |
| L-7 | `board clear-done --yes` only |
| L-8 | PLAN Security + handoffId dangling note |
| PLAN | **v0.6.1** `approved`, Phase 4.2 **done** |

---

## Review R9 — Plan v0.7.0 (Phase 4.3a Board Snapshot Share + 0.6.1 이월 검증)

**검토 대상:** `docs/PLAN.md` **v0.7.0** (`pending-review`) — Part A: 0.6.1 H-7/M-8/M-9 이월 + Part B: Phase 4.3a Board Snapshot Share
**검토자:** Fable 5 — 코드 직접 확인
**날짜:** 2026-07-09
**결론:** **`pending-revision`**

Part A(0.6.1 이월)는 3건 모두 실제 코드로 정확히 구현되어 **Phase 4.2 baseline으로 승인 가능**. Part B(4.3a)는 import 경로가 `normalizeTask` 재sanitize와 lock/atomic 저장을 올바르게 통과하는 등 골격은 건전하나, 신규 신뢰 경계에서 Med 3건이 발견됨: (M-10) merge의 `updatedAt`이 peer가 위조 가능한 무검증 문자열이라 악의적 스냅샷이 항상 로컬 task를 덮어씀, (M-11) `importBoardSnapshot`의 kind-check 지름길이 `parseBoardSnapshot` 검증을 우회해 기형 스냅샷으로 TypeError 크래시 유발, (M-12) `import-handoff`의 id 매칭이 모호성 검사 없는 `endsWith` first-match — **M-8에서 방금 고친 패턴을 신규 코드가 재도입**(이 시리즈의 반복 패턴, F-1/M-5 회귀와 동일 구조). 세 건 모두 국소 수정이므로 0.7.1 PATCH로 해소 가능.

### Checklist

**Part A — 0.6.1 이월**

| # | 항목 | 판정 | 근거 |
|---|------|------|------|
| H-7 | atomic write + lock + corrupt backup (board·pack) | **Yes** | `packages/host/src/atomic-json.ts:25-39` temp+`renameSync`+0600(진짜 temp+rename); `:103-124` `mkdirSync` 원자성 기반 배타 락(stale 5s 회수, 4s 대기); `:45-68` corrupt→`.corrupt-<ts>` 백업+throw. board 적용 `task-board.ts:191-193,197-215`; pack 적용 `context-pack.ts:114-116`. 락은 실제로 동시 접근 차단(경미한 stale-회수 race는 L-12) |
| M-8 | task id exact/unique-suffix, 빈/모호 에러 | **Yes** | `task-board.ts:110-130` — exact→unique suffix, 빈 문자열·다중 매치 throw. `includes()` 없음. update/rm/find 모두 경유 |
| M-9 | 서버측 handoff id + 출력 sanitize | **Yes** (Low 잔여) | `relay/src/room.ts:255-256` 항상 `generateHandoffId()`(클라이언트 id 무시); mode는 zod enum(`envelope.ts:51,174-185`); `sanitize.ts:88-113` `sanitizeHandoffForOutput`이 `room-ops.ts:209,256`·`sticky-server.ts:110,160`에 적용. 잔여: live notify 표시 경로(`format.ts:16,21`)는 raw `fromPeerId` fallback — L-13 |

**Part B — Phase 4.3a**

| # | 항목 | 판정 | 근거 |
|---|------|------|------|
| B-1 | import 시 normalizeTask 재sanitize | **Yes** | `task-board.ts:449-458`(parseBoardSnapshot→normalizeTask), `:479`(import 재정규화), `:188,209`(저장 시 3차). title/notes/assignee sanitize + id regex 강제 → JSON `` 재구성 공격 차단. 단 timestamps/sourceRoomName 미sanitize — L-10 |
| B-2 | updatedAt 위조로 merge 지배 | **No (취약)** | `task-board.ts:488` `(t.updatedAt \|\| "") >= (cur.updatedAt \|\| "")` 사전순 비교; `:176` normalizeTask가 raw 유지. `"9999-…"` 또는 `"~"` 같은 비ISO 문자열이 모든 로컬 task를 항상 덮어씀 — M-10 |
| B-3 | roomId 불일치 거부 | **No** | `importBoardSnapshot`(`:467-496`)은 `sourceRoomId` 완전 무시(기본값 `"unknown"`, `:446`). 임의 room 스냅샷이 현재 board에 조용히 병합 — L-9 |
| B-4 | import-handoff attachment 타입 검증 | **Partial** | `snapshotFromAttachments`(`:499-512`)가 label 매치+`parseBoardSnapshot`+try/catch → 임의 handoff는 깨끗한 에러, 크래시 없음. **그러나** ① `importBoardSnapshot:472-477` kind 지름길이 검증 우회(M-11) ② handoff id 매칭 `cli/src/index.ts:587-591` `endsWith` first-match(M-12) |
| B-5 | --with-board 크기 제한 | **Partial** | 스냅샷 자체는 암묵 상한(~≤300KB: MAX_TASKS 200 × title 200 + note 1000, `task-board.ts:64-66` + export 시 normalize). 그러나 relay측 attachment 명시 상한 없음(`envelope.ts:31` `z.string()` 무제한)이고 claimed/accepted 항목이 room 수명 동안 Map에 잔존(`room.ts:275-288,392-394` — 상태만 변경, 삭제 없음) — L-11 |
| B-6 | import가 lock/atomic 경유 | **Yes** | `importBoardSnapshot` → `mutateBoard`(`:481`) → `withFileLock`+`writeAtomicJson`. 우회 저장 경로 없음. `board export`의 `Bun.write`(`cli:548`)는 board 파일이 아닌 export 대상 파일이므로 무관 — 회귀 없음 |

### Findings

| Sev | Finding | Suggested change |
|-----|---------|------------------|
| **Med M-10** | merge "최신 updatedAt 승리"의 `updatedAt`이 peer 제공·무검증 문자열(`task-board.ts:176,488`). 위조 미래/비ISO 값으로 악의적 peer가 로컬 task를 무조건 덮어씀(내용은 sanitize되나 무결성 상실) | normalizeTask에서 ISO-8601 regex 검증(불합격 → import 시각으로 대체) + import 시 `min(updatedAt, now)` clamp; merge 신뢰 모델을 PLAN Security 표에 명시 |
| **Med M-11** | `importBoardSnapshot:472-477` — `kind`만 맞으면 `parseBoardSnapshot` 생략하고 cast. `{kind:"fable-board-snapshot",tasks:null}` 또는 `tasks:[null]`이 CLI `board import`·MCP `import_board`에서 TypeError 크래시 | 지름길 제거, 항상 `parseBoardSnapshot(snapshot)` 통과(멱등이므로 안전) |
| **Med M-12** | `cli/src/index.ts:587-591` — handoff id를 `endsWith` first-match로 해석, 모호성 검사 없음. M-8 수정 패턴의 신규 코드 재도입(짧은 suffix가 엉뚱한 handoff의 스냅샷을 조용히 적용) | `resolveTaskIndex`/`claimHandoff`와 동일한 exact→unique-suffix-or-error 헬퍼로 통일 |
| Low L-9 | `sourceRoomId` 미검사 — 다른 room 스냅샷이 현재 board에 조용히 병합 | 불일치 시 경고 + `--force` 요구 |
| Low L-10 | task `createdAt`/`updatedAt`, snapshot `sourceRoomName`/`exportedAt` 미sanitize로 로컬 파일 저장·MCP 응답에 raw 노출(현재 `board show`는 미출력 — 잠재적) | normalizeTask/parseBoardSnapshot에서 sanitize+형식 검증(M-10 수정과 동일 지점) |
| Low L-11 | relay attachment 명시 크기 상한 없음 + claimed 후에도 inbox 항목 영구 잔존 → 반복 `--with-board` broadcast 시 relay 메모리 누적 | `HandoffAttachmentSchema.content`에 `.max()`(예: 256KB) + claimed/accepted 항목 eviction 또는 TTL |
| Low L-12 | `withFileLock` stale 회수 race(두 대기자가 동시에 stale 판정 → 한쪽이 상대의 새 락 rmdir 가능, `atomic-json.ts:107-111`) + `sleepMs` busy-spin 최대 4초 CPU 점유(`:96-100`) | MVP 수용 가능; pid 기록 후 소유 확인 삭제 + `Atomics.wait`/async sleep 백로그 |
| Low L-13 | live notify 렌더(`format.ts:16`)가 roster 미발견 시 raw `fromPeerId` 출력 — peerId는 클라이언트 제공(M-7)이라 listen 터미널에 ANSI 도달 가능 | `formatHandoffBlock`에서 who/id/mode 한 줄 sanitize |

### Decision notes

**Part A는 완결.** 0.6.1을 Phase 4.2 baseline으로 확정해도 됨. `writeAtomicJson`은 진짜 temp+rename이고, 락은 `mkdir` 원자성 기반으로 실제 동작하며, corrupt 시 빈 보드 오인 경로(H-7의 핵심)는 backup+throw로 제거됨.

**Part B의 설계 자체는 건전.** 3중 normalize(파스→import→저장)와 mutateBoard 경유는 정확히 올바른 구조이며, "not live sync" 스코프 제한도 정직함. 문제는 전부 경계 디테일: 타임스탬프 신뢰(M-10), 검증 지름길(M-11), id 매칭 완화(M-12).

**반복 패턴 경고:** M-12는 이 시리즈에서 세 번째로 발견된 "신규 코드가 직전 수정의 안전장치를 우회" 사례(F-1/M-5, M-9에 이어). 신규 코드가 기존 헬퍼(resolve/lock/sanitize)를 재사용하는지 확인하는 체크 항목을 리뷰 게이트에 상설화할 것을 권고.

세 Med 모두 단일 파일 국소 수정 → **0.7.1 PATCH 후 재리뷰 불필요**(수정 확인만으로 approve 가능). L-9~L-13은 backlog 허용.

관련 파일: `packages/host/src/task-board.ts`, `packages/host/src/atomic-json.ts`, `packages/relay/src/room.ts`, `packages/protocol/src/sanitize.ts`, `packages/cli/src/index.ts`, `packages/mcp-server/src/tools.ts`, `packages/protocol/src/format.ts`

승인 시: `docs/PLAN.md` Version → **0.7.1** (PATCH) — M-10/M-11/M-12 반영 후 Phase 4.3a `done`.

### R9 follow-up (0.7.1 — applied)

| Finding | 처리 |
|---------|------|
| M-10 | `normalizeTimestamp` + merge uses `Date.parse` after clamp |
| M-11 | `importBoardSnapshot` always `parseBoardSnapshot` |
| M-12 | `resolveHandoffEntryIndex` in CLI import-handoff |
| L-9 | foreign `sourceRoomId` needs `force` |
| L-13 | `formatHandoffBlock` sanitizes who/id/mode |
| PLAN | **v0.7.1** `approved`, Phase 4.3a **done** |

---

