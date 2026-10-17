# Loom Changelog

**철학 (첫 문단):** 이 파일은 리뷰 라운드 일지가 아니라, **지금 이 버전의 Loom으로 무엇이 가능해졌고 무엇이 금지됐는지**를 사용자·운영자·기여자 언어로 남긴다. 게이트 서사·R{n} 전개·커밋 나열은 `docs/PLAN.md` / `docs/plan_review.md` / `docs/reviews/`에 두고, 여기서는 **체감 변화와 깨진 습관**만 적는다.

| Field | Value |
|-------|--------|
| **문서** | `docs/CHANGELOG.md` |
| **제품 버전 SSOT** | `docs/PLAN.md` + `loom --version` (현재 **0.37.0** — shipped 2026-10-17) |
| **관련** | [USER_GUIDE](./USER_GUIDE.md) · [ARCHITECTURE](./ARCHITECTURE.md) · [HERDR-0.7.5-COMPAT](./spikes/HERDR-0.7.5-COMPAT.md) · [PANE-DEATH unified](./spikes/PANE-DEATH-UNIFIED-DESIGN.md) |

---

## 0.37.0 — 2026-10-17

**정책이 정직해진다** (업그레이드 4단계 3부) — `policy.json`이 CLI마다 실제로 얼마나 강제되는지(정직 표 — §16.4)를 이제 **오너와 워커 모두가 본다.** bridge 기동 경고 · doctor Policy 절 · 워커 첫 턴의 **정책 안내문**이 한 원천(간극 목록)에서 같은 문장으로 나온다. codex의 기본 정책은 doctor에 `not-enforced`로 보이고, codex 워커의 첫 턴은 그 사실과 금지 명령 11개를 **그대로** 말한다 — 4단계 완료 기준 (c). **안내문은 기본 켜짐**(간극이 있는 에이전트에만) · 규칙 본문은 옵트인.

### 가능해진 것

- **정책 안내문(기본 켜짐)** — headless 워커 첫 턴의 0.36 펜스 **맨 앞**에 `## Loom policy notice` 섹션: 그 에이전트의 간극마다 한 줄(`- policy shell.deny (11 rules) is not-enforced for codex — nothing blocks it. Do not run commands that match: \`curl *\`, …`). 간극 없는 에이전트는 안 받는다. 기본 bridge 설정(`agentArgv`가 claude뿐)이면 간극 **1개**(claude `network` advisory) · 세 에이전트를 모두 dispatch 가능하게 두면 **6개**.
- **규칙 본문(옵트인)** — `worker.rules: { "enabled": true }`면 `loom rules list`의 규칙(scope `all` 또는 그 에이전트 · disabled 제외 · 우선순위 순 · 16 KiB 상한)이 안내문 다음 `## Standing rules` 섹션으로 들어간다.
- **bridge 기동 경고** — 간극마다 `warning: policy … — the worker is told in its prompt; nothing blocks it` 한 줄(기동은 그대로).
- **`worker.strictEnforcement: true`** — 켜진 에이전트에 간극이 하나라도 있으면 bridge가 **기동을 거부**한다(거부 메시지 = 경고 줄들 + 고치는 법).
- **에이전트 끄기 — `worker.maxConcurrent.<agent>: 0`** — 그 에이전트 카드는 spawn 없이 `agent_disabled` 실패 결과 · 간극 · 경고 · doctor · 안내문에서 빠진다. "켜짐" = `maxConcurrent ≠ 0` **그리고** 쓸 수 있는 `agentArgv` 항목.
- **doctor Policy 절** — 정책 출처 · worker policy hash · bridge 설정(backend · 켜진 에이전트) · 에이전트별 수준 표 · 간극 warn · strict 값. 무효 `policy.json`만 `fail`(doctor exit 1 — 새 동작). Bridge · Memory 절 끝에 `worker.memory.enabled` / `worker.rules.enabled` 줄 · `loom memory list` 둘째 줄에 `memory: worker.memory.enabled = …`.
- **읽을 수 없는 저장소가 보인다** — `memory_snapshot` stderr 줄에 `read_errors N` · `entries_oversize yes`(빈 text에서도).
- **스킬 가림 라벨** — 내장 스킬을 가리는 사용자 스킬은 codex/grok 목록 줄 끝에 ` (user, shadows bundled)`.
- 스모크 `bun run smoke:policy` — dist doctor + 가짜 claude · codex · grok 카드로 ⓪~⑦(안내문 · 규칙 · `agent_disabled` · 간극 없음 = 0.36 바이트 · `AGENT_HINT.txt` · D9 · 크기/시간 측정 — 블록 ≈63–64 KB · `load_ms` 중앙값 18–20 ms) 10/10 · **실 claude · codex · grok 1카드씩**(`--real-cli --owner-approved`, 오너 승인 1회) 안내문이 든 첫 턴에 세 CLI 모두 `"ok"`.

