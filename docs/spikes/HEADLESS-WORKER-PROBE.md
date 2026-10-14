# Headless worker probe — claude · codex · grok 비대화형 실측 (Loom 0.30.0 근거)

| Field | Value |
|---|---|
| **Date** | 2026-10-15 |
| **Host** | 오너 Mac (darwin 25.6) · Bun 1.3.11 |
| **CLI versions** | `claude` **2.1.300** · `codex-cli` **0.162.1** · `grok` **1.0.54 (alpha)** |
| **Repo base** | `main` `ac08670` (v0.29.0 shipped) |
| **Raw outputs** | 스크래치 디렉터리(세션 로컬) — **커밋하지 않는다**. 이 문서는 필드·판정만 옮긴다 |
| **Consumer** | `docs/PLAN.md` §0.30.0 (D1~D15 근거) · `docs/UNKNOWNS.md` 0.30.0 |
| **Verdict** | 세 CLI 모두 **비대화형 실행 · 구조화 출력 · 세션 재개**가 성립. 거부된 도구는 **멈추지 않고(no hang)** exit 0 + 설명 메시지로 끝난다. 헤드리스 워커 경로(0.30.0) 착수 가능 |

**권위:** 이 문서는 **실측 기록**이다. 설계 결정은 PLAN §0.30.0 D1~D15가 정본이며 여기서 재결정하지 않는다.

---

## 0. 선행 연구 (재측정하지 않은 것)

브랜치 `research/agent-cli-headless-resume` `b510c60` — `docs/research/agent-cli-headless-resume.md`(2026-07-18):

| 명제 | 출처 |
|---|---|
| 세 CLI 모두 headless 재개 지원(codeword 회상 스모크) | b510c60 실측 |
| 재개 조회는 **cwd 귀속** — 다른 cwd에서는 세션을 못 찾는다 | b510c60 실측 |
| codex는 세션 id를 **캡처해야** 재개 가능(`--last` 의존 금지) | b510c60 |
| `--no-session-persistence`(claude) · `--ephemeral`(codex)은 **재개를 깨뜨린다** | b510c60 |
| `codex exec resume`에는 `-s/--sandbox`가 없다 | b510c60 · 2026-10-15 `--help` 재확인(아래 §5) |

2026-10-15 본 측정은 위를 **현 버전으로 재확인**하고, 0.30.0 설계에 필요한 UK-1(출력 필드)·UK-2(거부 도구)·UK-3(자식 프로세스 생존)을 새로 잰다.

---

## 1. UK-1 — 구조화 출력 필드 (파서 계약의 근거)

### 1.1 claude `-p --output-format json` (단일 결과)

| 필드 | 의미 | 비고 |
|---|---|---|
| `.session_id` | 세션 id | `--session-id <uuid>`를 **그대로 존중** · `-r <id>` 재개 시 **같은 id 유지** |
| `.result` | 최종 텍스트 | 완료 판정 입력 |
| `.is_error` | 오류 여부 | 거부 도구만으로는 `false`(§2) |
| `.subtype` · `.stop_reason` · `.terminal_reason` | 종료 분류 | |
| `.usage` · `.total_cost_usd` | 사용량 | |
| `.permission_denials[]` | 거부된 도구 호출 | `{tool_name, tool_input}` — **구조화 거부 신호가 있는 유일한 CLI** |

### 1.2 claude `-p --output-format stream-json --verbose` (이벤트 스트림)

| 이벤트 | 내용 |
|---|---|
| `system` (`hook_started` / `hook_response`) × N | **오너 전역 훅이 헤드리스 워커 안에서도 실행된다**(이번 측정 5건) — UK(훅 상속 vs 격리) |
| `system` `init` | `session_id` 포함 |
| `thinking_tokens` | |
| `assistant` | `thinking` / `text` 블록 |
| `rate_limit_event` | |
| `result` | 최종 텍스트 · `is_error` · `usage` · `session_id` — **완료 판정 = 이 이벤트 + 프로세스 종료** |

