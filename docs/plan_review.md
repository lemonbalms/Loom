# Plan Review — Loom

> **버전 관리:** 계획 SSOT는 `docs/PLAN.md`이다. 리뷰는 반드시 **대상 Plan version**을 헤더에 적는다.  
> **최신:** PLAN **v0.14.1** `approved` (author-close) — R15 locks + **P2 durable relay implemented**. Open blocking 없음.  
> **규칙:** PLAN `Status=approved`는 **Fable 5 R{n} 사인오프 후**가 원칙. Low author-close 시 출처 명시. **언제 R{n} 필수?** → [`WORKFLOW.md` §5.0–5.1](./WORKFLOW.md).  
> **이름:** 제품 = **Loom** (`loom`, `@loom/*`); 검토자 **Fable 5** / fable-advisor = 에이전트, not product.  
> **아카이브:** R1–R11 전문 → [`docs/plan_review_archive.md`](./plan_review_archive.md)  
> **스냅샷:** 닫힌 R{n} 본문의 줄 번호·패키지명은 **검토 당시** 기준. 현재 코드는 follow-up 표 + PLAN을 볼 것.

---

## Active review

| Review | Plan | Status | Gate |
|--------|------|--------|------|
| *(none)* | | | **0.14.1** approved + P2 implemented |

---

## Open (blocking)

| ID | Sev | 요약 | 상태 |
|----|-----|------|------|
| *(none)* | | | |

---

## Deferred / backlog (open only)

| ID | Sev | 요약 | 상태 |
|----|-----|------|------|
| L-28 | Low | 0.14.0 `byCode` 재로드 시 invite-code 충돌이 silent last-wins | R15 — log 권고, backlog (PLAN locks cross-ref) |
| L-29 | Low | 0.14.0 room 파일이 GC 없이 재시작 간 누적 | R15 — residual; cross-ref in 0.14.1 locks table |
| L-23 | Low | sticky `GET /health` unauth loopback | **accepted** in 0.11.1 (document only) |
| L-26 | Low | Desktop sticky F-2 room/peer match | **done 0.13.5** |
| L-27 | Low | Pack embed check/read TOCTOU residual | **done 0.13.5** |
| L-5 | Low | pack embed allowlist at send | **done 0.13.0** (+ L-27 harden) |
| L-4 residual | Low | wire `requestId` | **done 0.13.1** |
| Product | — | Board UI / sticky board ops | **done 0.12.0** (M-18 A) |

---

## Recent follow-ups (last waves)

| Finding | 처리 |
|---------|------|
| **R15 M-21/M-22/M-23** | **0.14.1** PLAN Failure/security locks + author-close (no R15b) |
| **0.13.5 L-26/L-27** | desktop `load_live_meta` F-2; pack embed O_NOFOLLOW+fd; tests; author-close |
| **R14** | cumulative 0.11–0.13.3 trust → **approved**; L-26/L-27 closed in 0.13.5 |
| **0.13.3 install DX** | PRIORITIES.md; scripts/loom; link:loom / unlink:loom; README install A/B/C |
| **0.13.2 dogfood** | inbox displayName + att count; Share uses `bun run loom`; host stop profile tip |
| **0.13.1 L-4** | wire `requestId` — **author-close** (not R{n}; not Owner approve). Commit `676d4f3` 2026-07-10 |
| **0.13.0 L-5** | `--with-pack-embed` / `withPackEmbed`; re-resolve allowlist at send; caps |
| **0.12.2 send** | desktop Send tab (handoff/chat) + invite display + smoke handoff/chat |
| **0.12.1 polish** | auto-refresh, tab badges, peer names, board groups, PITCH 0.12 |
| **0.12.0 board** | sticky board RPC + desktop Board + `smoke:desktop` |
| **0.11.2 desktop** | shell Status/Peers/Inbox; Rust sticky; `cargo test` |
| **R13 M-18 / M-19 / M-20** | **0.11.1** locks → **0.11.2** code |
| **R13 L-21** | **superseded by M-20** (closed as Med) |
| **R13 L-22** | UNKNOWNS 0.11 filled |
| **R13 L-24** | folded into M-19 token boundary in 0.11.1 |
| **R13 L-25** | acceptance host-absent cases split in 0.11.1 |
| **R13** | **closed** — pending-revision → 0.11.1 approved (body below) |
| **Unknowns §3.5** | WORKFLOW + `docs/UNKNOWNS.md` |
| **0.10.3** docs honesty / Tauri unblocked | done |
| **R12** M-17 + L-17/18/20; L-19 residual | **0.10.1** / closed residual |
| Older | [`plan_review_archive.md`](./plan_review_archive.md) |

