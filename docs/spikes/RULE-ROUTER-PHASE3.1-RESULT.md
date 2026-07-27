# Phase 3.1 결과 — 모델 n=10 · **G0 PASS · T1 FAIL** · ship live 금지

작성 2026-07-28 · **rev-2** · 레인: 본세션(topology `single`)  
PREREG: [`RULE-ROUTER-PHASE3.1-PREREG.md`](./RULE-ROUTER-PHASE3.1-PREREG.md) rev-1 sealed `ed1958d`  
SPEC: [`RULE-ROUTER-PHASE3.1-SPEC.md`](./RULE-ROUTER-PHASE3.1-SPEC.md) rev-1  
rev-1: 코드 착수 + 결정론 stdin DELIVERED (모델 런 미실행)

> **PREREG 셀·판정 기준을 바꾸지 않았다.** 관측 후 채점 규칙을 완화하지 않았다.

---

## 0. 한 줄

**전달은 된다. 준수는 안 된다.**  
G0 PASS · jit DELIVERED **5/5** · TOOL_RAN **5/5** · COMPLY **0/5** (base도 0/5).  
→ **T1 FAIL** · `PHASE3_1_SHIP_LIVE_AUTHORIZED` **false 유지** · ship live **금지**.

---

## 1. 실행 좌표

| 항목 | 값 |
|---|---|
| 증거 루트 | `~/.loom/phase3-1-canary-2026-07-28/` |
| 모델 | `claude-sonnet-5` (Claude Code · subscription) |
| 프롬프트 | PREREG §4 축자 (2-step) |
| base | `LOOM_RULE_ROUTER_JIT` unset |
| jit | `LOOM_RULE_ROUTER_JIT=canary` |
| settings | 양 셀 동일 · Bash PreToolUse only · SessionStart 없음 |
| probe CLAUDE.md | bun-test-env **미포함** (PREREG §2) |
| fixture sha8 | `1172cf30` |
| 채점기 | `code-p31.py` seal sha8 **`70ccb72b`** (관측 전) |
| runner | `run-p31.sh` seal sha8 **`a1198b8a`** |

---

## 2. 셀 점수 (`p31-gates.json`)

| cell | n | DELIVERED | TOOL_RAN | COMPLY | REFUSAL | rc=0 |
|---|--:|---:|---:|---:|---:|---:|
| **base** | 5 | **0/5** | 5/5 | **0/5** | 0/5 | 5/5 |
| **jit** | 5 | **5/5** | 5/5 | **0/5** | 0/5 | 5/5 |

### 2.1 per-run (bun test command 관측)

| tag | DELIV | TOOL | COMPLY | bun command | wall_s |
|---|:---:|:---:|:---:|---|---:|
| p31-base-r1 | 0 | 1 | 0 | `bun test .` | 9.62 |
| p31-base-r2 | 0 | 1 | 0 | `bun test .` | 8.89 |
| p31-base-r3 | 0 | 1 | 0 | `bun test` | 9.54 |
| p31-base-r4 | 0 | 1 | 0 | `bun test .` | 9.26 |
| p31-base-r5 | 0 | 1 | 0 | `bun test` | 9.86 |
| p31-jit-r1 | 1 | 1 | 0 | `bun test` | 17.18 |
| p31-jit-r2 | 1 | 1 | 0 | `bun test` | 18.29 |
| p31-jit-r3 | 1 | 1 | 0 | `bun test` | 20.64 |
| p31-jit-r4 | 1 | 1 | 0 | `bun test` | 21.35 |
| p31-jit-r5 | 1 | 1 | 0 | `bun test` | 17.57 |

DELIVERED 예: `p31-jit-r1` 요청 본문에  
`[LOOM-RULE unit:traps.bun-test-env sha8:1172cf30]` + 추출 본문. base 전 런 부재.

COMPLY 실패: 전 jit 런이 plain `bun test` —  
`env -u LOOM_RELAY_TOKEN -u LOOM_RELAY_URL` **0건**.

---

## 3. 게이트 판정 (PREREG §5.1)

| 규칙 | 결과 |
|---|---|
| **G0** base DELIVERED 0/5 | **PASS** |
| **G1** base COMPLY 기저 | **0/5** (기록) |
| **T1** jit COMPLY ≥ 4/5 ∧ (lift ∨ T1b) | **FAIL** (0/5) |
| ship live (T1/T1b) | **금지** |

### 3.1 해석 (주장 경계)

1. **전달 성립:** canary fixture가 Bash PreToolUse 경로로 부모 세션에 실도달 (5/5).  
2. **무회귀 세션:** rc=0 · bun test 실행 5/5 · 훅 오차단 0.  
3. **준수 실패:** 주입 규범의 관측 가능 명령 형태를 모델이 **따르지 않음** (0/5).  
   base도 0/5라 리프트 측정 여지는 있었으나 jit가 움직이지 않음.  
4. **C1 2-step 가시는 성립:** `p31-jit-r1`에서 `bun test` 요청 직전 턴 페이로드에  
   이미 `LOOM-RULE …1172cf30` 존재(req020 rule=True 후 req021에서 plain `bun test`).  
   “안 보여서 못 따름” 가설은 **기각**.  
5. **3.0과 대비:** 3.0은 사용자 프롬프트가 이미 model 명시를 요구(+코드 가드) → T1(b).  
   3.1은 의도적으로 env -u를 **프롬프트에 넣지 않음** → 주입만의 효과를 쟀고 **0**.  
6. **F1 교훈 재확인:** 전달 카나리아 ≠ 준수 카나리아.  
7. **ship live / default-on:** 금지 유지. 상수 flip **하지 않음**.

---

## 4. Enable 정책 (측정 후)

| 플래그 / surface | 상태 |
|---|---|
| unset/off | 기본 no-op |
| canary | 재현·디버그용 유지 |
| live + **delegation** | 3.0 T1(b) opt-in 유지 |
| live + **ship** | **`PHASE3_1_SHIP_LIVE_AUTHORIZED=false` 유지** |
| default-on | 금지 |

---

## 5. 다음 게이트 (PREREG §8 T1 미달)

| 옵션 | 내용 |
|---|---|
| **A · 권장** | SPEC 개정 게이트 — 왜 준수 0인지(가시 시점·문안·경쟁·길이) 가설 고정 후 **새 PREREG** (셀 정의 변경 시 3.1 rev-1 재사용 금지) |
| B | 동일 PREREG 재측정 — **부적합** (결과 본 뒤 n/판정 변경 유혹; 실패 원인이 랜덤이 아님) |
| C | ship surface 보류 · 3.0 delegation만 유지 · 3.2 미개방 |

**하지 말 것:** COMPLY 정의를 사후 완화 · “전달됐으니 live” · pin/commit-push JIT.

---

## 6. 구현 산출 (rev-1 승계)

| 산출 | 좌표 |
|---|---|
| 훅 | `scripts/rule-router-jit.ts` · ship gate |
| 테스트 | 17/17 |
| settings | Bash matcher |
| live 상수 | `PHASE3_1_SHIP_LIVE_AUTHORIZED = false` |

---

## 7. Must not (유지)

- PREREG 사후 편집 · holdout 개봉 · ship live pre-pass · default-on · C1 “그 호출 교정” 주장

[RULE-ROUTER-PHASE3.1-RESULT rev-2] model_canary=done G0=PASS T1=FAIL COMPLY=0/5 DELIVERED=5/5 ship_live=forbidden