### 1.3 codex `exec --json`

| 이벤트 | 필드 |
|---|---|
| `thread.started` | `.thread_id` — **세션 id(재개 키). 캡처 필수** |
| `turn.started` | |
| `item.started` / `item.completed` | `.item.type` = `agent_message`(`.item.text`) · `command_execution`(`.command` · `.aggregated_output` · `.exit_code`) |
| `turn.completed` | `.usage` |
| (`-o <file>`) | 마지막 메시지를 파일로 기록 |

- stderr에 **`Reading additional input from stdin...`** 를 찍는다 → **stdin을 닫지 않으면 대기**한다. 프롬프트를 stdin으로 넣고 **즉시 close**해야 한다.

### 1.4 grok `--output-format json` / `streaming-json`

| 형식 | 필드 / 이벤트 |
|---|---|
| `json` | `.sessionId` · `.text` · `.stopReason` · `.usage` · `.total_cost_usd` · `.cwd` · `.num_turns` |
| `streaming-json` | `available_commands` · `thought`(`.data`) · `text`(`.data` 청크) · `usage` · **`end`**(`sessionId` · `stopReason` · `usage` …) |

- **`sessionId`는 `end` 이벤트에만 있다** — 중간 종료 시 세션 id를 스트림에서 못 얻을 수 있으므로 **`--session-id <uuid>`로 사전 지정**해야 재개가 보장된다.
- 지연: 호출당 **11–38s**(시스템 프롬프트 ~27k 토큰). alpha.

### 1.5 재개 스모크

| CLI | 재개 형식 | codeword 회상 |
|---|---|---|
| claude | `-r <session_id>` | ✓ |
| codex | `exec resume <thread_id> --json …` | ✓ |
| grok | `-r <sessionId>` | ✓ |

---

## 2. UK-2 — 거부된 도구의 비대화형 동작

**공통 결론:** 세 CLI 모두 **멈추지 않는다(no hang)**. 거부 후 모델이 우회하거나 설명하고 **exit 0 + 설명 최종 메시지**로 끝난다. 즉 deny-by-default는 **"성능 저하(degrade)"이지 "교착(hang)"이 아니다**.

| CLI · 설정 | 시도 | 결과 | 구조화 신호 |
|---|---|---|---|
| claude `--permission-mode acceptEdits --allowedTools Read` | `ls` | **자동 허용** | — |
| 〃 | `touch` | **자동 허용** — acceptEdits는 **파일시스템 명령을 자동 허용**한다(allowedTools 밖이어도) | — |
| 〃 | `python3 -c …` | **거부** | `.permission_denials[0] = {tool_name:"Bash", tool_input.command}` · `is_error:false` |
| codex `--sandbox read-only -c approval_policy=never` | 읽기 | 허용 | — |
| 〃 | `touch` | `command_execution` **exit_code 1** "Operation not permitted" | 실패한 `command_execution` 항목 |
| 〃 (`approval_policy` 미지정) | `touch` | 동일 — **프롬프트 없음** | 〃 |
| grok `--permission-mode acceptEdits --deny Bash` | 셸 | 문법 수용 · 셸 차단 · 모델이 **파일 도구로 우회** | **없음**(텍스트로만 드러남) |

**양성 대조(a.txt에 한 줄 append):**

| CLI · 설정 | 결과 |
|---|---|
| claude `acceptEdits` | ✓ 프롬프트 없음 |
| codex `--sandbox workspace-write` | ✓ 프롬프트 없음 |
| grok `acceptEdits` | ✓ 프롬프트 없음 |

