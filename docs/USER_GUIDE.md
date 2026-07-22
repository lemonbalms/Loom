# Loom 사용자 가이드 — 사용 사례로 배우기

**철학 (첫 문단):** 이 가이드는 **지금 버전으로 할 수 있는 일**을 시나리오로 가르치되, **완료처럼 보이는 신호를 완료로 착각하지 않게** 같은 호흡으로 경고한다. Loom은 또 하나의 코딩 에이전트가 아니라 — *connect your agents, and your teammates* — Room·handoff·inbox·board·MCP·bridge를 붙여 **이종 에이전트와 사람이 일을 넘기는** 레이어다.

| Field | Value |
|-------|--------|
| **문서** | `docs/USER_GUIDE.md` |
| **대상** | Loom을 **쓰는** 사람 (개발자·페어·에이전트 운영) |
| **제품 버전** | CLI **v0.28.1** / desktop UI **v0.12.2+** 기준 (기능 집합은 CLI 핀을 따름) |
| **관련** | [README](../README.md) · [CHANGELOG](./CHANGELOG.md) · [TEST_PLAN](./TEST_PLAN.md) · [ADAPTERS](./ADAPTERS.md) · [ARCHITECTURE](./ARCHITECTURE.md) · [데스크톱](../apps/desktop/README.md) · [PITCH](./PITCH.md) |

---

## 0. 시작 전에

### 0.1 설치·실행 위치

```bash
cd /path/to/Loom   # 또는 fable-advisor 로컬 클론 루트
bun install
```

| 방식 | 명령 | 비고 |
|------|------|------|
| **A. 항상 안전** | `bun run loom …` | PATH 불필요, 레포 루트 |
| **B. 글로벌 bin** | `bun run link:loom` 후 `export PATH="$HOME/.bun/bin:$PATH"` | 어디서나 `loom` |
| **C. 레포 래퍼** | `export PATH="$PWD/scripts:$PATH"` | `scripts/loom` → bun CLI |
| 해제 | `bun run unlink:loom` | B 링크 제거 |

```bash
bun run link:loom
export PATH="${BUN_INSTALL:-$HOME/.bun}/bin:$PATH"
loom --version
loom doctor
```

아래 예시는 **`bun run loom`** 기준 (A). 링크 후엔 `loom` 으로 바꿔 쓰면 됩니다.  
단기 우선순위: [`PRIORITIES.md`](./PRIORITIES.md).

### 0.2 꼭 알아둘 개념

| 개념 | 의미 |
|------|------|
| **Room** | `LOOM-XXXX` 초대 코드로 묶인 공유 공간 |
| **Peer** | 방에 참가한 사람(+에이전트) 한 명. 온라인/오프라인 |
| **Profile** | 같은 머신에서 세션을 나누는 이름 (`--profile alice`) |
| **Handoff** | 상대 인박스로 보내는 작업/메시지 (`@이름` / peer id / `*`) |
| **Inbox** | 내가 받은 handoff 목록. 오프라인이어도 쌓임 |
| **Sticky host** | `host start` — 연결을 유지해 피어를 online으로 유지 |
| **Pack** | 방 단위 로컬 컨텍스트(요약·경로·노트). 핸드오프에 선택 첨부 |
| **Board** | 방 단위 **로컬** 태스크 보드 (머신마다 파일; 실시간 CRDT 아님) |
| **Relay** | 메시지 중계 서버. 로컬 자동 또는 LAN/원격 수동 |
| **Bridge** | 노드에서 카드(dispatch)를 받아 워커 pane(claude/codex/grok)을 돌리는 장수 프로세스 |
| **Card** | handoff attachment로 실리는 작업 계약 — 노드 bridge가 claim·실행·결과 회신 |
| **Herdr** | 워커 pane을 띄우는 외부 멀티플렉서. Loom 0.28.1 기준 **0.7.5 / protocol 17** |
| **완료 권한** | board를 `done`으로 확정할 수 있는 권한. **`card.done`·pane 종료·원격 result만으로는 없음** (0.28.0) |
| **`blocked` (원격 result)** | 원격이 `done`을 주장해도 tower board는 **검증 대기 격리**로만 옮김 |

**한 줄 규칙 (0.28):** 회신이 왔다고 일을 끝내지 마라. **로컬에서 산출물을 확인한 뒤** board를 옮긴다.

### 0.3 세션·프로필

```bash
# 프로필별 세션 파일: ~/.loom/profiles/<name>.json
bun run loom --profile alice room create --as alice

# 또는 환경변수
export LOOM_PROFILE=alice
bun run loom peers
```

같은 머신에서 **두 사람(또는 두 역할)** 을 흉내 낼 때는 반드시 **프로필을 다르게** 쓰세요.  
`host start` / `host stop` / `desktop` 도 **같은 프로필**을 맞춰야 합니다.

### 0.4 자동 스모크 (설치 확인)

```bash
bun test                 # 유닛/통합
bun run smoke:desktop    # sticky RPC + board + handoff (GUI 없음)
bun run loom --version
bun run loom doctor      # 설치/home/session/relay/host 읽기전용 진단
```

---

## 사용 사례 목록

