# HERDR-STATUS-PROBES — TLA+ 가정을 확인할 라이브 herdr 프로브 설계 (대상 herdr 0.9.5 / protocol 22)

> 상태: **하니스 = `scripts/probe-herdr-status.ts` v2(`[herdr 전용]` S0·A·B1·C·D1·E·s 구현) · run 1(`6c0c3e`, v1, private)
> · run 2(`dcda61`, v2, private, 2026-10-23) 완료 — 결과는 각 결과표 + §11 사실표 · run 2 뒤 A 동률 술어 수정(§4 run-2 주)
> · B2·D2 미구현(exit 2) · 제품 코드 무변경.**
> **(run-2 analysis)** run 1 행 = 하니스 전제 산물(쉘 pane 권한 해제), run 2 행 = herdr 사실(held pane). A의 run-2 FAIL은 같은-ms
> 동률 술어 산물이며 herdr 사실로는 `A-1/bun-pause-loss`다.
> **(run-1 analysis)** run 1의 공통 원인: herdr 0.9.5는 평범한 쉘 pane의 `report_agent` 권한을 ~0.1–1 s 안에 놓는다
> (`released:true, final_status:"unknown"` 뒤 `agent.get` not found). 그래서 A·C·D1·E 판정 일부는 하니스 전제의 산물이었다.
> v2는 A·C·D1·E·s를 **held pane**(§2.6) 위에서 돌리고 단계마다 레벨을 단언한다(`LEVEL_LOST` = INCONCLUSIVE, FAIL 아님).
> 대상: `docs/spikes/BRIDGE-STARTUP-TLA.md` §0 항목 5의 (a)–(e). **버전 게이트 = herdr 0.9.5 · protocol 22**(로컬 herdr,
> Loom 0.45.3+는 {17, 22} 지원). 재타깃 근거 = `docs/spikes/HERDR-0.9.5-COMPAT.md` §4(14개 변경)·fixture
> `docs/spikes/fixtures/herdr-v0.9.5/`(`schema.json`·`*-help.txt`·`status.json`·`version.txt`).
> 0.7.5 결과가 있다면 그것은 **protocol 17에만** 유효하다(이 문서의 판정에 섞지 않는다).
> 좌표 표기: `22:N` = 0.9.5 `schema.json` 줄, `17:N` = 0.7.5 `schema.json` 줄. 코드 좌표는 접두 없으면 `56a171a` 기준(재검 안 함),
> HEAD 좌표는 `ccaf5ea:` 접두.
> 이 문서는 프로브를 **어떻게** 돌릴지 정한다. 결과·판정은 실행 뒤 각 프로브의 결과표와 별도 관측 문서(§9)에 적는다.

## 0. 요약

| # | 가정 (TLA §0-5) | TLA 상수·전제 | 태그 | 핵심 수단 |
|---|---|---|---|---|
| S0 | 격리·버전·`report_agent` push 성립 | 모든 프로브의 바탕 | `[herdr 전용]` | `ping` · `server.agent_manifests` · `report_agent` 1회 |
| A | 구독 연결에 클라이언트 EOF → herdr가 구독을 내리고 연결을 닫는가 | `Drain` | `[herdr 전용]` | 쉘 pane + `pane.report_agent` + `sock.end()` |
| B1 | 가짜 agent 바이너리 기동 후 프롬프트 전 status | `MaxBoot` (예비) | `[herdr 전용]` | PATH 가짜 바이너리 + `agent.start` |
| B2 | 실 CLI `interactive_ready` 뒤·프롬프트 전 `working`/`idle` | `MaxBoot` (C9·C10·F11·F12·F14) | `[실 CLI — 오너 yes]` | 실 CLI 기동만, 프롬프트 없음 |
| C | 새 구독자에게 status backlog를 replay하는가 (0.9.5 / protocol 22) | `Replay` (C11·C12·F15·F16) | `[herdr 전용]` | 0.7.4 시나리오 D를 0.9.5에서 재실행 + 공백 변형 |
| D1 | `done` status를 언제 내는가 (report_agent 원천) | `done`-scope (§2.2 범위 제외 전제) | `[herdr 전용]` | `report_agent` 전이 + (private만) 포커스 |
| D2 | 실 CLI 1회 프롬프트의 `done` 시점·지연 | `done`-scope · `LatencyBound` | `[실 CLI — 오너 yes]` | 실 CLI 1회 프롬프트 |
| E | `agent.wait{until:[idle,done]}`은 level인가 edge인가 | F2' 대체 가능성(COMPAT §3 마지막 행) | `[herdr 전용]` | 이미 `idle`인 pane에 `agent.wait` |
| s | `state_change_seq`는 pane별 마지막-변경 도장인가 전역 카운터인가 · 같은 상태 재보고에 오르는가 **(run-1 analysis)** | F2''(seq 정렬 스냅샷) · 세대 귀속 | `[herdr 전용]` | held pane 2개 |

모든 프로브 공통 신규 관찰(TLA (e)): **각 단계 전·후 `agent.get`의 `revision`·`state_change_seq`·`completion_seq`**(§2.4 G-스냅샷).
부산물: D2·B2는 프롬프트→첫 `working` 지연도 잰다 → `LatencyBound`(4 s) 근거 자료(판정 아님).

## 1. 근거 — 레포가 herdr와 말하는 방식 (0.9.5 기준)

- **전송.** Unix 소켓 NDJSON JSON-RPC. RPC는 호출마다 새 소켓(`herdr-client.ts:302-361`), 이벤트는 장수 `events.subscribe`
  연결(:683, :726). 열린 구독 연결은 두 번째 요청을 받지 않는다(:676-679). 소켓 경로 = `LOOM_HERDR_SOCKET` 또는
  `~/.config/herdr/herdr.sock`(:27, `bridge-config.ts:154`; 0.9.5 `herdr status server --json`의 `socket`도 같은 경로 —
  COMPAT §6 ①). herdr 자체 오버라이드 env = `HERDR_SOCKET_PATH`(STEP0.5-HERDR.md:82 — 사이트 문서 근거, 0.9.5 **미실측**).
- **선례 프로브.** `scripts/probe-pane-death.ts` — `HerdrClient`를 쓰지 않는 raw 소켓(재구독 로직 오염 방지,
  PANE-DEATH-OBSERVATIONS §3.1), 시작 시 살아 있는 pane 전부 보호(`PROTECTED_EXPANDED`, §D.10), 자기 전용 jsonl 로그,
  `PROBE_END` 마커로 완주 판별(§2.3). **pane 밖에서 실행**해야 한다(라운드 1 절단, §2.1).
- **CLI 없이 status 만들기.** `pane.report_agent`(22:5935) params `{pane_id, source, agent, state, seq?, message?,
  agent_session_id?, agent_session_path?, resume_argv?}` — required `pane_id·source·agent·state`(`PaneReportAgentParams`
  22:2886-2944). `PaneAgentState` = `idle|working|blocked|unknown`, **`done` 불가**(22:2431-2439). 신규 선택 필드
  **`resume_argv`(22:2912-2921)는 프로브가 절대 보내지 않는다**(herdr 재시작 시 세션 복원 부작용 회피). 0.7.4에서 RPC `ok` →
  push 13–104 ms(OBS §D.3) — 0.9.5에서는 S0이 다시 확인한다.
- **`done`.** 이벤트·응답 `AgentStatus` enum에는 `done`이 있다(22:72-81, 22:1375-1384). 클라이언트가 쓸 수 없으니 **herdr가 스스로
  도출**하는 값이다 — 도출 규칙은 문서화돼 있지 않다(Unknown). 0.9.5 단서: `AgentInfo.completion_seq` 설명 "The current idle
  transition completed work, independently of who has viewed it."(22:6564-6572) — H-D1(§6)과 어울리는 정황일 뿐 증명 아님.
- **기동 순서(0.9.5에서도 동일, 표기만 갱신).** `tab.create`(22:5135, `TabCreateParams{cwd?, env?, focus=false, label?, workspace_id?}`
  22:4273-4305) → `agent.start`(22:5391, `AgentStartParams{name, kind, pane_id, args?, timeout_ms?}` 22:1341-1374; `timeout_ms`는
  3000 초과·300000 이하) → `launch_pending`이면 `agent.get{target}`(22:5263, `AgentTarget` 22:1385-1395) 폴링으로
  `interactive_ready`(`herdr-client.ts:380-450`; COMPAT §3.1). **kind 고정 목록은 0.9.5 fixture에 없다** — `AgentStartParams.kind`는
  자유 문자열(22:1349-1351), `agent-help.txt:15`는 "Start a supported interactive agent in an existing pane"뿐. S0이
  `server.agent_manifests`(22:4767, `EmptyParams`)로 지원 kind와 명령 해석을 기록한다. 관련 메서드: `agent.explain`(22:5295,
  `AgentTarget`), `pane.release_agent`(22:5999, `{pane_id, source, agent, seq?}` 22:2842-2868), `pane.clear_agent_authority`
  (22:5983, 22:2440-).
- **응답 `AgentInfo`(agent.get / agent.start 결과, 22:6560-6677).** required `terminal_id·agent_status·workspace_id·tab_id·pane_id·
  focused·revision`(22:6667-6675). 단조 후보: `revision`(22:6609-6613), `state_change_seq`(default 0, 22:6617-6622 — 17에도 있음
  17:6034-6039), **`completion_seq`(uint64|null, 22 전용, 22:6564-6572)**. 그 밖에 `interactive_ready`·`launch_pending`
  (22:6594-6599), `screen_detection_skipped`(22:6614-6616).
- **이벤트.** 구독 정의(22:4100-4250): `{type:"pane.agent_status_changed", pane_id, agent_status?}`(22:4217-4242),
  `{type:"pane.closed"}`(22:4109-4120)·`{type:"pane.exited"}`(22:4157-4168)·**`{type:"pane.agent_detected"}`(22:4169-4180)은
  pane 필터 없는 전역 구독** — `pane_id`를 붙이지 않고 클라이언트에서 거른다. `EventsSubscribeParams`는 `{subscriptions}`만
  (22:2121-2134) — **replay·since·cursor 옵션 없음**, `events.unsubscribe` 없음(구독 종료 = 연결 종료뿐). status 이벤트 데이터
  `PaneAgentStatusChangedEvent{pane_id, workspace_id, agent_status, agent?, display_agent?, state_labels?, title?}`
  (22:6340-6382) — **seq·id·시각 없음**.
- **0.7.4 기존 관측.** status는 replay 안 됨, terminal은 replay됨(OBS §D.7). push 이름: status는 dotted
  `pane.agent_status_changed`, terminal은 underscore `pane_closed`(§D.8-2). 죽은 pane의 status 구독은 ACK가 영영 오지 않는다(§D.8-1).
  0.9.5에서 같은지 **미실측** — 이름은 양쪽 수용으로 기록한다.

## 2. 공통 설계 — 단일 Bun 프로브 `scripts/probe-herdr-status.ts` (구현됨 — `[herdr 전용]`만, v2 = run-1 분석 반영)

### 2.1 형태

```text
bun run scripts/probe-herdr-status.ts [--server private|shared] [--probe step0,a,b1,c,d1,e,s|all]
                                      [--timeout-ms N] [--reps N] [--dry-run] [--help]
bun run probe:herdr-status …                                   # package.json 별칭
```

- `all`(기본) = **`[herdr 전용]` 프로브만**(step0·a·c·d1·e·s·b1, §9 순서). step0은 항상 먼저 돈다(나머지의 바탕 —
  v2에선 held-pane driver 점검 §2.6 포함).
  **B2·D2는 구현하지 않았다:** `--probe b2|d2`·`--real-cli`·`--kind`는 즉시 exit 2("requires owner yes; not implemented").
  HANDOFF Must-not("real-CLI smoke without explicit owner yes")을 코드로 막는다. B2·D2 구현은 오너 yes 뒤 별도 작업.
- 출력: `T/events.ndjson`(NDJSON 원 로그) · `T/summary.json` · stdout에 `T=<경로>`와 프로브별 요약
  `{probe, verdict: PASS|FAIL|INCONCLUSIVE|SKIPPED, code, facts, created, closed, leftover}`. exit 0 = FAIL 없음 · 1 = FAIL/중단 · 2 = 사용법/거부.
- 안전 가드는 RPC 래퍼 한 곳(`guard`)에 있다: `focus:true`·`resume_argv` 거부, `server.stop`은 private + 소켓이 `T/` 아래일 때만,
  `server.reload_*`·`server.live_handoff`·`integration.*`·`client_shell.*`·`agent.prompt*`·`tab/workspace/agent.focus` 거부,
  `pane.focus`는 private만, 쓰기 RPC는 `assertOwned`(프로브 생성 집합 ∧ PROTECTED 아님).
