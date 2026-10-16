# Unknowns — 지도 ≠ 영토

| Field | Value |
|-------|--------|
| **Document** | `docs/UNKNOWNS.md` |
| **Role** | 미지 템플릿 + 게이트별 **짧은** 표 |
| **SSOT** | **아님** — 제품 계획 SSOT는 `docs/PLAN.md` |
| **Workflow** | `docs/WORKFLOW.md` **§3.5** |
| **Last updated** | 2026-10-16 |

---

## 왜 있는가

프롬프트·PLAN·스킬은 **지도**다. 코드·보안·툴체인·실제 UX는 **영토**다.  
그 간극이 **미지(unknowns)** 이고, 에이전트는 여기서 추측 결정을 한다.

이 파일은 미지를 **값싸게** 드러내기 위한 체크리스트다.  
규칙 본문: WORKFLOW §3.5.

| 이름 | 의미 |
|------|------|
| **Loom** | 제품 |
| **Fable 5 / fable-advisor** | 리뷰 에이전트 |
| **Unknowns** | 작업 방법론 (제품명 아님) |

---

## 템플릿 (게이트마다 복사)

```markdown
## 0.X.Y — <한 줄 제목>
| 분면 | 내용 |
|------|------|
| Known knowns | … |
| Known unknowns | … |
| Unknown knowns | … |
| Unknown unknowns | … |
```

---

## Gate log

### 0.35.0 — memory / rules / skills 저장소 + CLI + 순수 스냅샷 리더 (`approved` — R53 approved-with-fixes)

| Field | Value |
|-------|-------|
| **PLAN** | v0.35.0 (`approved` — R53 approved-with-fixes, 반영 완료 · no R53b) · 업그레이드 4단계 1부 · 요구 `UPGRADE-PLAN.md` 4단계 · 기억 관리 · 규칙 관리 · 스킬 관리 · 범위 = 락 D1~D10(아키텍트 + fable-advisor 자문 2026-10-16 — D9 · D10은 0.36.0 기록용) · 워커·프롬프트·bridge 변경 0(D1) · 4단계 2부 = 0.36.0(카드 시작 스냅샷 + 펜스 주입) |
| **Date** | 2026-10-16 |
| **Review** | R53 **done 2026-10-16** (새 MINOR + 신규 제품 표면 + 영속성·신뢰 경계 — 0.36에서 프롬프트로 들어갈 저장소의 형식 · 쓰기 안전 · 승인 상태기계 · 경로 규약) |
| **Evidence** | 코드 실측 `main @ dbab890` (PLAN §0.35.0 Why · 추정/실측 표) · `packages/relay/src/room.ts:167-168`(룸별 seq) · `agent-argv.ts:18` · `:28-36` · `:279` · `atomic-json.ts:22-24` · `:190-209` · `room-event-log.ts:125-141` · `:518-551` · `card-session-store.ts:83-123` · `context-pack.ts:67-73` · `result-quarantine.ts:106-147` · `redact.ts:87-98` · `protocol/src/sanitize.ts:18` · `skill-materialize.ts:47` · `:109-120` · `:708-728` · `session-store.ts:72` · `:79-83` · `:179` · `bridge-spawn.ts:40-45` · `bridge-runtime.ts:878` · `:1106-1111` · `headless-worker.ts:110-127` · `cli/src/service.ts:295` · `cli/src/index.ts:362-397` · `:3389-3395` · `doctor.ts:3` · `:695` |

| 분면 | 내용 |
|------|------|
| Known knowns | 코드 실측(`dbab890`): (1) `rules/` · `memory/` · `knowledge/`를 읽거나 쓰는 코드 0 · 헤드리스 워커는 Loom MCP 없음(`agent-argv.ts:28-36`). (2) relay seq는 룸별 · 미스탬프 0(`room.ts:167-168`) — 전순서 아님. (3) `roomKey` = sha256(roomId)[:16] · 카드 디렉터리 = 해시(`room-event-log.ts:125` · `card-session-store.ts:83-123`). (4) `withFileLock` 동기 · 대기 4초 · stale 5초 · 타임아웃 = 일반 Error(`atomic-json.ts:22-24` · `:190-209`). (5) JSONL append 끝 개행 수선 선례(`room-event-log.ts:518-551`). (6) 격리 fold는 torn을 마지막 줄만 셈(`result-quarantine.ts:117-127`). (7) `redactSecrets` env 생략 = `process.env`(`redact.ts:87-91`) · `sanitizePeerText`는 CR 제거. (8) 사용자 스킬 항목은 깨졌어도 내장을 가림(`skill-materialize.ts:708-728`) · 목록 CLI 없음. (9) `loomDir()` 캐시·이주(`session-store.ts:72` · `:179`). (10) `HeadlessDeps`에 profile 없음(`headless-worker.ts:110-127` — C1). |
| Known unknowns | **UK-1~UK-6**(아래 표, 정본 = PLAN §0.35.0). 요지: 0.36 profile 전달(C1) · redaction 오탐률 · 스냅샷 크기 예산 · 규칙 scope/priority 의미 · 동기 리더 핫 경로 비용 · Windows. |
| Unknown knowns | 업그레이드 계획의 "1단계 순번(seq)으로 최신 판단"은 relay seq가 룸별이라 성립하지 않는다 — 저장소 로컬 seq + `(seq, id)` fold(D2). `rooms/<roomId>/` · `cards/<cardId>/` 문면은 기존 해시 규약과 충돌한다(D3). 리더가 `redactSecrets`를 env 없이 부르면 `process.env`를 읽어 순수하지 않다(R10). sanitize가 CR을 지우므로 "sanitize가 바꾸면 거부"는 붙여넣은 본문을 전부 막는다(R7). compact가 대체된 기록을 옮겨도 대체자는 dangling이 아니라 **아카이브 참조**(`supersedesArchived` · `archivedRefs` — info)로 센다 — 고정점으로 대상을 붙잡으면 대체 사슬이 줄지 않아 1 MiB 쓰기 거부가 풀리지 않고, "active 대체자만 가림"이면 retire가 옛 기록을 되살려 compact 전후 가시 집합이 달라진다(R9 · R53-M1). 스모크가 자기 HOME을 임시로 요구하면 실 셸에서 돌 수 없고 실 홈 비교도 못 한다 — 임시 env는 자식에게만(R53-M2). 사람이 쓰는 파일은 쓰기 검사가 없어 env 값 redaction을 받지 않는다(R53-L3). 프로필 이름은 임의 문자라 경로가 될 수 없고 macOS는 대소문자를 무시한다(R1). |
| Unknown unknowns | 사람이 실제로 쓰는 기록의 양·길이 분포 · 여러 프로필이 같은 `~/.loom`을 쓸 때 knowledge·guideline 공유가 낳는 혼란 · 0.36 주입 뒤 에이전트가 기억을 지시로 오인하는 정도 · 손편집이 만드는 이상 줄의 실제 빈도 · 편집기 임시 파일(`.md~` · `.swp`)이 `rules/`에 남는 경우. |

**Unknowns 요약 (정본 = PLAN §0.35.0):**

| # | 요지 | 출발 기본값 / 착수 영향 | R53 판정 |
|---|------|-------------|----------|
| UK-1 | 0.36 배선 때 profile 전달(C1) — `HeadlessDeps.profile` 추가 외 sticky host·pane 경로의 profile 해석 | 0.35는 `agentKeyFor(profile, …)`만 고정 · 배선 0 | **open, 비차단** |
| UK-2 | redaction 오탐률(`token: …` · `password = …` 꼴 평문) | 0.35 = 사람이 고쳐 씀(계급 6) · 문구가 이유를 말함 | **open, 비차단** |
| UK-3 | 스냅샷 크기 예산(persona 8 · INDEX 8 · guideline 16 · Memory 16 KiB)이 세 CLI 첫 턴 본문에 맞는지 | 0.36 PLAN이 실측 뒤 상한 조정 가능(형식 무변경) | **open, 비차단** |
| UK-4 | 규칙 `scope`(`all\|claude\|codex\|grok`) · `priority` 의미가 5단계 프롬프트 조립과 맞는지 | 규칙 배선 0 · 키 추가로 흡수 | **open, 비차단** |
| UK-5 | 동기 `loadMemorySnapshot`의 0.36 `spawnOnce` 핫 경로 비용(최대 4 MiB fold) | 0.35 미배선 · 0.36이 측정 후 async 래퍼 결정 | **open, 비차단** |
| UK-6 | Windows — 모드 비트 · `withFileLock` · 심링크 판정 | 0.24.2 플랫폼 조건부 선례 · 테스트는 macOS/Linux | **open, 비차단** |

**Current decision:** D1~D10 아키텍트 락(아키텍트 + fable-advisor 자문 2026-10-16 — D9 · D10은 0.36.0 기록용) · 작성자 정밀화 R1~R16 · 락↔코드 불일치 C1(profile이 `HeadlessDeps`에 없음 — 0.36에서 필드 추가) · 수용 손실 계급 1~9 + 무번호 3행 · UK-1~UK-6 · 4단계 완료 기준 (c) 옵션 ii 체크리스트로 재정의(0.36 인도). **R53 `approved-with-fixes` → M1·M2·L1·L2·L3 PLAN 반영 → PLAN `approved`(2026-10-16, no R53b)** · R1~R16 수용(R5·R9→M1 · R7→L1 · R1→L2) · C1 수용(0.35 변경 없음) · UK-1~UK-6 비차단. **Next = P1**(순수 코어, red = 테스트 파일만).

### 0.34.0 — `loom service` launchd/systemd 사용자 서비스 설치 (`approved` — R52 approved-with-fixes · implemented 2026-10-16)

| Field | Value |
|-------|-------|
| **PLAN** | v0.34.0 (`approved` — R52 approved-with-fixes, 반영 완료 · no R52b) · 업그레이드 3단계 2부 · 요구 `UPGRADE-PLAN.md:81-85` · 범위 = §0.33.0 "다음 후보" + 락 D1~D8(아키텍트 + fable-advisor 자문 2026-10-16) · 실 OS 등록·라이브 스모크는 별도 오너 명시 승인 |
| **Date** | 2026-10-16 |
| **Review** | R52 **done 2026-10-16** (새 MINOR + 신규 제품 표면 + 영속성·신뢰 경계 — Loom 프로세스의 OS 서비스 등록 · 유닛 내용(토큰 0 · env 고정) · 서비스 stop의 워커 생존(`KillMode=process`)) |
| **Evidence** | 코드 실측 `main @ 0a20173` (PLAN §0.34.0 Why · 추정/실측 표) · `bridge-main.ts:28-31` · `:52-55` · `:68-69` · `bridge-lock.ts:76-85` · `:226-240` · `:425-436` · `bridge-spawn.ts:28` · `:68-75` · `:132` · `:137` · `:150-152` · `:161` · `bridge-config.ts:99-104` · `:112-113` · `session-store.ts:269-282` · `:408` · `headless-worker.ts:241-251` · `process-group.ts:96-102` · `doctor.ts:363` · `:470` · lessons `tasks/lessons/platform.md:136-151`(systemd HOME 미상속 크래시 루프) · R52 대조: `headless-worker.ts:615-635`(`close()` = abandon만, 워커 kill 0) · `process-group.ts:96-104` · `session-store.ts:300` · `protocol/src/env.ts:67-73`(*P5 정정: `envRelayToken()`은 `LOOM_RELAY_TOKEN`만 돌려주고 `FABLE_RELAY_TOKEN`은 경고만 — install이 두 이름을 직접 검사*) · 스모크 [`docs/spikes/SERVICE-SMOKE-0340.md`](spikes/SERVICE-SMOKE-0340.md) (2026-10-16 · macOS · bun 1.3.11 · 코드 `fb89d75` · 가짜 서비스 관리자 · **라이브 not run — 오너 승인 대기**) · P3 검증 프로브 사고(실 LaunchAgents plist 1분 · `launchctl` 0) = `implementation-notes.md` §0.34.0 Deviation (9) |

