# Phase 3.0 결과 — 구현 착수 · 결정론 canary 경로 검증 · **모델 n=10 미실행**

작성 2026-07-28 · **rev-1** · 레인: 본세션(topology `single`)  
PREREG: [`RULE-ROUTER-PHASE3-PREREG.md`](./RULE-ROUTER-PHASE3-PREREG.md) rev-1 sealed `bafa81f`  
SPEC: [`RULE-ROUTER-PHASE3-SPEC.md`](./RULE-ROUTER-PHASE3-SPEC.md) rev-1

> **PREREG 셀·판정 기준을 바꾸지 않았다.** 이 문서는 (A) 코드 착수 증거와  
> (B) **아직 열지 않은** 모델 10런 게이트를 분리해 기록한다.

---

## 0. 한 줄

**JIT 훅·테스트·settings 배선은 착수됐다.** canary fixture 주입 경로는 결정론적으로
DELIVERED를 증명했다. **PREREG T1 모델 10런은 아직 돌리지 않았다** → `LOOM_RULE_ROUTER_JIT=1`
live enable **여전히 금지**.

---

## 1. 구현 산출 (코드)

| 산출 | 좌표 |
|---|---|
| JIT 훅 | `scripts/rule-router-jit.ts` |
| 테스트 | `scripts/rule-router-jit.test.ts` (11 pass) |
| settings | `.claude/settings.json` PreToolUse `Agent\|Task` — **model-guard 뒤** append |
| select | `classifyTurn`/`route` re-export from `rule-router-eval.ts` (A-1 · 복사 없음) |
| 본문 | `extractUnitBody` only · canary sha8 **`de04b1fa`** assert |

### 1.1 모드

| `LOOM_RULE_ROUTER_JIT` | 동작 |
|---|---|
| unset / off | **no-op** (보수 기본 — SPEC 표의 “dry-run 기본”과 다름 → Deviations) |
| dry-run | 결정·receipt · context 없음 |
| canary | fixture `orch.model-explicit` only · sha 불일치 시 스킵 |
| 1 / live | A 선택 · pin 제외 · surface=delegation · C3 전체 스킵 |

### 1.2 결정론 증거

```text
echo '{"tool_name":"Agent","tool_input":{"model":"opus"}}' \
  | LOOM_RULE_ROUTER_JIT=canary bun run scripts/rule-router-jit.ts
→ hookSpecificOutput.additionalContext contains
  [LOOM-RULE unit:orch.model-explicit sha8:de04b1fa] + extracted body
```

`bun test scripts/rule-router-jit.test.ts` → **11/11 pass** (with eval+registry: 64/64).

---

## 2. PREREG 게이트 상태

| 규칙 | 상태 |
|---|---|
| G0 base DELIVERED 0/5 | **미측정** (모델 런 없음) |
| T1 / T1(b) | **미측정** |
| DELIVERED 경로 (결정론) | **성립** (stdin canary) |
| live enable (`=1`) | **금지** 유지 |

---

## 3. 다음 게이트

1. F1 계열과 동형으로 **모델 10런**(base 5 + jit 5) 실행 · 채점기 digest 사전 고정  
2. `RULE-ROUTER-PHASE3-RESULT` rev-2에 T1/T1(b) 기입  
3. 통과 시에만 opt-in live 문서화 · **default-on 여전히 오너 선포 전 금지**

---

## 4. Must not (유지)

- PREREG 사후 편집 · holdout 개봉 · U2 처방 · pin=회피 · default-on

[RULE-ROUTER-PHASE3-RESULT rev-1] impl=yes unit_tests=11 model_canary=pending live=forbidden