- `probe-pane-death.ts`의 raw `rpc()`·`openEventSubscription()`·`parseNdjsonLines()`를 복사해 쓴다(import 금지 —
  그 파일은 main()을 자동 실행한다). 구독 함수에 두 가지를 더한다:
  `allowHalfOpen: true`로 연결 · `end()`(half-close)와 `destroy()`를 별도 노출 · `'end'`(서버 FIN)·`'close'`·`'error'`
  이벤트와 시각을 모두 기록.
- 모든 push를 `{t_ms, conn, raw}`로 기록하고, 판정은 **로그에서 계산**한다(실행 중 요약으로 원문을 대체하지 않음).
- **push 이름 정규화:** status는 dotted·underscore 둘 다 받는다(`event`에 `agent_status` 포함). terminal도 둘 다.
- **보내지 않는 것:** `pane.report_agent.resume_argv` · `agent.prompt.wait`(22:1239-1247 — 프롬프트 RPC를 짧게 유지) ·
  `client_shell.surface.set`(`surface_interest` 비간섭 — 프로브 연결은 surface lease를 잡지 않는다; 결과 해석에 영향 없음을
  관측 문서에 한 줄 기록) · `workspace.close.close_group`.

### 2.2 격리 — temp HOME + 서버 모드

- 시작 시 `T = mkdtemp(tmpdir()/loom-herdr-probe-)`. 프로브는 `HOME=T/home`·`LOOM_TEST_HOME=T`로 실행하고
  로그·스크래치 파일을 전부 `T` 아래에 둔다(Must-not: temp HOME + `LOOM_TEST_HOME`). 브리지 env는 상속하지 않는다(R48-H1).
- **`--server private` (기본, 권장):** 프로브가 자기 herdr 서버를 띄운다.
  `env -i PATH=… HOME=T/home HERDR_SOCKET_PATH=T/herdr.sock setsid herdr server` → 소켓이 `T/` 아래 생길 때까지 대기 →
  `ping{}`(22:4687, `PingParams` = 빈 객체)이 **`version 0.9.5 · protocol 22`**인지 확인(아니면 abort). 워크스페이스가 없으면
  `workspace.create`.
  - **전제 확인(S0):** headless `herdr server`가 temp HOME에서 뜨고 `HERDR_SOCKET_PATH`를 따르는지는 0.9.5에서 **다시 미실측**이다.
    0.9.5는 `detached_server_daemon: true` capability를 내므로 기동이 데몬 분리될 수 있다 — S0에서 **서버 pid(분리 후 실제 pid)와
    소켓 경로**를 함께 기록한다. S0이 실패하면 shared로 자동 강등하지 않는다 — 중단·보고 후 아키텍트가 shared(§2.5) 여부를 결정.
  - 이점: 사용자 pane·포커스·`herdr-server.log`를 오염하지 않는다. 다른 구독자가 없어 replay 대조가 깨끗하다.
  - 한계: temp HOME에는 herdr 통합(`integration.install` — 예: Claude 훅)이 **설치돼 있지 않다**. B2·D2의 결과는 운영
    설정과 다를 수 있다(§5.4 참고).
- **`--server shared`:** `LOOM_HERDR_SOCKET`/기본 소켓 사용 — **오너의 사용자 herdr도 0.9.5 / 22**다(COMPAT §6 ①). shared로
  돌면 `ping` 결과가 private과 같은 버전임을 기록한다. `[herdr 전용]` 프로브는 §2.5 안전 블록을 지키는 조건에서만 shared로 돈다.
- 실행 위치: **herdr pane 밖**(하니스 백그라운드나 일반 터미널). 워커 테스트 스위트와 동시 실행 금지(traps).
  **(run-1 analysis)** run 1은 herdr pane 안에서 실행됐다(오염 흔적은 없었음). v2는 herdr 접촉 전에 프로브 자신의 env에서
  상속된 `HERDR_*`(와 `LOOM_*`)를 지우고, 지운 키 **이름만** `facts.herdrEnvStripped`·`PROBE_BEGIN`·`summary.json`에 남긴다.
  지운 뒤에도 남아 있으면 herdr 접촉 없이 exit 1. private 서버와 python 클라이언트(§4 변형 c)는 명시 env로만 띄운다.
- 스크래치 pane: `tab.create{focus:false, label:"hsprobe-<probe>-<run>", cwd:T, env:{HOME:"T/home", LOOM_TEST_HOME:"T"}}` →
  응답의 root pane 사용. 모든 이름에 접두 `hsprobe-`. **agent CLI를 띄우지 않는 평범한 쉘 pane**이다(B2·D2 제외).
  **(run-1 analysis)** v2의 A·C·D1·E·s는 private에서 이 pane에 `agent.start`로 **가짜 바이너리**만 띄운 held pane(§2.6)을 쓴다 —
  실 CLI는 여전히 띄우지 않는다.

### 2.3 정리 (모든 프로브 공통, `finally`)

1. 열린 모든 이벤트 소켓 `destroy()`.
2. 소유 pane·tab·workspace를 `pane.close{pane_id}`(22:6015, `PaneTarget`) / `tab.close{tab_id}`(22:5231, `TabTarget`) /
   `workspace.close{workspace_id}`(22:5055)로 닫는다(`assertOwned` 통과분만 — 프로브가 만든 id 집합에 있는 것만).
3. private 모드: `server.stop{}`(22:4703, `EmptyParams`)를 소켓 경로가 `T/` 아래임을 재확인 후 → 5 s 안에 서버 pid가 사라지지
   않으면 그 pid에만 SIGTERM. **사용자 herdr에는 절대 `server.stop`을 보내지 않는다.**
4. 실 CLI 프로브: CLI 프로세스가 pane과 함께 죽었는지 `pane.process_info{pane_id}`(22:5519, close 전 기록)의 pid로 확인 — 남았으면
   그 pid만 SIGTERM.
5. `PROBE_END{created:{workspaces,tabs,panes}, closed:{…}, leftover:[…]}` 기록 후 `T/`는 **지우지 않는다**(원자료 보존 — 관측
   문서 작성 뒤 수동 삭제).

### 2.4 G-스냅샷 — 모든 단계 전·후 레벨 기록 (TLA (e))

`G(P)` = `agent.get{target:P}` 1회 → `{t_ms, agent_status, revision, state_change_seq, completion_seq, focused, interactive_ready,
launch_pending}`(오류면 오류 원문). 모든 프로브의 **각 번호 단계 직전과 직후**(push 관찰 창이 있는 단계는 창 끝)에 `G(P)`를 남긴다.
목적: 전이당 `state_change_seq` 증가 규칙(상태 변화마다 +1인가 · 같은 상태 재보고에도 오르는가), `completion_seq`가
`working→idle`(또는 `done`)에서만 오르는가, `revision`과의 관계, status 갱신과 원자적인가(push 수신 직후 G가 이미 새 값인가).
쉘 pane에 `report_agent` 전 `agent.get`이 실패할 수 있다 — 그 자체를 기록한다(판정 아님).

**추가 점검 (Astra 0251 M5/M6):**
- **신선도·일치:** push 수신 **직후** `G(P)`를 1회 더 찍어 `agent.get`의 `agent_status`가 push 값과 같은가(`fresh`)·
  push→조회 지연(ms)을 남긴다(하니스 `facts.freshness`). 다르면 이벤트와 레벨 조회가 서로 다른 시점의 상태를 보는 것 —
  F2′의 "스냅샷 = 서버의 그 시점 `ast`" 전제를 약화한다.
- **seq 증가·초기화·원자성:** 단계 전·후 diff(`dRev`·`dScs`·`dCs`)와 **감소(`reset`)** 여부를 기록한다. 감소가 보이면
  (release·close·재보고 뒤 등) seq는 단조 마커로 쓸 수 없다. push 직후 G에서 `state_change_seq`가 이미 올라 있는지(`scsAdvanced`)로
  status 갱신과 seq 갱신의 원자성을 본다. 공백(구독자 0) 중 전이에서도 seq가 오르는지(C 5단계)를 따로 본다.

### 2.5 shared 서버 안전 블록 — `[herdr 전용]` 프로브 공통

오너의 공유(사용자) herdr에서 돌 때 **전부** 지킨다. 하나라도 지킬 수 없으면 그 단계를 생략하고 `SKIPPED(shared)`로 기록한다.

1. **전용 공간:** 시작 시 `workspace.create{focus:false, label:"hsprobe-<run>", cwd:T}`(22:4927, `WorkspaceCreateParams`
   22:4383-4416)로 **새 워크스페이스**를 만들고, 모든 스크래치 tab은 `tab.create{workspace_id:<그 id>, focus:false, …}`로 그 안에만 만든다.
   워크스페이스 생성이 거절되면 기존 워크스페이스 안에 **새 tab**만 만든다(그 tab 밖은 건드리지 않음).
2. **기존 pane 불가침:** 시작 시 `pane.list{}`(22:5743)로 살아 있는 pane id 전부를 `PROTECTED`로 기록. 프로브의 모든 쓰기 RPC
   (`report_agent`·`release_agent`·`close`·`agent.start`·`agent.prompt`·`agent.wait`)는 대상 id가 **프로브 생성 집합**에 있을 때만
   보낸다(`assertOwned`). 읽기(`agent.get`·`pane.list`)는 허용.
3. **포커스 금지:** 모든 생성은 `focus:false`. `pane.focus`·`tab.focus`·`workspace.focus`·`agent.focus` 호출 금지(D1 4단계 생략).
4. **agent CLI 미기동:** `[herdr 전용]` 프로브는 쉘 pane만 쓴다. `agent.start`는 B1(PATH 가짜 바이너리)만 — 가짜 해석이 확인되지
   않으면(§4.1 Step 0) B1은 shared에서 **실행하지 않는다**(실 CLI로 해석될 위험). **(run-1 analysis)** held pane(§2.6)도 같은 이유로
   shared에서 만들지 않는다 → shared의 C·D1·E·s = `NO_HELD_SUBSTRATE(shared …)`, A = 쉘 pane.
5. **서버 제어 금지:** `server.stop`·`server.reload_*`·`server.live_handoff`·`integration.*`·`client_shell.*` 호출 금지.
6. **정리·장부:** 생성한 workspace/tab/pane id와 생성 시각, 닫은 id와 닫은 시각을 `PROBE_END`에 남기고, 결과표의
   "생성/닫음 id" 열에 옮긴다. leftover가 있으면 판정과 무관하게 실행을 `DIRTY`로 표시하고 보고.
7. 공유 서버에는 다른 구독자(브리지 등)가 있을 수 있다 — Probe C의 replay 해석에 "다른 구독자 존재"를 기록(판정 영향 가능).

### 2.6 held pane — 레벨이 유지되는 바탕 (run-1 analysis)

run 1에서 쉘 pane의 `report_agent{agent:"bash"}` 권한은 0.1–1 s 안에 풀렸고(`unknown` 주입 → `agent.get` not found ·
`agent.wait` 즉시 `agent_not_found`), 반면 B1의 가짜 agent pane은 감지기가 잡은 `idle`을 30 s 동안 그대로 유지했다. v2는:

- **held pane** = `tab.create{env:{PATH:T/fakebin:…}}` → `agent.start{kind:<가짜 kind>}`(B1과 같은 해석 규칙: manifests에 있고
  T 밖 절대 경로 없음) → `pane.process_info` foreground가 `T/fakebin`인지 확인(실 CLI면 즉시 `pane.close` + `ABORTED_REAL_CLI`로
  **실행 중단**) → `agent.get` 폴링으로 `interactive_ready ∧ idle`(≤ 12 s). `agent.start` 결과의 `state_change_seq`를 기록한다.
- **driver 점검(S0 끝, private만):** held pane 하나에 `report_agent{agent:<가짜 kind>, working}` → `agent.get` 25 ms 간격 2 s가 **전부**
  `working`인가 → `idle` 보고 → 1 s가 전부 `idle|done`인가. 실패하면 `agent:"bash"`로 한 번 더. 처음 성립한 `agent` 이름이 driver
  (`facts.heldSubstrate.driverAgent`, 시도별 표본 run-length = `trials`). 둘 다 실패하면 driver 없음 — 그 자체가 결과다
  ("이 버전에서 `report_agent` 권한을 유지하는 herdr-only 수단 없음").
