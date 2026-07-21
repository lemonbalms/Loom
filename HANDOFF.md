# HANDOFF — Loom (next session)

**Date:** 2026-07-21  
**Workspace:** `/Users/kyoungsiklee/projects/fable-advisor-pane-death-authority`
**GitHub:** https://github.com/lemonbalms/Loom (`design/pane-death-authority-boundary`)
**Language:** user often Korean · **Autonomy:** brief status → execute gate (no mid-wave "할까요?")

> ### Windows에서 볼 때
> **→ [`HANDOFF_WINDOWS.md`](./HANDOFF_WINDOWS.md)** — **git pull 후 Windows 전용 실행 핸드오프**  
> (Step 0 사실 + ⭐ **Tailscale 팀 공용 relay 상시화** 복붙 절차). 제품 코드는 Mac만.  
> 이 파일(`HANDOFF.md`) = Mac/다음 세션 에이전트 진입점.

---

> 종결 웨이브 역사 기록: docs/HANDOFF_ARCHIVE.md (이 파일은 최신 상태만 유지)

> **활성 함정 · 하지 말 것** → [`tasks/traps.md`](./tasks/traps.md) (세션 시작 시 자동 주입)

## ⭐ Current action (read first)

> **🎯 즉시 게이트 = TEST-BASELINE PATCH.** PANE-DEATH authority cut PLAN v0.27.0 revision A는
> `approved`(R43b author-close)이지만, 현행 `main`에서도 relay/WebSocket 연결 직후 실패가 재현돼
> 전체 suite가 568 pass/14 fail이다. 따라서 **v0.27 red test보다 먼저** 이 베이스라인 결함을
> 별도 PATCH로 진단·해소하고 green을 복구한다. authority-cut 정본은
> **`docs/spikes/PANE-DEATH-AUTHORITY-BOUNDARY.md`**, 현재 **제품 코드 변경 0**.

### 다음 액션 (우선순위 · 유일 섹션)

0. **⭐ G0 TEST-BASELINE PATCH — v0.27과 섞지 않음**

   - 재현 시작점: `bun test packages/host/src/relay-client.l4.test.ts` — 변경 없는 `main`에서도
     `WebSocket error connecting to ws://127.0.0.1:<random>/ws`로 0/1 fail.
   - 실제 server-ready/connect 호출 사슬을 따라 원인을 확정한다. test harness 수정으로 충분하면
     그 범위만 PATCH; **제품 relay 동작 변경이 필요하면 코딩 전에 PLAN PATCH를 먼저 연다.**
   - 완료 증거: 대표 격리 테스트 green + 전체 `bun test` **3회 연속 green**. 다른 워커/전체
     suite와 동시 실행하지 않는다.

1. **G1 v0.27 preflight scan — G0 green 이후**

   repo producer/consumer 전역 scan과 외부 consumer/body-only automation 존재 여부를 기록한다.
   외부 consumer가 있으면 rolling-upgrade gate를 확정하기 전 다음 단계로 가지 않는다.

2. **G2 v0.27 tests-only red commit — G1 이후**

   설계 §8의 Tower guard 순서·bridge proposal-only·Flight-less issuer·auto-close 0·양방향 rolling
   upgrade 테스트만 추가한다. **production 변경 없이 기대한 이유로 red임을 확인한 뒤 tests-only로
   커밋**한다. G0의 실패 로그는 이 red 증거를 대신할 수 없다.

3. **G3 구현 위임 — G2 커밋 이후**

   승인 설계와 red commit을 `grok-impl` → `codex-impl` → lower-tier 순으로 위임한다. 아키텍트는
   hand-code하지 않는다. **불변식:** remote result는 board `done`을 만들지 않고 card 자동
   `pane.close`는 0이다. strict ACK/outbox/seq 재설계/cleanup grant는 이 버전에 합치지 않는다.

4. **G4 독립 검증·ship — G3 이후**

   관련 단위/통합·스모크 → 아키텍트 전체 `bun test` green → docs/HANDOFF/todo 동기 → source/dist
   순서로 commit/push. 어느 게이트도 앞 단계의 실패를 뒤 단계의 증거로 대체하지 않는다.

