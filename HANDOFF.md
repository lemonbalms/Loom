# HANDOFF — Loom (next session)

**Date:** 2026-07-17 (PM)  
**Workspace:** `/Users/kyoungsiklee/projects/fable-advisor`  
**GitHub:** https://github.com/lemonbalms/Loom (`main`)  
**Language:** user often Korean · **Autonomy:** brief status → execute gate (no mid-wave "할까요?")

---

## ⭐ Current action (read first)

> **🕸 NEW (2026-07-17): Loom×Herdr 노드 브릿지 설계서 완료 (`85e7829`, pushed).** **`docs/HERDR_DESIGN.md`** — Windows=Loom 컨트롤 타워 / herdr(Rust 에이전트 멀티플렉서)=Linux·Mac·WSL 노드 전용 / 노드별 브릿지 데몬(`loom bridge` 서브커맨드) 필수. **relay 와이어(protocol v1) 무변경** — 카드 dispatch/done은 기존 `mode:'task'` handoff + `loom-card-dispatch`/`loom-card-result` 라벨 attachment 컨벤션. 카드는 타워 board 소유(local-only 유지), 완료 감지는 herdr push 이벤트 드리븐(폴링 없음). 멀티에이전트 워크플로(정찰4+초안4+적대적 코드검증4)로 작성 — 검증이 잡은 사실오류 5건 교정 반영. 권고 원문 아카이브 = `docs/loom-herdr-architecture.html`.
>
> **⏩ 다음 순서 (설계서 §5·§6에 성문화):**
> ① **Step 0 — WSL2 네트워킹 PoC** (오너 Windows 머신 필요): `.wslconfig` mirrored + relay LAN 바인딩(`bun run relay:lan`) + WSL 안에서 인바운드 join 왕복. 산출물 `docs/spikes/STEP0-WSL2-NETWORKING.md`. **"여기가 안 뚫리면 나머지 무의미."**
> ② **Step 0.5 — herdr 실측**: 설계서의 herdr 쪽 사실은 **전부 [가정-H]**(외부 권고 문서 인용, 이 레포에서 미검증 — §0.1이 일괄 마커). 소켓 프레이밍·메서드·이벤트·seq·라이선스 실물 대조 + fixture 캡처. **이거 전에 브릿지 코드 착수 금지.**
> ③ PLAN **0.22.0** `pending-review` 편입 — **FREEZE 예외 = 오너 pull 한 줄 명시 필요**(이 요구는 오너가 직접 가져온 것이므로 해당됨, 단 명시적 확인 필요) → ④ R23 리뷰 → approved 후 본구현.
>
> **🕷 부수 작업(같은 날):** 브랜드 에셋 6종 `assets/brand/`(Twemoji 기반 거미/거미줄, CC-BY 4.0 — README Credits 추가됨) + README 마스코트 + 데스크톱 파비콘 + Tauri 앱 아이콘 세트 재생성 (`c825808`·`eccc23a`).
>
> ---
>
> **✅ (이전 상태 유지) v0.21.1 PTY handoff inject — 완전 검증됨 (구현 `d05d714` + 검증 `08ddb98`·`2fb8f6a`, all pushed).** 더 이상 런타임 미검증 지점 없음. `loom run claude --inject-handoffs`(opt-in, Claude 전용): 로컬 0600 Unix 소켓 제어, accept/claim 트리거 sanitized paste, Stop-hook idle 마커 + PTY quiescence, bracketed paste **no-auto-submit**. VERSION 0.21.1(CLI+MCP).
>
> **✅ 라이브 스모크 = 이번 세션 완료 (더는 권장사항 아님, 실제로 함):**
> ① 정식 통합 테스트 `packages/host/src/inject-live.test.ts`(`08ddb98`) — 실 `run-with-pty.py` PTY spawn, 프레임 안착·no-auto-submit·dedup·stale·**breakout 방어** 검증. `bun test` **195/0**. python3 부재/Windows skip 가드.
> ② **실 `claude` 바이너리 프로브** — idle Ink TUI가 300ms quiescence 게이트 통과(400ms 0 bytes), inject `ok:true`, handoff가 `❯` 입력창 안착 + **미제출** 확인. → Ink 수용까지 닫힘. (일회성 검증, repo 아티팩트 없음.)
>
> **🧭 프로세스 규칙 추가(`2fb8f6a`) — Next-action test:** 스스로 고른 액션은 "실패하면 뭘 새로 배우나"에 답해야 함. **실패 불가능한 액션(이미 green 재실행·오너 대기·문서정리)은 다음 액션 자격 박탈** — 가장 무서운 검증 가능한 것부터. 오너에게 수동 스크립트 넘기는 건 최후 수단. (`AGENTS.md` Standing rules + `tasks/lessons.md` 5번째. Fable 5 진단 = 이번 세션 반복 회피의 근본원인 = selector 고장.)
> **Note:** `.playwright-mcp/`는 untracked 로컬 상태, 커밋 제외.