- **레벨 단언:** held pane에선 각 단계 직전 `G(P)`가 기대 레벨(보고한 `idle`은 `idle|done` 허용)인지 본다. 아니면 그 단계는
  `LEVEL_LOST`(`facts.levelLost` 행: step·want·got·error) → 그 회차·프로브는 **INCONCLUSIVE `LEVEL_LOST`**(FAIL 아님).
- **가용성:** shared 모드(§2.5-4)·가짜 kind 없음 → `NO_HELD_SUBSTRATE(…)`, driver 없음 → `NO_HELD_DRIVER`. 이때 C·D1·E·s는
  INCONCLUSIVE, A만 쉘 pane으로 돈다(`facts.substrate = shell` — 레벨 미단언, 스트림 성질만 판정).
- 한계: held pane의 `report_agent` 원천 status는 여전히 감지기 원천(B2)과 같은 규칙이라는 보장이 없다. fake 바이너리가 agent 훅을
  직접 내는 방식은 쓰지 않는다(통합 미설치 temp HOME — §2.2).

## 3. Step 0 — 버전·격리·push 성립 · `[herdr 전용]`

1. (private) 서버 기동 → 소켓·서버 pid 기록. (shared) §2.5-1·2 수행.
2. `ping{}` → `version`·`protocol` 기록. **0.9.5 · 22가 아니면 abort**.
3. `server.agent_manifests{}` → 지원 kind 목록·kind별 실행 명령(해석 방식) 기록(B1 해석 예측용, 실 CLI 미기동).
4. 스크래치 쉘 pane `P0` 생성 → `G(P0)` → `S = events.subscribe{subscriptions:[{type:"pane.agent_status_changed", pane_id:P0}]}`
   ACK 대기(15 s) → `pane.report_agent{pane_id:P0, source:"hsprobe-s0", agent:"bash", state:"working", seq:1}` → push 수신 시각(≤ 2 s)
   → `G(P0)` → `report_agent(... state:"idle", seq:2)` → push → `G(P0)`.
5. 정리 §2.3.

| 결과 | 의미 |
|---|---|
| S0-OK | 버전 일치 · push 2건 · G 기록 성공 → A·C·D1·E 진행 |
| S0-NOPUSH | RPC `ok`인데 push 0건 → A·C·D1 전부 `UNDETERMINED`(0.9.5에서 `report_agent` 원천 status 경로 부재 가능) |
| S0-ISOLATION | private 기동·소켓 격리 실패 → 중단·보고(아키텍트가 shared 결정) |

6. **(run-1 analysis)** push 경로가 성립하면 §2.6 driver 점검 → `facts.heldSubstrate`(S0 verdict는 바꾸지 않음).

**결과표 (S0)**

| 회차 | 일시 | 서버 모드 | `ping` version·protocol | 서버 pid·소켓 | agent_manifests 요약 | push 지연 (ms) | G 전→후 (rev / scs / cs) | stripped `HERDR_*` | held kind · driver (`agent`) · trial 요약 | 생성/닫음 id | 결과 코드 | 비고 |
|---|---|---|---|---|---|---|---|---|---|---|---|---|
| 1 | run 1 `6c0c3e` | private | 0.9.5 · 22 | spawn pid = 서버 pid · `T/herdr.sock` | claude/codex/grok 언급, 절대 경로 없음 | working ~104 · idle(→`unknown` 먼저) | scs 1→3 | (v1: 경고만, pane 안 실행) | (v1: 점검 없음) | — | S0-OK | run-1 분석 §1 |
| 2 | run 2 `dcda61` · 2026-10-23 | private | 0.9.5 · 22 | `T/` 아래 private 소켓 · cleanup `leftover:[]` · `dirty:false` | (run 1과 같음) | — | — | 지움(`herdrEnvRemaining:[]`, 다시 pane 안 실행) | fake `claude` · driver `agent:"claude"` · `working` 2 s 유지(18 표본, scs 6) → `idle` 보고가 `done`으로 publish, 1 s 유지(10 표본, scs 7 = cs 7) | leftover 없음 | S0-OK (분석에 코드 직접 기재 없음 — held driver 성립·후속 프로브 진행으로 기록) | run-2 분석 머리말 — 이후 step0/B1 외 전부 held pane |

## 4. Probe A — 구독 연결 half-close (drain 전제) · `[herdr 전용]`

**질문:** 클라이언트가 `events.subscribe` 연결에 EOF를 보내면 (i) herdr는 구독을 내리는가, (ii) 연결을 닫는가(FIN),
(iii) EOF 전에 쓴 바이트는 클라이언트까지 오는가? (`BridgeStartupFixed.tla`의 `drain → flush → none`) 0.9.5에도
`events.unsubscribe`가 없으므로 연결 종료가 유일한 구독 해제 수단이다(COMPAT §3 (a)).

**준비:** 스크래치 쉘 pane `P`. 상태는 `pane.report_agent{pane_id:P, source:"hsprobe-a", agent:"bash", state, seq}`(seq 단조 증가,
`resume_argv` 없음). 구독 목록 `L = [{type:"pane.agent_status_changed", pane_id:P}, {type:"pane.closed"}, {type:"pane.exited"}]`.

**단계 (각 단계 전·후 `G(P)`):**

1. `S1 = events.subscribe{subscriptions:L}`, ACK(`subscription_started`, 22:9912-9923) 대기.
2. **liveness:** `report_agent(P, working)` → S1이 push를 받는지(≤ 2 s). 못 받으면 판정 `UNDETERMINED` 후 종료.
3. **make-before-break 대조:** `S2 = events.subscribe{subscriptions:L}` ACK → `report_agent(P, idle)` → **S1·S2 둘 다** 같은 push를
   받는지 기록(Fixed 모델의 "겹침 동안 두 소켓이 같은 복사본" 전제).
4. **in-flight 꼬리:** `report_agent(P, working)` 와 `report_agent(P, idle)`를 연달아 보낸 직후(두 RPC의 `ok`를 받은 직후)
   **S1.end()** — `t_eof` 기록.
5. `t_eof` 직후 `report_agent(P, working)`, +500 ms `report_agent(P, idle)` (EOF **뒤** 전이).
6. S1에서 관찰, 상한 30 s: `'end'`(서버 FIN) 시각 · `'close'` 시각 · `'error'` · EOF 뒤 받은 push 목록.
7. S2가 4·5단계 push 4건을 모두 받았는지(대조군 — herdr가 전이를 실제로 냈다는 증거). 4·5단계 전후 G의 `state_change_seq`
   증가량과 push 수를 대조(전이 4건 ↔ seq 증가).
8. 변형 A′(같은 순서, 새 pane): 4단계에서 `end()` 대신 **아무것도 안 하고** 30 s 관찰 — 서버가 유휴 구독 연결을 스스로
   닫는 일이 없는지(A의 FIN이 EOF 때문임을 분리).

**추가 점검 (Astra 0251 M5/M6)** — 위 4단계는 꼬리가 `end()` 전에 이미 소비된 실행을 배제하지 못해, 성공만으로 미독 버퍼
보존을 주장할 수 없었다. 하니스는 다음으로 대체·보강한다:

- **미독 꼬리 유지 (M5):** 4단계에서 S1을 **`pause()`**(애플리케이션이 읽지 않음)한 채 꼬리 전이 2건을 내고, **S2가 그 2건을
  받은 것을 확인한 뒤**(herdr가 실제로 썼다는 증거) S1을 `end()`한다. EOF 뒤 전이 2건을 더 내고 1 s 뒤에야 `resume()` →
  미독 꼬리가 S1에 순서대로 오는지 본다. 꼬리·EOF 뒤 전이는 값을 달리해(`blocked,working` / `idle,blocked`) 순서만으로 구분한다.
  `bytesRead`를 pause·EOF·resume 시점에 기록 — pause 중 증가(`bytesReadWhilePaused > 0`)면 런타임이 꼬리를 이미 프로세스로
  읽어 둔 것이니 "커널 버퍼 보존"이 아니라 "앱 미소비 보존"까지만 주장한다.
- **등록→ACK 순서 (M5/M6):** (i) ACK 수신 **직후** 낸 전이가 반드시 오는가(등록이 ACK보다 늦지 않음). (ii) S2의 subscribe를
  쓴 직후 ACK를 기다리지 않고 전이 1건 → S2에서 그 push가 ACK **앞**(`push-before-ack` — 등록이 ACK보다 먼저)인지, **뒤**인지,
  누락인지 기록(`registrationVsAck`). 누락은 경합으로 정상일 수 있다(판정 아님).
- **겹침 FIFO (M5):** S1·S2가 모두 열린 상태에서 전이 3건을 연달아 내고 두 소켓의 status 순서열이 **같은지** 본다(`fifo.equal`).
- **EOF 처리 (M5):** S1의 `'end'`(서버 FIN)·`'close'`·`'error'` 시각, 그리고 S1 EOF가 S2에 영향이 없는지(EOF 뒤 전이가 S2에 옴).
- **재구독 ≥ 2회 연쇄 (M5):** S2→S3, S3→S4 handover를 같은 방식(미독 꼬리 + EOF)으로 두 번 더 — 각 교체에서 꼬리 전달·EOF 뒤
  0건·대조군 수신이 유지되는가(`chainOk`). TLA cfg는 다른 구독을 1회만 허용하므로, 연쇄 실패는 F1′ 모델의 범위 밖 결함이다.
- drain 도중 연결 장애·drain 상한 만료는 라이브로 안전하게 유도할 수 없어 **모델 쪽 과제**로 남긴다(타이머 후 `destroy()`는
  무손실 drain과 동등하지 않다 — Astra 0251 M5).

| 추가 결과 | 의미 |
|---|---|
| `registrationVsAck = push-before-ack` | 등록이 ACK보다 먼저 — 모델 `SrvReg`(ACK 전 등록) 지지 |
| ACK 직후 전이 누락 | 등록이 ACK 뒤 — make-before-break에도 ACK~등록 창 유실 가능, F1′ 재검토 |
| `fifo.equal = false` | 겹침 동안 두 소켓 복사본이 다름 — Fixed 전제 붕괴(A-5에 준함) |
| `chainOk = false` | 2회째 이후 교체에서 꼬리 유실·누수 — Drain 판정을 1회 교체로 한정 |

**v2 개정 (run-1 analysis):** run 1의 `A-4` ×5는 herdr 사실이 아니라 하니스·런타임 혼입이었다 — herdr는 EOF→FIN 0–3 ms(15/15),
S2 무영향, 유휴 무폐쇄, 겹침 FIFO 동일(원 로그 재계산)이었고, 꼬리 유실은 Bun `pause()`+`end()` 조합에서만 보였다(pause·EOF·resume
`bytesRead` 불변 → 런타임이 peer EOF에 미배출로 닫았을 가능성). 그리고 판정 술어가 herdr의 `unknown` 주입·`idle→done` 재기록에
깨졌다. v2:

- **바탕:** held pane(§2.6). 단계 경계마다 레벨 단언, 회차에 `LEVEL_LOST`가 하나라도 있으면 그 회차 코드 = `LEVEL_LOST`.
- **술어 수정:** (i) `registrationVsAck` = S2의 **첫 P status push(값 무관)**의 ACK 앞/뒤·누락. (ii) FIFO = S2(나중에 연 쪽) 순서열이
  S2 open 이후 S1 순서열의 **접미사**인가(같은 시각 스냅샷 비교 폐기). (iii) 꼬리 전달 = 옛 소켓 순서열이 대조 소켓 순서열의
  **접두사**이고 그 길이가 `t_eof` 전 대조 push 수(`ctlTailN`) 이상인가 — herdr가 끼운 `unknown`/`done`도 양쪽에 같이 있으므로
  허용된다. EOF 뒤 push 수 = 옛 소켓 길이 − `ctlTailN`. 대조군 성립 = 보고한 꼬리가 대조 순서열의 부분열(`idle`↔`done` 동치).
- **변형:** 한 회차에 같은 pane으로 4회 교체 —
  (a) **flowing** `S1→S2`, `S2→S3`(옛 소켓은 계속 읽음, 대조가 꼬리를 본 즉시 `end()`) = 재구독 ≥ 2회 연쇄(`chainOk` = 둘 다 A-1),
  (b) **paused** `S3→S4`(run 1 형태: pause → 꼬리 → +300 ms `end()` → EOF 뒤 전이 → +1 s `resume()`),
  (c) **python raw 클라이언트** → `S4`(대조): `python3 -I T/py/hsprobe_halfclose.py`(stdlib `socket`만, `events.subscribe` 1건만 보냄)가
  ACK까지 읽고 읽기 중단 → 꼬리 → 대조 확인 → `shutdown(SHUT_WR)` → EOF 뒤 전이 → 1.5 s 뒤 EOF까지 `recv`.