| 분면 | 내용 |
|------|------|
| Known knowns | 코드 실측(`0a20173`): (1) 락 거부 = `BridgeLockBusyError` — live 보유자면 `holderPid` = owner pid, incomplete·회수 경합·마감이면 `null`(`bridge-lock.ts:226-240` · `:425-436`) · `bridge-main.ts:52-55` catch가 전부 exit 1. (2) `bridge-main.ts` exit 지점 셋 — 두 번째 신호 0(`:30`) · 기동 실패 1(`:54`) · 정지 0(`:69`). (3) 수동 기동은 맨 `bun`(`bridge-spawn.ts:161`) + 상속 env + `LOOM_SESSION`/`LOOM_PROFILE`(`:132` · `:137`) · `bridgeMainPath()` cwd 폴백(`:68-75`) · herdr 소켓 기본값 `homedir()` 기반(`herdr-client.ts:27`) · 에이전트 바이너리 맨 이름(`bridge-config.ts:99-104`). (4) 토큰 = 세션 파일 0600 또는 env(`session-store.ts:408`). (5) 워커 = `detached:true`(`process-group.ts:96-102`) · 워커 env `LOOM_*` 제거(`headless-worker.ts:241-251`). (6) 정제기 둘 — 설정 `_`(`bridge-config.ts:112-113`) · 락/상태/로그 `-`(`bridge-spawn.ts:28`). (7) doctor = 파일·pid만 · `fail` 0(`doctor.ts:363` · `:470`). (8) `LOOM_SERVICE` 사용처 0(신규). |
| Known unknowns | **UK-1~UK-6**(아래 표, 정본 = PLAN §0.34.0 · UK-6은 최종 리뷰 추가). 요지: 서비스 관리자 정지 신호·유예 · macOS 26 Login Items · ssh(GUI 없음) launchd 동작 · Linux 라이브 미검증 · Linux lstart(0.33.0 UK-2 이월) · 로그인·재부팅 자동 기동과 macOS TCC. |
| Unknown knowns | 락 거부 exit 1(0.33.0 R10)은 수동 기동에는 옳지만 `KeepAlive`/`Restart=on-failure` 아래에서는 **크래시 루프**가 된다 — 양보(exit 0)는 보유자가 확인될 때만(D3). systemd는 프로세스 그룹이 아니라 **cgroup**으로 추적한다 — setsid만으로는 서비스 stop에서 워커가 살아남지 못한다(`KillMode=process`, D4). 서비스 관리자는 로그인 셸이 아니다 — HOME·PATH 미상속은 이미 한 번 크래시 루프를 냈다(lessons). 버스 없이 `systemctl --user enable`은 실패한다 — "다음 로그인에 뜬다"를 참으로 만들려면 wants 심링크를 직접 만든다(R8). 테스트 홈의 plist도 실 launchd는 받아들인다 — `LOOM_TEST_HOME` + 실 runner 거부(R9). **R52 교훈:** "실행 중"과 "적재됨"은 다르다 — 양보·drain 뒤·조절 중 서비스는 적재됨+실행 아님이고, 이미 적재된 label에 bootstrap은 EALREADY다(M1) · bootout은 옛 인스턴스 종료 전에 반환할 수 있다(M2) · macOS 로그아웃도 setsid 워커를 죽이며 linger 동등물이 없다(M3) · 종료 코드만으로 "다음 로그인에 뜬다"를 약속하지 않는다(L2). |
| Unknown unknowns | 로그인 직후 relay·herdr가 늦게 뜰 때 조절 재시도 소음의 실제 크기 · 사용자 Login Items 정리 습관 · 여러 프로필 서비스 동시 기동 시 경합 · 서비스 bridge와 대화형 세션이 같은 프로필을 쓸 때 사람에게 보이는 혼란 · launchd가 `bun`(서명 없음)을 백그라운드 항목으로 다루는 정책 변화. |

**Unknowns 요약 (정본 = PLAN §0.34.0):**

| # | 요지 | 출발 기본값 / 착수 영향 | R52 판정 |
|---|------|-------------|----------|
| UK-1 | launchd/systemd 정지 신호 순서·유예(0.33.0 Unknown unknowns 이월) — launchd 그룹 대상 여부 · SIGKILL 시점 | bridge 정지 상한 10초 < `ExitTimeOut 20` / `TimeoutStopSec=30` · 라이브 스모크(선택)가 macOS 실측 | **open, 비차단** — P2가 main 단독 SIGTERM 경로만 모사(≤10초 exit 0 · 워커 생존 · 입양 1회). 라이브 스모크 **not run(오너 승인 대기)** — `smoke:service --live`가 bootout → `stopped` 시간을 기록하도록 구현됨 |
| UK-2 | macOS 26 Login Items — 등록 알림 · 표시 이름(`bun` vs label) · 비활성 뒤 `bootstrap`/`kickstart` 코드·문구 · `print-disabled` 표기 | `disabled` 분류 패턴(R10)만 영향 · 라이브 스모크가 실측 | **partly observed, 비차단** — P3 검증 프로브 사고로 관측: LaunchAgents에 plist **파일만 생겨도**(`launchctl` 호출 0) "Background Items Added" 알림 · 표시 이름 = bun 서명자 **"Jarred Sumner"**(label 아님). 비활성 뒤 코드·문구 · `print-disabled` 표기는 미실측 |
| UK-3 | ssh(GUI 세션 없음)에서 `launchctl bootstrap gui/<uid>` 결과 코드(5 · 125 · 기타) · GUI 로그인 사용자의 ssh 세션에서 성공 여부 | 결과는 exit 0 또는 exit 3 — 둘 다 파일 유지 · 분류 패턴 실측 후 조정 | **open, 비차단** — 각본(`Input/output error` → exit 3)만 검증(P3 · 스모크 ⑤). 패턴 없는 코드 단독은 exit 1(R52-L2) |
| UK-4 | Linux 라이브 미검증 — `StandardError=append:`(systemd ≥ 240) · `KillMode=process` 뒤 left-over 경고 · linger 조회 형식 · wants 심링크 직접 생성 = `enable` 동등성 | CI는 생성기·runner 각본만 · 환경 없으면 **unverified** 기록 | **unverified(Linux 환경 미사용), 비차단** |
| UK-5 | Linux `ps -o lstart=` 형식(0.33.0 UK-2 Linux 이월) — D3 양보가 락 `live` 판정에 기댐 | 못 읽으면 `live` 미검증 → 서비스 모드 양보 exit 0(0.33.0 fail-safe 그대로) | **unverified(Linux 환경 미사용), 비차단** |
| UK-6 | 로그인·재부팅 뒤 자동 기동(launchd `RunAtLoad` · systemd `default.target`) · LaunchAgent `bun`의 macOS TCC 권한(터미널 권한 비상속 — `~/Documents` 등 보호 폴더 프로젝트) | `--live` 스모크는 scratch bootstrap → print → bootout만 — 자동 기동은 측정 못 함 · TCC는 카드 실패로만 보임 | **open, 비차단(최종 리뷰 2026-10-16)** — 실제 `service install` 뒤 로그아웃·로그인으로 확인 · USER_GUIDE §19.7-14 |

**Current decision:** D1~D8 아키텍트 락(아키텍트 + fable-advisor 자문 2026-10-16) · **R52 `approved-with-fixes` → M1·M2·M3·L1·L2·L3 PLAN 반영 → PLAN `approved`(2026-10-16, no R52b)** · R1~R14 수용(R5→L1 · R10→L2) · 아키텍트 답 1~5 수용(exit 3 · uninstall `--force` · doctor subprocess ≤2초 → `info unknown` · `service status` exit 0 · 미분류 exit 1) · 수용 손실 계급 1~13(계급 8 = Linux linger 없음 / macOS 로그아웃 공통 — M3) · UK-1 · UK-3 open · UK-2 partly observed · UK-4 · UK-5 unverified(전부 비차단). **implemented 2026-10-16** — P1~P5(`b77a42f` → … → `fb89d75` → `244e6a2` 스모크 → PATCH 5 문서) · 스모크 `smoke:service` ①~⑥ PASS(가짜 서비스 관리자) · **라이브 스모크 not run(오너 승인 대기)**. 다음 후보 = 업그레이드 4단계(memory / rules / skills 저장소 — 오너 지시 · PLAN MINOR + R53).

### 0.33.0 — bridge 생명주기 보강 (`approved` — R51 approved-with-fixes · implemented 2026-10-16)

| Field | Value |
|-------|-------|
| **PLAN** | v0.33.0 (`approved` — R51 approved-with-fixes, 반영 완료 · no R51b) · 업그레이드 3단계 1부 · 요구 `UPGRADE-PLAN.md:81-85` · 3단계 = 0.33.0(생명주기 보강, CI 검증 가능) + 0.34.0 후보(`loom service` launchd/systemd 설치 — 실 등록 스모크는 오너 승인 게이트) |
| **Date** | 2026-10-16 |
| **Review** | R51 **done 2026-10-16** (새 MINOR + 신뢰·내구성 경계 변경 — bridge 프로세스 생명주기 상태기계 · 프로세스 간 락 · 종료 시 수용 손실 계급 공식화) |
| **Evidence** | 코드 실측 `main @ 9567f87` (PLAN §0.33.0 Why · 추정/실측 표) · UK-4 = `bridge-main.ts` 정적 import 폐포 조사(R51 확인 → resolved) · R51 대조: `bridge-runtime.ts:1136` · `:1167-1175` · `:1180-1187` · `fake-herdr.ts:296` · 스모크 [`docs/spikes/BRIDGE-LIFECYCLE-SMOKE-0330.md`](spikes/BRIDGE-LIFECYCLE-SMOKE-0330.md) (2026-10-16 · macOS · bun 1.3.11 · 코드 `38933f1`) · UK-1 = `implementation-notes.md` §0.33.0 Deviation (7) |

| 분면 | 내용 |
|------|------|
| Known knowns | 코드 실측(`9567f87`): (1) 카드는 bridge에서 돈다(`bridge-runtime.ts:655`) · sticky host는 카드 0. (2) bridge 신호 핸들러 0 — `bridge-main.ts:21` 영원히 머무는 promise · 핸들러는 `sticky-server.ts:380-385` · `relay/src/cli.ts:76-77`뿐 → SIGTERM이 `stop()`(`:3033-3074`)을 건너뜀 · `loom bridge stop` = RPC `stop` → 3초 → SIGTERM(`bridge-spawn.ts:130-176`). (3) 프로필당 락 없음(`PLAN.md:601` · `USER_GUIDE.md:843` · `CHANGELOG.md:89`) · CLI meta+ping 방어만(`bridge-spawn.ts:58-65`) · 재사용 패턴 `relay/src/persist.ts:101-166` · `host/src/atomic-json.ts:80-85` · lstart 측정 기존(`headless-worker.ts:353`). (4) headless 워커 = `setsid` 분리(`process-group.ts:78-105`) · 입양(`headless-worker.ts:619-666`) · `close()`는 죽이지 않음(`:669-693`, 10초 상한) · pane/conv flight는 메모리(`bridge-runtime.ts:708` · `:714`) · drain 개념 0. (5) claim 지점 둘 — pane 즉시(`:1196`) · headless 허가 시(`:1189-1195`). (6) headless에도 herdr fail-fast(`:761-795`) · conv는 backend 무관 pane(`:1720-1780` · `:1884`). (7) 진단 — doctor에 bridge 절 0 · meta는 stop에서 삭제(`bridge-meta.ts:29-35`) · stderr 로그 매 기동 절단(`bridge-spawn.ts:77-86`). (8) bridge 경로는 `ensureRelay` 미호출(UK-4). (9) R51 실측: claim 전 수신 처리 = 발급자 생성·`processedHandoffs.add`(`:1180`) → claim 클로저(`:1183-1187`) · conv는 `:1136`에서 표시+claim · 수신 즉시 거절 선례 = `payload_invalid`(claim 1회 후 실패 결과, `:1167-1175`) · `bridge-runtime.ts`의 `process.exit` 0곳 · 가짜 herdr 소켓 기존(`fake-herdr.ts:296`). |
| Known unknowns | **UK-1~UK-3**(아래 표, 정본 = PLAN §0.33.0 · UK-4는 R51에서 resolved). 요지: bun SIGTERM 발화 신뢰성 · Linux 시작 시각 출처 · drain 기본 마감. |
| Unknown knowns | "멈춤"은 하나가 아니다 — 요청 정지(exit 0)와 기동 실패(exit 1)를 섞으면 서비스 관리자가 재시작 정책을 못 세운다(PLAN R10). CLI `bridge stop`의 3초 뒤 SIGTERM은 D2 "두 번째 신호 = 즉시 종료"와 겹친다(R1). 같은 10초 상한 두 겹은 바깥 정리를 굶긴다(R2). conv는 pane이라 headless herdr 생략과 충돌한다(R5) — 그리고 **claim하지 않은 거절은 inbox에 남아 재기동마다 반복된다**(R51-M1 → claim 1회 후 거절). `stop()`의 한도 초과가 정리 꼬리까지 자르면 meta·락이 남는다(R51-M3 → `finally`). 핸들이 남으면 `main()` 반환만으로는 프로세스가 끝나지 않는다(R51-M2 → `bridge-main.ts` 명시 exit). pane flight 유실은 설계상 수용이지 결함이 아니다(④ 계급 1). |
| Unknown unknowns | launchd/systemd가 보내는 신호 순서·유예(0.34.0) · 업그레이드 뒤 옛 워커 코드와 새 bridge의 입양 형식 차이가 한 MINOR 안에서 실제로 0인지 · 바쁜 룸에서 drain 600초가 현실적인지 · 동시 `loom bridge start`가 서비스 재시작과 겹칠 때 사람에게 보이는 메시지 품질. |

