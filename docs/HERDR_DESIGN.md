# HERDR_DESIGN — Loom × Herdr 노드 브릿지 설계서

| | |
|--|--|
| **Status** | draft — PLAN 미편입 (편입 제안: §6) |
| **Date** | 2026-07-17 |
| **Scope** | 수직 슬라이스(노드 1개, WSL2) 통과에 필요한 최소 설계. 확장은 각 절 "이후"로 분리 |
| **Related** | [`loom-herdr-architecture.html`](./loom-herdr-architecture.html) (외부 권고 문서 아카이브) · [`PLAN.md`](./PLAN.md) · [`WORKFLOW.md`](./WORKFLOW.md) §3.5 · [`UNKNOWNS.md`](./UNKNOWNS.md) · [`DRY_RUN_RUNBOOK.md`](./DRY_RUN_RUNBOOK.md) |
| **작성 방식** | 멀티에이전트 워크플로 — 코드베이스 정찰 4 + 섹션 초안 4 + 적대적 코드 대조 검증 4. 검증에서 발견된 사실 오류 5건 교정 반영 |

## 0. 요약

Windows 호스트는 **Loom relay(컨트롤 타워)만** 돌리고, herdr는 **Linux/Mac/WSL2 네이티브에서만** 돌린다. 각 노드의 **노드 브릿지** 데몬이 위로는 relay WebSocket, 아래로는 herdr 로컬 소켓을 통역한다. 칸반 카드는 타워의 board가 소유하고, dispatch/done 이벤트는 기존 `handoff`(mode:'task') + body-prefix 컨벤션으로만 실어 **relay 와이어(protocol v1)를 변경하지 않는다**.

핵심 결정:

| 결정 | 선택 | 근거 |
|---|---|---|
| 프로세스 모델 | `loom bridge` 서브커맨드 + detach 데몬 | sticky host 데몬 관례 3종 재사용 — 별도 바이너리는 protocol v1 클라이언트 재발명 (§2.1) |
| 와이어 인코딩 | 새 envelope 타입 **없음** — handoff + `[GOAL]`/`[DONE]` 태그 + `task:` 헤더 + 라벨된 JSON attachment | 새 타입·옵셔널 필드 추가 모두 relay 코드 수정을 강제 (§3.1 비교표) |
| 상관관계 키 | `cardId`(board task id) — handoff id 사용 불가 | 서버가 handoff id를 매 hop 재생성 (M-9) (§3.2) |
| 완료 감지 | herdr `events.subscribe` push — **폴링 루프 없음**; 결과는 done 직후 `pane.read` 단발 1회 | 권고 문서의 이벤트 드리븐 원칙 (§2.5) |
| 실행 보안 | wire에 argv **금지** — `agentKind`만 싣고 argv 매핑은 브릿지 로컬 allowlist | 임의-argv 원격 실행 데몬화 방지, M-24 관행과 동형 (§4.4.2) |
| 슬라이스 전달 시맨틱 | **at-most-once** (브릿지 저널 없음) — stuck 카드는 사람이 board에서 재발행 | 과잉 구현 방지. 저널 설계는 확장 1순위로 §2.6에 보존 |

### 0.1 출처 및 검증 상태 — 읽기 전 필수

이 문서의 사실 주장은 두 등급이다:

- **[코드 실측]** — 이 레포 소스에서 검증된 사실. `file:line` 인용 동반, 적대적 검증 패스로 재확인됨.
- **[가정-H]** — **herdr 쪽 주장 전부.** 출처는 외부 권고 문서([`loom-herdr-architecture.html`](./loom-herdr-architecture.html) — herdr 저장소 소스 실측을 주장)이며, **이 레포에서는 재검증되지 않았다** (레포 내 herdr 관련 코드·문서 0건). 다음이 모두 여기 속한다:
  - 소켓 경로(`~/.config/herdr/herdr.sock`)와 로컬 전용 여부
  - JSON 프레이밍·메서드 표면: `agent start --env` / `agent send`(no-Enter 리터럴) / `events.subscribe` / `pane.read --source recent` / `pane.report_metadata`(seq)
  - agent 상태 5종(idle/working/blocked/done/unknown), `HERDR_PANE_ID` 자동 주입
  - "이벤트 페이로드에 출력 본문이 없는 것은 백프레셔 설계" (herdr 설계 의도에 대한 단정)
  - pre-1.0(v0.7.x) 버전, AGPL-3.0 + 상용 듀얼 라이선스, Windows named pipe 베타

본문의 herdr 서술에 개별 마커를 반복하지 않는다 — **이 절이 일괄 마커다.** 구현 착수 전 **Step 0.5 herdr 실측**(§5.2)에서 전량 재확정하고, 어긋나는 항목이 나오면 이 문서를 갱신한다. herdr 외의 개별 미검증 가정은 본문에 `[가정]`으로 표기한다.

## 1. 배경 — 두 시스템과 결합 구조

권고 문서 §01–02 요약 (전체 논증은 원문 참조):

- **Loom**: 휴먼 협업 컨트롤 타워. Bun/TS, WebSocket relay·MCP·per-peer durable inbox·board. 사람들의 축.
- **Herdr**: 에이전트 실행·관제 멀티플렉서. 단일 Rust 바이너리, 로컬 소켓으로 pane·agent 제어, 상태 롤업. 에이전트들의 축.
- **결합점은 MCP/handoff 계층**이고, herdr 소켓이 로컬 전용이므로 각 노드에 브릿지가 **구조적으로 강제**된다.

```
                    ┌────────────────────────────┐
                    │  Windows host              │
                    │  Loom Control Tower        │
                    │  relay · inbox · board     │
                    └───────────┬────────────────┘
              WebSocket room bus (LOOM-XXXX)
        ┌───────────────┼───────────────┐
   ┌────┴─────┐    ┌────┴─────┐    ┌────┴─────┐
   │ WSL2 노드 │    │ macOS 노드│    │ Linux 노드│      ← 슬라이스는 WSL2 1개만
   │ Bridge   │    │ Bridge   │    │ Bridge   │
   │   ↕ sock │    │   ↕ sock │    │   ↕ sock │
   │ herdr    │    │ herdr    │    │ herdr    │
   │ ├ pane   │    │ ├ pane   │    │ ├ pane   │
   └──────────┘    └──────────┘    └──────────┘
```

이 아키텍처가 채택된 이유(권고 문서 종합 판정): Windows에서 herdr를 아예 돌리지 않아 herdr의 가장 약한 부분(Windows named pipe 베타)을 정면 회피하고, 두 시스템이 각자 이미 잘하는 것(relay/inbox vs pane 관제)을 소유해 재발명이 없다. **실질적 무게중심은 아직 존재하지 않는 Loom↔herdr 접점 어댑터** — 그것이 이 문서가 설계하는 브릿지다.

---

## 2. 노드 브릿지 데몬

> **전제**: herdr 소켓은 로컬 전용이므로 relay가 원격 herdr를 직접 호출할 수 없다(§0.1). 이 절은 노드 1개 수직 슬라이스 기준의 최소 데몬 설계다. relay 와이어는 변경하지 않는다 (docs/PLAN.md:74, docs/PROTOCOL.md:3).

### 2.1 프로세스 모델 — `loom bridge` 서브커맨드 (별도 바이너리 아님)

**결정: 새 Rust/독립 바이너리가 아니라 Loom CLI 서브커맨드 + detach 데몬.** 브릿지의 상반신(relay 접속·peerSecret rejoin·handoff RPC·sanitize)은 전부 Loom 코드베이스에 이미 있는 클라이언트 로직이고, 별도 바이너리는 protocol v1 클라이언트를 재구현하는 재발명이다. 노드는 어차피 Loom CLI가 설치되는 환경(Linux/Mac/WSL)이므로 Bun 의존이 추가 비용이 아니다.

기존 데몬 관례 3종을 그대로 따른다:

| 항목 | 관례 (선례) | 브릿지 적용 |
|---|---|---|
| 시작 | `Bun.spawn(["bun","run", sticky-main.ts])` + stdio "ignore" + `proc.unref()` + 메타 파일·ping 폴링으로 ready 확인, 이미 살아있으면 idempotent (packages/host/src/sticky-spawn.ts:36-92) | `loom bridge start` → `bridge-main.ts` detach 스폰, 동일 폴링 |
| identity/IPC | 세션 사이드카 `<session>.host.json` + 127.0.0.1 ephemeral port `/health`·`/rpc` Bearer IPC (sticky-meta.ts:14-55, sticky-server.ts:304-341) | `<session>.bridge.json` 메타 {pid, port, token, herdrSocketPath, startedAt} 0600 |
| 정지 | RPC stop → 3초 → `ps -p <pid> -o command=`로 프로세스 identity 재검증 후에만 SIGTERM (M-27, sticky-spawn.ts:94-133) | 동일. cmdline에 `bridge-main.ts` 문자열 검증 |

CLI 등록 지점(수동 디스패치 구조): ① `main()` if-체인에 `cmd === "bridge"` 분기 (packages/cli/src/index.ts:2639-2846) ② `usage()` 텍스트 (:204-266) ③ 새 불리언 플래그는 `BOOLEAN_FLAGS` Set 등록 필수 — 누락 시 다음 positional을 값으로 삼킴 (:175-202).

**주의 — 메타 파일 이름 함정**: `profilesWithSession()`은 `.host.json`만 제외하므로 (index.ts:381) `profiles/` 아래 `<name>.bridge.json`을 두면 프로파일로 오인된다. 사이드카 서픽스 관례를 따르되 **`profilesWithSession()`의 제외 필터에 `.bridge.json`을 추가하는 1줄 수정을 동반**한다. 브릿지 로컬 설정(allowlist 등)은 오인 여지가 없는 별도 디렉토리 `loomDir()/bridge/`에 둔다 — 경로는 절대 `~/.loom` 하드코딩 금지, `loomDir()` 경유 (M-14, session-store.ts:154-211).