- **판정:** 회차 코드 = 변형 (a) 첫 교체의 코드(아래 표 그대로). 미독 꼬리 유실 위치 `unreadTailLossSide`:
  python(c)에 A-4 → `herdr-side` · (b)만 A-4이고 (c)가 전부 A-1 → `bun-runtime` · (b)가 A-4인데 (c)가 미결(python 없음 등) →
  `unknown` · (b) 유실 없음 → `none`.

**관측과 판정:**

| 결과 | 관측 | TLA 상수 |
|---|---|---|
| A-1 **drain 성립** | 4단계 push 2건이 S1에 도착 · S1에 `'end'`가 상한 안에(예: ≤ 1 s) 옴 · 5단계 push는 S1에 0건(S2엔 있음) | `Drain = TRUE` 전제 확인 → F1 판정이 drain 경로로 유효 |
| A-2 **구독은 내리나 FIN 없음** | 5단계 push 0건 · 30 s 동안 `'end'` 없음 | drain이 끝나지 않는다 → 구현은 상한 타이머 + `destroy()` 필요. 4단계 2건이 왔으면 "타이머 = 마지막 전이 후 짧은 유예"로 근사 가능하나 TLA상은 **`Drain = FALSE`로 본다**(F3·F4 영역 — F4 오실패 복귀) |
| A-3 **EOF 무시** | 5단계 push가 S1에 계속 옴 · FIN 없음 | 구독이 살아 있다 → half-close로는 drain 불가. **`Drain = FALSE`** (+ 이전 소켓 누수 위험 기록) |
| A-4 **즉시 닫고 버림** | `'end'`/`'close'`가 오지만 4단계 push 일부 누락(S2엔 있음) | EOF 전에 쓴 바이트 유실 → **`Drain = FALSE`** |
| A-5 **겹침 복사 실패** | 3단계에서 S2 ACK 뒤 S1이 push를 못 받음(서버가 새 구독 시 옛 연결을 끊음 등) | make-before-break 자체가 불가 → F1′ 재설계 필요(모델 전제 붕괴), Drain 판정 무의미 |
| UNDETERMINED | 2단계 liveness 실패 또는 S2 대조군 누락 | 판정 없음 |

반복: A·A′ 각 **5회**(FIN 시각 분포를 본다). 판정은 5회 일치 시에만, 불일치면 그대로 보고.

정리: §2.3. P 닫기 전 S2 `destroy()`.

**결과표 (A · A′)** — v2부터 변형 열 = `flow`(a) · `pause`(b) · `python`(c) · `A′`, 한 회차가 4행+A′ 1행 **(run-1 analysis)**

| 회차 | 변형 | 일시 | 서버 모드 | 바탕 (held kind·driver / shell) | 옛 소켓 순서열 | 대조 순서열 (`ctlTailN`) | 꼬리 전달 | `t_eof`→`'end'` (ms) | `t_eof`→`'close'` (ms) | EOF 뒤 옛 push 수 | `LEVEL_LOST` | G 단계별 (rev / scs / cs) | 생성/닫음 id | 결과 코드 | 비고 |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| 1–5 | pause (v1) | run 1 `6c0c3e` | private | shell · `bash` | (bytesRead 불변, resume 후 0) | S2 꼬리 수신 15/15 | 아니오 | 0–2 | 0–3 | 0 | (v1 미단언 — 권한 해제됨) | — | — | A-4 ×5 (**하니스·런타임 혼입**) | run-1 분석 §2 |
| 1–5 | flow h1 S1→S2 | run 2 `dcda61` · 2026-10-23 | private | held `claude` · driver `claude` | `blocked,working` (= 꼬리) | 꼬리 포함 | 예 ×5 | 0–1 | 0–1 | 0 | 0 | — | leftover 없음 | A-1 ×5 | run-2 분석 §1 |
| 1–4 | flow h2 S2→S3 | run 2 | private | held `claude` | `working,blocked` | 꼬리 포함 | 예 ×4 | 0–1 | 0–1 | 0 | 0 | — | — | A-1 ×4 | |
| 5 | flow h2 S2→S3 | run 2 | private | held `claude` | `working,blocked` (꼬리, EOF 14 ms 전 도착) | `ctlTailN:1` (**동률 산물** — 대조 `blocked` 693173 = `t_eof` 693173, 엄격 `<`가 제외) | 예 (`orderOk:true`) | 0 | 0 | 술어 1 · **원 `afterEof:true` 0** | 0 | — | — | A-OTHER → `chainOk=false` → 프로브 FAIL `A-1/aux-fail` (**술어 산물**, 수정 후 판정이면 PASS `A-1/bun-pause-loss`) | run-2 분석 §1 · 하니스 수정됨(아래 주) |
| 1–5 | pause h3 S3→S4 | run 2 | private | held `claude` | `[]` (bytesRead 576 = 576 = 576 at pause/EOF/resume) | 꼬리 포함 | 아니오 | 0–1 | 0–1 | 0 | 0 | — | — | A-4 ×5 (Bun 유실) | `unreadTailLossSide:"bun-runtime"` |
| 1–5 | python (c) → S4 | run 2 | private | held `claude` | `working,blocked` (`bytesAfterEof:254` = 꼬리 2건) | 꼬리 포함 | 예 ×5 | 1502–1505 (1.5 s linger) | — | 0 | 0 | — | — | A-1 ×5 (**herdr 무손실**) | |
| 1–5 | A′ | run 2 | private | held `claude` | — | — | — | — | — | — | 0 | — | — | 무폐쇄 ×5 (`serverClosedIdle:false`, `stillDelivering:true`, 30 s `working` 유지) | |

**run-2 주 (하니스 수정, 재실행 전):** (i) `ctlTailN`은 이제 `t_eof`와의 ms 비교가 아니라 **옛 소켓 `end()`(python은 EOF 지시) 시점의 대조
push 도착 인덱스**로 센다(단일 스레드라 정확 — ms 비교값은 `ctlTailNByMs`로 기록만). (ii) Bun 옛 소켓의 EOF 뒤 push 수는 sink 자신의
`afterEof` 플래그(실제로 EOF 뒤 도착한 것)로 센다 — python은 ACK 뒤 아무것도 읽지 않아 메시지별 플래그가 없으므로 종전 유도식.
(iii) 보조 교체(h2)의 `A-OTHER`도 h1과 같이 **INCONCLUSIVE `A-OTHER/aux`**(종전엔 `chainOk` 경유 FAIL).
FIFO(run 2): `fifo.S1 = fifo.S2 = done,working,done,working,done` 5/5 · `s2AliveAfterS1Eof` 5/5 · 20 교체 25 `SUB_CLOSE` · 등록 = `push-after-ack` ×5.

## 5. Probe B — 기동 직후·프롬프트 전 status (Boot)

**질문:** `agent.start` → `interactive_ready` 뒤, 프롬프트를 보내기 전에 herdr가 해당 pane에 `working`(또는 `idle`·`done`) push를
내는가? (C9: ACK 전 기동 쌍으로 가짜 완료, F12·F14 잔여창)

**왜 CLI가 문제인가:** 실제 운영의 기동 status는 herdr의 **에이전트 감지기**(프로세스·화면 manifest)와 CLI 쪽 통합 훅이
만든다. `report_agent`로 만든 전이는 이 질문에 답하지 못한다. 그래서 B1은 herdr 자체 기동 기계만 보고, 결정은 B2다.

공통 구독(start **전**에 연다): `L_B = [{type:"pane.agent_status_changed", pane_id:P}, {type:"pane.closed"}, {type:"pane.exited"}]`
연결 하나 + **`{type:"pane.agent_detected"}` 전역 구독**(22:4169-4180 — `pane_id` 없이 열고 클라이언트에서 `data.pane_id == P`로 거름;
다른 pane의 감지 이벤트는 개수만 세고 원문은 버린다).

### 5.1 B1 — 가짜 agent 바이너리 · `[herdr 전용]` (예비, 결정력 제한)

1. `T/fakebin/claude`(및 `codex`, `grok`) = 실행 파일: 배너 한 줄을 찍고 `read` 루프로 stdin을 기다리는 쉘 스크립트
   (네트워크·자격 증명 없음). pane env에 `PATH=T/fakebin:<최소 PATH>`(`tab.create.env`).
2. **Step 0 확인:** S0의 `server.agent_manifests` 기록으로 kind→명령 해석을 먼저 본다. 이어 private 서버에서만
   `agent.start{name:"hsprobe-b1-claude", kind:"claude", pane_id:P, timeout_ms:10000}`가 가짜 바이너리를 실제로 띄우는가
   (`pane.process_info{pane_id:P}`의 foreground cmdline이 `T/fakebin/claude`). **herdr가 `kind`를 PATH로 해석하는지는 미실측** —
   절대 경로·manifest 경로를 쓰거나 거절하면 B1은 `NOT_APPLICABLE`로 기록하고 B2로만 답한다. **shared에서는 이 확인이
   private에서 먼저 성공했을 때만** B1을 돈다(§2.5-4). 실 CLI로 해석되는 것이 보이면 즉시 `pane.close` 후 `ABORTED_REAL_CLI`.
3. 구독(위 공통)을 `agent.start`보다 먼저 열고 ACK 확인 → `G(P)`.
4. `agent.start` → `agent.get{target:P}` 25 ms 폴링으로 `launch_pending`/`interactive_ready` 전이 시각 기록 → 그 뒤 **30 s 무프롬프트
   관찰**, 동시에 G-스냅샷(§2.4)을 500 ms마다 기록(레벨 값 + `revision`·`state_change_seq`·`completion_seq`).
5. 대조군: 마지막에 `report_agent(P, working)` 1회 → S가 받는지(구독 성립 증명).

| 결과 | 의미 |
|---|---|
| 가짜에서도 `working` push | herdr 기계 자체가 기동 전이를 낸다(CLI 무관) → **`MaxBoot ≥ 1` 확정**(B2 불요) |
| `unknown`/`idle`만, 또는 0건 | CLI 의존 질문으로 남음 → B2 필요. B1은 "herdr 고유 기동 전이 없음"만 증명 |
| 감지 이벤트에 `final_status` 등 | 기록만(`HERDR-0.7.5-COMPAT` §4: 완료 권한으로 쓰지 않음) |
| `state_change_seq`가 push 없이 증가 | 기록 — 레벨 변화와 push의 비대응(TLA (e) 근거) |

**결과표 (B1)**

| 회차 | kind | 일시 | 서버 모드 | 해석된 cmdline | start→`interactive_ready` (ms) | 무프롬프트 30 s push (값·시각) | agent_detected (P) | G 시작→끝 (rev / scs / cs) | 대조군 | 생성/닫음 id | 결과 코드 | 비고 |
|---|---|---|---|---|---|---|---|---|---|---|---|---|
| 1 | claude · codex · grok | run 1 `6c0c3e` | private | `/bin/sh …/fakebin/<kind>` (PATH 해석 확인) | 3561–3596 (`agent.start` ok 104–110 ms, `unknown`·`launch_pending`·scs 0) | 유일한 push = ready와 동시 `idle`(3605–3648) · ready 전 0 · 30 s 0건 | ~200–310 ms | scs 불변(~150 표본/kind) · start 결과 0 = 미할당 | `report working` 수신 | — | B1-NO-BOOT-WORKING | run-1 분석 §6 — herdr 자체 기동 기계 한정. 실 CLI 스피너는 B2 |
| 2 | — | run 2 `dcda61` | private | — | — | — | — | — | — | — | (run-2 분석에 B1 기재 없음) | 미기록 — 필요 시 `T/summary.json`에서 옮긴다 |

### 5.2 B2 — 실 CLI 기동만 · `[실 CLI — 오너 yes]`

**프롬프트를 보내지 않는다** — 토큰 소비는 CLI 자체 기동분만. 그래도 실 CLI 기동이므로 오너 승인 필수. shared 서버의 안전
블록(§2.5)은 실 CLI 기동 자체를 금하므로, B2를 shared에서 돌리려면 오너 yes에 "shared" 선택이 명시돼야 한다(§5.4 선택지 3).

1. 대상 kind: 운영 기본 3종 `claude`·`codex`·`grok` 각각 별도 실행(`--kind`) — S0의 `server.agent_manifests`에 있는 kind만. kind당 **3회**.
2. pane 생성·구독·start·폴링은 B1 3–4단계와 같다(`agent.start{name:"hsprobe-b2-<kind>-<n>", kind, pane_id:P, timeout_ms:60000}`).
   관찰 창은 `interactive_ready` 뒤 **60 s**(MCP 기동·업데이트 확인 등 늦은 기동 작업 포함). G-스냅샷 500 ms 주기.
