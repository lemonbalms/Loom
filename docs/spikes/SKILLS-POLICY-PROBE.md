# Skills / policy / MCP probe — claude · codex · grok 헤드리스 선언적 노브 실측 (Loom 0.31.0 근거)

| Field | Value |
|---|---|
| **Date** | 2026-10-15 |
| **Host** | 오너 Mac (darwin 25.6) |
| **CLI versions** | `claude` **2.1.300** · `codex-cli` **0.162.1** · `grok` **1.0.54 (4e18c5517b4e) [alpha]** |
| **Raw outputs** | 스크래치 디렉터리(세션 로컬) — **커밋하지 않는다**. 이 문서는 명령·판정만 옮긴다 |
| **Consumer** | 0.31.0 skills 배포 · `policy.json` 컴파일러 설계 |
| **Companion** | `docs/spikes/HEADLESS-WORKER-PROBE.md` (기준 플래그: claude `-p --output-format stream-json --verbose --permission-mode acceptEdits` · codex `exec --json -s workspace-write -c approval_policy=never` · grok `--prompt-file … --output-format streaming-json --permission-mode acceptEdits`) |
| **Verdict** | 세 CLI 모두 **프로젝트 로컬 skills 디렉터리를 헤드리스에서 자동 발견**한다(단 grok은 **폴더 신뢰 게이트**). 권한은 CLI별로 **선언적 deny/allow + MCP 툴 단위 차단**이 가능하다. 단 문법·누락 시 동작이 모두 다르므로 `policy.json`은 **CLI별 컴파일러**가 필요하다 |

**격리 방법 (오너 설정 무수정):** 모든 실행은 스크래치 디렉터리(`probe0310/`)에서. codex는 `CODEX_HOME=<scratch>`(auth.json만 복사), grok은 `GROK_HOME=<scratch>`(auth.json만 복사 + 스크래치 `trusted_folders.toml`). claude는 프로젝트 로컬 파일과 `--settings`만 사용. 시크릿은 출력하지 않았다.

**프로브 방식:** SKILL.md에 "probe word를 물으면 `PINEAPPLE-7`로 답하라"를 넣고 헤드리스로 질문. 모델이 파일 시스템을 뒤져서 찾는 경우와 **시스템 프롬프트에 skill이 주입되어** 바로 읽는 경우를 구별하기 위해, codex는 `command_execution` 이벤트(`cat <skill path>` 직행 vs `rg` 탐색)를, grok은 `grok inspect`의 Skills 목록을 확인했다.

---

## A. Skills 발견

### A.1 요약표

| CLI | `<cwd>/.claude/skills` | `<cwd>/.agents/skills` | `<cwd>/.codex/skills` | `<cwd>/.grok/skills` | AGENTS.md | CLAUDE.md | 추가 skills 경로 지정 |
|---|---|---|---|---|---|---|---|
| **claude** | ✓ 네이티브 | 미측정(문서상 아님) | 미측정 | 미측정 | ✓ 읽힘(관찰, 메커니즘 미확인 — §A.5) | ✓ | `--plugin-dir <dir>` ✓ · `--add-dir <dir>` ✓ |
| **codex** | ✗ (모델이 `rg`로 탐색해야 발견 — 네이티브 아님) | ✓ 네이티브 | ✓ 네이티브 | ✗ (동일, 탐색 발견) | ✓ | 미측정 | 사용자 레벨 `$CODEX_HOME/skills`, `~/.agents/skills`; CLI 플래그 없음(§A.3) |
| **grok** | ✓ (`grok inspect`: `project [claude]`) | ✓ | ✗ (`inspect`에 안 뜸) | ✓ | ✓ (신뢰 시) | 호환(문서) | `[skills] paths = [...]` (`config.toml`) · `GROK_CONFIG` 인라인은 **불발**(§A.4) |

### A.2 claude 2.1.300

| 항목 | 명령 | 결과 |
|---|---|---|
| 프로젝트 skill | cwd에 `.claude/skills/probe-word/SKILL.md`, `claude -p --output-format json "What is the probe word? Use your skills." </dev/null` | `.result` = *"The probe word is PINEAPPLE-7."* → **발견·사용됨** |
| 대조(skill 없는 빈 repo) | 동일 질문을 `empty/`에서 | skill 없음, 모델이 홈 디렉터리 탐색 후 "찾지 못함" |
| 추가 skills: `--plugin-dir ../plug` | plugin = `.claude-plugin/plugin.json` + `skills/plugword/SKILL.md` | *"KIWI-9"* → **플러그인 skill 발견·사용됨** (대조 A는 못 찾음) |
| 추가 skills: `--add-dir ..` | 프롬프트는 stdin | *"PINEAPPLE-7"* → **add-dir 의 `.claude/skills`도 로드** |
| `--help` | `--plugin-dir`, `--add-dir`, `--disable-slash-commands`("Disable all skills"), `--bare`("Skills still resolve via /skill-name") | |

