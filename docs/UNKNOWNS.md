# Unknowns — 지도 ≠ 영토

| Field | Value |
|-------|--------|
| **Document** | `docs/UNKNOWNS.md` |
| **Role** | 미지 템플릿 + 게이트별 **짧은** 표 |
| **SSOT** | **아님** — 제품 계획 SSOT는 `docs/PLAN.md` |
| **Workflow** | `docs/WORKFLOW.md` **§3.5** |
| **Last updated** | 2026-10-18 |

---

## 왜 있는가

프롬프트·PLAN·스킬은 **지도**다. 코드·보안·툴체인·실제 UX는 **영토**다.  
그 간극이 **미지(unknowns)** 이고, 에이전트는 여기서 추측 결정을 한다.

이 파일은 미지를 **값싸게** 드러내기 위한 체크리스트다.  
규칙 본문: WORKFLOW §3.5.

| 이름 | 의미 |
|------|------|
| **Loom** | 제품 |
| **Fable 5 / fable-advisor** | 리뷰 에이전트 |
| **Unknowns** | 작업 방법론 (제품명 아님) |

---

## 템플릿 (게이트마다 복사)

```markdown
## 0.X.Y — <한 줄 제목>
| 분면 | 내용 |
|------|------|
| Known knowns | … |
| Known unknowns | … |
| Unknown knowns | … |
| Unknown unknowns | … |
```

---

## Gate log

### 0.43.0 — 헤드리스 워커 시스템 채널을 Loom이 쓴 고정 섹션 여섯으로 · 프롬프트 기록 v3 · fingerprint 변경 · drain (`approved` — R62 approved-with-fixes · no R62b · implemented (P1–P3) · 실 CLI: 오너 승인 대기)

| Field | Value |
|-------|-------|
| **PLAN** | v0.43.0 (`approved` — R62 approved-with-fixes, 반영 완료 · no R62b · author-close 불가) · MINOR · 업그레이드 5단계 3부(의미 이동 슬라이스 A) · 근거 = §0.41.0 D1 · §0.42.0 Next · §0.42.0 UK-1 · R9 + 아키텍트 증거 팩(HEAD `f7912e8` — §7 후보 A 권함) · 범위 = 락 D1~D9(아키텍트 2026-10-18) |
| **Date** | 2026-10-18 |
| **Review** | R62 **done 2026-10-18** — approved-with-fixes H1 · M2 · L4 (H1 `ops-rules` 새 줄 1 교체 `Back each claim with something the dispatcher can check (a changed file, or a command you ran and its result); do not create files just to hold evidence.` · R13 ⑥ `WORK` 새 항목 → ship 안 함 · 스모크 `InnerCardOut.workFiles` · M1 `response-style` 새 줄 1 교체 `Keep the final message short, but keep any report format or block that a listed skill asks for.` · M2 C3 ② `headless-worker-hint.test.ts:63` `split("\n")[1]` → `[4]` · L1 `PromptRecordSection` 지역 형 · `toV2` 반환형 · P1 · P2 `bun run typecheck` · L2 `response-style` 새 줄 2 교체 `Never put secrets, tokens, or credentials in your final message.` · L3 `UPGRADE-PLAN.md:206` 정정 문면 · L4 R10 claude 끝 = 추정 · 시스템 텍스트 1,024 → 1,093 B) — (`WORKFLOW.md` §5.1 fingerprint를 바꾸는 워커 지시 변경 · 시스템 수준 지시 문면 확장 · 영속 형식 변경(기록 `version: 3`) · 실 CLI ship 게이트) |
| **Implemented** | 2026-10-18 — P1 `c11175b` → `b571b2e` · verify 0120 PASS · 알려진 실패 정리 `3a7583f`(스위트 0 fail) · P2 `55099f1` → `ee1cf9f` · verify 0122 PASS · P3 `c4ffdd2`(확인 테스트 · production 0줄) · `813ca1c`(scripts harness) · P3 verify 0124 FAIL(하네스 4건) → P3b `bb0f752` → 0127 M 1건 수용(WORK 디렉터리 → 심볼릭 링크 경합 · 같은 사용자 한계 — implementation-notes §0.43.0 (8)) · 최종 advise 0128 FIX-FIRST(하네스 — 실 CLI 모드가 ⑨ 검사를 안 함 · 결과 상태 미출력 · 기록 포인터) → P3c `d57297e` · verify 0130 PASS-with-lows(주석 L → `06b4eb1`) · 제품 코드 · 문서는 그대로 실 CLI 가능 판정 · 스위트 3995 pass / 0 fail(P3 전) · 4003 / 0(P3b 뒤) · 가짜 `smoke:memory-write` 11/11(카드 13장 v3 · `system` sha `b23d8279ca44` · `WORK` 새 항목 0) · `smoke:memory-inject` 7/7 · **실 CLI: 오너 승인 대기**(D7 — [`MEMORY-WRITE-SMOKE-0430.md`](spikes/MEMORY-WRITE-SMOKE-0430.md) 틀만) |
| **Evidence** | 코드 실측 작업 트리 2026-10-18(HEAD `f7912e8`) · `agent-argv.ts:3` · `:18` · `:28-36` · `:286` · `:333-335` · `:371-387` · `:406` · `:422` · `:446-448` · `prompt-assemble.ts:148` · `:161` · `prompt-manifest.ts:62-116` · `prompt-record.ts:25` · `:37-71` · `:74` · `:92` · `:154-179` · `:232-267` · `:282-317` · `prompt-cli.ts:316-327` · `headless-worker.ts:1077-1081` · `:1218` · `:1234` · `:1455-1467` · `:1931-1946` · `:1994-2002` · `memory-inject.ts:26` · `policy-compile.ts:54` · `:110` · `smoke-memory-write.ts:50-51` · `:263-270` · `:317-337` · `PROTOCOL.md:161` · `UPGRADE-PLAN.md:180-190` · `:206` · 고정 테스트 좌표 = PLAN §0.43.0 C3 |

