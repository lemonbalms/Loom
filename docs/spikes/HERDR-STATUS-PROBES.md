# HERDR-STATUS-PROBES — TLA+ 가정 4건을 확인할 라이브 herdr 프로브 설계

> 상태: **설계 문서 전용 · 아무것도 실행하지 않았다 · 스크립트 미작성 · 제품 코드 무변경.**
> 대상: `docs/spikes/BRIDGE-STARTUP-TLA.md` §0 항목 5의 (a)–(d). 코드 좌표는 `main` @ `56a171a` 기준.
> 이 문서는 프로브를 **어떻게** 돌릴지 정한다. 결과·판정은 실행 뒤 별도 관측 문서(§7)에 적는다.

## 0. 요약

| # | 가정 (TLA §0-5) | TLA 상수·전제 | 실 CLI 필요? | 핵심 수단 |
|---|---|---|---|---|
| A | 구독 연결에 클라이언트 EOF → herdr가 구독을 내리고 연결을 닫는가 | `Drain` | **no real CLI** | 쉘 pane + `pane.report_agent` + `sock.end()` |
| B | `interactive_ready` 뒤·프롬프트 전에 `working`/`idle`을 내는가 | `MaxBoot` (C9·C10·F11·F12·F14) | **B1 no real CLI (예비)** · **B2 needs real CLI (owner yes)** | 가짜 agent 바이너리 / 실 CLI 기동만, 프롬프트 없음 |
| C | 새 구독자에게 status backlog를 replay하는가 (protocol 17) | `Replay` (C11·C12·F15·F16) | **no real CLI** | 시나리오 D(0.7.4)를 0.7.5에서 재실행 + 공백 변형 |
| D | `done` status를 언제 내는가 | `done`-scope (§2.2 범위 제외 전제) | **D1 no real CLI** · **D2 needs real CLI (owner yes)** | `report_agent` 전이 + 포커스 · 실 CLI 1회 프롬프트 |

부산물: D2·B2는 프롬프트→첫 `working` 지연도 잰다 → `LatencyBound`(4 s) 근거 자료(판정 아님).

## 1. 근거 — 레포가 herdr와 말하는 방식

- **전송.** Unix 소켓 NDJSON JSON-RPC. RPC는 호출마다 새 소켓(`herdr-client.ts:302-361`), 이벤트는 장수 `events.subscribe`
  연결(:683, :726). 열린 구독 연결은 두 번째 요청을 받지 않는다(:676-679). 소켓 경로 = `LOOM_HERDR_SOCKET` 또는
  `~/.config/herdr/herdr.sock`(:27, `bridge-config.ts:154`). herdr 자체 오버라이드 env = `HERDR_SOCKET_PATH`(STEP0.5-HERDR.md:82 — 사이트 문서 근거, 미실측).
- **선례 프로브.** `scripts/probe-pane-death.ts` — `HerdrClient`를 쓰지 않는 raw 소켓(재구독 로직 오염 방지,
  PANE-DEATH-OBSERVATIONS §3.1), 시작 시 살아 있는 pane 전부 보호(`PROTECTED_EXPANDED`, §D.10), 자기 전용 jsonl 로그,
  `PROBE_END` 마커로 완주 판별(§2.3). **pane 밖에서 실행**해야 한다(라운드 1 절단, §2.1).
- **CLI 없이 status 만들기.** `pane.report_agent{pane_id, source, agent, state, seq}` — `PaneAgentState` =
  `idle|working|blocked|unknown`, **`done` 불가**(schema `PaneReportAgentParams`·`PaneAgentState`, v0.7.5 fixture
  `schema.json:2336-2344`, :2733-2781). 0.7.4에서 RPC `ok` → push 13–104 ms(OBS §D.3).
- **`done`.** 이벤트·응답 `AgentStatus` enum에는 `done`이 있다(`schema.json:72-77`, :1336-1341). 클라이언트가 쓸 수 없으니
  **herdr가 스스로 도출**하는 값이다 — 도출 규칙은 문서화돼 있지 않다(Unknown).