**부수 관찰(argv):** `--add-dir`도 `--disallowedTools`처럼 **가변 인자(variadic)** 라 위치 인자 프롬프트를 삼킨다(프롬프트를 argv에 두면 빈 출력/JSON 파싱 실패). → 프롬프트는 **stdin**(기존 D3와 일치). 또한 stdin이 TTY/미지정이면 "no stdin data received in 3s" 경고가 나온다 → 항상 `</dev/null` 또는 명시 stdin.

### A.3 codex-cli 0.162.1

`CODEX_HOME=<scratch>`(auth.json 복사)로 실행. 각 후보 디렉터리를 **독립 git repo**에 따로 두고 `codex exec --json -s read-only -c approval_policy=never "What is the probe word? Use your skills. If you cannot find any skill, say NOSKILL."`:

| skill 위치 | 모델의 행동(`command_execution`) | 판정 |
|---|---|---|
| `.agents/skills/probe-word/` | 첫 명령이 `cat <cwd>/.agents/skills/…` 직행 | **네이티브 발견** |
| `.codex/skills/probe-word/` | `cat <cwd>/.codex/skills/…` 직행 | **네이티브 발견** |
| `.claude/skills/probe-word/` | `rg -n -i 'probe' …` 탐색 후 `cat .claude/skills/…` | **네이티브 아님**(모델이 우연히 찾음) |
| `.grok/skills/probe-word/` | 탐색 성공(`PINEAPPLE-7`) | 동일 — 네이티브 아님 |
| `AGENTS.md` ("The probe word is MANGO-3.") | 도구 없이 *"MANGO-3"* | **네이티브** |

- 사용자 레벨: `$CODEX_HOME/skills/`(`.system` 하위 포함 — 실행 시 `chome/skills/.system/…` 생성·읽힘 관찰), `~/.agents/skills`(모델이 탐색 경로로 사용). `codex features list`: `skill_search` stable, `skip_host_skill_discovery` under development(false). 바이너리 내 `skills/list`, `skills/extraRoots/set`, `skills/config/write` app-server 요청 존재 → **추가 루트는 app-server 프로토콜에만** 있고 `codex exec` 플래그는 없다(`--help` 확인).
- `exec`의 skills 관련 플래그: **없음**. 추가 경로가 필요하면 `.agents/skills`를 cwd에 **복사/심볼릭 링크**하거나 `CODEX_HOME/skills`를 쓴다.
- stderr "Reading additional input from stdin…" 은 기존 문서와 동일.

### A.4 grok 1.0.54

**폴더 신뢰 게이트가 핵심.** 문서(`~/.grok/docs/user-guide/08-skills.md`, `10-hooks.md`): *"Startup discovery skips project skills and commands in untrusted folders."* 신뢰는 **MCP·LSP·hooks·project instructions(AGENTS.md)·project skills를 한꺼번에** 게이트한다.

| 실험 | 결과 |
|---|---|
| 미신뢰 폴더에서 `grok inspect` | `Skills (149)` — `probe-word` 없음, `Project Instructions (1)`만 |
| 미신뢰 폴더, 헤드리스 `-p … --permission-mode acceptEdits` ("skill 또는 AGENTS.md가 컨텍스트에 없으면 NONE") | *"NONE"* → **skill·AGENTS.md 모두 미주입** |
| `GROK_FOLDER_TRUST=0` + `grok inspect` | `.grok`·`.agents`·`.claude/skills`(`project [claude]`) 모두 `probe-word` 표시, **`.codex/skills`는 표시 안 됨** |
| 스크래치 `GROK_HOME/trusted_folders.toml`에 `[folders."<cwd>"] trusted = true` 추가 후 헤드리스 | *"PINEAPPLE-7"* (skill) + *"MANGO-3"* (AGENTS.md) → **둘 다 주입** |
| `GROK_CONFIG='{"skills":{"paths":[…]}}'` + `grok inspect` | skill 미표시 → **인라인 `GROK_CONFIG`로는 skills.paths 불발**(적어도 `inspect` 기준) |