| 분면 | 내용 |
|------|------|
| Known knowns | (1) 오늘 시스템 채널 = `HEADLESS_WORKER_HINT` 7줄 · 497 B 한 섹션 · 세 CLI 같은 상수 · 첫 턴과 재개 모두. (2) 시스템으로 옮길 수 있는 신뢰 수준의 텍스트 = Loom 고정 문면뿐 — persona · INDEX · guideline = 오너 사람 파일(Loom 안 쓰기 경로 없음) · 기억 항목 = 피어 제안 → 오너 승인 · 카드 본문 = 디스패처 피어 · 시스템으로 옮기면 codex/grok argv 노출 · 권위 상승(증거 팩 §6). (3) hint가 바뀌면 모든 카드 fingerprint가 바뀌고 재개 · recovery · 입양 게이트 레코드가 한 번 `needs_verification` — 0.39 선례(drain → 진행 중 0 확인 → 교체 → start). (4) 새 시스템 텍스트 1,093 B(수기 계수 · 오늘 일곱 줄 축자 + 새 줄 여섯 — R62-H1 · M1 · L2 교체 뒤 · R62가 원 1,024 B 계수를 손으로 다시 셈) · `"` · `\` 없음 → codex 맨 형식 유지. (5) `prompt-cli.ts` 블록 출력은 섹션을 일반적으로 출력 → v3 시스템 줄에 코드 변경 불필요. (6) 스모크는 끝에 임시 홈을 지운다 → 기록 판정에 스모크 편집 필요(C2). |
| Known unknowns | **UK-1~UK-5**(아래 표, 정본 = PLAN §0.43.0). 요지: 새 문면의 행동 효과(2번 줄 예외 희석 포함) · codex 맨 값의 빈 줄 · "no Loom tools"의 진실성 · 재개 때 시스템 텍스트 교체/중복 · 슬라이스 B/C의 필요. |
| Unknown knowns | `UPGRADE-PLAN.md:206`은 persona · 방 규칙 · 지식을 "다른 참가자가 인계로 써 넣을 수 있다"고 적었지만 코드엔 그 경로가 없다(D1 정정). D2 예시 "Loom judges completion from the final message and evidence"는 코드의 결과 갈래(`headless-worker.ts:1455-1467`)와 맞지 않는다 → 지시로 씀(C1). 0.42 v2 시험 두 파일은 **현재 조립기**로 v2 기록을 만들어, 시스템 섹션이 바뀌면 v2 시험이 통째로 v3가 된다 → 테스트 안 `toV2` 도우미(C3). 0.42 v2 시험의 "version 3 → unsupported version"은 v3 도입으로 `missing sections`가 된다 → version 4로(C3 ①). `worker-hint`가 manifest에서 빠지면 v2 동결 표의 타입이 사라진다 → 기록 지역 id 타입(C4) · 빌더 입력과 `toV2` 반환형까지 지역 형 `PromptRecordSection`(R62-L1 — `tsconfig.json:7`이 테스트를 포함해 typecheck red). **(R62)** 워커 cwd는 카드 디렉터리가 아니라 오너 작업 트리다(`headless-worker.ts:899-906`) → "증거를 작업 디렉터리에" 줄은 읽기 전용 · 리뷰 카드에서 파일 생성 지시가 된다(H1). 최종 메시지 형식은 이미 Loom 스킬(`loom-card-report` · `loom-memory-candidates`)이 정한다 → 시스템 권위의 세 필드 형식은 그것과 경쟁한다(M1). `headless-worker-hint.test.ts:63` `split("\n")[1]`은 새 배치에서 `""`(M2). |
| Unknown unknowns | 시스템 텍스트가 길어진 뒤 CLI별 기본 시스템 프롬프트와의 상호작용(claude는 append — Loom 텍스트가 기본 프롬프트 뒤) · 새 운영 줄이 모델의 거절 성향을 바꾸는 방향 · 슬라이스 B에서 persona를 옮길 때 카드별 fingerprint 입력과 재개 재현 파일의 형(증거 팩 §3). |

**Unknowns 요약 (정본 = PLAN §0.43.0):**

| # | 요지 | 출발 기본값 / 착수 영향 | R62 판정 |
|---|------|-------------|----------|
| UK-1 | **새 시스템 문면의 행동 효과** — 운영 · 응답 · 끝 경계 줄이 최종 메시지 · 거절 · 범위 행동을 바꾸는지 · 2번 줄 예외가 새 운영 줄 사이에서 약해지는지(§0.41.0 UK-4 앞부분 승계) | D7 ③ · ④가 0.39 결과 회귀를 판정 · 효과는 관찰만(R14 · lessons (57) — 카나리아 없음 · 문자열 포함 준수 판정 없음) · 오너 트리 쓰기 부작용은 D7 ⑥(R62-H1)이 판정 | 비차단 수용(새 줄 셋은 R62-H1 · M1 · L2 문면으로 교체 — 모든 카드 종류에서 참 · 안전 · Loom 스킬 형식과 비경쟁) |
| UK-2 | **codex 맨 `developer_instructions` 값의 빈 줄** — 원문 문자열로 쓰이는지(지금까지 7줄 LF만 실측) | D7 ①이 잡는다 · 실패 시 basic string 감싸기 = argv 모양 변경 → 오너 선택 | 비차단 수용 |
| UK-3 | **`You have no Loom tools.`의 진실성** — codex · grok 사용자 전역 MCP에 Loom 등록(격리 불가 — 계급 64) | 문면 축자 유지(D6) · D7 transcript 관찰 | 비차단 수용 |
| UK-4 | **재개 때 다시 넘긴 시스템 텍스트(1,093 B)의 교체/중복** — claude · grok(§0.41.0 UK-4 뒷부분 승계 · 계급 68) | 같은 Loom 문면이라 내용 충돌 없음 · D7은 한 턴이라 관찰 불가 · 별도 프로브 후보(오너 승인) | 비차단 수용(바이트 1,093 B — R62 ② 새 합계) |
| UK-5 | **슬라이스 B · C의 필요** — persona · 규칙 · 안내문 시스템 이동의 실증 | 0.43 관찰 + 운영 뒤 오너 판단 · B/C 착수 전 §0.41.0 UK-4 차단 유지 | 비차단 수용 |

**승계:** §0.41.0 UK-4(claude · grok 시스템 채널 수신 효과 · 재개 교체/중복) — 슬라이스 A에서는 **비차단으로 강등**(옮기는 것이 Loom 고정 문면뿐 · 0.30부터 같은 채널 · 따르지 않아도 7번 줄 데이터 규칙은 오늘처럼 남음 · D7 ③ · ④ · ⑥이 회귀 판정 — R62 질문 6 수용) → UK-1 · UK-4로 관찰 · **B/C 착수 전 차단 유지**. §0.41.0 UK-2(codex 재개 두 입력) 그대로. §0.42.0 UK-1(manifest 형 적합) → 이 버전으로 해소 후보(꼬리 귀속이 시스템 구분자를 흡수 · R9 규칙대로 v3 · v2 표는 읽기 갈래). §0.42.0 UK-3(펜스 원천 구별) 그대로(persona 무이동).

**Current decision:** **`approved` (R62 approved-with-fixes → H1·M1·M2·L1·L2·L3·L4 반영, no R62b, 2026-10-18).** D1~D9 아키텍트 락(2026-10-18 — D2 새 줄 셋은 R62-H1 · M1 · L2 축자 문면 · 시스템 텍스트 1,093 B) · 작성자 정밀화 R1~R14 전부 수용(R5 새 합계 · R6 + L1 · R10 + L4 · R11 문면 H1 · M1 · L2 · R12 + H1 `workFiles` · R13 + ⑥) · C1 · C2 · C5 draft 수용 · C3 → 수정(M2 · L1) · C4 → 수정(L1) · 수용 손실 계급 62~68 + 무번호 · UK-1~UK-5(전부 비차단 수용) · §0.41.0 UK-4 슬라이스 A 비차단 강등 수용(B/C 차단 유지). 구현 착수 = **P1**(기록 v3 먼저). ship = 오너 승인 실 CLI 1회(D7 — 오너 명시 yes 필요). **2026-10-18 — implemented (P1 `c11175b`/`b571b2e` · P2 `55099f1`/`ee1cf9f` · P3 `c4ffdd2` · `813ca1c` · P4 문서 · 버전 0.43.0) · not shipped:** verify P1 0120 PASS · P2 0122 PASS · P3 verify 0124 FAIL(하네스 4건) → P3b `bb0f752` → 0127 M 1건 수용(WORK 디렉터리 → 심볼릭 링크 경합 · 같은 사용자 한계 — implementation-notes §0.43.0 (8)) · 최종 advise 0128 FIX-FIRST(하네스 — 실 CLI 모드가 ⑨ 검사를 안 함 · 결과 상태 미출력 · 기록 포인터) → P3c `d57297e` · verify 0130 PASS-with-lows(주석 L → `06b4eb1`) · 제품 코드 · 문서는 그대로 실 CLI 가능 판정. UK-1 · UK-2 · UK-3 = 실 CLI 관찰 대상(실 CLI: 오너 승인 대기) · UK-4 = 한 턴이라 관찰 불가(선언) · UK-5 유지 · §0.42.0 UK-1 해소 후보(시스템 섹션이 꼬리 귀속 · v3 동결 표 · v2 읽기 갈래로 들어갔다 — 확정은 ship 뒤). **Next = 오너 승인 실 CLI 1회(D7) → ship.**

### 0.42.0 — 헤드리스 워커 입력의 선언형 섹션 manifest + 단일 조립기 · 바이트 보존 · 프롬프트 기록 v2 (`approved` — R61 approved-with-fixes · no R61b · implemented (P1–P4) · shipped 2026-10-18)

| Field | Value |
|-------|-------|
| **PLAN** | v0.42.0 (`approved` — R61 approved-with-fixes, 반영 완료 · no R61b · author-close 불가) · MINOR · 업그레이드 5단계 2부(구조화) · 근거 = §0.41.0 D1 · R60-L1 + 0.41.0 Next + 아키텍트 증거 팩(HEAD `cf44097` — §7 후보 B) · 범위 = 락 D1~D9(아키텍트 2026-10-18) |
| **Date** | 2026-10-18 |
| **Review** | R61 **done 2026-10-18** — approved-with-fixes H0 · M2 · L4 (M1 v2 검사 기준표 = `prompt-record.ts` 동결 상수 `PROMPT_RECORD_V2_SECTIONS` · `PROMPT_MANIFEST` 투영 테스트 · R9 구조 변경 = 새 레코드 버전 · R14 · UK-1 · UK-5 · M2 C3 편집 5곳 · 2파일 — `prompt-cli.test.ts:249` · `:250` · L1 R3 max 규칙 · `task-marker` 0.30.0 · P1 착수 전 이력 명령 · L2 `memory-snapshot` 판정 = `composeFenceText` 식 · 조립기 parts ⇔ 블록 일관성 throw · L3 골든 리터럴 기대값 · 빈 본문 칸 · grep `composeMemoryWrapped` · `assembled` 자리 · L4 v2 변조 `user` → `bad sections`) — (`WORKFLOW.md` §5.1 영속 형식 변경(기록 `version: 2`) · 운영자 CLI 출력 변경(`show` `sections:` 블록) · 시스템/데이터 경계를 만드는 조립 경로 교체) |
| **Implemented** | 2026-10-18 — P1 `73e489c` → `4c19210` · verify 0107 PASS(1 L — R61-L1 이력 결론 → implementation-notes §0.42.0 (1): 0.36 뒤 `card-contract.ts` · `redact.ts` · `marker-fold.ts` 변경 = `ace1e08`/`d47f566`(0.40.0)뿐 · `redact.ts` 마지막 변경 `f6253c3`(0.35.0 · 출력 바이트 동일) → version 무변경) · P2 `55befda` → `3d7d1ab` · verify 0109 PASS · P3 `adcc7a2` → `d93dae0` · P3 verify 0111 FAIL 1 L(`${s.bytes}` visibleText 미경유 — 검증된 정수 · 수용 · implementation-notes (8)) · 최종 advise 0113 = SHIP · 스위트 3901 pass / 1 알려진 fail · 실 CLI 0회 |
| **Evidence** | 코드 실측 작업 트리 2026-10-18(HEAD `ec11d00`) · `headless-worker.ts:188-189` · `:1853` · `:1882-1888` · `:1919-1921` · `:1931-1944` · `:1957` · `:1985-2007` · `:2120-2125` · `:2235-2297` · `:2299-2309` · `agent-argv.ts:20-36` · `:286` · `:476-482` · `skill-prompt.ts:103` · `:130-132` · `memory-inject.ts:6` · `:11-12` · `:65-83` · `:96-99` · `memory-snapshot.ts:193` · `:310-312` · `memory-snapshot.test.ts:225` · `card-contract.ts:27` · `:123-128` · `marker-fold.ts:229-244` · `prompt-record.ts:18` · `:52-64` · `:82-114` · `:142-171` · `:237-272` · `prompt-cli.ts:184-193` · `:292-319` · `prompt-record.test.ts:92-104` · `:317-321` · `headless-prompt-record.test.ts:67-79` · `:412-414` · `:493-497` · `prompt-cli.test.ts:169-185` |

| 분면 | 내용 |
|------|------|
| Known knowns | (1) 오늘의 헤드리스 입력 = 시스템 섹션 하나(`HEADLESS_WORKER_HINT` 497 B) + 사용자 섹션 넷(첫 턴: 목록 · 표지 · 펜스 · 본문 / 재개: 재개 문구 · 표지 · 본문). (2) 사용자 채널 구분자는 모두 `"\n\n"` · 본문은 마지막이라 꼬리 없음. (3) 조립은 `spawnOnce` 인라인 사슬(`:1888-1937`)과 spawn 뒤 stdin 재선택(`:2120-2125`) 두 자리 · stdin 값 = `promptBody`(§0.41.0 R1 실측). (4) 펜스 F는 결합 → 전체 env redaction 한 번 → 줄 무력화 → 감싸기 순이라 원천별 바이트 구간이 구성상 정의되지 않는다. (5) 0.41 기록 v1에는 섹션 정보가 없고 소급 계산할 수 없다(nonce · 목록 · 경계). (6) 섹션 version 이력(R61-L1 — draft 레인 `history.txt` 대조): `memory-snapshot.ts` 커밋은 0.35.0뿐 · `memory-inject.ts` 0.36 · 0.37 · `skill-prompt.ts` 0.40은 throw만 · hint 0.39(`d5a82db`) → version 규칙 = max(헤드리스 워커 입력에 처음 들어간 shipped 릴리스, 전이 변환 포함 생산 코드가 출력을 바꾼 마지막 shipped 릴리스) · `task-marker` 0.30.0 · `memory-snapshot` 0.36.0 정당화 · `card-contract.ts` · `redact.ts` · `marker-fold.ts` 이력은 P1 착수 전 구현 레인이 확인. |
| Known unknowns | **UK-1~UK-5**(아래 표, 정본 = PLAN §0.42.0). 요지: 0.43 의미 이동이 manifest 형에 맞는지 · 조립기 + sha 비용 · 펜스 원천별 구별의 필요 · 섹션 version 표류 · v1 읽기 갈래 수명. |
| Unknown knowns | 리더(`loadMemorySnapshot`)는 persona · 지식 색인 · 방 지침 · 기억을 한 텍스트로 돌려주고 반환 객체 전체가 고정 테스트(`memory-snapshot.test.ts:225`)에 묶여 있어 parts 여섯은 리더 편집 없이 얻을 수 없다(C2 → parts 셋). v1 `show` 텍스트 출력을 축자로 고정한 `textOf`(`prompt-cli.test.ts:169-185`)는 D8 편집 예외 문면("version 1 / v1 키 목록") 밖이다(C3). `prompt-record.test.ts:317-321` "version 2 → invalid"는 v1 몸체에 `version`만 바꾼 기록이라 v2 검사에서도 `missing sections`로 invalid — 무편집 green(R9). `buildPromptRecord`를 `sections` 유무로 갈라 v1 빌더를 남기면 0.41 고정 테스트 대부분이 무편집으로 남는다(R8). 경계를 도우미 출력에서 검색해 자르면 본문 · 펜스 안 위조 텍스트에 속는다 → 추적은 구성에서 · 바이트는 도우미에서 · 둘의 같음은 실행 시 검사(R4). |
| Unknown unknowns | 섹션 추적이 운영자에게 "섹션 = 모델이 보는 구조"라는 오해를 낳는지(계급 58) · 0.43이 시스템 채널을 여러 섹션으로 나눌 때 CLI별 시스템 채널의 길이 · 구분자 제약 · manifest를 파일 템플릿으로 옮길 때(0.43+) 동결 상수와의 대조 방법. |

**Unknowns 요약 (정본 = PLAN §0.42.0):**

| # | 요지 | 출발 기본값 / 착수 영향 | R61 판정 |
|---|------|-------------|----------|
| UK-1 | **0.43 의미 이동과 manifest 형의 적합** — 시스템 채널 다중 섹션 · 구분자 · 리더 분할 · version과 fingerprint | R2 꼬리 귀속이 임의 구분자 흡수 · 안 맞으면 0.43이 레코드 v3과 함께 변경 | 비차단 수용(R61-M1로 위험 감소 — R9 구조 변경 = 새 레코드 버전 · v2 기준표 `PROMPT_RECORD_V2_SECTIONS`는 읽기 갈래로 남음 · 투영 테스트가 결정 강제) |
| UK-2 | **조립기 + 섹션 sha 비용** — spawn마다 sha ≤ 5개 + 자체 검사 비교(최대 ~1.2 MiB) | P2에서 큰 펜스 · 상한 본문 1회 시간 기록(단언 아님) | 비차단 수용. **표본 1회(P2 · 2026-10-18 · 이 머신):** 60k 본문 · 펜스 켬 · v2 기록 36–39 ms — 표본 하나이지 측정이 아니다 · open 유지 |
| UK-3 | **펜스 원천별 구간 · persona/색인/지침/기억 구별의 필요** | parts = `{ id, version }` 셋(C1 · C2) · 0.43 persona 이동 때 재검토 | 비차단 수용(C1 · C2 draft 수용) |
| UK-4 | **섹션 version 표류** — 바이트 변경에 version 미갱신 | 골든 red가 리뷰 강제 · 0.43에서 version이 fingerprint에 들어가면 차단 후보 | 비차단 수용(R3 max 규칙 — R61-L1 · 이력 명령 하나로 검산) |
| UK-5 | **v1 읽기 갈래 수명** — 0.41 기록 잔존량 · 걷어낼 시점 | 정리 경로 없음(§0.41.0 계급 50) → 유지 | 비차단 수용(R61-M1로 위험 감소 — v2도 같은 형 · 동결 기준표 덕분에 0.43 manifest 변경이 v2 기록을 `invalid`로 만들지 않음) |

**승계:** §0.41.0 UK-4(claude · grok 시스템 채널 수신 효과 — 0.43 착수 전 차단 후보) · UK-2(codex 재개 두 입력) — 0.42는 채널을 옮기지 않으므로 상태 변화 없음.

**Current decision:** **`approved` (R61 approved-with-fixes → M1·M2·L1·L2·L3·L4 반영, no R61b, 2026-10-18).** D1~D9 아키텍트 락(2026-10-18 — D2 version 규칙 적용 문면은 R3 max 규칙, R61-L1) · 작성자 정밀화 R1~R14(R9 → 수정 R61-M1 — 기준표 `PROMPT_RECORD_V2_SECTIONS` · 나머지 수용 · R3 + L1 · R5 + L3(c)(d) · R6 + L2 · R7 + L3(a)(b) · R10 + L4 · R14 + M1 문면) · C1 · C2 draft 수용 · C3 → 수정(R61-M2 — 편집 5곳 · 2파일) · 수용 손실 계급 55~61(61에 parts ⇔ 블록 불일치 포함) + 무번호 · UK-1~UK-5(전부 비차단 수용 · UK-1 · UK-5는 M1로 위험 감소) · §0.41.0 UK-4 승계는 0.43 착수 전 차단 후보 유지. 구현 착수 = **P1**(착수 전 이력 명령 — R61-L1). **2026-10-18 — implemented (P1 `73e489c`/`4c19210` · P2 `55befda`/`3d7d1ab` · P3 `adcc7a2`/`d93dae0` · P4) · shipped:** verify P1 0107 PASS(1 L — 이력 결론 기록) · P2 0109 PASS · P3 verify 0111 FAIL 1 L(`${s.bytes}` visibleText 미경유 — 검증된 정수 · 수용 · implementation-notes (8)) · 최종 advise 0113 = SHIP · 실 CLI 0회(D8). UK-2 표본 1회(위 — 36–39 ms · 측정 아님) · UK-1 · UK-3 0.43 착수 때 재검토 · UK-4 미관찰 · UK-5 유지 · §0.41.0 UK-4 승계(0.43 착수 전 차단 후보 유지). **Next = 0.43.0 의미 이동 (5단계 3부 — 오너 승인 실 CLI 필요).**

### 0.41.0 — 헤드리스 워커가 받은 프롬프트 기록 + `loom prompt show` (`approved` — R60 approved-with-fixes · no R60b · implemented (P1–P4 + P1b) · shipped 2026-10-18)

| Field | Value |
|-------|-------|
| **PLAN** | v0.41.0 (`approved` — R60 approved-with-fixes, 반영 완료 · no R60b · author-close 불가) · MINOR · 업그레이드 5단계 1부(관측) · 근거 = `UPGRADE-PLAN.md:101-105` · `:173-204` + 0.40.0 Next + 아키텍트 증거 팩(HEAD `cf44097`) · 범위 = 락 D1~D9(아키텍트 2026-10-18) |
| **Date** | 2026-10-18 |
| **Review** | R60 **done 2026-10-18** — approved-with-fixes H0 · M3 · L3 (M1 쓰는 자리 = write-ahead 직후 · `if (owner.abandoned)` 바로 앞 · 기록 ≠ spawn 증거 · M2 레코드 키 `dispatchHandoffId` · `show` STALE + exit 1 · 계급 49 정정 · M3 C3 편집 2곳 `headless-memory-write.test.ts:416` + `smoke-memory-write.ts:507` · L1 완료 기준 "nonce 제외 동일" · L2 모든 출력 필드 표기 변환 + bidi · 직렬화 DEL · C1 · bidi 이스케이프 · `user` = `promptBody.toWellFormed()` · L3 `lstat` 일반 파일 · 읽기 8 MiB · `MEMORY_COMMANDS` 참조 · R8 0개 꼬리) — (`WORKFLOW.md` §5.1 신규 제품 표면 `loom prompt show` + 영속성 · 신뢰 경계 — claude/codex 카드 본문이 디스크에 남음 · `LOOM_CARD` 거부) |
| **Implemented** | 2026-10-18 — P1 `87e5b76` → `1b7c07a` · verify 0088 FAIL 1 M → P1b `9b3bff5` → `0fd635b` · verify 0092 PASS · P2 `b9cc6ee` → `147514e` · verify 0090 PASS · P3 `e8e1a7d` → `13f1dae` · verify 0094 FAIL 5 M · 1 L(read-only 아님 · 심링크/FIFO · agent 검사 없음 · 원문 진단 · 비정규 바이트 · `LOOM_CARD` + `--help`) → P3b `51f1556` → `fe43974` · verify 0097 FAIL 2 M(M1 탐색 중 카드 디렉터리 → 심링크 교체 = 선언한 동일 사용자 한계로 수용 · M2 레거시 `.fable` 루트 → P3c `8fd7793` → `76049e6`) · P3c verify 0099 FAIL 1 M (accepted, (11)) · 최종 advise 0101 = FIX-FIRST (docs) → fixed · 스위트 3517 pass / 1 알려진 fail · 실 CLI 0회 |
| **Evidence** | 코드 실측 작업 트리 2026-10-18(HEAD `cf44097`) · `agent-argv.ts:28-36` · `:331-335` · `:371-387` · `:405-408` · `:421-424` · `:436` · `:446-448` · `:476-482` · `headless-worker.ts:121` · `:124` · `:340-348` · `:357-367` · `:375-378` · `:1083` · `:1100` · `:1272-1280` · `:1710-1714` · `:1890-1900` · `:1943-1956` · `:1971-2014` · `:2107-2114` · `:2242-2249` · `:2269` · `:2285-2295` · `card-session-store.ts:106-127` · `:141-165` · `bridge-runtime.ts:1137` · `memory-cli.ts:113-122` · `:388-392` · `:960-976` · `cli/src/index.ts:283-284` · `:3435-3442` · `skill-prompt.ts:45-46` · `packages/protocol/src/card-contract.ts:27` · `headless-memory-write.test.ts:414-419` · `HEADLESS-WORKER-PROBE.md:158` · `:161` · `:198-205` |

| 분면 | 내용 |
|------|------|
| Known knowns | (1) 헤드리스 입력은 두 채널 — 시스템 = hint(claude `--append-system-prompt` · codex `-c developer_instructions` · grok `--rules`) · 사용자 = claude/codex stdin · grok `prompt.txt`. (2) 세 에이전트의 사용자 바이트는 모두 `promptBody`(`headless-worker.ts:1947-1949`)와 같다. (3) 첫 턴 전문은 어디에도 남지 않는다(stdin 미저장 · grok 파일은 재개 때 덮어씀 · hint 기록 없음) · 펜스 nonce가 무작위라 다시 계산해서는 같은 바이트를 얻을 수 없다 — 그래서 펜스가 켜진 같은 카드의 두 dispatch도 바이트가 다르다. **기록은 "무엇을 보냈나"를 관측할 수 있게 할 뿐 "같다"를 증명하지 않는다** · "같은 카드 = 같은 프롬프트" = **nonce를 제외하면 같다** · 증명은 0.42 골든("같은 입력 + 같은 nonce(주입 `memoryNonce`) → 같은 바이트")(R60-L1). (4) 카드 디렉터리를 지우는 production 코드가 없다. (5) 카드당 시도 ≤ 2(`MAX_ATTEMPTS`). (6) codex는 hint를 받고 재개에도 유지한다(실측). |
| Known unknowns | **UK-1~UK-5**(아래 표, 정본 = PLAN §0.41.0). 요지: 기록 쓰기 비용 · codex 재개의 두 사용자 입력 합성 · 디스크 노출 크기 · claude/grok의 시스템 채널 수신 효과 · `show` 모호성 빈도. |
| Unknown knowns | `cardKeyHash`는 `(roomId, agent, cardId)` 해시라 cardId만으로 카드 디렉터리를 찾을 수 없다 → 프로필 피어 네임스페이스의 `session.json`을 읽어 거른다(C1). 같은 cardId가 다른 방 · 에이전트로 디스패치되면 락의 인자로는 고를 수 없다(C2 — `--room` · `--agent` draft). 카드 디렉터리 목록을 정확히 단언하는 고정 테스트 하나와 고정 스모크 하나가 있어 새 파일이 곧 편집이다(C3 → R60-M3 — `headless-memory-write.test.ts:416` + `smoke-memory-write.ts:507`). 같은 카드의 새 dispatch는 `attempts: 1`로 다시 시작해 `prompt-1.json`만 덮어쓰고 이전 dispatch의 `prompt-2.json`은 남는다 → 레코드 키 `dispatchHandoffId`로 구별해 `show`가 STALE로 표시한다(R4 · R60-M2 · 계급 49). 기록 쓰기를 `spawnDetachedWorker` 바로 앞에 두면 `:1995-2014` 동기 구간("모든 setup await 뒤" 불변식)이 깨진다 → write-ahead 직후 · 마지막 경로 검사 앞(R60-M1 — 기록 ≠ spawn 증거). 스냅샷 원자 쓰기 도우미는 임시 이름이 파일에 묶여 있어 일반화해야 재사용된다(R5). |
| Unknown unknowns | 운영자가 기록을 근거로 무엇을 결정하게 되는지(기록이 사실상 권위가 되는 압력) · CLI가 Loom 두 채널 밖에서 덧붙이는 컨텍스트의 크기와 변동 · 0.42 manifest화가 기록 형식에 무엇을 요구할지. |

**Unknowns 요약 (정본 = PLAN §0.41.0):**

| # | 요지 | 출발 기본값 / 착수 영향 | R60 판정 |
|---|------|-------------|----------|
| UK-1 | **기록 쓰기 비용** — 카드 락 안 ≤ ~1.2 MiB 원자 쓰기 하나의 spawn 지연 | P2에서 큰 펜스 · 상한 본문 1회 시간 기록(단언 아님) | 비차단 수용(쓰는 자리 = write-ahead 직후 — R60-M1). **표본 1회(P2 · 2026-10-18 · 이 머신):** 60,704 B 기록 59.3 ms — 표본 하나이지 측정이 아니다 · open 유지 |
| UK-2 | **codex 재개의 두 사용자 입력** — 위치 인자와 stdin을 codex가 어떻게 합치는지 | 기록은 둘 다 남긴다(`userArgv` — R3) · 0.43 실 CLI 또는 별도 프로브 | 비차단 수용 |
| UK-3 | **디스크 노출 크기** — 카드 디렉터리 누적 · 카드 본문 비밀 빈도 | 정리 명령은 다음 후보 · 계급 50 | 비차단 수용(정리 명령 = 다음 후보) |
| UK-4 | **claude/grok 시스템 채널 수신 효과** — hint가 행동을 바꾸는지 · 재개 재전달이 교체인지 중복인지 | 0.41은 보낸 바이트만 기록 · **0.43 착수 전 차단 후보** | 비차단 수용(0.41) · 0.43 착수 전 차단 후보 유지 |
| UK-5 | **`show` 모호성 빈도** — 같은 cardId의 다른 방 · 에이전트 디스패치 | C2 필터 · 목록 출력 | 비차단 수용(C2 draft 수용) |

**Current decision:** **`approved` (R60 approved-with-fixes → M1·M2·M3·L1·L2·L3 반영, no R60b, 2026-10-18).** D1~D9 아키텍트 락(2026-10-18 — D2 키에 `dispatchHandoffId` 추가는 R60-M2 · D1 완료 기준 문면은 R60-L1) · 작성자 정밀화 R1~R14(R1 → 수정 R60-M1 · 나머지 수용) · C1 · C2 draft 수용 · C3 → 수정(R60-M3 — 편집 2곳) · 수용 손실 계급 47~54(49 정정) + 무번호(기록 ≠ spawn 증거 신설) · UK-1~UK-5(전부 비차단 수용 · UK-4는 0.43 착수 전 차단 후보). 구현 착수 = **P1**. **2026-10-18 — implemented (P1 `87e5b76`/`1b7c07a` · P2 `b9cc6ee`/`147514e` · P1b `9b3bff5`/`0fd635b` · P3 `e8e1a7d`/`13f1dae` · P4) · shipped:** verify P1 0088 FAIL(1 M — `readPromptRecord` `lstat` → `readFileSync` TOCTOU → P1b) · P2 0090 PASS · P1b 0092 PASS · P3 verify 0094 FAIL 5 M · 1 L → P3b → 0097 FAIL 2 M(M1 수용 · M2 → P3c) → 0099 FAIL 1 M(수용 · implementation-notes (11)) · 최종 advise 0101 = FIX-FIRST(문서) → 반영 · 실 CLI 0회(D8). UK-1 표본 1회(위 — 60,704 B · 59.3 ms · 측정 아님) · UK-2 미확인(0.43 실 CLI 또는 프로브) · UK-3 · UK-5 미관찰(실 운용 전) · UK-4 open(0.43 착수 전 차단 후보 유지). **Next = 0.42.0 섹션 manifest (5단계 2부).**

### 0.40.0 — 표지 흉내 접기 강화 · R8 같은 접기 · 헤드리스 카드 본문 표지 줄 무력화 (`approved` — R59 approved-with-fixes · no R59b · implemented (P1–P4) · shipped 2026-10-18)

| Field | Value |
|-------|-------|
| **PLAN** | v0.40.0 (`approved` — R59 approved-with-fixes, 반영 완료 · no R59b · author-close 불가) · MINOR · 근거 = §0.36.0 계급 11 · Deviation (4)부터 이월된 ④ 닮은 글자 표지 강화 + 0.39.0 위치 묶음(R58-M1) 뒤의 새 압력점(카드 본문) · 범위 = 락 D1~D8(아키텍트 2026-10-18) |
| **Date** | 2026-10-18 |
| **Review** | R59 **done 2026-10-18** — approved-with-fixes H0 · M1 · L4 (M1 목록 스킬 이름 — `assertName` `containsMarker(name)` throw · `spawn_setup_failed` · 세 에이전트 · available/unavailable · R8 넷째 갈래 · L1 접기 = 소문자 뒤 표 재적용 · 표 원천 `/^[\p{L}\p{N}]$/u` · L2 블록 정본 `/LOOM\W?(?:MEMORY|REPORT)/u` · L3 자리표시 `[line removed by Loom: it imitated a Loom boundary line]` · L4 계급 46) — (`WORKFLOW.md` §5.1 sanitize 계약 행 · 시스템/데이터 경계 판정 의미 변경 · 워커 입력(카드 본문) 첫 변형) |
| **Evidence** | 코드 실측 작업 트리 2026-10-18(HEAD `a074e0b`) · `skill-prompt.ts:22-28` · `:50` · `:52-58` · `:64-80` · `:127-129` · `skill-materialize.ts:23-25` · `:95` · `:374-380` · `:393` · `:454-456` · `:685` · `:785` · `:848` · `:1111-1117` · `memory-store.ts:115` · `:1006-1009` · `:1077-1083` · `:1174-1175` · `memory-inject.ts:28-29` · `:65-71` · `:79-83` · `headless-worker.ts:1622` · `:1625-1628` · `:1891` · `:1934-1940` · `:1948` · `:2098-2102` · `:2271` · `agent-argv.ts:3` · `:30` · `:259-293` · `:308` · `card-contract.ts:27` · `:123-129` · `bridge-runtime.ts:2054` · `:2221` · `:2344` |

| 분면 | 내용 |
|------|------|
| Known knowns | (1) `containsMarker`(NFKC → lower → 글자/숫자)는 키릴 `о` · `с` · 그리스 `α` · `ı` · `ɑ` · `ʟ` · 합친 `ó` · `o`+U+0301을 놓친다 · R8 울타리 정규식은 키릴 `О` · ZWSP · `═`를, 블록 정규식은 U+2011을 놓친다(증거 팩). (2) 같은 접기 사본 `foldedLetters`가 있다(`skill-materialize.ts:374-380`). (3) 헤드리스 카드 본문은 검사 · 정제 없이 표지 아래로 간다(`headless-worker.ts:1891` · `:1936`) · argv에는 들어가지 않는다. (4) 재개는 저장된 스킬 사본 · 스냅샷 파일을 재해시한다 → 새 접기는 게이트를 움직이지 않는다 · fingerprint 입력 무변경. (5) 고정 테스트 편집 0줄(R9 — grep). |
| Known unknowns | **UK-1~UK-5**(아래 표, 정본 = PLAN §0.40.0). 요지: 표의 실제 내용(`confusables.txt` 버전 · 증거 문자 포함 여부) · 오탐 빈도 · 실 CLI의 자리표시 반응 · 다른 경계 위조 모양 · 큰 카드 본문 비용. |
| Unknown knowns | 목록 SKILL.md 경로 갈래는 unavailable이 아니라 `spawn_setup_failed`다(C2 · R8). 소문자 표로는 대소문자 구분 블록 규칙이 키릴 대문자를 놓친다 → prototype을 대소문자 정규화 없이 그대로 쓰는 표(C1 — R59 문면 정밀화). 블록 정규식의 꼬리 `\W?`는 무효이고 가운데 `\W?`는 구분자 없음도 허용한다(C4 · R5 → R59-L2 정본 `/LOOM\W?(?:MEMORY|REPORT)/u`). 목록의 스킬 **이름**은 표지 판정을 받지 않았다(`assertName` = `SKILL_NAME_RE`만 — R59-M1 → throw · `spawn_setup_failed`). 표를 소문자화 앞에서만 적용하면 `Ɑ` U+2C6D 류를 놓친다(R59-L1 → 소문자 뒤 재적용). ASCII 숫자 ↔ 글자 바꿔치기(`L00M`)는 표가 ASCII를 다루지 않아 남는다(R3 · 계급 40). |
| Unknown unknowns | 모델이 자리표시 줄 · 가짜 목록 줄(진짜 표지 아래)을 어떻게 가중하는지 · 글꼴에 따라 표 밖 문자가 라틴처럼 보이는 정도 · 다음 Unicode 버전의 새 동형 문자. |

**Unknowns 요약 (정본 = PLAN §0.40.0):**

| # | 요지 | 출발 기본값 / 착수 영향 | R59 판정 |
|---|------|-------------|----------|
| UK-1 | **표의 실제 내용** — `confusables.txt` 버전 · 항목 수 · 증거 문자(`ʟ` · `ɑ` · `ı` …)의 라틴 한 글자 prototype · `=` 대응(`᐀` · `꓿` · `゠`) | P1/P2 red가 확인 · 커밋 메시지에 기재 · 없으면 C3 draft(증거 예외 항목) / R4(빼고 기록) | **R59: 비차단 수용** — P1/P2 red가 고정 · 커밋 메시지에 기재 · C3 draft 수용(증거 예외 = **증거 목록 문자에 한정** · 각 항목은 시각적으로 대신하는 라틴 글자 하나 · P1이 예외 집합 리터럴 고정(항목 수 · 코드 포인트)) · C1 I류 → `l` 항목(U+0399 · U+0406)도 확인(prototype 그대로 · 대소문자 교정 없음). **closed 2026-10-18:** 표 = `confusables.txt` 2026-08-06 v18.0.0에서 172항목 + C3 증거 예외 1(`ʟ` U+029F — P1 red `11048ab` 커밋 메시지) · `=` 대응 확인(P2 red `afc9f36`): U+1400 `᐀` · U+A4FF `꓿` · U+30A0 `゠` 모두 U+003D → 울타리 run 집합 유지 |
| UK-2 | **오탐 실제 빈도** — 비라틴 스킬 · persona · 규칙 · 카드 본문 | 셈으로 관찰(stderr `neutralized` · `card_prompt` · `dropped.marker` · `loom skills list` 사유) · fail-closed 방향 | **R59: 비차단** |
| UK-3 | **실 CLI의 자리표시 반응** — 줄이 사라진 카드 본문에 워커가 혼란을 보이는지 | 깨끗한 입력에선 생기지 않는다(R10) · 실 CLI 0회 · 오너 요청 시 1회(명시 승인) | **R59: 비차단** — 깨끗한 실행으로는 관찰되지 않는다 · 오너 요청 시 1회 수용(실행마다 명시 승인) |
| UK-4 | **다른 경계 위조 모양** — 가짜 목록 머리 · 가짜 펜스 줄 · "system:" 류 | hint 7번 줄 · 펜스 nonce가 남는 방어 · 다음 후보 | **R59: 비차단 · 계급 46으로 연결(L4)** — 카드 본문의 가짜 목록 머리 · 항목 줄 · 철자하지 않는 자칭 표지는 무력화하지 않는다(진짜 표지가 언제나 첫 표지 → 표지 아래 = 데이터) · P3 축자 단언(가짜 항목 줄 유지)이 고정 · 다음 후보 |
| UK-5 | **비용** — 60,000자 카드 본문 줄별 접기 | 선형 · P3에서 상한 본문 1회 시간 기록(단언 아님) | **R59: 비차단** |
| UK-6 | **울타리 흉내 run 집합 밖의 `=` 대응 문자**(2026-10-18 P2 verify 0075 잔여 · R4 범위 밖) — `⹀⹀⹀ BEGIN LOOM`(U+2E40) · `꞊꞊꞊ BEGIN LOOM`(U+A78A)은 `confusables.txt`가 `=`로 대응시키지만 run 집합 `[=═᐀꓿゠]`에 없어 R8 `marker`가 놓친다 | 계급 40/43 기록 · 펜스 nonce가 진짜 끝을 가리는 방어는 그대로 | **open, 비차단 — 다음 후보**(run 집합을 `confusables.txt`의 `=` 대응 전부로 넓히기) |
| UK-7 | **카드 본문의 가짜 목록 머리 · 항목 줄 · 철자하지 않는 자칭 표지**(계급 46 · UK-4 연결) | 무력화하지 않는다 · 방어 = 위치 묶음(R58-M1) + hint 7번 줄 · P3 축자 단언이 고정 | **open, 비차단 — 다음 후보**(목록 머리 흉내 판정 · dogfood 카드 오탐 비용과 함께 판정) |

**Current decision:** D1~D8 아키텍트 락(2026-10-18) · 작성자 정밀화 R1~R10 · 락↔코드 불일치 C1~C4(R59 판정 — C1 수용(문면 정밀화) · C2 수용(+ M1) · C3 draft 수용(한정) · C4 → 수정(L2)) · 수용 손실 계급 39~46 + 무번호 · UK-1~UK-5(전부 비차단). **R59 approved-with-fixes → M1 · L1~L4 반영 · no R59b → `approved`.** **2026-10-18 — implemented (P1 `11048ab`/`d47f566` · P2 `afc9f36`/`cc7c52e` · P3 `861a257`/`ace1e08` · P3b `43b1c17`/`a041650` · P4) · shipped:** verify P1 0073 PASS · P2 0075 PASS · P3 0077 FAIL(1 M — 조립된 목록 항목 줄 표지 → P3b) · P3b verify 0080 PASS(코드 · Low 1 = 트리의 미커밋 릴리스 문서) · 최종 advise 0082 = SHIP · 실 CLI 0회(D7 · R10). UK-1 closed(위) · UK-2 · UK-3 미관찰(실 운용 · 실 CLI 0회) · UK-4 open(계급 46 — UK-7) · UK-5 미기록 · **UK-6 · UK-7 신설(다음 후보).** 0.38.0 UK-7(표지 필터 오탐률)은 0.40.0 같은 접기로 재검토됨 — 범위가 넓어졌다(계급 43).

### 0.39.0 — 헤드리스 워커 hint 둘째 줄 — 작업 표지 위에 나열된 SKILL.md 읽기 허용 (`approved` — R58 approved-with-fixes · no R58b · implemented (P1–P2) · shipped 2026-10-18)

| Field | Value |
|-------|-------|
| **PLAN** | v0.39.0 (`approved` — R58 approved-with-fixes, 반영 완료 · no R58b · author-close 불가) · MINOR · 근거 = 0.38.1 D8 결과 ①(codex가 목록 머리 허락보다 hint를 따름) · 0.38.0 UK-8 · 범위 = 락 D1~D8(아키텍트 2026-10-18) · `HEADLESS_WORKER_HINT` 둘째 줄만(D2) · 0.38.1(ship 안 됨)을 대체하고 그 목록 머리를 함께 싣는다(D1) |
| **Date** | 2026-10-18 |
| **Review** | R58 **done 2026-10-18** — approved-with-fixes H0 · M2 · L4 (M1 D2 위치 묶음 문면 `… listed above the dispatched-task marker.` · 163 B · 497 B · M2 D7 결과표 ①~⑤ · PASS ∧ ¬⑤ · L1 편집 선언 5 → 7줄 · L2 `USER_GUIDE.md:833` · L3 drain → status 확인 → 교체 → start · L4 D7 ① 다음 선택지) — (fingerprint를 바꾸는 워커 지시 변경 · 시스템 수준 지시의 읽기 범위가 cwd 밖 표지 위 목록 SKILL.md까지 넓어진다) |
| **Evidence** | 코드 실측 작업 트리 2026-10-18(HEAD `6c5c501`) · `agent-argv.ts:18` · `:28-36` · `:259-293` · `:333-335` · `:371-387` · `:403-406` · `:419-422` · `:446-448` · `headless-worker.ts:565-574` · `:1060-` · `:1089-1093` · `:1195-1196` · `:1228-1235` · `:1245-1249` · `:1271-1280` · `:1676-1682` · `:1947` · `skill-prompt.ts:39-40` · `:52` · `MEMORY-WRITE-SMOKE-0381.md:28` · `:36` · `:46` · `:49` · `:60` · 테스트 hex `policy-fingerprint.test.ts:52` · `:57` · `:62` · `memory-inject.test.ts:56` · `:57` · 문면 고정 `headless-argv.test.ts:141` · `memory-inject.test.ts:167-169` |

| 분면 | 내용 |
|------|------|
| Known knowns | (1) codex는 `developer_instructions` hint를 사용자 턴 목록 머리보다 앞에 둔다(n = 1 — `MEMORY-WRITE-SMOKE-0381.md:60`). (2) hint는 세 에이전트에 같은 상수로 간다(claude `--append-system-prompt` · codex `developer_instructions=` · grok `--rules`) · 호출자 하나(`headless-worker.ts:1947`). (3) hint는 fingerprint 입력 — 값이 바뀌면 재개 · recovery · 입양 게이트가 `fingerprint_changed` → `needs_verification`(살아 있는 워커 kill 0). (4) 깨지는 고정 테스트 = hex 다섯 줄(+ R58-L1 출처 주석 두 줄 = 편집 선언 7줄) · hint 문면 고정 두 자리(1 · 7번 줄)는 무편집 통과(R3). (5) 새 둘째 줄에 따옴표 · 역슬래시가 없어 codex argv는 맨 형식 그대로(R2). |
| Known unknowns | **UK-1~UK-5**(아래 표, 정본 = PLAN §0.39.0). 요지: 새 hint가 codex 거절을 푸는가 · 원인 분리(버전 vs 문구) · grok · claude 반응 · 시스템 수준 허락의 과대 해석 · 업그레이드 실 영향. |
| Unknown knowns | 완료된 카드(결과 전송 · 워커 없음)의 새 dispatch는 게이트를 지나지 않고 새 세션으로 간다 — D4 "every existing record"보다 영향이 좁다(C2). 고정 테스트의 "0.31.0" 주석 · 테스트 이름이 새 promptFingerprint hex와 어긋난다(C1). 새 hex는 상수에서 다시 계산하면 안 된다 — 리터럴 hint + 무변경 함수로 한 번 얻는다(R1). |
| Unknown unknowns | 한 줄 안의 금지 + 예외를 codex가 어떻게 가중하는지 · codex 다음 버전에서 `developer_instructions` 우선순위가 바뀌는지 · 시스템 지시 변경이 세 에이전트의 다른 작업 행동(cwd 밖 탐색 빈도)을 바꾸는지. |

**Unknowns 요약 (정본 = PLAN §0.39.0):**

| # | 요지 | 출발 기본값 / 착수 영향 | R58 판정 |
|---|------|-------------|----------|
| UK-1 | **새 hint가 codex 거절을 푸는가 — 실 CLI 0회** | ship 조건 = D7(오너 승인 `smoke:memory-write --real-cli --owner-approved` 1회 — PASS = codex 목록 SKILL.md 읽기(R5) ∧ codex `proposed ≥ 1` ∧ grok `proposed ≥ 1` ∧ 세 카드 `notes.md` ∧ 실 홈 무접촉 ∧ ¬⑤) · 실패 → D7 결과표(R58-M2): ① codex transcript에 R5 읽기가 없다(응답 문면 · `proposed`와 무관) → ship 안 함 · 기록 · 다음 = 오너 선택(codex 고유 `<cwd>/.agents/skills` — cwd 쓰기 · 이전 기각 · SKILL.md 본문 인라인 · UK-2 분리 실행 · hint 문면 2차 · 또는 codex 스킬 없음 수용 — R58-L4) · ② R5 읽기 있음 ∧ codex `proposed 0` → 현행대로(ship 안 함 · 다음 = 스킬 문면 / 프롬프트) · ③ grok → 현행대로(`proposed 0` 또는 `notes.md` 없음 → ship 안 함 · 회귀) · ④ claude `proposed 0` → ship **보류** · 기록 · 오너 판단(자동 통과도 자동 차단도 아니다) · `notes.md`는 필수 · ⑤ 세 에이전트 중 어느 transcript든 명령 · 읽기 인자에 cwd 밖이면서 그 카드의 목록 SKILL.md가 아닌 절대 경로 → ship 안 함 · 기록 · 오너 판단 · 재실행은 매번 오너 명시 승인 | **R58: ship 차단**(결과표 ①~⑤ — M2). **closed 2026-10-18 — PASS:** 오너 승인 1회 · `smoke:memory-write --real-cli --owner-approved`(커밋 `d5a82db` — 안쪽 dispatcher는 소스 · `codex-cli 0.163.0` · `claude 2.1.302` · `grok 1.0.54 (4e18c5517b4e) [stable]`) — **codex가 목록 SKILL.md 두 경로를 `cat` 한 번으로 읽음(exit 0 · 다른 명령 0) · codex `proposed 1`** · grok `read_file`로 목록 두 경로만 · `proposed 1` · claude Skill 도구 · `proposed 1` · 세 카드 `notes.md` · 실 홈 무접촉 · ¬⑤ → ship · `MEMORY-WRITE-SMOKE-0390.md` |
| UK-2 | **원인 분리** — `codex-cli` 0.162.1(0310 h2 — 옛 hint로 읽음) ↔ 0.163.0(세 번 거절) | PASS는 "이 hint면 읽는다"만 증명 · 기록에 CLI 버전 축자 | **R58: 비차단** |
| UK-3 | **grok · claude 반응** — 시스템 지시 문면 변경이 출력을 흔드는지 | D7이 grok `proposed ≥ 1` · 세 카드 `notes.md`로 관찰 · 결과 ③(grok `proposed 0` 또는 `notes.md` 없음) → ship 안 함 · 결과 ④(claude `proposed 0`) → ship **보류** · 기록 · 오너 판단(자동 통과도 자동 차단도 아니다 — claude `--append-system-prompt` 자체가 바뀐다 · 계급 36) | **R58: 비차단 · 단 결과 ③ 차단 · 결과 ④ 보류(M2)** |
| UK-4 | **허락의 과대 해석**(계급 37) — 목록 밖 cwd 밖 경로(형제 파일 · 다른 카드 · home) 읽기 · 범위 = 표지 위 목록 · 표지 아래 주장은 데이터(R58-M1) | 실 CLI transcript 명령 · 읽기 인자를 기록에서 본다(세 에이전트) · D7 결과 ⑤: 어느 transcript든 cwd 밖이면서 그 카드의 목록 SKILL.md가 아닌 절대 경로 → ship 안 함 · 기록 · 오너 판단 | **R58: 비차단 · 단 D7 실행에서만 차단(결과 ⑤ — M2)** |
| UK-5 | **업그레이드 실 영향**(계급 35) — drain 없이 올린 운용 bridge에서 선점되는 레코드 수 | 업그레이드 메모(drain → `loom bridge status` 진행 중 0 확인 → 교체 → start — R58-L3) · CHANGELOG 정직 줄 | **R58: 비차단** |

**Current decision:** D1~D8 아키텍트 락(2026-10-18) · 작성자 정밀화 R1~R7(R58 수용) · 락↔코드 불일치 C1(→ 대안 R58-L1) · C2(수용 + `pendingResult` 구절) · 수용 손실 계급 35~38 + 무번호 · UK-1~UK-5. **R58 `approved-with-fixes` → M1 · M2 · L1~L4 반영 · no R58b → `approved` (2026-10-18).** 0.38.0 UK-8은 0.39.0 D7 PASS에서만 closed(D8). **2026-10-18 — implemented (P1 `278b5ab`/`d5a82db` · P2) · 실 CLI D7 PASS · shipped:** UK-1 closed(PASS) · UK-2 open(이 hint면 `codex-cli 0.163.0`이 읽는다는 것만 증명 · 0.162.1 반증 미설명) · UK-3 관찰 = grok · claude 정상(각 `proposed 1`) · UK-4 관찰 = 세 transcript의 cwd 밖 접근은 그 카드 목록 SKILL.md뿐(¬⑤) · UK-5 미실측(업그레이드 메모만). **0.38.0 UK-8 closed(resolved by 0.39.0).**

### 0.38.1 — codex/grok 첫 턴 스킬 목록 머리 문면 (`approved` — R57 approved-with-fixes · implemented P1 · real-CLI 결과 ① → D8 · not shipped · superseded by 0.39.0 (shipped inside it))

> **superseded by 0.39.0 (shipped inside it — 2026-10-18).** 이 절의 목록 머리는 0.39.0 릴리스에 그대로 실려 나갔다. 아래 기록은 0.38.1 단독 실행(결과 ①) 그대로 둔다.

| Field | Value |
|-------|-------|
| **PLAN** | v0.38.1 (`approved` — R57 approved-with-fixes, 반영 완료 · no R57b · author-close 불가) · PATCH · 근거 = 0.38.0 UK-8(실 CLI ① codex 스킬 경로 충돌) · 범위 = 락 D1~D9(아키텍트 2026-10-18) · `SKILL_LISTING_HEADER` 한 줄만(D2) · hint 변경은 0.38.1 밖(D8 — MINOR · 오너 선택) |
| **Date** | 2026-10-18 |
| **Review** | R57 **done 2026-10-18** — approved-with-fixes H0 · M1 · L4 (M1 D7 실패 결과표 ①~④ · D8 = ①만 · L1 P1 `containsMarker` · 제어/서식 문자 단언 · L2 USER_GUIDE §16.3 표 행 · L3 ⑤ 무번호 2행 · L4 기록 축자 — 실행 sha · grok `prompt.txt` 첫 줄 · codex 목록 경로 각각) — (프롬프트 신뢰 문면 변경: 워커에게 말하는 읽기 범위가 목록 경로까지 넓어진다) |
| **Evidence** | 코드 실측 작업 트리 2026-10-18(HEAD `1c78062`) · `skill-prompt.ts:7` · `:37` · `:39-43` · `:80-85` · `:97` · `:103` · `:112-126` · `agent-argv.ts:18` · `:28-36` · `:280-293` · `headless-worker.ts:226` · `:1688-1707` · `:1934-1940` · `:2098-2103` · `MEMORY-WRITE-SMOKE-0380.md:75-86` · `HEADLESS-SMOKE-0310.md:28-29` · 테스트 리터럴 `headless-skills-p4.test.ts:372` · `:406` · `headless-memory.test.ts:234` · `headless-policy-notice.test.ts:256` · `headless-memory-write.test.ts:238` · 상수 참조 `skill-label.test.ts:142` · `:182-202` |

| 분면 | 내용 |
|------|------|
| Known knowns | (1) 목록 문면은 `workerFingerprint` 입력이 아니다 — `manifestHash`만(`agent-argv.ts:280-293`). (2) 목록은 첫 턴에만 · 재개 턴은 `RESUME_CONTINUATION_MESSAGE` + wrapped(`headless-worker.ts:1938-1940` · `:2098-2103`). (3) claude는 Available 줄을 받지 않는다(`skill-prompt.ts:97` · `:112`). (4) 머리는 이미 4096 B 블록 상한에 포함된다(`:83-85` · `:112-120`). (5) 머리 리터럴을 단언하는 테스트는 다섯 줄 — `skill-label.test.ts`는 상수 참조라 무편집 통과(C1 · R1). |
| Known unknowns | **UK-1~UK-4**(아래 표, 정본 = PLAN §0.38.1). 요지: 새 머리가 codex 거절을 푸는가 · 원인 분리(버전 vs 문구) · grok 반응 · 허락 문면의 과대 해석. |
| Unknown knowns | D6 증거 목록 중 `headless-skills-p4.test.ts:418` · `:820`(부정 단언)과 `skill-label.test.ts:142` · `:182-194`(상수 참조)는 편집이 필요 없다(C1). D5 "바뀌는 고정 상한 테스트"는 0곳 — 상한 감소는 새 테스트가 고정한다(C2). `skill-prompt.ts:7` JSDoc이 옛 머리를 축자 인용한다(R3). 접두 `Available skills`를 바꾸면 claude 부정 단언이 공허해진다(R2). |
| Unknown unknowns | codex가 머리 문면과 `developer_instructions` hint 중 어느 쪽에 더 무게를 두는지 · codex 다음 버전에서 같은 문면이 다르게 읽히는지. |

**Unknowns 요약 (정본 = PLAN §0.38.1):**

| # | 요지 | 출발 기본값 / 착수 영향 | R57 판정 |
|---|------|-------------|----------|
| UK-1 | **새 머리가 codex 거절을 푸는가 — 실 CLI 0회** | ship 조건 = D7(오너 승인 `smoke:memory-write --real-cli --owner-approved` 1회 — PASS = codex 목록 SKILL.md 경로 읽기 ∧ codex `proposed ≥ 1` ∧ grok `proposed ≥ 1` ∧ 세 카드 `notes.md`) · 실패 → D7 결과표(R57-M1): ① codex가 목록 경로를 읽지 않음(거절) → **D8**(ship 안 함 · UK-8 open · 다음 = hint MINOR · 오너 선택) · ② codex가 읽음(R4) ∧ `proposed 0` → ship 안 함 · 기록 · 다음 = `loom-memory-candidates` 문면이나 프롬프트(오너 선택) · hint 아님 · ③ grok `proposed 0` 또는 `notes.md` 없음 → ship 안 함 · 회귀 의심(UK-3) · 기록 · ④ claude `proposed 0` → **관찰만**, 비차단(첫 턴 바이트 동일은 P1이 증명) · 단 `notes.md`는 필수 · 재실행은 매번 오너 명시 승인 | **ship 차단(R57-M1 결과표)** — 오너 승인 필요 · 승인 없으면 ship 대기. **closed 2026-10-18 — 결과 ① (codex 거절) → D8:** 오너 승인 1회 · `smoke:memory-write --real-cli --owner-approved`(커밋 `76be19b` — 안쪽 dispatcher는 소스 · `codex-cli 0.163.0` · `claude 2.1.302` · `grok 1.0.54`) — claude `proposed 1` · grok `proposed 1`(목록 SKILL.md 둘 `read_file` · `prompt.txt` 첫 줄 = D2 축자) · **codex `proposed 0` · 목록 경로 읽기 0**(명령은 cwd `rg --files --hidden -g 'AGENTS.md' -g 'SKILL.md' …` exit 1 하나) · 응답 `"Blocked: the required skills are outside the working directory, and worker instructions prohibit accessing those paths."` · 세 카드 `notes.md` · 실 홈 무접촉 → **0.38.1은 고침으로 ship하지 않는다** · 다음 = hint MINOR(오너 선택) · `MEMORY-WRITE-SMOKE-0381.md` |
| UK-2 | **원인 분리** — `codex-cli 0.163.0` 변경인지 프롬프트 문구인지(0310 h2 반증) | PASS는 "이 문면이면 읽는다"만 증명 · 기록에 CLI 버전 축자 | **비차단** — 기록에 CLI 버전 축자 · codex가 0.163.0이 아니면 교란 변수로 명기 |
| UK-3 | **grok 반응** — 긴 머리가 grok 출력을 흔드는지 | D7이 grok `proposed ≥ 1` · `notes.md`로 관찰 · D7 결과 ③(grok `proposed 0` 또는 `notes.md` 없음) → ship 안 함 · 회귀 의심 · 기록(R57-M1) | **비차단(관찰) · 단 R57-M1 결과 ③은 ship 차단** |
| UK-4 | **허락 문면의 과대 해석**(계급 32) — 목록 밖 cwd 밖 경로 읽기 | 실 CLI transcript 명령 문자열을 기록에서 본다(R57-L4) | **비차단** |

**Current decision:** D1~D9 아키텍트 락(2026-10-18) · 작성자 정밀화 R1~R4 · 락↔코드 불일치 C1~C2 · 수용 손실 계급 31~34 + 무번호 · UK-1~UK-4. **R57 `approved-with-fixes` → M1·L1·L2·L3·L4 PLAN 반영 → PLAN `approved`(2026-10-18, no R57b)** · R1~R4 수용(R3 = draft 선택 — `:7` 주석 갱신 · R4 + L4 기록 보강) · C1 · C2 수용 · **UK-1 ship 차단(R57-M1 결과표 ①~④)** · UK-2~UK-4 비차단(UK-3은 결과 ③만 차단). 0.38.0 UK-8은 0.38.1 D7 PASS에서만 closed(D9). **2026-10-18 — implemented P1(`0603e7f`/`7348d15`/`76be19b`) · 실 CLI D7 = 결과 ① (codex 거절) → D8 · not shipped:** UK-1 closed(결과 ①) · UK-2 open(같은 `codex-cli 0.163.0` · 명시 허락도 결과를 바꾸지 못함 · 원인 미분리) · UK-3 관찰 = grok 정상(`proposed 1` · 목록 두 경로 읽기) · UK-4 관찰 = codex는 cwd 밖 읽기 0 · grok은 목록 두 경로만. **R57 핵심 위험 확인(n = 1):** codex는 `developer_instructions` hint를 사용자 턴 머리보다 앞에 둔다. 0.38.0 UK-8 open 유지 · 다음 = hint 변경(MINOR · fingerprint 변경) — 오너 선택.

### 0.38.0 — 기억 쓰기 경로 · 카드 후보 → `proposed` · `notes.md` · `LOOM_CARD` CLI 거부 (`approved` — R56 approved-with-fixes · implemented (P1–P5) · shipped 2026-10-18)

| Field | Value |
|-------|-------|
| **PLAN** | v0.38.0 (`approved` — R56 approved-with-fixes, 반영 완료 · no R56b) · 업그레이드 4단계 4부 · 요구 = 기억 관리 규칙 3 · §0.37.0 "다음 후보" ①② · 범위 = 락 D1~D19 + D16'(아키텍트 + loom-advisor 자문 2026-10-17 — revise-then-proceed) · 옵트인 `worker.memory.cardWrites`(D3) · ③ mtime 캐시 · ④ 닮은 글자 강화는 0.39 이월(D1) |
| **Date** | 2026-10-17 |
| **Review** | R56 **done 2026-10-17** — approved-with-fixes H0 · M4 · L4 (M1 고정 테스트 편집 선언 12곳 · M2 아카이브 끝 4 MiB만 읽기 · M3 카드 출처 행 `+<n> chars` 접미 · `approve` 본문 전체 · M4 실 CLI ① = 세 카드 `notes.md` · 적어도 한 카드 `proposed ≥ 1` · L1 표지 정규식 대소문자 구분 · L2 내장 스킬 `forced`로만 · L3 exited-recovery 타임아웃 갈래 선언 · L4 D12 문면 · `agentKey` · R11 인용 · show `origin:` · 계급 28 보강) — (새 MINOR + 새 신뢰 경계 — 워커 출력 → 운영자 영속 데이터 · bridge의 첫 저장소 쓰기 · 사람 CLI와 같은 락 경합 · 새 스킬 문면 실 CLI 0회) |
| **Evidence** | 코드 실측 `main @ d6f7cc2` (PLAN §0.38.0 Why · 추정/실측 표) · `memory-store.ts:112-134` · `:373-375` · `:484-492` · `:639-652` · `:676-799` · `:859-984` · `atomic-json.ts:22-24` · `:96-116` · `:159-168` · `:190-209` · `room-event-log.ts:28` · `:125-127` · `:398-437` · `headless-worker.ts:109` · `:113` · `:309-319` · `:956-1001` · `:1237` · `:1247-1256` · `:1355-1392` · `:1394-1425` · `:1445-1475` · `:1545-1552` · `:2071` · `bridge-runtime.ts:880` · `:889-897` · `:1126-1127` · `:1968` · `bridge-config.ts:440-453` · `:549-571` · `:582-` · `card-session-store.ts:15-76` · `:92-97` · `skill-materialize.ts:118-119` · `:314-353` · `:720-733` · `:871-990` · `skill-prompt.ts:49-55` · `memory-snapshot.ts:281-286` · `agent-argv.ts:28-36` · `:286-291` · `cli/src/memory-cli.ts:345-375` · `:412-415` · `:478-492` · `:591-595` · `skills/loom-card-report/SKILL.md:16-20` · `skill-inventory.test.ts:74-102` · `memory-cli.test.ts:1009-1039` |

| 분면 | 내용 |
|------|------|
| Known knowns | 코드 실측(`d6f7cc2`): (1) 저장소 쓰기는 사람 CLI 전용 동기 경로 — `withFileLock`은 `Bun.sleepSync`로 최대 4초 대기(bridge 루프 차단) · 획득/회수 헬퍼는 비공개(C3). (2) room-event-log의 ≤250 ms 락은 nonce 파일 락 — mkdir 락과 배제 안 됨(D12가 프로토콜을 빌리지 않는 이유). (3) compact는 retired 항목을 무상한 아카이브로 옮긴다 → 본 저장소만 보는 dedupe는 부활 틈(D11 · C4). (4) exited-recovery가 같은 transcript로 sendParsed를 다시 돈다 · 시도 번호는 handoff마다 1부터 → 키 = (card, handoff, attempt). (5) 스냅샷은 `visibleActive`만 — `proposed`는 승인 전 어떤 프롬프트에도 안 닿는다. (6) 워커 env엔 `LOOM_CARD`만 · 워커 셸의 `loom`은 displayName 프로필(0.36 impl-notes (24)) — 승인 우회 가능(D16). (7) 재개는 카드 사본의 `manifestHash`를 쓴다 — cardWrites를 켜도 진행 중 카드는 바뀌지 않는다(C2). (8) 0.37 `parseMemory`는 모르는 키에서 throw(계급 30). (9) 내장 스킬 목록을 정확히 고정한 테스트 = `skill-inventory.test.ts` 아홉 자리 · `memory-cli.test.ts` 세 자리(C5 다섯 자리 → R56-M1이 일곱 자리 추가). (10) 아카이브를 줄이는 도구가 없다 — 읽기 상한 초과를 실패로 두면 기능이 영구히 꺼진다 → 끝 4 MiB만 읽는다(R56-M2). (11) `list`는 본문 `firstLine` 80자만 보인다(`memory-cli.ts:336-338`) → 카드 출처 행 접미 · `approve` 본문 전체(R56-M3). |
| Known unknowns | **UK-1~UK-7**(아래 표, 정본 = PLAN §0.38.0) + **UK-8**(2026-10-18 실 CLI ① 발견). 요지: 새 스킬 문면의 실 CLI 미검증(closed — PASS) · 문법 준수와 후보 품질 · `busy` 버림 빈도 · 승인 부담 · C2 영향 범위 · Windows · 표지 필터 오탐 · codex 스킬 경로 충돌(0.39 후보). |
| Unknown knowns | D8 `source`에는 D11 dedupe 키의 handoff가 없다 → `source.handoff`(C1 · R2). D4의 "진행 중 카드 `needs_verification`" 선언은 사본 기반 재개와 어긋난다(C2). D4가 선언한 테스트 편집 `skill-materialize.test.ts:144`는 `toContain`이라 깨지지 않고, 실제로 깨지는 것은 다른 다섯 자리(C5) — 그리고 그 다섯도 전부가 아니었다(가림 · symlink · `--json` 일곱 자리 추가 — R56-M1). 아카이브 4 MiB 초과 → `busy`는 영구 정지를 일시 경합으로 표기한다(C4 → R56-M2). `/…/i` 표지 정규식은 소문자 스킬 이름 언급을 버린다(R56-L1). `loom-card-report`는 "LOOM-REPORT-END 뒤에 아무것도 쓰지 말라"고 한다 — 새 스킬은 블록을 그 줄 앞에 두라고 말해야 한다(R6). `memory list --json`은 이미 `source` 전체를 낸다 — D8 "필드 추가만"은 변경 0으로 충족(R16). |
| Unknown unknowns | 실 워커가 후보 블록을 얼마나 자주 · 어떤 품질로 쓰는지 · 오너가 `proposed`를 실제로 검토하는지(아니면 일괄 승인하는지) · 승인된 카드 후보가 이후 워커를 어떻게 움직이는지(계급 13) · 사람 CLI와 bridge의 실제 경합 패턴. |

**Unknowns 요약 (정본 = PLAN §0.38.0):**

| # | 요지 | 출발 기본값 / 착수 영향 | R56 판정 |
|---|------|-------------|----------|
| UK-1 | **새 스킬 문면이 실 CLI에 닿음 — 실 CLI 0회**(D18) | 스모크 = 가짜 CLI · `smoke:memory-write --real-cli --owner-approved`는 오너 명시 승인 | **ship 차단(R56-M4로 강화) — 오너 승인 필요 · 승인 없으면 ship 대기, `unverified` ship 불가** · ship 조건 = `smoke:memory-write --real-cli --owner-approved` **① 한정**(codex · grok · claude 각 1카드 · cardWrites 켬 · 후보 하나 요청 · 안쪽 프로세스 실 HOME + `LOOM_TEST_HOME=T` R54-M3 형) 1회 PASS — 세 응답이 결과를 내고 거부 · 탈선 없음 · `memory_propose` 줄 기록 · **세 카드 모두 `notes.md` 존재 · 적어도 한 카드 `proposed ≥ 1` — 셋 모두 0이면 ship 차단(SKILL.md 문면 개정 → 오너 승인 재실행) · 에이전트별 0은 UK-2 관찰로 기록** · `MEMORY-WRITE-SMOKE-0380.md`. **closed 2026-10-18 — 조건 충족(PASS):** 오너 승인 1회 · `smoke:memory-write --real-cli --owner-approved`(dist v0.38.0 · `codex-cli 0.163.0` · `claude 2.1.302` · `grok 1.0.54`) **3/3 PASS** — claude `proposed 1` · grok `proposed 1` · codex `proposed 0` · 세 카드 모두 `notes.md` · 실 홈 무접촉 → R56-M4 PASS |
| UK-2 | 문법 준수 · 후보 품질 · `LOOM-REPORT-END` 앞 배치 | 권고 경계 · `--real-cli`에서 관찰만 | **open, 비차단** — 에이전트별 `proposed 0`은 여기 관찰로 기록(R56-M4). **2026-10-18 관찰:** claude · grok은 블록을 썼다(후보 각 1 — claude `- fact: 이 방에서 Loom 메모리 쓰기 스모크 테스트가 실행되었다.` · grok `- fact: The Loom memory-write smoke ran in this room.` · grok은 `LOOM-REPORT-END` 앞에 둠). **codex `proposed 0`** — 응답 `"Blocked: the required Loom skill files are outside the permitted working directory, and no local copies are available."` · 오너 승인 codex 단독 진단(`--only codex`)도 0 — 원인은 문법이 아니라 스킬을 못 읽은 것(UK-8) |
| UK-3 | `busy` 버림 빈도(계급 28) | stderr `busy` 칸 · 예산 250 ms(room-event-log 선례) | **open, 비차단** — 아카이브 끝 4 MiB 읽기로 영구 정지가 `busy`에 섞이지 않는다(R56-M2) · 락 쥔 채 크래시 → stale 5초 동안 recovery도 `busy`(계급 28 보강) |
| UK-4 | 승인 부담 · 상한 50/10/5의 적정성(계급 24 · 27) | `memory list` 머리 K 줄 · 운용 뒤 조정 | **open, 비차단** — 승인자는 카드 본문 전체를 본다(R56-M3) |
| UK-5 | C2 영향 범위 — 재개 · recovery · adopt 외 `manifestHash` 변경 갈래 | P3 red가 세 갈래 증명 | **open, 비차단** — C2 수용(D4 = 새 첫 spawn부터) · 꺼짐에서 내장은 `forced`로만(R56-L2) |
| UK-6 | Windows(0.37 UK-7 승계 — mkdir 락 · rename) | 테스트는 macOS/Linux | **unverified(Windows 환경 미사용), 비차단** |
| UK-7 | 표지 필터 오탐률(R8 — 펜스 줄 흉내 · `LOOM-MEMORY-`/`LOOM-REPORT-`(대소문자 구분 — R56-L1) · task marker; 32 hex · 맨 `=====` · `loom-`는 아키텍트 판정으로 제외) | stderr `marker` 칸 · 0.39 ④ 정규화 통합 때 재검토 | **open, 비차단** · → 0.40.0: R8이 같은 표지 접기를 쓴다(닮은 글자 · `LOOM MEMORY` · `=== - BEGIN LOOM`까지 버림 — 0.40.0 계급 43 · 실 오탐률은 여전히 미관찰) |
| UK-8 | **codex 스킬 경로 충돌**(2026-10-18 실 CLI ① 발견 · codex-cli 0.163.0 · 0.38 변경 아님) — codex `developer_instructions`(`HEADLESS_WORKER_HINT`) *"Work only inside the current working directory. Do not touch paths outside it."* ↔ 카드 스킬 사본은 cwd 밖(`~/.loom/cards/…/skills`) → codex가 cwd만 찾고(`rg --files --hidden -g 'SKILL.md' …` exit 1) "Blocked". 사본 자체는 정상(SKILL.md 둘 존재) · claude는 `--plugin-dir` 플러그인 · grok은 절대 경로를 읽음. **반증(2026-10-15):** `HEADLESS-SMOKE-0310.md` h2(codex-cli 0.162.1 · 실 `HeadlessDispatcher` · 같은 `HEADLESS_WORKER_HINT`)에서 codex의 첫 항목이 `cat <abs card path>/skills/plugin/skills/loom-card-report/SKILL.md`(exit 0) · 출력 끝 `LOOM-REPORT-END`(`HEADLESS-SMOKE-0310.md:28-29`, `:77`). 0310 카드 프롬프트 "finish per your report skill" ↔ 0380 "as your loom-memory-candidates skill describes…" | 원인 **미확인** — codex 버전 변경(0.162.1 → 0.163.0)인지 프롬프트 문구인지. codex 스킬 사용은 **불안정**(0.31부터 깨졌다는 증명 아님) · fingerprint: `HEADLESS_WORKER_HINT`는 `workerFingerprint` 입력(`agent-argv.ts:280-293`)이라 hint를 고치면 바뀌고, 첫 턴 스킬 목록 문면(`skill-prompt.ts`)만 고치면 안 바뀐다(입력은 `manifestHash`뿐) → 0.38 범위 밖 | **open, 0.39 후보로 이월(오너 선택)** — 오너 판정 2026-10-18 "원인 확인 후 결정" → 0.38 변경 아님 → 기록 후 ship. **두 번째 데이터 점(2026-10-18 · 0.38.1 D7):** 목록 머리에 "Reading the SKILL.md files listed here is allowed"를 넣어도(`76be19b` · `codex-cli 0.163.0`) codex는 cwd만 찾고(`rg … -g 'SKILL.md'` exit 1) `"Blocked: the required skills are outside the working directory, and worker instructions prohibit accessing those paths."` · 목록 경로 읽기 0 → 결과 ① → 0.38.1 D8(not shipped) · **open 유지** · 다음 = hint 변경(MINOR · fingerprint 변경) — 오너 선택 · `MEMORY-WRITE-SMOKE-0381.md`. **closed 2026-10-18 — resolved by 0.39.0:** hint 둘째 줄에 *"except that you may read the SKILL.md files listed above the dispatched-task marker"* 예외(0.39.0 D2)를 넣은 실 CLI(`d5a82db` · `codex-cli 0.163.0` · 오너 승인 1회)에서 codex가 목록 SKILL.md 두 경로를 `cat`으로 읽고(exit 0) `proposed 1` · `MEMORY-WRITE-SMOKE-0390.md` |

**Current decision:** D1~D19 + D16' 아키텍트 락(아키텍트 + loom-advisor 자문 2026-10-17) · 작성자 정밀화 R1~R22 · 락↔코드 불일치 C1~C6 · 수용 손실 계급 23~30 + 무번호 · UK-1~UK-7. **R56 `approved-with-fixes` → M1·M2·M3·M4·L1·L2·L3·L4 PLAN 반영 → PLAN `approved`(2026-10-17, no R56b)** · R1~R22 수용(R8→L1 · R11→M2 · R16→M3 · R15 수용) · C1 → R2 · C2 수용(D4 선언 = 새 첫 spawn부터 · 진행 중 카드는 사본 유지) · C3 → R10 · C4 → M2(아카이브 끝 4 MiB) · C5 → M1(편집 선언 12곳) · C6 수용 · 계급 28 보강 · **UK-1 ship 차단(오너 승인 필요 — 실 CLI ① 한정 1회 PASS + 세 카드 `notes.md` · 적어도 한 카드 `proposed ≥ 1`, R56-M4)** · UK-2~UK-7 비차단. **2026-10-18 — implemented (P1–P5):** UK-5는 P3 C2 재개 증명 테스트로 재개 경로가 고정됐으나 표의 판정은 PLAN대로 open/비차단 유지 · UK-2~UK-4 · UK-7은 실 운용 관찰 전이라 open · UK-6 unverified. **real-cli ① 3/3 PASS(2026-10-18 — UK-1 조건 충족 · closed)** · codex 0 원인 = UK-8(기존 hint ↔ cwd 밖 스킬 사본 — 0.39 후보). **shipped 2026-10-18** — ship 검사 green + 최종 리뷰(loom-advisor Opus 5.5 high) = ship. 다음 후보 = **0.39**(mtime 캐시/async 리더 · 닮은 글자 표지 강화 · 셸 우회 차단 · `notes.md` 보기 · UK-8 codex 스킬 경로 — PLAN §0.38.0 "다음 후보").

### 0.37.0 — 정책 정직성 · 펜스 안 정책 안내문 + 규칙 본문 · strict · `agent_disabled` · AGENT_HINT 삭제 (`approved` — R55 approved-with-fixes · implemented · shipped 2026-10-17)

| Field | Value |
|-------|-------|
| **PLAN** | v0.37.0 (`approved` — R55 approved-with-fixes, 반영 완료 · no R55b) · 업그레이드 4단계 3부 · 요구 `UPGRADE-PLAN.md` 4단계 완료 기준 셋째 항목(옵션 ii 체크리스트 `:98`) · '규칙 관리' `:169` · 스킬 관리 규칙 6 `:235` · 범위 = 락 D1~D9(아키텍트 + fable-advisor 자문 2026-10-17) · 정책 안내문 기본 켜짐(D3) · `worker.rules.enabled` · `worker.strictEnforcement`(bridge 설정 키 — `policy.json` 루트 키 철회, D4(a)) · 기억 쓰기 경로는 0.38.0 |
| **Date** | 2026-10-17 |
| **Review** | R55 **done 2026-10-17** — approved-with-fixes H0 · M2 · L4 (M1 내장 deny 합집합 — 계급 20 · strict 거부 꼬리 · UK-6 영구 경고 · M2 UK-1 ship 차단 · 실 CLI ① 한정 1회 = ship 조건 · L1 `configuredAgentBins` 켜진 에이전트 기준 · L2 스모크 안쪽 자식 = bridge와 같은 두 호출 · L3 `POLICY_NOTICE_LEAD` "Loom policy" · L4 `maxConcurrent` 0 파서 → P2) — (새 MINOR + 신뢰 경계 변경 — 정책 문자열 · 규칙 본문이 옵트인 없이 실 CLI 첫 턴으로 · 실 CLI 스모크 0회) |
| **Evidence** | 코드 실측 `main @ acd53a0` (PLAN §0.37.0 Why · 추정/실측 표) · `policy-compile.ts:31-55` · `:124-138` · `policy.ts:462-474` · `:478` · `:765-769` · `:787-792` · `bridge-config.ts:276-290` · `:396-409` · `:441-446` · `:482-500` · `:538-551` · `bridge-runtime.ts:878-883` · `:1106-1116` · `headless-worker.ts:148-170` · `:260-264` · `:1147` · `:1180` · `:1721-1724` · `:2008-2050` · `memory-inject.ts:22-23` · `:54-73` · `memory-inject.test.ts:66-67` · `:177` · `memory-snapshot.ts:270` · `:310` · `rules-store.ts:27` · `:72-75` · `:269` · `mcp-server/src/stdio.ts:65-72` · `mcp-server/src/config.ts:34-55` · `adapters/src/types.ts:52` · `hints.ts` · `cli/src/index.ts:2157-2160` · `:2693-2696` · `cli/src/service.ts:1106-1128` · `session-store.ts:178-208` · `bridge-memory-profile.test.ts:246-256` |

| 분면 | 내용 |
|------|------|
| Known knowns | 코드 실측(`acd53a0`): (1) 정직 표 `POLICY_ENFORCEMENT`의 소비자는 테스트 하나(`policy-compile.test.ts:363-372`) — bridge · doctor · 프롬프트 어디에도 렌더 0. (2) 내장 기본 = `network: false` · `mcp.isolate: true` · 유효 `shell.deny` 11개 → D1 문면이면 기본 간극 6개(claude `network/advisory` 포함 — C1). (3) `parseMaxConcurrent`는 `< 1` 거부 · 워커 `concurrencyLimit`은 `< 1`을 1로 바꿈 → 0 허용에는 명시 검사 필요. (4) `workerSectionFromRaw`는 모르는 키 허용 · `saveBridgeConfig`는 지움. (5) 옛 MCP는 `policy.json` 모르는 루트 키에 모든 호출 거부(`stdio.ts:65-72` + `policy.ts:478`) → strict는 bridge 설정 키. (6) doctor는 `loomDir()`(이관 rename 가능)을 피한다 — C3. (7) `AGENT_HINT.txt` · `systemHint()`를 읽는 코드 0. (8) 프로덕션 `HeadlessDispatcher` 생성자 1개(bridge). (9) `mergePolicy`는 내장 deny 9개를 **항상** 합집합으로 깐다(`policy.ts:765-769`) — 유효 `shell.deny`는 어떤 `policy.json`으로도 비지 않아 codex · grok `shell.deny` 간극은 정책으로 제거 불가(R55-M1). |
| Known unknowns | **UK-1~UK-7**(아래 표, 정본 = PLAN §0.37.0). 요지: 기본 켜짐 안내문의 실 CLI 미검증 · 안내문 준수 · 규칙 준수("자료" 틀) · 첫 턴 크기 · 첫 spawn 정지 시간(`loadRules` 추가) · 경고 소음과 strict 채택 · Windows. |
| Unknown knowns | 0.36 "다음 후보"의 `policy.strictEnforcement`(새 루트 키)는 옛 MCP 전면 거부를 부른다 → bridge 설정 키(D4(a)). D5 예문 꼬리 "nothing blocks it"는 `not-enforced`에만 참 → 수준별 결과 문구(R3). D1 `Gap`에는 금지 문자열이 없다 → `values`(C2 · R1). 계급 20 락 문면은 claude `network` 기본 간극을 빠뜨렸다(C1) — 그리고 내장 deny 합집합 때문에 codex/grok을 켠 채 정책 편집만으로 strict를 통과시킬 길이 없다는 것도(R55-M1 → 계급 20 문면 교체 · strict 거부 꼬리 교체). |
| Unknown unknowns | 기본 켜짐 안내문을 받은 실 codex/grok/claude가 첫 턴을 어떻게 다루는지(거부 · 과잉 준수 · 무시) · 오너가 기동마다 나오는 경고 줄을 읽는지 · 규칙 본문이 "자료" 펜스 안에서 hint와 부딪힐 때의 실제 행동 · 위조 안내문 섹션이 실제로 쓰이는지. |

**Unknowns 요약 (정본 = PLAN §0.37.0):**

| # | 요지 | 출발 기본값 / 착수 영향 | R55 판정 |
|---|------|-------------|----------|
| UK-1 | **기본 켜짐 안내문이 실 CLI 첫 턴에 닿음 — 실 CLI 스모크 0회**(0.36 UK-1 승계 · 아키텍트 메모). 간극 있는 정책(기본 포함)의 bridge는 업그레이드 즉시 옵트인 없이 실 codex/grok/claude(claude도 — C1 → D1 문면) 첫 턴에 펜스 블록을 넣는다 | 스모크 = 가짜 CLI 바이트만 · `smoke:policy --real-cli --owner-approved`는 오너 명시 승인 | **ship 차단(R55-M2) — 오너 승인 필요 · 승인 없으면 ship 대기, `unverified` ship 불가** · ship 조건 = `smoke:policy --real-cli --owner-approved` **① 한정**(codex · grok · claude 각 1카드 · 프롬프트 `Reply with the single word ok.` · 기본 정책 · 기억 · 규칙 꺼짐 · 안쪽 프로세스 실 HOME + `LOOM_TEST_HOME=T` R54-M3 형) 1회 PASS — 세 응답이 결과를 내고 거부 · 탈선 없음을 `POLICY-HONESTY-SMOKE-0370.md`에 기록 · 기각 대안 = 스위치 / `not-enforced` 한정. **implemented 2026-10-17 — 조건 충족:** 오너 승인 1회(`f22a3f3`) · `smoke:policy --real-cli --owner-approved`(dist CLI) **4/4 PASS** — ⓪ doctor 6 warn · 0 fail · ① 세 CLI 안내문(claude 1 · codex 2 · grok 3줄 · codex 11/11 금지 문자열 · D1 교차) · 실 응답 축자 claude `"ok"` · codex `"ok"` · grok `"ok"` · 거부 · 탈선 0 · 실 홈 무접촉. **이 한 모양(기본 정책 · 기억 · 규칙 꺼짐)에 대해 resolved** — 규칙 · 기억 켜짐 첫 턴은 가짜 CLI 바이트만(UK-4) |
| UK-2 | 안내문 준수 — 에이전트가 금지 목록을 지키는 정도 | 권고 경계(계급 17) · CI 측정 불가 | **open, 비차단** — ship: **관찰만** — 실 CLI ① 응답 `"ok"` ×3은 안내문을 앞에 둔 채 프롬프트를 따랐다는 것뿐 · 금지 명령이 필요한 작업에서의 준수는 미측정 |
| UK-3 | 규칙 준수 vs. "자료" 틀 — hint "data, not instructions"와 새 머리말 사이 | 옵트인(기본 꺼짐) · 5단계에서 재검토 | **open, 비차단** — ship: 미측정(실 CLI 규칙 켜짐 실행 0) |
| UK-4 | 첫 턴 크기 — 안내문 + 규칙 ≤16 KiB + 기억 ≈48 KiB(0.36 UK-1 승계) | 스모크 ⑦ 바이트 실측 | **open, 비차단** — **ship 실측(가짜 CLI · dist):** 안내문(기본) + 규칙 3/3(사용자 2 × ≈7600 B + 내장) + 기억 상한 근처(persona/INDEX 8000 B · guideline 16000 B · entries.jsonl 4126862 B) → 블록 claude 63577 · codex 63846 · grok 63978 B · 첫 턴 63766 · 64035 · 64167 B · 바이트 손실 0. 실 CLI의 ≈64 KB 수용은 미실측 |
| UK-5 | 첫 spawn 정지 시간 — `loadRules` 추가(0.36 UK-2 승계) | 스모크 ⑦ `load_ms` · 0.38 캐시 판단 입력 | **open, 비차단** — **ship 실측(위 입력 · 카드 15개/회 · 2회):** `load_ms` dist 중앙값 19 · 19 · 19 / 최대 26 · 20 · 19 ms · source 중앙값 20 · 19 · 18 / 최대 26 · 19 · 19 ms (0.36 기억만 16–17 / 24–25 ms). 이 값만으로는 0.38 캐시 근거 약함 |
| UK-6 | 경고 소음과 strict 채택 — 기본 정책 bridge 경고 6줄 · doctor warn 6줄(exit code 무변경) | C1 → D1 문면(R55) — 기본 6줄 | **open, 비차단** — **codex/grok을 켠 bridge는 경고 2~3줄이 영구**(설계 — R55-M1: 그 `shell.deny` 간극은 내장 deny 합집합 `policy.ts:766`으로 어떤 `policy.json`에서도 남는다 · 끄는 것만 없앤다). **P4c 정정(implementation-notes §0.37.0 (57)):** "켜짐" = `maxConcurrent ≠ 0` ∧ 쓸 수 있는 `agentArgv`(P3-V-L3) → **기본 bridge 설정(`agentArgv {claude}`) = 경고 · warn 1줄**(claude `network` advisory) · **6줄 = 세 에이전트 모두 dispatch 가능할 때** · doctor "no bridge config" / "invalid bridge config"는 모든 에이전트 가정 → 간극 warn 6줄(무효 설정은 설정 오류 warn 1줄 추가) |
| UK-7 | Windows(0.36 UK-7 승계) | 테스트는 macOS/Linux | **unverified(Windows 환경 미사용), 비차단** |

**Current decision:** D1~D9 아키텍트 락(아키텍트 + fable-advisor 자문 2026-10-17) · 작성자 정밀화 R1~R21 · 락↔코드 불일치 C1(claude `network` 기본 간극 · 계급 20 문면) · C2(`Gap.values`) · C3(doctor 정책 경로) · C4(머리말 고정 = 상수 `:66-67`) · 수용 손실 계급 17~22 + 무번호 4행 · UK-1~UK-7. **R55 `approved-with-fixes` → M1·M2·L1·L2·L3·L4 PLAN 반영 → PLAN `approved`(2026-10-17, no R55b)** · R1~R21 수용(R17→L1) · C1 → D1 문면(6개) · C2 → R1 · C3 → R14(+③ 레거시 info 줄) · C4 수용 · **UK-1 ship 차단(오너 승인 필요 — 실 CLI ① 한정 1회 PASS)** · UK-2~UK-7 비차단(UK-6 영구 경고 명시). **implemented 2026-10-17** — P1~P4d · P5a 스모크 `f4c7073` · P5b 버전 `9a402e4` · P5c 문서 · 스모크 `smoke:policy` source 10/10 · dist 10/10 · **real-cli ① 4/4(UK-1 조건 충족)** · UK-6 기본 간극 수 정정(기본 설정 1 · 모두 dispatch 가능 6). **shipped 2026-10-17** — ship 검사 green(기존 실패 1 · biome 기존 오류만) + 최종 리뷰(loom-advisor Opus 5.5 high) = ship. 다음 후보 = **0.38.0 기억 쓰기 경로**(card-report 후보 → `propose` · `notes.md` · mtime 캐시/async 리더 · 닮은 글자 표지 강화).

### 0.36.0 — headless 워커 카드 시작 기억 스냅샷 + 펜스 주입 (`approved` — R54 approved-with-fixes · implemented 2026-10-16)

| Field | Value |
|-------|-------|
| **PLAN** | v0.36.0 (`approved` — R54 approved-with-fixes, 반영 완료 · no R54b) · 업그레이드 4단계 2부a · 요구 `UPGRADE-PLAN.md` 4단계 완료 기준 (a) · 기억 관리 규칙 4 · 범위 = 락 D1~D11(아키텍트 + fable-advisor 자문 2026-10-16) · 기본 꺼짐 `worker.memory.enabled` · 4단계 완료 기준 (c)는 0.37.0으로 이동(D1 — §0.35.0 "다음 후보" 정정) · `ARGV_TEMPLATE_VERSION` 올림 없음(D10 amended) |
| **Date** | 2026-10-16 |
| **Review** | R54 **done 2026-10-16** — approved-with-fixes H0 · M3 · L2 (M1 D10b 뒤집기 P1 red · M2 스모크 `LOOM_PROFILE=smoke` · M3 스모크 가드 모드별 · L1 꺼짐 파일시스템 무접촉 · L2 레코드 `null` 변조) — (새 MINOR + 신뢰 경계 변경 — 사람 파일·승인 기록이 워커 프롬프트로 · resume 게이트 동작 변경 D9) |
| **Evidence** | 코드 실측 `main @ 5fa8167` (PLAN §0.36.0 Why · 추정/실측 표) · `headless-worker.ts:109-125` · `:241-251` · `:794` · `:923-976`(`:966-974` 새 세션 갈래) · `:1066` · `:1107` · `:1339-1368` · `:1548-1660` · `:1753-1760` · `:1860-1870` · `agent-argv.ts:18` · `:28-36` · `:70-84` · `:259-290` · `skill-prompt.ts:44-52` · `:120-122` · `protocol/src/card-contract.ts:123-129` · `card-session-store.ts:43-71` · `bridge-config.ts:75-94` · `:374-388` · `:461-478` · `bridge-runtime.ts:838` · `:878` · `:1106-1148` · `bridge-spawn.ts:40-45` · `skill-materialize.ts:1086-1150` · `memory-snapshot.ts:200` · `memory-snapshot.test.ts:773-800` · `policy-fingerprint.test.ts:50-62` · `headless-argv.test.ts:139-167` |

| 분면 | 내용 |
|------|------|
| Known knowns | 코드 실측(`5fa8167`): (1) 저장소를 읽는 워커 경로 0 — `loadMemorySnapshot` production import 0(`memory-snapshot.test.ts:773-800`). (2) hint 마지막 문장이 **표지 아래**만 자료로 선언(`agent-argv.ts:35`) — 표지 위 블록은 밖. (3) `containsMarker` 비공개(`skill-prompt.ts:44-52`). (4) fingerprint 5-입력 · 리터럴 hex 고정 테스트(`agent-argv.ts:259-271` · `policy-fingerprint.test.ts:50-62`). (5) skills 꺼짐 resume 불일치 = 조용한 새 세션(`headless-worker.ts:966-974`) — recovery/adopt는 이미 `needs_verification`. (6) `HeadlessDeps`에 profile 없음(`:109-125`). (7) `WorkerConfig`는 `agent-argv.ts:70-84`(C1). (8) `skills/`는 `manifest.json` + `plugin`만 허용(`skill-materialize.ts:1086-1100`) → 기억 파일은 형제. (9) `scrubWorkerEnv`가 `LOOM_TEST_HOME`을 지움(`:241-251`). (10) `validRecord`는 모르는 키 허용(`card-session-store.ts:43-71`). |
| Known unknowns | **UK-1~UK-7**(아래 표, 정본 = PLAN §0.36.0). 요지: 실 CLI 첫 턴 크기 수용 · 첫 spawn 정지 시간 · 펜스 준수 · 무력화 오탐 · env redaction 영향 · profile 일관성 · Windows. |
| Unknown knowns | 0.35 "다음 후보"의 펜스 위치(스킬 목록 다음 · 표지 앞)는 hint 문장 밖이었다 → 표지 뒤(D4). 템플릿 버전을 올리면 recovery가 미전송 레코드 전부를 선점한다 → 올리지 않고 조건부 6번째 입력(D3 · D10 amended). skills 꺼짐에서 기억 hash 불일치가 조용한 새 세션으로 샐 수 있었다 → D9. 기존 import 가드는 부분 문자열이라 파일 이름 `memory-snapshot.md`만 적어도 걸린다(C2). 쓰기 순서상 write-ahead 레코드는 spread가 아니라 새 객체라 resume에서 hash를 명시 전달해야 한다(R10). |
| Unknown unknowns | 실 에이전트가 펜스 머리말을 얼마나 지키는지 · 사람이 persona에 무엇을 실제로 쓰는지(지시문 비중) · 기억이 룸 결과로 되돌아 나오는 빈도(출력 미redaction) · 여러 bridge 프로필이 같은 `~/.loom`의 project 기억을 공유할 때의 혼란 · 긴 카드에서 시작 시점 기억이 낡아 생기는 판단 오류. |

**Unknowns 요약 (정본 = PLAN §0.36.0):**

| # | 요지 | 출발 기본값 / 착수 영향 | R54 판정 |
|---|------|-------------|----------|
| UK-1 | 실 CLI 첫 턴 크기 수용 — 블록 ≈48 KiB + 머리 + 목록 ≤4 KiB(0.35 UK-3 승계) | 스모크 = 가짜 CLI 바이트만 · 실 CLI는 `--real-cli` + 오너 승인 | **open, 비차단** — `--real-cli`는 안쪽 프로세스 실 HOME · `LOOM_TEST_HOME`만 tmpdir 가드(R54-M3). **ship: 가짜 CLI 바이트만 실측** — 상한 근처 저장소에서 블록 47874 B · 첫 턴 48063 B(skills 꺼짐) · 세 가짜 CLI 모두 바이트 손실 0(`MEMORY-INJECT-SMOKE-0360.md` ④). 0.36.0 시점 실 CLI 실행 0(오너 승인 없음). **2026-10-17 실 CLI 실측(오너 승인 · dist v0.37.0 · macOS):** `--real-cli` ⓪① 4/4 PASS — 실 claude · codex · grok가 작은 펜스(블록 619–621 B) 첫 턴 수용. 상한 근처 ≈48 KiB 첫 턴의 실 CLI 수용은 여전히 미측정(④는 가짜 CLI 전용) |
| UK-2 | 첫 spawn 정지 시간 — 카드 락 안 동기 읽기 ≤4 MiB + redaction + 쓰기(0.35 UK-5 승계) | 캐시 없음(계급 12) · 스모크 `load_ms` 기록 → 0.37 mtime 캐시/async 결정 | **open, 비차단** — **ship 실측(가짜 CLI · macOS arm64):** 상한 근처(entries.jsonl 4126862 B · persona/INDEX 8000 B · guideline 16000 B) 첫 spawn 15회 `load_ms` 중앙값 16–17 · 최대 24–25 ms(2회) · dispatch 전체 중앙값 ≈55 ms. 이 값만으로는 0.37 캐시 근거 약함 |
| UK-3 | 펜스 준수 — 에이전트가 기억을 자료로 다루는지 | 권고 경계(계급 13) · CI 측정 불가 | **open, 비차단** — ship: 미측정(실 CLI 실행 0). **2026-10-17 관측(오너 승인 실 CLI ① · macOS):** CLI당 표본 1건 — 세 실 CLI 모두 project 토큰 인용 · room:A 토큰 부재(펜스 hash 일치) PASS. 표본이 작아 일반 준수율은 미측정 |
| UK-4 | 무력화 오탐 — 실제 persona/guideline에서 `containsMarker` 적중 빈도 | 자리표시 + 셈 + stderr(계급 11) | **open, 비차단** — 실제 persona 데이터 없음(미측정). 스모크 ③ = 심은 위조 1줄 → `neutralized 1`. 닮은 글자 미탐(impl-notes (4)) |
| UK-5 | env 값 redaction이 사람 문장을 바꾸는 정도 | `env_redacted` 표시 | **open, 비차단** — 실제 데이터 미측정. 스모크 ③ = 심은 env 값 → `env_redacted yes` · 파일·stdin에 부재 |
| UK-6 | profile 일관성 — bridge와 CLI가 같은 agentKey(0.35 UK-1 승계) | D8 · R16 테스트(headless) · pane/sticky host 주입 0 | **open, 비차단** — **R54-M2 실측 1건 추가:** 스모크 dist CLI 자식은 `resolveBridgeProfile`로 풀어 임시 홈에서 `default`가 된다(`memory-cli.ts:860-877`) → 모든 CLI 자식 `LOOM_PROFILE=smoke` · ⓪ `memory list` 머리 `profile smoke (from LOOM_PROFILE)` 단언 · 디스패처 `claude.smoke`와 일치(R16 짝). **ship 실측:** P4 검증 같은 env 13/13 일치(impl-notes (24)) · 스모크 ⓪ PASS · 서비스 유닛 `LOOM_SESSION` 고정 → 보통 셸 쓰기는 `--profile` 필요(USER_GUIDE §20.11) · 워커 scrubbed env CLI = displayName(0.37 메모) |
| UK-7 | Windows — 원자 rename · 0600 · 심링크(0.35 UK-6 승계) | 테스트는 macOS/Linux | **unverified(Windows 환경 미사용), 비차단** |

**Current decision:** D1~D11 아키텍트 락(아키텍트 + fable-advisor 자문 2026-10-16 — D9 · D10은 amended) · 작성자 정밀화 R1~R18 · 락↔코드 불일치 C1(플래그 경로 — `WorkerConfig`가 `agent-argv.ts`에 있음 → `HeadlessDeps.memory`) · C2(import 가드 부분 문자열 → import 지정자) · 수용 손실 계급 5(실현) · 10~16 + 무번호 2행 · UK-1~UK-7. **R54 `approved-with-fixes` → M1·M2·M3·L1·L2 PLAN 반영 → PLAN `approved`(2026-10-16, no R54b)** · R1~R18 수용(R7→L1 · R10→L2 · R15→M1) · C1→R1 · C2→R15(M1 순서) · UK-1~UK-7 비차단. **implemented 2026-10-16** — P1~P5(`fc1d4f6` → … → `feeb9e7` → `a58dcba` 스모크 → PATCH 5 문서) · 스모크 `smoke:memory-inject` 7/7 PASS(가짜 CLI · dist 0.36.0) · 실 CLI 실행 0 · ⑥ 밖 production 변경 0. **Next = 0.37.0.** 다음 후보 = **0.37.0 제안 · 규칙 · 정책 정직성**(4단계 완료 기준 (c) 인도 — 다시 나뉠 수 있음).

### 0.35.0 — memory / rules / skills 저장소 + CLI + 순수 스냅샷 리더 (`approved` — R53 approved-with-fixes · implemented 2026-10-16)

| Field | Value |
|-------|-------|
| **PLAN** | v0.35.0 (`approved` — R53 approved-with-fixes, 반영 완료 · no R53b) · 업그레이드 4단계 1부 · 요구 `UPGRADE-PLAN.md` 4단계 · 기억 관리 · 규칙 관리 · 스킬 관리 · 범위 = 락 D1~D10(아키텍트 + fable-advisor 자문 2026-10-16 — D9 · D10은 0.36.0 기록용) · 워커·프롬프트·bridge 변경 0(D1) · 4단계 2부 = 0.36.0(카드 시작 스냅샷 + 펜스 주입) |
| **Date** | 2026-10-16 |
| **Review** | R53 **done 2026-10-16** (새 MINOR + 신규 제품 표면 + 영속성·신뢰 경계 — 0.36에서 프롬프트로 들어갈 저장소의 형식 · 쓰기 안전 · 승인 상태기계 · 경로 규약) |
| **Evidence** | 코드 실측 `main @ dbab890` (PLAN §0.35.0 Why · 추정/실측 표) · `packages/relay/src/room.ts:167-168`(룸별 seq) · `agent-argv.ts:18` · `:28-36` · `:279` · `atomic-json.ts:22-24` · `:190-209` · `room-event-log.ts:125-141` · `:518-551` · `card-session-store.ts:83-123` · `context-pack.ts:67-73` · `result-quarantine.ts:106-147` · `redact.ts:87-98` · `protocol/src/sanitize.ts:18` · `skill-materialize.ts:47` · `:109-120` · `:708-728` · `session-store.ts:72` · `:79-83` · `:179` · `bridge-spawn.ts:40-45` · `bridge-runtime.ts:878` · `:1106-1111` · `headless-worker.ts:110-127` · `cli/src/service.ts:295` · `cli/src/index.ts:362-397` · `:3389-3395` · `doctor.ts:3` · `:695` · 스모크 [`docs/spikes/MEMORY-SMOKE-0350.md`](spikes/MEMORY-SMOKE-0350.md) (2026-10-16 · macOS · bun 1.3.11 · dist 0.35.0 18/18 PASS · 자식만 임시 홈 · 실 `~/.loom`·`~/.fable` 이름+mtime 동일) · P4b 실측 `redact.ts` `redactUrlUserinfo` O(n²)(64 KiB ≈ 9.7초 → 선형, `implementation-notes.md` §0.35.0 (48)) |

| 분면 | 내용 |
|------|------|
| Known knowns | 코드 실측(`dbab890`): (1) `rules/` · `memory/` · `knowledge/`를 읽거나 쓰는 코드 0 · 헤드리스 워커는 Loom MCP 없음(`agent-argv.ts:28-36`). (2) relay seq는 룸별 · 미스탬프 0(`room.ts:167-168`) — 전순서 아님. (3) `roomKey` = sha256(roomId)[:16] · 카드 디렉터리 = 해시(`room-event-log.ts:125` · `card-session-store.ts:83-123`). (4) `withFileLock` 동기 · 대기 4초 · stale 5초 · 타임아웃 = 일반 Error(`atomic-json.ts:22-24` · `:190-209`). (5) JSONL append 끝 개행 수선 선례(`room-event-log.ts:518-551`). (6) 격리 fold는 torn을 마지막 줄만 셈(`result-quarantine.ts:117-127`). (7) `redactSecrets` env 생략 = `process.env`(`redact.ts:87-91`) · `sanitizePeerText`는 CR 제거. (8) 사용자 스킬 항목은 깨졌어도 내장을 가림(`skill-materialize.ts:708-728`) · 목록 CLI 없음. (9) `loomDir()` 캐시·이주(`session-store.ts:72` · `:179`). (10) `HeadlessDeps`에 profile 없음(`headless-worker.ts:110-127` — C1). |
| Known unknowns | **UK-1~UK-6**(아래 표, 정본 = PLAN §0.35.0). 요지: 0.36 profile 전달(C1) · redaction 오탐률 · 스냅샷 크기 예산 · 규칙 scope/priority 의미 · 동기 리더 핫 경로 비용 · Windows. |
| Unknown knowns | 업그레이드 계획의 "1단계 순번(seq)으로 최신 판단"은 relay seq가 룸별이라 성립하지 않는다 — 저장소 로컬 seq + `(seq, id)` fold(D2). `rooms/<roomId>/` · `cards/<cardId>/` 문면은 기존 해시 규약과 충돌한다(D3). 리더가 `redactSecrets`를 env 없이 부르면 `process.env`를 읽어 순수하지 않다(R10). sanitize가 CR을 지우므로 "sanitize가 바꾸면 거부"는 붙여넣은 본문을 전부 막는다(R7). compact가 대체된 기록을 옮겨도 대체자는 dangling이 아니라 **아카이브 참조**(`supersedesArchived` · `archivedRefs` — info)로 센다 — 고정점으로 대상을 붙잡으면 대체 사슬이 줄지 않아 1 MiB 쓰기 거부가 풀리지 않고, "active 대체자만 가림"이면 retire가 옛 기록을 되살려 compact 전후 가시 집합이 달라진다(R9 · R53-M1). 스모크가 자기 HOME을 임시로 요구하면 실 셸에서 돌 수 없고 실 홈 비교도 못 한다 — 임시 env는 자식에게만(R53-M2). 사람이 쓰는 파일은 쓰기 검사가 없어 env 값 redaction을 받지 않는다(R53-L3). 프로필 이름은 임의 문자라 경로가 될 수 없고 macOS는 대소문자를 무시한다(R1). |
| Unknown unknowns | 사람이 실제로 쓰는 기록의 양·길이 분포 · 여러 프로필이 같은 `~/.loom`을 쓸 때 knowledge·guideline 공유가 낳는 혼란 · 0.36 주입 뒤 에이전트가 기억을 지시로 오인하는 정도 · 손편집이 만드는 이상 줄의 실제 빈도 · 편집기 임시 파일(`.md~` · `.swp`)이 `rules/`에 남는 경우. |

**Unknowns 요약 (정본 = PLAN §0.35.0):**

| # | 요지 | 출발 기본값 / 착수 영향 | R53 판정 |
|---|------|-------------|----------|
| UK-1 | 0.36 배선 때 profile 전달(C1) — `HeadlessDeps.profile` 추가 외 sticky host·pane 경로의 profile 해석 | 0.35는 `agentKeyFor(profile, …)`만 고정 · 배선 0 | **open, 비차단** — 0.35 CLI·doctor는 `resolveBridgeProfile()` 하나로 풀고 `list` 머리에 출처 표시(R53-L2). 0.36 배선 때 확인 |
| UK-2 | redaction 오탐률(`token: …` · `password = …` 꼴 평문) | 0.35 = 사람이 고쳐 씀(계급 6) · 문구가 이유를 말함 | **open, 비차단** — 실제 사람 기록 데이터 없음(미측정). 부수 실측: 긴 URL 꼴 문자열에서 `redactSecrets`가 O(n²) → P4b 선형화(출력 바이트 동일) |
| UK-3 | 스냅샷 크기 예산(persona 8 · INDEX 8 · guideline 16 · Memory 16 KiB)이 세 CLI 첫 턴 본문에 맞는지 | 0.36 PLAN이 실측 뒤 상한 조정 가능(형식 무변경) | **open, 비차단** — 0.35는 주입 0이라 미측정 |
| UK-4 | 규칙 `scope`(`all\|claude\|codex\|grok`) · `priority` 의미가 5단계 프롬프트 조립과 맞는지 | 규칙 배선 0 · 키 추가로 흡수 | **open, 비차단** — 내장 1개 · 덮어쓰기 · 비활성은 스모크 ⑫⑬ PASS · 의미 판정은 5단계 |
| UK-5 | 동기 `loadMemorySnapshot`의 0.36 `spawnOnce` 핫 경로 비용(최대 4 MiB fold) | 0.35 미배선 · 0.36이 측정 후 async 래퍼 결정 | **open, 비차단** — 미측정 · 0.36 메모: redaction된 persona를 mtime으로 캐시(자문 — impl-notes (52)) |
| UK-6 | Windows — 모드 비트 · `withFileLock` · 심링크 판정 | 0.24.2 플랫폼 조건부 선례 · 테스트는 macOS/Linux | **unverified(Windows 환경 미사용), 비차단** — doctor는 Windows에서 모드 판정 대신 info 한 줄 |

**Current decision:** D1~D10 아키텍트 락(아키텍트 + fable-advisor 자문 2026-10-16 — D9 · D10은 0.36.0 기록용) · 작성자 정밀화 R1~R16 · 락↔코드 불일치 C1(profile이 `HeadlessDeps`에 없음 — 0.36에서 필드 추가) · 수용 손실 계급 1~9 + 무번호 3행 · UK-1~UK-6 · 4단계 완료 기준 (c) 옵션 ii 체크리스트로 재정의(0.36 인도). **R53 `approved-with-fixes` → M1·M2·L1·L2·L3 PLAN 반영 → PLAN `approved`(2026-10-16, no R53b)** · R1~R16 수용(R5·R9→M1 · R7→L1 · R1→L2) · C1 수용(0.35 변경 없음) · UK-1~UK-6 비차단. **implemented 2026-10-16** — P1~P5(`031aea1` → … → `c6b6ea5` → `9e92375` 스모크 → PATCH 5 문서) · 스모크 `smoke:memory` 18/18 PASS(dist 0.35.0 · `--source`) · ⑥ 밖 production 변경 1건 = P4b `redact.ts` 선형화(아키텍트 + fable-advisor 승인 · 출력 바이트 동일). UK-1~UK-5 open · UK-6 unverified(전부 비차단). 다음 후보 = **0.36.0 카드 시작 스냅샷 + 펜스 주입**(4단계 2부 — PLAN MINOR + R54).

### 0.34.0 — `loom service` launchd/systemd 사용자 서비스 설치 (`approved` — R52 approved-with-fixes · implemented 2026-10-16)

| Field | Value |
|-------|-------|
| **PLAN** | v0.34.0 (`approved` — R52 approved-with-fixes, 반영 완료 · no R52b) · 업그레이드 3단계 2부 · 요구 `UPGRADE-PLAN.md:81-85` · 범위 = §0.33.0 "다음 후보" + 락 D1~D8(아키텍트 + fable-advisor 자문 2026-10-16) · 실 OS 등록·라이브 스모크는 별도 오너 명시 승인 |
| **Date** | 2026-10-16 |
| **Review** | R52 **done 2026-10-16** (새 MINOR + 신규 제품 표면 + 영속성·신뢰 경계 — Loom 프로세스의 OS 서비스 등록 · 유닛 내용(토큰 0 · env 고정) · 서비스 stop의 워커 생존(`KillMode=process`)) |
| **Evidence** | 코드 실측 `main @ 0a20173` (PLAN §0.34.0 Why · 추정/실측 표) · `bridge-main.ts:28-31` · `:52-55` · `:68-69` · `bridge-lock.ts:76-85` · `:226-240` · `:425-436` · `bridge-spawn.ts:28` · `:68-75` · `:132` · `:137` · `:150-152` · `:161` · `bridge-config.ts:99-104` · `:112-113` · `session-store.ts:269-282` · `:408` · `headless-worker.ts:241-251` · `process-group.ts:96-102` · `doctor.ts:363` · `:470` · lessons `tasks/lessons/platform.md:136-151`(systemd HOME 미상속 크래시 루프) · R52 대조: `headless-worker.ts:615-635`(`close()` = abandon만, 워커 kill 0) · `process-group.ts:96-104` · `session-store.ts:300` · `protocol/src/env.ts:67-73`(*P5 정정: `envRelayToken()`은 `LOOM_RELAY_TOKEN`만 돌려주고 `FABLE_RELAY_TOKEN`은 경고만 — install이 두 이름을 직접 검사*) · 스모크 [`docs/spikes/SERVICE-SMOKE-0340.md`](spikes/SERVICE-SMOKE-0340.md) (2026-10-16 · macOS · bun 1.3.11 · 코드 `fb89d75` · 가짜 서비스 관리자 · **라이브 not run — 오너 승인 대기**) · P3 검증 프로브 사고(실 LaunchAgents plist 1분 · `launchctl` 0) = `implementation-notes.md` §0.34.0 Deviation (9) |

| 분면 | 내용 |
|------|------|
| Known knowns | 코드 실측(`0a20173`): (1) 락 거부 = `BridgeLockBusyError` — live 보유자면 `holderPid` = owner pid, incomplete·회수 경합·마감이면 `null`(`bridge-lock.ts:226-240` · `:425-436`) · `bridge-main.ts:52-55` catch가 전부 exit 1. (2) `bridge-main.ts` exit 지점 셋 — 두 번째 신호 0(`:30`) · 기동 실패 1(`:54`) · 정지 0(`:69`). (3) 수동 기동은 맨 `bun`(`bridge-spawn.ts:161`) + 상속 env + `LOOM_SESSION`/`LOOM_PROFILE`(`:132` · `:137`) · `bridgeMainPath()` cwd 폴백(`:68-75`) · herdr 소켓 기본값 `homedir()` 기반(`herdr-client.ts:27`) · 에이전트 바이너리 맨 이름(`bridge-config.ts:99-104`). (4) 토큰 = 세션 파일 0600 또는 env(`session-store.ts:408`). (5) 워커 = `detached:true`(`process-group.ts:96-102`) · 워커 env `LOOM_*` 제거(`headless-worker.ts:241-251`). (6) 정제기 둘 — 설정 `_`(`bridge-config.ts:112-113`) · 락/상태/로그 `-`(`bridge-spawn.ts:28`). (7) doctor = 파일·pid만 · `fail` 0(`doctor.ts:363` · `:470`). (8) `LOOM_SERVICE` 사용처 0(신규). |
| Known unknowns | **UK-1~UK-6**(아래 표, 정본 = PLAN §0.34.0 · UK-6은 최종 리뷰 추가). 요지: 서비스 관리자 정지 신호·유예 · macOS 26 Login Items · ssh(GUI 없음) launchd 동작 · Linux 라이브 미검증 · Linux lstart(0.33.0 UK-2 이월) · 로그인·재부팅 자동 기동과 macOS TCC. |
| Unknown knowns | 락 거부 exit 1(0.33.0 R10)은 수동 기동에는 옳지만 `KeepAlive`/`Restart=on-failure` 아래에서는 **크래시 루프**가 된다 — 양보(exit 0)는 보유자가 확인될 때만(D3). systemd는 프로세스 그룹이 아니라 **cgroup**으로 추적한다 — setsid만으로는 서비스 stop에서 워커가 살아남지 못한다(`KillMode=process`, D4). 서비스 관리자는 로그인 셸이 아니다 — HOME·PATH 미상속은 이미 한 번 크래시 루프를 냈다(lessons). 버스 없이 `systemctl --user enable`은 실패한다 — "다음 로그인에 뜬다"를 참으로 만들려면 wants 심링크를 직접 만든다(R8). 테스트 홈의 plist도 실 launchd는 받아들인다 — `LOOM_TEST_HOME` + 실 runner 거부(R9). **R52 교훈:** "실행 중"과 "적재됨"은 다르다 — 양보·drain 뒤·조절 중 서비스는 적재됨+실행 아님이고, 이미 적재된 label에 bootstrap은 EALREADY다(M1) · bootout은 옛 인스턴스 종료 전에 반환할 수 있다(M2) · macOS 로그아웃도 setsid 워커를 죽이며 linger 동등물이 없다(M3) · 종료 코드만으로 "다음 로그인에 뜬다"를 약속하지 않는다(L2). |
| Unknown unknowns | 로그인 직후 relay·herdr가 늦게 뜰 때 조절 재시도 소음의 실제 크기 · 사용자 Login Items 정리 습관 · 여러 프로필 서비스 동시 기동 시 경합 · 서비스 bridge와 대화형 세션이 같은 프로필을 쓸 때 사람에게 보이는 혼란 · launchd가 `bun`(서명 없음)을 백그라운드 항목으로 다루는 정책 변화. |

**Unknowns 요약 (정본 = PLAN §0.34.0):**

| # | 요지 | 출발 기본값 / 착수 영향 | R52 판정 |
|---|------|-------------|----------|
| UK-1 | launchd/systemd 정지 신호 순서·유예(0.33.0 Unknown unknowns 이월) — launchd 그룹 대상 여부 · SIGKILL 시점 | bridge 정지 상한 10초 < `ExitTimeOut 20` / `TimeoutStopSec=30` · 라이브 스모크(선택)가 macOS 실측 | **open, 비차단** — P2가 main 단독 SIGTERM 경로만 모사(≤10초 exit 0 · 워커 생존 · 입양 1회). 0.34.0 시점 라이브 스모크 not run(오너 승인 대기). **2026-10-17 macOS 라이브 실측(오너 승인 · dist v0.37.0):** `bootout` exit 0 → not-found + 상태 `stopped` **215 ms**(정지 상한 10초 · `ExitTimeOut 20` 안) · 신호 순서·SIGKILL 시점은 직접 관측 안 됨 · systemd 미실측(`SERVICE-SMOKE-0340.md` "Live run") |
| UK-2 | macOS 26 Login Items — 등록 알림 · 표시 이름(`bun` vs label) · 비활성 뒤 `bootstrap`/`kickstart` 코드·문구 · `print-disabled` 표기 | `disabled` 분류 패턴(R10)만 영향 · 라이브 스모크가 실측 | **partly observed, 비차단** — P3 검증 프로브 사고로 관측: LaunchAgents에 plist **파일만 생겨도**(`launchctl` 호출 0) "Background Items Added" 알림 · 표시 이름 = bun 서명자 **"Jarred Sumner"**(label 아님). 2026-10-17 macOS 라이브: scratch label의 `print-disabled` 항목 **(none)**. 비활성 뒤 `bootstrap`/`kickstart` 코드·문구는 미실측 |
| UK-3 | ssh(GUI 세션 없음)에서 `launchctl bootstrap gui/<uid>` 결과 코드(5 · 125 · 기타) · GUI 로그인 사용자의 ssh 세션에서 성공 여부 | 결과는 exit 0 또는 exit 3 — 둘 다 파일 유지 · 분류 패턴 실측 후 조정 | **open, 비차단** — 각본(`Input/output error` → exit 3)만 검증(P3 · 스모크 ⑤). 패턴 없는 코드 단독은 exit 1(R52-L2). 2026-10-17 라이브는 GUI 세션(`SSH_CONNECTION` unset) → ssh 코드·문구 여전히 미실측 |
| UK-4 | Linux 라이브 미검증 — `StandardError=append:`(systemd ≥ 240) · `KillMode=process` 뒤 left-over 경고 · linger 조회 형식 · wants 심링크 직접 생성 = `enable` 동등성 | CI는 생성기·runner 각본만 · 환경 없으면 **unverified** 기록 | **unverified(Linux 환경 미사용), 비차단** |
| UK-5 | Linux `ps -o lstart=` 형식(0.33.0 UK-2 Linux 이월) — D3 양보가 락 `live` 판정에 기댐 | 못 읽으면 `live` 미검증 → 서비스 모드 양보 exit 0(0.33.0 fail-safe 그대로) | **unverified(Linux 환경 미사용), 비차단** |
| UK-6 | 로그인·재부팅 뒤 자동 기동(launchd `RunAtLoad` · systemd `default.target`) · LaunchAgent `bun`의 macOS TCC 권한(터미널 권한 비상속 — `~/Documents` 등 보호 폴더 프로젝트) | `--live` 스모크는 scratch bootstrap → print → bootout만 — 자동 기동은 측정 못 함 · TCC는 카드 실패로만 보임 | **open, 비차단(최종 리뷰 2026-10-16)** — 실제 `service install` 뒤 로그아웃·로그인으로 확인 · USER_GUIDE §19.7-14 |

**Current decision:** D1~D8 아키텍트 락(아키텍트 + fable-advisor 자문 2026-10-16) · **R52 `approved-with-fixes` → M1·M2·M3·L1·L2·L3 PLAN 반영 → PLAN `approved`(2026-10-16, no R52b)** · R1~R14 수용(R5→L1 · R10→L2) · 아키텍트 답 1~5 수용(exit 3 · uninstall `--force` · doctor subprocess ≤2초 → `info unknown` · `service status` exit 0 · 미분류 exit 1) · 수용 손실 계급 1~13(계급 8 = Linux linger 없음 / macOS 로그아웃 공통 — M3) · UK-1 · UK-3 open · UK-2 partly observed · UK-4 · UK-5 unverified(전부 비차단). **implemented 2026-10-16** — P1~P5(`b77a42f` → … → `fb89d75` → `244e6a2` 스모크 → PATCH 5 문서) · 스모크 `smoke:service` ①~⑥ PASS(가짜 서비스 관리자) · 라이브 스모크 0.34.0 시점 not run → **macOS 라이브 2026-10-17 오너 승인 실행 PASS**(7/7 · live pass · dist v0.37.0) · Linux 라이브 unverified. 다음 후보 = 업그레이드 4단계(memory / rules / skills 저장소 — 오너 지시 · PLAN MINOR + R53).

### 0.33.0 — bridge 생명주기 보강 (`approved` — R51 approved-with-fixes · implemented 2026-10-16)

| Field | Value |
|-------|-------|
| **PLAN** | v0.33.0 (`approved` — R51 approved-with-fixes, 반영 완료 · no R51b) · 업그레이드 3단계 1부 · 요구 `UPGRADE-PLAN.md:81-85` · 3단계 = 0.33.0(생명주기 보강, CI 검증 가능) + 0.34.0 후보(`loom service` launchd/systemd 설치 — 실 등록 스모크는 오너 승인 게이트) |
| **Date** | 2026-10-16 |
| **Review** | R51 **done 2026-10-16** (새 MINOR + 신뢰·내구성 경계 변경 — bridge 프로세스 생명주기 상태기계 · 프로세스 간 락 · 종료 시 수용 손실 계급 공식화) |
| **Evidence** | 코드 실측 `main @ 9567f87` (PLAN §0.33.0 Why · 추정/실측 표) · UK-4 = `bridge-main.ts` 정적 import 폐포 조사(R51 확인 → resolved) · R51 대조: `bridge-runtime.ts:1136` · `:1167-1175` · `:1180-1187` · `fake-herdr.ts:296` · 스모크 [`docs/spikes/BRIDGE-LIFECYCLE-SMOKE-0330.md`](spikes/BRIDGE-LIFECYCLE-SMOKE-0330.md) (2026-10-16 · macOS · bun 1.3.11 · 코드 `38933f1`) · UK-1 = `implementation-notes.md` §0.33.0 Deviation (7) |

| 분면 | 내용 |
|------|------|
| Known knowns | 코드 실측(`9567f87`): (1) 카드는 bridge에서 돈다(`bridge-runtime.ts:655`) · sticky host는 카드 0. (2) bridge 신호 핸들러 0 — `bridge-main.ts:21` 영원히 머무는 promise · 핸들러는 `sticky-server.ts:380-385` · `relay/src/cli.ts:76-77`뿐 → SIGTERM이 `stop()`(`:3033-3074`)을 건너뜀 · `loom bridge stop` = RPC `stop` → 3초 → SIGTERM(`bridge-spawn.ts:130-176`). (3) 프로필당 락 없음(`PLAN.md:601` · `USER_GUIDE.md:843` · `CHANGELOG.md:89`) · CLI meta+ping 방어만(`bridge-spawn.ts:58-65`) · 재사용 패턴 `relay/src/persist.ts:101-166` · `host/src/atomic-json.ts:80-85` · lstart 측정 기존(`headless-worker.ts:353`). (4) headless 워커 = `setsid` 분리(`process-group.ts:78-105`) · 입양(`headless-worker.ts:619-666`) · `close()`는 죽이지 않음(`:669-693`, 10초 상한) · pane/conv flight는 메모리(`bridge-runtime.ts:708` · `:714`) · drain 개념 0. (5) claim 지점 둘 — pane 즉시(`:1196`) · headless 허가 시(`:1189-1195`). (6) headless에도 herdr fail-fast(`:761-795`) · conv는 backend 무관 pane(`:1720-1780` · `:1884`). (7) 진단 — doctor에 bridge 절 0 · meta는 stop에서 삭제(`bridge-meta.ts:29-35`) · stderr 로그 매 기동 절단(`bridge-spawn.ts:77-86`). (8) bridge 경로는 `ensureRelay` 미호출(UK-4). (9) R51 실측: claim 전 수신 처리 = 발급자 생성·`processedHandoffs.add`(`:1180`) → claim 클로저(`:1183-1187`) · conv는 `:1136`에서 표시+claim · 수신 즉시 거절 선례 = `payload_invalid`(claim 1회 후 실패 결과, `:1167-1175`) · `bridge-runtime.ts`의 `process.exit` 0곳 · 가짜 herdr 소켓 기존(`fake-herdr.ts:296`). |
| Known unknowns | **UK-1~UK-3**(아래 표, 정본 = PLAN §0.33.0 · UK-4는 R51에서 resolved). 요지: bun SIGTERM 발화 신뢰성 · Linux 시작 시각 출처 · drain 기본 마감. |
| Unknown knowns | "멈춤"은 하나가 아니다 — 요청 정지(exit 0)와 기동 실패(exit 1)를 섞으면 서비스 관리자가 재시작 정책을 못 세운다(PLAN R10). CLI `bridge stop`의 3초 뒤 SIGTERM은 D2 "두 번째 신호 = 즉시 종료"와 겹친다(R1). 같은 10초 상한 두 겹은 바깥 정리를 굶긴다(R2). conv는 pane이라 headless herdr 생략과 충돌한다(R5) — 그리고 **claim하지 않은 거절은 inbox에 남아 재기동마다 반복된다**(R51-M1 → claim 1회 후 거절). `stop()`의 한도 초과가 정리 꼬리까지 자르면 meta·락이 남는다(R51-M3 → `finally`). 핸들이 남으면 `main()` 반환만으로는 프로세스가 끝나지 않는다(R51-M2 → `bridge-main.ts` 명시 exit). pane flight 유실은 설계상 수용이지 결함이 아니다(④ 계급 1). |
| Unknown unknowns | launchd/systemd가 보내는 신호 순서·유예(0.34.0) · 업그레이드 뒤 옛 워커 코드와 새 bridge의 입양 형식 차이가 한 MINOR 안에서 실제로 0인지 · 바쁜 룸에서 drain 600초가 현실적인지 · 동시 `loom bridge start`가 서비스 재시작과 겹칠 때 사람에게 보이는 메시지 품질. |

**Unknowns 요약 (정본 = PLAN §0.33.0):**

| # | 요지 | 출발 기본값 / 착수 영향 | R51 판정 |
|---|------|-------------|----------|
| UK-1 | bun에서 `process.on("SIGTERM")`이 bridge 이벤트 루프(서버 · 폴 타이머 · relay WS · 유닉스 소켓)에서 확실히 발화하는가 | sticky host가 같은 방식 운용 중 · P2 실프로세스 테스트가 측정 · 불발이면 P2 차단 → 아키텍트 판단 | **resolved(P2 · P5 스모크)** — bun 1.3.11에서 확실히 발화: P2 bridge SIGTERM → exit 0 18 ms(×3) · P5 스모크 6–7 ms(×3) |
| UK-2 | stale 락 pid 재사용 판별용 시작 시각 출처 — macOS `ps -o lstart=`(운용 중) · Linux `ps`(procps) 또는 `/proc/<pid>/stat` 22번째 필드 | P1은 `ps -o lstart=` 하나 · 읽기 실패 + pid 생존 → 거부(PLAN R8) · Linux 형식은 P5 확인(환경 있으면) | **macOS resolved · Linux 미실측** — macOS `LC_ALL=C TZ=UTC ps -o lstart=` = `Thu Oct 15 22:52:06 2026` 형식 · `owner.json` lstart와 바이트 동일 · 스모크 ④ stale 회수 일치. **Linux format unverified (no Linux env used)** — 못 읽으면 거부(fail-safe) + 수동 제거 안내 |
| UK-3 | drain 기본 마감 값 | 출발값 600초 · `--timeout`으로 덮음 · grok 헤드리스 ~9분 실측(`PLAN.md:601`)상 짧을 수 있음 · P5 재평가 | **resolved-by-decision(P5)** — 600초 유지(코드 무변경): grok ~9분은 카드 시작 직후 drain일 때만 안에 든다 · grok 노드 운영자는 `--timeout 1200` · 수용 손실 계급 = 마감에 잘린 카드(워커 생존 → 다음 기동 입양) |
| UK-4 | bridge 경로가 `ensureRelay`를 부르는가(0.34.0 D1 런타임 가드 필요 여부) | **실측: 부르지 않는다** — `bridge-main.ts` 정적 import 폐포에 `room-ops.ts`/`relay-daemon.ts`/`sticky-server.ts` 없음 · 동적 import 0 · `loom bridge start`도 미호출 · 단 `loom status`(`cli/src/index.ts:1995`)는 호출 → 0.34.0 루프백 거부는 설치 시점 검사로 충분(PLAN R12) | **resolved(R51)** |

**Current decision:** D1~D6 아키텍트 락(아키텍트 + fable-advisor 자문 2026-10-16) · **R51 `approved-with-fixes` → M1·M2·M3·L1·L2·L3·L4 PLAN 반영 → PLAN `approved`(2026-10-16, no R51b)** · R1~R12 수용(R5→M1 · R2→M3 · R1→L3) · 수용 손실 계급 1~7 + L4 3항 + stale 락 best effort + 하트비트 조언(PLAN §0.33.0 ④) · **UK-4 resolved**(R51) · **UK-1 resolved**(P2 · 스모크) · **UK-2 macOS resolved / Linux 미실측** · **UK-3 resolved-by-decision**(600초 유지 · grok `--timeout 1200`). **implemented 2026-10-16** — P1~P5(`b8739d9` → … → `bb97ffd` → PATCH 5 문서) · 스모크 `smoke:bridge-lifecycle` ①~④ PASS. 다음 후보 = 0.34.0 `loom service`(3단계 2부 — PLAN + R52 뒤 착수 · 실 OS 등록·라이브 스모크는 별도 오너 명시 승인).

### 0.32.0 — Loom MCP 사전 점검 (`approved` — R50 approved-with-fixes · implemented 2026-10-16)

| Field | Value |
|-------|-------|
| **PLAN** | v0.32.0 (`approved` — R50 approved-with-fixes, 반영 완료 · no R50b) · 업그레이드 2단계 2부 마무리 · §0.31.0 범위 분할 이월분 · 요구 `UPGRADE-PLAN.md:156`·`:161` |
| **Date** | 2026-10-16 |
| **Review** | R50 **done 2026-10-16** (새 MINOR + 보안·신뢰 경계 변경 — 대화형 에이전트의 Loom 상태 쓰기에 정책 판정 계층 신설 · 완료 판정 규칙 이월(D4) 공식화) |
| **Evidence** | 코드 실측 `main @ a2e0d99` (PLAN §0.32.0 Why · 추정/실측 표) · 라이브 스모크 [`docs/spikes/MCP-PRECHECK-SMOKE-0320.md`](spikes/MCP-PRECHECK-SMOKE-0320.md) (2026-10-16 · claude 2.1.300 · codex-cli 0.162.1 · grok 1.0.54 alpha · 코드 `f5c59ce`) · UK-2 조사 = `implementation-notes.md` §0.32.0 Deviation (e) |

| 분면 | 내용 |
|------|------|
| Known knowns | 코드 실측(`a2e0d99`): (1) Loom MCP 도구 20개 · 단일 길목 `stdio.ts:412-415` · `inputSchema` 광고만, 인자는 `String()`/`Boolean()`/`Number()` 강제 변환 · 미지 도구 JSON-RPC `-32601`(`:613`) · try 예외는 `isError`(`:620-626`). (2) 정책 `mcp.deny`(`policy.ts:34`)는 헤드리스 워커 argv에만 컴파일 — Loom 서버는 무시. (3) 로컬 done 경로 넷(`update_task` · `add_task` · `import_board` · `conv_close` — reason 기본 `done`, `stdio.ts:346`) · 원격 결과는 `blocked`(`card-ops.ts:321-326`). (4) `apply_card_result` `fromPeerId` 미대조(`card-ops.ts:284-303`) · 작업에 상대 peer id 필드 없음. (5) 사람 경로 실재 — `loom board set <id> done`(`cli/src/index.ts:1214-1234`) · `loom board import --replace`(`:1315-1337`) · conv 닫기 CLI 없음. (6) `policyHash` 입력 = `EffectivePolicy`(`policy.ts:127` · `:695`). (7) `packages/mcp-server` 테스트 0 · smoke-uc `McpClient`(`:69-185`). (8) zod `^3.24.2`는 `@loom/protocol`에만(JSON Schema 변환 없음). (9) R50-M2 실측: `dispatch_card` ack(`opsHandoff`, `room-ops.ts:114-125`)는 해석된 peer id를 담지 않는다 — `to`는 입력 에코 · relay `findPeerByName`은 표시 이름 중복 시 온라인 peer 우선(`relay/src/room.ts:382-387`) · `fromPeerId`는 relay가 연결 신원으로 채우지만(`room.ts:635-660`) 에이전트가 `InboxEntry`에서 베껴 넘긴다(생략 시 L-2 우회 — `blocked` 착지로 수용). |
| Known unknowns | **UK-1~UK-4**(아래 표, 정본 = PLAN §0.32.0 · UK-5는 R50-M2로 실측 → 제외). 요지: codex/grok의 `isError` 표면화 · 엄격 D2가 새로 거부할 기존 호출자 · 감사 파일 상한 값 · claude MCP 권한 프롬프트의 억제 여부. |
| Unknown knowns | "MCP에서 막았다"는 "에이전트가 못 한다"가 아니다 — 대화형 에이전트 셸은 `LOOM_SESSION`을 상속해 `loom board set … done`을 직접 부를 수 있고, 정책 `shell` 규칙은 대화형 세션에 컴파일되지 않는다(PLAN R9). 숨김만 하는 deny는 이름을 아는 모델에게 무력하다(D3). 기본값이 있는 인자(`conv_close` reason)는 명시값만 보면 샌다(PLAN R2). 기본 `allow`는 꼭 지킴 완료 판정의 **이월**이지 준수가 아니다(D4). |
| Unknown unknowns | MCP 클라이언트(claude·codex·grok)가 `tools/list`를 언제 다시 읽는지 — 세션 도중 `policy.json` 변경이 목록에 늦게 반영될 가능성(호출 거부는 즉시); 엄격 검증 거부를 받은 모델이 재시도 대신 셸 우회로 빠지는 행동 변화; 같은 룸 여러 `loom run` 세션의 감사 append 경합이 회전 경계에서 보이는 모습; 7단계 기본 `propose` 전환 시 실제 사람 done 부하. |

**Unknowns 요약 (정본 = PLAN §0.32.0):**

| # | 요지 | 출발 기본값 / 착수 영향 | R50 판정 |
|---|------|-------------|----------|
| UK-1 | codex/grok이 MCP `isError` 텍스트를 claude처럼 모델에 보여 주는가(거부 문구의 다음 행동 안내가 닿는가) | P5 스모크에서 측정 · 보이지 않으면 정직 표 행 갱신 | **resolved(2026-10-16, SMOKE-0320)** — 셋 다 보인다: claude `tool_result` `is_error:true` · codex `mcp_tool_call` `status:"failed"` `result.content[0].text` · grok ACP `rawOutput.output.Error`(모델에는 `Failed to call <tool>: ` 접두). 다음 행동 문구(`loom board set …` · `mode=merge`) 그대로 도달 · 재시도·우회 0 |
| UK-2 | 엄격 D2가 새로 거부할 기존 호출자(비문자열 인자 · `"true"` 문자열 불리언 · 미지 키) | P3에서 리포 grep + smoke-uc 실행으로 조사 · 수정은 호출자 쪽(스키마 완화 아님) | **resolved(P3 조사)** — 걸린 것은 문서 예시 1건(`TEST_PLAN.md` 14.G1 `set_purpose {verify}` → 이제 `invalid_args`가 먼저 · M-24는 host 경로 유지, `0eb9530`) · 기존 smoke-uc 흐름 수정 0줄 · PATCH 5 `smoke:uc` OK |
| UK-3 | 감사 파일 상한 값 — 1 MiB + `.1` 한 세대가 바쁜 룸에서 충분한가 | 출발값 1 MiB · 절단 없음 · P5 레코드 크기로 재평가 | **resolved(2026-10-16, SMOKE-0320)** — 한 줄 172~206바이트 → 세대당 약 5,000건 · 1 MiB 유지(변경 없음). 구현은 `.1` 대신 고유 세대 최신 3개 유지(D8 구현 정정 → 룸당 보통 ~4 MiB) · 양을 좌우하는 것은 기본 `allow`의 `done_via_mcp` 줄 |
| UK-4 | claude MCP 권한 프롬프트가 Loom이 쓴 설정으로 억제되는가 — 정적으로는 `adapters/src`에 `permissions` 쓰기 0 · 오너 전역 사전 허용은 미측정 | 정직 표 "실행 전 사람 확인" 행 문구에만 영향 · P5 관측 | **resolved(2026-10-16, SMOKE-0320)** — Loom은 권한 설정을 쓰지 않는다(넣지도 억제하지도 않음). 오너 모드가 결정: `auto`(오너 현재 기본) → 확인 없음 · `--permission-mode manual` + allow 없음 → `-p`에서 Loom 도달 전 거부(대화형이면 프롬프트) · `--allowedTools mcp__loom` → 확인 없음. **곁가지 실측:** codex는 MCP 호출에 승인을 요구(`approval_mode` 없고 `approval_policy=never` → 실패) → PLAN ④ 정직 표 codex 행 정정 · grok(ACP)은 확인 없음 |
| ~~UK-5~~ *(작성자)* | `dispatch_card` ack가 해석된 대상 peer id를 담는가(PLAN R7 `dispatchPeerId` 비교 대상) | 없으면 디스패치 시점 룸 peer 목록 해석 · 레거시 카드는 오늘 동작 + `l2_unverifiable` | **R50-M2: unknown에서 제외 → 실측** — ack `{status, to, handoffId, notified, recipientCount, message?, …}`(`room-ops.ts:114-125`) · `to` = 입력 에코 → R7 = 로컬 peer 목록 이름 일치 **정확히 1개**일 때만 기록, 0개/2개 이상 → 미기록(`l2_unverifiable`) |

**Current decision:** D1~D10 아키텍트 락(fable-advisor 자문 2026-10-16) · **R50 `approved-with-fixes` → M1·M2·L1·L2·L3 PLAN 반영 → PLAN `approved`(2026-10-16, no R50b)** · R1~R9 수용(R7은 M2로 수정 → 구현에서 fail-visible로 정정 · R9 문서화로 충분 — 0.31.0과 같은 기존 우회 · `propose` 옵트인 · 위협 = 오너 자신의 에이전트) · **UK-5 실측으로 제외**(M2) · **UK-1·UK-3·UK-4 resolved**(라이브 스모크 SMOKE-0320) · **UK-2 resolved**(P3 조사) · PLAN ④ 정직 표 codex 행 정정(승인 요구). **v0.32.0 implemented**(2026-10-16 — PLAN §0.32.0 Implemented · (j) ship 검사 후 ship). 다음 = 3단계 host OS 서비스(UPGRADE-PLAN 순서 고정 — 착수는 오너 지시 시) · 7단계 확정, 순서상 마지막.

### 0.31.0 — 스킬 materialize + policy.json v1 → CLI별 권한 번역 (`approved` — R49 approved-with-fixes)

| Field | Value |
|-------|-------|
| **PLAN** | v0.31.0 (`approved` — R49 approved-with-fixes, 반영 완료 · no R49b) · 업그레이드 2단계 2부 · MCP 사전 점검은 v0.32.0 후보로 이월(범위 분할) |
| **Date** | 2026-10-15 |
| **Review** | R49 **done 2026-10-15** (새 MINOR + 보안·신뢰 경계 변경 — 무인 워커 권한 결정 원천이 `policy.json` 파생으로 · 로컬 스킬 내용이 워커 컨텍스트로 · MCP 격리 기본값) |
| **Evidence** | [`docs/spikes/SKILLS-POLICY-PROBE.md`](spikes/SKILLS-POLICY-PROBE.md) (2026-10-15 실측 · claude 2.1.300 · codex-cli 0.162.1 · grok 1.0.54 alpha · §F = R49 전 실측 · §G = UK-1 실측 · §H = UK-5 실측) · 라이브 스모크 [`docs/spikes/HEADLESS-SMOKE-0310.md`](spikes/HEADLESS-SMOKE-0310.md) |

| 분면 | 내용 |
|------|------|
| Known knowns | 프로브 실측: (1) claude `--plugin-dir` 플러그인 스킬 발견·사용 · `--add-dir`은 그 디렉터리의 `.claude/skills`까지 로드(범위 확대) · 둘 다 가변 인자(§A.2). (2) claude `--settings` 인라인 JSON `permissions.deny` 강제 · `--plugin-dir`·resume과 공존(§B.1 · §F.3). (3) codex `exec` 스킬 플래그 없음 · 규칙 파일은 `$CODEX_HOME/rules`·`<cwd>/.codex/rules`에서만 · `workspace-write` 네트워크 기본 차단, `network_access=true`로 개방(§A.3 · §B.2). (4) codex·grok(미신뢰 cwd 포함) 모두 cwd 밖 절대경로 SKILL.md를 읽는다(§F.1 · §F.2). (5) claude 워커는 오너 MCP 7개 상속 · `--strict-mcp-config` 단독 → 0개(§F.4). (6) grok은 오너 `~/.claude` 권한·MCP·스킬 병합(§A.4) · `--disable-web-search` 플래그 존재(2026-10-15 `--help`). 코드 실측(`2e5349b`): D10 기본 목록 `agent-argv.ts:64-108` · `ARGV_TEMPLATE_VERSION = "0.30.0-v1"`(`:7`) · 카드 디렉터리 `cards/<sha16(localPeerId)>/<sha16(room×agent×card)>/`(`card-session-store.ts:94-106`) · 룸 디렉터리 `rooms/<sha16(roomId)>/`(`room-event-log.ts:125-140`) · `build:cli` 단일 파일 번들. |
| Known unknowns | **UK-1~UK-7**(아래 표, 정본 = PLAN §0.31.0). 요지: 접두 규칙 매칭 의미 · 프롬프트+목록 크기 · 재개 시 플래그 지속 · grok `--disable-web-search` 효과 · claude `--settings` deny의 MCP 차단 · 오너 전역 스킬·MCP 상속의 실효 · 내장 스킬 번들 포함. |
| Unknown knowns | "선택 권위 = `skills.json`"은 **Loom이 복사하는 스킬**에만 해당한다 — 오너 전역 스킬·MCP는 여전히 워커에 보인다(UK-6). "정책 문법이 하나"는 "강제력이 같다"가 아니다(D10 정직 표). deny 합집합 규칙 아래에서는 curl/wget을 내장 deny에 두면 `network:true`가 claude/grok에서 무력해진다(PLAN R4). deprecated deny를 무시하면 deny가 완화된다(PLAN R5). |
| Unknown unknowns | CLI 업데이트가 `--settings`·`--plugin-dir` 의미나 grok 호환 소스 병합을 조용히 바꿀 가능성; 큰 스킬 세트에서 claude 플러그인 설명 주입 비용(claude는 목록 상한이 아니라 복사 개수로만 제한); 스킬 본문이 워커 행동을 바꿔 결과 형식·범위가 흔들릴 가능성; 오너가 `policy.json`을 편집하는 순간 실행 중 카드의 재개가 `fingerprint_changed`로 끊기는 체감. |

**Unknowns 요약 (정본 = PLAN §0.31.0):**

| # | 요지 | 출발 기본값 / 착수 영향 | R49 판정 |
|---|------|-------------|----------|
| UK-1 | `Bash(git status*)` vs 정책 형식 `Bash(git status *)` 매칭 의미(맨 명령 · `git statusfoo`) — 수용만 실측(§F.3) | 내장 allow를 접두 형식으로 변환 · 좁아지면 저하(교착 아님) · P2 1회 프로브 | R49: P2 차단(deny 경로, H1) → **resolved(실측 `SPROBE` §G, 2026-10-15)** — claude `Bash(p *)`는 맨 `p` 차단 · grok은 못 막음(`Bash(p)`가 맨·인자 모두 차단) · 체이닝 거부(두 CLI) · claude `p*` 과매칭 · `p:*` 맨·인자 차단 → 이중 형식 유지(grok 필요 · claude 무해) · `p*` 형 emit 금지 · 내장 공백 없는 문자열 `p` + `p *` 정규화 |
| UK-2 | 카드 프롬프트 ≤60,000자 + 스킬 목록 ≤4 KB의 stdin/prompt-file 전달 · 20개/4 KB 상한 적정성(0.30.0 UK-2 승계) | P4 라이브 프로브 | open, 비차단 |
| UK-3 | 재개 argv에서 `--settings`·`--plugin-dir`·codex `-c …network_access`·grok `--allow/--deny`를 빼도 유지되는가 | 설계 = 매 재개마다 재전달 · 충돌 여부만 P2 확인 | open, 비차단 |
| UK-4 | grok `--disable-web-search` 효과(존재는 `--help` 확인) | grok 네트워크 = D10 "권고" 행 | open, 비차단 |
| UK-5 | claude `--settings` `permissions.deny`의 `mcp__srv__tool` 차단(§C는 `--disallowedTools`만 실측) | P2 1회 프로브 · 실패 시 MCP deny만 `--disallowedTools`(Deviation) | **resolved(실측 `SPROBE` §H, `0706d47`)** — `--settings` deny `mcp__srv__tool`(·`mcp__srv`) → 툴이 init `tools`에서 사라짐 · `permission_denials` 비어 있음(신호 없음) → `--settings` 유지, `--disallowedTools` 폴백 불요 |
| UK-6 *(작성자)* | 오너 전역 스킬(`~/.claude/skills` · `~/.agents/skills` · `$CODEX_HOME/skills`)·MCP 7개가 워커에서 실제로 쓰이는가 · allow 밖 MCP 호출이 거부되는가 | 문서화(Non-goals) · D13과 함께 판정 | **open, 비차단 유지(R49)** — D13 기본 **true**(R49-M1)로 claude 오너 MCP 상속은 기본 차단 · 잔여 = 오너 전역 스킬 상속 · codex/grok MCP(격리 불가 행) |
| UK-7 *(작성자)* | 내장 스킬(`packages/host/skills/`)의 단일 파일 번들 포함 | Bun `import … with { type: "text" }`(R49-L4, 동작 추정) · P3 dist 검사 · 불가 시 빈 내장 + 사용자 소스 스모크(Deviation) | **resolved(2026-10-15)** — Bun 텍스트 import로 `build:cli` 단일 파일 `dist/loom.js`에 `loom-card-report` 포함(`LOOM-REPORT-END` 확인) · 라이브 스모크 (h)에서 내장 소스로 사용 |

**Current decision:** D1~D13 아키텍트 락(fable-advisor 자문 2026-10-15) · **R49 `approved-with-fixes` → H1·M1~M5·L1~L4 PLAN 반영 → PLAN `approved`(2026-10-15, no R49b)** · R1~R8 수용(R4 H1 조건부) · D13 `mcp.isolate` 기본 **true**(M1) · **UK-1 resolved**(P2 deny 경로 차단 → 실측 §G — 이중 형식 유지 · `p*` 금지) · **UK-5 resolved**(§H) · **UK-7 resolved**(dist 포함) · UK-2·UK-3·UK-4·UK-6 open(비차단). **v0.31.0 shipped**(2026-10-15 — PLAN §0.31.0 Implemented). 범위 분할: 0.31.0 = 스킬 materialize + `policy.json` 번역 · **v0.32.0 후보 = MCP 사전 점검** · 계층형 프롬프트 조립 = 5단계. 구현 착수 = **P1**(정책 스키마·병합, red 선행).

### 0.30.0 — 헤드리스 카드 워커 · 카드별 세션 키 · 재개/입양 · 에이전트별 동시성 · 정적 권한 프로필 (`approved` — R48 approved-with-fixes)

| Field | Value |
|-------|-------|
| **PLAN** | v0.30.0 (`approved` — R48 approved-with-fixes, 반영 완료 · UK-5 실측 기재 · no R48b) · 업그레이드 2단계 1부 |
| **Date** | 2026-10-15 |
| **Review** | R48 **done 2026-10-15** (새 MINOR + 보안·신뢰 경계 변경 — 원격 프롬프트로 로컬 CLI를 권한 프로필과 함께 무인 실행 · cwd 경계 · 프로세스 그룹 kill · 평문 transcript) |
| **Evidence** | [`docs/spikes/HEADLESS-WORKER-PROBE.md`](spikes/HEADLESS-WORKER-PROBE.md) (2026-10-15 실측 · claude 2.1.300 · codex-cli 0.162.1 · grok 1.0.54 alpha · Bun 1.3.11 · §7 = R48 후속 실측 UK-5·UK-9·stdin) |

| 분면 | 내용 |
|------|------|
| Known knowns | 프로브 실측: (1) 세 CLI 비대화형 구조화 출력 — claude `.session_id`/`.result`/`.is_error`/`.permission_denials[]` · codex `thread.started.thread_id`/`item.completed`/`turn.completed` · grok `end`에만 `sessionId`. (2) 세 CLI 재개 성립(codeword 회상) · 재개 조회 cwd 귀속 · codex id 캡처 필요. (3) 거부 도구 **no-hang** · exit 0 · claude만 구조화 거부 · claude `acceptEdits`는 `ls`·`touch`를 `allowedTools` 밖에서 자동 허용. (4) Bun 1.3.11: detached 자식은 부모 pid/그룹 SIGTERM에서 생존 · SIGTERM 미전달. (5) codex `exec resume`에 `-C`·`-s` 없음 · grok `--session-id`는 새 대화 전용. 코드 실측(`ac08670`): 워커 로직 `bridge-runtime.ts:662-3154` 클로저 · herdr 호출 48곳 · Flight paneId 키 · 카드 타임아웃 없음 · flight 무제한 · 카드 cwd 미충전·무검증(`:1501`) · `loomSystemHint` 미전달 · `cardSeq`/issuer 인메모리 · 결과 `output` ≤200,000 · 첨부 ≤256,000 · 프롬프트 ≤60,000 · 타워 seq 멱등(`card-ops.ts:313-318`) · 원격 결과 `blocked` 착지. |
| Known unknowns | **UK-1~UK-9**(아래 표, 정본 = PLAN §0.30.0). 요지: 200k 출력의 JSON 이스케이프 후 첨부 상한 여유 · claude stdin 장문 프롬프트 · 전역 훅 상속/격리 · 입양 pid 재사용 · claude `acceptEdits` 자동 허용 집합(차단 → R48 후 실측 resolved) · grok alpha 드리프트 · herdr 기동 의존 · 힌트의 헤드리스 적합성 · codex `developer_instructions` 반영. |
| Unknown knowns | "재개 가능"과 "재개 안전"은 다르다 — 같은 세션 id라도 **cwd·fingerprint가 바뀌었으면** 이어붙이면 안 된다(D6). cwd를 키 해시에 넣으면 "cwd 불일치"는 **조회 불가 = 새 세션**으로 바뀐다(PLAN R2). "브릿지가 죽으면 워커도 죽는다"는 직관과 달리 detached 워커는 **남는다** → 입양이 필수이고, 입양은 pid 재사용 위험을 낳는다(UK-4). pane 워커는 오늘 힌트를 받지 않으므로 힌트 주입은 **신규 동작**이다(PLAN R3). |
| Unknown unknowns | 수 시간짜리 실카드에서의 transcript 크기·디스크 누적(회전 없음); 오너 전역 훅이 무인 워커에서 대화형 전제로 오동작할 가능성; CLI 업데이트(특히 grok alpha · claude 권한 의미)가 정적 프로필 의미를 조용히 바꿀 가능성; 동시성 1에서 큐 적체가 디스패처 체감(원격 tower의 대기)에 주는 영향. |

**Unknowns 요약 (정본 = PLAN §0.30.0):**

| # | 요지 | 출발 기본값 / 착수 영향 | R48 판정 |
|---|------|-------------|----------|
| UK-1 | `CardResultPayload` 와이어 상한 — 실측 `output` ≤200,000 · 첨부 ≤256,000. 남은 미지 = 200k 출력의 JSON 이스케이프 후 256k 첨부 상한 여유 | 꼬리 보존 절단 + `truncated` + `note`에 transcript 경로·바이트 수(PLAN R5) · P2 최악 문자 경계 테스트 | **resolved(설계)** — 코어가 직렬화 예산 기준 꼬리 보존 절단 루프(R48-M2) · P2 red = 전부 `\r\n`/`"`인 200k 출력 |
| UK-2 | claude `-p` + stdin으로 60,000자급 프롬프트 전달 | P3 라이브 프로브 · 실패 시 `--input-format stream-json`/파일 경로 Deviation | **open, 비차단** — 짧은 프롬프트 stdin 경로는 실측 성립(`PROBE` §7.3), 60k 장문은 P3 |
| UK-3 | 오너 전역 훅이 헤드리스 claude 워커 안에서 실행(실측 5건) — 상속 vs 격리 | 기본 **상속**. `--setting-sources` 2.1.300 `--help`에 없음 · `--bare`는 OAuth 미사용 · `--restricted`는 Bash 제거 | **resolved** — 기본 사용자 훅 상속 · 0.30.0 격리 옵션 없음 · `USER_GUIDE.md` 명기 · P3 숨김 `--setting-sources` 1회 프로브(비차단) |
| UK-4 | 입양 시 비자식 pid 재사용 | 시작 시각 기록(PLAN R1) + `ps -o lstart` 대조, 불일치 = 죽음(kill 금지) — P5 고정 | **open, 비차단** |
| UK-5 | claude `acceptEdits` 자동 허용 명령의 정확한 집합(`rm`?) | D10 deny 목록 적정성의 전제 — **P3 전 실측**, 결과로 deny 목록 확정 | **resolved(실측 `PROBE` §7.1)** — cwd 안 `mkdir`·`cp`·`mv`·`rm`·`rm -rf <하위>`·리다이렉트·`git status` 자동 허용 · `chmod`·`sed -i`·`curl`·cwd 밖 `rm -rf` 거부 → deny `Bash(rm *)`·`Bash(rmdir *)`·`Bash(git push*)`·`Bash(git reset --hard*)`·`Bash(git clean*)`·`Bash(sudo *)`·`Bash(curl *)`·`Bash(wget *)` 확정 · 우회(`/bin/rm`·`find -delete`·인터프리터) 잔여 위험 문서화 |
| UK-6 | grok alpha 플래그 드리프트 | 1.0.54 기준 argv 테스트 + 버전 기록(D14) | **open, 비차단** |
| UK-7 | 헤드리스에도 herdr 기동 필수 | 수용(D2) · 후속 정리 | **open, 비차단** |
| UK-8 *(작성자)* | `loomSystemHint`가 MCP 없는 헤드리스 워커에 MCP 도구·세션 시작 의식을 지시 | 문면대로 주입(D12) · (h) 스모크에서 낭비 턴 관측 | **resolved** — `loomSystemHint` 미주입(범위 확장 벡터) · 단일 상수 `HEADLESS_WORKER_HINT`(D12 수정 · fingerprint 입력) |
| UK-9 *(작성자)* | codex `-c developer_instructions=…` 반영 여부 | P3 라이브 프로브(codeword) · 미반영이면 Deviation | **resolved(실측 `PROBE` §7.2)** — 반영됨("ZEBRA42") · `exec resume`에서 재전달 없이 유지 · 재전달 무해 |