**선후관계 정본:** `G0 baseline green → G1 scan/rollout gate → G2 tests-only expected red →
G3 delegated implementation → G4 independent green/ship`. 현재는 **G0만 실행 가능**하다.

**현재 증거:** `bun run status` approved/Open 없음 · `handoff:lint` · `git diff --check` green.
샌드박스 밖 전체 suite 568 pass/14 fail, `--max-concurrency=1`도 동일 14 fail. 변경 없는 `main`의
대표 테스트에서도 재현했으므로 설계 diff 회귀는 아니지만, **운영상 implementation gate는 닫혀 있다.**

**Git 상태:** authority-cut 설계 baseline은 `6d4b384`로 원격 branch에 push됐다. 그 뒤 추가한
후속 후보 문서는 docs-only 변경이다. **reset/폐기하지 말고 이 워크트리에서 G0부터 이어간다.**
`git status --short`로 범위를 재확인하되 제품 코드 변경은 없어야 한다.

5. **후속 MINOR 후보 — 역할·권한·프로필 통합 (G4 후)**: `<agent>-<role>` canonical identity,
   `codex-arch`, identity-neutral MCP, role-aware 권한/guard. 정본
   `docs/spikes/ROLE-PERMISSION-PROFILE-UNIFICATION.md`. 현재는 candidate design이며 P0 실측 전
   PLAN 승격·구현 금지.
6. **HOOKCACHE-D-VERIFY 재개 (G4 후)**(펼쳐보기).
7. **RULE-ENFORCEABILITY 적용 결정**(펼쳐보기).

<details>
<summary>R43 rejected 초안 역사 근거 + 후속 트랙 부연 (비규범, 펼쳐보기)</summary>

> 아래 (0)은 R43가 폐기한 결합 설계의 역사 증거다. v0.27.0 구현 지시로 사용하지 않는다.
> 현재 정본은 `PANE-DEATH-AUTHORITY-BOUNDARY.md`와 PLAN revision A다.

