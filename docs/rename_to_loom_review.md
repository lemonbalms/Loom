# Rename Review — `docs/RENAME_TO_LOOM.md`

> **대상 문서:** `docs/RENAME_TO_LOOM.md` (Status: `draft`, 구현 전)
> **리뷰 성격:** 계획 비평 — 코드가 계획대로 됐는지 검증하는 것이 아니라, 계획 자체가 안전하고 완전한지 평가.
> **관련:** `docs/PLAN.md` (제품 계획 SSOT), `docs/plan_review.md` (R1–R10, 제품 기능 리뷰 이력)

---

## Review RN1 — Rename Plan (draft)

**검토 대상:** `docs/RENAME_TO_LOOM.md` (제품명 Fable → Loom)
**검토자:** Fable 5 (fable-advisor 세컨드 오피니언) — 코드 직접 확인
**날짜:** 2026-07-09
**결론:** **보류** → **계획 패치 반영됨** (`RENAME_TO_LOOM.md` Status `pending-review`, 2026-07-09). 구현 전 owner 최종 확인 후 0.9.0 Phase A.

계획의 골격(dual-read env / dual-accept invite / dual-strip MCP TOML, phased 실행, H-4 리스크 자체 인지)은 건전하다. 승인을 막았던 것은 코드 확인으로 드러난 구체적 누락 1건(High)과 명문화 누락 3건(+ 정책 1)이다 — 아래 action items 전부 계획서에 반영됨.

---

### 1. 홈 디렉터리 `renameSync` 마이그레이션 — **계획 누락 (가장 큰 결함)**

계획서 §4.2는 "실행 중인 프로세스" 시나리오를 전혀 다루지 않는다. Phase D 수동 검증도 "Sticky host start **after** rename"만 있어, rename **도중/직후에 프로세스가 살아있는** 경우가 통째로 빠져 있다.

**코드 근거:**
- `packages/host/src/session-store.ts` — `fableDir()`가 매 호출마다 `join(homedir(), ".fable")`을 재계산하고, `ensureFableDir()`/`saveSession()`이 `mkdirSync(recursive)`로 디렉터리를 **재생성**한다.
- `packages/host/src/sticky-meta.ts` — sticky host가 `~/.fable/*.host.json`을 경로 기반으로 반복 재기록한다.
- `packages/host/src/atomic-json.ts` — `withFileLock`의 락 디렉터리가 `filePath.lock`으로 **경로에 붙어** 있다.

**실패 시나리오:** sticky host(또는 relay 데몬)가 살아있는 상태에서 `~/.fable → ~/.loom` rename이 일어나면, 구 프로세스가 다음 쓰기에서 `~/.fable`을 **다시 만들어** split-brain 상태(스티키 메타/보드/세션이 두 디렉터리로 갈라짐)가 된다. 락도 두 경로로 분리되어 R8 H-7 / R9 L-12로 확보한 원자성 보장이 조용히 무효화된다. `renameSync` 실패 시 EXDEV copy fallback은 더 나쁘다 — 쓰는 도중 tree copy가 일어나면 torn copy + `.lock`/`.tmp.*` 잔재까지 함께 복사될 수 있다.

**요구 수정:** 마이그레이션 전에 `*.host.json` / `relay.pid`의 PID 생존 확인(`isPidAlive`가 이미 `atomic-json.ts`에 있음) → 살아있으면 rename **중단**하고 "호스트 중지 후 재시도" 안내, 또는 해당 실행만 레거시 dir을 read-only로 사용. copy fallback은 `.lock`/`.tmp.*` 제외를 명시할 것.

---

### 2. MCP TOML dual-strip — **구조적으로 확장 가능하나, "loom" 단어 함정 1개**

`packages/adapters/src/user-mcp-config.ts`의 현 구현은 (a) 마커 블록 루프, (b) 라인 기반 테이블 strip(`/^\s*\[mcp_servers\.fable(?:\.|])/i`)의 2단 구조라, fable/loom 이중화는 정규식 alternation + 마커 쌍 목록화로 자연스럽게 확장된다. H-4 불변식(마커 없는 레거시 블록도 정확히 하나의 섹션만 제거하고 TOML을 깨지 않는 것) 유지 가능.

