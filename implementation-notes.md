# Implementation notes

Living log of **how we implemented** relative to plan docs (`docs/PLAN.md`, `docs/RENAME_TO_LOOM.md`, review findings).

**Rule (session standing order):**  
When an edge case forces a choice that diverges from the written plan, pick the **more conservative** option, record it under **Deviations** below, and continue. Do not silently improvise.

| Field | Value |
|-------|--------|
| **Maintained** | Yes — update on every non-trivial deviation |
| **Related** | `docs/WORKFLOW.md` (§3.5 Unknowns), `docs/UNKNOWNS.md`, `docs/PLAN.md`, `docs/plan_review.md`, `HANDOFF.md` |
| **Last updated** | 2026-10-18 (0.38.0 기억 쓰기 경로 — shipped 2026-10-18) |

---

## How to use

1. Hit a plan vs reality conflict (compat, security, testability, circular deps, missing API).
2. Prefer the option that **preserves data, security invariants, and dual-compat** over purity or speed.
3. Append a row under **Deviations** with: date, plan ref, choice, why conservative, follow-up if any.
4. Keep implementing; do not block the wave for aesthetic renames.

**Pre-wave unknowns** (MINOR / new surface) live in **`docs/UNKNOWNS.md`**, not here.  
This file is for **during-implementation** plan deviations only.

---

## Deviations

### RULE-ROUTER Phase 3.0 — JIT default mode

| Date | Plan / review ref | Deviation (what we did) | Why conservative | Follow-up |
|------|-------------------|-------------------------|------------------|-----------|
| 2026-07-28 | PHASE3-SPEC §6 dry-run “기본” | `LOOM_RULE_ROUTER_JIT` **unset = off (no-op)** 로 구현. dry-run은 명시 `dry-run`일 때만. | 훅이 settings에 상시 등록되므로 unset=dry-run이면 모든 Agent 스폰에 receipt I/O·레지스트리 읽기가 붙는다. canary 통과 전 세션 부작용을 피한다. | **P3.0 T1(b) PASS (2026-07-28)** 후에도 unset=off 유지. live=`1`은 opt-in만 · default-on 금지(RESULT rev-2). dry-run-as-default 재검토는 오너 선포 전 불요. |

### RULE-ROUTER Phase 3.1 — ship live surface gate

| Date | Plan / review ref | Deviation (what we did) | Why conservative | Follow-up |
|------|-------------------|-------------------------|------------------|-----------|
| 2026-07-28 | PHASE3.1-SPEC §4 · shared `LOOM_RULE_ROUTER_JIT=1` | live=`1`이어도 **ship 레인은 `PHASE3_1_SHIP_LIVE_AUTHORIZED` 게이트**를 통과해야 inject. 3.0 delegation과 플래그 공유·surface 분리. | 3.0 통과만으로 ship이 열리지 않게 한다. | **3.1b T1(a) PASS 후 true** (2026-07-28). unset=off·default-on 금지 유지. |
| 2026-07-28 | SPEC-REV Path B · RULE-ENFORCEABILITY H | **`check-bun-test-env.ts` exit 2** on Bash `bun test` without both LOOM_RELAY_* unset. Wired **before** jit on Bash matcher. No command rewrite. Parse fail → exit 0. | Soft JIT cannot guarantee compliance under doc competition; hard deny on the Claude Code path. Scope claim limited to that path — not all shells/CI. | Doc `RULE-ROUTER-BUN-TEST-ENV-HARD.md`. |

### §0.38.1 — codex/grok 첫 턴 스킬 목록 머리 문면 (implemented P1 · real-CLI 결과 ① → D8 · not shipped 2026-10-18)

PLAN §0.38.1 (R57 `approved-with-fixes` → `approved`) · 커밋 `0603e7f`(P1 red — 새 머리 축자 · 184 B · 표지/제어 문자 0 · 상한 계산 · 선언 다섯 리터럴) → `7348d15`(P1 green — `skill-prompt.ts` 상수 + JSDoc) → `76be19b`(P1b — +1 B 경계를 정확히 4097 B로). 독립 검증 = GPT-6 Astra high verify 0059(FAIL 1 M — "+1 B" 케이스가 경로에 `/p`를 붙여 4098 B를 시험 · 4097 B 미시험) → impl 레인 0060이 테스트만 고침(`entryFor(HEADER_VERBATIM, 4097)` · 13 pass · production 0줄) = P1b. **실 CLI D7(2026-10-18 · 오너 승인 1회 · `76be19b`) = 결과 ①**: codex 목록 경로 읽기 0 · `proposed 0` · "Blocked … worker instructions prohibit accessing those paths." → **D8 — 0.38.1은 고침으로 ship하지 않는다**(버전 · dist · CHANGELOG · USER_GUIDE 무변경) · 0.38.0 UK-8 open · 다음 = hint MINOR(오너 선택) · 기록 `docs/spikes/MEMORY-WRITE-SMOKE-0381.md`.

| # | PATCH · ref | Deviation (what we did) | 판정 |
|---|---|---|---|
| (1) | P1b · verify 0059 | P1 red의 "+1 B" 경계 테스트가 실제로는 +2 B(4098 B)였다 → P1b가 정확히 4097 B 블록을 만들어 접힘을 단언(테스트만 · production 0줄). | 수용 |
| (2) | P2 · D8 | P2(버전 · dist · 문서 ship) 미수행 — D7 결과 ①이라 D8대로 기록만 한다. 커밋된 P1 머리 상수는 main에 남는다(fingerprint 무변경 · 동작은 codex/grok 첫 턴 목록 한 줄). | 수용(D8) |

### §0.38.0 — 기억 쓰기 경로 (업그레이드 4단계 4부 — shipped 2026-10-18)

PLAN §0.38.0 (R56 `approved-with-fixes` → `approved`) · 커밋(red/green 순) `c552b04`/`4ec5267`(P1 — 저장소 async append · 상한 · 필터 · dedupe · `withFileLockAsync`) → `7597d0b`/`8d27fa4`(P1b) → `4741f43`/`63b94b6`(P2 — `cardWrites` 설정 · 강제 스킬 · 기동 검사) → `c019a9c`(P2b) → `6b6e4e5`/`63ecbd4`(P3 — 결과 경로 파싱 → 제안 · `notes.md` · stderr) → `f67e985`/`8999fa6`(P3b — verify 0042) → `806a09d`/`23f9f10`(P4 — CLI) → `2119c85`/`69a42f3`(P4b — verify 0045) → `f79d1cf`(P5 스모크 `smoke:memory-write`) → `67a3745`(VERSION · `BRIDGE_VERSION` · MCP 0.38.0 + dist) → P5b 문서 `4fcde28` → `d7a59e0`(P5c — `smoke:memory-write --only <agent>`(real-cli 전용) + 카드별 실 CLI 진단) → P5d ship 문서(이 절). 독립 검증 = GPT-6 Astra high(`lane.ts verify`) + 아키텍트 재실행. 전체 스위트(P4b 뒤) 3309 pass / 1 fail(알려진 `handoff-checkpoint` live checkpoint). **실 CLI 스모크 ① PASS(2026-10-18 — 오너 승인 · R56-M4 · UK-1 closed)** → shipped 2026-10-18.

**Deviations · 레인 해석 (계획 대비 — 한 줄씩):**

| # | PATCH · ref | Deviation (what we did) | 판정 |
|---|---|---|---|
| (1) | P3 빠른 경로 | `record.memoryProposed`에 키가 있으면 저장소 호출 0 · stderr `dup` = 그 출력의 **후보 수**(파서가 센 수 — 저장소 dedupe와 같은 칸). | 수용 |
| (2) | P3 R9 | 레코드 `memoryProposed` 키는 저장소 호출이 **락 안 단계를 끝낸 뒤에만**(제안 · `dup` · `cap` 등) 실린다 — `busy` · IO 오류 · 프로필 없음은 키를 남기지 않는다(recovery 재처리가 재시도 · 저장소 dedupe가 이중을 막음). P3b(verify 0042 M2 · L3)가 "새 첫 spawn 레코드도 이전 키를 이어 받는다"를 고정. | 수용 |
| (3) | P3 D13 | 빈 문자열 `profile` = 프로필 없음 → `skipped — no profile`(쓰기 0). | 수용 |
| (4) | P3 R9 | `memoryProposed` 키는 handoff를 넘어 이어진다(≤16 · 오래된 것부터 버림) — 키에 handoff16이 들어 있어 다른 handoff를 막지 않는다. | 수용 |
| (5) | P4 `--source` | 잘못된 kind의 usage 문구 = `--source must be a source kind (e.g. human, card)`(② 미지정). | 수용 |
| (6) | P4 머리 K | `memory: K card proposals awaiting review`의 K = 목록 대상 에이전트 **저장소 전체**의 카드 출처 proposed 합 — `--source` · `--room` · `--all` 필터를 무시한다. | 수용 |
| (7) | P4 `show` | `origin:` 줄은 기존 출력(본문 포함) **뒤**에 온다. | 수용 |
| (8) | P4b | `approve`는 전이 **전에** 대상을 읽는다 — 전이 뒤 읽기 경합 · 실패 · stdout throw가 성공한 approve의 exit code를 바꾸지 못한다(verify 0045 M). | 수용 |
| (9) | 레인 0041 | impl 레인 0041이 exit 5로 끝남 — 원인은 작업 뒤 `git status` 권한 거부 하나뿐. 아키텍트 diff 검토 + 테스트 재실행 + `lane.ts verify` 뒤 수용. | 수용 |
| (10) | 스위트 | 동시 verify 부하 아래 전체 스위트 1회에서 원인 미확인 flaky 실패 1건 관찰 — 재실행에서는 알려진 `handoff-checkpoint` 실패뿐. 이름을 특정하지 못함. | 기록(미해결 관찰) |
| (11) | 레인 0049(P5a — 스모크 + VERSION + dist) | impl 레인 0049가 exit 5(`denied`)로 끝남 — 거부 둘: `git log --oneline -15 --grep=0.37.0`(0.37 ship 커밋 찾기) · `bun run build:cli`(dist 재빌드 — 레인 밖에서 수행, `67a3745`). 거부는 레인 안 조회 · 빌드 명령뿐 → 아키텍트 diff 검토 뒤 수용. | 수용 |
| (12) | 레인 0050(P5b — 문서) | impl 레인 0050이 exit 5(`denied`)로 끝남 — 거부 하나: `bun run rules:check`. 문서 diff는 아키텍트 검토 뒤 수용. | 수용 |
| (13) | 레인 0052(P5c — `--only` + 진단) | impl 레인 0052가 exit 5(`denied`)로 끝남 — 거부 하나: `bun run smoke:memory-write`(가짜 CLI 기본 실행 — 레인 안 검증 명령). 아키텍트 diff 검토 뒤 수용(`d7a59e0`). | 수용 |
| (14) | 실 CLI ① codex `proposed 0` | **0.38 변경 아님 — 원인 미확인(0.39 후보).** codex-cli 0.163.0의 codex `developer_instructions`(`HEADLESS_WORKER_HINT`)의 *"Work only inside the current working directory. Do not touch paths outside it."* ↔ 카드 스킬 사본은 cwd 밖(`~/.loom/cards/…/skills`). codex는 cwd만 찾았고(`rg --files --hidden -g 'SKILL.md' -g 'AGENTS.md' …` exit 1) "Blocked"로 답했다. 사본은 정상(SKILL.md 둘). claude = `--plugin-dir` 플러그인 · grok = 절대 경로를 읽음. 반증: 2026-10-15 `HEADLESS-SMOKE-0310.md` h2(codex-cli 0.162.1 · 같은 hint)에서 codex는 첫 항목으로 `cat <abs card path>/skills/plugin/skills/loom-card-report/SKILL.md`(exit 0)를 실행하고 `LOOM-REPORT-END`로 끝냈다(`HEADLESS-SMOKE-0310.md:28-29`, `:77` — 0310 프롬프트 "finish per your report skill" ↔ 0380 "as your loom-memory-candidates skill describes…"). 따라서 원인은 codex 버전(0.162.1 → 0.163.0)과 프롬프트 문구 사이에서 미확인 · codex 스킬 사용은 불안정(0.31부터 깨졌다는 증명 아님). fingerprint: hint는 `workerFingerprint` 입력(`agent-argv.ts:280-293`) · 첫 턴 스킬 목록 문면(`skill-prompt.ts`)은 아님(`manifestHash`만) → 목록 문면만 고치면 fingerprint 무변경. 0.38 범위 밖. 오너 판정 2026-10-18 "원인 확인 후 결정" → 기록 후 ship. | 기록(0.39 후보 · UNKNOWNS UK-8) |

**검증 판정:**

- **verify 0042(P3) M1 — 수용:** `notes.md` async IO에는 마감 시간이 없다. 기존 전송 전 카드 레코드 persist와 같은 계급(로컬 파일 IO가 결과 전송 앞에 있음)이라 따로 예산을 두지 않는다. M2 · L3은 P3b로 고침.
- **verify 0045(P4) M — P4b로 고침:** (8).
- **verify 0048 Lows — 수용(Low backlog):** **(a)** `approve`의 전이 전 읽기는 id로 대상을 찾는다 — retire → compact → **같은 id로 다시 propose**된 뒤에만 낡은 본문을 찍을 수 있는데, 그러려면 무작위 id 충돌이 필요하다. **(b)** D16' 거부 테스트는 "저장소에 지속 변경 없음"(바이트 · mtime)을 증명할 뿐 "읽기 0"을 증명하지 않는다.

**스모크(P5 — `f79d1cf` · 기록 [`docs/spikes/MEMORY-WRITE-SMOKE-0380.md`](docs/spikes/MEMORY-WRITE-SMOKE-0380.md)):** `bun run smoke:memory-write` 10/10 PASS(2026-10-18 — ①~⑧ + 임시 홈 삭제 + 실 홈 무접촉). **실 CLI ①**(`--real-cli --owner-approved` · 오너 승인 · dist v0.38.0 · `codex-cli 0.163.0` · `claude 2.1.302` · `grok 1.0.54 (4e18c5517b4e) [stable]` · macOS) **3/3 PASS** — claude `proposed 1` · grok `proposed 1` · codex `proposed 0` · 세 카드 모두 `notes.md` · 실 홈 무접촉 → R56-M4 PASS. 오너 승인 codex 단독 진단(`--only codex`) 3/3 PASS · codex `proposed 0` — 원인 (14).

### §0.37.0 — 정책 정직성 (업그레이드 4단계 3부 — shipped 2026-10-17)

PLAN §0.37.0 (R55 `approved-with-fixes` → `approved`) · 커밋 `5860990`(R55 게이트) → `addcd52`/`ae65e42`(P1 red/green — `policy-gaps.ts` 순수 코어 · 머리말 · `composeFenceText`/`renderRulesSection` · `strictEnforcement`/`rules` 파서 · `readBridgeWorkerFlags`) → `1ba49c2`/`cd5130c`/`af47f4d`(P2 red · red 교정 · green — 펜스 안 안내문 · 규칙 · D9 stderr · `agent_disabled` · `maxConcurrent` 0) → `b16b900`/`ddecf6d`/`29bbe62`/`2e82446`(P3 red · red 교정 2 · green — bridge 기동 경고 · strict 거부 · doctor Policy 절 · flags 줄 · `memory list` 머리 · `configuredAgentBins`) → `db0cbfb`/`bf010c2`(P4 — AGENT_HINT/`systemHint` 삭제) → `a2abb7f`/`1ca58e6`(P4b — 스킬 가림 라벨) → `4fd633f`/`8140c97`(P4c — `enabledHeadlessAgents` · 레거시 행 · flag 뷰) → `bd22505`(WIP dist 백업) → `9c0ad0e`/`00af288`(P4d — Service PATH 검사 = bridge 켜짐 집합 · strict 꼬리) → `f4c7073`(P5a 스모크 `smoke:policy`) → `9a402e4`(P5b 버전 0.37.0 + dist) → P5c 문서(이 절). 독립 검증: P1 · P2 · P3 = Opus xhigh(읽기 전용) · P4~P4c = GPT-6 Astra high(`lane.ts verify` 0020) + 아키텍트 재실행 → P4d · P4d = Astra 0022 · P5a 스모크는 구현 레인이 작성 · P3-V-L3 판정은 Fable 자문. 원 로그 `tasks/v0370-wip/v0370-deviations.md`(이 절이 정본 — 그 파일은 기록용으로 남김).

**Deviations (계획 대비 실행 방식 — 한 줄씩, 번호 유지):**

| # | PATCH · ref | Deviation (what we did) | 판정 |
|---|---|---|---|
| (1) | P1 ② 규칙 섹션 | `renderRulesSection`은 규칙 본문 끝 개행을 **전부** 지운다(`/\n+$/` — ② "끝 개행 제거"는 개수 미지정). | 수용 |
| (2) | P1 상한 | 규칙 상한은 항목 + `\n\n` 구분자를 센다 · 머리 줄 · 생략 줄은 안 센다(memory-snapshot 선례). | 수용 |
| (3) | P1 | included=0이면 `## Standing rules\n- … N more rules omitted`(빈 줄 없음) — 도달 불가(본문 ≤8192 B) · 테스트 없음. | 수용 |
| (4) | P1 `readBridgeWorkerFlags` | P1은 ② 문면대로 maxConcurrent/strict/memory/rules/permissions만 검사 — doctor가 bridge가 거부할 설정을 유효로 볼 수 있음 → P3로 FLAG. | P1-V-L1로 해소 |
| (5) | P1 | `readBridgeWorkerFlags().enabled` = P2 전까지 셋 다(R55-L4). | (17)로 해소 |
| (6) | P1 | 명시 `worker.strictEnforcement: false`는 보존 · 왕복 — 키가 없을 때만 생략. | 수용 |
| (7) | P1 import | `memory-inject.ts`가 `./agent-argv`에서 `AgentKind`를 **type**만 import(② = rules-store type import만) — 런타임 import 0. | 수용 |
| (8) | P1 | `memory-inject.test.ts:65` 옛 주석("Verbatim from PLAN §0.36.0 ②") 남김(편집 허용 = `:66-67`뿐). | 수용 |
| (9) | P1 문서 | `USER_GUIDE.md:1635`가 옛 펜스 머리말 인용 → P5. | P5c에서 해소 |
| (10) | P1 | 테스트 파일은 red 커밋 전 biome 포맷(추가 줄만). | 수용 |
| (11) | P2 커밋 | 커밋 셋 — red `1ba49c2` · 테스트만 교정 `cd5130c` · green `af47f4d`. 레코드 경로 `agent_disabled`는 `sendAndMarkLocked`의 `pendingResult` 예약이 `timedOut: false`를 더한다(`fingerprint_changed`와 같음) · 새 카드 경로는 ② 모양 그대로. | 수용 |
| (12) | P2 R12 위치 | 기존 레코드 `agent_disabled` = `existing && !existing.resultSent && maxConcurrent[agent] === 0` · orphan group · `spawn_state_unknown` 뒤 · `fingerprintChanged` 앞(입양 갈래의 `card_already_running`보다도 앞 — claim 없는 직접 `dispatch()`에서만 닿음: **D2는 결과를 못 받는다**, P2-V-L1) · `resultSent`+죽은 레코드는 새 카드 검사로 내려감. | 수용 + 고정 |
| (13) | P2 stderr | `notice <G>` = 자기 간극 수(= 안내문 줄 수) · `text <T>` = env redaction 전 합성 text 바이트(0.36도 redaction 전 text). | 수용 |
| (14) | P2 R8 | 1 MiB 검사는 `renderMemoryBlock` 직후(남은 파일 삭제 · 쓰기 전) · 문구 `memory snapshot block exceeds 1048576 bytes`(② 미지정) → `spawn_setup_failed` note. | 수용 |
| (15) | P2 R6 | 메서드 이름 `memorySnapshotLocked` 유지 — 이제 `{memory, rules, gaps}`를 받는다. | 수용 |
| (16) | P2 테스트 | `bridge-config-policy.test.ts` 머리 주석 4-5줄을 red에서 편집("not exercised here" → 덧붙인 P2 describe 가리킴) · P2 describe는 자기 임시 홈 env. | 수용 |
| (17) | P2 | `readBridgeWorkerFlags().enabled`가 0 에이전트를 뺀다((5) 해소). | — |
| (18) | P2 D3 | 자기 간극은 없고 다른 에이전트만 간극인 카드 = 스냅샷 단계 없음(R10 "이 에이전트 간극") · 테스트. | 수용 |
| (19) | P2 | `bridge-memory-profile.test.ts`는 P2에서 무편집 통과(bridge 배선은 P3) — P3 red가 `:246-256`을 좁힌다. | P3에서 해소 |
| (20) | P3 위치 | `readPolicyDoctorInput(home, profile)`은 `cli/src/doctor.ts`(export · index.ts가 import) — ② `cli/src/index.ts`는 import 시 `main()`이 돌아 단위 테스트 불가(선례 `readMemoryDoctorInput`) · doctor.ts가 `@loom/host` · `node:fs` 런타임 import를 갖게 됨. | 수용 |
| (21) | P3 모양 | `PolicyDoctorInput` = {home, profile, policyPath, policy(default\|file\|invalid), legacyPolicy, bridgePath, bridge(absent\|invalid\|ok), hash\|null, enabled, gaps, strictEnforcement, worker} · 간극은 리더에서 계산 · Bridge/Memory flags 뷰는 같은 원문 읽기에서. | 수용 |
| (22) | P3 읽기 | doctor는 `loadBridgeConfig`처럼 읽는다 — 없음 → "no bridge config" · 읽기 불가/비JSON/비객체 → 기본값(worker 없음 → pane) · `readBridgeWorkerFlags` throw만 ③ "bridge config invalid" warn. | 수용 |
| (23) | P3 | `resolveWorkerPolicy` throw(deprecated bridge 목록 vs `policy.json` — bridge 기동 거부)는 ③ "bridge config invalid: <msg> … showing all agents" warn + 기본 권한으로(③에 행 없음). | 수용 |
| (24) | P3 pane | pane backend: bridge 행 `backend pane · enabled none` + pane 안내 줄 · 에이전트 행은 셋 다 수준 표시(disabled 아님) · 간극 = [] → ok `no policy gaps for enabled agents` · strict 값은 false로 표시(bridge가 무시). | 수용 |
| (25) | P3 레거시 | 레거시 행 = `existsSync(dirname(home)/.fable/policy.json)` · 출처 행 바로 뒤(무효 정책 fail 행 뒤에도). | P3-V-L1로 조건 강화 |
| (26) | P3 | 무효 bridge 설정 → strict 행 `= false`(flags 모름). | 수용 |
| (27) | P3 | `memory list` — throw하는 `memoryEnabled` dep는 "invalid bridge config"로(방어 — 실 deps는 스스로 잡음). | 수용 |
| (28) | P3 순서 | bridge 기동 순서 = deprecated 목록 경고(0.31 D8) → 간극 → strict throw / 간극 경고 — strict 거부 전에도 deprecated 경고가 먼저 찍힌다(② "`:883` 바로 뒤"). | 수용 |
| (29) | P3 R13 | strict 거부는 그대로 throw(`startBridgeRuntime` reject = `renderStrictRefusal`) · 상태 파일 `lastError`는 기존 0.33 상한 512 UTF-8 B — 기본 정책 거부(~1.3 KB)는 거기서 잘림 · 테스트는 `truncateLastError(refusal)` 고정. | 수용 |
| (30) | P3 테스트 배치 | P1-V-L2 `loadRules` 테스트는 `memory-inject.test.ts`(추가 · 동적 import) — `rules-store.test.ts`는 ⑦ 무편집 목록. | 수용 |
| (31) | P3 커밋 | 테스트만 red 교정 둘 — `ddecf6d`(dispatch allowlist에 codex/grok `agentArgv` · `lastError` 상한 · status herdr 초기 "down") · `29bbe62`(룸 peer는 `peerId`가 아니라 `id` — no-join 검사가 undefined끼리 비교, typecheck가 잡음). | 수용 |
| (32) | P3 ⑦② | 좁히기 = `GAP_FREE_POLICY` 상수 + 두 테스트 안에서 `loomDir()/policy.json` 쓰기(`:246-256` 범위 안) · 파일은 describe 끝까지 남음(먼저 도는 기억 켜짐 테스트 둘은 무영향). | 수용 |
| (33) | P3 spawn 테스트 | doctor-policy spawn 테스트는 HOME = 테스트 프로세스 임시 HOME(bun 트랜스파일 캐시가 `$HOME/Library/Caches`) · `LOOM_TEST_HOME` = 테스트별 임시 루트 · `launchctl`/`systemctl`/`loginctl` 스파이를 PATH 앞에(실행 0 단언). | 수용 |
| (34) | P3 P1-V-L1 | `readBridgeWorkerFlags`는 조립된 설정에 `validateWorkerConfig`를 다시 돌리지 않는다 — 그것은 `validatePermissions`(이미 `parsePermissions` 안) + 정책 의존 `effectiveWorkerPolicy`뿐 · fs 없는 오류는 전부 덮임 · 패리티 표 33케이스가 오라클. | 수용 |
| (35) | P4 ⑦③ | `adapters.test.ts` ③ 편집이 `:30-33` 블록 뒤 빈 줄까지 지움(삭제 범위 `:30-34`) · 다른 기존 줄 무접촉. | 수용 |
| (36) | P4 테스트 | "`@loom/mcp-server`에 `writeAgentHintFile` 없음" 단언은 `packages/mcp-server/src/index.ts`를 계산 경로로 import — adapters는 mcp-server에 의존하지 않고 리터럴 상대 import는 tsc rootDir(TS6059)을 깨뜨림. | 수용 |
| (37) | P4 ② grep | ② grep 기준(`systemHint\|loomSystemHint\|fableSystemHint\|writeAgentHintFile` = 0, 예외 둘)은 문자 그대로 0이 아니다 — P4 행이 요구한 부재 단언(`adapters.test.ts:107-133`)이 기호 이름을 문자열로 담음 · production .ts는 `agent-argv.ts:26` 주석뿐 · dist는 P5 `build:cli`까지 남음. | **아키텍트: ② = "production .ts only"** — P5 문서에서 ② 문면 정정 |
| (38) | P4 doctor | AGENT_HINT 줄 = Home/profile 절 마지막 줄(writable 줄 뒤) · `cmdDoctor`에서 `existsSync(pathJoin(readOnlyLoomHome(), "AGENT_HINT.txt"))` 인라인 · 존재만 — 같은 이름 디렉터리/심링크도 줄을 냄(dangling → 줄 없음). | 수용 |
| (39) | P4 테스트 | `doctor.test.ts` 추가분은 별도 import 문(둘째 `bun:test` · 둘째 `./doctor`) — ⑦ 추가만 파일의 diff가 `+`뿐이게. | 수용 |
| (40) | P4 spawn | `doctor.test.ts` spawn = 실 `bun packages/cli/src/index.ts doctor` · (33) env 형 · `LOOM_PROFILE=p4hint` · 심은 파일 mtime 2026-01-02 → 바이트 · mtimeMs · size · mode 무변경 · 파일 없음 → 줄 없음 · 생성 0. | 수용 |
| (41) | P4 red | P2-V 고정 12개는 red에서 이미 통과(기존 P2 동작 — 커밋에 선언) · 대조 둘 추가: L1 claim 경유 → D2 claim 0 · 전송 0 · 레코드 미전송 · L3 grok 켜짐 → 같은 레코드가 output "done" 전달 · (d) 크래시 = 디스패처 1 워커 정지 → `d1.close()` → 그룹 SIGKILL → 디스패처 2 `recover()`(스냅샷 mtime을 과거로 두어 재쓰기 탐지). | 수용 |
| (42) | P4 P2-V-L2 | (a)(b) 모두 `dispatch()`와 `recover()`로 고정 — (a) 레코드 pid 죽음 + pgid = 살아 있는 분리 sleeper · (b) `pendingResult` 그대로 재생(`timedOut false` 포함) · 레코드 무변경. | 수용 |
| (43) | P4b D8 | `shadowsBuiltin`은 `BUILTIN_SKILLS`(resolveSkill이 쓰는 집합) 기준 · 수락된(Available) 사용자 스킬에만 — 가리는데 unavailable인 스킬은 라벨 없음. | 수용 |
| (44) | P4b R19 | 기존 목록 테스트 편집 0(전체 스위트 green — 알려진 handoff-checkpoint 실패 제외). | — |
| (45) | P4b 테스트 | `skill-label.test.ts`는 `SKILL_SHADOW_SUFFIX`를 호출 시점 네임스페이스 import로(케이스별 red) · 상한 케이스 = 순수 `renderSkillListing` + 긴 절대 경로: 접미 없이 정확히 4096 B는 들어감 · 같은 항목 접미 붙이면 `- (+1 more): unavailable: cap` · 접미 길이만큼 짧은 경로 + 접미 = 정확히 4096 B 들어감. | 수용 |
| (46) | P4 D7 | `loom run`은 더 이상 `~/.loom/AGENT_HINT.txt`를 쓰지 않는다(의도된 동작 변경) · 있는 파일은 그대로(계급 21). | 수용 |
| (47) | P4c 헬퍼 | 공유 헬퍼 = `enabledHeadlessAgents(maxConcurrent, agentArgv)` + `agentArgvFromRaw(raw)`(= `loadBridgeConfig`의 `{...DEFAULT_AGENT_ARGV, ...sanitizeAgentArgv(raw)}` — `loadBridgeConfig`도 이제 이것을 부름) · `bridge-config.ts` · `@loom/host` export · `enabledAgentsOf`(순수 maxConcurrent 필터)는 유지 · `resolveAgentArgv` 매개변수를 `Pick<BridgeConfig, "agentArgv">`로 넓힘(type만). | 수용 |
| (48) | P4c | `readBridgeWorkerFlags(raw, rawAgentArgv?)` — 둘째 인자 = 파일 최상위 `agentArgv` 원문 · 생략 = 키 없음 → {claude} · pane → `enabled: []` 그대로. | 수용 |
| (49) | P4c doctor | (brief 밖 · 정직) doctor 꺼짐 행이 사유를 밝힌다 — `PolicyDoctorInput.noAgentArgv` · `<a>: disabled (no usable agentArgv.<a>) — not checked`(둘 다면 이것) · 아니면 `(worker.maxConcurrent.<a> = 0)`. | 수용(③ 문면 P5) |
| (50) | P4c doctor | "no bridge config"(모두 켜짐 가정 → 6개) · "bridge config invalid … showing all agents"는 그대로 — P3-V-L3는 파싱된 headless 설정에만 · `doctor-policy.test.ts` 6개 고정(`:147` · `:534`)은 이 무설정 경우라 유지. | 수용(문서화) |
| (51) | P4c 워커 | `headless-worker.ts`는 `enabledAgentsOf`를 안 씀 — 카드 안내문은 `deps.policyGaps`(bridge 기동 `Gap[]`)를 거르므로 헬퍼를 자동으로 따름 · `headless-policy-notice.test.ts:187`(모두 dispatch 가능 하네스) 무편집. | 수용 |
| (52) | P4c Service | (brief 밖 — FLAG) `service.ts` PATH 드리프트 검사는 아직 maxConcurrent/agentBin만으로 고름 — `agentArgv` 없는 에이전트도 검사됨. | 수용 → **P4d에서 해소**((58)) |
| (53) | P4c P3-V-L2 | doctor flag 뷰는 정책 해석 뒤 계산 — headless + 무효 `policy.json` → "invalid bridge config"(Policy 절은 fail 행만) · headless + deprecated 목록 충돌 → invalid · pane + 무효 `policy.json` → false(pane은 정책을 안 읽음 — `memory list` 패리티). | 수용 |
| (54) | P4c 테스트 | red 테스트는 새 cli 파일 `policy-enabled-p4c.test.ts`(host가 cli를 import 못 함 — 3방 패리티) · bridge 기동 enabled = 기본 정책 기동 경고가 이름 짓는 에이전트(모든 에이전트가 기본 간극 ≥1) · red에서 이미 통과한 행 다수(기존 동작). | 수용 |
| (55) | P4c 기존 0.37 테스트 편집 | red: `policy-gaps.test.ts:80` STRICT_TAIL · `bridge-config-policy.test.ts:47-55`(ALL_ARGV) · `:267` · `:288` · `:459-468` · `:608` · `doctor-policy.test.ts:105-110`(writeBridge가 agentArgv 씀) · `:334-341`(무효 정책 ⇒ `<root>/.loom` 있음 ⇒ 레거시 행 없음). | 수용 |
| (56) | P4c biome | production 파일 `biome check --write`가 무관한 코드를 고침 → 되돌림 · 4개 production 파일의 biome 오류/경고 수 = `1ca58e6`과 같음(전부 기존). | 수용 |
| (57) | P4c 기본 간극 | 기본 headless 설정(`agentArgv {claude}` · `policy.json` 없음) → **간극 1개**(claude network advisory) · 6 = 세 에이전트 모두 dispatch 가능일 때 → ② · 계급 20 · UK-6 · R55 "기본 간극" 문면을 P5에서 다시 셈. | P5c에서 해소 |
| (58) | P4d Service | `configuredAgentBins` mc: throw 없는 maxConcurrent 헬퍼가 export돼 있지 않아(`parseMaxConcurrent`는 private · throw) `conc[k] === 0 ? 0 : 1`로 인라인 유도 — 없음/0 아님 = 켜짐 · 명시 0 = 꺼짐(종전과 같음) · bridge가 거부할 잘못된 값은 여기선 켜짐(throw 없음, 종전과 같음) · 켜짐 집합 = `enabledHeadlessAgents(mc, agentArgvFromRaw(raw))`. | 수용 |
| (59) | P4d 테스트 | `doctor-service.test.ts` 기존 테스트 편집: `writeWorker`에 선택 최상위 `agentArgv` + `ALL_ARGV` · "agent binary not resolvable … → warn" · "only {codex: 0} named → claude · grok still checked"가 ALL_ARGV를 씀 · "checks only the agents the config names" 제목 변경(argv 없는 codex agentBin은 켜짐 아님 — 단언 무변경) · red(두 플랫폼): 새 P4d 테스트 3 + STRICT_TAIL 테스트 3 · `policy-enabled-p4c.test.ts` 머리 주석의 P4c 꼬리 문구는 기록으로 남김. | 수용 |
| (60) | P4d 검증 0022 Low | `doctor-service.test.ts`만 조임: "agentBin (absolute) is checked as configured"가 ALL_ARGV로 grok을 켜 그 절대 경로를 실제로 해석 · 미해석 경고 없음 단언 + 절대 경로 grok 없음 케이스(경고가 그 경로를 이름) · "headless checks only enabled agents"는 codex `agentBin`을 없는 절대 경로로 두고 경고가 그것을 이름 짓지 않음을 단언(종전: 있는 codex 바이너리라 검사 ≡ 건너뜀). | 수용 |