---

## Review index

| Review | Plan | Conclusion | Notes |
|--------|------|------------|-------|
| **R15** | v0.14.0 → **0.14.1** | pending-revision → **closed (author-close)** | M-21/22/23 locked in PLAN 0.14.1 — body below |
| **R14** | v0.13.3 code · **0.13.4** plan | **approved** | P1-B cumulative trust — body below |
| **R13** | v0.11.0 | pending-revision → **0.11.1 approved** | M-18/19/20 closed — body below |
| **R12** | v0.10.0 | pending-revision → **0.10.1 approved** | M-17 closed — body below |
| **R11** | v0.9.0 | → **0.9.1 approved** | [archive](./plan_review_archive.md) |
| **R10** | v0.8.0 | → **0.8.1 approved** | [archive](./plan_review_archive.md) |
| **R9** | v0.7.0 | → **0.7.1 approved** | [archive](./plan_review_archive.md) |
| **R8** | v0.6.0 | → **0.6.1 approved** | [archive](./plan_review_archive.md) |
| **R7** | v0.5.0 | **approved** | [archive](./plan_review_archive.md) |
| R6–R1 | … | … | [archive](./plan_review_archive.md) |

---

## Review R15 — Plan v0.14.0 (P2 durable relay state)

**검토 대상:** `docs/PLAN.md` **v0.14.0** 52~148줄 — relay 재시작 내구성(room meta/roster incl. peerSecret/pending inbox 디스크 스냅샷). 코드 없음 — plan-vs-territory 리뷰 (`packages/relay/src/persist.ts` 미생성 확인).  
**검토자:** Claude (Sonnet 5, `claude-review`) + **Fable 5 second opinion** (`/advisor fable`, agent `fable-advisor`, 필수 컨설트 완료)  
**날짜:** 2026-07-10  
**결론:** **`pending-revision`** — Med 3건, 전부 **PLAN 텍스트(Failure/security locks 표에 lock row 추가)** 수정으로 해소 가능. 신규 아키텍처 변경 아님.

> Snapshot: 코드가 전혀 없는 상태의 설계 리뷰. `packages/relay/src/room.ts`(517줄)에 serialize/hydrate 훅 없음, `packages/host/src/atomic-json.ts`(198줄) 패턴이 relay-local로 복제될 예정.

### Checklist

