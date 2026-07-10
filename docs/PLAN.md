# Loom — Multiplayer AI Terminal (Mosaic-class)

| Field | Value |
|-------|--------|
| **Document** | `docs/PLAN.md` |
| **Version** | **0.13.5** |
| **Status** | **`approved` (author-close, R14 Low)** — L-26/L-27 closed |
| **Supersedes** | 0.13.4 |
| **Last updated** | 2026-07-10 |
| **Approval** | R14 **approved**; Low L-26/L-27 **implemented** (author-close PATCH; no re-R{n}). |
| **Fable 5 when** | See **`docs/WORKFLOW.md` §5.0–5.1**. Next required: **P2 durable inbox** MINOR. |
| **Priorities** | [`docs/PRIORITIES.md`](./PRIORITIES.md) |
| **Canonical path** | `docs/PLAN.md` (repo). Session copy is non-authoritative. |
| **Related** | `docs/WORKFLOW.md` (작업 규칙·§3.5 Unknowns), `docs/UNKNOWNS.md`, `docs/plan_review.md`, `docs/ARCHITECTURE.md`, `docs/PROTOCOL.md` |
| **Naming** | **Loom** = product. **Fable 5 / fable-advisor** = review agent (not the product). |
| **Workflow** | 구현·리뷰·ship 절차 → **[`docs/WORKFLOW.md`](./WORKFLOW.md)** |

---

## Version control (계획 버전 관리)

이 파일이 **제품 계획의 단일 원본(SSOT)** 이다. 구현·리뷰·승인 게이트는 아래 규칙을 따른다.

### 버전 번호 (SemVer 유사)

| 자리 | 의미 | 예 |
|------|------|-----|
| **MAJOR** (`1.0.0`) | 제품 방향·성공 정의 변경, 이전 계획과 양립 불가 | 멀티휴먼 포기 등 |
| **MINOR** (`0.2.0`) | 아키텍처 전제·수신 모델·페이즈 범위 변경 (리뷰 재요청) | MCP push 폐기, 큐 모드 기본 |
| **PATCH** (`0.2.1`) | 완료 기준 보강, 보안 범위 명확화, 일정·경로 (재리뷰 선택) | R2 H-1/M-1 → M1.1 |

### 상태 값

| Status | 의미 |
|--------|------|
| `draft` | 작성 중 |
| `pending-review` | 리뷰 요청 가능 / 대기 |
| `approved` | 이 버전 기준 구현 진행 허용 |
| `superseded` | 상위 버전에 대체됨 |
| `on-hold` | 블로커로 의도적 중단 |

### 변경 시 필수 절차

1. 상단 **Version** 올리고 **Status**를 `draft` 또는 `pending-review`로 둔다.
2. 아래 **Changelog**에 항목을 추가한다 (What / Why / Review impact).
3. 재리뷰가 필요하면 Status = `pending-review`, 리뷰어는 `docs/plan_review.md`에 **대상 버전**을 명시해 결과를 남긴다.
4. 승인 시 Status = `approved`, Changelog에 `Approved by …` 한 줄 추가.
5. 구현은 **approved 버전만** 기준으로 한다. 코드가 앞서 나가면 다음 PATCH/MINOR에 “Implemented as of …”로 동기화한다.

### Changelog

#### 0.13.5 — 2026-07-10 (`approved` — **author-close**, R14 Low L-26/L-27)

**Why:** Owner chose Low backlog before P2; close R14 residuals.

| What | Why |
|------|-----|
| **L-26** desktop `load_live_meta` F-2 room/peer match | parity with CLI `resolveLiveHostMeta` |
| UI CTA `session_mismatch` | clear host restart guidance |
| **L-27** pack embed open `O_NOFOLLOW` + fd read + re-check | reduce check→read TOCTOU |
| VERSION **0.13.5** | PATCH Low |

**Review impact:** R14 said Low may author-close; no re-R{n} required.

#### 0.13.4 — 2026-07-10 (`superseded` by 0.13.5; was `approved` — **R14** cumulative trust)

**Why:** Owner chose **P1-B** — external R{n} over author-close series 0.11–0.13.3.

| What | Why |
|------|-----|
| R14 code review (sticky / pack embed / claim / XSS / requestId / install DX) | Trust gate before next MINOR |
| `docs/plan_review.md` R14 | Findings L-26, L-27 Low only |
| PRIORITIES P1 → done | Next = P2 durable inbox |
| No CLI feature change | Review/docs PATCH only |

**Review impact:** R14 **approved**. No blocking fixes required.

#### 0.13.3 — 2026-07-10 (`superseded` by 0.13.4; was `approved` — **author-close**, P0 install DX)

**Why:** Short-term priorities doc + make `loom` easy to run without guessing PATH.

| What | Why |
|------|-----|
| `docs/PRIORITIES.md` | P0=install DX, P1=trust, P2=durable inbox, P3=big features |
| `scripts/loom` | Repo-local wrapper (`PATH=…/scripts`) |
| `bun run link:loom` / `unlink:loom` | Bun global bin for `loom` |
| README / USER_GUIDE install options A/B/C | Dogfood friction |
| VERSION **0.13.3** | PATCH DX |

#### 0.13.2 — 2026-07-10 (`superseded` by 0.13.3; was `approved` — **author-close**, dogfood UX)

**Why:** Real-use dogfood fixes after Owner request.

| What | Why |
|------|-----|
| `renderInbox` resolves fromPeerId → displayName + attachment count | List showed raw `p_…` only; pack embed invisible until accept |
| inbox accept loads peers for `formatIncomingHandoff` from-name | Same dogfood pain |
| Share/Next tips: `bun run loom …` + PATH note | `loom: command not found` after create |
| host stop tip when no host: same `--profile` | Stop without profile looked broken |
| VERSION **0.13.2** | PATCH dogfood |

#### 0.13.1 — 2026-07-10 (`superseded` by 0.13.2; was `approved` — **author-close**, Low backlog)

**Why:** Close backlog **L-4 residual** — wire-level `requestId` on RPC request/reply (beyond FIFO waiters).

| What | Why |
|------|-----|
| Client messages optional `requestId` | Correlation token |
| Reply envelopes optional `requestId` (BaseEnvelope) | Relay echo |
| `RelayServer.reply` echoes id on create/join/handoff/list_*/claim errors | End-to-end match |
| `RelayClient.requestOnce` always sends id; match by id when present | Concurrent same-type RPCs |
| FIFO type-match remains if reply has no id | Backward compatible with older relays |
| VERSION **0.13.1** | PATCH: protocol optional field |

**Approval provenance (honest):**

| | |
|--|--|
| **When** | 2026-07-10 (commit `676d4f3`, ~11:01 +0900) |
| **Who** | Plan author / implementer (agent session under Owner “다음 진행해”) — **not** Reviewer Fable 5, **not** explicit Owner approve |
| **How** | Author-close after Low backlog implement; declared “no re-review required” |
| **Not** | R14 / formal review sign-off / Owner decision log row |

Git author on machine: local `skywk` account (agent commit via that identity).

#### 0.13.0 — 2026-07-10 (`superseded` by 0.13.1; was `approved`)

**Why:** Close backlog **L-5** with **opt-in** pack file-body embed — re-resolve allowlist at **send/read** time (TOCTOU).

| What | Why |
|------|-----|
| `packToAttachments({ embedFiles })` + `embedPackFileBodies` | L-5: re-check path under cwd allow root before read |
| CLI `--with-pack-embed` (implies pack attach) | Explicit opt-in; default paths-only unchanged |
| MCP `withPackEmbed` | Agent parity |
| Caps: 8 files, 64k chars/file, skip binary/dirs/oversized | Keep handoffs bounded |
| Host tips use `bun run loom host …` | UX (PATH without global bin) |
| VERSION **0.13.0** | MINOR: new attach surface |

Default `--with-pack` still **paths/notes only**. Receivers treat path attachments as metadata (not auto-open FS).