3. 기동 화면 보존: 관찰 끝에 `agent.read{target:P, source:"detection"}`(22:5279, `AgentReadParams` 22:1275-1305, `ReadSource`
   22:3839-3847)와 `agent.explain{target:P}`(22:5295) 결과를 로그에 저장 — 어느 감지 규칙이 status를 만들었는지 사후 분석용.
   **화면 원문에 비밀이 섞일 수 있으니** 로그는 `T/` 밖으로 옮기지 않고, 관측 문서에는 요약만.
4. 대조군: B1 5단계와 같음.

| 결과 | TLA 상수 |
|---|---|
| `interactive_ready` **전** `working` push (구독이 start 전부터 열려 있었으므로 관측 가능) | `MaxBoot ≥ 1`, 실제 브리지에선 이 push가 **SrvReg 뒤·ACK 전**에 올 수 있음 → C9 경로 실재 |
| `interactive_ready` **뒤** · 관찰 창 안 `working` push | `MaxBoot ≥ 1`, C10·F12(ACK~도착 창)·F14 경로 실재 |
| `working` 없이 `idle`/`done`만 | `working→idle` 쌍은 없음 — 현재 게이트(`idle ∧ sawWorking`)엔 무해. **단 `done`은 `sawWorking` 없이 완료 계열**(`ccaf5ea:packages/host/src/bridge-runtime.ts:3373`) → D의 판정과 합쳐 위험 판단. 기동 중 `completion_seq` 증가 여부도 함께 본다 |
| 3회 × 3 kind 모두 0건 | `MaxBoot = 0` **지지**(증명 아님 — 관찰 창·kind·버전 한정) |

반복 간 불일치(예: 3회 중 1회만 `working`)는 그대로 `MaxBoot ≥ 1`로 본다(존재 증명은 1회로 충분).

**결과표 (B2)**

| 회차 | kind | CLI 버전 | 일시 | 서버 모드 · HOME 선택(§5.4) | start→`interactive_ready` (ms) | ready 전 push | ready 뒤 60 s push (값·시각) | G 시작→끝 (rev / scs / cs) | detection 요약 | 생성/닫음 id · CLI pid 정리 | 결과 코드 | 비고 |
|---|---|---|---|---|---|---|---|---|---|---|---|---|
| | | | | | | | | | | | | |

### 5.3 정리

§2.3 + 실 CLI pid 확인(4단계). CLI가 남긴 세션 파일은 CLI 기본 위치(실 HOME)에 남을 수 있다 — §5.4.

### 5.4 B2·D2의 HOME 충돌 (오너 결정 필요)

실 CLI는 **실 HOME의 자격 증명·설정**이 있어야 뜬다. temp HOME으로 띄우면 로그인되지 않은 화면에서 멈춰 운영 기동과 다른
status를 낸다. 반대로 실 HOME이면 Must-not("probe without temp HOME")과 충돌한다. 선택지:

1. 프로브 프로세스와 herdr 서버는 temp HOME, **CLI pane env만 실 HOME**(가장 운영에 가깝다 — herdr 통합 훅은 여전히 temp
   서버에 없다는 차이가 남음).
2. 전부 temp HOME + 해당 CLI의 API 키 env만 주입(통합·설정 차이 큼).
3. shared 서버(0.9.5) + 실 HOME(운영과 동일, 격리 없음).

**권고 = 1**, 단 오너 yes와 함께 선택을 명시받는다. 결과 문서엔 어느 선택으로 돌았는지 반드시 적는다.

## 6. Probe C — 새 구독자 status replay (0.9.5 / protocol 22) · `[herdr 전용]`

**질문:** herdr 0.9.5 / protocol 22가 새 `events.subscribe` 연결에 이 pane의 과거 status를 재전달하는가? 0.7.4/16은 아니었다(OBS §D.7).
스키마에는 replay·since·cursor 파라미터가 없다(22:2121-2134) — 동작은 라이브로만 판정된다. 모델의 `Replay`는 "서버 등록 시 이 pane의
status backlog를 먼저 보냄"이다.

구독 목록 `L = [{type:"pane.agent_status_changed", pane_id:P}, {type:"pane.closed"}, {type:"pane.exited"}]`.

**단계 (0.7.4 시나리오 D를 0.9.5에서 재실행 + 공백 변형; 각 단계 전·후 `G(P)`):**

1. 스크래치 쉘 pane `P`. `S1 = events.subscribe{subscriptions:L}`.
2. **게이트:** `report_agent` `working, idle, working, idle`(1.2 s 간격, source `"hsprobe-c"`) → S1이 라이브 push ≥ 1 받아야 진행
   (못 받으면 `UNDETERMINED`).
3. `S1.destroy()` → 1 s 대기 → `S2 = events.subscribe{subscriptions:L}` → **20 s 관찰**: P의 status push 개수·순서·내용, ACK 앞/뒤 위치.
4. **liveness:** `report_agent(P, working)` → S2가 받는지(못 받으면 3단계 0건은 `UNDETERMINED`).
5. **공백 변형 C-gap (C5·C11 그 자체):** `S2.destroy()` → 구독자 0인 상태에서 `report_agent(P, idle)` → `G(P)`(공백 중 레벨·seq가
   바뀌었는지) → 1 s 뒤 `S3 = events.subscribe{subscriptions:L}` → 20 s 관찰. **공백에 난 `idle`이 S3에 오는가.**
6. **대조군:** 별도 스크래치 pane `Q`를 만들고 `pane.close{pane_id:Q}` → 그 뒤 연 S4(`[{type:"pane.closed"}]` 전용)가 `Q`의
   `pane_closed`/`pane.closed`를 받는지(terminal replay 대조군 — 0.7.4에선 받음).
7. 모든 단계마다 `pane.list{}`의 P 행 `agent_status`와 G-스냅샷도 기록.

| 결과 | 관측 | TLA 상수 |
|---|---|---|
| C-1 **replay 없음** | 3·5단계 status 0건 · 4단계 liveness 통과 · ~~6단계 대조군 replay 있음~~ v2: S2·S3 liveness 통과 + 구독 직전 비-idle 레벨 단언 통과 **(run-1 analysis)** | **`Replay = FALSE`** (0.7.4와 같음) → C5·C8 정체 결론 유효 |
| C-2 **backlog replay** | 3단계에 2단계 전이 다수가 순서대로 재도착 · 5단계 `idle` 재도착 | **`Replay = TRUE`** (모델과 같은 의미) → C11·C12·F15 영역. 단 replay/live 구분 불가(봉투에 seq·시각 없음, 22:6340-6382)이므로 기존 카드에 오래된 전이가 재생되는 F16류 위험을 별도 기록 |
| C-3 **현재값 1건만 재전달** | 3·5단계에 최신 상태 1건만 | 모델에 없는 의미("스냅샷 replay"). C5 해소 관점에선 `Replay = TRUE`와 같다(잃은 `idle`이 레벨로 돌아옴). Boot·F16 관점은 다름 — **TLA에 새 상수 필요**로 보고 |
| C-4 **구독 시 응답 지연** | ACK 전후에 replay 위치가 다름 | ACK 앞/뒤 위치를 기록 — 모델 `SrvReg`(ACK 전 backlog) 전제 확인/반박 |
| UNDETERMINED | 게이트·liveness 실패 | 판정 없음 |

**분류 규칙 (Astra 0251 M6):** 3·5단계 각 관찰 창을 따로 분류한다 — **무재전달**(P status 0건) · **최신값만**(1건, 그 시점
레벨과 같음) · **backlog**(2건 이상, 과거 전이 순서). 각 push의 **ACK 앞/뒤 위치**를 함께 남긴다(`before-ack`/`after-ack`/`mixed`).
`latest-only`와 `backlog`는 TLA상 다른 상수다(C-3 vs C-2). 1건짜리가 "최신값"인지 "backlog의 마지막 1건"인지는 2단계 이력이
4건이므로 1건이면 최신값으로 본다. 실제 **감지기 원천**의 replay는 이 프로브로 답하지 못한다 — B2 실행 때 같은 pane 재구독으로
부수 관찰(아래 주의).

**v2 개정 (run-1 analysis):** run 1은 `C-1/no-control` INCONCLUSIVE였다 — (i) 대조군 전제가 낡았다: 0.9.5는 `pane_closed`를 기존
구독자에겐 라이브로 내지만 나중 구독자에겐 **재전달하지 않았다**(2/2). (ii) 레벨 혼입: 늦은 구독 시점의 실제 레벨이 이미
`unknown`/agent-not-found였으므로(권한 해제) "최신값 1건 replay"(C-3)였어도 0건으로 보였다. v2:

- 바탕 = held pane(§2.6). 게이트 = `working, idle, working, blocked`(1.2 s) → **지속되는 비-idle 레벨 `blocked`**를 잡은 채로 늦은 구독.
- 3단계: `S1.destroy()` → 1 s → `G(P)=blocked` 단언 **직후** S2(`levelToSubTxMs` 기록). 5단계 C-gap: 구독자 0에서 `report(blocked)`
  (직전 레벨 `working`) → `G(P)=blocked` 단언 → **즉시** S3(`gapToSubTxMs` 기록 — `report` 반환→`SUB_TX`).
- 분류: 0건 = 무재전달 · 1건이고 값 = `blocked` = **latest-only** · 2건 이상 = backlog · 1건인데 다른 값 = `other`.
  코드: 둘 다 0건 → C-1 · 어느 쪽이든 backlog → C-2 · 둘 다 latest-only → C-3 · 그 밖 조합 → `C-MIXED(…)`(INCONCLUSIVE).
- **대조군 = S2·S3 각각의 liveness**(`report(working)` → 그 소켓이 받음). 6단계 terminal replay는 **사실 기록만**
  (`terminalReplayFact`, 판정 무관). 단언 실패 → `LEVEL_LOST`.

반복 **2회**(0.7.4 관측과 같은 수). 주의: `report_agent` 원천과 감지기 원천 status가 같은 replay 규칙을 따른다는 보장은 없다 —
결과 문서에 "report_agent 원천 한정"을 적는다. 실 CLI 원천 확인이 필요하면 B2 실행 때 같은 pane에 S2를 다시 열어 부수 관찰
(B2 승인 범위 안 — 같은 실행). shared 모드면 다른 구독자 존재를 기록(§2.5-7).

정리: §2.3. 죽은 pane에 대한 status 구독은 ACK가 안 오므로(§D.8-1) **P가 살아 있을 때만** 재구독한다; 모든 subscribe에 15 s ACK 타임아웃.

**결과표 (C)**

| 회차 | 일시 | 서버 모드 | 게이트 push 수 | S2 직전 레벨 (단언·ms) | S2 20 s push (수·순서·ACK 앞/뒤) | S2 liveness | 공백 중 G (rev / scs / cs) | gap→`SUB_TX` (ms) | S3 20 s push | S3 liveness | terminal replay (사실만) | 생성/닫음 id | 결과 코드 | 비고 |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| 1–2 | run 1 `6c0c3e` | private | 8 | (v1 미단언 — 실제 `unknown`/not found) | 0 | 통과 | idle scs 177 | ≥ 1100 | 0 | — | 없음 (2/2) | — | C-1/no-control (INCONCLUSIVE) | run-1 분석 §3 — **C-1 vs C-3 미결** |
| 1–2 | run 2 `dcda61` · 2026-10-23 | private | (게이트 통과) | `blocked` 단언 · `levelToSubTxMs` 0/1 · ACK +100/+106 | 0 (`seq:[]`, `class:"none"`, `positions:[]`) | 통과 (`working`) | scs 148→149 (공백 중 working→blocked, G = blocked d=206) | 104–105 (목표 ≤ 50 미달 — RPC 왕복마다 ~100 ms 틱) | 0 (`gapTransitionReplayed:false`) | 통과 | 없음 (2/2, `terminalReplayFacts` false) | — | **C-1** (PASS) | run-2 분석 §2 — C-3 배제, report_agent 원천 한정 |

## 7. Probe D — `done` status의 출현 조건

**질문:** herdr는 언제 `agent_status: "done"`을 내는가? TLA 모델은 "`done`은 프롬프트 이후에만 온다"를 전제로 모든
`NoEarly`/`NoFalse` 판정을 냈고(§2.2 범위 제외), 현재 브리지는 `done`을 `sawWorking` 없이 완료로 받는다
(`ccaf5ea:packages/host/src/bridge-runtime.ts:3373`).