### 바뀐 습관 (깨진 가정)

| 예전 (0.36.0) | 지금 (0.37.0) |
|---------------|---------------|
| codex가 셸 금지를 안 지킨다는 사실은 USER_GUIDE 표에만 있었다 | bridge 기동 · doctor · 워커 첫 턴이 모두 말한다 — 기억을 꺼 둬도 간극 있는 에이전트의 **새 카드** 첫 턴에 펜스 블록(안내문)이 생긴다 |
| `loom run`이 `~/.loom/AGENT_HINT.txt`를 썼다 | 안 쓴다(아무도 안 읽던 파일) · 남은 파일은 doctor info 한 줄 — Loom은 지우지 않는다 |
| `worker.maxConcurrent.<agent>`는 1 이상만 | `0` = 그 에이전트 끔 |
| doctor는 `policy.json`을 안 읽었다 | 무효 `policy.json`이면 doctor exit 1(bridge 기동 · MCP 호출도 이미 막고 있던 사실) |
| `policy.json`을 고치면 간극이 사라질 줄 알았다 | codex · grok의 `shell.deny` 간극은 **정책으로 못 없앤다**(내장 deny는 항상 합집합) — strict를 켜려면 codex · grok을 끄고 claude는 `network: true`이거나 끈다 |
| 0.36 바이너리로 내려도 설정이 그대로 | 0.36은 `worker.rules` · `worker.strictEnforcement`를 무시하고 저장 시 지운다 · `maxConcurrent` 0이면 0.36 bridge가 기동을 거부한다 |
| headless claude 카드 첫 턴에 정책 문장이 없었다 | 기본 정책(`network: false`)이면 **모든 headless claude 카드**가 첫 턴에 `- policy network (false) is advisory for claude — the CLI blocks only some forms. Do not access the network.`를 받는다(claude `network` advisory 간극) — 설치 · 내려받기를 사양할 수 있다 · `policy.json`에 `"network": true`면 이 줄이 사라진다 |
| doctor가 bridge 설정 없이도 조용했다 | bridge 설정이 **아예 없으면** doctor Policy 절은 모든 에이전트가 켜졌다고 가정해 실제로 안 돌릴 수 있는 워커까지 간극 warn **6줄**을 보인다(exit code 무변경 — Deviation (50)) · 설정 없이 실제로 뜨는 bridge는 pane backend라 간극 0 |

### 불변

- 와이어 · `PROTOCOL_VERSION` · `CARD_CONTRACT_VERSION` · 표지 · `ARGV_TEMPLATE_VERSION` · hint · argv · 완료 권한 · `policy.json` 스키마 · `policyHash` · 기억 저장소 형식 · MCP 게이트 무변경 · `packages/protocol` · `agent-argv.ts` · `policy-compile.ts` · `policy.ts` diff 0 · pane backend · sticky host · relay 무변경. **원천 없음(기억 꺼짐 · 규칙 꺼짐 · 간극 없는 정책)이면 첫 턴은 0.36과 바이트 같다.**
- **정직 고지(설계상 수용 손실):** 안내문은 **권고** — codex는 여전히 금지 명령을 실행할 **수 있다**(UK-2 — 실 응답 `"ok"` ×3은 관찰일 뿐 준수 증거가 아니다) · 위조된 안내문/규칙 섹션은 진짜와 구별되지 않는다 · strict 거부는 서비스에서 10초마다 재시작 루프 · 끝났지만 아직 결과를 안 보낸 카드의 에이전트를 끄면 진짜 결과 대신 `agent_disabled` — **끄기 전에 `loom bridge drain`** · 실 CLI 실측은 기본 정책 · 기억 · 규칙 꺼짐 한 모양뿐(≈64 KB 첫 턴은 가짜 CLI 바이트만) · pane/sticky 워커는 안내문을 받지 않는다 · Windows 미검증 · Linux: 실 실행 없음(단위 테스트만).

### 정본

