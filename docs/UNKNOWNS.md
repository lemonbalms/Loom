# Unknowns — 지도 ≠ 영토

| Field | Value |
|-------|--------|
| **Document** | `docs/UNKNOWNS.md` |
| **Role** | 미지 템플릿 + 게이트별 **짧은** 표 |
| **SSOT** | **아님** — 제품 계획 SSOT는 `docs/PLAN.md` |
| **Workflow** | `docs/WORKFLOW.md` **§3.5** |
| **Last updated** | 2026-07-09 |

---

## 왜 있는가

프롬프트·PLAN·스킬은 **지도**다. 코드·보안·툴체인·실제 UX는 **영토**다.  
그 간극이 **미지(unknowns)** 이고, 에이전트는 여기서 추측 결정을 한다.

이 파일은 미지를 **값싸게** 드러내기 위한 체크리스트다.  
규칙 본문: WORKFLOW §3.5.

| 이름 | 의미 |
|------|------|
| **Loom** | 제품 |
| **Fable 5 / fable-advisor** | 리뷰 에이전트 |
| **Unknowns** | 작업 방법론 (제품명 아님) |

---

## 템플릿 (게이트마다 복사)

```markdown
## 0.X.Y — <한 줄 제목>
| 분면 | 내용 |
|------|------|
| Known knowns | … |
| Known unknowns | … |
| Unknown knowns | … |
| Unknown unknowns | … |
```

---

## Gate log

### 0.21.0 — PTY handoff inject (pending-review R22)
| 분면 | 내용 |
|------|------|
| Known knowns | 기반코드 존재(`handoff-inject.ts` `prepareInjectText`/`injectIntoStdin` experimental); PTY 실행 래퍼(`run-with-pty.py`); R1이 default no-go·opt-in deferred로 판정; 안전조건 3개(idle+accept+opt-in) 이미 정의됨 |
| Known unknowns | **에이전트 유휴 감지 방식**(Claude hooks vs 출력 quiescence 휴리스틱, 오탐 처리); 제어 채널(named pipe/unix socket/sticky RPC/fd); accept→inject 구동 위치(`loom run` vs sticky host) |
| Unknown knowns | 주입 텍스트를 에이전트가 실제 사용자 입력으로 처리하는지(Phase 1.5 수동 매트릭스 미완 — Claude Code부터 채움); busy-중 주입의 실패 양상이 에이전트별로 다를 수 있음 |
| Unknown unknowns | Claude Code 버전업 시 hooks/TUI 동작 변화; PTY 래퍼(python)와 Bun 프로세스 간 신호/소유권 경합; 주입이 에이전트 세션 상태를 오염시키는 미지 경로 |

### 0.20.0 — Tier A3 `loom doctor` 자가진단 (pending-review)

| Field | Value |
|-------|--------|
| **PLAN** | v0.20.0 (`pending-review`) |
| **Date** | 2026-07-11 |
| **Review** | R21 required (새 CLI 서브커맨드 표면). **구현은 다음 세션** |

| 분면 | 내용 |
|------|------|
| Known knowns | 진단 표면 다 존재: `Bun.which`/loomCmd(install), `loomDir`/`getActiveProfile`(home), `loadSession`(session), `parseRelayUrl`/`isLoopbackHost`+`/health`(relay), `resolveLiveHostMeta`/`describeHostMeta`/`stickyRpc`(host). Docker 하네스가 실패 모드(PATH·unzip·loopback) 이미 노출. |
| Known unknowns | (1) exit code 계약 — 항상 0 vs `fail`시 non-zero vs `--strict`. (2) `/health` 프로브 타임아웃(오프라인 relay 매달림 방지). (3) 세션 없음(설치 직후) 첫 실행 출력이 유용한가. (4) read-only 보장 — auto-host 절대 안 띄움. |
| Unknown knowns | 낯선 사람은 "무엇이 틀렸는지"가 아니라 "다음 한 걸음"을 원함 → 각 fail에 조치 힌트 필수. |
| Unknown unknowns | 비표준 셸/컨테이너/CI에서의 health GET 동작·타임아웃, describeHostMeta가 stale pid를 live로 오판하는 경계. |

