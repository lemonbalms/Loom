# Loom 사용자 가이드 — 사용 사례로 배우기

**철학 (첫 문단):** 이 가이드는 **지금 버전으로 할 수 있는 일**을 시나리오로 가르치되, **완료처럼 보이는 신호를 완료로 착각하지 않게** 같은 호흡으로 경고한다. Loom은 또 하나의 코딩 에이전트가 아니라 — *connect your agents, and your teammates* — Room·handoff·inbox·board·MCP·bridge를 붙여 **이종 에이전트와 사람이 일을 넘기는** 레이어다.

| Field | Value |
|-------|--------|
| **문서** | `docs/USER_GUIDE.md` |
| **대상** | Loom을 **쓰는** 사람 (개발자·페어·에이전트 운영) |
| **제품 버전** | CLI **v0.32.0** / desktop UI **v0.12.2+** 기준 (기능 집합은 CLI 핀을 따름) |
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
| 15 | 헤드리스 카드 워커 (0.30.0, opt-in) — pane 대신 비대화형 CLI | bridge `worker` 설정 · 카드별 세션 · 재개/입양 |
| 16 | 스킬과 정책 (0.31.0) — 헤드리스 워커의 권한을 한 파일로, 룸이 고른 스킬을 카드에 | `policy.json` · `worker.skills` · 룸 `skills.json` · 정직 표 |
| 17 | Loom MCP 사전 점검 (0.32.0) — 대화형 에이전트의 Loom 도구 호출을 정책으로 검사 | `loomTools` · `mcp.deny` `loom__<tool>` · 감사 파일 · 정직 표 |
| 18 | (참고) 세션 연속성 — 개발자용 HANDOFF/status | `bun run status` · `HANDOFF.md` (제품 room handoff와 별개) |

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

## 15. 헤드리스 카드 워커 (v0.30.0, opt-in)

**하고 싶은 일:** 긴 카드를 herdr pane의 대화형 TUI 대신 **비대화형 CLI 프로세스**(`claude -p` · `codex exec --json` · `grok --prompt-file`)로 돌려, pane 사망·스크레이프 꼬리 잘림 없이 **최종 텍스트 전문**을 결과로 받는다.

**기본값은 그대로 pane이다.** `worker` 절이 없거나 `backend: "pane"`이면 아무것도 바뀌지 않는다. 헤드리스는 bridge 설정에서 켠다.

### 15.1 설정 — `~/.loom/bridge/<profile>.json` 의 `worker` 절

```json
{
  "authorizedDispatchers": ["<전체 peer id>"],
  "agentArgv": {"claude":["claude"],"codex":["codex"],"grok":["grok"]},
  "worker": {
    "backend": "headless",
    "cwd": "/Users/me/work/repo",
    "allowedRoots": ["/Users/me/work"],
    "maxConcurrent": { "claude": 1, "codex": 1, "grok": 1 },
    "timeoutMs": 7200000,
    "agentBin": { "claude": "/opt/homebrew/bin/claude" }
  }
}
```

| 키 | 값 | 기본 / 규칙 |
|----|----|-------------|
| `backend` | `"pane"` \| `"headless"` | 기본 **`pane`**. `headless`일 때만 아래 키를 읽는다 |
| `cwd` | 절대경로 | **headless면 필수.** 카드가 cwd를 싣지 않으면(현재 `dispatch_card`는 비워 보낸다) 이 경로에서 돈다. herdr 기본 cwd는 절대 쓰지 않는다 |
| `allowedRoots` | 절대경로 배열(비어 있으면 안 됨) | **headless면 필수.** 실제 cwd의 **realpath**가 이 중 하나 아래여야 spawn한다 — 심볼릭 링크로 밖을 가리키면 spawn 0 · `failed` reason `cwd_not_allowed` |
| `maxConcurrent.<agent>` | 정수 ≥1 | 에이전트별 기본 **1**. 초과 카드는 FIFO **큐 대기**(대기 시간은 타임아웃에서 제외). 핸드오프는 **허가를 얻은 시점에** 가져가므로 대기 중인 카드는 relay inbox에 남아 bridge가 죽었다 떠도 살아남는다(단 inbox 상한 100을 넘으면 가장 오래된 대기 항목이 밀려날 수 있다). 실행 수·큐 깊이는 bridge `/rpc` status의 `headless`(`running` · `queueDepth`)로 본다 |
| `timeoutMs` | 양수 ms, 최대 **2,147,483,647** | 기본 **7,200,000**(2h). **카드 단위**다 — 재개 시도도 카드 시작 시각 기준 *남은* 시간만 받고(시도당 **최소 60초**), 초과 → 프로세스 **그룹** SIGTERM → 10s → SIGKILL, 부분 transcript와 reason `timeout`으로 결과 |
| `permissions.<agent>` | 에이전트별 프로필 객체 | 생략 시 아래 기본값. 넣으면 **그 에이전트 프로필 전체를 대체**한다. 0.31.0부터 필수는 모드 필드뿐(claude·grok `permissionMode` · codex `sandbox`·`approvalPolicy`)이고 도구 목록은 **deprecated 선택 키**다(§16.2) |
| `skills` | `{"enabled": boolean}` | 0.31.0. 기본 **꺼짐**(키 없음 = 0.30.0 동작). 다른 키는 기동 거부(§16.3) |
| `agentBin.<agent>` | **실행 파일 경로 하나** | 기본 = PATH의 `claude`/`codex`/`grok`. 인자·셸 명령·배열 불가, **basename이 에이전트 이름과 같아야** 한다(`…/claude`). PATH를 믿을 수 없으면 절대경로로 고정한다 |

**에이전트 종류 허용은 headless에서도 `agentArgv.<kind>` 유무로 정해진다.** `agentArgv`의 기본값은 `{"claude":["claude"]}`뿐이라, 위처럼 `codex`·`grok` 항목을 넣지 않으면 그 종류의 카드는 `failed` reason `agent_kind_not_allowed`로 거절된다(핸드오프 claim 이연 판단도 같은 조회를 쓴다). 반대로 headless에서는 `agentArgv`의 **pane용 플래그**(§12.4의 `-a never` · `-s read-only` 등)가 **무시된다** — 실행 파일은 `worker.agentBin`, 권한은 `worker.permissions`(없으면 §15.2 기본 프로필)가 정한다.

설정이 틀리면(필수 키 누락 · 상대경로 · 위험 모드 · 잘못된 `agentBin`) **bridge가 기동을 거부**한다(fail-closed). pane 설정에는 영향이 없다.

### 15.2 권한 프로필 기본값

| 에이전트 | 기본 프로필 |
|----------|-------------|
| **claude** | `permissionMode: "acceptEdits"`. 도구 allow/deny는 0.31.0부터 프로필이 아니라 **정책**(§16.1)에서 나온다 — 내장 기본은 0.30.0 목록(`Bash(git status*)` … · `Bash(rm *)` … `Bash(wget *)`)에서 파생되며, argv는 `--settings '<JSON>'` 하나다 |
| **codex** | `sandbox: "workspace-write"` · `approvalPolicy: "never"` — 커널 샌드박스가 **네트워크를 막는다** → `npm install`·`bun install` 같은 설치는 실패한다 |
| **grok** | `permissionMode: "acceptEdits"` · allow/deny = claude와 같은 정책, 규칙마다 `--allow <rule>` / `--deny <rule>` 한 번씩. **best effort**(grok은 구조화된 거부 신호가 없다) |

