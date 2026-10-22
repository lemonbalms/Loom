# herdr 0.9.5 (protocol 22) compatibility study

| Field | Value |
|---|---|
| **Date** | 2026-10-23 |
| **Basis** | 스키마 대조만 — `docs/spikes/fixtures/herdr-v0.7.5/schema.json`(protocol 17) vs `docs/spikes/fixtures/herdr-v0.9.5/schema.json`(protocol 22, `herdr api schema --json`). **herdr 호출·라이브 프로브 없음.** 릴리스 노트 미대조 |
| **Local herdr** | `0.9.5` · `ping` → protocol **22** · capabilities `live_handoff`, `detached_server_daemon`, `endpoint_protocol_generation: 1`, `surface_interest`, `health_check`, `ssh_agent_registration` (아키텍트 확인) |
| **Loom adapter** | `HERDR_PROTOCOL_EXPECTED = 17` (`packages/host/src/herdr-client.ts:26`) · 로컬 브리지 설정 `mac.json` `herdrProtocol: 16`, `mac-node.json` `17` |
| **Verdict** | **implemented · smoke pending** (Loom v0.45.3 P1–P4, 2026-10-23 — 지원 집합 `HERDR_PROTOCOLS_SUPPORTED = [17, 22]` · 고정 없음 = 집합 · 고정 = 정확 비교 · 계약 테스트 `herdr-protocol22-contract.test.ts` · 읽기 전용 라이브 `dogfood-herdr-check.sh` → `ok (0.9.5 / protocol 22)`. 실 카드 스모크(PLAN 0.45.3 D5 · R12 · §6 기록 예정)는 오너 yes 대기 — PASS 뒤 shipped). 종전 study verdict: 스키마상 Loom이 쓰는 와이어 표면은 **사실상 불변**(아래 §1). 현재 차단 원인은 브리지의 protocol 동등 비교 하나(`bridge-runtime.ts:1039-1041`) |

**권한:** 이 파일은 0.9.5 호환 판단의 스키마 근거다. PLAN·PANE-DEATH 잠금이나 `HERDR-0.7.5-COMPAT.md`(0.7.5 shipped 기록)는 수정하지 않는다.

좌표 표기: `17:L` = 0.7.5 fixture 줄 번호, `22:L` = 0.9.5 fixture 줄 번호. JSON 포인터는 두 스키마 공통 구조
(`/schemas/{request|success_response|event|subscription_event}/$defs/<Name>` 또는 `…/oneOf[method=<m>]`)를 쓴다.
"불변" = 해당 정의를 두 파일에서 직접 읽고 필드·required·타입이 같음을 확인했다는 뜻이다.

---

## 0. 요약

- 두 스키마 모두 `schema_version: 1`. 요청 봉투는 `{id, method, params}`, 요청 쪽에 protocol 필드가 없다(`/schemas/request`
  `required:["id"]`, 17:5743-5753 · 22:6317-6327). 따라서 **서버가 요청을 protocol로 거절할 근거는 스키마에 없다** — 차단은
  Loom 자체 ping 비교뿐이다.
- Loom이 호출하는 15개 메서드(§1.1) 모두 0.9.5에 있고 같은 params 정의를 가리킨다. params 정의 차이는 **`PaneSplitParams`에
  선택 필드 `right_click`(기본 `"herdr"`) 추가 1건**뿐이다.
- Loom이 읽는 응답 결과 종류(`pong`·`agent_started`·`agent_info`·`tab_created`·`pane_info`·`pane_list`·`pane_layout`·
  `pane_resize`·`pane_read`·`subscription_started`·`ok`)는 모양이 같다. 추가는 전부 선택 필드다: `ServerCapabilities` +4,
  `AgentInfo.completion_seq`, `PaneInfo.restore_error`.
- 이벤트: `pane_closed`·`pane_exited`·`pane_agent_status_changed`·`pane_agent_detected` 페이로드와 `subscription_event`
  봉투가 **같다**. 추가된 것은 `workspace_reordered`/`workspace.reordered` 하나다.
