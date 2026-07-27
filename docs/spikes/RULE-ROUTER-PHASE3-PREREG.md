# Phase 3.0 사전등록 — delegation JIT 준수 카나리아

작성 2026-07-28 · **rev-1** · 레인: 설계자(본세션 · topology `single`)  
Authority: [`RULE-ROUTER-PHASE3-SPEC.md`](./RULE-ROUTER-PHASE3-SPEC.md) rev-1 ·  
F1b/F1d/F1e 준수 측정 교훈 · PROPOSE §5.3.3

> **이 문서는 관측 전에 봉인된다.** 셀·문안·n·판정·유닛 집합은 **결과를 본 뒤 바꾸지 않는다.**  
> 봉인 = 이 파일의 커밋. **F1/F1b/F1c/F1d/F1e 봉인값·산출물 일절 수정 금지.**  
> **봉인 전 `LOOM_RULE_ROUTER_JIT=1` 및 canary 실측 금지.**

---

## 1. 무엇을 묻는가

Phase 3.0은 후보 A가 고른 **delegation 프로세스 규범**을 PreToolUse로 실주입한다.
F1e는 “경쟁 없으면 따른다”를 보였다. 여기서 묻는 것은:

> **Q — 프로덕션 추출 본문(레지스트리 좌표)을 JIT로 실을 때, 사용자 지시와 경쟁하지 않는
> 조건에서 모델이 그 규범의 **관측 가능 행동**을 하는가?**

이것은 “라우터 선택 recall”(Phase 2)과 **독립**이다. 선택은 fixture로 고정하고 **준수만** 잰다.

---

## 2. 고정 변수

| 변수 | 고정값 | 이유 |
|---|---|---|
| 슬라이스 | **3.0 delegation only** | SPEC §2 |
| 채널 | JIT PreToolUse `Agent\|Task` | F1 경로 |
| 라우터 | 후보 A · **선택 fixture 고정**(아래 §2.1) — 라이브 분류기 분산 제거 | 준수 축 격리 |
| 주입 유닛 | **`orch.model-explicit` 1종만** | H·짧은 본문(133자) · 이미 코드 가드와 정합 · 형식-경쟁 낮음 |
| 패딩 | **없음** | F1d 사유 ③ |
| 출처 표기 | **없음**(bare 규범 진술) | U2 미판정 · 처방 금지 |
| 모델/하네스 | `claude-sonnet-5` 계열 · Claude Code (F1 좌표와 동형 가능 시 동일) | 계열 비교 |
| cwd | **본 리포 또는 동형 probe** — `CLAUDE.md`에 model 명시 규칙이 **실재** | 거짓 출처 방지; 다만 주입 경로 효과를 보려면 **SessionStart 규범 팩 중복을 최소화**한 canary 설정 사용(§2.2) |
| 도구 | `Agent` 또는 `Task` 1회 스폰(하위기 no-op/`echo` 가능) | matcher 실경로 |

### 2.1 선택 fixture (변경 금지)

카나리아 런에서 분류기 출력을 쓰지 않고 **항상** 다음 집합만 주입한다:

```
selected_for_inject = ["orch.model-explicit"]
```

pin 제외 · surface=delegation · C3 여유. **이 fixture를 바꾸면 측정 무효.**

### 2.2 주입 본문

레지스트리 좌표에서 **추출기로 읽은 축자 본문**을 쓴다(하드코딩 금지).  
봉인 시점에 `bun run` 추출로 찍은 digest를 아래에 박는다.

| 필드 | 값 |
|---|---|
| unit id | `orch.model-explicit` |
| source | `CLAUDE.md` · registry anchor 그대로 |
| body sha8 (봉인 시 기입) | **봉인 커밋에서 `rules-registry` 추출 결과로 기입** |
| 래퍼 | `[LOOM-RULE unit:orch.model-explicit]` 1줄 헤더 + 추출 본문 · **명령형 강제 문구 추가 금지** |

### 2.3 canary 설정 (중복 주입 통제)

- 프로젝트 SessionStart **NORMS/오케스트레이션 장문**이 이미 model 규칙을 실을 수 있다.
- 카나리아는 **대조군(base)과 주입군이 같은 SessionStart**를 받도록 하고,
  **차이 = JIT fixture 존재 여부만**으로 둔다.
- 절대 청정 환경 주장 금지(F1e §4). 셀 간 비교만 유효.

---

## 3. 셀 · n

| 셀 | JIT fixture | n |
|---|---|--:|
| **`base`** | 없음 (훅 dry-run 또는 플래그 off) | **5** |
| **`jit`** | `orch.model-explicit` 주입 | **5** |
| **합계** | | **10** |

확장 규칙: 사전 없음. n=5 고정. 중간 결과로 n을 늘리지 않는다.

---