- 허용 값: `permissionMode` ∈ `acceptEdits`·`default`·`plan` · codex `sandbox` ∈ `read-only`·`workspace-write` · `approvalPolicy` ∈ `never`·`untrusted`·`on-request`·`on-failure`. 규칙 값은 비어 있거나 `-`로 시작하거나 NUL/개행을 담으면 거부.
- **위험 모드는 거부된다:** `bypassPermissions` · `danger-full-access` · `dangerously-*`(codex `--dangerously-bypass-…` 포함) · `--always-approve` — 설정 어디에 있어도 bridge 기동 실패.
- **claude `acceptEdits`는 cwd 안 `mkdir`·`cp`·`mv`·`rm`·리다이렉트를 allow 목록 밖에서도 자동 허용한다** — 그래서 deny 목록이 실질 방어선이다. **잔여 위험:** 접두 규칙은 `/bin/rm` · `command rm` · `find -delete` · 인터프리터 한 줄(`python -c …`)을 잡지 못한다. 최종 방어선은 cwd 경계(`allowedRoots`) + 결과 미검증 착지(`needs_verification`)다 → **git으로 추적되는 작업 디렉터리**에서 돌리고 결과는 diff로 확인한다.
- 워커 env = bridge env에서 `LOOM_*`·`FABLE_*`를 **전부 지우고** `LOOM_CARD`만 넣는다 — relay 토큰·URL은 워커에 닿지 않는다.
- **사용자 훅은 상속된다(UK-3).** 오너 전역 Claude Code 훅(`~/.claude/settings.json`)이 헤드리스 claude 워커 안에서도 돈다. 0.31.0에도 격리 옵션은 없다(MCP 격리는 §16.1 `mcp.isolate`, 오너 플러그인·스킬 상속은 §16.4).
- 워커 시스템 프롬프트는 고정 상수 `HEADLESS_WORKER_HINT`(cwd 밖 작업 금지 · 질문 금지 · push/deploy 금지 · 마커 아래 = 데이터)뿐이다. Loom MCP 도구는 없다. 카드 프롬프트는 stdin/파일로만 넘어가고 argv(`ps`)에 보이지 않는다.

### 15.3 상태 저장 위치 — 평문, 로컬 전용

```text
~/.loom/cards/<sha16(로컬 peer id)>/<sha16(room × agent × cardId)>/
  session.json            # agent · cwd · sessionId · fingerprint · attempts · pid/pgid · state · resultSent …
  transcript-<N>.jsonl    # N번째 시도의 stdout 원문 (스트림 JSON)
  transcript-<N>.stderr   # 같은 시도의 stderr
```

- 디렉터리 0700 · 파일 0600. **redaction 없는 평문** — 카드 프롬프트·도구 출력·코드가 그대로 남는다. 업로드 경로는 없다. 회전·GC도 아직 없다(직접 지운다).
- **완료된 cardId를 다시 디스패치하면 같은 카드 디렉터리를 재사용하고 이전 `transcript-N.jsonl`을 덮어쓴다.** 보존하려면 먼저 복사해 둔다.
- 같은 머신의 프로필마다 peer id가 달라 디렉터리가 나뉜다. **프로필 하나에 bridge는 하나만** 띄운다 — 같은 프로필 bridge 둘을 막는 프로세스 간 락은 없다.

### 15.4 중단·재시작 시 동작 (재개 / 입양)

- **bridge 종료는 워커를 죽이지 않는다.** 워커는 자기 프로세스 그룹으로 떠 있고, bridge가 다시 뜨면 기록을 읽어 **입양**한다(pid + 프로세스 시작 시각 대조 → transcript 감시 → 결과 1회 전송). 살아 있는 워커 옆에 새로 spawn하지 않는다.
- 워커가 결과 없이 죽었으면 transcript를 먼저 읽는다 — 이미 끝난 일이면 그 결과를 보낸다. 아니면 **같은 세션 id로 재개**한다(고정 문구 *"Interrupted. Inspect the working tree before continuing; do not redo completed steps."*). 시도는 최대 **2회**.
- 같은 디스패치가 재전달되면 spawn 없이 합류하고, 이미 결과를 보낸 디스패치는 다시 돌리지 않는다.

**재개하지 않고 포기하는 경우 (결과 `failed` 1건):**

| reason / note | 뜻 |
|---------------|----|
| reason `spawn_state_unknown` | 직전 bridge가 spawn 직전/직후에 멈춰 워커 pid가 기록되지 않았다 — 이미 실행됐을 수 있어 다시 돌리지 않는다 |
| reason `liveness_unknown` | 기록된 pid의 생사를 확정할 수 없다(`ps` 실패 등) — spawn도 kill도 하지 않는다 |
| reason `needs_verification`, note `cwd_changed` | 기록 cwd ≠ 현재 설정으로 계산한 cwd — 다른 트리에서 재개하지 않는다 |
| reason `needs_verification`, note `fingerprint_changed` | 기록의 fingerprint(힌트 · 권한 프로필 · argv 템플릿 버전 · 정책 해시 · 스킬 매니페스트 해시) ≠ 지금 값. 0.31.0부터 **복구와 모든 입양**(같은 디스패치의 재전달 포함)에서 대조하고, 스킬이 켜져 있으면 재개 전에도 카드 복사본을 재해시해 대조한다(§16.3). 살아 있는 워커는 죽이지 않고 감시도 하지 않으며 결과를 이것으로 선점한다. 이 결과를 보낸 뒤(이전 워커가 끝난 뒤) 같은 카드가 다시 디스패치되면 새 세션으로 시작한다 |
| reason `needs_verification`, note `attempts 2 exhausted` | 두 번 시도 후에도 최종 결과 없음(note에 마지막 stderr 줄) |
| reason `card_already_running` | 같은 카드가 **다른** 디스패치로 왔는데 워커가 아직 살아 있다 — 두 번째 워커를 띄우지 않는다 |
| reason `orphan_group_alive` | 이전 워커 프로세스가 아직 살아 있을 수 있는데 신원을 확인할 수 없다 — 신호를 보내지 않고 카드도 재개하지 않는다 |
| reason `bridge_shutdown_after_claim` | bridge가 핸드오프를 가져간 뒤 워커를 시작하기 전에 종료됐다 — 이 결과는 영속되어 다음 기동에서 재생된다 |
| reason `cwd_not_allowed` | cwd realpath가 `allowedRoots` 밖 |
| reason `spawn_setup_failed` | 워커 spawn·관찰 단계에서 예기치 않은 예외가 났다(프로세스 생성 실패 등) — 남은 프로세스는 SIGKILL로 정리하고, note에 오류 메시지(최대 500자)를 담아 재개 없이 `failed` 1건으로 끝낸다 |
| reason `timeout` | `timeoutMs` 초과 — 그룹 kill 후 부분 출력 |

**프로세스 그룹 신호 규칙:** 프로세스 그룹에는 이 bridge 수명 안에서 신원이 검증된 경우에만 신호를 보낸다 — 직접 spawn했거나, 시작 시각(lstart)이 일치해 입양하고 리더가 살아 있는 것을 본 경우다. 그룹이 사라지거나 kill 프로브가 실패하면 검증은 철회된다. bridge는 살아 있는 그룹 옆에 spawn하거나 재개하지 않으며, 신원을 확인할 수 없는 살아 있는 그룹은 `orphan_group_alive`로 끝난다. 콜드 복구에서 리더는 죽었는데 그룹이 살아 있으면 신호 0으로 `orphan_group_alive`다. 리더 종료 뒤의 그룹 회수도 검증된 그룹에만 적용된다.

**전송 못 한 결과가 있는 카드 (운영자 조치):** 카드의 이전 결과가 아직 relay에 전송되지 않았으면, bridge는 그 결과를 먼저 재생한 뒤에야 같은 카드의 새 핸드오프를 가져간다. 재생이 실패하거나 소진되면(전송 시도 2회) 이후 핸드오프는 가져가지 않고 relay inbox에 남으며 로그에 `[headless] replay_exhausted <card>`가 찍힌다. **알려진 한계:** 운영자가 카드 세션 기록을 지울 때까지 그 카드는 막힌다 — `~/.loom/cards/<sha16(peer)>/<sha16(room×agent×card)>/session.json`을 삭제한다(경로는 15.3의 디렉터리).

**종료 마감:** bridge 종료(`close()`)는 `closeDeadlineMs`(기본 10초)로 끝난다. 마감을 넘겨 claim이 대기 중인 채 프로세스가 종료되면 핸드오프가 기록 없이 claim된 채 남을 수 있다 — 실제로는 relay 연결이 정체된 경우뿐이다.

### 15.5 결과와 완료 권한

