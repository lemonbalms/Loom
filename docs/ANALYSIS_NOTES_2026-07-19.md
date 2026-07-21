# 분석 노트 — 워크플로 용어 · 스택 · Herdr 접점

| | |
|--|--|
| **Date** | 2026-07-19 |
| **Scope** | 세션 논의 정리: AGENTS/WORKFLOW 용어, surface 의역, TS/Go/Rust, Herdr Plugins·Agents·Agent Skill, SKILL↔Loom 1:1 대조 |
| **Status** | 분석 메모 (PLAN SSOT 아님 · 구현 게이트 아님) |
| **Related** | `AGENTS.md`, `docs/WORKFLOW.md`, `docs/HERDR_DESIGN.md`, `docs/CONV_SPEC.md`, `packages/host/src/herdr-client.ts`, `packages/host/src/bridge-runtime.ts` |
| **Upstream** | [herdr.dev/docs/plugins](https://herdr.dev/docs/plugins/), [agents](https://herdr.dev/docs/agents/), [agent-skill](https://herdr.dev/docs/agent-skill/), [SKILL.md](https://github.com/ogulcancelik/herdr/blob/master/SKILL.md), [agent-guide.md](https://herdr.dev/agent-guide.md) |

---

## 0. 세션 스냅샷 (작성 시점)

| 항목 | 값 |
|------|-----|
| PLAN | v0.23.x 대역 (`approved` 계열 웨이브 진행 중 — 상세는 `HANDOFF.md` / `bun run status`) |
| Open blocking | 당시 없음 (R32 등 author-close 이후) |
| 제품 | **Loom** (`loom`, `@loom/*`) |
| 리뷰 에이전트 | **Fable 5 / fable-advisor** ≠ 제품 |
| Herdr 결합 | 플러그인 아님 · **Raw socket 클라이언트** (`loom bridge` + `HerdrClient`) |

---

## 1. AGENTS.md 스탠딩 룰 · 워크플로

### 1.1 세션 시작 리추얼

1. 읽을 파일: `HANDOFF.md` → `docs/WORKFLOW.md` → `docs/PLAN.md`(헤더) → `docs/plan_review.md`(Open)  
   또는 `bun run status`
2. 짧은 상태 표 브리핑 (한국어 가능) → **바로 다음 게이트 실행**
3. “이어서 할까요? / 커밋할까요?” 기본 금지

### 1.2 Standing rules (요약)

| Topic | Rule |
|-------|------|
| Product | Loom — CLI `loom`, packages `@loom/*` |
| Review agent | fable-advisor / Fable 5 ≠ product |
| Plan SSOT | `docs/PLAN.md` |
| Reviews | `docs/plan_review.md` R{n}; Fable 5 시 `WORKFLOW` §5.0–5.1 |
| Author-close | Low only + `(author-close, Low backlog)` + Changelog 출처 |
| Deviations | `implementation-notes.md` → 보수 옵션 |
| Unknowns | §3.5 + `docs/UNKNOWNS.md` — MINOR/**새 표면**; PLAN 대체 금지 |
| Autonomy | 단계마다 허가 묻지 않음 · wave 끝 ship |
| Next-action test | *실패하면 뭘 새로 배우나?* — 실패 불가 액션 자격 박탈 |
| Verify | `bun test` green (+ 관련 smoke) |
| Commit/push | wave 완료 시 기본 수행; “커밋 금지” 예외 |
| Env | `LOOM_*` only (`FABLE_*` 미사용) |
| Impl delegation | 세션 모델은 locked 스펙 **직접 코딩 금지** · `grok-impl` → `codex-impl` → 하위 모델 |
| Claude R{n} | `fable-advisor` 자문 필수 |

**True blockers만 멈춤:** MAJOR 모호 · 불가역 공유 피해 · 사람-only 외부 의존 · “멈춰/계획만/커밋 금지”.

### 1.3 핵심 루프 (`docs/WORKFLOW.md`)

```
0. Unknowns (MINOR/새 표면) → 1. Plan → 2. Review R{n}
→ 3. Implement → 4. Verify (bun test) → 5. Sync docs → 6. Ship
```

「진행해 / 이어서 / 자율적으로」= **현재 웨이브 끝까지**, mid-wave 승인 없음.

### 1.4 문서 지도

| 문서 | 역할 |
|------|------|
| `docs/PLAN.md` | 제품 계획 SSOT |
| `docs/plan_review.md` | R{n} SSOT |
| `docs/UNKNOWNS.md` | 미지 표 (PLAN 대체 금지) |
| `implementation-notes.md` | Deviations |
| `HANDOFF.md` | 세션 인수인계 |
| `tasks/todo.md` | 단기 체크리스트 (비-SSOT) |

---

## 2. “새 표면(surface)” 용어

### 2.1 의미

이 레포에서 **surface** = 내부 구현이 아니라  
**사용자·에이전트·외부 도구가 직접 닿는 공개 접점/계약**.

예: CLI 명령, MCP 도구, 프로토콜 메시지, UI 탭, install 경로, invite 포맷, env 공개 계약.

**새 표면** = 그런 접점이 새로 생기거나 외부 의미가 바뀌는 변경  
→ Unknowns 필수 · R{n} 게이트 쪽으로 감 (`WORKFLOW` §3.5: Tauri, 프로토콜, 호환 제거 등).

**새 표면이 아닌 예:** Low PATCH, 문서 hygiene, 국소 리팩터, 범위 명확한 Med finding 수정.

### 2.2 대체 표현

| 표현 | 뉘앙스 |
|------|--------|
| 신규 제품 접점 | 평이 |
| 공개 인터페이스 추가 | API/CLI |
| 사용자/에이전트 진입점 | UX |
| 외부 계약 변경 | 호환·브레이킹 |
| 신뢰 경계 확대 | 보안 게이트 |

### 2.3 의역

> **surface ≈ 제품이 세상과 맞닿아 약속을 만드는 창구**

| 원문 | 의역 |
|------|------|
| product surface | 제품이 밖으로 내민 창구 |
| public / API surface | 공개 계약 면 |
| new surface | 새로 열린 창구 · 새로 생긴 외부 접점 |
| attack surface | 공격자가 닿을 수 있는 면 |
| no runtime surface change | 실행 중 밖으로 보이는 동작·계약 불변 |

한국어 한 단어 후보: **접점 / 창구 / 진입점 / 공개 계약**.

---

## 3. TypeScript vs Go vs Rust (Loom 기준)

### 3.1 제품 성격

- Bun monorepo TS: protocol, relay, host/bridge, adapters, mcp-server, cli
- 데스크톱: Tauri(Rust 셸)만 부분 Rust
- 병목: I/O · 프로세스/PTY · JSON 계약 · 에이전트 dogfood — CPU 서버 아님

### 3.2 한눈에

| 축 | TypeScript (현행) | Go | Rust |
|----|-------------------|----|------|
| 핏 | 오케스트레이션·스키마·에이전트 생태계 | 네트워크 데몬·단일 바이너리 | 안전·성능 경계·시스템 셸 |
| 반복 속도 | 최고 | 높음 | 상대적으로 낮음 |
| MCP/스키마 공유 | 최강 (zod monorepo) | codegen/중복 | serde 가능·마찰↑ |
| 배포 | Bun/번들 JS | 정적 바이너리 최강 | 정적 바이너리 최강 |
| dogfood | 워커가 같은 TS 패치 | 중간 | 컴파일 루프 비용 |

### 3.3 판단

| 영역 | 권고 |
|------|------|
| CLI + host/bridge + MCP + adapters | **TS 유지** |
| 공용/클라우드 relay · install helper | **Go 분리 후보** |
| Tauri · sanitize/path/token 경계 | **Rust 강화 후보** |
| 전면 Go/Rust 재작성 | 현 단계 비추 (기능 동등 비용 > 이득) |

**한 줄:** 지금 Loom 가치는 네이티브 속도가 아니라 **이질 에이전트를 잇는 계약·운영 루프** — TS 선택이 제품 형태와 정합.

---

## 4. Herdr Plugins 분석 · Loom 접점

### 4.1 Plugins이 뭔가

- 디렉터리 + `herdr-plugin.toml` + argv 실행물 (언어 무관)
- Herdr: 설치·검증·키바인딩·pane·이벤트·컨텍스트·소켓
- API = **전체 Herdr CLI** (`HERDR_BIN_PATH`) · 소켓도 가능
- v1: actions / events / panes / link_handlers 매니페스트 선언 only
- **샌드박스 없음** — 신뢰 출처만

### 4.2 Loom 현재 결합

**플러그인 아님.** `herdr-plugin.toml` / `plugin.link` 미사용.

```
Loom relay (room/board/handoff)
    ↕ WebSocket
loom bridge
    ↕ Unix NDJSON  (HerdrClient)
herdr (pane/agent/events)
    ↕ PTY
claude / grok / codex
```

계층 분류: **Raw socket API 클라이언트** (Agent skill / Plugin 아님).

### 4.3 코드·소켓 접점

| 파일 | 역할 |
|------|------|
| `packages/host/src/herdr-client.ts` | NDJSON 클라이언트, 구독 수명주기 |
| `packages/host/src/bridge-runtime.ts` | 카드/conv ↔ herdr 이벤트 |
| `packages/host/src/fake-herdr.ts` | 테스트 double |
| `docs/HERDR_DESIGN.md` | 설계 SSOT |
| `docs/spikes/fixtures/herdr-v0.7.4/` | protocol 16 실측 |

**실사용 메서드:** `ping`, `agent.start`, `agent.send`, `pane.read`, `pane.list`, `pane.close`, `tab.create`, `events.subscribe`, `session.snapshot`  
**미사용:** `plugin.*`, marketplace, pane graphics, Windows named pipe(설계 회피)

### 4.4 역할 분담

| 관심사 | 소유 |
|--------|------|
| Room, peer, inbox, board, MCP | Loom |
| Pane, agent PTY, status 이벤트 | Herdr |
| 원격 카드 → 로컬 주입 | Loom bridge |
| Untrusted 제출 분리 (M-2) | Loom 정책 + `agent.send` |

### 4.5 옵션 평가

| 옵션 | 적합도 |
|------|--------|
| A. 소켓 클라이언트 유지 | **현재 정답** |
| B. 보조 플러그인 (로컬 UX) | 선택 |
| C. Loom 전체를 플러그인화 | **비추천** (relay/identity는 Herdr 밖) |
| D. plugin events로 주변 자동화 | 주변만 |

---

## 5. Herdr Agents 분석

### 5.1 정의

Agent = 코딩 에이전트 CLI가 도는 **터미널 타깃**.  
상태 롤업(pane→tab→workspace) + sidebar로 병렬 관제.

### 5.2 Status authority (핵심)

| 유형 | 의미 | Loom 주력 3종 |
|------|------|----------------|
| Lifecycle hooks | 훅이 idle/working/blocked 권위 | (해당 시 screen 끔) |
| **Screen manifest** | 하단 버퍼 + TOML 규칙 | **Claude, Codex, Grok** |
| Session only | restore identity | Claude/Codex integration |
| none | 통합 약함 | **Grok** |

Claude/Codex는 **의도적으로 full lifecycle authority 아님** → 화면 감지 유지  
(승인 결과·Escape 등 훅 누락 가능).

### 5.3 blocked 정책

- 알려진 승인/질문 UI 매치 시에만 `blocked`
- 아니면 `idle` 폴백 (`default_known_agent_idle_fallback`)
- **상태·대기·알림만** — Herdr가 자동 파괴 입력 안 함
- Loom: `blocked` → `agent_blocked` 실패 매핑 가능 (관찰 ⓔ: 작업은 나중에 완료될 수 있음)

### 5.4 Manifest / 진단

- Bundled + remote(herdr.dev) + local override `~/.config/herdr/agent-detection/<agent>.toml`
- `herdr agent explain` = 오분류 디버그
- pane 안 auto-tmux → 감지 파괴

### 5.5 idle vs done (attention)

Agents/Skill 쪽 설명과 정합:

| 상태 | 의미 |
|------|------|
| `idle` | 대기 + **결과 seen** |
| `done` | 완료 + **아직 unseen** |

→ “일 끝”과 “클라이언트가 봤음”이 섞임. Loom 카드 완료를 status 단독 매핑하면 위험.

### 5.6 Loom 함의

- 브릿지 완료 판정 = 이벤트 + scrape + still-running 유예 + card 계약 (다중 계층)
- Grok = integration none → TUI/스크레이프 의존↑
- Claude TUI 접힘 → pane scrape 상한 → artifact 파일 경로(§5.1) 필요

---

## 6. Herdr Agent Skill 분석

### 6.1 정체

- 마크다운 지시서 (`SKILL.md`) — 앱/SDK 아님
- **pane 안** 코딩 에이전트가 `herdr` CLI로 세션을 조종하게 가르침
- 설치: `npx skills add ogulcancelik/herdr --skill herdr -g`

### 6.2 Skill vs agent-guide

| 파일 | 역할 |
|------|------|
| `SKILL.md` | 에이전트가 **Herdr를 조작** |
| `agent-guide.md` | 에이전트가 **사람에게 Herdr를 가르침** |

### 6.3 안전 가드

```bash
test "${HERDR_ENV:-}" = 1   # 아니면 중단
```

- 세션 밖 에이전트의 소켓 오조작 방지
- 트리거: 사용자가 Herdr를 **명시**할 때만 (추정 발동 금지)

### 6.4 스킬 레시피 요지

1. `pane split --current --no-focus`
2. `pane run <id> "claude|codex|…"` (interactive only, argv 프롬프트 기본 금지)
3. wait idle → **`pane run`으로 태스크** (text+Enter 원자)
4. wait working → wait done|idle → `pane read --source recent-unwrapped`
5. 자기가 안 만든 리소스 close 금지 · `server stop` 금지

### 6.5 Loom과의 레이어

| | Agent Skill | Loom bridge |
|--|-------------|-------------|
| 주체 | pane **안** LLM | pane **밖** 데몬 |
| 목적 | 로컬 형제 pane 조율 | 원격 room 카드/conv |
| 제출 | `pane run` | `agent.send` + 상수 CR (M-2) |
| 완료 | wait status | events + scrape + card.done |
| 멀티유저 | 단일 로컬 세션 | relay + durable inbox |

**Skill은 bridge 대체 아님.** 로컬 멀티에이전트 UX 보완용.

---

## 7. SKILL.md ↔ Loom HerdrClient 1:1 대조

### 7.1 진입

| | Skill | Loom |
|--|-------|------|
| 게이트 | `HERDR_ENV=1` | ping/protocol, allowlist, `agentArgv` |
| API | CLI JSON | Unix NDJSON |

### 7.2 기동

| | Skill | Loom |
|--|-------|------|
| 자리 | `pane split` | `tab.create` + `agent.start` (`tab_id`/`split`) |
| 프로세스 | `pane run "claude"` | `agent.start` + 로컬 argv allowlist |
| 포커스 | `--no-focus` | `focus: false` |

### 7.3 제출 (최대 불일치)

```
Skill:  pane.run(task)  ── text+Enter 원자

Loom:   agent.send(prompt) ── delay ── agent.send("\r")
        + verify: probe read / reinject / resend CR
```

| Skill | Loom |
|-------|------|
| `pane run` 태스크 | **금지 영역** (untrusted handoff) |
| — | `injectPromptAndSubmit` |

### 7.4 완료

| Skill | Loom |
|-------|------|
| `wait agent-status` idle **또는** done | `events.subscribe` + settle + still-running 유예 |
| blocked → 사람 입력 | blocked → fail 가능 (오탐 주의) |
| poll wait | 장수 구독 + prune/reconnect |

### 7.5 읽기 · 정리

| | Skill | Loom |
|--|-------|------|
| 읽기 | `recent-unwrapped` 선호 | `recent` lines 200 + chrome/delta + artifact |
| 닫기 | 신중 (기본 안 함) | 성공 시 best-effort `pane.close` (opt-out keep) |

### 7.6 메서드 치트시트

| 의도 | Skill CLI | Loom |
|------|-----------|------|
| 스폰 | `pane run` after split | `agent.start` / `agentStart` |
| 탭 | tab create | `tabCreate` |
| 리터럴 입력 | (비권장) | `agentSend` |
| 제출 | **`pane run`** | **`injectPromptAndSubmit`** |
| 상태 대기 | `wait agent-status` | `eventsSubscribe` |
| 읽기 | `pane read` | `paneRead` |
| 닫기 | 신중 | `pane.close` |

### 7.7 옮기기 규칙

| 하고 싶은 일 | Skill 패턴 | Loom |
|--------------|------------|------|
| 로컬 형제 리뷰어 | ✅ | 선택(CLI) |
| 원격 카드 주입 | ❌ | bridge only |
| 프롬프트 제출 | pane run | 항상 send 분리 |
| 긴 산출물 | 더 읽기 | §5.1 파일 artifact |

### 7.8 한 줄

**Skill** = Herdr 안 LLM의 형제-pane 대화형 레시피.  
**Loom** = Herdr 밖 데몬의 원격 일 주입·회수 파이프라인.  
탐색/read/이름대는 대응 가능; **기동·제출·완료·멀티유저 버스는 의도적으로 다름.**

---

## 8. 통합 아키텍처 그림

```
                    ┌─────────────────────────┐
                    │  사람 / 타워 peer         │
                    │  Loom room · board · MCP │
                    └────────────┬────────────┘
                                 │ WebSocket (protocol v1)
                    ┌────────────▼────────────┐
                    │  loom bridge (Bun)       │
                    │  HerdrClient · flights   │
                    └────────────┬────────────┘
                                 │ Unix socket NDJSON
                    ┌────────────▼────────────┐
                    │  Herdr                   │
                    │  Agents(status) · panes  │
                    │  [optional] Plugins      │
                    │  [optional] Agent Skill  │
                    │      (pane 안 LLM 조종)   │
                    └────────────┬────────────┘
                                 │ PTY
                    ┌────────────▼────────────┐
                    │  claude / grok / codex   │
                    └─────────────────────────┘
```

| Herdr 표면 | Loom 관계 |
|------------|-----------|
| Plugins | 미사용 · 보조 UX 후보 |
| Agents (감지·상태) | **센서·실행면** — bridge가 소비 |
| Agent Skill | 워커 자율 조율 · bridge와 별축 |
| Socket/CLI | **실제 결합면** |

---

## 9. 실무 체크리스트 (이 노트에서 뽑은 것)

1. **용어:** “새 표면” = 공개 창구/계약 추가 — Unknowns + 리뷰 게이트 고려  
2. **스택:** 본체 TS 유지; relay/배포는 Go, 경계·Tauri는 Rust 점진  
3. **Herdr:** Loom은 플러그인/스킬이 아니라 **socket orchestrator**  
4. **제출:** 원격/untrusted 경로에 Skill의 `pane run` 복붙 금지 — M-2 준수  
5. **상태:** herdr `idle`/`done`/`blocked` ≠ Loom card done 1:1 — scrape·유예·계약 유지  
6. **Grok/Claude TUI:** 화면 권위 + scrape 상한 → verify·artifact 계층 필수  
7. **dogfood:** 워커에 herdr skill 없어도 bridge 동작; 로컬 형제 조율만 skill 유효  

---

## 10. 후속 후보 (메모 — 커밋된 계획 아님)

- [ ] `LOOM_HERDR_SOCKET` ↔ `HERDR_SOCKET_PATH` 운영 문서 한 줄 정렬  
- [ ] 로컬 UX용 얇은 herdr plugin (bridge status overlay) 필요 시만  
- [ ] relay Go 이전 시 와이어 경계 유지 설계  
- [ ] codex `blocked` ↔ 실완료 불일치 정책 (관찰 ⓔ) 명시 재검토  
- [ ] Skill `pane run` vs Loom M-2를 ADAPTERS/HERDR_DESIGN 교차 링크  

---

## 11. 변경 이력

| Date | Note |
|------|------|
| 2026-07-19 | 초안: 워크플로 용어, surface, TS/Go/Rust, Herdr 3문서, SKILL↔Loom 1:1 통합 |
