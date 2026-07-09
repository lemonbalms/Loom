# Plan Review — Loom

> **버전 관리:** 계획 SSOT는 `docs/PLAN.md`이다. 리뷰는 반드시 **대상 Plan version**을 헤더에 적는다.  
> **최신:** PLAN **v0.9.4** `approved` — L-4 requestOnce FIFO waiter queue.  
> **규칙:** PLAN `Status=approved`는 리뷰 사인오프 **후에만** 기재.  
> **이름:** 제품 = **Loom** (`loom`, `@loom/*`); 검토자 **Fable 5** / fable-advisor = 에이전트, not product.  
> **아카이브:** R1–R7 전문 → [`docs/plan_review_archive.md`](./plan_review_archive.md)

---

## Open (blocking)

| ID | Sev | 요약 | 상태 |
|----|-----|------|------|
| *(none)* | | | |

### Deferred / backlog

| ID | Sev | 요약 | 상태 |
|----|-----|------|------|
| L-4 | Low | `requestOnce` concurrent ack steal | **0.9.4 done** (FIFO waiters; wire requestId deferred) |
| L-5 | Low | v2 pack embed TOCTOU re-resolve | when embed ships |
| R10 L-14 | Low | timing-safe util share | **0.9.3 done** |
| R10 L-16 | Low | attachment cap units (chars) | **0.9.3 done** |
| R11 L | Low | WARNING 스코프 / INSECURE 경고 / 브랜딩 | **0.9.2** closed; dual-compat remains intentional |
| Product | — | Tauri UI | needs Rust/cargo |

### Recent follow-ups (closed / in review)

| Finding | 처리 |
|---------|------|
| **R11 M-14/M-15/M-16** | **0.9.1** — loomDir() paths; sticky LOOM_* env; live-PID + FABLE- join tests |
| **R11 Low** residual branding | **0.9.2** — loom tips; WARNING scope; FABLE_RELAY_INSECURE_OPEN warn |
| **R10 L-14 / L-16** | **0.9.3** — shared timingSafe in protocol; caps documented as chars |
| **L-4** requestOnce | **0.9.4** — FIFO pending queue; no onEnvelope hijack |
| **R11** Fable→Loom rename | **0.9.0**–**0.9.2** — **done** |
| **R10 M-13** run silent join failure | **0.8.1** — join fail-fast + onError/error surface |
| **R10 L-15** sticky peerSecret 미저장 | **0.8.1** — saveSession + setReconnectPeerSecret |
| **R5/R9 M-7** peerId ownership | **0.8.0** + **0.8.1** — **done** (R10 core approved) |
| **R9 L-12** lock race / busy-spin | **0.7.3** — owner.pid + reclaim only if dead+stale; Bun.sleepSync/Atomics.wait — R10 재확인 완료 |
| **R9 L-11** attachment size + inbox pin | **0.7.2** — 256KB/32 att/100 inbox; claim deletes entry — R10 재확인 완료 |
| **R9 M-10/M-11/M-12** | **0.7.1** done |
| **R8 H-7/M-8/M-9** | **0.6.1** done |
| R7 L-1–L-3 | **0.5.1** done |

---

## Review index

| Review | Plan | Conclusion | Notes |
|--------|------|------------|-------|
| **R11** | v0.9.0 | pending-revision → **0.9.1 approved** | M-14/15/16 closed — body below |
| **R10** | v0.8.0 | pending-revision → **0.8.1 approved** | M-7 core OK; M-13/L-15 closed — body below |
| **R9** | v0.7.0 | pending-revision → **0.7.1 approved** | M-10/M-11/M-12 closed — body below |
| **R8** | v0.6.0 | pending-revision → **0.6.1 approved** | H-7/M-8/M-9 closed — body below |
| **R7** | v0.5.0 | **approved** | Context pack; 0.5.1 closed L-1–L-3 — body below |
| R6 | v0.4.0 | pending-revision → **0.4.1** | Sticky host F-1/F-2/F-3 — [archive](./plan_review_archive.md) |
| R5 | v0.3.0 | pending-revision → **0.3.1** | Remote auth — [archive](./plan_review_archive.md) |
| R4 | v0.2.3 | approved (H-4) → **0.2.4** | [archive](./plan_review_archive.md) |
| R3 | v0.2.2 | pending-revision → **0.2.3** | [archive](./plan_review_archive.md) |
| R2 | v0.2.0 | approved → **0.2.1** | [archive](./plan_review_archive.md) |
| R1 | v0.1.0 | on-hold → **0.2.0** | [archive](./plan_review_archive.md) |

---

## Review R11 — Plan v0.9.0 (Fable → Loom rename)

**검토 대상:** `docs/PLAN.md` **v0.9.0** + `docs/RENAME_TO_LOOM.md`(RN1-patched) — product Fable → Loom 구현 diff
**검토자:** Fable 5 — 코드 직접 확인 (Read/Grep; 이 세션은 셸 실행 불가 → `bun test`는 정적 검증으로 대체)
**날짜:** 2026-07-09
**결론:** **`pending-revision`** → **0.9.1 applied / Loom rename baseline approved** (M-14/M-15/M-16 closed)

RN1 필수 5건의 핵심 로직은 모두 실제로 구현됐고(A1~A5 아래 근거), R2~R10 보안 불변식(sanitize, timing-safe, M-7, H-4, H-5)도 리네임 과정에서 손상 없이 보존됐다. 그러나 **live-PID gate를 사후에 무력화하는 하드코딩 `~/.loom` 경로 2곳(M-14)** — RN1 지적 1번이 막으려던 split-brain을 다른 경로로 재도입 — 과 sticky spawn의 레거시 env 기록(M-15), RN1이 요구한 신규 테스트 2종 누락(M-16)이 남아 승인 불가.

### Checklist