브릿지 1개 = 프로파일 1개 = herdr 소켓 1개. 노드에 브릿지를 여러 개 두는 시나리오는 M-28(LOOM_SESSION 전역 상태의 병렬 오염, index.ts:399-469)과 동일한 이유로 순차 start/stop만 허용한다.

### 2.2 relay peer 등록 — identity·peerSecret

브릿지는 **전용 개념 없이 일반 peer로 join**한다 (room.ts:228-294 — 브릿지 전용 등록 경로가 원래 없음).

- **프로파일**: `loom bridge start --profile node-wsl-1`처럼 노드별 전용 프로파일. `LoomSession`이 이미 relayUrl/relayToken/peerSecret 필드를 가지므로 (session-store.ts:24-43) 저장 구조 추가 없음. mode 0600 (:309-317).
- **peerSecret (M-7)**: join 응답 `room.state`의 `peerSecret`을 세션 파일에 즉시 영속. 서버는 신규 join뿐 아니라 secret 인증에 성공한 rejoin에도 매번 `room.state`에 peerSecret을 실어 응답하므로 (room.ts:261-266 — `addPeer`가 기존 멤버에도 `secret: existing.secret` 반환) 첫 응답에서 저장하면 된다. 미보관 시 재접속이 `peer_auth_failed`로 거부되어 자기 inbox(=미처리 카드)를 이어받지 못한다 (server.ts:277-284). 이것이 브릿지 재시작 후 대기 카드를 회수하는 유일한 열쇠다.
- **인증**: 비루프백 relay(Windows 타워)는 토큰 필수(H-5). `Authorization: Bearer` 헤더로, URL에 토큰 금지(H-6) (server.ts:84-93, 128-134). 부트스트랩은 기존 `loom://join/` 인바이트 링크(relayUrl+token+inviteCode) 재사용.
- **agentKind**: 수직 슬라이스에서는 **`shell` 사용** — `AgentKindSchema`가 닫힌 enum이라 `bridge` 값 추가는 envelope.ts:9-15 + 스냅샷 복원 whitelist(room.ts:107-117) 동시 수정이 필요한 와이어 인접 변경이므로 "이후"로 미룬다.
- **displayName 규약**: `node/<name>` (예: `node/wsl-1`). `sanitizePeerName`은 printable을 유지하므로 `/`는 살아남는다 (sanitize.ts:83-85). 카드 라우팅은 handoff의 `to: "@node/wsl-1"` displayName 해석(room.ts:452-459)으로 성립 — @node 라우팅 테이블 같은 신규 개념이 필요 없다.
- **fail-fast 순서 (M-13 유추)**: `loom run`이 relay join 실패 시 에이전트를 스폰하지 않듯 (index.ts:2134-2146), 브릿지는 **herdr 소켓 ping+버전 확인에 성공한 뒤에만 room join**한다. 실행 능력 없는 브릿지가 join해 카드를 claim해 버리는 것이 최악의 실패 모드이기 때문(claim은 inbox에서 entry를 삭제한다, room.ts:594-640).

### 2.3 herdr 로컬 소켓 클라이언트

- **연결**: `~/.config/herdr/herdr.sock` Unix 도메인 소켓. 소켓 경로는 env/설정으로 오버라이드 가능하게 한다(테스트의 fake herdr 주입 지점, §5.4). **[가정]** 프레이밍은 newline-delimited JSON(요청 `{id, method, params}` / 응답 `{id, result|error}` / 이벤트 push `{type, ...}`) — Step 0.5에서 확정.
- **핸드셰이크**: 연결 직후 `ping` + 프로토콜 버전 확인. herdr는 pre-1.0으로 와이어가 흔들릴 수 있으므로 버전 불일치 시 카드 claim을 시작하지 않고 `bridge status`에 degraded로 노출한다. relay 쪽도 대칭으로 `/health`의 `version: PROTOCOL_VERSION` 사전 확인 (server.ts:106-115).
- **호출 표면**: 슬라이스에서 필요한 메서드는 4개뿐 — `agent.start`(env 주입, `--env LOOM_CARD=…`), `agent.send`(리터럴 텍스트), `events.subscribe`(`pane.agent_status_changed`), `pane.read`(`--source recent` 단발). **[가정]** raw 소켓 프로토콜이 불안정하면 herdr CLI 래퍼(`herdr agent start …` 서브프로세스)로 폴백 가능 — 단 `events.subscribe` 장기 스트림만은 소켓 직결 유지(권고 문서 §05가 SSH/CLI 경유 장기 스트림을 취약 지점으로 지목).
- **보안**: 소켓은 same-UID 로컬 파일 — M-5(제어 채널 로컬 same-UID 전용, docs/PLAN.md:87)와 동일한 신뢰 경계. 브릿지가 소켓 권한을 완화하거나 TCP로 노출하는 일은 금지.

### 2.4 `events.subscribe` 장기 구독 유지와 양방향 재연결

브릿지는 두 개의 장수명 연결을 가지며, 각각 독립적으로 끊긴다. 핵심 원칙: **전달 보장은 연결이 아니라 저장소(relay durable inbox)가 진다.**

**(a) relay WS 끊김** — `RelayClient`의 autoReconnect(cmdRun이 이미 사용, index.ts:2134-2146) + peerSecret rejoin. 끊긴 동안의 카드는:
- dispatch(handoff)는 per-peer inbox에 queued로 쌓이고 (room.ts:490-559), durable 스냅샷이 relay 재시작까지 견딘다 (persist.ts:28-58, room.ts:153-187). rejoin 시 서버가 unsolicited `inbox.state`를 push하므로 (server.ts:357-371) 브릿지는 이를 드레인하면 된다.
- **유일한 유실 창은 inbox 100건 상한 trim** (envelope.ts:38, room.ts:464-488). 대응: 브릿지는 rejoin 즉시 드레인하고, 백로그가 상한 근처면 status/로그로 경고. 장기 오프라인에서 100건 초과 dispatch가 조용히 사라질 수 있음은 **설계에 수용된 한계**로 명시한다.
- chat/presence는 온라인 브로드캐스트 전용이라 유실됨 (room.ts:358-370) — 따라서 **dispatch/done 어느 방향도 chat을 쓰지 않는다.**

**(b) herdr 소켓 끊김** — 지수 백오프 재연결. 재연결 시 순서가 중요하다: **① 재핸드셰이크(ping/버전) → ② `events.subscribe` 재등록 → ③ 진행 중(in-flight) pane 상태 스냅샷 조회로 격차 보정(reconcile)**. 구독을 먼저 걸고 스냅샷을 나중에 읽어야 "끊김~재구독 사이에 done이 지나간" 이벤트 공백이 닫힌다. 스냅샷에서 이미 done인 pane은 즉시 `pane.read`로 진행(§2.5의 6단계로 점프). **[가정]** herdr가 pane 목록+상태 스냅샷 조회(`herdr status` 상당)를 소켓으로 제공한다 — Step 0.5 확인 대상.

### 2.5 카드 dispatch → done 처리 흐름

와이어 계약의 정본은 §3. 흐름 요약:

```
Loom Board(Windows)          Bridge(노드)                herdr                 agent pane
     │  [GOAL] <title>          │                          │                       │
     │  intent: card.dispatch   │                          │                       │
     │  task: task_ab12…        │                          │                       │
     ├── handoff(mode:task) ───▶│                          │                       │
     │   (inbox 경유, queued)    │                          │                       │
     │                          ├─ claim_handoff(RPC) ──▶ relay (first-wins)       │
     │                          ├─ agent.start ──────────▶│── spawn ─────────────▶│
     │                          │   --env LOOM_CARD=task_ab12                      │
     │                          ├─ agent.send <prompt> ──▶│──────────────────────▶│ working
     │                          │◀── pane.agent_status_changed=done (push) ────────┤
     │                          ├─ pane.read --source recent (단발 1회) ─▶│         │
     │◀─ handoff [DONE] ────────┤                          │                       │
     │   task:… + 결과 attachment │                          │                       │
```

단계별 세부:

1. **수신**: handoff envelope(온라인 push) 또는 rejoin 시 `inbox.state`로 카드 도착. `loom-card-dispatch` 라벨 attachment가 있는 `mode:'task'` handoff만 dispatch로 인식(§3.2) — 그 외 handoff는 일반 메시지로 무시(브릿지는 범용 수신자가 아님).
2. **claim**: `claim_handoff`는 `requestId` 상관 RPC로 `inbox.claim_result`를 확인 (server.ts:214-225). first-wins 시맨틱이 브릿지 중복 기동 시 이중 실행을 막아준다. claim 성공 시 entry가 inbox에서 **삭제**되므로 (room.ts:594-640) 이 시점부터 카드의 유일한 사본은 브릿지 메모리다 — 슬라이스는 이 창의 crash를 at-most-once로 수용한다(§4.2 F2, 저널 확장은 §2.6).
3. **스폰**: `agent.start --env LOOM_CARD=<cardId> -- <argv>`. argv는 payload의 `agentKind`를 브릿지 로컬 allowlist로 매핑한 값(슬라이스: `claude` → `["claude"]`만, §4.4.2). herdr가 `HERDR_PANE_ID`를 자동 주입하고 pane_id를 반환(§0.1 [가정-H]). **참고**: 워커 에이전트의 PTY는 herdr가 소유하므로 Loom의 runTuiAgent PTY 폴백 사다리(index.ts:2307-2380)는 이 경로에서 불필요 — 브릿지는 프로세스를 직접 스폰하지 않는다.
4. **프롬프트 주입**: `agent.send <pane> <prompt>` + 제출. **정책 경계를 명시**: 0.21.1의 M-2(no-auto-submit)·M-1(accept-gated)은 *사람이 쓰는 인터랙티브 세션에 주입*하는 경로의 안전조건이다 (docs/PLAN.md:83-88). 브릿지 워커 pane은 브릿지가 스폰한 자율 실행 전용 pane으로, 오너가 카드를 dispatch한 행위 자체가 실행 승인이다 — 즉 여기의 제출은 M-2 위반이 아니라 **별도 신뢰 모델**이며, 이 구분은 R{n} 리뷰에서 명시적으로 승인받아야 한다. 프롬프트는 handoff body에서 왔으므로 sanitizePeerText를 거친 텍스트이지만(room.ts:428-449), untrusted 출처 표시(`⚠ Untrusted handoff content` 상당)를 프롬프트 프리앰블에 유지한다 (ARCHITECTURE.md:109 handoff body untrusted 원칙, §4.4.1).
5. **완료 대기**: `events.subscribe`의 `pane.agent_status_changed = done` push — **폴링 루프 없음**. `blocked` 상태도 구독해 실패 경로로 라우팅. wall-clock 타임아웃은 슬라이스에서 의도적으로 없다(§4.3).
6. **결과 회수**: done 직후 `pane.read --source recent` **단발 1회**.
7. **결과 반환**: `[DONE]` 태그 + `task:<cardId>` 헤더의 handoff를 dispatch 발신 peer에게 전송, pane.read 산출물은 `loom-card-result` 라벨 attachment로 동봉(§3.2) — attachment당 256k chars 상한이므로 (envelope.ts:34-35) 초과분은 tail 우선 절단. 전송 후 `handoff.ack`(status: delivered|queued)를 requestId로 확인하고, `persist_failed` error envelope이면 백오프 재시도 (server.ts:392-405) — done 방향도 inbox 경유라 **오너(Windows 타워)가 오프라인이어도 유실되지 않는다.**
8. **마감**: ack 확인 후 pane 정리(슬라이스에서는 사후 검사용으로 유지).

**보드 반영은 오너 쪽 책임**: board는 local-only·relay 비동기화이므로 (task-board.ts:6) 브릿지가 원격에서 보드 컬럼을 직접 옮길 수 없다. `[DONE]` handoff를 받은 오너 측(사람 또는 MCP `check_handoffs`를 도는 에이전트)이 `apply_card_result`(§3.6)로 카드를 done 컬럼으로 이동한다 — work-bus의 "Handoff is SSOT for queue/notify; board holds status + handoffId link" 원칙 그대로 (work-bus.ts:1-4). 자동 이동은 "이후".

### 2.6 [확장 1순위 — 슬라이스 밖] crash 복구 저널

슬라이스는 §4.2 F2대로 claim-후-crash를 at-most-once로 수용한다. 그 공백을 닫는 저널 설계를 확장 1순위로 보존한다:

**저널**: `loomDir()/bridge/<profile>.journal.json`, 0600, 기존 `withFileLock` + `writeAtomicJson`(H-7, task-board.ts:220-239) 재사용. 엔트리: `{taskId, sourcePeerId, handoffBodyHash, paneId?, phase, updatedAt}` + 카드 원문(body) 사본, phase ∈ `received | claimed | spawned | sent | reported`. claim이 inbox에서 entry를 지우므로 claim 이후에는 **저널이 카드의 유일한 사본**이다. 각 처리 단계 직전에 phase를 선기록한다.

재시작 시(idempotent start의 ping 확인 후) 복구 시퀀스: herdr 재핸드셰이크 → `events.subscribe` → relay rejoin(peerSecret) → 저널 스캔:

| 저널 phase | 복구 동작 |
|---|---|
| `received` (claim 전) | rejoin 후 inbox에 그대로 남아 있음 → 정상 경로(§2.5 2단계)로 재진입. inbox에 없으면(다른 브릿지가 claim 등) 엔트리 폐기 |
| `claimed` (paneId 없음) | inbox에는 이미 없음 — 저널의 body 사본으로 3단계(스폰)부터 재개. **중복 스폰 가드**: 스폰 직전 herdr pane 스냅샷에서 `LOOM_CARD=<taskId>` 표식이 있는 pane을 탐색해 있으면 스폰 생략하고 그 pane에 재부착 — **[가정]** pane별 env 또는 metadata 조회 가능(불가하면 `pane.report_metadata`에 taskId 토큰을 스폰 시 각인하는 방식으로 대체) |
| `spawned`/`sent` (paneId 있음) | pane 상태 조회: `working` → 구독 유지하고 5단계 계속 / `done` → 놓친 이벤트로 간주, 즉시 6단계(pane.read) / pane 소멸 → `[DONE]` handoff에 실패 표기(`result: pane lost after bridge crash`)로 오너에게 보고 — 조용한 증발 금지 |
| `reported` | ack까지 확인된 완결 — 엔트리를 보존 기간(예: 7일) 후 정리 |

**의미론 정직화**: `claimed` 기록 직후 저널 쓰기 실패가 겹치는 창은 이론상 카드 유실 — `writeAtomicJson` + "저널 먼저, claim 나중" 순서로 창을 최소화하되, 전체 시맨틱은 **at-least-once 시도 + pane 표식 기반 중복 억제**로 규정한다(exactly-once를 주장하지 않는다).

### 2.7 이후 (수직 슬라이스 밖)

- **저널 도입** (§2.6) — F2를 at-most-once에서 at-least-once+중복억제로 승급.
- **멀티 노드**: 브릿지 복제 + displayName 라우팅은 그대로 확장되나, `'*'` 브로드캐스트 dispatch(전 노드 경쟁 claim)는 first-wins 의미론 검증 후 (§4.2 F7).
- **`agentKind: 'bridge'` enum 확장**: envelope.ts:9-15 + room.ts:107-117 동시 수정, 별도 PATCH.
- **진행 로그 스트리밍**: `pane.read` 루프가 필요해지는 유일한 경우 — 결과-only 경로가 검증된 뒤에만.
- **보드 자동 컬럼 이동**: `[DONE]` 수신 → 자동 반영(MCP 또는 오너 측 워처). L-32(notify 기본 off) 정합성 결정 포함.
- **워커 에이전트의 Loom MCP 통합**: 워커가 `LOOM_SESSION`을 받아 스스로 handoff로 결과를 보고하는 대안 경로 — pane.read 회수와의 우열 비교 후.

---

## 3. Loom 측 계약 — 메시지·MCP 도구·보드 매핑

> 이 절은 브릿지가 소비/생산하는 `card.dispatch` / `card.done` 이벤트를 **Loom 프로토콜 v1 와이어 변경 없이** 정의한다.

### 3.1 인코딩 결정 — 새 envelope 타입이 아니라 `mode:'task'` handoff 위의 컨벤션

세 가지 경로를 비교했다. 판단 근거는 전부 정찰에서 확정된 코드 사실이다.

| 경로 | 하위호환 | 전달 보장 | 비용 | 판정 |
|---|---|---|---|---|
| **(A) 새 envelope 타입** `card.dispatch`/`card.done` | ✗ — 구 클라이언트 `parseEnvelope` 실패, 서버는 미지 클라이언트 타입에 `bad_message` 응답 (server.ts:227-238) | relay 코드 수정 필요 | relay+protocol 동시 배포, "프로토콜 v1 와이어 불변" 원칙 위반 → 별도 R{n} (docs/PLAN.md:74) | 기각 |
| **(B) `HandoffPayloadSchema`에 옵셔널 필드 추가** (예: `card?: {...}`) | 파싱은 호환(전 스키마 strip 모드 — `.strict()`/`.passthrough()` 0건) — 그러나 relay의 `resolveHandoff`가 **필드를 명시적으로 재구성**하므로 relay 코드를 고치지 않으면 새 필드가 수신자에게 도달하지 못하고 조용히 유실됨 (room.ts:417-450) | relay 수정 없이는 사실상 불가 | (A)와 동일하게 relay 배포 필요 — "파싱 호환"이 "전달 호환"이 아님 | 기각 |
| **(C) 기존 `handoff`(mode:'task') + body-prefix 태그 + 라벨된 attachment** | ✓ — 와이어는 기존 스키마 그대로, 시맨틱만 클라이언트 로컬 컨벤션 | ✓ — durable inbox 경유 | protocol/relay 무변경. 선례 2건: `handoff-contract.ts`의 'no wire change' 태그 체계, `loom-board-snapshot` 라벨 attachment (handoff-contract.ts:1-58, task-board.ts:409-451) | **채택** |

(C)의 트레이드오프를 정직하게 적으면: **스키마 레벨(서버) 검증이 없다.** relay는 이 페이로드를 그냥 텍스트 attachment로 취급하므로, 계약 위반은 수신 측(브릿지/타워)의 클라이언트 로컬 zod 파싱에서만 잡힌다(§3.3). 또한 attachment content는 서버가 `sanitizePeerText` + 256k chars 캡을 강제하므로(envelope.ts:34-35, room.ts:428-449) 페이로드는 반드시 이 필터를 통과하는 형태여야 한다 — JSON.stringify 산출물은 제어문자를 `\uXXXX` printable 이스케이프로 직렬화하므로 allowlist sanitizer(printable+`\n\t` 유지, sanitize.ts:19-50)를 무손실 통과한다. 즉 **구조화 페이로드는 JSON 텍스트 attachment로 싣는 것이 sanitize-안전**하다.

`chat`은 쓰지 않는다. chat은 온라인 브로드캐스트 전용·비영속이라(room.ts:358-370) 브릿지가 잠깐이라도 오프라인이면 dispatch가 유실된다. handoff는 온라인 알림 성공 여부와 무관하게 항상 per-peer inbox에 enqueue되고(room.ts:506-559), durable 스냅샷(queued|notified)으로 relay 재시작도 넘긴다(persist.ts:28-58). **전달 보장이 필요한 dispatch/done은 반드시 handoff.**

### 3.2 와이어 포맷