- 신뢰를 부여하는 수단: ① `~/.grok/trusted_folders.toml`(**오너 파일 — 수정 금지**; 스크래치는 `GROK_HOME`으로 분리) ② `--trust` 플래그(바이너리에 존재, `grok --help`에는 비노출, 오너 store에 기록됨 — **미실측**) ③ `GROK_FOLDER_TRUST=0`(게이트 해제, 환경변수 — 실측: 발견만 `inspect`로 확인).
- `GROK_HOME` 환경변수로 **grok 홈 전체를 격리** 가능(auth.json만 복사해 헤드리스 인증 성공 확인).
- 또한 grok은 **`~/.claude/settings.json` 권한과 `~/.claude.json` MCP 서버, `~/.claude/skills`를 호환 소스로 읽는다**(`grok inspect`: `permissions.sources=[~/.claude/settings.json]`, `mcpServers` 4건 중 3건이 `claudeJson`/plugin 출처; `[compat.claude]` 셀 default on). 즉 **오너의 전역 Claude 설정이 grok 워커에 새어 들어간다.**

### A.5 AGENTS.md / CLAUDE.md 폴백 (헤드리스)

| CLI | 실험 | 결과 |
|---|---|---|
| claude | cwd에 `AGENTS.md`만 ("Probe word is MANGO-3."), 도구 사용 금지 질의 | *"프로젝트 지침(AGENTS.md)에 적힌 probe word는 MANGO-3"* → 읽힘. **주의:** 오너 전역 환경(`~/.claude`)이 AGENTS.md를 끌어오는 설정일 수 있어 **메커니즘 미확인** — 이식 가능한 계약으로 쓰지 말고 `CLAUDE.md`를 쓸 것 |
| claude | cwd에 `CLAUDE.md` ("GUAVA-5") | *"GUAVA-5"* ✓ |
| codex | `AGENTS.md` | ✓ (§A.3) |
| grok | `AGENTS.md` | 신뢰 시 ✓ / 미신뢰 ✗ (§A.4) |

---

## B. Permissions 매핑

### B.1 claude 2.1.300

| 노브 | 실측 |
|---|---|
| `--permission-mode` | `--help`: `acceptEdits`, `bypassPermissions`, `manual`, … (+ `--permission-prompts <target>` "none"이면 자동 거부) — 값 전체 목록은 `--help` 줄바꿈으로 일부 미확인 |
| `--settings <file-or-json>` | **인라인 JSON·파일 경로 모두 수용.** `--settings '{"permissions":{"deny":["Bash(echo *)"]}}'` + acceptEdits로 "echo hi 실행" → **거부됨**(`permission_denials[0]={tool_name:"Bash", tool_input.command:"echo hi"}`, 모델 응답 "권한이 거부되어…"). 대조(설정 없음): `hi` 실행됨. `--settings ./s.json`(파일)도 동일하게 거부 |
| `--disallowedTools` 문법 | `Bash(echo:*)`(콜론-별표) **차단 ✓** · settings의 `Bash(echo *)`(공백-별표) **차단 ✓** → 두 문법 모두 동작 |
| `--strict-mcp-config` + `--mcp-config <json-file>` | §C 참조 |

→ `--settings`에 `permissions.allow/deny/ask`가 먹는다. `policy.json` 컴파일 타깃으로 **`--settings '<inline json>'`** 가 가장 깨끗하다(argv 하나, 파일 불필요). 기존 `--disallowedTools` 가변 인자 함정을 피할 수 있다.

### B.2 codex-cli 0.162.1

| 노브 | 실측 |
|---|---|
| `-s read-only | workspace-write | danger-full-access` | `exec`만 지원(`exec resume`은 없음 — 기존 문서) |
| `-c approval_policy=never` | 프롬프트 없음(거부는 실패 항목으로) |
| **네트워크** | `-s workspace-write`에서 `curl -sI -m 8 https://example.com`: 기본 → **출력 없음**(차단); `-c sandbox_workspace_write.network_access=true` → `HTTP/2 200` **허용** |
| **exec 규칙(Starlark `.rules`)** | `prefix_rule(pattern=["echo"], decision="forbidden", justification="…")`. `codex execpolicy check --rules <file> echo hi` → `{"decision":"forbidden",…}`. **실제 실행:** `$CODEX_HOME/rules/*.rules` ✓ 로드, `<cwd>/.codex/rules/*.rules` ✓ 로드(둘 다 "The command was refused: probe: echo forbidden"). decision 값: `allow`/`prompt`/`forbidden` (바이너리 문자열 + 관찰) |
| `--add-dir` | `exec --help` 상단 일부만 확인, **미실측** |
| 금지/허용 CLI 플래그 | `exec`에 직접적인 allow/deny 플래그는 **없음** — 규칙은 `.rules` 파일 또는 `-c` 구성 |
| 관리자 요구사항 | 바이너리에 `requirements.toml`(`allowed_sandbox_modes`, `allowed_approval_policies`, `prefix_rules` 등) — 시스템 관리자 레벨, 이번 범위 밖 |