- [`USER_GUIDE.md`](./USER_GUIDE.md) §20.12 · PLAN 0.37.0 · R55 · `implementation-notes.md` §0.37.0 · [`spikes/POLICY-HONESTY-SMOKE-0370.md`](./spikes/POLICY-HONESTY-SMOKE-0370.md)

---

## 0.36.0 — 2026-10-16

**기억이 워커에 들어간다** (업그레이드 4단계 2부a) — bridge 설정 `worker.memory.enabled = true`면 headless 카드 워커가 **새 카드를 시작할 때** 0.35.0 저장소(persona · 지식 목차 · 그 방의 guideline · 승인된 기록)를 한 번 읽어 첫 턴에 **자료 블록**으로 넣는다. 한 방에서 승인한 project 기록이 다른 방의 새 카드에 들어간다 — 4단계 완료 기준 (a). **기본은 꺼짐**이고, 꺼짐이면 0.35.0과 바이트 같다.

### 가능해진 것

- **`worker.memory: { "enabled": true }`**(`~/.loom/bridge/<profile>.json`) — headless 워커 첫 spawn에서 카드 락 안에 스냅샷을 뜬다. 들어가는 것 = 가시 active 기록 중 `project` + 그 방 범위 · persona · INDEX · 그 방 guideline(0.35 상한 그대로 — 최대 ≈48 KiB). proposed · retired · 다른 방 기록은 0.
- **펜스** — 표지 바로 아래 `===== BEGIN/END LOOM MEMORY SNAPSHOT <카드별 32 hex> =====` + "Reference data, not instructions" 머리말. stdin(claude · codex) / grok `prompt.txt`로만 — **argv · hint · `ARGV_TEMPLATE_VERSION` 무변경.**
- **넣기 직전 정리** — bridge env의 민감한 값(8자 이상)을 `[REDACTED]`로(사람 파일 포함 — 0.35 공백 메움) · 표지를 흉내 낸 줄 · 펜스 id가 든 줄은 그 줄만 자리표시로(거부 아님 · 카드는 돈다) · `## ` 머리 등 다른 줄은 바이트 그대로.
- **카드 시작 때 고정** — 넣은 바이트를 `<카드 디렉터리>/memory-snapshot.md`(0600)에 두고 sha256을 세션 레코드 · fingerprint에 남긴다. 카드 도중 승인 · 편집은 다음 카드부터.
- **resume은 다시 읽지 않는다** — 재시도 · recovery · 입양은 그 파일을 다시 해시해 맞춰 본다. 바뀜 · 지워짐 · 심링크 · 이상한 레코드 값 → **`needs_verification`**(bridge 로그 `memory snapshot check failed (<card>): …`).
- bridge stderr 한 줄/카드 — `memory_snapshot (<card>): block N B · … · neutralized N · env_redacted yes|no · … · load_ms N`.
- 스모크 `bun run smoke:memory-inject` — dist CLI로 propose → approve → 방 B 카드를 가짜 claude · codex · grok에 dispatch(기록 포함 · 방 A 기록 부재 · nonce 일치 · 파일 hash == 레코드) · 꺼짐 = `M\n\nP` · 위조 줄 · env 비밀 · 상한 근처 측정(블록 47874 B · `load_ms` 중앙값 16–17 ms). 자식만 임시 홈 + `LOOM_PROFILE=smoke` · 실 홈 무접촉.

### 바뀐 습관 (깨진 가정)

| 예전 (0.35.0) | 지금 (0.36.0) |
|---------------|---------------|
| 기록 · persona를 써도 워커는 모른다 — 핸드오프 본문 · pack으로 넘겼다 | `worker.memory.enabled`를 켜고 bridge를 다시 띄우면 **새 카드**의 첫 턴에 들어간다(이미 시작한 카드는 그대로) |
| skills 꺼진 headless bridge에서 fingerprint가 다르면 조용히 새 세션으로 다시 시작하는 갈래가 있었다 | skills 켜짐 · 꺼짐 모두 **`needs_verification`**(D9) — 실제로 드러나는 경우는 드물다(recovery · 입양은 0.35에서도 이미 그랬다) |
| 셸에서 친 `loom memory add`가 어느 저장소에 가든 워커와 무관했다 | **기록을 쓴 프로필 = bridge 프로필**이어야 들어간다. 서비스 bridge는 유닛에 `LOOM_SESSION`을 고정하므로 `loom memory add --profile <서비스 프로필>`로 쓴다 |
| 0.35 bridge 설정에 모르는 키는 없었다 | 0.35 바이너리로 내리면 `worker.memory`는 **조용히 무시**되고, 0.35가 설정을 저장하면 그 키가 지워진다 — 다시 올린 뒤 다시 넣는다 |