- **protocol 17 기동.** `tab.create`/`pane.split`(env·cwd) → `agent.start{name, kind, pane_id, args?}` → `launch_pending`이면
  `agent.get` 폴링으로 `interactive_ready`(`herdr-client.ts:380-450`; COMPAT §3.1). `kind`는 고정 목록
  (`agent-help.txt:15`)이며 **임의 명령을 띄울 수 없다**. 관련 메서드: `agent.explain`, `pane.release_agent`,
  `pane.clear_agent_authority`, `server.agent_manifests`(`methods.json`).
- **0.7.4 기존 관측.** status는 replay 안 됨, terminal은 replay됨(OBS §D.7). push 이름: status는 dotted
  `pane.agent_status_changed`, terminal은 underscore `pane_closed`(§D.8-2). 죽은 pane의 status 구독은 ACK가 영영 오지 않는다(§D.8-1).

## 2. 공통 설계 — 단일 Bun 프로브 `scripts/probe-herdr-status.ts` (설계만, 미작성)

### 2.1 형태

```text
bun run scripts/probe-herdr-status.ts --probe a|b1|c|d1|all   [--server private|shared]
bun run scripts/probe-herdr-status.ts --probe b2|d2 --kind claude|codex|grok --real-cli   # owner yes 필수
```

- `all` = **no real CLI 프로브만**(a·b1·c·d1). `b2`·`d2`는 `all`에 절대 넣지 않는다. `--real-cli` 플래그가 없으면
  즉시 exit 2(`REFUSED_REAL_CLI`). HANDOFF Must-not("real-CLI smoke without explicit owner yes")을 코드로 막는다.
- `probe-pane-death.ts`의 raw `rpc()`·`openEventSubscription()`·`parseNdjsonLines()`를 복사해 쓴다(import 금지 —
  그 파일은 main()을 자동 실행한다). 구독 함수에 두 가지를 더한다:
  `allowHalfOpen: true`로 연결 · `end()`(half-close)와 `destroy()`를 별도 노출 · `'end'`(서버 FIN)·`'close'`·`'error'`
  이벤트와 시각을 모두 기록.
- 모든 push를 `{t_ms, conn, raw}`로 기록하고, 판정은 **로그에서 계산**한다(실행 중 요약으로 원문을 대체하지 않음).
- **push 이름 정규화:** status는 dotted·underscore 둘 다 받는다(`event`에 `agent_status` 포함). terminal도 둘 다.

### 2.2 격리 — temp HOME + 서버 모드

- 시작 시 `T = mkdtemp(tmpdir()/loom-herdr-probe-)`. 프로브는 `HOME=T/home`·`LOOM_TEST_HOME=T`로 실행하고
  로그·스크래치 파일을 전부 `T` 아래에 둔다(Must-not: temp HOME + `LOOM_TEST_HOME`). 브리지 env는 상속하지 않는다.
- **`--server private` (기본, 권장):** 프로브가 자기 herdr 서버를 띄운다.
  `env -i PATH=… HOME=T/home HERDR_SOCKET_PATH=T/herdr.sock setsid herdr server` → 소켓이 `T/` 아래 생길 때까지 대기 →
  `ping`이 `version 0.7.5 · protocol 17`인지 확인(아니면 abort). 워크스페이스가 없으면 `workspace.create`.
  - **전제 확인(Step 0):** headless `herdr server`가 temp HOME에서 뜨고 `HERDR_SOCKET_PATH`를 따르는지는 **미실측**이다
    (HANDOFF_WINDOWS.md:316은 `setsid nohup herdr server`의 headless 기동 선례). Step 0이 실패하면 아래 shared로
    내려가지 말고 **중단·보고**한다(사용자 라이브 세션을 건드리는 결정은 아키텍트 몫).
  - 이점: 사용자 pane·포커스·`herdr-server.log`를 오염하지 않는다. 다른 구독자가 없어 replay 대조가 깨끗하다.
  - 한계: temp HOME에는 herdr 통합(`integration.install` — 예: Claude 훅)이 **설치돼 있지 않다**. B2·D2의 결과는 운영
    설정과 다를 수 있다(§4.4·§6.4 참고).
- **`--server shared` (오너 승인 시만):** `LOOM_HERDR_SOCKET`/기본 소켓 사용. `probe-pane-death.ts`와 같은 안전 규칙 —
  시작 시 살아 있는 pane 전부 보호, 자기가 만든 tab/pane만 닫음(`assertOwned`), **포커스 변경 금지**(D1 Step 4 생략).