- **브레이킹(스키마 기준): protocol 숫자뿐.** 최소 PATCH = 기대 protocol을 22로 받아들이고 테스트·dogfood 게이트를 맞추는
  것(§2.3). 스키마가 말하지 못하는 전송·타이밍 동작(§2.2)은 라이브 스모크로만 닫힌다.
- TLA (e): status **이벤트**에는 여전히 seq·revision·시각이 없다 → 이벤트만으로 `qdirty`를 대체할 수 없다. 다만 `agent.get`
  응답 `AgentInfo`에 단조 후보 `state_change_seq`(0.7.5에도 있었음)·`revision`이 있고 0.9.5는 `completion_seq`를 더했다 —
  "이벤트 = 깨우기, `agent.get` = 상태" 설계라면 `qdirty`를 대체할 여지가 있다(§3, 라이브 확인 필요).

---

## 1. 메서드·이벤트 대조표

### 1.1 요청 (Loom이 보내는 것)

호출처: `herdr-client.ts`(아래 줄 번호) + `bridge-runtime.ts:2276`(`pane.close` 직접 `request`).

| Method | Loom 호출처 | Loom이 보내는 params | params 정의 · 17 / 22 | 판정 |
|---|---|---|---|---|
| `ping` | `:363-370` | `{}` | `PingParams` · 17:4321-4325 / 22:4687-4691 | 불변 |
| `agent.start` | `:380-409` | `name`, `kind`, `pane_id`, `args?`, `timeout_ms?` | `/request/$defs/AgentStartParams` · 17:1302-1335 / 22:1341-1374 — required `name,kind,pane_id`, `timeout_ms` 설명 동일 | 불변 |
| `agent.get` | `:427` (launch readiness 폴링) | `target` | `AgentTarget` · 17:1346-1356 / 22:1385-1395 | 불변 |
| `agent.prompt` | `:532-557`, `injectPromptAndSubmit :668` | `target`, `text`, `wait?{until?, timeout_ms?}` | `AgentPromptParams` + `AgentPromptWaitOptions` · 17:1192-1235 / 22:1231-1274 | 불변 |
| `agent.send_keys` | `:564-569` | `target`, `keys[]` | `AgentSendKeysParams` · 17:1284-1301 / 22:1323-1340 | 불변 |
| `agent.wait` | `:575-586` (브리지 미사용) | `target`, `until?`, `timeout_ms?` | `AgentWaitParams` · 17:1634-1658 / 22:1673-1697 | 불변 |
| `tab.create` | `:458-488` | `focus:false`, `workspace_id?`, `label?`, `cwd?`, `env?` | `TabCreateParams` · 17:3960-3992 / 22:4273-4305 | 불변 |
| `pane.split` | `:495-525` | `direction`, `target_pane_id?`, `workspace_id?`, `ratio?`, `cwd?`, `env?`, `focus?` | `PaneSplitParams` · 17:2991-3036 / 22:3215-3264 | **new-optional** `right_click` (`$ref PaneRightClickTarget` = `herdr`\|`pane`, default `"herdr"`, 22:3243-3246, enum 22:3111-3117). Loom은 안 보냄 → 기본값 |
| `pane.list` | `:592-614` | `{}` | `PaneListParams` · 17:2515-2525 / 22:2668-2678 | 불변 |
| `pane.layout` | `:621-634` | `pane_id?` | `PaneLayoutParams` · 17:2504-2514 / 22:2616-2626 | 불변 |
| `pane.resize` | `:641-661` | `pane_id`, `direction`, `amount` | `PaneResizeParams` · 17:2914-2937 / 22:3087-3110 | 불변 |
| `pane.read` | `:890-898` | `pane_id`, `source:"recent"`, `format:"text"`, `lines` | `PaneReadParams` · 17:2658-2688 / 22:2811-2841; `ReadSource` 17:3561-3569 / 22:3839-3847, `ReadFormat` 17:3554-3560 / 22:3832-3838 | 불변 |
| `pane.close` | `bridge-runtime.ts:2276` | `pane_id` | `PaneTarget` · 17:3070-3080 / 22:3298-3308 (method 바인딩 17:5457-5461 / 22:6015-6019) | 불변 |
| `events.subscribe` | `:683-703`, `:799-806` | `subscriptions[]` | `EventsSubscribeParams` · 17:2029-2042 / 22:2121-2134 | 불변 (구독 type은 §1.3) |
| `session.snapshot` | `:900-902` | `{}` | `EmptyParams` · 17:4465-4469 / 22:4911-4915 | 불변 |

