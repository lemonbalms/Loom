# Plan Review — Loom

> **버전 관리:** 계획 SSOT는 `docs/PLAN.md`이다. 리뷰는 반드시 **대상 Plan version**을 헤더에 적는다.  
> **최신:** PLAN **v0.11.0** `pending-revision` — R13 (Tauri shell). **Open blocking: M-18, M-19.**  
> **규칙:** PLAN `Status=approved`는 리뷰 사인오프 **후에만** 기재. 전체 워크플로우 → [`docs/WORKFLOW.md`](./WORKFLOW.md).  
> **이름:** 제품 = **Loom** (`loom`, `@loom/*`); 검토자 **Fable 5** / fable-advisor = 에이전트, not product.  
> **아카이브:** R1–R11 전문 → [`docs/plan_review_archive.md`](./plan_review_archive.md)  
> **스냅샷:** 닫힌 R{n} 본문의 줄 번호·패키지명은 **검토 당시** 기준. 현재 코드는 follow-up 표 + PLAN을 볼 것.

---

## Active review

| Review | Plan | Status | Gate |
|--------|------|--------|------|
| **R13** | **v0.11.0** | **`pending-revision`** | **본구현 금지** until M-18/M-19 → PLAN PATCH → author-close 또는 re-check |

사전 권장: [`docs/UNKNOWNS.md`](./UNKNOWNS.md) §0.11.0 · WORKFLOW §3.5.

---

## Open (blocking)

| ID | Sev | 요약 | 상태 |
|----|-----|------|------|
| **M-18** | Med | Board 경로 미정 — sticky RPC에 board 없음 vs PLAN acceptance #3 / Views | R13 — PLAN 명시 선택 필요 |
| **M-19** | Med | Desktop→sticky 호출 경로 미고정 — webview `fetch`는 CORS 없음; session/meta 선택 미기입 | R13 — Rust invoke + profile 규칙 |

---

## Deferred / backlog (open only)

| ID | Sev | 요약 | 상태 |
|----|-----|------|------|
| L-5 | Low | v2 pack embed TOCTOU re-resolve | when embed ships (v1 paths-only) |
| L-4 residual | Low | wire-level `requestId` beyond FIFO waiters | optional; 0.9.4 FIFO done |
| L-21 | Low | sticky `list_peers` displayName 미소독 — desktop XSS 방어 필수 | R13; implement with UI escape |
| L-22 | Low | UNKNOWNS 0.11.0 blindspot still stub | fill before implement |
| L-23 | Low | sticky `GET /health` unauthenticated (loopback info only) | accept or document |

---

## Recent follow-ups (last waves)