| Area | Result | Evidence (as reviewed) |
|------|--------|-------------------------|
| Wire protocol v1 무변경 | **Pass** | PLAN Out "Protocol wire / envelope changes" 명시 |
| Atomic write + 0600 패턴 재사용 | **Pass** | `atomic-json.ts:25-39` temp+rename+chmod 0600, relay-local 복제 계획 (host→relay import 순환 회피, package.json 확인: `@loom/relay`는 `@loom/protocol`만 의존, `@loom/host`가 `@loom/relay`를 의존) |
| Corrupt JSON fail-closed(단일 room만) | **Pass (설계 수준)** | `atomic-json.ts:45-68` backup+throw; PLAN Failure 표 "skip that room" + Acceptance #5 |
| leave/claim 시맨틱 유지 | **Pass** | `room.ts:186-192`(removePeer: members+inboxes 동시 삭제), `room.ts:433-467`(claimHandoff: first-wins, terminal entry 즉시 delete) — PLAN "leave still drops…", "claim… delete terminal entry" 표기와 코드 현재 동작 일치 |
| 캡 불변(L-11/L-16) | **Pass** | `room.ts:317-341`(trimInbox) 로직 변경 없음, PLAN "Caps unchanged" |
| Ephemeral 테스트 격리 | **Pass (설계 수준)** | PLAN "Tests: `persist:false` or `LOOM_RELAY_EPHEMERAL=1`" — home 오염 방지 |
| **홈 디렉터리 해석 / M-14 게이트** | **Fail** → **M-21** | `relay-daemon.ts:86-99` — 로컬 auto-daemon spawn이 `LOOM_RELAY_HOST/PORT/TOKEN`만 자식 프로세스에 전달, 상태 디렉터리는 미전달. `loomDir()`은 `@loom/host/src/session-store.ts:209`에만 존재하고 relay는 import 불가(순환) |
| **Hydration secret 재생성** | **Fail** → **M-22** | `room.ts:106-161`(addPeer) — 미등록 id는 `generatePeerSecret()`으로 새 secret 발급. PLAN Implementation sketch "hydrate ctor" 한 줄뿐, lock 표에 미반영 |
| **다중 writer 충돌** | **Fail** → **M-23** | `relay-daemon.ts:60-65` — remote 안내 문구가 운영자에게 수동 `bun run dev:relay` 실행을 유도; auto-daemon과 동일 기본 state dir을 공유하면 조율 없이 스냅샷 상호 덮어쓰기 가능. `atomic-json.ts:80-198`에 이미 pid-ownership lock 패턴 존재하나 relay는 미채택 |

### Findings