method → params 바인딩(`/schemas/request/oneOf[*]/properties/params/$ref`)은 위 15개 모두 두 스키마에서 같은 `$def`를
가리킨다(17:4321–5509 / 22:4687–6067 구간의 `const` 다음 4줄).

**에러 코드:** `/schemas/error_response/$defs/ErrorBody`는 두 버전 모두 `{code: string, message: string}` 자유 문자열이다
(enum 없음, 17·22 :8-23). 브리지가 이름으로 의존하는 `agent_prompt_stalled`(`bridge-runtime.ts:544`)와 0.7.5 노트의
`protocol_mismatch`·`agent_not_running`은 **어느 스키마에도 없다** — 0.9.5에서 같은 코드가 나오는지는 스키마로 판단 불가
(**needs live probe**).

### 1.2 응답 (Loom이 읽는 것)

결과 종류는 `/schemas/success_response/$defs/ResponseResult/oneOf[type=<kind>]`. 스키마는 method→result 종류 매핑을
명시하지 않는다(종류 목록만 있음).

| Loom 읽기 | result kind · 17 / 22 | Loom이 읽는 필드 | 판정 |
|---|---|---|---|
| `ping` | `pong` · 17:8465 / 22:9170-9202 | `version`, `protocol`, `capabilities` | 봉투 불변. `ServerCapabilities`(17:9541-9555 / 22:10421-10459)에 **new-optional** `endpoint_protocol_generation`(uint32\|null), `health_check`, `ssh_agent_registration`, `surface_interest`(bool, default false). required는 `live_handoff`만 그대로. Loom은 `capabilities`를 그대로 넘길 뿐 해석 안 함 |
| `agent.start` | `agent_started` · 17:8744 / 22:9456-9478 — required `type,agent,argv` | `agent.pane_id`, `terminal_id`, `name`, `launch_pending`, `interactive_ready` | 불변. `AgentInfo`에 **new-optional** `completion_seq` (§1.4) |
| `agent.get` | `agent_info` · 17:8722 / 22:9440-9455 | 위와 같음 | 같음 |
| `agent.prompt` | `agent_prompted` · 17:8761 / 22:9479-9494 | (결과 무시) | 불변 |
| `tab.create` | `tab_created` · 17:8686 / 22:9401-9420 — `tab`, `root_pane`(`PaneInfo`) | `tab.tab_id`, `root_pane.pane_id` | 불변 (`PaneInfo` +`restore_error` 선택) |
| `pane.split` | `pane_info` · 17:8824 / 22:9542-9557 | `pane.pane_id` | 불변 |
| `pane.list` | `pane_list` · 17:8843 / 22:9558-9576 | `panes[].pane_id`, `tab_id`, `workspace_id` | 불변 |
| `pane.layout` | `pane_layout` · 17:8923 / 22:9641-9656 → `PaneLayoutSnapshot` 22:8049-8089 | `layout.panes[].pane_id`, `rect{x,y,width,height}`, `splits[].{ratio,direction,rect}` | 불변 (`PaneLayoutPane`/`Rect`/`Split` 22:7995-8113) |
| `pane.resize` | `pane_resize` · 17:9051 / 22:9769-9784 → `PaneResizeResult` 22:8392-8424 | `resize.layout` | 불변 |
| `pane.read` | `pane_read` · 17:9067 / 22:9785-9800 → `PaneReadResult` 17:7656-7696 / 22:8345-8385 | `read.text` | 불변 |
| `events.subscribe` ACK | `subscription_started` · 17:9118 / 22:9912-9923 | `id` 일치만 | 불변 |
| `pane.close` 등 | `ok` · 17:9530 / 22:10407-10418 | — | 불변 |

`AgentInfo` 17:5969-6094 / 22:6543-6677, `PaneInfo`(응답) 17:7214-7334 / 22:7868-7994. `SessionSnapshot`
22:10460-10529는 줄 수·필드 동일.

### 1.3 이벤트·구독

