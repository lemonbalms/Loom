## Review R55 — Plan v0.37.0 (정책 정직성 · `policyGaps` 단일 원천 · 펜스 안 정책 안내문 + 규칙 본문 · strict · `agent_disabled` · AGENT_HINT 삭제, MINOR)

**검토 대상:** `docs/PLAN.md` §0.37.0(권위 고지 · D1~D9 · ② 인터페이스 정본 · ③ doctor 행 · R1~R21 · C1~C4 · 계급 17~22 · P1~P5 + P4b · UK-1~7 · Done when (a)~(k)) + `docs/UNKNOWNS.md` §0.37.0 + `docs/UPGRADE-PLAN.md:17,28-29,99` + 코드 대조(`acd53a0`): `policy-compile.ts:31-55`·`:108-137`·`:145-174` · `policy.ts:462-474`·`:476-524`·**`:765-769`**(`shellDeny = new Set(builtinDefaults.shell.deny)` — 사용자 deny는 **합집합**) · `:787-792` · `bridge-config.ts:276-292`·`:396-446`·`:482-500` · `bridge-runtime.ts:855-884` · `headless-worker.ts:102`·`:127-129`·`:148-170`·`:260-264`·`:1136-1195`·`:1705-1750`·`:2008-2050` · `memory-inject.ts:19-80` · `memory-inject.test.ts:66-67`·`:177` · `bridge-memory-profile.test.ts:228-256` · `headless-memory.test.ts:297`·`:610`·`:680`·`:934`(블록은 `renderMemoryBlock`으로 계산 — 머리말 리터럴 없음) · `policy-fingerprint.test.ts:48-64`·`:106-107` · `memory-snapshot.test.ts:774-804` · `agent-argv.ts:74`·`:237-240`(`validateWorkerConfig`는 `maxConcurrent` 미검사)·`:275-277` · `packages/protocol/src/card-contract.ts:51`(`reason: z.string().max(200)` — 자유 문자열) · `cli/src/index.ts:2157-2160` · `cli/src/service.ts:1106-1127` · `session-store.ts:79-83`.
**검토자:** Fable 5.1 (fable-advisor). **Advisor: fable-advisor consulted: yes.**
**날짜:** 2026-10-17
**결론:** **`approved-with-fixes`** — High 0 · Medium 2(M1·M2) · Low 4(L1~L4). 전부 PLAN 문안으로 닫힌다. **D1~D9 충실 · R1~R21 수용(R17은 L1 형태로) · C1 → D1 문면 수용(claude 포함 6개) · C2 → R1 수용 · C3 → R14 수용 · C4 → 상수 `:66-67` 편집 수용.** **no R55b**(아래 문안대로 반영하면 `approved`).

### 결정적 발견
설계는 닫혀 있다 — 간극이 한 배열에서 나오고, 안내문이 같은 펜스·같은 렌더러·같은 redaction을 타며, 원천 없음 = 0.36 바이트가 구조(`composeFenceText("", "", t) === t` · `HeadlessDeps.policyGaps` 생략 = `[]`)로 선다. **새는 곳은 코드 사실 하나와 판정 하나:** (M1) `mergePolicy`는 내장 deny 9개를 **항상** 합집합으로 깐다(`policy.ts:766-769`) — 유효 `shell.deny`는 어떤 `policy.json`으로도 빌 수 없으므로 codex `shell.deny/not-enforced`·grok `shell.deny/best-effort` 간극은 **정책으로 제거 불가**다. 계급 20 정정문·strict 거부 꼬리("Fix policy.json")·P1의 "빈 deny → 간극 0" 케이스가 이 사실과 어긋난다. (M2) UK-1 — 옵트인 없는 production 첫 턴 변경을 실 CLI 0회로 ship하는 것은 **승인하지 않는다**; 범위를 최소로 좁힌 실 CLI 1회를 ship 조건으로 둔다.

