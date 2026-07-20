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

## ⭐ Current action (read first)

> **🎯 PANE-DEATH 설계 통합 패스 완료 — 3차 검증 대기 (2026-07-21).** codex 1차 reject(High 3)→락 교체(`5df040e`) → 2차 **reject/ready=no**(High 1·Medium 7)(`85465e2`) → **통합 패스 D1~D10 적용**(이번 커밋). 핸드오프가 적던 **조건 5건은 실측 오류 — 실제 10건**(codex §5 6건 중 3건 미전사 + 신규 발견 2건). 다음 = **codex 3차 검증**(발견자≠수정자). 상세 → **docs/HANDOFF_ARCHIVE.md**.

### 다음 액션 (우선순위 · 유일 섹션)

0. **⭐ PANE-DEATH (C) 하이브리드 — 코드 결함 3건 수정 (구현 착수 지점)** — 방향 전환 확정, 설계 문서 반영분 = 이번 커밋(E1~E15).
   > **불변식:** 불확실한 관측은 **회복 가능한 행동만** 유발한다. 비가역 행동(result 발행·`pane.close`·dispose)은 **결정적 증거 또는 멱등 경로에서만**.

   **수정 3건(축자 확인 완료)**: ① `hook-sensor.ts:202` malformed→`Stop` 승격 → `none` fail-open ② `bridge-runtime.ts:2123` `void sendFailedResult` fire-and-forget + `:2355` ACK 반환값 폐기 → 단일 소유권·멱등 전달·ACK 추적·durable alert. **자동 done을 없애도 남는 결함.** 레인 = grok. (C) 경계·근거(펼쳐보기).

1. **통합 테스트 flake — 트랙 후보(오너 결정)**: 스위트 3회에 **매번 다른** conv/scrape 실패(단독은 6/6 green). 변경 무관 확정. **방치 시 green 판정이 흐려진다**(펼쳐보기).
2. **HOOKCACHE-D-VERIFY 재개 (0번 후)**(펼쳐보기).
3. **RULE-ENFORCEABILITY 적용 결정**(펼쳐보기).

<details>
<summary>0 적용 내역 + 1·2·3 부연 설명 (펼쳐보기)</summary>

- (0) **(C) 경계**: 브릿지는 **자동 `done` 커밋 안 함** → 완료 후보는 단일 소유자가 멱등 `needs_verification`(board `blocked`)으로 전달, **사람이 워킹트리 독립 검증 후 확정**. 자동 `blocked`는 **결정적 부정 증거**(permission block·generation 결속 연속 absence)에만. 불확실한 status/scrape/timeout은 **알림만**(result 확정·close·dispose 금지). 자동 cleanup은 사람 확정 + tower receipt 뒤에만.
- (0) **(C) 전환 근거 요약**(전문 → `docs/HANDOFF_ARCHIVE.md`): 규칙 7이 이미 `card.done`을 자문 등급으로 격하했다(fable) · **단 "3연속 reject = 기질 탓"은 기각**(codex — High-2는 아키텍트 결함) · **규칙 7 완화는 보류이지 포기 아님** · herdr 수렴 등급 **B+**, "Loom 신뢰 ≤ herdr 등급" 원칙은 **과도로 기각**.
- (0) **잔존 2건(정직 고지)**: (C)로 3차 지적 6건 중 **4건만 닫힌다**. 남는 것 = ① 중복 발행(완료후보 `blocked` ↔ terminal `failed/blocked`) ② F5·F6(`terminalPending` 소비 + `blocked` result 자체의 ACK 유실·복구). **정확한 효과 = "거짓 성공 제거, 중복·유실·고아 존속."** 위 수정 3건이 이를 겨냥한다.
- (0) **증거 명제표(P1~P7) 채택** — `hookHint 우선` 전역 우선순위 **폐기**. 센서는 명제별 등급(`A/C/S/N`)만 갖는다. **P4(relay 수락) = strict ACK + CAS만 `A`** · **P7(의미상 완료) = lifecycle 센서로 절대 확정 불가** · P1(프롬프트 소비)은 현행 센서로 확정 불가(nonce 결속 receipt 필요). **hooks = 영원히 자문 신호**(커밋 트리거 승격 금지). herdr 등급은 **보수적 prior**일 뿐 권위 근거로 수입 금지(Loom 신뢰도 ≤ 어댑터가 **독립 검증한 명제 coverage**).
- (0) **미실측 상수 지위**: cadence·타임아웃은 **알림·재평가 등 가역 행동만** 유발. correctness 근거 금지, 실측 선결조건도 아님. `present` 응답의 **카운터 리셋 규정 필수**(3차 High-2).
- (0) **아키텍트 자기 결함 2건(재범 방지)**: ① High-2 = D7 cadence 표의 `present` **카운터 리셋 미규정**(아키텍트 산출) ② F1 미닫힘 = **스캔 범위를 §5~§8로 좁힌 것**(`:49` 밖에 남음) — **범위 축소 3회차 재범, 다음은 문서 전역 대상**. 3차 원장 전문 = `docs/reviews/PANEDEATH-CODEX-REVIEW3.md`.