**구독 type** (`/schemas/request/$defs/Subscription/oneOf`, 17:3602-3959 / 22:3903-4272):

| Loom 구독 | 호출처 | 17 / 22 | 판정 |
|---|---|---|---|
| `{type:"pane.closed"}` (전역) | `bridge-runtime.ts:1056` | 17:3796-3807 / 22:4109-4120 — `type`만, pane 필터 없음 | 불변 |
| `{type:"pane.agent_status_changed", pane_id}` | `bridge-runtime.ts:2030`, `:2328` | 17:3904-3929 / 22:4217-4242 — required `type,pane_id`, 선택 `agent_status`(AgentStatus\|null) | 불변 |
| (참고) `pane.exited`, `pane.agent_detected` | 미구독 | 17:3844-3867 / 22:4157-4180 — `type`만(전역) | 불변 |
| 추가 | — | `workspace.reordered` 22:3965-3976 | new (Loom 무관) |

**push 봉투:** 두 계열이 있다 — `/schemas/event`(`EventEnvelope`, `event` = underscore `EventKind`, 17:1176-1189 /
22:1213-1227)와 `/schemas/subscription_event`(`SubscriptionEventEnvelope`, `event` = dotted 3종, 17:5754-5966 /
22:6328-6540). 둘 다 `{event, data}`만 required, **seq·id·timestamp 없음**. `subscription_event` 블록은 두 파일에서 내용이
같다(`PaneAgentStatusChangedEvent` 17:5766-5808 / 22:6340-6382 — `pane_id`, `workspace_id`, `agent_status` required;
`agent`, `display_agent`, `title`, `state_labels` 선택). 브리지 정규화(`bridge-runtime.ts:2759` dotted→underscore,
`:2761` `pane_id` 또는 `pane.pane_id`, `:3125` `agent_status ?? state`)는 그대로 맞는다.

**이벤트 데이터** (`/schemas/event/$defs/EventData/oneOf[type=…]`):

| Event | 17 / 22 | 필드 | 판정 |
|---|---|---|---|
| `pane_closed` | 17:430-449 / 22:462-481 | `type`, `pane_id`, `workspace_id` | 불변 |
| `pane_exited` | 17:572-591 / 22:604-623 | 같음 | 불변 |
| `pane_agent_detected` | 17:592-630 / 22:624-662 | `agent?`, `final_status?`, `released?` | 불변 |
| `pane_agent_status_changed` | 17:631-678 / 22:663-710 | `agent_status` required, 나머지 선택 | 불변 |
| `workspace_reordered` | — / 22:207-238 | `workspace_ids`, `workspaces`, `before_workspace_id?` | new (Loom 무관) |
| `EventKind` enum | 17:697-726 / 22:729-759 | +`workspace_reordered` | new 값 1개 |

`AgentStatus` enum은 두 버전 모두 `idle|working|blocked|done|unknown`(event 17·22:72-81, request 17:1336-1345 /
22:1375-1384, subscription_event 17:5756-5765 / 22:6330-6339). `HerdrAgentStatus`(`herdr-client.ts:33`)와 일치.

### 1.4 0.9.5 추가 필드 중 Loom이 받을 수 있는 것

| 위치 | 필드 | 정의 | Loom 영향 |
|---|---|---|---|
| `AgentInfo` 22:6564-6572 | `completion_seq` | uint64\|null, 설명 "The current idle transition completed work, independently of who has viewed it." | 무시해도 무해. §3 (d)(e) 단서 |
| `PaneInfo`(응답) 22:7919-7924 | `restore_error` | string\|null | 무시 |
| `ServerCapabilities` 22:10427-10453 | 4개 | 위 §1.2 | 무시 |
| `PaneReportAgentParams` 22:2912-2921 | `resume_argv` (요청, 선택) | Loom 미사용 | 프로브만 관련(§4) |

### 1.5 메서드 목록 차이 (Loom 미사용)

요청 `oneOf` 메서드 수: 17 = **89**(17:4321-5729), 22 = **102**(22:4687-6303).

