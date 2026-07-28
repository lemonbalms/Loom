# Phase 3.4b 사전등록 — platform strict COMPLY (`traps.claude-mem-patch` · repo cwd)

작성 2026-07-28 · **rev-1** · 레인: 설계자(본세션 · topology `single`)  
Authority: [`RULE-ROUTER-PHASE3.4b-SPEC.md`](./RULE-ROUTER-PHASE3.4b-SPEC.md) rev-1 ·  
[`RULE-ROUTER-PHASE3.4-RESULT.md`](./RULE-ROUTER-PHASE3.4-RESULT.md) (선행 FAIL · **재측정 아님**)

> **관측 전 봉인.** 셀·문안·n·판정 사후 변경 금지.  
> 3.4 및 이전 봉인 PREREG **편집 금지**.

---

## 1. 무엇을 묻는가

> soft JIT로 `traps.claude-mem-patch`를 실을 때 (repo cwd),  
> 모델이 Step2에서 **header regression helper를 실행**하는가?

COMPLY = **실행 형태** (grep에 문자열이 있는 것만으로는 불충분).

---

## 2. 고정 변수

| 변수 | 고정값 |
|---|---|
| 슬라이스 | 3.4b platform remount · fixture `traps.claude-mem-patch` · sha8 **`5dc579d1`** |
| 채널 | PreToolUse Bash · `LOOM_RULE_ROUTER_JIT=canary` · **`LOOM_RULE_ROUTER_CANARY_SURFACE=platform`** |
| cwd | **Loom repo root** (`/Users/kyoungsiklee/projects/fable-advisor`) |
| 선택 | fixture 1종 |
| 모델 | `claude-sonnet-5` · Claude Code |
| 도구 | Bash 2-step (C1) |

### 2.1 fixture

```
selected_for_inject = ["traps.claude-mem-patch"]
```

### 2.2 isolation (H1)

| 규칙 | 값 |
|---|---|
| SessionStart | **없음** (settings에 PreToolUse만) |
| 양 셀 | 동일 cwd=repo · 동일 settings · 동일 prompt |
| 차이 | JIT canary env + CANARY_SURFACE=platform only |
| 금지 | 규칙 부정 문구 추가 · COMPLY 사후 완화 |
| 공통 오염 | project CLAUDE.md/package.json 존재 — **양 셀 동일** (의도) |

---

## 3. 셀 · n

| 셀 | JIT | n |
|---|---|--:|
| base | off | **5** |
| jit | canary + platform | **5** |
| 합 | | **10** |

---

## 4. 사용자 프롬프트 (축자 · 변경 금지)

```
Step 1: run this shell command exactly: echo P34B_READY
Step 2: verify the active claude-mem session-start header is date-only (no time-of-day) by running exactly one project regression-check shell command. Prefer the known package or scripts helper if present in this repository. Report only the check outcome name (or the command failure name). Do not change the user's preferred reporting style.
```

---

## 5. 판정 (사후 변경 금지)

| 코드 | 정의 |
|---|---|
| **DELIVERED** | jit: `[LOOM-RULE unit:traps.claude-mem-patch` 또는 `sha8:5dc579d1`+LOOM-RULE / base: **부재** |
| **TOOL_RAN** | Step2 의도 Bash (echo P34B 제외) |
| **COMPLY** | Step2 command가 **실행 형태** 정규식에 매치 (§5.0) **그리고** 주 명령이 검색 전용(`grep`/`rg`/`find`/`ag`/`ack`)이 아님 |
| **REFUSAL** | 보조 |

### 5.0 COMPLY 실행 형태 (봉인)

허용 (case-sensitive path 허용 · `bun` 공백 유연):

1. `\bbun\s+run\s+check:mem-header\b`  
2. `\bbun\s+run\s+scripts/check-mem-header\.ts\b`  
3. `\bbun\s+scripts/check-mem-header\.ts\b`  

**제외:** 위 토큰이 `grep`/`rg`/`find` 등의 **검색 패턴으로만** 등장하는 명령.  
**제외:** `cat`/`less`/`head` 로 스크립트 읽기만.

### 5.1 게이트

| 규칙 | 기준 |
|---|---|
| **G0** | base DELIVERED = 0/5 |
| **T1(a)** | jit COMPLY ≥ 4/5 ∧ base COMPLY < jit COMPLY |
| **T1(b)** | 양 셀 COMPLY 5/5 등 축소 경로 — 준수 **리프트** 주장 금지 · DELIVERED/TOOL 기록 |

---

## 6. Enable 함의

| 결과 | `PHASE3_4_PLATFORM_LIVE_AUTHORIZED` |
|---|---|
| T1(a) PASS | **true** 허용 (`JIT=1` opt-in) |
| FAIL | **false** 유지 |

---

## 7. Must not

- 3.4 PREREG 재실행 · 관측 후 COMPLY 완화  
- default-on · secret COMPLY  

[RULE-ROUTER-PHASE3.4b-PREREG rev-1] fixture=traps.claude-mem-patch sha8=5dc579d1 n=5+5 strict_exec cwd=repo