## Strategic context

> **🎯 목적지 재확정 (오너 공리 + Fable 5 재판정, 2026-07-11).** Loom = **오너 6인 팀 전용 내부 도구.** 효용은 **확정된 전제**(외부 시장 수요 검증 대상 아님). → `LOOM_PURPOSE_REVIEW`의 "수요 검증/트립와이어" 프레임은 **목적지로서 폐기.** 새 "완성" = **팀 6인 온보딩 + relay 상시가동 + 실제 핸드오프 매일 왕복하며 Slack 회귀 없이 1~2주 지속(=adoption).**
>
> **🧊 개발 규칙 (FREEZE, 근거 교체판).** 신규 기능은 **팀 실사용에서 pull된 요구만** 구현 — **에이전트 추측(push) 금지.** 현 백로그(work-watch·MCP·C1/C2)는 전부 솔로 도그푸드 추측이라 **신규 PLAN 오픈 금지.** 팀이 쓰기 시작하면 진짜 요구가 pull됨 → 그때 로드맵 재개. **진짜 드리프트 = "실사용자가 요구 안 한 걸 만드는 일"**(이번 세션의 위임 규칙·effort 매트릭스가 그 예 — 프로세스용이지 도구 사용자용 아님).
>
> **▶ 남은 블로커 = relay 공용 호스트(VPS) 확보 = 오너 전용** (오너 확인: **아직 없음**). 확보되면 `docs/DRY_RUN_RUNBOOK.md` Step 0(systemd 상시가동)부터 실행 → 팀 6인 온보딩 → 매일 핸드오프 왕복 관측(Step 4).
>
> **✅ Windows 온보딩 = WSL 안내로 해결** (오너 결정). `install.sh`는 bash 전용 → Windows 팀원은 `wsl --install`(admin PowerShell)→재부팅→Ubuntu에서 동일 2줄. **docs-only author-close**(코드 추가 없음, 이미 R20 리뷰된 install.sh 재사용) — `docs/DRY_RUN_RUNBOOK.md` Step 2 + `README.md` Quick start Windows 노트. WSL 명령은 Microsoft Learn(2025-08) 대조 확인.
>
> **런북:** **`docs/DRY_RUN_RUNBOOK.md`** — 팀 온보딩 런북(원격, relay 상시가동 + WSL 절 포함). **macOS/Linux·Windows(WSL) 팀원 모두 즉시 온보딩 가능** → VPS만 확보되면 배포 실행.
> **코드 잠금해제는 완료됨(0.18.0):** 자기완결 초대 blob — `loom room invite --link` → `loom room join <blob>` 한 명령 join(relay URL+token 내장). R19 approved, 구현·검증·커밋(`2b59dee`). 이제 **초대 하나만 넘기면** 됨(3-비밀 문제 해소).
>
> **A1 설치 경로도 완료됨(0.19.0):** `scripts/install.sh` (`curl … | bash`) — Bun 확보→clone→link→verify→PATH. 이제 초대받은 낯선 사람은 **한 줄 설치 + `loom room join <blob>`**. R20 approved, 구현·검증·커밋(`a9cefd0`).
>
> **✅ A3 `loom doctor` shipped (0.20.0, `c15de88`)** — read-only 5섹션 진단(install/home/session/relay/host). R21 M-1..M-4 전부 충족 + L-1..L-3 author-close, 아키텍트 검증(bun test 180/0, 라이브 exit 0). **codex-impl 레인(GPT-5.5) 구현** — 이번 세션에 위임 워크플로 복원(아래 프로세스 노트 참조).
>
> **⏩ 다음 세션 큐 = OPS 2머신 dry-run (제품 검증 0 → 최고가치).** 코드 경로는 A1(설치)+invite(join)+A3(doctor)로 완비됨. 이제 실사용 검증만 남음(사용자/2번째 머신 필요, 아래 4단계).
>
> **그다음(코드 아님, OPS/실사용, 사용자 필요):**
> 1. **relay를 도달 가능한 호스트에 배포** — `apps/relay-cloud/README.md` 경로(VPS/LAN, `--host 0.0.0.0 --token …`, H-5). 로컬(loopback)이면 blob이 타 머신에서 안 됨(M-2 경고).
> 2. 그 relay에서 `room create` → `room invite --link`로 blob 생성.
> 3. **2번째 머신**: `curl -fsSL https://raw.githubusercontent.com/lemonbalms/Loom/main/scripts/install.sh | bash` → `exec $SHELL` → `loom room join <blob>` → **시간 측정(목표 5분)**. install.sh 실경로 마찰이 A2 관찰 대상.
> 4. 첫-5분 마찰(A2)·수요 신호 1줄(A4) 기록.
> 티어 전체: `docs/DOGFOOD_FEATURES.md`.

