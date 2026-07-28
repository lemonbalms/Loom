# Phase 3.4b 결과 — 모델 n=10 · **G0 PASS · T1(a) FAIL** · platform live **blocked**

작성 2026-07-28 · **rev-1** · 레인: 본세션(topology `single`)  
PREREG: [`RULE-ROUTER-PHASE3.4b-PREREG.md`](./RULE-ROUTER-PHASE3.4b-PREREG.md) rev-1  
SPEC: [`RULE-ROUTER-PHASE3.4b-SPEC.md`](./RULE-ROUTER-PHASE3.4b-SPEC.md) rev-1  
선행: [`RULE-ROUTER-PHASE3.4-RESULT.md`](./RULE-ROUTER-PHASE3.4-RESULT.md) (재측정 아님)

> PREREG 셀 불변. isolation = 양 셀 동일 repo cwd · 차이=JIT only.  
> COMPLY 사후 완화 없음. **live flip 없음** (Enable = T1(a) only).

---

## 0. 한 줄

**G0 PASS · T1(a) FAIL** — base COMPLY **5/5** · jit COMPLY **5/5** (리프트 0).  
DELIVERED jit **5/5** · TOOL_RAN 양 셀 **5/5**.  
→ **`PHASE3_4_PLATFORM_LIVE_AUTHORIZED = false` 유지**.  
원인: **repo cwd + package script 가시성**으로 base가 helper를 이미 실행 (천장).

---

## 1. 실행 좌표

| 항목 | 값 |
|---|---|
| 증거 | `~/.loom/phase3-4b-canary-2026-07-28/` |
| 모델 | `claude-sonnet-5` · Claude Code 2.1.220 |
| cwd | **repo root** (Loom) |
| JIT (jit cell) | `canary` · `CANARY_SURFACE=platform` |
| scorer | `code-p34b.py` sha256 **`58cbe943…`** (strict exec) |
| fixture | `traps.claude-mem-patch` · `5dc579d1` |
| proxy | 8792 |

### 1.1 seal

`sealed_at=2026-07-28T05:20:38Z` — `code-p34b.py` · `run-p34b.sh` · settings · proxy.

---

## 2. 점수

| cell | n | DELIVERED | TOOL_RAN | COMPLY | rc=0 |
|---|--:|---:|---:|---:|---:|
| base | 5 | **0/5** | **5/5** | **5/5** | 5/5 |
| jit | 5 | **5/5** | **5/5** | **5/5** | 5/5 |

전 런 Step2 ≈ `bun run check:mem-header` (strict COMPLY 매치).  
base-r3는 `grep package.json` 후 동일 실행.

| 게이트 | 결과 |
|---|---|
| G0 | **PASS** |
| T1(a) | **FAIL** (base COMPLY ≮ jit COMPLY) |
| T1(b) 기록 | 양 셀 COMPLY 5/5 · DELIVERED jit 5/5 — **리프트 주장 금지** · live 미승격 |

---

## 3. 해석

1. **strict COMPLY 성공** — grep 문자열 가산 없이 실 helper 실행만 채점.  
2. **repo cwd 천장** — `package.json` 스크립트/`scripts/check-mem-header.ts`가 보여  
   **JIT 없이도** base 전원이 COMPLY. soft JIT 준수 리프트를 측정할 여지가 없음.  
3. **전달은 성립** — jit DELIVERED 5/5 · G0 유지 (base에 fixture 누수 0).  
4. **3.4(빈 probe) vs 3.4b(repo)** 트레이드오프 실증:  
   빈 probe → helper 미발견·COMPLY 낮음 · repo → base 천장·리프트 0.  
5. Enable 문안상 **T1(a)만 live** → **flip 안 함**.

---

## 4. Enable

| mode | platform |
|---|---|
| live=`1` | **금지** (`PHASE3_4_…=false`) |
| default-on | **금지** |

---

## 5. 다음 (재측정 아님)

- 3.4 / 3.4b PREREG **재실행 금지**.  
- platform soft live **보류**가 정직한 결론 (측정 가능 리프트 없음).  
- 오너 pick: product MINOR · Phase 3 soft close (3.0–3.2) · 다른 surface/fixture · defer.  
- “cwd=repo면 항상 COMPLY” 교훈 → 향후 카나리아는 **base가 경로를 모르는 과제** 또는  
  **repo에 없는 가상 helper 이름**이 필요 (새 SPEC).

[RULE-ROUTER-PHASE3.4b-RESULT rev-1] G0=PASS T1a=FAIL COMPLY=5/5_vs_5/5 ceiling platform_live=blocked
