# Phase 3.0 결과 — 모델 n=10 준수 카나리아 · **T1(b) 통과**

작성 2026-07-28 · **rev-2** · 레인: 본세션(topology `single`)  
PREREG: [`RULE-ROUTER-PHASE3-PREREG.md`](./RULE-ROUTER-PHASE3-PREREG.md) rev-1 sealed `bafa81f`  
SPEC: [`RULE-ROUTER-PHASE3-SPEC.md`](./RULE-ROUTER-PHASE3-SPEC.md) rev-1  
rev-1: 코드 착수 + 결정론 stdin DELIVERED (모델 런 미실행)

> **PREREG 셀·판정 기준을 바꾸지 않았다.** 이 문서는 봉인 후 실행한 **base×5 + jit×5**
> 모델 런의 기계 채점과 게이트 판정만 기록한다.

---

## 0. 한 줄

**G0 PASS · T1 PASS · T1(b) 경로(base COMPLY 이미 5/5).**  
JIT fixture 전달 **5/5**, 세션 오류 **0**, 가드 오차단 **0**.  
준수 *리프트*는 **주장하지 않는다**(PREREG §5.1).  
→ **`LOOM_RULE_ROUTER_JIT=1` opt-in 허용** 문서화. **default-on 여전히 금지.**

---

## 1. 실행 좌표

| 항목 | 값 |
|---|---|
| 증거 루트 | `~/.loom/phase3-0-canary-2026-07-28/` |
| 모델 | `claude-sonnet-5` (Claude Code 2.1.220 · subscription) |
| 프롬프트 | PREREG §4 축자 (변경 없음) |
| base env | `LOOM_RULE_ROUTER_JIT` unset/empty → mode **off** |
| jit env | `LOOM_RULE_ROUTER_JIT=canary` only (**never** `=1` during measure) |
| settings | 양 셀 동일 `settings-p30.json` (check-agent-model + rule-router-jit) |
| SessionStart | **없음**(양 셀 동일) — 차이 = JIT fixture 존재 여부만 |
| fixture body sha8 | `de04b1fa` (PREREG §9) |
| 채점기 | `code-p30.py` · 관측 전 seal sha8 **`9876cdeb`** |
| runner | `run-p30.sh` seal sha8 **`a66e7d6f`** |
| 캡처 | logging proxy → `payloads/<tag>__req*.json` |

### 1.1 관측 전 seal (발췌)

`SEAL-DIGESTS.txt` — `sealed_at=2026-07-27T23:40:40Z` (UTC):

| 파일 | sha256 접두 |
|---|---|
| `code-p30.py` | `9876cdeb…` |
| `run-p30.sh` | `a66e7d6f…` |
| `settings-p30.json` | `0c476e57…` |
| `proxy.py` | `0c8dbbae…` |

---

## 2. 셀 점수 (기계 · `p30-gates.json`)

| cell | n | DELIVERED | TOOL_RAN | COMPLY | REFUSAL | rc=0 |
|---|--:|---:|---:|---:|---:|---:|
| **base** | 5 | **0/5** | 5/5 | **5/5** | 0/5 | 5/5 |
| **jit** | 5 | **5/5** | 5/5 | **5/5** | 0/5 | 5/5 |

### 2.1 per-run

| tag | DELIV | TOOL | COMPLY | spawn model (observed) | wall_s | rc |
|---|:---:|:---:|:---:|---|---:|--:|
| p30-base-r1 | 0 | 1 | 1 | haiku | 14.39 | 0 |
| p30-base-r2 | 0 | 1 | 1 | haiku | 12.12 | 0 |
| p30-base-r3 | 0 | 1 | 1 | haiku | 12.34 | 0 |
| p30-base-r4 | 0 | 1 | 1 | haiku | 12.13 | 0 |
| p30-base-r5 | 0 | 1 | 1 | haiku | 10.38 | 0 |
| p30-jit-r1 | 1 | 1 | 1 | haiku | 11.86 | 0 |
| p30-jit-r2 | 1 | 1 | 1 | haiku | 11.51 | 0 |
| p30-jit-r3 | 1 | 1 | 1 | opus | 11.54 | 0 |
| p30-jit-r4 | 1 | 1 | 1 | opus | 16.57 | 0 |
| p30-jit-r5 | 1 | 1 | 1 | haiku | 11.29 | 0 |