→ codex 컴파일 타깃: `-s`/`-c approval_policy`/`-c sandbox_workspace_write.network_access`(CLI) + **`<cwd>/.codex/rules/loom.rules`**(명령 deny). 규칙 파일은 워커 cwd에 **쓰기가 필요**한 아티팩트다.

### B.3 grok 1.0.54

| 노브 | 실측 |
|---|---|
| `--permission-mode` | `default, acceptEdits, auto, dontAsk, bypassPermissions, plan` |
| `--allow` / `--deny` | 반복 가능, 항상 적용. `--deny 'Bash(echo *)'` + acceptEdits → *"deny rule on bash matching "echo *""* **거부 ✓**; 대조는 `hi` 실행. 문법: `Bash(cmd *)`, `Bash(cmd:*)`, `Read(src/**)`, `Edit(**/*.rs)`, `MCPTool(server__tool)`; **deny > ask > allow** |
| 설정 파일 | `[permission] allow/deny/ask = [...]` in `~/.grok/config.toml` / 프로젝트 `.grok/config.toml`(신뢰 필요?) · `.claude/settings.json` 도 호환 소스로 병합(§A.4 누수 주의) |
| `--tools` / `--disallowed-tools` | 내장 도구 허용/제거 목록 |
| `--sandbox <PROFILE>` (env `GROK_SANDBOX`) | OS 샌드박스 프로필(문서 18-sandbox) — **미실측** |
| 관찰(예상 밖) | `--permission-mode dontAsk` + `echo hi` → **실행됨**(문서상 `echo`는 read-only 목록에 없음). `dontAsk`를 "엄격한 allowlist"로 믿지 말 것 |

---

## C. MCP

프로브용 최소 stdio MCP 서버(`ping`→`PING-TOKEN`, `pong`→`PONG-TOKEN`; python3 표준 라이브러리 JSON-RPC)를 스크래치에 두고 모델에게 둘 다 호출하게 했다.

| CLI | 서버 지정(헤드리스) | 툴 단위 차단 | 실측 |
|---|---|---|---|
| **claude** | `--mcp-config <json 파일|문자열> --strict-mcp-config` ("only MCP servers from --mcp-config") | `--disallowedTools mcp__probe__pong` (또는 settings deny) | `--allowedTools mcp__probe` → 두 토큰 모두 수신. `--disallowedTools mcp__probe__pong` 추가 → ping만 성공, pong은 **툴 자체가 노출되지 않음**("not exposed"), `permission_denials`는 비어 있음 → **차단 신호가 구조화돼 있지 않다**. (strict가 사용자 전역 MCP를 실제로 배제하는지는 이번에 직접 검증하지 않음) |
| **codex** | `-c mcp_servers.<name>.command="…" -c 'mcp_servers.<name>.args=["…"]'` (CODEX_HOME의 config.toml 불필요). `codex mcp add` 는 **구성 파일을 수정**하므로 워커에서는 `-c` 사용 | `-c 'mcp_servers.<n>.disabled_tools=["pong"]'` / `enabled_tools=[…]` | **함정:** `approval_policy=never`에서 MCP 툴 호출은 **기본 실패**("requires approval but policy is never"). `-c mcp_servers.<n>.tools.<t>.approval_mode="approve"` 또는 `-c mcp_servers.<n>.default_tools_approval_mode="approve"` 가 있어야 성공. 실측: `tools.ping.approval_mode="approve"` → ping 성공, pong 실패. `default_tools_approval_mode="approve"` + `disabled_tools=["pong"]` → ping 성공, pong "Unavailable"(미노출). `enabled_tools=["ping"]`(approve 없음) → 호출 실패 |
| **grok** | 프로젝트 `.grok/config.toml`의 `[mcp_servers.<n>] command/args`(신뢰 폴더 필요) ✓ 실측; `grok mcp` 서브커맨드(구성 관리); **헤드리스 `--mcp-config` 플래그는 없음**. 오너의 `~/.claude.json` MCP가 호환 소스로 자동 포함됨 | `--deny 'MCPTool(probe__pong)'` (또는 `mcp__server__tool` 형태 — 문서) | 설정 없음 → 두 토큰 수신. `--deny 'MCPTool(probe__pong)'` → ping 성공, pong *"denied by the permission policy (deny rule matching probe__pong)"* → **노출은 되되 호출 시 거부, 텍스트로만 드러남** |