No full re-review required (Low backlog L-5; security-conservative caps + re-resolve).

#### 0.12.2 — 2026-07-10 (`superseded` by 0.13.0; was `approved`)

**Why:** Desktop can **send** handoffs/chat (not only receive); show invite code for share.

| What | Why |
|------|-----|
| sticky `handoff` / `chat` via desktop invoke | Complete human loop without CLI |
| Send tab: to peer / `*` / modes message\|task\|chat | Sticky RPC already supported |
| Status: invite code + `loom room join …` hint | Share without leaving app |
| `smoke:desktop` covers handoff + chat | Regression |
| VERSION **0.12.2** | Parity |

No re-review (uses existing sticky ops; M-19/M-20 unchanged).

#### 0.12.1 — 2026-07-10 (`superseded` by 0.12.2; was `approved`)

**Why:** GUI polish after 0.12.0 dogfood; keep external pitch honest.

| What | Why |
|------|-----|
| Desktop: auto-refresh 5s, R key, last-updated, tab badges | Scanability / less manual refresh |
| Inbox: resolve fromPeerId → displayName via peers map | UX |
| Board: group tasks by status | Scanability |
| `docs/PITCH.md` → v0.12.0 (Board shipped, smoke) | Pitch was stale (said Board deferred) |
| CLI / desktop VERSION **0.12.1** | Parity |

No re-review (UX + docs honesty only).

#### 0.12.0 — 2026-07-10 (`superseded` by 0.12.1; was `approved`)

**Why:** Close M-18 deferral with **option A** — board via sticky host RPC + desktop Board tab. Dogfood sticky path automated.

| What | Why |
|------|-----|
| sticky `list_tasks` / `add_task` / `update_task` | Same local board file as CLI/MCP; F-3 serialized |
| Desktop Board tab + add/status update | Product surface; textContent-only (M-20) |
| `bun run smoke:desktop` | Headless dogfood (status/peers/inbox/board/401) |
| CLI / desktop VERSION **0.12.0** | Parity |

Security: titles/notes sanitized on sticky out; no token to webview; no new bind.

No re-review required beyond R13 locks (Board path A was listed option; XSS/transport unchanged).

#### 0.11.2 — 2026-07-09 (`superseded` by 0.12.0; was `approved`)

**Why:** Implement M4.3b thin **Tauri desktop shell** per **0.11.1** locks.

| What | Why |
|------|-----|
| `apps/desktop` Tauri 2 + static `ui/` | Product desktop surface |
| Rust sticky client (`sticky.rs`) + invoke commands | M-19: no webview fetch/token |
| Views: Status / Peers / Inbox (claim/accept) | Sticky RPC surface |
| Host CTAs: none / stale_pid / unauthorized / refused | L-25 |
| textContent-only UI (`app.js` setText) | M-20 |
| No Board UI | M-18 C |
| `bun run desktop` / `cargo test` in src-tauri | Dev path |
| CLI / MCP VERSION **0.11.2** | PLAN parity |

**Implemented as of 0.11.2.** No re-review (implements approved 0.11.1).

#### 0.11.1 — 2026-07-09 (`superseded` by 0.11.2; was `approved`)

**Why:** R13 **pending-revision** close — lock M-18 / M-19 / M-20 before any `apps/desktop` code.

| Finding | Decision (locked) |
|---------|-------------------|
| **M-18** | **Option C** — **Board out of v1** shell. Views = Status / Peers / Inbox only. Board UI deferred (needs sticky board ops or explicit file path later). |
| **M-19** | **Rust-side sticky RPC only** — Tauri `invoke` → Rust HTTP to `127.0.0.1` + Bearer. **No** webview `fetch` to sticky. **No** CORS on sticky required. |
| **M-19** session | Resolve session file: `LOOM_SESSION` → profile via `LOOM_PROFILE` / `~/.loom/profiles/<name>.json` → default `~/.loom/session.json`. Meta = that path’s `*.host.json`. |
| **M-19** / **L-24** token | Token + raw `*.host.json` **Rust only**. Webview never receives token or meta file contents; only invoke results (peers/inbox/status DTOs). |
| **M-20** | Peer strings: **textContent / text binding only** — **no `innerHTML`**. `@loom/protocol` sanitize is **terminal ESC**, not HTML escape — do not treat sanitize as XSS fix. |
| **L-25** | Acceptance host-absent cases split (below). |
| L-22 | UNKNOWNS 0.11 filled from R13. |
| L-23 | `GET /health` unauthenticated on loopback — **accepted** (ok:true only). |

No re-review required (R13 said PATCH then author-close). **Implement next** under this approved plan.

##### Scope (v1 shell — **in**) — supersedes 0.11.0 tables

| What | Why |
|------|-----|
| `apps/desktop` Tauri **2** (Rust + web UI) | Product desktop surface |
| Data via **sticky host** loopback `POST /rpc` only | No second WS join; reuse F-3 |
| Transport: **Rust invoke → HTTP** (not webview fetch) | M-19; no sticky CORS |
| Views: **Status**, **Peers**, **Inbox** (list / claim / accept) | Sticky RPC already covers |
| Host required: CTA if missing / stale / unauthorized | L-25 |
| Peer UI: textContent-only; optional terminal sanitize for ESC | M-20 |
| Loopback sticky only; CSP default-deny | H-5 / XSS surface |
| Dev: `bun run desktop` / `cargo tauri dev` | Contributors |

##### Explicitly **out** of 0.11.1 v1

| Out | Why |
|-----|-----|
| **Board UI / board sticky ops** | M-18 **C** — defer |
| Live multi-writer board CRDT | Later |
| Pack file-body embed (L-5) | Paths-only |
| Agent TUI embed / PTY inject | Spike no-go |
| Cloud relay / accounts | Local-first |
| Webview holding host token or calling sticky HTTP | M-19 / L-24 |

##### Architecture sketch (locked)

```
[ Tauri webview ]  ──invoke only──►  [ Rust commands ]
                                        │ read *.host.json (token never to JS)
                                        │ HTTP POST 127.0.0.1:<port>/rpc + Bearer
                                        ▼
                                 [ loom sticky host ] ──WS──► [ relay ]
```

##### Security checklist (locked)

| Topic | Rule |
|-------|------|
| Host token | Rust-only; 0600 meta; never log; never to webview |
| Bind | Sticky loopback; desktop opens no public server |
| XSS | textContent only; sanitize.ts ≠ HTML escape |
| Path attachments | Display only |
| CSP | default-deny; no remote script CDN |

##### Acceptance (v1)

1. Room + `loom host start` → desktop shows peers online/offline.  
2. Inbox list + claim/accept; first-wins vs CLI.  
3. **No Board view** in v1 (M-18 C).  
4. Host problems — distinct CTAs: (a) no meta / host not running → start host; (b) stale pid / dead meta → clear+restart; (c) 401/refused → token/meta mismatch. No crash.  
5. XSS: payload displayName/body containing `<img onerror=…>` renders as **text only** (automated or manual).  
6. `bun test` green; desktop smoke optional separate.

##### Review impact

R13 closed by this PATCH. **Approved by** plan author after R13 required locks (0.8.1/0.10.1 pattern).

#### 0.11.0 — 2026-07-09 (`superseded` by 0.11.1; was `pending-revision`)

**Why:** Phase **M4.3b** draft — thin Tauri shell via sticky RPC.  
**R13:** `pending-revision` (M-18/M-19/M-20) — resolved in **0.11.1**.

Draft scope (Board “if RPC covers”, webview fetch wording) **superseded** — do not implement 0.11.0 tables.

#### 0.10.3 — 2026-07-09 (`superseded` by 0.11.0; was `approved`)

**Why:** Docs honesty + backlog hygiene after dual-compat cutover; unlock next product gate (Tauri) now that Rust toolchain is present.