### Checklist
- [x] ① C1 간극 정의 — PASS **D1 문면 수용(기본 6개 · claude `network/advisory` 포함)**. 근거: claude `network:false`는 `curl *`·`wget *`·WebFetch/WebSearch만 막고 Bash 안 python/node 네트워크는 못 막는다 — 표의 `advisory`가 참이고, claude만 빼면 경고·doctor·안내문이 `POLICY_ENFORCEMENT`와 어긋난다(D1이 금지한 유일한 것). 대안 셋 전부 기각 — `not-enforced` 한정: 경고 문구 "the worker is told in its prompt"가 grok/claude 간극에서 거짓이 됨 · 오너 파일만 "설정함": 기본 설치의 codex가 11개 미집행 규칙을 받는데 doctor는 "간극 없음" → (c)④ 실패 + 거짓 · `worker.policyNotice` 스위치: 끄면 같은 경고 문구가 거짓이 되는 드리프트(D1 결정적 위험) + M1
- [x] ② 절단 순서 — PASS(안내문 무절단 ≤64 KiB · 규칙 16 KiB 독립 · 기억 0.35 상한 · 합 ≪ 1 MiB `:102` · 게이트(`:1452`·`:1466`·`:1477`)가 거부할 파일은 쓰지 않음)
- [x] ③ `agent_disabled` — PASS(`concurrencyLimit` 0→1은 claim 직렬화만 · 새 카드 `:1180` 앞 · 기존 레코드 `:1147` 형 · `spawn_state_unknown` 갈래 선행 유지 · `reason`은 프로토콜 자유 문자열 → `packages/protocol` 무편집) + L4
- [x] ④ red/green — PASS(P1 red: 머리말 상수 + 신규 파일 · P3 red의 좁히기는 red 아닌 **선언 편집**으로 적절 · 각 green 테스트 0줄 가능) + L4
- [x] ⑤ 테스트 홈 안전 — PASS(R21 · `stateRootHome()`이 `LOOM_TEST_HOME` 우선 `session-store.ts:79-83` · `--real-cli`는 R54-M3 형) + M2 범위 명시
- [x] ⑥ 고정 테스트 무편집 목록 — PASS(머리말 리터럴은 `memory-inject.test.ts:67`에만 — `headless-memory.test.ts`는 `renderMemoryBlock`으로 계산 · `integer >= 1` 고정 테스트 0 · 세 편집 선언 충분)
- [x] ⑦ fingerprint·템플릿·프로토콜 무변경 — PASS(`maxConcurrent`는 fingerprint 입력 아님 · `validateWorkerConfig` 미검사 → `agent-argv.ts` 무편집 · `Enforcement` 미export는 `typeof POLICY_ENFORCEMENT` 유도로 충분)
- [ ] ⑧ Done when — **FAIL → M2**((j)(k)에 실 CLI 조건 추가) · (a) "C1 판정에 따라 5개" 문구 삭제(6개 확정)

### Findings
| ID | Sev | 결함 | 수정 |
|---|---|---|---|
| **R55-M1** | Med | `mergePolicy`가 내장 deny 9개를 항상 합집합(`policy.ts:766-769`) → 유효 `shell.deny`는 결코 비지 않음 → codex·grok `shell.deny` 간극은 **정책 편집으로 제거 불가**. 계급 20 정정문이 정책으로 strict를 통과시킬 길이 있는 듯 읽힘 · `renderStrictRefusal` 꼬리 "Fix policy.json"이 shell.deny 간극에 거짓 · P1 "network: true + isolate false + 빈 deny → 간극 0"은 실 정책으로 도달 불가 | **계급 20 문면 교체:** "strict는 **codex와 grok을 끈 상태**에서만 통과할 수 있다(두 에이전트의 `shell.deny` 간극은 내장 deny 합집합 `policy.ts:766`으로 어떤 `policy.json`에서도 남는다) · 거기에 claude는 `network: true`이거나 꺼져 있어야 한다" · **거부 꼬리 교체:** `Disable the agent (worker.maxConcurrent.<agent>: 0), fix network/mcp items in policy.json (shell.deny gaps cannot be removed there), or set worker.strictEnforcement to false.` · P1 그 케이스에 "합성 `EffectivePolicy` 전용 — 실 정책 도달 불가" 주석 · UK-6에 "codex/grok을 켠 bridge는 경고 2~3줄이 **영구**(설계)" 명기 · Why 표에 `:766` 실측 행 추가 |
| **R55-M2** | Med | UK-1: 옵트인 없이 모든 production 첫 턴이 바뀌는데 실 CLI 실행 0회 · 가짜 CLI는 바이트 도달만 증명 · 실패 시 업그레이드 직후 전 카드가 production에서 처음 실패 · 유일한 회피 = 에이전트 끄기 | **ship 조건으로 격상:** (j)에 "`smoke:policy --real-cli --owner-approved` **① 한정**(codex·grok·claude 각 1카드 · 프롬프트 `Reply with the single word ok.` · 기본 정책 · 기억·규칙 꺼짐 · 안쪽 프로세스 실 HOME + `LOOM_TEST_HOME=T` R54-M3 형) 1회 PASS — 세 응답이 결과를 내고 거부·탈선 없음을 `POLICY-HONESTY-SMOKE-0370.md`에 기록" · (k) "R55 approved + (j) 실 CLI ① PASS" · UK-1 열 = **ship 차단(오너 승인 필요 — 승인 없으면 ship 대기, `unverified` ship 불가)** · UNKNOWNS 표 동일 · 기각 대안 = 스위치/`not-enforced` 한정(① 참조) |
| **R55-L1** | Low | R17 식 `(named.length > 0 ? named : AGENT_KINDS).filter(k => conc[k] !== 0)` — `maxConcurrent = {codex: 0}`만 있으면 `named = [codex]` → 필터 뒤 `[]` → 켜진 claude·grok PATH 검사 0 | `enabled = AGENT_KINDS.filter(k => conc[k] !== 0)` · `named = enabled.filter(k => k in bin \|\| k in conc)` · `return (named.length > 0 ? named : enabled)` · `doctor-service.test.ts` 추가 케이스 = `{codex: 0}`만 → claude·grok 검사됨 |
| **R55-L2** | Low | P5 안쪽 자식 "`loadPolicy(loomDir())` + `policyGaps`" — bridge는 `resolveWorkerPolicy(permissions, …)`(deprecated 목록 합집합 · `:145-166`)의 `effective`를 쓴다 · 맨 `loadPolicy`는 입력이 다름 | 안쪽 자식 = `workerConfigFromBridge(cfg)` → `policyGaps(effectiveWorkerPolicy(config).effective, enabledAgentsOf(config.maxConcurrent))` — ② "bridge 기동" 행과 같은 두 호출로 문안 고정 |
| **R55-L3** | Low | `POLICY_NOTICE_LEAD` "The operator's **policy.json** sets these limits" — 기본 정책(파일 없음)에서 거짓 | `The operator's Loom policy sets these limits, and this CLI does not fully enforce them for you. Follow them yourself.` · ② 축자 갱신 |
| **R55-L4** | Low | P1 green이 `parseMaxConcurrent` 0을 허용하는데 워커의 `agent_disabled` 검사는 P2 green — 그 사이 커밋은 0을 "레인 1개로 돈다" | `parseMaxConcurrent` 0 허용 + 그 파서 테스트를 **P2**로 이동(`bridge-config-policy.test.ts`의 해당 케이스만 P2 red) · P1은 `strictEnforcement`·`rules` 파서까지 |

