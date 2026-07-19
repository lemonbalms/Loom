# Claude hooks 보조 센서 스파이크 — 기술 가능성 확인

| Field | Value |
|-------|--------|
| **Phase** | COMPETITIVE_NOTES §2.7 로드맵 5번 (Moshi 경쟁 분석 후속) |
| **Status** | **done** (읽기-전용 조사 · 라이브 프로브 아님) |
| **Verdict** | **기술 가능성 확인** — 3상태 hook 감지 가능 · 배선 전부 기존재 · relay/MCP 무변경 · fail-open · **경량 R{n}** 예상. **이득 empirical 입증 완료(2026-07-20, 근거 중~강)** → 다음 = 스파이크가 아니라 실제 PATCH |
| **Date** | 2026-07-19 |
| **유형** | 읽기-전용 조사 (claude-code-guide hook 표면 + explore-stream Loom 배선 지점). 라이브 hook 주입/실행은 이번 스파이크 범위 밖 — "여기서 멈춤" |
| **결정 SSOT** | [`docs/COMPETITIVE_NOTES.md`](../COMPETITIVE_NOTES.md) **§2.5.2** "교체가 아니라 센서를 더한다" · **§2.5.3** 하이브리드 아키텍처 |
| **Related** | §2.5.1 용어 · §2.6 C 실행 체크리스트 · §2.6 H 비목표 · [`packages/host/src/inject-control.ts`](../../packages/host/src/inject-control.ts) (로컬 소켓 선례) |

## Goal / 맥락

오너가 "실시간 CLI 간 통신"을 물었고, 분해하니 두 갈래로 나뉘었다.

- **(a) 상태 관전** — 승인 대기 · 턴 끝 · 작업 시작 순간
- **(b) 출력 본문 스트리밍**

오너가 **(a)를 채택**. (a)는 CONV_SPEC 3단계 전체가 아니라 **hooks 보조 센서**로 저비용
실현 가능하다는 가설을 이 스파이크가 검증한다. 결정 SSOT는 §2.5.2 **"교체가 아니라
센서를 더한다"**:

- **스크레이프 = 공통 눈** (유지 · 모든 벤더 공통 경로)
- **hooks = 승인/막힘/턴끝 무전** (있으면 힌트, 없으면 현행)
- **본문 정본 = §5.1 artifact** (hook/스크레이프 둘 다 아님)

이 스파이크 없이 hook PATCH 착수 금지 — 기술 가능성부터 확정한다.

## Claude Code hook 표면 (claude-code-guide 조사)

### 3상태 매핑

| Loom 관심 상태 | Claude hook 이벤트 | matcher / payload |
|----------------|--------------------|-------------------|
| **승인 대기** | `Notification` (matcher `permission_prompt`) — 정밀히는 `PermissionRequest` | payload `tool_name` · `tool_input` · `permission_rule` |
| **턴 종료 · 유휴** | `Stop` — 또는 `Notification` (matcher `idle_prompt`) | `Stop` payload `stop_reason` · `last_assistant_message` |
| **작업 시작** | `UserPromptSubmit` · 세션 개시 `SessionStart` | `UserPromptSubmit` payload `prompt` · `SessionStart` matcher `startup`/`resume`/… |

**핵심:** 승인 대기(`permission_prompt`)와 단순 유휴(`idle_prompt`)가 **matcher로 깔끔히
분리** — 승인만 골라 잡을 수 있다. 팀 워커용 `agent_needs_input` / `agent_completed`
matcher(v2.1.198+) · `TeammateIdle`(payload `agent_type`)도 존재.

### 공통 stdin 필드

`session_id`(워커 식별 라우팅용) · `transcript_path` · `cwd` · `permission_mode` ·
`hook_event_name` · `agent_id`/`agent_type`(서브에이전트 문맥).

### 설정 / 주입

- settings.json `hooks`는 3단 중첩: **이벤트 → matcher → handler**. handler
  `type:"command"`가 stdin JSON을 받아 임의 스크립트 실행 → 유닉스 소켓 / JSONL append
  가능. 순수 사이드이펙트는 `async:true` 논블로킹.
- **워커별 주입:** `claude --settings '<인라인 JSON>'`(또는 파일 경로)로 세션별 override.
  워커마다 다른 소켓 경로/식별자를 심을 수 있어 **가장 깔끔**.

### 안전성 (fail-open · exit code)

- 관측 훅(`Notification` · `Stop` · `SessionStart`/`End` · `PostToolUse`)은 **exit 2여도
  에이전트 흐름 차단 불가** — 관측은 사실상 워커를 막을 수 없다.
- exit code 반직관: exit **0**=정상 · exit **1**=논블로킹 에러(안 막음) · exit **2**=블로킹
  (일부 이벤트만). **관측 스크립트는 항상 exit 0.**
- **stdout 노출 주의:** 대부분 훅 stdout은 디버그 로그로만(안전). 단 `SessionStart` ·
  `UserPromptSubmit` stdout은 **Claude 컨텍스트에 주입** → 관측만 할 땐 stdout 비우고
  파일 append만.