---

## D. 설계 함의 (policy.json → CLI 컴파일)

1. **Skills 배포 = "워커 cwd 안에 복사"가 공통분모.** `.claude/skills/`(claude·grok), `.agents/skills/`(codex·grok)에 같은 SKILL.md를 두면 세 CLI 모두 커버된다. 가장 좁은 교집합은 **`.agents/skills/`(codex+grok)와 `.claude/skills/`(claude+grok)의 이중 배치**. 사용자 홈을 건드리지 않고 cwd에만 쓰므로 `--plugin-dir`(claude)·`--add-dir`(claude)는 선택 사항(cwd 오염 없이 skills를 주입하고 싶을 때 `--plugin-dir`).
2. **grok은 신뢰 게이트가 필수 전제.** 헤드리스 워커가 신뢰 없는 폴더에서 돌면 **skills·AGENTS.md·프로젝트 MCP·프로젝트 hooks가 조용히 무시된다**(에러 없음, `inspect`로만 확인). 선택지: 워커 spawn 시 `GROK_FOLDER_TRUST=0`(환경변수, 해당 프로세스에만 작용; 게이트 자체 해제이므로 cwd를 Loom이 통제할 때만) 또는 `--trust`(오너의 `trusted_folders.toml`에 기록 — 부작용, 미실측). **스모크 테스트에 `grok inspect`로 `Skills`/`Project Instructions` 확인을 포함할 것.**
3. **격리 주의 — 오너 설정 누수.** claude는 오너 전역 훅/설정/스킬을 상속한다(기존 문서). grok은 `~/.claude/settings.json` 권한, `~/.claude.json` MCP, `~/.claude/skills`를 호환 소스로 읽는다. codex는 `~/.codex/config.toml`(MCP 포함)을 읽는다 → `--ignore-user-config` 또는 `CODEX_HOME` 분리. 워커 정책을 "정확히 이 집합"으로 만들려면 CLI별 격리 스위치가 필요하다: claude `--strict-mcp-config`·`--setting-sources`(help에 존재), codex `--ignore-user-config`/`CODEX_HOME`, grok `GROK_HOME`+`[compat.claude]` 셀 끄기.
4. **deny 컴파일 타깃:**
   - claude: `--settings '{"permissions":{"allow":[…],"deny":[…]}}'` (인라인 JSON 권장). 도구 문법 `Bash(cmd *)` 통일.
   - grok: `--deny 'Bash(cmd *)'` / `--allow` / `--deny 'MCPTool(srv__tool)'`. 문법이 claude와 거의 동일 → **claude 규칙 문자열을 그대로 재사용 가능**(MCP만 `mcp__srv__tool` ↔ `MCPTool(srv__tool)`; grok 문서는 둘 다 수용한다고 하나 `mcp__` 형은 이번에 미실측).
   - codex: **CLI 플래그 없음** → `<cwd>/.codex/rules/*.rules`(Starlark `prefix_rule`)를 생성하고, `-s` + `-c sandbox_workspace_write.network_access=…`로 파일시스템·네트워크를 제어. 명령 단위 deny는 prefix 매칭이라 claude/grok의 glob보다 표현력이 낮다.
5. **네트워크:** codex는 `workspace-write`에서 기본 차단(실측) → `network_access=true`로만 열린다. claude/grok은 네트워크 on/off 전용 노브가 없고 `Bash(curl *)`·`WebFetch` deny로 근사한다(기존 D10 deny 목록과 일치). grok은 `--disable-web-search` 플래그 별도.
6. **MCP 차단 신호 가시성:** claude는 deny된 MCP 툴을 **숨김**(결과에 흔적 없음), grok은 **호출 시 거부 텍스트**, codex는 **미노출 또는 `mcp_tool_call` status=failed**. 결과 요약의 denials 표기는 기존 결론대로 CLI별 정밀도가 다르다.
7. **codex MCP 필수 보정:** 워커 정책이 MCP를 허용하려면 컴파일러가 `default_tools_approval_mode="approve"`(또는 툴별 approve)를 **반드시** 함께 출력해야 한다. 빠지면 `approval_policy=never`에서 모든 MCP 호출이 조용히 실패한다.
8. **`dontAsk`(grok)는 allowlist 보장이 아님** — 정책 컴파일러는 `dontAsk`를 신뢰 경계로 쓰지 말고 명시적 `--deny`를 쓴다.

