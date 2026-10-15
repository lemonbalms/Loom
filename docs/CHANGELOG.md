# Loom Changelog

**철학 (첫 문단):** 이 파일은 리뷰 라운드 일지가 아니라, **지금 이 버전의 Loom으로 무엇이 가능해졌고 무엇이 금지됐는지**를 사용자·운영자·기여자 언어로 남긴다. 게이트 서사·R{n} 전개·커밋 나열은 `docs/PLAN.md` / `docs/plan_review.md` / `docs/reviews/`에 두고, 여기서는 **체감 변화와 깨진 습관**만 적는다.

| Field | Value |
|-------|--------|
| **문서** | `docs/CHANGELOG.md` |
| **제품 버전 SSOT** | `docs/PLAN.md` + `loom --version` (현재 **0.31.0**) |
| **관련** | [USER_GUIDE](./USER_GUIDE.md) · [ARCHITECTURE](./ARCHITECTURE.md) · [HERDR-0.7.5-COMPAT](./spikes/HERDR-0.7.5-COMPAT.md) · [PANE-DEATH unified](./spikes/PANE-DEATH-UNIFIED-DESIGN.md) |

---

## 0.31.0 — 2026-10-15

**스킬과 정책** — 헤드리스 워커의 권한을 `policy.json` 한 파일에 적고, 룸이 고른 스킬을 카드마다 고정된 복사본으로 준다.

### 가능해진 것

- **`loomDir()/policy.json` v1** — 셸 allow/deny(`p *` 형) · `network` · `mcp.deny`/`isolate` · `skills.allow`/`allowScripts`. 내장 기본값 위에 병합: **allow는 대체, deny는 합집합**(어떤 설정도 deny를 줄이지 못한다). 무효 파일 = 헤드리스 bridge 기동 거부(fail-closed).
- CLI별 번역: claude `--settings` 인라인 JSON(+ 기본 `--strict-mcp-config` — 오너 MCP 서버 0개) · codex `network_access` · grok 규칙별 `--allow`/`--deny`.
- **룸별 스킬:** `worker.skills.enabled: true` + `loomDir()/rooms/<roomKey>/skills.json`이 고른 스킬(내장 `loom-card-report` 또는 `loomDir()/skills/<name>/`)을 카드 디렉터리에 **복사**(링크 없음 · sha256 매니페스트). claude는 `--plugin-dir`로 로드, codex/grok은 첫 턴 프롬프트의 절대경로 목록.
- 강제력이 CLI마다 다르다는 **정직 표**(USER_GUIDE §16.4) — 예: codex 셸 deny는 강제되지 않고 네트워크만 강제.

### 바뀐 습관 (깨진 가정)

| 예전 (0.30.0) | 지금 (0.31.0) |
|---------------|---------------|
| `worker.permissions.<agent>`의 도구 목록이 권한 | 도구 목록은 **deprecated**(경고) — 권한은 `policy.json`. 목록과 `shell.allow` 공존 · 내장과 다른 공백 없는 `p*` deny = 기동 거부 |
| claude 워커가 오너 MCP 서버를 상속 | 기본 격리(`mcp.isolate: true`) |
| 입양은 복구 때만 fingerprint 대조 | **모든 입양**에서 대조 — 정책·설정이 바뀌면 살아 있는 워커는 죽이지 않고 결과를 `needs_verification` `fingerprint_changed`로 선점 |

### 불변

- 와이어 · `CardDispatchPayload`/`CardResultPayload` 필드 · 완료 권위(`blocked` 착지) · pane 경로 무변경. 스킬 선택은 수신 bridge 로컬뿐 — peer는 스킬을 보내지도 고르지도 못한다.

### 정본

- [`USER_GUIDE.md`](./USER_GUIDE.md) §16 · PLAN 0.31.0 · R49 · `implementation-notes.md` §0.31.0 · [`spikes/HEADLESS-SMOKE-0310.md`](./spikes/HEADLESS-SMOKE-0310.md)

---

## 0.30.0 — 2026-10-15

**헤드리스 카드 워커 (opt-in)** — 긴 카드를 herdr pane TUI 대신 비대화형 CLI 프로세스로.

### 가능해진 것