- (0) **R43이 밝힌 놓친 전제 2건 (아래 지적 다수의 공통 근인 — 재작업 전 필독)**: **P** `sendFailedResult` 호출자 7곳 중 **3곳(`:850`·`:1114`·`:1204`)에 Flight가 없다**(spawn 이전·cardId조차 추정). 흡수 상태·durable alert·타이머를 **둘 곳이 없다** → D4·D5·D6 동시 붕괴. **Q** 전역 `cardSeq`는 result 시퀀스가 아니라 **per-card dispatch attempt 카운터**(`:1124` "Fix 2 (live-measured)")이고 소비처가 **herdr agent name 유일성(`:1192`)·hook 소켓 경로(`:1141`)**다 — PLAN이 "누수"라 부른 성질이 **요구사항**이다. 삭제하면 live-measured 수정의 회귀.
- (0) **착수 전 함정 3건 + 3차 리뷰 배관 정정** → `PANE-DEATH-DESIGN.md` **§6.7-bis**. 요약: `void`→`await` 단순 승격은 이중 발행 방어를 **약화**시킴 · strict ACK 본체는 `sendResult` 시그니처 교체 · `recipientCount=1`은 실측 전 금지.
- (0) **좌표는 코드가 SSOT** — R43이 드리프트 6건 적발. `sendResult`는 `:2408-2434`(문서 `:2415-2440` 아님) · `sendFailedResult`의 관측 호출은 `:2395` · 호출지점 **18개(7·11)** · **가드 5곳**(`:2003 :2019 :2067 :2080 :2096` — `:2019`가 정상 완료 경로의 유일 방어) · **`disposeCardFlight` 호출 15곳**(PLAN은 6곳만 나열 — 순서 역전 대상이 6인지 15인지 미답, 부분 역전 시 latch가 일부 경로에서만 발화).
- (0) **(C) 경계**: 브릿지는 **자동 `done` 커밋 안 함** → 완료 후보는 단일 소유자가 멱등 `needs_verification`(board `blocked`)으로 전달, **사람이 워킹트리 독립 검증 후 확정**. 자동 `blocked`는 **결정적 부정 증거**(permission block·generation 결속 연속 absence)에만. 불확실한 status/scrape/timeout은 **알림만**(result 확정·close·dispose 금지). 자동 cleanup은 사람 확정 + tower receipt 뒤에만.
- (0) **종결 맥락**((C) 전환 근거 · 증거 명제표 P1~P7 · 미실측 상수 지위) → 정본 `PANE-DEATH-DESIGN.md` §6.0-bis·§6.6, 경위 `docs/HANDOFF_ARCHIVE.md`. **요지: hooks는 영원히 자문 신호**(커밋 트리거 승격 금지) · **cadence·타임아웃은 가역 행동만 유발**(correctness 근거 금지 — R43 H2가 이 원칙 위반을 잡았다).
- (0) **잔존 2건**: (C)로 3차 지적 6건 중 **4건만 닫힌다**(중복 발행 · F5·F6). **효과 = "거짓 성공 제거, 중복·유실·고아 존속"** → PLAN v0.27.0이 겨냥.
- (0) **원장**: 3차 = `docs/reviews/PANEDEATH-CODEX-REVIEW3.md` · **4차 = `docs/reviews/PANEDEATH-R43.md`**(High 6·Med 5·Low 1 + 미확인 7항 + 2레인 수렴표). R43 검증은 **in-harness Claude가 로컬 `codex-cli 0.144.6`을 병행 구동한 2레인** 산출이고 **두 레인이 독립적으로 reject 수렴**했다.
- (0) **아키텍트 인용 결함 → 교훈 (38) `tasks/lessons/verification.md`**: 같은 세션 **4회 재범**(핸드오프만·락 5 본문만·락 8 표만·문서 좌표만). **규칙: 락을 권위로 인용할 때 단위는 줄이 아니라 블록 전체(본문+표+註+예외).** 설계 문서는 개정을 겪어 **자기모순이 기본값에 가깝다** — 충돌 발견은 결함 보고 대상이지 유리한 쪽을 고를 근거가 아니다.

- (HOOKCACHE-D-VERIFY) `blocked`, 아키텍트 독립 검증 완료. 보드 `task_c636c29485a4ae2b`, pane 4회 발사 모두 위 결함으로 미완. 검증 상세: 유닛 13/13 · `check:mem-header` OK — 이 검증은 이중 확인.
- (RULE-ENFORCEABILITY) 정본 `docs/spikes/RULE-ENFORCEABILITY.md` §7 판별표·§7.1 우선순위. 문서에만 있어 4/4 위반된 규칙(스킬 로드·board claim·pane 우선·마커 echo 오탐)의 층 이동 결정·구현. 보탬 2건: (a) 압축 후 receipt 무효화 여부 (b) 마커 검출 후 미종료 → 알림 미전달.

</details>
4~8. 대형 트랙 미정 · R{n} 유예 · Low 백로그 · npm publish 보류 · `.loom-*` 정리 → `docs/HANDOFF_ARCHIVE.md`.

---

## One-line resume

> **🎯 다음 = G0 TEST-BASELINE PATCH.** 변경 없는 `main`에서도 재현되는 relay/WebSocket server-ready/connect 레이스를 v0.27과 분리해 진단·수정하고, 대표 격리 테스트 + 전체 suite 3회 연속 green을 만든다. **그 전에는 v0.27 red test·구현 위임 금지.** 이후 순서 = G1 scan → G2 tests-only red commit → G3 구현 위임 → G4 독립 green/ship.

---

<details>
<summary>Access cheat-sheet (펼쳐보기)</summary>

### Access cheat-sheet

