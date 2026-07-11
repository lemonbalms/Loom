# Loom 테스트 계획 — 사용 사례별

| Field | Value |
|-------|--------|
| **문서** | `docs/TEST_PLAN.md` |
| **대상** | QA·기여자·에이전트 — **시나리오 검증** |
| **제품 기준** | CLI **v0.13.3** · desktop UI (Send/Board) |
| **사용 가이드** | [`USER_GUIDE.md`](./USER_GUIDE.md) (같은 시나리오 번호) |
| **자동화** | `bun test` · `bun run smoke:desktop` |

이 문서는 **무엇을 통과해야 “그 사용 사례가 된다”고 말할 수 있는지**를 체크리스트로 고정한다.  
시나리오 설명·명령 전체는 USER_GUIDE를 보고, 여기서는 **검증 절차·기대 결과·자동화 여부**만 다룬다.

---

## 0. 공통 규칙

### 0.1 환경

```bash
cd /path/to/Loom          # 레포 루트
bun install
# 명령은 항상: bun run loom …  (PATH에 loom 없을 수 있음)
```

권장 격리 (수동 시나리오 간 세션 오염 방지):

```bash
export LOOM_TEST_HOME="/tmp/loom-tp-$(date +%s)"
mkdir -p "$LOOM_TEST_HOME/.loom"
# 테스트 끝나면: rm -rf "$LOOM_TEST_HOME"
```

### 0.2 우선순위

| 등급 | 의미 | 언제 필수 |
|------|------|-----------|
| **P0** | 핵심 가치 (룸·핸드오프·인박스) | 매 릴리스 전 |
| **P1** | sticky / pack / board / desktop 핵심 | 해당 영역 변경 시 + 주간 회귀 |
| **P2** | LAN·에이전트·스냅샷 등 | 해당 기능 변경 시 / 마일스톤 전 |

### 0.3 결과 표기

| 기호 | 의미 |
|------|------|
| ✅ | 통과 |
| ❌ | 실패 (이슈 링크/한 줄) |
| ⏭ | 스킵 (환경 없음: 예. 에이전트 CLI 미설치) |
| 🤖 | 자동화로 커버 |
| 🖐 | 수동 |

### 0.4 릴리스 최소 게이트 (제안)

매 ship 전 **필수**:

1. 🤖 `bun test` green  
2. 🤖 `bun run smoke:desktop` OK  
3. 🖐 **UC-1** (두 프로필 핸드오프) 전체  
4. 🖐 **UC-3** host start/stop (프로필 일치)  

해당 영역 건드렸으면 추가:

| 변경 영역 | 추가 UC |
|-----------|---------|
| pack / embed | UC-6 |
| board | UC-7, (스냅샷이면) UC-8 |
| desktop UI | UC-4 |
| relay 토큰/LAN | UC-10 |
| MCP / adapters | UC-9 |

---

## 자동화 매핑 (한눈에)

| UC | 시나리오 | 🤖 자동 | 🖐 수동 필수 여부 |
|----|----------|---------|-------------------|
| 0 | 설치·버전 | `bun test` 일부 · `--version` | P0 smoke |
| 1 | 두 프로필 핸드오프 | room/handoff 단위 테스트 | **P0 수동** |
| 2 | 오프라인 인박스 | room offline enqueue tests | P0 수동 권장 |
| 3 | sticky host | sticky-host.integration · smoke:desktop | **P0 수동** |
| 4 | 데스크톱 UI | smoke:desktop (RPC만) | **P1 GUI** |
| 5 | peers/chat/listen | 부분 단위 | P1 |
| 6 | pack / embed | context-pack.test L-5 | P1 |
| 7 | board | task-board · sticky board ops | P1 |
| 8 | board 스냅샷 | task-board snapshot tests | P2 |
| 9 | 에이전트 MCP | adapters + **smoke:uc** (9.1/4/5/6) | 9.2–9.3 TUI only |
| 10 | LAN/원격 | auth.integration (부분) | P2 2머신 |
| 11 | 회귀 묶음 | **smoke:desktop + bun test + smoke:uc** | — |
| 12 | Launcher UX (up/down/auto-host) | sticky-host.integration (부분) | **P1 수동** |