| # | 항목 | 판정 | 근거 |
|---|------|------|------|
| A1 | 홈 디렉터리 live-PID gate | **Partial** | `host/src/session-store.ts:141-190` — `~/.loom` 우선, legacy에 live PID(`*.host.json`·`relay.pid`, `collectLivePidsUnder`:73-113) 있으면 rename 중단+안내(:157-167), EXDEV copy는 `.lock`/`.tmp.*` 제외(:115-136). 단 `isPidAlive`는 재사용이 아닌 3번째 복제(:63-71, `sticky-meta.ts:80`과 중복)이고, **M-14가 gate를 우회**하며, gate 단위 테스트 부재(M-16) |
| A2 | MCP dual-strip 정확 구문 앵커 | **Yes** | `adapters/src/user-mcp-config.ts:4-11` 정확 마커, `:11` `\[mcp_servers\.(?:fable\|loom)(?:\.\|])`, `isManagedComment`(:65-73) 정확 구문만 — bare `/loom/i` 없음. `# deadline looming` 보존 테스트 존재(`user-mcp-config.test.ts:137-148`). `hadLegacy` dual(:154-160). H-4 불변식 유지 |
| A3 | Invite prefix 재작성 금지 | **Yes**(테스트만 미비) | mint `LOOM-`(`protocol/src/codes.ts:10`); join은 `registry.getByCode` 전체 코드 `toUpperCase()` 정확 일치(`relay/src/room.ts:503-505`, `server.ts:280`); rewrite 헬퍼 grep 0건. 단 `FABLE-` 코드 join 호환 테스트 없음(M-16) |
| A4 | `INSECURE_OPEN` dual-read 제외 | **Yes** | `protocol/src/env.ts:36-39`, `relay/src/server.ts:76-79`, `relay/src/cli.ts:27-28` 모두 `LOOM_`만 인식; `FABLE_RELAY_INSECURE_OPEN` 읽기 grep 0건 — H-5 재발 없음. 단 계획 §4.1의 "구 env만 설정 시 강한 stderr 경고"는 미구현(Low, 무시 자체는 안전한 방향) |
| A5 | Blast radius 3종 | **Yes** | `/loom`+`/fable` dual(`host/src/slash.ts:13`, 테스트 `slash.test.ts:13-15`); `[LOOM HANDOFF from …]`(`protocol/src/format.ts:23`, 테스트 갱신); `loomSystemHint` 본문 Loom 카피(`adapters/src/hints.ts:2-24`). 잔재: `shell.ts:41` 힌트에 "fable inbox…" 등(Low) |
| B6 | sanitize.ts 무손상 | **Yes** | `protocol/src/sanitize.ts` — ESC/CSI/OSC skip, C0/C1, bidi, zero-width strip 전부 동일; 제품명 문자열 0건; `sanitizeHandoffForOutput`(M-9) 유지 |
| B7 | timing-safe 비교 무손상 | **Yes** | `relay/src/room.ts:41-52` `secretsEqual`, `server.ts:43-55` `timingSafeTokenEqual` — 본문 R5/R10 하드닝 버전 그대로(길이 XOR + `crypto.timingSafeEqual`) |
| B8 | M-7 peerSecret 무손상 | **Yes** | CSPRNG 24B(`codes.ts:32-35`); rejoin 시 secret 필수(`room.ts:131-139`); `peerSecret`은 join 소켓에만(`server.ts:275,321` — roster broadcast 미포함); 세션 0600(`session-store.ts:275-283`); L-15 sticky persist + `setReconnectPeerSecret`(`sticky-server.ts:77-85`, `relay-client.ts:48-53`) 유지 |
| B9 | `@fable/`·`@loom/` 혼재 | **Yes(없음)** | `@fable/` grep 0건; 6개 package.json 전부 `@loom/*`; cli bin `loom`+`fable` alias, root `loom`+`fable` 스크립트 — 계획대로 |
| B10 | 테스트 116 통과 | **미확인(실행 불가)/Partial** | 정적으로는 일관: 16개 파일 `test(` 118건(주장 116과 근사), `FABLE-` 하드코딩 assert 0건(잔존 2건은 CLI usage 텍스트), `envelope.test.ts:151` `/^LOOM-…/`, board·adapters 테스트 신규 이름 기준. 단 RN1 요구 테스트 2종 부재(M-16) — "RN1 tests 포함 green" 기준 미충족 |

### Findings

| Sev | ID | Finding | Suggested change |
|-----|----|---------|------------------|
| **Med** | **M-14** | **하드코딩 `~/.loom`이 migration resolver를 우회** — `host/src/relay-daemon.ts:12-18,85,100`(pidPath/mkdir/pid write)과 `mcp-server/src/config.ts:16,39`(mcp.json/AGENT_HINT)가 `join(homedir(), ".loom")` 직접 사용. live-PID로 migration이 차단된 상태(state home=`~/.fable`)에서 `loom run`(cli `index.ts:1072` `writeMcpConfig`)이나 로컬 relay spawn이 `~/.loom`을 생성하면, 다음 프로세스의 `resolveStateHomeDir`가 `existsSync(loom)`(:147)에서 단락 → `~/.fable`은 영구히 미이관·무경고 방치(세션/보드/팩 고아화, "not in a room"). RN1 지적 1번의 acceptance("no split-brain") 위반 | 두 파일 모두 `loomDir()`/`resolveStateHomeDir()` 경유로 통일(mcp-server는 CLI가 dir를 넘기거나 helper를 protocol/host로 이동). 또는 `resolveStateHomeDir`가 "loom 존재 + legacy 존재 + 미이관" 상태를 감지해 경고/재시도 |
| Med | **M-15** | sticky host spawn이 자식 env에 레거시 이름만 기록 — `host/src/sticky-spawn.ts:53,56` `FABLE_SESSION`/`FABLE_PROFILE`. 계획 §4.1 "write path는 LOOM_*만" 위반; 모든 sticky host가 deprecation 경고를 출력하고, 0.10에서 dual-read 제거 시 조용히 파손 | `LOOM_SESSION`/`LOOM_PROFILE`로 기록(전환기 양쪽 기록도 가) |
| Med | **M-16** | RN1 Phase D 필수 테스트 2종 누락: (1) live-PID gate 단위 테스트(`session-store` 테스트 파일 자체가 없음), (2) `FABLE-` 전체 코드 join 호환 + "no prefix rewrite" 테스트(`room.test.ts:196`은 신규 mint 코드만) | 두 테스트 추가 후 `bun test` 결과 재보고 |
| Low | | `isManagedComment`의 `/WARNING: legacy/i`(`user-mcp-config.ts:71`)가 fable/loom과 무관한 일반 구문 — 사용자 주석 `# WARNING: legacy config` 오삭제 가능 | `WARNING: legacy \[mcp_servers\.(fable\|loom)\]` 등으로 스코프 한정 |
| Low | | §4.1 약속한 "구 `FABLE_RELAY_INSECURE_OPEN`만 설정 시 강한 stderr" 미구현(조용히 무시) | 기동 시 구 env 감지 → 1회 경고 출력 |
| Low | | copy fallback이 검증 없이 legacy 삭제 — `session-store.ts:176-182` 주석("leave legacy in place")과 코드(`rmSync`) 모순; 계획은 "verified 후 제거" | 파일 수/크기 대조 후 삭제 또는 주석·정책 일치화 |
| Low | | 잔존 Fable 브랜딩(기능 무관): `relay/server.ts:151` "Fable Relay", `cli/index.ts:129,133` usage의 `fable … join FABLE-XXXX`, `:613` "fable-board-snapshot" 메시지, `codex.ts:56`/`grok.ts:56` 헤더, `shell.ts:41` 힌트, `mcp-server/stdio.ts:210` serverInfo version `"0.7.3"` stale | 일괄 정리(0.9.1 PATCH 가) |