**단, 함정 하나:** 65~86행의 주석 스킵 휴리스틱이 `/Fable multiplayer/i` 및 후속 라인에 `/Fable/i` 단독 매칭을 쓴다. "fable"은 희귀 단어라 안전했지만 **"loom"은 일반 영어 단어**다(`# deadline looming` 같은 사용자 주석이 strip 블록에 인접하면 삭제될 수 있음). Loom 쪽은 반드시 `Loom multiplayer` / `mcp_servers.loom` **정확 구문으로만 앵커**하도록 계획서에 명시해야 한다. 또한 `upsertUserMcpConfig`의 `hadLegacy` 감지(137~139행)도 dual 확장이 필요 — 계획서 §4.5에 함께 기재 권장.

---

### 3. sanitize / 타이밍세이프 불변식과의 충돌 — **겹침 없음, 단 1개 정책 이슈**

- `packages/protocol/src/sanitize.ts`: "fable" 문자열 **0건**.
- `packages/relay/src/room.ts` `secretsEqual`: 파일 내 유일한 hit는 22행 import `@fable/protocol` (Phase A 정당 대상).
- `packages/relay/src/server.ts` `timingSafeTokenEqual`: 함수 본문 무관. hit는 import + `FABLE_RELAY_TOKEN`/`FABLE_RELAY_INSECURE_OPEN` env 참조(70~74행) + 배너 텍스트뿐.

즉 기계적 치환이 보안 로직 본문을 건드릴 위험은 사실상 없다. 단 하나의 정책 이슈: **`FABLE_RELAY_INSECURE_OPEN`은 인증을 끄는 플래그**인데, 계획대로 dual-read하면 사용자 셸에 남은 구 env가 rename 후에도 조용히(경고 한 줄로) 인증을 계속 끈다. 보안 완화 플래그만은 dual-read에서 제외하거나(신규 이름 필수), 최소한 경고를 강하게 하도록 계획서에 예외 조항을 넣을 것을 권한다.

---

### 4. 테스트 파손 규모 — **~96 hit / 12개 테스트 파일. "수십 개" 규모, 계획 순서 합리적**

| 테스트 파일 | hit |
|---|---|
| user-mcp-config.test.ts | 39 |
| adapters.test.ts | 15 |
| task-board.test.ts | 11 |
| context-pack.test.ts | 8 |
| sticky-host.integration.test.ts | 7 |
| envelope.test.ts (예: `/^FABLE-[A-Z0-9]{4}$/`) | 6 |
| 기타 6개 파일 | ~10 |

전체 소스는 399 hit / 51 파일 + docs 266 hit. Phase A→red→B→green 순서는 이 규모에서 타당하다. 특히 user-mcp-config.test(39 hit)는 dual-strip 테스트 확장의 중심이므로 계획서 리스크 표와 일치한다.

---

### 5. 범위 누락 — **2건의 실질 누락 발견**

| 누락 항목 | 위치 | 왜 문제인가 |
|---|---|---|
| **`/fable` 슬래시 명령** | `packages/host/src/slash.ts`(`/fable peers`, `/fable handoff @name …`, SLASH_HELP) | 사용자 대면 명령 표면인데 blast radius §3.1~3.6 어디에도 없음. CLI alias처럼 `/fable` dual-accept 여부를 결정해야 함 |
| **`[FABLE HANDOFF from …]` 주입 마커** | `packages/protocol/src/format.ts:23`(+ pty-spike, handoff-inject.test, envelope.test) | 상대 에이전트 PTY에 주입되는 준-와이어 문자열. §3.4 표에 없음. 혼용 버전 룸에서의 표기 불일치는 경미하나 명시적 결정 필요 |

경미: `docs/spikes/PHASE-1.5-PTY.md`(8 hit)는 "light touch"로 커버, `apps/relay-cloud`는 README만 존재(23 hit)해 계획과 일치, `hints.ts`의 `fableSystemHint` 본문 카피("You are running inside Fable multiplayer room")는 §3.5에 심볼명만 언급되어 있어 **본문 문자열도 대상임을 한 줄 추가** 권장.

---

### 6. Invite dual-accept 보안 함의 — **현 구조상 안전, 단 "prefix 정규화 금지" 명문화 필요**