| # | 시나리오 | 핵심 기능 |
|---|----------|-----------|
| 1 | 같은 머신, 두 프로필로 핸드오프 | room, handoff, inbox |
| 2 | 오프라인 수신 — 나중에 열어보기 | inbox, first-wins claim/accept |
| 3 | 온라인 유지 (sticky host) | host start/stop |
| 4 | 데스크톱으로 보고 보내기 | apps/desktop |
| 5 | 방 채팅·피어 확인 | peers, chat, listen |
| 6 | 컨텍스트 팩을 핸드오프에 실어 보내기 | pack, --with-pack |
| 7 | 태스크 보드로 일감 관리 | board CLI / desktop Board |
| 8 | 보드 스냅샷을 다른 머신에 넘기기 | board export/import, --with-board |
| 9 | 코딩 에이전트(Claude/Codex/Grok)와 MCP | run, agents, MCP tools |
| 10 | LAN/원격 멀티 머신 | loom relay, --relay, --token |
| 11 | 헤드리스 회귀 확인 | smoke:desktop, bun test |
| 12 | 오케스트레이터 CLI 전환·bridge 복구 (Claude 먹통 → Grok 이어하기) | relay vs bridge vs 세션, card 디스패치 |
| 13 | 완료 권한 — `card.done` 이후 board를 어떻게 닫나 (0.28.0) | blocked · 로컬 검증 · 명시 mutation |
| 14 | herdr 0.7.5 dogfood 준비 (0.28.1) | `dogfood:herdr` · named agent · config migrate |
| 15 | (참고) 세션 연속성 — 개발자용 HANDOFF/status | `bun run status` · `HANDOFF.md` (제품 room handoff와 별개) |

릴리즈 요약: [`CHANGELOG.md`](./CHANGELOG.md).

---

## 1. 같은 머신 — 두 프로필 핸드오프 (입문)

**하고 싶은 일:** 한 노트북에서 alice / bob 을 나눠, bob이 작업을 alice 인박스로 보낸다.

### 단계

**터미널 A (alice)**

```bash
bun run loom --profile alice room create --name demo --as alice
# Invite code: LOOM-XXXX  기록
```

**터미널 B (bob)**

```bash
bun run loom --profile bob room join LOOM-XXXX --as bob
bun run loom --profile bob peers
bun run loom --profile bob handoff @alice "PR 리뷰 부탁: auth 모듈"
```

**터미널 A**

```bash
bun run loom --profile alice inbox
bun run loom --profile alice inbox accept ho_…   # 목록에 나온 id
```

### 결과

- alice 인박스에 메시지/태스크가 쌓임  
- **accept**(사람) 또는 **claim**(에이전트) 중 하나만 성공 (**first-wins**)

### 변형

```bash
# 브로드캐스트
bun run loom --profile bob handoff '*' "스탠드업 5분 뒤"

# peer id로 지정
bun run loom --profile bob handoff p_abc123 "direct by id"
```

---

## 2. 오프라인 핸드오프 — “나중에 열어도 안 사라짐”

**하고 싶은 일:** 상대가 자리를 비워도 작업을 보내고, 돌아와서 받는다.

### 단계

1. alice가 room 참가 후 **host / listen 없이** 나가 있어도 됨 (또는 아예 세션만 유지).  
2. bob이 `@alice` 로 handoff.  
3. 나중에 alice:

```bash
bun run loom --profile alice inbox
bun run loom --profile alice inbox accept ho_…
```

### 결과

- 로스터에 offline으로 있어도 **인박스에 큐잉**  
- 이게 Loom의 핵심 가치 (“오프라인이어도 유실 없음”)

### 작업 버스 (Work bus) — 0.16+

보드 카드 → **handoff로 전달** (CRDT 아님). 수신은 inbox / `loom work`.

```bash
# 송신: assignee 있으면 기본 notify (handoff [GOAL] + task:id)
bun run loom board add "Review PLAN" --as claude-review
# 끄려면 --no-notify

# 수신
bun run loom work              # inbox + 내 open tasks
bun run loom work watch        # 2s poll (min 250ms)
bun run loom inbox accept ho_…
```

### 목적 (Purpose) — 0.15+

방 단위로 “왜 하는가 / 성공 기준 / 비목표 / verify 레시피”를 둡니다.

```bash
bun run loom purpose set "Ship purpose-based multiplayer loop"
bun run loom purpose set "…" --verify "bun test"
bun run loom purpose show
bun run loom verify --yes    # prints commands; --yes after first review (M-25)
bun run loom handoff @peer "[GOAL] align on purpose" --with-purpose
```

- `verify[]` 는 **CLI만** 기록 가능 (MCP `set_purpose` 거부 — M-24)  
- 태그: `[GOAL]` `[R-REQUEST]` `[R-RESULT]` `[VERIFY]` `[DONE]`  
- `loom run *` 시작 시 pending inbox 배너 + agent hint 에 check_handoffs 강제  

### 내구성 (0.14+)

기본 relay는 room meta · roster(+peerSecret) · pending inbox(`queued`|`notified`)를 디스크에 둡니다.

| 항목 | 값 |
|------|-----|
| 기본 경로 | `~/.loom/relay-state/` (auto-daemon: `loomDir()/relay-state`) |
| 오버라이드 | `LOOM_RELAY_STATE_DIR` |
| 끄기 | `LOOM_RELAY_EPHEMERAL=1` (테스트/일회성) |
| 검증 | `bun run smoke:durable` · `bun test` persist tests |

**재시작 후:** 같은 state dir로 relay를 다시 띄우면 offline 큐가 남고, 세션의 `peerSecret`으로 rejoin 가능합니다.  
**leave / claim 후 재시작:** leave한 peer·claim한 항목은 복구되지 않습니다 (first-wins).

---

## 3. 온라인 유지 — sticky host (0.17: 기본 자동)

**하고 싶은 일:** 에이전트/CLI를 잠깐 안 써도 피어가 **online** 으로 남고, 알림 경로가 살아 있게 한다.

**0.17부터 host는 기본값입니다.** `room create` / `room join` 이 성공하면 해당 프로필의
sticky host가 **백그라운드에서 자동 시작**됩니다. 끄려면 `--no-host` 또는 `LOOM_NO_AUTO_HOST=1`.