**Unknowns 요약 (정본 = PLAN §0.33.0):**

| # | 요지 | 출발 기본값 / 착수 영향 | R51 판정 |
|---|------|-------------|----------|
| UK-1 | bun에서 `process.on("SIGTERM")`이 bridge 이벤트 루프(서버 · 폴 타이머 · relay WS · 유닉스 소켓)에서 확실히 발화하는가 | sticky host가 같은 방식 운용 중 · P2 실프로세스 테스트가 측정 · 불발이면 P2 차단 → 아키텍트 판단 | **resolved(P2 · P5 스모크)** — bun 1.3.11에서 확실히 발화: P2 bridge SIGTERM → exit 0 18 ms(×3) · P5 스모크 6–7 ms(×3) |
| UK-2 | stale 락 pid 재사용 판별용 시작 시각 출처 — macOS `ps -o lstart=`(운용 중) · Linux `ps`(procps) 또는 `/proc/<pid>/stat` 22번째 필드 | P1은 `ps -o lstart=` 하나 · 읽기 실패 + pid 생존 → 거부(PLAN R8) · Linux 형식은 P5 확인(환경 있으면) | **macOS resolved · Linux 미실측** — macOS `LC_ALL=C TZ=UTC ps -o lstart=` = `Thu Oct 15 22:52:06 2026` 형식 · `owner.json` lstart와 바이트 동일 · 스모크 ④ stale 회수 일치. **Linux format unverified (no Linux env used)** — 못 읽으면 거부(fail-safe) + 수동 제거 안내 |
| UK-3 | drain 기본 마감 값 | 출발값 600초 · `--timeout`으로 덮음 · grok 헤드리스 ~9분 실측(`PLAN.md:601`)상 짧을 수 있음 · P5 재평가 | **resolved-by-decision(P5)** — 600초 유지(코드 무변경): grok ~9분은 카드 시작 직후 drain일 때만 안에 든다 · grok 노드 운영자는 `--timeout 1200` · 수용 손실 계급 = 마감에 잘린 카드(워커 생존 → 다음 기동 입양) |
| UK-4 | bridge 경로가 `ensureRelay`를 부르는가(0.34.0 D1 런타임 가드 필요 여부) | **실측: 부르지 않는다** — `bridge-main.ts` 정적 import 폐포에 `room-ops.ts`/`relay-daemon.ts`/`sticky-server.ts` 없음 · 동적 import 0 · `loom bridge start`도 미호출 · 단 `loom status`(`cli/src/index.ts:1995`)는 호출 → 0.34.0 루프백 거부는 설치 시점 검사로 충분(PLAN R12) | **resolved(R51)** |

**Current decision:** D1~D6 아키텍트 락(아키텍트 + fable-advisor 자문 2026-10-16) · **R51 `approved-with-fixes` → M1·M2·M3·L1·L2·L3·L4 PLAN 반영 → PLAN `approved`(2026-10-16, no R51b)** · R1~R12 수용(R5→M1 · R2→M3 · R1→L3) · 수용 손실 계급 1~7 + L4 3항 + stale 락 best effort + 하트비트 조언(PLAN §0.33.0 ④) · **UK-4 resolved**(R51) · **UK-1 resolved**(P2 · 스모크) · **UK-2 macOS resolved / Linux 미실측** · **UK-3 resolved-by-decision**(600초 유지 · grok `--timeout 1200`). **implemented 2026-10-16** — P1~P5(`b8739d9` → … → `bb97ffd` → PATCH 5 문서) · 스모크 `smoke:bridge-lifecycle` ①~④ PASS. 다음 후보 = 0.34.0 `loom service`(3단계 2부 — PLAN + R52 뒤 착수 · 실 OS 등록·라이브 스모크는 별도 오너 명시 승인).

### 0.32.0 — Loom MCP 사전 점검 (`approved` — R50 approved-with-fixes · implemented 2026-10-16)

| Field | Value |
|-------|-------|
| **PLAN** | v0.32.0 (`approved` — R50 approved-with-fixes, 반영 완료 · no R50b) · 업그레이드 2단계 2부 마무리 · §0.31.0 범위 분할 이월분 · 요구 `UPGRADE-PLAN.md:156`·`:161` |
| **Date** | 2026-10-16 |
| **Review** | R50 **done 2026-10-16** (새 MINOR + 보안·신뢰 경계 변경 — 대화형 에이전트의 Loom 상태 쓰기에 정책 판정 계층 신설 · 완료 판정 규칙 이월(D4) 공식화) |
| **Evidence** | 코드 실측 `main @ a2e0d99` (PLAN §0.32.0 Why · 추정/실측 표) · 라이브 스모크 [`docs/spikes/MCP-PRECHECK-SMOKE-0320.md`](spikes/MCP-PRECHECK-SMOKE-0320.md) (2026-10-16 · claude 2.1.300 · codex-cli 0.162.1 · grok 1.0.54 alpha · 코드 `f5c59ce`) · UK-2 조사 = `implementation-notes.md` §0.32.0 Deviation (e) |

| 분면 | 내용 |
|------|------|
| Known knowns | 코드 실측(`a2e0d99`): (1) Loom MCP 도구 20개 · 단일 길목 `stdio.ts:412-415` · `inputSchema` 광고만, 인자는 `String()`/`Boolean()`/`Number()` 강제 변환 · 미지 도구 JSON-RPC `-32601`(`:613`) · try 예외는 `isError`(`:620-626`). (2) 정책 `mcp.deny`(`policy.ts:34`)는 헤드리스 워커 argv에만 컴파일 — Loom 서버는 무시. (3) 로컬 done 경로 넷(`update_task` · `add_task` · `import_board` · `conv_close` — reason 기본 `done`, `stdio.ts:346`) · 원격 결과는 `blocked`(`card-ops.ts:321-326`). (4) `apply_card_result` `fromPeerId` 미대조(`card-ops.ts:284-303`) · 작업에 상대 peer id 필드 없음. (5) 사람 경로 실재 — `loom board set <id> done`(`cli/src/index.ts:1214-1234`) · `loom board import --replace`(`:1315-1337`) · conv 닫기 CLI 없음. (6) `policyHash` 입력 = `EffectivePolicy`(`policy.ts:127` · `:695`). (7) `packages/mcp-server` 테스트 0 · smoke-uc `McpClient`(`:69-185`). (8) zod `^3.24.2`는 `@loom/protocol`에만(JSON Schema 변환 없음). (9) R50-M2 실측: `dispatch_card` ack(`opsHandoff`, `room-ops.ts:114-125`)는 해석된 peer id를 담지 않는다 — `to`는 입력 에코 · relay `findPeerByName`은 표시 이름 중복 시 온라인 peer 우선(`relay/src/room.ts:382-387`) · `fromPeerId`는 relay가 연결 신원으로 채우지만(`room.ts:635-660`) 에이전트가 `InboxEntry`에서 베껴 넘긴다(생략 시 L-2 우회 — `blocked` 착지로 수용). |
| Known unknowns | **UK-1~UK-4**(아래 표, 정본 = PLAN §0.32.0 · UK-5는 R50-M2로 실측 → 제외). 요지: codex/grok의 `isError` 표면화 · 엄격 D2가 새로 거부할 기존 호출자 · 감사 파일 상한 값 · claude MCP 권한 프롬프트의 억제 여부. |
| Unknown knowns | "MCP에서 막았다"는 "에이전트가 못 한다"가 아니다 — 대화형 에이전트 셸은 `LOOM_SESSION`을 상속해 `loom board set … done`을 직접 부를 수 있고, 정책 `shell` 규칙은 대화형 세션에 컴파일되지 않는다(PLAN R9). 숨김만 하는 deny는 이름을 아는 모델에게 무력하다(D3). 기본값이 있는 인자(`conv_close` reason)는 명시값만 보면 샌다(PLAN R2). 기본 `allow`는 꼭 지킴 완료 판정의 **이월**이지 준수가 아니다(D4). |
| Unknown unknowns | MCP 클라이언트(claude·codex·grok)가 `tools/list`를 언제 다시 읽는지 — 세션 도중 `policy.json` 변경이 목록에 늦게 반영될 가능성(호출 거부는 즉시); 엄격 검증 거부를 받은 모델이 재시도 대신 셸 우회로 빠지는 행동 변화; 같은 룸 여러 `loom run` 세션의 감사 append 경합이 회전 경계에서 보이는 모습; 7단계 기본 `propose` 전환 시 실제 사람 done 부하. |

**Unknowns 요약 (정본 = PLAN §0.32.0):**

| # | 요지 | 출발 기본값 / 착수 영향 | R50 판정 |
|---|------|-------------|----------|
| UK-1 | codex/grok이 MCP `isError` 텍스트를 claude처럼 모델에 보여 주는가(거부 문구의 다음 행동 안내가 닿는가) | P5 스모크에서 측정 · 보이지 않으면 정직 표 행 갱신 | **resolved(2026-10-16, SMOKE-0320)** — 셋 다 보인다: claude `tool_result` `is_error:true` · codex `mcp_tool_call` `status:"failed"` `result.content[0].text` · grok ACP `rawOutput.output.Error`(모델에는 `Failed to call <tool>: ` 접두). 다음 행동 문구(`loom board set …` · `mode=merge`) 그대로 도달 · 재시도·우회 0 |
| UK-2 | 엄격 D2가 새로 거부할 기존 호출자(비문자열 인자 · `"true"` 문자열 불리언 · 미지 키) | P3에서 리포 grep + smoke-uc 실행으로 조사 · 수정은 호출자 쪽(스키마 완화 아님) | **resolved(P3 조사)** — 걸린 것은 문서 예시 1건(`TEST_PLAN.md` 14.G1 `set_purpose {verify}` → 이제 `invalid_args`가 먼저 · M-24는 host 경로 유지, `0eb9530`) · 기존 smoke-uc 흐름 수정 0줄 · PATCH 5 `smoke:uc` OK |
| UK-3 | 감사 파일 상한 값 — 1 MiB + `.1` 한 세대가 바쁜 룸에서 충분한가 | 출발값 1 MiB · 절단 없음 · P5 레코드 크기로 재평가 | **resolved(2026-10-16, SMOKE-0320)** — 한 줄 172~206바이트 → 세대당 약 5,000건 · 1 MiB 유지(변경 없음). 구현은 `.1` 대신 고유 세대 최신 3개 유지(D8 구현 정정 → 룸당 보통 ~4 MiB) · 양을 좌우하는 것은 기본 `allow`의 `done_via_mcp` 줄 |
| UK-4 | claude MCP 권한 프롬프트가 Loom이 쓴 설정으로 억제되는가 — 정적으로는 `adapters/src`에 `permissions` 쓰기 0 · 오너 전역 사전 허용은 미측정 | 정직 표 "실행 전 사람 확인" 행 문구에만 영향 · P5 관측 | **resolved(2026-10-16, SMOKE-0320)** — Loom은 권한 설정을 쓰지 않는다(넣지도 억제하지도 않음). 오너 모드가 결정: `auto`(오너 현재 기본) → 확인 없음 · `--permission-mode manual` + allow 없음 → `-p`에서 Loom 도달 전 거부(대화형이면 프롬프트) · `--allowedTools mcp__loom` → 확인 없음. **곁가지 실측:** codex는 MCP 호출에 승인을 요구(`approval_mode` 없고 `approval_policy=never` → 실패) → PLAN ④ 정직 표 codex 행 정정 · grok(ACP)은 확인 없음 |
| ~~UK-5~~ *(작성자)* | `dispatch_card` ack가 해석된 대상 peer id를 담는가(PLAN R7 `dispatchPeerId` 비교 대상) | 없으면 디스패치 시점 룸 peer 목록 해석 · 레거시 카드는 오늘 동작 + `l2_unverifiable` | **R50-M2: unknown에서 제외 → 실측** — ack `{status, to, handoffId, notified, recipientCount, message?, …}`(`room-ops.ts:114-125`) · `to` = 입력 에코 → R7 = 로컬 peer 목록 이름 일치 **정확히 1개**일 때만 기록, 0개/2개 이상 → 미기록(`l2_unverifiable`) |

