# Phase 3 착수 명세 — JIT append-only 실주입 (후보 A)

작성 2026-07-28 · **rev-1** · 레인: 본세션(topology `single`)  
Authority: [`RULE-ROUTER-PROPOSE.md`](./RULE-ROUTER-PROPOSE.md) §5.3(approved)·§7 Phase 3 ·  
[`RULE-ROUTER-REVIEW-rev-13.md`](./RULE-ROUTER-REVIEW-rev-13.md) ·  
F1 / F1b / F1d / F1e 결과 · 후보 A (`ROUTER_VERSION = A-1`)

> **이 문서가 Phase 3 착수를 연다.** §5.3 문안 승인만으로는 구현 권한이 없다(REVIEW-rev-13).  
> **구현 전 선결:** [`RULE-ROUTER-PHASE3-PREREG.md`](./RULE-ROUTER-PHASE3-PREREG.md) **커밋 봉인**.  
> 봉인 전 라이브 주입 코드 **금지**.

---

## 0. 한 줄

**Claude Code 하네스에서만**, 후보 A가 고른 **저위험 surface 유닛**을 PreToolUse
`additionalContext`로 **append-only** 얹는다. 합격 기준은 전달이 아니라 **준수 카나리아**.
충돌 시 사용자를 이긴다고 주장하지 않는다.

---

## 1. 범위

| In | Out |
|---|---|
| Claude Code · PreToolUse 비차단 주입 (F1 YES · C1–C3) | Codex/Grok/직접 CLI (`NOT_APPLICABLE` · 전량 리추얼) |
| 후보 A 결정 재사용 (`rule-router-eval` / registry triggers) | 후보 B/C · bake-off 재개 |
| 저위험 surface **순서 고정**(§2) | prefix 축소(Phase 4) · 모드 노브 제품화 |
| 준수 카나리아 게이트(PHASE3-PREREG) | 임의 토큰 · 문자열-포함 준수 · U2 출처 처방 |
| opt-in 플래그 뒤 단계적 enable | 전 세션 강제 기본 on (3.0에서 금지) |

**Harness claim:** Claude Code only (rev-5 §2-3).

---

## 2. Surface 순서 (고정 · 변경 시 재명세)

Phase 3는 **한 surface씩** 연다. 다음 surface는 이전 surface의 준수 카나리아 **통과 후**만.

| Step | Surface | Matcher (초안) | 1차 유닛 집합 (non-pin 우선) | 비고 |
|---|---|---|---|---|
| **3.0** | `delegation` | `Agent\|Task` | `orch.model-explicit`(H·guard) · `orch.session-ritual`(G) · `orch.lane-placement`(G) · `agents.impl-delegation`(G) · `traps.grok-readonly`(A) | B1/B3 “기억해서 로드”의 직접 자리. **pin J 유닛은 JIT 대상 아님**(이미 pin 정책). |
| **3.1** | `ship` | Bash/Edit 계열 중 **커밋·테스트 키워드 게이트** 또는 명시 ship 훅 | `agents.verify`(A) · `traps.bun-test-env`(A) | `agents.commit-push`는 **pin J** → JIT 불필요. |
| **3.2** | `dispatch` | 디스패치 도구/스크립트 표면 (정의는 3.1 통과 후) | traps + orch watch/card-done 계열 | pane/브릿지 인접 — 3.0보다 위험. |
| **3.3** | `implementation` | Bash(·Edit) · env/구현 키워드 (정의: PHASE3.3-SPEC) | `agents.env`(canary) · `traps.fake-herdr-status` | **T1 FAIL** · live blocked (RESULT) · PREREG 재측정 금지. |
| **3.4** | `platform` | Bash · check:mem-header 등 (PHASE3.4-SPEC) | `traps.claude-mem-patch`(canary) | **3.3 교훈** · non-secret command COMPLY. |
| **3.5+** | 기타 | 미개방 | — | verification/review/gate는 prefix·리추얼이 1차. |