```bash
# 방 참가 → host 자동 시작 (백그라운드)
bun run loom --profile alice room join LOOM-XXXX --as alice
#   host auto-started (pid …); disable with --no-host or LOOM_NO_AUTO_HOST=1
#   (join은 구세션 host를 내리고 새 host를 올리므로 최대 ~8초 걸릴 수 있음)

# 여러 프로필을 한 번에 백그라운드 online (순차, M-28)
bun run loom up --profiles alice,bob       # 프로필별 sticky host; --profiles 생략 시 세션 있는 전부
bun run loom up --status                   # 프로필별 online/offline 보고 (스폰 안 함)
bun run loom down --profiles alice,bob     # 전부 정지 (멱등)

# 단일 프로필 수동 제어 (advanced / recovery)
bun run loom --profile alice host start|stop|status
```

**일상 흐름:** 아침에 `up` 한 번 → 창 닫아도 online → 송신은 `board add`/`handoff` →
**작업할 때만** `run <agent>` 로 TUI를 연다.

### 함께 쓰면 좋은 것

| 목적 | 명령 |
|------|------|
| 터미널에 실시간 알림 | `bun run loom --profile alice listen` |
| 데스크톱 UI | host 온라인 후 `bun run desktop` (같은 프로필) |
| MCP/CLI 짧은 명령 | sticky가 있으면 one-shot 대신 IPC 사용 |
| 내 작업 피드 | `bun run loom --profile alice work` (inbox + 내 보드 태스크) |

### 주의

- `down` 의 kill-safety(M-27): RPC 정지 실패 후 강제 종료 전, 대상 pid가 실제 우리 sticky
  프로세스인지(cmdline `sticky-main.ts`) 확인합니다. 확인 실패 시 **죽이지 않고** meta만 정리합니다.
- 프로필 불일치 시 “already running” / “no host” 혼선 — `up`/`down` 은 프로필을 순회하므로 권장.

---

## 4. 데스크톱 앱으로 협업 데스크

**하고 싶은 일:** CLI 없이 Status / Peers / Send / Inbox / Board 를 GUI로 쓴다.

### 전제

```bash
bun run loom --profile alice room create --as alice   # 또는 join
export LOOM_PROFILE=alice    # desktop과 동일하게
bun run loom --profile alice host start
```

### 실행

```bash
bun run desktop
# = cd apps/desktop && bunx tauri dev
```

### 탭별 할 수 있는 일 (v0.12.2)

| 탭 | 사용 사례 |
|----|-----------|
| **Status** | host 연결 상태, 세션 경로, **초대 코드** 확인 |
| **Peers** | 누가 online/offline인지 보기 |
| **Send** | `@peer` / `*` 로 handoff (message·task) 또는 room chat |
| **Inbox** | 받은 일 Claim / Accept |
| **Board** | 태스크 추가, status 변경 (CLI 보드와 동일 파일) |

### UX 팁

- **R** 또는 Refresh — 수동 갱신  
- **Auto 5s** — 자동 갱신  
- Inbox/Board 배지 — 개수 한눈에  
- 토큰은 webview에 안 넘어감 (Rust만 sticky Bearer 사용)

### 헤드리스 검증만 할 때

```bash
bun run smoke:desktop
```

---

## 5. 피어 확인·방 채팅·listen

**하고 싶은 일:** “지금 누가 있지?” / 짧은 동기화 메시지 / 알림만 받기.

```bash
bun run loom --profile alice peers
bun run loom --profile alice chat "머지 전에 보드 봐줘"
bun run loom --profile alice listen    # 핸드오프 알림 스트림
bun run loom --profile alice status    # 세션·room 요약
```

### 사용 예

- 스탠드업 전 `peers` 로 online 확인  
- `chat` 으로 “배포 10분 뒤” 공지  
- `listen` 을 띄워 두고 다른 창에서 코딩

---

## 6. 컨텍스트 팩 (pack) — “이 방의 맥락 메모”

**하고 싶은 일:** 방 공통으로 볼 요약·파일 경로·노트를 남기고, 핸드오프에 실어 보낸다.

```bash
bun run loom --profile alice pack set --summary "Auth refactor week"
bun run loom --profile alice pack add ./src/auth.ts
bun run loom --profile alice pack note "미들웨어 순서 주의"
bun run loom --profile alice pack show

# 핸드오프에 팩 첨부 (옵트인) — 경로/요약/노트만
bun run loom --profile alice handoff @bob "이 컨텍스트로 이어서" --with-pack

# L-5: 파일 본문까지 첨부 (cwd allowlist 재검증 후 읽기, 최대 8파일·64k chars/파일)
bun run loom --profile alice handoff @bob "코드 스니펫 포함" --with-pack-embed
```

### 중요 규칙

- 팩은 **roomId 단위 로컬 파일** (같은 OS 유저·같은 방이면 프로필 간 공유될 수 있음 — 의도된 room-scope).  
- 첨부 **경로를 수신자가 자동으로 열지 않음** — 표시/메타데이터. 다른 머신의 로컬 경로일 수 있음.  
- **`--with-pack-embed`**: 허용 루트(보통 cwd) 안의 **파일**만 본문 첨부. 디렉터리·바이너리·너무 큰 파일·allowlist 밖 경로는 스킵.  
- MCP: `handoff({ withPackEmbed: true })`.

---

## 7. 태스크 보드 — “방 할 일 목록”

**하고 싶은 일:** todo/doing/done 등으로 일을 나누고, CLI 또는 데스크톱에서 같은 보드를 본다.

### CLI