| Finding | 처리 |
|---------|------|
| **R13** | **pending-revision** — M-18/M-19 blocking; L-21–L-23 backlog (body below) |
| **Unknowns §3.5** | WORKFLOW + `docs/UNKNOWNS.md` process (docs only; not a product review) |
| **docs honesty / defaults** | **0.10.3** — ADAPTERS Loom; open-follow-ups; Tauri toolchain unblocked |
| **R12 L-19 residual branding** | **closed (won't-fix residual)** — intentional legacy only (FABLE- invites, MCP strip, type aliases, env warn). Not reopened. |
| **fable bin alias** | **0.10.2** — removed; data-path legacy kept |
| **R12 M-17 / L-17/L-18/L-20** | **0.10.1** — envRelay* wiring + tests |
| **R11 M-14/15/16** | **0.9.1** — rename baseline |
| Older (R7–R10, L-4 FIFO, …) | [`plan_review_archive.md`](./plan_review_archive.md) + git history |

---

## Review index

| Review | Plan | Conclusion | Notes |
|--------|------|------------|-------|
| **R13** | v0.11.0 | **`pending-revision`** | Tauri shell — body below |
| **R12** | v0.10.0 | pending-revision → **0.10.1 approved** | M-17 closed — body below |
| **R11** | v0.9.0 | pending-revision → **0.9.1 approved** | [archive](./plan_review_archive.md) |
| **R10** | v0.8.0 | pending-revision → **0.8.1 approved** | [archive](./plan_review_archive.md) |
| **R9** | v0.7.0 | pending-revision → **0.7.1 approved** | [archive](./plan_review_archive.md) |
| **R8** | v0.6.0 | pending-revision → **0.6.1 approved** | [archive](./plan_review_archive.md) |
| **R7** | v0.5.0 | **approved** | [archive](./plan_review_archive.md) |
| R6–R1 | … | … | [archive](./plan_review_archive.md) |

---

## Review R13 — Plan v0.11.0 (M4.3b Tauri desktop shell)

**검토 대상:** `docs/PLAN.md` **v0.11.0** (`pending-review` at review start) — thin Tauri 2 shell via sticky host loopback RPC  
**검토자:** implementer meta-review lane (code Read/Grep + sticky surface audit; `bun test` green as of pre-review baseline 134)  
**날짜:** 2026-07-09  
**결론:** **`pending-revision`**

> 코드 구현(`apps/desktop`)은 아직 없음 — 이 리뷰는 **계획 vs 기존 sticky/board 영토** 정합성·보안 전제 리뷰다. 본구현은 M-18/M-19 반영 후.

### Pre-check (process)

| # | Item | 결과 |
|---|------|------|
| P1 | PLAN in/out + security checklist 존재 | **Yes** |
| P2 | WORKFLOW §3.5 Unknowns | **Yes** (process docs) |
| P3 | `docs/UNKNOWNS.md` 0.11.0 filled | **Partial** — stub only → **L-22** |
| P4 | Toolchain | **Yes** — `cargo`/`rustc` 1.96; `@tauri-apps/cli` in root devDeps |
| P5 | 기존 보안 회귀 스팟체크 (sanitize, timing-safe, M-7, H-5 sticky bind) | **Yes** — sticky `hostname: "127.0.0.1"`, Bearer + `timingSafeTokenEqual` |

### Checklist — architecture vs territory

| # | Item | 검증 | 근거 |
|---|------|------|------|
| A1 | Sticky-only data path (no second join) | **Plan Yes / risk** | PLAN: require `loom host start`, no silent second join. Code: sticky holds one `RelayClient` (`sticky-server.ts`). Desktop must not open its own WS. |
| A2 | Sticky RPC covers Status / Peers / Inbox / claim | **Yes** | `sticky-rpc.ts`: `status`, `list_peers`, `list_inbox`, `claim`, `handoff`, `chat`, `ping`, `stop` |
| A3 | Sticky RPC covers **Board** show/add/set | **No** | **Board ops absent** from sticky contract. Board is local file via `task-board.ts` / MCP `list_tasks` etc. — **M-18** |
| A4 | Host token from meta 0600 | **Yes (host side)** | `writeStickyMeta` mode 0o600 (`sticky-meta.ts:46-51`). Desktop must not log token; plan states this. |
| A5 | Meta path multi-profile | **Partial** | `stickyMetaPath` derives `*.host.json` from session path (`sticky-meta.ts:27-35`). PLAN does not specify Tauri how to pick `LOOM_SESSION` / profile — **M-19** |
| A6 | Loopback-only sticky | **Yes** | `Bun.serve({ hostname: "127.0.0.1" })` (`sticky-server.ts:208-210`) |
| A7 | webview `fetch` to sticky | **Broken as-is** | Sticky responses have **no CORS** headers. Browser/webview fetch to `http://127.0.0.1:<port>/rpc` will fail preflight/simple CORS. PLAN says "invoke / fetch" without locking Rust-side HTTP — **M-19** |
| A8 | Inbox sanitize on sticky path | **Yes** | `list_inbox` / `claim` run `sanitizeHandoffForOutput` (`sticky-server.ts:125-128,175-178`) |
| A9 | `list_peers` peer strings sanitized | **No at RPC** | Returns `client.peers` raw (`sticky-server.ts:112-121`). CLI uses `formatPeerLabel` → `sanitizePeerName`. Desktop must escape/sanitize — **L-21** |
| A10 | `GET /health` auth | Unauthenticated | Returns `{ok:true}` only — Low info; **L-23** |
| A11 | Out-of-scope honesty (CRDT, embed, PTY, cloud) | **Yes** | PLAN out table clear |
| A12 | Acceptance #3 board vs A3 | **Conflict** | Acceptance requires board show = CLI; no sticky board path — **M-18** |

### Findings

| Sev | ID | Finding | Suggested change |
|-----|-----|---------|------------------|
| **Med** | **M-18** | **Board is not on sticky RPC**, but PLAN v1 lists Board views and acceptance #3 (“Board show matches CLI”). Territory: board is **room-scoped local JSON** (`loadTaskBoard` / MCP tools), not host IPC. Implementing “via sticky only” cannot meet acceptance without either (a) adding sticky `list_tasks` / `board_*` ops that call the same host helpers, or (b) desktop reads board files with **same session/cwd rules as CLI** (document dual path), or (c) **drop Board from 0.11.0 v1** (Status/Peers/Inbox only). The phrase “if RPC covers” is a weasel — must pick one. | PLAN 0.11.1 PATCH: explicit **Board path** option A/B/C; adjust Views + Acceptance. Prefer **A** (sticky board ops, F-3 serialize) for single security boundary, or **C** for thinner v1. |
| **Med** | **M-19** | **Desktop→sticky transport and session binding unspecified.** (1) Sticky has no CORS — webview `fetch` is a footgun; must use **Tauri Rust command** (or sidecar) doing HTTP to 127.0.0.1 with Bearer. (2) Which `*.host.json`? Default session vs `--profile` / `LOOM_SESSION` must be defined (env at launch, settings file, or UI picker). Wrong meta → wrong room or “host not running” false negatives. | PLAN: lock **Rust-side RPC only** (no webview fetch to sticky). Document session resolution order: `LOOM_SESSION` → `LOOM_PROFILE` → default `~/.loom/session.json` meta path. |
| Low | **L-21** | `list_peers` returns unsanitized `displayName` (and related peer fields). Safe on CLI via format helpers; **desktop XSS** if `innerHTML` / unescaped text. | UI: text nodes / escape HTML; optional sticky-side sanitize later. |
| Low | **L-22** | UNKNOWNS 0.11.0 still stub (unknown unknowns empty). WORKFLOW §3.5 marks MINOR unknowns as required/recommended before R{n}. | Fill blindspot before implement (not a code blocker). |
| Low | **L-23** | `GET /health` without Bearer on loopback. Low impact. | Document as intentional or require Bearer for consistency. |

### Decision notes

**방향은 맞다.** sticky IPC 재사용, 두 번째 join 금지, loopback, sanitize inbox, out-of-scope 표 — 시리즈 관례와 잘 맞는다. 툴체인 블로커도 해소됐다.

막히는 것은 구현 디테일이 아니라 **계획의 빈 칸 두 개**:

1. **Board** — 약속은 있는데 영토에 파이프가 없음 (M-18).  
2. **어떻게 sticky에 붙고 어떤 세션인지** — CORS/프로필 (M-19).

이 두 가지를 구현 중 “보수적으로 알아서” 하면 Deviations 폭탄 + XSS/오접속 위험이 생긴다. **PATCH로 PLAN을 고정한 뒤** 스캐폴드.

**승인 조건:** `docs/PLAN.md` → **0.11.1** (PATCH) 최소:

- M-18: Board = A sticky ops | B file read same as CLI | C out of v1  
- M-19: Rust invoke-only RPC + session/meta resolution order  

L-21–L-23은 backlog 허용. 재리뷰 전체 불필요 — PATCH 확인 후 author-close `approved` 가능 (0.8.1/0.10.1 패턴).

**관련 파일 (영토):**  
`packages/host/src/sticky-rpc.ts`, `sticky-server.ts`, `sticky-meta.ts`, `sticky-client.ts`, `task-board.ts`, `packages/mcp-server/src/tools.ts`, `docs/PLAN.md` 0.11.0, `docs/UNKNOWNS.md`

---

## Review R12 — Plan v0.10.0 (dual-compat drop)

**검토 대상:** `docs/PLAN.md` **v0.10.0** — drop FABLE_* env dual-read + `/fable` slash dual-accept  
**검토자:** Fable 5 — 코드 직접 확인 (Read/Grep; 셸 실행 불가 → `bun test`는 정적 검증으로 대체)  
**날짜:** 2026-07-09  
**결론:** **`pending-revision`** → **0.10.1 applied / approved** (M-17 + L-17/L-18/L-20)

> **Checklist below is a snapshot of code as of 0.10.0 review.** Post-fix state is in **R12 follow-up (0.10.1)**.

### Checklist (as-reviewed @ 0.10.0)

**Part A — 밀린 0.9.1 M-14/M-15/M-16 소급 검증**

| # | Item | 검증 | 근거 |
|---|------|------|------|
| A1 | M-14: `relay-daemon` / mcp config → `loomDir()` | **Yes** | as-reviewed @ 0.10.0 |
| A2 | M-15: sticky-spawn `LOOM_*` only | **Yes(현행)** | as-reviewed @ 0.10.0 |
| A3 | M-16: live-PID + FABLE- join tests | **Yes** | as-reviewed @ 0.10.0 |
| A4 | `LOOM_TEST_HOME` + cache reset | **Yes** | as-reviewed @ 0.10.0 |

**Part B — dual-compat 제거**

| # | Item | 검증 |
|---|------|------|
| B5–B10 | env warn/read, insecure, slash, keep-4, tests | See original detail in git `5a5b356` / pre-hygiene; M-17 was the Med |
| B11–B14 | sanitize / timing-safe / M-7 / no new hardcode | **Yes** @ review |

### Findings (R12)

| Sev | ID | Finding | Outcome |
|-----|-----|---------|---------|
| **Med** | **M-17** | FABLE_* relay URL/host/port silent local fallback | **Fixed 0.10.1** |
| Low | L-17–L-20 | warn test, legacy board test, branding residual, token-in-query | L-17/18/20 done; **L-19 closed residual** |

### R12 follow-up (0.10.1 — applied)

| Finding | 처리 |
|---------|------|
| **M-17** | `envRelay*` wiring in resolveRelayEndpoint / relay cli / loom relay |
| **L-17** | env warn spy test |
| **L-18** | legacy `fable-board-snapshot` test |
| **L-20** | `envTokenInQuery()` |
| **L-19** | **closed (won't-fix residual)** — intentional legacy only |
| PLAN | **v0.10.1** `approved` |
| Tests | `bun test` **134 pass** (at ship) |

---

## How to add a new review

1. Bump `docs/PLAN.md` Version / Status = `pending-review`.  
2. Append `## Review R{N} — Plan vX.Y.Z` **here** (archive old full text if file grows).  
3. Update **Active review**, **Open**, **Review index**, header **최신**.  
4. On approve: PLAN Status `approved`; move closed findings to Recent follow-ups.  
5. Prefer active file **≲250 lines** of historical bodies — move older `## Review R*` to `plan_review_archive.md`.  
6. MINOR: note WORKFLOW §3.5 / `docs/UNKNOWNS.md` in pre-check.