**Current decision:** D1~D10 아키텍트 락(fable-advisor 자문 2026-10-16) · **R50 `approved-with-fixes` → M1·M2·L1·L2·L3 PLAN 반영 → PLAN `approved`(2026-10-16, no R50b)** · R1~R9 수용(R7은 M2로 수정 → 구현에서 fail-visible로 정정 · R9 문서화로 충분 — 0.31.0과 같은 기존 우회 · `propose` 옵트인 · 위협 = 오너 자신의 에이전트) · **UK-5 실측으로 제외**(M2) · **UK-1·UK-3·UK-4 resolved**(라이브 스모크 SMOKE-0320) · **UK-2 resolved**(P3 조사) · PLAN ④ 정직 표 codex 행 정정(승인 요구). **v0.32.0 implemented**(2026-10-16 — PLAN §0.32.0 Implemented · (j) ship 검사 후 ship). 다음 = 3단계 host OS 서비스(UPGRADE-PLAN 순서 고정 — 착수는 오너 지시 시) · 7단계 확정, 순서상 마지막.

### 0.31.0 — 스킬 materialize + policy.json v1 → CLI별 권한 번역 (`approved` — R49 approved-with-fixes)

| Field | Value |
|-------|-------|
| **PLAN** | v0.31.0 (`approved` — R49 approved-with-fixes, 반영 완료 · no R49b) · 업그레이드 2단계 2부 · MCP 사전 점검은 v0.32.0 후보로 이월(범위 분할) |
| **Date** | 2026-10-15 |
| **Review** | R49 **done 2026-10-15** (새 MINOR + 보안·신뢰 경계 변경 — 무인 워커 권한 결정 원천이 `policy.json` 파생으로 · 로컬 스킬 내용이 워커 컨텍스트로 · MCP 격리 기본값) |
| **Evidence** | [`docs/spikes/SKILLS-POLICY-PROBE.md`](spikes/SKILLS-POLICY-PROBE.md) (2026-10-15 실측 · claude 2.1.300 · codex-cli 0.162.1 · grok 1.0.54 alpha · §F = R49 전 실측 · §G = UK-1 실측 · §H = UK-5 실측) · 라이브 스모크 [`docs/spikes/HEADLESS-SMOKE-0310.md`](spikes/HEADLESS-SMOKE-0310.md) |

| 분면 | 내용 |
|------|------|
| Known knowns | 프로브 실측: (1) claude `--plugin-dir` 플러그인 스킬 발견·사용 · `--add-dir`은 그 디렉터리의 `.claude/skills`까지 로드(범위 확대) · 둘 다 가변 인자(§A.2). (2) claude `--settings` 인라인 JSON `permissions.deny` 강제 · `--plugin-dir`·resume과 공존(§B.1 · §F.3). (3) codex `exec` 스킬 플래그 없음 · 규칙 파일은 `$CODEX_HOME/rules`·`<cwd>/.codex/rules`에서만 · `workspace-write` 네트워크 기본 차단, `network_access=true`로 개방(§A.3 · §B.2). (4) codex·grok(미신뢰 cwd 포함) 모두 cwd 밖 절대경로 SKILL.md를 읽는다(§F.1 · §F.2). (5) claude 워커는 오너 MCP 7개 상속 · `--strict-mcp-config` 단독 → 0개(§F.4). (6) grok은 오너 `~/.claude` 권한·MCP·스킬 병합(§A.4) · `--disable-web-search` 플래그 존재(2026-10-15 `--help`). 코드 실측(`2e5349b`): D10 기본 목록 `agent-argv.ts:64-108` · `ARGV_TEMPLATE_VERSION = "0.30.0-v1"`(`:7`) · 카드 디렉터리 `cards/<sha16(localPeerId)>/<sha16(room×agent×card)>/`(`card-session-store.ts:94-106`) · 룸 디렉터리 `rooms/<sha16(roomId)>/`(`room-event-log.ts:125-140`) · `build:cli` 단일 파일 번들. |
| Known unknowns | **UK-1~UK-7**(아래 표, 정본 = PLAN §0.31.0). 요지: 접두 규칙 매칭 의미 · 프롬프트+목록 크기 · 재개 시 플래그 지속 · grok `--disable-web-search` 효과 · claude `--settings` deny의 MCP 차단 · 오너 전역 스킬·MCP 상속의 실효 · 내장 스킬 번들 포함. |
| Unknown knowns | "선택 권위 = `skills.json`"은 **Loom이 복사하는 스킬**에만 해당한다 — 오너 전역 스킬·MCP는 여전히 워커에 보인다(UK-6). "정책 문법이 하나"는 "강제력이 같다"가 아니다(D10 정직 표). deny 합집합 규칙 아래에서는 curl/wget을 내장 deny에 두면 `network:true`가 claude/grok에서 무력해진다(PLAN R4). deprecated deny를 무시하면 deny가 완화된다(PLAN R5). |
| Unknown unknowns | CLI 업데이트가 `--settings`·`--plugin-dir` 의미나 grok 호환 소스 병합을 조용히 바꿀 가능성; 큰 스킬 세트에서 claude 플러그인 설명 주입 비용(claude는 목록 상한이 아니라 복사 개수로만 제한); 스킬 본문이 워커 행동을 바꿔 결과 형식·범위가 흔들릴 가능성; 오너가 `policy.json`을 편집하는 순간 실행 중 카드의 재개가 `fingerprint_changed`로 끊기는 체감. |

**Unknowns 요약 (정본 = PLAN §0.31.0):**

| # | 요지 | 출발 기본값 / 착수 영향 | R49 판정 |
|---|------|-------------|----------|
| UK-1 | `Bash(git status*)` vs 정책 형식 `Bash(git status *)` 매칭 의미(맨 명령 · `git statusfoo`) — 수용만 실측(§F.3) | 내장 allow를 접두 형식으로 변환 · 좁아지면 저하(교착 아님) · P2 1회 프로브 | R49: P2 차단(deny 경로, H1) → **resolved(실측 `SPROBE` §G, 2026-10-15)** — claude `Bash(p *)`는 맨 `p` 차단 · grok은 못 막음(`Bash(p)`가 맨·인자 모두 차단) · 체이닝 거부(두 CLI) · claude `p*` 과매칭 · `p:*` 맨·인자 차단 → 이중 형식 유지(grok 필요 · claude 무해) · `p*` 형 emit 금지 · 내장 공백 없는 문자열 `p` + `p *` 정규화 |
| UK-2 | 카드 프롬프트 ≤60,000자 + 스킬 목록 ≤4 KB의 stdin/prompt-file 전달 · 20개/4 KB 상한 적정성(0.30.0 UK-2 승계) | P4 라이브 프로브 | open, 비차단 |
| UK-3 | 재개 argv에서 `--settings`·`--plugin-dir`·codex `-c …network_access`·grok `--allow/--deny`를 빼도 유지되는가 | 설계 = 매 재개마다 재전달 · 충돌 여부만 P2 확인 | open, 비차단 |
| UK-4 | grok `--disable-web-search` 효과(존재는 `--help` 확인) | grok 네트워크 = D10 "권고" 행 | open, 비차단 |
| UK-5 | claude `--settings` `permissions.deny`의 `mcp__srv__tool` 차단(§C는 `--disallowedTools`만 실측) | P2 1회 프로브 · 실패 시 MCP deny만 `--disallowedTools`(Deviation) | **resolved(실측 `SPROBE` §H, `0706d47`)** — `--settings` deny `mcp__srv__tool`(·`mcp__srv`) → 툴이 init `tools`에서 사라짐 · `permission_denials` 비어 있음(신호 없음) → `--settings` 유지, `--disallowedTools` 폴백 불요 |
| UK-6 *(작성자)* | 오너 전역 스킬(`~/.claude/skills` · `~/.agents/skills` · `$CODEX_HOME/skills`)·MCP 7개가 워커에서 실제로 쓰이는가 · allow 밖 MCP 호출이 거부되는가 | 문서화(Non-goals) · D13과 함께 판정 | **open, 비차단 유지(R49)** — D13 기본 **true**(R49-M1)로 claude 오너 MCP 상속은 기본 차단 · 잔여 = 오너 전역 스킬 상속 · codex/grok MCP(격리 불가 행) |
| UK-7 *(작성자)* | 내장 스킬(`packages/host/skills/`)의 단일 파일 번들 포함 | Bun `import … with { type: "text" }`(R49-L4, 동작 추정) · P3 dist 검사 · 불가 시 빈 내장 + 사용자 소스 스모크(Deviation) | **resolved(2026-10-15)** — Bun 텍스트 import로 `build:cli` 단일 파일 `dist/loom.js`에 `loom-card-report` 포함(`LOOM-REPORT-END` 확인) · 라이브 스모크 (h)에서 내장 소스로 사용 |

**Current decision:** D1~D13 아키텍트 락(fable-advisor 자문 2026-10-15) · **R49 `approved-with-fixes` → H1·M1~M5·L1~L4 PLAN 반영 → PLAN `approved`(2026-10-15, no R49b)** · R1~R8 수용(R4 H1 조건부) · D13 `mcp.isolate` 기본 **true**(M1) · **UK-1 resolved**(P2 deny 경로 차단 → 실측 §G — 이중 형식 유지 · `p*` 금지) · **UK-5 resolved**(§H) · **UK-7 resolved**(dist 포함) · UK-2·UK-3·UK-4·UK-6 open(비차단). **v0.31.0 shipped**(2026-10-15 — PLAN §0.31.0 Implemented). 범위 분할: 0.31.0 = 스킬 materialize + `policy.json` 번역 · **v0.32.0 후보 = MCP 사전 점검** · 계층형 프롬프트 조립 = 5단계. 구현 착수 = **P1**(정책 스키마·병합, red 선행).

### 0.30.0 — 헤드리스 카드 워커 · 카드별 세션 키 · 재개/입양 · 에이전트별 동시성 · 정적 권한 프로필 (`approved` — R48 approved-with-fixes)

| Field | Value |
|-------|-------|
| **PLAN** | v0.30.0 (`approved` — R48 approved-with-fixes, 반영 완료 · UK-5 실측 기재 · no R48b) · 업그레이드 2단계 1부 |
| **Date** | 2026-10-15 |
| **Review** | R48 **done 2026-10-15** (새 MINOR + 보안·신뢰 경계 변경 — 원격 프롬프트로 로컬 CLI를 권한 프로필과 함께 무인 실행 · cwd 경계 · 프로세스 그룹 kill · 평문 transcript) |
| **Evidence** | [`docs/spikes/HEADLESS-WORKER-PROBE.md`](spikes/HEADLESS-WORKER-PROBE.md) (2026-10-15 실측 · claude 2.1.300 · codex-cli 0.162.1 · grok 1.0.54 alpha · Bun 1.3.11 · §7 = R48 후속 실측 UK-5·UK-9·stdin) |