### 불변

- 와이어 · `PROTOCOL_VERSION` · `CARD_CONTRACT_VERSION` · 표지 · `ARGV_TEMPLATE_VERSION` · hint · argv · 완료 권한 · 저장소 형식 · `loom memory` CLI · doctor 무변경 · `packages/protocol` · `policy-compile.ts` · `skill-materialize.ts` · `memory-snapshot.ts` diff 0 · pane backend · sticky host · relay 무변경 · drain 불요(템플릿 버전 그대로).
- **정직 고지(설계상 수용 손실):** 펜스는 **권고** — 기억 문장이 워커를 움직일 수 있다 · 닮은 글자(키릴 · 그리스)로 쓴 표지 흉내는 못 잡는다 · 저장소를 못 읽으면 빈 저장소와 같은 로그 줄 · 워커 출력은 걸러내지 않는다 · 첫 spawn마다 동기 읽기(≈20 ms 실측) · **실 claude/codex/grok이 ≈48 KiB 첫 턴을 받는지 · 펜스를 지키는지는 실측 전**(실 CLI 실행은 오너 승인 게이트) · 규칙(rules) 본문 · 워커의 기억 제안 · 카드 메모 · doctor 켜짐 표시는 0.37.0.

### 정본

- [`USER_GUIDE.md`](./USER_GUIDE.md) §20.11 · PLAN 0.36.0 · R54 · `implementation-notes.md` §0.36.0 · [`spikes/MEMORY-INJECT-SMOKE-0360.md`](./spikes/MEMORY-INJECT-SMOKE-0360.md)

---

## 0.35.0 — 2026-10-16

**기억 · 규칙 · 스킬 저장소** (업그레이드 4단계 1부) — 에이전트별 장기 기록 · persona · 방 규칙(guideline) · 공통 지식 목차 · 되도록-규칙을 `~/.loom` 아래에 두고, 사람이 `loom memory`로 쓰고 · 승인하고 · 정리한다. **아직 어느 워커 프롬프트에도 들어가지 않는다** — 카드 시작 스냅샷 + 주입은 0.36.0이다.

### 가능해진 것

- **`loom memory add | propose | approve | retire | compact | list | show`** — `memory/<agentKey>/entries.jsonl`(0600 · append-only)에 사실 · 결정 · 선호를 쓴다. `add` = 바로 active · `propose` → `approve` = 승인 뒤 active · `retire` = 내림 · `--supersedes <id>` = 고쳐 쓰기(새 기록이 한 번 승인되면 옛 기록을 가림) · `--room <roomId>` = 그 방에만. `agentKey` = `<claude|codex|grok>.<프로필>`(이상한 프로필 이름은 해시형).
- **줄 순서를 섞어도 같은 결과** — 각 줄에 저장소 로컬 `seq`를 붙이고 `(seq, id)` 순서로 다시 접는다. 파싱 못 하는 줄 · 충돌 · 대상 없는 전이는 오류가 아니라 **카운터**(unparseable · conflicts · dangling)로 보인다.
- **쓰기 안전** — 본문 2000자 · 에이전트당 보이는 active 200 · proposed 200 · `entries.jsonl` 1 MiB(넘으면 add/propose만 거부 — approve · retire · compact는 항상 동작) · **비밀처럼 보이는 본문은 거부**(문구가 본문·비밀을 다시 찍지 않음) · 쓰기마다 에이전트 저장소 락(4초 넘게 잡혀 있으면 `store busy` exit 1, 아무것도 안 씀).
- **`loom memory compact`** — retired · 가려진 기록 · 파싱 못 한 줄 · 충돌 패자를 `entries.archive.jsonl`로 옮기고(아카이브 먼저 → 원자 교체) 워터마크 한 줄을 남긴다. 보이는 기록은 전후 같다.
- **`loom rules list`** — 내장 규칙 1개(`report-blockers`)와 `~/.loom/rules/*.md`(front-matter `id` · `scope` · `priority`) — 같은 id면 사용자 파일이 내장을 대체 · 빈 본문 = 끔 · 무효 파일은 `invalid:` 줄.
- **`loom skills list`** — 내장 + `~/.loom/skills/` 스킬의 출처 · 가용성 · **`user shadows builtin`**(같은 이름이면 사용자 쪽이 이김 — 깨졌어도) · `--room`이면 그 방이 고른 스킬.
- **`loom doctor` Memory 절** — 저장소 루트 · 에이전트별 건수/상한/카운터 · persona · INDEX · guideline · rules 상태. 읽기 전용 · ok/warn/info만 — doctor exit 코드 그대로.
- persona.md · `rooms/<roomKey>/guideline.md` · `knowledge/INDEX.md` · `rules/*.md`는 **편집기로** 쓴다 — `memory list`가 경로와 크기/상한(8 · 16 · 8 · 8 KiB)을 보여 준다.
- 스모크 `bun run smoke:memory`(dist CLI로 add → … → compact → 줄 섞기 → 락 → rules/skills → doctor · 자식만 임시 홈 · 실 `~/.loom` 무접촉).

