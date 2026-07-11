# Plan Review — Loom

> **버전 관리:** 계획 SSOT는 `docs/PLAN.md`이다. 리뷰는 반드시 **대상 Plan version**을 헤더에 적는다.  
> **최신:** PLAN **v0.20.0** `approved`→**shipped** (R21, `c15de88`) — Tier A3 `loom doctor` 자가진단 (read-only). 바인딩 M-1..M-4 전부 충족 + L-1..L-3 author-close, 아키텍트 검증(bun test 180/0, 라이브 exit 0). codex-impl 레인 구현. (0.19.0/R20 shipped.)  
> **규칙:** PLAN `Status=approved`는 **Fable 5 R{n} 사인오프 후**가 원칙. Low author-close 시 출처 명시. **언제 R{n} 필수?** → [`WORKFLOW.md` §5.0–5.1](./WORKFLOW.md).  
> **이름:** 제품 = **Loom** (`loom`, `@loom/*`); 검토자 **Fable 5** / fable-advisor = 에이전트, not product.  
> **아카이브:** R1–R11 전문 → [`docs/plan_review_archive.md`](./plan_review_archive.md)  
> **스냅샷:** 닫힌 R{n} 본문의 줄 번호·패키지명은 **검토 당시** 기준. 현재 코드는 follow-up 표 + PLAN을 볼 것.

---

## Active review

| Review | Plan | Status | Gate |
|--------|------|--------|------|
| **R22** | **v0.21.0→0.21.1** | **closed (approved → implemented `d05d714`)** | **PTY handoff inject** — Claude-first · opt-in · accept-gated · **no-auto-submit paste**. M-1…M-6 locks. Fable 5 사전 승인(no R22b). codex-impl 구현 → 아키텍트 독립 검증(bun test 190/0, M-1..M-6 코드 확인). 와이어 변경 없음. FREEZE 예외=오너 pull. |
| **R21** | **v0.20.0** | **closed (approved→shipped `c15de88`)** | Tier A3 `loom doctor` (read-only 진단) — no wire change. All binding M-1..M-4 met (architect-verified: bun test 180/0, live run exit 0), L-1..L-3 author-closed. Implemented via codex-impl lane. |
| R20 | v0.19.0 | closed (approved→shipped `a9cefd0`) | Tier A1 install script — install/doc/string surface, zero relay coupling. M-1..M-4 impl-bound (done), L-1..L-4 author-close. Docker harness caught + fixed a bash-login `set -e` abort. |
| R19 | v0.18.0 | closed (approved→shipped `2b59dee`) | Self-contained invite (portable join blob) — no wire change; token-in-blob sound vs H-5/UC-10.5. |

---

## Open (blocking)

_(none)_ — **R22 implemented** (v0.21.1 PTY handoff inject, `d05d714`): Fable 5 `pending-revision` → M-1…M-6 locks → author-close `approved` → **codex-impl 구현 + 아키텍트 독립 검증**(bun test 190/0, M-1..M-6 코드 확인). 알려진 갭: python 주입 경로 런타임 미실행(라이브 스모크 권장). (R21/v0.20.0 shipped `c15de88`.)

---

## Review R22 — Plan v0.21.0 → 0.21.1 (PTY handoff inject)

**검토 대상:** `docs/PLAN.md` `#### 0.21.0→0.21.1` changelog + header + `docs/UNKNOWNS.md` §0.21.0 + `docs/ORIGIN.md` §1·§2 + Phase 1.5 verdict(`docs/spikes/PHASE-1.5-PTY.md`) + `packages/host/src/handoff-inject.ts`
**검토자:** Fable 5 (fable-advisor) — claude-rev 필수 컨설트 완료. **Advisor: fable-advisor consulted: yes.**
**날짜:** 2026-07-11
**결론:** **`pending-revision` → PATCH 0.21.1 (M-1…M-6) → author-close `approved`** (Fable 사전 승인, no R22b). FREEZE 예외 타당(오너 pull, 이 게이트 하나만).

### 결정적 발견 (성패 지점)
권한 승인 프롬프트 대기 중은 quiescence로 "유휴"처럼 보이나, `prepareInjectText`의 **trailing `\n`이 대기 중 위험 액션을 자동 승인**함 = R1 "의도치 않은 제출"의 최악형. → **M-2 no-auto-submit(paste-only, 사람 Enter)**가 이를 구조적으로 차단. 이 lock 없이는 approve 불가.

### Findings (Sev: High|Med|Low) — binding locks
- **M-1 (High):** auto-inject 경로 코드상 부재 — `injectIntoStdin` 호출부는 `--inject-handoffs` AND 명시 accept/claim 뒤에만 도달; flag off → 미호출 테스트.
- **M-2 (High):** no-auto-submit — trailing `\n` 금지(bracketed-paste), 제출은 사람 Enter. `prepareInjectText` `\n` 강제 우회.
- **M-3 (High):** fail-safe = no-inject — hook 부재·불확실·busy면 취소+큐 유지; buffer-and-apply-later 금지(Phase 1.5 `busy_sleep_then_read`); accept당 at-most-once. 1차 신호=Claude hooks, quiescence는 AND-보조.
- **M-4 (High):** 페이로드는 `prepareInjectText` 산출물만(sanitize+untrusted 마커).
- **M-5 (Med):** 제어 채널 로컬 same-UID 0600 socket/pipe; relay 발 트리거 금지.
- **M-6 (Med):** 기본 큐+폴링 + flag 없는 `loom run` 회귀 불변.

### 스코프 판정
Claude-first 타당(Codex/Grok ratatui idle 신호 불명확). "알림만" 슬라이스는 불필요(이미 존재). no-auto-submit paste가 **배송 가치(복붙 제거) 유지 + R1 리스크 구조적 제거**의 안전한 최소.

**Implement next** under 0.21.1 (레인 위임 — 세션 모델 직접 코딩 금지). 재리뷰 불요.

---

## Review R21 — Plan v0.20.0
**검토 대상:** `docs/PLAN.md` v0.20.0 `#### 0.20.0` changelog (Tier A3 `loom doctor` 자가진단) + header block + `docs/UNKNOWNS.md` 0.20.0
**검토자:** Fable 5 (fable-advisor)
**날짜:** 2026-07-11
**결론:** approved (binding M-1…M-4 전제; 구현은 다음 세션, 재리뷰 불요)