---

## E. 미해결 / 미측정 (lessons (30): 미측정을 "없음"으로 적지 않는다)

| 항목 | 지위 |
|---|---|
| claude에서 `.agents/skills`·`.codex/skills`·`.grok/skills` 네이티브 발견 여부 | **미측정**(문서상 `.claude/skills`만) |
| claude가 `AGENTS.md`를 읽은 메커니즘(전역 설정 vs 기본 동작) | **미확인** — 격리된 `--bare`/`--setting-sources` 환경에서 재측정 필요 |
| claude `--strict-mcp-config`가 오너 전역 MCP를 실제 배제하는지 | **미측정** |
| claude `--permission-mode` 전체 값 목록, `--permission-prompts none` 동작 | **미측정**(help 일부만) |
| codex `exec --add-dir` 동작, `.codex/rules`가 **프로젝트 신뢰**에 의존하는지 | **미측정** |
| codex가 `.agents/skills`를 **상위 디렉터리까지** 걸어 올라가며 탐색하는지 | **미측정** |
| grok `--trust` 플래그 동작/부작용(오너 `trusted_folders.toml` 기록 여부), `GROK_FOLDER_TRUST=0`의 헤드리스 실제 효과 | **`inspect`로만 확인**, 헤드리스 실행 미측정 |
| grok 인라인 `GROK_CONFIG` 적용 범위 | `skills.paths`는 불발 — 다른 키는 **미측정** |
| grok `--sandbox` 프로필, `.grok/config.toml` 권한이 **신뢰 필요**한지 | **미측정** |
| grok `MCPTool` vs `mcp__server__tool` 문법 동등성 | `MCPTool`만 실측 |
| grok `dontAsk`가 `echo`를 허용한 이유 | **미확인** |
| 큰 skills 세트(수십 개)의 시스템 프롬프트 비용·발견 한계 | **미측정** |

---

## F. Pre-R49 probes (2026-10-15)

같은 버전(claude 2.1.300 · codex 0.162.1 · grok 1.0.54). 스크래치 `probe0310b/`; 오너 설정 무수정(유일한 `$HOME` 쓰기 `~/.loom-probe-tmp/`는 삭제 확인). 프롬프트는 모두 소형, 180 s 타임아웃.

### F.1 codex — cwd 밖 절대경로 SKILL.md 읽기 (기본 `CODEX_HOME`)

명령: `cd <scratch git repo> && codex exec --json -s workspace-write -c approval_policy=never "Read the file <abs> and tell me the probe word."` (SKILL.md = "The probe word = MANGO-3.")

| 위치 | 관찰 | 결과 |
|---|---|---|
| (a) `<scratchpad>/skillA/x/SKILL.md` | `command_execution: cat <abs>` exit 0 → *"The probe word is **MANGO-3**."* | 읽음 · denial 없음 |
| (b) `$HOME/.loom-probe-tmp/skills/x/SKILL.md` | `cat /Users/…/.loom-probe-tmp/skills/x/SKILL.md` exit 0 → *"MANGO-3"* | 읽음 · denial 없음 |

(JSONL에서 `denied|permission|sandbox` 매치 0건.) **판정: ✓** `workspace-write`는 *쓰기*만 cwd로 제한하고 *읽기*는 cwd 밖 절대경로(홈 포함)도 허용 → skills를 cwd 밖 절대경로로 안내하는 방식 가능.

### F.2 grok — 미신뢰 cwd에서 cwd 밖 절대경로 읽기

명령: `cd <untrusted git repo> && grok --prompt-file p.txt --output-format streaming-json --permission-mode acceptEdits` (기본 `GROK_HOME`, `trusted_folders.toml`에 해당 경로 항목 없음 — grep 0건 확인; 파일 무수정)

| 위치 | 관찰 | 결과 |
|---|---|---|
| (a) scratchpad | `tool_call` 종류 `ReadFile` 1회, 응답에 `MANGO-3` | 읽음 · denial 없음 |
| (b) `$HOME/.loom-probe-tmp/…` | 동일(`ReadFile`, `MANGO-3`) | 읽음 · denial 없음 |