### 바뀐 습관 (깨진 가정)

| 예전 (0.34.0) | 지금 (0.35.0) |
|---------------|---------------|
| 방을 넘어 이어지는 기록을 둘 자리가 없다 — pack · purpose는 방마다, MCP로만 | 에이전트별 저장소 `memory/<agentKey>/` — `project` 범위 기록은 그 에이전트의 모든 방에 해당(주입은 0.36) |
| 스킬 이름이 겹치면 조용히 사용자 쪽이 이겼다 | `loom skills list`가 `user shadows builtin`으로 보여 준다 |
| 프로필을 정하지 않아도 별 차이가 없었다 | 기억 저장소 키가 프로필을 따른다 — `--profile`/`LOOM_PROFILE` 없이 displayName을 바꾸면 다른 저장소를 본다. **오래 쓸 기억은 `LOOM_PROFILE` 고정** |
| `redactSecrets`가 긴 URL 꼴 문자열(수십 KiB)에서 매우 느렸다(O(n²)) | 선형 시간 · 출력은 바이트 동일 |

### 불변

- 와이어 · `PROTOCOL_VERSION` · `CARD_CONTRACT_VERSION` · 완료 권한 · 워커 argv/fingerprint · `ARGV_TEMPLATE_VERSION` · 프롬프트(`agent-argv.ts` · `policy-compile.ts` · `headless-worker.ts` · `packages/protocol` diff 0) · bridge 런타임(`BRIDGE_VERSION` 한 줄 외) · MCP 도구(기억 도구 없음 — 버전 문자열 외) · sticky host · relay 무변경. `entries.jsonl` v1은 로컬 파일 형식이며 와이어가 아니다.
- **정직 고지(설계상 수용 손실):** 기록 · 규칙 · persona · guideline · INDEX는 **아직 워커에 들어가지 않는다**(0.36) · redaction 오탐(`token: …` 꼴 평문) · 사람 파일은 env 값 redaction을 받지 않는다(0.36이 주입 직전 처리) · codex 셸 deny는 여전히 미강제 · 아카이브는 무상한·아무도 읽지 않음 · knowledge 주제 파일은 읽지 않음 · Windows 모드 비트 무효.

### 정본

- [`USER_GUIDE.md`](./USER_GUIDE.md) §20 · PLAN 0.35.0 · R53 · `implementation-notes.md` §0.35.0 · [`spikes/MEMORY-SMOKE-0350.md`](./spikes/MEMORY-SMOKE-0350.md)

---

## 0.34.0 — 2026-10-16

**`loom service` — 로그인 시 bridge 자동 기동** (업그레이드 3단계 2부 — 3단계 완료) — 프로필 bridge를 macOS launchd 에이전트 / Linux `systemd --user` 유닛으로 등록해 재부팅·로그아웃·크래시 뒤에도 사람 손 없이 다시 뜨게 한다.

### 가능해진 것