**검증 · 아키텍트 판정 (원 로그 그대로 요약):**

- **P1 검증(Opus xhigh) PASS-with-lows → P3 red로 접음:** **P1-V-L1**(수용 · ② 보정) — `readBridgeWorkerFlags`는 남은 fs 없는 파서 전부를 bridge 순서(skills → permissions → cwd → allowedRoots → maxConcurrent → timeoutMs → agentBin → memory → rules → strict)로 돌린다 · `loadPolicy`/`loomDir` 호출 0 · P3 red = 모든 `workerConfigFromParts`/`parseAgentBin` 오류에 대해 `messageOf(readBridgeWorkerFlags(sec)) === messageOf(loadBridgeConfig(id))` 표. **P1-V-L2**(info) — `composeFenceText("", "", "\n") === ""`(선언) · 빈 본문 규칙은 `### id\n`(`loadRules`가 공백뿐 본문을 disabled로) → P3 red가 둘 다 고정. 편차 (1)~(10) 수용 · P2 red `1ba49c2`가 P1 테스트 주석 2줄을 편집 — P2 검증이 선언 확인.
- **P2 검증(Opus xhigh) PASS-with-lows → P4 red로 접음:** **P2-V-L1**(② 동작 유지 · 고정 · 선언) — claim 없는 직접 `dispatch()`에서 꺼진 에이전트의 미전송 D1 레코드 + 새 handoff D2 → D1에 `agent_disabled`, D2는 결과 없음(프로덕션 도달 불가 — bridge는 항상 claim 전달). **P2-V-L2** 추가 케이스 (a) orphan_group_alive가 agent_disabled보다 먼저 · 그룹 kill 0 (b) 예약 `pendingResult` 재생 (c) D9 빈 줄 두 필드 `empty — no block · read_errors 1 · entries_oversize yes · load_ms` (d) 다른 디스패처 resume — 안내문 블록 + 바뀐 deps에도 파일 바이트 · mtime · hash 유지 · 리더 호출 0 (e) 지운 안내문 파일 → `needs_verification`("missing"). **P2-V-L3**(② `fingerprint_changed` 형 유지 · 고정 · **새 무번호 수용 손실**) — 끝났지만 미전송인 레코드(끝난 transcript · `pendingResult` 없음)의 에이전트를 끄면 진짜 결과 대신 `agent_disabled` — **에이전트를 끄기 전에 drain한다.** 0.36 동작 메모(P2 무관): 다른 nonce BEGIN 흉내 미무력화 · 스냅샷 파일 모드 미검사(0644도 resume) → 0.38 후보. 편차 (11)~(19) 수용.
- **P3 검증(Opus xhigh) PASS-with-lows → 수정 PATCH "P4c"(P5 전):** **P3-V-L1** — 레거시 `~/.fable/policy.json` 행은 **이관이 실제로 대기 중일 때만**(레거시 파일 있음 ∧ `<root>/.loom` 없음 — `resolveStateHomeDir`가 옮길 상황) · 아니면 행 없음(③ 문면 P5). **P3-V-L2** — doctor worker-flag 줄은 `memory list`(`memory-cli.ts:901`)와 같은 유도 — bridge 설정이 무효(정책 충돌 · 무효 정책 포함)면 모든 표면이 "invalid bridge config". **P3-V-L3**(사양 보정 — 아키텍트 · fable-advisor 판정, **R55b 아님**) — headless "켜짐" = `maxConcurrent[k] !== 0` ∧ `resolveAgentArgv(cfg, k) !== null`(빈 배열 · shell/sh/bash 가드 포함, `bridge-config.ts:654-662`) · doctor `readPolicyDoctorInput`도 최상위 `agentArgv`를 같은 `{...DEFAULT_AGENT_ARGV, ...sanitizeAgentArgv(raw)}` 병합으로 · bridge · doctor · `readBridgeWorkerFlags.enabled`가 **한 공유 순수 헬퍼** · 같은 원문 → 같은 `enabled` 테스트 · `STRICT_REFUSAL_TAIL` 교체 · 기본 간극 수 재계산 · 스모크 ①은 bridge 설정에 `agentArgv.codex` · `agentArgv.grok`(정책 파일 없음). 편차 (20)~(34) 수용.
- **P4/P4b 판정:** 편차 (37) — ② grep 검사는 **"production .ts only"**(부재 단언으로 기호를 이름 짓는 테스트 허용) · ② 문면은 P5 문서에서 정정.
- **P4c 판정(`4fd633f`/`8140c97`):** `noAgentArgv` doctor 행 사유 수용(③ 문면 P5) · "no bridge config" / "invalid bridge config" doctor는 여전히 모든 에이전트 켜짐 가정 — 수용 · 문서화 · `service.ts` PATH 드리프트 검사 무변경 — 수용(→ P4d가 이어서 고침).
- **P4~P4c 검증(GPT-6 Astra high `lane.ts verify` 0020) + 아키텍트 재실행 → P4d:** Service PATH 검사가 bridge의 켜짐 집합을 써야 함 · strict 꼬리 문구가 claude에 거짓("remove agentArgv.<agent>"는 claude에 안 통함 — `DEFAULT_AGENT_ARGV`가 claude를 다시 채움). **P4d(`9c0ad0e`/`00af288`):** `configuredAgentBins = enabledHeadlessAgents(mc, agentArgvFromRaw(raw))` · 꼬리 = `Disable the agent (worker.maxConcurrent.<agent>: 0; for codex/grok, removing agentArgv.<agent> also works), fix network/mcp items in policy.json (shell.deny gaps cannot be removed there), or set worker.strictEnforcement to false.`(`policy-gaps.ts:70-71`). **P4d 검증(Astra 0022) PASS-with-lows** — 테스트 Low는 (60)으로 고침.

**P5 판정(아키텍트 — 스모크 `f4c7073` · 기록 [`docs/spikes/POLICY-HONESTY-SMOKE-0370.md`](docs/spikes/POLICY-HONESTY-SMOKE-0370.md)):**

| # | 판정 |
|---|---|
| (61) | 스모크 간극 = `enabledHeadlessAgents(config.maxConcurrent, cfg.agentArgv)` — **P4c가 R55-L2 문자 그대로의 공식**(`enabledAgentsOf(config.maxConcurrent)`)**을 대체**한다(스모크는 bridge 기동과 같은 식). |
| (62) | 스모크 bridge 설정은 세 에이전트 모두에 `agentArgv`를 둔다 — 기본 `{claude}`면 codex/grok이 켜짐 아님 → 간극 0 → (c)④ codex 안내문을 보일 수 없다((57)). |
| (63) | ⓪ "fail 0" = Policy 절에 `fail` 행 0 **그리고** doctor exit = 빈 홈 기준 실행과 같음(임시 홈의 다른 절은 이 스모크의 대상이 아님). |
| (64) | `--real-cli`는 ⓪ + ①만(R55-M2 범위) · 실 응답 `"ok"` ×3은 관찰만(UK-2). |
| (65) | ③은 실 doctor 행 텍스트 `grok: disabled (worker.maxConcurrent.grok = 0) — not checked`를 통째로 단언 · ④는 claude 전용(간극 없는 정책은 claude 간극만 없앤다 — codex/grok `shell.deny`는 정책으로 못 없앰, 계급 20) · 단계 10개 = ⓪~⑦ + 정리 둘(임시 홈 삭제 · 실 홈 무접촉). |

**⑥ 밖 변경:** P5의 production 변경은 버전 문자열 셋(CLI `VERSION` · `BRIDGE_VERSION` · MCP `serverInfo`)과 dist뿐. `packages/host/src/bridge-config.ts`의 `agentArgvFromRaw` · `enabledHeadlessAgents`(P4c)는 ⑥ 설정 행 안.

**Known limits (PLAN ⑤ 계급 17~22 + 무번호):** 안내문은 권고(17 — UK-2 관찰만) · 위조 섹션 구별 불가(18) · 0.36 저장은 새 키를 지우고 `maxConcurrent` 0은 0.36 기동 거부(19) · **strict는 codex · grok을 끄고 claude가 `network: true`이거나 꺼진 경우만 통과**(20) · 남은 `AGENT_HINT.txt`는 info만(21) · `memory-snapshot.md` 등 이름 오칭(22) · pane/sticky 미주입 · strict 거부 서비스 10초 재시작 루프 · strict 거부의 상태 파일 `lastError`는 512 B에서 잘림((29)) · 끝났지만 미전송인 레코드의 에이전트를 끄면 진짜 결과 대신 `agent_disabled`(P2-V-L3 — 끄기 전 drain) · doctor "no bridge config" / "invalid bridge config"는 모든 에이전트 켜짐을 가정((50)) · 실 CLI 실측은 ① 한 모양뿐(기본 정책 · 기억 · 규칙 꺼짐 — 규칙 · 기억 켜짐 ≈64 KiB 첫 턴은 가짜 CLI 바이트만).

### §0.36.0 — headless 워커 카드 시작 기억 스냅샷 + 펜스 주입 (업그레이드 4단계 2부a)

PLAN §0.36.0 (R54 `approved-with-fixes` → `approved`) · 커밋 `b4ce7f6`(R54 게이트) → `fc1d4f6`(P1 red — D10b 뒤집기 포함) → `35af2ec`(P1 조건부 6번째 fingerprint 입력 + 펜스 렌더러) → `f66a12d`(P2 red + P1 검증 공백) → `a869a30`(P2 red 교정) → `38bf86c`(P2 첫 spawn 스냅샷 + 펜스 주입) → `ee5fb82`(P3 red + P2 검증 공백) → `67c2651`(P3 red 교정) → `50d7a37`(P3 resume/recovery 게이트 + D9) → `3b14a5f`(P4 red + P3 검증 경쟁 테스트) → `feeb9e7`(P4 `worker.memory.enabled` + `HeadlessDeps` profile/memory 배선) → `a58dcba`(스모크 + 기록) → PATCH 5 문서(이 절). 독립 검증 Opus 5.5 xhigh(P1 · P2 · P3 · P4 각 1회) · 자문 fable-advisor · P5 문서·스모크 = Claude Opus 5.5 서브에이전트.

**Deviations (계획 대비 실행 방식):**

| Date | Plan / review ref | Deviation (what we did) | Why conservative | Follow-up |
|------|-------------------|-------------------------|------------------|-----------|
| 2026-10-16 | P1 ② 렌더러 | **(1) P1:** `renderMemoryBlock`은 빈 text 조기 반환 **전에** nonce를 검사한다 — 잘못된 nonce는 빈 text에서도 throw. | 잘못된 seam이 빈 저장소에서 숨지 않게. | — |
| 2026-10-16 | P1 테스트 | **(2) P1:** `stableStringify`는 `agent-argv.ts` 안 private — `memory-inject.test.ts`가 로컬 사본을 둔다(`headless-argv.test.ts` 선례). | `agent-argv.ts` diff를 6번째 입력에 한정(Done when (f)). | — |
| 2026-10-16 | P1 D10b · R54-M1 | **(3) P1:** import 가드를 테스트 셋으로 나눔(정규식 표본 · 허용 importer · `headless-worker.ts` 필수 — 마지막은 P2 green까지 예정된 red). | 실패 원인을 이름으로 구분. | — |
| 2026-10-16 | P1 검증 V-L4 · 계급 11/13 | **(4) P1 검증(코드 변경 0):** 잠긴 `containsMarker`는 닮은 글자 표지(키릴 о · 그리스 α · 점 없는 ı · NFKC 합성 ó)를 놓친다 — 손실 계급 11/13에 기록. | `skill-prompt.ts` diff = `export` 한 단어(Done when (f)) 유지. | 0.37 후보: NFKD + `\p{M}` 제거 + confusables 골격. |
| 2026-10-16 | P1 검증 V-L1/2/3/5/6 | **(5) P1 검증:** 테스트 공백(CRLF·꼬리 공백 바이트 유지 · 40자 넘는 접두 뒤 표지 · zero-width/soft-hyphen 표지 · 넓힌 `IMPORT_RE` · `renderMemoryBlock("", bad)` throw)을 P2 red에 접어 넣음. | red/green 규율 유지. | — |
| 2026-10-16 | ⑦ P2 red/green | **(6) P2:** red `f66a12d`와 green `38bf86c` 사이에 테스트만 커밋 `a869a30` — 하네스 결함: `mockRestore()`가 호출 기록을 지운 뒤 `toHaveBeenCalledWith`(→ call-through mock에서 인자 캡처) · 0500 카드 디렉터리 쓰기 실패 사례가 무효(`spawnOnce` `mkdir0700`이 되돌림) → 제거. 빈 디렉터리 아닌 차단 사례가 `memory-snapshot.md` 쓰기 실패를 계속 덮음. | production 0줄 · 무효 테스트를 남기지 않음. | — |
| 2026-10-16 | R10 · ⑦ P3 | **(7) P2:** resume write-ahead hash(`SpawnPlan.memorySnapshotHash`, R10)는 ⑦ P3 행대로 P3에 넘김 — P3 전까지 resume write-ahead는 키를 빼고 5-입력 fingerprint. | PATCH 경계 준수. | P3에서 해소. |
| 2026-10-16 | D2 · R5 | **(8) P2:** 스냅샷 text가 비어도 nonce를 뽑고 검사 — 잘못된 `memoryNonce` seam은 빈 저장소에서도 `spawn_setup_failed`. stderr `text <T> B` = 리더 text의 UTF-8 바이트(env redaction 전). | seam 오류를 숨기지 않음. | — |
| 2026-10-16 | D2 ⑤ 원자 쓰기 | **(9) P2:** `memory-snapshot.md` 임시 파일을 mode 0600 + flag `"wx"`(배타)로 만든다. | 같은 이름 임시 파일 재사용 차단. | — |
| 2026-10-16 | P2 검증 V-L1/V-L2 | **(10) P2 검증:** 테스트 공백 V-L1(꺼짐 경로 loadSpy 횟수를 `mockRestore` 뒤에 읽음 — 공허) · V-L2(tmp→rename 원자성 미고정)을 P3 red에 접음 · V-L3(resume에 블록 없음)은 P3 R3 테스트가 덮음. | red/green 규율. | — |
| 2026-10-16 | P2 검증 · 계급 12 | **(11) P2 검증 메모:** 읽을 수 없는 저장소도 빈 저장소와 같은 `empty — no block` stderr 줄 — read_errors 수가 없다. | 리더 무접촉(D1 `memory-snapshot.ts` diff 0). | 0.37 후보. |
| 2026-10-16 | ⑦ P3 red/green | **(12) P3:** red `ee5fb82`와 green `50d7a37` 사이에 테스트만 커밋 `67c2651` — (i) 테스트가 reason ≠ `needs_verification`을 단언했으나 파싱된 headless 결과는 모두 그 값 → output `done` + `fingerprint_changed` note 없음으로 단언 · biome 따옴표. | production 0줄. | — |
| 2026-10-16 | R18 | **(13) P3:** R18 읽기 = lstat → `open(O_NOFOLLOW\|O_NONBLOCK)` → fstat 재검사 → 읽은 뒤 크기 재검사(lstat 뒤 바꿔치기 창을 닫음) · ELOOP → `not a regular file`. | 심링크·FIFO로 막히거나 우회되지 않게. | — |
| 2026-10-16 | R11 사유 문구 | **(14) P3:** `bad record field`는 `[headless] memory snapshot check failed (<id>):` 접두로 기록 · 기존 skills-copy-failed stderr 줄도 cardId의 CR/LF를 공백으로 바꿈(기존 줄 소폭 변경). | 로그 줄 위조 차단. | — |
| 2026-10-16 | R3 recovery | **(15) P3:** `recover()`는 prompt `""`로 카드를 다시 만든다 — recovery resume 본문 = `RESUME\n\n` + `wrapDispatchedPrompt("")`(기존 동작, 이제 고정). | 동작 변경 0 · 테스트로 고정. | — |
| 2026-10-16 | P3 테스트 | **(16) P3:** "read error" 테스트는 root로 돌 때 건너뜀. | root는 모드 비트를 무시. | — |
| 2026-10-16 | P3 검증 L1 | **(17) P3 검증:** 바꿔치기 하드닝(O_NOFOLLOW/O_NONBLOCK/fstat)에 커밋된 테스트가 없었음 → 경쟁 테스트를 P4 red에 접음(프로브 `p3v-probe.test.ts`). | red/green 규율. | — |
| 2026-10-16 | D9 · 업그레이드 메모(문서) | **(18) P3 검증(I1, 문서):** D9는 실제로 거의 관측되지 않는다 — 0.35도 recovery/adopt 불일치는 `fingerprintChangedLocked`로 이미 `needs_verification`이었고, 지운 `randomUUID` 갈래는 같은 프로세스 안에서만 닿았으며 `headlessConfig`는 한 번 만들어진다(`bridge-runtime.ts:881`). PLAN 업그레이드 메모의 예(권한/정책 편집)는 0.35에서도 이미 `needs_verification` — P5 문서에서 정정. 메모리 꺼짐 0.35→0.36 업그레이드: resume 8/8 무변경(`5fa8167`이 쓴 레코드로 확인). | 과장된 동작 변경 고지를 바로잡음. | PLAN Known limits에 기록(P5). |
| 2026-10-16 | P4 테스트 배치 | **(19) P4:** bridge-config memory 테스트는 새 `bridge-config-memory.test.ts`(기존 `bridge-config.test.ts` 없음). | 고정 테스트 파일 무편집. | — |
| 2026-10-16 | R16 | **(20) P4:** R16 추가 사례 — profile 생략(`resolveBridgeProfile` → displayName 예 `node/wsl-1` → 해시형 agentKey 저장소 읽기) · `{enabled:false}` · bridge는 재기동마다 세션 파일을 다시 읽음. | 해시형 · 꺼짐 갈래까지 덮음. | — |
| 2026-10-16 | R16 결과 단언 | **(21) P4:** R16 결과는 `failed`/`needs_verification`으로 단언(끝난 headless 카드의 정상 모양). | 실제 결과 모양에 맞춤. | — |
| 2026-10-16 | R1 파서 순서 | **(22) P4:** `parseMemory`는 `workerConfigFromParts`/`parseAgentBin` 뒤에 돈다 — 무효 절이 여럿이면 앞의 오류가 이긴다. | 기존 오류 우선순위 무변경. | — |
| 2026-10-16 | R18 테스트 | **(23) P4:** 경쟁 테스트와 함께 비경쟁 테스트 둘(스냅샷 자리에 디렉터리 / FIFO). | `not a regular file` 갈래 고정. | — |
| 2026-10-16 | UK-6 · D8 (문서) | **(24) P4 검증(UK-6 실측):** 같은 env 프로필 13/13 일치(CLI 쓰기 저장소 == bridge 읽기 저장소) — `--profile` · `LOOM_PROFILE` · `LOOM_SESSION` 조합 · 해시형 displayName · 서비스 유닛 4행 포함. 문서: 서비스 유닛은 `LOOM_SESSION`을 고정하므로 보통 셸의 `loom memory add`는 다른 저장소에 쓸 수 있다 — `--profile <서비스 프로필>`(또는 `LOOM_SESSION`). 0.37 메모: 워커의 scrubbed env(`LOOM_*` 없음)로 친 CLI는 bridge 프로필이 아닌 displayName으로 풀린다 — 워커 제안 기억에 중요. | USER_GUIDE §20.11에 명시. | 0.37. |
| 2026-10-16 | D5 다운그레이드(문서) | **(25) P4 검증(문서):** 0.35 바이너리는 `worker.memory`를 조용히 무시(꺼짐)하고, 0.35 저장(예: `bridge start --allow`)은 설정 파일에서 그 키를 지운다 — 다운그레이드 노트. | USER_GUIDE §20.11에 명시. | — |
| 2026-10-16 | R1 런타임 | **(26) P4 검증(낮음, 동등 변이):** 런타임 `memory.enabled === true`는 고정되지 않은 추가 안전장치(파서가 이미 불리언을 보장). | 보수적 이중 검사 유지. | — |
| 2026-10-16 | P5 스모크 형 | **(27) P5:** 스모크 안쪽 프로세스는 relay·herdr를 띄운 bridge가 아니라 **bridge 설정 경로**(`loadBridgeConfig(resolveBridgeProfile())` → `workerConfigFromBridge` → `headlessAgentCommands` → `bridge-runtime.ts`의 memory 식)로 `HeadlessDispatcher`를 만든다 · 카드 완료 판정 = 결과 output `done`(상태 `failed`/`needs_verification`이 정상 — (21)). | 스모크는 바이트·hash·프로필을 재고, 실 bridge 배선은 R16 테스트가 덮음. | — |
| 2026-10-16 | P5 가드 · R54-M3 | **(28) P5:** bun의 `os.userInfo().homedir`가 `$HOME`을 따르므로 안쪽 프로세스(HOME=T)는 실 홈을 스스로 알 수 없다 → 바깥이 실 홈을 argv로 넘기고 안쪽이 같은 모드별 가드 + `loomDir()` ⊂ `LOOM_TEST_HOME`을 다시 검사 · 실 홈 비교에 `~/Library/LaunchAgents`(엄격, 깊이 1)를 더함. | 이중 가드 · OS 서비스 무접촉 확인. | — |
| 2026-10-16 | P5 `--real-cli` | **(29) P5:** `--real-cli`는 `--owner-approved`가 함께 없으면 exit 2(아무것도 만들기 전) — 구현만, **실행 0**(오너 승인 없음). | 실 CLI 실행은 오너 게이트(R54-M3). | UK-1 · UK-3 실측은 오너 승인 뒤. |