| 분면 | 내용 |
|------|------|
| Known knowns | 프로브 실측: (1) 세 CLI 비대화형 구조화 출력 — claude `.session_id`/`.result`/`.is_error`/`.permission_denials[]` · codex `thread.started.thread_id`/`item.completed`/`turn.completed` · grok `end`에만 `sessionId`. (2) 세 CLI 재개 성립(codeword 회상) · 재개 조회 cwd 귀속 · codex id 캡처 필요. (3) 거부 도구 **no-hang** · exit 0 · claude만 구조화 거부 · claude `acceptEdits`는 `ls`·`touch`를 `allowedTools` 밖에서 자동 허용. (4) Bun 1.3.11: detached 자식은 부모 pid/그룹 SIGTERM에서 생존 · SIGTERM 미전달. (5) codex `exec resume`에 `-C`·`-s` 없음 · grok `--session-id`는 새 대화 전용. 코드 실측(`ac08670`): 워커 로직 `bridge-runtime.ts:662-3154` 클로저 · herdr 호출 48곳 · Flight paneId 키 · 카드 타임아웃 없음 · flight 무제한 · 카드 cwd 미충전·무검증(`:1501`) · `loomSystemHint` 미전달 · `cardSeq`/issuer 인메모리 · 결과 `output` ≤200,000 · 첨부 ≤256,000 · 프롬프트 ≤60,000 · 타워 seq 멱등(`card-ops.ts:313-318`) · 원격 결과 `blocked` 착지. |
| Known unknowns | **UK-1~UK-9**(아래 표, 정본 = PLAN §0.30.0). 요지: 200k 출력의 JSON 이스케이프 후 첨부 상한 여유 · claude stdin 장문 프롬프트 · 전역 훅 상속/격리 · 입양 pid 재사용 · claude `acceptEdits` 자동 허용 집합(차단 → R48 후 실측 resolved) · grok alpha 드리프트 · herdr 기동 의존 · 힌트의 헤드리스 적합성 · codex `developer_instructions` 반영. |
| Unknown knowns | "재개 가능"과 "재개 안전"은 다르다 — 같은 세션 id라도 **cwd·fingerprint가 바뀌었으면** 이어붙이면 안 된다(D6). cwd를 키 해시에 넣으면 "cwd 불일치"는 **조회 불가 = 새 세션**으로 바뀐다(PLAN R2). "브릿지가 죽으면 워커도 죽는다"는 직관과 달리 detached 워커는 **남는다** → 입양이 필수이고, 입양은 pid 재사용 위험을 낳는다(UK-4). pane 워커는 오늘 힌트를 받지 않으므로 힌트 주입은 **신규 동작**이다(PLAN R3). |
| Unknown unknowns | 수 시간짜리 실카드에서의 transcript 크기·디스크 누적(회전 없음); 오너 전역 훅이 무인 워커에서 대화형 전제로 오동작할 가능성; CLI 업데이트(특히 grok alpha · claude 권한 의미)가 정적 프로필 의미를 조용히 바꿀 가능성; 동시성 1에서 큐 적체가 디스패처 체감(원격 tower의 대기)에 주는 영향. |

**Unknowns 요약 (정본 = PLAN §0.30.0):**

| # | 요지 | 출발 기본값 / 착수 영향 | R48 판정 |
|---|------|-------------|----------|
| UK-1 | `CardResultPayload` 와이어 상한 — 실측 `output` ≤200,000 · 첨부 ≤256,000. 남은 미지 = 200k 출력의 JSON 이스케이프 후 256k 첨부 상한 여유 | 꼬리 보존 절단 + `truncated` + `note`에 transcript 경로·바이트 수(PLAN R5) · P2 최악 문자 경계 테스트 | **resolved(설계)** — 코어가 직렬화 예산 기준 꼬리 보존 절단 루프(R48-M2) · P2 red = 전부 `\r\n`/`"`인 200k 출력 |
| UK-2 | claude `-p` + stdin으로 60,000자급 프롬프트 전달 | P3 라이브 프로브 · 실패 시 `--input-format stream-json`/파일 경로 Deviation | **open, 비차단** — 짧은 프롬프트 stdin 경로는 실측 성립(`PROBE` §7.3), 60k 장문은 P3 |
| UK-3 | 오너 전역 훅이 헤드리스 claude 워커 안에서 실행(실측 5건) — 상속 vs 격리 | 기본 **상속**. `--setting-sources` 2.1.300 `--help`에 없음 · `--bare`는 OAuth 미사용 · `--restricted`는 Bash 제거 | **resolved** — 기본 사용자 훅 상속 · 0.30.0 격리 옵션 없음 · `USER_GUIDE.md` 명기 · P3 숨김 `--setting-sources` 1회 프로브(비차단) |
| UK-4 | 입양 시 비자식 pid 재사용 | 시작 시각 기록(PLAN R1) + `ps -o lstart` 대조, 불일치 = 죽음(kill 금지) — P5 고정 | **open, 비차단** |
| UK-5 | claude `acceptEdits` 자동 허용 명령의 정확한 집합(`rm`?) | D10 deny 목록 적정성의 전제 — **P3 전 실측**, 결과로 deny 목록 확정 | **resolved(실측 `PROBE` §7.1)** — cwd 안 `mkdir`·`cp`·`mv`·`rm`·`rm -rf <하위>`·리다이렉트·`git status` 자동 허용 · `chmod`·`sed -i`·`curl`·cwd 밖 `rm -rf` 거부 → deny `Bash(rm *)`·`Bash(rmdir *)`·`Bash(git push*)`·`Bash(git reset --hard*)`·`Bash(git clean*)`·`Bash(sudo *)`·`Bash(curl *)`·`Bash(wget *)` 확정 · 우회(`/bin/rm`·`find -delete`·인터프리터) 잔여 위험 문서화 |
| UK-6 | grok alpha 플래그 드리프트 | 1.0.54 기준 argv 테스트 + 버전 기록(D14) | **open, 비차단** |
| UK-7 | 헤드리스에도 herdr 기동 필수 | 수용(D2) · 후속 정리 | **open, 비차단** |
| UK-8 *(작성자)* | `loomSystemHint`가 MCP 없는 헤드리스 워커에 MCP 도구·세션 시작 의식을 지시 | 문면대로 주입(D12) · (h) 스모크에서 낭비 턴 관측 | **resolved** — `loomSystemHint` 미주입(범위 확장 벡터) · 단일 상수 `HEADLESS_WORKER_HINT`(D12 수정 · fingerprint 입력) |
| UK-9 *(작성자)* | codex `-c developer_instructions=…` 반영 여부 | P3 라이브 프로브(codeword) · 미반영이면 Deviation | **resolved(실측 `PROBE` §7.2)** — 반영됨("ZEBRA42") · `exec resume`에서 재전달 없이 유지 · 재전달 무해 |

**Current decision:** D1~D15 아키텍트 락(fable-advisor 자문 2026-10-15) · **R48 `approved-with-fixes` → H1·M1·M2·M3·L1·L2 PLAN 반영 + UK-5 실측 기재 → PLAN `approved`(2026-10-15, no R48b)** · R1·R4·R5·R6 수용 · R2·R3 수정 수용 · UK-1·UK-3·UK-5·UK-8·UK-9 resolved · **UK-2·UK-4·UK-6·UK-7 open(비차단)**. 2단계 분할: 0.30.0 = 완료 기준 충족 · 0.31.0 = 스킬 materialize + `policy.json` 번역 + MCP 사전 점검 · 계층형 프롬프트 조립 = 5단계. 구현 착수 = **P1**(결과 코어 리팩터).

### 0.29.0 — 룸 이벤트 seq + 안정 id · 멱등 수신 · 룸별 이벤트 로그 · 멱등 송신 (`approved` — R47 approved-with-fixes)

| Field | Value |
|-------|-------|
| **PLAN** | v0.29.0 (`approved` — R47 approved-with-fixes, 반영 완료 · no R47b) |
| **Date** | 2026-10-15 |
| **Review** | R47 **done 2026-10-15** (새 MINOR + 와이어 의미 확장(optional additive) + 신뢰 경계 인접 — `clientEventId` 억제 범위 · 원문 로그) |

| 분면 | 내용 |
|------|------|
| Known knowns | 코드 대조 실측(2026-10-15): (1) 봉투에 id/seq 없음 — BaseEnvelope `v`·`roomId`·`ts`·`requestId?`(`envelope.ts:85-94`). (2) relay 발급 안정 id는 `handoff.id`뿐(`room.ts:441-442`, M-9). (3) relay per-room seq·이력 없음, `broadcast`/`sendTo` fire-and-forget(`room.ts:347-370`). (4) 수신 단일 관문 `relay-client.ts:167-181` · 합성 reconnect chat `:225-232`. (5) 브릿지 dedupe = 인메모리 `processedHandoffs`(`bridge-runtime.ts:705`) — 재시작 소실. (6) sticky 8s 타임아웃 → one-shot 재송신 → 새 handoff id → 이중 디스패치(`sticky-client.ts:79-121` · `room-ops.ts:100`). (7) 중복 `conv.accept` 재적용(`conv-ops.ts:411-421`). (8) 재사용 기반: JSONL append·torn 말행 replay(`result-quarantine.ts:115-225`) · `loomDir()`(`session-store.ts:230`) · `withFileLock`(`atomic-json.ts:179`, 동기). (9) `roomId` 제약 `min(1)`뿐(`envelope.ts:87`) → 경로 세그먼트 사용 불가(PLAN R1). |
| Known unknowns | **UK-1~UK-6**(아래 표, 정본 = PLAN §0.29.0). 요지: 스냅샷 스키마 하위호환·seq 영속 시점 · 다중 relay `roomId` 유일성 · sticky host 로그 담당 여부 · 상한 크기 · 로그 실패 시 전달 정책 · 같은 `clientEventId`·다른 본문. |
| Unknown knowns | "중복 drop"과 "로그 1줄"은 **다른 집합**이다 — 같은 룸에 로컬 프로세스가 둘(브릿지 + `loom listen`)이면 공유 seen 하나로는 두 번째가 이벤트를 못 받는다 → 로그 층(룸 공유) / 전달 층(소비자별) 2층 dedupe(PLAN R2). `seq`는 역행할 수 있으므로(ephemeral relay · 다중 relay) **drop 키가 아니다**(R3). torn 잔편 뒤 무보정 append는 새 레코드까지 삼킨다(R4). |
| Unknown unknowns | 이벤트당 동기 룸 락 + fsync가 chat 체감 지연·브릿지 이벤트 루프에 주는 영향(미측정); 원문 로그 누적 크기와 회전 부재의 장기 영향; 업그레이드 계획 후속 단계(검색·인덱스)가 이 로그 줄 형상에 요구할 필드(지금 `{v:1,…}` 버전 필드로만 대비). |

**Unknowns 요약 (정본 = PLAN §0.29.0):**