- 정상 종료여도 결과는 **`failed` / `needs_verification`** 이다 — 헤드리스는 완료 *감지*를 바꿀 뿐 완료 *권위*는 그대로다. 타워 보드는 **`blocked`** 로 착지하고, 사람이 워킹트리를 확인한 뒤 로컬에서 닫는다(§13).
- 결과 `note`는 **`denials: N (tool, …)`(권한 거부 내역, 500자 상한)을 맨 앞**에 싣고, 이어서 시도 횟수 · 마지막 stderr 줄 · transcript 경로를 붙인다. stderr 줄은 키·토큰·`Authorization`·URL 자격증명 등을 패턴으로 가리지만 **best-effort**이므로 완전한 비밀 제거를 기대하지 않는다.
- `output`은 최종 텍스트 원문(TUI 스트립 없음) ≤ 200,000자. 넘으면 앞을 잘라 꼬리를 남기고 `truncated: true` + note에 transcript 경로·바이트 수. `summary` = 첫 비공백 줄 ≤ 900자.
- 와이어는 그대로다(`CardResultPayload` 필드 추가 없음) — 구 타워도 받는다.
- 0.31.0도 bridge 기동에 **herdr가 필요하다**(헤드리스만 써도).

## 16. 스킬과 정책 (v0.31.0)

**하고 싶은 일:** 헤드리스 워커(§15)가 **무엇을 할 수 있는지**를 CLI마다 다른 목록 대신 **한 파일**(`policy.json`)에 적고, 룸이 고른 **스킬**(절차 지식)을 카드마다 고정된 복사본으로 워커에게 준다.

**pane 경로와 와이어는 그대로다.** 이 절은 `worker.backend: "headless"`일 때만 적용된다. 결과는 여전히 `failed` / `needs_verification`, 타워 착지는 `blocked`(§15.5). `policy.json`이 없고 `worker.skills`도 없으면 실효 권한은 0.30.0과 같거나 더 좁다(웹 도구 deny 추가 · claude MCP 격리 기본 on).

### 16.1 `policy.json` — 권한을 한 곳에

**위치:** `loomDir()/policy.json`(기본 `~/.loom/policy.json`). 없으면 **내장 기본값**만 쓴다. bridge는 **기동할 때 한 번** 읽는다 — 고친 뒤에는 bridge를 다시 띄운다.

```json
{
  "version": 1,
  "shell": {
    "allow": ["git status *", "git diff *", "git log *", "bun test *", "bun run *"],
    "deny": ["git commit *", "npm publish *"]
  },
  "network": false,
  "mcp": { "deny": ["github__create_issue"], "isolate": true },
  "skills": { "allow": ["loom-card-report"], "allowScripts": [] }
}
```

| 키 | 필수 | 뜻 |
|----|------|----|
| `version` | 예 | `1`만 |
| `shell.deny` | 예 | 셸 명령 접두 deny. 내장 deny와 **합집합** |
| `shell.allow` | 아니오 | 있으면 내장 allow를 **대체**(`[]` = 셸 allow 없음). 없으면 내장 allow(또는 deprecated allow, §16.2) |
| `network` | 예 | 네트워크 허용 여부(내장 기본 `false`) |
| `mcp.deny` | 예 | `"<server>__<tool>"` 목록 |
| `mcp.isolate` | 아니오 | 기본 **`true`** |
| `skills.allowScripts` | 예 | 스크립트·실행 확장 키를 가진 스킬 중 복사를 허용할 이름(§16.3) |
| `skills.allow` | 아니오 | **없음 = 설치된 이름 전부** 선택 가능 · **`[]` = 아무것도 안 됨** · 그 밖 = 그 이름만 |

모르는 키 · 타입 위반 · `version ≠ 1` · 규칙 문법 위반은 전부 **기동 거부**다(아래 fail-closed).

**병합 규칙:** 내장 기본값 **<** `policy.json`. **allow는 대체, deny는 합집합** — `policy.json`도 bridge 설정도 카드도 **deny를 줄이지 못한다.** 줄일 수 있는 것은 오너 로컬 `policy.json`의 `network`(curl/wget·웹 deny가 이것에서 파생)와 allow 대체뿐이다.

| 내장 기본 | 값 (0.30.0 목록에서 파생) |
|-----------|---------------------------|
| shell allow | `git status` · `git diff` · `git log` · `bun test` · `npm test` — 각각 `Bash(p)` + `Bash(p *)` · 그리고 `Bash(bun run *)` |
| shell deny | `rm` · `rmdir` · `sudo` · `git push` · `git reset --hard` · `git clean` — 컴파일 시 각각 `Bash(p)` + `Bash(p *)`. `curl`·`wget`은 여기 없고 `network: false`에서 파생 |
| network | `false` |
| mcp | `deny: []` · `isolate: true` |
| skills | `allow` 없음(전부) · `allowScripts: []` |
| 비-셸 도구(claude·grok) | `Read` · `Edit` · `Write` · `Glob` · `Grep` 항상 allow — 정책 표면이 아니다 |