- (1) 실증: 부하 시 `R26 §5.2`+`scrape-delta ④`, 조용할 때 `conv R28 L-1`. 스위트 285s(정상)에서도 발생 → 기아만이 원인 아님. 회귀 아님 근거 = 베이스라인·변경분 각 3회 16 pass/0 fail 동일 · 변경 파일 import 테스트 0건. 남은 가설 = 포트/소켓·타이밍 경합.
- (2) `blocked`, 아키텍트 독립 검증 완료. 보드 `task_c636c29485a4ae2b`, pane 4회 발사 모두 위 결함으로 미완. 검증 상세: 유닛 13/13 · `check:mem-header` OK — 이 검증은 이중 확인.
- (2) 정본 `docs/spikes/RULE-ENFORCEABILITY.md` §7 판별표·§7.1 우선순위. 문서에만 있어 4/4 위반된 규칙(스킬 로드·board claim·pane 우선·마커 echo 오탐)의 층 이동 결정·구현. 보탬 2건: (a) 압축 후 receipt 무효화 여부 (b) 마커 검출 후 미종료 → 알림 미전달.

</details>
4~8. 대형 트랙 미정 · R{n} 유예 · Low 백로그 · npm publish 보류 · `.loom-*` 정리 → `docs/HANDOFF_ARCHIVE.md`.

### 활성 함정 (상세 `tasks/lessons.md` — 재확인 금지)

- **dispatch wrap 마커** = `▶ Loom dispatched task — …`, 검증 주장은 **디스패처 발신자 국한**(R42) · M-1 allowlist엔 **전체 peer ID** · 디스패처 신원 `claude-impl`.
- `bun test`는 `env -u LOOM_RELAY_TOKEN -u LOOM_RELAY_URL bun test`로. 워커 스위트와 **동시 실행 금지**(기아로 위양성).
- **`card.done` ≠ 완료 · claim까지 해야 닫힌다.** 산출물은 **워킹트리 독립 검증**(회신 불신). 종료 코드로 실패 판정 금지. `PaneDied unknown pane`=herdr 내부 경고.
- **워커 감시 = `watch-card.ts`**(marker 0/pane-gone 1/limit 2/timeout 3) · `--pane` 필수 · 파이프 금지.
- **terminal 이벤트는 신규 구독자에 재전달**(백로그 ≥10분) · **봉투에 시각·seq·id 없음** → replay/live 구분 불가.
- **claude-mem 패치 비영속**(`autoUpdate` 원복) — 방어선 `check:mem-header`, 재적용 lessons platform.
- **pane 레인 4개 중 3개 사망**(장기 카드) — **in-harness 폴백 우선**(`DOGFOOD_LOOP §1.2`).
- **`fake-herdr.ts:565` status는 underscore만, 실서버는 dotted** — 픽스처 갭(제품은 양쪽 수용).

### 하지 말 것