```bash
bun run loom --profile alice board
bun run loom --profile alice board add "로그인 플로우 테스트"
bun run loom --profile alice board set task_… --status doing
bun run loom --profile alice board assign task_… @bob
bun run loom --profile alice board note task_… "E2E 시나리오 추가"
bun run loom --profile alice board clear-done
```

### 핸드오프와 함께

```bash
# 핸드오프 후 보드 태스크도 생성
bun run loom --profile alice handoff @bob "이 이슈 맡아줘" --board
# 또는 mode=task
```

### 데스크톱

- host start 후 Board 탭에서 추가 / status 변경  
- sticky `list_tasks` / `add_task` / `update_task` → **CLI와 같은 보드 파일**

### 한계

- **실시간 멀티 머신 동기화(CRDT) 없음** — 머신이 다르면 스냅샷 공유(사례 8) 사용  
- Relay 재시작과 무관한 **로컬 파일** 보드

---

## 8. 보드 스냅샷 — 다른 머신에 보드 넘기기

**하고 싶은 일:** 노트북 A의 보드를 B로 가져가거나, 핸드오프로 스냅샷을 실어 보낸다.

```bash
# 내보내기
bun run loom --profile alice board export > /tmp/board.json

# 가져오기 (merge | replace)
bun run loom --profile alice board import /tmp/board.json
# 다른 roomId 스냅샷은 force 필요할 수 있음 (계획/CLI 옵션 따름)

# 핸드오프에 보드 스냅샷 첨부
bun run loom --profile alice handoff @bob "보드 스냅샷" --with-board
```

수신 측:

```bash
bun run loom --profile bob inbox
# 첨부/스냅샷 확인 후 import 계열 명령 (board import-handoff 등 — CLI help 참고)
```

### 사용 예

- 재택 머신 ↔ 회사 머신  
- 스탠드업 전 “오늘 보드” 공유 백업

---

## 9. 코딩 에이전트 + MCP — “에이전트끼리 일 넘기기”

**하고 싶은 일:** Claude Code / Codex / Grok 이 room 도구로 handoff·claim 을 한다.

### 에이전트 기동

```bash
bun run loom agents --matrix          # 지원 바이너리/MCP 표
bun run loom --profile alice run claude
bun run loom --profile alice run codex
bun run loom --profile alice run grok
bun run loom --profile alice run      # 자동 선택 claude→codex→grok→shell
```

### MCP 도구로 할 수 있는 일 (에이전트 측)

| 도구 | 사례 |
|------|------|
| `list_peers` | 누구에게 넘길지 확인 |
| `handoff` | 다른 에이전트/사람에게 작업 전달 |
| `check_handoffs` | 내 인박스 확인 (sanitize된 본문) |
| `claim_handoff` | 작업 선점 (사람이 accept 와 경쟁 시 first-wins) |
| board / pack 도구 | 방 태스크·컨텍스트 조회·수정 |

### 설정 정책 (요약)

- 기본: 프로젝트 `.loom/` 에 MCP 스니펫만 기록 (글로벌 설정 안 건드림)  
- Codex/Grok 글로벌 설정은 **`--write-user-config` 옵트인**  
- 자세한 표: [`docs/ADAPTERS.md`](./ADAPTERS.md)

### 시나리오 예: Claude → Codex 핸드오프

1. alice: `host start` + `run claude`  
2. Claude가 `handoff` 로 bob(또는 codex 프로필)에게 “테스트 작성” 전달  
3. bob: `run codex` → `check_handoffs` / `claim_handoff`  
4. 양쪽 보드에 태스크 연동 가능 (`--board` / board 도구)

### 한계

- 에이전트 TUI에 핸드오프를 **자동 주입(PTY inject)** 하지 않음 (스파이크 결과 no-go)  
- 수신은 **inbox / MCP pull / listen / desktop** 경로

---

## 10. LAN·원격 — 두 대 이상의 머신

**하고 싶은 일:** 동료 PC와 같은 Room을 쓴다.

### 머신 A (릴레이 호스트)

```bash
# 비루프백 바인드는 토큰 필수 (보안 fail-closed)
export LOOM_RELAY_HOST=0.0.0.0
export LOOM_RELAY_TOKEN='긴-임의-비밀'
bun run loom relay
# 또는: bun run relay:lan
```

### 머신 A — room 생성

```bash
bun run loom --profile alice \
  --relay ws://127.0.0.1:7842 --token "$LOOM_RELAY_TOKEN" \
  room create --as alice
```

### 머신 B — join

```bash
bun run loom --profile bob \
  --relay ws://A_LAN_IP:7842 --token "$LOOM_RELAY_TOKEN" \
  room join LOOM-XXXX --as bob

bun run loom --profile bob \
  --relay ws://A_LAN_IP:7842 --token "$LOOM_RELAY_TOKEN" \
  handoff @alice "머신이 달라도 handoff 됨"
```

### 환경변수 정리 (0.10+)

| 변수 | 용도 |
|------|------|
| `LOOM_RELAY_URL` / `--relay` | WebSocket URL |
| `LOOM_RELAY_TOKEN` / `--token` | 공유 비밀 |
| `LOOM_RELAY_HOST` / `PORT` | relay 서버 바인드 |
| `LOOM_PROFILE` / `LOOM_SESSION` | 세션 격리 |
| ~~`FABLE_*`~~ | **더 이상 값을 쓰지 않음** (경고만) |

### Share 힌트

- 기본 Share 줄에는 토큰을 **숨김** (`--show-token` 으로만 포함)  
- 토큰을 채팅에 평문 유포하지 말 것

### 한계

