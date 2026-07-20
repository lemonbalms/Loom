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

> **🎯 PANE-DEATH 검증 웨이브 종결 — 구현 게이트 reject(ready=no), 선결 실험 전건 종료 (2026-07-20).** codex 1차 검증 **reject**(High 3) 수용·락 문안 교체(`5df040e`) → codex **2차 검증 reject / ready=no**(High 1, Medium 7)(`85465e2`) → 독립 스켑틱(fable) 조건부. **구현 착수 불가.** 마지막 선결 실험(**시나리오 D — status replay**) 완료로 **구현 전 필수 실험은 전건 종료**. 다음 = **설계 통합 패스**(아래 0번, 조건 5건). 상세 → **docs/HANDOFF_ARCHIVE.md**.

### 다음 액션 (우선순위 · 유일 섹션)

0. **⭐ PANE-DEATH 설계 통합 패스** — 권고 **B** · 2차 검증 **reject/ready=no**. **구현 착수 전 5건**: ① **전이표 통합**(§5 B·§6.1·§6.2·§7.1을 락 5·9에 맞춰 하나로 — 현재 자기모순) ② **`generation` 정의**(매 `agent.start` bridge-local 불투명 token, `paneId`·`terminalId`·owner 결속, async 콜백은 캡처 token 재검증) ③ **reconcile cadence 수치**(간격·grace·최대 시도·시작/중단 phase) ④ **`terminalPending` 전이표 + `commit_unknown` 정책**(보존·운영자 회수 신호) ⑤ **락 10 승격**(§6.2 규칙 2·3 start-evidence·activity fence — 최초 결함 213이 현재 락 밖). **닫힘:** 구현 전 필수 실험 전건 종료(status replay=안 됨). 경위(펼쳐보기).

1. **HOOKCACHE-D-VERIFY 재개 (0번 후)**(펼쳐보기).
2. **RULE-ENFORCEABILITY 적용 결정**(펼쳐보기).

<details>
<summary>1·2 부연 설명 (펼쳐보기)</summary>

- (1) `blocked`, 아키텍트 독립 검증 완료. 보드 `task_c636c29485a4ae2b`, pane 4회 발사 모두 위 결함으로 미완. 검증 상세: 유닛 13/13 · `check:mem-header` OK — 이 검증은 이중 확인.
- (2) 정본 `docs/spikes/RULE-ENFORCEABILITY.md` §7 판별표·§7.1 우선순위. 문서에만 있어 4/4 위반된 규칙(스킬 로드·board claim·pane 우선·마커 echo 오탐)의 층 이동 결정·구현. 보탬 2건: (a) 압축 후 receipt 무효화 여부 (b) 마커 검출 후 미종료 → 알림 미전달.

</details>
3. **다음 대형 트랙 — 미정 (오너 결정 지점)**(펼쳐보기).
4. **R{n} 게이트 유예 (기존)**(펼쳐보기).

<details>
<summary>3·4 부연 설명 (펼쳐보기)</summary>

- (3) 멀티노드 단계 3이 마지막 확정 트랙. 저널·supervision은 out of scope.
- (4) 브릿지 자동 git push(R26:431). 착수 시 R{n} 재리뷰 필수.

</details>
<details><summary>5·6·7 — 잔존 Low 백로그 · npm publish 보류(오너 결정 대기) · 루트 <code>.loom-*</code> 부수 정리 (펼쳐보기)</summary>

5. **잔존 Low 백로그** (결함 아님/무해 확정) — summary 타이밍줄 · orphan durable 룸 · 디스패치 풀 탭 레이스 · `stale_hint` 어휘 · sleep형 상한 소진 pane 정리 · 공유-홈 claude-mem 오염 · conv 조기 회신 · `pane-inject.sh` read-guard · WSL non-root · R28 L-1 플레이크 · `agent_blocked` 라이브 실증 유예.
6. **오너 결정 대기 (별건)** — npm publish 보류(0-a). 재개 시 계정·패키지명 선택 → login→meta→publish. 재조사 금지.
7. **부수 정리(선택)** — 루트 `.loom-*` untracked 브리프/디스패치 스크립트 정리(이번 웨이브에서 다수 추가됨).