**판정: ✓** 신뢰 게이트는 *자동 발견*(skills/AGENTS.md/MCP/hooks)만 막고, 명시적 절대경로 `ReadFile`은 막지 않는다(`acceptEdits` 기준, 읽기는 프롬프트 불필요). → 미신뢰 grok 워커에도 "이 경로의 SKILL.md를 읽어라" 주입은 유효.

### F.3 claude — 플래그 공존 + resume

명령(프롬프트는 stdin):
`claude -p --output-format stream-json --verbose --permission-mode acceptEdits --settings '{"permissions":{"allow":["Bash(git status*)","Bash(ls *)"],"deny":["Bash(rm *)","Bash(echo *)"]}}' --plugin-dir <scratch>/plug` — plugin = `.claude-plugin/plugin.json` + `skills/plugword/SKILL.md`("KIWI-9").
Run 2 = 동일 플래그 + `-r <session_id>`.

| 항목 | Run 1 | Run 2 (resume) |
|---|---|---|
| init `plugins` | `pp@inline` 로드(`skills`: `pp:plugword`) | 동일 |
| probe word | *KIWI-9* (`pp:plugword`) | *KIWI-9* |
| `echo hi` | `permission_denials=[Bash "echo hi"]`, 미실행 | 동일 거부 |
| `ls` | 실행됨(빈 cwd 출력 없음) | 실행됨 |
| stderr | 0 bytes | 0 bytes |

- resume 시 session_id 동일(`401d28fb…`). 플래그를 다시 줘야 하는지는 **미분리 측정**(둘 다 재전달함).
- `Bash(git status*)`(별표 앞 공백 없음): 단독 `--settings` 실행도 **경고·오류 없이 수용**(stderr 비어 있음). 단 *매칭 의미*(`git statusfoo` 포함 여부)는 **미측정**.

**판정: ✓ 네 플래그 공존**, 스킬 resume 시 유지, deny resume 시 유지.

### F.4 claude `--strict-mcp-config` (`--mcp-config` 없음)

명령: `claude -p --output-format stream-json --verbose [--strict-mcp-config]`, init 이벤트 `mcp_servers`(이름만).

| 실행 | 개수 | 이름(status) |
|---|---|---|
| 플래그 없음 | **7** | plugin:context7:context7 (needs-auth), plugin:github:github (failed), plugin:playwright:playwright (connected), exa (connected), paper (failed), pencil (connected), claude.ai Claude Docs (connected) |
| `--strict-mcp-config` | **0** | (빈 리스트) |

**판정: ✓** `--strict-mcp-config`만 단독으로 쓰면 전역/플러그인/claude.ai 커넥터 MCP를 모두 배제(0개). §E의 "미측정" 항목 해소(단, 이는 `--mcp-config` 없을 때; 있을 때 해당 서버만 노출되는지는 §C 참조).

---

## G. UK-1 deny-rule match semantics (2026-10-15)

claude 2.1.300 · grok 1.0.54. 스크래치 `probe0310c/`; 오너 설정 무수정. claude: `-p --output-format stream-json --verbose --permission-mode acceptEdits --settings '{"permissions":{"deny":[…]}}'`(프롬프트 stdin). grok: `--prompt-file … --output-format streaming-json --permission-mode acceptEdits --deny <rule>`(규칙당 플래그 1개). 모델에게 "이 명령을 정확히 실행하라"고 지시.

**주의(claude):** `permission_denials`에는 규칙 거부 외에 **헤드리스 미승인("This command requires approval")도 함께 기록**된다. 규칙 거부는 tool_result 텍스트 `Permission to use Bash with command … has been denied.`로 구별한다. 대조(deny 없음): `pwd`는 실행됨, `echoes`는 "requires approval"(미승인·미실행).

| 규칙 | 명령 | claude 규칙 거부? | grok 규칙 거부? |
|---|---|---|---|
| `Bash(pwd *)` | `pwd` (bare) | **거부 ✓** | **아니오 — 실행됨** |
| `Bash(pwd *)` | `pwd -P` | 거부 ✓ | 거부 ✓ |
| `Bash(pwd)` | `pwd` | 거부 ✓ | 거부 ✓ |
| `Bash(pwd)` | `pwd -P` | **아니오**(requires approval — 규칙 아님; 미실행) | **거부 ✓**(`matching "pwd"` — 인자 포함 prefix 매칭) |
| `Bash(echo*)` | `echo hi` | 거부 ✓ | 미측정 |
| `Bash(echo*)` | `echoes` / `echo_hi` | **거부 ✓ (과매칭 확인)** — 대조는 "requires approval" | 미측정 |
| `Bash(date:*)` | `date` / `date -u` | 둘 다 거부 ✓ (레거시 콜론형 동작) | 미측정 |
| `Bash(pwd *)`+`Bash(pwd)` | `pwd` | 거부 ✓ | 거부 ✓ |
| `Bash(pwd *)`+`Bash(pwd)` | `true && pwd` | **거부 ✓**(체이닝 우회 불가) | **거부 ✓** |