- Relay 재시작: **0.14+ durable** (같은 `LOOM_RELAY_STATE_DIR`). `LOOM_RELAY_EPHEMERAL=1` 이면 유실  
- 보드·팩은 기본적으로 **각 머신 로컬** → 스냅샷/`--with-board`/`--with-pack` 으로 공유  
- Room 파일 GC 없음 (leave한 peer만 제거; 빈 방 파일 잔존 가능 — L-29 residual)

---

## 11. 일상 워크플로 조합 예시

### 11-A. 페어 프로그래밍 하루

1. 아침: A가 room create, B join  
2. 각자 `host start` (또는 한 명만 sticky + 나머지 listen)  
3. 작업 단위마다 `handoff @상대 "…"` + 필요 시 `--board`  
4. 상대 `inbox accept` 또는 에이전트 `claim`  
5. 보드로 상태 정리 (`board set … doing|done`)  
6. 퇴근: `host stop`, (선택) `board export` 백업  

### 11-B. 에이전트 파이프라인 (리뷰 → 테스트)

1. 리뷰어 에이전트: 이슈 정리 후 handoff(mode=task)  
2. 테스터 에이전트: claim → 테스트 작성 → handoff back  
3. pack note 에 “실패 케이스” 누적  

### 11-C. 혼자 멀티 에이전트

```bash
bun run loom --profile claude-side room create --as claude-side
# 같은 초대코드로
bun run loom --profile codex-side room join LOOM-XXXX --as codex-side
bun run loom --profile claude-side host start
bun run loom --profile claude-side run claude
# 다른 터미널
bun run loom --profile codex-side run codex
```

---

## 12. 오케스트레이터 CLI 전환·bridge 복구

**하고 싶은 일:** Claude Code로 카드/검증 웨이브를 돌리다 세션이 먹통이 되어, **Grok CLI(또는 다른 터미널)에서 같은 작업을 이어간다.**  
(2026-07-20 실측 시나리오: Claude 중단 → Grok에서 VERIFY 디스패치 → mac-node bridge 재기동 → Claude 복구 후에도 **같은 bridge 재사용**.)

> **스냅샷 · 제품 SSOT 아님:** 위 (2026-07-20 실측) 문장과 §12.3의 status/HANDOFF/suite-*/verify-* 카드 이름은 이 레포 dogfood 실측 예다. 제품 계약·완료 권한 SSOT가 아니다 — 완료는 §12.8·§13·CHANGELOG 0.28.0. 층 진단(12.1–12.2)과 bridge 재기동·재사용(12.4–12.5)은 현재 운영 절차로 유지. 멀티 에이전트 dogfood 룸 절차는 DOGFOOD_LOOP.md.

### 12.1 층을 먼저 나눈다 (혼동 방지)

| 층 | 무엇 | 죽으면 증상 | 누가 소유 |
|----|------|-------------|-----------|
| **오케스트레이터 세션** | Claude Code / Grok CLI 채팅 프로세스 | 도구 응답 없음, “먹통” | **터미널별** (공유 안 됨) |
| **Relay** | Room 버스 (`ws://127.0.0.1:7842` 등) | peers/handoff/inbox 전부 실패, `ECONNREFUSED` | 머신(또는 팀 공용 호스트) **공용** |
| **Sticky host** | 프로필별 장수 연결 | peer offline, CLI가 one-shot으로 떨어짐 | **프로필별** 공용 |
| **Bridge** | 노드 카드 실행기 (`bridge-main`) | 카드 안 먹음 / pane 안 뜸 / `card.done` 없음 | **노드 프로필**(예: `mac-node`) **공용** |
| **제품 surface** | CLI·MCP·relay 와이어 계약 | “기능이 없다” | 레포 버전 |

**핵심:** Claude/Grok **채팅 세션**을 바꾸는 것과 Loom **버스/bridge**를 재기동하는 것은 다른 일이다.  
Grok CLI를 켠다고 구현 레인이 자동 이관되지 않고, Claude가 먹통이어도 relay가 같이 죽지는 않는다.

```text
Claude Code 세션          Grok CLI 세션
   (오케스트레이터 A)         (오케스트레이터 B)
            \                   /
             v                 v
          relay + sticky hosts  ← 공용
                    |
              bridge (mac-node) ← 공용 한 프로세스
                    |
              herdr worker panes (claude / codex / grok)
```

### 12.2 증상 → 어느 층인지 30초 진단

```bash
# 1) Relay
curl -s http://127.0.0.1:7842/health
# 기대: {"ok":true,...}

# 2) Sticky / peers (아키텍트 프로필 — 예: claude-impl)
env -u LOOM_RELAY_URL -u LOOM_RELAY_TOKEN \
  LOOM_PROFILE=claude-impl bun run loom peers

# 3) Bridge (노드 프로필 — 예: mac-node)
# pgrep -f 는 셸 래퍼와 겹칠 수 있어 ps로 확인
ps -axo pid=,lstart=,etime=,command= | grep 'packages/host/src/bridge-main' | grep -v grep
cat ~/.loom/profiles/mac-node.bridge.json   # "pid" 가 위 프로세스와 일치해야 함

# 4) 세션 게이트 상태 (이 레포 dogfood)
bun run status
# 상단 HANDOFF.md "Current action" 만 읽어도 됨
```

| 진단 결과 | 조치 |
|-----------|------|
| health 실패 | **relay** 기동 (`bun run loom relay local start` 또는 팀 런북) — inbox durable은 0.14+ |
| peers 전부 offline / sticky 없음 | 해당 프로필 `host start` 또는 `loom up` |
| bridge 프로세스 없음 · meta pid 사망 | **bridge start** (아래 12.4) — “relay 죽음”이 아님 |
| 버스는 정상인데 채팅만 멈춤 | **새 오케스트레이터 세션** + HANDOFF/`status`로 게이트 이어가기 |