```bash
# 전체 자동 (CI 로컬 대응)
bun test && bun run smoke:desktop

# 사용 사례 CLI 스모크 (UC-0/1/3/5/6/7 핵심 — 격리 LOOM_TEST_HOME)
bun run smoke:uc
```

---

## UC-0 — 설치·명령 진입 (P0)

| # | 단계 | 기대 | 자동 |
|---|------|------|------|
| 0.1 | `bun install` | 에러 없이 완료 | 🖐 |
| 0.2 | `bun run loom --version` | `loom v0.13.x` 등 버전 출력 | 🖐 |
| 0.3 | `bun test` | 전부 pass | 🤖 |
| 0.4 | `bun run smoke:desktop` | `smoke OK` | 🤖 |
| 0.5 | `bun run link:loom` + PATH | `loom --version` 동작 | 🖐 |
| 0.6 | `export PATH=$PWD/scripts:$PATH` | `loom --version` via scripts/loom | 🖐 |
| 0.7 | PATH 없이 bare `loom` | command not found — A 또는 B/C 안내 | 🖐 |

**실패 시:** 루트 cwd / bun 버전 / 의존성 먼저 확인.

---

## UC-1 — 같은 머신 두 프로필 핸드오프 (P0)

**목표:** bob → alice 메시지 전달, alice accept.

| # | 단계 | 기대 | 자동 |
|---|------|------|------|
| 1.1 | `bun run loom --profile alice room create --as alice --name demo` | Invite `LOOM-…`, Share 줄이 **`bun run loom room join …`** | 🖐 |
| 1.2 | Share 줄에 bare `loom` 만 있지 않음 | PATH 없는 환경에서도 복사해 실행 가능 | 🖐 (0.13.2) |
| 1.3 | `bun run loom --profile bob room join LOOM-… --as bob` | 2 peers, bob 세션 저장 | 🖐 |
| 1.4 | `bun run loom --profile bob handoff @alice "hello"` | `handoff delivered` 또는 `queued` | 🖐 |
| 1.5 | `bun run loom --profile alice inbox` | 목록에 id, **from: bob (p_…)** 형태 이름, body 미리보기 | 🖐 (0.13.2) |
| 1.6 | `bun run loom --profile alice inbox accept ho_…` | HANDOFF 블록, untrusted 경고, `(accepted …)` | 🖐 |
| 1.7 | 같은 id 재 accept | 실패 또는 이미 claim (first-wins) | 🖐 |

**통과 기준:** 1.1–1.6 모두 ✅.  
**관련 자동:** room/handoff 통합 테스트, `presence.test` (이름 해석).

---

## UC-2 — 오프라인 수신 (P0)

**목표:** 수신자 host/listen 없이도 인박스에 쌓임.

| # | 단계 | 기대 | 자동 |
|---|------|------|------|
| 2.1 | alice join 후 **host 없음** (연결 종료) | peers에서 alice offline 가능 | 🖐 |
| 2.2 | bob `handoff @alice "offline msg"` | `queued` (또는 delivered if still online) | 🖐 |
| 2.3 | 이후 alice `inbox` | 메시지 존재, accept 가능 | 🖐 |
| 2.4 | relay 재시작 (같은 state dir) | pending inbox **유지**, rejoin `peerSecret` 유효 | 🤖 `smoke:durable` + persist tests |
| 2.5 | claim 후 재시작 | 해당 항목 **없음** (first-wins) | 🤖 persist tests |
| 2.6 | leave 후 재시작 | peer + inbox **없음** | 🤖 persist tests |

**통과 기준:** 2.2–2.4 ✅ (2.5–2.6 자동화 권장).  
**관련 자동:** `room.test` offline enqueue · `persist.test` · `bun run smoke:durable`.