| What | Why |
|------|-----|
| `docs/ADAPTERS.md` → Loom paths / `loom` CLI / `mcp_servers.loom` | User-facing docs still said `fable` / `.fable` / `FABLE_*` |
| Open follow-ups defaults: bin `loom`, session `~/.loom` | Stale pre-rename defaults |
| plan_review: close optional `fable` bin row; note L-19 residual only intentional legacy | 0.10.2 already removed bins |
| HANDOFF: Tauri unblocked (`cargo`/`rustc` available) | Product next gate was wrongly still “no Rust” |
| CLI / MCP VERSION **0.10.3** | PLAN ↔ runtime string parity |

No re-review required (docs + status honesty only; no runtime surface change beyond version string).

#### 0.10.2 — 2026-07-09 (`superseded` by 0.10.3; was `approved`)

**Why:** Complete dual-compat cutover for **CLI entrypoints** — remove transitional `fable` / `fable-mcp` bins.

| What | Why |
|------|-----|
| `@loom/cli` bin: `loom` only | Product surface is Loom |
| `@loom/mcp-server` bin: `loom-mcp` only | Same |
| Root script `fable` removed | Use `bun run loom` |
| **Still keep:** `FABLE-` invites, `fable-board-snapshot` import, MCP strip of legacy fable tables | On-disk/wire data compat |

No re-review required (documented Owner optional after R12; Low surface break for alias only).

#### 0.10.1 — 2026-07-09 (`superseded` by 0.10.2; was `approved`)

**Why:** R12 **M-17** — wire relay URL/host/port/token through `envLoom` so FABLE_* warns; Codex session-entry.

| What | Why |
|------|-----|
| `resolveRelayEndpoint` / relay cli / `loom relay` use `envRelay*` | M-17 no silent local fallback without warn |
| `envTokenInQuery` for relay-client | L-20 pattern |
| L-17 warn test + L-18 legacy board snapshot test | R12 Low |
| `AGENTS.md` Codex ritual + `bun run status` | Codex/Claude session entry |

#### 0.10.0 — 2026-07-09 (`superseded` by 0.10.1; was `pending-review` → R12 `pending-revision`)

**Why:** Drop **runtime dual-compat** for rename transition (RENAME Phase E / 0.10).

| What | Why |
|------|-----|
| Env: **LOOM_* only** (FABLE_* warns, not read) | End dual-read window |
| Slash: **/loom only** (`/fable` → help / no dual-accept) | Product CLI surface |
| sticky-spawn: LOOM_SESSION/PROFILE only | Match write-path policy |
| Relay token/host/port: LOOM only | Same |
| **Keep:** `FABLE-` invite join, `fable-board-snapshot` import, MCP strip of legacy fable tables, `fable` bin alias | Data/tooling compat (conservative) |

**Implemented as of 0.10.0.** Awaiting **R12**.

**Not in 0.10.0:** remove `fable` bin; remove legacy invite/board accept; L-5 embed; Tauri.

#### 0.9.4 — 2026-07-09 (`superseded` by 0.10.0; was `approved`)

**Why:** Backlog **L-4** — concurrent `requestOnce` stole acks by replacing `onEnvelope`.

| What | Why |
|------|-----|
| FIFO `pendingRequests` queue on RelayClient | Concurrent handoffs each get an ack |
| Do not hijack `opts.onEnvelope` | User listen handlers always see envelopes |
| claim_result match prefers handoff id | Concurrent claims less ambiguous |
| Reject pending on close/leave | No hung promises |
| Integration test concurrent handoffs | L-4 regression guard |

**Not in 0.9.4:** wire-level `requestId` correlation (optional later if multi-multiplex needs it). Sticky RPC serialization (F-3) remains.

No re-review required (Low backlog PATCH; conservative client-only fix).

#### 0.9.3 — 2026-07-09 (`superseded` by 0.9.4; was `approved`)

**Why:** Backlog **L-14** / **L-16** (R10 Low).

| What | Why |
|------|-----|
| `timingSafeStringEqual` / `timingSafeTokenEqual` in `@loom/protocol` | Single compare impl for relay token + peer secret (L-14) |
| room/server/sticky import shared util | No divergent copy drift |
| Attachment/body caps documented as **chars** (JS string length), not bytes | L-16 honesty |

No re-review required (Low backlog PATCH).

#### 0.9.2 — 2026-07-09 (`superseded` by 0.9.3; was `approved`)

**Why:** R11 Low residual — product-facing “Fable” strings, MCP WARNING scope, legacy INSECURE env warn.

| What | Why |
|------|-----|
| User-facing CLI/adapter/sticky tips → `loom` | Branding consistency |
| `isManagedComment` scoped WARNING to mcp_servers only | Avoid deleting unrelated comments |
| Warn if only `FABLE_RELAY_INSECURE_OPEN` set | RENAME §4.1 UX; still no dual-read open |
| MCP serverInfo version 0.9.2 | Stale 0.7.3 cleanup |

No re-review required (Low residual PATCH).

#### 0.9.1 — 2026-07-09 (`superseded` by 0.9.2; was `approved`)

**Why:** R11 **pending-revision** — M-14 migration bypass, M-15 sticky env, M-16 missing tests.

| What | Why |
|------|-----|
| `relay-daemon` / `mcp-server` config use `loomDir()` | M-14: no hardcode `~/.loom` that orphans `~/.fable` under live-PID gate |
| sticky-spawn writes `LOOM_SESSION`/`LOOM_PROFILE` (+ FABLE dual) | M-15 write-path LOOM_* |
| Tests: live-PID gate + `FABLE-` full-code join (no rewrite) | M-16 RN1 Phase D |
| `LOOM_TEST_HOME` + `resetStateHomeDirCache` | testable migration |

**Approved by:** plan author after R11 M-14/15/16 fix (rename baseline).

#### 0.9.0 — 2026-07-09 (`superseded` by 0.9.1; was `pending-review` → R11 `pending-revision`)

**Why:** Product rename **Fable → Loom** (disambiguate review agent fable-advisor / Fable 5). Plan: `docs/RENAME_TO_LOOM.md` (RN1-patched).

| What | Why |
|------|-----|
| CLI `loom`, packages `@loom/*`, env `LOOM_*`, `~/.loom` | Public identity |
| Dual-read most `FABLE_*` (not `INSECURE_OPEN`) | Compat without H-5 regression |
| Home migrate with live-PID gate | No sticky/relay split-brain |
| Invite mint `LOOM-`; join exact full code (no prefix rewrite) | No room collision |
| MCP `mcp_servers.loom` + exact-anchor dual-strip | H-4 + no bare “loom” wipe |
| Slash `/loom` + `/fable`; `[LOOM HANDOFF]`; loom system hint | User/agent surfaces |
| `fable` bin alias 1 minor | Transition |

**Implemented as of 0.9.0** (code + tests 116 pass). Awaiting **R11**.

#### 0.8.1 — 2026-07-09 (`approved`)

**Why:** R10 **pending-revision** — M-13 silent join failure on `fable run`; L-15 sticky peerSecret persist.

| What | Why |
|------|-----|
| `fable run` checks `joinRoom` result; exit 1 on `error` | Do not spawn agent off-room (M-13) |
| run/listen/sticky `onError` → stderr | Reconnect `peer_auth_failed` not silent |
| run `onEnvelope` handles `error` | Live error envelopes visible |
| sticky (+ run) save `peerSecret` from `room.state` | L-15 parity with room-ops |
| `RelayClient.setReconnectPeerSecret` | Keep auto-reconnect creds in sync |

**Approved by:** plan author after R10 M-13/L-15 fix (re-review of M-7 core not required per R10).

L-14 (shared timing-safe util), L-16 (KB vs chars) remain backlog.

#### 0.8.0 — 2026-07-09 (`superseded` by 0.8.1; was `pending-review` → R10 `pending-revision`)

**Why:** R5/R9 backlog **M-7** — token + invite alone must not allow taking over another peer’s roster identity / inbox.

