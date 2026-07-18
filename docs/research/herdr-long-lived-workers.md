# Research: herdr 장수명 워커·세션 유지 능력

> 티켓 [lemonbalms/Loom#3](https://github.com/lemonbalms/Loom/issues/3) (part of #1, wayfinder:research)
> 조사자: research 서브에이전트 · 작성일 2026-07-18 · herdr **0.7.4** (로컬 설치본) 기준
> 조사 원칙: 고신뢰 1차 소스(로컬 바이너리 출력 + herdr.dev 공식 문서). 각 결론에 근거 표기.
> **읽기 전용 조사** — 실사용 중인 herdr 데몬(`~/.config/herdr/herdr.sock`)에 대해 재시작·설정변경·카드발행 없이 조회만 수행.

---

## 0. 핵심 결론 (TL;DR)

1. **장수명 워커는 herdr의 기본 모델이다.** herdr에는 "카드"/"job"/"dispatch" 개념 자체가 없다. 워커 = pane에서 도는 에이전트 CLI **프로세스**이고, herdr는 프로세스가 스스로 종료하거나 pane이 닫힐 때까지 절대 죽이지 않는다. "카드 1장 처리 후 죽는다"는 것은 herdr의 동작이 아니라 **현재 Loom 슬라이스 설계(§2.5 8단계)의 선택**이다.
2. **같은 워커 세션에 후속 입력을 넣는 1차 메커니즘은 `herdr agent send <target> <text>`다** (보조: `pane send-text`/`pane send-keys`/`pane run`). target은 terminal id·agent 이름·pane id로 해석되므로, 살아 있는 워커에 두 번째 카드를 그대로 주입할 수 있다.
3. **herdr는 워커에 실행 타임아웃·자원 예산을 부과하지 않는다.** herdr에 있는 모든 "timeout"은 관찰자(CLI) 쪽 폴링 대기 상한(`agent wait --timeout`, `wait output/agent-status --timeout`)일 뿐, 워커 수명이 아니다. 유일한 수명 관련 설정은 `[session] resume_agents_on_restore`(서버 재시작 시 재개)와 `[advanced] scrollback_limit_bytes`(메모리)뿐이다.
4. **결론**: "지속 세션"은 **서버가 살아 있는 동안에는 전적으로 herdr 계층에서 구현 가능**하다 — 워커 프로세스를 유지하고 `agent send`로 계속 먹이면 된다. CLI 네이티브 resume에 의존해야 하는 유일한 경우는 **herdr 서버 재시작/크래시를 넘어 대화를 복원할 때**다. 이때 herdr는 통합(integration)이 보고한 네이티브 세션 참조로 `claude --resume <id>` 등을 대신 실행한다 (Claude Code는 통합 버전 `6` 이상 필요).

---

## 1. herdr가 무엇을 관리하는가 — 워커 = pane 프로세스

`herdr --help` 첫 줄: *"herdr — terminal workspace manager for AI coding agents"* (로컬 `herdr --help`, 0.7.4).

공식 문서 [Agents](https://herdr.dev/docs/agents/):
> *"Each agent stays in a real terminal pane with its shell, logs, prompts, and running processes intact. Herdr tracks which panes contain agents…"*

즉 워커의 실체는 **pane 안에서 도는 실제 터미널 프로세스**다. herdr는 그 프로세스의 상태(idle/working/blocked/done)를 관찰·롤업할 뿐, 수명 주기를 카드 단위로 끊지 않는다.

**herdr에 카드/job/queue/dispatch 서브커맨드는 존재하지 않는다.** 서브커맨드 전체 목록(로컬 `herdr --help`): `status update completion server channel config workspace worktree tab notification agent pane wait session integration api`. "card"/"dispatch"/"job"은 없다. → Loom의 "카드 dispatch"는 herdr 원시 명령(`agent start` + `agent send` + `events.subscribe`) 위에 얹은 **Loom 계층 추상**이다 (기존 `docs/HERDR_DESIGN.md` §2.5가 이렇게 조립한다).

---

## 2. 질문 1 — 카드 하나 처리 후 워커를 살려둘 수 있나?

**답: 예. 그것이 herdr의 기본값이며, 오히려 죽이려면 명시적으로 닫아야 한다.**

- 워커는 `herdr agent start <name> [옵션] -- <argv...>`로 pane에 스폰된다 (로컬 `herdr agent --help`). 스폰된 프로세스는 **스스로 exit하거나 pane이 close될 때까지 계속 산다** — herdr는 "1작업 후 종료" 같은 훅을 걸지 않는다.
- 워커를 실제로 끝내는 것은 오직: (a) 에이전트 프로세스 자체 종료, (b) `herdr pane close <pane_id>` / `herdr agent`에는 별도 stop이 없음 — pane 계층에서 닫음, (c) 서버/세션 종료(`herdr server stop`, `herdr session stop`).
- 현재 Loom 슬라이스가 "카드 후 정리"하는 것은 herdr 강제가 아니라 **설계 선택**임이 문서에 명시돼 있다:
  `docs/HERDR_DESIGN.md` §2.5 8단계 — *"마감: ack 확인 후 pane 정리(슬라이스에서는 사후 검사용으로 유지)."* 즉 슬라이스는 카드=1워커=1pane 모델을 택했을 뿐, herdr가 pane을 강제로 회수하는 것이 아니다.

> **함의**: 장수명 워커로 전환하려면 herdr 쪽에 새 기능이 필요 없다. §2.5의 8단계(pane 정리)를 생략하고, 3단계(`agent.start`)를 최초 1회만 수행한 뒤 후속 카드를 §4의 `agent send`로 재주입하도록 **Loom 브릿지 로직만** 바꾸면 된다.

**검증됨(live, 읽기 전용)**: `herdr agent list`는 현재 같은 workspace(`w3`)에 두 개의 장수명 `claude` 에이전트 pane(`w3:p1` idle, `w3:p2` working)이 각각 다른 tab에서 **여러 세션에 걸쳐 계속 살아 있음**을 보여준다 — 카드 단위로 재생성되지 않는 실제 장수명 워커의 실증.

---

## 3. 질문 2 — 같은 워커 세션에 후속 입력을 전달하는 메커니즘

herdr는 **살아 있는 워커에 입력을 밀어넣는 여러 경로**를 제공한다 (로컬 `herdr agent --help`, `herdr pane --help`):

| 명령 | 용도 | 주의 |
|---|---|---|
| `herdr agent send <target> <text>` | **에이전트에 리터럴 텍스트 전송** (1차 경로) | *"writes literal text; use pane run when you want command text plus Enter"* — Enter 미포함. target = terminal id·agent 이름·라벨·legacy pane id |
| `herdr pane send-text <pane_id> <text>` | pane에 리터럴 텍스트 | 저수준 |
| `herdr pane send-keys <pane_id> <key>…` | 키 입력(예: enter) 전송 | 제출(Enter) 분리 주입에 사용 |
| `herdr pane run <pane_id> <command>` | **명령 텍스트 + Enter** | untrusted 입력엔 부적합(자동 제출) |

- 후속 카드 주입의 정석: **`agent send <target> <prompt>`로 리터럴 프롬프트 → 별도 제출 키**. 이는 기존 설계의 프롬프트 주입 경로(§2.5 4단계, §4.4.1)와 동일한 원시 명령이며, "no-Enter 리터럴 + untrusted 마커 유지" 안전 규약을 그대로 재사용할 수 있다.
- target을 **agent 이름**으로 지정할 수 있으므로(문서 [Agents](https://herdr.dev/docs/agents/): *"can be read or sent input by agent name"*), 브릿지가 워커에 안정적 이름을 붙여두면(`agent rename` / `agent start <name>`) pane id가 바뀌어도 같은 워커를 지목해 후속 입력을 보낼 수 있다.
- 완료 관찰은 폴링 없이 `events.subscribe`의 `pane.agent_status_changed`(기존 §2.5 5단계) 또는 CLI 편의 `herdr agent wait <target> --status idle|done [--timeout MS]` / `herdr wait agent-status`로 한다.

**결론**: 같은 워커 세션에 후속 입력을 전달하는 메커니즘은 **존재하며 herdr 원시 명령 1개(`agent send`)로 충분**하다. 별도 "세션 채널"이나 재접속 없이, 살아 있는 pane에 계속 주입하면 된다.

---

## 4. 질문 3 — 워커 타임아웃·자원 정책은 어떻게 설정되나?

**핵심: herdr는 워커 실행 타임아웃이나 자원 예산(budget) 정책을 제공하지 않는다.**

- **전체 기본 설정(`herdr --default-config`) 확인 결과, 워커 수명/타임아웃/자원한도 항목이 없다.** 관련 있는 설정은 단 두 개:
  - `[session] resume_agents_on_restore` (기본 `true`) — 서버 재시작 후 지원 에이전트 pane을 네이티브 세션으로 **재개**. 수명 연장이 아니라 재시작 복원 정책. (→ §5)
  - `[advanced] scrollback_limit_bytes` (기본 10,000,000) — pane당 스크롤백 **메모리** 상한. 워커를 죽이는 정책이 아니라 버퍼 크기.
  - (참고) `[remote] manage_ssh_config`의 `ServerAliveInterval/CountMax`는 **원격 SSH 네트워크** keepalive이지 워커 수명 아님.
- herdr에 있는 "timeout"은 전부 **관찰자(호출자) 쪽 폴링 대기 상한**이다 (로컬 help):
  - `herdr agent wait <target> --status <…> [--timeout MS]`
  - `herdr wait output <pane_id> --match <text> [--timeout MS]`
  - `herdr wait agent-status <pane_id> --status <…> [--timeout MS]`
  이들은 "얼마나 기다렸다 포기할지"(CLI 반환)이지 워커를 종료시키지 않는다.
- 따라서 **wall-clock 타임아웃·재시도·자원 제한은 herdr가 아니라 호출자(Loom 브릿지) 책임**이다. 기존 설계도 정확히 이렇게 규정한다: `docs/HERDR_DESIGN.md` §4.3 — *"agent 실행 타임아웃 없음(F4). 브릿지에 wall-clock 타이머를 넣지 않는다… 브릿지 supervision 없음."* 장수명 워커의 폭주/멈춤 감시는 브릿지 계층에서 타이머를 도입해야 한다(§4.3 "이후: timeout 상태 도입").

---

## 5. 질문 4 — 결론: 지속 세션을 herdr 계층에서 구현할 수 있나, CLI 네이티브 resume에 의존해야 하나?

herdr 공식 문서 [Session state and restore](https://herdr.dev/docs/session-state/)의 표가 경계를 정확히 규정한다:

| 경우 | 프로세스 유지 | 레이아웃 복귀 | 최근 화면 복귀 | **에이전트 대화 재개** |
|---|---|---|---|---|
| **Detach & reattach** | **예** | 예 | 예(라이브 터미널에서) | **예 — 프로세스가 멈춘 적 없으므로** |
| **서버 재시작** | **아니오** | 예 | pane 화면 이력 있을 때만 | **네이티브 에이전트 세션 복원 있을 때만** |
| Update `--handoff` 없이 | 호환 서버는 유지 | 재시작 후 예 | 이력 있을 때만 | 네이티브 복원 있을 때만 |
| Update `--handoff` 있이 | 지원 서버 best-effort | 예 | handoff 성공 시 라이브에서 | 예 — handoff 성공 시 프로세스 유지 |

이 표에서 지속 세션의 **두 계층**이 갈린다:

### 5.1 herdr 계층으로 충분한 범위 (서버가 살아 있는 동안)
- 워커 프로세스를 안 죽이는 한, **detach/reattach를 넘나들어도 대화는 그대로 유지된다** — "프로세스가 멈춘 적이 없으므로". 재개 로직도, 세션 참조도 필요 없다.
- 여기에 후속 입력을 `agent send`(§3)로 계속 주입 → **완전한 지속 세션이 순수 herdr 계층에서 성립**. Loom 브릿지가 워커를 재사용(§2.5 8단계 생략)하기만 하면 CLI resume은 전혀 관여하지 않는다.

### 5.2 CLI 네이티브 resume이 필요한 유일한 경계 (서버 재시작/크래시)
- **herdr 서버가 재시작되면 pane 프로세스는 죽는다**(표: "프로세스 유지 = 아니오"). 이 벽을 넘어 대화를 복원하려면, herdr는 **에이전트 CLI의 네이티브 세션 resume**을 대신 실행한다:
  - 문서 [Session state](https://herdr.dev/docs/session-state/): *"Herdr can use official integration-reported session references to restart supported agent panes after a Herdr server restart."* 기본 활성(`[session] resume_agents_on_restore = true`).
  - 동작 조건: 해당 pane이 **공식 통합(integration)을 통해 네이티브 세션 참조를 보고**했어야 함. Claude Code 기준 재개 명령은 `claude --resume <id>`, 필요한 **herdr 통합 버전 `6` 이상**. (Codex `5`/`codex resume`, OpenCode `5`/`--session` 등 — 문서 [Integrations](https://herdr.dev/docs/integrations/))
  - 통합이 없거나 세션 참조가 무효/중복/만료면, pane은 대화를 잃고 **일반 셸로** 복원된다.
  - 통합 설치·버전 확인: `herdr integration install claude` / `herdr integration status`.
- `--handoff` 경로(`herdr update --handoff`, `herdr --remote … --handoff`)는 예외적으로 **프로세스를 살린 채** 업데이트/이관을 시도하므로 이 경우엔 resume 없이도 대화가 유지된다(best-effort).

### 5.3 최종 판정
- **지속 세션 = herdr 계층에서 구현 가능하다** — 단, "서버 프로세스가 지속되는 동안"이라는 범위 안에서. 이 범위에서는 워커를 유지하고 `agent send`로 먹이면 되고, resume·세션 참조가 필요 없다.
- **CLI 네이티브 resume은 오직 "서버 재시작/크래시를 건너 대화를 이어야 할 때"만** 필요하다. 그리고 그마저도 herdr가 **통합 계층을 통해 대리 실행**하므로(`resume_agents_on_restore`), Loom이 직접 `claude --resume`을 부를 필요는 없다 — **Claude Code 통합(버전 6+)을 설치해 세션 참조를 herdr에 보고시키면** 서버 재시작 내구성까지 herdr가 흡수한다.
- 따라서 아키텍처 권고: **지속 세션의 주 경로는 herdr 장수명 워커 + `agent send`**로 두고, **서버 재시작 내구성은 별도 research 대상인 "CLI 네이티브 resume"을 herdr 통합으로 위임**한다. 이 둘은 배타적 선택이 아니라 계층이 다르다.

---

## 6. 확인 불가 / 후속 research 필요

- **워커에 프로세스 수준 자원 제한(cpu/mem cgroup 등)**: herdr 설정·CLI에 해당 항목 없음 → herdr는 제공하지 않는다고 판단하나, "명시적 부재"까지만 확인. OS 수준(launchd/cgroup) 격리는 herdr 밖의 별도 주제.
- **`agent send`의 제출(Enter) 정확한 관례**: help는 "literal text, no Enter"만 명시. Loom의 M-2/M-4 정책과의 접합(별도 제출 키 주입 시퀀스)은 §2.5 4단계 실측 결과(`docs/HANDOFF.md`의 M-4 거부 실증)와 대조해 확정 필요 — 본 티켓 범위 밖.
- **네이티브 resume의 대화 완전성**: `claude --resume`이 복원하는 컨텍스트 범위(툴 상태·승인 상태 포함 여부)는 Claude Code CLI resume의 별도 research 대상(티켓 문구의 "CLI 네이티브 resume(별도 research)").
- **다중 카드를 한 워커에 순차 주입할 때의 격리**: 한 장수명 워커가 여러 카드를 처리하면 카드 간 컨텍스트 오염이 생긴다 — 이는 herdr 능력 문제가 아니라 Loom 세션 설계(카드 경계 격리) 문제. herdr는 "가능하게" 하지만 "안전하게"는 Loom 몫.

---

## 부록 A — 1차 소스 인덱스

| # | 소스 | 종류 | 확인 방법 |
|---|---|---|---|
| A1 | herdr 0.7.4 로컬 바이너리 | 1차(설치본) | `herdr --version`, `herdr --help`, `herdr {agent,pane,wait,session,api,integration} --help`, `herdr --default-config` |
| A2 | 라이브 데몬 상태(읽기 전용) | 1차(실측) | `herdr agent list`, `herdr session list --json`, `~/.config/herdr/{config.toml,session.json}` |
| A3 | [herdr.dev/docs/session-state](https://herdr.dev/docs/session-state/) | 1차(공식 문서) | detach vs 서버재시작 vs handoff 복원 표, resume_agents_on_restore |
| A4 | [herdr.dev/docs/integrations](https://herdr.dev/docs/integrations/) | 1차(공식 문서) | 통합별 세션 참조·최소 버전·resume 명령 |
| A5 | [herdr.dev/docs/agents](https://herdr.dev/docs/agents/) | 1차(공식 문서) | 에이전트=pane 프로세스 모델, `agent start/send`, agent 이름 타겟 |
| A6 | [ogulcancelik/herdr#233](https://github.com/ogulcancelik/herdr/issues/233) | 2차(원 이슈, 배경) | resume_agents_on_restore 도입 배경·`exec $SHELL` 래핑(pane이 agent exit를 넘겨 생존)·실패 시 skip |
| A7 | 기존 `docs/HERDR_DESIGN.md` §2.5/§4.3 | 저장소 내부(대조) | 카드=1워커 슬라이스 설계, 타임아웃 생략이 슬라이스 선택임을 확인 |

> A6은 herdr가 아니라 fork 저장소(ogulcancelik/herdr)의 이슈이나, `resume_agents_on_restore` 도입 배경과 "pane이 agent 종료를 넘어 생존하도록 `cmd; exec $SHELL`로 래핑"·"resume 실패 시 조용한 셸 폴백 대신 skip" 같은 설계 의도를 뒷받침하는 참고 근거로만 사용. 정본 동작은 A3~A5 공식 문서로 검증.