- **payload 본문성:** `Stop`의 `last_assistant_message` · `tool_response` · `prompt`는 실제
  본문 포함(길 수 있음) → 대용량은 `transcript_path` 참조. 따라서 hook은 **"완료 순간 +
  짧은 메시지"**에 쓰고, 긴 본문 정본은 여전히 **§5.1 artifact**(§2.5 결정과 정합).

## Loom 배선 지점 (explore-stream 조사 · 전부 기존재)

| 배선 지점 | 파일:줄 | 내용 |
|-----------|---------|------|
| 워커 스폰 | `bridge-runtime.ts:1041` `runCard` → `:1068-1073` `spawnWorkerAgent({name,argv,env:{LOOM_CARD},cwd:payload.cwd})` · conv도 동형 `:1364` | 스폰 훅포인트 |
| argv 조립 | `:1047` `resolveAgentArgv(cfg, agentKind)` → `bridge-config.ts:40` `DEFAULT_AGENT_ARGV` | claude 기본 argv, 브릿지 config 소유 |
| env 주입 채널 | `herdr-client.ts:372-388` `agentStart({name,argv,env?,cwd?})` · `:387` env → `agent start --env` | 현재 `LOOM_CARD`만 실림 |
| 워커 cwd | `:1072` `cwd:payload.cwd` (타워 지정 · 격리 아님) | 프로젝트 `.claude/settings.json` 경로도 가능하나 `--settings` 인라인이 더 깔끔·워커별 격리 |
| 이벤트 합류부 | `onCardHerdrEvent`(`bridge-runtime.ts:1967-2010`) — `:1974` status 계산 → `:1978` working / `:1992` blocked → `finishCard("failed","agent_blocked")` / `:2000` done\|\|idle&&sawWorking → `beginCardCompletion` | hookHint 우선 분기 지점 |
| still-running 유예 | `:114` `POLL_MS=10_000` · `:115` `MAX_MS=5*60_000` · `:120` tail-스크레이프 패턴 · 회수 `:1466` `sendWorkerTurnFromPane` | Stop 힌트로 상한 우회 |

### hook 주입 훅포인트 2곳

- (a) `agentArgv.claude`에 `--settings <hookcfg>` 추가
- (b) runCard env맵에 hook env

### 로컬 소켓 선례 = `inject-control.ts` (moshi-hook와 동형)

`:25` `loomDir()/inject-<runId>.sock` · `:51` `isPathUnderLoomDir` 가드 · `:62`
`createConnection` · `:81-91` 라인+ACK · `:99` no_listener 폴백. hook은
`loomDir()/hook-<cardId>.sock`에 쓰고 브릿지가 **리스너(방향 역전 — 브릿지가 서버)**로
복제한다.

## 최소 배선 경로 (5단계)

1. **스폰 시 hook 주입** — `agentArgv.claude`에 `--settings` 인라인 JSON으로
   `Stop` / `Notification`(matcher `permission_prompt`\|`idle_prompt`) / `UserPromptSubmit`
   hook 주입.
2. **워커 hook이 로컬 write** — `loomDir()/hook-<cardId>.sock`(또는 JSONL)에 async
   append (inject-control 선례 · 0600 · loomDir 가드).
3. **브릿지가 소켓 watch** — 스폰 직후 그 소켓을 watch (cardId → flight 매핑 재사용).
4. **hookHint 적재 + 우선 분기** — 수신 이벤트를 `flight.hookHint`에 적재 →
   `onCardHerdrEvent`(`:1974`) · still-running poll에서 **hookHint 우선**. `Stop`=완료
   확정(스크레이프 상한 우회) · `Notification` permission_prompt=승인 대기(codex 가짜
   `agent_blocked` 교정, lessons bridge-ops 관찰 ⓔ).
5. **hook 부재 시 폴백** — hookHint 부재·소켓 no_listener면 현행 herdr status + 스크레이프
   + 5분 유예 그대로 (무회귀 · `inject-control.ts:99` no_listener 폴백과 동형).

**합류 방식 한 줄:** hook이 로컬 소켓/파일에 이벤트 write → 브릿지가 watch →
`onCardHerdrEvent`(`:1974`)와 still-running poll에 "hookHint 우선, 없으면 herdr status +
스크레이프" 분기.

## R{n} 판정

**무변경:** relay wire · conv wire · MCP 도구 전부 무변경. hook 경로는 브릿지-로컬,
relay 미경유, `card.done`/`CardResultPayload` 기존 발행 — 개선되는 것은 **"언제/어떻게
done 판정"**뿐. "wire 변경은 CONV_SPEC 승인 범위 내에서만"(`HANDOFF.md:124`)과 무충돌.

**신규 표면 2개:**

- (a) 브릿지 config hook 주입 옵션
- (b) 브릿지-로컬 소켓 리스너

리스너가 외부 프로세스 입력을 수신 = **신규 신뢰 경계** → WORKFLOW §5.1 "보안·신뢰
경계" 해당 가능. 단 **inject-control(승인된 loomDir 0600 소켓)이 선례**라 **경량
R{n}(PATCH~MINOR · 신규 wire/MCP 없음)** 예상. hook 페이로드를 신뢰 입력이 아니라
**"완료 힌트"로만** 쓰고 실제 결과는 스크레이프로 회수하면 신뢰 노출 최소.

