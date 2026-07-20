# Agent CLI lifecycle hooks — 종료·응답 공식 캐치 조사 (설계 입력)

| Field | Value |
|-------|--------|
| **Document** | `docs/spikes/AGENT-CLI-LIFECYCLE-HOOKS.md` |
| **Status** | **design-input ready** (읽기 조사 + 로컬 문서/herdr schema 실측; 라이브 multi-vendor hook 프로브는 후속) |
| **Date** | 2026-07-21 |
| **유형** | 설계 전 조사 팩 — PLAN/PATCH 작성 시 인용 가능한 매트릭스 + 결정 초안 |
| **결정 SSOT (관측 아키텍처)** | [`docs/COMPETITIVE_NOTES.md`](../COMPETITIVE_NOTES.md) **§2.5** — 스크레이프 교체 금지 · hooks = optional 보조 센서 |
| **Claude 선행 스파이크** | [`HOOKS-SENSOR-SPIKE.md`](./HOOKS-SENSOR-SPIKE.md) (v0.26.0 구현 경로) |
| **Related** | [`HERDR_DESIGN.md`](../HERDR_DESIGN.md) · herdr v0.7.4 protocol 16 · local `~/.grok/docs/user-guide/10-hooks.md` |

---

## 0. 한 줄 결론

| 질문 | 답 |
|------|-----|
| CLI 턴 종료·응답을 **공식적으로** 캐치할 수 있나? | **주요 벤더 대부분 Yes** (Claude / Codex / **Grok** / OpenCode / Kimi / Pi / Cursor 등). |
| 스크레이프를 hooks로 **교체**하나? | **No** — §2.5 하이브리드 유지. hooks = 보조 센서. |
| herdr가 대신 해 주나? | **부분.** `herdr integration install <target>` 14종에 한해 벤더 hooks → `pane.report_agent`. **`grok`는 integration enum 밖**이지만 Grok **자체 hooks는 공식 존재**. |
| 다음 설계 우선순위 (권고) | ① Claude 센서 운영 안정화(0.26.x) ② **Codex Stop/PermissionRequest** ③ **Grok Stop/Notification 직접 주입** ④ OpenCode/Kimi/Pi ⑤ herdr install 자동화는 옵션 |