### Checklist
- [x] **Check-set vs real surfaces** — 전부 실재: `loomDir`(`session-store.ts:209`), `getActiveProfile`(:244), `resolveStateHomeDir`(:154), `loadSession`(:288, 순수 읽기), `isPidAlive`(:76); `loomCmd`/`Bun.which`(`cli/index.ts:137–139`), `parseRelayUrl`, host status(:1446–1456), `isLoopbackHost` dynamic import(:645); relay `/health` `{ok,rooms,auth,version}`(`relay/src/server.ts:106–112`), 토큰 없이 열려 있어 프로브 성립(`auth.integration.test.ts:27–32`).
- [x] **Security** — `describeHostMeta`는 token 미출력; session relayUrl은 H-6로 토큰 미포함(`relay-daemon.ts:69`). present/missing만 출력.
- [x] **Read-only 의도는 맞음** — 단, 두 helper에 실제 부작용 → M-1/M-2로 잠금.
- [x] **Out-of-scope / Unknowns** — 깨끗; Unknowns 4개가 실제 리스크(exit code·health timeout·no-session·auto-host) 정확히 짚음.

### Findings (Sev: High|Med|Low)
- **M-1 (High, binding):** doctor의 relay 검사는 **절대 `ensureRelay` 호출 금지**. `relay-daemon.ts:91–105` — local relay가 죽어 있으면 spawn + pid 파일 write → read-only 파기. `parseRelayUrl` + 직접 `fetch(httpOrigin + "/health", { signal: AbortSignal.timeout(3000) })`로만.
- **M-2 (Med, binding):** **`resolveAliveHostMeta` 호출 금지** — `sticky-client.ts:25–27`에서 stale meta를 `clearStickyMeta`로 삭제(mutation). doctor는 `loadStickyMeta` + `isPidAlive`를 직접 조합해 stale을 **보고만** 한다(stale 자체가 진단 정보).
- **M-3 (Med, binding):** exit code 계약 — `fail`≥1 → exit 1, `warn`만 → exit 0. `--strict`(warn도 non-zero)는 범위 밖. 항상 0이면 Docker 하네스/CI에서 활용 불가.
- **M-4 (Med, binding):** no-session(설치 직후 첫 실행)은 `fail` 아님 — Session/Relay/Host 섹션은 `info: no session — next: loom room join <blob>`. 안 그러면 정상 설치가 3-fail로 보여 A3 목적(안심) 역행.
- **L-1 (Low):** `~/.loom` writable 검사는 probe-write 말고 `accessSync(W_OK)`. author-close.
- **L-2 (Low):** relayUrl 출력 시 `?token=` 방어적 redact(H-6로 미포함이나 1줄 가드). author-close.
- **L-3 (Low):** host RPC는 `stickyRpc({op:"status"}, {timeoutMs: 2000-3000})` — 기본 8s(`sticky-client.ts:79`)는 doctor엔 김. author-close.

### Decision notes
- **5-섹션 구성은 최소·충분** — 유지(health `auth:true` × 세션 token missing 교차검사가 relay 섹션의 실질 가치).
- M-1…M-4를 binding-on-impl로 잠그면 **다음 세션 구현 허용**. 재리뷰 불요, 0.20.0 그대로 진행. L-1..L-3 author-close(`implementation-notes.md`).
- Advisor: fable-advisor consulted: yes.

---

## Review R20 — Plan v0.19.0
**검토 대상:** `docs/PLAN.md` v0.19.0 `#### 0.19.0` changelog (Tier A1 5분 설치 경로 / install script) + header block + `docs/UNKNOWNS.md` 0.19.0
**검토자:** Fable 5 (fable-advisor)
**날짜:** 2026-07-11
**결론:** approved (binding M-1…M-4; PLAN에 lock 기록 후 착수 허용 — PATCH급 텍스트 수정, 재리뷰 불요)

### Checklist
- [x] **Scope** — install/doc/string 표면만; relay 무결합 확인 (blob이 `relayUrl`+`token`+`inviteCode` 운반, `packages/protocol/src/invite-link.ts:1-12,42`; install.sh는 relay 지식 불요).
- [x] **새 표면 식별** — `curl\|bash`, 낯선 머신 first-run.
- [x] **Security/trust** — sudo 없음·홈 한정·멱등 append·공식 `bun.sh` 위임 명시(PLAN.md:66-67); 핀(main vs 태그)은 Unknown으로 정당하게 유보.
- [x] **Out-of-scope 정합** — binary 유보가 R19 spawn 제약과 일치(PLAN.md:72,87).
- [x] **Unknowns 충분** — 판정 리스크(PATH 활성화) 명시(UNKNOWNS.md:45-58). 보강: git 존재(macOS xcode-select 프롬프트)·mid-script bun PATH(M-4).
- [x] **"낯선 사람 멈춤" 주장 검증** — `scripts/link-loom.sh:20-31`이 PATH 안내만 출력하고 종료 확인.

### Findings (Sev: High|Med|Low)
- **M-1 (Med, binding):** verify/append 경로가 `$HOME/.bun/bin` 하드코딩(PLAN.md:61(e)) — Bun은 `BUN_INSTALL` 존중, 기존 `link-loom.sh:19`도 `${BUN_INSTALL:-$HOME/.bun}/bin` 사용. Fix: `bun pm bin -g`(또는 `BUN_INSTALL` fallback)로 bin dir 해석해 verify·rc append 양쪽 동일 값 사용.
- **M-2 (Med, binding):** `exec $SHELL`를 script 마지막 실행 단계로 두면(PLAN.md:61(g)) `curl\|bash`에서 깨짐 — stdin이 파이프라 exec된 셸이 EOF 읽고 즉시 종료. Fix: `exec $SHELL`/`source <rc>`를 **안내로 출력**, 또는 tty 체크 후 `</dev/tty`로만 exec.
- **M-3 (Med, binding):** `loomCmd` 스윕은 blanket 아님·열거형 per-string 스왑이어야 함. (a) `index.ts:495,604`는 self-ref fallback 노트("if `loom` is not on PATH, always use `bun run loom`") — 스왑 시 무의미해짐, 리터럴 유지. (b) `index.ts:2350`은 **실행되는** spawnSync 명령(표시 텍스트 아님) — global `loom`으로 스왑하면 실행 중 체크아웃 대신 링크된 clone 실행, 스윕에서 제외.
- **M-4 (Med, binding, trivial):** script 내에서 Bun 설치 직후 `bun`이 script 자신의 PATH에 없음 → 이후 `bun install`/`bun link` 실패. Fix: 해석된 bin dir를 `export PATH` 또는 절대경로 `$BUN/bin/bun` 사용.
- **L-1 (Low):** script 본문을 `main(){…}; main "$@"`로 감싸 truncated-download 안전성 확보 + `git` 존재 체크. author-close.
- **L-2 (Low):** 핀 결정 — main은 신뢰 코호트엔 수용 가능; 기록하고 raw URL이 fetch한 것과 동일 ref를 clone하게 보장. author-close.
- **L-3 (Low):** share 라인(`index.ts:478-479`)은 *joiner* 머신 기준; 로컬 `loomCmd` 감지는 휴리스틱 — 설치 후 낯선 사람은 `loom` 보유라 수용, fallback 노트 유지. author-close.
- **L-4 (Low):** fish — `fish_add_path`/config.fish + marker-line 멱등 체크. author-close.

