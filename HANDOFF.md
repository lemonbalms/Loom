# HANDOFF — Loom (next session)

**Date:** 2026-07-20  
**Workspace:** `/Users/kyoungsiklee/projects/fable-advisor`  
**GitHub:** https://github.com/lemonbalms/Loom (`main`)  
**Language:** user often Korean · **Autonomy:** brief status → execute gate (no mid-wave "할까요?")

> ### Windows에서 볼 때
> **→ [`HANDOFF_WINDOWS.md`](./HANDOFF_WINDOWS.md)** — **git pull 후 Windows 전용 실행 핸드오프**  
> (Step 0 사실 + ⭐ **Tailscale 팀 공용 relay 상시화** 복붙 절차). 제품 코드는 Mac만.  
> 이 파일(`HANDOFF.md`) = Mac/다음 세션 에이전트 진입점.

---

> 종결 웨이브 역사 기록: docs/HANDOFF_ARCHIVE.md (이 파일은 최신 상태만 유지)

> **활성 함정 · 하지 말 것** → [`tasks/traps.md`](./tasks/traps.md) (세션 시작 시 자동 주입)

## ⭐ Current action (read first)

> **🎯 PANE-DEATH (C) — PLAN v0.27.0 작성 완료, R43 검증 대기 (2026-07-21).** 구 "수정 3건" 중 2건은 `2ca6748`에서 이미 해소(핸드오프 스테일), 남은 1건은 **상태기계 변경**이라 PLAN 승격. 산출 = 좌표 재실측 · D12 락 정합 · §6.7-bis · PLAN §0.27.0. **코드 무변경.**

### 다음 액션 (우선순위 · 유일 섹션)

0. **⭐ PANE-DEATH (C) — PLAN v0.27.0 `pending-review` R43 발주됨 (codex 레인)**
   > **불변식:** 불확실한 관측은 **회복 가능한 행동만** 유발한다. 비가역 행동(result 발행·`pane.close`·dispose)은 **결정적 증거 또는 멱등 경로에서만**.

   **PLAN = `docs/PLAN.md` §0.27.0** — 선결(D1 ACK 실측 · D1-b 순서역전 회귀 실측 · D2 주입 표면) → 본체(D3~D6) → 검증(D7·D8). **R43 author-close 불가.** **D5 함정(구현자 필독): 순서 역전 없이 latch만 얹으면 영원히 발화하지 않는 죽은 코드가 된다** — 원자 단위 = {순서 역전 + 소유권 불리언 + latch}. 정본 → **§6.7·§6.7-bis**.

1. **통합 테스트 flake — 트랙 후보(오너 결정)**: 스위트 3회에 **매번 다른** conv/scrape 실패(단독은 6/6 green). 변경 무관 확정. **방치 시 green 판정이 흐려진다**(펼쳐보기).
2. **HOOKCACHE-D-VERIFY 재개 (0번 후)**(펼쳐보기).
3. **RULE-ENFORCEABILITY 적용 결정**(펼쳐보기).

<details>
<summary>0 적용 내역 + 1·2·3 부연 설명 (펼쳐보기)</summary>

- (0) **착수 전 함정 3건 + 3차 리뷰 배관 정정** → `PANE-DEATH-DESIGN.md` **§6.7-bis**. 요약: `void`→`await` 단순 승격은 이중 발행 방어를 **약화**시킴 · strict ACK 본체는 `sendResult` 시그니처 교체 · `recipientCount=1`은 실측 전 금지.
- (0) **(C) 경계**: 브릿지는 **자동 `done` 커밋 안 함** → 완료 후보는 단일 소유자가 멱등 `needs_verification`(board `blocked`)으로 전달, **사람이 워킹트리 독립 검증 후 확정**. 자동 `blocked`는 **결정적 부정 증거**(permission block·generation 결속 연속 absence)에만. 불확실한 status/scrape/timeout은 **알림만**(result 확정·close·dispose 금지). 자동 cleanup은 사람 확정 + tower receipt 뒤에만.
- (0) **(C) 전환 근거 요약**(전문 → `docs/HANDOFF_ARCHIVE.md`): 규칙 7이 이미 `card.done`을 자문 등급으로 격하했다(fable) · **단 "3연속 reject = 기질 탓"은 기각**(codex — High-2는 아키텍트 결함) · **규칙 7 완화는 보류이지 포기 아님** · herdr 수렴 등급 **B+**, "Loom 신뢰 ≤ herdr 등급" 원칙은 **과도로 기각**.
- (0) **잔존 2건**: (C)로 3차 지적 6건 중 **4건만 닫힌다**(중복 발행 · F5·F6). **효과 = "거짓 성공 제거, 중복·유실·고아 존속"** → PLAN v0.27.0이 겨냥.
- (0) **증거 명제표(P1~P7) 채택** — `hookHint 우선` 전역 우선순위 **폐기**. 센서는 명제별 등급(`A/C/S/N`)만 갖는다. **P4(relay 수락) = strict ACK + CAS만 `A`** · **P7(의미상 완료) = lifecycle 센서로 절대 확정 불가** · P1(프롬프트 소비)은 현행 센서로 확정 불가(nonce 결속 receipt 필요). **hooks = 영원히 자문 신호**(커밋 트리거 승격 금지). herdr 등급은 **보수적 prior**일 뿐 권위 근거로 수입 금지(Loom 신뢰도 ≤ 어댑터가 **독립 검증한 명제 coverage**).
- (0) **미실측 상수 지위**: cadence·타임아웃은 **알림·재평가 등 가역 행동만** 유발. correctness 근거 금지, 실측 선결조건도 아님. `present` 응답의 **카운터 리셋 규정 필수**(3차 High-2).
- (0) **3차 원장 전문** = `docs/reviews/PANEDEATH-CODEX-REVIEW3.md`. 아키텍트 자기 결함 이력 → `tasks/lessons/verification.md`(범위 축소 재범 4회).