---

## One-line resume

> **⏩ 이번 세션(07-17) = Loom×Herdr 브릿지 설계서 shipped (`85e7829`).** 다음 = **Step 0 WSL2 PoC**(오너 Windows 머신) → **Step 0.5 herdr 실측** → PLAN 0.22.0 게이트(FREEZE 예외 오너 확인) → R23 → 구현. 설계서 = `docs/HERDR_DESIGN.md`(§0 요약·§5 롤아웃·§6 게이트가 진입점). 코드 변경 없음(docs+brand만), bun test 195/0 그대로. VPS 블로커는 별개 트랙으로 여전히 오픈.
>
> **(이전) 목적지 재확정 = 내부 6인 팀 채택(adoption).** 효용 확정 전제(내부 도구) → 수요검증 프레임 폐기, FREEZE는 "팀-pull된 요구만 구현"으로 근거 교체. **다음 2갈래:** ①팀-pull 유일 실기능 = **Windows 온보딩 경로**(팀에 Windows 사용자 있음 확인 · `install.sh` bash 전용 → PLAN 게이트 후 구현, 접근법 오너 확인) ②**relay 공용 호스트(VPS) 확보 = 오너 블로커**(아직 없음). 런북 = `docs/DRY_RUN_RUNBOOK.md`(팀 온보딩판). 코드 3종(설치·invite·doctor) 완비, bun test 180/0. 상세 판정 = ⭐ 블록.
>
> PLAN **0.19.0** `approved` (R20) — **Tier A1 5분 설치 경로 shipped (code)**:  
> `scripts/install.sh` (`curl \| bash`): Bun 확보→clone(~/.loom-src)→`bun link`→절대경로 verify→shell rc PATH append. `loomCmd()` helper로 share/next 힌트를 설치 시 `loom`으로 표시(미설치 시 `bun run loom` fallback). R20 binding M-1..M-4 준수, L-1..L-4 author-close.  
> **Code + PLAN both 0.19.0.** `bun test` **175 pass / 0 fail**, 6 pkg typecheck green, shellcheck clean, 격리 install.sh 라이브 smoke ✅. Committed (`a711478` plan, `a9cefd0` impl); **push pending / done this session**.
> **이전(0.18.0):** self-contained invite blob (`2b59dee`, R19) — join 3-비밀 해소. 이번 0.19.0이 설치 반쪽 해소 → 이제 초대받은 낯선 사람은 한 줄 설치+한 명령 join.