**⑥ 밖 변경:** 없음 — P5의 production 변경은 버전 문자열 셋(CLI `VERSION` · `BRIDGE_VERSION` · MCP `serverInfo`)과 dist뿐. (14)의 skills-copy-failed stderr 줄 CR/LF 치환은 P3 green 안의 `headless-worker.ts`(⑥ 안).

**Known limits (이 버전이 보장하지 않는 것 — PLAN ⑤ 수용 손실 계급 5 · 10~16 + 무번호 2):** 카드 시작 뒤 승인된 기억은 그 카드에 안 보임(5 — 설계) · 변조 = `needs_verification`으로 멈춤(10) · 표지 위장 무력화는 줄 단위 · 닮은 글자 놓침(11 · (4)) · 첫 spawn 동기 읽기(12 — 스모크 실측 `load_ms` 중앙값 16–17 ms · 최대 24–25 ms(2회), 가짜 CLI) · 펜스는 권고(13 — UK-3 미실측) · 워커 출력 redaction 없음(14) · D9 동작 변경(15 — 실제로 거의 관측 안 됨, (18)) · 읽을 수 없는 저장소 = 빈 줄과 같은 로그((11)) · 워커 scrubbed env의 CLI 프로필((24) — 0.37) · **실 CLI가 ≈48 KiB 첫 턴을 받는지 미실측**(UK-1 — 실 CLI 실행 0).

### §0.35.0 — memory / rules / skills 저장소 + CLI + 순수 스냅샷 리더 (업그레이드 4단계 1부)

PLAN §0.35.0 (R53 `approved-with-fixes` → `approved`) · 커밋 `6fb6878`(R53 게이트) → `031aea1`(P1 red) → `a2b5283`(P1 순수 코어) → `7630b2d`(P1 red — 가림 = 한 번 승인된 대체자) → `6e2bb55`(P1 `everActive`) → `c5687dc`(P2 red + P1 검증 테스트 공백) → `b220964`(P2 쓰기) → `7f42d05`(P2 검증 red) → `57e2eeb`(P2 검증 green) → `d761756`(P3 red) → `2376cba`(P3 스냅샷 · 규칙 · 스킬 목록) → `41795b5`(P3 검증 red) → `2b7c9fc`(P3 검증 green) → `37756d9`·`dffe62c`·`c06abd8`(P4 red + red 교정 2) → `dd87870`(P4 CLI + doctor Memory 절) → `7de217e`(P4b red) → `f6253c3`(P4b `redact.ts` 선형화) → `fe1e9e2`(P4 검증 red) → `c6b6ea5`(P4 검증 green) → `9e92375`(스모크 + 기록) → PATCH 5 문서(이 절). 독립 검증 Opus 5.5 xhigh(P1 · P2 · P3 · P4 각 1회) · 자문 fable-advisor · P5 문서·스모크 = Claude Opus 5.5 서브에이전트.

**Deviations (계획 대비 실행 방식):**

| Date | Plan / review ref | Deviation (what we did) | Why conservative | Follow-up |
|------|-------------------|-------------------------|------------------|-----------|
| 2026-10-16 | ② fold | **(1) P1:** 줄 파서 이름 = `parseMemoryLine(line): MemoryLine \| null`(②에 이름 없음). | 공개 표면 최소. | — |
| 2026-10-16 | ② fold 출력 | **(2) P1:** `FoldedEntry`에 `hidden` · `transitions`(적용된 것: seq · to · source · at?) · 현재 `status`를 더함 · `visibleActive`는 (seq 오름, id 오름). | CLI `show`/`list`가 다시 접지 않게. | — |
| 2026-10-16 | ② entry 줄 | **(3) P1:** `at`은 문자열 ≤40만 검사(ISO 형식 검사 없음) · 본문은 길이만(읽을 때 다시 sanitize 안 함 — 리더는 따로 함) · `supersedes` 키 **없음** → unparseable(②가 필수로 적음). | fold·text가 `at`을 쓰지 않는다 · 필수 키는 엄격히. | — |
| 2026-10-16 | ② fold 1) | **(4) P1:** CR 하나 제거 뒤 **완전히 빈 줄만** 건너뜀 · 공백뿐인 줄 → unparseable. | 손상을 숨기지 않는다(fail-visible). | — |
| 2026-10-16 | P1 · R53-L2 | **(5) P1:** profile 해석 테스트는 기존 `resolveBridgeProfile` + `setActiveProfile` + `LOOM_PROFILE` 사용 · 새 production API 없음. | 0.36이 같은 함수를 쓴다. | — |
| 2026-10-16 | ② fold 7) · R53-M1 | **(6) P1 아키텍트 결정:** fold 7 "status ∈ {active, retired}"를 R53-M1의 뜻 "한 번 승인된 대체자" = **한 번이라도 active였던** 대체자(entry 줄 status active 또는 적용된 to-active 전이)로 읽는다. 거절된 제안(proposed→retired)은 대상을 가리지 않는다. `FoldedEntry.everActive` · P2 compact도 같은 술어(`7630b2d` red / `6e2bb55` green). | 승인 없이 거절된 제안이 기존 기록을 지우면 승인 게이트가 무의미. | — |
| 2026-10-16 | P2 | **(7) P2:** 쓰기 테스트는 별도 `memory-store-write.test.ts`. | 순수/쓰기 테스트 분리. | — |
| 2026-10-16 | P2 · 계급 1 | **(8) P2:** `withFileLock` 4초 대기는 주입 불가(`atomic-json.ts`는 ⑥ 밖) — busy 테스트는 실제로 4초 기다린다. | ⑥ 밖 파일 무접촉. | — |
| 2026-10-16 | P2 compact | **(9) P2:** compact "가시 집합 동일"은 fold `visibleActive`로 단언 · P3가 스냅샷 text 비교를 더함. | P3 전 스냅샷 없음. | P3에서 충족. |
| 2026-10-16 | ② 쓰기 검사 ⑤ · R6 | **(10) P2:** propose는 proposed 상한만 본다(가시 active 200에서도 성공) · add는 거부. | 제안 상한은 proposed가 맡고, approve는 상한을 보지 않는다(D5). | — |
| 2026-10-16 | ② 문구 | **(11) P2 문구:** proposed 상한 `N proposed entries (max 200) — approve or retire one` · retire `entry <id> is <status\|missing> — nothing to retire` · 심링크 `refusing <path>: symlink or not a regular path — nothing written` · id 충돌 `could not allocate a fresh entry id — try again; nothing written`. | ②에 없는 문구를 같은 꼴로. | — |
| 2026-10-16 | ② entry id | **(12) P2:** "최대 3회" = 첫 추첨 + 재생성 최대 3회(추첨 4번). | 문면의 보수적 해석. | — |
| 2026-10-16 | ② 검사 ④ | **(13) P2:** 1 MiB 거부 문구의 KiB는 올림. | 1024 KiB를 막 넘은 파일이 "1024 KiB"로 보이지 않게. | — |
| 2026-10-16 | ② 검사 ① | **(14) P2:** 본문은 sanitize된 그대로 저장(trim 안 함 — trim은 빈 본문 판정에만). | 사람이 쓴 공백·들여쓰기 보존. | — |
| 2026-10-16 | ② compact 워터마크 | **(15) P2:** 이전 워터마크 없이 unparseable 줄만 옮기는 compact는 워터마크를 쓰지 않는다(seq 0은 unparseable). | 무효 줄을 만들지 않는다. | — |
| 2026-10-16 | ② compact | **(16) P2:** compact는 빈 줄을 버린다 · 남는 줄은 CR 포함 바이트 그대로. | ② "바이트 그대로". | — |
| 2026-10-16 | ② 경로 | **(17) P2:** 없는 저장소에 approve/retire/compact → 디렉터리 생성 0. | 거부·무동작은 흔적을 남기지 않는다. | — |
| 2026-10-16 | ⑥ API | **(18) P2 API 이름:** `humanMemorySource` · `MEMORY_*_CAP` · `MEMORY_ENTRIES_MAX_BYTES` · 결과 타입들 · 테스트 훅 `memoryStoreTestHooks.failBeforeReplace`. | — | — |
| 2026-10-16 | P2 검증 | **(19) P2 검증 교정:** `CompactResult.message` = CLI stdout 줄 · unparseable 줄만 옮기면 `watermark seq none`. | CLI·API 문구 단일 출처. | — |
| 2026-10-16 | P2 검증 L1 · D5 | **(20) P2 검증 교정(L1):** 옮길 것이 없는데 >1 MiB면 막힘 안내 `nothing to compact — entries.jsonl is X KiB (max 1024 KiB); retire entries first, then compact` · 1 MiB 거부 문구에 `(retire entries first if it moves nothing)`. | 교착처럼 보이는 상태에서 다음 행동을 말한다. | — |
| 2026-10-16 | P2 검증 L2 | **(21) P2 검증 교정(L2):** compact는 고아 전이(대상 id가 fold에 없음)도 옮긴다 — 가시 집합 영향 0(dangling 카운터만 줄어듦). | 정리 뒤 카운터가 남지 않게. | — |
| 2026-10-16 | P2 검증 L3 | **(22) P2 검증 교정(L3):** maxSeq+1이 safe integer가 아니면 모든 쓰기에서 거부 코드 `seq_exhausted`. | 정밀도 잃은 seq를 쓰지 않는다. | — |
| 2026-10-16 | P2 검증 L4 | **(23) P2 검증 교정(L4):** 없는 저장소의 ⑥ 거부는 mkdir 전에(기존 디렉터리 심링크 검사 뒤). | 거부가 디렉터리를 만들지 않는다. | — |
| 2026-10-16 | ② 스냅샷 | **(24) P3:** 비었거나 개행뿐인 사람 파일 = 섹션 생략(없는 것과 같음). | 빈 머리 줄 방지. | — |
| 2026-10-16 | ② 스냅샷 · R10 | **(25) P3:** 사람 파일은 1 MiB 앞부분까지 읽은 뒤 sanitize+redact → 상한에서 자름 · `[truncated at <cap> bytes]` 표지는 상한 밖. | 읽기 비용 상한 · 표지가 본문 예산을 먹지 않게. | — |
| 2026-10-16 | ② 스냅샷 Memory | **(26) P3:** Memory 16 KiB 상한은 기록 줄을 `\n`으로 이은 길이로 셈 · `- … N older entries omitted`는 상한 밖 · 본문은 읽을 때 다시 sanitize+`redactSecrets(·,{})` · `redactedOnRead`는 포함된 기록만 셈. | 방어 이중화 · 카운트는 실제로 들어간 것만. | — |
| 2026-10-16 | ② 스냅샷 flags | **(27) P3:** `flags.counts`(visibleActive · included · proposed · retired)는 범위(scope) 안 기록만. | 스냅샷과 같은 범위. | — |
| 2026-10-16 | ② 스냅샷 · 심링크 | **(28) P3:** 소스마다 `loomDir` 아래 경로 조각이 심링크/잘못된 형이면 `readErrors` +1(심링크 `memory/`는 2 — persona와 entries). | 소스 단위 카운트. | — |
| 2026-10-16 | ② 규칙 파일 | **(29) P3 규칙:** 사용자 본문이 공백뿐 = 비활성 · front-matter 키 `[a-z][a-z0-9_-]*`, 그 밖 줄은 형식 오류 · 사용자 파일은 원문 ≤64 KiB만 읽음 · `.md` 아닌 파일은 조용히 무시 · 이름이 안 맞는 `.md`는 invalid로 표시. | 편집기 부산물 소음 없이 오류는 보이게. | — |
| 2026-10-16 | ② 규칙 병합 | **(30) P3 규칙:** 심링크/읽을 수 없는 `<L>/rules` → `userDirState "unsafe"` + invalid 항목 `rules` 하나. | 사용자 규칙 전체 무시를 보이게. | — |
| 2026-10-16 | ② skills list · R15 | **(31) P3:** `inventorySkills`는 async → `{skills:[{name, source, shadowsBuiltin, status available\|unavailable\|unknown, reason, description}], ignored, userRoot}` · 이름 allow-list를 로드 전에 · 정책 null → status `unknown`(설명은 채움). | 기존 async 로더 재사용 · materialize 무변경. | — |
| 2026-10-16 | ② skills list | **(32) P3:** 사용자 스킬 디렉터리 항목 >512 → 내장 이름만 목록. | 스캔 상한. | — |
| 2026-10-16 | ② 규칙 병합 (텍스트 import) | **(33) P3:** `text-modules.d.ts`에 범위 한정 `declare module "*/rules/report-blockers.md"`. | 전역 `*.md` 선언 회피. | — |
| 2026-10-16 | P3 검증 L1 | **(34) P3 검증 교정(L1):** 1 MiB 읽기 한도에서 잘린 사람 파일 → 표지 `[truncated at 1048576 bytes]` + truncated flag · 디코드 전 바이트 경계에서 자름. | 조용한 잘림 방지. | — |
| 2026-10-16 | P3 검증 L2 | **(35) P3 검증 교정(L2):** 짝 없는 서로게이트 → 스냅샷 `clean()`에서 정규식으로 U+FFFD(`toWellFormed`는 ES2022 lib에 없음). | text가 늘 올바른 UTF-16/UTF-8. | — |
| 2026-10-16 | P3 검증 L4/L5 | **(36) P3 검증 교정(L4/L5):** 규칙 본문은 읽을 때 `sanitizePeerText` + `redactSecrets(·,{})` · 비활성 판정은 자르기 전 trim 본문 · 규칙 `bytes` = front-matter 포함 파일 크기(내장 = 텍스트 길이) · `truncated`는 64 KiB 읽기 절단도 포함. | 0.36 주입 재료의 위생을 리더에서 고정. | — |
| 2026-10-16 | P3 검증 L3 | **(37) P3 검증(L3, 코드 변경 없음):** persona/guideline이 0열 `## ` 섹션 머리나 생략 줄을 위조할 수 있다 — 0.36 리더·펜스는 `## `로 섹션을 나누면 안 된다. | 0.35는 배선 0. | 0.36 펜스 설계(52). |
| 2026-10-16 | ② CLI 공통 | **(38) P4:** `runMemoryCommand` args = `{positional, passthrough}` · deps에 `profileSource`와 선택적 `skillsEnabled()` 리더 추가. | R53-L2 출처 표시 · 테스트 주입. | — |
| 2026-10-16 | ② entry source | **(39) P4:** `source.by` = 세션 displayName, 세션이 없으면 프로필 이름. | 빈 `by` 방지. | — |
| 2026-10-16 | ② list | **(40) P4 list 배치:** `knowledge/INDEX.md`는 프로필 머리 뒤 한 번 · guideline 행은 에이전트 블록마다 반복 · 건수는 저장소 전체, `--room`은 기록 줄만 거름. | 머리 줄이 저장소 상태(상한)를 정확히 말한다. | — |
| 2026-10-16 | ② list/show · R14 | **(41) P4:** list/show는 `entries.jsonl`을 64 MiB까지 읽음 · doctor는 ≤4 MiB만 fold, 넘으면 "not scanned". | 사람이 보는 명령은 크게, doctor는 가볍게. | — |
| 2026-10-16 | ② 출력 | **(42) P4 추가 출력:** rules list `conflict:` · 스캔 상한 줄 · skills list 위험한 skills 디렉터리 · 무효 bridge 설정 · 읽을 수 없는 룸 선택 줄 · 새 사용 오류 문구 · stderr 접두 `loom rules:` / `loom skills:`. | fail-visible. | — |
| 2026-10-16 | ③ doctor | **(43) P4:** doctor 수집기 `readMemoryDoctorInput`은 `memory-cli.ts`에(`doctor.ts`는 순수 유지) · Windows → info 한 줄, 모드 판정 없음 · guideline 모드는 검사 안 함. | doctor 순수 함수 규약(0.33~0.34 선례). | — |
| 2026-10-16 | ⑥ CLI | **(44) P4:** host `index.ts`가 memory store · rules store · `roomKey` · `inventorySkills`/`readRoomSkillSelection`을 export(CLI는 `@loom/host`에서만 import). | cli tsconfig rootDir. | — |
| 2026-10-16 | ② `--json` | **(45) P4 JSON:** show `supersededBy` = `[{id, status}]` · list는 id 배열. | — | — |
| 2026-10-16 | ② list `--all` | **(46) P4:** `list --all`은 가려진 active를 status `active`로 보임 · JSON에 `hidden`. | 상태와 가림을 섞지 않는다. | — |
| 2026-10-16 | ⑦ red/green 규율 | **(47) P4 커밋:** red `37756d9`와 green `dd87870` 사이에 테스트 전용 교정 커밋 2개(`dffe62c` · `c06abd8`). **레인 규칙 위반 기록:** 레인이 자기의 커밋 전 줄에 대해 `git checkout -- packages/host/src/index.ts`를 한 번 실행했다(다시 적용 — 손실 없음). | red는 여전히 테스트 파일만. 위반은 숨기지 않는다. | 레인 스펙에 git 되돌리기 금지 재명시. |
| 2026-10-16 | ⑥ 무접촉 밖 · 아키텍트 + fable-advisor 승인 | **(48) P4b(⑥ 밖):** `redact.ts` `redactUrlUserinfo` 정규식이 긴 `[a-zA-Z0-9+.-]` 연속에서 O(n²)(64 KiB ≈ 9.7초 · 1 MiB 추정 ~40분) — 기존 결함이 0.35 리더(사람 파일 1 MiB 앞부분)로 드러남. lookbehind 형 `(?<![a-zA-Z0-9+.-])([0-9+.-]*[a-zA-Z][a-zA-Z0-9+.-]*):\/\/…`로 교체 · 얼린 옛 파이프라인과 **출력 정확 일치**(손 사례 26 + 퍼즈 20k) · 1 MiB < 1초. `7de217e` red / `f6253c3` green. `redact.ts`의 기존 biome 형식 문제는 건드리지 않음. | 출력 바이트 동일 증명으로 동작 변경 0 · 범위는 정규식 한 줄. | — |
| 2026-10-16 | P4 검증 L1 (회귀) | **(49) P4 검증 교정(L1):** `--all`/`--json`은 memory/rules/skills에서만 불리언 — 인자를 두 번 파싱(추가 불리언 있음/없음)하고 첫 단어로 고름 · 맨 단어 미리보기는 추가 불리언을 보지 않아 `--profile all`/`--room all`은 값으로 남음. 회귀 테스트 `--profile all bridge status` · `bridge status --profile json`. | 기존 명령의 인자 의미 무변경. | — |
| 2026-10-16 | P4 검증 L2 | **(50) P4 검증 교정(L2):** 읽을 수 없는 `entries.jsonl` → list `unreadable — cannot read <path> (EACCES)`(JSON state `unreadable` + `readError`) · show exit 1 · doctor warn `<agentKey>: entries.jsonl unreadable (EACCES)`(선택 `entriesReadError`). | 빈 저장소로 오인하지 않게. | — |
| 2026-10-16 | P4 검증 L4 | **(51) P4 검증 교정(L4):** `memory/` 아래 무시 항목 info 줄은 16개 + `… N more ignored`. | doctor 출력 상한. | — |
| 2026-10-16 | 0.36 기록 | **(52) 검증에서 나온 0.36 메모:** 카드별 핫 경로는 redaction된 persona를 mtime으로 캐시(자문) · 리더는 `## `로 섹션을 나누지 않는다(P3-V-L3 · (37)) · 모르는/철자 틀린 플래그가 다음 단어를 먹는다(옛 파서 동작 — 변경 없음). | 0.35 범위 밖. | 0.36 PLAN. |

**P4b 메모:** (48)은 ⑥ "무접촉" 표 밖의 production 변경(`packages/host/src/redact.ts` 한 정규식)이다 — 아키텍트 + fable-advisor 승인 뒤 red/green 한 쌍으로 넣었고, 출력은 옛 구현과 바이트 동일(손 사례 + 20k 퍼즈)이다. 와이어 · 워커 argv/fingerprint · `packages/protocol` 무변경(D1)은 그대로다.

**Known limits (이 버전이 보장하지 않는 것 — PLAN ⑤ 수용 손실 계급 1~9 + 무번호):** 락 타임아웃 4초 → exit 1(1) · torn·파싱 불가 줄은 건너뛰고 셈(2) · 같은 id 충돌 = 결정적 패자(3) · 락 없는 리더가 반쯤 쓴 줄을 봄(4) · 카드 시작 뒤 승인된 기억은 그 카드에 안 보임(5 — 0.36) · redaction 오탐(6) · 사람 파일 상한 초과 = 꼬리 자름(7) · **codex 셸 deny 미강제**(8 — 문서화만, 0.36 (c) 체크리스트) · 손편집 seq 충돌(9) · 아카이브 무상한·미독 · knowledge 주제 파일 미독 · **사람 파일은 env 값 redaction을 받지 않음**(R53-L3 — 0.36이 리더 밖에서 `redactSecrets(text, process.env)` 1회) · Windows 모드 비트. **배선 0:** `loadMemorySnapshot`을 import하는 production 파일 없음 — 저장소를 읽는 워커 경로 0.

### §0.34.0 — `loom service` launchd/systemd 사용자 서비스 (업그레이드 3단계 2부)

PLAN §0.34.0 (R52 `approved-with-fixes` → `approved`) · 커밋 `a273f8d`(R52 게이트) → `b77a42f`·`966ca03`·`c69e1e4`(P1 red) → `6cde04a`(P1 생성기 · 마커 · D8 · 분류) → `56ecce4`(P2 red) → `ad15ca6`(P2 `LOOM_SERVICE` 양보) → `3910fcf`·`d397cfc`(P3 red) → `726a967`(P3 `loom service` CLI + R13) → `60b051b`(P2 검증 테스트 강화) → `c3242ab`(P4 red) → `732845e`(P4 doctor Service 절) → `7d8133a`(P3/P4 검증 red) → `52716ba`(P3/P4 검증 교정) → `ad67e00`(P5 red) → `fb89d75`(P5 P4+fix 검증 교정) → `244e6a2`(스모크 + 기록) → PATCH 5 문서(이 절).