**Current decision:** D1~D15 아키텍트 락(fable-advisor 자문 2026-10-15) · **R48 `approved-with-fixes` → H1·M1·M2·M3·L1·L2 PLAN 반영 + UK-5 실측 기재 → PLAN `approved`(2026-10-15, no R48b)** · R1·R4·R5·R6 수용 · R2·R3 수정 수용 · UK-1·UK-3·UK-5·UK-8·UK-9 resolved · **UK-2·UK-4·UK-6·UK-7 open(비차단)**. 2단계 분할: 0.30.0 = 완료 기준 충족 · 0.31.0 = 스킬 materialize + `policy.json` 번역 + MCP 사전 점검 · 계층형 프롬프트 조립 = 5단계. 구현 착수 = **P1**(결과 코어 리팩터).

### 0.29.0 — 룸 이벤트 seq + 안정 id · 멱등 수신 · 룸별 이벤트 로그 · 멱등 송신 (`approved` — R47 approved-with-fixes)

| Field | Value |
|-------|-------|
| **PLAN** | v0.29.0 (`approved` — R47 approved-with-fixes, 반영 완료 · no R47b) |
| **Date** | 2026-10-15 |
| **Review** | R47 **done 2026-10-15** (새 MINOR + 와이어 의미 확장(optional additive) + 신뢰 경계 인접 — `clientEventId` 억제 범위 · 원문 로그) |

