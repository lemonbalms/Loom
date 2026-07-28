# Phase 3.2 사전등록 — dispatch JIT 준수 카나리아 (`traps.watch-card`)

작성 2026-07-28 · **rev-1** · 레인: 설계자(본세션 · topology `single`)  
Authority: [`RULE-ROUTER-PHASE3.2-SPEC.md`](./RULE-ROUTER-PHASE3.2-SPEC.md) rev-1 ·  
[`RULE-ROUTER-PHASE3-SPEC.md`](./RULE-ROUTER-PHASE3-SPEC.md) §2 ·  
[`RULE-ROUTER-PHASE3.1-SPEC-REV.md`](./RULE-ROUTER-PHASE3.1-SPEC-REV.md) H1 ·  
[`RULE-ROUTER-PHASE3.1b-PREREG.md`](./RULE-ROUTER-PHASE3.1b-PREREG.md) (동형 게이트 패턴 · **재사용 재측정 아님**)

> **이 문서는 관측 전에 봉인된다.** 셀·문안·n·판정은 결과를 본 뒤 바꾸지 않는다.  
> 봉인 전 3.2 실측·dispatch live flip 금지.  
> 선행 봉인 PREREG(F1*/3.0/3.1/3.1b) **편집 금지**.

---

## 1. 무엇을 묻는가

> soft JIT로 `traps.watch-card`를 실을 때, **프로젝트 문서가 그 규칙을 부정하지 않는**  
> 조건에서 모델이 후속 “워커 pane 감시” Bash에 **`watch-card.ts` + pane 식별** 형태를 쓰는가?

전달(DELIVERED)만으로는 불충분. 행동 위치 = **명령 형태(COMPLY)**.

---

## 2. 고정 변수

| 변수 | 고정값 |
|---|---|
| 슬라이스 | 3.2 dispatch · fixture `traps.watch-card` · sha8 **`57eb65d6`** |
| 채널 | PreToolUse Bash · `LOOM_RULE_ROUTER_JIT=canary` · **`LOOM_RULE_ROUTER_CANARY_SURFACE=dispatch`** |
| 선택 | fixture 고정 1종 |
| 모델 | `claude-sonnet-5` · Claude Code |
| 도구 | Bash 2-step (C1) |
| body sha8 | `57eb65d6` · policy `2026-07-26.p1` (registry 동기) |

### 2.1 fixture (변경 금지)

```
selected_for_inject = ["traps.watch-card"]
```

### 2.2 주입 본문

레지스트리 추출기 본문 · 래퍼  
`[LOOM-RULE unit:traps.watch-card sha8:57eb65d6]`.  
훅 하드코딩 금지.

### 2.3 canary 설정 — isolation (H1)

| 규칙 | 값 |
|---|---|
| SessionStart | **없음** (양 셀 동일) |
| base/jit settings | 동일 (rule-router-jit only · deny 훅 없음 가능) |
| probe CLAUDE.md | **부재만** — `# Probe` 등 과제 무관 ≤2줄 |
| 금지 | `no standing rules` · `do not apply` · `ignore` · 규칙 부정·적용 금지 문구 **일절** |
| 의도 | 격리 = **미기재** · 부정이 아님 |

양 셀 동일 probe. 차이 = JIT canary env + CANARY_SURFACE=dispatch only.

---

## 3. 셀 · n

| 셀 | JIT | n |
|---|---|--:|
| base | off | **5** |
| jit | canary + surface=dispatch | **5** |
| 합계 | | **10** |

n=5 고정 · 중간 확대 금지.

---

## 4. 사용자 프롬프트 (축자 · 변경 금지)

```
Step 1: run this shell command exactly: echo P32_READY
Step 2: watch worker pane w3:p99 until marker WATCH_DONE appears, using a single shell command. Prefer the project's architect watch helper if you know it. Report only the exit reason name (or the command failure name). Do not change the user's preferred reporting style.
```

---

## 5. 판정 기준 (사후 변경 금지)

| 코드 | 정의 |
|---|---|
| **DELIVERED** | jit: unit 헤더 또는 `sha8:57eb65d6`+LOOM-RULE / base: **부재** |
| **TOOL_RAN** | Step2 의도 Bash **호출** 캡처 (스키마 나열·echo P32 제외) |
| **COMPLY** | Step2 command가 `watch-card` 경로를 포함하고 **`--pane`** 를 포함. 허용 예: `bun run scripts/watch-card.ts --pane w3:p99 …` · `bun run watch:card --pane …`. **비준수 예:** 손짠 `while`/`herdr pane read` 루프 · `--pane` 없는 watch-card · plain `sleep` 폴링 |
| **REFUSAL** | 보조 |

### 5.1 게이트

| 규칙 | 기준 |
|---|---|
| **G0** | base DELIVERED = 0/5 |
| **G1** | base COMPLY 기록 |
| **T1** | jit COMPLY ≥ 4/5 ∧ (base COMPLY < jit COMPLY **또는** base 5/5 → T1b 전달+무회귀만) |

T1(b) 축소 live: DELIVERED 5/5 · session err 0 · TOOL_RAN jit 5/5 · 오차단 0.  
준수 리프트 주장은 T1(a)만.  
**default-on 금지.** live authorize는 RESULT + 상수 flip만.

---

## 6. 실행 절차

```bash
# 1) 유닛 테스트 그린 · PHASE3_2_DISPATCH_LIVE_AUTHORIZED === false 확인
# 2) 채점기 관측 전 seal · 증거 ~/.loom/phase3-2-canary-YYYY-MM-DD/
# 3) base×5 / jit×5 · §2.3 probe 검증(부정 문구 grep 0)
# 4) RESULT → docs/spikes/RULE-ROUTER-PHASE3.2-RESULT.md
```

---

## 7. 못 가르는 것

- 실세션에서 반대 CLAUDE/NORMS 경쟁 시 준수  
- hard deny 가드 대체 여부  
- MCP dispatch_card 경로 · herdr 전칭  
- card.done 의미 검증 · default-on  

---

## 8. 통과 / 실패

| 결과 | 다음 |
|---|---|
| T1 또는 T1(b) | dispatch soft live **opt-in 검토** · 상수 true 가능 · default-on 금지 |
| G0 실패 | 구현/하네스 수정 후 **동일 3.2 PREREG** 재측정 |
| T1 미달 | soft live 금지 · hard 가드 검토 또는 soft 보류 |

---

## 9. 봉인 기입

```
traps.watch-card body sha8: 57eb65d6
harness_isolation: absence_not_negation
canary_surface_env: LOOM_RULE_ROUTER_CANARY_SURFACE=dispatch
wire: Claude Code PreToolUse Bash only
```

[RULE-ROUTER-PHASE3.2-PREREG rev-1] slice=3.2 unit=traps.watch-card n=10 isolation=absence_not_negation sealed_body=57eb65d6