---

## Where we are

| Item | Value |
|------|--------|
| **CLI / code** | **0.21.1** (`loom run claude --inject-handoffs`) — implemented + **fully verified** (mechanical + real-Ink), pushed |
| **PLAN** | **v0.21.1** `approved` → implemented (R22, `d05d714`) — PTY handoff inject |
| **Open blocking** | **none** — R22 구현·검증·라이브 스모크 전부 완료. flag 개방 가능 |
| **Tests** | `bun test` **195 pass / 0 fail** (+5 `inject-live.test.ts`) · 6 pkg typecheck green · biome touched clean |
| **Latest** | `85e7829` **Herdr 브릿지 설계서** · `eccc23a`/`c825808` 브랜드 에셋(마스코트·파비콘·앱아이콘) · `f795c81` handoff · `a5808dc` A2 관찰 항목(runbook) |
| **Design queue** | `docs/HERDR_DESIGN.md` — Step 0 WSL2 PoC → Step 0.5 herdr 실측 → PLAN 0.22.0(`pending-review` 예정) → R23 |

### Already shipped (context, don't redo)

| Area | Version |
|------|---------|
| Durable inbox | 0.14.x |
| Purpose + verify | 0.15.1 |
| Work bus (board→handoff, `loom work`) | 0.16.1 |
| **Launcher UX (up/down, auto-host, work-first)** | **0.17.1** |

### Naming
**Loom** = product · **Fable 5** = review agent

---

## What shipped in 0.17.1 (this wave)

| Area | Change |
|------|--------|
| **M-27** | `sticky-meta.ts` `pidLooksLikeStickyHost(pid)` (ps cmdline ~ `sticky-main.ts`); `stopStickyHostProcess` gates raw SIGTERM on it — else clear meta + warn ("NOT killed (M-27)") |
| **M-28** | `cmdUp`/`cmdDown` process profiles **sequentially** (no `Promise.all`), `setActiveProfile(explicit)` per profile before spawn/stop |
| **Auto-host** | `cmdRoomCreate`/`cmdRoomJoin` call `autoHostAfterSession(flags)` before exit; fail-soft; `--no-host` / `LOOM_NO_AUTO_HOST=1` opt-out; success prints `host auto-started …` |
| **CLI** | `loom up [--profiles a,b] [--status]` / `loom down [--profiles a,b]`; dispatch + usage + BOOLEAN_FLAGS (`no-host`, `status`) |
| **L-33** | `bunfig.toml` preload `scripts/test-setup.ts` sets `LOOM_NO_AUTO_HOST=1` for `bun test` |
| **Script** | `scripts/dogfood-up.sh` + `dogfood:up` alias (join-all w/ auto-host suppressed, then batched `loom up`) |
| **Tests** | `packages/host/src/sticky-down-safety.test.ts` (M-27 guard: unrelated alive pid not killed) |
| **Docs** | USER_GUIDE §3 (host default + up/down), DOGFOOD_LOOP §1 (dogfood:up journey + L-34 8s note), PLAN 0.17.1, plan_review R18 closed, VERSION 0.17.1 (CLI + MCP) |

---

## This session (2026-07-17 PM) — Herdr 브릿지 설계서 + 브랜드 에셋