| 분면 | 내용 |
|------|------|
| Known knowns | 코드 대조 실측(2026-10-15): (1) 봉투에 id/seq 없음 — BaseEnvelope `v`·`roomId`·`ts`·`requestId?`(`envelope.ts:85-94`). (2) relay 발급 안정 id는 `handoff.id`뿐(`room.ts:441-442`, M-9). (3) relay per-room seq·이력 없음, `broadcast`/`sendTo` fire-and-forget(`room.ts:347-370`). (4) 수신 단일 관문 `relay-client.ts:167-181` · 합성 reconnect chat `:225-232`. (5) 브릿지 dedupe = 인메모리 `processedHandoffs`(`bridge-runtime.ts:705`) — 재시작 소실. (6) sticky 8s 타임아웃 → one-shot 재송신 → 새 handoff id → 이중 디스패치(`sticky-client.ts:79-121` · `room-ops.ts:100`). (7) 중복 `conv.accept` 재적용(`conv-ops.ts:411-421`). (8) 재사용 기반: JSONL append·torn 말행 replay(`result-quarantine.ts:115-225`) · `loomDir()`(`session-store.ts:230`) · `withFileLock`(`atomic-json.ts:179`, 동기). (9) `roomId` 제약 `min(1)`뿐(`envelope.ts:87`) → 경로 세그먼트 사용 불가(PLAN R1). |
| Known unknowns | **UK-1~UK-6**(아래 표, 정본 = PLAN §0.29.0). 요지: 스냅샷 스키마 하위호환·seq 영속 시점 · 다중 relay `roomId` 유일성 · sticky host 로그 담당 여부 · 상한 크기 · 로그 실패 시 전달 정책 · 같은 `clientEventId`·다른 본문. |
| Unknown knowns | "중복 drop"과 "로그 1줄"은 **다른 집합**이다 — 같은 룸에 로컬 프로세스가 둘(브릿지 + `loom listen`)이면 공유 seen 하나로는 두 번째가 이벤트를 못 받는다 → 로그 층(룸 공유) / 전달 층(소비자별) 2층 dedupe(PLAN R2). `seq`는 역행할 수 있으므로(ephemeral relay · 다중 relay) **drop 키가 아니다**(R3). torn 잔편 뒤 무보정 append는 새 레코드까지 삼킨다(R4). |
| Unknown unknowns | 이벤트당 동기 룸 락 + fsync가 chat 체감 지연·브릿지 이벤트 루프에 주는 영향(미측정); 원문 로그 누적 크기와 회전 부재의 장기 영향; 업그레이드 계획 후속 단계(검색·인덱스)가 이 로그 줄 형상에 요구할 필드(지금 `{v:1,…}` 버전 필드로만 대비). |

