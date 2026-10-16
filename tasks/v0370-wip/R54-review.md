## Review R54 — Plan v0.36.0 (headless 워커 카드 시작 기억 스냅샷 + 펜스 주입, MINOR)

**검토 대상:** `docs/PLAN.md` §0.36.0(권위 고지 · D1~D11 · ② 인터페이스 정본 · R1~R18 · C1·C2 · 계급 5·10~16 · P1~P5 · UK-1~7 · Done when (a)~(i)) + §0.35.0 "다음 후보" 정정 + `docs/UNKNOWNS.md` §0.36.0 + `docs/UPGRADE-PLAN.md:17,26-28,97-98` + 코드 대조(`5fa8167`): `headless-worker.ts:923-976`(두 갈래 실측 일치) · `:1339-1368` · `:1058-1137`(lead — 미전송 레코드는 adopt 경로로만 감) · `:1570-1664` · `bridge-config.ts:374-412`·`:461-477` · `memory-snapshot.test.ts:773-800`(**`packages/`+`scripts/` 전수 부분 문자열**) · `redact.ts:68`(env 값 <8자 제외) · `packages/cli/src/memory-cli.ts:860-877`(CLI profile = `resolveBridgeProfile` — `--profile`·`LOOM_PROFILE`·displayName·default).
**검토자:** Fable 5.1 (fable-advisor). **Advisor: fable-advisor consulted: yes.**
**날짜:** 2026-10-16
**결론:** **`approved-with-fixes`** — High 0 · Medium 3(M1~M3) · Low 2(L1·L2). 전부 PLAN 문안으로 닫힌다. **D1~D11 충실 · R1~R18 수용 · C1 → R1 수용 · C2 → R15 수용(M1 순서 조정)**. **no R54b**(아래 문안대로 반영하면 `approved`).

### 결정적 발견
설계는 닫혀 있다 — 꺼짐 동일성은 구조(`composeMemoryWrapped` 빈 블록 = `wrapDispatchedPrompt` · 조건부 `\0` 꼬리 · 키 생략)로 보장되고, 게이트는 레코드 값 하나로 갈려 플래그 토글 양방향이 안전하며, 크래시 창은 lead `:1097`이 미전송 레코드를 첫 spawn으로 보내지 않아 "hash 있는 레코드가 살아 있는데 파일이 덮이는" 경우가 없다. **새는 곳은 실행 계획 둘:** (M1) P1 green이 `memory-inject.ts`에 `"memory-snapshot.md"` 리터럴을 넣는 순간 **아직 뒤집지 않은** 부분 문자열 가드(`:791`, `scripts/`까지 전수)가 red가 된다 — D10b 뒤집기가 P2 red에 있어 P1 green 스위트가 깨진다. (M2) 스모크의 dist CLI 자식은 profile을 `resolveBridgeProfile`로 풀어 임시 홈에서 `default`가 되고, 디스패처는 `smoke`를 읽는다 — 완료 기준 (a) 스모크가 설계대로 쓰면 **항상 실패**한다.

### Checklist
- [x] ① 꺼짐 바이트 동일 — PASS(구조 보장 · 고정 테스트 목록 충분 · `session.json` 키 집합 검사 포함) + L1
- [x] ② resume 게이트 완전성 — PASS(`nextPlan` 한 갈래 · `:1066`·`:1107` 둘 다 `fingerprintChangedLocked` 경유 · `:794` 코드 0 + 테스트 · 토글 양방향 R11) + L2
- [x] ③ 쓰기 순서 · 크래시 창 — PASS(파일 → write-ahead → spawn · 미전송 레코드는 첫 spawn 불가 → 덮어쓰기 창 없음 · R7 삭제는 레코드 전)
- [x] ④ 펜스 · nonce · 무력화 — PASS(바이트 축자 · 네 고정 문자열 alnum이 `loomdispatchedtask` 미포함 · R6 수용)
- [x] ⑤ 완료 기준 (a) 종단 — PASS 설계 / **FAIL 스모크 → M2**
- [ ] ⑥ 테스트 홈 안전 — **FAIL → M3**(`--real-cli` 모드가 가드와 양립 불가)
- [ ] ⑦ red/green — **FAIL → M1**(P1 green 스위트 red)
- [x] ⑧ 계급 5 · 10~16 — PASS(전부 있고 한계 명시)

