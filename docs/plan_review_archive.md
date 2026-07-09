# Plan Review Archive — Fable Advisor

> **Archived history:** R1–R7 full text (and older follow-ups).  
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
