# Implementation notes

Living log of **how we implemented** relative to plan docs (`docs/PLAN.md`, `docs/RENAME_TO_LOOM.md`, review findings).

**Rule (session standing order):**  
When an edge case forces a choice that diverges from the written plan, pick the **more conservative** option, record it under **Deviations** below, and continue. Do not silently improvise.

| Field | Value |
|-------|--------|
| **Maintained** | Yes — update on every non-trivial deviation |
| **Related** | `docs/WORKFLOW.md` (§3.5 Unknowns), `docs/UNKNOWNS.md`, `docs/PLAN.md`, `docs/plan_review.md`, `HANDOFF.md` |
| **Last updated** | 2026-10-15 (0.30.0 헤드리스 카드 워커 · 카드별 세션 · 재개/입양 · 동시성 · 정적 권한 프로필) |

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