#### card.dispatch (타워 → 브릿지 peer)

`mode:'task'` handoff 한 건. 구성:

- **body** — 사람/일반 에이전트용 요약. 기존 WorkTag 집합을 확장하지 않고 `[GOAL]` 재사용. **헤더 라인은 각각 독립된 줄이어야 한다** — `parseHandoffContract`의 intent 추출 정규식이 줄 시작 매치(`/^intent:\s*(.+)$/i`, handoff-contract.ts:46)라 태그와 같은 줄에 쓰면 파싱되지 않는다. `task:` 키는 work-bus의 기존 태스크 헤더 키를 그대로 재사용한다 (work-bus.ts:38-42). 파서는 첫 12줄을 best-effort 파싱하며 절대 send를 막지 않으므로(handoff-contract.ts:31-58), 새 헤더 키(`node:`)는 구 클라이언트에게 그냥 본문 텍스트로 보인다(하위호환). `node:` 키 인식 추가는 클라이언트 로컬 변경이다.

  ```
  [GOAL] <카드 title 한 줄>
  intent: card.dispatch
  task: task_1a2b3c4d5e6f7788
  node: node/wsl-1
  ```

- **attachment** — `{kind:"text", label:"loom-card-dispatch", content: JSON.stringify(CardDispatchPayload)}` 단일 첨부. `loom-board-snapshot`과 동일한 라벨-매칭 소비 패턴 (`snapshotFromAttachments` — label 매치 + JSON.parse + 실패 시 null, task-board.ts:566-580).

브릿지는 body를 신뢰 경계로 삼지 않고 **label로만 라우팅**한다: `loom-card-dispatch` 라벨 attachment가 있는 handoff만 dispatch로 처리, 나머지는 통상 메시지로 취급(무시 또는 로그).

#### card.done (브릿지 → 발신 peer)

브릿지가 herdr done push 수신 → `pane.read` 단발 회수 후, **dispatch handoff의 `fromPeerId`를 `to`로** 하는 `mode:'task'` handoff를 회신:

- body: `[DONE]` 태그(첫 줄) + `intent: card.done` + `task: task_<id>` + `seq: <n>` 헤더 라인 + 한 줄 요약
- attachment: `{kind:"text", label:"loom-card-result", content: JSON.stringify(CardResultPayload)}`

**상관관계 키는 handoff id가 아니라 `cardId`다.** 서버가 클라이언트 제공 handoff id를 절대 수용하지 않고 매 hop마다 `generateHandoffId()`로 재생성하므로(M-9, room.ts:440-449), dispatch와 done을 잇는 유일한 안정 키는 페이로드 안의 board task id(`task_<16 hex>`, 생성: codes.ts:27-29)다. 브릿지는 수신한 dispatch handoff의 서버 생성 id를 `dispatchHandoffId`로 에코해 감사용으로만 싣는다.

**RPC 확인 의무**: persist 실패는 fail-closed(`persist_failed` error envelope)이므로, 양쪽 모두 handoff 전송 시 `requestId`(≤80자)를 싣고 `handoff.ack` 또는 `error`를 확인해야 한다(server.ts:392-405, 214-225). ack에는 서버 생성 `handoffId`가 포함된다(envelope.ts:133-141) — 타워는 이 값을 카드에 링크한다(§3.5).

### 3.3 zod 스키마 초안 (클라이언트 로컬 — 와이어 스키마 아님)

배치 위치: `packages/protocol/src/card-contract.ts` **[가정]** (handoff-contract.ts와 나란히; protocol 패키지지만 relay는 이 스키마를 파싱하지 않음 — 순수 클라이언트 계약).

```typescript
import { z } from "zod";

/** Card contract v1 — rides inside handoff attachments; NOT a wire schema.
 *  Relay treats it as opaque text (sanitizePeerText + 256k cap apply). */
export const CARD_CONTRACT_VERSION = 1 as const;

export const CARD_DISPATCH_LABEL = "loom-card-dispatch";
export const CARD_RESULT_LABEL = "loom-card-result";

// task-board.ts:97 TASK_ID_RE와 동일 패턴 (id 생성은 codes.ts generateTaskId)
const TaskIdSchema = z.string().regex(/^task_[a-f0-9]+$/i);

/** 슬라이스 allowlist: claude 하나. wire에 argv 금지 — §4.4.2 보안 결정.
 *  argv 매핑(claude → ["claude"])은 브릿지 로컬 설정에만 존재한다. */
export const DispatchAgentKindSchema = z.enum(["claude"]);

export const CardDispatchPayloadSchema = z.object({
  v: z.literal(CARD_CONTRACT_VERSION),
  cardId: TaskIdSchema,                     // 상관관계 키 (M-9: handoff id 사용 불가)
  sourceRoomId: z.string().min(1),          // board 스냅샷 import의 L-9 관례를 따라 출처 명시
  prompt: z.string().min(1).max(60_000),    // herdr agent.send 리터럴 텍스트
  agentKind: DispatchAgentKindSchema,
  cwd: z.string().max(1_000).optional(),
});
export type CardDispatchPayload = z.infer<typeof CardDispatchPayloadSchema>;

export const CardResultStatusSchema = z.enum(["done", "failed"]);
  // herdr 상태 롤업: done→done, blocked/unknown 장기화·spawn 실패→failed.
  // timeout 상태는 슬라이스에 없음(§4.3) — 도입 시 v2가 아니라 enum 확장으로 가능한지 재검토.

export const CardResultPayloadSchema = z.object({
  v: z.literal(CARD_CONTRACT_VERSION),
  cardId: TaskIdSchema,
  status: CardResultStatusSchema,
  node: z.string().min(1),                  // 브릿지 peer displayName (예: "node/wsl-1")
  seq: z.number().int().nonneg(),           // 카드별 단조증가 — 타워 멱등 폐기 키 (§4.1.3)
  paneId: z.string().max(200).optional(),
  dispatchHandoffId: z.string().max(64).optional(), // 감사용 에코
  output: z.string().max(200_000),          // pane.read 산출 — §3.7 크기 사슬 참조
  truncated: z.boolean().default(false),
  summary: z.string().max(900),             // 카드 notes(≤1000 chars) 반영용 — 헤드룸 확보
  startedAt: z.string().datetime().optional(),
  finishedAt: z.string().datetime(),
});
export type CardResultPayload = z.infer<typeof CardResultPayloadSchema>;

/** attachment 배열에서 카드 페이로드를 best-effort 추출. 실패 시 null (send/수신을 막지 않음). */
export function cardPayloadFromAttachments<S extends z.ZodTypeAny>(
  attachments: { kind: string; label?: string; content: string }[] | undefined,
  label: string,
  schema: S,
): z.infer<S> | null {
  const hit = attachments?.find((a) => a.kind === "text" && a.label === label);
  if (!hit) return null;
  try {
    return schema.parse(JSON.parse(hit.content));
  } catch {
    return null;
  }
}
```

주의점 두 가지: (1) `prompt` 상한 60k는 handoff body 100k 캡과 별개로 attachment 안에 있으므로 256k 캡 대상이다 — JSON 직렬화 오버헤드를 감안한 보수치. (2) `v: z.literal(1)`은 카드 계약 자체의 버전으로, 프로토콜 `PROTOCOL_VERSION`과는 독립 — attachment 내부라 relay를 건드리지 않고 v2로 올릴 수 있다.

### 3.4 노드 라우팅 — `@node`를 peer 네이밍으로

브릿지는 **일반 peer로 join**한다. 브릿지 전용 개념이 프로토콜에 없고 필요하지도 않다(room.ts:228-294, server.ts:287-372).

- **displayName 컨벤션**: `node/<name>` (예: `node/wsl-1`, `node/mac-studio`). handoff `to` 필드는 `peer id → @displayName` 순으로 해석되므로(room.ts:452-459) 타워 측 dispatch는 `to: "@node/wsl-1"` 하나로 라우팅이 끝난다. `'*'` 브로드캐스트는 오프라인 포함 roster 전원에게 가므로 dispatch에 사용 금지(§4.2 F7).
- **오프라인 시맨틱**: 소켓 단절 시 roster는 유지되고 offline 마킹만 된다(room.ts:296-316). 따라서 오프라인 노드로의 dispatch도 `handoff.ack status:"queued"`로 성공하며 inbox에 쌓인다. 단 **per-peer inbox 상한 100건** 초과 시 가장 오래된 pending부터 trim되므로(room.ts:464-488), 장기 오프라인 노드에 dispatch를 대량 적재하는 운용은 유실 리스크가 있다 — 슬라이스에서는 "ack가 `queued`면 노드 온라인 여부를 `list_peers`로 확인하라"는 운용 규칙으로 갈음.

**[가정]** 노드 이름의 유일성은 운영 컨벤션으로만 보장된다 — relay는 displayName 중복을 막지 않으며, `resolveTargets`의 중복 displayName 동작(온라인 매치 우선)은 다중 매치 시나리오에서 미검증. 슬라이스(노드 1개)에서는 문제없고, 멀티 노드 확장 전에 UNKNOWNS 등록 대상.

### 3.5 보드 매핑 — 카드 상태 전이 (board는 local-only)

전제를 먼저 못 박는다: **board는 relay 동기화가 없는 로컬 파일**이다(task-board.ts:6, `~/.loom/boards/<sha256(roomId) 16hex>.json`). 따라서 권고 문서의 "카드는 Loom board 소유"는 정확히 "**타워(발행 측) 노드의 로컬 보드가 SSOT**"로 해석한다. 브릿지·원격 노드는 보드를 갖지 않고 `cardId` 문자열만 안다(herdr에는 `LOOM_CARD=<cardId>` env로 각인). 원격 에이전트가 보드 문맥이 필요하면 기존 `withBoard` 스냅샷 첨부를 재사용한다(room-ops.ts:145-152).