### 12.3 사용 사례 A — Claude 먹통 → Grok으로 웨이브 이어가기

**전제:** dogfood 룸(`loom-local` 등), 노드 bridge 프로필(예: `mac-node`), 디스패처 allowlist에 아키텍트 peer id 등록.

1. **상태 복구 (코드 수정 전)**  
   - `bun run status` + `HANDOFF.md` 상단  
   - 보드/인박스에 남은 카드(`suite-*`, `verify-*`, `FIX-*`) 확인  
2. **층 진단 (12.2)** — relay가 살아 있으면 **relay를 건드리지 않는다**  
3. **필요 시 bridge만 복구**  
   - 카드 디스패치가 안 되거나 meta pid가 죽었을 때만  
4. **카드 재발사** (예: verify를 codex pane으로)  
   - 기존 dispatch 스크립트/`dispatchCard` 경로 사용  
   - 워커 회신 **관측**은 보드 폴링이 아니라 inbox 결과/`card.done` handoff (**후보 증거만** — board `done` 아님; §12.8)  
5. Claude가 나중에 살아나면 → **같은 bridge를 그대로 사용** (아래 12.5). 새 bridge를 또 띄울 필요 없음

**실측 함정 (이름을 헷갈리기 쉬운 지점):**

| 체감 | 실제 |
|------|------|
| “relay를 다시 띄웠다” | 로그상 **bridge** 재기동인 경우가 많음 (`Bridge started (pid …)`) |
| “Grok CLI = 구현 레인” | Grok CLI는 **아키텍트 터미널**. 워커는 **herdr pane + card** |
| `loom run grok/codex` 화면이 깨짐 | live relay callback과 full-screen TUI가 **같은 PTY**에 출력. 아키텍트는 직접 실행하고 워커는 `dispatch_card`로 pane 생성 |
| herdr 0.7.5 / protocol 17 (Loom **0.28.1** adapter shipped) | **필수:** `bun run dogfood:herdr`로 live 0.7.5/17 + Loom expected-17 호환을 확인한 뒤 dispatch. 구 bridge config의 `herdrProtocol:16`은 dogfood:up 경로에서 **auto-migrate**된다 — **config만 17로 올리는 bypass는 금지**. prompt/`send_keys`는 **exact named agent target**(pane id 아님). herdr 다운그레이드·0.7.4 병존 세션 금지. 사용자당 1회 **plugin reinstall/relink** 후 protocol 17 확인. 정본: [`HERDR-0.7.5-COMPAT`](./spikes/HERDR-0.7.5-COMPAT.md) · 표·절차 §14. |
| PID 숫자 (예: 10814 → 78818) | OS **프로세스 ID**. 재기동마다 바뀜. meta 파일의 `"pid"`와 대조 |

### 12.4 사용 사례 B — codex 무인 검증 때문에 bridge를 재기동할 때

**하고 싶은 일:** codex pane 카드를 **승인 프롬프트 없이** 돌린다.

codex 기본 argv는 승인 모드일 수 있다. 무인 검증 시 노드 bridge config의 `agentArgv.codex`에 신뢰 플래그를 넣는다 (예: `-a never`, `-s read-only` — **오너 신뢰 결정**).

```bash
# config 위치 (노드 프로필명에 맞게)
# ~/.loom/bridge/mac-node.json  → agentArgv.codex

# bridge는 기동 시 config를 읽음 → argv 변경 후 재시작 필수
# bare start (allowlist 재주입 트랩 회피 — lessons: bridge start --allow 주의)
env -u LOOM_RELAY_URL -u LOOM_RELAY_TOKEN \
  LOOM_PROFILE=mac-node \
  bun run loom --profile mac-node bridge stop   # 또는 기존 pid 정리 후

nohup bun run packages/cli/src/index.ts --profile mac-node bridge start \
  > /tmp/loom-bridge-mac-node.log 2>&1 &

# 검증
cat /tmp/loom-bridge-mac-node.log
# Bridge started (pid NNNNN, port …)
cat ~/.loom/profiles/mac-node.bridge.json   # pid == NNNNN
```

**재기동 이유 정리**

| 이유 | product surface 추가? |
|------|------------------------|
| config/`agentArgv` 반영 | 아니오 — **런타임 ops** |
| 프로세스 크래시 복구 | 아니오 |
| 소스 핫픽스 후 최신 코드 로드 | 아니오 (bridge는 기동 시 소스 로드) |

내부 배선·로컬 설정 변경은 **신규 CLI/MCP/relay 공개 surface가 아니다.**  
PLAN이 “wire 무변경 · bridge 로컬만”이라고 할 때의 “surface 없음”과 같은 층이다.

### 12.5 사용 사례 C — Claude가 다시 살아났을 때 (같은 bridge 재사용)

**질문:** “Grok이 띄운 bridge를 Claude가 그대로 써도 되나?”  
**답:** **된다.** bridge는 오케스트레이터 CLI 소유가 아니라 **노드 프로필 공용 프로세스**다.

| 체크 | 명령/확인 | 기대 |
|------|-----------|------|
| bridge 생존 | `ps` + meta `"pid"` 일치 | 한 프로세스 |
| 같은 room | claude-impl 세션 roomName vs bridge meta | 동일 (예: `loom-local`) |
| allowlist | `~/.loom/bridge/mac-node.json` → `authorizedDispatchers` | claude-impl **전체** peer id 포함 (`loom peers` 절단 ID 금지) |
| 디스패치 | `LOOM_PROFILE=claude-impl` 로 card 발사 | delivered + 노드가 claim |