| What | Why |
|------|-----|
| Relay mints `peerSecret` (base64url 24B) on first join/create | Unforgeable rejoin proof bound to `peer.id` |
| Rejoin with existing `peer.id` requires matching `peer.secret` (timing-safe) | Blocks identity takeover by invite+token holders |
| `room.state.peerSecret` only to the joining socket (never roster broadcast) | Secret not leaked to other peers |
| Session stores `peerSecret` (mode **0600**); sticky/CLI reconnect sends it | Survive disconnect / sticky host restart |
| Error `peer_auth_failed` on mismatch / missing secret | Explicit failure mode |
| Threat model updated in `apps/relay-cloud/README.md` + PROTOCOL | Operators know residual risk |

**Implemented as of 0.8.0** (code + tests). Awaiting **R10** review.

**Not in 0.8.0:** rotating secrets; mTLS/JWT peer certs; secret recovery if session file lost (must rejoin as **new** peer id).

#### 0.7.3 — 2026-07-09 (`superseded` by 0.8.0; was `approved`)

**Why:** R9 L-12 backlog — safer file locks for board/pack concurrent updates.

| What | Why |
|------|-----|
| Lock `owner.pid` — only reclaim if owner **dead** and lock **stale** | Two waiters must not rmdir a live lock |
| Release only if pid matches (or force reclaim dead) | Accidental unlock of peer process |
| `sleepMs` via `Bun.sleepSync` / `Atomics.wait` | No busy-spin CPU burn |

Re-review not required (Low backlog PATCH).

#### 0.7.2 — 2026-07-09 (`superseded` by 0.7.3)

**Why:** R9 L-11 backlog — bound relay memory for large handoff attachments / board snapshots.

| What | Why |
|------|-----|
| Attachment content max **256_000 chars** (JS length, not bytes), max **32** attachments, body max **100_000 chars** | DoS / memory (L-11; units clarified L-16) |
| Inbox max **100** entries/peer with trim | Bound growth |
| Claim/accept **deletes** entry (no permanent claimed retention) | Repeated `--with-board` cannot pin memory |

Re-review not required (Low backlog PATCH).

#### 0.7.1 — 2026-07-09 (`superseded` by 0.7.2; Phase 4.3a baseline)

**Why:** R9 `pending-revision` — board snapshot trust boundary.

| What | Why |
|------|-----|
| **M-10:** ISO timestamp + clamp to now in `normalizeTimestamp` | peer spoofed `updatedAt` cannot dominate merge |
| **M-11:** always `parseBoardSnapshot` (no kind cast shortcut) | malformed tasks crash |
| **M-12:** `resolveHandoffEntryIndex` for import-handoff | M-8 regression |
| **L-9:** foreign `sourceRoomId` requires `--force` | accidental cross-room merge |
| **L-10/L-13:** sanitize timestamps/names; format who/id/mode | peer-controlled strings |

**Merge trust model:** after clamp, higher `updatedAt` wins; spoofed future times become import-time.

#### 0.7.0 — 2026-07-09 (`superseded` — R9 pending-revision)

**Why:** Phase 4.3a — multi-machine board **share** without live relay sync (Tauri deferred: no Rust toolchain in env).

| What | Why |
|------|-----|
| `fable board export` / `import` (merge\|replace) | Portable snapshot JSON |
| `handoff --with-board` + MCP `withBoard` | Attach `fable-board-snapshot` attachment |
| `fable board import-handoff <ho_id>` | Apply snapshot from inbox |
| MCP `export_board` / `import_board` | Agent-side portability |
| Honest scope: **not** live multi-writer remote board | Avoid false "synced" claims |

**R9:** M-10/M-11/M-12 → **0.7.1**.

**Not in 0.7.0:** relay-persisted board CRDT, Tauri UI, auto-merge conflicts UI.

#### 0.6.1 — 2026-07-09 (`superseded` by 0.7.0; Phase 4.2 baseline)

**Why:** R8 `pending-revision` — task board integrity + handoff id sanitize.

| What | Why |
|------|-----|
| **H-7:** `writeAtomicJson` + `withFileLock` + corrupt backup (board **and** pack) | Concurrent agents must not wipe board |
| **M-8:** task id exact/suffix only; empty/ambiguous error | Silent wrong-task updates |
| **M-9:** relay always generates handoff id; sanitize id/from/mode on output | Peer-controlled string invariant |
| L-6 id format on normalize; L-7 `clear-done --yes`; L-8 Security docs | R8 Lows |

#### 0.6.0 — 2026-07-09 (`superseded` — R8 pending-revision)

**Why:** Phase 4.2 task board — track work without leaving the multiplayer room workflow.

| What | Why |
|------|-----|
| Local room-scoped board (`~/.fable/boards/<hash(roomId)>.json`, 0600) | Same model as context pack (UID+room shared) |
| Statuses: todo / doing / done / blocked / cancelled | Minimal kanban |
| `fable board show\|add\|set\|assign\|note\|rm\|clear-done` | Human CLI |
| MCP `list_tasks` / `add_task` / `update_task` | Agent tooling |
| `handoff --board` or `mode=task` → create linked task | Handoff ↔ board |
| Optional `handoffId` on tasks | Traceability (no referential integrity after relay restart) |

**R8:** H-7 concurrent write, M-8 id match, M-9 handoff id → **0.6.1**.

**Not in 0.6.0:** relay-synced board, multi-machine live board, Tauri UI, dependency graph.

#### 0.5.1 — 2026-07-09 (`superseded` by 0.6.0; Phase 4.1 baseline)

**Why:** R7 Low follow-ups (L-1–L-3); re-review not required.

| What | Why |
|------|-----|
| **L-1:** document room-scoped pack sharing (same UID + roomId) | Intentional; not profile-isolated |
| **L-2:** symlink→outside-cwd rejection test | Regression guard for allowlist |
| **L-3:** path attachment label prefix `context-pack-path:`; hint sender-relative warning | Receiver identification + trust |
| Security invariant: receivers never fs-open pack paths | Display/metadata only until v2 redesign |
| Review docs: `plan_review_archive.md` for R1–R6 | Structure debt |

**Deferred:** L-4 requestOnce correlation id; L-5 v2 embed TOCTOU re-resolve.

#### 0.5.0 — 2026-07-09 (`superseded` by 0.5.1; R7 **approved**)

**Why:** Phase 4.1 context pack — portable room context without reimplementing agents.

| What | Why |
|------|-----|
| Local **room-scoped** pack (`~/.fable/packs/<hash(roomId)>.json`, 0600) | summary + cwd-allowlisted paths + notes; **same OS user + same roomId → one pack file (all profiles)** |
| `fable pack show\|set\|add\|remove\|note\|clear` | Human manage pack |
| `handoff --with-pack` / MCP `withPack` | Share pack only on send (attachments) |
| MCP `get_context_pack` | Agents read local pack |
| Path allowlist = cwd realpath | Security (no escape to /etc etc.) |
| No file body embed in v1 | Keep envelopes small; paths only |

**R7:** approved; L-1–L-5 → 0.5.1 / backlog.

**Not in 0.5.0:** relay-shared pack across machines, auto-sync, full file content embed, task board, Tauri.

#### 0.4.1 — 2026-07-09 (`superseded` by 0.5.0; Phase 4.0a baseline)

**Why:** R6 `pending-revision` — sticky host correctness/security PATCH.

| What | Why |
|------|-----|
| **F-2:** `resolveLiveHostMeta` requires meta.roomId/peerId == session; room create/join stops host | 구 room으로 handoff 오배달 방지 |
| **F-3:** sticky `/rpc` handlers serialized (promise chain) | 동시 handoff/claim ack 혼선 방지 |
| **F-1:** sticky Bearer uses `timingSafeTokenEqual` | M-5 회귀 제거 |
| Tests: session mismatch; concurrent RPC | 회귀 가드 |

**Implemented as of 2026-07-09.** Re-review optional (PATCH).

#### 0.4.0 — 2026-07-09 (`superseded` — R6 pending-revision)