| 영역 | 결과 |
|------|------|
| **브랜드 에셋**(`c825808`·`eccc23a`) | `assets/brand/` 6종(Twemoji 기반 spider/web, 커스텀 컬러, CC-BY 4.0) · README 제목 마스코트 + Credits 절 · 데스크톱 파비콘(`apps/desktop/ui/` — frontendDist가 `../ui`라 상대경로) · `bunx tauri icon`으로 앱 아이콘 17종 재생성(SVG 소스라 전 크기 선명). android/ios 생성분은 삭제(데스크톱 전용 유지) |
| **Herdr 권고 문서 분석** | 오너가 가져온 `loom-herdr-architecture.html`(Loom×Herdr 분산 오케스트레이션 권고) 정독 — Windows=타워/herdr=Linux·Mac·WSL만/브릿지 필수/이벤트 드리븐/카드는 board 소유. → `docs/`에 아카이브 |
| **설계서 작성**(`85e7829`) | **오케스트레이션 워크플로 12 에이전트**: 정찰 4(protocol/relay·MCP/board·adapters/CLI·docs 관례, 전 사실 file:line) → 섹션 초안 4(브릿지 데몬·계약·생애주기/보안·롤아웃) → 적대적 검증 4(초안 주장 vs 실코드 grep 대조). **검증이 잡은 WRONG 5건 교정**: ①`[GOAL] intent:` 한 줄 형식은 파서(줄-시작 정규식) 미매치 → 헤더 독립 줄 + `task:` 키 통일 ②peerSecret은 rejoin에도 매번 응답 ③TASK_ID_RE 위치 ④MCP 배열 인자 선례(set_purpose) ⑤attachment 소비 패턴 인용 라인 |
| **설계 충돌 2건 판정** | wire에 argv 금지(agentKind만, argv는 브릿지 로컬 allowlist — 임의명령 원격실행 차단, M-24 동형) · 슬라이스는 at-most-once(crash 저널은 §2.6 확장 1순위로 보존) |
| **[가정-H] 등급화** | herdr 쪽 주장 전부(소켓/메서드/이벤트/seq/AGPL/버전)는 권고 문서 인용일 뿐 레포 미검증 → 설계서 §0.1 일괄 마커 + **Step 0.5 실측 게이트** 신설 |
| 코드 변경 | **없음** (docs+assets만, FREEZE 준수 — herdr 구현은 PLAN 0.22.0 게이트 통과 후) |

---

## This session (2026-07-13 PM) — 외부 비교분석(Loom vs MoAI) 검증 + A2 관찰 항목 등록

| 영역 | 결과 |
|------|------|
| **외부 분석 검증** | 오너가 가져온 Loom↔MoAI(tmux) 비교 분석의 Loom 쪽 피드백 3건을 코드 대조. ① **chat 미persist = 의도된 설계 확인**(`relay/persist.ts` `RoomSnapshotV1` = room/members/inboxes만 — 미구현 아님) ② **envelope 모델/effort 힌트 필드 = 기각** — `envelope.ts` Zod 스키마가 non-strict(strip)라 optional 필드는 나중에도 v2 없이 하위호환 추가 가능 + 오너가 이미 effort 매트릭스를 드리프트로 판정 ③ **보드 로컬 파일(relay 미동기) = 유일한 유효 구조 갭**(`task-board.ts:6` 주석 자인) — 단 FREEZE라 구현 대신 관찰 등록 |
| **A2 관찰 항목 등록**(`a5808dc`) | `docs/DRY_RUN_RUNBOOK.md` Step 4 표에 2행 추가: **보드 불일치 체감?** / **chat 유실 아쉬움?** — dry-run에서 팀이 겪으면 팀-pull 요구로 승격(FREEZE 통과 경로), 안 겪으면 안 만들 근거. docs-only, pushed |
| 코드 변경 | **없음** (FREEZE 준수) |

---

## This session (2026-07-11 PM #3) — A3 doctor ship (delegated) + 위임/effort 프로세스 규칙