- 실행 위치: **herdr pane 밖**(하니스 백그라운드나 일반 터미널). 워커 테스트 스위트와 동시 실행 금지(traps).
- 스크래치 pane: `tab.create{focus:false, label:"herdr-status-probe-<probe>", cwd:T, env:{…}}` → `root_pane` 사용.
  모든 이름에 접두 `hsprobe-`.

### 2.3 정리 (모든 프로브 공통, `finally`)

1. 열린 모든 이벤트 소켓 `destroy()`.
2. 소유 pane·tab `pane.close`/`tab.close`(`assertOwned` 통과분만).
3. private 모드: `server.stop` RPC(소켓 경로가 `T/` 아래임을 재확인 후) → 5 s 안에 서버 pid가 사라지지 않으면 그 pid에만
   SIGTERM. 사용자 herdr에는 절대 `server.stop`을 보내지 않는다.
4. 실 CLI 프로브: CLI 프로세스가 pane과 함께 죽었는지 `pane.process_info`(close 전 기록)의 pid로 확인 — 남았으면 그 pid만 SIGTERM.
5. `PROBE_END{owned, closed, leftover}` 기록 후 `T/`는 **지우지 않는다**(원자료 보존 — 관측 문서 작성 뒤 수동 삭제).

## 3. Probe A — 구독 연결 half-close (drain 전제) · **no real CLI**

**질문:** 클라이언트가 `events.subscribe` 연결에 EOF를 보내면 (i) herdr는 구독을 내리는가, (ii) 연결을 닫는가(FIN),
(iii) EOF 전에 쓴 바이트는 클라이언트까지 오는가? (`BridgeStartupFixed.tla`의 `drain → flush → none`)

**준비:** 스크래치 쉘 pane `P`. 상태를 만들려면 `report_agent`(`source:"hsprobe-a"`, `agent:"bash"`, seq 단조 증가).

**단계:**

1. `S1 = subscribe([{pane.agent_status_changed, P}, {pane.closed}, {pane.exited}])`, ACK 대기.
2. **liveness:** `report_agent(P, working)` → S1이 push를 받는지(≤ 2 s). 못 받으면 판정 `UNDETERMINED` 후 종료.
3. **make-before-break 대조:** `S2 = subscribe(같은 목록)` ACK → `report_agent(P, idle)` → **S1·S2 둘 다** 같은 push를
   받는지 기록(Fixed 모델의 "겹침 동안 두 소켓이 같은 복사본" 전제).
4. **in-flight 꼬리:** `report_agent(P, working)` 와 `report_agent(P, idle)`를 연달아 보낸 직후(두 RPC의 `ok`를 받은 직후)
   **S1.end()** — `t_eof` 기록.
5. `t_eof` 직후 `report_agent(P, working)`, +500 ms `report_agent(P, idle)` (EOF **뒤** 전이).
6. S1에서 관찰, 상한 30 s: `'end'`(서버 FIN) 시각 · `'close'` 시각 · `'error'` · EOF 뒤 받은 push 목록.
7. S2가 4·5단계 push 4건을 모두 받았는지(대조군 — herdr가 전이를 실제로 냈다는 증거).
8. 변형 A′(같은 순서, 새 pane): 4단계에서 `end()` 대신 **아무것도 안 하고** 30 s 관찰 — 서버가 유휴 구독 연결을 스스로
   닫는 일이 없는지(A의 FIN이 EOF 때문임을 분리).

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

## 4. Probe B — 기동 직후·프롬프트 전 status (Boot)

**질문:** `agent.start` → `interactive_ready` 뒤, 프롬프트를 보내기 전에 herdr가 해당 pane에 `working`(또는 `idle`·`done`) push를
내는가? (C9: ACK 전 기동 쌍으로 가짜 완료, F12·F14 잔여창)

**왜 CLI가 문제인가:** 실제 운영의 기동 status는 herdr의 **에이전트 감지기**(프로세스·화면 manifest)와 CLI 쪽 통합 훅이
만든다. `report_agent`로 만든 전이는 이 질문에 답하지 못한다. 그래서 B1은 herdr 자체 기동 기계만 보고, 결정은 B2다.