**Unknowns 요약 (정본 = PLAN §0.29.0):**

| # | 요지 | 출발 기본값 / 착수 영향 | R47 판정 |
|---|------|-------------|----------|
| UK-1 | relay 스냅샷 스키마 변경 하위호환(`ROOM_SNAPSHOT_VERSION` 유지 + optional 필드?) · seq 영속 시점(송신 전 매회 vs 블록 예약) | 구 스냅샷 = seq 1부터 · **재시작 후 seq 비감소** 고정 · 방식은 PATCH 2 택일 — 착수 비차단 | **resolved** — `ROOM_SNAPSHOT_VERSION` 1 + optional 필드(로더 `persist.ts:275-289` 미지 필드 무시) · seq 영속 = 블록 예약(`seqHigh = seq+K`, 재로드는 `seqHigh`부터 · R47-M3) |
| UK-2 | profile당 다중 relay(`local`/`win`) — seq는 relay별·룸별, 로그는 `roomId` 키 → relay 간 `roomId` 유일성 미확인 | 유일하지 않으면 `roomKey`에 relay 식별자 포함 — **R47 전 확인 권장** | **resolved** — `roomId` = 64 random bits(`codes.ts:13-21`) → relay 간 유일 · `roomKey`에 relay 식별자 불포함 |
| UK-3 | sticky host에 `onEnvelope` 없음 → 실제 접속 프로세스만 로그 | 공백 수용 vs sticky 상시 구독(책임 증가) — R47 판정 | **resolved** — 저장소는 `RelayClient` 옵션 opt-in · sticky host는 이 버전 opt-in 안 함 |
| UK-4 | seen 집합 N · clientEventId LRU N | **1024 / 256 (추정)** — 상수 한 곳 · 경계 테스트 고정 | **open, 비차단** — 출발값 유지 · 구현 중 조정 |
| UK-5 | 로그 append/fsync 실패·락 타임아웃 시 전달 정책 | fail-open + fail-visible(로그가 아직 판정 입력 아님) — R47 판정 | **resolved** — fail-open + fail-visible(카운터 + stderr) + 인메모리 B층 섀도 집합(R47-L2) · 프로세스 간 락 ≤250ms(R47-H1) |
| UK-6 | 같은 `clientEventId`·다른 본문 | 원래 결과 반환(본문 무시) vs 해시 불일치 `error`(신규 와이어 코드) — R47 판정 | **resolved** — 원래 결과 반환 · 신규 와이어 코드 없음 · relay가 본문 해시 불일치 카운터를 stderr에 기록 |