- **`loom service install [--force]`** — 등록 + 기동 + 실행 확인(≤12초). 유닛은 절대 bun · 절대 `bridge-main.ts` · env 다섯 키(`HOME` · 설치 때 `PATH` · `LOOM_SESSION` · `LOOM_PROFILE` · `LOOM_SERVICE=1`)만 — **토큰 0**. stderr는 `~/.loom/bridge/<p>.stderr.log`에 append(0600). 실패하면 10초 조절 재시작, exit 0(요청 정지)은 다시 띄우지 않는다. 서비스 stop은 bridge main에만 SIGTERM — headless 워커는 살아 남아 입양된다.
- **설치 가드** — 루프백 relay · env에만 있는 토큰(`LOOM_RELAY_TOKEN`/`FABLE_RELAY_TOKEN`) · 빈 `authorizedDispatchers` · 남의 파일 · 사람이 띄운 bridge · 서비스 이름으로 못 쓰는 프로필 이름 → exit 1. 다시 실행은 안전(같으면 무동작 · 바뀌면 내리고 다시 올림 · 진행 중 작업이 있으면 `--force` 필요).
- **exit 3 `written; loads at next login`** — ssh처럼 GUI 세션/사용자 버스가 없으면 파일만 남기고 다음 로그인에 뜬다.
- **`loom service start | uninstall | status`** — start는 `kickstart`(`-k` 없음 — 실행 중이면 무동작) / `systemctl --user start` · uninstall은 내리고 파일·심링크 삭제(미설치 = exit 0) · status는 읽기 전용 · 항상 exit 0.
- **`loom doctor` Service 절** — 설치 · 적재/실행 · Login Items 비활성 · bun/`bridge-main.ts` 경로 · PATH 표류 · srcPath 3자 비교 · 로그 모드 · linger(Linux) · 루프백 relay · 양보 / 서비스 밖 bridge. 읽기 동사만(각 ≤2초, 멈춘 자식은 CLI 종료 전에 회수) · ok/warn/info만 — doctor exit 코드 그대로.
- 가짜 서비스 관리자 스모크 `bun run smoke:service`(install → 재설치 무동작 → status → doctor → exit 3 → uninstall · 실 홈 무접촉). 실 launchd 라이브 스모크는 `--live` + `LOOM_SERVICE_LIVE_SMOKE=1`로 구현만 — **아직 돌리지 않았다(오너 승인 대기)**.

### 바뀐 습관 (깨진 가정)

| 예전 (0.33.0) | 지금 (0.34.0) |
|---------------|---------------|
| 재부팅·로그아웃 뒤 bridge는 사람이 `bridge start`를 칠 때까지 꺼져 있다 | `service install`한 프로필은 로그인 때 뜨고 실패하면 10초 뒤 다시 뜬다 |
| 같은 프로필 락이 잡혀 있으면 bridge는 항상 exit 1 | **`LOOM_SERVICE=1`일 때만** 살아 있는 보유자에게 **exit 0으로 양보**(`yield to bridge pid N`) — 서비스는 `service start`까지 내려가 있다. 수동 기동은 0.33.0 그대로 exit 1 |
| 업그레이드 = `bridge drain` → 갱신 → `bridge start` | 서비스 프로필은 `bridge drain` → 갱신 → **`service start`**(drain의 exit 0 뒤 서비스 관리자는 다시 띄우지 않는다). 소스·bun 경로가 바뀌면 `service install` 다시 |
| 세션 `displayName`이 빈 문자열이면 `bridge status`/`stop`/`drain`이 프로필을 빈 이름으로 다뤘다(표시 · 상태 파일 경로) | 프로필 이름은 어디서나 `resolveBridgeProfile()` 하나(R13) — 빈 `displayName` → `default` |
| bridge의 PATH = 띄운 셸의 PATH | 서비스 bridge의 PATH = **install 때 캡처한 PATH** — 에이전트 CLI를 옮기면 재설치(doctor PATH 행) |

### 불변

- 와이어 · `PROTOCOL_VERSION` · `CARD_CONTRACT_VERSION` · 완료 권한 · 워커 argv/fingerprint(`agent-argv.ts` · `policy-compile.ts` · `headless-worker.ts` · `process-group.ts` diff 0) · bridge 런타임(`BRIDGE_VERSION` 한 줄 외) · sticky host · relay 무변경. 정지·비우기는 여전히 `loom bridge stop|drain` — 서비스에 stop/restart 동사는 없다.
- **정직 고지(설계상 수용 손실):** 로그아웃은 워커까지 정리한다(macOS 공통 · Linux는 linger 없을 때 — Loom은 linger를 켜지 않는다) · macOS Login Items에 **"Jarred Sumner"**(bun 서명자)로 보이고 사용자가 끌 수 있다(Loom은 다시 켜지 않는다) · pane backend는 herdr가 없으면 10초마다 크래시 루프 · 서비스 로그는 회전하지 않는다 · 네트워크 준비 순서 없음 · 사용자 범위만(Windows 밖). 실 launchd/systemd 등록 라이브 · ssh 실제 코드 · Linux 전부는 **미실측**.