</details>

### 활성 함정 (상세 `tasks/lessons.md` — 재확인 금지)

- **dispatch wrap 마커** = `▶ Loom dispatched task — …`, 검증 주장은 **디스패처 발신자 국한**(R42) · M-1 allowlist엔 **전체 peer ID**(`loom peers`는 절단 표시) · 디스패처 신원 `claude-impl`.
- `bun test`는 `env -u LOOM_RELAY_TOKEN -u LOOM_RELAY_URL bun test`로(미제거 시 relay 테스트 깨짐). 워커 스위트와 **동시 실행 금지**(기아로 위양성).
- **`card.done` ≠ 완료 · 회수(claim)까지 해야 카드가 닫힌다**(미회수 시 보드 `doing` 고착·pane 잔존). 산출물은 **워킹트리에서 독립 검증** — 회신도 못 믿는다(성공을 `failed reason=agent_blocked`로 · 산출물 0건을 `done`으로 실증). 종료 코드로 실패 판정 금지(정상 cleanup도 exit 129). `PaneDied for unknown pane`=herdr 내부 경고.
- **워커 감시 = `scripts/watch-card.ts`**(marker 0/pane-gone 1/limit 2/timeout 3) · **`--pane` 명시 필수**(자동 탐색은 무관 pane 선택) · **파이프 금지**(종료 코드 삼킴).
- **herdr terminal 이벤트는 신규 구독자에 재전달**(백로그 ≥10분)이고 **봉투에 사건 시각·seq·id가 없다** — 수신 시각으로 replay/live 구분 불가.
- **claude-mem 패치 비영속**(`autoUpdate`로 원복) — 방어선 `check:mem-header`, 재적용 `tasks/lessons/platform.md`.
- **pane 레인 4개 중 3개 사망**(장기 리뷰·프로브) — pane 밖에선 매번 완주. 장기 카드는 **in-harness 폴백 우선**(`DOGFOOD_LOOP §1.2`).
- **`fake-herdr.ts:565` status는 underscore만, 실서버는 dotted** — 픽스처 갭(제품은 양쪽 수용).

### 하지 말 것

- R25 결정·CONV_SPEC 재론(plan_review R24·R25 SSOT) · 마커 문구·개명 재론(R42 approved) · R41 M-1·M-2 재론
- M-lock 인접 PATCH를 리뷰 게이트 없이 착수 (R{n} 필요 여부 WORKFLOW §5.1 확인)

---

## One-line resume

> **🎯 PANE-DEATH 검증 웨이브 종결 — 구현 게이트 reject(ready=no), 선결 실험 전건 종료** (2026-07-20). **다음 = 설계 통합 패스(조건 5건: 전이표 통합 · `generation` 정의 · reconcile cadence 수치 · `terminalPending`/`commit_unknown` 정책 · 락 10 승격)** → D-VERIFY → RULE-ENFORCEABILITY.

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
| **Spikes** | **`PANE-DEATH-DESIGN.md`(§9 종결(8항 status replay 포함)·§9-bis 락 9개 = **2차 검증 reject/ready=no** · 통합 패스 대기) + `PANE-DEATH-OBSERVATIONS.md` + `docs/reviews/PANEDEATH-CODEX-REVIEW.md` (둘 다 정본·수정 금지)** · **`RULE-ENFORCEABILITY.md`(미적용)** · `HOOK-CACHE-FIX-DESIGN.md`(적용 완료·§1.6/§5 정정) · `WARM-BASE-FORK-SPIKE.md` `defer` · hooks 센서 · DISPATCH-DEMO · STEP0/0.5 |
| **Untracked (커밋 제외)** | `scripts/check-mem-header.ts`(+test) · `scripts/watch-card.ts`(+test) · `scripts/session-context.test.ts` · `hook-sensor.ts`(+test) · `.loom-*` 브리프/디스패치 · `.playwright-mcp/` 등 |