**Next session:** R21 → 0.20.x implement(`cmdDoctor` + dispatch + 테스트) → docs.

### 0.19.0 — Tier A1 5분 설치 경로 install script (pending-review)

| Field | Value |
|-------|--------|
| **PLAN** | v0.19.0 (`pending-review`) |
| **Date** | 2026-07-11 |
| **Review** | R20 required (새 표면 + `curl\|bash` 신뢰 경계) |

| 분면 | 내용 |
|------|------|
| Known knowns | repo PUBLIC(익명 clone 가능). blob이 relayUrl+token 운반(0.18.0). `bun link`는 이미 있으나 `link-loom.sh`는 PATH 안내만 출력하고 종료. Bun 공식 installer(`bun.sh`) 위임 가능. |
| Known unknowns | (1) **PATH 활성화**(판정 리스크) — curl\|bash는 호출자 셸 못 바꿈 → 절대경로 검증 + rc append + `exec $SHELL` 안내로 충분한가. (2) shell rc 감지(bash/zsh/fish, 멱등). (3) 고정 clone 디렉토리 + 기존 충돌 시 update vs 거부. (4) 재실행 멱등성. (5) `curl\|bash` 핀 — main vs 태그(공급망). |
| Unknown knowns | 낯선 사람은 4개 수동 실패점 중 첫 하나에서 멈춘다 — 스크립트가 그 판단을 대신 내려줘야 함. |
| Unknown unknowns | Bun 설치 실패(네트워크·권한)·기존 다른 버전 Bun 충돌·비표준 셸 환경에서의 rc 위치. |

**Next session:** R20 → 0.19.x implement(install.sh + README + `loomCmd` 스윕) → tests → docs.

### 0.17.0 — Launcher UX up / host-default (pending-review)

| Field | Value |
|-------|--------|
| **PLAN** | v0.17.0 (`pending-review`) |
| **Date** | 2026-07-10 |
| **Review** | R18 required; **next session implements after approve** |

| 분면 | 내용 |
|------|------|
| Known knowns | sticky already daemonizes (unref). Multi-profile = multi session file. Work bus ships 0.16. dogfood-room-up exists for join only. |
| Known unknowns | (1) dogfood:up vs loom up naming — plan: both (script + CLI). (2) Auto-host on every join may surprise headless CI — plan: LOOM_NO_AUTO_HOST + --no-host. (3) Whether --watch on up is default — plan: **opt-in only**. |
| Unknown knowns | Users think host = open terminal; education + up removes the confusion. |
| Unknown unknowns | Orphan hosts after crash; down must be robust via meta.pid. |

**Next session:** R18 → 0.17.x implement → tests → docs.

### 0.16.0 — Work bus board notify + loom work (pending-review)

| Field | Value |
|-------|--------|
| **PLAN** | v0.16.0 (`pending-review`) |
| **Date** | 2026-07-10 |
| **Review** | R17 required |

| 분면 | 내용 |
|------|------|
| Known knowns | Handoff is delivery SSOT (durable, notify when online). Board is local file. Receive path is pull (`check_handoffs`). No CRDT. 0.15 tags/purpose exist. |
| Known unknowns | (1) Default notify-on-assignee vs require `--notify` — plan locks **default on when --as set**. (2) watch poll vs sticky events — plan locks **poll v1**. (3) Re-assign spam if assign called twice — plan: one handoff per assign call. |
| Unknown knowns | Users think “board = work queue”; without bridge they are wrong. |
| Unknown unknowns | Flood of notify if scripts loop board add; mitigate with docs + no notify on status-only updates. |

**Next:** R17 → implement or pending-revision locks only.

### 0.15.0 — Purpose-based sprint 1 (pending-review)

| Field | Value |
|-------|--------|
| **PLAN** | v0.15.0 (`pending-review`) |
| **Date** | 2026-07-10 |
| **Review** | R16 required before implement |