컬럼은 **기존 `TaskStatus` 5종을 그대로 쓴다** — `dispatched` 컬럼 신설은 task-board.ts:27-40 enum·표시 순서·`parseTaskStatus` 수정을 부르는 과잉 구현이고, 기존 시맨틱으로 충분히 표현된다:

| 이벤트 | 카드 전이 | 부가 기록 |
|---|---|---|
| `dispatch_card` 호출, ack `queued`\|`delivered` | `todo` → **`doing`** | `assignee: "node/wsl-1"`, `handoffId: <ack의 handoffId>` 링크 — work-bus의 "Handoff is SSOT for queue/notify; board holds status + handoffId link" 원칙 그대로 (work-bus.ts:1-4) |
| ack `peer_unknown` 또는 `error` envelope | 전이 없음 (`todo` 유지) | 도구가 에러 반환 — relay join 실패 시 스폰 안 하는 M-13 fail-fast와 동형 |
| result `status:"done"` 적용 | `doing` → **`done`** | `notes` ← `summary` (≤1000 chars, `MAX_NOTE` clamp task-board.ts:177-205) |
| result `status:"failed"` 적용 | `doing` → **`blocked`** | `notes` ← 사유 + summary. 재시도는 사람이 `blocked→todo`로 되돌려 재발행 |

모든 보드 변경은 `mutateBoard`(withFileLock + writeAtomicJson, H-7) 경유(task-board.ts:220-239), 카드 해석은 `resolveTaskIndex`의 exact→unique-suffix 규약(M-8) 준수.

**이중 생성 방지 주의**: `toolHandoff`는 `mode:"task"`일 때 `addTaskFromHandoff`로 카드를 자동 생성한다(tools.ts:71-92). `dispatch_card`는 **기존 카드에 대해 동작**하므로 `toolHandoff`를 경유하지 않고 host 레이어 `opsHandoff`를 직접 호출해 자동 생성 경로를 우회한다. 또한 dispatch는 사용자가 명시적으로 호출하는 도구이므로 L-32(notify 기본 off)와 충돌하지 않는다 — 자동 발송이 아니라 발송 그 자체가 도구의 목적이다.

`doing`에 갇힌 카드(브릿지 영구 소실, inbox trim으로 dispatch 유실)의 자동 감지·타임아웃 회수는 슬라이스 범위 밖 — 수동 `list_tasks` 확인으로 갈음하고 "이후" 절에 남긴다.

### 3.6 신규 MCP 도구 (타워 측)

브릿지는 MCP를 쓰지 않는다(raw WS 클라이언트). MCP 도구는 **타워에서 카드를 발행/회수하는 에이전트용**이며, 기존 3단계 등록 관례를 따른다: ① `tools.ts`에 `tool*` 함수, ② `stdio.ts` TOOLS 배열, ③ `handle()` if-else 체인(stdio.ts:28-227, 262-373).

#### `dispatch_card`

```jsonc
{
  "name": "dispatch_card",
  "description": "Dispatch an existing board card to a remote herdr node bridge. Sends a mode:'task' handoff with a loom-card-dispatch attachment, then moves the card to doing with assignee/handoffId set.",
  "inputSchema": {
    "type": "object",
    "properties": {
      "taskId": { "type": "string", "description": "Board task id (task_<hex>; unique suffix accepted)" },
      "node":   { "type": "string", "description": "Target bridge peer displayName, e.g. node/wsl-1" },
      "prompt": { "type": "string", "description": "Literal prompt text injected into the remote agent (no trailing newline)" },
      "agentKind": { "type": "string", "description": "Agent kind from the dispatch allowlist (default \"claude\"). Not an argv — mapping lives in bridge-local config." }
    },
    "required": ["taskId", "node", "prompt"]
  }
}
```

`toolDispatchCard` 동작: `resolveTaskIndex(taskId)` → `CardDispatchPayloadSchema` 구성·검증 → body(§3.2) + attachment 조립 → `opsHandoff({to: "@"+node, mode:"task", ...})` (sticky RPC 우선 + one-shot 폴백 패턴, room-ops.ts:75-97) → ack 확인 후 `updateTask`(doing, assignee, handoffId) → `{status, handoffId, taskId}` JSON 반환. `handle()` 체인은 인자를 `String()` 코어션하는 관례이므로 문자열 인자만으로 충분하다. 향후 배열 인자가 필요해지면 `set_purpose`의 successCriteria/outOfScope 배열 처리 선례(Array.isArray 분기, stdio.ts:293-304 + 스키마 stdio.ts:106-113)를 따른다.

#### `apply_card_result`

```jsonc
{
  "name": "apply_card_result",
  "description": "Apply a claimed card result (loom-card-result attachment JSON) to the local board: done → done, failed → blocked, summary → notes.",
  "inputSchema": {
    "type": "object",
    "properties": {
      "resultJson": { "type": "string", "description": "Raw content of the loom-card-result attachment from the claimed handoff" }
    },
    "required": ["resultJson"]
  }
}
```

`toolApplyCardResult` 동작: `CardResultPayloadSchema.parse(JSON.parse(resultJson))` → `resolveTaskIndex(cardId)` → §3.5 표대로 `updateTask`. 입력을 attachment 원문 문자열로 받는 이유: 결과 handoff 수신·claim은 **기존** `check_handoffs`/`claim_handoff` 경로를 그대로 쓰고(수신 경로 불변 — PLAN M-6 정신), 이 도구는 보드 반영만 담당한다. 원문은 이미 서버 sanitize를 통과했지만 M-10 관례대로 타임스탬프는 `normalizeTimestamp` 클램프, notes는 `MAX_NOTE` clamp를 재적용한다(defense in depth).

노드 목록 조회는 신규 도구 없이 기존 `list_peers` 결과에서 `node/` prefix 필터로 충분하다.

### 3.7 결과(result) attach 형식과 크기 한도

result attachment(`loom-card-result`)의 크기 사슬:

| 단계 | 한도 | 강제 주체 |
|---|---|---|
| herdr `pane.read` 원문 | 브릿지가 line 수 제한 요청 (권고 문서 예: `--source recent, lines: 200`) | 브릿지 |
| **ANSI 제거** | 브릿지가 전송 전 자체 strip — 어차피 서버 `sanitizePeerText`가 ESC/CSI/OSC를 제거하므로(sanitize.ts:19-50), 브릿지가 먼저 지워야 잘림 위치·문자수 예산을 브릿지가 통제 | 브릿지 |
| `output` 필드 | ≤200,000 chars, 초과 시 **tail-keep 절단**(결과·에러는 끝에 있음) + `truncated: true` | 브릿지 (스키마 `.max()`) |
| 직렬화 후 attachment content | ≤256,000 chars — 초과 시 재절단. JSON 이스케이프 팽창(제어문자→`\uXXXX` 6 chars) 대비 헤드룸이 200k↔256k 갭의 존재 이유 | relay zod가 최종 강제 (envelope.ts:34-35) |
| handoff당 attachment 수 | dispatch·result 각 1개 (캡 32개 대비 여유) | relay zod |
| 카드 `notes` 반영분 | `summary` ≤900 chars → `MAX_NOTE` 1000 clamp 내 | 타워 `normalizeTask` |

JSON 직렬화 자체가 sanitize-안전인 이유는 §3.1 참조. **전체 출력은 카드에 남지 않는다**: 카드에는 summary(notes)와 handoffId 링크만 남고, 전체 output은 claim한 handoff 안에서 소비된다(claim 시 inbox에서 삭제됨, room.ts:594-640). 결과의 장기 보존이 필요하면 "이후" 절.

### 3.8 이후 (슬라이스 밖)

- **`bridge` agentKind 추가** — envelope.ts:9-15 enum + room.ts:107-117 복원 whitelist 동시 수정. UI 구분이 필요해질 때.
- **stale-`doing` 회수** — 타워 측 감시, inbox trim 유실 감지(dispatch 재송신 멱등 키는 `cardId`).
- **진행 로그 스트리밍** — 필수 아님. 하려면 `pane.read` 루프 + 비영속 `chat`(유실 허용 트래픽에 적합)으로.
- **결과 영속 보관** — 카드별 결과 파일(`loomDir()/results/` 등) 또는 context pack notes 연계.
- **멀티 노드 displayName 유일성 강제** — §3.4의 [가정] 해소. UNKNOWNS Gate log 등록 후 진행.
- **카드 계약 v2** — attachment 내부 버전이므로 relay 무관 승급 가능; `v: z.literal(1)` 파싱 실패 시 무시(best-effort) 규약 유지.
- **agentKind allowlist 확장** (`codex`, `grok`) — 브릿지 로컬 설정 + `DispatchAgentKindSchema` 확장.

---

## 4. 카드 생애주기, 실패 모드, 보안 경계

### 4.1 카드 상태머신

#### 4.1.1 상태 정의와 board 컬럼 매핑

Loom board의 `TaskStatus`는 `todo | doing | done | blocked | cancelled`의 닫힌 5종이다(task-board.ts:27-40). 슬라이스에서는 **board 스키마를 확장하지 않고** 세부 상태를 `notes`(max 1000 chars, task-board.ts:42-65)에 태그로 기록한다.

| 논리 상태 | 의미 | board `status` | 기록 위치 |
|---|---|---|---|
| `issued` | 타워가 카드 발행, dispatch handoff 송신 | `todo` → `doing` (ack 확인 시) | `handoffId` 링크 (work-bus 패턴, work-bus.ts:115) |
| `dispatched` | 브릿지가 inbox에서 claim + `agent start` 성공 | `doing` | notes: `dispatched node=<peer> pane=<id>` |
| `working` | herdr working 상태 수신 | `doing` (유지) | notes 갱신 |
| `done` | done push → `pane.read` 단발 회수 → `[DONE]` 수신 | `done` | 결과는 done handoff의 attachment |
| `failed` | 스폰 실패·herdr 소켓 오류·agent 비정상 종료 | `blocked` | notes: `failed reason=<…>` |
| `timeout` | (슬라이스 **생략** — §4.3) | `blocked` | — |