```bash
# Mac → Windows
ssh -i ~/.ssh/id_ed25519_loom_windows 34970@100.65.103.113

# Windows → Mac (status/파일 — 카드캡처·Taildrop 불가 확정)
ssh -i ~/.ssh/id_mac_auto kyoungsiklee@100.69.230.114

# Bridge (node with herdr) — config 직접 작성 후 bare start
#   `--allow`는 loadBridgeConfig→saveBridgeConfig로 herdrSocketPath를 config에 재주입(env-우선 트랩)
#   → authorizedDispatchers를 config(~/.loom/bridge/<profile>.json)에 미리 넣고 bare `bridge start`.
loom --profile node-wsl-1 bridge start
loom bridge status && loom bridge stop

# WSL 노드 재기동 (SSH 세션 독립 — setsid 필수, /usr/local/bin 심링크 전제)
setsid nohup herdr server >/tmp/herdr.log 2>&1 &
setsid nohup loom --profile node-wsl-1 bridge start >/tmp/loom-bridge.log 2>&1 &

# VPS 노드 (kb, non-root zerocode·sudo 불가 — PATH는 ~/.bashrc 가드 앞 블록으로 해결)
ssh kb    # Tailscale 100.116.39.101, Ubuntu 24.04.4
# 재기동 (bridge 기동은 소스 리포 cwd 필수 — bridge-main.ts 해석)
setsid nohup herdr server >/tmp/herdr.log 2>&1 &
cd ~/.loom-src && setsid nohup loom --profile node-vps-1 bridge start >/tmp/loom-bridge.log 2>&1 &

# 프로세스 생존 확인 — bridge 실체는 `bun run …/bridge-main.ts`
#   `pgrep -f "bridge start"`는 실체를 못 잡음 → `pgrep -f "bridge-main"` 또는 `pgrep -f "bun run"`

# herdr
herdr status   # LOOM_HERDR_SOCKET overrides socket path (tests/fake)
```

</details>