| 분면 | 내용 |
|------|------|
| Known knowns | Handoff is pull (`check_handoffs`/`claim`); no PTY inject. Board/pack are room-scoped local 0600 files. Dogfood roles impl/reviewer exist as docs+profiles. Wire v1 frozen for this sprint. |
| Known unknowns | (1) MCP `set_purpose` vs CLI-only for v1 — plan includes both. (2) Whether `--with-purpose` is attachment vs body section — impl free if sanitize+caps. (3) `loom verify` cwd = process.cwd() vs session-bound path — plan: process cwd at invoke. |
| Unknown knowns | Reviewers ignore stderr handoff banners; only first-prompt + MCP pull works in practice. |
| Unknown unknowns | Agents ignoring hints still; purpose file races multi-profile same UID (accept like board); verify recipe abuse if agent can set_purpose then verify — residual local UID trust. |

**Next:** R16 → if approved implement; if pending-revision only Open locks.

### 0.14.0 — P2 durable relay inbox/roster (pending-review)

| Field | Value |
|-------|--------|
| **PLAN** | v0.14.0 (`pending-review`) |
| **Date** | 2026-07-10 |
| **Review** | R15 required before implement |

| 분면 | 내용 |
|------|------|
| Known knowns | Today: `Room.inboxes` + `members` in memory only (`packages/relay/src/room.ts`); restart loses handoffs. Board/pack already use atomic JSON + 0600 under `~/.loom`. M-7 peerSecret must survive with roster. Protocol v1 / claim first-wins / leave-drops-inbox stay. Caps L-11/L-16 stay. |
| Known unknowns | (1) Sync write every mutation vs short debounce — plan prefers **sync** for simpler durability proof. (2) Whether auto-daemon (`ensureLocalRelay`) needs explicit `LOOM_RELAY_STATE_DIR` or just default home. (3) Disk growth if rooms never left — accept until GC backlog. (4) Exact placement of atomic helper (relay-local vs lift from host) — plan: **relay-local `persist.ts`** to avoid host↔relay cycle. |
| Unknown knowns | Operators expect “restart relay ≠ lose handoffs” once dogfood documents it; empty inbox after restart is a trust-break. |
| Unknown unknowns | Multi-host same NFS path; crash mid-rename on exotic FS; very large attachment spam filling disk despite caps; partial write if chmod fails on Windows (out of primary dogfood). R15 should probe fail-open vs fail-closed on load errors. |

**Next:** R15 on PLAN 0.14.0 → if approved, implement; if pending-revision, only Open blocking.

### 0.11.1 — M4.3b Tauri shell (plan locked)

| Field | Value |
|-------|--------|
| **PLAN** | v0.11.1 (`approved`) |
| **Date** | 2026-07-09 |

| 분면 | 내용 |
|------|------|
| Known knowns | sticky RPC status/peers/inbox/claim; loopback; M-18 **C** no Board v1; M-19 Rust invoke + session order; M-20 textContent-only |
| Known unknowns | Tauri 2 monorepo layout polish; macOS signing later; multi-window |
| Unknown knowns | desktop visual taste — optional mock during implement |
| Unknown unknowns | (closed for plan) board gap, CORS, sanitize≠HTML — locked in 0.11.1 |

**Next:** implement `apps/desktop` under 0.11.1. Board UI = later gate.

### 0.11.0 — superseded

R13 pending-revision material; see plan_review R13 + PLAN 0.11.1.

---

## Changelog

| 날짜 | 내용 |
|------|------|
| 2026-07-09 | 초안 + 0.11 stub |
| 2026-07-09 | R13 fill; 0.11.1 locks |
| 2026-07-10 | 0.14.0 P2 durable inbox unknowns |
| 2026-07-10 | 0.15.0 purpose-based sprint 1 unknowns |
| 2026-07-10 | 0.16.0 work bus unknowns |
| 2026-07-10 | 0.17.0 launcher UX unknowns |