**가설(미검증):** H-D1 `done` = "끝났으나 사용자가 아직 안 본" 주의(attention) 상태 — 비포커스 pane의 `working→idle`에서
도출되고 포커스 시 `idle`로 바뀐다(0.9.5 `completion_seq` 설명이 "완료"와 "열람"을 분리 — 정황). H-D2 `done` = 프로세스 종료·`release`
시 최종 상태(`final_status`). H-D3 특정 CLI 감지 규칙만 낸다. 프로브는 셋을 가른다. **0.9.5 추가 대조:** 모든 `done` push 시각을
G-스냅샷의 `completion_seq` 증가 시각과 대조한다(`done` 없이 `completion_seq`만 오르는가 · 그 역은 있는가).

### 7.1 D1 — `report_agent` 전이 · `[herdr 전용]`

각 단계 전·후 `G(P)`(특히 `completion_seq`·`focused`).

1. 스크래치 쉘 pane `P`(`focus:false` tab). `S = events.subscribe{subscriptions:[{type:"pane.agent_status_changed", pane_id:P},
   {type:"pane.closed"}, {type:"pane.exited"}]}` + 전역 `{type:"pane.agent_detected"}`(P로 필터).
2. `report_agent(P, working)` → 1 s → `report_agent(P, idle)` → 5 s 관찰: push가 `idle`인가 `done`인가. `agent.get`·`pane.list`
   레벨 값도 기록(push와 레벨이 다를 수 있음). `completion_seq` 증가 여부.
3. 2단계를 `working` 지속 시간 0.2 s / 5 s / 30 s로 반복(지속 시간 문턱이 있는지).
4. **(private 서버만)** `pane.focus{pane_id:P}`(22:5791, `PaneTarget`) → `done`이었다면 `idle`로 바뀌는 push가 오는가 · `completion_seq`는
   그대로인가("열람과 무관"). 이어 포커스를 다른 프로브 pane에 둔 채 2단계 재실행. shared 모드에선 **이 단계 생략**(§2.5-3).
5. `pane.release_agent{pane_id:P, source:"hsprobe-d1", agent:"bash"}`(22:5999) → 감지/해제 이벤트에 `final_status`가 실리는지, 그 값.
6. `pane.close{pane_id:P}` → close 직전·직후 status push(`done` 여부).

**추가 점검 (Astra 0251 M6):**
- **`done` ↔ 실제 종료 관계:** round 3가 요구하는 것은 "프롬프트 뒤·working 뒤 `done`"이 아니라 **"실제 작업 종료 뒤 `done`"**이다.
  herdr 전용에서 "실제 종료" = `working` 보고 뒤의 `idle` 보고 시각. 모든 `done` push에 대해 직전 단계·마지막 `idle` 보고로부터의
  지연(ms)·그 `idle` 앞에 `working`이 있었는지(`afterReportedWorkEnd`)를 기록한다(`facts.doneVsRealEnd`). `working` 없이 나온
  `done`(release·close 제외)은 FAIL.
- **실행 중 idle→working 재진입:** 2단계 뒤 `working → 1 s → idle → 300 ms → working → 1 s → idle`을 한 번 더 — 중간 `idle`에서
  `done`이 나오는가·`completion_seq`가 오르는가(`doneAtIntermediateIdle`). 나오면 실 CLI의 작업 중간 idle(도구 대기 등)이 카드를
  조기 완료시킬 수 있다는 근거다 — 현재 TLA 모델 밖(재진입 미모델), D2에서 실 CLI로 재확인 필요.

**v2 개정 (run-1 analysis):** run 1의 D1 `D-4`(done 0건)는 산물이었다 — 모든 `working`이 `idle` 보고 전에 이미 해제돼
(`unknown`) 있었고 `unknown→idle`은 `done`을 낸 적이 없다(0/37). 반면 Probe A 안에서는 비포커스 pane의 보고된 `working|blocked → idle`이
`done` 18건으로 publish됐다(working 뒤 14 · blocked 뒤 4, idle 보고 27–208 ms 뒤, `done→working` 6회). v2:

- 바탕 = held pane. 각 `working → idle` 쌍에서 **`idle` 보고 직전 `G(P)=working` 단언**(`workingHeldAtIdleReport`) — 하나라도 실패하면
  D1 전체 INCONCLUSIVE `LEVEL_LOST`.
- `idle` 보고 뒤 **`agent.get` 25 ms 간격 2 s** 시계열(run-length `levelAfterIdle`) → `done`이 레벨로 보이는가·얼마나 가는가.
- 포커스 단계: 먼저 비포커스 `working→idle`(1 s)로 `done`이 생길 수 있게 한 뒤 `pane.focus{P}` → 3 s 시계열(`levelOnFocus`) →
  `done→idle`로 바뀌는가. 이어 P2 포커스 후 재실행.
- **모든 `done` push 행**(`facts.doneVsRealEnd`): 시각 · 직전 push 값(`prevPushStatus` — working/blocked 뒤인가) · 마지막 보고 상태·단계 ·
  마지막 `idle` 보고로부터 ms · `afterReportedWorkEnd` · 다음 보고 전까지 `agent.get`이 `done`을 보였는가(`getShowedDone`)·지속
  (`doneLevelMs`)·무엇으로 바뀌었나 · 그 창의 `completion_seq` 값(`completionSeqSeen`). 요약 `facts.doneSummary`.
- release는 driver `agent` 이름으로 보낸다.

**결과표 (D1)**

| 회차 | 단계 | `working` 지속 | 일시 | 서버 모드 | `idle` 보고 시 `working` 유지 | push 값·시각 | `done` 직전 값 | `agent.get` `done` 지속 (ms) | 레벨 (agent.get · pane.list) | G 전→후 (rev / scs / cs) | `done`↔`completion_seq` 대조 | focused | 생성/닫음 id | 결과 코드 | 비고 |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| 1 | dur200/5000/30000 | 0.2/5/30 s | run 1 `6c0c3e` | private | **아니오**(106–311 ms에 `unknown`) | working, unknown, idle | — (done 0) | — | not found | — | `completion_seq` 키 없음 | — | — | D-4 (**산물**) | run-1 분석 §4 |
| (A 안) | — | — | run 1 | private | 예(해제 전) | … `done` 18건 | working 14 · blocked 4 | 미측정 | — | — | 키 없음 | false | — | (D-1 정황) | 비포커스 한정 |
| 2 | dur200/5000/30000/1000 + 재진입 + 포커스 | 0.2/5/30/1 s | run 2 `dcda61` · 2026-10-23 | private | 예 ×7 (`workingHeldAtIdleReport:true`) | `done` 7건, 각 idle 보고 ~100 ms 뒤 | working 7 · blocked 0 | ≈5300–5400 (`doneLevelReplacedBy:null` — 다음 보고까지) | `done` · `done` (16–17 표본/2 s) | cs = done 전이의 scs (161/161, 163/163 … 173/173) · 작업 중·기동 idle `null` | 7/7 `completionSeqPresent` · 중간 idle도 `done`(cs 167) | 포커스 시 `idle` push · `focused:true` · scs·cs 171 불변 | — | **D-1** (PASS) | run-2 분석 §4 — 이미 포커스된 pane의 완료는 미시험 · release 뒤 레벨 미표본 |

### 7.2 D2 — 실 CLI 1회 프롬프트 · `[실 CLI — 오너 yes]`

토큰을 쓰는 유일한 프로브다. kind당 **1회**, 프롬프트는 고정 짧은 문장(예: "Reply with the single word OK.").

1. B2 1–3단계로 기동(구독은 start 전). `interactive_ready` 뒤 10 s 기동 관찰(B2 데이터로 합산 가능). `G(P)`.
2. `t_prompt` 기록 → `agent.prompt{target:P, text}`(22:5407, `AgentPromptParams` 22:1231-1255 — **`wait` 필드 없이**) → 응답·반환
   시각, `agent_prompt_stalled` 여부 기록 → `G(P)`.
3. 관찰 120 s: 첫 `working` 시각(**프롬프트→working 지연** = `LatencyBound` 근거), `working→idle|done` 시각·값. G-스냅샷 500 ms 주기 —
   `state_change_seq`가 push마다 오르는지, `completion_seq`가 `done`/`idle` push와 같은 시점에 오르는지.
4. 포커스는 건드리지 않는다(브리지 pane과 같은 `focus:false`). private 서버에서만 추가로 D1 4단계 포커스 실험을 해도 된다.
5. `agent.read{target:P, source:"detection"}`·`agent.explain{target:P}` 저장(B2와 같은 비밀 주의).
6. **(Astra 0251 M6)** 실제 작업 종료 시각(CLI 화면·`agent.read` 기준 응답 완료)과 `done` push의 관계, `agent_prompt_stalled` 뒤
   status, 작업 중간 `idle`(→ `working` 재진입)을 따로 기록한다. 지연은 프롬프트 전달뿐 아니라 이벤트 소비·조회 응답까지 잰다 —
   소수 회차의 성공은 `LatencyBound`의 보편 보장이 아니다. (D2는 하니스에 미구현 — 오너 yes 뒤 작업.)

**결과표 (D2)**

| 회차 | kind | CLI 버전 | 일시 | 서버 모드 · HOME 선택(§5.4) | `t_prompt`→RPC 반환 (ms) | stalled | `t_prompt`→첫 `working` (ms) | 종료 push 값·시각 | G 프롬프트 전→후→끝 (rev / scs / cs) | `done`↔`completion_seq` 대조 | 생성/닫음 id · CLI pid 정리 | 결과 코드 | 비고 |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| | | | | | | | | | | | | | |

### 7.3 판정과 TLA 영향

| 결과 | 관측 | done-scope / TLA |
|---|---|---|
| D-1 **attention 파생** | D1에서 `working→idle`이 `done`으로 push · 포커스 시 `idle` | `done`은 **작업 종료 후에만** 생긴다 → 모델 전제("프롬프트 이후") 유지. 단 **기동 쌍(B)이 있으면 그 쌍도 `done`으로 올 수 있다** → B 결과와 합쳐 C9를 `sawWorking` 없이도 여는 경로로 기록. F3′에 `done` 포함 필수(TLA §5) |
| D-2 **종료/해제 시에만** | D1 2–3단계는 `idle` · 5·6단계에서만 `done`/`final_status: done` | 실행 중 카드엔 `done`이 안 온다 → 현재 `ccaf5ea:…bridge-runtime.ts:3373`의 `done` 분기는 종료 신호로만 작동. 모델 범위 제외 무해 |
| D-3 **CLI 감지 전용** | D1 전부 `idle` · D2에서만 `done` | 전제는 D2의 시각으로 판정: `done`이 **실제 작업 종료 뒤에만**(`t_prompt` 뒤 `working` 뒤라는 것만으로는 부족 — 중간 idle·stall 이후 status와 구분, Astra 0251 M6) → 전제 유지(해당 kind 한정). B2에서 기동 중 `done` 관측 → **전제 깨짐**: `done`이 `sawWorking` 없이 가짜 완료를 만든다(C9보다 넓음) → TLA에 `BootDone` 상수 추가 필요 |
| D-4 **`done` 미관측** | D1·D2 모두 `done` 0건 | 이 버전·이 kind에선 `done` 경로 비활성. 전제 유지, 단 "관측 없음 ≠ 계약" 표기 |

`completion_seq` 대조는 판정 코드와 별도로 기록한다: "`done`/완료 `idle` ↔ `completion_seq` +1 동시" · "`completion_seq`만 증가" ·
"`done`인데 불변" — F2''(seq 정렬 스냅샷) 모델링 근거(COMPAT §3 (e)).

부산물(판정 아님): D2 3단계 지연이 4 s를 넘는 kind가 있으면 `LatencyBound`가 운영에서 깨진다는 증거 → TLA §4-1(C4·F2) 위험이 실재.

정리: §2.3 + B2와 같은 실 CLI 정리. 프롬프트로 생긴 CLI 세션 파일 위치를 기록.

## 8. Probe E — `agent.wait` level vs edge · `[herdr 전용]`

**질문:** `agent.wait{target, until:["idle","done"], timeout_ms}`(22:5423, `AgentWaitParams` 22:1673-1697 — `since`/seq 없음)은 이미
`idle`인 pane에서 즉시 반환하는가(level), 다음 전이까지 기다리는가(edge)? level이면 프롬프트 전 `idle`에 즉시 반환 → 가짜 완료(C9류)라
단독으로 F2'를 대체할 수 없고, edge면 호출 전 전이를 잃는다(C5류). 어느 쪽이든 `state_change_seq` 확인과 결합해야 의미가 있다.