---

## UC-3 — sticky host 온라인 유지 (P0)

| # | 단계 | 기대 | 자동 |
|---|------|------|------|
| 3.1 | alice `host start` | pid/port 출력, tip에 `bun run loom host stop` + **same --profile** | 🤖 smoke + 🖐 |
| 3.2 | bob handoff @alice | `notified=true` 가능, alice online | 🖐 |
| 3.3 | alice `inbox` | `(via sticky host)` | 🖐 |
| 3.4 | `bun run loom host stop` (**profile 없이**) | `no sticky host` + **profile tip** | 🖐 (0.13.2) |
| 3.5 | `bun run loom --profile alice host stop` | `sticky host stopping` | 🖐 |
| 3.6 | `host status` (start 후) | running, relay connected | 🖐 |
| 3.7 | 이미 running 중 재 start | already running, 에러 아님 | 🖐 |

**통과 기준:** 3.1, 3.3, 3.5 ✅.  
**관련 자동:** sticky-host.integration, smoke:desktop.

---

## UC-4 — 데스크톱 UI (P1)

**전제:** UC-3처럼 해당 프로필 `host start` 완료. 같은 `LOOM_PROFILE` 권장.

```bash
export LOOM_PROFILE=alice   # host start 와 동일
bun run desktop
```

| # | 단계 | 기대 | 자동 |
|---|------|------|------|
| 4.0 | `bun run desktop` 기동 | **에러 없이** 창 (구 `--manifest-path` 실패 없어야 함) | 🖐 |
| 4.1 | Status | host 연결·room/peer, invite 코드 표시 | 🖐 |
| 4.2 | Peers | online/offline, you 표시 | 🖐 |
| 4.3 | Send → peer handoff | banner 성공, 상대 inbox에 도착 | 🖐 |
| 4.4 | Send → room chat | 에러 없음 | 🖐 |
| 4.5 | Inbox claim/accept | 목록 갱신, first-wins | 🖐 |
| 4.6 | Board add + status 변경 | CLI `board` 와 동일 파일 반영 | 🖐 |
| 4.7 | Auto 5s / R 키 / Refresh | 갱신·last updated | 🖐 |
| 4.8 | host 없이 기동 | crash 없이 CTA (none/stale/401 구분) | 🖐 |
| 4.9 | XSS 텍스트 | body에 `<img …>` 넣어도 **텍스트로만** 표시 (innerHTML 없음) | 🖐 |
| 4.10 | 토큰 비노출 | DevTools에 host token 없음 (Rust only) | 🖐 선택 |

**통과 기준:** 4.0–4.6, 4.8 ✅.  
**RPC만 자동:** `smoke:desktop` (창 없음).

---

## UC-5 — peers / chat / listen (P1)

| # | 단계 | 기대 | 자동 |
|---|------|------|------|
| 5.1 | `peers` | 표 또는 목록, online 열 | 🖐 |
| 5.2 | `chat "hi"` | 에러 없음 (수신은 listen/다른 클라이언트) | 🖐 |
| 5.3 | alice `listen` + bob handoff | 터미널 알림/배너 | 🖐 |
| 5.4 | slash (listen 중) `/loom peers` | 동작 (제품 `/loom` only) | 🖐 선택 |

---

## UC-6 — 컨텍스트 팩 + embed (P1)