전이는 단방향(`issued → dispatched → working → done|failed`)만 허용. 타워는 역행 전이 보고(예: `done` 후 `working`)를 **무시**한다.

#### 4.1.2 wire 매핑

정본은 §3.2. 요지: 새 envelope 없이 `mode:"task"` handoff + `[GOAL]`/`[DONE]` 태그 + **독립된 줄의** `intent:`/`task:`/`seq:` 헤더 라인(줄 시작 매치 파서 제약, handoff-contract.ts:45-47). 상관관계는 `task:<id>`, chat 금지, 결과는 attachment 256k 캡 내(envelope.ts:34-35), prompt는 payload로 60k 캡(§3.3).

#### 4.1.3 out-of-order 방어 — 이중 seq

이벤트가 순서를 어길 수 있는 구간이 둘이다.

1. **herdr → 브릿지**: herdr `pane.report_metadata`의 `seq`로 stale 메타데이터를 방어한다(§0.1 [가정-H] — Step 0.5 확인 대상). 브릿지는 pane별 last-seen seq를 유지하고 낮은 seq는 버린다.
2. **브릿지 → 타워**: handoff는 inbox 재전달·rejoin 시 재통지될 수 있으므로, 브릿지가 카드별 단조증가 `seq`(body 헤더 + payload 필드)를 실어 보낸다. 타워는 board notes에 last seq를 기록하고 `seq ≤ last`인 보고를 멱등 폐기한다. 상태머신의 단방향 규칙(§4.1.1)이 2차 방어선.

board의 `updatedAt` 최신-승리 병합 규칙은 snapshot import 경로 전용이므로(L-9, task-board.ts:497-537) 이 이벤트 경로의 순서 방어로 쓰지 않는다.

### 4.2 실패 모드

| # | 실패 모드 | 무슨 일이 일어나는가 | 슬라이스의 방어 | 근거 |
|---|---|---|---|---|
| F1 | **브릿지 다운** (dispatch 시점) | dispatch handoff가 브릿지 peer inbox에 `queued`로 쌓임. relay durable state가 queued\|notified를 스냅샷에 보존하므로 relay 재시작도 넘겨 생존. 브릿지 rejoin 시 `inbox.state` push로 수신 | 브릿지는 peerSecret 영속 보관으로 rejoin(§4.4.3). **주의: inbox 상한 100건** — 초과 시 trim이 오래된 pending을 버림. 슬라이스에선 노드당 동시 카드 수를 낮게 유지하는 운영 규칙으로 수용 | persist.ts:28-58, room.ts:153-187,464-488, envelope.ts:38 |
| F2 | **브릿지 다운** (claim 후, 실행 전/중) | `claim_handoff` 성공 시 entry가 inbox에서 삭제되므로(L-11) relay에는 더 이상 없음 — 카드가 `doing`에서 멈춤 | **at-most-once 수용.** 자동 복구 없음: 사람이 board에서 stuck 카드를 보고 재발행. 확장 1순위: 브릿지 로컬 저널(§2.6) | room.ts:624-627 |
| F3 | **herdr 다운** | 브릿지의 소켓 connect/subscribe 실패 또는 스트림 단절 | 스폰 전 실패 → 즉시 failed 보고(`failed reason=herdr_unreachable`) → board `blocked`. 실행 중 단절 → 해당 pane의 카드 전부 failed 보고. **[가정]** herdr 재시작 시 기존 pane/agent가 복원되지 않는다고 가정하고 재접속 후 이어받기를 시도하지 않는다 — Step 0.5에서 실측 | relay join fail-fast 관례(M-13, cli/src/index.ts:2134-2146)의 브릿지판 |
| F4 | **agent 무한 working** | done push가 영원히 안 옴 — 이벤트 드리븐 구조의 맹점 | **슬라이스에선 무방어(의도적 생략, §4.3).** 카드가 `doing`에 남고 사람이 herdr TUI/board로 관찰해 수동 개입 | — |
| F5 | **relay 재시작** | queued\|notified inbox와 roster(peer+secret)는 스냅샷에서 복원, 전원 offline 마킹. claimed\|accepted는 복원 안 됨(→F2와 동일 특성). chat·presence는 유실 | dispatch/done을 handoff로만 실었으므로 추가 방어 불요. 브릿지는 autoReconnect + rejoin으로 자동 복귀 | room.ts:102-151, persist.ts:28-58 |
| F6 | **persist 실패** (handoff 송신 시) | relay가 메모리 롤백 후 `persist_failed` error envelope 응답 (fail-closed) | 브릿지·타워 모두 송신을 RPC로 취급: `requestId`(≤80자) 상관 → `handoff.ack` 또는 `error` 확인. 실패 시 재송신. done 보고의 재송신 중복은 `task:` id + `seq`로 타워가 멱등 폐기(§4.1.3) | server.ts:392-405,214-225, room.ts:539-550 |
| F7 | **이중 dispatch** (같은 카드를 두 노드가 실행) | 발생 경로는 둘: ① 타워가 `to:'*'` 브로드캐스트로 dispatch → roster 전원 inbox에 각각 enqueue되어 **모든 브릿지가 실행**, ② 타워 재시도가 별개 handoff를 중복 발행 | ① **브로드캐스트 dispatch 금지** — 라우팅은 board가 소유하고 dispatch는 항상 특정 브릿지 peer 단일 타깃. ② 재발행 전 board `handoffId`·notes 확인은 사람 몫(슬라이스). 참고: 단일 inbox 안에서의 경합은 claim first-wins가 이미 원자적으로 해결 | room.ts:506-559 (routeHandoff '*' 의미론), room.ts:594-640 (first-wins) |

### 4.3 타임아웃·재시도 정책 — 슬라이스에서 생략하는 것

수직 슬라이스에서는 다음을 **의도적으로 생략**하고, 그 공백을 사람이 board를 보고 메우는 것으로 정의한다:

- **agent 실행 타임아웃 없음** (F4). 브릿지에 wall-clock 타이머를 넣지 않는다.
- **자동 재시도 없음.** failed/stuck 카드의 재발행은 사람이 board에서 수행. 유일한 자동 재시도는 F6의 wire-level 송신 재시도(ack 미수신 시)뿐이다.
- **진행 로그 스트리밍 없음.** done 후 `pane.read` 단발만.
- **브릿지 supervision 없음.** sticky host 관례와 동일하게 start-시점 idempotency(ping 확인)만 있고 자동 재기동은 없다(sticky-spawn.ts:61-92).

**이후(확장)**: 브릿지 로컬 저널로 F2 복구(§2.6) → `timeout` 상태 도입(브릿지 타이머 + failed 계열 보고) → 타워 측 재발행 정책(최대 N회, 지수 백오프). 어느 것도 wire 변경이 필요 없다.

### 4.4 보안 경계

#### 4.4.1 카드 prompt = handoff body = untrusted

handoff body는 어디서 오든 untrusted라는 기존 원칙(docs/ARCHITECTURE.md:109)이 카드 prompt에 그대로 적용된다. relay가 `sanitizePeerText` + 길이 캡을 서버 측에서 강제하지만(room.ts:413,428-449), 브릿지는 이를 신뢰 근거로 삼지 않고:

- prompt를 herdr `agent send`에 **리터럴 텍스트로만** 전달한다(no-Enter 리터럴 — §0.1 [가정-H]). 셸 문자열 보간·`pane run`(Enter 주입) 경유 금지.
- 에이전트에게 보이는 prompt 앞에 `⚠ Untrusted handoff content` 마커를 유지한다 — PTY inject의 M-4(docs/PLAN.md:86)와 동일한 원칙. 워커 에이전트는 자율 실행이 목적이므로 no-auto-submit(M-2)은 이 경로에 그대로 적용되지 않지만(§2.5 4단계의 별도 신뢰 모델 — R{n} 승인 필요), "주입 페이로드는 sanitize 산출물만"이라는 M-4의 절반은 유지한다.

#### 4.4.2 브릿지가 임의-argv 실행 데몬이 되는 위험 — agentKind allowlist

카드가 `argv`를 실어 보내면 브릿지는 room에 있는 누구든 원격 노드에서 임의 명령을 실행시킬 수 있는 데몬이 된다. 권고 문서의 개념 스케치(`card.agentArgv`)는 **이 지점에서 채택하지 않는다.**

- 카드 payload는 `agentKind`만 싣는다(§3.3). argv 매핑(`claude → ["claude"]` 등)은 **브릿지 로컬 설정 파일의 allowlist**에만 존재하고, wire로는 절대 오지 않는다.
- allowlist는 Loom의 닫힌 `AgentKindSchema`(claude|codex|grok|shell|unknown, envelope.ts:9-15)의 부분집합으로 제한하며, 슬라이스에선 `claude` 하나로 시작. `shell`은 allowlist에서 영구 제외(= 임의 명령 게이트).
- 위험 필드를 wire 표면에서 금지하고 로컬 전용으로 남기는 것은 M-24(set_purpose 금지 필드, tools.ts:250-275)와 같은 기존 관행이다.
- `--env`는 브릿지가 생성한 `LOOM_CARD=<cardId>` 하나만 주입 — 카드발 env 통과 금지.

#### 4.4.3 브릿지 자격증명 저장 — 0600 관례

브릿지가 영속해야 하는 비밀은 두 가지다:

1. **relayToken** — 비루프백 relay는 토큰 필수(H-5, server.ts:84-93)이고 브릿지는 `Authorization: Bearer` 헤더로 인증한다(URL 쿼리 금지 — H-6). relayUrl 필드에 토큰을 포함하지 않고 별도 필드로 둔다(session-store.ts:276-286 normalizeSession 강제와 동일).
2. **peerSecret** — join/rejoin 응답 `room.state`로 수신·영속(§2.2). 이것 없이는 rejoin이 `peer_auth_failed`로 거부되어 자기 inbox(=미처리 카드)를 이어받지 못한다(M-7).