- bridge 설정 `worker.backend: "headless"`면 claude(`-p`) · codex(`exec --json`) · grok(`--prompt-file`)이 카드를 **비대화형으로** 돌리고 최종 텍스트 **전문**(≤200,000자)을 결과로 보낸다 — pane 사망·스크레이프 꼬리 잘림 없음.
- **카드별 세션** — bridge가 죽었다 떠도 살아 있는 워커를 **입양**하고, 결과 없이 죽은 워커는 같은 세션으로 **재개**(최대 2회).
- 에이전트별 동시성(`maxConcurrent`, 기본 1, 대기 카드는 relay inbox에 남음) · 카드 단위 타임아웃(기본 2h) · 정적 권한 프로필(위험 모드 거부).
- 워커 env에서 `LOOM_*`·`FABLE_*` 제거(relay 토큰 비노출) · 카드 프롬프트는 argv에 없음.

### 바뀐 습관 (깨진 가정)

- 기본값은 여전히 **pane** — `worker` 절이 없으면 아무것도 안 바뀐다. 헤드리스에서도 에이전트 종류 허용은 `agentArgv.<kind>` 유무, 실행 파일은 `worker.agentBin`.
- 카드 상태·transcript가 `~/.loom/cards/…`에 **평문**으로 남는다(GC 없음) · 프로필당 bridge는 하나만.

### 불변

- 와이어 무변경 · 결과는 정상 종료여도 `failed`/`needs_verification` → 타워 `blocked`(0.28.0 완료 권한 그대로).

### 정본

- [`USER_GUIDE.md`](./USER_GUIDE.md) §15 · PLAN 0.30.0 · R48 · `implementation-notes.md` §0.30.0 · [`spikes/HEADLESS-SMOKE-0300.md`](./spikes/HEADLESS-SMOKE-0300.md)

---

## 0.29.0 — 2026-10-15

**룸 이벤트 id·순번과 멱등 송수신** — 같은 이벤트가 두 번 와도 한 번으로.

### 가능해진 것

- relay가 룸 이벤트(chat · peer join/leave/presence · handoff push)에 `eventId`(`ev_…`)와 룸별 단조 `seq`를 찍는다(optional 필드).
- 클라이언트·bridge가 `eventId`로 **재시작을 넘어 dedupe**하고, 새 이벤트를 `loomDir()/rooms/<roomKey>/events/YYYY-MM.jsonl`에 원문 그대로(0600) 남긴다.
- chat·handoff 송신에 `clientEventId` — sticky 타임아웃 → one-shot 폴백이 **같은 카드를 두 번 디스패치하지 않는다**(재전송은 원래 결과만 돌려받음).

### 불변

- 와이어 v1 그대로(필드 전부 optional) — 구 relay·구 클라이언트와 양방향 공존. 전달은 at-most-once 지향(크래시 창에서 한 번 유실 가능 · dedupe 기억 창(1024) 밖으로 밀린 id는 다시 올 수 있음).

### 정본

- [`PROTOCOL.md`](./PROTOCOL.md) v0.29.0 절 · PLAN 0.29.0 · R47 · `implementation-notes.md` §0.29.0

---

## 0.28.1 — 2026-07-22

**herdr 0.7.5 / protocol 17 호환 어댑터** — 워커 스폰·주입이 다시 산다.

### 가능해진 것

- 로컬 **herdr 0.7.5 (protocol 17)** 위에서 dogfood 브릿지가 워커를 기동·제출한다.
- 제출 원시: 원자적 **`agent.prompt`** (텍스트 + 제출을 herdr가 소유). 명시 키 조합만 `agent.send_keys`.
- 라이브 **claude / codex / grok** 3-kind 스모크 + `dogfood:herdr` 경로.
- 구 bridge 설정의 `herdrProtocol:16`은 dogfood:up 경로에서 **자동 migrate** (어댑터 ship 이후 준비 게이트가 막히지 않게).

### 바뀐 습관 (깨진 가정)

| 예전 (0.7.4 / p16) | 지금 (0.7.5 / p17) |
|--------------------|---------------------|
| `agent.start`에 argv/env/cwd/split | **pane 먼저** (`tab.create` / `pane.split`에 env·cwd) → `agent.start{name,kind,pane_id}` |
| `agent.send` + bare Enter 분리 제출 | **`agent.prompt` 단일 원자 제출** (dual-send / `BARE_ENTER` 제거) |
| pane id로 prompt 타깃 | **exact named agent** (`loom-${cardId}-${seq}` 형식, 충돌 시 fail-closed) |
| config만 17로 올려 green | **금지** — 어댑터 없는 protocol bump는 위장 green |

### 불변

- card contract · relay/conv wire · MCP 이름 · board 전이 의미(제품 계약) 무변경.
- **0.28.0 완료 권한 락(U1–U11) 전량 유지** — `final_status`/`released` 필드는 관용하되 완료 권위 아님.