**Current decision:** D1~D5 아키텍트 락 · **R47 `approved-with-fixes` → H1·M1·M2·M3·L1·L2 PLAN 반영 → PLAN `approved`(2026-10-15, no R47b)** · R1~R4 수용 · UK-1·UK-2·UK-3·UK-5·UK-6 resolved · **UK-4 open(비차단)**. 구현 착수 = PATCH 1(tests-first red).

### herdr 0.7.5 / protocol 17 compatibility (**gate closed** · shipped through `6e2df8a` · Loom 0.28.1 release close)

| 분면 | 내용 |
|------|------|
| Known knowns | **호환 게이트 폐쇄.** Loom adapter protocol **17**, `HERDR_PROTOCOL_EXPECTED === 17`, shipped through **`6e2df8a`**. 시퀀스: tests-first `194d901` · client `c0fcc00` · bridge `1284eef` · coverage `e538cad` + 라이브 보정(launch readiness `848675f`/`5ac6d31` · named prompt target `edf3b59`/`48ecba3` · dogfood config migration `9f13b47`/`8ebfd11` · Fable collision-free name `1351add`/`6e2df8a`). 라이브 3종(claude/codex/grok) 스모크 통과. `dogfood:herdr` ok · `dogfood:up` exit 0. host 462/0. 정본 `docs/spikes/HERDR-0.7.5-COMPAT.md` verdict **shipped**. |
| Known unknowns | **UK-5..UK-9** (PLAN §0.28.1)는 **후속 관측**으로 잔존 — 착수/ dogfood를 막지 않는다: UK-5 `final_status`/`released` 실림 조건 · UK-6 비원자 제출 경로 재측정 · UK-7 `agent.wait`가 still-running 유예를 어디까지 대체할지 · UK-8 다중 노드 플러그인 user-global 영향 · UK-9 `agent_prompt_stalled` = 미제출 여부. |
| Unknown knowns | 라이브 실측으로 좁혀진 운영 지식: (1) `agent.start` ACK는 **`launch_pending`** 일 수 있고 launch barrier는 **`agent.get`→`interactive_ready`** 이며 `agent.wait` idle이 아님. (2) prompt/`send_keys` 타깃은 **exact agent name**(pane id 오배송 실측). (3) 이름 형식 exact `loom-${cardId}-${seq}` · fail-closed `agent_name_unrepresentable`. (4) persisted `herdrProtocol:16`은 migration 필요 — **config-only 17 bump는 여전히 우회 금지**. |
| Unknown unknowns | detect additive 필드가 후속 C 관측에 주는 장기 영향; 다중 노드에서 user-global 플러그인 재설치 누락 시의 증상 표면. |