### 4.1 B1 — 가짜 agent 바이너리 · **no real CLI (예비, 결정력 제한)**

1. `T/fakebin/claude`(및 `codex`, `grok`) = 실행 파일: 배너 한 줄을 찍고 `read` 루프로 stdin을 기다리는 쉘 스크립트
   (네트워크·자격 증명 없음). pane env에 `PATH=T/fakebin:<최소 PATH>`.
2. Step 0 확인: `agent.start{name:"hsprobe-b1-claude", kind:"claude", pane_id:P}`가 가짜 바이너리를 실제로 띄우는가
   (`pane.process_info`의 foreground cmdline이 `T/fakebin/claude`). **herdr가 `kind`를 PATH로 해석하는지는 미실측** —
   다른 경로를 쓰거나 거절하면 B1은 `NOT_APPLICABLE`로 기록하고 B2로만 답한다.
3. **구독을 agent.start보다 먼저:** P는 `tab.create` 직후 존재하므로 `S = subscribe([{pane.agent_status_changed, P},
   {pane.agent_detected?}, {pane.closed}, {pane.exited}])`를 start 전에 연다(감지 이벤트 타입명은 schema
   `pane_agent_detected` — 구독 type 문자열은 fixture에서 확정 후 사용).
4. `agent.start` → `agent.get` 25 ms 폴링으로 `launch_pending`/`interactive_ready` 전이 시각 기록 → 그 뒤 **30 s 무프롬프트
   관찰**, 동시에 `agent.get`의 `agent_status`를 500 ms마다 기록(레벨 값).
5. 대조군: 마지막에 `report_agent(P, working)` 1회 → S가 받는지(구독 성립 증명).

| 결과 | 의미 |
|---|---|
| 가짜에서도 `working` push | herdr 기계 자체가 기동 전이를 낸다(CLI 무관) → **`MaxBoot ≥ 1` 확정**(B2 불요) |
| `unknown`/`idle`만, 또는 0건 | CLI 의존 질문으로 남음 → B2 필요. B1은 "herdr 고유 기동 전이 없음"만 증명 |
| 감지 이벤트에 `final_status` 등 | 기록만(`HERDR-0.7.5-COMPAT` §4: 완료 권한으로 쓰지 않음) |

### 4.2 B2 — 실 CLI 기동만 · **needs real CLI (owner yes)**

**프롬프트를 보내지 않는다** — 토큰 소비는 CLI 자체 기동분만. 그래도 실 CLI 기동이므로 오너 승인 필수.

1. 대상 kind: 운영 기본 3종 `claude`·`codex`·`grok` 각각 별도 실행(`--kind`). kind당 **3회**.
2. pane 생성·구독·start·폴링은 B1 3–4단계와 같다. 관찰 창은 `interactive_ready` 뒤 **60 s**(MCP 기동·업데이트 확인 등 늦은
   기동 작업 포함).
3. 기동 화면 보존: 관찰 끝에 `agent.read{source:"detection"}`와 `agent.explain{target}` 결과를 로그에 저장 — 어느 감지 규칙이
   status를 만들었는지 사후 분석용. **화면 원문에 비밀이 섞일 수 있으니** 로그는 `T/` 밖으로 옮기지 않고, 관측 문서에는 요약만.
4. 대조군: B1 5단계와 같음.

| 결과 | TLA 상수 |
|---|---|
| `interactive_ready` **전** `working` push (구독이 start 전부터 열려 있었으므로 관측 가능) | `MaxBoot ≥ 1`, 실제 브리지에선 이 push가 **SrvReg 뒤·ACK 전**에 올 수 있음 → C9 경로 실재 |
| `interactive_ready` **뒤** · 관찰 창 안 `working` push | `MaxBoot ≥ 1`, C10·F12(ACK~도착 창)·F14 경로 실재 |
| `working` 없이 `idle`/`done`만 | `working→idle` 쌍은 없음 — 현재 게이트(`idle ∧ sawWorking`)엔 무해. **단 `done`은 `sawWorking` 없이 완료 계열**(`bridge-runtime.ts:3165`) → D의 판정과 합쳐 위험 판단 |
| 3회 × 3 kind 모두 0건 | `MaxBoot = 0` **지지**(증명 아님 — 관찰 창·kind·버전 한정) |