### 정본

- [`docs/spikes/HERDR-0.7.5-COMPAT.md`](./spikes/HERDR-0.7.5-COMPAT.md) §1–§6  
- PLAN 0.28.1 · R46 · `implementation-notes.md` §0.28.1  

---

## 0.28.0 — 2026-07-21

**PANE-DEATH 완료 권한 컷** — “끝났 보이면 done”을 제품이 믿지 않는다.

### 핵심 규칙 (운영자가 외울 것)

1. **`card.done` ≠ 보드 `done`.** 회신·마커는 후보일 뿐, 완료 확정은 검증 후 **명시적 로컬 board mutation**.
2. **원격 result의 `status:"done"`** 은 tower에서 board **`blocked`** 로만 격리한다 (`legacy_remote_done_requires_verification`). 원격이 board done을 만들지 못한다.
3. **브릿지 자동 `done` 폐지** · 카드 경로의 자동 `pane.close` 권한 축소 — pane/process exit는 관측이지 성공 증명 아님.
4. **result 발행 소유권**은 dispatch 시도당 단일 issuer; 늦은/위조 result는 currency gate·quarantine으로 흡수.

### 정본

- [`docs/spikes/PANE-DEATH-UNIFIED-DESIGN.md`](./spikes/PANE-DEATH-UNIFIED-DESIGN.md) 락 U1–U11  
- PLAN 0.28.0 · R45 · PATCH 1–5  

---

## 0.27.0 — 2026-07-21

**result 발행 단일 소유권 + strict ACK 경계**

- 브릿지가 relay ACK를 버리고 “보낸 척”한 뒤 pane을 닫던 fire-and-forget 경로를 정리.
- 전송 성공 ≠ tower 적용 ≠ 작업 완료. `peer_unknown` 등을 성공으로 읽지 않음.
- 설계·문서 게이트 다수 라운드 후 구현; 상세는 PLAN 0.27.0 / [`PANE-DEATH` §6.7](./spikes/PANE-DEATH-DESIGN.md) 계열.

---

## 0.26.x — 0.22.x (묶음)

| 버전대 | 한 줄 |
|--------|--------|
| **0.26** | Claude hooks **보조 센서** — 완료 권한이 아니라 힌트. 스크레이프는 공통 눈. |
| **0.25** | `conv_fetch` — scp transport v1, 자동 셸 금지, fail-closed 검증. |
| **0.24** | Windows 실배포 결함(persist 경로 가드·relay uncaught) · relay durable 배선 보강. |
| **0.23** | scrape delta · TUI chrome 필터 · inject 제어 · conv/card 운영 품질. |
| **0.22** | **herdr 노드 브릿지** 수직 슬라이스 — card dispatch · M-1 allowlist · M-2 제출 분리(당시 p16). 설계: `HERDR_DESIGN.md` (0.22 baseline). as-built 호출 형상: `spikes/HERDR-0.7.5-COMPAT.md` (0.28.1/p17). |

---

## 0.21 이전 (핵심만)

| 영역 | 버전 힌트 | 한 줄 |
|------|-----------|--------|
| 설치·DX | 0.13–0.19 | `link:loom` · `install.sh` · `doctor` |
| 내구성 | 0.14 | relay disk snapshot (roster/inbox) |
| Purpose / work bus | 0.15–0.16 | purpose · `loom work`/`watch` |
| Launcher | 0.17 | `up`/`down` · auto-host |
| Rename | 0.9–0.10 | Fable → Loom · `LOOM_*` only |

전체 게이트 이력은 `docs/PLAN.md` Changelog.

---

## 문서 정본 빠른 표 (0.28.1)

| 알고 싶은 것 | 읽기 |
|--------------|------|
| herdr 호출 형상 | `docs/spikes/HERDR-0.7.5-COMPAT.md` |
| 완료 권한·U 락 | `docs/spikes/PANE-DEATH-UNIFIED-DESIGN.md` |
| 시스템 지도 | `docs/ARCHITECTURE.md` |
| 운영 시나리오 | `docs/USER_GUIDE.md` |
| dogfood 절차 | `docs/DOGFOOD_LOOP.md` |
| 용어 | `docs/GLOSSARY.md` |
| 다음 세션 게이트 | `HANDOFF.md` · `bun run status` |

---

*유지 규칙: 제품 PATCH/MINOR ship 시 이 파일 상단에 사용자 언어 절을 추가한다. R{n} 전문 복제 금지.*
