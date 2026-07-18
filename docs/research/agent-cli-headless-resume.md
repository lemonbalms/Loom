# Research: agent CLI headless 세션 재개 지원 현황

> Ticket: [lemonbalms/Loom#4](https://github.com/lemonbalms/Loom/issues/4) (part of #1)
> 질문: 주요 agent CLI들이 **headless 모드에서 세션 재개**를 지원하는가 — herdr가 장수명(long-lived) 워커를 지원하지 못할 경우의 대안 경로.
> 조사일: 2026-07-18 · 방법론: mattpocock `research` 스킬 (고신뢰 1차 소스 + 로컬 실검증)

## TL;DR

세 CLI **모두 headless 세션 재개를 지원**한다. 따라서 herdr가 장수명 워커를 못 굴려도,
"1턴짜리 headless 프로세스를 매번 새로 띄우되 이전 세션 ID로 재개(resume)"하는 stateless-orchestration
패턴이 세 벤더 모두에서 실현 가능하다. 세 CLI 모두 로컬 트랜스크립트를 디스크에 남기고, 재개 시 전체
맥락을 복원하며, 실측 스모크에서 재개 세션이 이전 턴의 사실(codeword)을 정확히 회상했다.

| CLI | headless 실행 | 세션 재개 플래그 | 재개가 headless와 결합? | 세션 ID 지정/보존 | 실측 |
|-----|--------------|-----------------|------------------------|------------------|------|
| **Claude Code** 2.1.212 | `claude -p` | `-r/--resume <id\|name>`, `-c/--continue` | **예** | `--session-id <uuid>`로 지정, 재개 시 동일 ID 유지, `--fork-session`으로 분기 | ✅ codeword 회상, ID 유지 |
| **Codex CLI** 0.144.1 | `codex exec` | `codex exec resume <id>` / `resume --last` | **예** (`exec`의 하위 명령) | UUID 또는 thread 이름으로 지정, `--last`로 최근 | ✅ codeword 회상 |
| **Grok CLI** 0.2.102 | `grok -p` / `grok agent headless` | `-r/--resume [id]`, `-c/--continue` | **예** | `--session-id <uuid>`(신규 대화), 재개 시 동일 ID 유지, `--fork-session` | ✅ codeword 회상, ID 유지 |

---

## 1. Claude Code

**버전(로컬):** `claude 2.1.212 (Claude Code)` — `which claude` → `~/.local/bin/claude`

### 지원 여부: 예 — headless + resume 완전 결합

- `-p/--print`는 비대화형(headless) 실행. 공식 문서: "Add the `-p` (or `--print`) flag to any `claude`
  command to run it non-interactively. **All CLI options work with `-p`**"
  ([Run Claude Code programmatically](https://code.claude.com/docs/en/headless)).
- `-r/--resume [value]` — "Resume a conversation by session ID, or open interactive picker" (`claude --help`).
  값을 주면 headless에서도 특정 세션을 직접 재개한다.
- `--session-id <uuid>` — "Use a specific session ID for the conversation (must be a valid UUID)"
  (`claude --help`). 오케스트레이터가 세션 ID를 **미리 정해** 새 세션을 시작할 수 있어, 워커/작업 ID와
  1:1 상관(correlate)이 가능하다.
- `-c/--continue` — 현재 디렉터리의 가장 최근 대화를 이어감.
- `--fork-session` — 재개 시 원본을 보존하고 새 세션 ID로 분기 (`--resume`/`--continue`와 함께).
- `--no-session-persistence` — "sessions will not be saved to disk and cannot be resumed (only works
  with --print)". 재개를 원하면 이 플래그를 **쓰지 말 것**.

공식 문서 발췌 ([headless](https://code.claude.com/docs/en/headless)):
```bash
session_id=$(claude -p "Start a review" --output-format json | jq -r '.session_id')
claude -p "Continue that review" --resume "$session_id"
```

### 맥락 보존 수준

- 세션은 로컬 트랜스크립트 파일(`~/.claude/projects/<path-hash>/`)에 **연속 저장**되며, 재개 시 전체
  트랜스크립트를 복원한다 ([Manage sessions](https://code.claude.com/docs/en/sessions)).
- `claude -p`(및 Agent SDK)로 만든 세션은 **대화형 picker에는 안 뜨지만**, 세션 ID를 명시하면 그대로
  재개된다 (동 문서). 오케스트레이션 용도에는 오히려 잘 맞음.

### 제약

1. **디렉터리 스코프:** 세션 ID 조회는 "현재 프로젝트 디렉터리와 그 git worktree"로 한정된다. 다른
   디렉터리에서 만든 세션은 `No conversation found with session ID: <id>`로 실패
   ([sessions](https://code.claude.com/docs/en/sessions)). → **재개는 생성과 동일 cwd에서 실행**해야 함.
2. **worktree 경로 해석 버그(과거):** v2.1.90에서 picker가 `-p`/SDK 세션을 숨기도록 바뀌었고, worktree의
   `.git` 파일 경로 해석 차이로 `--resume`이 세션을 못 찾는 사례 보고
   ([anthropics/claude-code#42905](https://github.com/anthropics/claude-code/issues/42905)). 명시적 ID
   재개는 정상. v2.1.170에서 관련 트랜스크립트 영속화 버그 수정.
3. **과거 print-mode 재개 버그(수정됨):** `claude -p -r <id>`가 새 세션 복사본을 만들던
   [#1967](https://github.com/anthropics/claude-code/issues/1967)은 수정됨. **본 조사 실측에서는 재개 후
   세션 ID가 그대로 유지됨**(아래).

### 실측 (본 조사, 2026-07-18, v2.1.212)

```
$ claude -p "The codeword is BANANA47. Just reply: stored." --output-format json → session_id=af4b9dae-…
$ claude -p --resume af4b9dae-… "What is the codeword?" --output-format json
  result   = BANANA47          ← 이전 턴 맥락 복원 확인
  session_id = af4b9dae-…      ← 동일 ID 유지 (fork 없음)
```

---

## 2. Codex CLI

**버전(로컬):** `codex-cli 0.144.1` — `which codex` → `/opt/homebrew/bin/codex`

### 지원 여부: 예 — `codex exec resume`

- `codex exec` — "Run Codex non-interactively" (headless). alias `codex e`.
- `codex exec resume [SESSION_ID] [PROMPT]` — "Resume a previous session by id or pick the most recent
  with `--last`" (`codex exec resume --help`). 재개가 **exec의 하위 명령**으로 정식 존재한다.
  - `[SESSION_ID]`: "Conversation/session id (UUID) or thread name. UUIDs take precedence."
  - `--last`: "Resume the most recent recorded session (newest) without specifying an id"
  - `--all`: "Show all sessions (disables cwd filtering)"
- (참고) 최상위 `codex resume` / `codex fork`는 **대화형** 세션 재개/분기용. headless 경로는 `codex exec resume`.

### 맥락 보존 수준

- 세션 파일이 `$CODEX_HOME`(기본 `~/.codex/`)에 기록되고, 재개 시 이전 대화 맥락을 복원한다. 실측에서
  이전 턴의 codeword를 정확히 회상.
- `--output-schema <FILE>` / `--json` / `-o/--output-last-message <FILE>`로 재개 결과를 구조화 캡처 가능.

### 제약

1. **cwd 필터링:** resume는 기본적으로 현재 디렉터리 세션만 대상으로 함. 다른 cwd 세션까지 보려면
   `--all` 필요.
2. **`--ephemeral`:** "Run without persisting session files to disk" — 이 플래그로 실행한 세션은 **재개
   불가**. 재개가 필요하면 쓰지 말 것.
3. **resume 하위 명령의 플래그 집합이 다름:** `codex exec`의 `-s/--sandbox`는 `codex exec resume`에는
   없다. resume에 `-s read-only`를 붙이면 파싱 에러(`-s`가 SESSION_ID 위치 인자로 해석됨). 샌드박스/승인
   정책은 세션·config에서 상속하거나 `-c` 오버라이드로 지정.
4. **세션 ID 사전 지정 불가:** Claude/Grok의 `--session-id`에 해당하는 "새 대화에 UUID를 미리 박는"
   옵션은 `codex exec`에 없다. 세션 ID는 실행 후 부여됨 → 재개하려면 첫 실행의 ID를 캡처하거나 `--last`
   사용.

### 실측 (본 조사, 2026-07-18, v0.144.1)

```
$ codex exec --skip-git-repo-check -s read-only "The codeword is MANGO88. Reply: stored." → "stored."
$ codex exec resume --last --skip-git-repo-check "What is the codeword? Reply only the word."
  → MANGO88          ← 이전 턴 맥락 복원 확인
```

---

## 3. Grok CLI

**버전(로컬):** `grok 0.2.102 (ab5ebf69acec) [stable]` — `which grok` → `~/.grok/bin/grok`

### 지원 여부: 예 — 두 갈래 headless 경로 모두 재개 지원

- **단발 headless:** `-p/--single <PROMPT>` — "Single-turn prompt. Prints the response to stdout and
  exits" (`grok --help`). `--output-format [plain|json|streaming-json]`.
- **장수명 headless:** `grok agent headless` — "Run the agent headlessly over the Grok WebSocket relay",
  `grok agent stdio` — "Run the agent over stdio", `grok agent serve` — "Run the agent as a WebSocket
  server" (`grok agent --help`). **herdr 대체용 장수명 워커에 가장 근접한 경로.**
- **재개 플래그(최상위, `-p`와 결합):**
  - `-r/--resume [SESSION_ID]` — "Resume a session by ID, or the most recent if omitted"
  - `-c/--continue` — "Continue the most recent session for the current working directory"
  - `--session-id <uuid>` — "Use a specific session UUID for a **new** conversation … With
    `--resume`/`--continue`, only valid together with `--fork-session`". 즉 Claude처럼 새 대화에 UUID를
    미리 지정 가능.
  - `--fork-session` — 재개 시 원본 보존하고 새 ID로 분기.
  - `--restore-code` — "Check out the original session's commit when resuming" (재개 시 코드 상태까지 복원).
- **세션 관리:** `grok sessions list|search|delete`, `grok export`(트랜스크립트 Markdown 내보내기),
  `--experimental-memory`(교차 세션 메모리, 재개와 별개 축).

### 맥락 보존 수준

- 세션 트랜스크립트가 로컬(`~/.grok/`)에 저장되고 재개 시 복원. 실측 JSON 응답의 `sessionId`가 재개 후
  동일하게 유지됨 → fork 없이 같은 세션을 이어감.
- JSON 출력 스키마: `{ text, stopReason, sessionId, requestId, thought, usage }`. `sessionId`로 재개
  대상 캡처, `text`가 응답 본문.

### 제약

1. **`--session-id` 의미가 재개용이 아님:** `--session-id`는 "**새** 대화용 UUID"다. 기존 세션을 재개할
   때는 `--resume`/`--continue`를 써야 하며, `--session-id`는 `--fork-session`과 함께일 때만(=분기 세션의
   이름 지정) 유효.
2. **cwd 스코프:** `--continue`는 "현재 작업 디렉터리"의 최근 세션을 이어감 → 재개는 동일 cwd 권장.
3. **장수명 relay 경로(`grok agent headless/serve`)는 WebSocket relay/서버 아키텍처**로, 단순 `-p` 재개와
   운영 모델이 다르다. herdr 대체로 이 경로를 택하면 relay 연결·인증(`--grok-ws-url`, `--reauth`) 관리가
   추가된다.

### 실측 (본 조사, 2026-07-18, v0.2.102)

```
$ grok -p "The codeword is KIWI55. Reply: stored." --output-format json → sessionId=019f7285-…, text="stored."
$ grok --resume 019f7285-… -p "What is the codeword? Reply only the word." --output-format json
  text      = KIWI55           ← 이전 턴 맥락 복원 확인
  sessionId = 019f7285-…       ← 동일 ID 유지
```

---

## Loom/herdr 관점 함의

- **대안 경로 성립.** herdr가 장수명 프로세스를 못 굴려도, 세 CLI 모두 "매 작업마다 headless 프로세스를
  새로 띄우되 세션 ID로 재개"하는 **stateless-relaunch + resume** 패턴으로 맥락을 이어갈 수 있다. 워커는
  프로세스로 장수(long-lived)일 필요 없이 **세션 ID로 장수**할 수 있다.
- **세션 ID 사전 지정:** Claude(`--session-id`)와 Grok(`--session-id` for new)은 오케스트레이터가 UUID를
  미리 정해 작업/워커 ID와 1:1로 묶을 수 있다. Codex는 사후 캡처(첫 실행 ID 저장 또는 `--last`)로 처리.
- **공통 제약 — cwd 스코프:** 세 CLI 모두 재개 조회가 생성 시 cwd(및 worktree)에 묶인다. 오케스트레이터는
  워커별 작업 디렉터리를 **고정·기록**해야 재개가 안정적이다.
- **영속화 옵트아웃 주의:** Claude `--no-session-persistence`, Codex `--ephemeral`은 재개를 불가능하게
  하므로 장수명 대체 경로에서는 피한다.
- **진짜 장수명이 필요하면 Grok의 `agent serve`/`agent headless`(WebSocket relay)** 가 가장 근접하지만,
  relay 인증·연결 수명 관리 비용이 추가된다. 반면 Claude/Codex는 relaunch+resume이 사실상 유일하고 단순한
  headless 장수 경로다.

## 1차 소스

- 로컬 CLI (`--help` / 하위 명령 `--help`), 2026-07-18 실행:
  - `claude 2.1.212` — `claude --help`
  - `codex-cli 0.144.1` — `codex --help`, `codex exec --help`, `codex exec resume --help`
  - `grok 0.2.102` — `grok --help`, `grok agent --help`, `grok agent headless --help`, `grok sessions --help`
- 실측 스모크 테스트 (본 조사 직접 실행): BANANA47 / MANGO88 / KIWI55 codeword 회상.
- Claude Code 공식 문서:
  - <https://code.claude.com/docs/en/headless>
  - <https://code.claude.com/docs/en/sessions>
  - <https://code.claude.com/docs/en/cli-reference>
- 참고 이슈(버그 이력, 수정 확인용):
  - <https://github.com/anthropics/claude-code/issues/1967> (print-mode 재개 버그, 수정됨)
  - <https://github.com/anthropics/claude-code/issues/42905> (worktree/`-p` picker 스코프)