**함의:**
- claude `acceptEdits`의 자동 허용 범위가 `allowedTools`보다 넓다 → **deny 목록(`--disallowedTools`)이 실질 방어선**이다. 자동 허용 집합의 정확한 경계(`rm` 포함 여부 등)는 **미측정** — PLAN UNKNOWNS의 차단 항목.
- 거부 가시성은 claude(구조화) > codex(실패 항목) > grok(텍스트) 순. 결과 요약의 "denials" 표기는 CLI별로 정밀도가 다르다.

---

## 3. UK-3 — 자식 프로세스 생존 (Bun 1.3.11)

| 시나리오 | 자식 | 결과 |
|---|---|---|
| 부모 pid에 SIGTERM | 기본 spawn | **생존** |
| 부모 pid에 SIGTERM | `detached` | **생존** |
| 부모 **프로세스 그룹**에 SIGTERM | 기본 spawn(같은 pgid) | **사망** |
| 부모 프로세스 그룹에 SIGTERM | `detached`(자기 pgid) | **생존** — 그룹 kill을 벗어난다 |

- **Bun은 SIGTERM을 자식에게 전달하지 않는다.**
- 함의: 워커를 `detached`로 띄우면 ① 브릿지 종료(단일 pid 또는 그룹 kill)에 **휩쓸리지 않고** ② 워커 자신의 pgid로 **타임아웃 시 워커 트리 전체를 그룹 kill**할 수 있다. 대가는 **브릿지가 죽어도 워커가 남는다**는 것 — 재기동 시 **입양(adopt)** 이 필요하다(PLAN D6·D7).

---

## 4. 코드 사실 (main `ac08670` 대조)

| 사실 | 위치 |
|---|---|
| 워커 로직 전부가 `startBridgeRuntime` 클로저 안 — 3155줄 중 :662–3154, herdr 호출 지점 48곳 | `packages/host/src/bridge-runtime.ts` |
| `Flight`는 **paneId 키** | `bridge-runtime.ts:391–451` 타입 · `:704` `flights` Map |
| Flight 완료 소유권 CAS | `:2356–2390` |
| 카드 실행 진입 `runCard` | `:1389–1599` |
| `proposeCardVerification` — 항상 `status:"failed"` · `reason:"needs_verification"` | `:2824–2888` |
| `finishCardFailure` · `sendFailedResult` · `sendResult`(엄격 ACK + quarantine) | `:2895–2951` · `:2953–2996` · `:3016–3113` |
| 결과 출력은 `truncateTail(stripTuiChrome(…), 200_000)` — 꼬리 보존 | `:2850` · `:2919` |
| 카드별 벽시계 타임아웃 **없음** · 스폰은 직렬화, flight 수 **무제한** · `POOL_MAX_WORKERS=4`는 **탭당 pane 수**일 뿐 | `:753` · `:1298` |
| `CardDispatchPayload.cwd`는 스키마에 있으나 `dispatchCard`/`dispatch_card`가 **채우지 않는다** → pane은 herdr 기본 cwd. cwd는 **무검증 전달** | `packages/protocol/src/card-contract.ts:23–30` · `packages/host/src/card-ops.ts`(cwd 0건) · `bridge-runtime.ts:1501` |
| 워커는 MCP 설정·권한 설정을 받지 않는다. env는 `LOOM_CARD` · `LOOM_HOOK_SOCK` · `LOOM_CONV`뿐 | `bridge-runtime.ts:1496–1498` · `:1825` |
| 어댑터 `loomSystemHint`는 `AGENT_HINT.txt`로만 가며 **아무도 읽지 않는다** | `packages/adapters/src/hints.ts:2–31` · `packages/mcp-server/src/config.ts:35–55` · `packages/cli/src/index.ts:2546` |
| `cardSeq`는 인메모리 · 결과 issuer(`ResultIssuerRegistry`)도 인메모리 — (cardId, dispatchHandoffId)당 `initial` 1회 | `bridge-runtime.ts:706` · `:711` · `packages/host/src/result-issuer.ts` |
| 타워는 같은 dispatch의 `seq ≤ last_seq` 결과를 **무시**(멱등) · 원격 결과는 `done`/`failed` 모두 board `blocked`로 착지 | `packages/host/src/card-ops.ts:313–332` |
| 카드 결과 와이어 상한: `output` ≤ **200,000** chars · `summary` ≤ 900 · `note` ≤ 500 · `reason` ≤ 200 · 첨부 본문 ≤ **256,000** chars · 디스패치 `prompt` ≤ **60,000** chars | `card-contract.ts:23–56` · `packages/protocol/src/envelope.ts:34` |
| 가짜 에이전트 CLI **없음**. 테스트는 `fake-herdr.ts` + in-process `RelayServer` + `startBridgeRuntime` | `packages/host/src/fake-herdr.ts` |
| 완료 권위 규칙: 스크레이프·ACK·pane 사망은 **절대 done이 아니다** · 타워는 원격 결과를 `blocked`로 착지 | `docs/ARCHITECTURE.md:178–193` |