- (1) 실증: 부하 시 `R26 §5.2`+`scrape-delta ④`, 조용할 때 `conv R28 L-1`. 스위트 285s(정상)에서도 발생 → 기아만이 원인 아님. 회귀 아님 근거 = 베이스라인·변경분 각 3회 16 pass/0 fail 동일 · 변경 파일 import 테스트 0건. 남은 가설 = 포트/소켓·타이밍 경합.
- (2) `blocked`, 아키텍트 독립 검증 완료. 보드 `task_c636c29485a4ae2b`, pane 4회 발사 모두 위 결함으로 미완. 검증 상세: 유닛 13/13 · `check:mem-header` OK — 이 검증은 이중 확인.
- (2) 정본 `docs/spikes/RULE-ENFORCEABILITY.md` §7 판별표·§7.1 우선순위. 문서에만 있어 4/4 위반된 규칙(스킬 로드·board claim·pane 우선·마커 echo 오탐)의 층 이동 결정·구현. 보탬 2건: (a) 압축 후 receipt 무효화 여부 (b) 마커 검출 후 미종료 → 알림 미전달.

</details>
4~8. 대형 트랙 미정 · R{n} 유예 · Low 백로그 · npm publish 보류 · `.loom-*` 정리 → `docs/HANDOFF_ARCHIVE.md`.

---

## One-line resume

> **🎯 PANE-DEATH (C) — 좌표 재실측 완료, 잔여는 PLAN + R{n}** (2026-07-21). **완료는 사람이 확정하고 브릿지는 전달·회복만 책임진다.** 구 "수정 3건" 중 2건 = `2ca6748` 해소. 남은 1건(발행 단일 소유권 + ACK)은 **상태기계 변경**이라 **PLAN v0.27.0**으로 승격했다. **다음 = R43 verdict 회수 → 반영 → 구현(grok)**.

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
| **PLAN** | **v0.26.1** `approved`(R42 author-close) → 구현·검증·커밋·dist·push 완료. 직전 v0.26.0 approved R41 · `0de6c4c` · dist `e1d9177` |
| **Open blocking** | none — R24–R42 closed · GitHub Issues 전부 closed |
| **Tests** | 전체 **662개** — 재실행 시 실패 0건(1회차 1 fail = 등재된 통합 flake) · hook-sensor 37/37 · typecheck 6/6 |
| **Verify** | VERIFY-0260 codex pane done — M-1·M-2·L-1..L-3·wire-lock PASS · D6(b)만 FAIL → FIX-0260b로 해소 |
| **Herdr design** | `docs/HERDR_DESIGN.md` · Conv spec `docs/CONV_SPEC.md` · hooks 정본 `docs/spikes/HOOKS-SENSOR-SPIKE.md` |
| **Nodes** | mac-node · Windows relay(durable) · WSL node-wsl-1(부팅 생존) · VPS node-vps-1 / kb(`@reboot`) — loom-dev `LOOM-GT4B` |
| **Boot persist** | 트랙 종료(2026-07-20, 오너 옵션 B) — 상세 lessons platform (17) · 팩 `.loom-boot-persist-pack.md` |
| **Remote** | `origin/main` = HEAD (이 세션 커밋 전부 push 완료) |
| **Spikes** | **`PANE-DEATH-DESIGN.md`(§9-bis 락 **13개** — (C) 하이브리드 전환 적용, 4차 검증 대기) + `PANE-DEATH-OBSERVATIONS.md` + 리뷰 **3본**: `PANEDEATH-CODEX-REVIEW.md`(1차) · `…REVIEW2.md`(2차) · **`…REVIEW3.md`(3차 = reject 정본)** (리뷰 3본 수정 금지)** · **`AGENT-CLI-LIFECYCLE-HOOKS.md`(provisional)** · **`RULE-ENFORCEABILITY.md`(미적용)** · `HOOK-CACHE-FIX-DESIGN.md`(적용 완료) · `WARM-BASE-FORK-SPIKE.md` `defer` · hooks 센서 · DISPATCH-DEMO · STEP0/0.5 |
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