## 적용 이득 (§2.5.2 표 근거)

| 개선 | 현행(스크레이프만) | hook 보조 시 |
|------|--------------------|--------------|
| 승인 대기 | 글자 패턴 자주 놓침 · codex 가짜 `blocked` | `permission_prompt` 정확 · 가짜 blocked 교정 |
| 조기 `card.done` | still-running 휴리스틱(최대 5분 유예) | `Stop` 완료 확정 |
| Needs you 보드 | notes 짐작 | 이벤트 출처 상태 마커 |

## 이득 empirical 증거 (2026-07-20)

위 표(§2.5.2 근거)의 세 통증이 실제 dogfood 이력에서 관측·재발했는지 확인했다. **완화
타임라인 기준선**: still-running 유예 `1160b38`(0.23.7, 07-19 06:52) · supersession +
claude 상태줄 chrome 필터 `0ee8c50`(0.23.11, 10:49) · 말미 3가족 보정
`a47aaae`/`20972a4`/`c4f5a55`(11:01).

### 통증별 판정

| 통증 | 완화 이후 상태 | 근거 |
|------|----------------|------|
| **조기 done(card)** | 해소(0.23.7) — 재발 기록 없음 | 완화 작동 증거. 잔존 conv ~7-10s 조기 회신은 스파이크 5단계 배선 밖 |
| **승인 미탐지(agent_blocked)** | **미완화·반복·최신 재발 — 정면 통증** | 완화 조치 전무(HANDOFF 관찰 ⓔ 상시 등재) · 영속 보드 `~/.loom/boards/b24105986c5b3d96.json`에 status=done인데 agent_blocked인 codex 물증 3건(0.23.2 스모크·0.23.4 R29 자문·0.23.5 R30 자문) · 완화 이후 claude판 재발(07-19 WSL 노드 스모크 1차, 수동 승인 1회로 완주) |
| **스크레이프 아티팩트** | 잔존·다노드 재발·신규 가족 | 필터 4웨이브(0.23.6→0.23.8→0.23.11→0.23.12)에도 `⏸ manual mode on` summary 유입 WSL·VPS 동형 재현 · @node 라우팅(07-19 밤) wsl/vps summary 하단 상태줄에 덮임 · 신규 가족 `▼` 스크롤 인디케이터(v0.24.0) · lessons bridge-ops "추가 가족은 개별 보정 대신 후속 등재"로 두더지잡기 한계 명문화 |

### 종합 판정 — 근거 중~강

PATCH 명분은 **통증 2(정면)** + **통증 3(부분 해소)**, 통증 1은 완화가 이미 작동해
**보조 근거로 격하**. hook 교정 대응: `Notification`/`permission_prompt`가 가짜
`agent_blocked`를 1:1 교정 · `Stop` 힌트가 요약 출처를 이벤트로 대체(스크레이프 아티팩트
우회).

### 계측 공백 (한계)

`/tmp/loom-bridge*.log` 부재 · 브릿지 stderr=`"ignore"`로 **정량 빈도 대조 불가** — 근거는
서사 기록 + 영속 보드 최종 상태에 의존. 따라서 **PATCH 스코프에 최소 계측(hookHint 발화 /
폴백 / permission_prompt 감지 카운터 JSONL append)을 포함**해 사후 감소를 정량 측정 가능케
하는 것이 아키텍트 결정(2026-07-20).

## 스파이크 결론

**기술 가능성 확인 완료** — 3상태 hook 감지 가능 · 배선 전부 기존재 · relay/MCP 무변경 ·
fail-open · 경량 R{n}. 이번 스파이크는 **"읽기만"**이라 실제 hook 주입/실행 없이 여기서
멈춘다. **다음 단계는 스파이크가 아니라 실제 PATCH** — 이득 empirical 입증 후 경량 R{n}
게이트를 거친다(§2.5.3 실무 순서: 스파이크 → 이득 수치 → PATCH).

## 비목표 (§2.6 H 승계)

- 스크레이프 폐기
- moshi-hook / getmoshi API 의존
- 모바일 푸시 데몬
- 벤더 훅 올인 (Codex/Grok 어댑터는 Claude 이득 증명 후)

## 다음 단계

1. ~~**[이득 수치]** 조기 done · 승인 미탐지 감소가 empirically 있는지 dogfood 로그로
   측정.~~ **완료(2026-07-20)** — 위 "이득 empirical 증거" 참조. 판정 근거 중~강(통증 2 정면
   + 통증 3 부분). 계측 공백으로 정량 빈도는 미측정 → PATCH에 최소 계측 포함 결정.
2. **[PATCH · 경량 R{n}]** 이득 입증 후 5단계 배선 경로 구현 → 훅 신호를 notes /
   still-running 유예 입력에만 연결(자동 close·approve 금지).
3. **[이후]** Codex/Grok 개별 어댑터 (증명 후).