---

## 5. 플래그 존재 확인 (2026-10-15 `--help`, 실행 없음)

| CLI | 확인된 플래그 | 주의 |
|---|---|---|
| claude 2.1.300 | `-p/--print` · `--output-format` · `--verbose` · `--session-id <uuid>` · `--resume` · `--append-system-prompt[-file]` · `--permission-mode` · `--allowedTools` · `--disallowedTools` · `--bare` · `--restricted` · `--no-session-persistence` | **`--setting-sources`는 `--help`에 없다**(숨김/제거 여부 미확인). `--bare`는 훅을 건너뛰지만 **인증을 `ANTHROPIC_API_KEY`/apiKeyHelper로 강제**(OAuth·키체인 미사용). `--restricted`는 사용자 설정을 무시하지만 **Bash 등 코드 실행 도구를 제거**한다 |
| codex-cli 0.162.1 `exec` | `-C` · `-s/--sandbox` · `-c key=value` · `--json` · `-o/--output-last-message` · `--skip-git-repo-check` · `--ignore-user-config` · `--dangerously-bypass-approvals-and-sandbox` | `-c developer_instructions=…` 반영은 **§7.2에서 실측**(반영됨) |
| codex `exec resume` | `[SESSION_ID] [PROMPT]` · `-c` · `--json` · `-o` · `--skip-git-repo-check` · `--ignore-user-config` · `--dangerously-bypass-hook-trust` | **`-C`도 `-s`도 없다** → 재개는 **spawn cwd = 기록된 cwd**, 샌드박스는 `-c` 오버라이드로 |
| grok 1.0.54 | `-p` · `--prompt-file` · `--output-format` · `--cwd` · `-s/--session-id` · `-r/--resume` · `--rules` · `--permission-mode` · `--allow` · `--deny` | `--session-id`는 **새 대화 전용** — `--resume`과 함께 쓰려면 `--fork-session` 필요 → 재개 argv에 `--session-id`를 **넣지 않는다** |

---

## 6. 측정하지 않은 것 (lessons (30) — 미측정을 "없음"으로 적지 않는다)

| 명제 | 지위 |
|---|---|
| claude `acceptEdits` 자동 허용 명령의 정확한 집합(`rm`·`mv`·`chmod` …) | ~~미측정~~ → **실측 §7.1**(UK-5 resolved) |
| claude `-p`에 60,000자급 프롬프트를 **stdin**으로 넣었을 때의 동작 | **미측정** — 짧은 프롬프트 stdin 경로만 실측(§7.3) |
| codex `-c developer_instructions=…` 반영 여부 | ~~미측정~~ → **실측 §7.2**(UK-9 resolved — 반영 · resume 유지) |
| 입양 대상(비자식 프로세스)의 pid 재사용 위험 실빈도 | **미측정** — 시작 시각 대조로 완화 예정 |
| 수 분~수 시간짜리 실카드의 출력 크기 분포 | **미측정** — Done when (h) 라이브 스모크에서 1차 관측 |
| grok 플래그 안정성(alpha) | **미측정** — 버전 고정 + argv 테스트로 드리프트 감지 |