**Current decision:** **compatibility gate closed · dogfood unblocked.** 오너 표준은 0.7.5/protocol 17. downgrade/병행 0.7.4 기각. adapter pending / dogfood blocked 서술은 폐기. 제품 공개 card/relay/conv/MCP 표면과 PANE-DEATH U1–U11 무변경. UK-5..UK-9는 후속 관측만.

### 0.26.0 — hooks 보조 센서 (claude 워커 상태 힌트 · 스파이크 최소 배선 5단계)

| Field | Value |
|-------|-------|
| **PLAN** | v0.26.0 (`pending-review`) |
| **Date** | 2026-07-20 |
| **Review** | R41 required (신규 config hook 주입 옵션 + 브릿지-로컬 소켓 리스너 = 신규 신뢰 경계; **경량 예상** — `inject-control` 선례·신규 wire/MCP 없음) |

| 분면 | 내용 |
|------|------|
| Known knowns | 스파이크 실측 확정분(정본 `docs/spikes/HOOKS-SENSOR-SPIKE.md`): (1) **3상태 hook 매핑** — 승인 대기=`Notification`(matcher `permission_prompt`)·턴 종료/유휴=`Stop`(또는 `idle_prompt`)·작업 시작=`UserPromptSubmit`/`SessionStart`, matcher로 승인 대기와 단순 유휴가 **깔끔히 분리**(승인만 골라 잡음). (2) **배선 지점 전부 기존재** — 스폰 훅포인트·argv 조립(`resolveAgentArgv`)·이벤트 합류부(`onCardHerdrEvent`)·still-running 유예 poll이 코드에 이미 있어 hookHint 우선 분기를 **얹기만** 함. (3) **fail-open exit 규약** — 관측 훅은 exit 2여도 워커 흐름 차단 불가 → 항상 exit 0, `UserPromptSubmit`/`SessionStart` stdout만 컨텍스트 주입 함정(비움 필수). (4) **`inject-control` 선례** — loomDir 0600 소켓 + `isPathUnderLoomDir` 가드·no_listener 폴백이 승인된 정본(여기선 방향만 역전 — 브릿지가 리스너/서버). 이득 empirical 입증 완료(2026-07-20, 근거 중~강 — 통증 2 승인 미탐지 정면). |
| Known unknowns | U1~U6(아래 표) — 전부 PLAN §0.26.0 Unknowns 요약. 요지: claude 워커 배포 버전의 hook 표면 실재·`--settings` 인라인 주입 실작동·소켓 리스너 생명주기·`Stop`↔유예 상호작용·서브에이전트 라우팅·계측 JSONL 회전이 라이브 실측 대상. |
| Unknown knowns | hook은 "훅이라서 신뢰"가 성립하지 않는다(워커/훅 스크립트가 emit — §2.5.2③) → 페이로드는 신뢰 입력이 아니라 **완료 힌트로만** 소비, 실제 결과 회수는 스크레이프 유지·본문 정본은 §5.1 artifact. hook 미주입/`no_listener`는 현행과 **판정·wire 관측 동작 동일**(fail-open, 회귀 0 — R41 L-2: "바이트 동일"은 D2가 모든 claude 스폰 argv에 `--settings`를 덧붙이고 D6 계측 append가 신규 부작용이라 문자 그대로는 성립 불가, "스폰 argv 주입·계측 append 제외" 스코프로 재정의) — 신규 판정 경로가 아니라 기존 판정에 우선 분기를 얹는 additive. |
| Unknown unknowns | 워커 claude 버전업 시 hook 이벤트/matcher 표면 변동(스파이크는 읽기-전용 조사라 라이브 미발화); 브릿지가 서버(방향 역전)로서 다수 워커 소켓을 장시간 watch할 때의 리소스·스테일 소켓 누적; hook 페이로드 경로가 여는 미지의 간접 프롬프트 주입 표면(stdout 함정 외). |

**Unknowns 요약 (정본 = PLAN §0.26.0):**

| # | 요지 | 무회귀 대비 |
|---|------|-------------|
| U1 | claude 버전별 matcher 지원 편차(`permission_prompt`/`idle_prompt`·팀 워커 matcher v2.1.198+) 미검증 | 미지원 버전 = hook 미발화 → D5 폴백으로 무회귀, 이득 발생 버전 실측 필요 |
| U2 | `--settings` 인라인 JSON 주입이 워커 claude에서 실제 hook 발화시키는지 라이브 미검증 | 인라인 JSON/파일/env 중 실작동 방식을 라이브 스모크로 확정 |
| U3 | 브릿지 소켓 리스너 잔여 정리-경합·unlink 시점 실측 (**R41 M-1로 축소 재정의** — 재-cardId 충돌 자체는 unknown 아님) | 소켓 = attempt(seq)-스코프 + bind 전 unlink + flight 소멸 시 close+unlink + 늦은 이벤트 flight 동일성 가드 드롭으로 D4 M-1 설계 폐쇄; 잔여 = 정리-경합·unlink 시점 세부 실측뿐 |
| U4 | `Stop` 힌트 ↔ still-running 유예 상호작용 (**R41 M-2 ④로 설계 폐쇄**) | `Stop`=poll 가속·상한 우회 입력만·완료 확정은 indicator-clear 스크레이프 확증 필수(AND 결합, 단독 완료 금지)로 D3 M-2 ④ 폐쇄; 잔여 = 이득 크기 실측뿐 |
| U5 | 서브에이전트 문맥 라우팅(`session_id`/`agent_id` 부모-자식 귀속) | 부모 카드 귀속 vs 별도 표면화 미정 |
| U6 | 계측 JSONL(D6) 회전·크기 상한 (0.24.1 룸 스냅샷 GC 후속 동계열) | 회전/상한/GC 정책 미정 |

**Next:** R41 완료(2026-07-20 — `pending-review` → author-close `approved`, M-1·M-2 lock 반영 + L-1..L-3 author-close, no R41b) → approved 후에만 구현(레인 위임). **U3·U4는 R41 M-1·M-2 ④로 설계 폐쇄**(잔여는 정리-경합·이득 크기의 라이브 실측뿐). 라이브 스모크로 **U1**(버전별 matcher 발화)·**U2**(`--settings` 인라인 주입 실작동)를 해소하고 실측 결과를 PLAN `Implemented` 블록에 명기.

### 0.24.2 — Windows 실배포 결함 2건 (persist 경로 가드 구분자 오탐 + 메시지 핸들러 uncaught 크래시)

| Field | Value |
|-------|-------|
| **PLAN** | v0.24.2 (`pending-review`) |
| **Date** | 2026-07-19 |
| **Review** | R39 required (보안·신뢰 경계 — 경로 가드 계약 변경; PATCH여도 필수) |

| 분면 | 내용 |
|------|------|
| Known knowns | 결함 근인 2건 코드 대조 확정: (1) `persist.ts:389` 가드 `path.startsWith(realState + "/")`가 POSIX `"/"` 하드코딩 — `roomStatePath`(`persist.ts:67-69` `join()`)의 Windows 백슬래시 경로와 불일치해 **모든 스냅샷 쓰기 거부**(0.14.x부터 잠복, Windows relay가 0.24.1 전까지 항상 ephemeral이라 미발화·유닛은 POSIX 전용). `path`는 realState 파생이라 **구분자만이 유일 실패 모드**. (2) `room.ts:751` create의 fail-closed rethrow가 `server.ts:176` `handleMessage` 호출부(ws message 콜백)에 try/catch 부재 → uncaught → **bun 프로세스 종료**(나쁜 create 1건 = 서버 전멸). 기존 개별 op catch는 `server.ts:317·392·485·510`(handleMessage 내부 회신·비-rethrow). 라이브 실증: v0.24.1 Windows 재배포 후 첫 room create에서 relay 사망 2회 재현·err.log 스택 `Snapshot path escapes state dir` 포집. |
| Known unknowns | (1) D2 가드(message 콜백 외곽 전역 방어) 외 다른 op의 persist 경유 추가 uncaught 표면 — op별 실패 UX(무응답 vs 명시 error envelope) 차이. (2) 대소문자/8.3 단축 경로 변형이 `realpathSync` 산출에 섞일 가능성(파생-경로 구조상 무해 논증이나 Windows 실기 확인은 배포 후). |
| Unknown knowns | 가드 교정은 **신규 정책이 아니라 기존 계약의 크로스플랫폼 복원** — `node:path`의 `sep`는 join과 짝을 이루는 정본 구분자이며, POSIX 판정은 문자 그대로 불변(`sep === "/"`). "가드 완화"가 아니라 "Windows에서만 깨져 있던 정상 판정의 복구". |
| Unknown unknowns | Windows 고유 FS 의미론(파일 잠금·안티바이러스의 rename 간섭)이 원자쓰기/스냅샷 경로에서 후속 발화할 가능성; ephemeral→durable 전환으로 Windows 팀 relay에 처음 디스크 쓰기가 실제 발생하며 드러날 미지의 경로/권한 상호작용. |

**Next:** R39(claude-rev + fable-advisor 필수) → approved 후에만 구현(레인 위임). 라이브 스모크 = Mac 로컬(0.24.1 절차 재사용) + Windows 재배포 라이브(room create 성공→스냅샷 생성→Task 재시작→룸 생존). 이 웨이브가 0.24.1 유예분(Windows 재로그온 룸 유지)을 완결.

### 0.24.1 — relay 룸 영속화 배선 갭 (`loom relay` 포그라운드 durable)

| Field | Value |
|-------|-------|
| **PLAN** | v0.24.1 (`pending-review`) |
| **Date** | 2026-07-19 |
| **Review** | R38 required (보안·신뢰 경계 — peerSecret 평문 스냅샷의 적용 범위 확대; PATCH여도 필수) |