**Why:** Phase 4.0a — sticky long-lived host as foundation for context pack / task board.

| What | Why |
|------|-----|
| `fable host start\|stop\|status` | Opt-in daemon holds one WS + auto-reconnect per session |
| Loopback IPC `POST /rpc` + Bearer token in `*.host.json` (0600) | CLI/MCP avoid join→close per call |
| `opsListPeers` / handoff / inbox / claim prefer host, **fallback one-shot** | Backward compatible |
| MCP tools return `via: host\|oneshot` | Observability |
| Integration tests sticky IPC | Regression |

**R6:** F-2 host/session mismatch, F-3 concurrent ack, F-1 timing → **0.4.1**.

**Not in 0.4.0:** context pack, task board, Tauri, force-host mode, M-7 peer ownership.

#### 0.3.1 — 2026-07-09 (`superseded` by 0.4.0 sticky host)

**Why:** R5 `pending-revision` on 0.3.0 — first network exposure must not fail-open; token handling hardened.

| What | Why | Review impact |
|------|-----|----------------|
| **H-5:** non-loopback bind without token → **refuse start** unless `--insecure-open` / `FABLE_RELAY_INSECURE_OPEN` | fail-open 기본값 제거 | Phase 3 done |
| **H-6:** WS **Bearer preferred**; Share hides token unless `--show-token`; session `relayToken` + URL strip; file **0600** | access log / Share 유출 | Phase 3 done |
| **M-5:** `timingSafeTokenEqual` on Bearer + query | 타이밍 누출 완화 | PATCH |
| **M-6:** `setOfflineIfSocket` — stale close ignored after reconnect | 재연결 offline 오판 방지 | PATCH |
| Threat model (M-7 peerId) in `apps/relay-cloud/README.md` | **0.8.0** | done |

**Implemented as of 2026-07-09.** Tests: auth Bearer, H-5 refuse, M-5 equal, M-6 unit, relay-url no-token-in-wsUrl. Re-review optional (PATCH).

#### 0.3.0 — 2026-07-09 (`superseded` — R5 pending-revision)

**Why:** Phase 3 remote multiplayer (skeleton). **Not done for production LAN** until 0.3.1.

| What | Why |
|------|-----|
| `FABLE_RELAY_URL` / `--relay` + `FABLE_RELAY_TOKEN` / `--token` | Multi-machine clients |
| Relay bind `0.0.0.0`, token on WS/HTTP | LAN/cloud host |
| `ensureRelay` remote health check (no auto-spawn) | Don't spawn daemon against remote |
| `RelayClient` auto-reconnect + re-join | listen/run survive brief drops |
| `apps/relay-cloud/README.md` | Deploy notes (TLS terminate at proxy) |
| Auth integration tests | 401 without token; create with token |

**R5:** H-5 fail-open, H-6 token-in-query/Share, M-5 timing, M-6 stale close → **0.3.1**.

**Not in 0.3.0:** durable inbox; mTLS/JWT; peerId ownership (M-7).

#### 0.2.4 — 2026-07-09 (`superseded` by 0.3.0)

**Why:** R4 conditional approve — H-4 legacy TOML duplicate table on `--write-user-config`.

| What | Why |
|------|-----|
| `stripAllFableMcpSections` before upsert | Remove unmarker v0.2.2 `[mcp_servers.fable]` so TOML stays valid |
| Legacy auto-added comments stripped | Migration path for existing ~/.codex and ~/.grok |
| Test: H-4 unmarker block | Regression guard |
| parseArgs boolean allowlist | `--write-user-config codex` no longer swallows agent id |
| usage PLAN version string | Match VERSION 0.2.4 |
| Grok MCP path documented from official user-guide | R4 M-4 format evidence |

**R4:** approved with H-4 PATCH — this version.

#### 0.2.3 — 2026-07-09 (`superseded` by 0.2.4 H-4)

**Why:** R3 `pending-revision` — Phase 2 wiring honesty (M-3 + post-R3 Grok).

| What | Why |
|------|-----|
| Codex/Grok **user-global MCP write = opt-in** (`--write-user-config`) | R3 M-3 무단 append 제거 |
| Managed TOML block + **FABLE_SESSION env** + upsert | multi-profile MCP 세션 바인딩 |
| Gemini removed earlier; Grok same policy as Codex | M-2 obsolete; Grok not re-introduce M-3 |
| `isOnline` unregistered → false | R3 Low bug |
| sanitize bidi/ZW; check/claim re-sanitize | R3 Low |
| Claude ensureMcpConfig returns null (global --mcp-config SSOT) | R3 Low 중복 제거 |
| ADAPTERS matrix: `userConfigWrite: opt-in` | 정직한 표기 |

#### 0.2.2 — 2026-07-09 (`superseded` — Phase 2 wiring incomplete per R3)

**Why:** Phase 2 multi-agent adapter depth after M1.1.

| What | Why |
|------|-----|
| Adapter `capabilities` + `ensureMcpConfig` per CLI | Codex/Grok MCP paths beyond env-only |
| Shared `fableSystemHint` with check/claim | Hetero agents same receive contract |
| `fable run` auto-pick; `agents --matrix` | UX |
| Claude/Codex/Grok project MCP config writers | Practical multi-CLI |
| Hetero handoff unit tests (claude→codex claim) | Phase 2 done criterion without requiring all CLIs installed |
| ADAPTERS.md matrix | Docs |

**Next optional:** Phase 1.5 PTY spike · Phase 3 remote relay

#### 0.2.1 — 2026-07-09 (`superseded` by 0.2.2 implementation notes; still the M1.1 contract baseline)

**Why:** `docs/plan_review.md` **Review R2** (Plan v0.2.0) 조건부 승인 — High/Med finding을 M1.1 완료 기준에 반영. MINOR 재리뷰 불필요 (PATCH).

| What | Why | Review impact |
|------|-----|----------------|
| **H-1:** roster(멤버십)와 live socket **분리**; offline 멤버 대상 handoff **enqueue** | 소켓 close 시 `removePeer`면 수신자 거의 항상 offline → inbox 무의미 | M1.1 필수 |
| **`*` broadcast** inbox 적재 규칙 정의 | offline 포함 전원 queued | M1.1 필수 |
| peers에 **online/offline** 표시 | roster 분리 후 UX | M1.1 |
| **M-1:** `FABLE_SESSION` env 및/또는 `--profile` 로 세션 파일 분리 | 같은 머신 2-peer 시 `~/.fable/session.json` 덮어쓰기 | 데모 전제 |
| sanitize 범위 = **모든 peer-controlled 문자열** (body, chat, displayName, roomName); **allowlist** (인쇄 가능 + `\n\t`) | body만 잡으면 우회 | Security 필수 |
| handoff MCP 반환: `queued` \| `delivered` \| `peer_unknown` (무조건 `ok:true` 금지) | offline enqueue 후 의미 명확화 | Low→M1.1 |
| claim vs `inbox accept`: **first-wins** 상태 전이 | 경합 | Low→M1.1 |
| `handoff.ack` envelope (room.state 재전송 잔재 제거) | server.ts ack 정리 | Low→M1.1 |
| `injectIntoStdin` = **unused / Phase 1.5 only** 표기 | dead path 혼동 방지 | docs |
| Inbox 저장 = **relay 메모리, room 수명** (프로세스 재시작 시 유실 OK for MVP) | 공수 통제 | 명시 |
| leave 명시 시에만 roster 제거; socket close = **offline** | H-1 정책 | M1.1 |

**Approved by:** Fable 5 (R2, conditional) + plan owner acceptance of 0.2.1 PATCH.  
**Next:** 구현 단위 **M1.1** 착수. 완료 후 Changelog에 `Implemented as of …` PATCH 가능.

#### 0.2.0 — 2026-07-09 (`superseded`)

**Why:** R1 보류 사유 반영 (큐 수신, 오버레이 제외, ANSI body, PTY 후순위).  
**Review R2:** `approved` 조건부 → findings는 **0.2.1**에 흡수.