</details>

<details>
<summary>0의 5개 조건 상세 + 닫힌 것 전문 (펼쳐보기)</summary>

   **0 헤더 부연:** 정본 `docs/spikes/PANE-DEATH-DESIGN.md`. 권고 B = 종료 펜스 + 결과-커밋 tombstone + bounded reconcile. 2차 검증 상세 = High 1·Medium 7(codex `85465e2`) + 독립 스켑틱(fable) 조건부. 구현 착수 전 아래 5건을 닫아야 한다(다음 세션의 작업 목록) = 전이표 통합 · `generation` 정의 · reconcile cadence 수치 · `terminalPending`/`commit_unknown` 정책 · 락 10 승격. 닫힌 것 = 구현 전 필수 실험은 전건 종료.

   1. **전이표 통합** — `§5 B 상태도`·`§6.1 phase union`·`§6.2 판정`·`§7.1 race tests`를 **락 5·9에 맞춰 갱신해 하나의 전이표로** 만든다. `result_sending` 중 terminal과 ACK 유실에서 **두 번째 result가 절대 나오지 않도록**. *(현재 문서는 자기모순 — 락 5·9는 `commit_unknown`·두 번째 result 금지인데 §5 B·§6.2.1·§7.1 4·6은 failed result 발행을 요구한다. 원인 = 아키텍트가 락 교체 위임 시 "설계 본문 §5~§8 건드리지 마라"로 범위를 좁힌 것 — 락이 상태기계를 바꿨으므로 본문도 함께 갱신됐어야 했다.)*
   2. **`generation` 정의 채택** — 매 `agent.start`마다 새로 생기는 **bridge-local 불투명 token**으로 정의하고 `paneId`·`terminalId`·owner(card/conv+id+seq)에 묶으며, **모든 async poll/TTL 콜백이 캡처 token을 재검증**하도록 잠근다. *(출처: codex 2차 §5-2. 채택하면 "pane_id 재사용" 미확인 항목이 구현 후로 내려간다.)*
   3. **reconcile cadence 수치 확정** — initial/periodic/terminal-trigger 각각의 **간격·grace·최대 시도 수**, phase별 시작·중단 조건을 **숫자와 전이로** 정한다. *(현재 "bounded"에 실제 bound가 없어 카드가 무기한 `doing`에 남을 수 있다 — 독립 스켑틱 지적.)*
   4. **`terminalPending` 전이표 + `commit_unknown` 정책** — `terminalPending × {strict ACK, explicit reject, transport unknown}` 전이표를 명시하고, `pane_closed`/`pane_exited`의 **expected 조건을 하나로 통일**하며, `commit_unknown`의 **보존 기간·reconcile 참여 여부·운영자 회수 신호·프로세스 종료 시 처리**를 정한다.
   5. **락 10 승격** — `§6.2 규칙 2·3`(start-evidence `sawWorking` 게이트 + `Working` activity fence)을 **락으로 올린다**. **최초 관측 결함인 213 초기 TUI 가짜 done을 현재 9개 락 중 어느 것도 막지 못한다** — 가장 실증된 결함이 락 밖에 남아 있다(독립 스켑틱 발견).

   **닫힌 것 전문:** 마지막 선결 실험(시나리오 D)이 **status replay = 안 됨**(herdr v0.7.4 관측, 계약 아님 → 불변식 금지)으로 닫혔다(`PANE-DEATH-OBSERVATIONS.md` §D · DESIGN §9-8). 나머지 **미확인 6건은 구현 후로 분류**(codex 2차 §4). 단 **WSL/VPS terminal 종류·지연은 배포 완료 주장 전 필수 스모크**다. 급한 이유 = 조기 `done` 커밋 후 `pane.close`(`finishCard()` `bridge-runtime.ts:2310-2323`) → 가짜 `card.done`.

</details>

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