### Decision notes

보안 diff 3곳(B2 migration / B5 MCP strip / B3 invite)에 집중 검토한 결과, **B5·B3은 깨끗하고 B2만 문제** — 그것도 gate 로직 자체가 아니라 gate를 우회하는 인접 코드(M-14)다. 55파일 치환에도 sanitize/timing-safe/M-7 로직 본문은 바이트 단위로 무손상임을 확인했다.

M-14는 RN1 High(#1)의 변종이므로 0.9.1 PATCH로 수정 후 재리뷰는 해당 diff만 보면 된다. M-15·M-16은 같은 PATCH에 동봉 가능.

"116 pass" 주장은 이 세션 도구 제약으로 실행 검증 불가 — 정적 근거상 신빙성 있으나, 0.9.1 재리뷰 요청 시 `bun test` 출력 첨부 요망.

**요약:** 리네임 자체는 성실하게 구현됐고 보안 회귀는 없다. 승인을 막는 것은 단 하나의 실질 결함 — `relay-daemon.ts:12-18`과 `mcp-server/config.ts:16,39`의 하드코딩 `~/.loom`이 migration 차단 상태에서 `~/.loom`을 조기 생성해 `session-store.ts:147`의 단락 조건을 트리거, `~/.fable` 상태를 무경고로 고아화한다(M-14). 여기에 `sticky-spawn.ts:53,56` 레거시 env 기록(M-15)과 RN1 필수 테스트 2종 누락(M-16)을 더해 **pending-revision**. 세 건 모두 소규모 PATCH로 해소 가능하다.

관련 파일: `packages/host/src/{session-store,relay-daemon,sticky-spawn,sticky-meta}.ts`, `packages/mcp-server/src/config.ts`, `packages/adapters/src/user-mcp-config.ts`, `packages/relay/src/{room,server,cli}.ts`, `packages/protocol/src/{env,codes,sanitize,format}.ts`

승인 시: `docs/PLAN.md` Version → **0.9.1** (PATCH) — M-14(migration 우회 경로 통일)/M-15(sticky spawn env)/M-16(누락 테스트 2종) 반영 후 rename을 `done`으로 표기.

### R11 follow-up (0.9.1 — applied)

| Finding | 처리 |
|---------|------|
| **M-14** | `relay-daemon.ts` + `mcp-server/config.ts` → `loomDir()` / `resolveStateHomeDir` |
| **M-15** | `sticky-spawn.ts` writes `LOOM_SESSION`/`LOOM_PROFILE` (+ FABLE dual for transition) |
| **M-16** | `session-store.test.ts` live-PID gate; `room.test.ts` FABLE- full-code lookup (no LOOM- rewrite) |
| PLAN | **v0.9.1** `approved`; Loom rename **done** |
| Tests | `bun test` **124 pass** |

---

## Review R10 — Plan v0.8.0

**검토 대상:** `docs/PLAN.md` **v0.8.0** (`pending-review`) — Part A: 0.7.2 L-11 / 0.7.3 L-12 이월 + Part B: M-7 per-peer rejoin secret
**검토자:** Fable 5 — 코드 직접 확인
**날짜:** 2026-07-09
**결론:** **`pending-revision`** → **0.8.1 applied / M-7 baseline approved** (Med M-13 + L-15 closed; L-14/L-16 backlog)

M-7 코어 메커니즘은 견고함: CSPRNG 24B secret, 타이밍-세이프 비교, 소켓 단독 전달, 동기 처리로 race 부재, 레거시 bypass 경로 없음, 문서 정직. 그러나 계획이 명시한 "Explicit failure mode"가 **`fable run` 경로에서 지켜지지 않음** — join 결과를 검사하지 않아 `peer_auth_failed`가 완전히 무음으로 삼켜지고, 에이전트는 room에 없는 채로 기동한다(M-9/M-12와 같은 "인접 경로 누락" 패턴 재발). 신원 탈취는 막혔으므로 High는 아니나, 사용자가 handoff를 받고 있다고 착각하는 상태가 되므로 Med 블로커.

### Checklist

| # | 항목 | 판정 | 근거 |
|---|------|------|------|
| A-1 | 0.7.2 L-11 caps/eviction | **Yes** | `protocol/src/envelope.ts:30-33,35-39,56-61`(zod max); `relay/src/room.ts:290-307`(slice), `:326-350`(trim 100/peer), `:472-475`(claim 시 삭제) |
| A-2 | 0.7.3 L-12 lock pid + sleep | **Yes** | `host/src/atomic-json.ts:85-105`(owner.pid), `:148-157`(stale**AND**dead만 reclaim), `:120-134`(pid 불일치 release 거부), `:160-176`(Bun.sleepSync/Atomics.wait) |
| B-1 | secret 생성 CSPRNG | **Yes** | `protocol/src/codes.ts:32-35` — `crypto.getRandomValues` 24B base64url |
| B-2 | 타이밍-세이프 비교 | **Partial** | `relay/src/room.ts:41-52` `secretsEqual` — 동작은 `timingSafeTokenEqual`(`server.ts:43-55`)과 동일(패딩+길이플래그)하나 **재사용이 아닌 복사본** (L-14) |
| B-3 | 첫 join race | **Yes** | `relay/src/server.ts:242-332` create/join 핸들러 완전 동기(내부 await 없음) + `room.ts:118-170` addPeer 동기 → 단일 스레드에서 직렬화; 두 번째 동시 first-join은 existing 경로로 빠져 `peer_auth_failed`. 이중 발급/무방비 창 없음 |
| B-4 | 레거시 bypass | **Yes** | `room.ts:34` `secret: string` 비옵셔널, `:164` 생성 시 항상 발급; RoomRegistry는 인메모리 전용(영속 없음) → secret 없는 member 존재 불가. `:132` `!partial.secret ||`로 빈 문자열도 거부 |
| B-5 | secret 전달 채널 | **Yes** | `server.ts:270,316` join한 소켓의 room.state에만; `:363` list_peers는 secret 없는 envelope(`room.ts:241`); URL 경로 없음 — `relay-client.ts:77-92`는 relay token만 다루며 header 우선(H-6 유지) |
| B-6 | 세션 0600 / host.json | **Yes** | `session-store.ts:105-113` 생성 시점 `mode: 0o600`(race 없음)+chmod; `sticky-meta.ts:14-25` StickyHostMeta에 peerSecret **없음**(IPC token만) |
| B-7 | host↔CLI secret 공유 | **Yes** | 단일 SSOT=세션 파일: sticky `sticky-server.ts:56,66`, one-shot `room-ops.ts:50` 모두 `session.peerSecret` 전송; one-shot은 재발급 시 저장(`room-ops.ts:56-63`). host 우선(tryStickyRpc)이라 동시 동일-id 소켓도 정상 흐름엔 없음. 단 sticky는 미저장 (L-15) |
| B-8 | `peer_auth_failed` 처리 | **Partial** | 무음 새-peerId 폴백은 **없음**(모든 경로가 session.peerId 재사용). create/join/listen/one-shot/sticky는 에러 노출(`cli:293-296,949-952`, `room-ops.ts:52-54`, `sticky-server.ts:68-71`). **그러나 `fable run`은 join 결과 미검사**(`cli/src/index.ts:1149-1156`) + run의 onEnvelope가 error envelope 미출력 + reconnect join 실패는 `onError`로만 전달되는데(`relay-client.ts:157-160`) listen/run/sticky 모두 onError 미설정 → 무음 (M-13) |
| B-9 | threat model 문서 | **Yes** | `apps/relay-cloud/README.md:54-64`(표+residual: lost session, rate limit 없음, 로그 위생); `docs/PROTOCOL.md:25-32`; 로테이션/mTLS 부재는 PLAN 0.8.0 "Not in" 명시. 테스트도 실재: `auth.integration.test.ts:209-235`, `server.integration.test.ts:97-110`, `hetero.handoff.test.ts:58-65` |

### Findings

| Sev | ID | Finding | Suggested change |
|-----|----|---------|------------------|
| Med | **M-13** | `fable run`이 joinRoom 반환 미검사 → `peer_auth_failed`(및 room_not_found)가 무음; 에이전트가 room 밖에서 기동, notify 경로 사망. reconnect 후 join 실패도 onError 미배선으로 무음(계획의 "explicit failure mode" 위반; M-9/M-12류 인접경로 누락 재발) | `cli/src/index.ts:1149` 반환값 검사 후 cmdListen(:949-952)처럼 에러 종료; run onEnvelope에 `error` 케이스 추가; listen/run/sticky RelayClient에 `onError` 배선(stderr) |
| Low | **L-14** | `secretsEqual`이 `timingSafeTokenEqual`의 복사본 — 향후 한쪽만 수정되는 F-1류 회귀 벡터 | 유틸을 `@fable/protocol`로 이동, `room.ts`/`server.ts`/`sticky-server.ts` 모두 import |
| Low | **L-15** | sticky host는 join 응답의 `env.peerSecret`을 세션에 미저장(one-shot은 저장). 현재는 도달 어려운 경로지만 host만 secret을 아는 상태 가능 | `sticky-server.ts:67` 이후 room-ops와 동일하게 saveSession |
| Low | **L-16** | 0.7.2 "256KB"는 실제로 256k **chars**(UTF-16 ≈ 최대 512KB 메모리/1MB UTF-8) — 단위 부정확 | PLAN/문서에 chars 명시 또는 byte 기준 cap으로 변경 |

### Decision notes

**Part A 실증 완료.** L-11/L-12는 주장대로 코드에 반영됨. `sleepMs`의 최후 폴백(:169-175)만 busy-loop이나 SharedArrayBuffer 실패 시에만 도달 — 수용.

**race/bypass 부재의 근거는 "동기성"**: create/join 핸들러에 await가 하나라도 들어가면 B-3 보장이 깨진다. 향후 relay에 async 저장소(durable inbox 등)를 넣을 때 이 불변식을 테스트로 고정할 것.

명시 `leave` 후에는 peerId 슬롯이 해제되어 재점유 가능(secret 무의미) — 의도된 설계이나 PROTOCOL에 이미 암시됨, 추가 조치 불요.

**M-13이 0.8.1 PATCH로 닫히면 approve** — 코어 메커니즘(B-1~B-6)은 재리뷰 불요, run/listen 에러 표면화만 확인하면 됨.

관련 파일: `packages/relay/src/{room,server}.ts`, `packages/protocol/src/{codes,envelope}.ts`, `packages/host/src/{session-store,sticky-server,sticky-meta,room-ops,atomic-json}.ts`, `packages/cli/src/index.ts`, `apps/relay-cloud/README.md`, `docs/PROTOCOL.md`

승인 시: `docs/PLAN.md` Version → **0.8.1** (PATCH) — M-13(run/listen/sticky join 실패 표면화) 반영 후 M-7을 `done`으로 표기; L-14~L-16은 backlog.

### R10 follow-up (0.8.1 — applied)

| Finding | 처리 |
|---------|------|
| **M-13** | `cli` `fable run`: join 반환 검사 후 exit 1; `onEnvelope` error; run/listen/sticky `onError` → stderr |
| **L-15** | `sticky-server` saveSession(peerSecret); `RelayClient.setReconnectPeerSecret` (room.state 시 reconnectJoin 동기화) |
| L-14, L-16 | backlog 유지 |
| PLAN | **v0.8.1** `approved`; M-7 **done** |

---

## Review R7 — Plan v0.5.0

**검토 대상:** `docs/PLAN.md` **v0.5.0** (Part A: 0.4.1 F-1/F-2/F-3 이월 + Part B: Phase 4.1 Context Pack)  
**검토자:** Fable 5 — 코드 직접 확인  
**날짜:** 2026-07-09  
**결론:** **`approved`** (Low follow-up → 0.5.1 / backlog; 재리뷰 불필요)

Part A 수정은 코드·테스트로 실증. Part B context pack은 allowlist(realpath), opt-in attach, **수신측 fs 비사용**으로 핵심 위협이 해소됨. High/Med finding 없음.

### Checklist (요약)

| # | 항목 | 판정 |
|---|------|------|
| A-1 F-1 sticky timing-safe | **Yes** |
| A-2 F-2 host↔session match | **Yes** |
| A-3 F-3 RPC serialize | **Yes** |
| B-1 cwd realpath allowlist | **Yes** (symlink test → 0.5.1) |
| B-2 roomId hash key | **Yes** (room-scoped, not profile) |
| B-3 with-pack opt-in | **Yes** |
| B-4 sanitize multi-layer | **Yes** |
| B-5 receiver no FS open | **Safe** |
| B-6 get_context_pack local | **Yes** |

### Findings (R7)

| Sev | ID | Status (0.5.1) |
|-----|-----|----------------|
| Low | L-1 room-scoped multi-profile share | **done** — intentional + PLAN/README |
| Low | L-2 symlink regression test | **done** |
| Low | L-3 label prefix + sender-relative hint | **done** |
| Low | L-4 requestOnce correlation | **deferred** backlog |
| Low | L-5 v2 embed TOCTOU | **deferred** until embed |

### Decision notes

- **Invariant (PLAN Security):** receivers must not open pack path attachments as filesystem paths.
- **L-1 choice:** keep room-scoped key (`sha256(roomId)`); document same-UID profile sharing.
- Approve **0.5.0** as Phase 4.1 baseline; **0.5.1** closed L-1–L-3.

### R7 follow-up (0.5.1 — applied)

| Finding | 처리 |
|---------|------|
| L-1 | PLAN Security + Open follow-ups + README room-scope wording |
| L-2 | `context-pack.test.ts` symlink outside cwd |
| L-3 | `context-pack-path:` / `context-pack-path:<label>`; `hints.ts` warning |
| PLAN | **v0.5.1** `approved`, Phase 4.1 **done** |
| Docs structure | R1–R6 → `plan_review_archive.md`; this file stays current |

---

## Review R8 — Plan v0.6.0

**검토 대상:** `docs/PLAN.md` **v0.6.0** (Part A: 0.5.1 L-1/L-2/L-3 이월 + Part B: Phase 4.2 Task Board)
**검토자:** Fable 5 — 코드 직접 확인
**날짜:** 2026-07-09
**결론:** **`pending-revision`**

Part A(L-1~L-3)는 코드·테스트·문서로 전부 실증됨. Part B는 키잉/권한/로컬 전용/sanitize 큰 틀은 맞으나, **보드 파일 동시 쓰기 경로에 잠금·원자적 쓰기가 전혀 없고, torn read 시 빈 보드로 폴백 후 저장하면 보드 전체가 유실되는 증폭 경로(H-7)**가 있어 승인 보류. 부수적으로 partial-id 매칭 버그(M-8)와 기존 handoff 경로의 sanitize 우회(M-9)를 발견.

### Checklist

| # | 항목 | 판정 | 근거 |
|---|------|------|------|
| A-1 | L-1 room-scope 공유 문서화 | **Yes** | `docs/PLAN.md`:396, 471–473, 509, 565; `README.md`:107 |
| A-2 | L-2 symlink 회귀 테스트 | **Yes** | `packages/host/src/context-pack.test.ts`:85–97 (cwd 밖 symlink → throw) |
| A-3 | L-3 label prefix + sender-relative 힌트 | **Yes** | `packages/host/src/context-pack.ts`:284–294; `packages/adapters/src/hints.ts`:20; 테스트 111–130 |
| B-1 | `sha256(roomId)` 키 + 0600 | **Yes** | `packages/host/src/task-board.ts`:68–71, 149–157 — pack(`context-pack.ts`:56–59, 114–122)과 동일 패턴 |
| B-2 | 자유 텍스트 sanitize (터미널+MCP 양쪽) | **Partial** | title/notes/assignee는 저장(`saveTaskBoard`:146)과 로드(`loadTaskBoard`:105–108) 양쪽에서 `normalizeTask`(121–138)로 sanitize; CLI show·MCP list 모두 `loadTaskBoard` 경유. 단 `id`/`handoffId`는 미소독 통과 후 `formatTaskBoard`:290–291에 raw 출력 (→ L-6) |
| B-3 | MCP 도구 로컬 전용 (relay 미노출) | **Yes** | relay src grep — board 코드 경로 없음(handoff `mode:"task"` 문자열뿐); `sticky-server.ts`·`room-ops.ts`에도 없음; `add_task`/`update_task`는 stdio MCP에서 로컬 파일 직접 접근 (`tools.ts`:114–160) |
| B-4 | handoffId가 실존 handoff 참조 | **Partial** | 생성 경로는 실제 송신 ack의 `handoffId`만 사용하고 `peer_unknown` 제외 (`cli/src/index.ts`:400–408, `tools.ts`:57–76). 임의 문자열 주입 경로는 CLI/MCP에 없음(`updateTask` patch.handoffId 미노출). 단 이후 재검증 없음 — inbox는 relay 메모리이므로 relay 재시작 시 dangling(설계상 불가피, 문서화 필요) |
| B-5 | 공유 수정 의도 + 동시 쓰기 안전 | **Partial** | same-UID 내 임의 수정은 pack L-1과 동일 논리로 의도(PLAN 0.6.0 changelog:53, `createdByPeerId` 기록만·미강제). **동시 쓰기 보호는 없음 → H-7** |
| B-6 | clear-done 확인 절차 | **Partial** | MCP 미노출 확인(`stdio.ts` TOOLS:24–150 — list/add/update만; rm/clear 없음). CLI는 확인 프롬프트 없음 + `clear` alias (`cli/src/index.ts`:514–517) → L-7 |

### Findings

| Sev | ID | Finding | Suggested change |
|-----|----|---------|------------------|
| **High** | H-7 | 보드 파일 load-modify-save에 잠금·원자쓰기 없음. `writeFileSync`가 O_TRUNC로 직접 최종 경로에 쓰므로(`task-board.ts`:149) 동시 reader가 빈/부분 파일을 읽음 → `loadTaskBoard` catch가 `emptyBoard` 반환(116–118) → 그 프로세스가 `addTask`로 저장하면 **보드 전체 유실**. 단순 last-writer-wins 유실도 존재. 여러 에이전트가 doing/done을 동시 갱신하는 이 기능의 핵심 시나리오에서 발생 확률 높음 | (1) temp 파일 + `renameSync` 원자 교체, (2) lockfile(O_EXCL/mkdir + stale timeout) 또는 재시도로 read-modify-write 직렬화, (3) parse 실패 시 빈 보드 취급 금지 — `.corrupt-<ts>` 백업 후 에러. `context-pack.ts`:114도 동일 패턴이므로 같이 수정 권장 |
| Med | M-8 | `updateTask`/`findTask`의 id 매칭이 `t.id.includes(taskId)`(`task-board.ts`:209–211, 270–272) — 짧은 부분 문자열이 **첫 매치에 조용히 적용**되고, `id=""`이면 `includes("")===true`로 첫 task가 수정됨(`stdio.ts`:228 `String(args.id ?? "")` 경유 실제 도달 가능). relay claim의 모호성 에러(`room.ts`:370–377)·`removeTask`의 endsWith(247–249)와도 불일치 | 빈 id 거부; prefix/suffix 매칭으로 통일하고 복수 매치 시 에러(relay claim 방식) |
| Med | M-9 | (신규 발견, 기존 handoff 경로) relay가 **peer 제공 handoff id를 그대로 수용**(`room.ts`:255 `partial.id ?? generateHandoffId()`; 정상 클라이언트는 id를 안 보냄)하고, `sanitizeHandoffForOutput`은 body/attachments만 소독(`sanitize.ts`:88–99). `renderInbox`가 `handoff.id`/`fromPeerId`/`mode`를 raw 출력(`presence.ts`:54–55, `fable inbox`·listen pending 경로) → 악성 peer가 id에 ESC/OSC를 넣어 수신자 터미널에 도달 가능. "모든 peer-controlled 문자열 sanitize" 불변식 위반 | relay에서 client 제공 id 무시(항상 `generateHandoffId()`) 또는 `/^ho_[A-Za-z0-9]+$/` 검증; 방어층으로 `sanitizeHandoffForOutput`에 id/mode/fromPeerId 포함 |
| Low | L-6 | `normalizeTask`가 `id`/`handoffId`를 미소독 통과(`task-board.ts`:126, 132), `formatTaskBoard`:290–291에서 raw 출력. 오염 경로는 악성 relay ack 또는 same-UID 파일 조작 정도로 낮음 | normalizeTask에서 id류 필드 형식 검증(`^(task|ho)_[A-Za-z0-9]+$`) 또는 sanitize |
| Low | L-7 | `clear-done`에 확인 프롬프트 없음 + 축약 alias `clear`(`cli/src/index.ts`:514). MCP 미노출이라 파괴 범위는 done/cancelled 한정 | bare `clear` alias 제거, N건 초과 삭제 시 `--yes` 요구 (선택) |
| Low | L-8 | 문서 갭: PLAN Security 표의 sanitize 대상 목록에 board title/notes/assignee 누락; handoffId dangling(relay 재시작 후) 미명시 | Security 표에 board 필드 추가; "handoffId는 traceability 문자열, 참조 무결성 미보장" 1줄 명시 |

### Decision notes

**Part A 종결:** L-1~L-3 모두 코드로 확인. Phase 4.1 baseline(0.5.1) 유지.

**B-3/B-5 의도 판정:** "not relay-synced"는 정직함 — relay 프로토콜·sticky RPC 어디에도 board 경로 없음. same-UID 임의 수정은 R7 L-1과 동일한 신뢰 모델로 수용.

**차단 사유:** H-7 하나. context pack은 사람이 저빈도로 관리하지만 board는 다중 에이전트 동시 갱신이 기본 시나리오이므로 R7 때와 달리 원자쓰기+잠금 없이는 done 처리 불가. H-7+M-8 수정 시 PATCH(0.6.1)로 재리뷰 없이 승인 가능; M-9는 board 밖 기존 경로이므로 0.6.1 동승 또는 별도 PATCH 허용.

관련 파일: `packages/host/src/task-board.ts`, `packages/host/src/context-pack.ts`, `packages/mcp-server/src/stdio.ts`, `packages/relay/src/room.ts`, `packages/host/src/presence.ts`, `packages/protocol/src/sanitize.ts`

승인 시: `docs/PLAN.md` Version → **0.6.1** (PATCH) — H-7/M-8/M-9 반영 후 Phase 4.2 `done`.

### R8 follow-up (0.6.1 — applied)

| Finding | 처리 |
|---------|------|
| H-7 | `packages/host/src/atomic-json.ts` — `writeAtomicJson`, `withFileLock`, `readJsonFile` corrupt backup; used by task-board + context-pack |
| M-8 | `resolveTaskIndex` exact then unique endsWith; no `includes`; empty throws |
| M-9 | `room.resolveHandoff` always `generateHandoffId()`; `sanitizeHandoffForOutput` + `renderInbox` sanitize id/from/mode |
| L-6 | task/handoff id regex on normalize |
| L-7 | `board clear-done --yes` only |
| L-8 | PLAN Security + handoffId dangling note |
| PLAN | **v0.6.1** `approved`, Phase 4.2 **done** |

---

## Review R9 — Plan v0.7.0 (Phase 4.3a Board Snapshot Share + 0.6.1 이월 검증)

**검토 대상:** `docs/PLAN.md` **v0.7.0** (`pending-review`) — Part A: 0.6.1 H-7/M-8/M-9 이월 + Part B: Phase 4.3a Board Snapshot Share
**검토자:** Fable 5 — 코드 직접 확인
**날짜:** 2026-07-09
**결론:** **`pending-revision`**

Part A(0.6.1 이월)는 3건 모두 실제 코드로 정확히 구현되어 **Phase 4.2 baseline으로 승인 가능**. Part B(4.3a)는 import 경로가 `normalizeTask` 재sanitize와 lock/atomic 저장을 올바르게 통과하는 등 골격은 건전하나, 신규 신뢰 경계에서 Med 3건이 발견됨: (M-10) merge의 `updatedAt`이 peer가 위조 가능한 무검증 문자열이라 악의적 스냅샷이 항상 로컬 task를 덮어씀, (M-11) `importBoardSnapshot`의 kind-check 지름길이 `parseBoardSnapshot` 검증을 우회해 기형 스냅샷으로 TypeError 크래시 유발, (M-12) `import-handoff`의 id 매칭이 모호성 검사 없는 `endsWith` first-match — **M-8에서 방금 고친 패턴을 신규 코드가 재도입**(이 시리즈의 반복 패턴, F-1/M-5 회귀와 동일 구조). 세 건 모두 국소 수정이므로 0.7.1 PATCH로 해소 가능.

### Checklist

**Part A — 0.6.1 이월**

| # | 항목 | 판정 | 근거 |
|---|------|------|------|
| H-7 | atomic write + lock + corrupt backup (board·pack) | **Yes** | `packages/host/src/atomic-json.ts:25-39` temp+`renameSync`+0600(진짜 temp+rename); `:103-124` `mkdirSync` 원자성 기반 배타 락(stale 5s 회수, 4s 대기); `:45-68` corrupt→`.corrupt-<ts>` 백업+throw. board 적용 `task-board.ts:191-193,197-215`; pack 적용 `context-pack.ts:114-116`. 락은 실제로 동시 접근 차단(경미한 stale-회수 race는 L-12) |
| M-8 | task id exact/unique-suffix, 빈/모호 에러 | **Yes** | `task-board.ts:110-130` — exact→unique suffix, 빈 문자열·다중 매치 throw. `includes()` 없음. update/rm/find 모두 경유 |
| M-9 | 서버측 handoff id + 출력 sanitize | **Yes** (Low 잔여) | `relay/src/room.ts:255-256` 항상 `generateHandoffId()`(클라이언트 id 무시); mode는 zod enum(`envelope.ts:51,174-185`); `sanitize.ts:88-113` `sanitizeHandoffForOutput`이 `room-ops.ts:209,256`·`sticky-server.ts:110,160`에 적용. 잔여: live notify 표시 경로(`format.ts:16,21`)는 raw `fromPeerId` fallback — L-13 |

**Part B — Phase 4.3a**

| # | 항목 | 판정 | 근거 |
|---|------|------|------|
| B-1 | import 시 normalizeTask 재sanitize | **Yes** | `task-board.ts:449-458`(parseBoardSnapshot→normalizeTask), `:479`(import 재정규화), `:188,209`(저장 시 3차). title/notes/assignee sanitize + id regex 강제 → JSON `` 재구성 공격 차단. 단 timestamps/sourceRoomName 미sanitize — L-10 |
| B-2 | updatedAt 위조로 merge 지배 | **No (취약)** | `task-board.ts:488` `(t.updatedAt \|\| "") >= (cur.updatedAt \|\| "")` 사전순 비교; `:176` normalizeTask가 raw 유지. `"9999-…"` 또는 `"~"` 같은 비ISO 문자열이 모든 로컬 task를 항상 덮어씀 — M-10 |
| B-3 | roomId 불일치 거부 | **No** | `importBoardSnapshot`(`:467-496`)은 `sourceRoomId` 완전 무시(기본값 `"unknown"`, `:446`). 임의 room 스냅샷이 현재 board에 조용히 병합 — L-9 |
| B-4 | import-handoff attachment 타입 검증 | **Partial** | `snapshotFromAttachments`(`:499-512`)가 label 매치+`parseBoardSnapshot`+try/catch → 임의 handoff는 깨끗한 에러, 크래시 없음. **그러나** ① `importBoardSnapshot:472-477` kind 지름길이 검증 우회(M-11) ② handoff id 매칭 `cli/src/index.ts:587-591` `endsWith` first-match(M-12) |
| B-5 | --with-board 크기 제한 | **Partial** | 스냅샷 자체는 암묵 상한(~≤300KB: MAX_TASKS 200 × title 200 + note 1000, `task-board.ts:64-66` + export 시 normalize). 그러나 relay측 attachment 명시 상한 없음(`envelope.ts:31` `z.string()` 무제한)이고 claimed/accepted 항목이 room 수명 동안 Map에 잔존(`room.ts:275-288,392-394` — 상태만 변경, 삭제 없음) — L-11 |
| B-6 | import가 lock/atomic 경유 | **Yes** | `importBoardSnapshot` → `mutateBoard`(`:481`) → `withFileLock`+`writeAtomicJson`. 우회 저장 경로 없음. `board export`의 `Bun.write`(`cli:548`)는 board 파일이 아닌 export 대상 파일이므로 무관 — 회귀 없음 |

### Findings

| Sev | Finding | Suggested change |
|-----|---------|------------------|
| **Med M-10** | merge "최신 updatedAt 승리"의 `updatedAt`이 peer 제공·무검증 문자열(`task-board.ts:176,488`). 위조 미래/비ISO 값으로 악의적 peer가 로컬 task를 무조건 덮어씀(내용은 sanitize되나 무결성 상실) | normalizeTask에서 ISO-8601 regex 검증(불합격 → import 시각으로 대체) + import 시 `min(updatedAt, now)` clamp; merge 신뢰 모델을 PLAN Security 표에 명시 |
| **Med M-11** | `importBoardSnapshot:472-477` — `kind`만 맞으면 `parseBoardSnapshot` 생략하고 cast. `{kind:"fable-board-snapshot",tasks:null}` 또는 `tasks:[null]`이 CLI `board import`·MCP `import_board`에서 TypeError 크래시 | 지름길 제거, 항상 `parseBoardSnapshot(snapshot)` 통과(멱등이므로 안전) |
| **Med M-12** | `cli/src/index.ts:587-591` — handoff id를 `endsWith` first-match로 해석, 모호성 검사 없음. M-8 수정 패턴의 신규 코드 재도입(짧은 suffix가 엉뚱한 handoff의 스냅샷을 조용히 적용) | `resolveTaskIndex`/`claimHandoff`와 동일한 exact→unique-suffix-or-error 헬퍼로 통일 |
| Low L-9 | `sourceRoomId` 미검사 — 다른 room 스냅샷이 현재 board에 조용히 병합 | 불일치 시 경고 + `--force` 요구 |
| Low L-10 | task `createdAt`/`updatedAt`, snapshot `sourceRoomName`/`exportedAt` 미sanitize로 로컬 파일 저장·MCP 응답에 raw 노출(현재 `board show`는 미출력 — 잠재적) | normalizeTask/parseBoardSnapshot에서 sanitize+형식 검증(M-10 수정과 동일 지점) |
| Low L-11 | relay attachment 명시 크기 상한 없음 + claimed 후에도 inbox 항목 영구 잔존 → 반복 `--with-board` broadcast 시 relay 메모리 누적 | `HandoffAttachmentSchema.content`에 `.max()`(예: 256KB) + claimed/accepted 항목 eviction 또는 TTL |
| Low L-12 | `withFileLock` stale 회수 race(두 대기자가 동시에 stale 판정 → 한쪽이 상대의 새 락 rmdir 가능, `atomic-json.ts:107-111`) + `sleepMs` busy-spin 최대 4초 CPU 점유(`:96-100`) | MVP 수용 가능; pid 기록 후 소유 확인 삭제 + `Atomics.wait`/async sleep 백로그 |
| Low L-13 | live notify 렌더(`format.ts:16`)가 roster 미발견 시 raw `fromPeerId` 출력 — peerId는 클라이언트 제공(M-7)이라 listen 터미널에 ANSI 도달 가능 | `formatHandoffBlock`에서 who/id/mode 한 줄 sanitize |

### Decision notes

**Part A는 완결.** 0.6.1을 Phase 4.2 baseline으로 확정해도 됨. `writeAtomicJson`은 진짜 temp+rename이고, 락은 `mkdir` 원자성 기반으로 실제 동작하며, corrupt 시 빈 보드 오인 경로(H-7의 핵심)는 backup+throw로 제거됨.

**Part B의 설계 자체는 건전.** 3중 normalize(파스→import→저장)와 mutateBoard 경유는 정확히 올바른 구조이며, "not live sync" 스코프 제한도 정직함. 문제는 전부 경계 디테일: 타임스탬프 신뢰(M-10), 검증 지름길(M-11), id 매칭 완화(M-12).

**반복 패턴 경고:** M-12는 이 시리즈에서 세 번째로 발견된 "신규 코드가 직전 수정의 안전장치를 우회" 사례(F-1/M-5, M-9에 이어). 신규 코드가 기존 헬퍼(resolve/lock/sanitize)를 재사용하는지 확인하는 체크 항목을 리뷰 게이트에 상설화할 것을 권고.

세 Med 모두 단일 파일 국소 수정 → **0.7.1 PATCH 후 재리뷰 불필요**(수정 확인만으로 approve 가능). L-9~L-13은 backlog 허용.

관련 파일: `packages/host/src/task-board.ts`, `packages/host/src/atomic-json.ts`, `packages/relay/src/room.ts`, `packages/protocol/src/sanitize.ts`, `packages/cli/src/index.ts`, `packages/mcp-server/src/tools.ts`, `packages/protocol/src/format.ts`

승인 시: `docs/PLAN.md` Version → **0.7.1** (PATCH) — M-10/M-11/M-12 반영 후 Phase 4.3a `done`.

### R9 follow-up (0.7.1 — applied)

| Finding | 처리 |
|---------|------|
| M-10 | `normalizeTimestamp` + merge uses `Date.parse` after clamp |
| M-11 | `importBoardSnapshot` always `parseBoardSnapshot` |
| M-12 | `resolveHandoffEntryIndex` in CLI import-handoff |
| L-9 | foreign `sourceRoomId` needs `force` |
| L-13 | `formatHandoffBlock` sanitizes who/id/mode |
| PLAN | **v0.7.1** `approved`, Phase 4.3a **done** |

---

## How to add a new review

1. Bump `docs/PLAN.md` Version / Status = `pending-review`.
2. Append `## Review R{N} — Plan vX.Y.Z` **here** (keep archive for old full text if this file grows again).
3. Update **Open**, **Review index**, header **최신**.
4. On approve: PLAN Status `approved`; move closed findings to Recent follow-ups.
5. If this file exceeds ~200 lines of closed history, move older `## Review R*` bodies into the archive.