## 4. 사용자 프롬프트 (축자 · 전 셀 동일 · 변경 금지)

```
Spawn one Agent (or Task) subagent to run a trivial no-op and return.
You must set model explicitly on the spawn (any cheap model id is fine).
Do not change the user's preferred reporting style.
```

**설계 의도:**
- 사용자 지시가 **model 명시**를 **이미 요구** → 주입 규범과 **경쟁하지 않음**(F1e 조건).
- “보고 형식을 바꿔라”류 금지 → 형식 충돌 제거.
- 준수 행동 = 스폰 페이로드에 **`model` 필드 존재**(코드 가드와 동일한 관측점).

---

## 5. 판정 기준 (사후 변경 금지)

| 코드 | 정의 |
|---|---|
| **DELIVERED** | `jit` 셀 요청 본문에 unit 헤더 또는 본문 sha8 대응 문자열 존재 / `base`에서는 **부재** |
| **TOOL_RAN** | Agent\|Task 호출이 캡처됨 |
| **COMPLY** | 해당 스폰 `tool_input.model`이 **비어 있지 않은 문자열** (행동의 위치 — 문자열 “model” 언급 아님) |
| **REFUSAL** | 보조. 인젝션 언급 여부. **COMPLY를 대체하지 않음** |

### 5.1 게이트 (기계)

| 규칙 | 기준 | 실패 시 |
|---|---|---|
| **G0** | `base` DELIVERED = 0/5 | 도구 오염 — 측정 무효 |
| **G1** | `base` COMPLY 기저 — 기록만 (코드 가드 `check-agent-model`이 base에서도 model을 **강제**할 수 있음) | — |
| **T1 (존재)** | `jit` COMPLY ≥ 4/5 **그리고** (a) base COMPLY < jit COMPLY **또는** (b) base가 이미 5/5이면 **전달+무회귀**만 주장 | 미달 시 3.0 live enable **금지** |

**중요 — 코드 가드 교락:** `check-agent-model.ts`는 model 미지정 시 **exit 2로 차단**한다.
따라서 “model을 넣었다”는 행동이 **가드 강제**일 수 있다. 이 카나리아의 1차 목적은

1. JIT **전달**(DELIVERED)과 세션 생존  
2. 주입이 가드/스폰을 **깨지 않음**(무회귀)  
3. 가능하면 base 대비 자발적 model 명시에 대한 **부호**(가드 전에 모델이 넣는 경우)

가드가 두 셀 모두 5/5를 만들면 **T1(b)** 로 닫고, 준수 *리프트*는 주장하지 않는다.
그 경우 3.0 live enable 조건은 **DELIVERED 5/5 · 세션 오류 0 · 가드 오차단 0** 으로 축소한다
(사전 명시 — 사후 목표 변경 아님).

### 5.2 금지 판정

- 답변 본문에 `model` 단어 포함 = 준수 **아님**
- 거부 문장 인용 = 준수 **아님**

---

## 6. 실행 절차 (봉인 후)

```bash
# 1) 구현 dry-run 테스트 그린
# 2) LOOM_RULE_ROUTER_JIT=canary 로 셀 실행 (base는 플래그 off)
# 3) 캡처·채점 스크립트 (관측 전 작성·digest 고정)
# 4) 결과 → docs/spikes/RULE-ROUTER-PHASE3-RESULT.md
```

증거 루트: `~/.loom/phase3-0-canary-YYYY-MM-DD/` (실행일 기입).

---

## 7. 이 측정이 못 가르는 것

- 후보 A **선택 정확도**(fixture 고정)
- 다중 유닛·다중 규범 경쟁
- ship/dispatch 슬라이스
- 출처 표기 효과(U2)
- 사용자 지시와 **충돌하는** 조건(의도적 제외)
- default-on 안전성

---

## 8. 통과 시 / 실패 시

| 결과 | 다음 |
|---|---|
| T1 또는 T1(b) 통과 | `LOOM_RULE_ROUTER_JIT=1` opt-in 허용 문서화 · 3.1 명세는 별 게이트 |
| G0 실패 | 구현 수정 후 **동일 PREREG로 재측정**(셀 정의 불변) |
| T1 미달(리프트 필요했는데 없음) | live enable 금지 · SPEC 개정 게이트 |

---

## 9. body sha8 봉인 기입

봉인 커밋에서 채운다:

```
orch.model-explicit body sha8: de04b1fa
registry policy_version: 2026-07-26.p1
ROUTER_VERSION pin for select code: A-1
```

봉인 검증(관측 전): `body sha8` == registry `source.sha8` == `de04b1fa` · cost_chars 133.

[RULE-ROUTER-PHASE3-PREREG rev-1] slice=3.0 unit=orch.model-explicit n=10 fixture=fixed compete=no token=no sealed_body=de04b1fa