저장 형식은 기존 관례 그대로: LoomSession/StickyHostMeta처럼 **mode 0600** 기록(session-store.ts:309-317, sticky-meta.ts:46-54), 파일명은 `profilesWithSession()` 함정 회피(§2.1), 경로는 반드시 `loomDir()` 경유(M-14).

#### 4.4.4 herdr AGPL-3.0 경계

herdr는 AGPL-3.0 + 상용 듀얼 라이선스다(§0.1 [가정-H] — Step 0.5에서 라이선스 파일 확인). 경계는 결합 방식으로 갈린다:

- **허용 (본 설계)**: 브릿지는 별도 프로세스로서 herdr의 로컬 소켓에 JSON을 **호출만** 한다 — arm's-length 프로세스 간 통신은 파생저작물이 아니며 Loom/브릿지 코드에 카피레프트가 전파되지 않는다. herdr 바이너리는 무수정 배포판을 그대로 실행한다.
- **금지**: herdr Rust 크레이트 링크, 소스 벤더링/포크 임베드, herdr 코드 일부를 브릿지에 이식하는 것. 이 중 하나라도 하면 AGPL 소스 공개 의무(네트워크 서비스 제공 시 §13 포함)가 결합물 전체로 확장될 수 있다.
- **[가정]** "소켓 호출만 = 비파생"은 FSF의 통상 해석이며 법률 자문이 아니다. 상용 배포 시나리오가 생기면 herdr의 상용 라이선스 트랙으로 재검토.

또한 브릿지는 접속 시 herdr 프로토콜 버전을 `ping`/`herdr status`로 확인하고 불일치 시 fail-fast한다 — relay `/health`의 `version: PROTOCOL_VERSION` 사전 확인(server.ts:106-115)과 대칭 구조.

---

## 5. 롤아웃 계획 — Step 0 PoC, 수직 슬라이스, 테스트

멀티 노드·멀티 OS는 나중이다. 순서: **Step 0(WSL2 네트워킹 실측) → Step 0.5(herdr 실측) → 수직 슬라이스 1개(카드 1장 왕복) → 그 뒤에만 복제**. 범위를 긋지 않으면 과잉 구현한다.

### 5.1 Step 0 — WSL2 네트워킹 PoC (본 설계 착수의 선행 조건)

권고 문서가 "여기가 안 뚫리면 나머지는 무의미"로 못 박은 유일한 환경 리스크. 기존 온보딩 런북의 WSL 경로는 **아웃바운드** `ws://`(WSL → 원격 VPS)만 검증했고(docs/DRY_RUN_RUNBOOK.md:105), 이번에 필요한 것은 반대 방향 — **Windows 호스트에서 도는 relay로 WSL 안의 브릿지가 인바운드 경계를 넘어 접속**하는 경로다. 이 차이가 PoC의 존재 이유다.

산출물은 `docs/spikes/STEP0-WSL2-NETWORKING.md` — 기존 spike 골격(Goal → Automated harness → Manual matrix → Verdict → Exit criteria → Out of scope, docs/spikes/PHASE-1.5-PTY.md 형식)을 따르고, PoC 코드는 spikes 산출물로만 남긴다(앱 본구현 금지, docs/WORKFLOW.md:161-162).

체크리스트 (런북 Step 형식):

- [ ] **① (Windows) `.wslconfig`에 mirrored 모드 설정** — `%UserProfile%\.wslconfig`:

  ```ini
  [wsl2]
  networkingMode=mirrored
  ```

  적용: PowerShell에서 `wsl --shutdown` 후 WSL 재기동. **[가정]** mirrored 모드는 Windows 11 22H2+ 요구 — 오너 머신이 이를 충족하는지 미확인. 미충족이면 ④ NAT 폴백 분기로.

- [ ] **② (Windows) relay LAN 바인딩 기동** — 비루프백 바인딩은 토큰 필수(H-5, server.ts:84-93):

  ```powershell
  $env:LOOM_RELAY_TOKEN = "<openssl rand -hex 24 산출값>"
  loom relay --host 0.0.0.0 --port 7842 --token $env:LOOM_RELAY_TOKEN
  ```

  (레포 체크아웃에서 돌리면 `bun run relay:lan`도 동일 — `LOOM_RELAY_TOKEN` 미설정 시 `:?` 확장으로 즉시 실패, package.json:29-30.)
  Windows 로컬 자가 확인: `curl http://127.0.0.1:7842/health` → `{"ok":true,...,"auth":true}` (`/health`는 무인증, server.ts:106-115).

- [ ] **③ (WSL Ubuntu 안) HTTP 도달 확인**:

  ```bash
  curl -m 5 http://127.0.0.1:7842/health    # mirrored면 localhost 공유
  ```

  기대: `{"ok":true,"version":1,...,"auth":true}` — `version` 필드로 브릿지의 사전 프로토콜 버전 확인 경로도 겸사 검증.

- [ ] **④ 실패 분기 (NAT 폴백)** — ③이 connection refused/timeout이면:
  1. mirrored 미적용 의심 → `wsl --version`으로 WSL 버전 확인.
  2. NAT 모드 폴백: WSL 안에서 `ip route show default`의 게이트웨이 IP로 `curl http://<그 IP>:7842/health`.
  3. 그래도 실패 → Windows Defender 방화벽에 7842/tcp 인바운드 허용 규칙 추가 후 재시도. **[가정]** NAT 모드에서 Windows 방화벽이 WSL 가상 NIC 발 트래픽을 차단하는 것이 통상적 실패 원인 — 실측으로 확정할 것.

- [ ] **⑤ (WSL 안) WebSocket join 왕복 확인** — HTTP 통과 ≠ WS 업그레이드 통과이므로 별도 확인. 가장 충실한 검증은 실제 클라이언트 경로:

  ```bash
  # Windows 쪽에서: loom room create --name herdr-poc && loom room invite --link
  # WSL 쪽에서:
  loom room join "loom://join/<blob>"
  loom status        # peer online 확인
  ```

  invite blob에 relayUrl+token+inviteCode가 들어 있어(invite-link.ts:1-12) 토큰 인증(Bearer, H-6)까지 한 번에 검증된다.

- [ ] **⑥ 장기 연결 예비 관찰** — join 상태로 30분 이상 유지 후 `loom status` 재확인(끊김·자동 재접속 여부 기록). 브릿지는 상시 WS 클라이언트이므로 순간 도달성보다 이 지표가 실질적이다. **[가정]** WSL 절전/Windows 슬립 시 소켓 생존 여부 미지 — 관찰만 하고 판정은 Unknowns로.

**통과 판정:** ③ health 200 + ⑤ join 성공(수신한 `room.state`에 `peerSecret` 포함, M-7 room.ts:277) — 이 둘이 Exit criteria. **실패 판정:** mirrored·NAT 폴백·방화벽 규칙 모두로도 ⑤가 안 되면 spike Verdict = no-go로 기록하고, 대안(relay를 WSL 안에서 기동하고 Windows Loom 클라이언트가 붙는 역방향 배치)을 다음 spike 질문으로 넘긴다 — 본 설계를 그대로 밀지 않는다.

### 5.2 Step 0.5 — herdr 실측 (§0.1 [가정-H] 전량 해소)

WSL 노드에 실물 herdr를 설치하고 다음을 확정한다. 산출물은 같은 spike 문서의 herdr 절 + fixture 캡처(§5.4):

- [ ] 설치·버전·라이선스 파일 확인 (pre-1.0 여부, AGPL 트랙)
- [ ] 소켓 경로·프레이밍(JSON 라인 여부)·`ping`/버전 응답 형태
- [ ] `agent start`의 `--env` 지원과 `HERDR_PANE_ID` 자동 주입 여부, pane_id 반환 형태
- [ ] `agent send`의 no-Enter 리터럴 여부 (M-4 정합의 전제)
- [ ] `events.subscribe` 이벤트 스키마(`agent_status_changed`), 상태 5종, 이벤트에 출력 본문 부재 여부
- [ ] `pane.read --source recent` 시그니처와 산출 형태
- [ ] pane 목록/상태 스냅샷 조회 존재 여부 (§2.4 reconcile 의존)
- [ ] `pane.report_metadata`의 seq 필드 (§4.1.3 의존)
- [ ] **요청/응답 원문 샘플을 fixture로 캡처** — fake herdr의 근거 (§5.4)

어긋나는 항목은 이 문서의 해당 절을 갱신한 뒤에만 구현 진행.

### 5.3 수직 슬라이스 — 완료 정의 (DoD: 카드 1장 왕복 e2e)

노드 1개(WSL) + 브릿지 1개. 아래 7단계가 한 번 끊김 없이 통과하면 슬라이스 완료다.

| # | 단계 | 검증 방법 |
|---|------|----------|
| 1 | 오너가 board에 카드 add → `dispatch_card`로 `[GOAL]` + `task:<id>` handoff 발행 (§3.2; L-32 기본 off 정합 — dispatch는 항상 명시적) | **자동** |
| 2 | 브릿지 peer가 inbox 수신 → `claim_handoff`(first-wins) — 카드 상관관계는 attachment payload의 `cardId` (M-9, room.ts:441) | **자동** |
| 3 | 브릿지 → herdr `agent.start --env LOOM_CARD=<cardId>` + `agent.send <prompt>` | **자동** (fake herdr) / **수동** (실물) |
| 4 | `events.subscribe`로 done push 수신 — 폴링 없음 | **자동** (fake herdr) / **수동** (실물) |
| 5 | done 직후 `pane.read` 단발 1회로 결과 회수 | **자동** (fake herdr) / **수동** (실물) |
| 6 | 브릿지가 `[DONE]` + `loom-card-result` attachment handoff를 발신자에게 전송, `handoff.ack` requestId 상관 확인(persist fail-closed 대응, server.ts:214-225,392-405) | **자동** |
| 7 | 오너 쪽에서 `[DONE]` 수신 → `apply_card_result`로 카드 done 이동 — board는 local-only라 상태 반영은 오너 노드에서만 (task-board.ts:6) | **자동** |