---

## 7. R48 후속 실측 (2026-10-15 — UK-5 차단 해소 · UK-9 · stdin 전달)

R48(`approved-with-fixes`)이 **UK-5 실측 결과의 PLAN 기재**를 재리뷰 면제 조건으로 걸었다. 아래는 그 실측이다. 원출력은 §헤더 규칙대로 커밋하지 않는다.

### 7.1 UK-5 — claude 2.1.300 `-p --permission-mode acceptEdits --allowedTools Read`

| 명령 (모델이 Bash로 실행) | 결과 |
|---|---|
| `mkdir` · `cp` · `mv` · `rm` · `rm -rf <cwd 안 하위 디렉터리>` · `echo … > file` · `git status` (cwd 안, **단독 명령**) | **자동 허용** — `allowedTools`(Read뿐) 밖인데도 실행됨 |
| `chmod` · `sed -i` · `curl` | **거부** |
| `rm -rf <cwd 밖 절대경로>` | **기본 거부** — 피해 대상 디렉터리 **무손상** |
| 복합 `cmd; echo "exit=$?"` | 단독 `cmd`가 자동 허용 대상이어도 **거부** — 모델은 이어서 단독 명령으로 재시도 |
| `--disallowedTools "Bash(rm *)"` 추가 | cwd 안 `rm -rf` · cwd 밖 `rm -rf` **모두 차단** |

**부수 관찰 (argv · 파서 계약):**
- **`--disallowedTools`는 가변 인자(variadic)다** — 뒤따르는 위치 인자 프롬프트를 **도구 패턴으로 삼킨다** → 프롬프트는 **반드시 stdin**으로 넣는다(D3과 일치, argv 빌더 테스트로 고정).
- **claude JSON 출력에 원시 제어 문자가 섞일 수 있다** — `jq`는 파싱 실패, Python `json.loads(strict=False)`는 성공 → 스트림 파서는 **관용 파싱**(제어 문자 제거/이스케이프 후 파싱)해야 한다.

**판정 → PLAN D10 claude 기본 deny 목록:** `Bash(rm *)` · `Bash(rmdir *)` · `Bash(git push*)` · `Bash(git reset --hard*)` · `Bash(git clean*)` · `Bash(sudo *)` · `Bash(curl *)` · `Bash(wget *)` — CLI 문서의 "명령 전체" 접두 형식. 실측 자동 허용 집합과 무관하게 **파괴 계열을 거부**한다. **잔여 위험(문서화):** 접두 규칙은 `/bin/rm` · `command rm` · `find -delete` · 인터프리터 한 줄(`python -c …`)을 잡지 못한다 — **cwd 경계 + `allowedRoots` + `needs_verification`** 이 최종 방어선이며, 작업 디렉터리는 **git 추적 디렉터리**를 권장한다.

### 7.2 UK-9 — codex-cli 0.162.1 `-c developer_instructions="…"`

| 실험 | 결과 |
|---|---|
| 새 세션, 힌트에 codeword 지시 | 응답 *"Hello! ZEBRA42"* (대조군 무힌트: *"Hello!"*) → **반영됨** |
| `exec resume`, `-c` 재전달 **없음** | codeword 지시가 **유지**(세션에 영속) |
| `exec resume`, `-c` 재전달 | 무해(중복 효과 없음) |
| `</dev/null` 상태에서도 *"Reading additional input from stdin..."* 출력 | **무해** — 파서는 무시 |

### 7.3 claude 프롬프트 stdin 전달 (`-p`)

`printf '…' | claude -p --output-format json` → `.result` = *"MANGO"* — **짧은 프롬프트의 stdin 경로 성립.** 60,000자급 장문은 여전히 **미측정**(UK-2, 비차단 — P3 라이브 프로브).