**3.0 예산:** 한 주입 이벤트 합 **10,000자 미만**(C3). 초과 시 **자르지 않고 전체 스킵**(fail-closed to no-JIT) + 로그.  
`orch.lane-placement` 단독 734자라 여유 있음; 합집합이 넘으면 **등급 가중 낮은 것부터 탈락**(H 유지 우선 · A 먼저 탈락).

---

## 3. 주입 계약 (불변)

1. **경로:** `hookSpecificOutput.additionalContext` · `exit 0` (도구 비차단). 기존
   `check-agent-model.ts` **deny 경로와 분리** — 라우터 훅은 절대 exit 2로 업무를 죽이지 않는다
   (model 강제는 현행 훅 유지).
2. **C1:** 모델 가시 = `tool_result` 동봉 이후. **그 호출을 교정한다고 문서·로그에 쓰지 않는다.**
3. **C2:** 서브에이전트 요청 본문 미도달 — 주입 대상은 **부모 세션** 규범. 스폰 goal에 규칙을
   심는 설계 **금지**.
4. **C3:** 1이벤트 10k 미만 · 초과 = 스킵.
5. **Append-only:** prefix/SessionStart 산출을 수정·삭제하지 않는다.
6. **본문 SSOT:** 레지스트리에서 **추출기로 본문 추출**(P5). 훅 안에 규칙 문자열 하드코딩 금지.
7. **Receipt:** 매 주입 `unit ids · sha8 · chars · surface · router_version · skipped_reason?` JSONL
   (`~/.loom/rule-router/jit-receipts/`).

---

## 4. 충돌 탐지·회피 (구현 경계)

Authority: §5.3.4 + REVIEW M-1.

### 4.1 의무 (MUST)

| # | 규칙 |
|---|---|
| C-1 | 같은 턴 사용자 발화가 **명시적으로 요구하는 출력 형식·절차**와 **경쟁하는 유닛**을 주입하지 않는다. |
| C-2 | 충돌 판별이 **불확실**하면 그 유닛을 **넣지 않는다**(회피). “일단 넣고 모델이 고르게” 금지. |
| C-3 | **pin/전량**은 충돌 회피가 **아니다**(M-1). pin 유닛을 “충돌 회피용”으로 JIT에 싣지 않는다. pin은 SessionStart/전량 정책 몫. |
| C-4 | 라우터는 “주입이 사용자를 이긴다”고 **로그·문서·카나리아에서 주장하지 않는다.** |

### 4.2 3.0에서 구현하는 탐지 (최소 · 결정론)

사용자 발화 = PreToolUse 입력의 최근 유저 텍스트(훅 페이로드에서 가용한 범위; 없으면
**보수적으로 유닛 축소** 또는 스킵).

| 신호 | 동작 |
|---|---|
| 발화에 출력 형식 강제 (`한 문장`, `one sentence`, `표로만`, `JSON only` 등 사전 목록) | **형식 규범 유닛 전부 스킵** (3.0 유닛에는 해당 적음 — 목록은 PREREG/코드 상수) |
| 발화가 `model`/`서브에이전트` 없이 순수 질문만 | delegation 유닛 스킵 가능(트리거 미매칭이면 A가 이미 비선택) |
| 도구가 `Agent\|Task`가 아님 | 훅 no-op |

**3.0은 형식-경쟁 유닛을 싣지 않으므로** C-1의 실효 표면이 좁다. 의도: 첫 슬라이스는
**프로세스 규범**(model 명시·레인·리추얼)이라 사용자 콘텐츠 형식과 거의 안 싸운다.

### 4.3 3.0에서 **하지 않는 것** (명시적 Out)

- LLM으로 “이 규칙이 사용자와 충돌하나?” 분류 (후보 B 영역)
- 사용자 발화 재작성·우선순위 뒤집기
- 다중 규범 경쟁 해소기 (F1e 미측정)
- 출처 표기 강제(U2 미판정)

---

## 5. 선택 메커니즘 (후보 A)

