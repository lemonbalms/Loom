## Review R56 — Plan v0.38.0 (기억 쓰기 경로 · 카드 후보 → `proposed` · `notes.md` · `LOOM_CARD` CLI 거부, MINOR)

**검토 대상:** `docs/PLAN.md` §0.38.0 draft(권위 고지 · D1~D19 + D16' · ② 인터페이스 정본 · R1~R22 · C1~C6 · 계급 23~30 + 무번호 · ⑥ · ⑦ P1~P5 · UK-1~7 · Done (a)~(k)) + `docs/UNKNOWNS.md` §0.38.0 + `tasks/v0380-wip/v0380-decisions.md`. 코드 대조 `d6f7cc2`(packages 무변경 확인): `atomic-json.ts:22-24`·`:96-209` · `memory-store.ts:78-134`·`:373-375`·`:484-492`·`:859-900` · `memory-snapshot.ts:38-39`·`:270-292` · `headless-worker.ts:162-180`·`:309-319`·`:948-1001`·`:1237-1256`·`:1355-1425`·`:1445-1480`·`:1540-1555`·`:2066-2072` · `card-session-store.ts:15-97` · `skill-materialize.ts:117-119`·`:314-353`·`:871-990` · `memory-inject.ts:46-54` · `skill-prompt.ts:49-55` · `bridge-config.ts:439-452` · `bridge-runtime.ts:880-897`·`:1120-1130`·`:1968` · `cli/src/memory-cli.ts:336-338`·`:345-375`·`:430-455`·`:620-660` · `skill-inventory.test.ts:70-215` · `memory-cli.test.ts:1005-1100`.
**검토자:** loom-advisor (Opus 5.5 high — CLAUDE.md 규칙 8). **Advisor: opus-advisor consulted: yes.**
**날짜:** 2026-10-17
**결론:** **`approved-with-fixes`** — High 0 · Medium 4(M1~M4) · Low 4(L1~L4). 전부 PLAN 문안으로 닫히고 제품 코드는 0줄이다. 락은 안전하고 서로 모순되지 않는다. **no R56b**: 아래 문안대로 반영하면 `approved`.

### 결정적 발견
신뢰 경계는 구조로 닫혀 있다. 쓰는 것은 `proposed` 줄뿐이고, 스냅샷은 `visibleActive`만 렌더한다(`memory-snapshot.ts:284-286`). `supersedes: null` · 방 범위 · 단일 id `approve`(`memory-cli.ts:444`) 조건이 함께 걸려 있어, 사람 없이 active로 가는 길은 계급 23(셸 우회)뿐이고 그것도 선언돼 있다. `withFileLockAsync`는 같은 mkdir 디렉터리 · 같은 `owner.pid` · 같은 stale 규칙을 쓰고, `fn`이 동기라 CLI와 실제로 서로 배제한다. C2 독해도 맞다(`skillsForSpawnLocked` `:1545`는 `plan.skills`를 우선한다). **새는 곳은 넷이다.** 고정 테스트 선언이 불완전하다(M1). 아카이브 상한을 넘으면 기능이 영구히 꺼지는데 이것이 일시적인 `busy`로 표기된다(M2). 승인자가 신뢰할 수 없는 본문을 80자까지만 본다(M3). ship 게이트가 기능 자체의 동작을 요구하지 않는다(M4).

### Checklist
- [x] ① 신뢰 경계 — PASS(사람 없이 active = 계급 23뿐 · M3이 승인 게이트 실효를 보강)
- [x] ② 락 호환(D12 · C3) — PASS(경합 테스트 (b) 충분)
- [x] ③ 멱등(D11 · C1 · R9) — PASS(`(card, handoff, attempt)` · write-ahead 순서 · 크래시 창 스캔) · C4는 M2로 대체
- [x] ④ 이벤트 루프 — PASS(≤250 ms + 유계 동기 작업) · L4 문면 정정
- [x] ⑤ fingerprint/호환(C2 · D4 · 계급 30) — PASS(내장은 방 선택 `:314-353` 또는 `forced`로만) · 예외 L2
- [x] ⑥ D16' — PASS(실수 방지 가드로 정직 · `deps.env` 주입 `memory-cli.ts:87-88`)
- [x] ⑦ 상한/기아(D9 · 계급 27) — PASS
- [x] ⑧ `notes.md` 정직(D15 · 계급 25) — PASS
- [ ] ⑨ red/green · 고정 테스트(C5) — **FAIL → M1**
- [ ] ⑩ Done/ship(D18 · (j)(k)) — **FAIL → M4**
- [x] ⑪ §3.5 Unknowns — UK-1 ship 차단(M4로 강화) · UK-2~UK-7 비차단 유지

### Findings
| ID | Sev | 위치 | 결함 | 수정 |
|---|---|---|---|---|
| **R56-M1** | Med | PLAN C5 · ⑦ 편집 다섯 자리 | 내장 목록을 정확히 고정한 자리가 다섯보다 많다 — `skill-inventory.test.ts:113`·`:128`(가림 `toEqual` 1원소) · `:164`(symlink → "every builtin name" 1원소) · `:183` · `:198` · `:209` · `memory-cli.test.ts:1081-1097`(`--json` `skills` 1원소)도 깨진다. 이대로면 P2 green이 멈춤 규칙에 걸린다. | C5와 ⑦ 편집 선언 교체: **`skill-inventory.test.ts` `:74-90`·`:93`·`:102-106`·`:113-122`·`:128-137`·`:164-173`·`:183`·`:198-203`·`:209-212` + `memory-cli.test.ts` `:1009-1016`·`:1034-1039`·`:1081-1097` — `loom-memory-candidates` 원소/행을 정렬 위치에 넣는 것만 허용**(symlink 케이스는 `unsafe source` 가림 원소) · (d)에 같은 목록 반영. |
| **R56-M2** | Med | R11 · C4 · 계급 28 | 아카이브는 compact마다 커지기만 하고 줄일 도구가 없다 — 4 MiB를 넘으면 그 뒤 **모든 카드**가 `busy`(영구 기능 정지가 일시 경합으로 표기 · UK-3 왜곡). | R11 교체: **아카이브는 끝 4 MiB만 읽는다**(`size > 4 MiB`면 `size − 4 MiB`부터 읽고 첫 부분 줄 버림 · 상한 초과 실패 갈래 없음). 근거: 부활 틈은 "제안 → 크래시 → 재기동" 창뿐이고 compact 1회 이동량 ≤1 MiB라 끝 4 MiB가 그 창을 덮는다. P1 케이스 = "5 MiB 아카이브의 끝 근처 같은 키 → `dup` · 앞쪽 같은 키 → 제안됨(선언)" · 계급 28의 아카이브 문구 삭제. |
| **R56-M3** | Med | R16 · ② `memory list`/`approve` | `list`는 `firstLine` 80자만(`memory-cli.ts:336-338`) — 카드 본문은 신뢰가 낮고 ≤2000자인데 `activated:`도 사후 80자. 유일한 통제(D19)가 본문 대부분을 못 본다. | 카드 출처 행 접미: 본문 > 80자면 `[card by X · +<n> chars — loom memory show <id>]` · `approve` `activated:` 줄은 카드 출처일 때 **본문 전체** · P4 축자 케이스 2개 추가 · 사람 출처는 0.37 바이트 유지. |
| **R56-M4** | Med | D18 · P5 · (j)(k) · UK-1 | 실 CLI 조건이 "거부·탈선 없음"뿐 — 세 에이전트 모두 `proposed 0`이어도 ship된다(기능 작동 미검증). | (j) 끝에 추가: **"세 카드 모두 `notes.md` 존재 · 적어도 한 카드 `proposed ≥ 1` — 셋 모두 0이면 ship 차단(SKILL.md 문면 개정 → 오너 승인 재실행) · 에이전트별 0은 UK-2 관찰로 기록"** · UNKNOWNS UK-1 열 동기. |
| **R56-L1** | Low | R8 | `/\bLOOM-(MEMORY\|REPORT)-/i`가 대소문자 무시 → `loom-memory-candidates`를 언급한 정당한 후보를 버린다(아키텍트의 `loom-` 비필터 근거와 상충 · 파서는 표지 줄 대소문자 정확 일치 — R7). | 대소문자 구분 `/LOOM-(MEMORY\|REPORT)-/` · P1 오탐 대조에 "`loom-memory-candidates` 언급 → 제안됨" 추가. |
| **R56-L2** | Low | D3 · ⑤ 무번호 | 방 `skills.json`이 `loom-memory-candidates`를 고르면 꺼짐에서도 내장이 materialize(0.37은 `not installed`) → manifest 변화 · 아무도 파싱 안 하는 블록. 켰다 끈 뒤 재개 카드도 사본에 스킬 유지. | 내장 `loom-memory-candidates`는 **`forced`로만** 받아들인다 — 방 선택만이면 `not installed`(0.37 바이트 · 사용자 출처 같은 이름은 그대로) · 무번호 행 "끈 뒤 재개 카드는 사본 스킬 유지 · 파싱 0" · P2 케이스 추가. |
| **R56-L3** | Low | D5 · R20 | exited-recovery는 항상 `timedOut: false`(`headless-worker.ts:1250`) → 타임아웃 뒤 전송 전 bridge가 죽은 카드도 후보를 낼 수 있다(기존 사유 동작의 확장). | ⑤ 무번호 행 선언 + P3에 그 갈래 고정 케이스 · 코드 변경 없음. |
| **R56-L4** | Low | D12 문면 · ② 결과 경로 · R11 인용 · ② show | (a) "never waits"가 D11 순서(전송 전 제안)와 상충 · (b) `agentKey` 미고정 · (c) R11 "0.35 `entriesOversize`" 인용 오류 · (d) `show`는 이미 `source: {json}` 출력(`:660`). | (a) "≤ 예산 + 유계 동기 작업(R21)" · (b) `agentKeyFor(this.deps.profile, record.agent)` 고정(스냅샷 `:2071`과 같은 키) · (c) `memory-snapshot.ts:38-39` `SNAPSHOT_ENTRIES_READ_MAX_BYTES`(0.36) · (d) show 새 줄 접두 `origin:`(중복 `source:` 회피). |

### Decision notes
- **C1 → R2 수용**(`source.handoff` 없이는 줄에서 키를 못 찾는다) · **C2 수용** — D4 선언 = "새 첫 spawn부터 · 진행 중 카드는 사본 유지", P3가 증명(UK-5) · **C3 → R10 수용**(헬퍼 비공개) · **C4 → M2로 대체** · **C5 → M1** · **C6 수용**.
- **R8 아키텍트 축소 수용(+L1)** — 주입 시점 nonce · `containsMarker` · 펜스 줄 무력화가 있으므로 32 hex 필터는 이득 0.
- **R15 수용**(빈 출력은 이전 `notes.md`를 지우지 않음 — 문서에 "직전 시도 사본일 수 있음") · **R16 수용(+M3)** · R1~R7 · R9 · R10 · R12~R14 · R17~R22 수용.
- **계급 28 보강:** bridge가 락을 쥔 채 크래시하면 재기동 뒤 `LOCK_STALE_MS` 5초 동안 recovery 재처리도 `busy` → 그 후보는 사라진다(한 줄 추가).
- **결정을 가르는 리스크:** M3 — 사람 승인이 유일한 통제인데 승인자가 본문을 보지 못한다.
- **UK 판정:** UK-1 ship 차단(M4 문면으로 강화) · UK-2~UK-7 비차단.
- **수정 범위:** `docs/PLAN.md` §0.38.0 · `docs/UNKNOWNS.md` UK-1 · `docs/plan_review.md` — 제품 코드 0.
- Advisor: opus-advisor consulted: yes.
