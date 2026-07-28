# Phase 3.4 결과 — 모델 n=10 · **G0 PASS · T1(a) FAIL** · platform live **blocked**

작성 2026-07-28 · **rev-1** · 레인: 본세션(topology `single`)  
PREREG: [`RULE-ROUTER-PHASE3.4-PREREG.md`](./RULE-ROUTER-PHASE3.4-PREREG.md) rev-1  
SPEC: [`RULE-ROUTER-PHASE3.4-SPEC.md`](./RULE-ROUTER-PHASE3.4-SPEC.md) rev-1  
hook: `scripts/rule-router-jit.ts` (platform lane · live gated)

> PREREG 셀 불변. isolation = **absence not negation**.  
> COMPLY 사후 완화 없음. **live flip 없음.**

---

## 0. 한 줄

**G0 PASS · T1(a) FAIL** (jit COMPLY **3/5** &lt; 4 · base **0/5**).  
DELIVERED jit **5/5** · TOOL_RAN **5/5** 양 셀.  
→ **`PHASE3_4_PLATFORM_LIVE_AUTHORIZED = false` 유지**.  
**default-on 금지.** 봉인 PREREG **재측정 금지.**

---

## 1. 실행 좌표

| 항목 | 값 |
|---|---|
| 증거 | `~/.loom/phase3-4-canary-2026-07-28/` |
| 모델 | `claude-sonnet-5` · Claude Code 2.1.220 |
| probe CLAUDE | `# Probe` only |
| JIT env (jit) | `LOOM_RULE_ROUTER_JIT=canary` · `LOOM_RULE_ROUTER_CANARY_SURFACE=platform` |
| scorer | `code-p34.py` sha256 **`7b4552f3…`** (관측 전 seal) |
| fixture | `traps.claude-mem-patch` · `5dc579d1` |
| proxy port | 8791 |

### 1.1 seal 발췌

`SEAL-DIGESTS.txt` — `sealed_at=2026-07-28T05:01:59Z`:

| 파일 | sha256 접두 |
|---|---|
| `code-p34.py` | `7b4552f3…` |
| `run-p34.sh` | `b819303f…` |
| `settings-p34.json` | `4ca51f75…` |
| `proxy.py` | `0c8dbbae…` |

---

## 2. 점수

| cell | n | DELIVERED | TOOL_RAN | COMPLY | rc=0 |
|---|--:|---:|---:|---:|---:|
| base | 5 | **0/5** | **5/5** | **0/5** | 5/5 |
| jit | 5 | **5/5** | **5/5** | **3/5** | 5/5 |

### 2.1 per-run

| tag | DELIV | TOOL | COMPLY | 비고 |
|---|:---:|:---:|:---:|---|
| p34-base-r1…r5 | 0 | 1 | 0 | find/탐색 · helper 경로 없음 (probe 격리) |
| p34-jit-r1 | 1 | 1 | **1** | 탐색 후 **`bun run scripts/check-mem-header.ts`** |
| p34-jit-r2 | 1 | 1 | **1** | `grep -rl "check:mem-header\|…"` 등 문자열 포함 (PREREG 부분일치) · 최종은 API probe 쪽 |
| p34-jit-r3 | 1 | 1 | **0** | find/curl 폴백 · helper 미호출 |
| p34-jit-r4 | 1 | 1 | **1** | grep 패턴에 `check:mem-header` 포함 · 실행은 탐색/curl 혼합 |
| p34-jit-r5 | 1 | 1 | **0** | find/curl · helper 미호출 |

| 게이트 | 결과 |
|---|---|
| G0 | **PASS** |
| T1(a) | **FAIL** (3 ≱ 4) |
| session_err | 0 |

기계: `p34-gates.json`.

---

## 3. 해석

1. **G0·전달 성공** — base 누수 0 · jit DELIVERED 5/5 (3.3보다 개선: 시크릿-shaped 거부 없음).  
2. **TOOL_RAN 전량** — 모델이 Step2를 시도 (3.3 export 거부와 대조).  
3. **준수 리프트 부분** — base 0 → jit 3. soft JIT가 도움 힌트를 준 런 있음 (r1 실 helper 호출).  
4. **T1 미달** — 4/5 임계 미달. r3/r5는 주입 후에도 find/curl 폴백.  
5. **COMPLY 정의 한계 (기록만 · 사후 강화 금지)** — 봉인 scorer는 부분문자열이라  
   `grep … check:mem-header` 도 가산. 엄격 “실행 형태만”이면 r1 중심일 수 있으나  
   **관측 후 재채점 금지** — 역사 점수는 3/5 고정.  
6. probe cwd에 프로젝트 없음 → base가 helper를 모름 (의도된 H1).

---

## 4. Enable

| mode | platform |
|---|---|
| unset/off | no-op |
| canary + `CANARY_SURFACE=platform` | fixture inject |
| live=`1` | **금지** (`PHASE3_4_PLATFORM_LIVE_AUTHORIZED=false`) |
| default-on | **금지** |

3.0–3.2 live · 3.3 blocked **불변**.

---

## 5. 다음 (재측정 아님)

- 이 PREREG 재실행·COMPLY 완화 **금지**.  
- 후속은 **새** SPEC+PREREG만 예:
  - COMPLY = `bun run check:mem-header` **실행 형태** 강화 (grep 문자열 제외) · cwd=repo  
  - 또는 product MINOR / Phase 3 close / defer  
- hook platform 레인 유지 · live false.

[RULE-ROUTER-PHASE3.4-RESULT rev-1] G0=PASS T1a=FAIL COMPLY=3/5_vs_0/5 DELIVERED=5/5 platform_live=blocked