- **removed (3):** `pane.graphics.set`, `pane.graphics.clear`, `pane.graphics.info` (+ 결과 `pane_graphics_info`).
- **new (16):** `server.ssh_agent.register`, `product_announcement.dismiss`, `release_notes.dismiss`, `command.invoke`,
  `client_shell.surface.set`, `workspace.move_block`, `pane.scroll`, `pane.clear`, `pane.edit_scrollback`,
  `pane.selection.read`, `pane.copy_motion`, `pane.copy_search`, `pane.input.set`, `pane.link.activate`,
  `pane.link.resolve`, `integration.list` (+ 결과 `pane_selection`, `pane_copy_motion`, `pane_copy_search`,
  `integration_list`, `pane_link_resolved`, `pane_link_activated`, `client_shell_surface_set`).
- **renamed:** 없음.

---

## 2. Loom 영향과 최소 PATCH 범위

### 2.1 스키마 기준 브레이킹

| 항목 | 판정 | 근거 |
|---|---|---|
| ping protocol 동등 비교 | **차단** — 브리지 기동 실패 | `bridge-runtime.ts:1039-1041`, 기대값 = `cfg.herdrProtocol ?? 17` |
| 메서드·params·결과·이벤트 | 브레이킹 없음 | §1 |
| `pane.split` `right_click` 기본 `"herdr"` | 동작 변화 가능성만(오른쪽 클릭 처리 주체) — Loom은 마우스 입력 없음 | 22:3243-3246 |
| 이벤트 봉투 | 불변 → 정규화·replay 한계(봉투에 seq 없음)도 그대로 | §1.3 |

**결론(스키마):** protocol 비교를 통과시키면 브리지가 "잘못 동작"할 스키마상 이유는 없다. 0.7.5 때와 달리(agent.start/
agent.send 교체) 어댑터 재배선이 필요 없다.

### 2.2 스키마가 말하지 못하는 것 — 라이브 스모크로만 닫힘

| # | 전제 | Loom 의존처 | 상태 |
|---|---|---|---|
| L1 | RPC = 연결당 1회 후 서버 FIN; `events.subscribe` 연결만 장수, 두 번째 요청 불가 | `herdr-client.ts:9-15`, `:302-361`, `:676-679` | needs live probe |
| L2 | `agent.start`가 `launch_pending` → `agent.get` 폴링으로 `interactive_ready` | `:401-450` | needs live probe (필드는 불변) |
| L3 | `agent.prompt`는 정확한 agent **이름** target만 신뢰(pane id target 오배달, COMPAT-0.7.5 §7) | `bridge-runtime.ts` inject 경로 | needs live probe |
| L4 | 에러 코드 `agent_prompt_stalled` 이름·발생 조건 | `bridge-runtime.ts:544` | needs live probe (§1.1 에러 코드) |
| L5 | push 이름 혼재(status dotted, terminal underscore — traps) | `:2759` 정규화가 양쪽 수용 | 정규화로 흡수됨 — 관측만 |
| L6 | terminal 이벤트 신규 구독자 재전달(traps) | `noteTerminalPaneObservation` | needs live probe |
| L7 | 죽은 pane의 status 구독은 ACK가 안 옴(OBS §D.8-1) | ACK 타임아웃 `:779-795` | needs live probe |
| L8 | `endpoint_protocol_generation`·`surface_interest`가 일반 API 클라이언트(클라이언트 셸 아님)에 요구사항을 더하지 않음 | 전체 | schema says 선택 capability·전용 메서드(`client_shell.surface.set`)뿐 → 영향 없음으로 보이나 needs live probe |
| L9 | `herdr status server --json` 출력에 `version`·`protocol` 필드 | `scripts/dogfood-herdr-check.sh:15-26` | CLI 출력 — 스키마 밖, needs live check |

### 2.3 최소 compat PATCH (권고 + 결정 필요점)

**권고 = 단일 값 22로 이동**(0.7.5 선례 §5-1 "오너 표준 = 현재 herdr", §5-2 "config만 올리는 우회 금지"와 같은 형태).
대안 "허용 집합 {17, 22}"는 스키마상 같은 와이어라 기술적으로 가능하지만, 로컬에 0.7.5가 더는 없어 17 쪽을 라이브로
증명할 수단이 없다 — 증명 못 하는 지원을 선언하게 된다. **선택은 아키텍트/오너 몫.**