대기 중 연결 하나를 점유하므로(연결당 1 RPC) `agent.wait`는 별도 소켓에서 보낸다. 각 단계 전·후 `G(P)`.

1. 스크래치 쉘 pane `P`. `report_agent(P, working)` → 1 s → `report_agent(P, idle)` → 2 s 안정 → `G(P)`(레벨 `idle` 확인).
2. **E-level:** `t0` → `agent.wait{target:P, until:["idle","done"], timeout_ms:5000}` → 반환 시각·결과 원문. `< 500 ms` 반환이면 level 후보,
   5 s 타임아웃이면 edge 후보.
3. **E-edge 확인:** `agent.wait{… timeout_ms:10000}`을 먼저 보내고 +1 s `report_agent(P, working)`, +2 s `report_agent(P, idle)` → 반환 시각이
   +2 s 근처인가(edge), +1 s(`working`에도 반응?)인가, 즉시인가(level). 결과에 실린 status·seq 필드 원문 기록.
4. **E-working:** `report_agent(P, working)` 상태에서 2단계를 반복 → `idle` 보고 전까지 대기하는지(대조군 — 기다림 자체가 동작함을 증명).

| 결과 | 관측 | 의미 |
|---|---|---|
| E-1 **level** | 2단계 즉시 반환 · 4단계는 `idle` 보고 시 반환 | 현재 레벨 판정 — 프롬프트 전 `idle`에 즉시 반환하므로 단독 완료 판정 불가 |
| E-2 **edge** | 2단계 타임아웃 · 3단계 `idle` 전이 시 반환 | 다음 전이 대기 — 호출 전 전이 유실 위험(C5류) |
| E-3 **기타** | `working`에도 반환 · 결과 형식 이상 등 | 원문 기록, 해석 보류 |
| UNDETERMINED | 4단계 대조군이 즉시 반환·오류 | 판정 없음 |
| AGENT_NOT_FOUND **(run-1 analysis)** | 어느 `agent.wait`든 `agent_not_found` | 판정 없음 — `agent.wait`는 agent가 나타나길 기다리지 않는다(run 1: 2–106 ms 즉시 오류) |

반복 **2회**. 정리: §2.3(대기 중인 wait 소켓 `destroy()` 포함).