### 정본

- [`USER_GUIDE.md`](./USER_GUIDE.md) §19 · PLAN 0.34.0 · R52 · `implementation-notes.md` §0.34.0 · [`spikes/SERVICE-SMOKE-0340.md`](./spikes/SERVICE-SMOKE-0340.md)

---

## 0.33.0 — 2026-10-16

**bridge 생명주기 보강** (업그레이드 3단계 1부) — 카드를 돌리는 bridge가 프로필당 하나만 돌고, 신호에 우아하게 멈추고, 돌던 카드만 끝내고 내릴 수 있고, 꺼진 뒤에도 왜 꺼졌는지 보인다.

### 가능해진 것

- **프로필 락** `~/.loom/bridge/<profile>.lock/` — 같은 프로필 두 번째 bridge는 `bridge already running for profile <p> (pid N, …)`로 exit 1. 죽은 보유자(또는 pid 재사용)의 stale 락은 다음 기동이 회수한다(신호 0).
- **우아한 정지** — SIGTERM · SIGINT · RPC `stop` → `stopping` → 정리(10초 상한) → `stopped` → **exit 0**. headless 워커는 살아 남아 다음 기동이 입양한다. `stopping` 중 두 번째 신호 = 즉시 종료.
- **`loom bridge drain [--timeout <s>]`**(기본 600초) — 새 claim을 멈추고(relay inbox에 남김) 실행 중 pane 카드·conv·headless 카드가 끝나면 정지 · 마감에 닿아도 exit 0 · 멱등.
- **상태 파일** `~/.loom/bridge/<profile>.status.json` — 5초 하트비트 · `state` · `herdr` · 진행 건수 · `stoppedAt` · `lastError` · `version`/`srcPath`. 정지 뒤에도 남는다(토큰 없음).
- **`loom doctor` Bridge 절** — pid 생존 · 하트비트 신선도(15초) · 죽은 bridge · 못 읽는 상태 파일 · 락 보유자 · 로그 경로. ok/warn/info만 — doctor exit 코드는 그대로.
- **꺼진 `loom bridge status`** — `bridge: offline` 뒤에 상태 파일 요약(state · lastError · 로그 경로).
- **headless bridge는 herdr 없이 뜬다** — `worker.backend:"headless"`면 herdr 연결 0 · `herdr: skipped (headless)`.
- 실 spawn bridge 스모크 `bun run smoke:bridge-lifecycle`(SIGTERM · 이중 기동 · drain · SIGKILL→doctor→회수).

### 바뀐 습관 (깨진 가정)

| 예전 (0.32.0) | 지금 (0.33.0) |
|---------------|---------------|
| 같은 프로필 bridge 둘이 동시에 뜰 수 있었다(문서상 "하나만 띄운다") | 두 번째는 **기동 거부**(exit 1, 보유자 pid) |
| SIGTERM = 정리 없이 죽음(meta·격리 기록 잔존) | SIGTERM = 정리 후 exit 0 |
| `loom bridge stop` 3초 뒤 SIGTERM | RPC `stop`이 ok면 **최대 12초** 대기 |
| `--profile` 없이 띄우면 로그가 `~/.loom/bridge/default.stderr.log` | 프로필 이름 하나로 통일(활성 프로필 → 세션 displayName → `default`) — 로그 · 락 · 상태 파일 모두 `<displayName>.*` |
| headless bridge도 herdr 필수 · conv는 pane으로 돌았다 | headless bridge는 herdr를 안 쓰고 **conv.open을 `conv_unavailable_headless`로 거절**(한 번 claim 후 거절) — conv는 pane backend bridge로 |

### 불변

- 와이어 · `PROTOCOL_VERSION` · `CARD_CONTRACT_VERSION` · 완료 권한 · 워커 argv/fingerprint(`agent-argv.ts` · `policy-compile.ts` diff 0) · sticky host · relay 무변경. `drain`은 bridge 로컬 RPC, 거절 사유는 기존 conv reject 스키마의 문자열.
- **정직 고지(설계상 수용 손실):** 정지·drain 마감 때 진행 중 pane 카드·conv는 잃는다(메모리 flight) · 업그레이드 전 headless 워커는 옛 코드로 끝난다 · SIGKILL 복구는 오늘 그대로(doctor `warn` + 다음 기동 회수) · 두 번째 신호 뒤 상태 파일은 `stopping`에 남는다 · grok 긴 카드(~9분)는 기본 600초 drain에 잘릴 수 있다 — `--timeout 1200` · Linux `ps -o lstart=` 형식은 미실측.