| # | 요지 | 출발 기본값 / 착수 영향 | R47 판정 |
|---|------|-------------|----------|
| UK-1 | relay 스냅샷 스키마 변경 하위호환(`ROOM_SNAPSHOT_VERSION` 유지 + optional 필드?) · seq 영속 시점(송신 전 매회 vs 블록 예약) | 구 스냅샷 = seq 1부터 · **재시작 후 seq 비감소** 고정 · 방식은 PATCH 2 택일 — 착수 비차단 | **resolved** — `ROOM_SNAPSHOT_VERSION` 1 + optional 필드(로더 `persist.ts:275-289` 미지 필드 무시) · seq 영속 = 블록 예약(`seqHigh = seq+K`, 재로드는 `seqHigh`부터 · R47-M3) |
| UK-2 | profile당 다중 relay(`local`/`win`) — seq는 relay별·룸별, 로그는 `roomId` 키 → relay 간 `roomId` 유일성 미확인 | 유일하지 않으면 `roomKey`에 relay 식별자 포함 — **R47 전 확인 권장** | **resolved** — `roomId` = 64 random bits(`codes.ts:13-21`) → relay 간 유일 · `roomKey`에 relay 식별자 불포함 |
| UK-3 | sticky host에 `onEnvelope` 없음 → 실제 접속 프로세스만 로그 | 공백 수용 vs sticky 상시 구독(책임 증가) — R47 판정 | **resolved** — 저장소는 `RelayClient` 옵션 opt-in · sticky host는 이 버전 opt-in 안 함 |
| UK-4 | seen 집합 N · clientEventId LRU N | **1024 / 256 (추정)** — 상수 한 곳 · 경계 테스트 고정 | **open, 비차단** — 출발값 유지 · 구현 중 조정 |
| UK-5 | 로그 append/fsync 실패·락 타임아웃 시 전달 정책 | fail-open + fail-visible(로그가 아직 판정 입력 아님) — R47 판정 | **resolved** — fail-open + fail-visible(카운터 + stderr) + 인메모리 B층 섀도 집합(R47-L2) · 프로세스 간 락 ≤250ms(R47-H1) |
| UK-6 | 같은 `clientEventId`·다른 본문 | 원래 결과 반환(본문 무시) vs 해시 불일치 `error`(신규 와이어 코드) — R47 판정 | **resolved** — 원래 결과 반환 · 신규 와이어 코드 없음 · relay가 본문 해시 불일치 카운터를 stderr에 기록 |

**Current decision:** D1~D5 아키텍트 락 · **R47 `approved-with-fixes` → H1·M1·M2·M3·L1·L2 PLAN 반영 → PLAN `approved`(2026-10-15, no R47b)** · R1~R4 수용 · UK-1·UK-2·UK-3·UK-5·UK-6 resolved · **UK-4 open(비차단)**. 구현 착수 = PATCH 1(tests-first red).

### herdr 0.7.5 / protocol 17 compatibility (**gate closed** · shipped through `6e2df8a` · Loom 0.28.1 release close)

| 분면 | 내용 |
|------|------|
| Known knowns | **호환 게이트 폐쇄.** Loom adapter protocol **17**, `HERDR_PROTOCOL_EXPECTED === 17`, shipped through **`6e2df8a`**. 시퀀스: tests-first `194d901` · client `c0fcc00` · bridge `1284eef` · coverage `e538cad` + 라이브 보정(launch readiness `848675f`/`5ac6d31` · named prompt target `edf3b59`/`48ecba3` · dogfood config migration `9f13b47`/`8ebfd11` · Fable collision-free name `1351add`/`6e2df8a`). 라이브 3종(claude/codex/grok) 스모크 통과. `dogfood:herdr` ok · `dogfood:up` exit 0. host 462/0. 정본 `docs/spikes/HERDR-0.7.5-COMPAT.md` verdict **shipped**. |
| Known unknowns | **UK-5..UK-9** (PLAN §0.28.1)는 **후속 관측**으로 잔존 — 착수/ dogfood를 막지 않는다: UK-5 `final_status`/`released` 실림 조건 · UK-6 비원자 제출 경로 재측정 · UK-7 `agent.wait`가 still-running 유예를 어디까지 대체할지 · UK-8 다중 노드 플러그인 user-global 영향 · UK-9 `agent_prompt_stalled` = 미제출 여부. |
| Unknown knowns | 라이브 실측으로 좁혀진 운영 지식: (1) `agent.start` ACK는 **`launch_pending`** 일 수 있고 launch barrier는 **`agent.get`→`interactive_ready`** 이며 `agent.wait` idle이 아님. (2) prompt/`send_keys` 타깃은 **exact agent name**(pane id 오배송 실측). (3) 이름 형식 exact `loom-${cardId}-${seq}` · fail-closed `agent_name_unrepresentable`. (4) persisted `herdrProtocol:16`은 migration 필요 — **config-only 17 bump는 여전히 우회 금지**. |
| Unknown unknowns | detect additive 필드가 후속 C 관측에 주는 장기 영향; 다중 노드에서 user-global 플러그인 재설치 누락 시의 증상 표면. |

**Current decision:** **compatibility gate closed · dogfood unblocked.** 오너 표준은 0.7.5/protocol 17. downgrade/병행 0.7.4 기각. adapter pending / dogfood blocked 서술은 폐기. 제품 공개 card/relay/conv/MCP 표면과 PANE-DEATH U1–U11 무변경. UK-5..UK-9는 후속 관측만.

### 0.26.0 — hooks 보조 센서 (claude 워커 상태 힌트 · 스파이크 최소 배선 5단계)

| Field | Value |
|-------|-------|
| **PLAN** | v0.26.0 (`pending-review`) |
| **Date** | 2026-07-20 |
| **Review** | R41 required (신규 config hook 주입 옵션 + 브릿지-로컬 소켓 리스너 = 신규 신뢰 경계; **경량 예상** — `inject-control` 선례·신규 wire/MCP 없음) |

| 분면 | 내용 |
|------|------|
| Known knowns | 스파이크 실측 확정분(정본 `docs/spikes/HOOKS-SENSOR-SPIKE.md`): (1) **3상태 hook 매핑** — 승인 대기=`Notification`(matcher `permission_prompt`)·턴 종료/유휴=`Stop`(또는 `idle_prompt`)·작업 시작=`UserPromptSubmit`/`SessionStart`, matcher로 승인 대기와 단순 유휴가 **깔끔히 분리**(승인만 골라 잡음). (2) **배선 지점 전부 기존재** — 스폰 훅포인트·argv 조립(`resolveAgentArgv`)·이벤트 합류부(`onCardHerdrEvent`)·still-running 유예 poll이 코드에 이미 있어 hookHint 우선 분기를 **얹기만** 함. (3) **fail-open exit 규약** — 관측 훅은 exit 2여도 워커 흐름 차단 불가 → 항상 exit 0, `UserPromptSubmit`/`SessionStart` stdout만 컨텍스트 주입 함정(비움 필수). (4) **`inject-control` 선례** — loomDir 0600 소켓 + `isPathUnderLoomDir` 가드·no_listener 폴백이 승인된 정본(여기선 방향만 역전 — 브릿지가 리스너/서버). 이득 empirical 입증 완료(2026-07-20, 근거 중~강 — 통증 2 승인 미탐지 정면). |
| Known unknowns | U1~U6(아래 표) — 전부 PLAN §0.26.0 Unknowns 요약. 요지: claude 워커 배포 버전의 hook 표면 실재·`--settings` 인라인 주입 실작동·소켓 리스너 생명주기·`Stop`↔유예 상호작용·서브에이전트 라우팅·계측 JSONL 회전이 라이브 실측 대상. |
| Unknown knowns | hook은 "훅이라서 신뢰"가 성립하지 않는다(워커/훅 스크립트가 emit — §2.5.2③) → 페이로드는 신뢰 입력이 아니라 **완료 힌트로만** 소비, 실제 결과 회수는 스크레이프 유지·본문 정본은 §5.1 artifact. hook 미주입/`no_listener`는 현행과 **판정·wire 관측 동작 동일**(fail-open, 회귀 0 — R41 L-2: "바이트 동일"은 D2가 모든 claude 스폰 argv에 `--settings`를 덧붙이고 D6 계측 append가 신규 부작용이라 문자 그대로는 성립 불가, "스폰 argv 주입·계측 append 제외" 스코프로 재정의) — 신규 판정 경로가 아니라 기존 판정에 우선 분기를 얹는 additive. |
| Unknown unknowns | 워커 claude 버전업 시 hook 이벤트/matcher 표면 변동(스파이크는 읽기-전용 조사라 라이브 미발화); 브릿지가 서버(방향 역전)로서 다수 워커 소켓을 장시간 watch할 때의 리소스·스테일 소켓 누적; hook 페이로드 경로가 여는 미지의 간접 프롬프트 주입 표면(stdout 함정 외). |

**Unknowns 요약 (정본 = PLAN §0.26.0):**

| # | 요지 | 무회귀 대비 |
|---|------|-------------|
| U1 | claude 버전별 matcher 지원 편차(`permission_prompt`/`idle_prompt`·팀 워커 matcher v2.1.198+) 미검증 | 미지원 버전 = hook 미발화 → D5 폴백으로 무회귀, 이득 발생 버전 실측 필요 |
| U2 | `--settings` 인라인 JSON 주입이 워커 claude에서 실제 hook 발화시키는지 라이브 미검증 | 인라인 JSON/파일/env 중 실작동 방식을 라이브 스모크로 확정 |
| U3 | 브릿지 소켓 리스너 잔여 정리-경합·unlink 시점 실측 (**R41 M-1로 축소 재정의** — 재-cardId 충돌 자체는 unknown 아님) | 소켓 = attempt(seq)-스코프 + bind 전 unlink + flight 소멸 시 close+unlink + 늦은 이벤트 flight 동일성 가드 드롭으로 D4 M-1 설계 폐쇄; 잔여 = 정리-경합·unlink 시점 세부 실측뿐 |
| U4 | `Stop` 힌트 ↔ still-running 유예 상호작용 (**R41 M-2 ④로 설계 폐쇄**) | `Stop`=poll 가속·상한 우회 입력만·완료 확정은 indicator-clear 스크레이프 확증 필수(AND 결합, 단독 완료 금지)로 D3 M-2 ④ 폐쇄; 잔여 = 이득 크기 실측뿐 |
| U5 | 서브에이전트 문맥 라우팅(`session_id`/`agent_id` 부모-자식 귀속) | 부모 카드 귀속 vs 별도 표면화 미정 |
| U6 | 계측 JSONL(D6) 회전·크기 상한 (0.24.1 룸 스냅샷 GC 후속 동계열) | 회전/상한/GC 정책 미정 |

**Next:** R41 완료(2026-07-20 — `pending-review` → author-close `approved`, M-1·M-2 lock 반영 + L-1..L-3 author-close, no R41b) → approved 후에만 구현(레인 위임). **U3·U4는 R41 M-1·M-2 ④로 설계 폐쇄**(잔여는 정리-경합·이득 크기의 라이브 실측뿐). 라이브 스모크로 **U1**(버전별 matcher 발화)·**U2**(`--settings` 인라인 주입 실작동)를 해소하고 실측 결과를 PLAN `Implemented` 블록에 명기.

### 0.24.2 — Windows 실배포 결함 2건 (persist 경로 가드 구분자 오탐 + 메시지 핸들러 uncaught 크래시)

| Field | Value |
|-------|-------|
| **PLAN** | v0.24.2 (`pending-review`) |
| **Date** | 2026-07-19 |
| **Review** | R39 required (보안·신뢰 경계 — 경로 가드 계약 변경; PATCH여도 필수) |

| 분면 | 내용 |
|------|------|
| Known knowns | 결함 근인 2건 코드 대조 확정: (1) `persist.ts:389` 가드 `path.startsWith(realState + "/")`가 POSIX `"/"` 하드코딩 — `roomStatePath`(`persist.ts:67-69` `join()`)의 Windows 백슬래시 경로와 불일치해 **모든 스냅샷 쓰기 거부**(0.14.x부터 잠복, Windows relay가 0.24.1 전까지 항상 ephemeral이라 미발화·유닛은 POSIX 전용). `path`는 realState 파생이라 **구분자만이 유일 실패 모드**. (2) `room.ts:751` create의 fail-closed rethrow가 `server.ts:176` `handleMessage` 호출부(ws message 콜백)에 try/catch 부재 → uncaught → **bun 프로세스 종료**(나쁜 create 1건 = 서버 전멸). 기존 개별 op catch는 `server.ts:317·392·485·510`(handleMessage 내부 회신·비-rethrow). 라이브 실증: v0.24.1 Windows 재배포 후 첫 room create에서 relay 사망 2회 재현·err.log 스택 `Snapshot path escapes state dir` 포집. |
| Known unknowns | (1) D2 가드(message 콜백 외곽 전역 방어) 외 다른 op의 persist 경유 추가 uncaught 표면 — op별 실패 UX(무응답 vs 명시 error envelope) 차이. (2) 대소문자/8.3 단축 경로 변형이 `realpathSync` 산출에 섞일 가능성(파생-경로 구조상 무해 논증이나 Windows 실기 확인은 배포 후). |
| Unknown knowns | 가드 교정은 **신규 정책이 아니라 기존 계약의 크로스플랫폼 복원** — `node:path`의 `sep`는 join과 짝을 이루는 정본 구분자이며, POSIX 판정은 문자 그대로 불변(`sep === "/"`). "가드 완화"가 아니라 "Windows에서만 깨져 있던 정상 판정의 복구". |
| Unknown unknowns | Windows 고유 FS 의미론(파일 잠금·안티바이러스의 rename 간섭)이 원자쓰기/스냅샷 경로에서 후속 발화할 가능성; ephemeral→durable 전환으로 Windows 팀 relay에 처음 디스크 쓰기가 실제 발생하며 드러날 미지의 경로/권한 상호작용. |