반복 간 불일치(예: 3회 중 1회만 `working`)는 그대로 `MaxBoot ≥ 1`로 본다(존재 증명은 1회로 충분).

### 4.3 정리

§2.3 + 실 CLI pid 확인(4단계). CLI가 남긴 세션 파일은 CLI 기본 위치(실 HOME)에 남을 수 있다 — §4.4.

### 4.4 B2·D2의 HOME 충돌 (오너 결정 필요)

실 CLI는 **실 HOME의 자격 증명·설정**이 있어야 뜬다. temp HOME으로 띄우면 로그인되지 않은 화면에서 멈춰 운영 기동과 다른
status를 낸다. 반대로 실 HOME이면 Must-not("probe without temp HOME")과 충돌한다. 선택지:

1. 프로브 프로세스와 herdr 서버는 temp HOME, **CLI pane env만 실 HOME**(가장 운영에 가깝다 — herdr 통합 훅은 여전히 temp
   서버에 없다는 차이가 남음).
2. 전부 temp HOME + 해당 CLI의 API 키 env만 주입(통합·설정 차이 큼).
3. shared 서버 + 실 HOME(운영과 동일, 격리 없음).

**권고 = 1**, 단 오너 yes와 함께 선택을 명시받는다. 결과 문서엔 어느 선택으로 돌았는지 반드시 적는다.

## 5. Probe C — 새 구독자 status replay (protocol 17) · **no real CLI**

**질문:** herdr 0.7.5/protocol 17이 새 `events.subscribe` 연결에 이 pane의 과거 status를 재전달하는가? 0.7.4/16은 아니었다(OBS §D.7).
모델의 `Replay`는 "서버 등록 시 이 pane의 status backlog를 먼저 보냄"이다.

**단계 (0.7.4 시나리오 D의 이식 + 공백 변형):**

1. 스크래치 쉘 pane `P`. `S1 = subscribe([{status, P}, {pane.closed}, {pane.exited}])`.
2. **게이트:** `report_agent` `working, idle, working, idle`(1.2 s 간격) → S1이 라이브 push ≥ 1 받아야 진행(못 받으면 `UNDETERMINED`).
3. `S1.destroy()` → 1 s 대기 → `S2 = subscribe(같은 목록)` → **20 s 관찰**: P의 status push 개수·순서·내용.
4. **liveness:** `report_agent(P, working)` → S2가 받는지(못 받으면 3단계 0건은 `UNDETERMINED`).
5. **공백 변형 C-gap (C5·C11 그 자체):** `S2.destroy()` → 구독자 0인 상태에서 `report_agent(P, idle)` → 1 s 뒤
   `S3 = subscribe(같은 목록)` → 20 s 관찰. **공백에 난 `idle`이 S3에 오는가.**
6. **대조군:** 별도 스크래치 pane `Q`를 만들고 `pane.close` → 그 뒤 연 S4(terminal 전용)가 `Q`의 `pane_closed`를 받는지
   (terminal replay 대조군 — 0.7.4에선 받음).
7. 모든 단계마다 `pane.list`/`agent.get`의 `agent_status`(레벨 값)도 기록.

| 결과 | 관측 | TLA 상수 |
|---|---|---|
| C-1 **replay 없음** | 3·5단계 status 0건 · 4단계 liveness 통과 · 6단계 대조군 replay 있음 | **`Replay = FALSE`** (0.7.4와 같음) → C5·C8 정체 결론 유효 |
| C-2 **backlog replay** | 3단계에 2단계 전이 다수가 순서대로 재도착 · 5단계 `idle` 재도착 | **`Replay = TRUE`** (모델과 같은 의미) → C11·C12·F15 영역. 단 replay/live 구분 불가(봉투에 seq·시각 없음)이므로 기존 카드에 오래된 전이가 재생되는 F16류 위험을 별도 기록 |
| C-3 **현재값 1건만 재전달** | 3·5단계에 최신 상태 1건만 | 모델에 없는 의미("스냅샷 replay"). C5 해소 관점에선 `Replay = TRUE`와 같다(잃은 `idle`이 레벨로 돌아옴). Boot·F16 관점은 다름 — **TLA에 새 상수 필요**로 보고 |
| C-4 **구독 시 응답 지연** | ACK 전후에 replay 위치가 다름 | ACK 앞/뒤 위치를 기록 — 모델 `SrvReg`(ACK 전 backlog) 전제 확인/반박 |
| UNDETERMINED | 게이트·liveness 실패 | 판정 없음 |