**Deviations (계획 대비 실행 방식):**

| Date | Plan / review ref | Deviation (what we did) | Why conservative | Follow-up |
|------|-------------------|-------------------------|------------------|-----------|
| 2026-10-16 | ② 이름 · D8 | **(1) P1 D8:** PLAN 식(두 정제기 결과가 다르면 거부)만으로는 `"한글"` · `" x"` · `"/x"`가 통과한다(둘 다 `"__"`류로 같게 바꿈). ② "유효 이름 == 정제 결과" 규칙도 강제 — `profile name "<p>" is not a valid service name (its files would be named "<b>") — rename the profile`. 아키텍트 수용. | 마커 `profile=<p>`와 모든 파일 이름이 프로필 이름 그대로가 된다. | — |
| 2026-10-16 | ② systemd 유닛 | **(2) systemd 이스케이프:** `%`→`%%`는 전부 · `$`→`$$`는 `ExecStart`에만(`Environment=`는 `$`를 펼치지 않는다) · `ExecStart` 인자와 `Environment="K=V"` 전체를 큰따옴표 · `WorkingDirectory=` / `StandardError=append:`는 `%` 외 그대로 · 어느 값이든 줄바꿈은 거부. | 펼치지 않는 자리에서 `$$`를 쓰면 값이 바뀐다. | Linux 실측(UK-4). |
| 2026-10-16 | R10 | **(3) 분류 순서:** launchd `disabled`를 `no_domain`보다 먼저 본다 — disabled를 말하는 오류가 exit 3이 되지 않게. | "다음 로그인에 뜬다"는 거짓 약속 방지. | — |
| 2026-10-16 | ⑥ 생성기 | **(4) P1 추가:** 생성기가 D8 실패 프로필과 상대 경로를 거부 · `renderServiceMarker` · `isLoomServiceFile` export. | 생성기 단독 호출도 같은 규칙. | — |
| 2026-10-16 | P2 · D3 · R1 | **(5) P2**(`56ecce4` red / `ad15ca6` green): `bridge-main.ts` `isServiceYield` + 단일 `process.exit(serviceYield ? 0 : 1)`. 결정적 위험 테스트는 red에서 이미 통과(0.33.0 동작 + P1 생성기 — 예상). `LOOM_TEST_HOME` 없이 격리: 유닛 HOME = 임시 디렉터리(`homedir()`가 HOME을 따름)라 bridge는 생성기 env 키만으로 돈다 · plist와 systemd 유닛을 같은 spec에서 만들어 되읽어 일치 확인 · bridge는 자기 pgid 리더로(서비스 관리자처럼) · 가짜 에이전트 설정은 래퍼 안. 가짜 에이전트가 **한 번만** 떴음(입양, 재spawn 아님)도 단언. `LOOM_SERVICE`는 정확히 `"1"`만(`"0"`/`"true"` → exit 1). | 실 systemd 없이 결정적 위험을 덮는다. | 증명 못한 범위 = PLAN 추정/실측 표 R52-L3 행. |
| 2026-10-16 | P1 검증 (Opus 5.5 xhigh, `6cde04a` accept, H/M 0) | **(6) P1 L → P3:** L1 plist 마커 주석의 `loomVersion` 미이스케이프(plutil로 주입 재현) → `/^[0-9A-Za-z.+_-]+$/` 검증 · L2 systemd 값의 NUL 미거부 · L3 백슬래시로 끝나는 `WorkingDirectory`/`append:` 경로 → 줄 이어짐 · L4 `parseLaunchctlPrint`가 `last exit code = 78: EX_CONFIG` 놓침 · L5 `loomProfile ≠ profile` 허용(R3). systemd 검사는 모델만(Linux 없음) · plist는 `plutil` 적대 사례 110개. | — | P3에서 해소. |
| 2026-10-16 | P2 검증 (Opus 5.5 xhigh, `ad15ca6` pass) | **(7) P2 M(테스트만):** 결정적 위험 테스트가 아무 `CARD_RESULT`나 셌다 — 입양을 건너뛴 경로(`liveness_unknown`)도 통과. → 사유 `needs_verification` + 가짜 에이전트 출력 마커 단언(`60b051b`, P3 레인 · 뮤테이션 확인). D3 정확(`BridgeLockBusyError`는 `bridge-lock.ts:233/235`에서만 · 마감 경로 `holderPid` null → exit 1 · 양보한 B는 자기 stderr만 만진다). env 누출 0(`ps -E`: HOME · PATH · LOOM_SERVICE · LOOM_SESSION · LOOM_PROFILE). | 발견자≠수정자. | — |
| 2026-10-16 | P3 · R5 · R52-L1 · R13 | **(8) P3**(`3910fcf`·`d397cfc` red / `726a967` green — `cli/src/service.ts` 신규 · `index.ts` 배선 + R13 · `bridge-spawn.ts` `bridgeMainPath` export · P1-L1~L5): **PLAN R5/R52-L1 전제 정정** — `envRelayToken()`은 `LOOM_RELAY_TOKEN`만 읽는다(`FABLE_RELAY_TOKEN`은 경고만). install은 **두 env 이름을 직접** 본다(PLAN 문구는 이 PATCH에서 고침). `service status`는 P4 공용 doctor 빌더 전까지 기본 줄 · 사용 오류(R9 거부 · 미지원 플랫폼) 외 exit 0. R13은 4곳(bridge start `~1790` 포함). **열린 선택:** 바이트 동일 + 미적재 재설치도 로그·wants 심링크는 보장(유닛 재작성 없음) · 심링크 아닌 wants 항목 = 남의 것 → 거부 · uninstall은 bootout 뒤 폴 없이 삭제. R9: 실 runner는 `LOOM_TEST_HOME`에서 거부하고 launchctl/systemctl/loginctl만 실행 · `runServiceCommand`도 실 runner + `LOOM_TEST_HOME`을 거부. | 토큰이 env에만 있는 세션을 놓치지 않는다. | — |
| 2026-10-16 | P3 검증 (Opus 5.5 xhigh, `60b051b` PASS with M + L1–L4) | **(9) 프로브 사고 + P3 검증:** 검증자 프로브(가짜 runner · 주입 env `{PATH}` · `LOOM_TEST_HOME` 없음 · 실행 중 process HOME 변경)가 **실 `~/Library/LaunchAgents/com.loom.bridge.work.plist`를 09:45에 썼고 1분 뒤 09:46에 지웠다.** 실 `launchctl` 호출 0 · 이후 `launchctl print` → 113 not found. 오너가 macOS Background Items 알림("Jarred Sumner" = bun 서명자)을 봤다. **M 근본 원인** `service.ts:213` `d.env.LOOM_TEST_HOME \|\| homedir()`가 주입 env를 읽음 · Bun `os.homedir()`는 프로세스 시작 때 고정 · `loomDir()`는 `process.env` → 홈이 갈라짐 · R9 가드는 실 runner에만. **수정은 `52716ba`**(아래 (11)). L1 install 6단계가 마커 파일이 있을 때만 → plist 없음 + label 적재 → bootstrap EIO → no_domain exit 3 오분류 · L2 bootout 폴이 모든 non-zero `print`를 not-found로(타임아웃 137) · L3 6(a)가 적재된 job이 아니라 디스크 파일과 비교 · L4 프로필/버전의 `--`가 XML 주석 안(plutil ok · launchd 미검증). | 실 홈 쓰기는 이 버전에서 한 번 — 근본 원인 제거 후 모든 프로브·테스트는 HOME·`LOOM_TEST_HOME` 둘 다 임시인 서브프로세스. | — |
| 2026-10-16 | P4 · D7 · R12 | **(10) P4**(`c3242ab` red 83 tests / `732845e` green — `doctor.ts` `serviceSection` · `service.ts` `gatherServiceInput`/`serviceDoctorSection` + `spawnServiceManager` · `index.ts` 배선): PATH 표류는 처음에 기본 에이전트(claude/codex/grok) + `worker.agentBin`을 봤다(안 깐 에이전트도 warn — 교정 커밋에서 좁힘) · 양보 행이 서비스 밖 행보다 우선 · ③의 루프백 relay 행 추가. LaunchAgents 전후 동일. host 1303/1(headless P4 review H1 SIGKILL 타임아웃 — 단독 12/12, 부하 flaky). | — | — |
| 2026-10-16 | P3/P4 검증 교정 (`7d8133a` red / `52716ba` green) | **(11)** `service.ts` `serviceHome()` 단일 출처(`session-store` `stateRootHome` export — process.env 규칙) + **어떤 runner든** `testHomeViolation`(LOOM_TEST_HOME이 있으면 모든 대상이 그 안에) · L1 파일이 없어도 bootstrap 전에 `print` · L2 not-found는 113 또는 "Could not find service"만 · L3 적재된 job 비교(launchd `print` arguments · systemd `show` ExecStart argv) → bootout/bootstrap 또는 daemon-reload+restart(진행 중 가드 뒤) · 못 읽으면 `up to date on disk; loaded job unverified` exit 0 · L4 프로필·loomVersion의 `--` 거부 · PATH 표류는 **설정된 에이전트만**(pane/설정 없음 → 없음 · headless에 이름 없음 → 기본 셋, 아키텍트 수용). | 홈을 하나의 규칙에서만 얻는다. | — |
| 2026-10-16 | P4+fix 검증 (Opus 5.5 xhigh, `52716ba` PASS, H/M 0) | **(12) P4+fix 검증 L → P5 Step A:** LaunchAgents 전체 바이트 동일(PATH 스파이 runner · 임시 HOME) · 홈 조합 22개 프로브 — 모든 쓰기가 활성 테스트 홈 또는 시작 HOME. L1 doctor/status 경쟁 타이머가 Bun 2초 spawn 타임아웃보다 먼저 울려 `process.exit`이 멈춘 launchctl 자식을 남김 · L2 `loomDir()` 캐시 vs `serviceHome()` 호출마다 → 프로세스 안에서 `LOOM_TEST_HOME`을 지우면 홈이 갈라짐 · L3 `~/.fable`만 있는 홈에서 `service status`가 `loomDir()`로 `~/.loom` 이주. | — | (13). |
| 2026-10-16 | (12) L1~L3 | **(13) P5 Step A**(`ad67e00` red / `fb89d75` green): **L1** `spawnServiceManager`가 타이머를 직접 가진다 — 시간 초과 시 SIGKILL(doctor/status 읽기는 detached 자식 → **프로세스 그룹 전체**) 뒤 exit·파이프를 기다리고 결과를 낸다 · 읽기 자식 상한은 경쟁 타이머(2초)보다 250 ms 짧다 → CLI 종료 전에 회수. 테스트: PATH = 스파이 dir + bun dir만(실 launchctl 도달 불가 단언) · `sleep 7`을 fork하는 스파이 · CLI 종료 뒤 스파이 셸·자식 0. 쓰기 동사(10초)는 detached 없이 pid만 kill(라이브 미검증 경로의 변경 최소화). **L2** install/uninstall/start는 `loomDir()` 기반 bridge 디렉터리(설정·상태·락·로그)가 `serviceHome()` 아래가 아니면 거부(`… is outside the service home …`) — 프로세스 안 삭제 사례를 임시 HOME 서브프로세스로 테스트. **L3** `service status`는 doctor 규칙(`<home>/.loom`)으로 세션·프로필·bridge 디렉터리를 읽는다 — 새 `sessionPathUnder(home)`(`sessionPath()`가 이것을 부른다) · `loomDir()` 호출 0 → 레거시 홈 트리 불변. | 읽기 명령은 아무것도 남기지 않는다 · 홈 둘이 갈라지면 쓰지 않는다. | — |
| 2026-10-16 | P5 스모크 · Done when (i) | **(14) P5 Step B — 스모크**(`244e6a2`, `docs/spikes/SERVICE-SMOKE-0340.md`): dist CLI(`--source`도) 6/6 PASS · ~3초. **P5 행 문면과 다름:** CLI 자식에 `LOOM_TEST_HOME`을 주지 않는다 — 그 아래서는 실 runner가 모든 동사를 거부(R9)해 아무것도 못 돈다. 대신 자식 HOME = 임시 · PATH = 스파이 dir + bun dir만 · `Bun.which`가 launchctl/systemctl/loginctl 셋 다 스파이로 풀리지 않으면 중단 · 실 홈 `~/Library/LaunchAgents`·`~/.config/systemd`·`~/.loom` 목록 전후 비교. **라이브 경로:** 생성기에 `extraEnv`를 **더하지 않고** 스모크가 렌더된 plist 텍스트에 `LOOM_TEST_HOME`을 끼운다(제품 생성기의 env 집합 고정 — ② env 금지 행) · `--live` **그리고** `LOOM_SERVICE_LIVE_SMOKE=1`. **live smoke: not run (awaiting owner approval).** | 실 launchctl 호출 0 · 실 홈 무접촉. | 오너 yes 뒤 `--live`로 UK-1~UK-3 실측. |
| 2026-10-16 | PLAN ⑦ 레인 | **(15) 레인:** 구현 P1~P5 = **Opus 5.5 서브에이전트** · 독립 검증 = **Opus 5.5 xhigh**(P1 · P2 · P3 · P4+fix 각 1회) · 자문 = fable-advisor · **GPT-6.1 Sol 제외**(오너 2026-10-16). | 오너 지시 · 발견자≠수정자. | — |

**Known limits (이 버전이 보장하지 않는 것 — PLAN ⑤ 수용 손실 계급 1~13):** pane 카드·conv flight 유실(1) · 업그레이드 전 headless 워커는 옛 코드로 완료(2) · SIGKILL = `recover()`(3) · 루프백 relay 비감독(4) · pane + herdr 부재 = 10초 크래시 루프(5) · 캡처 PATH 낡음(6) · 사용자 범위만 · Windows 밖(7) · **로그아웃이 워커를 죽인다 — Linux linger 없음 / macOS 공통**(8) · Login Items에서 끌 수 있음 · "Jarred Sumner"(bun)로 표시(9) · 네트워크 준비 순서 없음(10) · 양보한 서비스는 `service start`까지 내려감(11) · 로그 append만, 회전 없음(12) · `KillMode=process` 정지 뒤 워커가 유닛 cgroup에 남음(13). **미실측:** 실 launchd/systemd 라이브(오너 게이트) · UK-1 정지 신호 순서 · UK-2 Login Items 끈 뒤 문구 · UK-3 ssh 코드 · UK-4 Linux 전부 · UK-5 Linux lstart.

### §0.33.0 — bridge 생명주기 보강 (업그레이드 3단계 1부)

PLAN §0.33.0 (R51 `approved-with-fixes` → `approved`) · 커밋 `f68fe68`(R51 게이트) → `b8739d9`(P1 red) → `7efbb1d`(P1 락 + 상태 파일 writer) → `ff0a454`(P1 검증 교정) → `20c4e46`(P2 red) → `7de46a7`(P2 신호 · 상한 · 락/상태 배선) → `933ddb3`(P3 red) → `36b169d`(P3 drain) → `5383145`(P4 red — P2·P3 이월 포함) → `236a8c1`(P4 headless herdr 생략 · conv 거절 · doctor · 꺼진 status) → `59572e2`(P5 red) → `38933f1`(P5 P4-검증 교정) → `bb97ffd`(스모크 + 기록) → PATCH 5 문서(이 절).

**Deviations (계획 대비 실행 방식):**

| Date | Plan / review ref | Deviation (what we did) | Why conservative | Follow-up |
|------|-------------------|-------------------------|------------------|-----------|
| 2026-10-16 | ⑤ 영향 파일 · D3 · R8 | **(1) P1 락:** 공용 lstart 읽기를 `process-lstart.ts`로 꺼냈다(⑤ 목록 밖 신규 파일 — `headless-worker.ts` 동작 무변경). owner 없는 락 디렉터리(<5초 거부 / ≥5초 회수)는 레거시·외부 디렉터리에만 해당 — 우리 획득은 비공개 디렉터리에 `owner.json`을 먼저 쓰고 rename한다(`ff0a454`). 회수 뮤텍스는 pid+lstart 소유자를 싣고 그 소유자가 죽었거나 pid가 재사용됐을 때만 깨진다. pid ≥ 1 허용. **잔여:** 존재 확인과 rename 사이에 외부 프로세스가 **빈** 락 디렉터리를 mkdir하면 교체될 수 있다(우리 디렉터리는 비지 않는다). | 측정 방식 하나(R8) · 반쯤 만든 락이 남의 것으로 보이지 않게. | — |
| 2026-10-16 | ② 상태기계 · R11 | **(2) 전이 표:** `starting→stopping`(R11) · `starting→stopped`(기동 실패) 허용 · `running→stopped` · `draining→stopped` · 역행 · 반복 금지. 거부된 전이는 stderr 1줄. `stopped` 뒤 heartbeat/startHeartbeat 무동작 · `atomic-json` 실패 시 tmp 삭제. | 정지 경로가 `stopping`을 건너뛰지 않게 · 진단은 판정을 바꾸지 않는다. | — |
| 2026-10-16 | R2 · R51-M3 | **(3) `finally` 꼬리 순서:** 격리 `onProcessExit` → `clearBridgeMeta` → `stopped` 기록 → 락 해제(R2 문면은 락이 `stopped` 앞). | 락을 먼저 풀면 후계자의 `starting`을 우리 `stopped`가 덮을 수 있다. | — |
| 2026-10-16 | ② 상태기계 · R10 | **(4) 락 전 실패**(세션 없음 · 무효 bridge 설정)는 상태 파일을 쓰지 않는다 · 락 뒤 실패는 `stopped` + `lastError`. | 락 전에는 살아 있는 보유자의 파일일 수 있다. | — |
| 2026-10-16 | ② 버전 · import 순환 | **(5)** `BRIDGE_VERSION` 상수를 `bridge-runtime.ts`에 두고 테스트가 CLI `VERSION`과 같음을 고정(P5가 둘 다 0.33.0으로) · `STOP_BOUND_MS`는 `bridge-spawn.ts`(import 순환 회피). | CLI 패키지를 host가 import할 수 없다. | — |
| 2026-10-16 | R11 | **(6) 기동 중 신호**는 보류 → 상태 `starting → running → stopping` · 기동 중 두 번째 신호는 즉시 exit 0. | 반쯤 뜬 bridge를 정리 없이 버리지 않는다. | — |
| 2026-10-16 | UK-1 | **(7) UK-1 resolved:** bun 1.3.11에서 `process.on('SIGTERM')` 확실히 발화 — P2 bridge exit 0까지 18 ms(×3 안정) · P5 스모크 6–7 ms(×3). | 실측. | — |
| 2026-10-16 | P2 검증 (Opus 5.5 xhigh, accept) | **(8) P2 이월 → P4:** L1 pane RPC `stop` 응답이 flush 전에 닫힘(`server.stop` 전 yield) · L2 herdr 상태가 기동 때 고정(끊김·재연결 반영) · L3 거부된 start가 보유자 stderr 로그를 절단("w"를 락 전에 염) + CLI 로그 이름(default) vs 락/상태 이름(displayName) 불일치 — 모두 P4에서 해소. 이론상: 회수자 ≥3명일 때 `breakStaleMutex` 되돌리기 실패 — 수용(현실 범위 밖). | 발견자≠수정자 유지. | — |
| 2026-10-16 | D4 · R4 · UK-3 | **(9) P3 drain:** RPC `timeoutSec`(1..86400, 기본 600 = UK-3 출발값). drain은 `claimedStarting` 카운터(등록 전 claim된 pane/conv 인계)도 기다린다 — remaining/inFlight에는 안 보인다(잠깐 0으로 읽힐 수 있음). ② 검사에서 거부된 claim은 `processedHandoffs`에서 빼 다시 관측되게 한다. 유휴 drain은 첫 100 ms 틱에 정지(응답 전달 보장). `index.ts`가 `bridgeStatusPath` export. CLI drain은 신호를 보내지 않는다 · 상한 넘어 살아 있으면 exit 1 + pid + 상태 경로. | drain이 claim 직후 인계를 놓치지 않게 · CLI가 정지 권한을 넘지 않게. | — |
| 2026-10-16 | P3 검증 (Opus 5.5 xhigh, `36b169d` accept, H/M 0) | **(10) P3 이월 → P4:** P3-L1 `payload_invalid` claim+실패 결과 송신이 `claimedStarting` 밖 → drain이 실패 결과 전에 정지 가능(카운터 + `finally`로 감쌈) · P3-L2 conv blocked 알림(`pane_closed` · `events_subscribe_failed`)이 fire-and-forget → drain 정지 전 송신을 기다림 · 커버리지: drain 중 신호/RPC stop 테스트 추가. | — | P4에서 해소. |
| 2026-10-16 | D6 · R5 · R51-M1 · D5 | **(11) P4**(`5383145` red에 P3 이월 테스트 포함 / `236a8c1` green): headless herdr 스텁(`herdr:"skipped"`) · conv.open claim 1회 거절 `conv_unavailable_headless` · doctor bridge 절 · 꺼진 bridge status · P2-L1/L2/L3 + P3-L1/L2. red에서 바뀐 기존 테스트: SIGTERM 테스트가 herdr `skipped` 기대 · 기동 중 신호(R11) 테스트를 새 pane 프로필 `panenode`로 이동. 격리 오프라인 폴백 → `resolveBridgeProfile()`. 살아 있는 herdr 건강 = 기동 핑 ok **그리고** 이벤트 스트림 연결(상태 파일은 ≤5초 늦을 수 있음). stale 락 = doctor `info`(died `warn`이 덮음) · `lastError` = `warn`. UK-7 증거: herdr 소켓 부재 → headless bridge running + 카드 왕복(`bridge-headless-noherdr.test.ts` 첫 테스트). | — | — |
| 2026-10-16 | P4 검증 (Opus 5.5 xhigh, `236a8c1` accept, H/M 0 · host+cli 1220/0) | **(12) P5 Step A — P4 검증 교정**(`59572e2` red / `38933f1` green): **L1** 깨진/모르는 버전 상태 파일을 doctor가 "never started (no status file)"로 보이던 것 → `readBridgeStatusFileResult`(`absent` \| `invalid`+사유 \| `ok`)를 더하고 기존 `readBridgeStatusFile`은 그 위의 래퍼로 유지. 파일이 있는데 못 쓰면(빈 파일 · 잘린 JSON · `null` · 배열 · 모르는 `v` · 모르는 `state` · 읽기 오류) doctor `warn bridge status file unreadable: <path> (<사유>)` · 꺼진 `bridge status`도 같은 줄. 읽기 전용 · exit 코드 무변경. **cosmetic:** headless에서 `loom bridge start` · 켜진 `bridge status`가 소켓 경로 대신 `herdr: skipped (headless)`(켜진 쪽은 RPC `herdr` 필드, start는 RPC 우선 · 설정 폴백). **수용:** L2 pid가 재사용된 `stopped` bridge를 alive로 표시(조언용 pid 계급) · 거절 송신 실패 후 재시도 없음(R51-M1 패턴). red 커밋은 내 커밋을 한 번 고쳐 씀(켜진 status의 `health:` JSON 덤프에 소켓 경로가 남아 단언을 `  herdr: <path>` 줄로 좁힘). | 없음과 망가짐을 같은 말로 보이지 않는다. | — |
| 2026-10-16 | Done when (i) · UK-2 · UK-3 | **(13) P5 Step B — 스모크** `bun run smoke:bridge-lifecycle`(`bb97ffd`, `docs/spikes/BRIDGE-LIFECYCLE-SMOKE-0330.md`): ①~④ PASS ×3(macOS · bun 1.3.11 · ~23초). ②는 보유자를 CLI `bridge start`로 띄우고 두 번째 프로세스는 같은 spawn 명령(`bun run bridge-main.ts`)으로 — 로그 비절단은 CLI 두 번째 start 경로로 확인. **UK-2:** macOS `ps -o lstart=` = `owner.json` lstart 바이트 동일 · **Linux 형식 미실측(Linux 환경 미사용)**. **UK-3 resolved-by-decision:** 기본 600초 유지(코드 무변경) — grok 헤드리스 ~9분(PLAN.md:601)은 카드 시작 직후 drain일 때만 600초 안 · grok 노드는 `--timeout 1200` · 수용 손실 계급 = 마감에 잘린 카드. | 실 `~/.loom` 무접촉(임시 `LOOM_TEST_HOME` 강제 · 실패 시에도 삭제). | Linux lstart 형식은 Linux 환경이 생기면 확인. |
| 2026-10-16 | PLAN ⑥ 레인 | **(14) 레인:** 구현 P1~P5 = **Opus 5.5 서브에이전트** · 독립 검증 = **Opus 5.5 xhigh**(P1~P4 각 1회) · 자문 = fable-advisor · **GPT-6.1 Sol 제외**(오너 2026-10-16). | 오너 지시. 발견자≠수정자 분리 유지. | — |

**Known limits (이 버전이 보장하지 않는 것 — PLAN ④ 수용 손실 계급):**

- **pane 카드·conv flight 유실**(계급 1) — SIGTERM · drain 마감 때 진행 중 pane 카드·conv는 이어받지 못한다 · claim된 handoff는 relay에 claimed로 남고 실패 결과도 없다.
- **업그레이드 전 headless 워커는 옛 코드로 끝난다**(계급 2) · **SIGKILL = 오늘 `recover()`**(계급 3 — doctor `warn` · 다음 기동 회수).
- **두 번째 신호 · CLI 3초 SIGTERM 뒤 상태 파일 `stopping` 잔존**(doctor `warn` 설계상) · **drain 중 미claim handoff 재관측 stderr 1줄/handoff**.
- **stale 락 판정 best effort**(pid + lstart · 못 읽으면 거부) · Linux lstart 미실측 · 빈 외부 락 디렉터리 경합 잔여(1).
- **하트비트 stale은 조언** · 재사용 pid의 `stopped` bridge alive 표시 · 루프백 relay·sticky host 비감독(계급 4) · pane backend + herdr 부재 = fail-fast(계급 5).

### §0.32.0 — Loom MCP 사전 점검 (업그레이드 2단계 2부 마무리)