### Decision notes
- **구현 승인** — 방향·스코프 건전. 단 plan-text 메커니즘 (e)/(g)가 작성된 그대로는 실패 → M-1/M-2가 교정. M-1…M-4를 PLAN에 binding lock으로 기록(PATCH급 텍스트, 재리뷰 불요)하면 0.19.0 하에 착수 허용.
- L-1..L-4 implementation-time author-close (`implementation-notes.md` 기록).
- Advisor: fable-advisor consulted: yes.

---

## Review R19 — Plan v0.18.0
**검토 대상:** `docs/PLAN.md` v0.18.0 `#### 0.18.0` changelog (portable join blob) + header block
**검토자:** Fable 5 (fable-advisor)
**날짜:** 2026-07-11
**결론:** approved

### Checklist
- [x] **Token-in-blob vs H-5/UC-10.5** — sound. H-5 enforcement is server-side bind refusal (`packages/relay/src/server.ts:81-91`, tested `auth.integration.test.ts:133-141`); blob changes nothing there. Default share line stays token-less: token only printed under `--show-token` gate (`packages/cli/src/index.ts:469-480`), blob strictly opt-in via `invite --link` (PLAN.md 기본 share 토큰 자동 삽입 금지). `LOOM-XXXX` is already a bearer secret (`codes.ts:4-11`). No new leak surface: token already persists in session file 0600 (`index.ts:450,556`), not in presence/roster.
- [x] **"No wire change" claim** — verified. Join request `{type:"join", inviteCode, peer}` (`envelope.ts:190-196`); relay token travels as transport auth (Bearer/`?token=`, `server.ts:203-210`), never in the envelope. relayUrl+token flow via `relayOptsFromFlags`→`ensureRelay` (`index.ts:268-275,502`), saved to session (`index.ts:449-450,555-556`). Blob = pure CLI-side encoding of `index.ts:473`'s three fields.
- [x] **Scope** — bounded MINOR. New surface = one subcommand + one arg-parser branch (`index.ts:2352-2358`). No accounts/rotation/hosted-relay code pulled in.
- [x] **Backward compat** — bare `LOOM-XXXX` path unchanged (`cmdRoomJoin` index.ts:497-527); blob path supplies relayFlag/tokenFlag before the same call.
- [x] **Binary deferral** — correct. Auto-daemon spawns `["bun","run",relayCli]` resolving a `.ts` file (`relay-daemon.ts:87-92`) → breaks under `bun compile`; defer + refactor-first is right.

