# Phase 3.3 착수 명세 — implementation surface JIT (후보 A)

작성 2026-07-28 · **rev-1** · 레인: 본세션(topology `single`)  
Authority: [`RULE-ROUTER-PHASE3-SPEC.md`](./RULE-ROUTER-PHASE3-SPEC.md) rev-1 §2  
( surface 순서 · **3.2 통과 후 기타 중 1 surface**) ·  
[`RULE-ROUTER-PHASE3.2-RESULT.md`](./RULE-ROUTER-PHASE3.2-RESULT.md) rev-1  
(dispatch soft live opt-in) · [`RULE-ENFORCEABILITY.md`](./RULE-ENFORCEABILITY.md) ·  
[`RULE-ROUTER-PHASE3.1-SPEC-REV.md`](./RULE-ROUTER-PHASE3.1-SPEC-REV.md) H1  
(isolation = **absence not negation**)

> **3.2 통과 ≠ 3.3 구현 권한 자동 승격.** 3.3는 **별 SPEC + PREREG 봉인** 후 코드·canary.  
> **3.3 카나리아 통과 전** implementation surface live inject **금지**.  
> 기존 `LOOM_RULE_ROUTER_JIT=1` 은 delegation·ship·dispatch(이미 게이트된 surface)만 —  
> implementation을 몰래 켜지 않는다.  
> **default-on 금지.** 봉인 F1*/3.0–3.2 PREREG **재개방 금지**.  
> **verification / review / gate** 는 parent SPEC §2 주석대로 **prefix·리추얼 1차** —  
> 이 슬라이스 **Out** (별 3.4+ 또는 무기한 defer).

---

## 0. 한 줄

**Bash(·Edit) PreToolUse**에서 후보 A가 고른 **implementation 프로세스 규범**을
append-only 주입한다. 1차 카나리아 유닛 = **`agents.env`** (관측 가능 형태:
제품 env 접두 **`LOOM_*`**, `FABLE_*` 비사용).  
제품 코드 hard-lock 주장 금지 — soft JIT + 경로 맵 범위만.

---

## 1. 범위

| In | Out |
|---|---|
| surface=`implementation` · matcher **실측 Bash**(canary) · live Bash/Edit 게이트 | 3.0–3.2 PREREG 재개방 · ship/delegation/dispatch 게이트 재협상 |
| canary fixture `agents.env` · live non-pin `surface`∋`implementation` | pin 유닛 JIT · pin=충돌 회피 (M-1) |
| opt-in 공유 플래그 · **surface별 live 게이트** | implementation default-on · verification/review/gate JIT |
| C1–C3 · 추출기 본문 · receipt · H1 isolation | U2 · 형식-경쟁 해소기 · platform-only 슬라이스(후순위) |

**Harness claim:** Claude Code only (3.0–3.2와 동일).

**실측 와이어 (발명 금지):**  
현행 `.claude/settings.json` PreToolUse = `Agent|Task` + `Bash` 만.  
`Write`/`Edit` matcher 신규 추가는 **이 슬라이스 선택**(live Edit 쓰려면 settings append —
없으면 Edit 레인은 코드만 준비·실발화 없음). 1차 카나리아 = **Bash 2-step** (3.1/3.2 동형).

**왜 implementation인가 (기타 중 선택 근거):**

| 후보 surface | non-pin | 3.3 채택? | 이유 |
|---|---|:---:|---|
| **implementation** | `agents.env` · `traps.fake-herdr-status` | **예** | 코딩 루프의 다음 저위험 surface · 유닛 짧음 · COMPLY 형태 명확 |
| platform | `traps.claude-mem-patch` 1종 | 후순위 | 협소 · B-4 로컬 핀과 교락 가능 → **3.4 후보** |
| verification | 다수 (ship/dispatch 중복) | **Out** | parent: prefix·리추얼 1차 · ship이 이미 bun-test 커버 |
| review / gate | 거의 pin | **Out** | parent: prefix 1차 |
| session-start | G 유닛 | **Out** | SessionStart 경로 ≠ PreToolUse JIT |
| bridge | `traps.terminal-replay` | Out | dispatch 인접 · 3.2 범위 밖 확장 금지 |