<details>
<summary>Already shipped / done (don't redo) · 실증 확정 사실 · Naming (펼쳐보기)</summary>

### Already shipped / done (don't redo)

| Area | Version / note |
|------|----------------|
| Durable inbox … doctor · PTY inject | 0.14–0.21.1 |
| **loom bridge (Herdr)** | **0.22.0** · PLAN R23 · live herdr smoke |
| Step 0 / 0.5 spikes | done 2026-07-17 |
| dispatch 시연 §3-2 + bun.lock 완수 | M-4 거부 실증 · `1811aa9` 3곳 정렬 |
| **멀티턴 대화 1단계 스펙 차팅** | **wayfinder 맵 #1 완주 · `docs/CONV_SPEC.md`** |

### 실증 확정 사실 (재시도 금지)

- **카드 상태-회신 = 짧은 요약만 신뢰** (~35s 왕복). raw/긴 출력은 pane 스크레이프 붕괴 → 스펙 §5가 이를 32k 임계 + artifact ref로 프로토콜화함.
- **Mac↔Windows Taildrop 불가**(양방향, 샌드박스+버전 스큐) → SSH/scp가 정답.

### Naming
**Loom** = product · **Fable 5** = review agent

</details>

---

## Where we are

<details>
<summary>펼쳐보기</summary>

| Item | Value |
|------|--------|
| **CLI / code** | **0.26.1 shipped** (소스 `47fc81c` · dist `66e0ba1` · push 완료) — dispatch 마커 오표기 교정 + `DISPATCHED_TASK_MARKER`/`wrapDispatchedPrompt` 개명. 직전 **0.26.0** hooks 센서(`0de6c4c` · dist `e1d9177`) |
| **PLAN** | **v0.27.0 revision A `approved`** (R43b author-close — guard 순서·조건부 rollout gate·선행 red-test 커밋 반영). 직전 R43 rejected 초안은 역사 기록 |
| **Open blocking** | PLAN/review blocking 없음. 구현 ship은 production 선행 red-test + 외부 consumer rollout 확인 + 전체 suite green이 필요 |
| **Tests** | 설계 문서 검증 green. 전체 suite **568 pass/14 fail** — 기존 relay/WebSocket 연결 레이스, 변경 없는 main 대표 테스트도 동일 재현. 제품 코드 차집합 0이나 green 주장은 금지 |
| **Verify** | VERIFY-0260 codex pane done — M-1·M-2·L-1..L-3·wire-lock PASS · D6(b)만 FAIL → FIX-0260b로 해소 |
| **Herdr design** | `docs/HERDR_DESIGN.md` · Conv spec `docs/CONV_SPEC.md` · hooks 정본 `docs/spikes/HOOKS-SENSOR-SPIKE.md` |
| **Nodes** | mac-node · Windows relay(durable) · WSL node-wsl-1(부팅 생존) · VPS node-vps-1 / kb(`@reboot`) — loom-dev `LOOM-GT4B` |
| **Boot persist** | 트랙 종료(2026-07-20, 오너 옵션 B) — 상세 lessons platform (17) · 팩 `.loom-boot-persist-pack.md` |
| **Remote** | 설계 브랜치 `design/pane-death-authority-boundary`; suite baseline fail 때문에 아직 commit/push하지 않음 |
| **Spikes** | **현행 정본 `PANE-DEATH-AUTHORITY-BOUNDARY.md`**. 구 `PANE-DEATH-DESIGN.md` 상태기계·락·체크리스트는 비규범 역사 증거. R43 원장과 앞선 리뷰본은 수정 금지 |
| **Untracked (커밋 제외)** | `scripts/check-mem-header.ts`(+test) · `scripts/watch-card.ts`(+test) · `scripts/session-context.test.ts` · `hook-sensor.ts`(+test) · `.loom-*` 브리프/디스패치 · `.playwright-mcp/` 등 |

</details>

> **구현 후로 분류된 미확인 6건**(codex 2차 §4) — 단 **WSL/VPS terminal 종류·지연은 배포 완료 주장 전 필수 스모크**.
> 착수 전 조건 목록 원문(5건→실측 10건 경위 포함) → `docs/HANDOFF_ARCHIVE.md`.

## Strategic context

<details>
<summary>펼쳐보기</summary>

> Loom = 오너 6인 팀 내부 도구.  
> **⭐ MVP 종료 선언 (오너, 2026-07-19): "mvp는 여기서 종료 프로덕션으로 전환."** 0.22.0 브릿지 + conv 멀티턴 + 0.23.x 운영 품질 웨이브(R23–R35)까지가 MVP. 이후 작업은 **프로덕션 단계** 기준으로 판단한다.  
> **다음 제품 트랙 = 멀티노드 단계 3 (오너 확정 2026-07-19: "다음 트랙에서 진행")** — 아키텍처 권고 §06 잔여 단계: **⓪ 단독 모드 기능화(relay 모드 전환 CLI + relay별 신원 병존 — 오너 결정 2026-07-19)** → 기능으로 Windows relay 복귀 → WSL/Linux 노드 브릿지 복제 → `@node` 라우팅 → SSH/git 전송 자동화 유예분 점진 도입(fetch 자동 실행은 R{n} 재리뷰 필수 — R26:431 유예). **멀티노드 out of scope 해제.**  
> 순서: 멀티노드 트랙 진행 중 — ⓪ 단독 모드·① Windows relay 복귀·①-b relay 룸 영속화·② WSL 노드 브릿지 복제·③ Linux/VPS 노드 브릿지 복제·④ `@node` 라우팅 운용·ⓐ artifact fetch 자동 실행 도입(v0.25.0 `conv_fetch` R40 approved+구현 `b343ada`+D10 라이브 스모크 완주) 완주, **다음 = 노드 부팅 생존 상시화(WSL systemd/Task + kb `systemd --user`)**.  
> 공용 relay = **Windows durable relay 상시(Tailscale `100.65.103.113:7842`, 재로그온 룸 유지)** + 로스터 7종 win 바인딩 + **WSL 노드(node-wsl-1) + VPS 노드(node-vps-1) 합류**. 온보딩 = `docs/DRY_RUN_RUNBOOK.md`.  
> 저널·supervision은 여전히 out of scope. wire 변경은 CONV_SPEC 승인 범위 내에서만.

</details>