**셸 규칙 문법 — `p *`만:** 규칙은 명령 접두 뒤에 **공백 + `*`** 로 끝나야 한다(`"git commit *"`).
- 컴파일러는 deny 접두마다 **`Bash(p)` + `Bash(p *)` 두 형식**을 낸다 — 인자 없는 맨 `p`까지 막기 위해서다(grok은 `Bash(p *)`만으로 맨 `p`를 막지 못한다, `SKILLS-POLICY-PROBE` §G). allow는 `Bash(p *)` 하나로 컴파일된다(grok에서 맨 `p`가 이 allow에 걸리는지는 미측정).
- **공백 없는 `p*`는 거부한다**(`"git push*"` → 기동 거부). claude에서 `echo*`가 `echoes`까지 막는 과매칭이 실측됐다(§G).
- 그 밖에 거부: 접두 안의 다른 `*` · `-`(유니코드 대시 포함)로 시작 · 셸 메타문자 `;` `&` `|` `` ` `` `>` `<` `$(` · NUL/CR/LF · 빈 값 · 앞뒤 공백.
- 접두 규칙의 잔여 위험(§15.2 — `/bin/rm` · `command rm` · `find -delete` · 인터프리터 한 줄)은 그대로다. 체이닝(`true && p`)은 claude·grok 모두 막았다(§G).

**`network`:**

| 값 | claude | codex | grok |
|----|--------|-------|------|
| `false` | deny `+ Bash(curl)`·`Bash(curl *)`·`Bash(wget)`·`Bash(wget *)` · `WebFetch` · `WebSearch` | `-c sandbox_workspace_write.network_access=false`(exec·resume 모두) | deny `+` curl/wget 4개 · `--disable-web-search` |
| `true` | 위 deny 없음(`shell.deny`에 직접 적은 것은 유지) | `network_access=true` | 위 deny 없음 · 플래그 없음 |

**`mcp`:** `deny` 항목 `"<server>__<tool>"`(서버 이름·툴 이름 각각 `[A-Za-z0-9][A-Za-z0-9._-]*`) → claude `--settings` deny `mcp__<server>__<tool>` · grok `--deny 'MCPTool(<server>__<tool>)'` · codex 해당 없음. 서버 단위 형식은 받지 않는다. **`isolate` 기본 `true` → claude에 `--strict-mcp-config`**(오너 MCP 서버 0개). `false`는 오너 옵트인이며, 0.30.0처럼 claude 워커가 오너 전역 MCP 서버를 상속한다(실측 7개). codex·grok은 격리할 수 없다(§16.4).

**fail-closed 로딩 — 기본값으로 폴백하지 않는다:**
- 파일이 없으면(ENOENT) 내장 기본값. 그 밖의 조회 실패(권한 없음 · `ENOTDIR` · 매달린/순환 심볼릭 링크 · `loomDir`가 디렉터리가 아님)는 **기동 거부**(`policy.json lookup failed <경로>: … (fail-closed)`).
- **정규 파일만** 읽는다(디렉터리·FIFO·장치 거부, 비차단 open 후 fstat). **64 KiB(65,536바이트) 초과 거부.**
- 심볼릭 링크는 **대상이 정규 파일일 때만** 따라간다.
- JSON 파싱·스키마 오류 → `invalid policy.json <경로>: <필드>: …`로 기동 거부. 오류 문구에 파일 경로와 필드 경로가 있다.

### 16.2 0.30.0에서 올라올 때

**deprecated 도구 목록.** `worker.permissions.claude.allowedTools` / `disallowedTools` · `worker.permissions.grok.allow` / `deny`는 이제 **선택 키이자 deprecated**다(에이전트별로 따로 병합 · codex에는 목록이 없다). 키가 있으면(`[]` 포함) 기동 로그에 `warning:` 줄이 찍힌다.

| 상황 | 동작 |
|------|------|
| deprecated allow만 있고 `policy.json`에 `shell.allow` 없음(파일 자체가 없어도 같음) | 그 목록이 **셸 allow 집합**이 된다(0.30.0 동작) + 경고. `Bash(p*)` 형 항목은 `p` + `p *`로 **좁혀** 쓰고 경고에 적는다 |
| deprecated allow **와** `policy.json` `shell.allow` 둘 다 | **기동 거부** — `policy allow specified in both <policy.json> shell.allow and worker.permissions.<agent>.…` → 한쪽을 지운다 |
| deprecated deny | effective deny에 **합집합**(완화 불가) + 경고. `Bash(p *)`·`Bash(p)`·`p *`·`WebFetch`·`WebSearch`·비-셸 도구 이름을 받는다 |
| deprecated deny에 공백 없는 `p*`인데 0.30.0 기본 deny 항목과 **글자 그대로 같음**(`Bash(git push*)` · `Bash(git reset --hard*)` · `Bash(git clean*)`) | **받아들인다** + 경고. 내장과 같게 `p` + `p *`로 바꾼다. 이 문자열은 이미 내장 deny에 있으므로 빠지는 차단은 없다. 경고: *"… no-space entries identical to built-in defaults accepted …: Bash(git push*), …; remove the list"* |
| 그 밖의 공백 없는 `p*` deny(예: `Bash(rm*)`, 대소문자만 다른 `Bash(Git push*)`) | **기동 거부**. 오류가 고치는 법을 말한다: *"move it into `<policy.json>` shell.deny as `"rm *"` plus each lookalike you meant, listed explicitly"* — `p*`는 비슷한 이름까지 막았으므로(`rm*` → `rmdir`) 조용히 좁히지 않는다 |

**0.30.0 §15.2의 기본 목록을 bridge 설정에 그대로 복사해 둔 경우** 0.31.0 bridge는 **경고와 함께 기동한다**(위 표의 "글자 그대로 같음" 행). 같은 내용이 이미 내장 기본값이므로 **목록을 지운다.** 더 넣고 싶은 deny는 `policy.json` `shell.deny`에 `p *` 형으로 적는다. 복사한 목록에 직접 고친 공백 없는 `p*` 항목이 섞여 있으면 그 항목 때문에 여전히 기동을 거부한다.

**실행 중이던 카드.** 0.31.0은 argv 템플릿 버전(`0.31.0-v1`)과 fingerprint 입력(정책 해시 · 스킬 매니페스트 해시)이 바뀌어 **0.30.0 기록의 fingerprint는 모두 달라진다.**
- bridge 재시작 복구에서 워커가 죽어 있으면 `needs_verification`, note `fingerprint_changed; not resuming`.
- 워커가 살아 있으면 **죽이지 않는다** — 감시하지 않고 결과를 같은 `fingerprint_changed`로 선점한다. 그 워커의 작업은 사람이 워킹트리에서 확인한다.
- **동작 변경:** 입양은 fingerprint가 **그대로일 때만** 한다. 0.30.0은 bridge 재시작 복구에서만 대조했지만 0.31.0은 **보통 디스패치 경로의 입양**(같은 핸드오프의 재전달 등)에서도 대조한다. `policy.json` · `worker.permissions` · `worker.skills`를 고치고 bridge를 다시 띄워도 같은 일이 생긴다.

### 16.3 스킬 — 룸이 고르고, 카드에 복사한다

**켜기:** bridge 설정 `worker.skills: {"enabled": true}`. 기본은 꺼짐 — 스킬 디렉터리 · 목록 · `--plugin-dir` 모두 없고 argv·프롬프트·fingerprint는 0.30.0 경로와 같다(매니페스트 해시 `""`). `enabled` 외 키 · 불리언 아닌 값은 기동 거부.

**소스:**
- **내장** `loom-card-report` 1개 — 최종 보고 형식(Status / Summary / Changes / Checks / Open)과 끝 줄 `LOOM-REPORT-END`를 지시한다. `dist/loom.js` 번들에 텍스트로 들어 있다. `LOOM-REPORT-END`를 읽는 파서는 없다(스모크 표적).
- **사용자** `loomDir()/skills/<name>/SKILL.md`(+ 같은 디렉터리의 파일). 이름이 겹치면 **사용자가 이긴다.** `loomDir()/skills` 자체가 심볼릭 링크이거나 디렉터리가 아니면 선택된 이름은 전부 `unsafe source`.
- peer가 보낸 스킬은 설치하지 않는다. 카드 페이로드에는 스킬 필드가 없다.

**룸 선택 — 유일한 선택 권위:** `loomDir()/rooms/<roomKey>/skills.json`. `roomKey` = roomId(UTF-8)의 sha256 16진 **앞 16자**(0.29.0 룸 이벤트 디렉터리와 같은 키):

```bash
printf '%s' '<roomId>' | shasum -a 256 | cut -c1-16
```

```json
{ "version": 1, "skills": ["loom-card-report"] }
```

- 키는 `version`(`1`)과 `skills`(이름 배열)뿐. 이름 = `^[a-z0-9][a-z0-9-]{0,63}$` · 중복은 한 번으로 · ≤64 KiB.
- 파일(또는 `rooms/`·룸 디렉터리)이 없으면 스킬 0개. `rooms/`·룸 디렉터리·`skills.json`이 심볼릭 링크이거나 파일이 무효면 그 카드는 spawn하지 않고 `failed` reason `spawn_setup_failed`(§16.5).
- 선택됐어도 `policy.json` `skills.allow` 밖이면 `unavailable: not allowed by policy`.

**SKILL.md 규칙** (어기면 그 스킬만 `unavailable`, 사유는 아래 표):
- 디렉터리 이름 = 프론트매터 `name`. 파일은 유효한 UTF-8.
- 프론트매터: 첫 줄 `---` … 닫는 `---`. **허용 키:** `name` · `description` · `version` · `license` · `metadata` · `allowed-tools` · `hooks` · `loom` · `loom.requires-policy`. 모르는 키 · 중복 키 → `invalid SKILL.md`.
- **엄격한 YAML 부분집합:** 평문 · 작은따옴표 · 큰따옴표(이스케이프·내부 `"`·`\` 없음) 스칼라만. 흐름 컬렉션(`{}` `[]`) · 앵커 · 별칭 · 태그 · `...` · `%` 지시자 거부. 중첩 블록은 `metadata` · `allowed-tools` · `hooks` · `loom` 아래만, `loom:` 안에는 `requires-policy:`만. 중첩 키는 평문 식별자만(YAML 불리언/null 단어 `true`·`yes`·`on`·`null` 등 거부). `description`은 `|`·`>` 블록 스칼라 가능(한 줄로 접는다).
- 프론트매터의 어느 줄에도 제어 · 서식(bidi·zero-width·BOM) · 줄/문단 구분 문자 금지(CRLF는 허용). NFKC + 소문자 + 문자·숫자만 남긴 결과에 `loomdispatchedtask`(작업 마커 머리)가 들어가면 거부.
- **`description` 필수:** 제어 문자는 공백, 서식 문자는 제거, 공백 압축 후 **한 줄 · 1~160자(코드 포인트)** · 마커 글자 없음 → 아니면 `bad description`.
- **`allowScripts`가 필요한 것** — 아래 중 하나라도 있으면 `policy.json` `skills.allowScripts`에 그 이름이 있어야 복사한다(없으면 `requires policy`): `scripts/` 디렉터리 아래 정규 파일 · 실행 비트가 있는 파일 · `allowed-tools` 키 · `hooks` 키 · `loom.requires-policy`(값이 정확히 `false`가 아니면) · 중첩 블록 안의 `requires-policy` 언급.
- **상한:** 스킬당 **1 MiB · 정규 파일 256개**(탐색 항목 1,024개 · 디렉터리당 512개) → 넘으면 `too large`. 심볼릭 링크 · 비정규 파일 · 이상한 경로 → `unsafe source`.

**카드 복사본과 매니페스트:** 새 카드의 **첫 턴에만**, 카드 락 아래에서 소스를 읽어 복사한다(그 뒤 재개는 소스를 다시 읽지 않는다):

```text
~/.loom/cards/<sha16(로컬 peer id)>/<sha16(room × agent × cardId)>/skills/
  manifest.json                         # 0600
  plugin/.claude-plugin/plugin.json     # {"name":"loom-card"}, 0600
  plugin/skills/<name>/SKILL.md …       # 파일 0600 (allowScripts 스킬의 스크립트만 0700), 디렉터리 0700
```

- **복사이지 링크가 아니다.** `unavailable` 스킬은 복사하지 않는다. 이전 복사본은 임시 디렉터리 + rename으로 교체한다. GC는 없다(transcript와 같다).
- `manifest.json` = `[{"name", "source": "builtin"|"user", "files": {"<상대경로>": "<sha256>"}, "scripts": ["<상대경로>"]}]`, 이름순. 이 정규 직렬화의 sha256이 fingerprint에 들어간다.

**CLI별 전달:**

| CLI | 전달 | 프롬프트 |
|-----|------|----------|
| claude | 사용 가능한 스킬이 1개 이상이면 `--plugin-dir <card>/skills/plugin` 1개(`--add-dir`은 쓰지 않는다 — 접근 범위를 넓힌다). claude가 플러그인 스킬을 네이티브로 로드(`loom-card:<name>`) | `Unavailable skills:` 줄만(있을 때) |
| codex · grok | 플래그 없음 | 첫 턴 프롬프트의 **작업 마커 앞**에 `Available skills — read the SKILL.md before use:` + `- <name>: <description> — <절대 SKILL.md 경로>`, 이어서 `- <name>: unavailable: <사유>` |

- 목록은 argv에 없고(stdin · grok은 `--prompt-file`), **첫 턴에만** 들어간다 — 재개 턴은 세션이 기억한다.
- **목록 상한: 항목 20줄 · 블록 전체 4,096바이트**(UTF-8, 머리줄 포함). 넘는 항목은 한 줄 `- (+N more): unavailable: cap`. 순서는 사용 가능 → 불가, 각각 이름순. 복사는 상한과 무관하게 전부 한다 → **claude는 플러그인으로 모든 사용 가능 스킬을 보지만 codex/grok은 목록에 든 것만 안내받는다.**

**`unavailable` 사유:**

| 사유 | 뜻 |
|------|----|
| `not allowed by policy` | `policy.json` `skills.allow` 밖(`[]`이면 전부) |
| `not installed` | 사용자·내장 어디에도 없음 |
| `unsafe source` | 소스에 심볼릭 링크 · 비정규 파일 · 이상한 경로, 또는 `loomDir()/skills`가 실제 디렉터리가 아님 |
| `too large` | 1 MiB · 256파일 · 탐색 상한 초과 |
| `invalid SKILL.md` | `SKILL.md` 없음 · UTF-8 아님 · 프론트매터가 부분집합 밖 · `name` ≠ 디렉터리 이름 |
| `bad description` | `description` 없음 · 160자 초과 · 비었음 · 마커 글자 포함 |
| `requires policy` | 스크립트·`allowed-tools`·`hooks`·`requires-policy`가 있는데 `allowScripts`에 이름이 없음 |
| `cap` (`(+N more)` 줄) | 목록 상한 밖 — 복사는 됐지만 codex/grok에는 안내되지 않음 |

**재개 재검증:** 재개 · bridge 재시작 복구 · 입양 전에 카드 복사본을 `manifest.json`과 **재해시**한다(내용 · 파일/디렉터리 모드 · 정확한 파일·디렉터리 집합 · `plugin.json`). 소스는 읽지 않는다 — 첫 턴 뒤 소스를 고쳐도 그 카드에는 반영되지 않는다. 복사본이 없거나 바뀌었거나 해시가 다르면 `needs_verification`, note `fingerprint_changed; not resuming`. 스킬이 꺼진 설정에서 fingerprint만 다른 재개는 0.30.0처럼 새 세션이다.

### 16.4 정직 표 — CLI마다 실제로 강제되는 것

정책 문법은 하나지만 **강제력은 CLI마다 다르다.** 과신하지 않는다.

| 항목 | claude 2.1.300 | codex-cli 0.162.1 | grok 1.0.54 (alpha) |
|------|----------------|-------------------|---------------------|
| **셸 deny** | **강제**(접두) — `--settings` deny · `permission_denials` 구조화 신호(스모크 i1: `echo hi` 미실행) | **강제 아님** — 명령 단위 deny 플래그가 없다. 실질 강제는 커널 샌드박스(`workspace-write`) + 네트워크 차단 | **best-effort** — 텍스트 신호(`Denied by permission policy …`) |
| **네트워크** | 권고 — curl/wget·WebFetch/WebSearch deny(다른 경로는 못 막음) | **강제** — 스모크 i2: `false` → `curl` exit 6 · `true` → `HTTP/2 200` | 권고 — curl/wget deny + `--disable-web-search`(효과 미측정, UK-4) |
| **MCP deny** | 툴이 **목록에서 사라질 뿐 신호 없음**(`permission_denials` 비어 있음, `SKILLS-POLICY-PROBE` §H) | 해당 없음(`approval_policy=never`에서 MCP 호출은 기본 실패, §C) | 호출 시 텍스트 거부 |
| **MCP 격리** | **강제** — `--strict-mcp-config` → 서버 0개(스모크 h1 `mcp_servers: []`) | 불가 | 불가 |
| **스킬** | 로드 **강제**(플러그인 — init `plugins`에 `loom-card`) | 권고(첫 턴 목록) | 권고(첫 턴 목록) |
| **오너 설정 상속** | 오너 플러그인·스킬은 **계속 로드된다**(UK-6 — 실측 init: 오너 플러그인 19개 + `loom-card` · 스킬 142개) · 오너 훅(UK-3) | 오너 전역 스킬이 보일 수 있다 · **trust 자동 기록**(아래) | 오너 `~/.claude` 권한·MCP·스킬을 병합한다(D12) |

- **codex는 실행한 저장소를 신뢰 목록에 스스로 넣는다.** codex 0.162.1은 헤드리스 실행마다 그 cwd를 `~/.codex/config.toml`에 `[projects."<cwd>"] trust_level = "trusted"`로 기록한다(스모크 0.31.0에서 확인). 그러면 나중에 그 저장소에 생긴 `<repo>/.codex/config.toml`(프로젝트 MCP · 훅)이 오너의 codex에서 적용된다. **Loom은 trust 플래그를 넘기지 않는다** — codex 자체 동작이다. 원치 않으면 `~/.codex/config.toml`의 해당 `[projects."…"]` 항목을 직접 지운다(이 기록을 끄는 codex 설정 키가 있는지는 확인하지 않았다).
- **grok은 오너의 `~/.claude` 설정을 읽는다(D12).** 권한·MCP·스킬이 grok 워커에 섞인다 — 문서화된 비목표다. 민감한 저장소면 grok 카드를 쓰지 않는다.
- **거부 note는 도구 이름만 싣는다.** 결과 note 선두가 `denials: 1 (Bash)` 형태다 — 어떤 명령이 막혔는지는 transcript의 `permission_denials`에서 본다.
- codex에서 `git push`·`rm` 같은 deny 접두는 막히지 않는다. 막는 것은 쓰기 범위와 네트워크뿐이다 — 결과는 언제나 diff로 확인한다(§15.5).

### 16.5 실패 사유 (0.31.0 추가분)

| reason / note | 원인 |
|---------------|------|
| bridge **기동 거부** | 무효 `policy.json` · 조회 실패 · deprecated allow와 `shell.allow` 공존 · deprecated deny의 `p*`(0.30.0 기본 항목과 글자 그대로 같은 것은 제외) · `worker.skills` 형식 오류 |
| reason `spawn_setup_failed` (note = 오류 문구 ≤500자) | 무효/심볼릭 링크 `skills.json` · 카드 디렉터리 경로 중간의 심볼릭 링크 · 복사 쓰기 실패 · SKILL.md 절대경로나 description에 제어 문자 또는 작업 마커 글자(예: `loomDir` 경로 자체가 그 글자를 담은 경우) — spawn하지 않는다 |
| reason `needs_verification`, note `fingerprint_changed; not resuming` | §16.2 · §16.3 — 정책 · 권한 · 템플릿 · 스킬 복사본이 기록과 다름 |

---

## 17. Loom MCP 사전 점검 (v0.32.0)

**하고 싶은 일:** 대화형 `loom run claude|codex|grok` 세션의 에이전트가 Loom MCP 도구(20개)로 보드·인계·conv를 바꾸기 **전에** Loom 서버가 `policy.json`으로 검사하게 한다 — 특정 도구 끄기, 보드 통째 교체·브로드캐스트 같은 위험한 모드 끄기, MCP로 `done` 찍기를 사람 몫으로 돌리기.

**범위는 Loom MCP 서버 한 곳이다.** 헤드리스 워커(§15·§16)는 Loom MCP를 받지 않으므로 이 절과 무관하고, 워커 argv·fingerprint는 0.31.0과 같다 — `policy.json`에 `loomTools`를 넣어도 실행 중 헤드리스 카드에 `fingerprint_changed`가 생기지 않는다. 와이어·완료 권한(원격 결과 = `blocked`)도 그대로다. **`policy.json`이 없거나 `loomTools`가 없을 때 모델이 보는 새 거부는 둘이다:** 인자를 엄격하게 검사한다(§17.4) · `import_board mode=replace`를 거부한다(§17.2). 그 밖에 기본 정책에서도 0.31.0과 달라지는 점:
- MCP로 `done`을 찍을 때마다 감사 줄 `done_via_mcp` 하나 — 새 파일 `~/.loom/rooms/<roomKey>/policy-audit.jsonl`(§17.6).
- `dispatch_card`가 로컬 peer 목록을 더 조회한다(보내기 전 1회, 그 조회가 대상을 하나로 정하면 보낸 뒤 1회 더) — 일치하면 카드에 로컬 고정 id를 남긴다(§17.6).
- `apply_card_result`가 카드에 `l2Mismatch` 플래그를 붙일 수 있다(거부 아님, §17.6).
- Loom MCP 서버가 **호출마다** `policy.json`을 읽는다 — 조회 실패(권한 없음 · 매달린 링크 · 64 KiB 초과 · 무효)면 모든 Loom 도구가 거부된다. 0.31.0 MCP 서버는 이 파일을 읽지 않았다(§17.5).

### 17.1 `policy.json`에 쓰는 키

파일 위치와 v1 필수 키는 §16.1 그대로다(`version` · `shell.deny` · `network` · `mcp.deny` · `skills.allowScripts`). 0.32.0이 더한 것은 선택 최상위 키 `loomTools`와, `mcp.deny`의 `loom__<tool>` 항목을 **Loom 서버가 직접** 지키는 것이다.

```json
{
  "version": 1,
  "shell": { "deny": [] },
  "network": false,
  "mcp": { "deny": ["loom__room_chat"] },
  "skills": { "allowScripts": [] },
  "loomTools": { "done": "propose", "denyModes": ["broadcast"] }
}
```

| 키 | 값 | 뜻 |
|----|----|----|
| `mcp.deny` 의 `"loom__<tool>"` | Loom 도구 이름(예 `loom__room_chat`) | `tools/list`에서 **숨기고**, 이름으로 불러도 **거부**(`mcp_deny`). 숨기기만 하는 경로는 없다. 다른 서버 항목(`github__…`)은 0.31.0처럼 헤드리스 워커 argv에만 쓰인다 |
| `loomTools.done` | `"allow"`(내장) \| `"propose"` | MCP로 `done` 찍기 허용(감사 기록) / 거부(§17.3) |
| `loomTools.denyModes` | 아래 5개 중에서 | 인자 단위 거부. **실효 = 내장 `["board.replace"]` ∪ 정책** — `[]`를 적어도 `board.replace`는 남는다 |

- **읽는 시점:** Loom MCP 서버는 **`tools/list` · `tools/call`마다** `policy.json`을 다시 읽는다 — 고친 뒤 `loom run`을 다시 띄울 필요가 없다(헤드리스 bridge는 여전히 기동 때 한 번, §16.1). 다만 에이전트 CLI가 도구 목록을 언제 다시 읽는지는 CLI 몫이라, 숨김은 늦게 보일 수 있고 호출 거부는 바로 적용된다.
- `loomTools`의 모르는 키 · `done` 값 오류 · 모르는 모드 = **무효 정책**(§17.5). 오류에 파일 경로와 필드 경로(`loomTools.denyModes[0]: unknown mode …`)가 있다.
- **0.31.0 바이너리는 `loomTools`를 모르는 키로 거부한다** — 0.31.0 헤드리스 bridge는 이 파일로 기동하지 않는다(fail-closed). 키를 넣기 전에 bridge까지 0.32.0으로 올린다.

### 17.2 거부 모드 (`loomTools.denyModes`)

| 모드 | 막는 호출 | 거부 문구의 다음 행동 | 사람 경로 |
|------|-----------|------------------------|-----------|
| `board.replace` (**내장 기본**) | `import_board` `mode: "replace"` | *Use mode=merge, or the owner runs `loom board import --replace <file>`.* | `loom board import --replace <file>` |
| `broadcast` | `handoff` `to: "*"` — **`to`를 빼도 같다**(기본값이 `*`) | *Address one peer (@name or id).* | `loom handoff '*' "…"` |
| `conv.writes` | `conv_open` `writesAllowed: true` | *Open the conv with writesAllowed=false, or ask the owner.* | — |
| `conv.fetch` | `conv_fetch` 호출 전체 | *Ask the owner to fetch the artifact.* | — |
| `pack.embed` | `handoff` `withPackEmbed: true` | *Use withPack without embedded file bodies.* | `loom handoff … --with-pack-embed` |

- 판정은 **엄격 검사를 통과한 인자**로만 한다(`"true"` 같은 문자열은 불리언이 아니므로 먼저 `invalid_args`로 거부된다).
- **확인 후 허용은 없다.** MCP에는 확인 채널이 없어서, 위험한 작업은 거부 모드로 끄고 사람이 CLI로 한다.

### 17.3 완료 노브 (`loomTools.done`)

| 값 | MCP의 done 경로 넷 |
|----|---------------------|
| `allow` (**내장 기본**) | 0.31.0처럼 허용. 대신 호출마다 감사 파일에 `done_via_mcp` 한 줄(`cardId` 또는 `convId`) |
| `propose` | 넷 전부 거부(`done_propose`) — 문구가 사람 경로를 가리킨다 |

| done 경로 | `propose` 거부 문구의 다음 행동 |
|-----------|-------------------------------|
| `update_task status: "done"` | *Set status blocked with a note and ask the owner to run `loom board set <id> done`.* (실제 id가 들어간다) |
| `add_task status: "done"` | 같은 문구(`<task_id>`) |
| `import_board` 스냅숏에 `status: "done"` 카드가 하나라도(merge·replace 모두) | done 카드 id(≤5개 + `+N`) + *Import without done cards, or the owner runs `loom board import <file>`.* |
| `conv_close` reason `done` — **reason을 빼도 같다**(기본값이 `done`) | *Close with reason=abort and ask the owner to mark the card done (`loom board set <task_id> done`).* — conv를 닫는 CLI는 없으므로 `abort`로 닫으면 작업은 `blocked`가 된다 |

- **사람 경로 = 기존 CLI** `loom board set <task_id> done` — host가 보드를 직접 쓰고 MCP를 거치지 않으므로 `propose`와 무관하게 된다(새 명령 없음).
- 한 호출이 거부 모드와 done에 함께 걸리면 거부 모드가 먼저다(`propose` + done 카드를 담은 `mode=replace` → `deny_mode:board.replace`).
- **정직 고지 — 기본 `allow`는 "에이전트가 done을 선언하지 못한다"는 규칙의 준수가 아니라 이월이다.** 기본을 `propose`로 두면 사람이 done을 찍는 길이 `loom board set` 하나뿐인 지금 보드가 멈춘다. 기본 전환은 7단계(총괄 에이전트)에서 한다.
- **`propose`는 MCP 층만 막는다.** `loom run` 에이전트의 셸은 `LOOM_SESSION`을 물려받아 `loom board set <id> done`을 직접 실행할 수 있고, 정책 `shell` 규칙은 대화형 세션에 적용되지 않는다(§17.7).

### 17.4 거부 응답과 엄격 인자

- **거부 = 도구 결과 `isError: true`**, 텍스트 `Loom pre-check refused <tool>: <사유>. <다음 행동>.` — 인자 값은 되풀이하지 않는다(ID만). 거부마다 서버 stderr에 `[loom-mcp] precheck refused tool=<t> reason=<code>` 한 줄.
- **모르는 도구 이름**만 예외: 0.31.0과 같은 JSON-RPC 오류 `-32601`(`Unknown tool: …`). `mcp.deny`로 숨긴 도구를 이름으로 부르면 `-32601`이 아니라 `mcp_deny` 거부다 — 정책 때문임을 알 수 있게.
- **엄격 인자:** 도구마다 광고한 `inputSchema`가 곧 검사 기준이다(최상위 `additionalProperties: false`). 타입이 틀리거나(숫자 자리에 문자열 · 불리언 자리에 `"true"`) 광고하지 않은 키가 있으면 `invalid arguments at <경로> (<zod 코드>)` — 예: `invalid arguments at extra (unrecognized_keys)`. 미지 키 이름은 최대 3개까지만 되풀이한다. `arguments`를 빼면 `{}`로 보지만 `arguments: null`은 거부한다. 자유형 객체 인자(`import_board.snapshot` · `conv_send` 항목) 내부는 검사하지 않는다.
- 예: MCP `set_purpose`에 `verify`를 넣던 호출은 이제 `invalid arguments at verify (unrecognized_keys)`로 먼저 막힌다(`verify`는 여전히 CLI `loom purpose set --verify …`로만).

**판정 순서와 사유 코드** (`reason`):

| 순서 | 코드 | 언제 |
|------|------|------|
| 1 | `policy_invalid` | `policy.json`이 무효이거나 조회 실패(§17.5) |
| 2 | `unknown_tool` | 20개에 없는 이름(응답은 `-32601`) |
| 3 | `mcp_deny` | `mcp.deny`에 `loom__<tool>` |
| 4 | `invalid_args` | 엄격 인자 위반 |
| 5 | `deny_mode:<mode>` | §17.2 |
| 6 | `done_propose` | §17.3 `propose` |
| — | `l2_mismatch` | 거부가 아니다 — `apply_card_result`의 감사 기록(§17.6) |

### 17.5 무효 정책 — 거부하되 서버는 산다

- `policy.json`이 무효(JSON·스키마 오류)이거나 조회에 실패하면(§16.1 fail-closed 규칙 — 권한 없음 · 매달린 링크 · 64 KiB 초과 · `loomDir`가 없고 그 부모도 실제 디렉터리가 아님 · 읽는 동안 바뀜) **모든 `tools/call`을 로더 메시지로 거부한다:** `policy.json is invalid (<로더 메시지>). Every Loom tool call is refused until the owner fixes policy.json.`
- `tools/list`는 **거르지 않은 20개 전부**를 돌려준다(이때는 `mcp.deny`도 적용되지 않는다) — 에이전트가 불러 보고 이유를 읽게 하기 위해서다.
- 서버는 종료하지 않는다. 파일을 고치면 **다음 호출부터** 정상이다.
- 파일이 없으면(ENOENT) 내장 기본값 — `{done: "allow", denyModes: ["board.replace"]}` · Loom 도구 deny 없음.

### 17.6 감사 파일과 L-2 플래그

**위치:** `loomDir()/rooms/<roomKey>/policy-audit.jsonl`(기본 `~/.loom/rooms/<roomKey>/…`). `roomKey`는 §16.3과 같은 키다(`printf '%s' '<roomId>' | shasum -a 256 | cut -c1-16`). **relay 이벤트 로그와 섞지 않는다** — 로컬 판정 기록일 뿐이고 relay로 가지 않는다.

```json
{"v":1,"ts":"2026-10-16T…Z","kind":"refused","tool":"update_task","peerId":"p_…","roomId":"room_…","agentKind":"claude","reason":"done_propose","cardId":"task_…"}
```

| 필드 | 값 |
|------|----|
| `kind` | `refused`(거부) · `done_via_mcp`(`allow`에서 MCP로 done) · `l2_mismatch`(아래) |
| 필수 | `v` · `ts` · `kind` · `tool` · `peerId` · `roomId` · `agentKind` |
| 선택 | `reason` · `mode` · `cardId` · `convId` |

- **인자 본문 · 제목 · 노트 · 경로는 기록하지 않는다**(ID만). 한 줄 ≤ 4,096바이트(줄바꿈 포함 — 넘으면 필드를 줄인다). 파일 0600 · 디렉터리 0700.
- **회전:** 다음 쓰기가 살아 있는 파일을 **1 MiB** 넘기게 하면 먼저 `policy-audit.<YYYYMMDDTHHmmssSSSZ>-<pid>-<임의 6자>.jsonl`로 이름을 바꾸고 새 파일에 쓴다. 이름순 **최신 3세대**를 남긴다(최근 60초 안에 쓰이거나 회전된 세대도 지우지 않는다) → 보통 룸당 약 4 MiB. 잘라 내기(truncate)는 하지 않는다.
- **크기 감:** 한 줄 약 172~206바이트(라이브 스모크) → 세대당 약 5,000건. 거부만이면 넉넉하고, 기본 `allow`의 `done_via_mcp` 줄이 양을 좌우한다.
- **감사는 관문이 아니다.** 쓰기 실패는 판정을 바꾸지 않고 stderr `[loom-mcp] audit_write_failed room=<key> err=<code>`만 남긴다. 세션에 룸이 없으면 기록하지 않는다(`err=no_room`).
- **읽을 때:** 회전된 세대를 이름순으로 → 마지막에 `policy-audit.jsonl`. 파싱되지 않는 줄은 건너뛴다(쓰기 도중 크래시가 남긴 조각). 읽는 사이 파일이 사라질 수 있다(다른 프로세스의 정리).

**L-2 플래그 (`l2Mismatch`)** — 원격 결과를 보낸 peer가 디스패치 대상과 다르다는 **조언 신호**다.
- `dispatch_card`는 보내기 전후 로컬 peer 목록에서 그 `node` 이름과 일치하는 peer가 **정확히 하나이고 같을 때만** 그 peer id를 카드에 고정한다(`dispatchPeerId` — 보드 파일에만 있고 MCP·RPC 출력·스냅숏·인계 첨부에는 나가지 않는다). 라우팅은 0.31.0처럼 `@node` 이름이다.
- `apply_card_result`에 `fromPeerId`가 있고 고정 id와 다르면 **거부하지 않는다** — 결과는 평소처럼 `blocked`로 착지하고, 카드에 `l2Mismatch: true`가 붙고(`list_tasks` · desktop/sticky RPC에 보임), 감사 `l2_mismatch` 한 줄 + stderr `[loom-tower] l2_mismatch cardId=<id>`. 노트는 0.31.0과 같다.
- 한쪽이라도 없으면(레거시 카드 · 이름 일치 0개/2개 이상 · `fromPeerId` 생략) 0.31.0 동작 + stderr `l2_unverifiable` 한 줄.
- **플래그를 보면:** 그 결과를 더 의심하고 산출물을 로컬에서 확인한 뒤 닫는다(§13). 다시 디스패치하면 플래그가 지워진다.
- **한계:** `fromPeerId`는 에이전트가 인박스에서 베껴 넘기는 값이라 **빼면 검사를 우회한다.** 보내는 순간 같은 이름 peer가 들고 나면 드물게 잘못 붙을 수도 있다. 완료 권한이 아니다 — 결과는 어느 경우든 `blocked`다.

### 17.7 정직 표 — 대화형 `loom run`에서 실제로 강제되는 것

2026-10-16 라이브 스모크(`docs/spikes/MCP-PRECHECK-SMOKE-0320.md`) 기준.

| 항목 | claude 2.1.300 | codex-cli 0.162.1 | grok 1.0.54 (alpha) |
|------|----------------|-------------------|---------------------|
| **Loom MCP 사전 점검** (§17.1~§17.5) | **강제** — Loom 서버 코드 안 | **강제** | **강제** |
| **`mcp.deny` `loom__<tool>` 숨김** | 적용(스모크: 19개, `room_chat` 없음) | 적용 | 적용(도구 검색 결과 19개) |
| **거부 텍스트가 모델에 보이는가** | 보임 — `tool_result` `is_error: true`, 서버 문구 그대로 | 보임 — `mcp_tool_call` `status: "failed"`, `result.content[0].text` = 서버 문구 | 보임 — 서버 문구 앞에 `Failed to call <tool>: ` |
| **실행 전 사람 확인** | **Loom은 넣지도 억제하지도 않는다**(Loom은 권한 설정을 쓰지 않는다). 오너의 권한 모드가 정한다: `auto` → 확인 없음 · 확인 모드에 allow 규칙 없음 → 대화형은 프롬프트, `-p`는 Loom에 닿기 전에 거부 · `--allowedTools mcp__loom` → 확인 없음 | **codex가 확인을 요구한다** — 도구별/서버별 `approval_mode = "approve"`가 없으면 승인을 묻고, `approval_policy = "never"`면 호출이 `MCP tool call requires approval, but approval policy is never`로 실패한다(Loom 도달 0). Loom은 이 설정을 쓰지 않는다 | 확인 없음(ACP 실측 — 권한 요청 0건) |
| **셸로 `loom board set … done` 우회** | Bash 권한 확인이 유일한 장벽(`auto`·사전 허용이면 없음) | 막지 않음 | 막지 않음 |
| **정책 `shell` · `network` 규칙** | 대화형 세션에는 **적용되지 않는다**(0.31.0 = 헤드리스 워커 argv에만) | 〃 | 〃 |

- 스모크에서 세 CLI 모두 거부 문구를 그대로 인용했고, 재시도나 우회를 시도하지 않았다. 사람 경로 `loom board set <id> done`은 세 경우 모두 성공했다.
- 오너 codex 설정에 일부 Loom 도구만 `approval_mode = "approve"`가 있으면 나머지 도구(`import_board` · `conv_*` · `handoff` 등)는 계속 승인을 묻는다.
- grok은 ACP 세션에서도 오너 자신의 MCP 서버를 함께 로드한다(격리 없음 — §16.4와 같음).

### 17.8 한계

- **`propose`는 MCP 층만 막는다** — 셸 우회(§17.7). 해소는 7단계 host 소유 쓰기 또는 대화형 세션 셸 정책(후보).
- **사람 확인 채널은 없다.** 위험한 작업은 거부 모드로만 다룬다.
- **폴더 규칙(`conv_open cwd` 접두) · 인계 대상 허용 목록은 아직 없다** — `broadcast` 거부까지만.
- **L-2는 조언 신호다**(§17.6) — `fromPeerId`를 빼면 우회, 드물게 오표시.
- **감사 기록 유실 창:** 쓰는 프로세스가 60초 넘게 멈춰 있거나 그 사이 시스템 시계가 60초 이상 앞으로 뛰면 그 한 건이 사라질 수 있다. 감사는 기록이지 관문이 아니다.
- **목록 갱신은 CLI 몫** — 세션 도중 `mcp.deny`를 바꾸면 호출 거부는 즉시, 목록에서 사라지는 시점은 CLI에 따라 늦을 수 있다.

---

## 18. 명령 치트시트

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

## 19. 자주 하는 실수

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
| 0.31.0 업그레이드 후 헤드리스 bridge 기동 경고 `deprecated deny list … identical to built-in defaults accepted …; remove the list` | 0.30.0 기본 목록을 bridge 설정에 그대로 복사해 둠(`Bash(git push*)` 등). 기동은 된다 | 목록 삭제(내장 기본이 같음). 더 막을 것은 `policy.json` `shell.deny`에 `p *` 형 (§16.2) |
| 0.31.0 업그레이드 후 헤드리스 bridge 기동 거부 `deprecated deny entry "Bash(rm*)"` | 내장 기본과 글자 그대로 같지 않은 공백 없는 `p*` deny | `policy.json` `shell.deny`에 `p *` 형 + 막으려던 비슷한 이름을 따로 적고 목록에서 지움 (§16.2) |
| 0.32.0 업그레이드 후 MCP 호출이 `Loom pre-check refused <tool>: invalid arguments at …` | 광고하지 않은 키 · 숫자 자리에 문자열 · 불리언 자리에 `"true"` 등 — 0.32.0부터 인자를 엄격히 검사 | 도구의 `inputSchema`대로 인자를 고친다(스키마를 풀지 않는다) (§17.4) |
| `import_board mode=replace`가 `mode=replace is denied` | 0.32.0 내장 기본 `board.replace` 거부(정책으로 풀 수 없다) | `mode=merge` 또는 사람이 `loom board import --replace <file>` (§17.2) |
| 모든 Loom 도구가 `policy.json is invalid (…)`로 거부 · 숨긴 도구가 다시 보임 | `policy.json` 무효 또는 조회 실패 — 이때 목록은 거르지 않음 | 메시지의 파일·필드 경로를 고친다. 다음 호출부터 정상(재시작 불요) (§17.5) |
| `loomTools`를 넣었더니 0.31.0 헤드리스 bridge 기동 거부 `unknown key "loomTools"` | 구 바이너리는 새 키를 모른다(fail-closed) | bridge도 0.32.0으로 올린다 (§17.1) |

---

## 20. 지금 버전에서 **아직** 못 하는 것

의도적으로 빠졌거나 나중 마일스톤입니다.

- 보드 **실시간 멀티라이터 CRDT** / relay 영속 보드  
- 클라우드 계정·멀티테넌시  
- herdr **0.7.4 / protocol 16** 동시 지원 (0.28.1은 17 컷오버; 다운그레이드 비목표)  
- 원격 result만으로 타워 board **`done`** (0.28.0 이후 의도적 금지 — `blocked` 후 로컬 확정)  
- 전역 `loom` 설치가 OS 패키지 매니저 기본 제공 (원하면 `scripts/install.sh` · `link:loom`)

**할 수 있는 것 (0.32.0 핀):** room/handoff/inbox · sticky · pack/board · desktop · MCP `loom run` · **bridge + herdr 0.7.5 카드 워커** · **헤드리스 카드 워커(0.30.0, opt-in — §15)** · **`policy.json` 권한 · 룸별 스킬(0.31.0 — §16)** · **Loom MCP 사전 점검(0.32.0 — §17)** · dogfood 3-kind · 완료 권한 분리 운영.

---

## 21. 더 읽을 문서

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

*가이드 핀: 제품 **v0.32.0** · §12 오케스트레이터/bridge 복구 · §13 완료 권한 · §14 herdr 0.7.5 · §15 헤드리스 카드 워커 · §16 스킬과 정책 · §17 Loom MCP 사전 점검. 기능이 늘면 사례 표와 CHANGELOG를 같이 갱신한다.*