- R25 결정·CONV_SPEC 재론(plan_review R24·R25 SSOT) · 마커 문구·개명 재론(R42 approved) · R41 M-1·M-2 재론
- M-lock 인접 PATCH를 리뷰 게이트 없이 착수 (R{n} 필요 여부 WORKFLOW §5.1 확인)

---

## One-line resume

> **🎯 PANE-DEATH (C) 하이브리드 전환 — 자동 `done` 폐지, 구현 착수 가능** (2026-07-21). 3연속 reject 후 codex 장기자문 2회 + fable-advisor 2회 교차 검증으로 방향 전환. **완료는 사람이 확정하고 브릿지는 전달·회복만 책임진다.** **다음 = 코드 결함 3건 수정**(malformed→Stop · 이중 발행 · ACK 폐기) → 증거표 반영 → 4차 검증.

---

## Where we are

<details>
<summary>펼쳐보기</summary>

| Item | Value |
|------|--------|
| **CLI / code** | **0.26.1 shipped** (소스 `47fc81c` · dist `66e0ba1` · push 완료) — dispatch 마커 오표기 교정 + `DISPATCHED_TASK_MARKER`/`wrapDispatchedPrompt` 개명. 직전 **0.26.0** hooks 센서(`0de6c4c` · dist `e1d9177`) |
| **PLAN** | **v0.26.1** `approved`(R42 author-close) → 구현·검증·커밋·dist·push 완료. 직전 v0.26.0 approved R41 · `0de6c4c` · dist `e1d9177` |
| **Open blocking** | none — R24–R42 closed · GitHub Issues 전부 closed |
| **Tests** | 전체 **654 pass / 0 fail** (571→654, 증가분 = 신규 유닛과 일치·신규 회귀 없음) · typecheck 6/6 |
| **Verify** | VERIFY-0260 codex pane done — M-1·M-2·L-1..L-3·wire-lock PASS · D6(b)만 FAIL → FIX-0260b로 해소 |
| **Herdr design** | `docs/HERDR_DESIGN.md` · Conv spec `docs/CONV_SPEC.md` · hooks 정본 `docs/spikes/HOOKS-SENSOR-SPIKE.md` |
| **Nodes** | mac-node · Windows relay(durable) · WSL node-wsl-1(부팅 생존) · VPS node-vps-1 / kb(`@reboot`) — loom-dev `LOOM-GT4B` |
| **Boot persist** | 트랙 종료(2026-07-20, 오너 옵션 B) — 상세 lessons platform (17) · 팩 `.loom-boot-persist-pack.md` |
| **Remote** | `origin/main` **`66e0ba1`**(v0.26.1 dist, HEAD=origin). 이 docs 커밋은 다음 push 편승 |
| **Spikes** | **`PANE-DEATH-DESIGN.md`(§9-bis 락 **10개** — D1~D10 통합 패스 적용, 3차 검증 대기) + `PANE-DEATH-OBSERVATIONS.md` + 리뷰 **2본**: `docs/reviews/PANEDEATH-CODEX-REVIEW.md`(1차) · **`PANEDEATH-CODEX-REVIEW2.md`(2차 = reject 정본)** (리뷰 2본 수정 금지)** · **`RULE-ENFORCEABILITY.md`(미적용)** · `HOOK-CACHE-FIX-DESIGN.md`(적용 완료·§1.6/§5 정정) · `WARM-BASE-FORK-SPIKE.md` `defer` · hooks 센서 · DISPATCH-DEMO · STEP0/0.5 |
| **Untracked (커밋 제외)** | `scripts/check-mem-header.ts`(+test) · `scripts/watch-card.ts`(+test) · `scripts/session-context.test.ts` · `hook-sensor.ts`(+test) · `.loom-*` 브리프/디스패치 · `.playwright-mcp/` 등 |

</details>

> **구현 후로 분류된 미확인 6건**(codex 2차 §4) — 단 **WSL/VPS terminal 종류·지연은 배포 완료 주장 전 필수 스모크**.
> 착수 전 조건 목록 원문(5건→실측 10건 경위 포함) → `docs/HANDOFF_ARCHIVE.md`.

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