| 영역 | 결과 |
|------|------|
| **위임 워크플로 복원**(`dc83d2b`) | 아키텍트(세션 모델)가 R21 locked 스펙을 **직접 코딩 시작한 실수** → 사용자 교정. grok 하나 죽은 걸 "impl 레인 불가"로 넘겨짚고 살아있는 codex 레인 미확인. 규칙 성문화: 세션 모델은 approved/locked 스펙 직접 코딩 금지, **grok-impl→codex-impl→하위모델 서브에이전트** 에스컬레이션. `AGENTS.md` Standing rules + `docs/DOGFOOD_LOOP.md §1.2` + `tasks/lessons.md` |
| **model×effort 규칙**(`88d0dc7`·`bd30a36`·`ac6e460`) | Fable 5 자문 3회 경유. 매트릭스 폐기 → §1.2 두 줄: locked-spec→`sonnet`+`xhigh`, trivial→`haiku`(effort 미전달 — **Haiku 4.5는 effort 노브 없음, 세팅 시 하드 에러**). 기준=spec-lockedness. "하위 tier→고effort 사다리" 인코딩 금지 |
| **A3 `loom doctor` ship**(`c15de88`) | **codex-impl 레인(GPT-5.5) 구현** → 아키텍트 검증. `doctor.ts`(순수 로직)+`cmdDoctor`(I/O)+dispatch+테스트5개. M-1(직접/health+3s)·M-2(loadStickyMeta+isPidAlive)·M-3(exit)·M-4(no-session=info) 전부 충족. read-only deviation: `resolveStateHomeDir` 마이그레이션 부작용 회피 위해 home/session 경로 hand-roll(implementation-notes 기록). VERSION 0.20.0(CLI+MCP) |
| **host 테스트 위생**(`80e951e`) | codex가 스코프 밖 3개 테스트에 `LOOM_TEST_HOME` 격리+relay 포트 재시도 추가(실 `~/.loom` 오염 방지). 검증 후 별도 커밋 분리 |
| 검증 | `bun test` **180 pass/0 fail**(+5 doctor) · 6 pkg typecheck · biome clean(doctor 파일) · 라이브 `loom doctor` exit 0 |

### ⚠ 운영 노트 (다음 세션 주의)
- **위임 우선**: approved/locked 스펙은 직접 코딩 말고 레인 위임. 매 세션 레인 가용성 새로 확인(stale HANDOFF 노트 불신). grok 만료 시 `! grok login`, codex는 사용 가능했음.
- **다음 = OPS 2머신 dry-run** (아래 4단계). 코드는 완비, 실사용/2번째 머신만 필요.
- **Docker 이미지 잔존** 등 이전 세션 노트 유효.

---

## This session (2026-07-11 PM #2) — A1 install ship + Docker 드라이런 + A3 doctor 게이트