```bash
# allowlist에 넣을 peer id = 전체 값
# ~/.loom/profiles/claude-impl.json 의 peerId
python3 - <<'PY'
import json
from pathlib import Path
cfg = json.loads(Path.home().joinpath(".loom/bridge/mac-node.json").read_text())
impl = json.loads(Path.home().joinpath(".loom/profiles/claude-impl.json").read_text())
meta = json.loads(Path.home().joinpath(".loom/profiles/mac-node.bridge.json").read_text())
print("claude-impl on allowlist:", impl["peerId"] in set(cfg.get("authorizedDispatchers") or []))
print("room match:", impl.get("roomId") == meta.get("roomId"))
print("bridge pid:", meta.get("pid"))
PY
```

**주의 — “프로세스 공유” ≠ “최신 코드 로드”**

- 같은 PID를 쓰는 것은 **연결/디스패치 가능**을 뜻한다.  
- bridge **기동 이후** 워크트리에 핫픽스를 쌓았다면, 그 프로세스 메모리에는 **구 코드**가 있을 수 있다.  
- 최신 구현으로 라이브 스모크/검증하려면 **bridge를 한 번 더 restart** 해 소스를 다시 읽게 한다.

### 12.6 하지 말 것

| 금지 | 이유 |
|------|------|
| 먹통만으로 무조건 `relay` kill/재기동 | durable 큐·roster 재join 비용. 먼저 health 확인 |
| `loom peers` 표의 **잘린** peer id를 allowlist에 복사 | M-1 거부. 프로필 JSON의 **전체** id 사용 |
| `bridge start --allow`로 allowlist “편하게” 고치기 | config 재주입 트랩 — allowlist는 파일에 미리 쓰고 **bare start** |
| “CLI를 바꿨으니 구현이 이어진다” 가정 | 세션 컨텍스트는 HANDOFF/`status`로만 복구. 워커는 **card** |
| codex 무인 플래그를 상시 기본으로 방치 후 잊기 | 승인 우회는 신뢰 결정. 검증 끝나면 argv **원복 + bridge restart** 권장 |

### 12.7 관련 문서

| 문서 | 내용 |
|------|------|
| [`DOGFOOD_LOOP.md`](./DOGFOOD_LOOP.md) | 프로필·카드 디스패치 dogfood 절차 |
| [`ARCHITECTURE.md`](./ARCHITECTURE.md) | relay / host / bridge · 완료 권한 맵 |
| [`CHANGELOG.md`](./CHANGELOG.md) | 0.28.x 사용자 노트 |
| [`HANDOFF.md`](../HANDOFF.md) | 현재 게이트·노드 실측 함정 |
| `tasks/lessons/bridge-ops.md` | 주입 레이스·card.done·잘린 peer id |
| [`spikes/HERDR-0.7.5-COMPAT.md`](./spikes/HERDR-0.7.5-COMPAT.md) | herdr 0.7.5 / protocol-17 호출 형상 정본 (0.28.1) |
| [`spikes/PANE-DEATH-UNIFIED-DESIGN.md`](./spikes/PANE-DEATH-UNIFIED-DESIGN.md) | 완료 권한·U1–U11 락 (0.28.0, 0.28.1 유지) |

### 12.8 완료 권한 (0.28.0) — 운영 체크리스트

카드를 돌린 뒤 **절대** 이렇게 닫지 마세요.

| 신호 | 해석 | board에 할 일 |
|------|------|----------------|
| inbox에 `card.done` / 결과 handoff | **후보 증거** | 워킹트리·테스트로 **독립 검증** |
| herdr pane 종료 · 프로세스 exit | 자원 정리 이슈일 수 있음 | 성공으로 간주 **금지** |
| 원격 노드가 `status:"done"` 주장 | untrusted | 타워 board는 **`blocked`** (검증 대기)로만 |
| 로컬에서 검증 통과 | 완료 확정 가능 | **명시적** `board set … done` (또는 동등 MCP) |

상세 설계: [`ARCHITECTURE.md`](./ARCHITECTURE.md) 「Completion authority」 · [`spikes/PANE-DEATH-UNIFIED-DESIGN.md`](./spikes/PANE-DEATH-UNIFIED-DESIGN.md).

---

## 13. 완료 권한 시나리오 — “done 왔는데 끝인가?” (0.28.0)

**하고 싶은 일:** 워커가 결과를 돌려준 뒤 보드를 올바르게 닫는다.

1. 디스패치 후 inbox / board 상태를 본다.  
2. **산출물을 워킹트리에서 직접 확인**한다 (`bun test`, diff, 파일 존재). 에이전트 회신 문장만 믿지 않는다.  
3. 원격 노드 result만 도착했다면 board가 **`blocked`** 인지 확인한다 — 이게 정상이다.  
4. 검증 후에야 로컬에서 `done`(또는 `failed`)으로 옮긴다.  
5. pane이 사라졌다는 이유만으로 성공 처리하지 않는다.

**실패 모드:** “`card.done` 수신 = 완료”로 다음 카드를 연쇄 발행 → 미검증 작업이 done 컬럼에 쌓임.

---

## 14. herdr 0.7.5 dogfood 준비 (0.28.1)

**하고 싶은 일:** 카드 워커를 띄우기 전 호스트 herdr와 Loom 어댑터가 맞는지 확인한다.

```bash
bun run dogfood:herdr    # live 0.7.5/17 + Loom expected-17
# 실패 시: herdr 업그레이드 · plugin reinstall/relink · Loom 0.28.1+ 사용
# 금지: herdrProtocol만 17로 수동 위장, 0.7.4 다운그레이드·병존 세션
```

