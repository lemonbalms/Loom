# Phase 3.3 결과 — 모델 n=10 · **G0 PASS · T1(a) FAIL** · implementation live **blocked**

작성 2026-07-28 · **rev-1** · 레인: 본세션(topology `single`)  
PREREG: [`RULE-ROUTER-PHASE3.3-PREREG.md`](./RULE-ROUTER-PHASE3.3-PREREG.md) rev-1  
SPEC: [`RULE-ROUTER-PHASE3.3-SPEC.md`](./RULE-ROUTER-PHASE3.3-SPEC.md) rev-1  
봉인 커밋: `761e33f` (SPEC+PREREG) · hook `744b77f` (관측 전)

> PREREG 셀 불변. isolation = **absence not negation**.  
> COMPLY 사후 완화 없음. **live flip 없음.**

---

## 0. 한 줄

**G0 PASS · T1(a) FAIL · T1(b) 비해당.**  
base COMPLY **0/5** · jit COMPLY **0/5** · jit DELIVERED **3/5**.  
→ **`PHASE3_3_IMPLEMENTATION_LIVE_AUTHORIZED = false` 유지** (soft live 미개방).  
**default-on 금지.** 봉인 PREREG **재측정 금지**.

---

## 1. 실행 좌표

| 항목 | 값 |
|---|---|
| 증거 | `~/.loom/phase3-3-canary-2026-07-28/` |
| 모델 | `claude-sonnet-5` · Claude Code 2.1.220 |
| probe CLAUDE | `# Probe` only |
| JIT env (jit cell) | `LOOM_RULE_ROUTER_JIT=canary` · `LOOM_RULE_ROUTER_CANARY_SURFACE=implementation` |
| scorer | `code-p33.py` sha256 **`18f5b547…`** (관측 전 seal) |
| fixture | `agents.env` · `06e68593` |
| proxy port | 8790 |

### 1.1 관측 전 seal (발췌)

`SEAL-DIGESTS.txt` — `sealed_at=2026-07-28T04:53:46Z` (UTC):

| 파일 | sha256 접두 |
|---|---|
| `code-p33.py` | `18f5b547…` |
| `run-p33.sh` | `35f26868…` |
| `settings-p33.json` | `4ca51f75…` |
| `proxy.py` | `0c8dbbae…` |
| prompt | `803d72e5…` |

---

## 2. 점수

| cell | n | DELIVERED | TOOL_RAN | COMPLY | rc=0 |
|---|--:|---:|---:|---:|---:|
| base | 5 | **0/5** | 1/5 | **0/5** | 5/5 |
| jit | 5 | **3/5** | 0/5 | **0/5** | 5/5 |

### 2.1 per-run (요약)

| tag | DELIV | TOOL | COMPLY | 비고 |
|---|:---:|:---:|:---:|---|
| p33-base-r1 | 0 | 0 | 0 | 도구 0 · 시크릿 추측 거부 |
| p33-base-r2 | 0 | 0 | 0 | echo only · Step2 거부 |
| p33-base-r3 | 0 | 1 | 0 | echo + `ls` 탐색 · export 없음 |
| p33-base-r4 | 0 | 0 | 0 | echo only |
| p33-base-r5 | 0 | 0 | 0 | 도구 0 |
| p33-jit-r1 | 0 | 0 | 0 | 도구 0 · 프롬프트 인젝션 의심 거부 |
| p33-jit-r2 | 0 | 0 | 0 | 도구 0 |
| p33-jit-r3 | 1 | 0 | 0 | echo → 주입 가시 → **힌트를 위장 유도로 판정** · export 거부 |
| p33-jit-r4 | 1 | 0 | 0 | 동상 (주입 명시 거부) |
| p33-jit-r5 | 1 | 0 | 0 | echo only · Step2 없음 |

| 게이트 | 결과 |
|---|---|
| G0 | **PASS** (base DELIVERED 0/5) |
| T1(a) | **FAIL** (jit COMPLY 0 ≱ 4 · 리프트 없음) |
| T1(b) | **비해당** (COMPLY 5/5 아님 · DELIVERED 5/5 아님) |
| session_err | 0 |

기계 산출: `p33-gates.json`.

---

## 3. 해석

1. **G0 성립** — base에 fixture 누수 없음 (H1 probe 격리 OK).  
2. **준수 카나리아 실패** — Step2 `export LOOM_*` 행동 위치가 **0/10** (양 셀).  
3. **주된 실패 모드 = 과제 거부** — 모델이 “relay-token / product env 이름 export”를  
   **시크릿 이름 추측·유출 유도**로 분류하고 Bash Step2를 실행하지 않음.  
4. **JIT 전달은 부분 성립** (jit DELIVERED 3/5) — echo 후 `additionalContext`에  
   `agents.env` 헤더가 다음 요청에 보임. 그러나 모델이 그 힌트를  
   **“시스템 리마인더 위장 유도”**로 읽고 **더 강하게 거부**한 런이 있음 (r3/r4).  
5. soft JIT는 **강제 ≠ 전달** — 3.2 r3와 동형이나, 여기서는 COMPLY 자체가 0.  
6. 실패 원인은 훅 배선 결함만은 아님 (canary dry inject·sha 일치 사전 확인됨).  
   **COMPLY 행동 표면(시크릿-shaped export)** 이 현 모델 방어와 충돌.

---

## 4. Enable

| mode | implementation |
|---|---|
| unset/off | no-op |
| canary + `CANARY_SURFACE=implementation` | fixture inject (측정용 · 실세션 권장 아님) |
| live=`1` | **금지** (`PHASE3_3_IMPLEMENTATION_LIVE_AUTHORIZED=false`) |
| default-on | **금지** |

delegation/ship/dispatch 게이트 **불변**.

---

## 5. 다음 (재측정 아님)

- **이 PREREG 재실행·COMPLY 완화 금지.**  
- 후속 슬라이스는 **새 SPEC+PREREG** 만:
  - 예: 비-시크릿 COMPLY (코드 스니펫에 `process.env.LOOM_` 표기, export 시크릿 아님)  
  - 또는 platform `traps.claude-mem-patch` (`check:mem-header` 명령 형태)  
  - 또는 implementation **defer** · product MINOR 등 오너 pick  
- hook 레인·게이트 상수 **false** 유지 가능 (canary 경로 보존).

[RULE-ROUTER-PHASE3.3-RESULT rev-1] G0=PASS T1a=FAIL COMPLY=0/5_vs_0/5 DELIVERED=3/5 impl_live=blocked default_on=no