| What | Why | Review impact |
|------|-----|----------------|
| 수신 = 큐 + 알림 + `check_handoffs` | MCP non-push | 재리뷰 필수였음 |
| PTY/오버레이 비목표 | 일정·실현성 | 해소 |
| 버전 관리 도입 | 추적 | 프로세스 |

#### 0.1.0 — 2026-07-09 (`superseded` / R1 **on-hold**)

- PTY 주입·오버레이 가정. R1 보류.

---

## Review resolution

### R1 (v0.1.0 → v0.2.0) — 해소

| # | 지적 | 결정 |
|---|------|------|
| 1 | MCP 송신 전용 / PTY 위험 | 큐 + 폴링 |
| 2 | presence 오버레이 | 비목표 |
| 3 | 얇은 데몬+MCP | 코어 아키텍처 |
| 4 | 일정·속도·ANSI body | 반영 |

### R2 (v0.2.0 → v0.2.1) — 해소 (본 버전)

| Sev | Finding | 0.2.1 반영 |
|-----|---------|------------|
| H-1 | roster/socket 결합, offline handoff 실패 | 분리 + offline enqueue + broadcast 규칙 |
| M-1 | 전역 session.json | `FABLE_SESSION` / `--profile` |
| Med | sanitize body only | peer-controlled 전체 + allowlist |
| Low | handoff 무조건 ok | `queued\|delivered\|peer_unknown` |
| Low | claim/accept 경합 | first-wins |
| Low | room.state ack 잔재 | `handoff.ack` |

---

## Context

Mosaic-class: 여러 사람 + 여러 에이전트 CLI가 Room에서 협업하고 handoff로 작업/메시지를 넘긴다.

**제품 한 줄:** 선호 에이전트 CLI를 유지한 채 Room + presence + **safe handoff inbox**로 연결.

| 결정 | 선택 |
|------|------|
| 협업 범위 | 로컬 → 원격 |
| 배포 | CLI 우선 |
| AI 런타임 | multi-CLI: claude, codex, grok, shell |
| 수신 모델 | **큐 + 알림 + MCP 폴링** (offline enqueue 포함) |
| 포지셔닝 | 속도 (해자 주장 최소화) |

---

## Recommended approach

### 핵심 통찰

1. 에이전트 재구현 안 함.  
2. MCP = 송신·폴링 only.  
3. Handoff는 **roster 기준 inbox**에 쌓임 (live socket 불필요).  
4. PTY 주입 = 선택 (Phase 1.5).

### 아키텍처 (v0.2.1 코어)

```
Agent CLIs ──MCP/CLI──► Fable Host ──WebSocket──► Relay
                              │                      │
                         session profile         roster (members)
                         sanitize all out        sockets (online map)
                         inbox CLI/MCP           per-peer inbox queue
```

- **Roster member:** join 후 명시 `leave` 또는 TTL까지 유지.  
- **Socket close:** member는 남고 `online=false`.  
- **Handoff to offline member:** inbox enqueue, 송신 결과 `queued`.  
- **Online + connected listener:** enqueue + 실시간 notify envelope, 결과 `delivered` (또는 `queued`+notify — 구현 시 하나로 통일, 권장: 항상 inbox 적재 후 online이면 push notify → ack `queued` with `notified: true`).

**권장 ack 의미 (M1.1 고정):**

| Result | 의미 |
|--------|------|
| `queued` | inbox에 적재됨 (offline이거나 online 알림 여부 무관; 최소 보장) |
| `delivered` | 적재 + 현재 online socket에 notify 성공 |
| `peer_unknown` | roster에 대상 없음 |

### 비목표 (MVP)

- pair-programming 공유 커서  
- 에이전트 루프 재구현  
- presence **인라인 오버레이**  
- 기본 경로 PTY stdin 주입 (`injectIntoStdin` unused until 1.5)  
- Windows 1급  
- 데스크톱 스토어  
- inbox disk 영속 (MVP = relay 메모리)

---

## Product surface

### CLI

```bash
# 프로필 (같은 머신 2인 데모 필수)
export FABLE_SESSION=~/.fable/profiles/alice.json
# 또는
fable --profile alice room create --name demo --as alice
fable --profile bob room join FABLE-XXXX --as bob

fable peers                 # id, name, agent, online/offline
fable handoff @alice "…"
fable listen
fable inbox                 # queued list
fable inbox accept <id>     # human accept (first-wins vs claim)
fable run claude
```

### Presence

- 배지 + `fable peers` (color, **online**)  
- listen/run stderr 알림  
- 오버레이 없음  

### Handoff + inbox 상태

```
queued → notified (optional) → accepted | claimed → (done)
         └ first-wins: accept 또는 claim 중 먼저 성공한 쪽만 body 확정
```

| status | 의미 |
|--------|------|
| `queued` | inbox 대기 |
| `notified` | online peer에 push 알림 보냄 (여전히 claim/accept 가능) |
| `accepted` | 사람이 `inbox accept` |
| `claimed` | 에이전트 `claim_handoff` |
| `expired` | (optional) TTL |

### 수신 경로

```
handoff → sanitize → resolve roster targets
       → enqueue each target inbox
       → if online: send notify envelope
       → ack sender: queued | delivered | peer_unknown
```

Agent: `check_handoffs` → `claim_handoff(id)`.  
Human: `fable inbox` → `accept`.

### MCP 도구

| Tool | 설명 |
|------|------|
| `handoff` | 송신; 반환 `{ status, to, id? }` |
| `list_peers` | peers + online |
| `room_chat` | 채팅 (text sanitize) |
| `check_handoffs` | 내 queued/notified 목록 (body preview sanitized) |
| `claim_handoff` | id claim; first-wins |

---

## Security

| 규칙 | 수준 |
|------|------|
| invite code join | 로컬 MVP |
| 모든 **peer-controlled** 문자열 sanitize 후 터미널/도구 응답 | **필수** |
| Allowlist: printable Unicode + `\n` + `\t`; strip ESC/CSI/OSC 등 | **필수** |
| 적용 대상: handoff body, chat text, displayName, roomName, attachment labels, **handoff id/from/mode**, board title/notes/assignee | **필수** |
| 프롬프트 인젝션 배너 | 보조 |
| context pack path: cwd **realpath** allowlist on add | **필수** |
| **Invariant:** receivers must **not** open pack/path attachments as filesystem paths | **필수** (display/metadata only; v2 embed needs redesign) |
| pack file key = roomId (room-scoped; shared across profiles on same UID) | 문서화된 의도 |
| pack leave room on wire only via `--with-pack` / `withPack` | **필수** |
| relay 본문 디스크 로그 | off |

---

## Implementation status & phases

### 완료 (M0 / M1)

| ID | 상태 |
|----|------|
| M0 protocol monorepo | **done** |
| M1-core local room CLI/MCP send | **done** |
| M1-demo human handoff (listen) | **done** (주의: 세션 파일 수동 분리 시에만 안정) |

### M1.1 — **done** (2026-07-09)

**목표:** offline-safe inbox + multi-profile + sanitize + pull tools.

| # | 작업 | 상태 |
|---|------|------|
| 1 | Roster ≠ socket | **done** |
| 2 | Offline enqueue | **done** (E2E verified) |
| 3 | `*` broadcast inbox | **done** (unit tests) |
| 4 | online 플래그 | **done** |
| 5 | `--profile` / `FABLE_SESSION` | **done** |
| 6 | Sanitize allowlist | **done** (tests) |
| 7 | Inbox API (relay memory) | **done** |
| 8 | MCP check/claim + status enum | **done** |
| 9 | CLI inbox / accept | **done** |
| 10 | `handoff.ack` | **done** |
| 11 | Docs | **done** |
| 12 | `injectIntoStdin` unused | **done** |

**Verified demo:** bob handoff @alice while offline → `queued` → alice `inbox` + `accept`.

### Phase 1.5 — PTY spike — **done** (verdict: **no-go** for default inject)

