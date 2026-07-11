# Loom 사용자 가이드 — 사용 사례로 배우기

| Field | Value |
|-------|--------|
| **문서** | `docs/USER_GUIDE.md` |
| **대상** | Loom을 **쓰는** 사람 (개발자·페어·에이전트 운영) |
| **제품 버전** | CLI **v0.20.0** / desktop UI **v0.12.2** 기준 |
| **관련** | [README](../README.md) · [TEST_PLAN](./TEST_PLAN.md) (사례별 검증) · [ADAPTERS](./ADAPTERS.md) · [데스크톱](../apps/desktop/README.md) · [PITCH](./PITCH.md) |

이 문서는 **지금까지 구현된 기능으로 실제로 할 수 있는 일**을 시나리오 중심으로 정리합니다.  
Loom은 코딩 에이전트 자체가 아니라, **Room · 핸드오프 · 인박스 · 보드 · MCP · 데스크톱** 을 붙이는 멀티플레이어 레이어입니다.

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
| **Board** | 방 단위 로컬 태스크 보드 (CLI·MCP·데스크톱 공유 파일) |
| **Relay** | 메시지 중계 서버. 로컬 자동 또는 LAN/원격 수동 |

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

## 12. 명령 치트시트

```text
bun run loom --profile <p> room create|join|leave
bun run loom --profile <p> peers | status | chat "…"
bun run loom --profile <p> handoff @name|id|* "body" [--with-pack] [--with-pack-embed] [--with-board] [--board]
bun run loom --profile <p> inbox | inbox accept <id>
bun run loom --profile <p> listen
bun run loom --profile <p> host start|stop|status
bun run loom --profile <p> pack show|set|add|note|…
bun run loom --profile <p> board | board add|set|assign|export|import|…
bun run loom --profile <p> run [claude|codex|grok|shell]
bun run loom --profile <p> agents --matrix
bun run loom relay [--host 0.0.0.0] [--token …]
bun run desktop
bun run smoke:desktop
bun test
```

---

## 13. 자주 하는 실수

| 증상 | 원인 | 해결 |
|------|------|------|
| `loom: command not found` | PATH에 bin 없음 | `bun run loom …` |
| host stop이 안 먹음 | 다른 프로필 | start와 같은 `--profile` |
| desktop이 host 못 찾음 | 프로필/세션 불일치 | `export LOOM_PROFILE=…` 동일 |
| `bun run desktop` 인자 오류 | 구 스크립트 | 최신: `cd apps/desktop && tauri dev` |
| FABLE_* 만 설정 | 0.10+ 미독출 | `LOOM_*` 로 변경 |
| 보드가 머신마다 다름 | 로컬 파일 | export/import 또는 `--with-board` |
| 비루프백 relay 거부 | 토큰 없음 | `LOOM_RELAY_TOKEN` 필수 |

---

## 14. 지금 버전에서 **아직** 못 하는 것

의도적으로 빠졌거나 나중 마일스톤입니다.

- 보드 **실시간 멀티라이터 CRDT** / relay 영속 보드  
- 에이전트 TUI **stdin 자동 주입**  
- 클라우드 계정·멀티테넌시  
- 전역 `loom` 설치 스크립트 기본 제공 (원하면 alias)

---

## 15. 더 읽을 문서

| 문서 | 내용 |
|------|------|
| [README.md](../README.md) | 제품 소개·퀵스타트 |
| [PITCH.md](./PITCH.md) | 짧은 피치 + 데모 GIF |
| [ADAPTERS.md](./ADAPTERS.md) | 에이전트별 MCP |
| [apps/desktop/README.md](../apps/desktop/README.md) | 데스크톱 규칙 (토큰·XSS) |
| [PROTOCOL.md](./PROTOCOL.md) | 와이어 프로토콜 |
| [ARCHITECTURE.md](./ARCHITECTURE.md) | 패키지 구조 |
| [PLAN.md](./PLAN.md) | 기능 계획 SSOT (개발용) |

---

*가이드 버전: 제품 **0.13.0** 기능 집합 기준 (pack embed 포함). 기능이 늘면 이 문서의 사례 표를 갱신한다.*