1. 입력: 최근 사용자 발화 + 도구명(`Agent`/`Task`).
2. 분류: `LEXICON_CATEGORIES` + 유닛 `triggers` (eval과 **동일 함수** — 복사 금지, 모듈 export).
3. 선택: pin ∪ (unknown? 전량-routable : 카테고리∩surface 매칭). **JIT 페이로드에는 pin 제외**
   (pin은 prefix 책임; 중복 주입 비용 방지). 3.0은 추가로 `surface` ∩ `{delegation}` 필터.
4. 예산: C3 하에서 등급 우선(H>G>A) 채움 · 초과분 drop + receipt.
5. `ROUTER_VERSION`: 결정 로직 변경 시 bump (`A-1` → `A-2`…) · receipt에 기록.

---

## 6. Enable 정책

| 단계 | 플래그 / 조건 | 동작 |
|---|---|---|
| **dry-run** | 기본 | 결정·receipt만 · `additionalContext` **미출력** |
| **canary** | `LOOM_RULE_ROUTER_JIT=canary` + PREREG 봉인 커밋 | 격리 probe에서만 실주입 · PHASE3-PREREG 측정 |
| **opt-in live** | `LOOM_RULE_ROUTER_JIT=1` **and** 3.0 카나리아 게이트 통과 | 본 리포 세션 실주입 |
| **default on** | Phase 3 전체 종료 + 오너 선포 전 **금지** | — |

Fail-open: 훅 예외·파싱 실패·registry 손상 → **주입 스킵** · exit 0 (세션 생존).  
`rules:check` 실패 상태에서는 live enable 거부.

---

## 7. 구현 산출물 (3.0)

| 산출 | 역할 |
|---|---|
| `scripts/rule-router-jit.ts` | PreToolUse 엔트리 · dry-run/canary/live 분기 |
| `scripts/rule-router-select.ts` (또는 eval에서 export) | 후보 A 선택 **단일 구현** |
| `.claude/settings.json` | `Agent\|Task` matcher에 **append** (check-agent-model **앞이 아닌 뒤** — deny 먼저) |
| `scripts/rule-router-jit.test.ts` | 결정론: 매칭·예산·pin 제외·충돌 스킵·C3 스킵 |
| receipt 디렉터리 규약 | §3.7 |
| PHASE3-PREREG + 결과 문서 | 준수 게이트 |

**기존 훅 불변:** `check-agent-model.ts` 로직·exit 2 계약 유지.

---

## 8. 준수 게이트 (요약 · 정본은 PREREG)

- 전달 카나리아 **불충분**.
- 임의 토큰 **금지**.
- 행동 **위치**로 판정.
- 사용자 지시와 **경쟁하는** 카나리아 프롬프트 **금지**(F1e).
- 3.0 카나리아는 **delegation 프로세스 규범 1종**에 묶는다(PREREG §2).
- 게이트 통과 전 `LOOM_RULE_ROUTER_JIT=1` **금지**.

---

## 9. 착수 결정

| 항목 | 결정 |
|---|---|
| Phase 3 착수 | **예 — 3.0 슬라이스만** |
| 즉시 라이브 기본 on | **아니오** |
| 다음 구현 웨이브 | PREREG 봉인 후 `rule-router-jit` dry-run → canary 측정 → 결과 문서 → opt-in |
| Defer 사유 | (해당 없음) |

---

## 10. Must not

- 봉인 F1*/PREREG(D7) 값 변경 · holdout 개봉
- U2 출처 처방 · 10/10 무조건 인용
- pin/전량을 충돌 회피로 기술(M-1)
- 서브에이전트 요청에 규칙 인라인
- 본문 하드코딩 · 10k 초과 시 침묵 truncate
- plan_review R{n}으로 경로 승격 요구(D2 유지; 구현은 docs+hook)

---

## 11. Done-when (이 명세 웨이브)

- [x] 본 SPEC rev-1
- [x] PHASE3-PREREG 커밋 봉인 (동 웨이브)
- [x] HANDOFF Current action → 3.0 구현/canary
- 구현·카나리아 실행은 **다음 게이트**

[RULE-ROUTER-PHASE3-SPEC rev-1] slice=3.0-delegation opt-in=required canary=prereg-gated phase4=out