- Harness: `fable spike pty` + `packages/host/src/pty-spike.ts`
- Automated: idle line-reader works; **busy inject buffers → late submit risk**
- `injectIntoStdin` requires `{ experimental: true }`; default path never calls it
- Report: `docs/spikes/PHASE-1.5-PTY.md`
- **Product receive path unchanged:** queue + `check_handoffs` / inbox only
- Manual Claude/Codex/Grok matrix optional; not required to close phase

### Phase 2 — Multi-CLI depth — **done** (0.2.3 wiring fixed)

- Adapter capabilities + `ensureMcpConfig` (claude json, codex/grok toml)
- **Default: project-only MCP**; `--write-user-config` opt-in with session env + managed upsert
- Gemini **removed**; **Grok** added (same opt-in policy as Codex)
- Hetero room tests; `fable agents --matrix` shows `user-cfg`
- Docs: `docs/ADAPTERS.md`

### Phase 3 — Remote relay — **done** (0.3.0 + **0.3.1** security)

- Token-auth relay (`FABLE_RELAY_TOKEN`), bind `0.0.0.0`
- Clients: `--relay` / `FABLE_RELAY_URL` + `--token` (Bearer header preferred)
- Auto-reconnect on `listen` / `run` (M-6 stale-close safe)
- H-5: non-loopback without token refused (`--insecure-open` opt-in only)
- H-6: session `relayToken` separate; Share default no token; file 0600
- TLS: terminate at reverse proxy (`wss://` → local `ws://`)
- Docs: `apps/relay-cloud/README.md`

### Phase 4.0a — Sticky host — **done** (0.4.0 + **0.4.1** R6)

- `fable host start|stop|status` — long-lived `RelayClient` + reconnect
- Loopback RPC for peers / handoff / chat / inbox / claim
- Without host: previous one-shot behavior unchanged
- Meta: `~/.fable/session.host.json` (or profile sibling), mode 0600
- **0.4.1:** session match (F-2), serialized RPC (F-3), timing-safe token (F-1)

### Phase 4.1 — Context pack — **done** (0.5.0 R7 + **0.5.1** Lows)

- Local pack per **roomId** (not per profile): summary, paths (cwd-allowlisted), notes
- Same machine + same room + same OS user → **shared pack file** across `--profile`s (L-1 intentional)
- CLI `fable pack …`; attach via `handoff --with-pack` only
- MCP `get_context_pack` + handoff `withPack`
- Path attachments: `context-pack-path` / `context-pack-path:<label>`; **display only** (never auto-open as FS)
- Uses existing handoff `attachments` (no wire protocol version bump)

### Phase 4.2 — Task board — **done** (0.6.0 + **0.6.1** R8)

- Local board per roomId: tasks with status/assignee/notes/handoffId
- CLI `fable board …`; MCP list/add/update
- Handoff can spawn task (`--board` or `mode=task`)
- Not relay-synced across machines (honest local room-scope)
- **0.6.1:** atomic write+lock; strict task id match; server-only handoff ids

### Phase 4.3a — Board snapshot share — **done** (0.7.0 + **0.7.1** R9)

- Export/import board JSON; attach via handoff `--with-board`
- Import from file or inbox handoff attachment
- Merge by task id (clamped `updatedAt` wins) or replace; foreign room needs `--force`
- **Not** live remote sync — intentional
- **0.7.1:** timestamp clamp, always-parse snapshot, strict handoff id match

### Phase 4+

Tauri UI (requires Rust/cargo); optional live relay board later.

---

## Risk register

| 리스크 | 완화 |
|--------|------|
| offline handoff 유실 | roster+inbox (H-1) |
| 세션 덮어쓰기 | profiles (M-1) |
| ANSI/OSC | allowlist sanitize all peer strings |
| MCP push 환상 | pull only |
| PTY 오염 | default off |
| claim/accept race | first-wins |
| relay restart 유실 inbox | MVP 문서화; later durable |
| 오버레이 일정 | 비목표 |
| **비루프백 무토큰 바인드 (H-5)** | 기동 거부; `--insecure-open` only (0.3.1) |
| **토큰 쿼리/Share/session 유출 (H-6)** | Bearer 우선; Share 기본 숨김; `relayToken` 분리 + 0600 (0.3.1) |
| **stale close → offline 오판 (M-6)** | current-socket 비교 후 setOffline (0.3.1) |
| peerId 클라이언트 제공 (M-7) | **0.8.0** per-peer `peerSecret` rejoin proof; session 0600; residual: lost secret ⇒ new peer id |
| 토큰 보유자 room/rate 남용 | MVP 수용; room GC / rate limit later |
| context pack path escape | cwd realpath allowlist; no body embed v1; symlink test (0.5.1) |
| pack 오공유 (remote) | opt-in `--with-pack` / `withPack` only |
| pack 프로필 간 공유 (local) | **intentional room-scope** — same UID+roomId shares file; document, not a bug |
| pack path attachment 오해석 | rel path + label prefix; agents must not treat as local FS (invariant) |
| requestOnce ack 상관 (L-4) | sticky RPC serialize; correlation id backlog |
| v2 pack embed TOCTOU (L-5) | re-resolve allowlist at read time when embed lands |

---

## Verification

### 자동

- Existing protocol/room/slash tests  
- Sanitize allowlist fixtures  
- Offline enqueue → rejoin → check/claim  
- Broadcast to mixed online/offline  
- Profile isolation (two session files)  
- first-wins claim vs accept  

### 수동 E2E

1. Offline-at-send handoff (M1.1 데모)  
2. Two profiles same machine  
3. ANSI in body/chat/name — no raw ESC on terminal  
4. Online notify path still works with listen  
5. Phase 2+ hetero agents  

---

## Milestone map

| Milestone | 상태 |
|-----------|------|
| M0 | **done** |
| M1 | **done** |
| **M1.1** | **done** (roster/offline inbox, profiles, sanitize, check/claim) |
| M1.5 PTY spike | **done** — default inject **no-go**; see `docs/spikes/PHASE-1.5-PTY.md` |
| M2 multi-CLI depth | **done** (0.2.3 R3 wiring) |
| M3 remote relay | **done** (0.3.1 H-5/H-6/M-5/M-6) |
| **M4.0a sticky host** | **done** (0.4.1 F-1/F-2/F-3) |
| **M4.1 context pack** | **done** (0.5.0 R7 + 0.5.1 L-1–L-3) |
| **M4.2 task board** | **done** (0.6.1 H-7/M-8/M-9) |
| **M4.3a board snapshot share** | **done** (0.7.1 M-10/M-11/M-12) |
| M4.3b Tauri desktop shell | **0.11.2** shell + **0.12.0** Board via sticky |

---

## Open follow-ups (defaults)

| 항목 | 기본값 |
|------|--------|
| bin | `loom` (mcp: `loom-mcp`) |
| port | `7842` |
| session | `~/.loom/session.json` or `~/.loom/profiles/<name>.json` |
| state home | `~/.loom` (migrate from `~/.fable` when no live sticky/relay PID) |
| inbox store | relay memory |
| roster TTL | room process lifetime (MVP) |
| PTY inject | off |
| overlay | never MVP |
| context pack scope | **roomId** (shared across profiles, same UID) |
| context pack attach | opt-in `--with-pack` only |
| task board scope | **roomId** (local file; not multi-machine live) |
| handoffId on tasks | traceability string only — **no** referential integrity after relay restart |
| board snapshot merge | timestamps clamped to now; ISO only; foreign roomId needs force |
| handoff attachment size | max 256_000 **chars** content, 32 attachments, 100 inbox/peer; claim evicts (L-16) |

### Backlog (non-blocking)

| ID | Item |
|----|------|
| L-4 | ~~wire-level `requestId`~~ | **done 0.13.1** (echo + client match; FIFO fallback) |
| L-5 | ~~v2 pack file-body embed~~ | **done 0.13.0** (`--with-pack-embed` / `withPackEmbed`) |
| M4.3b | Tauri desktop shell — **0.11.1 approved**; implement next (Board deferred M-18 C) |