반복 **2회**(0.7.4 관측과 같은 수). 주의: `report_agent` 원천과 감지기 원천 status가 같은 replay 규칙을 따른다는 보장은 없다 —
결과 문서에 "report_agent 원천 한정"을 적는다. 실 CLI 원천 확인이 필요하면 B2 실행 때 같은 pane에 S2를 다시 열어 부수 관찰
(추가 승인 불요 — 같은 실행 안).

정리: §2.3. 죽은 pane에 대한 status 구독은 ACK가 안 오므로(§D.8-1) **P가 살아 있을 때만** 재구독한다; 모든 subscribe에 15 s ACK 타임아웃.

## 6. Probe D — `done` status의 출현 조건

**질문:** herdr는 언제 `agent_status: "done"`을 내는가? TLA 모델은 "`done`은 프롬프트 이후에만 온다"를 전제로 모든
`NoEarly`/`NoFalse` 판정을 냈고(§2.2 범위 제외), 현재 브리지는 `done`을 `sawWorking` 없이 완료로 받는다(:3165).

**가설(미검증):** H-D1 `done` = "끝났으나 사용자가 아직 안 본" 주의(attention) 상태 — 비포커스 pane의 `working→idle`에서
도출되고 포커스 시 `idle`로 바뀐다. H-D2 `done` = 프로세스 종료·`release` 시 최종 상태(`final_status`). H-D3 특정 CLI 감지
규칙만 낸다. 프로브는 셋을 가른다.

### 6.1 D1 — `report_agent` 전이 · **no real CLI**

1. 스크래치 쉘 pane `P`(`focus:false` tab). `S = subscribe([{status, P}, {pane.closed}, {pane.exited}])`.
2. `report_agent(P, working)` → 1 s → `report_agent(P, idle)` → 5 s 관찰: push가 `idle`인가 `done`인가. `agent.get`·`pane.list`
   레벨 값도 기록(push와 레벨이 다를 수 있음).
3. 2단계를 `working` 지속 시간 0.2 s / 5 s / 30 s로 반복(지속 시간 문턱이 있는지).
4. **(private 서버만)** `pane.focus{P}`(또는 `tab.focus`) → `done`이었다면 `idle`로 바뀌는 push가 오는가. 이어 포커스를 다른 pane에
   둔 채 2단계 재실행. shared 모드에선 **이 단계 생략**(사용자 포커스 탈취 금지).
5. `pane.release_agent{P}` → 감지/해제 이벤트에 `final_status`가 실리는지, 그 값.
6. `pane.close{P}` → close 직전·직후 status push(`done` 여부).

### 6.2 D2 — 실 CLI 1회 프롬프트 · **needs real CLI (owner yes)**

토큰을 쓰는 유일한 프로브다. kind당 **1회**, 프롬프트는 고정 짧은 문장(예: "Reply with the single word OK.").

1. B2 1–3단계로 기동(구독은 start 전). `interactive_ready` 뒤 10 s 기동 관찰(B2 데이터로 합산 가능).
2. `t_prompt` 기록 → `agent.prompt{target:name, text}` → 응답·반환 시각, `agent_prompt_stalled` 여부 기록.
3. 관찰 120 s: 첫 `working` 시각(**프롬프트→working 지연** = `LatencyBound` 근거), `working→idle|done` 시각·값.
4. 포커스는 건드리지 않는다(브리지 pane과 같은 `focus:false`). private 서버에서만 추가로 4단계 포커스 실험을 해도 된다.
5. `agent.read{source:"detection"}`·`agent.explain` 저장(B2와 같은 비밀 주의).

### 6.3 판정과 TLA 영향