`server.ts:275` join은 `registry.getByCode(msg.inviteCode)` — 코드 전체를 대문자 키로 **정확 일치 조회**할 뿐 prefix 검증 로직 자체가 없다(`room.ts:495`). 따라서 dual-accept는 사실상 코드 변경이 거의 필요 없고 우회 경로도 안 생긴다.

유일한 위험은 구현자가 "정규화"를 prefix 재작성(`FABLE-7K2M`→`LOOM-7K2M`)으로 해석하는 경우 — 서로 다른 두 룸(구 `FABLE-7K2M`, 신 `LOOM-7K2M`)이 충돌하여 **잘못된 룸 접근**이 가능해진다. §4.3의 "normalize case"를 "대소문자만; prefix 재작성 절대 금지, 조회는 minted 코드 전체 정확 일치"로 명문화할 것. M-7 peerSecret 재조인 경로는 invite와 독립이라 영향 없음.

---

### 7. 타이밍/범위 판단

지금(R10/M-7 직후, 기능 웨이브와 분리) 하는 것이 맞다 — 0.x에서 이 비용이 최소이고, 미룰수록 문서/리뷰 혼동 비용만 누적된다. 단일 MINOR(0.9.0)도 수용 가능하되 조건: Phase A(기계적)와 Phase B(런타임)를 **별도 커밋/PR 웨이브**로 나누고, 리뷰(R11)는 B2(홈 마이그레이션)·B5(MCP strip)·B3(invite)에 집중할 것. 이 셋만이 보안 diff이고 나머지는 grep으로 검증 가능한 기계 치환이다.

---

## 결론 및 필수 수정 사항

**보류 (조건부 승인 — 계획서 수정 후 승인 가능).** 계획의 골격(dual-read/dual-accept/dual-strip, phased, H-4 자체 인지)은 건전하다. 승인 전 필수 수정 4건:

1. **§4.2에 live-process gate 추가** (sticky host/relay 데몬 생존 시 rename 중단) — 유일한 High급 누락.
2. **§3 blast radius에 `/fable` 슬래시 명령, `[FABLE HANDOFF]` 마커, `fableSystemHint` 본문 카피 추가** + 각각의 compat 결정.
3. **§4.5에 "Loom은 정확 구문 앵커만" 규칙** (일반 단어 "loom" 오삭제 방지) + `hadLegacy` dual 감지.
4. **§4.3에 prefix 재작성 금지 명문화**, §4.1에 `FABLE_RELAY_INSECURE_OPEN` dual-read 예외 검토.

이 4건 반영 시 0.9.0 단일 MINOR로 진행해도 무방하다.

## Action items (RENAME_TO_LOOM.md 반영 제안)

- [x] §4.2: rename 전 `*.host.json`/`relay.pid`의 PID 생존 확인 → 살아있으면 rename 중단 + 안내 메시지; EXDEV copy fallback 시 `.lock`/`.tmp.*` 제외 명시
- [x] §3: blast radius 표에 `/fable` 슬래시 명령(`slash.ts`), `[FABLE HANDOFF from …]` 마커(`format.ts`), `fableSystemHint` 본문 카피(`hints.ts`) 추가 + 각 compat 결정 기재
- [x] §4.5: Loom 마커/테이블 strip 정규식을 정확 구문(`Loom multiplayer`, `mcp_servers.loom`)으로만 앵커 — 일반 단어 오삭제 방지 규칙 명문화; `hadLegacy` dual 감지 추가
- [x] §4.3: "normalize case"를 대소문자 정규화만으로 한정, prefix 재작성(코드 자체 rewrite) 금지를 명문화
- [x] §4.1: `FABLE_RELAY_INSECURE_OPEN` 등 보안 완화 플래그는 dual-read 예외 처리(신규 이름 필수 또는 강한 경고) 검토

### RN1 follow-up (plan patch — applied 2026-07-09)

| Item | 상태 |
|------|------|
| 필수 4+1건 | **`docs/RENAME_TO_LOOM.md`에 반영** (Status → `pending-review`) |
| Absolute SESSION path / project `.fable/` orphan | 계획 §4.2 / §10에 명시 |
| 구현 | **미착수** — 계획 재확인 후 0.9.0 Phase A |
| 재리뷰 | R11은 구현 diff 기준; 계획 RN1 항목은 문서상 closed |