**Next:** R39(claude-rev + fable-advisor 필수) → approved 후에만 구현(레인 위임). 라이브 스모크 = Mac 로컬(0.24.1 절차 재사용) + Windows 재배포 라이브(room create 성공→스냅샷 생성→Task 재시작→룸 생존). 이 웨이브가 0.24.1 유예분(Windows 재로그온 룸 유지)을 완결.

### 0.24.1 — relay 룸 영속화 배선 갭 (`loom relay` 포그라운드 durable)

| Field | Value |
|-------|-------|
| **PLAN** | v0.24.1 (`pending-review`) |
| **Date** | 2026-07-19 |
| **Review** | R38 required (보안·신뢰 경계 — peerSecret 평문 스냅샷의 적용 범위 확대; PATCH여도 필수) |

| 분면 | 내용 |
|------|------|
| Known knowns | durable 경로 전 체인이 기구현·정상 — 영속화(`persist.ts` RoomSnapshotV1)·기동 복원(`room.ts:687` `loadFromDisk`→`:709-732`, 초대코드 byCode `:720`·`:730`)·멤버십/secret 복원(`room.ts:102-151`, M-22/M-7)·M-23 락(`room.ts:682` acquire·`:691-696` close). 로컬 데몬 durable 실측(`~/.loom/relay-state` 3스냅샷·15:00 갱신). relay 재시작 룸 소실 4회가 **전부 포그라운드 경로**(`index.ts:3204` 무-registry `RelayServer`). durable 배선 정본은 `relay/cli.ts:38-80`(데몬 CLI). |
| Known unknowns | (1) Mac에서 로컬 데몬 relay 구동 중 `loom relay` 포그라운드 실행 시 기본 stateDir(`~/.loom/relay-state`) 충돌 → M-23 락 fail-closed 발화 빈도가 운영상 수용 가능한지(escape hatch 2종 `LOOM_RELAY_EPHEMERAL`·`LOOM_RELAY_STATE_DIR`로 대응). (2) Windows(NTFS)에서 chmod 0600·mkdir 락 의미론 — 코드는 chmod try/catch fail-safe 기확인(`persist.ts:216-220`), 락은 mkdir 원자성이나 Windows 실검증은 배포 후로 유예. |
| Unknown knowns | "Production durable ON by default"가 이미 제품 방침(`relay/cli.ts:41` 주석) — 포그라운드도 그 방침의 적용일 뿐, 신규 정책 결정이 아니다. |
| Unknown unknowns | 스냅샷 무한 누적의 장기 영향(GC 부재 — `maybeGc` no-op `room.ts:765-767`, D7 후속); 두 relay 프로세스가 서로 다른 stateDir로 같은 포트를 경합하는 배치 오류류. |

**Next:** R38(claude-rev + fable-advisor 필수) → approved 후에만 구현(레인 위임). 라이브 스모크 = `loom relay` 포그라운드 durable 왕복(룸 생성→SIGTERM→재기동→초대코드 join). Windows 실증은 오너 배포 후 유예.

### 0.23.0 — conv 멀티턴 수직 슬라이스

| Field | Value |
|-------|-------|
| **PLAN** | v0.23.0 (`pending-review`) |
| **Date** | 2026-07-18 |
| **Review** | R25 required (새 MCP 표면 4도구 + M-1/M-2 신뢰 경계 집행 코드 + 프로토콜 인접) |

| 분면 | 내용 |
|------|------|
| Known knowns | `docs/CONV_SPEC.md`가 R24 author-close로 `approved`(M-1 conv↔peer pin·M-2 artifact ref 검증 규약 locks 반영 + L-1..L-5 완료); 0.22.0이 herdr 연결점(데몬·dispatch/done 컨트랙트·M-1 dispatcher 인가·M-2 제출 분리)을 이미 검증·shipped; `card-contract.ts`/`bridge-runtime.ts`/`herdr-client.ts` 선례가 conv 계약·브릿지 확장의 미러 대상; relay 와이어 protocol v1 무변경 원칙(attachment 컨벤션만)이 0.22.0에서 실증됨; 오너가 conv 멀티턴 트랙을 명시 승인(HANDOFF.md, 2026-07-18). |
| Known unknowns | (1) `conv_await` 블로킹의 MCP 클라이언트별 tool-call 타임아웃 상호작용 — 실측 필요(CLI마다 타임아웃 편차 가능); (2) 워커 pane 수명과 conv 수명 불일치 — pane이 죽으면 conv는 pause인가 abort인가(CONV_SPEC 미명시); (3) 32k 임계 판정과 herdr pane 스크레이프 기반 요약 회신의 정합 — `pane.read` 단발 회수가 실시간 턴 크기를 정확히 반영하는가; (4) artifact fetch 명령 "제시"의 UX 표면 — 워커 CLI 프롬프트 노출 vs 사람 승인 큐(미정, 자동 실행은 비-스코프로 확정됐으나 제시 방식은 미정). |
| Unknown knowns | M-1 pin과 M-2 검증 함수 둘 다 "이미 존재하는 집행 원시(fromPeerId 서버 지정)를 코드로 옮기는" 성격 — R23 locks 구현 경험(allowlist·제출 분리)이 그대로 이전 가능할 가능성이 높으나 conv의 다턴 특성(pin이 대화 전체 수명 동안 유지)이 카드 dispatch의 1회성 인가와 실제로 동형인지는 구현 중 확인 필요. |
| Unknown unknowns | conv 세션 상태(pin·last-seen turnSeq·한도 카운터)의 영속화 경계 — 타워 재시작 시 진행 중 conv의 pin/seq 상태가 살아남아야 하는지 스펙이 명시하지 않음; 브릿지 측 herdr `agent send` pane 주입이 다턴 대화에서 반복될 때 pane 상태 누적(컨텍스트 오염)의 실제 동작은 0.22.0 단발 dispatch에서 검증되지 않은 영역. |

**Next:** R25(claude-rev + fable-advisor 필수) → approved 후에만 구현(레인 위임). CONV_SPEC과 충돌 발견 시 PLAN 0.23.0의 "R25 질의"에 기록하고 구현 보류.

### 0.22.0 — Loom×Herdr 노드 브릿지 (수직 슬라이스)

| Field | Value |
|-------|--------|
| **PLAN** | v0.22.0 (`pending-review`) |
| **Date** | 2026-07-17 |
| **Review** | R23 required (새 데몬 표면 + MCP 표면 확대 + 원격 프롬프트 주입 신뢰 경계) |

| 분면 | 내용 |
|------|------|
| Known knowns | handoff는 durable inbox로 전달 보장(persist fail-closed); peerSecret rejoin(M-7); 데몬 관례 완비(메타 사이드카·Bearer IPC·M-27 안전 stop); work-bus `[GOAL]`/`[DONE]` 태그 dispatch 선례; **Step 0 go** — WSL→Windows relay는 Win10 NAT 게이트웨이 IP 경로(health `version:1` + join 왕복 실측); **Step 0.5 go** — herdr v0.7.4 NDJSON 소켓 표면 실측 + fixture 고정(보정 C1–C3 설계 반영) |
| Known unknowns | (1) 장기 `events.subscribe` 구독 안정성 — 절단 시 재구독·이벤트 유실·at-most-once dispatch 보장(재연결 순서 ①재핸드셰이크→②재구독→③스냅샷 reconcile로 설계, 실증 미완); (2) inbox 100건 trim vs 장기 오프라인 브릿지의 카드 유실 허용 여부; (3) 워커 pane 자동 제출이 M-2와 별도 신뢰 모델로 승인 가능한가(R23 판단); (4) 브릿지 AgentKind — `bridge` enum 확장 vs `shell` 유지(슬라이스는 shell, 확장은 와이어 인접이라 별도 게이트); (5) 실제 Claude/Codex detection이 `done`을 언제 emit하는가(Step 0.5 잔여 — 배시 프로브만 검증됨) |
| Unknown knowns | herdr `done` 롤업의 정확도 — 에이전트가 정말 끝났는가 vs idle 오판(PTY spike의 idle 감지 교훈이 이 경계에도 적용될 것); "이벤트에 출력 본문 없음 = 백프레셔 설계"라는 권고 문서 해석의 타당성 |
| Unknown unknowns | WSL 절전·Windows 재부팅 시 브릿지/소켓 생존(Step 0 ⑥ 30m soak 생략됨); herdr AGPL 결합 경계가 배포 형태에 따라 달라지는 지점; Bun WS 클라이언트 장시간 연결의 미지 동작; herdr pre-1.0 와이어 변동(protocol 16 기준 fixture 고정으로 완화) |

**Next:** R23(claude-rev + fable-advisor 필수) → approved 후에만 구현(레인 위임). fake herdr는 `docs/spikes/fixtures/herdr-v0.7.4/` 고정.

### 0.21.0 — PTY handoff inject (pending-review R22)
| 분면 | 내용 |
|------|------|
| Known knowns | 기반코드 존재(`handoff-inject.ts` `prepareInjectText`/`injectIntoStdin` experimental); PTY 실행 래퍼(`run-with-pty.py`); R1이 default no-go·opt-in deferred로 판정; 안전조건 3개(idle+accept+opt-in) 이미 정의됨 |
| Known unknowns | **에이전트 유휴 감지 방식**(Claude hooks vs 출력 quiescence 휴리스틱, 오탐 처리); 제어 채널(named pipe/unix socket/sticky RPC/fd); accept→inject 구동 위치(`loom run` vs sticky host) |
| Unknown knowns | 주입 텍스트를 에이전트가 실제 사용자 입력으로 처리하는지(Phase 1.5 수동 매트릭스 미완 — Claude Code부터 채움); busy-중 주입의 실패 양상이 에이전트별로 다를 수 있음 |
| Unknown unknowns | Claude Code 버전업 시 hooks/TUI 동작 변화; PTY 래퍼(python)와 Bun 프로세스 간 신호/소유권 경합; 주입이 에이전트 세션 상태를 오염시키는 미지 경로 |

### 0.20.0 — Tier A3 `loom doctor` 자가진단 (pending-review)

| Field | Value |
|-------|--------|
| **PLAN** | v0.20.0 (`pending-review`) |
| **Date** | 2026-07-11 |
| **Review** | R21 required (새 CLI 서브커맨드 표면). **구현은 다음 세션** |

| 분면 | 내용 |
|------|------|
| Known knowns | 진단 표면 다 존재: `Bun.which`/loomCmd(install), `loomDir`/`getActiveProfile`(home), `loadSession`(session), `parseRelayUrl`/`isLoopbackHost`+`/health`(relay), `resolveLiveHostMeta`/`describeHostMeta`/`stickyRpc`(host). Docker 하네스가 실패 모드(PATH·unzip·loopback) 이미 노출. |
| Known unknowns | (1) exit code 계약 — 항상 0 vs `fail`시 non-zero vs `--strict`. (2) `/health` 프로브 타임아웃(오프라인 relay 매달림 방지). (3) 세션 없음(설치 직후) 첫 실행 출력이 유용한가. (4) read-only 보장 — auto-host 절대 안 띄움. |
| Unknown knowns | 낯선 사람은 "무엇이 틀렸는지"가 아니라 "다음 한 걸음"을 원함 → 각 fail에 조치 힌트 필수. |
| Unknown unknowns | 비표준 셸/컨테이너/CI에서의 health GET 동작·타임아웃, describeHostMeta가 stale pid를 live로 오판하는 경계. |