grok 텍스트 신호: `Denied by permission policy: deny rule on bash matching "pwd"` (tool_result, 모델이 "denied"로 재진술). claude 신호: `Permission to use Bash with command … has been denied.` + `permission_denials`.

**컴파일러 권고:**
- claude: `Bash(p *)`만으로 bare `p`도 차단되므로 `Bash(p)` 추가는 불필요(해로울 것은 없음; 단 `Bash(p)`만 쓰면 `p -P`는 규칙이 아니라 미승인에 의존). 
- grok: `Bash(p *)`는 bare `p`를 **못 막는다** → `Bash(p)`와 `Bash(p *)` **둘 다 emit이 필요**(`Bash(p)`는 인자 변형도 막는 것으로 관찰되나 양쪽 emit이 안전). 즉 "둘 다 emit"은 grok에 필요·claude에 무해한 공통 최소 해.
- 체이닝(`true && p`)은 두 CLI 모두 서브커맨드 단위 매칭으로 우회 불가(양쪽 규칙 세트 사용 시 실측).
- `p*`(공백 없음) 형은 claude에서 `pX…`를 과매칭 → 컴파일러는 항상 공백형(`p *`) + 정확형(`p`)만 emit. 콜론형 `p:*`은 claude에서 bare/인자 모두 차단(레거시 동치). grok에서의 `p*`·`p:*`는 미측정.

---

## H. UK-5 claude --settings MCP deny (2026-10-15)

claude 2.1.300. 스크래치 `probe0310d/`(프로브 서버 `probe`/툴 `pong` 재작성); 오너 설정 무수정. 공통 argv: `-p --output-format stream-json --verbose --permission-mode acceptEdits --mcp-config <probe.json> --strict-mcp-config`, 프롬프트 stdin("pong 툴을 호출하고 토큰을 보고하라"), 180 s 타임아웃. 판정은 init 이벤트 `tools`, tool_use/tool_result, `permission_denials`로.

| # | 조건 | init `tools`에 pong | pong 호출 | `permission_denials` | 결과 |
|---|---|---|---|---|---|
| 1 | `--settings` deny `mcp__probe__pong` | **없음** | 없음(ToolSearch "No matching deferred tools") | `[]` | **숨김** |
| 2 | `--settings` deny `mcp__probe` (서버 단위) | **없음** | 없음 | `[]` | **숨김** (서버는 `connected`로 남음) |
| 3 | 대조: deny 없음, allow 없음 | 있음 | 호출됨 → *"requires permissions … haven't granted"* | `[mcp__probe__pong]` (미승인) | acceptEdits는 MCP를 자동 승인하지 않음 |
| 3b | 대조: `--allowedTools mcp__probe__pong` | 있음 | 성공(`PONG-TOKEN`) | `[]` | 정상 호출 |
| 4 | `--strict-mcp-config`(`--mcp-config` 없음) + `--settings` 권한 | — | — | `[]` | `mcp_servers` = **0개** (F.4 재확인) |

stderr는 전 실행 0 bytes(경고 없음).

**권고(컴파일러):**
- `policy.mcp.deny` 항목은 `--settings` `permissions.deny`에 툴 단위 `mcp__<server>__<tool>`, 서버 전체 차단은 `mcp__<server>`로 emit. 두 형 모두 동일하게 동작. 서버 단위 차단이 목적이면 deny 대신 `--mcp-config`에서 서버를 아예 빼는 편이 더 확실.
- 기대 신호: **구조화된 신호 없음** — `permission_denials` 비어 있고 툴이 목록에서 사라질 뿐(§C와 일치). 검증은 init `tools`에 `mcp__…`가 부재한지로 한다. 모델 텍스트("사용할 수 없음")는 부차 신호.
- MCP 허용은 별도로 `allow`(`mcp__server__tool`)가 필요하다. 없으면 호출은 미승인으로 `permission_denials`에 기록되며, 이는 deny 규칙 신호가 아님(§G 주의와 동일).