| 결과 | 관측 | done-scope / TLA |
|---|---|---|
| D-1 **attention 파생** | D1에서 `working→idle`이 `done`으로 push · 포커스 시 `idle` | `done`은 **작업 종료 후에만** 생긴다 → 모델 전제("프롬프트 이후") 유지. 단 **기동 쌍(B)이 있으면 그 쌍도 `done`으로 올 수 있다** → B 결과와 합쳐 C9를 `sawWorking` 없이도 여는 경로로 기록. F3′에 `done` 포함 필수(TLA §5) |
| D-2 **종료/해제 시에만** | D1 2–3단계는 `idle` · 5·6단계에서만 `done`/`final_status: done` | 실행 중 카드엔 `done`이 안 온다 → 현재 :3165의 `done` 분기는 종료 신호로만 작동. 모델 범위 제외 무해 |
| D-3 **CLI 감지 전용** | D1 전부 `idle` · D2에서만 `done` | 전제는 D2의 시각으로 판정: `done`이 `t_prompt` 뒤 `working` 뒤에만 → 전제 유지(해당 kind 한정). B2에서 기동 중 `done` 관측 → **전제 깨짐**: `done`이 `sawWorking` 없이 가짜 완료를 만든다(C9보다 넓음) → TLA에 `BootDone` 상수 추가 필요 |
| D-4 **`done` 미관측** | D1·D2 모두 `done` 0건 | 이 버전·이 kind에선 `done` 경로 비활성. 전제 유지, 단 "관측 없음 ≠ 계약" 표기 |

부산물(판정 아님): D2 3단계 지연이 4 s를 넘는 kind가 있으면 `LatencyBound`가 운영에서 깨진다는 증거 → TLA §4-1(C4·F2) 위험이 실재.

정리: §2.3 + B2와 같은 실 CLI 정리. 프롬프트로 생긴 CLI 세션 파일 위치를 기록.

## 7. 실행 순서·결과 기록

1. Step 0 (private 서버 기동·`ping` 확인) → A → C → D1 → B1 (전부 no real CLI, 오너 승인 없이 아키텍트가 실행 결정 가능).
2. B2·D2는 **오너 yes 후** — 승인 문구에 kind 목록과 §4.4 HOME 선택을 함께 받는다. B2 다음 D2(같은 실행에서 B2 관찰분을 D2 1단계로 재사용 가능).
3. 결과는 새 관측 문서 `docs/spikes/HERDR-STATUS-OBSERVATIONS.md`에(이 설계 문서는 수정하지 않음): herdr `ping` 버전·프로토콜,
   서버 모드, 반복별 원 push 인용, 위 표의 결과 코드(A-1…D-4), 그리고 아래 매핑으로 TLA 상수를 갱신할 근거.

| 프로브 결과 | `BRIDGE-STARTUP-TLA.md`에 반영할 것 |
|---|---|
| A-1 | `Drain = TRUE` 전제 확인 — §5 F1′ "전제(Unknown)" 해소 |
| A-2/A-3/A-4 | `Drain = FALSE`가 현실 — F3·F4 판정이 운영 기준. F1′는 상한 타이머 + 파괴로 설계 |
| A-5 | F1′ 재설계(모델 전제 붕괴) |
| B 존재 | `MaxBoot ≥ 1` 현실 — C9·C10·F12·F14 실재 위험 |
| B 부재 | `MaxBoot = 0` 지지(한정) — 해당 반례는 이론상 위험으로 강등 |
| C-1 / C-2 / C-3 | `Replay = FALSE` / `TRUE` / 새 상수(스냅샷 replay) — §2.3 표의 "protocol 17 미확인" 해소 |
| D-1…D-4 | §2.2 `done` 범위 제외 전제의 유지·파기, 필요 시 `BootDone` 모델 추가 |

## 8. 이 설계의 미확인 전제 (Step 0에서 먼저 깨질 수 있는 것)

- headless `herdr server`가 temp HOME·`HERDR_SOCKET_PATH`로 격리 기동되는가(§2.2).
- `agent.start`가 kind를 PATH의 가짜 바이너리로 해석하는가(§4.1) — 아니면 B1 `NOT_APPLICABLE`.
- protocol 17에서 `pane.report_agent`가 0.7.4처럼 push를 만드는가 — A·C·D1 전부의 바탕. Step 0에 `report_agent` 1회 → push 확인을 넣고, 실패하면 A·C·D1 모두 `UNDETERMINED`.
- 감지 이벤트 구독 type 문자열(`pane.agent_detected`?) — fixture `schema.json` subscription 정의에서 확정 후 사용.