| 표면 | 변경 |
|---|---|
| `packages/host/src/herdr-client.ts:26` | `HERDR_PROTOCOL_EXPECTED` 17 → 22; 헤더 주석(:2, :9, :17) wire truth를 0.9.5 fixture로 |
| `packages/host/src/bridge-config.ts:31,156,671` | 기본값은 상수를 따름. 주석 "(17)" 갱신 |
| `scripts/dogfood-herdr-check.sh:6-7,37-38` | `REQUIRED_VERSION="0.9.5"`, `REQUIRED_PROTOCOL="22"`, 안내 문구 |
| `scripts/dogfood-bridge-up.sh:35-54` | 이미 상수 동기화 — 코드 변경 불요, `mac-node.json` 17 → 22 자동 이전 확인 |
| 로컬 `~/.loom/bridge/mac.json` (`herdrProtocol: 16`) | 이전 로직 대상이 `mac-node`뿐이면 **이 설정은 상수와 무관하게 계속 실패**한다 — 별도 처리(필드 삭제 또는 22) 필요. 오너 로컬 파일이라 PATCH 범위 밖, 보고 대상 |
| `packages/host/src/fake-herdr.ts:615-617` | 기본 `version` "0.9.5", `protocol` 22 (+ 선택 capability는 생략 가능) |
| 테스트의 `herdrProtocol: 17` 리터럴(약 30곳, `rg herdrProtocol packages/host/src`) | 상수 참조로 바꾸거나 22로. `scripts/dogfood-profiles.test.ts:86,128` 정규식(`1[67]`)도 갱신 |
| `packages/host/src/herdr-protocol17-contract.test.ts:17,68,179` | 0.7.5 fixture 계약은 역사 기록으로 두고, 0.9.5 fixture 계약 테스트 추가(protocol 22, Loom이 쓰는 15 메서드의 params `$ref`·required 고정) |
| fixture | `docs/spikes/fixtures/herdr-v0.9.5/`는 현재 `schema.json`만 있다(미추적). 0.7.5처럼 `version.txt`·`methods.json`·`agent-help.txt`·`status.txt`를 함께 캡처하면 프로브 문서 인용이 가능해진다 |
| 문서 | `HERDR-0.7.5-COMPAT.md`는 불변(역사). 이 파일 verdict를 shipped로 갱신 |
| **Done when** | L1–L4·L6–L9 라이브 스모크(실 CLI 포함 → **오너 yes 필요**, HANDOFF Must-not) + `bun test` green |

**PATCH 밖:** 이벤트 seq 활용, `completion_seq` 활용, `agent.wait` 도입 — 전부 TLA 설계 결정(§3)이며 호환 PATCH와 섞지 않는다.

---

## 3. TLA+ 가정(`BRIDGE-STARTUP-TLA.md` §0.1-5)에 대해 0.9.5 스키마가 말하는 것