PLAN §0.32.0 (R50 `approved-with-fixes` → `approved`) · 커밋 `58f3b02`(P1 red) → `7cb5048`(P1 `loomTools` · export) → `dfa6878`(P2 red) → `f53def9`(P2 판정 + 감사 기록기) → `96b57d3`·`2249d6e`·`e1eca3d`·`d7afef2`·`9118e0d`·`6ad43d7`·`600846a`·`933c9e1`(P2 검증 1~7b차 — 감사 기록기) → `5414329`(P3 red) → `a00837b`(P3 zod → 파생 `inputSchema` · 엄격 검증) → `0eb9530`(P3 검증 1차) → `c7592ec`(P4 red) → `ab12168`(P4 배선 · L-2) → `e6d0ad8`·`cdf5334`·`d1ff0a0`·`1f8542e`·`b3e9c2a`·`1ba074c`·`f5c59ce`(P4 검증 1~4차) → `1e97aa7`(P5 라이브 스모크 `docs/spikes/MCP-PRECHECK-SMOKE-0320.md`) → PATCH 5(문서·VERSION·dist).

**설계 결정 기록 (구현 중 확정 — PLAN 문면 대비):**

| Date | Plan / review ref | Deviation (what we did) | Why conservative | Follow-up |
|------|-------------------|-------------------------|------------------|-----------|
| 2026-10-16 | ② 판정 함수 시그니처 · D1 · R4 | **주입식 도구 레지스트리(아키텍트 수정, P2):** `evaluateMcpCall(gate, registry, name, args, ctx)` · `toolVisible(gate, registry, name)`. `ctx = {peerId, roomId, agentKind, now}`(시계 주입). 성공은 **검증된 인자**를 돌려주고(`{ok:true, args, audit?}`) 거부는 `message`를 싣는다. | host는 mcp-server의 zod 스키마를 import할 수 없다(의존 방향). 레지스트리를 주입하면 판정은 순수하게 남고, 5·6단계가 원시 인자가 아니라 zod를 통과한 값만 읽는다(R6). | PLAN ② 행 구현 정정 기재. |
| 2026-10-16 | D5 `broadcast` · R2 | `handoff`에서 `to`가 없으면 브로드캐스트로 판정(디스패처 기본값 `"*"`). zod 스키마는 `to`를 요구하므로 실제로는 `invalid_args`가 먼저다. | 기본값 경로가 새지 않게 실효 대상으로 판정 — R2(`conv_close` 기본 reason)와 같은 원칙. | — |
| 2026-10-16 | ② 감사 파일 · D8 · UK-3 | **감사 기록기 최종형(P2 검증 1~8차 · fable-advisor 판정 · 아키텍트 판정으로 종결) — 락 없음.** live 경로 lstat(없음 = 0 · 심볼릭 링크 = 기록 생략) → `size>0 && size+line>1 MiB`면 **쓰기 전에** 고유 세대 이름 `policy-audit.<YYYYMMDDTHHmmssSSSZ>-<pid10>-<rand6>.jsonl`로 원자적 rename(이름은 rename 직전 lstat으로 부재 확인 · 새 접미사로 최대 3회 재시도 · 다 차면 그 회전만 생략, live가 잠시 1 MiB 초과 가능 · ENOENT = 다른 기록기가 이미 회전 → 계속) → `O_WRONLY\|O_APPEND\|O_CREAT\|O_NOFOLLOW` 0600 + fd fchmod + 전체 쓰기 루프(짧은 쓰기 → stderr + false). **정리 규칙:** 자신이 방금 회전한 세대 · 이름순 최신 3개 · 이름 시각을 파싱할 수 없는 세대 · mtime·ctime(rename이 갱신 — live로 연 어떤 기록기의 open보다 이르지 않다)·이름 시각 중 가장 늦은 것이 60초 안인 세대는 지우지 않는다. 룸당 디스크 ≤ live + 3 + 최근 60초 안에 쓰이거나 회전된 세대(쓰기 속도 의존). 줄 ≤4,096바이트(LF 포함 — 단계적 절단 · 선택 필드 제거 · 그래도 넘으면 생략 + stderr). 필드 허용 목록 `v, ts, kind, tool, reason?, mode?, peerId, roomId, agentKind, cardId?, convId?`(PLAN 스키마에 `roomId` 추가). 읽기 = `listPolicyAuditGenerations(roomDir)`, ENOENT 허용 · 파싱 불가 줄 건너뜀. **PLAN의 "상한을 넘은 뒤 `.1`로 rename(이전 `.1` 대체)"을 대체한다.** link+unlink는 기각(더 새 live 파일을 지울 수 있다). | 덮어쓰기 0(rename 대상은 늘 부재 확인된 이름) · 절단 0. 프로세스 간 락은 정지한 락 보유자가 모든 기록기를 막는다 — 감사는 관문이 아니므로 락 없는 쪽이 보수적이다. | 유실 창 = Known limits. PLAN ② 행 구현 정정 기재. |
| 2026-10-16 | D4 `import_board` 감사 | `import_board` 감사 `cardId` = 스냅숏의 done 카드 id를 이어 붙인 것(≤5개 + `+N`). | 감사 스키마에 배열 필드를 늘리지 않고 거부 문구와 같은 표기를 쓴다. | — |
| 2026-10-16 | D2 · R3 · P3 검증 1차 | 명시적 `arguments: null`은 거부(생략만 `{}`) · 미지 키 되풀이 상한(이름 ≤3개 · 각 32자 · 합계 ≤128자) · 거부 문구 = 판정 함수 메시지 `invalid arguments at <path> (<code>)`, 사유 코드는 stderr·감사에. `docs/TEST_PLAN.md` 14.G1 갱신(`set_purpose verify` → 엄격 스키마가 먼저 거부, M-24는 host 직접 경로에서 유지). | `null`을 `{}`로 보면 "인자 없음"과 "명시적 무효"가 섞인다. 미지 키 이름은 호출자 입력이라 그대로 되풀이하면 응답·로그가 부풀 수 있다. | — |
| 2026-10-16 | R5 · R6 · D9 단계 순서 | 미지 도구 + **무효 정책** → `isError` `policy_invalid`(1단계가 먼저) · 유효 정책에서 미지 도구 → JSON-RPC `-32601`. `dispatch_card`는 L-2 고정용으로 `list_peers`를 추가로 부른다 — 보내기 전 1회, 그 조회가 대상을 하나로 정하면 보낸 뒤 1회 더(최대 2회). | 단계 순서를 문면 그대로 지킨다 — 무효 정책에서는 어떤 이름이든 이유가 같다. | — |
| 2026-10-16 | D9 재-stat 재로드 → 캐시 없음 | **정책 캐시를 두지 않는다**(P4 검증 3차): `tools/list` · `tools/call`마다 `loadPolicy`(64 KiB 상한 · 재로드 ~43 µs). 한 호출 = 한 게이트. `loomDir`가 ENOENT이고 그 부모가 실제 디렉터리로 해석되지 않으면(매달림 · 부재 · 비디렉터리) fail-closed — 헤드리스 워커 로더도 같다(fingerprint 무변경). 부모 확인은 심볼릭 링크 홈을 따라간다(`1ba074c`). **부재 판정은 두 번의 일치하는 관측**(ENOENT + loomDir/부모 식별 토큰)이 있어야 기본값, 1회 재시도 후에도 어긋나면 `policy.json changed during load`로 fail-closed(`f5c59ce`). (1·2차의 lstat 키 캐시 · 부재 캐시는 폐기.) | `(mtime, size, ino)` 캐시는 같은 inode 제자리 재작성을 놓치고, 부재 캐시는 경합 중 오래된 게이트를 낸다. 매번 읽어도 싸다. | PLAN ② 재로드 행 구현 정정 기재. 잔여 L-1/L-2 = Known limits. |
| 2026-10-16 | R7 · R50-M2 · D8 L-2 | **L-2는 거부가 아니라 fail-visible(P4 검증 2차 fable-advisor 판정 → 3차 형태 확정):** `fromPeerId`와 고정 `dispatchPeerId`가 다르면 결과는 평소처럼 `blocked`로 착지하고, **로컬 카드 플래그 `l2Mismatch: true`**(재디스패치 때 지움) + 감사 `l2_mismatch`(kind·reason 모두, 카드 id와 시각만 — 고정 id·주장 id 미기록) + stderr `[loom-tower] l2_mismatch cardId=…`. **노트는 0.31.0과 바이트 동일.** 라우팅은 0.31.0 이름 라우팅으로 복원(1차의 고정 peer id 라우팅 철회) · 고정은 정규 id만(≤64자 · 앞뒤 공백 없음 · 제어 문자 없음 · 예약어 아님 · 인박스 sanitize 후 비교) · 보내기 전후 두 조회가 같은 단일 일치일 때만. 고정 id는 MCP 출력(`mcpResultJson` replacer) · sticky `/rpc` · 오류/노트 텍스트에 노출하지 않는다 · 두 필드 모두 스냅숏에서 제거. **PLAN R7의 "불일치 = 거부"와 `l2_from_peer`를 대체한다.** | L-2는 권위가 아니다(모델이 베끼는 주장 · 생략 시 우회 — R50 수용) · 결과는 검사와 무관하게 `blocked` · fail-closed는 relay 이름 라우팅에서 비롯한 0.31.0 대비 오거부 회귀 2건을 냈다. | 배타적 peer-id 라우팅은 Non-goals로 이월. PLAN R7 · ② L-2 행 구현 정정 기재. |
| 2026-10-16 | ② 감사 · 거부 코드 | `PolicyAuditRecord.kind`에 `l2_mismatch` 추가 · 사유 코드 `l2_from_peer` → `l2_mismatch`. | 위 행의 결과 — 거부가 아니므로 `refused`로 적지 않는다. | — |

**Deviations (계획 대비 실행 방식):**

| Date | Plan / review ref | Deviation (what we did) | Why conservative | Follow-up |
|------|-------------------|-------------------------|------------------|-----------|
| 2026-10-16 | PLAN ⑥ 레인(구현 `grok-implementer` 우선 · 검증 codex) | **(a) 레인** — 구현 P1~P5 = **Opus 5.5 서브에이전트**(0.31.0 P2부터의 오너 지시 연장). 독립 검증 = codex `gpt-6.1-sol` xhigh — **P2 8차까지 · P4 3차까지** · 이후(**P4 4차 `f5c59ce`부터**) **Opus 5.5 xhigh**(오너 지시 2026-10-16 — GPT-6.1 Sol을 모든 레인에서 제외). 자문 = fable-advisor. | 오너 지시. 발견자≠수정자 분리는 유지. | — |
| 2026-10-16 | lessons (60) | **(b) PATCH별 검증 라운드:** P1 0회 교정 · **P2 8라운드**(`96b57d3` 회전 락 · nofollow · 필드 허용 목록 · 바이트 상한 → `2249d6e` 락 없는 고유 세대 회전(3개 유지) · 줄 ≤4096(LF 포함) → `e1eca3d` 전체 쓰기 루프 · mtime 정리 · 정지 기록기 한계 문서화 → `d7afef2` 자기 세대 비삭제 → `9118e0d` 이름순 + 60초 유예 → `6ad43d7` 유예 = max(mtime, 회전 시각) → `600846a` ctime 포함 → `933c9e1` rename 직전 이름 부재 확인 → **8차: 아키텍트 판정으로 종결**(벽시계 한계 수용, 아래)) · P3 1라운드(`0eb9530`) · **P4 4라운드**(`e6d0ad8` 조회 오류 fail-closed · 고정 · 비노출 → `cdf5334`·`d1ff0a0` 부재 캐시 · **L-2 fail-visible · 이름 라우팅 복원** → `1f8542e`·`b3e9c2a`·`1ba074c` 캐시 제거 · 부모 fail-closed · 카드 플래그 · 노트 바이트 동일 → `f5c59ce` 부재 이중 관측 · sticky RPC 로컬 필드 제거). | 동시성(감사 회전)·경합(정책 부재 판정)은 한 번에 닫히지 않았다 — 라운드마다 범위를 좁혀 재검증, 남은 계급은 명시 수용. | — |
| 2026-10-16 | Done when (i) "실 `loom run claude` 세션" | **(c) 라이브 스모크 방식:** 대화형 `loom run` PTY 대신 `claude -p`에 `loom run claude`와 **같은 `--mcp-config` 배선**(+ `--strict-mcp-config`)을 주고 격리된 `LOOM_TEST_HOME`에서 돌렸다. codex(`exec` + `-c mcp_servers.loom.*`) · grok(ACP `session/new.mcpServers`)도 같은 실서버. | 실제 `loom run`은 실 `~/.loom` 세션에 묶인다 — 오너 상태를 건드리지 않는다. 서버 측 동작은 동일. | 문자 그대로의 대화형 실행은 오너가 원하면 남은 일(스모크 finding 3). |
| 2026-10-16 | PLAN ④ 정직 표 "codex/grok 확인 없음(아키텍트 진술 · 미측정)" | **(d) 정직 표 정정(실측):** **codex는 MCP 호출에 승인을 요구한다** — 도구별/서버별 `approval_mode = "approve"`가 없고 `approval_policy = "never"`면 `MCP tool call requires approval, but approval policy is never`로 실패(Loom 도달 0). 오너의 승인 설정은 오너/codex "always allow"에서 온다(Loom은 쓰지 않음). grok(ACP)은 확인 없음 — 진술대로. UK-1 = 셋 다 `isError` 문구 그대로 표면화 · UK-4 = Loom은 권한 설정을 쓰지 않음, claude 확인 여부는 오너 권한 모드. | 미측정 진술을 실측으로 바꾼다(lessons (30)). | PLAN ④ · `USER_GUIDE.md` §17.7 정정. |
| 2026-10-16 | UK-2 | **(e) UK-2 조사(P3):** 리포 호출자 중 엄격 검증에 걸린 것은 문서 예시 1건 — `TEST_PLAN.md` 14.G1 `set_purpose {verify:[…]}`(이제 `invalid_args`가 먼저, M-24는 host 경로에서 유지). 기존 smoke-uc 흐름은 **수정 0줄**(P4 red는 신규 케이스만 추가) · PATCH 5 시점 `bun run smoke:uc` OK. | 수정은 호출자 쪽(스키마 완화 아님) — PLAN UK-2 규칙대로. | UK-2 resolved. |

**Known limits (이 버전이 보장하지 않는 것 — 수용한 잔여):**

- **감사 기록 유실 계급(P2 종결):** 60초 정리 유예보다 오래 멈춘 기록기·회전기만 레코드를 잃을 수 있다. 유예는 벽시계(mtime · ctime · 이름 시각 · `Date.now`)를 쓰므로 진행 중인 쓰기 도중 시계가 유예 이상 **앞으로** 뛰면 기록기가 아직 열어 둔 세대를 정리가 지울 수 있다(레코드 1건) — 정지 기록기와 같은 계급으로 취급. 프로세스 간 이름 충돌은 같은 pid + 같은 ms + 같은 6자 접미사일 때만(같은 디렉터리를 공유하는 pid 네임스페이스).
- **정책 부재 판정 L-1(ABAB):** 심볼릭 링크로 둔 `.loom` 대상을 한 로드 안에서 네 번 바꿔치기(치우고 되돌리기)하면 기본값이 나올 수 있다 — 경로 기반 검사는 `openat` 없이 닫을 수 없고, 그 접근을 가진 쓰기 주체는 어차피 `policy.json`을 지울 수 있다.
- **정책 부재 판정 L-2(첫 실행 경합):** stat과 lstat 사이에 다른 프로세스가 `~/.loom`을 만들면 일시적 fail-closed 거부 1회 — 다음 호출은 정상.
- **L-2는 조언 신호다.** `fromPeerId` 생략 시 우회(R50 수용) · peer 변동(참가-전송-이탈, 다른 peer의 `@name`과 같은 id)으로 드물게 잘못 표시될 수 있다 · 절대 거부하지 않는다.
- **`propose`는 MCP 층만(R9)** — 대화형 셸의 `loom board set … done` 우회는 그대로. 사람 확인 채널 · 폴더 규칙 · 인계 대상 허용 목록 · 배타적 peer-id 라우팅은 이월.
- **기본 `allow`는 꼭 지킴 완료 판정의 이월이다(D4)** — 감사 `done_via_mcp`만 남는다. 기본 전환은 7단계.
- **목록 재조회 시점은 CLI 몫** — `mcp.deny` 변경 후 숨김은 늦을 수 있다(호출 거부는 즉시).
- **grok ACP는 오너 MCP 서버도 로드한다**(세션 `mcpServers`는 더할 뿐 격리하지 않는다 — 스모크 finding 6).

### §0.31.0 — 스킬 materialize · `policy.json` v1 → CLI별 권한 번역 (업그레이드 2단계 2부)

PLAN §0.31.0 (R49 `approved-with-fixes` → `approved`) · 커밋 `9f52ba0`(P1 red) → `5cce3ad`(P1 정책 코어) → `d17c656`(P1 검증 교정) → `2b5d472`(P2 red) → `c5b7c9d`(P2 컴파일러) → `1bdd0ae`(P2 검증 교정) → `0706d47`(프로브 §H UK-5) → `3fd3419`(P3 red) → `c397625`(P3 materialize) → `3d1037c`·`c508fcb`·`8863e5d`·`3dcbb31`(P3 검증 1~4차) → `0fd3379`(P4 red) → `a912236`(P4 통합) → `c2b454a`·`4068563`(P4 검증 1~2차) → `3f92eeb`(업그레이드 호환 — D10과 같은 deprecated `p*` deny 수용) → PATCH 5(문서·VERSION·라이브 스모크 `docs/spikes/HEADLESS-SMOKE-0310.md`).

**설계 결정 기록 (구현 중 확정 — PLAN 문면 대비):**

| Date | Plan / review ref | Deviation (what we did) | Why conservative | Follow-up |
|------|-------------------|-------------------------|------------------|-----------|
| 2026-10-15 | ④ 영향 파일(이름 추정) | 모듈 = `policy.ts`(스키마·로더·병합·`policyHash`) · `policy-compile.ts`(CLI별 컴파일 · `resolveWorkerPolicy` · `POLICY_ENFORCEMENT` 정직 표 상수) · `skill-materialize.ts` · `skill-prompt.ts`(목록 렌더). 내장 스킬 `packages/host/skills/loom-card-report/SKILL.md`. | 순수 모듈(정책)과 I/O(materialize)를 분리해 각각 단위 테스트. | — |
| 2026-10-15 | D7 · UK-1 §G | 오너 규칙은 `p *`만. **deprecated deny의 공백 없는 `p*` → 기동 거부**(오류가 `policy.json` `shell.deny`로 옮기는 법을 안내) — **예외(`3f92eeb`, 업그레이드 호환):** 0.30.0 D10 deny 항목과 글자 그대로 같은 `Bash(git push*)` · `Bash(git reset --hard*)` · `Bash(git clean*)`는 내장처럼 `p` + `p *`로 정규화해 받고 경고(목록을 지우라) · deprecated allow의 `p*` → `p` + `p *`로 좁히고 경고. | deny를 조용히 좁히면 `p*`가 잡던 비슷한 이름(`rm*` → `rmdir`)이 풀린다 — deny 단조성(D8) 위반. allow를 좁히는 것은 안전 쪽. 글자 그대로 같은 D10 항목은 이미 내장 deny에 있어 정규화해도 빠지는 차단이 없다. | 0.30.0 기본 목록을 복사한 설정은 경고와 함께 기동한다 — 목록을 지운다. 그 밖의 `p*` deny는 기동 거부(USER_GUIDE §16.2). |
| 2026-10-15 | D7 fail-closed | `loadPolicy`: lstat 오류 코드 구분 — **최종 경로 ENOENT + 실제 디렉터리 loomDir(또는 loomDir 부재)만 "없음"**. 매달린/순환 링크 · EACCES · ENOTDIR · loomDir 비디렉터리 = 거부. 링크는 대상이 정규 파일일 때만 따라감. `O_NONBLOCK` open + fstat 정규 파일 확인 · **64 KiB** 상한(읽는 중 커져도 거부). | "없음"을 넓게 잡으면 접근 불가 정책 파일이 내장 기본값으로 폴백한다 — fail-open. FIFO는 open에서 막힐 수 있다. | — |
| 2026-10-15 | D8 · R5 · R49-M2 | 병합은 **에이전트별**(claude 목록은 claude에만, grok 목록은 grok에만, codex는 목록 없음). 설정 수준 해시 = 세 에이전트 `policyHash`의 sha256. deprecated 목록은 **원시 존재**로 전달(키 없음 = 부재 · `[]` = 존재). 정책은 headless bridge 설정 파싱(`loadBridgeConfig` → `workerConfigFromBridge`) 때 로드 — 무효/충돌 = 기동 거부, pane bridge는 읽지 않음. | 한 에이전트의 목록을 다른 에이전트에 섞으면 deny/allow가 엉뚱한 CLI로 샌다. `[]`를 "없음"으로 보면 빈 allow 의도가 기본값으로 바뀐다. | — |
| 2026-10-15 | D8 · D9 | deprecated deny의 비-셸 항목 보존: `WebFetch`/`WebSearch` → `webDeny`, `Read`/`Edit`/… → `toolDeny`(claude deny · grok `--deny`). grok에는 웹 도구 규칙 형식이 없어 **웹 deny가 하나라도 있으면 `--disable-web-search`**. | D8 "어느 것도 deny를 줄이지 못한다" — deprecated deny를 버리지 않는다. | — |
| 2026-10-15 | ② `mcp.deny` · UK-5 §H | 형식은 `<server>__<tool>`만(서버·툴 각각 `[A-Za-z0-9][A-Za-z0-9._-]*`). 서버 단위 `mcp__<server>`는 §H에서 동작이 측정됐지만 v1 문법에 넣지 않았다. | PLAN ② 문면 유지 — 표면을 넓히지 않는다. 서버 차단은 기본 `isolate:true`가 이미 한다. | 필요하면 v2 스키마. |
| 2026-10-15 | (g) · R49-M4 | 가짜 CLI가 **반복 불가 플래그의 반복을 거부**(실측: grok·codex 단일 값 플래그 반복 = exit 2 · grok `--allow`/`--deny`·codex `-c`는 반복 가능 · claude 실 CLI는 마지막 값 우선이지만 가짜는 거부 — 더 엄격). `--plugin-dir` 반복도 Loom 제약으로 거부. | 관대한 가짜는 실 CLI의 거부를 재현하지 못한다(0.30.0 Deviation (d) 교훈). | — |
| 2026-10-15 | D3 · R7 경로 신뢰 | loomDir만 realpath 1회(그 위 = HOME 등은 신뢰). 그 아래 모든 구성요소(`rooms/<key>` · `skills/<name>/…` · `cards/<peer>/<card>/skills`)는 **lstat으로 실제 디렉터리**여야 함. 소스 파일은 `O_NOFOLLOW` + fd inode 대조 + realpath 포함 확인. 교체는 임시 디렉터리 + rename 2회. | 링크 하나로 `~/.ssh`가 카드 복사본(→ 워커 컨텍스트)에 들어오는 길을 막는다. | 동일 사용자 프로세스의 탐색 중 교체 — Known limits. |
| 2026-10-15 | D6 · R49-M5 · ② 매니페스트 | 실행을 넓히는 프론트매터 키 **`allowed-tools` · `hooks`도 스크립트처럼 `allowScripts` 게이트**. 매니페스트 항목에 **`scripts`(0700으로 복사한 상대경로)** 추가 — PLAN 모양 `{name, source, files}`에 없던 필드 — 해시가 파일 모드까지 덮는다. 재검증은 정확한 모드(파일 0600/0700 · 디렉터리 0700)와 정확한 파일·디렉터리 집합을 요구. | 스크립트만 막고 훅·도구 허용 확장을 열어 두면 D6의 의도(원격이 부를 수 있는 로컬 실행 = 이름 단위 옵트인)가 샌다. 모드가 해시 밖이면 실행 비트 변조가 재개를 통과한다. | — |
| 2026-10-15 | D2 · R49-L1 (SKILL.md 형식 미규정) | **엄격한 줄 단위 YAML 부분집합**: 허용 키 9개(`name`·`description`·`version`·`license`·`metadata`·`allowed-tools`·`hooks`·`loom`·`loom.requires-policy`) · 흐름/앵커/별칭/태그/병합/이스케이프 거부 · 중첩은 4개 키 아래만 · 중첩 키 평문 식별자(YAML 불리언/null 단어 거부) · `description` 필수(블록 스칼라는 한 줄로 접음) · `name` = 디렉터리 이름 · `loom.requires-policy`는 정확히 `false`가 아니면 요구로 간주. | claude가 같은 바이트를 YAML로 해석한다 — Loom 파서와 claude 파서가 다르게 읽을 여지(별칭·태그·키 철자 변형)를 없앤다. 애매하면 `invalid SKILL.md`. | — |
| 2026-10-15 | R6 · 마커 | description과 **프론트매터의 모든 원시 줄**, 그리고 목록에 넣는 SKILL.md 경로를 NFKC + 소문자 + 문자/숫자만 남겨 `loomdispatchedtask` 포함 시 거부(materialize: `bad description`/`invalid SKILL.md` · 목록: throw → `spawn_setup_failed`). 프론트매터에 제어·서식·구분 문자 금지(CRLF 허용). | 마커 앞(시스템 측)에 들어가는 텍스트가 시스템/데이터 경계를 위조하지 못하게 한다. | 키릴 동형 문자 잔여 — Known limits. |
| 2026-10-15 | D5 · R6 | claude 프롬프트에는 `Unavailable skills:` 머리줄 + unavailable 줄만. 4,096바이트는 **머리줄·cap 줄 포함 블록 전체** 기준 · 사용 가능 → 불가 순. `--plugin-dir`은 사용 가능한 스킬이 1개 이상일 때만. | 빈 플러그인 디렉터리를 넘기지 않는다. 상한은 실제로 프롬프트에 들어가는 바이트로 잰다. | claude는 상한 밖 스킬도 본다 — Known limits. |
| 2026-10-15 | D11 · R49-M3 | materialize는 카드 락 아래 · **살아 있는 그룹 확인 뒤 · write-ahead 기록 전**. 재개 · 복구 · **모든 입양**에서 복사본 재해시(`verifyCardSkillsCopy`) + fingerprint 대조. 스킬이 꺼진 설정의 재개 경로는 0.30.0대로(fingerprint 불일치 → 새 세션). | 복사본을 살아 있는 워커 밑에서 바꾸지 않는다. 입양 경로마다 대조해야 "입양은 fingerprint 무변경일 때만"이 성립한다. | — |
| 2026-10-15 | UK-7 | Bun `import … with { type: "text" }`로 내장 SKILL.md가 단일 파일 번들에 들어감(PATCH 5에서 `build:cli`와 같은 명령으로 스크래치 출력에 빌드 — `LOOM-REPORT-END` 1건 확인). 텍스트 모듈 선언은 `*/SKILL.md`로 한정. | — | UK-7 resolved. |