---

## Success definition

- 서로 다른 에이전트/프로필로 Room 참가  
- peers에서 online/offline 확인  
- **상대가 offline이어도** handoff가 inbox에 쌓임  
- 알림 또는 `check_handoffs` / `loom inbox`로 안전 수신  
- sanitize된 출력만 터미널에 표시  
- 원격: **토큰 없이 비루프백 바인드 거부**; 클라이언트는 Bearer(헤더) 우선; Share에 토큰 기본 미포함  
- room context pack 로컬 관리 + opt-in handoff attach; path attachments are **not** auto-opened as FS  


---

## Approval block

| Role | Name | Decision | Date | Version |
|------|------|----------|------|---------|
| Reviewer | Fable 5 | R2 **approved** (conditional → PATCH findings) | 2026-07-09 | 0.2.0 reviewed |
| Reviewer | Fable 5 | R4 **approved** (conditional H-4) | 2026-07-09 | 0.2.3 reviewed |
| Plan author | implementation | **0.2.4** H-4 fixed | 2026-07-09 | **0.2.4** |
| Reviewer | Fable 5 | R5 **pending-revision** (H-5/H-6 block Phase 3 done) | 2026-07-09 | 0.3.0 reviewed |
| Plan author | implementation | **0.3.1** H-5/H-6/M-5/M-6 **implemented** | 2026-07-09 | **0.3.1** |
| Owner | | treat **0.3.1** as Phase 3 baseline | 2026-07-09 | **0.3.1** |
| Plan author | implementation | **0.4.0** sticky host **implemented** | 2026-07-09 | **0.4.0** |
| Reviewer | Fable 5 | R6 **pending-revision** (F-1/F-2/F-3) | 2026-07-09 | 0.4.0 reviewed |
| Plan author | implementation | **0.4.1** F-1/F-2/F-3 **implemented** | 2026-07-09 | **0.4.1** |
| Owner | | treat **0.4.1** as Phase 4.0a baseline | 2026-07-09 | **0.4.1** |
| Plan author | implementation | **0.5.0** context pack **implemented** | 2026-07-09 | **0.5.0** |
| Reviewer | Fable 5 | R7 **approved** (L-1–L-5 → PATCH/backlog) | 2026-07-09 | 0.5.0 reviewed |
| Plan author | implementation | **0.5.1** L-1–L-3 **implemented** | 2026-07-09 | **0.5.1** |
| Owner | | treat **0.5.1** as Phase 4.1 baseline | 2026-07-09 | **0.5.1** |
| Plan author | implementation | **0.6.0** task board **implemented** | 2026-07-09 | **0.6.0** |
| Reviewer | Fable 5 | R8 **pending-revision** (H-7/M-8/M-9) | 2026-07-09 | 0.6.0 reviewed |
| Plan author | implementation | **0.6.1** H-7/M-8/M-9 **implemented** | 2026-07-09 | **0.6.1** |
| Owner | | treat **0.6.1** as Phase 4.2 baseline | 2026-07-09 | **0.6.1** |
| Plan author | implementation | **0.7.0** board snapshot share **implemented** | 2026-07-09 | **0.7.0** |
| Reviewer | Fable 5 | R9 **pending-revision** (M-10/M-11/M-12) | 2026-07-09 | 0.7.0 reviewed |
| Plan author | implementation | **0.7.1** M-10/M-11/M-12 **implemented** | 2026-07-09 | **0.7.1** |
| Owner | | treat **0.7.1** as Phase 4.3a baseline | 2026-07-09 | **0.7.1** |
| Plan author | implementation | **0.7.2** L-11 caps/eviction | 2026-07-09 | **0.7.2** |
| Plan author | implementation | **0.7.3** L-12 lock pid + sleep | 2026-07-09 | **0.7.3** |
| Plan author | implementation | **0.8.0** M-7 peer rejoin secret **implemented** | 2026-07-09 | **0.8.0** |
| Reviewer | Fable 5 | R10 **pending-revision** (M-13; L-14–L-16) | 2026-07-09 | 0.8.0 reviewed |
| Plan author | implementation | **0.8.1** M-13 + L-15 **implemented** | 2026-07-09 | **0.8.1** |
| Owner | | treat **0.8.1** as M-7 baseline (done) | 2026-07-09 | **0.8.1** |
| Plan author | implementation | **0.9.0** Loom rename **implemented** | 2026-07-09 | **0.9.0** |
| Reviewer | Fable 5 | R11 **pending-revision** (M-14/M-15/M-16) | 2026-07-09 | 0.9.0 reviewed |
| Plan author | implementation | **0.9.1** M-14/15/16 **implemented** | 2026-07-09 | **0.9.1** |
| Owner | | treat **0.9.1** as Loom rename baseline | 2026-07-09 | **0.9.1** |
| Plan author | implementation | **0.9.2** R11 Low residual branding | 2026-07-09 | **0.9.2** |
| Plan author | implementation | **0.9.3** L-14 timing-safe share + L-16 chars | 2026-07-09 | **0.9.3** |
| Plan author | implementation | **0.9.4** L-4 requestOnce waiter queue | 2026-07-09 | **0.9.4** |
| Plan author | implementation | **0.10.0** dual-compat drop (env/slash) | 2026-07-09 | **0.10.0** |
| Reviewer | Fable 5 | R12 **pending-revision** (M-17) | 2026-07-09 | 0.10.0 reviewed |
| Plan author | implementation | **0.10.1** M-17 + Codex entry | 2026-07-09 | **0.10.1** |
| Plan author | implementation | **0.10.2** remove fable bin aliases | 2026-07-09 | **0.10.2** |
| Plan author | implementation | **0.10.3** docs honesty + Tauri unblocked | 2026-07-09 | **0.10.3** |
| Plan author | plan | **0.11.0** M4.3b Tauri shell draft | 2026-07-09 | **0.11.0** pending-review |
| Reviewer | Fable 5 + implementer | R13 **pending-revision** (M-18/M-19/M-20) | 2026-07-09 | 0.11.0 reviewed |
| Plan author | plan | **0.11.1** R13 locks (M-18 C, M-19 Rust, M-20 textContent) | 2026-07-09 | **0.11.1** `approved` |
| Plan author | implementation | **0.11.2** `apps/desktop` thin shell | 2026-07-09 | **0.11.2** |
| Plan author | implementation | **0.12.0** sticky board + desktop Board + smoke | 2026-07-10 | **0.12.0** |
| Plan author | implementation | **0.12.1** desktop polish + PITCH sync | 2026-07-10 | **0.12.1** |
| Plan author | implementation | **0.12.2** desktop Send handoff/chat + invite | 2026-07-10 | **0.12.2** |
| Plan author | implementation | **0.13.0** L-5 pack file embed opt-in | 2026-07-10 | **0.13.0** |
| Plan author | implementation | **0.13.1** L-4 wire requestId — **`approved` author-close (Low)**; no R{n}, no Owner sign-off | 2026-07-10 | **0.13.1** |
| Plan author | implementation | **0.13.2** dogfood UX (inbox names, share tips) author-close | 2026-07-10 | **0.13.2** |
| Plan author | implementation | **0.13.3** PRIORITIES + link:loom install DX author-close | 2026-07-10 | **0.13.3** |
| Reviewer | Fable 5–equivalent | **R14 approved** (cumulative trust 0.11–0.13.3); L-26/L-27 Low | 2026-07-10 | **0.13.4** |
| Plan author | plan/docs | **0.13.4** record R14 + P1 close | 2026-07-10 | **0.13.4** |
| Plan author | implementation | **0.13.5** L-26/L-27 — **author-close** (R14 Low; no re-R{n}) | 2026-07-10 | **0.13.5** |

**구현 게이트:** **0.13.5** R14 Low closed. Next: **P2 durable inbox** (MINOR + Fable R{n}).