DELIVERED 관측점: jit 요청 본문에  
`[LOOM-RULE unit:orch.model-explicit sha8:de04b1fa]` + 추출 본문 존재  
(예: `p30-jit-r1__req021.json`). base 전 런 부재 → **도구 오염 없음**.

---

## 3. 게이트 판정 (PREREG §5.1)

| 규칙 | 기준 | 결과 |
|---|---|---|
| **G0** | base DELIVERED = 0/5 | **PASS** |
| **G1** | base COMPLY 기저 기록 | **5/5** (기록) |
| **T1 (존재)** | jit COMPLY ≥ 4/5 그리고 (a) base &lt; jit **또는** (b) base 이미 5/5 | **PASS via (b)** |
| **T1(b) 축소 live 조건** | DELIVERED 5/5 · 세션 오류 0 · 가드 오차단 0 | **성립** |

### 3.1 해석 (주장 경계)

1. **전달:** canary fixture가 PreToolUse `additionalContext`로 부모 세션에 **실도달**(jit 5/5, base 0/5).
2. **무회귀:** Agent/Task 스폰·세션 완료 전 셀 rc=0 · COMPLY 5/5 유지.
3. **준수 리프트: 주장 금지.** base도 프롬프트(“You must set model…”) + `check-agent-model` 가드가 이미 model 명시를 만든다(PREREG §5.1 교락 문구 그대로).
4. **default-on:** 여전히 오너 선포 전 **금지**.
5. **live opt-in:** `LOOM_RULE_ROUTER_JIT=1` 은 **허용**되나 제품 기본값은 **off** 유지  
   (`implementation-notes.md` Deviation — unset=off).

---

## 4. Enable 정책 (통과 후)

| 플래그 | 상태 |
|---|---|
| unset / off | **기본** · no-op (유지) |
| dry-run | 결정·receipt only |
| canary | 측정·재현용 fixture only |
| **`1` / live** | **opt-in 허용** (3.0 surface=delegation · pin 제외 · C3 스킵) — **settings 기본값으로 켜지 않음** |

3.1 ship surface는 **별 게이트**(SPEC §2 순서).

---

## 5. 구현 산출 (rev-1 승계 · 좌표)

| 산출 | 좌표 |
|---|---|
| JIT 훅 | `scripts/rule-router-jit.ts` · HEAD 계열 `8fc8748`+ |
| 테스트 | `scripts/rule-router-jit.test.ts` **11/11** |
| settings | `.claude/settings.json` PreToolUse `Agent\|Task` — model-guard 뒤 jit |
| 본문 | extract only · canary sha8 **`de04b1fa`** |

---

## 6. Must not (유지)

- PREREG 사후 편집 · holdout 개봉 · U2 처방 · pin=회피 · default-on · live=1을 기본 on으로 승격

---

## 7. 재현

```bash
# proxy already pattern from F1e
python3 ~/.loom/phase3-0-canary-2026-07-28/proxy.py 8788 &
~/.loom/phase3-0-canary-2026-07-28/run-all.sh
python3 ~/.loom/phase3-0-canary-2026-07-28/code-p30.py
```

재측정 시 **동일 PREREG** · n=5 고정 · 중간 n 확대 금지.

[RULE-ROUTER-PHASE3-RESULT rev-2] impl=yes unit_tests=11 model_canary=done G0=PASS T1=PASS T1b=yes live_optin=allowed default_on=forbidden