**Deviations (계획 대비 실행 방식):**

| Date | Plan / review ref | Deviation (what we did) | Why conservative | Follow-up |
|------|-------------------|-------------------------|------------------|-----------|
| 2026-10-15 | PLAN ⑤ 레인(구현 grok) | **(a) 레인** — P1은 `grok-implementer`(Grok 4.7). **P2~P5는 Opus 5.5 서브에이전트**(오너 지시 *"다음 작업은 opus 5.5로 진행해"*). 검증 = codex `gpt-6.1-sol` xhigh · 리뷰 = fable-advisor. | 오너 지시. 발견자(codex)≠수정자 분리는 유지. | — |
| 2026-10-15 | lessons (60) | **(b) PATCH별 검증 라운드:** P1 1회 교정(`d17c656` — fail-closed 조회 · 유한 읽기 · deprecated `p*` deny 거부) · P2 1회(`1bdd0ae` — 가짜 CLI 플래그 반복, 실측) · **P3 4라운드**(`3d1037c` 심볼릭 링크 안전 조상 경로 · 엄격 YAML 부분집합 → `c508fcb` 블록 스칼라 내용을 주석으로 보지 않음 · 원시 줄 마커 검사 · 중첩 중복 키 → `8863e5d` 중첩 키 철자 제한 · 맨 `-` 새 범위 → `3dcbb31` 맨 `-` 항목 열 고정) · P4 2라운드(`c2b454a` — 모든 입양 경로의 복사본+fingerprint 검증 · 목록 경로의 마커 검사 · 스킬 끔 argv를 리터럴 배열로 고정(순환 오라클 제거) → `4068563` — 검증을 입양 분기 자체로 옮겨 앞선 생존성 스냅샷에 의존하지 않음). | 파서·경로 신뢰는 한 번에 닫히지 않았다 — 라운드마다 범위를 좁혀 재검증. | — |
| 2026-10-15 | D11 · R49-M3 | **(c) 동작 변경 — 보통 디스패치의 입양도 fingerprint 대조**(`c2b454a` · `4068563`). 불일치 → 살아 있는 pid 유지 · 감시 안 함 · 결과 `needs_verification` `fingerprint_changed` 선점. 스킬이 꺼져 있어도 적용. 0.30.0의 "입양 후 새 세션" 테스트 H3 · (c)를 이 동작으로 다시 썼다. | PLAN "입양은 fingerprint 무변경일 때만"을 복구 경로뿐 아니라 모든 입양에 적용 — 바뀐 정책 아래서 이전 정책의 워커 결과를 이어받지 않는다. | USER_GUIDE §16.2에 업그레이드 주석. |
| 2026-10-15 | UK-1 · UK-5 | **(d) 실측으로 닫음:** UK-1 = `SKILLS-POLICY-PROBE` §G(claude `Bash(p *)`는 맨 `p`도 막음 · grok은 못 막음 → 이중 형식 유지 · `p*` 과매칭) · UK-5 = §H(claude `--settings` deny `mcp__srv__tool` → 툴 숨김 · 신호 없음 → `--disallowedTools` 폴백 불요). | 추정 대신 실측 후 컴파일 형식 확정. | — |
| 2026-10-15 | PLAN 권위 고지 · 범위 | **(e) 범위 분할 — MCP 사전 점검은 v0.32.0으로.** 오너 2단계 문면의 "MCP 사전 점검"을 이 릴리스에서 뺐다(R49 ① PASS). | 헤드리스 워커는 Loom MCP가 없고, 호출자는 대화형 pane뿐 · 완료 권위는 이미 구조적(§0.30.0 D13). | **다음 = v0.32.0**(오너 지명). |

**Known limits (이 버전이 보장하지 않는 것):**

- **키릴 등 교차 문자 동형(homoglyph) 잔여.** 마커 검사는 NFKC + 소문자 접기라 키릴 `е` 같은 다른 문자 체계의 동형 문자는 잡지 않는다(수용한 Low).
- **동일 사용자 프로세스의 탐색 중 교체.** 경로 구성요소를 lstat으로 확인한 뒤 같은 사용자의 다른 프로세스가 디렉터리를 바꿔치기하는 창은 남는다 — 그 프로세스는 이미 오너 권한을 가진다.
- **claude는 상한 밖 스킬도 본다.** 목록 상한(20줄 · 4 KB)은 codex/grok 안내에만 걸린다. 복사는 전부 하므로 claude 플러그인은 모든 사용 가능 스킬을 로드한다.
- **codex trust 자동 기록.** codex 0.162.1은 헤드리스로 돈 cwd마다 `~/.codex/config.toml`에 `trust_level = "trusted"` 항목을 스스로 추가한다(스모크 0310 finding 2). 이후 그 저장소의 `.codex/config.toml`(프로젝트 MCP·훅)이 오너 codex에서 적용된다. Loom은 trust 플래그를 넘기지 않는다. 끄는 codex 설정 키는 미확인.
- **grok의 오너 `~/.claude` 누수(D12).** grok 워커는 오너 권한·MCP·스킬을 병합한다 — 문서화된 비목표.
- **claude 오너 플러그인·스킬 상속(UK-6).** MCP는 기본 격리되지만 오너 플러그인 19개 · 스킬은 계속 로드된다(스모크 h1 init 실측).
- **정확히 한 번 전송은 보장하지 않는다.** 결과 전송과 `resultSent` 기록 사이에 bridge가 죽으면 재생이 같은 결과를 한 번 더 보낼 수 있다(전송 먼저, 표시 나중의 크래시 창).
- **재생 소진 카드의 영구 차단(0.30.0에서 이어짐).** `replay_exhausted` 카드는 운영자가 세션 기록을 지울 때까지 막힌다.
- **deprecated 목록.** `worker.permissions` 도구 목록은 아직 읽는다(경고). 0.30.0 D10 deny 항목과 글자 그대로 같은 `p*`는 경고와 함께 수용(목록을 지운다) · 그 밖의 공백 없는 `p*` deny는 기동 거부. 제거 시점 미정.
- **마커 글자를 담은 정당한 경로는 거부된다.** `loomDir`나 카드 경로가 접은 뒤 `loomdispatchedtask`를 담으면 목록 렌더가 거부해 카드가 `spawn_setup_failed`로 끝난다.
- **셸 deny 강제력은 CLI마다 다르다(D10).** codex 셸 deny는 강제되지 않고 grok은 best-effort다. 접두 규칙 우회(`/bin/rm` 등)는 0.30.0과 같다.

### §0.30.0 — 헤드리스 카드 워커 · 카드별 세션 · 재개/입양 · 동시성 · 정적 권한 프로필 (업그레이드 2단계 1부)

PLAN §0.30.0 (R48 `approved-with-fixes` → `approved`) · 커밋 `2d1bc3b`(P1 결과 코어) → `26b8c43`(P2 red) → `e242822`(P3) → `706eda9`·`39c7acb`(P3 codex 교정) → `587f8bf`(P1 codex 교정) → `3098804`(P4) → `ab97309`(P4 codex 교정) → `3373992`(P5) → `8f36be6`·`bcc9d16`(P5 교정 2·3차) → `471226d`(P6a 배선) → `587539e`·`5fae1fe`(라이브 스모크 교정) → `513a79d`·`c59ced5`(P6a codex 교정) → PATCH 6(문서·VERSION).

**설계 결정 기록 (구현 중 확정 — PLAN 문면 대비):**

| Date | Plan / review ref | Deviation (what we did) | Why conservative | Follow-up |
|------|-------------------|-------------------------|------------------|-----------|
| 2026-10-15 | PLAN ② 세션 기록 경로 · D5 | 경로 = `loomDir()/cards/<sha16(localPeerId)>/<sha16(room NUL agent NUL cardId)>/session.json` — **로컬 peer 네임스페이스** 한 단 추가(`localPeerId` 필수). `recover()`는 자기 peer 기록만 본다. | 한 PC의 프로필들이 `loomDir()`를 공유한다 — 네임스페이스 없이는 다른 프로필 bridge가 남의 워커를 입양·재개한다(0.29.0 c778d4d 공유 소비자 키와 같은 계열). 프로세스 간 락 대신 네임스페이스 + "프로필당 bridge 1개" 문서화(fable-advisor 판정). | 프로세스 간 락은 3단계(host 서비스화) 때 재검토. |
| 2026-10-15 | D6 · R48-M3 | 기록 `state=spawning` ∧ pid 없음 → **절대 spawn하지 않고** `failed` reason `spawn_state_unknown` 1건. attempts·state는 spawn **전** 선기록(write-ahead), pid/pgid/시작 시각은 spawn 직후 동기 기록. | pid 없는 기록은 exec가 안 일어났다는 증거가 아니다 — 재spawn은 같은 트리에 워커 둘을 만들 수 있다. | 잔여 창(서브 ms) — Known limits. |
| 2026-10-15 | D6 **수정**(fable-advisor 승인) | **복구 중** fingerprint 변경 → 새 세션이 아니라 `failed`/`needs_verification`, note `fingerprint_changed; not resuming`. 라이브 재전달(프롬프트 있음)은 PLAN대로 새 세션. | 복구 경로에는 원 프롬프트가 없다 — "새 세션"은 빈 프롬프트로 CLI를 돌리는 것이 된다. | — |
| 2026-10-15 | D6 · R6 | 생존성 3상태(alive/dead/unknown) — `ps -o lstart`(LC_ALL=C·TZ=UTC 정규화)로 pid + 시작 시각 대조, unknown이면 spawn·kill 모두 안 하고 유한 감시 후 `liveness_unknown`. pid ≤1 · exited = dead. | UK-4 pid 재사용 오인 kill·이중 spawn을 막는 fail-closed 판정. | — |
| 2026-10-15 | D5 · M2 | `pendingResult`를 첫 전송 **전** 기록, 재전송은 그 원문 재생(시도 ≤2). `completedHandoffIds`(최근 16) 우선 확인 → 늦게 온 완료 디스패치 재전달 억제. 재개 전 transcript를 먼저 파싱(끝난 일은 결과만 전송). | 결과 재구성·이중 전송·완료 작업 재실행을 막는다. | — |
| 2026-10-15 | D10 · 설정 | `worker.agentBin.<agent>` = **실행 파일 경로 하나**, basename == 에이전트 이름. 배열·인자·셸 거부. 가짜 CLI는 코드 레벨 옵션 `headlessAgentCommandOverride`로만(설정 불가), 그것도 위험 플래그 검사 통과 필요. | 설정 파일 한 줄로 임의 명령·우회 플래그를 실행시키는 경로 차단. | — |
| 2026-10-15 | R5 · R48-M2 | 직렬화 예산 절단 = 앞에서 `max(초과분,1)`씩 서로게이트 안전 절단을 맞을 때까지 반복, 그래도 넘으면 `output ""` + note `output dropped: exceeds attachment budget` — issuer 획득 후 throw 없음. pane 경로도 같은 코어를 탄다(맞는 출력은 무변경). | 결과 유실(acquire 소진 후 throw) 차단이 R48-M2의 목적. | — |
| 2026-10-15 | D3 · UK-6 | grok argv = `--prompt-file <file>` 단독(`-p`는 `--single <PROMPT>`라 값 필요) · `--allow`/`--deny`는 **규칙마다 한 번**(1.0.54 단일 값). 규칙 값은 빈 값·`-` 시작·NUL/개행 거부. | 라이브 스모크 실측(아래 (d)). | grok 버전 드리프트는 argv 테스트 + 엄격한 가짜 CLI로 감지. |
| 2026-10-15 | D8 **수정**(fable-advisor 승인) | 핸드오프 **claim을 receipt가 아니라 에이전트별 동시성 허가 획득 후**(`lead()`의 `lane.acquire` 뒤)로 이동. 대기 카드는 relay inbox에 남아 bridge 크래시·재시작 뒤에도 다시 전달된다. | 수신 즉시 claim하면 큐 대기 중 크래시가 카드를 소실시킨다. | inbox 상한(`MAX_INBOX_ENTRIES_PER_PEER`=100) 초과 시 가장 오래된 대기 항목 축출 가능 — Known limits. |
| 2026-10-15 | D9 **수정**(fable-advisor 승인) | 타임아웃 = **카드 단위**: 각 시도(신규 포함)가 카드 `startedAt`부터의 잔여 시간을 받되 **하한 60 s**, 상한 2^31-1 ms(`timeoutMs` 설정 최댓값 동일). | 재개마다 2h를 새로 주면 카드 총 시간이 무한히 늘어난다. 하한은 잔여가 0에 가까운 재개 시도의 즉시 kill 방지. | 시도당 최소 60 s — Known limits. |
| 2026-10-15 | D10 | 거부 내역을 결과 note **선두**에 `denials: N (tool, …)`로 표면화(500자 상한; 이어서 attempts · stderr · transcript). | PLAN D10 "결과 요약에 표면화" 이행 — 잘리는 note에서도 거부가 먼저 보이게. | — |
| 2026-10-15 | D7 | 리더 종료 시 프로세스 그룹의 **잔존 구성원을 회수(reap)** 한 뒤 재개/결과로 진행. | 리더만 죽고 자식이 남아 있으면 재개가 같은 트리에 워커를 겹친다. | — |
| 2026-10-15 | D5/D6 · 재생 | `pendingResult` 재생 대기 중 **다른** 핸드오프가 와도 버리지 않는다: 이전 결과를 먼저 재생한 뒤 새 핸드오프를 정상 경로로. 재생이 실패하면 새 핸드오프는 즉시 `needs_verification`. | 드롭은 카드 소실. | 재생 실패 시 새 핸드오프 응답은 내구 기록 없음 — Known limits. |
| 2026-10-15 | 비밀 마스킹 | 결과 note의 stderr 마지막 줄은 `packages/host/src/redact.ts` `redactSecrets`를 통과: `NAME=value`/`NAME: value`/JSON 쌍(민감 이름), Bearer/Basic, 알려진 키 형태(`sk-`·`sk-ant-`·`xai-`·`gh*_`·`github_pat_`·`AKIA`·`AIza`·`xox*`·JWT), URL userinfo, 민감 이름 env 변수 값(≥8자). | 오너 로컬 CLI stderr가 디스패처에게 가는 경로의 누출 완화. | 패턴 기반 best-effort — Known limits. |

**Deviations (계획 대비 실행 방식):**

| Date | Plan / review ref | Deviation (what we did) | Why conservative | Follow-up |
|------|-------------------|-------------------------|------------------|-----------|
| 2026-10-15 | `CLAUDE.md` 규칙 5 · PLAN ⑤ 레인 | **(a) 작업 표면** — 0.29.0과 같이 herdr pane 카드 대신 **in-harness 서브에이전트 레인**(`grok-implementer` Grok 4.7 구현 · codex 검증 · fable-advisor 자문). | pane 레인은 긴 카드에서 죽는다 — 이 버전이 메우는 공백 그 자체. 발견자≠수정자 분리는 유지. | 0.30.0 헤드리스 표면으로 dogfood 레인 이전 검토. |
| 2026-10-15 | PLAN ⑤ P5 레인 | **(b) P5 재개/입양을 grok → `sol-implementer`(GPT-6.1 Sol, xhigh)로 상향** — grok P5(`3373992`)가 codex fix-first(High 6 · Med 5)를 받은 뒤. P5는 **3라운드**: ① grok 구현 → ② sol `8f36be6`(fail-closed 생존성 · write-ahead · transcript 우선 복구) → ③ codex gpt-6.1-sol fix-first(H-A~H-D · M-A~M-C) → **fable-advisor 판정**으로 `bcc9d16`: 락 대신 per-peer 네임스페이스 · pid 없는 spawning → `spawn_state_unknown` · 복구 fingerprint 불일치 → 재개 안 함(D6 수정) · `pendingResult` 재생. | 크래시 일관성 작업은 판단 밀도가 높다 — routine 레인 반복보다 상향이 싸다(lessons). 3라운드 판정을 아키텍트가 아니라 자문에 맡겨 락 문면 수정의 근거를 남겼다. | — |
| 2026-10-15 | 검증 레인 모델 | **(c) codex 검증 모델을 릴리스 도중 GPT-5.6(플러그인 기본) → `gpt-6.1-sol` xhigh로 교체**(오너 지시). PATCH 1~5 **1차 검증은 GPT-5.6**, P5 3차 · P6a · 스모크 후속은 gpt-6.1-sol. | 오너 지시 — 교체 시점 이후 라운드부터 적용. 어느 PATCH가 어느 모델로 1차 검증됐는지 남겨 검증 강도를 추적 가능하게 한다. | — |
| 2026-10-15 | Done when (h) · D15 | **(d) 라이브 스모크가 가짜 CLI가 놓친 grok argv 결함 2건을 찾았다:** ① `-p`는 값이 필요(`--single <PROMPT>`) → 즉시 exit · ② `--allow`/`--deny`는 단일 값(여러 규칙을 한 플래그에 → "unexpected argument 'Write'"). → `587539e`·`5fae1fe` 교정 + **가짜 CLI를 엄격 파싱으로**(모르는 플래그 = exit 2, 빌더 argv 전 조합 수용 테스트). 같은 스모크에서 codex `rg --files` exit 1이 **거부 오탐** → 출력에 샌드박스/권한 차단이 있을 때만 거부(`587539e`, "Read-only file system" 추가 `5fae1fe`). grok 텍스트 런 **이어붙임 결함**(런이 붙어 `^Line \d+:` 399건 매치)은 `a2e9eec`에서 교정 — 비텍스트 이벤트로 갈라진 텍스트 런을 빈 줄로 잇고(claude 폴백은 `message.id`가 바뀔 때만), 실 grok transcript가 400개 `Line N:`으로 파싱되는 테스트(`headless-stream.test.ts`). | 관대한 가짜는 실 CLI의 거부를 재현하지 못한다 — 가짜를 실 CLI보다 엄격하게. | 새 CLI 버전마다 `scripts/smoke-headless.ts` 재실행. |
| 2026-10-15 | lessons (60) | **(e) 모든 production PATCH가 다음 PATCH 전 독립 검증 1회.** fix-first 라운드: P1 Low×2(`587f8bf`) · P3 fix-first + High(`706eda9`·`39c7acb` — 권한 enum · TOML 이스케이프 · 관용 파서 · 서로게이트 안전 절단) · P4 fix-first(`ab97309` — 그룹 SIGKILL · env 대소문자 · 설정 실패 정리 · 0700) · P5 ×2(`8f36be6`·`bcc9d16`) · P6a fix-first + High(`513a79d` agentBin 잠금 · 비차단 복구, `c59ced5` 기동이 재전달 디스패치 완료를 기다리지 않음) · 스모크 후속 Med/Low(`5fae1fe`). P2는 tests-only red. | 발견자(codex)와 수정자(grok/sol) 분리. | — |
| 2026-10-15 | 전 릴리스 재검증 · fable-advisor 트리아지 | **(f) 전 릴리스 GPT-6.1 Sol xhigh 재검증: High 3 / Med 5 / Low 1. fable-advisor 트리아지: 7건 수정 · 2건 문서화.** 수정 `a2e9eec`(grok 텍스트 런 결합 · stderr 마지막 줄 `redactSecrets` · inbox poll 단일 비행 · 규칙 값 공백/CR/선행 대시 거부 · `timeoutMs` ≤ 2147483647 · `truncateTail` 서로게이트 안전) + `da9f6f9` crash-consistency hardening rounds 1–5(`packages/host`, 아래 결정 행). 문서화 2건 = Known limits. | 발견자≠수정자 분리 유지. 설계 락 문면을 건드리는 항목은 자문 판정으로 남긴다. | — |
| 2026-10-15 | 크래시 일관성 강화 재검증 라운드 1~5 | **(g) crash-consistency hardening took 5 more fix/verify rounds after the triage (rounds 1–5). Round 3 was a structural redesign ruled by fable-advisor after two failed patch rounds.** 결과: 그룹 신원 검증 규칙(R1/R2/R3 — 검증된 그룹에만 신호 · 살아 있는 그룹 옆 spawn/재개 금지 · 미검증 생존 그룹 → `orphan_group_alive` · 콜드 복구 리더 사망+그룹 생존 → 신호 0) · obligation-before-claim(미전송 이전 결과 재생 후에만 claim) · 카드별 전이 락 `withCardLock` + 보호 `pendingResult` writer · `bridge_shutdown_after_claim` 영속·재생 · `close()` 마감 `closeDeadlineMs` · 결과 sink 재진입 거부. | 패치 반복 2회 실패 뒤 구조(의무 먼저, claim 나중)로 닫는 쪽이 보수적이다. 신원 미확인 프로세스에는 신호를 보내지 않는다. | 아래 Known limits 3건. |

**Known limits (이 버전이 보장하지 않는 것):**

- **프로필당 bridge 1개.** 같은 프로필 bridge 둘을 막는 프로세스 간 락이 없다(per-peer 네임스페이스는 프로필 간 격리만).
- **spawn 직후 잔여 창(서브 ms).** spawn과 pid 기록 사이에 bridge가 죽으면 다음 기동은 `spawn_state_unknown`으로 포기한다(재실행 없음 — 사람이 확인).
- **deny 접두 규칙의 우회:** `/bin/rm` · `command rm` · `find -delete` · 인터프리터 한 줄은 잡히지 않는다 — cwd 경계(`allowedRoots`) + `needs_verification` 착지가 최종 방어선(USER_GUIDE §15.2).
- **codex `workspace-write`는 네트워크를 막는다** — 설치가 필요한 카드는 실패한다.
- **grok은 alpha + 느림** — 스모크 카드 1건에 ~9분(532 s). 완료 기준은 grok에 의존하지 않는다(D14).
- **result note의 마지막 stderr 줄은 `redactSecrets`로 마스킹되지만 패턴 기반 best-effort다** — 알려진 형태 밖의 비밀은 통과할 수 있다(오너 로컬 CLI 출력이 디스패처에게 간다).
- **inbox 상한 축출.** 허가 대기 카드는 relay inbox에 남지만 `MAX_INBOX_ENTRIES_PER_PEER`=100 초과 시 가장 오래된 대기 항목이 밀려날 수 있다.
- **pid 없는 창 뒤 늦은 핸드오프.** `spawn_state_unknown` 포기 뒤 같은 카드의 *다른* 핸드오프가 오면 (두 문장 창의) 잔존 워커 옆에 spawn할 수 있다(자문 판정: 문서화).
- **`replay_exhausted` 카드는 운영자 조치 전까지 막힌다.** 미전송 결과 재생이 실패·소진(전송 2회)되면 그 카드의 이후 핸드오프는 claim되지 않고 relay inbox에 남으며 로그에 `[headless] replay_exhausted <card>`. 카드 세션 기록 `~/.loom/cards/<sha16(peer)>/<sha16(room×agent×card)>/session.json`을 운영자가 지워야 풀린다(USER_GUIDE §15.4).
- **`close()` 마감 뒤 claim.** `closeDeadlineMs`(기본 10 s) 안에 끝나지 않은 claim이 있는 채 프로세스가 종료되면 핸드오프가 기록 없이 claim된 채 남을 수 있다 — 실제로는 relay 연결 정체 시에만.
- **결과 sink 계약.** sink는 카드 락 아래에서 실행되므로 같은 카드의 `dispatch()`를 await하면 안 된다(재진입은 `re-entrant dispatch from result sink`로 거부). 프로덕션 sink는 relay 전송만 한다.
- **완료된 cardId 재디스패치는 카드 디렉터리를 재사용한다** — 이전 `transcript-N.jsonl`을 덮어쓴다(경로에 generation 도입은 보류).
- **재생 실패 시 새 핸드오프 응답은 내구 기록이 없다**(`needs_verification`을 직접 보냄; D2 재생 실패 경로).
- **시도당 최소 60 s** — 카드 잔여 시간이 60 s 미만이어도 각 시도는 60 s를 받는다.
- **`agentBin` basename 검사는 위생이지 진위 확인이 아니다** — PATH를 믿을 수 없으면 절대경로로 고정한다.
- **herdr는 여전히 bridge 기동에 필수**(UK-7) · **`AGENT_HINT.txt` 제거는 5단계로 보류** · **UK-2(claude 60k자 stdin) 미측정**.
- transcript 회전·GC·redaction 없음(평문 0600; 위 note stderr 마스킹은 transcript에는 적용되지 않는다) · 기존 red 테스트 `handoff-checkpoint` "live HANDOFF ... V2 information" Evidence 핀은 범위 밖.

### §0.29.0 — 룸 이벤트 seq + 안정 id · 멱등 수신 · 룸별 이벤트 로그 · 멱등 송신 (`clientEventId`)

PLAN §0.29.0 (R47 `approved-with-fixes` → `approved`) · 커밋 `ae60cdb`(PATCH 1 red) → `8010f31`(PATCH 2) → `1096b10`(PATCH 3 + PATCH 2 codex 교정) → `2fc9b2b`(PATCH 3 codex 교정) → `d3e1a38`(PATCH 4) → `d273b82`·`00f8f80`(PATCH 4 codex 교정) → `c183c92`(PATCH 5) → PATCH 6(문서·VERSION).

**설계 결정 기록 (R47 수용분 — PLAN Done when 요구):**