### Findings (Sev: High|Med|Low)
- **M-1 (Med):** blob/invite-code parse ambiguity is real — `LOOM-7K2M` (alphabet `codes.ts:1`) is itself valid base64url. A "try base64-decode first" parser silently mis-parses bare codes.
- **M-2 (Med):** loopback blob footgun — `invite --link` against `ws://127.0.0.1` emits a blob dead on other machines. `isLoopbackHost` exists (`server.ts:42`, exported `relay/src/index.ts:11`).
- **L-1 (Low):** precedence undefined when both a blob and explicit `--relay`/`--token` are passed to `room join`.
- **L-2 (Low):** token in shell history via blob (ack'd in Unknowns) — add "bearer secret" notice to `invite --link` output.

### Decision notes
- **Approved for implementation** with two binding constraints resolving the plan's own Unknowns: (1) blobs **must** carry `loom://join/` prefix; parser checks `^LOOM-[A-Z2-9-]+$` bare-code shape **before** blob decode — never bare base64url (closes M-1). (2) `invite --link` warns/refuses on loopback relayUrl (closes M-2).
- L-1/L-2 are implementation-time fixes; **author-close allowed** after Low fixes with a note in `implementation-notes.md`. No re-review unless the blob carries fields beyond `{relayUrl, token, inviteCode}`.
- Advisor: fable-advisor consulted: yes.

---

## Deferred / backlog (open only)

| ID | Sev | 요약 | 상태 |
|----|-----|------|------|
| A3-M1 | High | R21/0.20.0 `loom doctor`가 `ensureRelay` 호출 시 죽은 local relay를 spawn+pid write(read-only 파기) | **binding on impl** — 직접 `fetch(origin+"/health",{signal:AbortSignal.timeout(3000)})`만 |
| A3-M2 | Med | R21/0.20.0 `resolveAliveHostMeta`는 stale meta를 `clearStickyMeta`로 삭제(mutation) | **binding on impl** — `loadStickyMeta`+`isPidAlive` 조합, stale은 보고만 |
| A3-M3 | Med | R21/0.20.0 exit code 계약 미정 | **binding on impl** — fail≥1→exit 1, warn만→0; `--strict` 범위 밖 |
| A3-M4 | Med | R21/0.20.0 no-session(설치 직후)이 fail로 보이면 A3 목적 역행 | **binding on impl** — Session/Relay/Host를 `info: no session — next: room join` |
| A3-L1 | Low | R21/0.20.0 `~/.loom` writable 검사 방식 | author-close — probe-write 말고 `accessSync(W_OK)` |
| A3-L2 | Low | R21/0.20.0 relayUrl 출력 `?token=` 방어 redact | author-close — 1줄 가드(H-6로 현재 미포함) |
| A3-L3 | Low | R21/0.20.0 host RPC 타임아웃 8s는 doctor엔 김 | author-close — `stickyRpc(...,{timeoutMs:2000-3000})` |
| A1-M1 | Med | R20/0.19.0 install.sh verify/append `$HOME/.bun/bin` 하드코딩 | **done 0.19.0** (`a9cefd0`) — `bun pm bin -g` 해석 |
| A1-M2 | Med | R20/0.19.0 `exec $SHELL` curl\|bash 무효 | **done 0.19.0** — 안내 출력 |
| A1-M3 | Med | R20/0.19.0 `loomCmd` 열거형 스왑(spawn/self-ref 제외) | **done 0.19.0** — helper + 열거 스왑 |
| A1-M4 | Med | R20/0.19.0 Bun 설치 후 script PATH | **done 0.19.0** — export PATH |
| A1-L1..L4 | Low | R20/0.19.0 main 래핑·핀·share 휴리스틱·fish | **done 0.19.0** (+ Docker-caught bash-login `set -e` fix, `~/.profile`) |
| M-1 | Med | R19/0.18.0 blob·invite-code 파싱 모호성 — `LOOM-7K2M`이 그 자체로 유효 base64url | **done 0.18.0** (`2b59dee`) — `loom://join/` 프리픽스 + bare 형태 선검사 |
| M-2 | Med | R19/0.18.0 loopback relayUrl로 만든 blob은 타 머신에서 죽음(footgun) | **done 0.18.0** (`2b59dee`) — `invite --link` loopback 경고 |
| L-1 | Low | R19/0.18.0 blob + 명시 `--relay`/`--token` 동시 전달 시 우선순위 미정 | **done 0.18.0** — 명시 flag override (author-close) |
| L-2 | Low | R19/0.18.0 blob의 token이 shell 히스토리 노출 | **done 0.18.0** — bearer secret 안내 (author-close) |
| L-35 | Low | 0.17.0 acceptance 목록이 idempotent double-up / `LOOM_NO_AUTO_HOST` 경로 / down-safety 단위테스트를 명시 안 함 | **done 0.17.1** — acceptance #7–#9 추가 |
| L-34 | Low | 0.17.0 auto-host on join이 기존 `stopStickyBeforeSessionChange`(join 시 구세션 host 정지) 위에 겹침 — 문서화 필요, 8s 지연 가능성도 명시 필요 | **done 0.17.1** — locks 표 + docs 명시, 성공 안내 문구 |
| L-33 | Low | 0.17.0 auto-host 기본 on이 `bun test`/CI에서 데몬을 조용히 띄울 위험 | **done 0.17.1** — 테스트 하네스 `LOOM_NO_AUTO_HOST=1` 기본 + acceptance #9 |
| L-32 | Low | 0.16.0 MCP `add_task`/`update_task`의 `notify` 기본값이 PLAN에 명시 안 됨 (CLI만 `--as`→notify 기본 lock) | R17 — MCP는 기본 off(opt-in)로 lock 필요, scripted-loop spam 방지 |
| L-31 | Low | 0.16.0 `loom work watch --interval`에 코드 강제 최솟값 없음 ("document"만) — tight-loop 폴링 가능 | R17 — CLI에서 ≥250ms 클램프 + 경고 lock 필요 |
| L-30 | Low | 0.15.0 purpose 파일 last-writer-wins (board와 동일 residual) | R16 — backlog, `updatedByPeerId`로 충분, board 문서 재사용 |
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
| **R19 M-1/M-2** | **approved 0.18.0** — self-contained invite blob. Binding on impl: M-1 (`loom://join/` prefix + parse order), M-2 (loopback guard); L-1/L-2 author-close. Implement pending. |
| **R18 M-27/M-28** | **0.17.1 done** — PLAN Failure/security locks: down 프로세스 신원 검증(cmdline `sticky-main.ts`) + multi-profile up 순차(no Promise.all); L-33/L-34/L-35 ride-along; author-close (no R18b) |
| **R17 M-26** | **0.16.1 (required)** PLAN Failure/security locks — 템플릿 단일행 필드 개행 제거 + watch interval 클램프 + MCP notify 기본 off; then author-close (no R17b) |
| **R16 M-24/M-25** | **0.15.1 done** — locks author-close; implement next |
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
| **R18** | v0.17.0 → **0.17.1** | pending-revision → **closed (author-close)** | M-27/M-28 locked in PLAN 0.17.1; L-33/L-34/L-35 applied — body below |
| **R17** | v0.16.0 → **0.16.1** | pending-revision → **closed (author-close)** | M-26/L-31/L-32 + work bus — body below |
| **R16** | v0.15.0 → **0.15.1** | pending-revision → **closed (author-close)** | M-24/M-25 locked — body below |
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

## Review R18 — Plan v0.17.0 (Launcher UX: `up`/`down`, host-default, work-first)

**검토 대상:** `docs/PLAN.md` **v0.17.0** — `loom up`/`down` (multi-profile 백그라운드 sticky host), `room create`/`join` 시 auto-host 기본 on(`--no-host`/`LOOM_NO_AUTO_HOST` 탈출구), work bus 문서 전면화, `run`(TUI)은 작업 시에만. **MINOR, wire protocol 변경 없음.** 코드 없음 — plan-vs-territory 리뷰 (`packages/cli/src`에 `cmdUp`/`cmdDown`/`LOOM_NO_AUTO_HOST`/`--no-host` 전부 0건 확인; `scripts/dogfood-room-up.sh`는 join만 하고 host start는 수동 — 클린한 스코프 경계 확인).  
**검토자:** Claude (Sonnet 5, `claude-review`) + **Fable 5 second opinion** (`/advisor fable`, agent `fable-advisor`, 필수 컨설트 완료)  
**날짜:** 2026-07-10  
**결론:** **`pending-revision`** — Med 2건(M-27/M-28)은 PLAN 텍스트 lock row로 해소 가능. **PATCH(0.17.1) 적용 후 author-close 허용, 전체 재리뷰(R18b) 불필요** (WORKFLOW §5.1, R15–R17 선례 준용). 아키텍처(MINOR 프레이밍, wire/신뢰 경계 불변, per-host loopback 토큰 모델은 단순히 개수만 늘어남)는 타당함(sound).

### Checklist

| Area | Result | Evidence |
|------|--------|----------|
| MINOR 프레이밍 (wire/trust-boundary 변경 없음) | Pass | `sticky-client.ts` loopback 토큰 모델 불변, `up`/`down`은 기존 `startStickyHostProcess`/`stopStickyHostProcess` primitive를 profile 수만큼 반복 호출하는 것뿐 |
| `up`은 기존 세션 파일 있는 profile만 대상 (peer 위조/무단 join 없음) | Pass | PLAN Security/failure locks 표 명시, 기존 `sessionPath()`가 profile별 파일 경로만 반환 (`session-store.ts:248-260`) — invite 없이 join 불가한 기존 경로 재사용 |
| `up` 자체는 agent TUI 미실행 | Pass | PLAN Out 표 "Auto `run` agents on up" 명시적 제외; `startStickyHostProcess`는 `sticky-main.ts`만 spawn (`sticky-spawn.ts:57-64`), TUI 프로세스 아님 |
| 로그에 비밀값 없음 / 0600 | Pass | 기존 sticky 관례 그대로(옵션 로그 경로만 0600 lock 예정), 신규 표면 아님 |
| **`down` kill-safety (pid+sessionPath 일치)** | **Fail (Med)** | 현재 `stopStickyHostProcess`는 RPC `{op:"stop"}`이 실패했을 때만 raw `process.kill(meta.pid, "SIGTERM")`로 폴백한다(`sticky-spawn.ts:103-114`) — 이 폴백 경로가 실행되는 정확한 조건이 "그 pid가 우리 sticky 프로세스라는 걸 RPC로 확인 못 한 상태"다. `meta.sessionPath` 일치는 우리 자신이 쓴 파일 문자열 대조일 뿐이고 `isPidAlive`(`sticky-meta.ts:79-88`)는 `process.kill(pid, 0)` 성공 여부만 본다 — reboot 후 pid 재사용 시나리오에서 무관 프로세스에 SIGTERM 전달 가능 |
| **multi-profile `up`의 LOOM_SESSION 미혼입 보장** | **Fail (Med)** | `startStickyHostProcess`/`stopStickyHostProcess`는 세션 인자를 받지 않고 모듈 전역/env 기반 `sessionPath()`를 매 호출 시점에 재평가한다(`sticky-spawn.ts:51,72,98,100,115`; `session-store.ts:248-261`) — polling 루프 중간(`sticky-spawn.ts:72`)에도 재평가되므로, `Promise.all` 등으로 profile을 동시 처리하면 프로세스 간 세션이 뒤섞일 수 있는 구조. 순차 처리 또는 `forSessionPath` 명시 전달로 프로세스 자체를 fix해야 함 (client 함수들은 이미 `forSessionPath` 인자를 받는 패턴 존재 — `sticky-meta.ts:70` 등) |
| CI/테스트에서 auto-host 침묵 스폰 방지 | **Fail (Low)** | PLAN에 `LOOM_NO_AUTO_HOST` 탈출구는 있으나 "테스트 하네스가 기본으로 이걸 켠다"는 lock/acceptance가 없음 |
| auto-host on join의 기존 부작용과의 상호작용 문서화 | **Fail (Low)** | join은 이미 `stopStickyBeforeSessionChange()`를 호출한다(`packages/cli/src/index.ts:352`, `cmdRoomJoin` 진입 직후) — 구세션 host를 내린 뒤 새 host를 auto-start하는 이중 동작이 되는데 PLAN에 이 상호작용이 명시되어 있지 않음. 또한 `startStickyHostProcess`의 polling은 최대 8초 소요 가능(`sticky-spawn.ts:69` `deadline = Date.now() + 8000`)하므로 join 커맨드 자체가 그만큼 느려질 수 있음 — acceptance에 명시 필요 |

### Findings (Sev: High|Med|Low, ID)

| Sev | ID | Finding | Evidence | Lock (PLAN 텍스트 추가 필요) |
|-----|-----|---------|----------|-------------------------------|
| **Med** | **M-27** | `down`(및 `host stop`이 사용하는 동일 primitive)의 kill-safety가 "pid alive AND sessionPath 일치"만으로는 프로세스 신원을 증명하지 못한다. 현재 `stopStickyHostProcess`는 RPC 정지가 실패한 경우에만 raw SIGTERM 폴백을 쓰는데, 바로 그 실패 상황(RPC 불응)이 "그 pid가 더 이상 우리 sticky 프로세스가 아닐 수 있다"는 신호이기도 하다. reboot 후 meta 파일은 남고 pid가 무관 프로세스에 재사용된 경우, `down`이 그 무관 프로세스를 죽일 수 있다 | `sticky-spawn.ts:103-114`(SIGTERM 폴백), `sticky-meta.ts:79-88`(`isPidAlive`가 `kill(pid,0)`만 확인) | `down kill-safety (M-27)` — **SIGTERM 폴백 전, 최소 하나의 독립적 신원 확인(프로세스 cmdline에 `sticky-main.ts` 포함, 또는 시작 시각이 `meta.startedAt`과 근사)을 통과해야 한다. 확인 실패 시 SIGTERM을 보내지 않고 meta만 정리한 뒤 경고를 출력한다.** |
| **Med** | **M-28** | multi-profile `up`이 plan이 스스로 요구한 "profile 간 LOOM_SESSION 미혼입" 락을 현재 primitive(`startStickyHostProcess`/`stopStickyHostProcess`)로 보장할 수 없다 — 두 함수 모두 세션 인자를 받지 않고 매 호출 시점(폴링 루프 도중 포함)에 전역 `sessionPath()`를 재평가하므로, profile을 동시(Promise.all)로 처리하면 경쟁 상태에서 세션이 섞일 수 있다 | `sticky-spawn.ts:51,72,98,100,115`(재평가 지점), `session-store.ts:248-261`(`sessionPath()` 전역 상태 의존) | `multi-profile up isolation (M-28)` — **`up`은 profile을 순차적으로(sequential, no `Promise.all`) 처리하거나, spawn/stop 경로에 `forSessionPath`를 명시 파라미터로 통과시켜 프로세스별 세션을 고정한다. 둘 중 하나를 구현 전 확정한다.** |
| Low | **L-33** | auto-host 기본 on이 `bun test`/비대화형 스크립트에서 조용히 데몬을 띄울 위험 — PLAN에 탈출구(`LOOM_NO_AUTO_HOST`)는 있지만 테스트 하네스가 이를 기본 적용한다는 lock이 없음 | PLAN 0.17.0 Security/failure locks 표 (auto-host 행만 있고 CI 행 없음) | `CI hygiene (L-33)` — **테스트 하네스(`bun test` 실행 환경)는 `LOOM_NO_AUTO_HOST=1`을 기본 설정한다. Acceptance에 "bun test는 sticky host를 스폰하지 않는다"를 추가한다.** |
| Low | **L-34** | auto-host on join이 기존 `stopStickyBeforeSessionChange()`(join 시 구세션 host 정지, `cli/index.ts:352`) 위에 겹쳐 이중 동작(정지→재시작)이 되는데 PLAN에 미문서화. 또한 `startStickyHostProcess`의 폴링이 최대 8초 걸릴 수 있어(`sticky-spawn.ts:69`) join 커맨드 체감 지연이 늘 수 있음 | `cli/index.ts:352`(`cmdRoomJoin`의 기존 `stopStickyBeforeSessionChange` 호출), `sticky-spawn.ts:69`(8초 deadline) | `auto-host join interaction (L-34)` — **문서(USER_GUIDE/DOGFOOD_LOOP)에 "join은 구세션 host를 내리고 새 host를 자동 시작하며 최대 8초 소요될 수 있다"를 명시. auto-host 성공 시 `"host auto-started (pid N); disable: --no-host"` 안내를 출력한다.** |
| Low | **L-35** | acceptance 목록(`docs/PLAN.md:144-152`)이 idempotent double-`up`, `LOOM_NO_AUTO_HOST` 경로, down-safety 단위테스트를 명시하지 않음 | PLAN 0.17.0 Acceptance 절 | `acceptance completeness (L-35)` — **acceptance에 "①두 번 연속 `up` 호출이 meta를 손상시키지 않는다 ②`LOOM_NO_AUTO_HOST=1` 시 join이 host를 시작하지 않는다 ③down의 신원 확인 가드에 대한 단위테스트가 존재한다"를 추가한다.** |

### Decision notes

- 아키텍처 자체는 타당함(sound): `up`/`down`은 이미 존재하는 `startStickyHostProcess`/`stopStickyHostProcess` primitive를 profile 목록에 반복 적용하는 것뿐이고, per-host loopback 토큰 모델(`sticky-client.ts`)도 변경되지 않는다. MINOR·wire-불변 프레이밍은 정확하다. auto-host on join의 fail-soft 방향(RPC/host-start 실패해도 join은 성공)도 옳은 설계 — 이 프로젝트의 dogfood 도구 성격상 default-on + `--no-host`/`LOOM_NO_AUTO_HOST` 탈출구 조합이면 충분하며, TTY 감지 같은 휴리스틱을 추가로 넣을 필요는 없다.
- M-27/M-28은 R16 verify[] 및 R17 M-26과 같은 계열의 실수 패턴이다: **"파일에 적힌 문자열 일치"를 "프로세스/신원 확인"으로 착각**하는 것. sessionPath 문자열 일치나 pid 존재만으로는 시간차(TOCTOU)와 pid 재사용을 못 막는다 — 실제 신원 신호(cmdline, 시작 시각)가 필요하다. 마찬가지로 "전역 상태를 참조하는 함수를 루프에서 병렬 호출하면 안전하다"는 암묵적 가정도 검증되지 않았다.
- M-27/M-28 모두 **PLAN Failure/security locks 표에 lock row 추가**로 해소되는 범위이며 새 아키텍처·새 표면·프로토콜 변경이 아니다. **따라서 PATCH(0.17.1) 적용 후 — 두 항목이 Failure/security locks 표에 반영되고 PLAN Status가 이를 반영하면 — 전체 재리뷰(R18b) 없이 author-close를 허용한다.** (WORKFLOW §5.1 "PATCH 후 author-close 가능" 조항 적용, R15–R17 선례.)
- **구현은 여전히 금지** — PATCH가 적용되고 PLAN Status가 `approved`(author-close 포함)로 동기화되기 전까지 `loom up`/`down`, auto-host on join, `--no-host`/`LOOM_NO_AUTO_HOST` 등 실제 코드 작성 금지.

### R18 follow-up (0.17.1 — applied)

| Finding | 처리 |
|---------|------|
| **M-27** | Failure/security locks: `down` SIGTERM 폴백 전 독립 신원 확인(cmdline `sticky-main.ts` via `ps`) 필요, 실패 시 meta만 정리 + 경고 |
| **M-28** | Failure/security locks: multi-profile `up`/`down`은 **순차 처리(no `Promise.all`)** + profile별 `setActiveProfile(explicit)` 확정 |
| **L-33** | Failure/security locks: 테스트 하네스 `LOOM_NO_AUTO_HOST=1` 기본 + acceptance #9 |
| **L-34** | 문서화: join의 host 정지→재시작 이중 동작 + 최대 8초 지연 명시, auto-host 성공 안내 문구 |
| **L-35** | Acceptance 보강: idempotent double-up / `LOOM_NO_AUTO_HOST` 경로 / down-safety 단위테스트 (#7–#9) |
| PLAN | **v0.17.1** `approved` (author-close per R18 Decision notes; **no R18b**) |

**Implement Launcher UX under 0.17.1 now allowed.**

---

## Review R17 — Plan v0.16.0 (Work bus: board → handoff + `loom work`)

**검토 대상:** `docs/PLAN.md` **v0.16.0** — board add/assign가 handoff를 딜리버리 버스로 사용(기존 handoff/inbox 재사용, 새 wire 타입 없음), fixed-shape body 템플릿, `loom work` / `loom work watch` (client poll). 코드 없음 — plan-vs-territory 리뷰 (`task-board.ts`/`cli/index.ts`에 `notify` 관련 코드, `loom work` 커맨드 전부 미생성 확인).  
**검토자:** Claude (Sonnet 5, `claude-review`) + **Fable 5 second opinion** (`/advisor fable`, agent `fable-advisor`, 필수 컨설트 완료)  
**날짜:** 2026-07-10  
**결론:** **`pending-revision`** — Med 1건(M-26) + Low 2건(L-31/L-32)은 PLAN 텍스트 lock row로 해소 가능. **PATCH(0.16.1) 적용 후 author-close 허용, 전체 재리뷰(R17b) 불필요** (WORKFLOW §5.1, R15/R16 선례 준용). 아키텍처(handoff-as-bus, poll v1, no new wire types)는 타당함(sound).

### Checklist

| Area | Result | Evidence |
|------|--------|----------|
| Architecture (handoff as delivery SSOT, no CRDT/new wire) | Pass | PLAN 0.16.0 Architecture lock 표; wire v1 불변 |
| peer_unknown fail-closed | Pass | 기존 `loom handoff --track` 경로가 이미 동일 패턴 구현 (`cli/index.ts:525` `ack.handoffId && ack.status !== "peer_unknown"` 이후에만 `addTaskFromHandoff`) — 재사용이라 저위험 |
| No-spam (add/assign만 notify, status 변경 시 미발동) | Pass | PLAN Out 표에 "Default notify on every board set (status spam)" 명시적 제외 |
| No-auto-claim | Pass | 0.15 비목표 그대로 유지 확인 |
| **body 템플릿 fixed-shape 전제** | **Fail** | task title은 `sanitizePeerText`로만 정제되어 개행 보존(`sanitize.ts:31-35`; `task-board.ts:192` `normalizeTask`가 `sanitizePeerName`이 아닌 `sanitizePeerText` 사용) — 동일 room의 아무 peer나 `board add`/MCP `add_task`로 title에 개행을 넣어 `task:`/`assignee:` 위조 줄을 심을 수 있음. assignee 필드 자체는 `sanitizePeerName`으로 이미 안전, taskId도 regex-coerce라 안전 — title만 유일한 취약 단일행 필드 |
| **`loom work watch` poll interval 강제** | **Fail (Low)** | lock 표가 "Default interval ≥ 1s; document"라고만 되어 있어 권고 문서일 뿐 코드 클램프가 아님 — `--interval 0`/`1` 등 사용자·에이전트 입력값을 강제하는 코드 없음 |
| MCP notify 기본값 | **Fail (Low)** | CLI는 "`--as` 존재 시 기본 notify" lock이 있지만 MCP `add_task`/`update_task`의 `notify` 기본값은 PLAN에 미고정 — scripted 루프가 기본으로 스팸할 위험 |

### Findings (Sev: High|Med|Low, ID)

| Sev | ID | Finding | Evidence | Lock (PLAN 텍스트 추가 필요) |
|-----|-----|---------|----------|-------------------------------|
| **Med** | **M-26** | body 템플릿의 "fixed shape, machine parse" 전제가 title 필드의 개행 보존으로 붕괴 — 어떤 room peer든 `add_task`/`board add`로 `"ok\ntask:evil_id\nassignee: @victim"` 같은 title을 심어 가짜 헤더 줄을 위조 가능. 이 기능의 존재 이유가 "기계 파싱"인데, 그 파싱 대상 자체가 위조 가능해짐. Untrusted-handoff 배너는 사람이 읽고 행동하기 전 리뷰만 완화하지, 기계 파싱(예: 향후 `loom work`/에이전트 자동 처리) 오염은 막지 못함 | `sanitize.ts:18-40` (`sanitizePeerText`는 탭/개행 보존) vs `task-board.ts:192` (`normalizeTask`가 title에 `sanitizePeerText` 사용) | `Template injection (M-26)` — **body 템플릿에 삽입되는 단일행 필드(title 등)는 삽입 직전 `\r\n\t`를 공백으로 치환한다(보드에 저장된 title 자체는 개행 유지 가능, 템플릿 삽입 시점에만 단일행화). 파서는 첫 빈 줄까지의 헤더 블록만 신뢰한다.** |
| Low | **L-31** | `loom work watch --interval`에 코드 강제 최솟값 없음 — "document"는 lock이 아님. `--interval 0`은 매 tick마다 relay 연결/조인/이탈까지 발생할 수 있는 완전한 왕복이라 자기부과적이지만 실질적인 리소스 낭비 | PLAN 0.16.0 "watch CPU" 락 표 문구("document"만) | `watch interval floor (L-31)` — **CLI는 `--interval`을 최소 250ms로 클램프하고, 클램프 발생 시 경고를 출력한다. 기본값 2s는 유지.** |
| Low | **L-32** | MCP `add_task`/`update_task`의 `notify` 기본값이 PLAN에 미고정 — CLI는 `--as` 존재 시 기본 notify를 lock했지만 MCP 경로는 "optional"이라고만 되어 있어 스크립트형 루프가 기본으로 스팸할 위험을 UNKNOWNS.md 자신이 이미 지적 | PLAN 0.16.0 S1 표 "MCP add_task/update_task optional notify: true" | `MCP notify default (L-32)` — **MCP `add_task`/`update_task`는 `notify` 기본값을 off로 lock한다. `notify: true`를 명시해야만 handoff가 발생한다 (CLI `--as`→기본 notify는 CLI 전용 관례로 유지).** |

### Decision notes

- 아키텍처 자체는 타당함(sound): handoff를 딜리버리 버스로 재사용하고 board를 상태 추적으로만 쓰는 설계는 CRDT 없이도 "board=work queue" 기대를 충족시키는 합리적 다음 스텝이며, wire protocol v1도 그대로 유지된다. peer_unknown fail-closed는 이미 `loom handoff --track` 경로에 구현된 패턴을 그대로 재사용하는 것이라 신규 설계 위험이 낮다. no-auto-claim 비목표도 견고함.
- M-26은 R16의 verify[] 교훈과 같은 계열의 실수다: sanitize가 "표시 안전성(display-safety)"은 보장하지만 이 기능이 요구하는 "구조적 안전성(structural-safety, fixed-shape 파싱 신뢰)"까지는 보장하지 않는다. `sanitizePeerText`가 개행을 보존하는 것은 handoff 자유 텍스트에는 맞는 설계지만, 그 결과를 고정 위치 헤더 템플릿에 그대로 삽입하는 새 용도에는 안 맞는다 — 삽입 시점에 단일행화가 필요하다.
- M-26/L-31/L-32 모두 **PLAN Failure/security locks 표에 lock row 추가**로 해소되는 범위이며 새 아키텍처·새 표면·프로토콜 변경이 아니다. **따라서 PATCH(0.16.1) 적용 후 — 세 항목이 Failure/security locks 표에 반영되고 PLAN Status가 이를 반영하면 — 전체 재리뷰(R17b) 없이 author-close를 허용한다.** (WORKFLOW §5.1 "PATCH 후 author-close 가능" 조항 적용, R15/R16 선례.)
- **구현은 여전히 금지** — PATCH가 적용되고 PLAN Status가 `approved`(author-close 포함)로 동기화되기 전까지 `board add/assign --notify`, `loom work`/`loom work watch`, MCP `notify` 파라미터 등 실제 코드 작성 금지.

### R17 follow-up (0.16.1 — required before implement)

| Finding | 처리 |
|---------|------|
| **M-26** | Failure/security locks: 템플릿 단일행 필드(title)는 삽입 전 `\r\n\t` → 공백 치환; 파서는 첫 빈 줄까지만 헤더로 신뢰 |
| **L-31** | Failure/security locks: `--interval` 최소 250ms 클램프 + 경고; 기본 2s 유지 |
| **L-32** | Failure/security locks: MCP `add_task`/`update_task` `notify` 기본 off, 명시적 `notify:true` 필요 |
| PLAN | 0.16.1 `approved` 예정 (author-close per R17 Decision notes; **no R17b**) — PATCH 적용 시 |

**Implement Work bus는 0.16.1 PATCH 적용 후 허용.**

---

## Review R16 — Plan v0.15.0 (Purpose-based sprint 1)

**검토 대상:** `docs/PLAN.md` **v0.15.0** — Purpose 카드(room-scoped 로컬 파일) + handoff intent 태그 + receive-path 강제 + `loom verify` (lite). 코드 없음 — plan-vs-territory 리뷰 (`packages/host/src/purpose.ts`, CLI `purpose`/`verify` 서브커맨드, MCP `get_purpose`/`set_purpose` 전부 미생성 확인).  
**검토자:** Claude (Sonnet 5, `claude-review`) + **Fable 5 second opinion** (`/advisor fable`, agent `fable-advisor`, 필수 컨설트 완료)  
**날짜:** 2026-07-10  
**결론:** **`pending-revision`** — Med 2건(M-24/M-25)은 PLAN 텍스트 lock row로 해소 가능. **PATCH(0.15.1) 적용 후 author-close 허용, 전체 재리뷰(R16b) 불필요** (WORKFLOW §5.1 "PATCH 후 author-close" 조항, R15 선례 준용). 아키텍처 자체는 타당함(sound).

### Checklist

| Area | Result | Evidence |
|------|--------|----------|
| Purpose schema v1 (sanitize/caps) | Pass | `task-board.ts` 패턴과 동일 (`sanitizePeerText`, length caps, atomic-json) |
| Path safety | Pass | `loomDir()/purposes/<sha256(roomId)[:16]>.json`, mode 0600 — board와 동일 |
| Corrupt file handling | Pass | backup + throw (board 패턴), silent empty 아님 |
| Handoff intent tags / receive-path | Pass | best-effort parse, never blocks send; no-auto-claim / no-PTY-inject 명시적 non-goal 유지 확인 |
| **verify[] 쓰기 권한 vs "owner-controlled" 주장** | **Fail** | PLAN.md 보안락 표는 "owner-controlled"라 쓰지만, 동일 UID의 어떤 peer든 MCP `set_purpose`/CLI로 `verify[]`를 쓸 수 있음 — 표 내부 모순 (UNKNOWNS.md §0.15.0 "Unknown unknowns"가 이미 이 남용 가능성을 인정) |
| **`loom verify` 실행 권한 경계** | **Fail** | `verify[]`는 실행되는 shell 문자열. untrusted handoff(`hints.ts` "review before destructive actions") → prompt-injected peer → `set_purpose`로 주입 → 이 repo의 "autonomy default: no mid-step approval" 관례상 확인 없이 `loom verify` 실행 가능 → unattended 로컬 코드 실행 경로 |
| set_purpose multi-profile 동시쓰기 | Pass (Low) | `withFileLock`로 파일 손상은 방지; last-writer-wins는 board와 동일한 수용된 residual |

### Findings (Sev: High|Med|Low, ID)

| Sev | ID | Finding | Evidence | Lock (PLAN 텍스트 추가 필요) |
|-----|-----|---------|----------|-------------------------------|
| **Med** | **M-24** | `verify[]` 쓰기 경로가 "owner-controlled" 전제를 무력화 — 동일 UID의 어떤 room peer(에이전트 포함)든 MCP `set_purpose` 또는 CLI로 `verify[]`를 쓸 수 있음 | PLAN.md 0.15.0 "Security / failure locks" 표 vs 쓰기 권한 서술 모순 | `verify[] write path (M-24)` — **MCP `set_purpose`는 `verify[]`를 생성/수정할 수 없다 (silent drop 아닌 명시적 에러로 거부). `verify[]`는 CLI `loom purpose set`으로만 쓸 수 있다 — 실행 가능한 문자열을 심는 유일한 경로에 에이전트 하네스의 exec-permission 게이트를 그대로 유지하기 위함. "owner-controlled" 표현 삭제.** |
| **Med** | **M-25** | `loom verify`의 무인 실행 위험 — MCP `set_purpose`는 에이전트 하네스의 실행 권한 게이트를 우회하는 "무해해 보이는" tool call이고, `loom verify`는 그 결과로 심어진 문자열을 하네스가 안전하다고 보는 커맨드로 실행함. 이 repo의 autonomy-default 웨이브 관례상 사람 확인 없이 자동 실행될 수 있음 | `AGENTS.md`/`HANDOFF.md` autonomy default; `hints.ts` untrusted-handoff 서술 | `loom verify execution (M-25)` — **실행 전 정확한 커맨드 목록을 verbatim 출력한다. `verify[]`가 마지막으로 확인(acknowledge)된 해시(loomDir() 하위 저장)와 다르면 TTY confirm 또는 명시적 `--yes`를 요구한다 — `--yes`도 커맨드를 echo한다. 미확인 레시피를 조용히 실행하지 않는다.** |
| Low | **L-30** | Purpose 파일 last-writer-wins (board와 동일한 수용된 residual) — `withFileLock`가 파일 손상은 막지만 갱신 유실은 막지 않음; `updatedByPeerId`로 충분 | `task-board.ts` `withFileLock` 패턴 대비 | backlog — board와 동일 residual, 별도 lock row 불필요 |

### Decision notes

- 아키텍처 자체는 타당함(sound): Purpose 카드 / handoff intent 태그 / receive-path 강제 / `loom verify`는 P0–P2가 남긴 "task-shaped, purpose-less" 간극을 메우는 합리적 다음 스텝이고, wire protocol v1도 그대로 유지된다. no-auto-claim / no-PTY-inject 비목표도 견고함 — 그대로 유지.
- 그러나 board 선례를 그대로 `verify[]`에 적용하는 것은 **범주 오류**다: board 데이터는 inert(제목/메모)라 동시쓰기 residual이 "손상 없음"으로 충분하지만, `verify[]`는 **실행되는 셸 문자열**이라 같은 residual이 곧 "임의 로컬 코드 실행 경로"가 된다. `sanitizePeerText`는 표시 안전성(display-safety)이지 실행 안전성(exec-safety)이 아니다 — "sanitized니까 실행해도 안전하다"는 함의를 문서에 남기지 말 것.
- M-24/M-25는 둘 다 **PLAN Failure/security locks 표에 lock row 3줄 추가**로 해소되는 범위이며 새 아키텍처·새 표면·프로토콜 변경이 아니다 (R15 Decision notes와 동일 논리: 방향은 맞고 표기만 비어 있었거나 모순이었을 뿐). **따라서 PATCH(0.15.1) 적용 후 — M-24/M-25가 Failure/security locks 표에 반영되고 PLAN Status가 이를 반영하면 — 전체 재리뷰(R16b) 없이 author-close를 허용한다.** (WORKFLOW §5.1 "PATCH 후 author-close 가능" 조항 적용.) L-30은 Low backlog로 선택 사항이며 PATCH를 막지 않는다.
- **구현은 여전히 금지** — PATCH가 적용되고 PLAN Status가 `approved`(author-close 포함)로 동기화되기 전까지 `packages/host/src/purpose.ts`, CLI `purpose`/`verify` 서브커맨드, MCP `get_purpose`/`set_purpose` 등 실제 코드 작성 금지.

### R16 follow-up (0.15.1 — required before implement)

| Finding | 처리 |
|---------|------|
| **M-24** | Failure/security locks: MCP `set_purpose`가 `verify[]` 생성/수정 시 명시적 에러로 거부; `verify[]`는 CLI `loom purpose set`으로만 쓰기 가능; "owner-controlled" 표현 삭제 |
| **M-25** | Failure/security locks: `loom verify` 실행 전 커맨드 verbatim 출력; `verify[]` 해시 미확인 시 TTY confirm 또는 `--yes` 필요(둘 다 echo) |
| L-30 | Low backlog; board와 동일 residual로 문서화 |
| PLAN | 0.15.1 `approved` 예정 (author-close per R16 Decision notes; **no R16b**) — PATCH 적용 시 |

### R16 follow-up applied (0.15.1)

| Finding | 처리 |
|---------|------|
| **M-24** | Failure/security locks: MCP rejects `verify[]`; CLI-only write |
| **M-25** | Failure/security locks: verbatim print + ack hash / TTY / `--yes` |
| PLAN | **v0.15.1** `approved` (author-close; **no R16b**) |

**Implement Purpose sprint 1 under 0.15.1 now allowed.**

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