| 분면 | 내용 |
|------|------|
| Known knowns | durable 경로 전 체인이 기구현·정상 — 영속화(`persist.ts` RoomSnapshotV1)·기동 복원(`room.ts:687` `loadFromDisk`→`:709-732`, 초대코드 byCode `:720`·`:730`)·멤버십/secret 복원(`room.ts:102-151`, M-22/M-7)·M-23 락(`room.ts:682` acquire·`:691-696` close). 로컬 데몬 durable 실측(`~/.loom/relay-state` 3스냅샷·15:00 갱신). relay 재시작 룸 소실 4회가 **전부 포그라운드 경로**(`index.ts:3204` 무-registry `RelayServer`). durable 배선 정본은 `relay/cli.ts:38-80`(데몬 CLI). |
| Known unknowns | (1) Mac에서 로컬 데몬 relay 구동 중 `loom relay` 포그라운드 실행 시 기본 stateDir(`~/.loom/relay-state`) 충돌 → M-23 락 fail-closed 발화 빈도가 운영상 수용 가능한지(escape hatch 2종 `LOOM_RELAY_EPHEMERAL`·`LOOM_RELAY_STATE_DIR`로 대응). (2) Windows(NTFS)에서 chmod 0600·mkdir 락 의미론 — 코드는 chmod try/catch fail-safe 기확인(`persist.ts:216-220`), 락은 mkdir 원자성이나 Windows 실검증은 배포 후로 유예. |
| Unknown knowns | "Production durable ON by default"가 이미 제품 방침(`relay/cli.ts:41` 주석) — 포그라운드도 그 방침의 적용일 뿐, 신규 정책 결정이 아니다. |
| Unknown unknowns | 스냅샷 무한 누적의 장기 영향(GC 부재 — `maybeGc` no-op `room.ts:765-767`, D7 후속); 두 relay 프로세스가 서로 다른 stateDir로 같은 포트를 경합하는 배치 오류류. |

**Next:** R38(claude-rev + fable-advisor 필수) → approved 후에만 구현(레인 위임). 라이브 스모크 = `loom relay` 포그라운드 durable 왕복(룸 생성→SIGTERM→재기동→초대코드 join). Windows 실증은 오너 배포 후 유예.

### 0.23.0 — conv 멀티턴 수직 슬라이스

| Field | Value |
|-------|-------|
| **PLAN** | v0.23.0 (`pending-review`) |
| **Date** | 2026-07-18 |
| **Review** | R25 required (새 MCP 표면 4도구 + M-1/M-2 신뢰 경계 집행 코드 + 프로토콜 인접) |

| 분면 | 내용 |
|------|------|
| Known knowns | `docs/CONV_SPEC.md`가 R24 author-close로 `approved`(M-1 conv↔peer pin·M-2 artifact ref 검증 규약 locks 반영 + L-1..L-5 완료); 0.22.0이 herdr 연결점(데몬·dispatch/done 컨트랙트·M-1 dispatcher 인가·M-2 제출 분리)을 이미 검증·shipped; `card-contract.ts`/`bridge-runtime.ts`/`herdr-client.ts` 선례가 conv 계약·브릿지 확장의 미러 대상; relay 와이어 protocol v1 무변경 원칙(attachment 컨벤션만)이 0.22.0에서 실증됨; 오너가 conv 멀티턴 트랙을 명시 승인(HANDOFF.md, 2026-07-18). |
| Known unknowns | (1) `conv_await` 블로킹의 MCP 클라이언트별 tool-call 타임아웃 상호작용 — 실측 필요(CLI마다 타임아웃 편차 가능); (2) 워커 pane 수명과 conv 수명 불일치 — pane이 죽으면 conv는 pause인가 abort인가(CONV_SPEC 미명시); (3) 32k 임계 판정과 herdr pane 스크레이프 기반 요약 회신의 정합 — `pane.read` 단발 회수가 실시간 턴 크기를 정확히 반영하는가; (4) artifact fetch 명령 "제시"의 UX 표면 — 워커 CLI 프롬프트 노출 vs 사람 승인 큐(미정, 자동 실행은 비-스코프로 확정됐으나 제시 방식은 미정). |
| Unknown knowns | M-1 pin과 M-2 검증 함수 둘 다 "이미 존재하는 집행 원시(fromPeerId 서버 지정)를 코드로 옮기는" 성격 — R23 locks 구현 경험(allowlist·제출 분리)이 그대로 이전 가능할 가능성이 높으나 conv의 다턴 특성(pin이 대화 전체 수명 동안 유지)이 카드 dispatch의 1회성 인가와 실제로 동형인지는 구현 중 확인 필요. |
| Unknown unknowns | conv 세션 상태(pin·last-seen turnSeq·한도 카운터)의 영속화 경계 — 타워 재시작 시 진행 중 conv의 pin/seq 상태가 살아남아야 하는지 스펙이 명시하지 않음; 브릿지 측 herdr `agent send` pane 주입이 다턴 대화에서 반복될 때 pane 상태 누적(컨텍스트 오염)의 실제 동작은 0.22.0 단발 dispatch에서 검증되지 않은 영역. |

**Next:** R25(claude-rev + fable-advisor 필수) → approved 후에만 구현(레인 위임). CONV_SPEC과 충돌 발견 시 PLAN 0.23.0의 "R25 질의"에 기록하고 구현 보류.

### 0.22.0 — Loom×Herdr 노드 브릿지 (수직 슬라이스)

| Field | Value |
|-------|--------|
| **PLAN** | v0.22.0 (`pending-review`) |
| **Date** | 2026-07-17 |
| **Review** | R23 required (새 데몬 표면 + MCP 표면 확대 + 원격 프롬프트 주입 신뢰 경계) |

| 분면 | 내용 |
|------|------|
| Known knowns | handoff는 durable inbox로 전달 보장(persist fail-closed); peerSecret rejoin(M-7); 데몬 관례 완비(메타 사이드카·Bearer IPC·M-27 안전 stop); work-bus `[GOAL]`/`[DONE]` 태그 dispatch 선례; **Step 0 go** — WSL→Windows relay는 Win10 NAT 게이트웨이 IP 경로(health `version:1` + join 왕복 실측); **Step 0.5 go** — herdr v0.7.4 NDJSON 소켓 표면 실측 + fixture 고정(보정 C1–C3 설계 반영) |
| Known unknowns | (1) 장기 `events.subscribe` 구독 안정성 — 절단 시 재구독·이벤트 유실·at-most-once dispatch 보장(재연결 순서 ①재핸드셰이크→②재구독→③스냅샷 reconcile로 설계, 실증 미완); (2) inbox 100건 trim vs 장기 오프라인 브릿지의 카드 유실 허용 여부; (3) 워커 pane 자동 제출이 M-2와 별도 신뢰 모델로 승인 가능한가(R23 판단); (4) 브릿지 AgentKind — `bridge` enum 확장 vs `shell` 유지(슬라이스는 shell, 확장은 와이어 인접이라 별도 게이트); (5) 실제 Claude/Codex detection이 `done`을 언제 emit하는가(Step 0.5 잔여 — 배시 프로브만 검증됨) |
| Unknown knowns | herdr `done` 롤업의 정확도 — 에이전트가 정말 끝났는가 vs idle 오판(PTY spike의 idle 감지 교훈이 이 경계에도 적용될 것); "이벤트에 출력 본문 없음 = 백프레셔 설계"라는 권고 문서 해석의 타당성 |
| Unknown unknowns | WSL 절전·Windows 재부팅 시 브릿지/소켓 생존(Step 0 ⑥ 30m soak 생략됨); herdr AGPL 결합 경계가 배포 형태에 따라 달라지는 지점; Bun WS 클라이언트 장시간 연결의 미지 동작; herdr pre-1.0 와이어 변동(protocol 16 기준 fixture 고정으로 완화) |

**Next:** R23(claude-rev + fable-advisor 필수) → approved 후에만 구현(레인 위임). fake herdr는 `docs/spikes/fixtures/herdr-v0.7.4/` 고정.

### 0.21.0 — PTY handoff inject (pending-review R22)
| 분면 | 내용 |
|------|------|
| Known knowns | 기반코드 존재(`handoff-inject.ts` `prepareInjectText`/`injectIntoStdin` experimental); PTY 실행 래퍼(`run-with-pty.py`); R1이 default no-go·opt-in deferred로 판정; 안전조건 3개(idle+accept+opt-in) 이미 정의됨 |
| Known unknowns | **에이전트 유휴 감지 방식**(Claude hooks vs 출력 quiescence 휴리스틱, 오탐 처리); 제어 채널(named pipe/unix socket/sticky RPC/fd); accept→inject 구동 위치(`loom run` vs sticky host) |
| Unknown knowns | 주입 텍스트를 에이전트가 실제 사용자 입력으로 처리하는지(Phase 1.5 수동 매트릭스 미완 — Claude Code부터 채움); busy-중 주입의 실패 양상이 에이전트별로 다를 수 있음 |
| Unknown unknowns | Claude Code 버전업 시 hooks/TUI 동작 변화; PTY 래퍼(python)와 Bun 프로세스 간 신호/소유권 경합; 주입이 에이전트 세션 상태를 오염시키는 미지 경로 |

### 0.20.0 — Tier A3 `loom doctor` 자가진단 (pending-review)

| Field | Value |
|-------|--------|
| **PLAN** | v0.20.0 (`pending-review`) |
| **Date** | 2026-07-11 |
| **Review** | R21 required (새 CLI 서브커맨드 표면). **구현은 다음 세션** |

| 분면 | 내용 |
|------|------|
| Known knowns | 진단 표면 다 존재: `Bun.which`/loomCmd(install), `loomDir`/`getActiveProfile`(home), `loadSession`(session), `parseRelayUrl`/`isLoopbackHost`+`/health`(relay), `resolveLiveHostMeta`/`describeHostMeta`/`stickyRpc`(host). Docker 하네스가 실패 모드(PATH·unzip·loopback) 이미 노출. |
| Known unknowns | (1) exit code 계약 — 항상 0 vs `fail`시 non-zero vs `--strict`. (2) `/health` 프로브 타임아웃(오프라인 relay 매달림 방지). (3) 세션 없음(설치 직후) 첫 실행 출력이 유용한가. (4) read-only 보장 — auto-host 절대 안 띄움. |
| Unknown knowns | 낯선 사람은 "무엇이 틀렸는지"가 아니라 "다음 한 걸음"을 원함 → 각 fail에 조치 힌트 필수. |
| Unknown unknowns | 비표준 셸/컨테이너/CI에서의 health GET 동작·타임아웃, describeHostMeta가 stale pid를 live로 오판하는 경계. |

**Next session:** R21 → 0.20.x implement(`cmdDoctor` + dispatch + 테스트) → docs.

### 0.19.0 — Tier A1 5분 설치 경로 install script (pending-review)

| Field | Value |
|-------|--------|
| **PLAN** | v0.19.0 (`pending-review`) |
| **Date** | 2026-07-11 |
| **Review** | R20 required (새 표면 + `curl\|bash` 신뢰 경계) |

| 분면 | 내용 |
|------|------|
| Known knowns | repo PUBLIC(익명 clone 가능). blob이 relayUrl+token 운반(0.18.0). `bun link`는 이미 있으나 `link-loom.sh`는 PATH 안내만 출력하고 종료. Bun 공식 installer(`bun.sh`) 위임 가능. |
| Known unknowns | (1) **PATH 활성화**(판정 리스크) — curl\|bash는 호출자 셸 못 바꿈 → 절대경로 검증 + rc append + `exec $SHELL` 안내로 충분한가. (2) shell rc 감지(bash/zsh/fish, 멱등). (3) 고정 clone 디렉토리 + 기존 충돌 시 update vs 거부. (4) 재실행 멱등성. (5) `curl\|bash` 핀 — main vs 태그(공급망). |
| Unknown knowns | 낯선 사람은 4개 수동 실패점 중 첫 하나에서 멈춘다 — 스크립트가 그 판단을 대신 내려줘야 함. |
| Unknown unknowns | Bun 설치 실패(네트워크·권한)·기존 다른 버전 Bun 충돌·비표준 셸 환경에서의 rc 위치. |

**Next session:** R20 → 0.19.x implement(install.sh + README + `loomCmd` 스윕) → tests → docs.

### 0.17.0 — Launcher UX up / host-default (pending-review)

| Field | Value |
|-------|--------|
| **PLAN** | v0.17.0 (`pending-review`) |
| **Date** | 2026-07-10 |
| **Review** | R18 required; **next session implements after approve** |

| 분면 | 내용 |
|------|------|
| Known knowns | sticky already daemonizes (unref). Multi-profile = multi session file. Work bus ships 0.16. dogfood-room-up exists for join only. |
| Known unknowns | (1) dogfood:up vs loom up naming — plan: both (script + CLI). (2) Auto-host on every join may surprise headless CI — plan: LOOM_NO_AUTO_HOST + --no-host. (3) Whether --watch on up is default — plan: **opt-in only**. |
| Unknown knowns | Users think host = open terminal; education + up removes the confusion. |
| Unknown unknowns | Orphan hosts after crash; down must be robust via meta.pid. |

**Next session:** R18 → 0.17.x implement → tests → docs.

### 0.16.0 — Work bus board notify + loom work (pending-review)

| Field | Value |
|-------|--------|
| **PLAN** | v0.16.0 (`pending-review`) |
| **Date** | 2026-07-10 |
| **Review** | R17 required |

| 분면 | 내용 |
|------|------|
| Known knowns | Handoff is delivery SSOT (durable, notify when online). Board is local file. Receive path is pull (`check_handoffs`). No CRDT. 0.15 tags/purpose exist. |
| Known unknowns | (1) Default notify-on-assignee vs require `--notify` — plan locks **default on when --as set**. (2) watch poll vs sticky events — plan locks **poll v1**. (3) Re-assign spam if assign called twice — plan: one handoff per assign call. |
| Unknown knowns | Users think “board = work queue”; without bridge they are wrong. |
| Unknown unknowns | Flood of notify if scripts loop board add; mitigate with docs + no notify on status-only updates. |

**Next:** R17 → implement or pending-revision locks only.

### 0.15.0 — Purpose-based sprint 1 (pending-review)

| Field | Value |
|-------|--------|
| **PLAN** | v0.15.0 (`pending-review`) |
| **Date** | 2026-07-10 |
| **Review** | R16 required before implement |

| 분면 | 내용 |
|------|------|
| Known knowns | Handoff is pull (`check_handoffs`/`claim`); no PTY inject. Board/pack are room-scoped local 0600 files. Dogfood roles impl/reviewer exist as docs+profiles. Wire v1 frozen for this sprint. |
| Known unknowns | (1) MCP `set_purpose` vs CLI-only for v1 — plan includes both. (2) Whether `--with-purpose` is attachment vs body section — impl free if sanitize+caps. (3) `loom verify` cwd = process.cwd() vs session-bound path — plan: process cwd at invoke. |
| Unknown knowns | Reviewers ignore stderr handoff banners; only first-prompt + MCP pull works in practice. |
| Unknown unknowns | Agents ignoring hints still; purpose file races multi-profile same UID (accept like board); verify recipe abuse if agent can set_purpose then verify — residual local UID trust. |

**Next:** R16 → if approved implement; if pending-revision only Open locks.

### 0.14.0 — P2 durable relay inbox/roster (pending-review)

| Field | Value |
|-------|--------|
| **PLAN** | v0.14.0 (`pending-review`) |
| **Date** | 2026-07-10 |
| **Review** | R15 required before implement |

| 분면 | 내용 |
|------|------|
| Known knowns | Today: `Room.inboxes` + `members` in memory only (`packages/relay/src/room.ts`); restart loses handoffs. Board/pack already use atomic JSON + 0600 under `~/.loom`. M-7 peerSecret must survive with roster. Protocol v1 / claim first-wins / leave-drops-inbox stay. Caps L-11/L-16 stay. |
| Known unknowns | (1) Sync write every mutation vs short debounce — plan prefers **sync** for simpler durability proof. (2) Whether auto-daemon (`ensureLocalRelay`) needs explicit `LOOM_RELAY_STATE_DIR` or just default home. (3) Disk growth if rooms never left — accept until GC backlog. (4) Exact placement of atomic helper (relay-local vs lift from host) — plan: **relay-local `persist.ts`** to avoid host↔relay cycle. |
| Unknown knowns | Operators expect “restart relay ≠ lose handoffs” once dogfood documents it; empty inbox after restart is a trust-break. |
| Unknown unknowns | Multi-host same NFS path; crash mid-rename on exotic FS; very large attachment spam filling disk despite caps; partial write if chmod fails on Windows (out of primary dogfood). R15 should probe fail-open vs fail-closed on load errors. |

**Next:** R15 on PLAN 0.14.0 → if approved, implement; if pending-revision, only Open blocking.

### 0.11.1 — M4.3b Tauri shell (plan locked)

| Field | Value |
|-------|--------|
| **PLAN** | v0.11.1 (`approved`) |
| **Date** | 2026-07-09 |

| 분면 | 내용 |
|------|------|
| Known knowns | sticky RPC status/peers/inbox/claim; loopback; M-18 **C** no Board v1; M-19 Rust invoke + session order; M-20 textContent-only |
| Known unknowns | Tauri 2 monorepo layout polish; macOS signing later; multi-window |
| Unknown knowns | desktop visual taste — optional mock during implement |
| Unknown unknowns | (closed for plan) board gap, CORS, sanitize≠HTML — locked in 0.11.1 |

**Next:** implement `apps/desktop` under 0.11.1. Board UI = later gate.

### 0.11.0 — superseded

R13 pending-revision material; see plan_review R13 + PLAN 0.11.1.

---

## Changelog

| 날짜 | 내용 |
|------|------|
| 2026-07-09 | 초안 + 0.11 stub |
| 2026-07-09 | R13 fill; 0.11.1 locks |
| 2026-07-10 | 0.14.0 P2 durable inbox unknowns |
| 2026-07-10 | 0.15.0 purpose-based sprint 1 unknowns |
| 2026-07-10 | 0.16.0 work bus unknowns |
| 2026-07-10 | 0.17.0 launcher UX unknowns |
| 2026-07-17 | 0.22.0 Loom×Herdr 노드 브릿지 unknowns (Step 0/0.5 go 반영) |
| 2026-07-18 | 0.23.0 conv 멀티턴 수직 슬라이스 unknowns (CONV_SPEC R24 approved 반영) |
| 2026-07-19 | 0.24.1 relay 룸 영속화 배선 갭 unknowns (`loom relay` 포그라운드 durable) |
| 2026-07-20 | 0.26.0 hooks 보조 센서 unknowns (U1~U6 요약 + 스파이크 실측 Known knowns · `pending-review` R41) |
| 2026-10-15 | 0.29.0 룸 이벤트 seq + 안정 id unknowns (UK-1~UK-6 요약 + 코드 실측 Known knowns · `pending-review` R47) |
| 2026-10-15 | 0.29.0 R47 판정 반영 (UK-1/2/3/5/6 resolved · UK-4 open 비차단 · PLAN `approved`) |
| 2026-10-15 | 0.30.0 헤드리스 카드 워커 unknowns (UK-1~UK-9 요약 · UK-5 차단 · 프로브 실측 Known knowns · `pending-review` R48) |
| 2026-10-15 | 0.30.0 R48 판정 + 후속 실측 반영 (UK-1/3/5/8/9 resolved · UK-2/4/6/7 open 비차단 · PLAN `approved`) |
| 2026-10-15 | 0.31.0 스킬 materialize + policy.json 번역 unknowns (UK-1~UK-7 요약 · 전부 비차단 · 프로브 실측 Known knowns · `pending-review` R49) |
| 2026-10-15 | 0.31.0 R49 판정 반영 (UK-1 → P2 deny 경로 차단 · UK-6 비차단 유지(D13 기본 true) · UK-7 메커니즘 명시 · PLAN `approved`) |
| 2026-10-15 | 0.31.0 UK-1 실측 resolved (`SKILLS-POLICY-PROBE.md` §G — grok `Bash(p *)` 맨 명령 미차단 → 이중 형식 유지 · claude `p*` 과매칭 → `p*` 형 금지) |
| 2026-10-15 | 0.31.0 ship 반영 (UK-5 resolved — §H `--settings` MCP deny = 툴 숨김·신호 없음 · UK-7 resolved — dist에 내장 스킬 포함 · UK-2/3/4/6 open 비차단) |
| 2026-10-16 | 0.32.0 Loom MCP 사전 점검 unknowns (UK-1~UK-5 요약 · 전부 비차단 제안 · 코드 실측 Known knowns · `pending-review` R50) |
| 2026-10-16 | 0.32.0 R50 판정 반영 (UK-5 → M2 실측으로 제외 · UK-1~UK-4 open 비차단 · PLAN `approved`) |
| 2026-10-16 | 0.32.0 ship 반영 (UK-1·UK-3·UK-4 resolved — `MCP-PRECHECK-SMOKE-0320.md` · UK-2 resolved — P3 조사 · 정직 표 codex 행 정정) |
| 2026-10-16 | 0.33.0 bridge 생명주기 보강 unknowns (UK-1~UK-4 요약 · UK-1~UK-3 비차단 제안 · UK-4 실측 — bridge 경로 `ensureRelay` 미호출 · `pending-review` R51) |
| 2026-10-16 | 0.33.0 R51 판정 반영 (UK-4 resolved · UK-1~UK-3 open 비차단 · M1·M2·M3 교훈 Unknown knowns 기재 · PLAN `approved`) |
| 2026-10-16 | 0.33.0 ship 반영 (UK-1 resolved — P2 + `BRIDGE-LIFECYCLE-SMOKE-0330.md` · UK-2 macOS resolved / Linux 미실측 · UK-3 resolved-by-decision — 600초 유지) |
| 2026-10-16 | 0.34.0 `loom service` unknowns (UK-1~UK-5 요약 · 전부 비차단 제안 · 코드 실측 Known knowns · `pending-review` R52) |
| 2026-10-16 | 0.34.0 R52 판정 반영 (UK-1~UK-5 open 비차단 · M1·M2·M3·L2 교훈 Unknown knowns 기재 · PLAN `approved`) |
| 2026-10-16 | 0.34.0 ship 반영 (UK-2 partly observed — 프로브 사고 알림 · UK-1 · UK-3 open — 라이브 not run(오너 승인 대기) · UK-4 · UK-5 unverified — Linux 미사용 · `SERVICE-SMOKE-0340.md` · R52-L1 `envRelayToken()` 문면 정정) |
| 2026-10-16 | 0.35.0 ship 반영 (UK-1~UK-5 open 비차단 · UK-6 unverified — Windows 미사용 · `MEMORY-SMOKE-0350.md` 18/18 · P4b `redact.ts` O(n²) 실측·선형화) |
| 2026-10-16 | 0.36.0 ship 반영 (UK-1 가짜 CLI 바이트만 실측 · 실 CLI 0 · UK-2 `load_ms` 중앙값 16–17 / 최대 24–25 ms(2회) 실측 · UK-3~UK-5 open · UK-6 13/13 + 스모크 ⓪ · UK-7 unverified — Windows 미사용 · `MEMORY-INJECT-SMOKE-0360.md` 7/7) |
| 2026-10-17 | 0.37.0 정책 정직성 unknowns (UK-1~UK-7 요약 · UK-1 기본 켜짐 안내문 실 CLI 미검증 = R55 판정 요청 · 코드 실측 Known knowns · C1~C4 · R55 approved-with-fixes → UK-1 ship 차단(오너 승인 · 실 CLI ① 한정 1회) · UK-2~UK-7 비차단 · UK-6 영구 경고) |
| 2026-10-17 | 0.37.0 implemented 반영 (UK-1 실 CLI ① 4/4 PASS — 응답 `"ok"` ×3 · UK-2 관찰만 · UK-3 미측정 · UK-4 블록 63577–63978 B · 첫 턴 63766–64167 B · UK-5 `load_ms` 중앙값 18–20 / 최대 19–26 ms · UK-6 기본 간극 1(기본 설정) vs 6(모두 dispatch 가능) · UK-7 unverified · `POLICY-HONESTY-SMOKE-0370.md`) |
| 2026-10-17 | 0.37.0 shipped (ship 검사 green · 최종 리뷰 loom-advisor Opus 5.5 high = ship · UK 상태 변화 없음) |
| 2026-10-17 | 오너 승인 라이브 스모크 2건 반영(dist v0.37.0 · macOS만) — 0.36.0 `smoke:memory-inject --real-cli` 4/4 PASS(UK-1 작은 펜스 실 CLI 수용 · ≈48 KiB 미측정 · UK-3 CLI당 표본 1 PASS) · 0.34.0 `smoke:service --live` 7/7 live pass(UK-1 bootout → `stopped` 215 ms · UK-2 `print-disabled` (none) · UK-3 GUI 세션이라 ssh 미실측 · UK-4/UK-5 Linux unverified 유지) · 전부 open 비차단 유지 |
| 2026-10-17 | 0.38.0 기억 쓰기 경로 unknowns (UK-1~UK-7 요약 · UK-1 새 스킬 문면 실 CLI 미검증 · 코드 실측 Known knowns · C1~C6 · R56 approved-with-fixes → UK-1 ship 차단(오너 승인 · 실 CLI ① 한정 1회 + 세 카드 `notes.md` · 적어도 한 카드 `proposed ≥ 1` — R56-M4) · UK-2~UK-7 비차단 · UK-6 unverified) |
| 2026-10-18 | 0.41.0 헤드리스 워커 프롬프트 기록 + `loom prompt show` unknowns (UK-1~UK-5 요약 · 전부 비차단 제안 · UK-4 claude/grok 시스템 채널 수신 효과 = 0.43 착수 전 차단 후보 · C1~C3 · `pending-review` R60) |
| 2026-10-18 | 0.42.0 섹션 manifest + 단일 조립기 · 기록 v2 unknowns (UK-1~UK-5 요약 · 전부 비차단 제안 · 0.41.0 UK-2 · UK-4 승계 · C1~C3 · `pending-review` R61) |
