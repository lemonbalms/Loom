# Phase 3.1 결과 — 구현 착수 · **모델 n=10 미실행**

작성 2026-07-28 · **rev-1** · 레인: 본세션(topology `single`)  
PREREG: [`RULE-ROUTER-PHASE3.1-PREREG.md`](./RULE-ROUTER-PHASE3.1-PREREG.md) rev-1 sealed (동 웨이브 커밋)  
SPEC: [`RULE-ROUTER-PHASE3.1-SPEC.md`](./RULE-ROUTER-PHASE3.1-SPEC.md) rev-1

> **PREREG 셀·판정 기준을 바꾸지 않았다.** 이 문서는 (A) 코드 착수 증거와  
> (B) **아직 열지 않은** 모델 10런 게이트를 분리해 기록한다.

---

## 0. 한 줄

**ship 레인·3.1 canary fixture·settings Bash 배선·유닛 테스트는 착수됐다.**  
stdin canary는 `traps.bun-test-env` DELIVERED를 결정론적으로 증명했다.  
**PREREG T1 모델 10런은 아직 돌리지 않았다** → ship live inject **여전히 금지**  
(`PHASE3_1_SHIP_LIVE_AUTHORIZED = false`).

---

## 1. 구현 산출

| 산출 | 좌표 |
|---|---|
| JIT 훅 | `scripts/rule-router-jit.ts` — multi-surface · ship gate |
| 테스트 | `scripts/rule-router-jit.test.ts` (**17 pass**) |
| settings | `.claude/settings.json` — **Bash** matcher 추가 (Agent\|Task 유지) |
| fixture | `traps.bun-test-env` · sha8 **`1172cf30`** |
| live gate | `PHASE3_1_SHIP_LIVE_AUTHORIZED = false` · reason `ship_gate_blocked` |

### 1.1 모드 × surface

| mode | Agent\|Task | Bash |
|---|---|---|
| off | no-op | no-op |
| dry-run | delegation select · no inject | ship keyword/utterance · no inject |
| canary | 3.0 fixture `orch.model-explicit` | **3.1 fixture** `traps.bun-test-env` (echo 포함) |
| live | delegation inject (3.0 T1b) | **blocked** until 3.1 canary PASS |

### 1.2 결정론 증거

```text
echo '{"tool_name":"Bash","tool_input":{"command":"echo P31_READY"}}' \
  | LOOM_RULE_ROUTER_JIT=canary bun run scripts/rule-router-jit.ts
→ unit:traps.bun-test-env sha8:1172cf30

echo '{"tool_name":"Bash","tool_input":{"command":"bun test"}}' \
  | LOOM_RULE_ROUTER_JIT=1 bun run scripts/rule-router-jit.ts
→ no additionalContext · skipped_reason ship_gate_blocked (receipt)
```

`bun test scripts/rule-router-jit.test.ts` → **17/17 pass**.

---

## 2. PREREG 게이트 상태

| 규칙 | 상태 |
|---|---|
| G0 base DELIVERED 0/5 | **미측정** |
| T1 / T1(b) | **미측정** |
| DELIVERED 경로 (결정론) | **성립** (stdin canary) |
| ship live | **금지** 유지 |

---

## 3. 다음 게이트

1. 채점·캡처 스크립트 **관측 전** digest 고정  
2. 모델 10런 (base 5 + jit 5 · 2-step 프롬프트 축자)  
3. `RULE-ROUTER-PHASE3.1-RESULT` **rev-2** · ship live 상수 검토  

---

## 4. Must not (유지)

- PREREG 사후 편집 · 3.0/F1* 재개방 · default-on · ship live pre-pass · pin JIT

[RULE-ROUTER-PHASE3.1-RESULT rev-1] impl=yes unit_tests=17 model_canary=pending ship_live=forbidden
