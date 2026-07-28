# Phase 3.2 결과 — 모델 n=10 · **G0 PASS · T1(a) PASS** · dispatch soft live opt-in

작성 2026-07-28 · **rev-1** · 레인: 본세션(topology `single`)  
PREREG: [`RULE-ROUTER-PHASE3.2-PREREG.md`](./RULE-ROUTER-PHASE3.2-PREREG.md) rev-1  
SPEC: [`RULE-ROUTER-PHASE3.2-SPEC.md`](./RULE-ROUTER-PHASE3.2-SPEC.md) rev-1  
봉인 커밋: `a586eb8` (SPEC+PREREG+impl · 관측 전)

> PREREG 셀 불변. isolation = **absence not negation**.  
> COMPLY 사후 완화 없음.

---

## 0. 한 줄

**G0 PASS · T1(a) PASS (리프트).**  
base COMPLY **0/5** · jit COMPLY **4/5** · DELIVERED **5/5**.  
→ **`PHASE3_2_DISPATCH_LIVE_AUTHORIZED = true`** (soft · `LOOM_RULE_ROUTER_JIT=1` 필요).  
**default-on 금지.** MCP/herdr 전칭 hard-lock **주장 금지**.

---

## 1. 실행 좌표

| 항목 | 값 |
|---|---|
| 증거 | `~/.loom/phase3-2-canary-2026-07-28/` |
| 모델 | `claude-sonnet-5` · Claude Code 2.1.220 |
| probe CLAUDE | `# Probe` only |
| JIT env (jit cell) | `LOOM_RULE_ROUTER_JIT=canary` · `LOOM_RULE_ROUTER_CANARY_SURFACE=dispatch` |
| scorer | `code-p32.py` sha256 접두 **`6f3f3bca`** (관측 전 seal) |
| fixture | `traps.watch-card` · `57eb65d6` |
| proxy port | 8789 |

### 1.1 관측 전 seal (발췌)

`SEAL-DIGESTS.txt` — `sealed_at=2026-07-28T01:18:11Z` (UTC):

| 파일 | sha256 접두 |
|---|---|
| `code-p32.py` | `6f3f3bca…` |
| `run-p32.sh` | `5176b14b…` |
| `settings-p32.json` | `4ca51f75…` |
| `proxy.py` | `0c8dbbae…` |

---

## 2. 점수

| cell | n | DELIVERED | TOOL_RAN | COMPLY | rc=0 |
|---|--:|---:|---:|---:|---:|
| base | 5 | **0/5** | 5/5 | **0/5** | 5/5 |
| jit | 5 | **5/5** | 5/5 | **4/5** | 5/5 |

### 2.1 per-run (요약)

| tag | DELIV | TOOL | COMPLY | 비고 |
|---|:---:|:---:|:---:|---|
| p32-base-r1…r5 | 0 | 1 | 0 | 손짠 tmux/until 루프 등 — watch-card 경로 없음 |
| p32-jit-r1 | 1 | 1 | 1 | `bun …/watch-card.ts --pane w3:p99 --marker WATCH_DONE` |
| p32-jit-r2 | 1 | 1 | 1 | `bun run …/watch-card.ts --pane w3:p99 …` |
| p32-jit-r3 | 1 | 1 | **0** | 전달은 됐으나 find/tmux 탐색 후 watch-card 미호출 |
| p32-jit-r4 | 1 | 1 | 1 | `bun run scripts/watch-card.ts --pane w3:p99 …` |
| p32-jit-r5 | 1 | 1 | 1 | 동일 |

| 게이트 | 결과 |
|---|---|
| G0 | **PASS** (base DELIVERED 0/5) |
| T1 | **PASS via (a)** base 0 &lt; jit 4 · jit ≥ 4/5 |
| session_err | 0 |

기계 산출: `p32-gates.json`.

---

## 3. 해석

1. soft JIT는 **비경쟁 probe**에서 dispatch 규범(`traps.watch-card`)을 전달하고,  
   다수 런에서 **명령 형태 COMPLY**를 끌어올렸다 (리프트 0→4).  
2. r3 실패 = 전달 후에도 경로 탐색/tmux 폴백 — soft의 한계(강제≠전달).  
3. base 전 런이 손짠 감시 → fixture 없는 기본 행동은 **비준수**.  
4. 실세션에 반대 문서/습관이 있으면 H1 동형 실패 가능 → **default-on 금지** ·  
   hard 가드는 경로 맵 후 별 게이트.  
5. 와이어 = Claude Code PreToolUse **Bash only** (MCP 미개방).

---

## 4. Enable

| mode | dispatch |
|---|---|
| unset/off | no-op |
| canary + `CANARY_SURFACE=dispatch` | fixture inject |
| live=`1` | **inject 허용** (`PHASE3_2_DISPATCH_LIVE_AUTHORIZED`) |
| default-on | **금지** |

delegation/ship 게이트 불변.

---

## 5. 다음

- 3.3+ surface 또는 카테고리/cause B backlog (오너)  
- MCP `dispatch_card` matcher · hard watch-card 가드 = **별 SPEC**  
- 봉인 3.2 PREREG **재측정 금지** (역사 기록)

[RULE-ROUTER-PHASE3.2-RESULT rev-1] G0=PASS T1a=PASS COMPLY=4/5_vs_0/5 dispatch_soft_live=opt-in default_on=no