### Decision notes
- **C1 → D1 문면 수용.** 간극 6개 확정 — (a)·UK-6·계급 20에서 "C1 판정에 따라" 조건문 삭제. 결정을 가른 사실: 표의 claude `advisory`는 참이고, D1의 유일한 금지가 렌더러 드리프트다. M1이 보여 주듯 codex/grok 안내문은 어차피 영구이므로 C1의 실질은 "claude도 받는가"였고, 받아야 한다.
- **C2 → R1 수용.** `values` 없이는 안내문 입력이 둘이 된다.
- **C3 → R14 수용.** `~/.fable` 이관 대기 중에만 다르고 Home 절이 그 상태를 보인다. ③ 출처 행에 한 줄 선택 info 추가 권고(강제 아님): `legacy ~/.fable/policy.json present — bridge/MCP migrate it on first run`.
- **C4 수용.** 편집 = `memory-inject.test.ts:66-67` 상수 하나 · `:177`·`:242-402`는 그 상수를 쓴다.
- **R4 수용(Review impact ④).** 프로덕션 생성자 1개 — "항상 켜짐"은 bridge 경유 전 카드에서 성립하고, 직접 만든 디스패처가 0.36 바이트를 계속 증명하는 것이 D3를 약화시키지 않는다. L2가 스모크 쪽 입력을 bridge와 같게 묶는다.
- **R3 수용.** 수준별 꼬리 다섯이 `policy-compile.ts:108-137` 실측과 맞다. `mcp.isolate` 지시 "Do not use MCP tools."는 claude `--strict-mcp-config` = MCP 서버 0개(USER_GUIDE `:944`)와 등가라 참.
- **R8·R9·R12·R13 수용.** 서비스 10초 재시작 루프는 무효 `policy.json`과 같은 기존 동작 — 적절.
- **결정을 가르는 리스크:** M2(실 CLI 1회 없이 production 첫 턴을 바꾸는 것).
- **UK 판정:** UK-1 **ship 차단(M2)** · UK-2~UK-7 비차단 유지(UK-6은 M1 문면으로 "영구 경고" 명시).
- **수정 범위:** `docs/PLAN.md` §0.37.0(계급 20 · ② `renderStrictRefusal`·`POLICY_NOTICE_LEAD` · R17 · P1/P2 파서 이동 · P5 안쪽 자식 · (a)(j)(k) · UK-1·UK-6 · Why 표) · `docs/UNKNOWNS.md` UK-1·UK-6 열 · `docs/plan_review.md`. 제품 코드 0.