| 영역 | 결과 |
|------|------|
| A1 방향 자문 | `fable-advisor`: A1 = **Option 1 설치 스크립트**(②=fallback, ③ 바이너리 유보). 판정 리스크=PATH 활성화. repo PUBLIC 확인. |
| **A1 게이트→ship**(`a711478`·`a9cefd0`) | PLAN **0.19.0** → **R20 approved**(binding M-1..M-4) → `scripts/install.sh`(curl\|bash: Bun→clone→link→verify→PATH) · `loomCmd()` + 힌트 스윕(spawn·self-ref 제외) · README 원라이너 · VERSION 0.19.0 · impl-notes. 6 pkg typecheck·175 test·shellcheck green |
| **Docker 드라이런 하네스**(`3b6cc0c`) | `test/docker/` Test A(clean ubuntu:24.04 install 냉시동, M-4) + Test B(relay+peerA+peerB 냉설치→**컨테이너 간 오프라인 handoff 수신**). 둘 다 통과 = 2머신 드라이런 단일호스트 대역(QA, 수요검증 아님) |
| **하네스가 잡은 실버그** | install.sh `ensure_path` bash 분기가 `.bash_profile` 부재 시 1 반환→`set -e`로 설치가 ✅ 직전 중단(**Linux bash-login 전멸**, macOS zsh라 smoke 미포착). 수정: `return 0`+`~/.profile`. +`LOOM_INSTALL_REPO`·unzip 힌트 |
| **LAN 배관 점검**(`632bbb4`) | `test/docker/run-lan-check.sh` — relay를 **실 LAN IP(0.0.0.0)** 에 띄우고 컨테이너가 실 IP로 join → 바인딩·방화벽·real-IP 라우팅·blob 실주소·handoff 왕복 검증. `192.168.43.192:7900` PASS. (사다리 2/3) |
| **A3 `loom doctor` 게이트**(`1ad0c26`) | 사용자 지시 "게이트만, 구현은 다음 세션". PLAN **0.20.0** → **R21 approved**(binding M-1..M-4) → UNKNOWNS·plan_review R21. **코드 미착수.** Fable가 read-only 위반 2건(`ensureRelay` spawn·`resolveAliveHostMeta` 삭제) 사전 차단 |

### ⚠ 운영 노트 (다음 세션 주의)
- **다음 세션 큐 = `loom doctor` 구현** (0.20.0 approved). PLAN 0.20.0 + R21 읽고 바로 구현. M-1 `ensureRelay`금지·M-2 `resolveAliveHostMeta`금지(read-only 보장).
- **grok CLI 인증 만료** — 기본 impl 레인 불가. 복구: `! grok login`. (이번 세션은 아키텍트 직접 구현.)
- **격리 smoke 주의** — HOME override로 install.sh 돌려도 `bun link`/`bun pm bin -g`는 실 `~/.bun` 사용 → 글로벌 링크 오염. smoke 후 `cd packages/cli && bun link`로 복구 필수.
- **Docker 이미지 잔존** — `loom-test-clean`(262MB)·`loom-test-ready`(688MB) 남음(재실행용). 정리: `docker image rm loom-test-clean loom-test-ready`.
- **dogfood room 소멸** — 재개 시 `bun run dogfood:room --fresh` → `bun run dogfood:up`.

---

## Prev session (2026-07-11 PM #1) — dogfood loop, one full turn

| 영역 | 결과 |
|------|------|
| 플러그인 | fable-advisor **v3.0.0 → v3.1.0** 업데이트(codex 레인 GPT-5.5→GPT-5.6 Sol), 구 캐시 정리 |
| 도그푸드 문서 | 루트 `index.md`(문서 인덱스+최신성) · `docs/DOGFOOD_FEATURES.md`(Tier A~D 기능 리스트업) 신설 |
| UC 신설 | `TEST_PLAN.md` **UC-12/13/14**(Launcher UX / Work bus / Purpose+verify) — 실제 CLI 표면 근거 |
| 라이브 검증 | `dogfood:up` 5호스트 실구동 → UC 핵심 경로 ✅; 초안 오류 2건 정정, 실배송 버그 1건 발견 |
| **버그 수정** | **중복 peer**(`bcd7504`): room join 재조인 시 정체성 재사용(+`peer_auth_failed` fallback), relay `findPeerByName` online 우선. 자문(Fable)→codex(GPT-5.6 Sol) 구현→아키텍트 검증→라이브 재현 |
| **0.18.0 자기완결 초대**(`2b59dee`) | 정식 게이트 완주: PLAN 0.18.0 작성 → **R19 approved**(fable-advisor) → 구현(codex, M-1/M-2 bound) → 아키텍트 검증(diff·test 175·격리 라이브 스모크) → author-close 커밋. `invite --link`/`join <blob>` |
| 정리 | 5호스트 down, relay 재시작(새 코드), 구 비영속 room 소멸(테스트 태스크 정리됨) |