**정정 (2026-07-21):** 초기 구두 조사에서 “Grok hooks 표면 약함”은 **오류**.  
근거: (1) [xai-org/grok-build](https://github.com/xai-org/grok-build) 오픈소스 공개 (2) 설치본 `~/.grok/docs/user-guide/10-hooks.md` lifecycle 표.  
남은 갭은 **herdr `integration install grok` 미제공**뿐.

---

## 1. 목표 / 비목표

### 1.1 목표 (이 문서가 고정하는 것)

1. **에이전트별 “공식 종료·응답·승인” 표면**을 한 표로 고정 (설계 시 재조사 금지용).
2. Loom 관심 3상태 ↔ 벤더 이벤트 **정규 매핑 초안** (어댑터 스펙 입력).
3. herdr integration 경계 vs CLI 직접 hooks 경계를 분리.
4. 후속 PLAN/PATCH가 고를 수 있는 **옵션 A/B/C** 와 비목표.

### 1.2 비목표

- 스크레이프 폐기 · moshi-hook 이식 · 모바일 푸시 데몬.
- 본문 스트리밍을 hooks로 대체 (본문 정본 = §5.1 artifact 유지).
- 전 벤더 동시 구현 (한 번에 한 `agentKind` 어댑터).
- herdr 소스 벤더링 / AGPL 위반 경계 침범 (소켓 RPC만).

---

## 2. 관측 계층 3단 (아키텍처 불변)

```text
┌─────────────────────────────────────────────────────────────┐
│ A. CLI 공식 lifecycle hooks / plugins / extensions           │
│    Stop · Notification · session.idle · phase idle …         │
└───────────────────────────┬─────────────────────────────────┘
                            │ (optional) herdr-agent-state
┌───────────────────────────▼─────────────────────────────────┐
│ B. herdr pane status                                         │
│    idle | working | blocked | done | unknown                 │
│    events: pane_agent_status_changed · pane_exited           │
│    report: pane.report_agent (integration / 직접 호출)        │
└───────────────────────────┬─────────────────────────────────┘
                            │
┌───────────────────────────▼─────────────────────────────────┐
│ C. Loom bridge 공통 눈                                       │
│    pane.read 스크레이프 · still-running · chrome 필터         │
│    + (optional) flight.hookHint 우선 분기                     │
└─────────────────────────────────────────────────────────────┘
│ 본문 정본 = card.done output / §5.1 artifact (hook 아님)     │
└─────────────────────────────────────────────────────────────┘
```

**합류 규칙 (기존 §2.5.3 재확인):**

1. `hookHint` 있으면 우선 (승인 / 턴끝 / 작업시작).
2. 없으면 herdr status + 스크레이프 (무회귀).
3. 긴 본문은 hook payload에 의존하지 않는다 (`transcript_path` 참조만).

---

## 3. Loom 관심 상태 → 정규 카테고리

| Loom / 운영 어휘 | 의미 | 설계 필드 후보 (notes/센서, 와이어 신설 금지 기본) |
|------------------|------|-----------------------------------------------------|
| **turn_end** | 에이전트 한 턴 응답 종료 | `hookHint=stop` · still-running 상한 우회 |
| **approval_required** | 사람/정책 승인 대기 | `hookHint=permission_prompt` · 가짜 `agent_blocked` 교정 |
| **idle** | 입력 대기 (승인 아님) | idle_prompt / session.idle — 승인과 **분리** |
| **working** | 툴/추론 진행 중 | herdr working · UserPromptSubmit 보조 |
| **session_end** | 프로세스/세션 종료 | SessionEnd · pane_exited (카드 tear-down) |
| **subagent_end** | 서브에이전트 완료 | SubagentStop (선택 관측) |

---

## 4. 벤더별 공식 표면 매트릭스

### 4.1 요약 표

| 에이전트 | 오픈소스 / 문서 | 턴 끝 | 승인/막힘 | 세션 끝 | herdr `integration install` | Loom 센서 경로 |
|----------|-----------------|-------|-----------|---------|-----------------------------|----------------|
| **claude** | 공식 hooks 문서 | `Stop` | `Notification`/`PermissionRequest` (`permission_prompt`) | `SessionEnd` | ✅ `claude` | **0.26 shipped 경로** |
| **codex** | [Codex Hooks](https://learn.chatgpt.com/codex/hooks) | `Stop` | `PermissionRequest` | Session* | ✅ `codex` | **다음 이식 1순위** |
| **grok** | **✅ [xai-org/grok-build](https://github.com/xai-org/grok-build)** · `10-hooks.md` | **`Stop`** | **`Notification`** · UI `approval_required` | **`SessionEnd`** | **❌ enum 없음** | **직접 hooks 주입 가능** |
| **opencode** | [Plugins](https://opencode.ai/docs/plugins/) | `session.idle` | `permission.asked/replied` | session.* | ✅ `opencode` | plugin 어댑터 |
| **kimi** | [Kimi Hooks](https://moonshotai.github.io/kimi-code/en/customization/hooks) | post-turn / Stop류 | pre-tool / Notification | Session* | ✅ `kimi` | hooks 어댑터 |
| **pi** | Pi extension API | phase **`idle`** | extension | teardown→idle | ✅ `pi` | extension 어댑터 |
| **cursor** | Cursor hooks | stop 매핑 | before* | sessionEnd | ✅ `cursor` | 후순위 |
| **copilot** | hooks | `agentStop` | notification | — | ✅ `copilot` | 후순위 |
| **droid / hermes / kilo / qodercli / mastracode / omp / devin** | herdr 설치 스크립트 존재 | 벤더별 | 벤더별 | 벤더별 | ✅ 각 target | 수요 pull 시 |

### 4.2 Claude Code (기준 구현)

| Loom | 이벤트 | 비고 |
|------|--------|------|
| turn_end | `Stop` | `stop_reason`, `last_assistant_message` |
| approval | `Notification` matcher `permission_prompt` | idle_prompt와 분리 |
| idle | `Notification` matcher `idle_prompt` | |
| work_start | `UserPromptSubmit` / `SessionStart` | |
| 주입 | `claude --settings` 인라인 JSON | 워커별 소켓 경로 |

선행: `HOOKS-SENSOR-SPIKE.md` · PLAN 0.26.x.

### 4.3 Codex CLI

| Loom | 이벤트 | 비고 |
|------|--------|------|
| turn_end | `Stop` | JSON stdout; continue 강제 가능 |
| approval | `PermissionRequest` | allow/deny/ask 계열 |
| work_start | `UserPromptSubmit` | |
| tools | `PreToolUse` / `PostToolUse` | matcher 도구명 |
| 설정 | `~/.codex/hooks.json` 또는 `config.toml` `[hooks]` | trust 리뷰(`/hooks`) |
| feature | `[features] hooks = true` | 기본 on |

**설계 메모:** Claude와 이벤트 이름이 거의 동형 → **어댑터 공유 스키마** 가능.  
trust 요구는 헤드리스 워커에서 `--dangerously-bypass-hook-trust` 또는 managed hooks 정책 선행.

### 4.4 Grok Build (오픈소스 정본)

| 출처 | 내용 |
|------|------|
| GitHub | https://github.com/xai-org/grok-build (Apache-2.0) |
| 마케팅 | https://x.ai/open-source · “Grok Build is open source” |
| 로컬 문서 | `~/.grok/docs/user-guide/10-hooks.md` (설치본 = 소스 user-guide 동기) |
| 실측 버전 | `grok 0.2.106` (조사 시점) |

**Lifecycle events (공식 표):**

| Event | When | Blocking? |
|-------|------|-----------|
| `SessionStart` | 세션 시작 | No |
| `UserPromptSubmit` | 프롬프트 제출 | No |
| `PreToolUse` | 툴 직전 | **Yes (deny)** |
| `PostToolUse` / `PostToolUseFailure` | 툴 후 | No |
| `PermissionDenied` | 권한 거부 | No |
| **`Stop`** | **에이전트 턴 종료** (완료·취소·에러) | No |
| `StopFailure` | API 에러로 턴 종료 | No |
| **`Notification`** | 에이전트 알림 | No (matcher = type) |
| `SubagentStart` / `SubagentStop` | 서브에이전트 | No |
| `PreCompact` / `PostCompact` | compact | No |
| **`SessionEnd`** | 세션 종료 | No |

**발견 경로:**

- Global: `~/.grok/hooks/*.json`
- Project: `<cwd>/.grok/hooks/*.json` (folder trust 필요)
- Compat: Claude `settings.json` · Cursor `hooks.json` 스캔 (config로 off 가능)
- Plugin: `hooks/hooks.json`
- Env: `GROK_HOOK_EVENT`, `GROK_SESSION_ID`, `GROK_WORKSPACE_ROOT`, …

**UI notification hooks (별축, `config.toml`):**

```toml
[[ui.notifications.hooks]]
events = ["turn_complete", "approval_required"]
```

설계에서는 **lifecycle `Stop`/`Notification`을 센서 정본**으로 두고, UI hooks는 사람 알림용 보조로 취급.

**herdr 갭:**

```text
herdr IntegrationTarget = pi | omp | claude | codex | copilot | devin | droid
  | kimi | opencode | kilo | hermes | qodercli | cursor | mastracode
# grok 없음
```

→ Grok 센서 = **Loom이 hooks를 직접 주입·수신** (Claude 0.26 동형 소켓/JSONL).  
선택: 수신 스크립트가 herdr `pane.report_agent`를 호출해 B층을 채움.

### 4.5 OpenCode

| Loom | 이벤트 |
|------|--------|
| turn_end / idle | **`session.idle`** |
| approval | `permission.asked` / `permission.replied` |
| tools | `tool.execute.before` / `.after` |
| 형태 | TS/JS **plugin** (`~/.config/opencode/plugins/`) — shell JSON hooks와 다름 |
| herdr | `herdr integration install opencode` → `herdr-agent-state.js` |

### 4.6 Kimi Code CLI

| Loom | 이벤트 (문서/구현 계열) |
|------|-------------------------|
| turn | pre/post-agent-turn · stop 게이트 |
| tools | pre/post-tool-call |
| session | SessionStart / SessionEnd |
| subagent | SubagentStart / SubagentStop |
| 형태 | hooks 디렉터리 + exit code 프로토콜 (AgentHooks 계열) |
| herdr | `herdr integration install kimi` → `~/.kimi-code/hooks/…` |

### 4.7 Pi

| Loom | 표면 |
|------|------|
| turn_end | extension phase **`idle`** (`thinking`/`replying`/`running`/`compact`/`idle`) |
| 형태 | `~/.pi/agent/extensions/*.ts` (JSON hooks 파일 아님) |
| herdr | `herdr integration install pi` → `herdr-agent-state.ts` |

### 4.8 herdr 공통 상태 모델 (protocol 16, 로컬 schema 실측)

```text
AgentStatus = idle | working | blocked | done | unknown
Event: pane_agent_status_changed { pane_id, agent_status, ... }
Write: pane.report_agent  (done 쓰기 제한 이슈 — HERDR_DESIGN C1: 완료는 idle+sawWorking 조합 흔함)
Wait:  herdr agent wait --status idle|working|blocked|unknown
Exit:  pane_exited
```

`herdr integration status` (로컬 예): 14 target 경로에 `herdr-agent-state` 설치 여부 표시.  
조사 시점 머신에서는 전부 **not installed** — 설치는 옵트인 ops.

---

## 5. Loom 어댑터 설계 초안

### 5.1 공통 센서 계약 (vendor-agnostic)

브릿지 내부만 (wire/MCP 신설 금지 기본 — 0.26 선례):

```ts
type HookHintKind =
  | "stop"                 // turn_end
  | "stop_failure"
  | "permission_prompt"    // approval_required
  | "idle_prompt"
  | "user_prompt_submit"
  | "session_start"
  | "session_end"
  | "subagent_stop"
  | "unknown";

type HookHint = {
  kind: HookHintKind;
  agentKind: "claude" | "codex" | "grok" | "opencode" | "kimi" | "pi" | string;
  at: number;
  // metadata-only — 본문 대용량 금지
  reason?: string;
  rawEvent?: string; // 벤더 이벤트명 보존
};
```

**불변식:**

1. fail-open: 리스너 없음 / 파싱 실패 → 현행 herdr+스크레이프.
2. 메타데이터 only (L-3 계열): 프롬프트·tool_input 전문 append 금지.
3. 플라이트당 stop 계측 정책은 벤더별 동일 패턴 재사용.
4. `hookSensor` 옵트인 기본 off (0.26).

### 5.2 주입 전략 (벤더별)

| agentKind | 주입 방법 | 수신 |
|-----------|-----------|------|
| claude | argv `--settings` 인라인 hooks JSON | `loomDir()/hook-<cardId>.sock` (0.26) |
| codex | project/user `hooks.json` 또는 스폰 cwd `.codex/hooks.json` + trust 정책 | 동형 소켓/JSONL |
| grok | `~/.grok/hooks` 또는 project `.grok/hooks` · 또는 Claude-compat settings 스캔 이용 | 동형 소켓/JSONL (**직접**, herdr install 불요) |
| opencode | 임시/전역 plugin `.js` 생성 | plugin이 소켓 write |
| kimi | hooks 디렉터리 스크립트 | 동형 |
| pi | extension `.ts` 설치/심볼릭 | extension이 소켓 write |

**공통 수신 파이프:** inject-control 선례 (`loomDir` 가드 · 0600 · no_listener 폴백) — 벤더마다 **쓰기 형식만 어댑터**.

### 5.3 herdr integration 사용 여부

| 옵션 | 내용 | 장점 | 단점 |
|------|------|------|------|
| **A. Loom 직접 hooks만** | 0.26 claude 방식 확장 | 벤더 무관 제어 · herdr 버전 비의존 | 벤더별 주입 코드 유지 |
| **B. herdr install 선행** | `herdr integration install X` 후 status만 구독 | 유지보수 herdr 측 | grok 불가 · 글로벌 hooks 오염 · 옵트인 마찰 |
| **C. 하이브리드** | 직접 hooks + (있으면) herdr status 이중 | 이중 신호 | 중복 이벤트 디듀프 필요 |

**설계 권고 (보수 기본):** **A를 1급**, B는 ops 선택.  
C는 디듀프 비용 때문에 초기 비권고 — herdr status는 이미 공통 눈.

### 5.4 agentKind 확장 (제품 범위)

현재 Loom card `DispatchAgentKind` = `claude | codex | grok` (0.23.2+).  
OpenCode/Kimi/Pi는:

- **단기:** herdr pane에서 argv만으로 스폰 가능해도 **센서 어댑터 우선순위 밖**.
- **중기:** 수요 pull 시 `DispatchAgentKind` 확장 = **와이어 인접 → R{n}** (WORKFLOW §5.1).

---

## 6. 후속 PLAN/PATCH 후보 (우선순위)

| # | 후보 | 범위 | R-gate 힌트 | 의존 |
|---|------|------|-------------|------|
| 0 | Claude hooks 센서 운영 안정화 | 0.26.x ship / D6 계측 등 | 기존 R41 계열 | done~in flight |
| 1 | **Codex hook 센서 어댑터** | Stop + PermissionRequest → hookHint | 신규 surface 작으면 경량 R 또는 author-close | #0 |
| 2 | **Grok hook 센서 어댑터** | Stop + Notification → hookHint (직접 주입) | 동형 | #0; **herdr install 불요** |
| 3 | 공통 `HookHint` 모듈 추출 | host 내부 pure map | 보통 author-close | #1–2 병행 가능 |
| 4 | OpenCode `session.idle` 어댑터 | plugin | 수요 시 | |
| 5 | Kimi / Pi 어댑터 | hooks / extension | 수요 시 | |
| 6 | herdr `install` 자동화 ops 문서 | 런북 only | 불요 | 선택 |

**테스트 설계 (각 어댑터 공통):**

1. unit: 벤더 raw event → `HookHint` 매핑.
2. unit: no_listener / malformed fail-open.
3. 라이브: 1회 turn_end Stop 발화 → finishCard 조기 확정 또는 still-running 우회.
4. 라이브: approval 이벤트 → 가짜 blocked 교정 (codex 관찰 ⓔ).
5. 차집합: HEAD 대비 신규 회귀 0.

---

## 7. 결정 초안 (설계 리뷰용)

| ID | 결정 | 상태 |
|----|------|------|
| D1 | 스크레이프 교체 금지 · hooks optional 센서 | **LOCKED** (§2.5) |
| D2 | 본문 정본 ≠ hook payload | **LOCKED** (§2.5 / 0.26) |
| D3 | 센서 수신 파이프 = loomDir 로컬 소켓/JSONL (inject-control 동형) | 0.26 선례 · 유지 권고 |
| D4 | Grok = 오픈소스 + 공식 hooks 있음 · herdr integration 없음 → **직접 주입** | **조사 확정 2026-07-21** |
| D5 | Codex = Claude 동형 hooks → **공유 스키마 + 벤더 어댑터** | 권고 |
| D6 | herdr integration install = ops 옵션, 제품 필수 아님 | 권고 |
| D7 | OpenCode/Kimi/Pi agentKind wire 확장은 수요 pull + R{n} | 권고 |
| D8 | 프로세스 exit code만으로 인터랙티브 턴 끝 판정 금지 | 권고 (세션 생존 ≠ 턴 끝) |

---

## 8. 위험 · 함정

| 위험 | 완화 |
|------|------|
| 벤더 hook 이름/페이로드 변경 | 어댑터 격리 · rawEvent 보존 · fail-open |
| Codex trust 게이트로 헤드리스 훅 미실행 | trust 정책 문서화 · managed hooks · bypass 플래그(신뢰 결정) |
| Grok project hooks folder-trust | 글로벌 `~/.grok/hooks` 또는 스폰 전 trust |
| 글로벌 hooks 오염 (herdr install) | Loom 직접 주입 우선 · install은 노드 이미지 전용 |
| Stop 과다 발화 (Claude 커뮤니티 이슈) | still-running과 AND · 플라이트 단일 초크포인트 |
| 본문 대용량 hook stdout | metadata-only · transcript_path |
| herdr `done` report 제한 (C1) | idle+sawWorking · hook Stop 우선 |

---

## 9. 증거 · 출처

| 출처 | 사용 |
|------|------|
| Claude Code hooks docs | https://code.claude.com/docs/en/hooks |
| Codex hooks docs | https://learn.chatgpt.com/codex/hooks |
| Grok open source | https://github.com/xai-org/grok-build · https://x.ai/open-source |
| Grok hooks (설치본) | `~/.grok/docs/user-guide/10-hooks.md` · UI notif: `05-configuration.md` |
| OpenCode plugins | https://opencode.ai/docs/plugins/ |
| Kimi hooks | https://moonshotai.github.io/kimi-code/en/customization/hooks |
| herdr v0.7.4 | `herdr integration status` · `herdr api schema` IntegrationTarget enum |
| Loom | `COMPETITIVE_NOTES` §2.5 · `HOOKS-SENSOR-SPIKE.md` · `HERDR_DESIGN.md` |

---

## 10. 다음 액션 (문서 이후)

1. 본 문서를 PLAN 초안 작성 시 **입력 팩**으로 인용 (재조사 금지 범위 = §4 표 + D4).
2. 오너 우선순위 확인: **Codex vs Grok** 어댑터 순서 (권고: Codex → Grok, 또는 병렬 소규모).
3. (선택) 라이브 1-shot: Grok `Stop` hook → JSONL 1줄 실증 후 §4.4 “실측” 체크.
4. (선택) `herdr integration install claude|codex` 옵트인 런북 절을 `USER_GUIDE` 또는 dogfood에 링크.

---

*이 문서는 구현 스펙이 아니라 **설계 입력 팩**이다. 구현 착수 시 PLAN 버전 블록 + 필요 시 R{n}이 SSOT가 된다.*