| 규칙 | 이유 |
|------|------|
| prompt 타깃 = **agent name** | pane id는 침묵 오배송 |
| `agent.prompt` | p17에서 `agent.send` 없음 |
| launch 후 `interactive_ready` 대기 | `agent.wait` idle ≠ 기동 완료 |
| allowlist = **전체 peer id** | `loom peers` 표 절단값 금지 |

정본: [`spikes/HERDR-0.7.5-COMPAT.md`](./spikes/HERDR-0.7.5-COMPAT.md) · 절차: [`DOGFOOD_LOOP.md`](./DOGFOOD_LOOP.md).

---

## 15. 명령 치트시트

```text
bun run loom --profile <p> room create|join|leave
bun run loom --profile <p> peers | status | chat "…"
bun run loom --profile <p> handoff @name|id|* "body" [--with-pack] [--with-pack-embed] [--with-board] [--board]
bun run loom --profile <p> inbox | inbox accept <id>
bun run loom --profile <p> listen
bun run loom --profile <p> host start|stop|status
bun run loom --profile <p> bridge start|stop|status
bun run loom --profile <p> pack show|set|add|note|…
bun run loom --profile <p> board | board add|set|assign|export|import|…
bun run loom --profile <p> run [claude|codex|grok|shell]
bun run loom --profile <p> agents --matrix
bun run loom relay [--host 0.0.0.0] [--token …]
bun run loom relay list | use <name> | local start|stop|status
bun run desktop
bun run smoke:desktop
bun run status
bun test
```

---

## 16. 자주 하는 실수

| 증상 | 원인 | 해결 |
|------|------|------|
| `loom: command not found` | PATH에 bin 없음 | `bun run loom …` |
| host stop이 안 먹음 | 다른 프로필 | start와 같은 `--profile` |
| desktop이 host 못 찾음 | 프로필/세션 불일치 | `export LOOM_PROFILE=…` 동일 |
| `bun run desktop` 인자 오류 | 구 스크립트 | 최신: `cd apps/desktop && tauri dev` |
| FABLE_* 만 설정 | 0.10+ 미독출 | `LOOM_*` 로 변경 |
| 보드가 머신마다 다름 | 로컬 파일 | export/import 또는 `--with-board` |
| 비루프백 relay 거부 | 토큰 없음 | `LOOM_RELAY_TOKEN` 필수 |
| CLI 바꿨는데 카드가 안 돔 | bridge 다운 또는 allowlist | §12.2 진단 · bridge start · 전체 peer id |
| “relay 재기동” 했는데 health는 이미 ok | 실제로는 bridge 재기동이 필요했음 | health와 `bridge-main` pid를 분리 확인 |
| bridge 재기동 후 codex가 승인 대기 | argv 원복/미설정 | `agentArgv.codex` + bridge restart (§12.4) |
| 핫픽스 반영이 안 됨 | 구 bridge PID가 옛 코드 유지 | bridge restart로 소스 재로드 (§12.5) |
| `card.done` 보고 board를 done으로 | 완료 권한 오해 (0.28) | §12.8 · §13 — 로컬 검증 후 명시 mutation |
| herdr 0.7.5인데 카드 스폰 실패 | p16 어댑터/설정 또는 config-only 17 | §14 · `dogfood:herdr` · Loom 0.28.1+ |
| prompt가 다른 pane으로 감 | pane id 타깃 | exact agent **name** |

---

## 17. 지금 버전에서 **아직** 못 하는 것

의도적으로 빠졌거나 나중 마일스톤입니다.

- 보드 **실시간 멀티라이터 CRDT** / relay 영속 보드  
- 클라우드 계정·멀티테넌시  
- herdr **0.7.4 / protocol 16** 동시 지원 (0.28.1은 17 컷오버; 다운그레이드 비목표)  
- 원격 result만으로 타워 board **`done`** (0.28.0 이후 의도적 금지 — `blocked` 후 로컬 확정)  
- 전역 `loom` 설치가 OS 패키지 매니저 기본 제공 (원하면 `scripts/install.sh` · `link:loom`)

**할 수 있는 것 (0.28.1 핀):** room/handoff/inbox · sticky · pack/board · desktop · MCP `loom run` · **bridge + herdr 0.7.5 카드 워커** · dogfood 3-kind · 완료 권한 분리 운영.

---

## 18. 더 읽을 문서

| 문서 | 내용 |
|------|------|
| [README.md](../README.md) | 제품 소개·퀵스타트 |
| [CHANGELOG.md](./CHANGELOG.md) | 버전별 사용자 노트 |
| [PITCH.md](./PITCH.md) | 짧은 피치 + 데모 GIF |
| [ADAPTERS.md](./ADAPTERS.md) | MCP 스폰 + herdr 워커 축 |
| [apps/desktop/README.md](../apps/desktop/README.md) | 데스크톱 규칙 (토큰·XSS) |
| [PROTOCOL.md](./PROTOCOL.md) | relay 와이어 프로토콜 |
| [ARCHITECTURE.md](./ARCHITECTURE.md) | 패키지·권한·bridge 지도 |
| [DOGFOOD_LOOP.md](./DOGFOOD_LOOP.md) | 멀티 에이전트 dogfood 룸·프로필 |
| [PLAN.md](./PLAN.md) | 기능 계획 SSOT (개발용) |
| [GLOSSARY.md](./GLOSSARY.md) | 용어 |

---

*가이드 핀: 제품 **v0.28.1** · §12 오케스트레이터/bridge 복구 · §13 완료 권한 · §14 herdr 0.7.5. 기능이 늘면 사례 표와 CHANGELOG를 같이 갱신한다.*