### ⚠ 운영 노트 (다음 세션 주의)
- **grok CLI 인증 만료** — 기본 impl 레인 사용 불가. 복구: `! grok login` (사용자 실행). 이번엔 codex 레인으로 우회함.
- **dogfood room 소멸** — `.loom/dogfood-room.env`의 `LOOM-UPSJ` 죽음. 재개 시 `bun run dogfood:room --fresh` → `bun run dogfood:up` (이제 재조인해도 중복 peer 없음).
- **미검증 UC**(낮은 우선순위): 13.E work watch, 13.F/14.G MCP 경로, 14.F claim 계약.
- 유보 항목: 기존 stale peer GC(L-29), name-dedup-on-join.

---

## Next session playbook

### 1) Status (30s)
```bash
cd /Users/kyoungsiklee/projects/fable-advisor
bun run status
```

### 2) Optional manual smoke (not a blocker; L-33 keeps `bun test` clean)
```bash
# real dogfood online path (spawns background hosts):
bun run dogfood:up -- --status     # report only
# or full: bun run dogfood:up   →   bun run loom down --profiles impl,claude-impl,codex-impl,claude-rev,codex-rev
```

### 3) 다음 세션 큐 = Herdr 브릿지 트랙 (설계서 §5·§6 순서 고정)
설계서 `docs/HERDR_DESIGN.md` — §0 요약 먼저 읽을 것. 순서:
1. **Step 0 — WSL2 네트워킹 PoC** (오너 Windows 머신 필요, §5.1 체크리스트 ①~⑥ 그대로): mirrored 모드 → relay LAN 바인딩 → WSL 안 `/health` + `loom room join` 왕복 → 30분 장기 연결 관찰. 산출물 `docs/spikes/STEP0-WSL2-NETWORKING.md` (PHASE-1.5-PTY 골격). **no-go면 본 설계 밀지 말고 역방향 배치를 다음 spike로.**
2. **Step 0.5 — herdr 실측** (§5.2 체크리스트): [가정-H] 전량 재확정 + 실물 요청/응답 fixture 캡처(fake herdr 테스트의 근거). **이 전에 브릿지 코드 착수 금지.** 어긋난 항목은 설계서부터 갱신.
3. **PLAN 0.22.0 편입** (§6.1): `pending-review` + **FREEZE 예외 = 오너 pull 한 줄 필수** + UNKNOWNS Gate log(§6.2 초안 복사) → R23(claude-rev + fable-advisor 필수) → approved 후 구현.
- ⚠ Step 0·0.5 둘 다 오너 환경(Windows/WSL) 필요 — 이 Mac에서 자율 진행 가능한 부분은 없음. 오너 없이는 fake herdr 테스트 하네스 사전 구축도 fixture 없이는 Next-action test 위반(상상 속 프로토콜 검증) 소지 — 하지 말 것.

### 4) 병행 트랙 = OPS 2머신 dry-run (VPS = 오너 블로커, 여전히 오픈)
relay 배포 → `room invite --link` blob → 2번째 머신 `curl … install.sh | bash` → join → 5분 측정 · A2/A4 기록. 네트워크 배관은 `test/docker/run-lan-check.sh`로 사전 검증 가능. **Step 0 PoC와 같은 Windows 머신 세팅을 공유하므로 오너 시간 확보 시 묶어서 진행 권장.**

---

## Plan pointer
Read: **`docs/HERDR_DESIGN.md`** (신규 설계서 — §0 요약·§5 롤아웃·§6 게이트) · `docs/PLAN.md` Changelog **0.21.1** (PTY inject, shipped+verified — 최신 approved 게이트).  
Review: `docs/plan_review.md` **R22** (closed, shipped) — 다음 게이트는 **R23**(PLAN 0.22.0 herdr 브릿지, Step 0/0.5 통과 후 오픈 예정).  
Harness: `test/docker/` (install 냉시동 · 2컨테이너 join · LAN 배관) — 전부 green.