### 정본

- [`USER_GUIDE.md`](./USER_GUIDE.md) §18 · PLAN 0.33.0 · R51 · `implementation-notes.md` §0.33.0 · [`spikes/BRIDGE-LIFECYCLE-SMOKE-0330.md`](./spikes/BRIDGE-LIFECYCLE-SMOKE-0330.md)

---

## 0.32.0 — 2026-10-16

**Loom MCP 사전 점검** — 대화형 `loom run` 에이전트가 Loom 도구로 보드·인계·conv를 바꾸기 전에 Loom 서버가 `policy.json`으로 검사한다.

### 가능해진 것

- **`policy.json` `mcp.deny`에 `loom__<tool>`** — 그 Loom 도구를 목록에서 숨기고, 이름으로 불러도 거부한다(0.31.0까지는 Loom 자신의 서버가 이 항목을 무시했다).
- **`loomTools.denyModes`** — 인자 단위로 위험한 모드를 끈다: `board.replace`(내장 기본) · `broadcast` · `conv.writes` · `conv.fetch` · `pack.embed`. 내장과 합집합이라 정책으로 풀 수 없다.
- **`loomTools.done: "propose"`**(옵트인) — MCP로 `done` 찍기(`update_task`·`add_task`·done 카드를 담은 `import_board`·reason 없는/`done` `conv_close`)를 거부하고 사람 경로 `loom board set <id> done`을 안내한다. 기본 `allow`는 0.31.0처럼 허용하되 감사 기록을 남긴다.
- **룸별 로컬 감사 파일** `~/.loom/rooms/<roomKey>/policy-audit.jsonl` — 거부 · MCP발 done · L-2 불일치를 ID만으로(인자 본문 없음) 기록, 1 MiB마다 회전 · 최신 3세대 유지.
- **L-2 플래그** — 원격 결과를 보낸 peer가 디스패치 대상과 다르면 카드에 `l2Mismatch: true`(결과는 그대로 `blocked`, 거부 아님).
- 거부 문구가 claude · codex · grok 모두에서 모델에게 그대로 보이는 것을 실측했다(USER_GUIDE §17.7 정직 표).

### 바뀐 습관 (깨진 가정)

| 예전 (0.31.0) | 지금 (0.32.0) |
|---------------|---------------|
| MCP 인자는 광고만 하고 강제 변환(`"false"`도 참) | **엄격 검사** — 타입 오류 · 광고하지 않은 키 → `Loom pre-check refused <tool>: invalid arguments at …`(예: `set_purpose`의 `verify`) |
| `import_board mode=replace`가 MCP로 됨 | **기본 거부** — `mode=merge` 또는 사람이 `loom board import --replace <file>` |
| `policy.json`은 헤드리스 bridge만 읽음 | Loom MCP 서버도 **호출마다** 읽는다(재시작 불요). 무효 파일이면 모든 Loom 도구 호출이 이유와 함께 거부되고 서버는 계속 산다 |
| `loomTools` 키 | 0.31.0 바이너리는 모르는 키로 **기동 거부** — bridge까지 0.32.0으로 올린 뒤 넣는다 |

### 불변

- 와이어 · `PROTOCOL_VERSION` · `CARD_CONTRACT_VERSION` · 완료 권한(원격 결과 = `blocked`) · 헤드리스 워커 argv/fingerprint(`0.31.0-v1`) · pane 경로 무변경. `loomTools`를 넣어도 실행 중 헤드리스 카드에 `fingerprint_changed`가 생기지 않는다.
- **정직 고지:** 기본 `allow`는 "에이전트가 done을 선언하지 못한다"의 준수가 아니라 이월이다(7단계에서 전환). `propose`도 MCP 층만 막는다 — 에이전트 셸의 `loom board set` 우회는 남는다. codex는 MCP 호출마다 승인을 요구한다(오너 `approval_mode` 설정 없을 때) · grok은 묻지 않는다 · claude는 오너 권한 모드에 따른다.

### 정본

- [`USER_GUIDE.md`](./USER_GUIDE.md) §17 · PLAN 0.32.0 · R50 · `implementation-notes.md` §0.32.0 · [`spikes/MCP-PRECHECK-SMOKE-0320.md`](./spikes/MCP-PRECHECK-SMOKE-0320.md)

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