---

## 2. 유닛 집합 (inventory · non-pin · `surface`∋`implementation`)

| id | grade | cost≈ | 1차 역할 |
|---|:---:|---:|---|
| **`agents.env`** | **A** | **75** | **canary fixture** · live |
| `traps.fake-herdr-status` | A | 78 | live 후보 (픽스처 갭 · implementation∩verification) |

**pin 제외** (`agents.deviations` 등 J). canary = fixture 1종 고정.  
live = route∩surface∩!pin + fitBudget.

**본문 고정 (registry 동기 · canary sha):**

```
| Env (0.10+) | **`LOOM_*` only** — `FABLE_*` env is not read (warn only) |
```

- unit id: `agents.env`  
- body sha8: **`06e68593`** (policy `2026-07-26.p1` · 추출기 재현)  
- 훅 하드코딩 금지 · 추출기 SSOT

---

## 3. C1 함정 (설계 강제)

PreToolUse `additionalContext`는 **그 도구 호출의 tool_result 이후**에 보인다.  
→ **같은 Bash command를 교정한다고 문서·로그에 쓰지 않는다.**

3.3 카나리아 = **2-step** (3.1/3.2 동형):

1. 무해 선행 Bash (`echo P33_READY`) → 주입 가시  
2. 후속 “제품이 읽는 relay token env export 한 줄” Bash에서 **접두 형태** 채점 (COMPLY)

---

## 4. 주입 계약 (3.0 §3 승계 + implementation)

| # | 규칙 |
|---|---|
| 1 | `hookSpecificOutput.additionalContext` · exit 0 · 비차단 · JIT **exit 2 금지** |
| 2 | C1 준수 — “그 호출 교정” 금지 |
| 3 | C2 — 서브에이전트 요청에 규칙 인라인 금지 |
| 4 | C3 — 1이벤트 &lt;10k · 초과=전체 스킵 |
| 5 | Append-only · 본문 SSOT=추출기 · 하드코딩 금지 |
| 6 | Receipt: unit ids · sha8 · chars · **surface=implementation** · slice=3.3 · router_version |
| 7 | pin 유닛 JIT 페이로드 제외 (M-1) |

### 4.1 도구 레인

| 도구 | canary | dry-run / live |
|---|---|---|
| `Agent`\|`Task` | 3.0 fixture 유지 | surface=`delegation` (기존) |
| `Bash` | **기본 ship fixture**(3.1 회귀) · **`LOOM_RULE_ROUTER_CANARY_SURFACE=implementation` 일 때만** 3.3 fixture | command 키워드 **또는** 발화 `implementation` 분류 시 surface=`implementation` · **dispatch > ship > implementation** 우선(동시 키워드 시 상위 슬라이스) |
| `Edit` | canary 미사용 | live only · 발화/경로 implementation 시 (settings matcher 있을 때만 실발화) |
| 기타 | no-op | no-op |

### 4.2 live implementation command 키워드 (결정론 · 최소)

대소문자 무시 부분 일치:

`process.env` · `LOOM_` · `FABLE_` · `Deno.env` · `import.meta.env`

(발화 폴백: `classifyTurn` 카테고리에 `implementation` 포함.)

**경합 규칙 (고정):**

1. Bash command에 **dispatch** 키워드 → `dispatch`  
2. else **ship** 키워드 → `ship`  
3. else **implementation** 키워드 → `implementation`  
4. else 발화 카테고리 동일 우선순위  
5. 없으면 no-op  

`env` 단독 발화는 lexicon상 **platform**도 탈 수 있다 — **3.3 live는 implementation surface 유닛만** 주입  
(platform 유닛은 3.4 후보 · 이 슬라이스 inject 집합에 넣지 않음).

### 4.3 선택 (live · 후보 A)