| Date | Plan / review ref | Deviation (what we did) | Why conservative | Follow-up |
|------|-------------------|-------------------------|------------------|-----------|
| 2026-10-15 | UK-1 ② · R47-M3 | seq 영속 = **블록 예약**(`SEQ_RESERVE_BLOCK` = 1000). 스냅샷 `seqHigh`는 **배타 상한**(발급 seq < `seqHigh`) — seq가 상한에 닿으면 `seqHigh = seq+K`를 **먼저 영속한 뒤** 스탬프, 재로드는 `seqHigh`부터. `ROOM_SNAPSHOT_VERSION` 1 유지 + optional 필드. | chat마다 스냅샷 쓰기를 피하면서 *"재시작 후 seq 비감소"* 를 지킨다. 간격은 Non-goal("간격 메우지 않음")과 양립. | — |
| 2026-10-15 | R1 (R47 수용) | 로그 디렉터리 키 = `roomKey = sha256(roomId)` hex 앞 16자. 원문 `roomId`는 각 줄에 보존. | 원문 `roomId`(`min(1)`뿐)를 경로로 쓰면 `loomDir()` 밖 쓰기가 가능하다. | — |
| 2026-10-15 | R2 (R47 수용) | dedupe 2층 — A(로그, 룸 공유) · B(전달, 소비자별 + 인메모리 섀도). 브릿지 소비자 키 = `bridge`. | 단일 공유 seen이면 같은 룸의 두 번째 로컬 프로세스가 이벤트를 못 받는다. | — |
| 2026-10-15 | R3 (R47 수용) | 중복 판정 키 = `eventId`뿐. `seq`는 간격·역행 관측 기록. | ephemeral relay·스냅샷 유실에서 seq가 역행해도 정상 이벤트를 버리지 않는다. | — |
| 2026-10-15 | R4 (R47 수용) | append 직전 **락 안에서** 꼬리 개행 보정 · 리더는 torn 줄을 세고 건너뜀. | torn 잔편이 새 레코드를 삼키지 않는다. | — |
| 2026-10-15 | R47-M2 · seqHigh 실패 경로 | 예약 영속 실패 시 `seqHigh`를 되돌리고(소비 seq는 건너뜀·재발급 없음) broadcast는 **비스탬프로 송신**(= 구 relay 통과) + 카운터 + stderr. handoff push는 enqueue 전에 중단(기존 `routeHandoff` 영속 실패와 같음). | 영속 상한 밖 seq를 발급하면 크래시 후 seq가 재발급된다. 이벤트를 버리는 것보다 구 형식 통과가 보수적이다. | — |

**Deviations (계획 대비 실행 방식):**

| Date | Plan / review ref | Deviation (what we did) | Why conservative | Follow-up |
|------|-------------------|-------------------------|------------------|-----------|
| 2026-10-15 | `CLAUDE.md` 규칙 5 (실작업 표면 = herdr pane 카드) · PLAN ④ 레인 | **(a) 작업 표면** — herdr pane 카드 대신 **in-harness 서브에이전트 레인**: `grok-implementer`(Grok 4.7, 구현) · codex(GPT-5.6, 검증). 레인 배치(구현 grok · 검증 codex · 자문 fable-advisor)는 유지. | pane 레인은 **긴 카드에서 죽는다** — 바로 이 업그레이드 계획(헤드리스 워커·카드별 세션, 2단계)이 메우려는 공백이다. 발견자≠수정자 교차 검증은 그대로 성립. | 2단계(헤드리스 워커) ship 후 pane/헤드리스 표면으로 복귀 검토. |
| 2026-10-15 | 레인 타임아웃 | **(b)** grok 실행이 여러 차례 **590s 상한에서 타임아웃**(PATCH 1: 3회 중 2회 · PATCH 2: 4파일 중 3파일에서 중단) → **≥1500s 타임아웃으로 재실행**. | 타임아웃을 완료로 읽지 않고(CLAUDE.md 규칙 7) 산출물을 독립 검증했다. | 레인 기본 타임아웃 상향 검토. |
| 2026-10-15 | 레인 산출물 결함 | **(c) 아키텍트 직접 수정:** ① PATCH 1 테스트 파일 결함(누락 import `safeParseClientMessage` · 미사용 import · TS narrowing — unknown 인자·클로저 대입 release fn의 never-narrowing) ② 라이브 핀 테스트(`handoff-checkpoint`·`session-routing`)를 `30be330` 상태로 재정렬(lessons (58)) ③ **`seqHigh`를 배타 상한으로 교정** — 포함 상한이면 크래시 후 재로드가 마지막 예약 seq를 **재발급**하는 off-by-one ④ 예약 영속 교정(`seqHigh`는 영속 성공 시에만 전진) + 회귀 테스트(mutation-checked). | 모두 수 줄 단위의 국소 교정이다(①②는 테스트·핀 전용, production 0줄). ③은 seq 비감소 불변식의 직접 위반이라 레인 왕복보다 즉시 교정이 안전했다. | — |
| 2026-10-15 | 검증 게이트 | **(d) PATCH 2~4 전부 codex `fix-first` 판정 → 다음 PATCH 전에 교정 완료.** PATCH 2: 영속 전 예약 전진(**High**) · broadcast 예외 탈출(Med) → `1096b10`. PATCH 3: peer 이탈 후 캐시 소유권 잔존(**High** — 같은 id로 재합류한 peer가 원 ack 획득·chat 억제) · 로스터 밖 peer 캐시 churn 상한 · `__proto__` peer id(null-prototype dict) · 첫 ack/재응답 ack `ts` 불일치 → `2fc9b2b`. PATCH 4: 오래된 락 회수(stale-lock reclaim, **High**) · seen 기록 전 append 순서(append-before-seen, **High**) · 무한 증가 집합(상한) · 락 예산 준수 · RPC 응답 기아(직렬 수신 큐가 RPC 응답을 막음 → RPC 우회 + 큐 깊이 경고) → `d273b82`·`00f8f80`. | 발견자(codex)와 수정자(grok/아키텍트)를 분리해 각 PATCH를 닫고 넘어갔다. | — |

**Known limits (이 버전이 보장하지 않는 것):**

- **스냅샷 쓰기에 fsync 없음**(기존 write+rename) — 호스트/전원 크래시는 예약을 잃을 수 있다(seq 재발급 가능). relay **프로세스** 크래시는 커버된다. (codex Med, 기존 결함)
- **보장은 at-most-once다.** 로그 ≤1줄 · 소비자당 전달 ≤1회. 내구 B층 기록과 `onEnvelope` 사이 크래시는 그 전달을 **잃는다**. seen 창은 상한이 있어 축출된 `eventId`는 **재전달될 수 있다**.
- **UK-4 상한값(seen 1024 / clientEventId LRU 256)은 여전히 추정값**이다 — 측정 근거 없음, 상수 한 곳 + 경계 테스트로 고정.
- **룸 이벤트 로그 회전·보존 없음** — `events/YYYY-MM.jsonl`은 월별로 계속 쌓이고 handoff 첨부도 원문 그대로 기록된다(presence는 전이 시에만 발생하므로 양은 handoff가 좌우). 후속: 회전/보존 정책.
- **손상된 `seen.json` → 영구 fail-open**(이벤트마다 stderr 1줄). 후속: `persist.ts`처럼 백업 후 초기화.
- **최종 리뷰(fable-advisor) fix-first 1건 반영**: 브릿지 B층 소비자 키를 `bridge` → `bridge:<peerId>`로 — 한 PC 다중 프로필 브릿지가 같은 룸에서 서로의 전달을 억제하던 결함(PATCH 5, 교차 검증 없이 들어간 PATCH에서 발견).
- **기존 red 테스트** `handoff-checkpoint` "live HANDOFF ... V2 information"의 Evidence 핀은 `08ae0c9` 이후 무변경(이 버전 범위 밖).

### §0.28.1 — herdr 0.7.5 / protocol-17 adapter

| Date | Plan / review ref | Deviation (what we did) | Why conservative | Follow-up |
|------|-------------------|-------------------------|------------------|-----------|
| 2026-07-22 | R46 M-2 / COMPAT §3.2 preferred default · L-1 · L-4 | **원자적 `agent.prompt`를 신뢰 opaque 제출 원시**로 채택. dual-`agent.send` 경로와 `BARE_ENTER`를 **제거**. `submitDelayMs` **제거**(원자적 prompt에는 dual-send 사이 유예가 없다). **중복 제출 방지 4절**(시도당 전문 1회 · stall 시 프로브 선행 · 양성 프로브 미스에서만 재발행 · 프로브 히트/read-fail은 재발행 금지 후 경계 있는 `agent.send_keys` Enter 넛지 · 예산 소진 fail-visible)과 **`reinjectUsed` verify-호출 스코프·재주입 캡**은 유지. | 분할-호출 축이 protocol-17에서 소멸했으므로 침묵 존치는 불가. herdr가 paste+Enter를 소유하는 서버 원자성이 M-2 보호 대상(비신뢰 텍스트의 명령 보간 금지)을 유지하면서 집행 지점만 옮긴다. 죽은 타이밍 노브·미검토 dual-send 상수 잔존을 막는다. | 라이브 3종 스모크로 실증 완료 (`6e2df8a` 경유). |
| 2026-07-22 | COMPAT §3.1 · live launch | 라이브 `agent.start` ACK가 **`launch_pending`** 일 수 있다. **`agent.get`를 폴링해 `interactive_ready`까지 대기**한다. **`agent.wait` idle은 launch barrier가 아니다.** | idle wait를 기동 완료로 오독하면 준비 전 prompt가 나가거나 기동이 영원히 막힌다. readiness 상태 기계 실측에 맞춘다. | commits `848675f` / `5ac6d31` |
| 2026-07-22 | inject target identity · live Claude | prompt/`send_keys` 제출 타깃은 **저장된 exact agent name**이다. **pane id를 target으로 쓰지 않는다.** | 라이브 Claude에서 pane-id 타깃 prompt가 **침묵 오배송**됐다. named facade의 정본 식별자는 name. | commits `edf3b59` / `48ecba3` |
| 2026-07-22 | Fable 5 consulted · agent name uniqueness | 이름 형식 **exact `loom-${cardId}-${seq}`** · **strict lowercase / safe seq / length ≤ 32** · 표현 불가 시 fail-closed **`agent_name_unrepresentable`** · **hash/truncation 금지**. 구 pane·재시작 안전성 보존. | 해시·절단은 충돌·불투명 복구를 만들고, 느슨한 이름은 동시 카드 풀 충돌을 연다. fail-closed가 침묵 오배송보다 안전하다. | commits `1351add` / `6e2df8a` · Advisor: fable-advisor consulted: yes |
| 2026-07-22 | COMPAT §1 · §5-2 · dogfood gate | persisted dogfood 설정에 `herdrProtocol:16`이 남아 있으면 **ready early-exit 전에 config migration**이 필요하다. **config-only protocol bump는 여전히 어댑터 우회로 금지**다. | ping/subscription만 통과시키는 위장 green을 막으면서, 이미 기록된 16 설정이 어댑터 ship 후 dogfood:up을 막지 않게 한다. | commits `9f13b47` / `8ebfd11` |

### §0.28.0 — PANE-DEATH implementation wave

| Date | Plan / review ref | Deviation (what we did) | Why conservative | Follow-up |
|------|-------------------|-------------------------|------------------|-----------|
| 2026-07-22 | “작업 line” 의미 · PLAN v0.28.0 PATCH 3 | 실제 PATCH 3 전체 chain은 **Codex orchestration → Grok implementation → Codex verification**이다. “작업 line”을 단일 구현 레인으로 기록한 것을 폐기하고, 세션 전체 역할 연결로 정정했다. | 실제 provenance를 소급 미화하지 않고, 다음 세션이 실제 직전 chain을 기본으로 복원하게 한다. | 다음 기본은 Codex→Grok→Codex. HANDOFF/AGENTS briefing은 Claude·Grok·기타 CLI의 전체 선택 chain도 함께 표시한다. |
| 2026-07-22 | PATCH 3 대상 파일 표(bridge-runtime/result-quarantine/bridge-config/CLI) · 운영자 ack는 미해소를 실제로 닫아야 함 | live bridge가 있을 때 CLI의 별도 `QuarantineStore`를 쓰지 않고, `bridge-spawn.ts`의 인증된 loopback control RPC로 daemon의 **동일 in-memory store**를 ack한다. 이를 위해 host re-export 포함 지원 파일 2개가 target 표보다 늘었다. live RPC 실패 시 local fallback 없이 fail-closed하고, offline일 때만 local durable store를 연다. | 별도 store append는 disk replay만 바꾸고 daemon timer/map/status를 stale로 남겨 재진입·오표시를 만든다. 동일 authority를 갱신하는 것이 데이터 일관성과 실패 안전성을 보존한다. | PATCH 4에서 live/offline ack 양성 테스트를 고정한다. |
| 2026-07-22 | PATCH 4 대상 파일 표 · HANDOFF의 분류된 33 legacy 실패 | PLAN 표에 빠졌지만 HANDOFF가 명시한 `scrape-delta.test.ts`와 `herdr-lifecycle.test.ts`를 tests-only 범위에 포함해 proposal/pane-preserved 기대와 브랜치 fixture/close-count 순이득을 이식했다. | 이미 분류된 legacy 실패를 남기지 않고, production 0줄 경계를 유지한 채 탐지력만 복원한다. | 없음 — `f9b0230`에 포함. |
| 2026-07-22 | PATCH 4 브랜치 `ec99b2c:bridge.test.ts` +244 전량 감사 | main의 PATCH 1 테스트가 guard-order/local-done과 completion↔terminal·claimed deny·spawn failure exact-one을 더 강하게 이미 고정해 `bridge.test.ts`는 변경하지 않았다. | 동일 계약의 약한 복제를 이식해 테스트를 흔드는 대신 현재의 더 강한 증거를 보존한다. | PATCH 5에서 재작업 금지; 감사 결과만 인용. |
| 2026-07-22 | PATCH 5 대상 파일 표 · 보존 card pane 카운트 의무 | PLAN 표에 없던 `bridge-runtime.ts`와 양성 상태 테스트를 포함했다. `preservedCardPanes`는 현재 bridge 프로세스가 Flight-backed result 뒤 보존했다고 아는 pane ID 집합의 **count-only** 관측이며 terminal 관찰/stop에서 제거한다. 이전 프로세스 pane은 복원하지 않는다. | status RPC 구현 파일 없이는 카운트를 만들 수 없고, process-local 숫자로 제한해야 자동 cleanup·receipt·복원 권위를 새로 발명하지 않는다. | 후속 B의 cleanup grant와 혼동 금지. `d49a6b1`에 포함. |

### 0.9.0 / 0.9.1 — Loom rename + R11 patch

| Date | Plan / review ref | Deviation (what we did) | Why conservative | Follow-up |
|------|-------------------|-------------------------|------------------|-----------|
| 2026-07-09 | RENAME §4.1 write path = `LOOM_*` only | **M-15:** sticky-spawn sets **both** `LOOM_SESSION`/`LOOM_PROFILE` **and** `FABLE_*` | Avoids silent break if an old sticky child or tool only reads `FABLE_*` during the dual-read window | Drop `FABLE_*` write when dual-read is removed (0.10 / 1.0) |
| 2026-07-09 | RENAME §4.2 EXDEV copy: remove legacy only after verified | Copy success → remove legacy if `~/.loom` exists (session.json optional). Not a full file-count audit | Still avoids deleting legacy when copy clearly failed; full tree checksum deferred | Optional: hash/count verify before `rmSync` |
| 2026-07-09 | RENAME §4.2 / M-14 “unify on loomDir” | `mcp-server` imports `loomDir` from `@loom/host` (already a dep) instead of only CLI-injected `dir` | One resolver path for default state home; CLI can still pass `dir` override | None unless host↔mcp cycle appears (none today) |
| 2026-07-09 | RENAME Phase D tests | Introduced **`LOOM_TEST_HOME`** + `resetStateHomeDirCache()` rather than full DI of `homedir()` | Avoids broad refactor of every path helper; tests isolate migration without touching real `$HOME` | Could later inject `stateRoot` for purity |
| 2026-07-09 | Invite dual-accept tests | `RoomRegistry.create(name, inviteCode?)` optional second arg for legacy `FABLE-…` rooms | Needed to register non-minted codes without prefix rewrite; production mint path unchanged (`generateInviteCode` → `LOOM-` only) | Keep optional; do not add prefix-normalization helpers |
| 2026-07-09 | Symbol rename completeness | Kept **`FableSession`**, **`fableSystemHint`**, **`fable` bin**, **`ensureFableDir`** as deprecated aliases | Zero-break for any leftover internal imports / user muscle memory | Remove aliases when dual-read ends |
| 2026-07-09 | RENAME / RN1 L-14 timing-safe util share | **Did not** merge `secretsEqual` + `timingSafeTokenEqual` into `@loom/protocol` in 0.9.x | Out of R11 blocking scope; copy is correct, shared util is cleanup | Backlog L-14 |
| 2026-07-09 | RENAME §4.1 INSECURE: strong stderr if only `FABLE_RELAY_INSECURE_OPEN` set | **Still silent ignore** of legacy insecure env (no dual-read) | Safer than dual-read fail-open; warning is UX-only (R11 Low) | Optional one-shot warn on relay start |
| 2026-07-09 | R11 residual branding | Left some “Fable” strings in usage examples / adapter headers / stale version strings | Non-blocking per R11 Low; avoided drive-by doc thrash in security PATCH | Branding sweep backlog |
| 2026-07-09 | Gate process: re-review after 0.9.1 | PLAN marked **0.9.1 `approved`** by implementer after R11 required fixes; no second full R11 body rewrite | Matches prior series (0.7.1, 0.8.1): required PATCH + author close when review said “PATCH then approve” | If owner wants independent re-review, add R11.1 note only |
| 2026-07-09 | R11 Low branding sweep (0.9.2) | User-facing strings → loom; left intentional dual-compat (`FABLE_*` dual-read, `/fable` slash, deprecated type aliases, legacy MCP markers) | Avoid breaking transition paths while cleaning product UI | Drop dual-compat in 0.10 |
| 2026-07-09 | RENAME §4.1 INSECURE warn | Emit stderr when only `FABLE_RELAY_INSECURE_OPEN` is set; still **does not** enable open bind | Matches plan “strong warn” without reintroducing fail-open | Done |
| 2026-07-09 | L-14 | Moved compare to `@loom/protocol`; relay re-exports `timingSafeTokenEqual` for API stability | One impl; sticky imports protocol directly | Done |
| 2026-07-09 | L-16 | Documented caps as **chars** only (no silent byte-cap behavior change) | Avoids breaking large board snapshots that fit char limit but not a naive byte limit | Optional future byte cap = new MINOR |
| 2026-07-09 | L-4 | **Client FIFO waiter queue** instead of wire `requestId` | Fixes concurrent ack steal without protocol bump; sticky F-3 still serializes RPC | Wire correlation only if multi-multiplex still fails |
| 2026-07-09 | L-4 claim match | Match `inbox.claim_result` by `entry.handoff.id` when present | Concurrent claims less cross-wired; failed claims without entry still FIFO | OK |
| 2026-07-09 | 0.10 dual-compat | **Removed env dual-read and /fable slash**; kept FABLE- invites, fable-board-snapshot, MCP strip, `fable` bin | Avoid breaking on-disk/wire data and shell muscle memory for bin | Remove bin in later minor if desired |
| 2026-07-09 | 0.10 /fable | Returns `help` kind (not peers) | Surfaces deprecation via help text rather than silent no-op | OK |
| 2026-07-09 | R12 M-17 | Wired `envRelay*` into resolveRelayEndpoint / relay cli / loom relay | Prevent silent local join when only FABLE_RELAY_URL set | Done 0.10.1 |
| 2026-07-09 | Codex entry | AGENTS.md + `bun run status` + systemHint line | Codex natively loads AGENTS.md | Done |
| 2026-07-09 | plan_review hygiene | Deferred table open-only; R12 checklist marked as-reviewed @0.10.0 + follow-up table | Prevent “M-17 still open” false reads | Done |
| 2026-07-09 | 0.10.2 bins | Removed `fable` / `fable-mcp` bins and root `fable` script | Product surface = loom only; kept invite/board/MCP strip | Done |
| 2026-07-11 | R19 L-1/L-2 | `room join` explicit `--relay` / `--token` flags override embedded invite-link values with stderr notes; `room invite --link` prints a bearer-secret notice | Least surprise: an explicitly typed CLI flag should win over a pasted blob; bearer-secret notice keeps token-bearing output visible as sensitive | Done 0.18.0 |
| 2026-07-11 | R20 L-1 | `scripts/install.sh` body wrapped in `main(){…}; main "$@"` + `need_cmd git`/`curl` guards | Truncated `curl\|bash` download can't execute a partial function body; explicit tool checks fail fast with a clear message | Done 0.19.0 |
| 2026-07-11 | R20 L-2 | Pin = `main` via `LOOM_INSTALL_REF` (default main), clone the same ref the raw URL serves; overridable to a tag/SHA | Trusted-cohort dogfood; raw URL is `.../main/scripts/install.sh` so default matches. Tag pin available when a release exists | Done 0.19.0 |
| 2026-07-11 | R20 L-3 | `loomCmd()` display helper resolves `loom` vs `bun run loom` via `Bun.which("loom")`; the "if loom is not on PATH…" note now only prints when not installed | Heuristic is acceptable — post-install strangers have `loom`; fallback preserved for repo-only users. Executed spawn (`index.ts` REPL) intentionally excluded (R20 M-3) | Done 0.19.0 |
| 2026-07-11 | R20 L-4 | fish handled via `fish_add_path` in `~/.config/fish/config.fish` with a marker-line idempotence guard | fish does not read POSIX rc PATH syntax; `fish_add_path` is the idiomatic path mutation | Done 0.19.0 |
| 2026-07-11 | 0.19.0 install.sh **bug (Docker-caught)** | `ensure_path` bash branch ended on `[ -e ~/.bash_profile ] && …` → returned 1 when absent → `set -e` aborted install before the ✅ message; added `return 0` + write `~/.profile` (login shells) instead of the conditional `.bash_profile` | Test B/A on clean Ubuntu (bash login) exposed it; macOS zsh branch never hit it. Fix makes both interactive + login shells work | Done 0.19.0 |
| 2026-07-11 | 0.19.0 install.sh testability | Added `LOOM_INSTALL_REPO` (git URL or local path; default GitHub) so the Docker harness clones the local checkout offline | Additive optional env, sibling to `LOOM_INSTALL_DIR`/`_REF`; author-close Low | Done 0.19.0 |
| 2026-07-11 | 0.19.0 install.sh unzip hint | Before installing Bun, if `unzip` absent print a hint (Bun installer unpacks a zip) | Docker A2 diagnostic: minimal Ubuntu lacks unzip → Bun install failed opaquely | Done 0.19.0 |
| 2026-07-11 | Docker dry-run harness | `test/docker/` — Test A (install.sh cold-start on clean ubuntu:24.04, M-4) + Test B (relay + peerA + cold-install peerB → offline handoff across containers). Both pass | Single-host stand-in for the 2-machine dry-run; QA not demand-validation (LOOM_PURPOSE_REVIEW). Caught the ensure_path bug above | Done 0.19.0 |
| 2026-07-11 | R21 A3 `loom doctor` read-only | `cmdDoctor` resolves the expected `~/.loom` home/session path without calling `loomDir()`/`sessionPath()`/`loadSession()`, because those helpers may migrate legacy state as part of normal operation | Stronger read-only interpretation: diagnosis must not rename/copy/delete state even on first run or legacy homes | Done 0.20.0 |
| 2026-07-11 | R21 L-1/L-2/L-3 | Writable check uses `accessSync(home, W_OK)` only; renderer redacts `token` query params defensively; host RPC uses `stickyRpc({ op: "status" }, { meta, timeoutMs: 2500 })` | Closes all R21 Low items without expanding scope or adding mutation | Done 0.20.0 |
| 2026-07-11 | R22 / 0.21.1 PTY inject implementation detail | `run-with-pty.py` services the inject Unix socket from the existing PTY `select` loop instead of a background daemon thread | Keeps all PTY master writes serialized in one loop while preserving the binding locks: env-gated only, no buffering, fresh Stop marker + output quiescence, bracketed paste only | Optional future refactor to daemon thread if the select-loop handler proves too much latency |
| 2026-07-12 | R22 / 0.21.1 known limitations (disclosed) | (a) idle signal = Claude `Stop` hook marker + PTY output-quiescence AND-gate; there is **no `UserPromptSubmit`/pre-generation hook**, so marker staleness is cleared heuristically on human stdin activity. (b) The python inject path (`run-with-pty.py`) is exercised by `py_compile` + architect line-review only — **no runtime/e2e test** (no python test runner in repo). | Conservative: any uncertainty → no-inject (M-3), and the feature is opt-in/dormant unless `--inject-handoffs` (zero default-path blast radius). | **Live smoke recommended before the team enables `--inject-handoffs`**: drive a real `loom run claude --inject-handoffs`, accept a handoff, confirm paste-not-submit + no inject while busy. |
| 2026-07-17 | R23 / 0.22.0 M-2 bare Enter | herdr socket surface has no `pane.run` (methods: `agent.send` / `pane.send_keys`…). M-2 implemented as **two `agent.send` calls**: untrusted prompt, then fixed constant `BARE_ENTER` (`"\n"`). Never interpolates prompt into a submit command. | Matches Step 0.5 “send is no-Enter”; second call is untrusted-free constant only — equivalent to bare Enter without `pane.run` prompt interpolation ban. | Live smoke with real herdr/claude to confirm Enter reaches the agent input. |
| 2026-07-17 | R23 / 0.22.0 bridge stop semantics | `bridge stop` **disconnects without `leave`** so the peer stays on roster as offline (durable inbox + peerSecret rejoin). Explicit leave would drop the peer and make offline dispatch `peer_unknown`. | Preserves F1 offline queue durability from HERDR_DESIGN §2.4. | If permanent de-register is needed later, add `bridge leave` subcommand. |
| 2026-07-17 | R23 / 0.22.0 author-close L-1..L-3 | L-1: zod fail → claim + `failed reason=payload_invalid` result. L-2: `apply_card_result` rejects `result.node` ≠ card `assignee` (+ optional fromNode). L-3: `serializeCardAttachment` pre-checks 256k; schema uses `.nonnegative()`. | All three author-close items implemented without scope expansion. | Done 0.22.0 |
| 2026-07-17 | R23 / 0.22.0 inbox drain | Bridge polls `listInbox` every 1.5s in addition to initial drain (online handoff push does not always deliver full body to the bridge handler). | Conservative: at-most-once processing with `processedHandoffs` set; no journal. | Optional: sticky-style envelope push of full handoff when addressed to self. |
| 2026-07-17 | 0.22.0 architect verification fix | `resolveAgentArgv` shell-exclusion guard was a no-op (`if (kind !== "claude")` never fires — `DispatchAgentKind` is the closed enum `["claude"]`), so a local config `claude: ["bash"]` would have run bash. Made the rejection unconditional + regression test. Also cleared biome errors (2 `noImplicitAnyLet`, `stripAnsi` control-char suppressions per cli/index.ts:141 precedent) and style infos on the 9 bridge files. | Aligns code with its own "shell permanently excluded even if misconfigured" comment; local-only surface (config is 0600, wire never carries argv) so severity low. Lane-delegated (sonnet), architect-verified. | Done 0.22.0 — `bun test` 214/0 |
| 2026-07-17 | 0.22.0 live smoke — 5 real bugs fixed (§5.3 이원화 완주) | Live smoke vs real herdr v0.7.4 + real claude worker found and fixed: (1) CLI `bridge start --allow` never reached `cmdBridge` (global parser eats flags; now reads `flags.allow`); (2) **C4** herdr socket = one RPC per connection (server FIN after every response; only `events.subscribe` stays open) → `HerdrClient` transport rework (per-request connections + dedicated subscribe connection with backoff resubscribe) + fake-herdr made FIN-honest; (3) `BARE_ENTER` LF→**CR** (terminal Enter is `\r`; LF only inserts a composer newline); (4) immediate CR swallowed by Claude Code paste-grouping → `submitDelayMs` (500) grace; (5) 500ms still not always enough → event-verified **submit retry loop** (`verifySubmitOrRetry`, up to 3 bare-Enter resends; never fails the card) + agent name gets `-${seq}` suffix (herdr rejects duplicate agent names on re-dispatch). | Each fix is live-measured, lane-delegated (sonnet), architect-verified; fake-herdr honesty change is what lets the suite catch transport regressions from now on. Final round: dispatch→spawn→inject→auto-submit→working→idle→[DONE]→claim→L-2→board done in 36s with zero human intervention (`bun test` 218/0). | Done 0.22.0 |
| 2026-07-17 | 0.22.0 live smoke — worker refusal is by design | The spawned worker (real Claude Code) sees the card prompt under the M-4 `⚠ Untrusted handoff content` wrapper and **refuses to obey embedded instructions** (matches prior observation S578): it answers with its own judgment instead of echoing demanded strings. Smoke pass criterion is therefore the mechanical round-trip (submit → status → [DONE] → board), NOT semantic compliance of the worker. | Forcing marker compliance would mean demanding prompt-injection success — the refusal is the security model working. Teams should write card prompts as tasks for a skeptical agent, not as commands. | Disclosed limitation/behavior |
| 2026-07-17 | 0.22.0 known limitation — seq resets across bridge restarts | `cardSeq` is in-memory per bridge process, while the tower board persists `last_seq=N` in task notes. A bridge restart between dispatches of the SAME card resends seq=1, which `applyCardResult` treats as stale (`seq <= last`) and silently ignores — the task stays un-updated. Bit twice during the smoke (worked around with fresh tasks). | At-most-once guard works within one bridge lifetime; cross-restart redispatch of the same card is a follow-up (e.g. persist cardSeq in bridge meta, or seed seq from a timestamp). | **Follow-up** (not blocking — redispatch-after-restart is an edge flow) |