**Next session:** R21 → 0.20.x implement(`cmdDoctor` + dispatch + 테스트) → docs.

### 0.19.0 — Tier A1 5분 설치 경로 install script (pending-review)

| Field | Value |
|-------|--------|
| **PLAN** | v0.19.0 (`pending-review`) |
| **Date** | 2026-07-11 |
| **Review** | R20 required (새 표면 + `curl\|bash` 신뢰 경계) |

| 분면 | 내용 |
|------|------|
| Known knowns | repo PUBLIC(익명 clone 가능). blob이 relayUrl+token 운반(0.18.0). `bun link`는 이미 있으나 `link-loom.sh`는 PATH 안내만 출력하고 종료. Bun 공식 installer(`bun.sh`) 위임 가능. |
| Known unknowns | (1) **PATH 활성화**(판정 리스크) — curl\|bash는 호출자 셸 못 바꿈 → 절대경로 검증 + rc append + `exec $SHELL` 안내로 충분한가. (2) shell rc 감지(bash/zsh/fish, 멱등). (3) 고정 clone 디렉토리 + 기존 충돌 시 update vs 거부. (4) 재실행 멱등성. (5) `curl\|bash` 핀 — main vs 태그(공급망). |
| Unknown knowns | 낯선 사람은 4개 수동 실패점 중 첫 하나에서 멈춘다 — 스크립트가 그 판단을 대신 내려줘야 함. |
| Unknown unknowns | Bun 설치 실패(네트워크·권한)·기존 다른 버전 Bun 충돌·비표준 셸 환경에서의 rc 위치. |

**Next session:** R20 → 0.19.x implement(install.sh + README + `loomCmd` 스윕) → tests → docs.

### 0.17.0 — Launcher UX up / host-default (pending-review)

| Field | Value |
|-------|--------|
| **PLAN** | v0.17.0 (`pending-review`) |
| **Date** | 2026-07-10 |
| **Review** | R18 required; **next session implements after approve** |

| 분면 | 내용 |
|------|------|
| Known knowns | sticky already daemonizes (unref). Multi-profile = multi session file. Work bus ships 0.16. dogfood-room-up exists for join only. |
| Known unknowns | (1) dogfood:up vs loom up naming — plan: both (script + CLI). (2) Auto-host on every join may surprise headless CI — plan: LOOM_NO_AUTO_HOST + --no-host. (3) Whether --watch on up is default — plan: **opt-in only**. |
| Unknown knowns | Users think host = open terminal; education + up removes the confusion. |
| Unknown unknowns | Orphan hosts after crash; down must be robust via meta.pid. |

**Next session:** R18 → 0.17.x implement → tests → docs.

### 0.16.0 — Work bus board notify + loom work (pending-review)

| Field | Value |
|-------|--------|
| **PLAN** | v0.16.0 (`pending-review`) |
| **Date** | 2026-07-10 |
| **Review** | R17 required |

| 분면 | 내용 |
|------|------|
| Known knowns | Handoff is delivery SSOT (durable, notify when online). Board is local file. Receive path is pull (`check_handoffs`). No CRDT. 0.15 tags/purpose exist. |
| Known unknowns | (1) Default notify-on-assignee vs require `--notify` — plan locks **default on when --as set**. (2) watch poll vs sticky events — plan locks **poll v1**. (3) Re-assign spam if assign called twice — plan: one handoff per assign call. |
| Unknown knowns | Users think “board = work queue”; without bridge they are wrong. |
| Unknown unknowns | Flood of notify if scripts loop board add; mitigate with docs + no notify on status-only updates. |

**Next:** R17 → implement or pending-revision locks only.

### 0.15.0 — Purpose-based sprint 1 (pending-review)

| Field | Value |
|-------|--------|
| **PLAN** | v0.15.0 (`pending-review`) |
| **Date** | 2026-07-10 |
| **Review** | R16 required before implement |

| 분면 | 내용 |
|------|------|
| Known knowns | Handoff is pull (`check_handoffs`/`claim`); no PTY inject. Board/pack are room-scoped local 0600 files. Dogfood roles impl/reviewer exist as docs+profiles. Wire v1 frozen for this sprint. |
| Known unknowns | (1) MCP `set_purpose` vs CLI-only for v1 — plan includes both. (2) Whether `--with-purpose` is attachment vs body section — impl free if sanitize+caps. (3) `loom verify` cwd = process.cwd() vs session-bound path — plan: process cwd at invoke. |
| Unknown knowns | Reviewers ignore stderr handoff banners; only first-prompt + MCP pull works in practice. |
| Unknown unknowns | Agents ignoring hints still; purpose file races multi-profile same UID (accept like board); verify recipe abuse if agent can set_purpose then verify — residual local UID trust. |

**Next:** R16 → if approved implement; if pending-revision only Open locks.

### 0.14.0 — P2 durable relay inbox/roster (pending-review)

| Field | Value |
|-------|--------|
| **PLAN** | v0.14.0 (`pending-review`) |
| **Date** | 2026-07-10 |
| **Review** | R15 required before implement |

| 분면 | 내용 |
|------|------|
| Known knowns | Today: `Room.inboxes` + `members` in memory only (`packages/relay/src/room.ts`); restart loses handoffs. Board/pack already use atomic JSON + 0600 under `~/.loom`. M-7 peerSecret must survive with roster. Protocol v1 / claim first-wins / leave-drops-inbox stay. Caps L-11/L-16 stay. |
| Known unknowns | (1) Sync write every mutation vs short debounce — plan prefers **sync** for simpler durability proof. (2) Whether auto-daemon (`ensureLocalRelay`) needs explicit `LOOM_RELAY_STATE_DIR` or just default home. (3) Disk growth if rooms never left — accept until GC backlog. (4) Exact placement of atomic helper (relay-local vs lift from host) — plan: **relay-local `persist.ts`** to avoid host↔relay cycle. |
| Unknown knowns | Operators expect “restart relay ≠ lose handoffs” once dogfood documents it; empty inbox after restart is a trust-break. |
| Unknown unknowns | Multi-host same NFS path; crash mid-rename on exotic FS; very large attachment spam filling disk despite caps; partial write if chmod fails on Windows (out of primary dogfood). R15 should probe fail-open vs fail-closed on load errors. |

**Next:** R15 on PLAN 0.14.0 → if approved, implement; if pending-revision, only Open blocking.

### 0.11.1 — M4.3b Tauri shell (plan locked)

| Field | Value |
|-------|--------|
| **PLAN** | v0.11.1 (`approved`) |
| **Date** | 2026-07-09 |

| 분면 | 내용 |
|------|------|
| Known knowns | sticky RPC status/peers/inbox/claim; loopback; M-18 **C** no Board v1; M-19 Rust invoke + session order; M-20 textContent-only |
| Known unknowns | Tauri 2 monorepo layout polish; macOS signing later; multi-window |
| Unknown knowns | desktop visual taste — optional mock during implement |
| Unknown unknowns | (closed for plan) board gap, CORS, sanitize≠HTML — locked in 0.11.1 |

**Next:** implement `apps/desktop` under 0.11.1. Board UI = later gate.

### 0.11.0 — superseded

R13 pending-revision material; see plan_review R13 + PLAN 0.11.1.

---

## Changelog

| 날짜 | 내용 |
|------|------|
| 2026-07-09 | 초안 + 0.11 stub |
| 2026-07-09 | R13 fill; 0.11.1 locks |
| 2026-07-10 | 0.14.0 P2 durable inbox unknowns |
| 2026-07-10 | 0.15.0 purpose-based sprint 1 unknowns |
| 2026-07-10 | 0.16.0 work bus unknowns |
| 2026-07-10 | 0.17.0 launcher UX unknowns |
| 2026-07-17 | 0.22.0 Loom×Herdr 노드 브릿지 unknowns (Step 0/0.5 go 반영) |
| 2026-07-18 | 0.23.0 conv 멀티턴 수직 슬라이스 unknowns (CONV_SPEC R24 approved 반영) |
| 2026-07-19 | 0.24.1 relay 룸 영속화 배선 갭 unknowns (`loom relay` 포그라운드 durable) |
| 2026-07-20 | 0.26.0 hooks 보조 센서 unknowns (U1~U6 요약 + 스파이크 실측 Known knowns · `pending-review` R41) |
| 2026-10-15 | 0.29.0 룸 이벤트 seq + 안정 id unknowns (UK-1~UK-6 요약 + 코드 실측 Known knowns · `pending-review` R47) |
| 2026-10-15 | 0.29.0 R47 판정 반영 (UK-1/2/3/5/6 resolved · UK-4 open 비차단 · PLAN `approved`) |
| 2026-10-15 | 0.30.0 헤드리스 카드 워커 unknowns (UK-1~UK-9 요약 · UK-5 차단 · 프로브 실측 Known knowns · `pending-review` R48) |
| 2026-10-15 | 0.30.0 R48 판정 + 후속 실측 반영 (UK-1/3/5/8/9 resolved · UK-2/4/6/7 open 비차단 · PLAN `approved`) |
| 2026-10-15 | 0.31.0 스킬 materialize + policy.json 번역 unknowns (UK-1~UK-7 요약 · 전부 비차단 · 프로브 실측 Known knowns · `pending-review` R49) |
| 2026-10-15 | 0.31.0 R49 판정 반영 (UK-1 → P2 deny 경로 차단 · UK-6 비차단 유지(D13 기본 true) · UK-7 메커니즘 명시 · PLAN `approved`) |
| 2026-10-15 | 0.31.0 UK-1 실측 resolved (`SKILLS-POLICY-PROBE.md` §G — grok `Bash(p *)` 맨 명령 미차단 → 이중 형식 유지 · claude `p*` 과매칭 → `p*` 형 금지) |
| 2026-10-15 | 0.31.0 ship 반영 (UK-5 resolved — §H `--settings` MCP deny = 툴 숨김·신호 없음 · UK-7 resolved — dist에 내장 스킬 포함 · UK-2/3/4/6 open 비차단) |
| 2026-10-16 | 0.32.0 Loom MCP 사전 점검 unknowns (UK-1~UK-5 요약 · 전부 비차단 제안 · 코드 실측 Known knowns · `pending-review` R50) |
| 2026-10-16 | 0.32.0 R50 판정 반영 (UK-5 → M2 실측으로 제외 · UK-1~UK-4 open 비차단 · PLAN `approved`) |
| 2026-10-16 | 0.32.0 ship 반영 (UK-1·UK-3·UK-4 resolved — `MCP-PRECHECK-SMOKE-0320.md` · UK-2 resolved — P3 조사 · 정직 표 codex 행 정정) |
| 2026-10-16 | 0.33.0 bridge 생명주기 보강 unknowns (UK-1~UK-4 요약 · UK-1~UK-3 비차단 제안 · UK-4 실측 — bridge 경로 `ensureRelay` 미호출 · `pending-review` R51) |
| 2026-10-16 | 0.33.0 R51 판정 반영 (UK-4 resolved · UK-1~UK-3 open 비차단 · M1·M2·M3 교훈 Unknown knowns 기재 · PLAN `approved`) |
| 2026-10-16 | 0.33.0 ship 반영 (UK-1 resolved — P2 + `BRIDGE-LIFECYCLE-SMOKE-0330.md` · UK-2 macOS resolved / Linux 미실측 · UK-3 resolved-by-decision — 600초 유지) |
| 2026-10-16 | 0.34.0 `loom service` unknowns (UK-1~UK-5 요약 · 전부 비차단 제안 · 코드 실측 Known knowns · `pending-review` R52) |
| 2026-10-16 | 0.34.0 R52 판정 반영 (UK-1~UK-5 open 비차단 · M1·M2·M3·L2 교훈 Unknown knowns 기재 · PLAN `approved`) |
| 2026-10-16 | 0.34.0 ship 반영 (UK-2 partly observed — 프로브 사고 알림 · UK-1 · UK-3 open — 라이브 not run(오너 승인 대기) · UK-4 · UK-5 unverified — Linux 미사용 · `SERVICE-SMOKE-0340.md` · R52-L1 `envRelayToken()` 문면 정정) |