여기에 내구성 시나리오 2개를 DoD에 포함한다 (둘 다 **자동**):

- **오프라인 dispatch:** 브릿지가 오프라인일 때 1을 실행 → 카드 handoff가 inbox에 `queued`로 생존(durable, persist.ts:28-58) → 브릿지 재접속(join) 시 unsolicited `inbox.state`로 수신 (server.ts:357-371).
- **브릿지 재시작:** 브릿지가 join의 `peerSecret`을 0600 파일로 영속 보관하고, 재시작 후 같은 peer id로 rejoin해 자기 inbox를 이어받음 (M-7, room.ts:240-267) — secret 없이 rejoin하면 `peer_auth_failed`가 나는 것까지 부정 케이스로 확인.

**자동/수동의 경계:** relay↔브릿지 구간(1,2,6,7 + 내구성 2건)은 전부 CI 자동. 브릿지↔herdr 구간(3,4,5)은 CI에서 fake herdr로 자동, **실물 herdr + 실제 에이전트로는 수동 라이브 스모크 1회**(런북 Step 형식 체크리스트로 문서화) — 0.21.1의 "python 주입 경로는 코드리뷰만, flag 활성화 전 라이브 스모크" 선례와 동일한 이원화다(docs/PLAN.md:92).

### 5.4 테스트 전략 — herdr 없는 CI에서 브릿지 테스트

CI에는 herdr 바이너리가 없고, 있어서도 안 된다(Rust 별도 빌드 + AGPL 결합 경계 유지 — 소켓 API **호출만** 하는 경계를 코드 배치로도 유지, §4.4.4).

- **relay 쪽은 실물:** relay는 우리 코드이므로 목킹하지 않는다. 테스트에서 `RelayServer`를 in-process(127.0.0.1, ephemeral port)로 띄우고 브릿지를 실제 WS로 붙인다 — 기존 Docker/LAN 하네스·`bun test` 관례의 연장.
- **herdr 쪽은 fake 소켓 서버:** 브릿지의 herdr 소켓 경로를 env/설정으로 주입(§2.3)하고, 테스트가 `Bun.listen({ unix })`로 fake herdr를 띄워 최소 메서드 집합만 구현한다: `ping`/`status`(프로토콜 버전 응답), `agent.start`(env에 `LOOM_CARD` 포함 여부 기록), `agent.send`, `events.subscribe`(스크립트된 시점에 done push), `pane.read`(고정 결과 반환). fake는 수신 요청을 전부 기록해 "브릿지가 무엇을 보냈는가"를 단언한다.
- **fake의 정직성:** herdr는 pre-1.0이라 wire 형태가 변할 수 있다(§0.1). Step 0.5/라이브 스모크에서 **실물 herdr의 요청/응답 샘플을 캡처해 fixture로 고정**하고 fake를 그 fixture에서 생성한다 — fake가 상상 속 프로토콜을 검증하는 것을 막는 유일한 방법.
- **fail-fast 정합:** 브릿지는 기동 시 herdr `ping`으로 프로토콜 버전을, relay `/health`로 `version: 1`을 확인하고 불일치 시 스폰 없이 종료 — M-13 fail-fast 관례를 양쪽 접점에 적용. 이 부정 경로도 fake로 자동 테스트.
- **실패 모드 자동화:** fake herdr가 (a) done 이벤트를 영영 안 보냄(카드 `doing` 유지 확인), (b) 구독 소켓 중도 절단(재구독 + 중복 dispatch 없음 — at-most-once), (c) 미지 프로토콜 버전 응답 — 세 케이스를 스크립트할 수 있어 실물보다 오히려 유리하다.

---

## 6. PLAN 편입·UNKNOWNS 등록

### 6.1 PLAN.md 편입 제안

- **버전: `0.22.0` (MINOR), Status `pending-review`, 리뷰 게이트 R23.** 새 제품 표면(노드 브릿지 데몬 + MCP dispatch 도구) + 신뢰 경계(원격 노드에서 untrusted handoff 본문이 에이전트 프롬프트로 주입됨)이므로 R{n} 필수 사유에 정면으로 해당(docs/WORKFLOW.md §5.1).
- **FREEZE 관계를 Changelog에 명시:** 신규 기능은 팀 pull만 허용되는 동결 중이므로, 0.21.1처럼 "**FREEZE 예외 = 오너 pull**(날짜)" 한 줄이 없으면 게이트를 열 수 없다(docs/PLAN.md:94). **[가정]** 이 기능이 오너 pull이라는 확인 — 편입 전 오너가 명시해야 한다.
- **Changelog 항목은 0.21.1 패턴 그대로:** Product one-liner / Why(권고 HTML + 본 설계서 인용) / What 2열 표(Step 0 spike, 브릿지 데몬, dispatch/done 컨트랙트) / Out of scope / Security-trust / Review impact / Unknowns(§3.5 → docs/UNKNOWNS.md §0.22.0) / Binding locks / Approved by (docs/PLAN.md:53-94 구조).
- **Review impact에 와이어 불변 명시:** 슬라이스는 `mode:"task"` handoff + body-prefix 태그로만 구현 — **relay 스키마 변경 없음**. handoff 옵셔널 필드 추가가 필요해지는 순간 relay 코드(`resolveHandoff` 재구성) 수정이 강제되므로 그건 별도 R{n} 대상으로 분리.
- **순서:** Step 0 spike Verdict(go) → Step 0.5 herdr 실측 → Unknowns 패스 → PLAN 0.22.0 `pending-review` → R23 → approved 후에만 본구현. 이 설계서 자체는 PLAN의 Related 링크로만 — 버전·status SSOT 대체 금지(docs/WORKFLOW.md:60-65).
- 구현 시 CLI `VERSION`·MCP serverInfo를 0.22.x로 동기화(docs/WORKFLOW.md:196).

### 6.2 UNKNOWNS 등록 — `docs/UNKNOWNS.md` Gate log 초안

```markdown
### 0.22.0 — Loom×Herdr 노드 브릿지 (수직 슬라이스)

| Field | Value |
|-------|--------|
| **PLAN** | v0.22.0 (`pending-review` 예정) |
| **Date** | 2026-07-17 |
| **Review** | R23 required (새 데몬 표면 + 원격 프롬프트 주입 신뢰 경계) |

| 분면 | 내용 |
|------|------|
| Known knowns | handoff는 durable inbox로 전달 보장(persist fail-closed); peerSecret rejoin(M-7); 데몬 관례 완비(메타 사이드카·Bearer IPC·M-27 안전 stop); work-bus [GOAL]/[DONE] 태그 dispatch 선례 |
| Known unknowns | **(1) WSL2 mirrored 네트워킹 — Windows relay로 WSL 인바운드 WS가 실제로 붙는가(판정 리스크, Step 0 spike가 게이트)**; (2) herdr 소켓 표면 전체 — 프레이밍·메서드·이벤트·seq·버전이 권고 문서 주장대로인가(Step 0.5가 게이트, HERDR_DESIGN §0.1); (3) 장기 events.subscribe 구독 안정성 — 절단 시 재구독·이벤트 유실·at-most-once dispatch 보장; (4) inbox 100건 trim vs 장기 오프라인 브릿지의 카드 유실 허용 여부; (5) 워커 pane 자동 제출이 M-2와 별도 신뢰 모델로 승인 가능한가(R23 판단); (6) 브릿지 AgentKind — 'bridge' enum 확장 vs shell 유지 |
| Unknown knowns | herdr 'done' 롤업의 정확도 — 에이전트가 정말 끝났는가 vs idle 오판(PTY spike의 idle 감지 교훈이 이 경계에도 적용될 것); "이벤트에 출력 본문 없음 = 백프레셔 설계"라는 권고 문서 해석의 타당성 |
| Unknown unknowns | WSL 절전·Windows 재부팅 시 브릿지/소켓 생존; herdr AGPL 결합 경계가 배포 형태에 따라 달라지는 지점; Bun WS 클라이언트 장시간 연결의 미지 동작 |

**Next session:** Step 0 spike 실측 → Verdict go면 Step 0.5 herdr 실측 → PLAN 0.22.0 `pending-review` → R23.
```

---

## 7. 명시적 비목표 (non-goals — 이 슬라이스 아님)

- **실시간 진행 로그 스트리밍** — `pane.read` 루프 없음. done 직후 단발 회수만.
- **멀티 노드 / Mac·Linux 복제** — 슬라이스 검증 후에만. `@node` 라우팅 일반화도 함께 이후로.
- **Windows 네이티브 herdr** — named pipe 베타를 구조적으로 회피하는 것이 이 아키텍처의 존재 이유. 재고하지 않음.
- **relay 와이어 스키마 변경** — v1 유지, body-prefix 태그로만. envelope/handoff 필드 추가는 별도 R{n}.
- **board relay 동기화** — board는 local-only 유지(task-board.ts:6). 카드 상태 반영은 `[DONE]` handoff를 받은 오너 노드의 로컬 갱신으로만.
- **브릿지 자동 재시작(supervision)** — 기존 데몬 관례대로 start의 idempotency(ping 확인)만(sticky-spawn.ts:61-92).
- **herdr 포크/임베드** — 소켓 API 호출 경계 밖으로 나가지 않음(AGPL, §4.4.4).
- **카드발 argv/env 전달** — wire 표면에서 영구 금지(§4.4.2). allowlist 확장만 허용.