| 2026-07-18 | 0.23.0 conv-state persistence choice (R25 M-2 "구현 중 결정") | R25 M-2 lock allowed in-memory-only conv state ("재시작 = conv 사망 → 재-open"), but implemented **file-backed** state instead: `conv-state.ts` persists `ConvState` under `loomDir()/convs/<role>-<convId>.json` via the existing atomic-json helpers (same pattern as `task-board.ts`). | File persistence is strictly more conservative than in-memory-only for the fail-closed default (R25 M-2 still holds — an unknown/missing file is still "unknown convId", no re-adopt) while surviving MCP-server / bridge process restarts mid-conv, which in-memory would lose. Cost is trivial (small JSON, same lock/atomic-write machinery already proven in task-board.ts). | Done 0.23.0 |
| 2026-07-18 | 0.23.0 conv-state key includes role (found via testing, not spec-mandated) | `conv-state.ts` keys state files by **`(role, convId)`**, not `convId` alone — path is `convs/tower-<convId>.json` vs `convs/worker-<convId>.json`. | Discovered while building the in-process integration test (`conv.test.ts`): tower and worker normally run on separate machines with separate `loomDir()` roots, but when they share one `loomDir()` (same-machine dogfood, or an in-process test harness), a convId-only key lets the tower's own state row satisfy `loadConvState()` on the worker's side (and vice versa) — silently defeating the R24/R25 M-1 pin check with the WRONG party's own self-referential pin. Role-scoping is a structural fix, not a test-only workaround — it protects any real same-machine dogfood scenario too. | Done 0.23.0 |
| 2026-07-18 | 0.23.0 worker turn kind detection: `[DONE_PROPOSAL]` prefix convention | Bridge-side `sendWorkerTurnFromPane` maps pane output to `kind: done_proposal` only when the stripped output starts with a literal `[DONE_PROPOSAL]` marker (mirrors the existing `[GOAL]`/`[DONE]` body-tag convention from `card-contract.ts`); otherwise `normal` (or `blocked` on herdr `agent_status=blocked`/pane close). CONV_SPEC does not lock a detection mechanism for this — 0.22.0's own Unknowns register "실제 Claude/Codex detection이 done을 언제 emit하는가" as unresolved for the card flow, and conv inherits the same gap. | Conservative: this is a prompt-level convention layered entirely client-side (no wire change, no CONV_SPEC reinterpretation) and defaults to `normal` (never auto-confirms completion) when the marker is absent — the tower's `conv_close` remains the only path that actually ends a conv (§1.3/§1.4). | **R25 질의 candidate, not filed**: if dogfood shows workers routinely forgetting the marker, worth a PATCH to give bridges a structural (not textual) done-proposal signal — flagged in this report per team-lead's instruction, not written into `docs/PLAN.md` (architect's call). |
| 2026-07-18 | 0.23.0 §5.3 artifact packaging: bridge tail-truncates instead of emitting `artifacts[]` | `sendWorkerTurnFromPane` uses `truncateTail` (same helper as 0.22.0's card `[DONE]` output) when pane output exceeds the 32k inline threshold, appending a bridge-note about the truncation, rather than constructing a git/scp `artifacts[]` ref per §5.2/§5.3. The M-2 validation functions (`validateGitArtifactRef`/`validateScpArtifactRef`) are fully implemented and unit-tested in `packages/protocol/src/conv-contract.ts`, but nothing in this PATCH calls them to actually build a git branch push or scp copy on the bridge side. | PLAN 0.23.0's own scope explicitly bounds artifact fetch to "제시까지, 자동 실행 안 함" — but that assumed a *tower-side* fetch-command presenter existed to consume artifact refs the worker produced. Given time budget, the worker-side "produce an artifacts[] ref for an actual git push" half was not implemented; tail-truncation is the safe fallback (never silently drops data — output beyond the cap is lost only in that this specific fallback path chose truncation over out-of-band packaging, exactly matching 0.22.0's own tail-keep precedent for card results). | **Not implemented — explicitly flagged, not silently scoped out.** Real artifact push (git branch `conv/<convId>/…` + scp fallback) is the natural next PATCH; the validation functions are ready to be wired in. |
| 2026-07-18 | 0.23.0 conv.open M-1-deny still claims the handoff (diverges from card's no-claim-on-deny) | `processInboxEntry`'s conv branch claims **any** conv-labeled handoff (open/accept/reject/turn/close) before dispatching to `processConvIntent`, including when `conv.open`'s M-1 dispatcher-allowlist check will end up denying it. Card's own M-1 (0.22.0) deliberately does **not** claim on deny ("무시+로그 without claim"), leaving the entry for a human to inspect. | For conv.open specifically this divergence is low-risk: an M-1 deny happens before any pin/state is created and before any pane starts or reply is sent, so claiming just removes an already-rejected attempt from the queue (arguably cleaner than card's precedent, since a rejected `conv.open` isn't something a later authorization change would want reprocessed). Time-boxed: fixing this to exactly mirror card's ordering would need peeking at the label+payload before claim, a small but nontrivial restructure not attempted given the verification budget already spent debugging the test harness (see below). | Left as-is; low-severity, flagged for a future PATCH review rather than fixed same-session. |
| 2026-07-18 | 0.23.0 test-harness debugging cost (context for the above deferral) | The conv.test.ts integration suite hit two environment/harness bugs that consumed most of the implementation session's verification budget: (1) the interactive shell's `LOOM_RELAY_TOKEN`/`LOOM_RELAY_URL` (set for real dogfood relay use) leak into any `RelayServer`/`RelayClient` built without explicit overrides, breaking auth for every relay-based test in this sandbox (`bun test` must be run with `env -u LOOM_RELAY_TOKEN -u LOOM_RELAY_URL` here — confirmed pre-existing on `main`, not a conv regression); (2) `startBridgeRuntime`'s internal `saveSession()` call resolves its write path via the **global** `sessionPath()`/`LOOM_SESSION` env var rather than a parameter, so a test that points `LOOM_SESSION` at the tower's session file *before* starting the bridge gets its tower file silently overwritten with the worker's identity the moment the bridge persists its issued peerSecret. | Documented so the next agent doesn't rediscover these blind: (1) is an environment artifact of this session's shell, not a repo defect — CI presumably doesn't export those vars. (2) is a genuine footgun in `saveSession()`'s env-based path resolution that bit this test but could equally bite any future multi-role-in-one-process test; not fixed in `session-store.ts` itself since 0.22.0's bridge test never needed a tower-side session at all (its tower uses raw `RelayClient`, sidestepping `loomDir()` entirely) — reordering the test's `beforeAll` (worker session context first, tower session only after bridge start) was sufficient and lower-risk than changing `saveSession()`'s signature. | Flagged for whoever next builds a same-process multi-role test: `saveSession()` takes no explicit path parameter — order your env-var switches accordingly, or consider adding one. |

### §0.23.1 — artifact 패키징 호출부 (R26 PATCH)

| Date | Plan ref | Choice | Why conservative | Follow-up |
|------|----------|--------|-------------------|-----------|
| 2026-07-18 | 0.23.1 R26 M-1 local mapping file location/format | New `conv-node-hosts.ts`: `loomDir()/conv-node-hosts.json` (0600, `loomDir()` via M-14), a flat `{ peerId: sshHost }` map — keyed by the conv's **pinned peerId** (server-assigned, M-9), never by displayName. Mirrors `bridge-config.ts`'s existing config-file pattern (dir under `loomDir()`, 0600, JSON, `loadX()`/`saveX()` pair). No CLI subcommand ships in this PATCH to manage it — operators hand-edit the JSON (or a future `setConvNodeHost()` caller). | An empty/missing file resolving every lookup to `null` **is** the correct default (R26 M-1 fail-closed) — shipping without a setter UI keeps the feature inert-by-default rather than guessing a host. Keying by peerId (not displayName) is the actual load-bearing choice: it's the same identifier the pin (`pinnedPeerId`) already trusts, so no new self-reported value enters the trust path. | A `loom conv-hosts set <peerId> <host>` CLI command would make this actually usable without hand-editing JSON — natural next-PATCH candidate, not attempted here (out of the PATCH's explicit scope). |
| 2026-07-18 | 0.23.1 R26 M-2 `git remote` scope for the tower-side check | `listLocalGitRemotes()` (`conv-artifact-present.ts`) runs `git remote` in `process.cwd()` by default (the tower operator's own shell cwd when the MCP server process was launched), not a cwd derived from conv scope — `ConvState` doesn't persist `scope.cwd` at all (only `ConvOpenPayload` carries it transiently). | §5.3② says "수신측 로컬 설정에 이미 등록된 기존 remote" — the tower operator's own working directory's git config is the most literal reading of "local config" available without inventing a new per-conv cwd persistence field CONV_SPEC never asked for. Failure mode is safe either way: an empty/wrong remote list just means every git ref fails closed (no assembly), never a false-positive known-remote. | If a real conv workflow needs a *different* repo's remotes than the tower process's cwd, `listLocalGitRemotes(cwd)` already accepts an explicit override — wiring that through would be a small follow-up, not a redesign. |
| 2026-07-18 | 0.23.1 R26 L-1 wire/on-disk path divergence (accepted per PLAN, documented for visibility) | The wire `artifacts[].ref.path` is always the canonical literal `~/.loom/artifacts/<convId>/turn-<seq>.txt` (`convArtifactsRootLiteral()`), while the bridge actually **writes** to `loomDir()/artifacts/<convId>/turn-<seq>.txt` — these differ whenever a bridge's real `loomDir()` isn't `~/.loom` (e.g. the pre-existing legacy `~/.fable` migrate-blocked path in `session-store.ts`). | This is PLAN 0.23.1's own explicit tradeoff (R26 L-1: "절대경로 방출 시 크로스머신 prefix 전량 불일치 + 브릿지 홈경로 노출"), not a deviation introduced here — implemented exactly as specified. Recorded so the next agent doesn't "fix" the divergence without re-opening the L-1 decision. | If migrate-blocked `~/.fable` bridges become common in practice, the presented scp command for those bridges would target a path that doesn't exist remotely — worth a live-dogfood check, not fixed speculatively here. |
| 2026-07-18 | 0.23.1 test fixture: `fake-herdr.ts` gained 3 test-only methods | Added `setPaneText`, `getPaneText`, `paneIdForConv` to `FakeHerdr` (packages/host/src/fake-herdr.ts) — additive only, no behavior change to existing RPC handling. Needed to deterministically stage a >32k pane scrape for the R26 §5.2 packaging integration test without a real herdr/PTY. | Same fixture-extension pattern the file already uses (`pushEvent`, `calls`) — no production code path touches these. | None. |
| 2026-07-18 | 0.23.1 test-harness finding: fixture's `autoStatus` never broadcasts "working" | Discovered while building the >32k integration test: this fake herdr's BARE_ENTER handler sets `p.status = "working"` **locally** but never broadcasts a `pane_agent_status_changed(working)` event, so `flight.sawWorking` never becomes true and `verifyConvSubmitOrRetry` **always** times out and resends BARE_ENTER once per inject — meaning every conv turn in this test file is actually two "done" broadcasts (and, prior to this PATCH's test, was silently masked because both carried identical small content). Not a fixture bug worth fixing here (all existing tests already tolerate it, per the pre-existing "M-2 verify-retry resend" comment in the replay test) — but it means any future test that wants to intervene on pane content between "accept" and "the first turn" must drain both resend-duplicated turns first, not just one. | Documented rather than "fixed" (patching the fixture to broadcast "working" would be a larger, riskier change to a shared fixture touching every conv/bridge test in the suite, for a PATCH whose scope is artifact packaging, not submit-verify fixture fidelity). | Worth a dedicated fixture-fidelity pass if `verifyConvSubmitOrRetry`'s resend path itself ever needs direct testing. |

### §0.23.11 — ①③④⑤ (R35 PATCH)

| Date | Plan ref | Choice | Why conservative | Follow-up |
|------|----------|--------|-------------------|-----------|
| 2026-07-19 | 0.23.11 ① chrome known-hint (스코프: 상태줄 시그니처 1종) | **라이브 보정: bare composer `❯` 전용-줄 필터 1건 추가** (trimmed === "❯" 전체-매치만 — 부분 매치·`❯ 텍스트` 콘텐츠 줄 보존). SMOKE-02311-D(claude 카드)에서 ① 상태줄 소거는 성공했으나 summary가 `"❯"`로 선택됨 — claude TUI의 bare composer 줄은 `COMPOSER_PROMPT_RE`(`│ ❯` 요구)에 안 걸리는 기지 잔재(SMOKE-0239 K=10 보정 사유에도 등장). | 0.23.9 K 3→10과 동일한 라이브 보정 클래스 — 리뷰된 필터 메커니즘(줄 단위 보수 skip·R31 M-1 경계) 불변, 단독-문자 전용-줄이라 콘텐츠 손실 표면이 사실상 0. 대안(③ 선별에서 `❯` 스킵)은 타이밍-전용 스킵의 의미를 넓혀 과필터 리스크가 더 큼 — 기각. | 재스모크 D-2로 bare ❯ 소거 실증 → 후속 보정 2로 이어짐(아래). |
| 2026-07-19 | 0.23.11 ③ 타이밍-전용 스킵 (스코프: "Worked for Ns." 실증분) | **라이브 보정 2: claude ✻-접두 타이밍줄 스킵 패턴 추가** — `CLAUDE_TIMING_LINE_RE = /^✻\s+[A-Za-z]+ for (?:\d+h)?(?:\d+m)?\d+(?:\.\d+)?s\.?$/` (가변 동사형 — D-2 실측 `✻ Sautéed for 9s`, SMOKE-0239 `✻ Churned for 15s` 동일 가족). ③ summary 스킵에만 적용. | 스킵 메커니즘·현행 폴백 불변, ✻ 접두 + "for Ns" 말미 동시 요구라 앵커드 보수. **⑤ supersession은 `WORKED_TIMING_LINE_RE`만 유지**(✻줄은 grok 완료 증거가 아님 — R35 M-1 경계 무접촉). | 재스모크 D-3에서 ✻줄 소거 실증 → 보정 3으로 이어짐(아래). |
| 2026-07-19 | 0.23.11 ① known-hint (스코프: 상태줄 시그니처) | **라이브 보정 3: `KEY_HINT_MARKERS`에 `" · /effort"` substring 추가** — D-3에서 summary가 `"● high · /effort"`(claude TUI effort 힌트줄, 말미 비콘텐츠 계열 4번째 가족)로 선택됨. | 0.23.8 `⏵⏵ auto mode on`과 동일한 known-hint substring 클래스 — 메커니즘 불변. ` · /effort`는 TUI 슬래시-커맨드 힌트 특유 문자열이라 콘텐츠 충돌 표면 극소. **누적 원칙: claude 말미 비콘텐츠 계열은 이 보정 3까지로 종결 — 추가 가족이 표면화되면 개별 보정 대신 후속 후보로 등재하고 잔재 수용**(보수 필터 "망라 수집 아님" 원칙 유지). | 재스모크 D-4로 summary=마커 실증(Implemented 블록). |

### §0.23.9 — ②③⑧ (R34 PATCH)

| Date | Plan ref | Choice | Why conservative | Follow-up |
|------|----------|--------|-------------------|-----------|
| 2026-07-19 | 0.23.9 R34 M-1 "말미 비공백 K줄(**권장 3**) line-anchored" | `DONE_PROPOSAL_TAIL_LINES = 10` (권장값 3 대신). SMOKE-0239 conv 라이브에서 규약-준수 claude 워커의 마커 줄이 kind=normal로 미탐지 — claude TUI가 답변 뒤에 **비콘텐츠 줄 3개**(타이밍 줄 `✻ Churned for 15s`·bare 컴포저 `❯`·상태줄 `Fable 5 ⚡… │ …`)를 덧붙이는데 보수 chrome 필터가 이들을 통과시켜 말미 3줄 창을 점유했다. | lock의 메커니즘(말미 비공백 K줄 line-anchored·판정 입력 통일·비-줄-선두 문안)은 그대로 — "권장" 파라미터만 0.23.7 still-running **말미 10줄 선례**와 일치시킴. 위양성 확대는 R34가 이미 수용한 노출 클래스(보드 노트 표시뿐, 자동 close 없음) 내에서 bounded. 대안(상태줄·타이밍줄을 chrome 필터에 추가)은 콘텐츠-포함 줄 패턴 확장이라 과필터 리스크가 더 큼 — 기각. | 재스모크로 kind=done_proposal 라이브 실증(아래 Implemented 블록). claude 상태줄(`Fable 5 ⚡… │ …`)의 summary 오염은 별도 후속 후보(이 웨이브 2회 관찰). |

### §0.27.0 — PANE-DEATH (C) result 발행 소유권 + ACK 경계 (R43e MINOR · impl `7ed314c` · dist `e4f6c3c`)

| Date | Plan ref | Choice | Why conservative | Follow-up |
|------|----------|--------|-------------------|-----------|
| 2026-07-21 | §6.7.1 presence supersede↔자동 해제(c) 순서 | presence supersede가 "seq 레코드로 흡수" 대신 **presence 레코드를 선-fold**하고, seq 레코드는 이후 `relay_accepted`에서 해소. 종단 불변식("presence+seq 동시 미해소 0") 보존 확인. | 설계 §6.7.1 순차 규약의 두 표현 중 **종단 불변식을 깨지 않는 쪽** 채택 — 거짓 미해소 quarantine 항목 잔존 0. 검증 레인(Claude opus) 수용(Low). | 없음. |
| 2026-07-21 | §6.7.1 durable quarantine 해제 조건 | **명시적 rejected 분기는 durable quarantine 미기록**(definitive 결과 — log만). | rejected는 유실·미상이 아니라 **결정적 결과**라 회복 대상이 아니다 — quarantine(유실·고아 회복 매체)에 넣지 않는 것이 불변식 정합. 검증 레인 수용(Low). | 없음. |
| 2026-07-21 | D7 ④ 소스-락 어서션 (grok 공개 편차) | ④ 소스-락 어서션이 `skipIf` 블록 안에 있어 **한 번도 실통과한 적 없음**이 활성 이동 시 노출. 프로덕션 주석 3곳이 금지 토큰을 **축자 인용**하던 것을 문구 변경으로 해소. | 주석-only·행동 무변경 — 락은 주석 포함 금지로 **더 엄격**해졌다(완화 아님). grok이 편차를 공개. | 교훈 (40) verification: skip 블록 안 어서션은 검증된 적 없는 어서션 — 환경 게이트 블록에 소스-락 금지. |
| 2026-07-21 | D7 ①·①b strict ACK 성공 경로 유닛 (아키텍트 검증발) | ①·①b에서 **tower 전달 단언(`awaitCardResult`)을 제거**하고 **종결 분기(`pane.close` 정확히 1회)** 단언으로 재작성. 주입 자체(`queued_1`/`delivered_1`)는 유지. | D2 주입기가 `relay-client.ts:361-383`에서 **조기 반환**해 `:385` wire 전송에 미도달하므로, "ACK 강제"와 "전달 도착"은 **상호 배타**다 — 작성된 형태로는 통과 불가능한 단언이었다. 심을 relay 쪽(`handoffAckEnvelope`)으로 옮기는 대안은 **기각**: 이 PATCH가 잠그는 신뢰 경계가 "ACK의 진실성"인데 ACK 위조 심을 프로덕션 relay 패키지에 심으면 락 근거가 자기모순이 된다(fable-advisor 판정). **전달∧strict 성공 판정의 결합 커버리지는 `pane-cleanup.test.ts:244-268`(skipIf 없는 상시 실행 실 relay 경로)이 이미 담당** — 커버리지 손실 0. | 없음. `pane.close` 1회 발화는 **실측 확인**(예측 아님). |
| 2026-07-21 | D7 통합 블록 앰비언트 env 밀폐 (아키텍트 검증발) | `RelayServer` 생성을 describe 본문 → **`beforeAll` 내부**(토큰 삭제 직후)로 이동. `LOOM_RELAY_TOKEN` 저장/삭제(`beforeAll`)·복원(`afterAll`) 추가. | 앰비언트 `LOOM_RELAY_TOKEN`이 있으면 루프백 relay가 인증 ON으로 뜨는데 테스트 클라이언트는 토큰 미전송 → `beforeAll` 사망 → **통합 6개가 조용히 미실행**(24→19개, fail 2→1로 *감소*). 서버 env 자동 채택(`server.ts:60`) vs 클라이언트 옵션 단독(`relay-client.ts:132`)은 **의도된 보안 비대칭**이라 프로덕션 무변경. 1차 시도(`beforeAll`에서 삭제만)는 **생성자 latch** 때문에 no-op — 생성 시점을 미루는 것이 해법이었다. | 교훈 (41)(42) verification. `FABLE_RELAY_TOKEN` 2차 경로 우려는 **반증**됨(`envLoom`은 0.10에서 dual-read 제거, 경고만). |

### Earlier waves (pointer only)

| Range | Notes |
|-------|--------|
| 0.3.x–0.8.x | Security PATCHes followed `plan_review` findings; historical detail lives in `docs/plan_review.md` / archive. Add new rows here only when **new** deviations occur. |

---

## Non-deviations (confirmed plan-aligned)

Record successes so the next agent does not “fix” what was intentional.

| Topic | Status |
|-------|--------|
| Live-PID gate before `~/.fable` → `~/.loom` rename | Implemented; M-16 tests cover live vs dead pid |
| No dual-read of `*_RELAY_INSECURE_OPEN` | LOOM only |
| Invite: mint `LOOM-`; lookup full-code case-fold; **no** FABLE→LOOM rewrite | Tested |
| MCP strip: exact `Loom multiplayer` / `mcp_servers.(fable\|loom)` only | “deadline looming” preserved |
| M-7 peerSecret + session 0600 | Unchanged through rename |
| Primary CLI `loom`; `fable` alias kept one minor | Intentional |

---

## Open decisions still deferred (not yet deviations)

These remain as plan defaults; no forced fork yet.

- Drop dual-read `FABLE_*` and `/fable` slash (target 0.10 / 1.0)
- Workspace folder rename `fable-advisor` → `Loom` on disk (optional; remote is already `lemonbalms/Loom`)
- Tauri UI (blocked on cargo/rustc)

---

## Template (copy for next entry)

```markdown
| YYYY-MM-DD | PLAN/RENAME/Rn §… | What we did instead | Why conservative | Follow-up |
```

---

*End of implementation notes. Append; do not rewrite history of old deviations except to mark follow-ups done.*
