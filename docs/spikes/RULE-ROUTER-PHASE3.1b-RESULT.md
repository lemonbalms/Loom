# Phase 3.1b 결과 — 모델 n=10 · **G0 PASS · T1(a) PASS** · ship soft live opt-in

작성 2026-07-28 · **rev-1** · 레인: 본세션(topology `single`)  
PREREG: [`RULE-ROUTER-PHASE3.1b-PREREG.md`](./RULE-ROUTER-PHASE3.1b-PREREG.md) rev-1  
SPEC-REV: [`RULE-ROUTER-PHASE3.1-SPEC-REV.md`](./RULE-ROUTER-PHASE3.1-SPEC-REV.md)  
선행 실패: 3.1 RESULT rev-2 T1 FAIL (H1 하네스 경쟁)

> PREREG 셀 불변. isolation = **absence not negation**.

---

## 0. 한 줄

**G0 PASS · T1(a) PASS (리프트).**  
base COMPLY **0/5** · jit COMPLY **5/5** · DELIVERED **5/5**.  
→ **`PHASE3_1_SHIP_LIVE_AUTHORIZED = true`** (soft · `LOOM_RULE_ROUTER_JIT=1` 필요).  
**default-on 금지.** hard 가드(B) **여전히 권고** (실세션 문서 경쟁).

---

## 1. 실행 좌표

| 항목 | 값 |
|---|---|
| 증거 | `~/.loom/phase3-1b-canary-2026-07-28/` |
| 모델 | `claude-sonnet-5` |
| probe CLAUDE | `# Probe` only |
| scorer | `code-p31b.py` sha8 `70ccb72b` (관측 전 복사) |
| fixture | `traps.bun-test-env` · `1172cf30` |

---

## 2. 점수

| cell | n | DELIVERED | TOOL_RAN | COMPLY | rc=0 |
|---|--:|---:|---:|---:|---:|
| base | 5 | **0/5** | 5/5 | **0/5** | 5/5 |
| jit | 5 | **5/5** | 5/5 | **5/5** | 5/5 |

jit bun commands: 전부  
`env -u LOOM_RELAY_TOKEN -u LOOM_RELAY_URL bun test`  
base: plain `bun test` / `bun test .`

| 게이트 | 결과 |
|---|---|
| G0 | **PASS** |
| T1 | **PASS via (a)** base 0 &lt; jit 5 · jit ≥ 4/5 |
| session_err | 0 |

---

## 3. 해석

1. 3.1 실패의 주 오염(H1) 제거 후 **준수 리프트 성립**.  
2. soft JIT는 **비경쟁 조건**에서 명령 형태 변경을 유도할 수 있다.  
3. 실세션에 반대 CLAUDE/NORMS가 있으면 H1 동형 실패 가능 → **hard 가드 권고 유지**.  
4. ship soft live = env opt-in only · unset=off.

---

## 4. Enable

| mode | ship |
|---|---|
| unset/off | no-op |
| canary | fixture inject |
| live=`1` | **inject 허용** (`PHASE3_1_SHIP_LIVE_AUTHORIZED`) |
| default-on | **금지** |

---

## 5. 다음

- hard `check-bun-test-env` 스파이크(선택·권고)  
- 3.2 dispatch **미개방** until 별 게이트  
- 3.1 PREREG **재측정 금지** (역사 기록)

[RULE-ROUTER-PHASE3.1b-RESULT rev-1] G0=PASS T1a=PASS COMPLY=5/5_vs_0/5 ship_soft_live=opt-in hard_guard=recommended
