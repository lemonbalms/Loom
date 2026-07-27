# Phase 3.1 착수 명세 — ship surface JIT (후보 A)

작성 2026-07-28 · **rev-1** · 레인: 본세션(topology `single`)  
Authority: [`RULE-ROUTER-PHASE3-SPEC.md`](./RULE-ROUTER-PHASE3-SPEC.md) rev-1 §2  
( surface 순서 고정) · [`RULE-ROUTER-PHASE3-RESULT.md`](./RULE-ROUTER-PHASE3-RESULT.md) rev-2  
(3.0 T1(b) PASS · live opt-in for **delegation** only) ·  
[`RULE-ROUTER-PHASE3.1-PREREG.md`](./RULE-ROUTER-PHASE3.1-PREREG.md) (본 슬라이스 준수 게이트)

> **3.0 통과 ≠ 3.1 구현 권한 자동 승격.** 3.1은 **별 PREREG 봉인** 후 코드·canary.  
> **3.1 카나리아 통과 전** ship surface live inject **금지**.  
> 3.0 delegation live opt-in(`LOOM_RULE_ROUTER_JIT=1`)은 **delegation 레인만** — ship을 몰래 켜지 않는다.

---

## 0. 한 줄

**Bash(·Edit) PreToolUse**에서 후보 A가 고른 **ship/verification 프로세스 규범**을
append-only 주입한다. 1차 카나리아 유닛 = **`traps.bun-test-env`** (관측 가능 명령 형태).  
`agents.commit-push`(pin J)는 JIT 대상 **아님**.

---

## 1. 범위

| In | Out |
|---|---|
| surface=`ship` · matcher `Bash` (canary) · live는 키워드/발화 게이트 | 3.0 PREREG 재개방 |
| 유닛: `traps.bun-test-env`(canary fixture) · live 시 `agents.verify` 후보 가능 | pin `agents.commit-push` JIT |
| opt-in 플래그 공유 · **surface별 게이트** | ship default-on · 3.2 dispatch |
| C1–C3 · 추출기 본문 · receipt | U2 출처 · 형식-경쟁 해소기 |

**Harness claim:** Claude Code only (3.0과 동일).

---

## 2. C1 함정 (설계 강제)

PreToolUse `additionalContext`는 **그 도구 호출의 tool_result 이후**에 보인다.
따라서 **같은 Bash 호출의 command를 교정한다고 주장하지 않는다.**

3.1 카나리아는 **2-step** 프롬프트로 주입 가시 시점을 연다:

1. 무해한 선행 Bash (`echo …`) → PreToolUse 발화 → 주입 도달  
2. 후속 `bun test` 호출에서 **명령 형태**를 채점 (COMPLY)

---

## 3. 주입 계약 (3.0 §3 승계 + ship)

| # | 규칙 |
|---|---|
| 1 | `hookSpecificOutput.additionalContext` · exit 0 · 비차단 |
| 2 | C1 준수 — “그 호출 교정” 문서화 금지 |
| 3 | C2 — 서브에이전트 요청에 규칙 인라인 금지 |
| 4 | C3 — 1이벤트 &lt;10k · 초과=전체 스킵 |
| 5 | Append-only · 본문 SSOT=추출기 · 하드코딩 금지 |
| 6 | Receipt: unit ids · sha8 · chars · **surface=ship** · slice=3.1 · router_version |
| 7 | pin 유닛 JIT 페이로드 제외 (M-1) |

### 3.1 도구 레인

| 도구 | canary | dry-run / live |
|---|---|---|
| `Agent`\|`Task` | **3.0 fixture 유지** (`orch.model-explicit`) | surface=`delegation` 선택 (기존) |
| `Bash` | **3.1 fixture** (`traps.bun-test-env`) — 키워드 무관(probe 격리) | command 키워드 **또는** 발화 `ship`/`verification` 분류 시 surface=`ship` 선택 |
| `Edit` | canary 미사용 | live only · 발화 ship/verification 시에만 (선택·후순위) |
| 기타 | no-op | no-op |

### 3.2 live command 키워드 (결정론 · 최소)

대소문자 무시 부분 일치:

`bun test` · `commit` · `push` · `git ` · `LOOM_RELAY` · `npm test` · `verify`

발화 폴백: `classifyTurn` 카테고리에 `ship` 또는 `verification` 포함 시 Bash를 ship 레인으로 인정
(키워드 미스여도 테스트 선행 `echo` 같은 턴은 live에서 **주입하지 않음** — canary만 선행 주입).

### 3.3 선택 (live · 후보 A)

1. pin 제외  
2. `surface` ∩ `{ship}`  
3. `route`/`classifyTurn` 동일 함수 (복사 금지)  
4. `fitBudget` · 등급 H>G>A · 초과 유닛 통째 drop  
5. 1차 유닛 집합 후보: `traps.bun-test-env` · `agents.verify` (둘 다 A·짧음)

---

## 4. Enable 정책 (surface-gated)

| 플래그 | delegation (3.0) | ship (3.1) |
|---|---|---|
| unset/off | no-op | no-op |
| dry-run | 결정·receipt | 결정·receipt |
| canary | 3.0 fixture on Agent\|Task | **3.1 fixture on Bash** |
| `1`/live | **허용**(T1(b) PASS) · surface=delegation | **3.1 카나리아 통과 전 금지** — 코드는 선택해도 **inject 스킵** + receipt `ship_gate_blocked` |

**구현 의무:** `LOOM_RULE_ROUTER_JIT=1` 이어도 ship 레인 inject는
`PHASE3_1_SHIP_LIVE_AUTHORIZED` (또는 동등 상수/환경 **명시 opt-in 2중**) 없이 **스킵**.  
보수 기본: 3.1 RESULT 통과 문서화 전까지 상수 `false`.

default-on: Phase 3 전체 + 오너 선포 전 **금지**.

---

## 5. 준수 게이트

정본: [`RULE-ROUTER-PHASE3.1-PREREG.md`](./RULE-ROUTER-PHASE3.1-PREREG.md).  
전달 카나리아 불충분 · 임의 토큰 금지 · 행동 위치로 판정 · 경쟁 프롬프트 금지.

---

## 6. 구현 산출물

| 산출 | 역할 |
|---|---|
| `scripts/rule-router-jit.ts` | ship 레인 · 3.1 fixture · ship live gate |
| `scripts/rule-router-jit.test.ts` | Bash canary · keyword gate · ship live blocked · pin 제외 |
| `.claude/settings.json` | **Bash** matcher에 jit 훅 **추가**(Agent\|Task 유지) |
| PHASE3.1-PREREG + RESULT | 준수 게이트 |

**기존:** `check-agent-model` 계약 불변 · 3.0 canary/테스트 회귀 0.

---

## 7. Must not

- 3.0/F1* PREREG 사후 편집 · holdout 개봉  
- 3.1 카나리아 전 ship live inject  
- pin=충돌 회피 · 본문 하드코딩 · 10k truncate  
- U2 처방 · default-on · “그 Bash 호출을 교정” 주장  
- `agents.commit-push` JIT 적재  

---

## 8. Done-when (이 명세 웨이브)

- [x] 본 SPEC rev-1  
- [x] PHASE3.1-PREREG 커밋 봉인 (동 웨이브)  
- [x] 훅 ship 레인 + 유닛 테스트 (구현 동 웨이브 · 17 jit tests)  
- [ ] 모델 n=10 canary → RESULT (측정 웨이브 — 다음 게이트)

[RULE-ROUTER-PHASE3.1-SPEC rev-1] slice=3.1-ship fixture=traps.bun-test-env c1=two-step ship_live=gated