| TLA 항목 | schema says | needs live probe |
|---|---|---|
| **(e) status 이벤트의 seq/revision/시각** | **없다.** `PaneAgentStatusChangedEvent` 22:6340-6382, `EventData[pane_agent_status_changed]` 22:663-710, 봉투 22:1213-1227 / 22:6526-6539 — 0.7.5와 동일. 반면 **`agent.get` 응답 `AgentInfo`에는 단조 후보가 있다:** `revision`(required, 22:6609-6613), `state_change_seq`(default 0, 22:6617-6622 — **0.7.5에도 있었다**, 17:6034-6039; TLA §1.2는 `PaneInfo.revision`만 인용), 신규 `completion_seq`(22:6564-6572). `PaneInfo`(응답)에는 `revision`만 | 세 값이 전이마다 어떻게 증가하는지(상태 변화마다 `state_change_seq` +1? `completion_seq`는 working→idle 때만? status 갱신과 원자적?) |
| └ `qdirty` 대체 가능성 | 이벤트와 스냅샷의 선후는 여전히 herdr 정보로 비교 불가 → **이벤트 status를 상태로 쓰는 한 `qdirty`는 남는다.** 단 설계를 "이벤트 = 깨우기 신호, 상태 판정 = `agent.get` 스냅샷"으로 바꾸면 스냅샷끼리는 `state_change_seq`(또는 `completion_seq`)로 순서를 매길 수 있다 — 연결별 RPC 응답 역전(TLA §1.2)도 seq 비교로 버릴 수 있음. 이 변형은 TLA에서 **미검사** | 위 증가 규칙이 확인돼야 모델링 가능 |
| **(c) replay/backlog** | 스키마에 replay·backlog·cursor·since 파라미터가 **없다**(`EventsSubscribeParams` 22:2121-2134는 `subscriptions`만; 구독 정의에도 없음). `surface_interest`는 **클라이언트 셸의 pane 표시 lease**다 — `client_shell.surface.set{active}` → `client_shell_surface_set{active, projection_revision}`(22:1698-1709, 22:10384-10405, capability 설명 22:10449-10452). events.subscribe와 연결되는 스키마 근거 없음 | 0.9.5 replay 여부(Probe C). surface_interest가 일반 구독에 부작용이 없는지(L8) |
| **(a) 구독 종료 의미(drain)** | `events.unsubscribe` 같은 메서드가 **두 버전 모두 없다** → 구독 종료 수단은 연결 종료뿐. 응답은 `subscription_started` ACK 하나(22:9912-9923). half-close 처리는 스키마 밖 | Probe A 전부 |
| **(b) 프롬프트 전 기동 status** | `launch_pending`/`interactive_ready` 불변(22:6594-6599). 기동 전이에 대한 언급 없음 | Probe B 전부 |
| **(d) `done` 상태명·시점** | 상태명 불변(§1.3). `PaneAgentState`(report용)는 여전히 `done` 불가(22:2431-2439) → herdr 도출값. **새 단서:** `completion_seq` 설명 "…completed work, independently of who has viewed it" — "완료"와 "봤는지"를 분리한다는 서술은 `done` = 미열람 주의 상태라는 H-D1(PROBES §6)과 **어울리는 정황**이지 증명이 아니다 | Probe D. `done` 전이와 `completion_seq` 증가의 상관 |
| **`agent.wait`으로 폴링 대체?** | params 불변 `{target, until?, timeout_ms?}`(22:1673-1697). **`since`/seq 파라미터가 없다** → "seq N 이후의 다음 전이"를 표현할 수 없다. 결과 종류 매핑은 스키마에 없음. 연결당 1 RPC라 대기 중엔 연결 하나를 점유. `events.wait{match_event, timeout_ms}` → `wait_matched{event: EventEnvelope}`(22:2135-2153, 22:9924-9939)도 봉투에 seq 없음 | level(현재 값이 이미 until이면 즉시 반환) vs edge(다음 전이까지 대기). level이면 프롬프트 전 `idle`에 즉시 반환 → 가짜 완료(C9류)라 단독 대체 불가; edge면 호출 전 전이 유실(C5류). 어느 쪽이든 **`agent.wait` 단독으로 연속 폴링(F2')을 대체한다는 근거는 스키마에 없다** — `state_change_seq` 확인과 결합해야 의미가 있음 |

TLA 문서 반영 후보(이 문서는 수정하지 않음): §1.2의 "단조 마커 없음"은 **이벤트 한정**으로 좁히고, `AgentInfo.state_change_seq`
(17·22)·`completion_seq`(22)를 근거로 "폴링 권위형 F2''" 변형을 검사 후보에 올릴지 판단.

---

## 4. `HERDR-STATUS-PROBES.md`가 0.9.5용으로 바꿔야 할 것 (목록만 — 그 문서는 편집하지 않음)

**버전 게이트·대상 표기**

1. §2.2 private 서버 `ping` 확인 `version 0.7.5 · protocol 17` → `0.9.5 · 22`.
2. §0 표 C행 "(protocol 17)", §5 제목 "(protocol 17)"·질문 "0.7.5/protocol 17", §5 단계 "시나리오 D(0.7.4)를 0.7.5에서 재실행",
   §7 표 "protocol 17 미확인", §8 "protocol 17에서 `pane.report_agent`…" → 전부 0.9.5 / 22.
3. §1 "protocol 17 기동" 소제목 → 기동 순서는 0.9.5에서도 같다(§1.1 표) — 표기만 갱신.

**스키마 좌표(0.7.5 → 0.9.5)**

4. §1 `PaneAgentState` `schema.json:2336-2344` → 22:2431-2439; `PaneReportAgentParams` `:2733-2781` → 22:2886-2944;
   `AgentStatus` `:72-77` → 22:72-81, `:1336-1341` → 22:1375-1384.
5. §1 `agent-help.txt:15`(kind 목록)·`methods.json` 인용 — 0.9.5 fixture에는 `schema.json`만 있다. 해당 파일을 캡처하거나 스키마
   좌표로 대체: `agent.explain` 22:5295, `pane.release_agent` 22:5999, `pane.clear_agent_authority` 22:5983,
   `server.agent_manifests` 22:4767. kind 고정 목록은 스키마에 없음(`AgentStartParams.kind`는 자유 문자열) → CLI help 재캡처 필요.

**메서드·구독 이름**

6. 프로브가 쓰는 메서드는 0.9.5에 모두 있고 이름 불변: `pane.report_agent`, `pane.release_agent`, `pane.process_info`, `pane.focus`,
   `pane.close`, `tab.create`, `tab.close`, `workspace.create`, `server.stop`, `agent.start`, `agent.get`, `agent.read`(source
   `detection` 유지), `agent.explain`, `agent.prompt`, `events.subscribe`. **rename 없음.**
7. §8·§4.1-3의 미확정 "감지 이벤트 구독 type" → **`pane.agent_detected`로 확정**(17:3856-3867 / 22:4169-4180). **pane 필터가 없는
   전역 구독**이므로 `{type:"pane.agent_detected"}`로 열고 클라이언트에서 `pane_id`로 거른다(`pane_id`를 붙이면 스키마 밖).
8. `pane.report_agent`에 새 선택 필드 `resume_argv`(22:2912-2921) — 프로브는 보내지 않는다고 명시(재시작 복원 부작용 회피).

**추가해야 할 관찰 항목(TLA (e)·`agent.wait`)**

9. 모든 프로브의 `agent.get` 레벨 기록에 `revision`·`state_change_seq`·`completion_seq`를 함께 남긴다 — 전이당 증가 규칙(§3 (e)).
10. D1·D2에 "`done` push 시점 ↔ `completion_seq` 증가 시점" 대조를 추가(§3 (d)).
11. `agent.wait{until:["idle","done"]}`을 이미 `idle`인 pane에 호출해 즉시 반환(level)인지 대기(edge)인지 확인하는 소항목(§3 마지막 행).
12. (선택) `surface_interest` 비간섭 확인: 프로브 연결은 `client_shell.surface.set`을 호출하지 않는다 — 결과 해석에 영향이 없음을 기록.

**전제(§8)에 더할 것**

13. headless `herdr server`의 temp HOME·`HERDR_SOCKET_PATH` 격리는 0.9.5에서 **다시 미실측**이다. `detached_server_daemon: true`
    capability가 기동 방식(데몬 분리)에 영향을 줄 수 있으니 Step 0에서 서버 pid·소켓 위치를 함께 기록.
14. 공유(shared) 모드의 사용자 herdr는 이제 0.9.5다 — shared 사용 시 대상 버전이 private과 같음을 기록.

---

## 5. Cross-refs

| Doc | Role |
|---|---|
| `docs/spikes/HERDR-0.7.5-COMPAT.md` | protocol 17 선례(shipped, 불변) |
| `docs/spikes/fixtures/herdr-v0.9.5/schema.json` | 이 문서의 22 좌표 원천(현재 미추적 파일) |
| `docs/spikes/fixtures/herdr-v0.7.5/schema.json` | 17 좌표 원천 |
| `packages/host/src/herdr-client.ts` | 클라이언트 표면 SSOT |
| `packages/host/src/bridge-runtime.ts:1039-1041` | 현재 차단 지점 |
| `docs/spikes/BRIDGE-STARTUP-TLA.md` §0.1-5 · §1.2 | (a)–(e) 가정 |
| `docs/spikes/HERDR-STATUS-PROBES.md` | 라이브 프로브 설계(§4 변경 목록 대상) |