**v2 개정 (run-1 analysis):** run 1은 세 호출 모두 `agent_not_found`로 UNDETERMINED였다(권한 해제). v2는 held pane에서 돈다:
**E-boot**(신규) = 아무것도 보고하지 않은 감지기 `idle`(B1 상태)에 `agent.wait{… 5000}` — C9 질문 그 자체("기동 `idle`에 즉시
반환하는가", `bootReturn` = immediate/timeout/other, 판정 코드와 별도 기록). 이어 기존 1–4단계, 각 호출 전 레벨 단언
(`idle|done` · E-working은 `working`). 오류 코드는 `errorCode`로 보존해 `agent_not_found`를 따로 가른다.

**결과표 (E)**

| 회차 | 단계 | 일시 | 서버 모드 | 호출 시 레벨 (단언) | 반환 지연 (ms) | 결과 원문 요약 | G 전→후 (rev / scs / cs) | 생성/닫음 id | 결과 코드 | 비고 |
|---|---|---|---|---|---|---|---|---|---|---|
| 1–2 | level/edge/working | run 1 `6c0c3e` | private | (v1 미단언 — not found) | 2–106 | `agent_not_found` | — | — | UNDETERMINED ×2 | run-1 분석 §5 |
| 1–2 | E-boot | run 2 `dcda61` · 2026-10-23 | private | 기동 `idle`(보고 없음) | 104 / 105 | `agent_status:"idle"`, `completion_seq` 없음 (`bootReturns` immediate ×2) | — | — | (C9 실재) | run-2 분석 §5 |
| 1–2 | level | run 2 | private | `done` | 101–106 | 즉시 반환 | — | — | | |
| 1–2 | edge | run 2 | private | `done` | 1 / 106 | `working` 보고(+1008 / +1109) **전에** 반환 — edge 아님 | — | — | | |
| 1–2 | working | run 2 | private | `working` (scs 179) | 2074 / 2179 (idle 보고 2004 / 2103 뒤 ~70 ms) | `done`, scs = cs (180, 187) — 전체 `agent_info` | — | — | **E-1** (PASS) | level-triggered |

### 8.1 Probe s — `state_change_seq` 의미 · `[herdr 전용]` (run-1 analysis)

**질문:** run 1에서 `state_change_seq`는 서버 전역 단조였다(p2 끝 3 → p3 첫 값 4, 변화마다 +1, 무변화 30 s 동안 불변). 그런데 활성 pane이
한 번에 하나뿐이어서 **한 pane의 값이 "그 pane의 마지막 변경 시점의 전역 seq(도장)"인지 "현재 전역 카운터"인지**는 미결이었다.
도장이면 "스냅샷 scs > 프롬프트 뒤 기준값"이 이 pane의 변화를 증명하고, 전역 카운터면 다른 pane이 올려 아무것도 증명하지 못한다.

1. held pane `H1`·`H2`(§2.6). `agent.start` 결과 scs와 첫 `agent.get` scs 기록 — run 1의 `agent.start` = 0은 **미할당이지 reset이 아님**
   (`knownNonReset`).
2. 회차마다 `H1`만 바꾼다(`working`↔`blocked`) → 300 ms → `G(H1)`·`G(H2)`; 이어 `H2`만 바꾸고 `H1`을 읽는다. 바뀐 쪽 `dScs > 0`이고
   안 바꾼 쪽 status 불변일 때: 안 바꾼 쪽 `dScs = 0` → `stamp`, `> 0` → `global`(`otherEqualsChanged`도 기록).
3. **같은 상태 재보고:** `H1`의 현재 상태를 그대로 다시 `report` → 500 ms → `dScs`(`bump`/`no-bump`) + `H1` 구독의 push(중복 push 여부).
4. 각 단계 전·후 레벨 단언.

| 결과 | 의미 |
|---|---|
| `S-STAMP/…` | pane별 마지막-변경 도장 → 세대 귀속에 "baseline scs보다 큰 스냅샷"을 쓸 수 있다 |
| `S-GLOBAL/…` | 현재 전역 카운터 → 다른 pane 활동이 값을 올린다 — scs 단독으로 이 pane의 변화를 증명 못 함(`done` 레벨·`working` 관측 필요) |
| `…/rereport-nobump` · `…/rereport-bump` | 같은 상태 재보고가 seq를 올리지 않음 / 올림(올리면 "seq 증가 = 상태 변화" 등식이 깨짐) |
| `S-MIXED`·`rereport-mixed`·`LEVEL_LOST` | INCONCLUSIVE — 원 행 보고 |

반복 **2회**(회차당 양방향 2행).

**결과표 (s)**

| 회차 | 일시 | 서버 모드 | 바꾼 pane · 전이 | 바꾼 쪽 dScs | 안 바꾼 쪽 dScs · status 불변 | `otherEqualsChanged` | 재보고 상태 · dScs · push | `agent.start` scs → 첫 get scs | 생성/닫음 id | 결과 코드 | 비고 |
|---|---|---|---|---|---|---|---|---|---|---|---|
| 1 | run 2 `dcda61` · 2026-10-23 | private | P idle→working | 188→**190** | Q 189 → 189 (`dOther:0`, `otherStatusStable:true`) | — | blocked→blocked ×2 · `dScs:0` · `pushes:[]` | 0 → 188 / 189 (`knownNonReset:true`) | — | **S-STAMP/rereport-nobump** (PASS) | 전역 카운터에서 뽑은 pane별 도장(+2 도약) |
| 1 | run 2 | private | Q 변경 | 189→**191** | P 190 → 190 | — | (위와 같음) | — | — | (같음) | 4/4 행 `class:"stamp"` |
| 2 | run 2 | private | (양방향 2행) | > 0 | 0 | — | no-bump | — | — | (같음) | 2/2 회차 일치 |

추가(run 2 D1): 포커스로 인한 `done→idle`은 `idle` **push**를 내지만 scs는 불변(171→171) — push마다 scs가 오르지는 않는다. run 1의
"내보낸 변화마다 +1"은 보고 원천 변화에만 성립한다.

## 9. 실행 순서·결과 기록

1. S0 (private 서버 기동 또는 shared 안전 블록 준비 · `ping` 0.9.5/22 확인 · held driver 점검 §2.6) → A → C → D1 → E → s → B1. 전부 `[herdr 전용]` —
   오너 승인 없이 아키텍트가 실행 결정 가능(shared면 §2.5 전부 준수).
2. B2·D2는 `[실 CLI — 오너 yes]` — 승인 문구에 kind 목록과 §5.4 HOME 선택·서버 모드를 함께 받는다. B2 다음 D2(같은 실행에서 B2
   관찰분을 D2 1단계로 재사용 가능).
3. 각 프로브의 결과표는 아키텍트가 채운다. 서술 관측은 새 관측 문서 `docs/spikes/HERDR-STATUS-OBSERVATIONS.md`에(이 설계 문서의
   본문은 수정하지 않고 결과표만 채운다): herdr `ping` 버전·프로토콜(0.9.5 / 22), 서버 모드, 반복별 원 push 인용, G-스냅샷 원표,
   위 표의 결과 코드(S0…E-3), 그리고 아래 매핑으로 TLA 상수를 갱신할 근거.

| 프로브 결과 | `BRIDGE-STARTUP-TLA.md`에 반영할 것 |
|---|---|
| A-1 | `Drain = TRUE` 전제 확인 — §5 F1′ "전제(Unknown, herdr 0.9.5 라이브 확인 필요)" 해소 |
| A-2/A-3/A-4 | `Drain = FALSE`가 현실 — F3·F4 판정이 운영 기준. F1′는 상한 타이머 + 파괴로 설계 |
| A-5 | F1′ 재설계(모델 전제 붕괴) |
| B 존재 | `MaxBoot ≥ 1` 현실 — C9·C10·F12·F14 실재 위험 |
| B 부재 | `MaxBoot = 0` 지지(한정) — 해당 반례는 이론상 위험으로 강등 |
| C-1 / C-2 / C-3 | `Replay = FALSE` / `TRUE` / 새 상수(스냅샷 replay) — §2.3 표의 replay 미확인 행(종전 "protocol 17 미확인") 해소 — 0.9.5 / 22 기준 |
| D-1…D-4 | §2.2 `done` 범위 제외 전제의 유지·파기, 필요 시 `BootDone` 모델 추가 |
| G-스냅샷 seq 규칙 · `done`↔`completion_seq` | §1.2 "단조 마커 없음"을 이벤트 한정으로 좁힘 · F2''(seq 정렬 스냅샷) 모델링 가부(PLAN UK-1) |
| E-1 / E-2 | `agent.wait` 단독 F2' 대체 불가의 근거 형태(level=C9류 / edge=C5류) |
| s: S-STAMP / S-GLOBAL | 세대 귀속에 `state_change_seq` baseline 비교를 쓸 수 있는가(도장) / 없는가(전역 — `done` 레벨·`working` 관측 필요) |

**하니스 verdict 읽는 법 (`scripts/probe-herdr-status.ts` v2 — run-1 analysis로 개정):**

공통: `LEVEL_LOST`(held pane에서 단계 직전 레벨 불일치) · `NO_HELD_SUBSTRATE(…)` · `NO_HELD_DRIVER` · `ABORTED_REAL_CLI`(실행 중단)는
**INCONCLUSIVE이며 herdr 사실의 FAIL이 아니다** — `facts.levelLost`/`facts.heldSubstrate`를 보고 원인을 적는다. `NO_HELD_DRIVER` 자체는
"herdr-only로 `report_agent` 권한을 유지할 수단 없음"이라는 사실이다(S0 `trials`).

| 프로브 | PASS | FAIL | INCONCLUSIVE (주요) |
|---|---|---|---|
| step0 | 0.9.5/22 · 격리 · push 2건 → 나머지 판정 유효. `heldSubstrate.driverAgent`가 있으면 C·D1·E·s 진행 가능 | `S0-VERSION`/`S0-ISOLATION`/`S0-NOPUSH` → 나머지 SKIPPED/UNDETERMINED | `S0-PARTIALPUSH` |
| A | `A-1` = flowing 교체 ×reps 일치 + FIFO(접미사) + 연쇄(2회) + A′ 무폐쇄 + 미독 꼬리 유실 없음 → **`Drain=TRUE`**. `A-1/bun-pause-loss` = herdr 쪽 drain은 성립, 유실은 Bun pause+end 한정(python 무손실) → **F1′는 "옛 소켓을 pause하지 말고 `end()` 뒤 `end`/`close`까지 소비"로 구현** | `A-2/3/4/5`(flowing) · `A-4/herdr-side-unread-loss`(python도 유실 → herdr가 EOF 시 미독 바이트를 버림 → `Drain=FALSE`) · `A-1/aux-fail` | `LEVEL_LOST` · `MIXED:…` · `A-1/pause-loss-side-unknown`(python 미결) |
| C | `C-1` = 비-idle 레벨 유지 상태의 늦은 구독 2창 모두 0건 + S2·S3 liveness → **`Replay=FALSE`** | `C-2`(backlog) · `C-3`(최신값 1건) → replay 실재, 새 상수/stale replay 대책 | `LEVEL_LOST` · `C-MIXED(…)` · 회차 불일치 |
| D1 | `D-1`/`D-2`/`D-4` + 모든 `done`이 보고된 작업 종료 뒤 → **F3′ `done` 전제 유지**. `doneSummary`로 레벨 지속·`completion_seq` 유무를 따로 적는다 | `…/done-without-work-end` → F3′ 펜스로 못 막는 가짜 완료 경로 | `LEVEL_LOST`(`idle` 보고 때 `working`이 이미 사라짐 — run 1의 D-4 산물 차단) · `NO_HELD_*` |
| E | `E-1`/`E-2` 일치 → `agent.wait` 단독 **F2′ 대체 불가** 확인(형태 확정). `bootReturns`(immediate면 C9 실재)는 별도 기록 | (FAIL 없음) | `AGENT_NOT_FOUND` · `LEVEL_LOST` · `E-3…` |
| s | `S-STAMP` 또는 `S-GLOBAL` × `rereport-bump`/`rereport-nobump` 일치 → seq 의미 확정 | (FAIL 없음) | `S-MIXED`·`rereport-mixed`·`LEVEL_LOST` |
| B1 | herdr 고유 기동 `working` 없음 → F3′ 잔여창은 CLI 의존(B2 필요) | 가짜 바이너리에도 기동 `working` → **`MaxBoot ≥ 1`**, F3′ 펜스 뒤 기동 쌍 실재 | `ABORTED_REAL_CLI` · `NOT_APPLICABLE` |

## 10. 이 설계의 미확인 전제 (S0에서 먼저 깨질 수 있는 것)

- headless `herdr server`가 temp HOME·`HERDR_SOCKET_PATH`로 격리 기동되는가 — 0.9.5에서 **다시 미실측**, `detached_server_daemon`이
  기동 방식을 바꿀 수 있다(§2.2 — 서버 pid·소켓 기록).
- `agent.start`가 kind를 PATH의 가짜 바이너리로 해석하는가(§5.1) — 아니면 B1 `NOT_APPLICABLE`. kind 목록은 schema에 없어
  `server.agent_manifests`로 확인.
- 0.9.5 / protocol 22에서 `pane.report_agent`가 0.7.4처럼 push를 만드는가 — A·C·D1·E 전부의 바탕. S0에 `report_agent` → push 확인이
  있고, 실패하면 A·C·D1·E 모두 `UNDETERMINED`.
- 쉘 pane(에이전트 미감지)에서 `agent.get{target:pane_id}`가 `report_agent` 뒤 `AgentInfo`를 돌려주는가 — 아니면 G-스냅샷은
  `pane.list` 레벨값만 남고 seq 관찰(TLA (e))은 B·D2 한정. **(run-1 analysis) 실측:** 돌려주지만 권한이 0.1–1 s 안에 풀린 뒤엔
  `agent target … not found` — v2는 held pane(§2.6)으로 옮겼다.
- **(run-1 analysis)** held pane에서 `report_agent{agent:<kind>|bash}`가 2 s 이상 레벨을 유지하는가 — 미실측(v2 S0 driver 점검이
  답한다). 유지 수단이 없으면 C·D1·E·s는 `NO_HELD_DRIVER`로 끝나고, 남은 질문은 B2·D2 범위로 넘어간다.
- 감지 이벤트 구독 type = `pane.agent_detected`로 **확정**(17:3856-3867 / 22:4169-4180, 전역 구독 — `pane_id` 필터 없음).
- shared 모드에서 `workspace.create{focus:false}`가 사용자 포커스를 바꾸지 않는가 — S0에서 생성 전후 `pane.list`의 `focused` 대조로 확인,
  바뀌면 shared 중단.

## 11. herdr 0.9.5 facts (measured, private server) — run 2 (`dcda61`, 2026-10-23) 기준

범위: private 서버 · protocol 22 · **`report_agent` 원천 status**(held fake-agent pane). 감지기 원천(실 CLI)은 B2·D2가 답한다.
run 1(`6c0c3e`)은 쉘 pane 권한 해제 때문에 A·C·D1·E가 하니스 전제 산물이었고, 아래 표에는 run 1 중 herdr 사실로 남는 것만
"(+run 1)"로 합쳤다. M = 로그 실측, I = 추론. 원자료 = run-2 분석 §7(H1–H13).

| # | 사실 | 증거 (회차 수 · 로그 필드) | M/I | 설계 결과 |
|---|---|---|---|---|
| H1 | 클라이언트 EOF → 서버 FIN+close 0–1 ms. EOF 뒤엔 아무것도 쓰지 않는다 | 20 교체 · `eofToEndMs` 0–1 · `postEofOnOld:0` (+run 1 15/15, 0–3 ms) | M | half-close가 유일한 구독 해제 수단으로 즉시 동작 — A-2/A-3 배제 |
| H2 | EOF 전에 쓴 바이트는 half-close 뒤에도 클라이언트가 읽을 수 있다(herdr가 버리지 않음) | python (c) `bytesAfterEof:254`(= 꼬리 2건) ×5 · 1.5 s linger 뒤 `recv` | M | herdr 쪽 `Drain = TRUE` |
| H3 | Bun은 pause된 소켓의 미독 버퍼를 peer FIN에 잃는다 | (b) `bytesRead` 576 pause·EOF·resume 불변 · `oldSeq:[]` ×5 · `end`/`close` 0–1 ms | M(증상) / I(원인) | Bun 브리지는 옛 소켓을 pause하지 않는다. flowing 중 EOF 시점 in-flight 바이트는 **미측정** |
| H4 | 겹친 구독은 같은 순서를 받는다. 오래된 쪽이 1–14 ms 먼저. 30 s 유휴 무폐쇄 | `fifo.equal` 5/5 · A′ 5/5 (`serverClosedIdle:false`) | M ("항상 먼저"는 I) | make-before-break 성립 |
| H5 | 등록 ≈ ACK. ACK 전 push는 관측된 적 없음. ACK 뒤 publish는 항상 새 구독자에게 도착 | `push-after-ack` ×5 · run 1: SUB_TX~ACK 사이 publish가 옛 소켓에만 | M (+run 1) | SUB_TX→ACK 창의 publish는 새 소켓이 잃을 수 있다 → 이벤트로 그 창을 메우지 않는다 |
| H6 | 늦은 구독자에게 replay 없음 — backlog·최신값·`pane_closed` 모두 | C 2/2 (`seq:[]`, `class:"none"`, `gapTransitionReplayed:false`) + run 1 | M | `Replay = FALSE`(report_agent 원천). 놓친 전이는 스냅샷으로만 복구 |
| H7 | `state_change_seq` = 전역 단조 카운터에서 뽑은 **pane별 마지막-변경 도장**. 같은 상태 재보고·포커스 해제는 올리지 않는다. `agent.start`의 0 = 미할당 | s 4/4 행 + 2/2 회차 (`dOther:0`, +2 도약) · `dScs:0` 재보고 · D1 포커스 171→171 · `knownNonReset:true` | M | baseline 비교(`scs > b`)가 **이 pane의** 변화를 증명한다. 0을 reset으로 읽지 않는다 |
| H8 | 비포커스 pane의 working→idle은 레벨 `done`으로 publish되고 다음 보고까지 유지. `completion_seq` = 그 변화의 scs, 작업 중 `null`, 포커스 해제 뒤에도 유지 | D1 7/7 (`persistedInAgentGet:7`, `completionSeqPresent:7`, `doneLevelMs` ≈5.3–5.4 s) | M | 폴 사이에 끝난 작업도 레벨+cs로 잡힌다 |
| H9 | `done`은 working→idle **간선마다** — 중간 idle 포함 | D1 재진입 `doneAtIntermediateIdle:true` (cs 167 → 169) | M | 중간 idle이 가짜 완료가 될 수 있다(실 CLI는 D2) |
| H10 | `done` 중 포커스 → `idle` push, scs 불변 | D1 포커스 (`focused:true`, scs·cs 171) | M | push가 scs 변화와 대응하지 않을 수 있다 — 이벤트는 깨우기 전용 |
| H11 | `agent.wait`는 level-triggered. 기동 idle에 즉시 반환. 반환값 = `agent_info` 스냅샷 | E 2/2 (`bootReturns` immediate ×2, edge 호출도 즉시) | M | `agent.wait` 단독 완료 판정 불가(C9 실재). cs 펜스와 묶으면 블로킹 폴로 쓸 수 있다 |
| H12 | 보고한 `agent` = 감지된 kind면 권한 유지, 쉘 pane의 `bash`는 ≤ 1 s에 해제(`unknown` / not found) | run 2 `LEVEL_LOST` 0 · `unknown` push 0 (held) · step0 bash 쉘 pane `unknown` 2건 · run 1 전반 | M | `agent_not_found`/`unknown` = 권한 없음, 판정 근거로 쓰지 않음 |
| H13 | push 봉투에 seq 없음. `agent.get`은 받은 push보다 뒤처진 적 없음. 모든 RPC가 ~100 ms 틱 위 | freshness 5/5 `scsAdvanced:true` · RPC 타이밍(run 1·2) | M (소표본) | `LatencyBound`에 홉당 ~100 ms. RPC를 이어 ≤ 50 ms 창은 못 만든다 |

### 11.1 실행 세대 완료 규칙 (후보 — 설계 아님)

- **baseline `b`** = 기동이 안정된 뒤 · inject **직전**에 읽은 `agent.get(P)`의 `completion_seq`/`state_change_seq`(H7).
- **완료** = `agent_status ∈ {done, idle} ∧ completion_seq > b`. 폴 사이에 작업이 통째로 끝나도(H8), 포커스 해제 뒤에도(H10) 성립.
  이전 실행의 stale `done`은 `cs ≤ b`로, 기동 idle은 `cs = null`로 거부된다(H11의 C9를 펜스가 막음).
- `scs == b`가 `LatencyBound` 뒤에도 그대로 = 전달 증거 없음(재-inject 후보). `agent_not_found`/`unknown` = **권한 없음** — 폴 계속, 판정 금지(H12).
- 이벤트는 깨우기 전용(H6·H10·H13).
- **열린 설계 질문 — protocol 17:** `completion_seq`는 **protocol 22 전용**(22:6564-6572)이고 17에는 `state_change_seq`만 있다(17:6034-6039).
  Loom은 {17, 22}를 지원하므로 17에서의 완료 펜스(예: `scs > b ∧ status ∈ {done, idle}` + working 관측 요구)를 따로 정해야 한다 —
  17의 scs가 도장인지도 미측정.
- 규칙의 미결 위험: (i) H9 중간 idle이 `cs > b`를 만든다 · (ii) 이미 포커스된 pane의 완료가 cs를 채우는가(herdr-only 시험 가능) ·
  (iii) 감지기 원천 상태가 cs/scs를 같은 방식으로 채우는가.

### 11.2 B2·D2에 남은 것 (실 CLI — 오너 yes)

- 기동 `working`/`done`이 `interactive_ready` 전·후에 오는가(MaxBoot), 그리고 기동 전이가 baseline **뒤**에 떨어질 수 있는가.
- 감지기 원천 권한이 실행 중·종료 시 떨어지는가(`unknown`/`agent_not_found`).
- 도구 대기 등 중간 idle과 그때의 `done`(H9) vs 실제 작업 종료.
- 감지기 원천 완료의 `completion_seq`/scs 동작.
- 같은 pane에서 감지기 원천 vs 보고 원천 충돌.
- 감지기 원천 status의 replay(B2 중 같은 pane 재구독).
- 프롬프트 → 첫 `working` 지연 vs `LatencyBound`(100 ms 틱·`agent_prompt_stalled` 포함).

herdr-only 후속(오너 yes 불요): A 동률 술어 수정 뒤 재실행(수정 완료, 미실행) · Bun flowing in-flight 꼬리 변형 · 이미 포커스된 pane의
완료 · `release_agent` 뒤 `agent.get` 레벨 · herdr pane 밖에서 실행.