| # | 단계 | 기대 | 자동 |
|---|------|------|------|
| 6.1 | `pack add README.md` | path 등록 | 🤖 단위 + 🖐 |
| 6.2 | `handoff @bob "p" --with-pack` | pack attached, **파일 본문 없음** | 🖐 |
| 6.3 | `handoff @bob "e" --with-pack-embed` | `file bodies embedded` | 🤖 L-5 + 🖐 |
| 6.4 | bob `inbox` | **+N attachments** 표시 (0.13.2) | 🖐 |
| 6.5 | bob `inbox accept` | attachments에 summary/path/**file** 본문 | 🖐 |
| 6.6 | pack path를 allowlist 밖 경로로 오염 후 embed | 해당 파일 스킵 (TOCTOU) | 🤖 |
| 6.7 | 바이너리/거대 파일 | embed 스킵, handoff 실패하지 않음 | 🖐 선택 |

---

## UC-7 — 태스크 보드 (P1)

| # | 단계 | 기대 | 자동 |
|---|------|------|------|
| 7.1 | `board add "t1"` | task id 출력 | 🤖 + 🖐 |
| 7.2 | `board` | todo 그룹에 t1 | 🖐 |
| 7.3 | `board set task_… --status doing` | 상태 반영 | 🖐 |
| 7.4 | sticky `list_tasks` / desktop Board | CLI와 동일 room 파일 | 🤖 sticky board + 🖐 |
| 7.5 | `handoff … --board` | 태스크 생성 + handoff id 링크 | 🖐 |

---

## UC-8 — 보드 스냅샷 공유 (P2)

| # | 단계 | 기대 | 자동 |
|---|------|------|------|
| 8.1 | `board export > /tmp/b.json` | JSON 스냅샷 | 🤖 부분 + 🖐 |
| 8.2 | 다른 프로필/머신 `board import` | merge/replace 정책 준수 | 🖐 |
| 8.3 | `handoff … --with-board` | snapshot attachment | 🖐 |
| 8.4 | foreign roomId import | force 없으면 거부/안내 | 🤖 단위 |

---

## UC-9 — 에이전트 + MCP (P2)

**전제:** `claude` / `codex` / `grok` 중 설치분 (9.2–9.3만). MCP stdio(9.4–9.5)는 CLI 불필요.

| # | 단계 | 기대 | 자동 |
|---|------|------|------|
| 9.1 | `agents --matrix` | 표 출력 | 🤖 `smoke:uc` |
| 9.2 | `run shell` (최소) | 셸 기동, 세션 유지 | 🖐 (TUI) |
| 9.3 | `run claude` (설치 시) | MCP 설정, join 실패 시 **exit 1** (무음 금지 M-13) | 🖐 (TUI) |
| 9.4 | MCP `list_peers` / `handoff` / `check_handoffs` | 도구 응답 JSON | 🤖 `smoke:uc` (stdio) |
| 9.5 | `withPackEmbed: true` | pack file body 포함 | 🤖 `smoke:uc` (MCP handoff) |
| 9.6 | `--write-user-config` (Codex/Grok) | managed 블록 1개, 중복 테이블 없음 | 🤖 adapters + `smoke:uc` |

**스킵:** 해당 CLI 미설치 시 9.2–9.3만 ⏭ + 사유.  
**자동 게이트:** `bun run smoke:uc` 의 UC-9 블록 + `bun test packages/adapters`.

---

## UC-10 — LAN / 원격 relay (P2)

**전제:** 2 머신 또는 로컬에서 `0.0.0.0` + 토큰.

| # | 단계 | 기대 | 자동 |
|---|------|------|------|
| 10.1 | 토큰 없이 `LOOM_RELAY_HOST=0.0.0.0` relay | **기동 거부** (H-5) | 🤖 단위 |
| 10.2 | 토큰과 함께 relay | listen OK | 🖐 |
| 10.3 | B: `--relay ws://A:7842 --token … join` | join 성공 | 🖐 |
| 10.4 | B → A handoff | 수신 | 🖐 |
| 10.5 | Share 기본 | 토큰 **미포함** (`--show-token` 시에만) | 🖐 |
| 10.6 | `FABLE_RELAY_*` 만 설정 | 경고, 값 미사용 (0.10+) | 🤖 env.test |

---

## UC-11 — 회귀 묶음 (P0 자동화)

| # | 명령 | 기대 |
|---|------|------|
| 11.1 | `bun test` | 전부 pass (현재 ~140) |
| 11.2 | `bun run smoke:desktop` | status/peers/inbox/board/handoff/chat/401/stop |
| 11.3 | `bun run smoke:uc` | UC-0/1/3/5/6/7 + **UC-9** MCP (격리 홈) |
| 11.4 | (선택) `cd apps/desktop/src-tauri && cargo test` | Rust sticky path 단위 |

**릴리스 전:** 11.1 + 11.2 필수. **11.3 권장** (수동 UC-1/3/5/6 대체 가능).

---

## UC-12 — Launcher UX: up/down + auto-host (P1) · 제품 0.17

**대상:** 0.17 Launcher UX — `loom up`/`down` 멀티프로필 백그라운드 호스트, room create/join 시 auto-host, M-27 kill-safety, M-28 순차 처리.
**전제:** `~/.loom/profiles/` 에 세션 있는 프로필 ≥1 (없으면 `room create`/`join` 먼저). 격리는 §0.1 `LOOM_TEST_HOME` 권장.
**참조 구현:** `packages/cli/src/index.ts` (`cmdUp`/`cmdDown`/`autoHostAfterSession`), `packages/host/src/sticky-spawn.ts`·`sticky-meta.ts`.

### 12.A — auto-host on room create/join (기본 on)

| # | 단계 | 기대 | 자동 |
|---|------|------|------|
| 12.A1 | `bun run loom --profile alice room create --as alice --name demo` | invite 출력 + dim 줄 `host auto-started (pid <pid>); disable with --no-host or LOOM_NO_AUTO_HOST=1` | 🖐 |
| 12.A2 | `bun run loom --profile alice host status` | `sticky host: running`, pid/ipc/room 표시 | 🖐 |
| 12.A3 | `bun run loom --profile bob room join LOOM-… --as bob` | join 성공 + bob도 `host auto-started …` | 🖐 |
| 12.A4 | host 시작 실패 시 (예: 세션 이상) | create/join은 **중단되지 않음**; dim `host auto-start skipped: <error> — try …` (fail-soft, L-34) | 🖐 선택 |

### 12.B — auto-host opt-out (`--no-host` / env)

| # | 단계 | 기대 | 자동 |
|---|------|------|------|
| 12.B1 | `bun run loom --profile carol room create --as carol --name d2 --no-host` | invite 출력, **auto-host 메시지 없음** | 🖐 |
| 12.B2 | 12.B1 직후 `host status` | `sticky host: not running` | 🖐 |
| 12.B3 | `LOOM_NO_AUTO_HOST=1 bun run loom --profile dave room join LOOM-… --as dave` | join 성공, auto-host 메시지 없음 (env=`1`/`true`만 인정) | 🖐 |

### 12.C — `loom up` (멀티프로필 일괄 기동, M-28 순차)

| # | 단계 | 기대 | 자동 |
|---|------|------|------|
| 12.C1 | 세션 프로필 없이 `bun run loom up` | exit 1 + `loom up: no profiles with a session under ~/.loom/profiles/.` + create/join 안내 | 🖐 |
| 12.C2 | `bun run loom up` (세션 프로필 존재) | 헤더 `loom up — sticky hosts:` + 프로필별 `online`/`already` + pid + `<displayName> @ <roomName>` | 🖐 |
| 12.C3 | 12.C2 출력 하단 | 푸터 `Peers stay online in the background (closing the terminal is OK).` + Send/Process/Stop 안내 | 🖐 |
| 12.C4 | `bun run loom up --profiles alice,bob` | alice·bob만 대상 | 🖐 |
| 12.C5 | 이미 online인 상태에서 재 `up` | 해당 프로필 `already   pid <pid>` (에러 아님, 멱등) | 🖐 |
| 12.C6 | 세션 없는 프로필이 섞임 | 그 프로필은 `skipped  (no session)` | 🖐 선택 |

### 12.D — `loom up --status` (기동 없이 조회)

| # | 단계 | 기대 | 자동 |
|---|------|------|------|
| 12.D1 | `bun run loom up --status` | 헤더 `loom up --status:` + 프로필별 `online   pid <pid>  <displayName> @ <roomName>` 또는 `offline`; **새 호스트 스폰 안 함** | 🖐 |
| 12.D2 | 프로필 전무 시 | `loom up --status: no profiles found.` | 🖐 선택 |

### 12.E — `loom down` (정지)

| # | 단계 | 기대 | 자동 |
|---|------|------|------|
| 12.E1 | `bun run loom down` | 헤더 `loom down — stopping sticky hosts:` + 프로필별 `sticky host stopping` (RPC ok) | 🖐 |
| 12.E2 | 12.E1 직후 `loom up --status` | 대상 프로필 전부 `offline` | 🖐 |
| 12.E3 | `bun run loom down --profiles alice` | alice만 정지, 나머지 유지 | 🖐 |
| 12.E4 | 호스트 없는 상태 재 `down` | 프로필별 `no sticky host running` (에러 아님) | 🖐 |

### 12.F — M-27 kill-safety (pid 재활용 방어)

| # | 단계 | 기대 | 자동 |
|---|------|------|------|
| 12.F1 | 정상 `down` 시 종료 경로 | RPC stop → 미종료 시에만 SIGTERM; **SIGTERM 전 `ps -o command=`에 `sticky-main.ts` 포함 확인** (`pidLooksLikeStickyHost`) | 🤖 단위 (sticky-meta) |
| 12.F2 | meta.pid가 무관 프로세스로 재활용된 경우 | **kill 안 함**; meta만 정리 + `sticky host meta cleared; pid <pid> did not verify as our sticky host — NOT killed (M-27)` | 🤖 단위 / 🖐 재현 난이도 높음(선택) |

### 12.G — 세션 변경 시 기존 호스트 자동 정지 (F-2)

| # | 단계 | 기대 | 자동 |
|---|------|------|------|
| 12.G1 | 호스트 살아있는 프로필로 다시 `room create`/`join` | stderr `Stopped sticky host (room session changing — run bun run loom host start again)` 후 새 세션 저장 (+ auto-host 재기동, 단 `--no-host` 아니면) | 🖐 |

### 12.H — dogfood:up 엔드투엔드 (5 프로필)

| # | 단계 | 기대 | 자동 |
|---|------|------|------|
| 12.H1 | `bun run dogfood:room` | room `loom-dev` 생성/재조인, 5 프로필 join (`impl`/`claude-impl`/`codex-impl`/`claude-rev`/`codex-rev`), `.loom/dogfood-room.env` 기록 | 🖐 |
| 12.H2 | `bun run dogfood:up` | 내부: room-up(`LOOM_NO_AUTO_HOST=1`) → `loom up --profiles impl,claude-impl,codex-impl,claude-rev,codex-rev` (M-28 순차) → 5 호스트 online | 🖐 |
| 12.H3 | `bun run dogfood:up --status` | 5 프로필 online/offline + pid | 🖐 |
| 12.H4 | 정지 | `bun run loom down --profiles impl,claude-impl,codex-impl,claude-rev,codex-rev` → 전부 stopping (**`dogfood:down` 스크립트는 없음**) | 🖐 |

### 12.I — 불변식 (횡단 확인)

| # | 검사 | 기대 |
|---|------|------|
| 12.I1 | meta 파일 권한 | `~/.loom/profiles/<name>.host.json` 존재, 퍼미션 **0600** |
| 12.I2 | 백그라운드 유지 | `up` 후 터미널 닫아도 peer online 유지 (detached/unref) |

**통과 기준:** 12.A1–A3, 12.C2–C3, 12.D1, 12.E1–E2, 12.H2 ✅. (12.F2·12.A4는 선택/재현 난이도)
**관련 자동:** `sticky-host.integration`, `sticky-meta` 단위(M-27), `smoke:desktop`(RPC).
**공백(자동화 미비):** `up`/`down`/`--status`/auto-host 전용 스모크 없음 — 대부분 수동. → `smoke:uc`에 UC-12 블록 추가 검토(후속).

---

## 보안·불변식 스모크 (횡단, P1)

사용 사례에 걸쳐 매번 의식할 항목.

| ID | 검사 | 방법 |
|----|------|------|
| S1 | peer 문자열 sanitize (ESC 등) | handoff body에 CSI 넣고 터미널 깨짐 없음 |
| S2 | desktop XSS | Send body `<img onerror=alert(1)>` → 텍스트만 |
| S3 | sticky token | webview/Network에 Bearer 없음; meta 0600 |
| S4 | non-loopback open bind | UC-10.1 |
| S5 | peerSecret rejoin | 잘못된 secret → auth fail (통합 테스트) |
| S6 | pack embed allowlist | UC-6.6 |

---

## 실행 기록 템플릿

```markdown
## Test run
- Date:
- Tester:
- Build: git SHA / loom --version
- LOOM_TEST_HOME: (if any)

| UC | Result | Notes |
|----|--------|-------|
| 0 | | |
| 1 | | |
| 2 | | |
| 3 | | |
| 4 | | |
| 6 | | |
| 7 | | |
| 11 | | |

Blockers:
-
```

---

## 실행 기록 (실제)

### Test run — 2026-07-10 (P0 release gate)

| Field | Value |
|-------|--------|
| **Date** | 2026-07-10 |
| **Tester** | agent (session after 0.13.3) |
| **Build** | `dee900a` · `loom v0.13.3` |
| **LOOM_TEST_HOME** | `/tmp/loom-tp-1783650607` |
| **Automations** | `bun test` 139 pass · `smoke:desktop` OK |

| UC | Result | Notes |
|----|--------|-------|
| 0 | ✅ 🖐 | `bun run loom --version` → 0.13.3; `loom --version` (link); `scripts/loom` on PATH |
| 1 | ✅ 🖐 | create Share=`bun run loom…`; bob join 2 peers; handoff queued; inbox `from: bob (p_…)`; accept HANDOFF block; re-accept → `No inbox item` (first-wins) |
| 2 | ⏭ | offline enqueue covered by 🤖 room tests; full manual offline not re-run this pass |
| 3 | ✅ 🖐 | host start tip + same `--profile`; handoff `notified=true` + inbox `(via sticky host)`; stop w/o profile → tip; stop w/ profile OK; re-start → already running |
| 4 | ⏭ | GUI not opened; RPC covered by smoke:desktop |
| 11 | ✅ 🤖 | 139 pass, 0 fail · smoke OK (status/peers/inbox/board/handoff/chat/401/stop) |

**Blockers:** none  
**P0 release gate (TEST_PLAN §0.4):** 11.1 + 11.2 + UC-1 + UC-3 → **pass**

### Test run — 2026-07-10 (`smoke:uc` automated)

| Field | Value |
|-------|--------|
| **Command** | `bun run smoke:uc` |
| **Build** | loom **0.13.5** |
| **Covered** | UC-0,1,3,5,6,7 + UC-9.1/4/5/6 (isolated `LOOM_TEST_HOME`) |
| **Result** | **smoke-uc OK** (all checks; UC-9 MCP added) |

Not covered by smoke:uc: UC-4 GUI, UC-8 snapshot multi-machine, UC-9.2/9.3 agent TUI (`run shell|claude`), UC-10 LAN 2-machine, UC-5.4 slash.

### Test run — 2026-07-10 (P2 durable / docs honesty)

| Field | Value |
|-------|--------|
| **Date** | 2026-07-10 |
| **Build** | loom **0.14.2** · `8302ae9`+ |
| **Automations** | `bun test` 154 pass · `smoke:uc` OK · `smoke:durable` OK |

| UC | Result | Notes |
|----|--------|-------|
| 2.4–2.6 | ✅ 🤖 | persist tests + `bun run smoke:durable` — inbox/secret survive restart; claim/leave durable |
| Docs | ✅ | USER_GUIDE / PRIORITIES / README / TEST_PLAN MVP-loss language removed |

### Test run — 2026-07-10 (UC-5 / UC-9 manual + MCP live)

| Field | Value |
|-------|--------|
| **Date** | 2026-07-10 |
| **Tester** | Owner (dogfood) + Claude session (MCP live calls) |
| **Build** | loom **0.13.11–0.13.12** · room `uc5-demo` / `LOOM-VAD2` · profile **alice** |
| **Automations** | `smoke:uc` (prior) · MCP tools exercised inside Claude |

| UC | Result | Notes |
|----|--------|-------|
| 5 | ✅ 🖐 | peers / chat / listen handoff (earlier session) |
| 6 | ✅ 🖐+🤖 | pack + embed; smoke:uc + prior manual |
| 9.1 | ✅ 🤖 | `agents --matrix` |
| 9.2 | ✅ 🖐 | `run shell` → `loom-shell>` (fd I/O, **0.13.11**); peers + exit |
| 9.3 | ✅ 🖐 | **MCP 11 tools live** + **`loom run claude` launcher OK** (0.13.12 script PTY; Owner confirmed) |
| 9.4–9.6 | ✅ 🤖 | smoke:uc + adapters |
| claim_handoff | ⏭ | alice inbox empty at test time; handoff went to **bob** offline queue (`ho_4ad2ab5c…`) |
| withPackEmbed (live MCP) | ⏭ | covered by smoke:uc 9.5; not re-hit in this Claude write pass |

#### UC-9.3 MCP live tool results (Claude → loom MCP)

Room: **uc5-demo** · peer: **alice** (online) · **bob** offline.

| Tool | Result | Notes |
|------|--------|-------|
| `list_peers` | ✅ | bob offline, alice online |
| `list_tasks` | ✅ | empty then after add |
| `check_handoffs` | ✅ | empty for alice |
| `get_context_pack` | ✅ | existing "UC6 pack test" |
| `export_board` | ✅ | JSON snapshot |
| `add_task` | ✅ | `task_50889fe91c90d9db` |
| `update_task` | ✅ | todo→doing, assignee alice; later cancelled (cleanup) |
| `handoff` | ✅ | to @bob offline → `queued`, `notified: false` |
| `room_chat` | ✅ | `{ok: true}` |
| `import_board` | ✅ | merge idempotent (same ids) |
| `claim_handoff` | ⏭ | no alice inbox item to claim |

**Blockers:** none.  
**Launcher:** pre-0.13.12 Bun→Bun Claude stdio inherit crashed (`EINVAL kqueue`). **0.13.12** `script` PTY — **Owner confirmed `loom run claude` works** (2026-07-10).

---

## 알려진 한계 (실패로 치지 않음)

| 항목 | 설명 |
|------|------|
| Relay 재시작 | **0.14+ durable** (default). `LOOM_RELAY_EPHEMERAL=1` 이면 유실 (의도) |
| Room disk GC | leave peer 제거; 빈 room 파일 잔존 가능 (L-29) |
| 보드 multi-machine live | 스냅샷만 (CRDT 없음) — P3 |
| 전역 `loom` PATH | 기본 미설치 — `bun run loom` 또는 `bun run link:loom` (0.13.3) |
| PTY inject | 제품 비목표 (스파이크 no-go) |
| Bun TTY / `loom run claude` | kqueue **0.13.12**; resize **0.13.14** (python pty + winsize poll) — Owner confirmed OK |

---

## 문서 관계

| 문서 | 역할 |
|------|------|
| [USER_GUIDE.md](./USER_GUIDE.md) | **어떻게 쓰는지** (튜토리얼) |
| **TEST_PLAN.md** (이 문서) | **어떻게 검증하는지** (체크리스트) |
| [PLAN.md](./PLAN.md) | 기능 계획 SSOT |
| `bun test` / `smoke:desktop` | 자동 회귀 |

---

*기준 버전: 제품 **0.13.12**. UC 번호는 USER_GUIDE와 동기. 기능 추가 시 이 표에 행을 추가한다.*
