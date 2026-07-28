# Phase 3.4b 착수 명세 — platform JIT remount (strict COMPLY · repo cwd)

작성 2026-07-28 · **rev-1** · 레인: 본세션(topology `single`)  
Authority: [`RULE-ROUTER-PHASE3.4-RESULT.md`](./RULE-ROUTER-PHASE3.4-RESULT.md) rev-1  
(T1 FAIL · **재측정 아님** · 후속 슬라이스) ·  
[`RULE-ROUTER-PHASE3.4-SPEC.md`](./RULE-ROUTER-PHASE3.4-SPEC.md) rev-1 (surface·fixture 승계) ·  
H1 absence not negation

> **3.4 PREREG 재실행·COMPLY 사후 강화 금지.** 3.4b = **별 SPEC + PREREG**.  
> 3.4b 카나리아 통과 전 platform live **금지** (상수 false 유지).  
> default-on 금지 · 봉인 F1*/3.0–3.4 PREREG 불변.

---

## 0. 한 줄

동일 fixture **`traps.claude-mem-patch`** 로 soft JIT 준수를 재측정하되,  
**(1) COMPLY = helper **실행** 형태만** (grep 문자열 가산 금지) ·  
**(2) canary cwd = Loom repo root** (helper 실실행 가능).  
3.4 실패 원인(느슨한 부분일치 · 빈 probe)을 겨냥한 remount.

---

## 1. 3.4 → 3.4b 변경점

| 축 | 3.4 (sealed FAIL) | **3.4b** |
|---|---|---|
| surface / fixture / sha8 | platform · `traps.claude-mem-patch` · `5dc579d1` | **동일** |
| canary cwd | 빈 probe-cwd | **repo root** (`fable-advisor`) |
| COMPLY | 부분문자열 `check:mem-header` | **실행 형태만** (§2) |
| 프롬프트 | P34_READY | **P34B_READY** (새 축자 · PREREG) |
| live 상수 | `PHASE3_4_PLATFORM_LIVE_AUTHORIZED` | **동일 상수** — T1 PASS 시에만 true |

훅 레인: 기존 platform 레인 재사용 (코드 변경 최소 · canary 배선 동일).

---

## 2. COMPLY (strict · 결정론)

Step2 Bash가 **다음 중 하나와 매치**하고, 주 명령이 `grep`/`rg`/`find`/`ag` **검색 전용**이 아닐 것:

| 허용 형태 (예) |
|---|
| `bun run check:mem-header` |
| `bun run scripts/check-mem-header.ts` |
| `bun scripts/check-mem-header.ts` |

**비준수 예:**  
`grep -rl "check:mem-header"` · `find … *mem-header*` · `cat scripts/check-mem-header.ts` only · curl API probe only · echo only.

정규식 정본은 PREREG scorer에 봉인.

---

## 3. 범위

| In | Out |
|---|---|
| surface=platform · 동일 fixture | 3.4 PREREG 재측정 · COMPLY 완화 |
| repo cwd canary · strict COMPLY | secret-shaped COMPLY · default-on |
| live gate 동일 상수 | 3.0–3.2 재협상 · 3.3 reopen |

**H1:** 양 셀 동일 cwd·settings·prompt. 차이 = JIT canary env only.  
repo CLAUDE.md 존재는 **양 셀 공통** (3.4 빈 probe와 다름 — 의도).  
SessionStart 훅 없음(settings에 PreToolUse만).

---

## 4. Enable

T1(a) PASS → `PHASE3_4_PLATFORM_LIVE_AUTHORIZED=true` (`JIT=1` opt-in).  
FAIL → false 유지. default-on 금지.

---

## 5. Done-when

- [x] 본 SPEC  
- [x] PREREG 봉인 · n=10 · RESULT · live false (T1a FAIL · base ceiling) · HANDOFF

[RULE-ROUTER-PHASE3.4b-SPEC rev-1] remount=platform strict_comply=exec_only cwd=repo fixture=traps.claude-mem-patch