### Findings
| ID | Sev | 결함 | 수정 |
|---|---|---|---|
| **R54-M1** | Med | 기존 가드(`memory-snapshot.test.ts:791`)는 `packages/`·`scripts/` non-test 파일의 부분 문자열 `"memory-snapshot"`을 위반으로 센다 → P1 green(`memory-inject.ts`의 `MEMORY_SNAPSHOT_FILE = "memory-snapshot.md"`)에서 스위트 red · D10b 뒤집기는 P2 red | **D10b 뒤집기를 P1 red로 이동**(테스트 파일만 — red 0 production 유지) · P1 red 상태에서 "`headless-worker.ts` 필수" 단언이 red인 것은 **예정된 red**로 커밋 메시지에 명기 · P2 green에서 녹색 · ⑥·⑦ 표 P1/P2 행 갱신 |
| **R54-M2** | Med | P5 스모크: 디스패처 profile `smoke` → `memory/claude.smoke/` 읽음 · dist CLI 자식(`memory propose\|approve`)은 `resolveBridgeProfile` → 임시 홈에 세션 없음 → `default` → `claude.default`에 기록 → 셋 모두 **project 기록 부재**로 실패 | **모든 CLI 자식 env에 `LOOM_PROFILE=smoke`**(또는 매 호출 `--profile smoke`) · 스모크가 `loom memory list` 머리 `profile smoke (from LOOM_PROFILE)`을 먼저 단언 · R16 테스트와 짝(UK-6 실측 1건 추가) |
| **R54-M3** | Med | `--real-cli` "그 자식만 실 HOME · `LOOM_TEST_HOME=T`" — 실 CLI는 **디스패처가 안쪽 프로세스의 `process.env`로** 띄우고 `scrubWorkerEnv`가 `LOOM_*`만 지운다 → 안쪽 프로세스 자체가 HOME=실·`LOOM_TEST_HOME=T`여야 하는데 가드 "두 값 같고 tmpdir 아래"가 그것을 exit 1로 막는다 | 가드를 모드별로: 기본 = HOME===`LOOM_TEST_HOME` ∧ `os.tmpdir()` 아래 / `--real-cli` = `LOOM_TEST_HOME`만 tmpdir 아래 · HOME 실 · dist CLI 자식은 `loomDir()`이 `LOOM_TEST_HOME`을 우선하므로 `~/.loom` 무접촉(명시) · 실 홈 전후 비교 규칙 동일(`~/.loom`·`~/.fable` 엄격 · 셋은 새 이름만) · (g) 문안 동일 수정 |
| **R54-L1** | Low | R7이 **꺼짐** 첫 spawn에도 `unlink`를 넣고 비-ENOENT 실패를 `spawn_setup_failed`로 올린다 — 0.35 무변경을 약속한 경로에 새 syscall·새 실패 모드 | R7 = `deps.memory?.enabled === true` **그리고** `block === ""`일 때만 삭제 · 꺼짐 = 파일시스템 무접촉(남은 파일은 R8·R11로 무해) · P2 "남은 파일 삭제" 케이스를 "켜짐 + 빈 text"로 한정 |
| **R54-L2** | Low | 게이트 1) "문자열 아님 → `bad record field`"인데 호출 지점이 `record.memorySnapshotHash ?? ""`를 넘긴다 → 변조된 `null`이 `""`로 바뀌어 "블록 없음"으로 통과 | 호출 지점 = `record.memorySnapshotHash === undefined ? "" : record.memorySnapshotHash`(`nextPlan` · `fingerprintChangedLocked` · resume write-ahead 셋 동일) · P3 (v)에 `null` 케이스 추가 |

### Decision notes
- **C1 → R1 수용.** 기억 플래그는 argv·권한·정책과 무관한 런타임 입력이다 — `WorkerConfig`에 넣으면 (f)의 `agent-argv.ts` diff 검증이 무뎌지고 얻는 것이 없다. `HeadlessDeps.memory` 옳다.
- **C2 → R15 수용(M1 순서로).** 저장소 import는 전부 확장자 없는 `"./x"` 형이라 정규식이 맞는다.
- **R4 수용.** `wrapDispatchedPrompt(block + "\n\n" + prompt)`는 표지 상수를 복제하지 않아 드리프트 0 — 꺼짐 동일성이 테스트가 아니라 구조로 선다.
- **R6 수용.** 가짜 END는 nonce가 없거나 달라 머리말이 선언한 종료 조건을 못 채운다 — 무해. 두 줄 조각은 표지가 아니다(hint의 권위는 정확한 표지 줄에 있다). 남는 것은 계급 13 그대로 — 적절히 한정됐다.
- **D9:** 동작 변경 선언·계급 15·grep 한계 명시 — 충분. 깨지는 기존 테스트가 나오면 R54 판정 대상으로 올리는 규칙 유지.
- **결정을 가르는 리스크:** M1(P1 green이 스위트를 깨면 red/green 규율이 첫 PATCH에서 무너진다).
- **UK 판정:** UK-1~UK-7 비차단 유지.
- **수정 범위:** `docs/PLAN.md` §0.36.0(② `memory-snapshot.md` 행 · 호출 지점 행 · R7 · P1·P2·P3·P5 · (a)(b)(g) · ⑥ 테스트 행) · `docs/UNKNOWNS.md` UK-6 열(M2 실측 추가) · `docs/plan_review.md`. 제품 코드 0.

**R54b 필요 여부:** 불필요 — M1~M3·L1·L2를 위 문안대로 반영하면 `approved`. 다른 해법(예: 가드 뒤집기를 P2에 두고 `memory-inject.ts`에서 리터럴을 빼는 식)을 택할 때만 R54b.
