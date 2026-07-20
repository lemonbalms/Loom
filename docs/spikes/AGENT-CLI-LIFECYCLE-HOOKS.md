# Agent CLI lifecycle hooks — 종료·응답 공식 캐치 조사 (설계 입력)

| Field | Value |
|-------|--------|
| **Document** | `docs/spikes/AGENT-CLI-LIFECYCLE-HOOKS.md` |
| **Status** | **design-input (provisional)** — **단 1회의 라이브 발화도 관측되지 않았고 증거 등급이 혼재한다**(공식 문서 인용 · 소스 검증 · 정책 추론이 한 표에 섞여 있음). 읽기 조사 + 로컬 문서/herdr schema 실측까지가 실체이며, 라이브 multi-vendor hook 프로브는 **미수행**. 격하 근거 = (C) 전환 2026-07-21 |
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
| herdr가 대신 해 주나? | **부분.** 14종 `integration install` + 전 에이전트 screen 감지. **Grok = screen-manifest 전용 · integration role `none`** (Grok CLI hooks 자체는 존재 — §4.4.1 이유). |
| herdr 오픈소스 vs “에이전트 비공개”? | **오해 금지.** herdr([ogulcancelik/herdr](https://github.com/ogulcancelik/herdr), AGPL)는 감지·integration 코드 공개. 개별 코딩 CLI 라이선스는 별개. Grok CLI도 오픈소스. |
| 다음 설계 우선순위 (권고) | ① Claude 센서 운영 안정화(0.26.x) ② **Codex Stop/PermissionRequest** ③ **Grok Stop/Notification 직접 주입** ④ OpenCode/Kimi/Pi ⑤ herdr install 자동화는 옵션 |

**정정 (2026-07-21):** 초기 구두 조사에서 “Grok hooks 표면 약함”은 **오류**.  
근거: (1) [xai-org/grok-build](https://github.com/xai-org/grok-build) 오픈소스 공개 (2) 설치본 `~/.grok/docs/user-guide/10-hooks.md` lifecycle 표.  
**남은 갭은 “Grok hooks 부재”가 아니라 herdr 제품 등급 `none` + Loom 직접 센서 미배선** (§4.4.1).

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
│    + (optional) flight.hookHint — 명제별 등급으로만 결합       │
└─────────────────────────────────────────────────────────────┘
│ 본문 정본 = card.done output / §5.1 artifact (hook 아님)     │
└─────────────────────────────────────────────────────────────┘
```

**합류 규칙:**

1. **센서에는 전역 우선순위가 없다. 정본은 `PANE-DEATH-DESIGN.md` §6.0-bis의 증거 명제표다.**
   각 센서는 특정 명제(P1~P7)에만 등급화된 증거를 주며, 비가역 행동은 해당 명제의 authoritative
   evidence와 동일 generation CAS를 **모두** 만족할 때만 허용된다. `hookHint`는 그 표에서
   `Stop`→P2 `C+`, `Notification`/`PermissionRequest`→P3 `C+` 등으로 **명제 단위로만** 기여한다.
2. 없으면 herdr status + 스크레이프 (무회귀).
3. 긴 본문은 hook payload에 의존하지 않는다 (`transcript_path` 참조만).

*변경 이유:* 구 1번은 **`hookHint` 있으면 우선**이라는 **전역 우선순위**였다. 센서는 서로 비교
가능한 단일 축 위에 있지 않으므로 이런 순위는 성립하지 않으며, hook이 강한 명제(P2 턴 종료)와
전혀 권위가 없는 명제(P7 의미상 완료)를 뭉뚱그려 완료 판정에 hook을 끌어들이는 오독을 낳는다.
*출처:* (C) 전환 2026-07-21 — 결정 E3/E11. 정본은 `PANE-DEATH-DESIGN.md` §6.0-bis.

---

## 3. Loom 관심 상태 → 정규 카테고리

| Loom / 운영 어휘 | 의미 | 설계 필드 후보 (notes/센서, 와이어 신설 금지 기본) |
|------------------|------|-----------------------------------------------------|
| **turn_end** | 에이전트 한 턴 응답 종료 | `hookHint=stop` · **P2에 `C+`** — completion 재평가 트리거·poll 가속까지. **still-running 게이트 우회 금지** |
| **approval_required** | 사람/정책 승인 대기 | `hookHint=permission_prompt` · 가짜 `agent_blocked` 교정 |
| **idle** | 입력 대기 (승인 아님) | idle_prompt / session.idle — 승인과 **분리** |
| **working** | 툴/추론 진행 중 | herdr working · UserPromptSubmit 보조 |
| **session_end** | 프로세스/세션 종료 | SessionEnd · pane_exited (카드 tear-down) |
| **subagent_end** | 서브에이전트 완료 | SubagentStop (선택 관측) |

---

## 4. 벤더별 공식 표면 매트릭스

### 4.1 요약 표

**증거 등급(`evidence_grade`) 어휘 — 이 문서 전역 공통:**

| 등급 | 뜻 |
|------|-----|
| `official-spec` | 벤더 공식 문서/스펙에 명시된 표면 |
| `source-inspected` | 오픈소스 코드·매니페스트·enum을 직접 읽어 확인 |
| `installed-doc` | 로컬 설치본에 동봉된 문서에서 확인 |
| `live-observed` | **실제 발화·payload를 관측** |
| `inferred` | 문서·소스에서 직접 확인되지 않은 정책 추론 |

> **전 행 공통:** `live-observed` **0건**. 아래 표의 이벤트명은 **표면의 존재**를 말할 뿐,
> **실제 발화·payload shape·delivery·trust 거동을 실증하지 않는다**(§10-3).

| 에이전트 | 오픈소스 / 문서 | 턴 끝 | 승인/막힘 | 세션 끝 | herdr `integration install` | Loom 센서 경로 | `evidence_grade` |
|----------|-----------------|-------|-----------|---------|-----------------------------|----------------|------------------|
| **claude** | 공식 hooks 문서 | `Stop` | `Notification`/`PermissionRequest` (`permission_prompt`) | `SessionEnd` | ✅ `claude` | **0.26 shipped 경로** | `official-spec` (표면) |
| **codex** | [Codex Hooks](https://learn.chatgpt.com/codex/hooks) | `Stop` | `PermissionRequest` | Session* | ✅ `codex` | **다음 이식 1순위** | `official-spec` |
| **grok** | **✅ [xai-org/grok-build](https://github.com/xai-org/grok-build)** · `10-hooks.md` | **`Stop`** | **`Notification`** · UI `approval_required` | **`SessionEnd`** | **❌ enum 없음** | **직접 hooks 주입 가능** | `installed-doc` + `source-inspected`(enum 부재) |
| **opencode** | [Plugins](https://opencode.ai/docs/plugins/) | `session.idle` | `permission.asked/replied` | session.* | ✅ `opencode` | plugin 어댑터 | `official-spec` |
| **kimi** | [Kimi Hooks](https://moonshotai.github.io/kimi-code/en/customization/hooks) | post-turn / Stop류 | pre-tool / Notification | Session* | ✅ `kimi` | hooks 어댑터 | `official-spec` (계열 표기는 `inferred`) |
| **pi** | Pi extension API | phase **`idle`** | extension | teardown→idle | ✅ `pi` | extension 어댑터 | `official-spec` |
| **cursor** | Cursor hooks | stop 매핑 | before* | sessionEnd | ✅ `cursor` | 후순위 | `official-spec` (매핑은 `inferred`) |
| **copilot** | hooks | `agentStop` | notification | — | ✅ `copilot` | 후순위 | `official-spec` |
| **droid / hermes / kilo / qodercli / mastracode / omp / devin** | herdr 설치 스크립트 존재 | 벤더별 | 벤더별 | 벤더별 | ✅ 각 target | 수요 pull 시 | `source-inspected`(설치 스크립트 존재) · 이벤트는 **미확인** |

#### 4.1.1 provenance — 위 표 각 행의 확인 근거

| 에이전트 | 벤더 버전 | URL / commit | 확인일 | payload fixture | live delivery 확인 |
|----------|-----------|--------------|--------|-----------------|--------------------|
| claude | (조사 시점 설치본) | https://code.claude.com/docs/en/hooks | 2026-07-21 | ❌ 없음 | ❌ 없음 (0.26 경로는 Loom 자체 구현 실측) |
| codex | 미기록 | https://learn.chatgpt.com/codex/hooks | 2026-07-21 | ❌ 없음 | ❌ 없음 |
| grok | `grok 0.2.106` | `~/.grok/docs/user-guide/10-hooks.md` · https://github.com/xai-org/grok-build | 2026-07-21 | ❌ 없음 | ❌ 없음 |
| opencode | 미기록 | https://opencode.ai/docs/plugins/ | 2026-07-21 | ❌ 없음 | ❌ 없음 |
| kimi | 미기록 | https://moonshotai.github.io/kimi-code/en/customization/hooks | 2026-07-21 | ❌ 없음 | ❌ 없음 |
| pi | 미기록 | Pi extension API 문서 | 2026-07-21 | ❌ 없음 | ❌ 없음 |
| cursor / copilot | 미기록 | 벤더 hooks 문서 | 2026-07-21 | ❌ 없음 | ❌ 없음 |
| herdr (B층) | `v0.7.4` / protocol 16 | `herdr api schema` · `herdr integration status` (로컬 실측) | 2026-07-21 | ⚠️ schema만 | ❌ 없음 |

**미기록 버전 항목은 재조사 대상이다** — 벤더 버전 없이 인용된 표면은 시간이 지나면
`official-spec`조차 검증 불가능해진다.

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

#### 4.4.1 herdr가 Grok을 lifecycle integration이 아니라 screen-manifest 전용으로 둔 이유

> **설계 고정 문장:** herdr는 Grok을 “무시”하거나 “비공개라서 못 붙인” 것이 아니다.  
> **lifecycle authority 기준(완전 3상태 전이)** 을 통과한 벤더만 hooks를 상태 정본으로 쓰고,  
> Grok은 **UI/OSC screen-manifest**로 상태를 잡도록 분류한다 (`integration role: none`).  
> Grok CLI hooks는 존재하며 **Loom 보조 센서 후보**이나, `herdr integration install grok`는 **현재 제품 표면에 없다**.

**herdr 통합 등급 3단** ([Agents](https://herdr.dev/docs/agents/) · [Integrations](https://herdr.dev/docs/integrations/)):

| 등급 | 효과 | 예 |
|------|------|-----|
| **Lifecycle authority** | hooks/plugin이 `idle`/`working`/`blocked` **권위 보고**. 같은 pane에 **screen fallback 끔** | Pi, OMP, Kimi, OpenCode, Kilo, Hermes, MastraCode |
| **Session identity** | hooks로 **session id**만 (restore). **상태 = screen** | Claude, Codex, Copilot, Devin, Droid, Qoder, Cursor |
| **none** | integration 설치 대상 아님. **상태 = screen only** | **Grok**, Amp, Antigravity, Kiro, Maki |

문서가 Claude/Codex·Devin·Copilot 등에 **명시**한 공통 논리 (Grok `none`과 같은 축):

- hooks가 **전체 lifecycle을 덮지 못함** → permission 승인 결과, escape interrupt 등 **전이를 놓칠 수 있음**
- 불완전한 hooks에 lifecycle authority를 주면 **screen과 이중 진실**이 되어 wait/알림이 깨짐  
  → authority 부여 시 screen을 **의도적으로 끄므로** 기준이 높다
- 부분 hooks는 **session restore용**으로만 쓰고 상태는 screen (Claude/Codex 등)

**Grok이 session identity 등급에도 없고 `none`인 이유 (문서 정책 + 소스/CHANGELOG 재구성; herdr가 “Grok 한 줄 제외 사유”를 별도 공표하진 않음):**

| # | 이유 | 증거 | `evidence_grade` |
|---|------|------|------------------|
| 1 | **Lifecycle authority 기준이 높음** — 연속 `working`/`blocked`/`idle` + interrupt/permission 전 경로가 필요. Grok 공개 hooks(`Stop`/`Notification`/…)는 **턴 끝·알림**에 강하지만 herdr 3상태 정본으로 **검증·등급 상향되지 않음** | Agents: “complete lifecycle hooks”만 authority | **`inferred`** — 일반 정책 문장에서 Grok 개별 판정을 재구성한 것 |
| 2 | **Grok UI가 screen/OSC에 잘 맞음** — herdr가 여기 투자 | `src/detect/manifests/grok.toml` 주석 (OSC 0 title, OSC 9;4 progress, `[stop]` chip, Action Required, `┃` 다이얼로그). CHANGELOG #133 감지 추가, #1017/#1055 UI 추적 강화 (mid-turn idle 폴백 수정) | **`source-inspected`** — `grok.toml` 주석·CHANGELOG 직접 확인 |
| 3 | **integration 자산 미구현** — `src/integration/assets/grok/` 없음 · install 목록 14종에 grok 없음. “hooks API 부재”가 아니라 **herdr 설치 어댑터 미제공** | targets.rs / assets 트리 · `IntegrationTarget` enum | **`source-inspected`** — assets 트리 부재 · enum 부재를 직접 확인 |
| 4 | **Session-identity 파이프도 미배선** — Claude/Codex는 `SessionStart`→resume id 계약이 있음. Grok은 herdr 표준 resume 경로에 아직 안 올라감 (우선순위/계약) | Integrations 표: Grok 행 없음 | **`inferred`** — 표에 행이 없다는 사실에서 사유(우선순위/계약)를 추론 |
| 5 | **이중 authority 금지** — 불완전 hooks를 authority로 올리면 screen과 충돌 시 더 위험 → 보수적으로 `none` + 깊은 screen 규칙 | Agents: lifecycle authority 시 screen skip | **`inferred`** — 일반 정책에서 Grok 판정 동기를 추론 |

> **등급이 갈리는 지점을 뭉개지 말 것.** 위 5행 중 **소스로 검증된 것은 2·3번뿐**이고
> **1·4·5번은 정책 추론**이다. 따라서 “herdr가 Grok을 `none`으로 둔 *이유*”는 부분적으로만
> 확정돼 있으며, 이 추론을 Loom 설계의 **권위 근거로 수입하지 않는다**
> (`PANE-DEATH-DESIGN.md` §6.8 — herdr 등급은 **보수적 prior**이지 명세가 아니다).

**오해 교정:**

| 가설 | 판정 |
|------|------|
| Grok CLI/hooks 비공개라서 | **거짓** — 오픈소스 + `10-hooks.md` |
| herdr가 Grok을 감지 못해서 | **거짓** — `agent=grok` + 상세 toml |
| herdr 소스가 에이전트 연동 코드를 숨겨서 | **거짓** — herdr AGPL 공개; integration/manifest 코드 포함 |
| **완전 3상태 lifecycle 정본으로 쓸 install 어댑터를 herdr가 안 만들었고, screen/OSC로 충분·개선 중이라 `none`** | **참 (정책+소스 정합)** |

**Loom 함의 (고정):**

```text
herdr IntegrationTarget = pi | omp | claude | codex | copilot | devin | droid
  | kimi | opencode | kilo | hermes | qodercli | cursor | mastracode
# grok 없음 → herdr status = screen (B층 공통 눈)
# Grok Stop/Notification = Loom 직접 주입 (A층) — herdr install 대기 금지
```

- Grok 센서 = **Loom이 hooks를 직접 주입·수신** (Claude 0.26 동형 소켓/JSONL).
- **금지 (D10):** 수신 스크립트가 herdr `pane.report_agent`를 호출해 **herdr가 의도적으로 `none`으로
  둔 벤더를 임의로 lifecycle authority로 승격시키는 것은 금지한다.** 그렇게 하면 herdr screen 판정과
  **이중 진실**이 되어, 애초에 herdr가 `none` 등급으로 피하려던 상황을 우리가 재현한다.
  *(구 문안은 “authority 탈취 주의” 라는 **권고**였다. (C) 전환에서 **D 항목으로 잠근다** — §7 D10.)*
- herdr screen status와 Loom `hookHint`는 **§2 합류 규칙**(증거 명제표 참조)으로 결합한다.

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

**herdr 자체:** [github.com/ogulcancelik/herdr](https://github.com/ogulcancelik/herdr) · **AGPL-3.0-or-later** · 감지 매니페스트·integration install 자산 포함.  
Loom은 AGPL 경계로 소스 벤더링 없이 **소켓 RPC만** 사용 (`HERDR_DESIGN`).

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

1. **리스너 없음 → fail-open**(현행 herdr+스크레이프). **파싱 실패(malformed) → `none`.**
   두 경우를 같은 규칙으로 묶지 않는다.
2. 메타데이터 only (L-3 계열): 프롬프트·tool_input 전문 append 금지.
3. 플라이트당 stop 계측 정책은 벤더별 동일 패턴 재사용.
4. `hookSensor` 옵트인 기본 off (0.26).

> **✅ 해소됨 (커밋 `2ca6748`, 2026-07-21 · 아키텍트 워킹트리 독립 검증).**
> 구 문안은 “파싱 실패 → fail-open 폴백”이라고 적었으나, 이는 **코드와도 모순이고 목표 계약과도
> 모순**이었다. `buildHookSocketWriteCommand`가 `let k = 'Stop'` **기본값** + `catch {}`
> 구조라서, **malformed 입력을 유효한 `Stop`으로 승격**시켰다 — fail-open이 아니라 **fail-to-Stop**
> 이다. 파싱할 수 없는 바이트가 “턴이 끝났다”는 증거로 둔갑했다.
>
> **달성된 계약: malformed → 무전송.** 알 수 없는 입력은 어떤 명제에도 증거를 주지 않는다.
> 해법은 기본값 제거 + 알려진 4값 화이트리스트 검증 후에만 전송, 아니면 소켓 연결 없이 `exit(0)`.
>
> **`HookHintKind` union에 `none` 값은 추가하지 않았고, 추가해서는 안 된다.** “신호 없음”을
> *값*으로 만들면 그것이 “신호 있음”의 한 종류가 되어 같은 결함이 형태만 바꿔 되돌아온다.
> 부재(`hookHint === undefined`)가 이미 그 의미를 담당하며, `classifyCompletionFallback`이
> 이를 `"no_hint"`로 계측한다. 잠금: `hook-sensor.test.ts` 37/37(신규 15 — 생성된 스크립트를
> 실제 실행하는 end-to-end 케이스 포함, 결함 일시 복원 시 2 fail 재현 실증).

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
2. unit: no_listener → fail-open. **malformed → `none`**(아래 §5.1 불변식 1 참조 — 현행 코드가
   계약을 위반 중이다).
3. 라이브: 1회 turn_end Stop 발화 → **completion 재평가 트리거 / poll 조기 실행**.
   **`finishCard` 조기 확정이 아니다** — 아래 주의 참조.
4. 라이브: approval 이벤트 → 가짜 blocked 교정 (codex 관찰 ⓔ).
5. 차집합: HEAD 대비 신규 회귀 0.

> **⚠️ `Stop = 완료 확정` 문구 정정 (E15).**
> 문서·코드 3곳이 어긋나 있었다:
>
> | 좌표 | 문구 | 판정 |
> |---|---|---|
> | `HOOKS-SENSOR-SPIKE.md:101` | `Stop = 완료 확정` | **틀림** |
> | 조사 팩 `:313`(구 문안) | “`finishCard` 조기 확정” | **틀림** |
> | 코드 `packages/host/src/hook-sensor.ts:169-171` | `never Stop alone` | **옳다** |
>
> **코드가 옳다.** `Stop`은 증거 명제표에서 P2(턴 종료)에 `C+`일 뿐 P7(의미상 완료)에는 `S+`에
> 그친다(`PANE-DEATH-DESIGN.md` §6.0-bis 결합 규칙 2). 따라서 `Stop`이 허용하는 행동은
> **completion 재평가 트리거 · poll 조기 실행 · 알림까지**이며, **완료 확정이 아니다.**
> 문서 쪽 문구를 코드에 맞춰 교체한다.

---

## 7. 결정 초안 (설계 리뷰용)

| ID | 결정 | 상태 |
|----|------|------|
| D1 | 스크레이프 교체 금지 · hooks optional 센서 | **LOCKED** (§2.5) |
| D2 | 본문 정본 ≠ hook payload | **LOCKED** (§2.5 / 0.26) |
| D3 | 센서 수신 파이프 = loomDir 로컬 소켓/JSONL (inject-control 동형) | 0.26 선례 · 유지 권고 |
| D4 | Grok = 오픈소스 + 공식 hooks 있음 · herdr integration role **`none`**(screen 전용) → Loom **직접 hooks 주입** (herdr install 대기 금지) | **조사 확정 2026-07-21** · 이유 §4.4.1 |
| D4a | herdr 3단 등급 (lifecycle authority / session identity / none) 을 Loom 설계에 전제. authority ≠ “hooks API 존재” | **조사 확정 2026-07-21** |
| D5 | Codex = Claude 동형 hooks → **공유 스키마 + 벤더 어댑터** | 권고 |
| D6 | herdr integration install = ops 옵션, 제품 필수 아님 | 권고 |
| D7 | OpenCode/Kimi/Pi agentKind wire 확장은 수요 pull + R{n} | 권고 |
| D8 | 프로세스 exit code만으로 인터랙티브 턴 끝 판정 금지 | 권고 (세션 생존 ≠ 턴 끝) |
| D9 | herdr AGPL 오픈소스 ≠ 개별 코딩 CLI 라이선스. “에이전트 코드 비공개” 혼동 금지 | **조사 확정 2026-07-21** |
| **D10** | **herdr가 `none`으로 둔 벤더를 Loom 수신 스크립트가 `pane.report_agent`로 임의 승격시키는 것 금지** — herdr screen 판정과 이중 진실이 되어 herdr가 피하려던 상황을 재현한다 | **LOCKED** ((C) 전환 2026-07-21 · 구 “authority 탈취 주의” 권고에서 승격 · §4.4.1) |
| **D11** | **센서 전역 우선순위 금지.** 결합 정본 = `PANE-DEATH-DESIGN.md` §6.0-bis 증거 명제표. `hookHint 우선`·`hook Stop 우선` 문안은 폐기 | **LOCKED** ((C) 전환 2026-07-21 · §2) |
| **D12** | **`Stop`은 완료 확정이 아니다** — 허용 행동은 completion 재평가 트리거·poll 조기 실행·알림까지. 또한 **malformed hook 입력은 어떤 힌트도 발생시키지 않는다(무전송)** — `HookHintKind`에 `none` 값을 두지 않는다(신호 없음을 값으로 만들면 신호 있음의 한 종류가 된다) | **LOCKED** ((C) 전환 2026-07-21 · §5.1 · §6) · **코드 준수 `2ca6748`** |

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
| herdr `done` report 제한 (C1) | idle+sawWorking. **`hook Stop 우선`은 폐기** — `Stop`은 P2 corroboration일 뿐이며 결합은 증거 명제표를 따른다(§2) |
| ~~malformed hook 입력이 유효 `Stop`으로 승격~~ | **해소 `2ca6748`** — 화이트리스트 미통과 시 무전송 `exit(0)`. `hook-sensor.test.ts` 37/37로 잠금(생성 스크립트 실행 end-to-end 포함) |
| `Notification` 수신 분기의 `else if`/`else`가 동일 값(`permission_prompt`) — `idle` 아닌 모든 `Notification`이 최강 힌트로 승격 | **미해소 (Low)** — 주입 matcher가 `permission_prompt\|idle_prompt`로 좁혀 브릿지 주입 경로엔 노출면 없음. 방금 고친 것과 동일 결함 유형이므로 어댑터 PATCH에서 함께 정리 |

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
| herdr 오픈소스 | https://github.com/ogulcancelik/herdr (AGPL) · https://herdr.dev |
| herdr Agents / Integrations | https://herdr.dev/docs/agents/ · https://herdr.dev/docs/integrations/ |
| herdr Grok screen 정본 | `src/detect/manifests/grok.toml` (OSC/title/`[stop]`/permission UI) · CHANGELOG #133 · #1017 · #1055 |
| herdr v0.7.4 로컬 | `herdr integration status` · `herdr api schema` IntegrationTarget enum (grok 없음) |
| Loom | `COMPETITIVE_NOTES` §2.5 · `HOOKS-SENSOR-SPIKE.md` · `HERDR_DESIGN.md` |

---

## 10. 다음 액션 (문서 이후)

1. 본 문서를 PLAN 초안 작성 시 **입력 팩**으로 인용. 재조사 면제 범위는 **표면의 존재**에 한한다
   (§4 표 + **§4.4.1** + D4/D4a/D9). **거동·payload·delivery 주장은 면제 대상이 아니다** — 문서
   상태가 `provisional`로 격하됐고 `live-observed` 증거가 0건이기 때문이다(§4.1 · 3번 항목).
2. 오너 우선순위 확인: **Codex vs Grok** 어댑터 순서 (권고: Codex → Grok, 또는 병렬 소규모). Grok은 herdr install **대기 금지**.
3. **(필수) 라이브 실증: Grok `Stop` hook → JSONL 1줄 발화·payload 캡처 후 §4.4 “실측” 체크.**
   구 문안의 `(선택)`을 **필수**로 올린다 — 이 문서 전역에서 `live-observed` 증거가 **0건**이기
   때문이다(§4.1).

   **판정 기준 — 무엇을 주장하느냐로 갈린다:**

   | 주장의 성격 | 라이브 실증 |
   |---|---|
   | 공식 표면의 **존재** 인용 (“이 벤더에 `Stop` 이벤트가 있다”) | **불필요** — `official-spec`/`source-inspected`로 충분 |
   | **실제 발화 · payload shape · delivery · trust 거동** 주장 | **필수** — 문서 인용으로 대체 불가 |
   | **correctness 경로**에 그 센서를 넣는 것 | **1-shot으로도 부족** — 1회 발화는 존재를 보일 뿐 신뢰도를 주지 않는다. 비가역 행동의 근거로 쓰려면 명제별 coverage를 독립 검증해야 한다(`PANE-DEATH-DESIGN.md` §6.8) |
4. (선택) `herdr integration install claude|codex` 옵트인 런북 절을 `USER_GUIDE` 또는 dogfood에 링크.

---

*이 문서는 구현 스펙이 아니라 **설계 입력 팩(provisional)** 이다. 구현 착수 시 PLAN 버전 블록 +
필요 시 R{n}이 SSOT가 된다. 센서 결합 판정의 정본은 이 문서가 아니라
[`PANE-DEATH-DESIGN.md`](./PANE-DEATH-DESIGN.md) **§6.0-bis 증거 명제표**다.*

*개정 이력 — **2026-07-21 (C) 전환:** Status를 `provisional`로 격하(E10), §2 합류 규칙 1번의
`hookHint 우선`을 증거 명제표 참조로 교체(E11), §4.1·§4.1.1·§4.4.1에 `evidence_grade`와 provenance
열 추가(E12), §10-3 라이브 실증을 필수로 승격 + 판정 기준 명기(E13), `pane.report_agent` authority
승격을 D10으로 금지(E14), `Stop=완료 확정` 문구 교체 및 `hook-sensor.ts:202` malformed→`Stop` 승격
결함 명기(E15). 근거 = codex 3차 검증 + 장기자문 2회 + fable-advisor 자문 2회.*

***2026-07-21 후속:** E15가 명기한 malformed→`Stop` 승격 결함은 커밋 `2ca6748`에서 **해소**됐다.
채택된 계약은 `none` **값** 도입이 아니라 **무전송**이다 — D12 문안을 그에 맞춰 교정했다(위 §7 표).
잔여 동형 결함 1건(`Notification` 수신 분기, Low)은 §8 위험 표에 등재.*