1. pin 제외  
2. `surface` ∩ `{implementation}`  
3. `route`/`classifyTurn` 동일 함수 (복사 금지)  
4. `fitBudget` · 등급 H>G>A · 초과 유닛 통째 drop  

---

## 5. Enable 정책 (surface-gated)

| 플래그 | delegation | ship | dispatch | **implementation (3.3)** |
|---|---|---|---|---|
| unset/off | no-op | no-op | no-op | no-op |
| dry-run | 결정·receipt | 결정·receipt | 결정·receipt | 결정·receipt |
| canary | 3.0 fixture | 3.1 Bash 기본 | CANARY=dispatch | **CANARY=implementation** 시 3.3 fixture |
| `1`/live | 허용 | 허용(opt-in) | 허용(opt-in) | **3.3 카나리아 통과 전 금지** → `implementation_gate_blocked` |

**구현 의무:** `LOOM_RULE_ROUTER_JIT=1` 이어도 implementation 레인 inject는  
`PHASE3_3_IMPLEMENTATION_LIVE_AUTHORIZED === true` 없이 **스킵**.  
보수 기본: RESULT 통과 문서화 전까지 상수 **`false`**.

default-on: **금지**.

---

## 6. 강제가능성 (사전 표기 · 주장 상한)

| 유닛/효과 | 사전 등급 | 비고 |
|---|---|---|
| `agents.env` export/접두 형태 | soft JIT 측정 대상 | 3.3 = soft canary first |
| 제품 코드가 런타임에 `FABLE_*` 무시 | **G/J** (이미 제품 계약) | JIT가 런타임을 강제한다고 주장 금지 |
| verification/review hard path | **주장 금지** | 이 슬라이스 Out |

RULE-ENFORCEABILITY: implementation 다수 판단 규칙은 **J pin** — soft 전달≠강제.

---

## 7. 준수 게이트

정본: [`RULE-ROUTER-PHASE3.3-PREREG.md`](./RULE-ROUTER-PHASE3.3-PREREG.md).  
전달 카나리아 불충분 · 임의 토큰 금지 · 행동 위치 판정 · 경쟁 프롬프트 금지 ·  
probe isolation = **absence not negation** (H1).

---

## 8. 구현 산출물 (PREREG 봉인 후 다음 게이트)

| 산출 | 역할 |
|---|---|
| `scripts/rule-router-jit.ts` | implementation 레인 · 3.3 fixture · canary surface override · live gate |
| `scripts/rule-router-jit.test.ts` | Bash canary implementation · 우선순위 · live blocked · pin 제외 |
| `.claude/settings.json` | **canary 변경 불요**(Bash 존재) — live Edit 시 선택적 matcher 문서화 |
| PHASE3.3-PREREG + RESULT | 준수 게이트 |

**기존 훅 불변:** deny hooks **before** JIT · JIT never exit 2 · 3.0–3.2 회귀 0.

---

## 9. Must not

- live implementation inject **pre-PREREG** 또는 canary 전  
- default-on · 봉인 PREREG 재측정/사후 완화 COMPLY  
- pin as conflict avoidance · 본문 하드코딩 · 10k truncate  
- “그 Bash 호출을 교정” · MCP/도구 와이어 발명  
- verification/review/gate를 3.3에 몰래 편입  
- claim product hard-lock without path closure  
- JIT exit 2 · reopen 3.0–3.2  

---

## 10. Done-when (이 명세 웨이브)

- [x] 본 SPEC rev-1  
- [x] PHASE3.3-PREREG 문안 (동 웨이브 · **커밋=봉인**)  
- [x] 훅 implementation 레인 + 유닛 테스트 (`rule-router-jit` · 30/0)  
- [ ] 모델 n=10 canary → RESULT (**다음 게이트**)  
- [x] HANDOFF Current action → 3.3 canary (동 웨이브)  

[RULE-ROUTER-PHASE3.3-SPEC rev-1] slice=3.3-implementation fixture=agents.env sha8=06e68593 wire=Bash c1=two-step impl_live=gated soft_first=yes vrfy_review_gate=out