| Sev | ID | Finding | Evidence | 요구 조치 |
|-----|-----|---------|----------|-----------|
| Med | **M-21** | Relay 기본 상태 디렉터리(`~/.loom/relay-state/`)가 M-14 마이그레이션 게이트(`loomDir()`)를 우회할 수 있음 — auto-daemon spawn이 상태 디렉터리를 자식에 전달하지 않고, relay는 host의 `loomDir()`을 import할 수 없음(패키지 의존 방향 역전) | `packages/host/src/relay-daemon.ts:86-99`, `packages/host/src/session-store.ts:209-215`, PLAN Out "host→relay cycle if import host" | Failure/security locks에 추가: **auto-daemon은 `LOOM_RELAY_STATE_DIR=join(loomDir(), "relay-state")`를 자식 env로 반드시 전달**; standalone/remote `loom relay`(호스트 프로세스 없이 직접 실행)는 게이트 예외로 독립 기본값 사용을 명시적으로 문서화 |
| Med | **M-22** | Hydration이 기존 `addPeer()`/`generatePeerSecret()` 경로를 재사용하면 재시작마다 **모든 peer의 M-7 rejoin secret이 새로 발급**되어 기존 클라이언트 rejoin이 전원 깨짐 (Acceptance #4에서 뒤늦게 드러날 위험) | `packages/relay/src/room.ts:106-161` | Failure/security locks에 추가: **hydrate는 저장된 `secret`으로 `members`/`inboxes` Map을 직접 재구성하며 `addPeer`/`generatePeerSecret`을 호출하지 않는다** |
| Med | **M-23** | 동일 state dir에 대한 다중 writer(로컬 auto-daemon + 운영자가 안내에 따라 수동 실행한 `dev:relay`) 충돌이 "optional lockfile"로 미확정 방치 — 데이터 유실이 에러 없이 조용히 발생 가능 | `packages/host/src/relay-daemon.ts:60-65`(수동 실행 안내), `packages/host/src/atomic-json.ts:80-198`(withFileLock 패턴 기존 존재) | Failure/security locks에서 "optional"을 확정으로 교체: **(a)** `atomic-json.ts`의 pid-ownership lock 패턴을 relay-local `persist.ts`에 채택 **또는** **(b)** `dev:relay` 스크립트 기본값을 ephemeral로 강제 — 둘 중 하나를 PLAN에 명시 |
| Low | **L-28** | 재로드 시 `RoomRegistry.byCode` 재구축에서 invite-code 충돌이 silent last-wins될 수 있음 | `room.ts:479-496`(byId/byCode 구조) | 충돌 시 로그 남기는 로직 권고 — backlog |
| Low | **L-29** | Room 파일이 GC 없이 재시작 간 누적(기존 in-memory는 relay 프로세스 종료마다 자연 소거됨 — 지속성 도입으로 신규 잔여 위험) | PLAN Out "Room auto-GC / TTL eviction of disk rooms \| Keep process+disk; GC later if needed" (이미 명시됨) | 이미 Out 표에 있으나 Failure/security locks 표에도 교차참조 한 줄 권고 — backlog, blocking 아님 |

### R15 second opinion (Fable 5) — 요약

fable-advisor 에이전트가 PLAN 0.14.0, `room.ts`, `atomic-json.ts`, UNKNOWNS §0.14.0, WORKFLOW §5, `relay-daemon.ts`를 독립적으로 Read/Grep 후 다음을 확인:
- M-21/M-22 **동의, Med** — "두 불변식이 스케치는 됐지만 Failure/security lock 표에 없어, lock을 지키는 구현이라도 기능이 깨질 수 있음"이 pending-revision의 핵심 근거.
- M-23 **대체로 동의, Med-Low** — `relay-daemon.ts:63`이 사용자에게 수동 `dev:relay` 실행을 유도하는 실제 코드 경로가 있어 충돌이 가상이 아님. "optional"로 방치하지 말고 작성자가 (a)/(b) 중 하나를 확정할 것을 권고.
- L-28/L-29 추가 제시 (byCode 충돌 로깅, disk growth residual) — 둘 다 non-blocking으로 합의.
- 나머지(schema, caps 재사용, offline-on-load, leave/claim flush 시맨틱, ephemeral 테스트 게이트, 잔여 위협 모델)는 "sound"로 확인.
- **독립 결론:** `pending-revision` — "narrow, PLAN-text-only fixes; PATCH 후 author-close 가능, 전체 재리뷰 불필요."

### Decision notes

M-21/M-22/M-23은 전부 **PLAN 텍스트(Failure/security locks 표에 lock row 3줄 추가)** 로 해소되는 범위이며, 새 아키텍처·새 표면·프로토콜 변경이 아니다. 근거: (1) M-21/M-22는 "이미 스케치된 의도를 명문화"하는 것뿐 — 스키마에 `secret` 필드가 이미 있고 Out 표가 host→relay 순환을 이미 인지하고 있어 방향은 맞고 표기만 비어 있었음. (2) M-23은 기존 `atomic-json.ts` lock 패턴을 재사용하거나 스크립트 기본값 하나를 바꾸는 결정이면 충분.

**따라서 PATCH(0.14.1) 적용 후 — Open blocking M-21/M-22/M-23이 Failure/security locks 표에 반영되고 PLAN Status가 이를 반영하면 — 전체 재리뷰(R15b) 없이 author-close를 허용한다.** (WORKFLOW §5.1 "PATCH 후 author-close 가능" 조항 적용.) L-28/L-29는 Low backlog로 선택 사항이며 PATCH를 막지 않는다.

**구현은 여전히 금지** — PATCH가 적용되고 PLAN Status가 `approved`(author-close 포함)로 동기화되기 전까지 `packages/relay/src/persist.ts` 등 실제 코드 작성 금지.

### R15 follow-up (0.14.1 — applied)

| Finding | 처리 |
|---------|------|
| **M-21** | Failure/security locks: auto-daemon **must** pass `LOOM_RELAY_STATE_DIR=join(loomDir(),"relay-state")`; standalone gate-exempt docs |
| **M-22** | Hydrate **must not** call `addPeer`/`generatePeerSecret`; direct Map reconstruct from stored secret |
| **M-23** | **Required (a)** pid-ownership exclusive lock in relay `persist.ts` (not optional) |
| L-28/L-29 | Low backlog; L-29 residual cross-ref in locks table |
| PLAN | **v0.14.1** `approved` (author-close per R15 Decision notes; **no R15b**) |

**Implement P2** under 0.14.1 now allowed.

---

## Review R14 — Cumulative trust (0.11–0.13.3 code / PLAN v0.13.4)

**검토 대상:** 제품 코드 **0.11.0 … 0.13.3** (desktop sticky, pack embed L-5, requestId L-4, dogfood, install DX) + PLAN **v0.13.4** (이 리뷰 기록)  
**검토자:** Fable 5–equivalent security/consistency lane (code Read/Grep; Owner P1-B)  
**날짜:** 2026-07-10  
**결론:** **`approved`** (no High/Med; Low L-26 / L-27 → backlog)

> Snapshot: post-ship cumulative trust review, not a greenfield plan. Author-close series 0.12–0.13 gets external R{n} coverage for P1.

### Checklist

| Area | Result | Evidence (as reviewed) |
|------|--------|------------------------|
| Sticky token / RPC | **Pass** | `sticky-server.ts` `127.0.0.1` only; Bearer + `timingSafeTokenEqual`; meta `0o600`; desktop Rust-only token (`sticky.rs`); UI `invoke` only |
| Pack embed (L-5) | **Pass** | `embedPackFileBodies` re-`resolveAllowlistedPath` at send; caps; symlink-out skip; tests |
| Inbox claim first-wins | **Pass** | `room.claimHandoff` delete-on-claim; peer-scoped; tests |
| Desktop XSS (M-20) | **Pass** | `app.js` `setText` → `textContent`; no `innerHTML` |
| requestId (L-4) | **Pass** | wire echo same-socket; FIFO legacy fallback; no privilege use |
| Install DX (0.13.3) | **Pass** | `scripts/loom` / `link:loom` local path only; no secret surface |

### Findings

| Sev | ID | Finding | Evidence | Outcome |
|-----|-----|---------|----------|---------|
| Low | **L-26** | Desktop sticky client does not enforce CLI **F-2** roomId/peerId match; after re-join without host restart, desktop can RPC old host (same OS user only) | CLI `resolveLiveHostMeta` vs Rust `load_meta` (pid only) | **backlog** |
| Low | **L-27** | Pack embed residual TOCTOU: realpath then read can race same-path symlink swap | `context-pack.ts` embed path | **backlog** (primary L-5 closed) |

### Non-findings / accepted

| Item | Note |
|------|------|
| L-23 | `/health` unauth loopback — accepted since 0.11.1 |
| Relay in-memory inbox | MVP; P2 durable candidate — not a 0.11–0.13 regression |
| M-19 / M-20 | Hold through 0.12–0.13 |
| sanitize ≠ HTML | Terminal sanitize; desktop XSS via textContent (by design) |

### Decision notes

No High/Med issues and no plan-vs-code security drift that blocks trust for the 0.11–0.13.3 surface. Token stays loopback-Bearer + file-0600 and never reaches the webview; pack embed re-resolves allowlist at send; claim is first-wins and peer-scoped; desktop UI is textContent-only. **P1-B closed.** Next product gate: **P2 durable inbox** requires MINOR + new R{n}. Low L-26/L-27 optional.

### R14 follow-up (0.13.5 — applied)

| Finding | 처리 |
|---------|------|
| **L-26** | `StickyClient::load_live_meta` + all desktop RPC; CTA `session_mismatch` |
| **L-27** | `readAllowlistedFileText` O_NOFOLLOW open + fd read + re-resolve; test symlink swap |
| PLAN | **v0.13.5** author-close (R14 Low; no re-R{n}) |

---

## Review R13 — Plan v0.11.0 (M4.3b Tauri desktop shell)

**검토 대상:** `docs/PLAN.md` **v0.11.0** — thin Tauri 2 shell via sticky host loopback RPC  
**검토자:** implementer lane + **Fable 5 second opinion**  
**날짜:** 2026-07-09  
**결론:** **`pending-revision`** → **0.11.1 applied / approved**

> Snapshot: plan-vs-territory review (no `apps/desktop` yet at review time).

### Checklist (summary)

| # | Item | Result |
|---|------|--------|
| A2 | Sticky: status/peers/inbox/claim | **Yes** |
| A3 | Sticky board ops | **No** → M-18 |
| A7 | webview fetch / CORS | **Broken** → M-19 |
| A9 / M-20 | sanitize ≠ HTML escape | **Med** after second opinion |
| P4 | cargo/rustc / tauri CLI | **Yes** (build cross-check) |

### Findings → outcomes

| Sev | ID | Finding | Outcome |
|-----|-----|---------|---------|
| **Med** | **M-18** | Board promised; not on sticky RPC | **0.11.1 C** — Board **out of v1** |
| **Med** | **M-19** | Transport + session + (L-24) token boundary | **0.11.1** Rust invoke-only; session order; token Rust-only |
| **Med** | **M-20** | sanitize ≠ HTML; textContent required | **0.11.1** locked + XSS acceptance |
| Low | L-21 | (original) peer XSS | **→ M-20** |
| Low | L-22 | UNKNOWNS stub | **filled** |
| Low | L-23 | /health unauth | **accepted** document |
| Low | L-24 | token to webview | **→ M-19** |
| Low | L-25 | host-absent cases | **0.11.1** acceptance #4a–c |

### Decision notes (as-reviewed)

Direction sound (sticky reuse, no second join). Blockers were plan blanks, not code bugs. Second opinion correctly raised L-21→M-20.

### R13 follow-up (0.11.1 — applied)

| Finding | 처리 |
|---------|------|
| **M-18** | Option **C** — no Board view/ops in v1 |
| **M-19** | Rust `invoke` → HTTP loopback + Bearer; session `LOOM_SESSION` → profile → default; token never to JS |
| **M-20** | textContent-only; sanitize not HTML; XSS acceptance test |
| **L-25** | meta missing / stale pid / 401 CTAs |
| PLAN | **v0.11.1** `approved` |
| Gate | Implement `apps/desktop` next; CLI VERSION on implement wave |

### R13 second opinion (Fable 5) — retained summary

Independent Read/Grep agreed M-18/M-19; promoted HTML/XSS to **M-20**; L-24/L-25 added (folded/closed in 0.11.1). Toolchain `cargo build` cross-check OK.

---

## Review R12 — Plan v0.10.0 (dual-compat drop)

**결론:** **`pending-revision`** → **0.10.1 approved** (M-17 + L-17/L-18/L-20). **L-19** closed residual.

### R12 follow-up (0.10.1)

| Finding | 처리 |
|---------|------|
| **M-17** | `envRelay*` wiring |
| **L-17/L-18/L-20** | tests + `envTokenInQuery` |
| **L-19** | won't-fix residual legacy |

---

## How to add a new review

1. Bump `docs/PLAN.md` Version / Status = `pending-review`.  
2. Append `## Review R{N}` here; update Active review, Open, index, header.  
3. On approve: PLAN `approved`; findings → Recent follow-ups.  
4. Archive older full bodies if active file grows past ~250 lines historical.  
5. MINOR: WORKFLOW §3.5 / `docs/UNKNOWNS.md` pre-check.
