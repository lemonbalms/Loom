# HANDOFF — Loom (next session)

**Date:** 2026-07-21  
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

> **🎯 PANE-DEATH — 통합 설계 + R44 통과 (2026-07-21, `3cf5139`).** 조사 3건+자문 → 증거 팩(`89dd931`·`75b7b11`) → **Fable 5 설계 정본**(`694e08c` 락 **U1~U11** — 오너 "중요 결정은 최상위 모델") → **R44 grok `pending-revision`**(High 0·**자기모순 0**) → Medium 4 반영. **다음 = PLAN v0.28.0.**

### 다음 액션 (우선순위 · 유일 섹션)

0. **⭐ PANE-DEATH — PLAN v0.28.0 작성 (설계·게이트 완료, 착수 가능)**
   > **불변식:** 완료는 **사람이 확정**, 브릿지는 **전달·회복만**.

   정본 `docs/spikes/PANE-DEATH-UNIFIED-DESIGN.md`(락 U1~U11) · 증거 팩 `…UNIFICATION-BRIEF.md` · 원장 `docs/reviews/PANEDEATH-R44.md`. 골격 = 브랜치 authority cut(의미론) × main HEAD(코드 기질) — **git 병합 아닌 재구현**(경쟁 16블록·상보 0).
   **할 일:** 설계를 PATCH 분해 + R44 잔여 Low 3건 정정 → R{n}. **구현 레인 = Claude**(grok=R44 검증자). **codex 다운**(리셋 07-25) · `loom` 미설치로 **pane 불가**.
   **⚠️ 착수 즉시:** R44 UNVERIFIED ⑥ — accepted **(a) 주입 seam** 양성 어서션이 주입 경로에서 관측 가능한가(불가면 재설계 · 교훈 40 재범 지점). ⑨ U8↔R43b §4는 codex 복구 후 우선 재검증(락 철회 정당성).

1. **통합 테스트 flake — 트랙 후보(오너 결정)**: 스위트 2회에 **실패 집합 상이**(`conv R28 L-1`·`still-running ②`), 둘 다 **단독은 green**. 비결정성 확정(펼쳐보기).
2. **HOOKCACHE-D-VERIFY 재개**(펼쳐보기).
3. **RULE-ENFORCEABILITY 적용 결정**(펼쳐보기).
4. **`.loom-impl-0270-brief.md` 처리 미정**(untracked 잔존) · **session-context 예산 초과** — 아래 details 참조.

<details>
<summary>0 적용 내역 + 1·2·3 부연 설명 (펼쳐보기)</summary>

- (0) **v0.27.0 (pre-C) 종결 (2026-07-21).** 게이트 R43e approve(5라운드 수렴: R43 High6→R43b High4→R43c High0→R43d reject→4차 반영→R43e) → 구현 `7ed314c`·dist `e4f6c3c` → **아키텍트 검증발 유닛 결함 2건 해소 `9c59f29`**(프로덕션 무변경). 잠근 것 = dispatch-scoped issuer 중앙화 · strict ACK 3분기(`result_relay_accepted`) · durable quarantine JSONL · tower currency 게이트 · 순서 역전 15곳 · fire-and-forget 제거. **라운드별 서사 = 원장 8본**(`PANEDEATH-CODEX-REVIEW{,2,3}.md`·`PANEDEATH-R43{,B,C,D,E}.md` — 수정 금지) + PLAN changelog + `docs/HANDOFF_ARCHIVE.md`.
- (0) **검증발 결함 2건(교훈화 완료)**: ⓐ 앰비언트 `LOOM_RELAY_TOKEN`이 통합 6개를 **조용히 미실행**시킴(24→19개 · fail 2→1로 *감소* = 거짓 개선) → `RelayServer` 생성을 `beforeAll` 내부로 옮겨 밀폐(생성자 latch라 삭제만으론 no-op) ⓑ ①·①b가 주입 ACK(전송 우회)와 tower 도달을 **동시 요구** → 종결 분기(`pane.close` 1회) 단언으로 재작성. 심을 relay로 옮기는 안은 **기각**(ACK 위조 심을 신뢰 경계 안에 두는 자기모순 · 커버리지는 `pane-cleanup.test.ts:244-268`이 이미 담당). 교훈 **(40)~(43)** `tasks/lessons/verification.md`.

- (1) 실증: 부하 시 `R26 §5.2`+`scrape-delta ④`, 조용할 때 `conv R28 L-1`. 스위트 285s(정상)에서도 발생 → 기아만이 원인 아님. 회귀 아님 근거 = 베이스라인·변경분 각 3회 16 pass/0 fail 동일 · 변경 파일 import 테스트 0건. 남은 가설 = 포트/소켓·타이밍 경합.
- (2) `blocked`, 아키텍트 독립 검증 완료. 보드 `task_c636c29485a4ae2b`, pane 4회 발사 모두 위 결함으로 미완. 검증 상세: 유닛 13/13 · `check:mem-header` OK — 이 검증은 이중 확인.
- (2) 정본 `docs/spikes/RULE-ENFORCEABILITY.md` §7 판별표·§7.1 우선순위. 문서에만 있어 4/4 위반된 규칙(스킬 로드·board claim·pane 우선·마커 echo 오탐)의 층 이동 결정·구현. 보탬 2건: (a) 압축 후 receipt 무효화 여부 (b) 마커 검출 후 미종료 → 알림 미전달.

- (0) **통합 웨이브 종결 (`89dd931`→`3cf5139`).** 조사가 핸드오프 가설 2개를 뒤집었다: ⓐ pre-C는 `presence_unknown` cadence **미구현**(`enterPresenceUnknown` 호출자 0·`:2139` `void`) → 개정 대상은 **문서**뿐 ⓑ 두 커밋은 **형제**(merge-base `3961052`) — 브랜치는 pre-C를 **가진 적이 없다**(diff 방향 착시). Fable 5가 D4 기각·D7 확대·D10 종결하고 결함 **4건** 추가 실측: `rejected` 조용한 정지(`:2769-2790` 정규식으로 correctness 분기) · **`pane_exited` 처리 전무**(자연사 인지 불가 → 후속 C) · quarantine `process_exit`가 미해소를 **해소로 fold**(`result-quarantine.ts:128-133`) · absent-합성이 **issuer 발행 예산 소진**. R44 M2(주입 seam ≠ wire 도달)는 v0.27.0 유닛 결함 ⓑ의 **설계층 재발**.

- (0) ~~병존 발견~~ **→ 종결. 이하 역사.**
  **오너 설계 의도(구두, 2026-07-21):** *"설계 관점을 지금 메인과 다르게 접근한 것. 메인이 하는 건 자동 종료를 **인지**하는 건데 지금 구조에서는 어렵다. 그래서 브랜치에서는 그 부분을 **인정하고 사람이 개입하는 형식**으로 접근하고, 해답이 나오면 보강하는 걸로. 이유는 현재 **herdr에서 정보를 가져오는 게 구조적인 문제**가 있어서."* → **폐기·중복 처리 금지.** 아키텍트가 1차에 "중복 구현"으로 오판하고 브랜치 폐기를 권고했다가 오너 정정으로 철회한 이력이 있다.
  **사실관계(실측):** 브랜치 = main 미포함 커밋 **10개**(`6d4b384` plan approve → `93f1db1` test lock → `ec99b2c` feat authority cut → `9c07003` G3/G4 증거 → `2676987` dist 0.27.0 → `ee7efa6` G4 ship) · **main보다 12커밋 뒤처짐** · 자체 HANDOFF = *"다음 = G4 독립 `[VERIFY]`, `codex-rev`에 발송"*(**미검증 상태**). 마커: `ec99b2c`에 `needs_verification` 2 · `blocked` 26 / **main HEAD는 `needs_verification` 0**(pre-C가 명시 금지). 브랜치엔 `result-issuer.ts`·`result-quarantine.ts`·`impl-0270.test.ts` **부재**. 양쪽 모두 VERSION·dist를 0.27.0으로 **독자 bump**.
  **충돌 면적:** `bridge-runtime.ts`를 양쪽이 대규모 재작성(main +473 / 브랜치 +218·-95) · `card-ops.ts`·`cli/index.ts`·`mcp-server/stdio.ts` 양쪽 수정 · 브랜치가 `pane-cleanup.test.ts`(62줄)·`still-running.test.ts`(24줄)를 수정했는데 **이는 main의 회귀 게이트**다. 그 워크트리(`../fable-advisor-pane-death-authority`)에 **미커밋** 변경 존재: `AGENTS.md`·`CLAUDE.md`·`tasks/lessons.md`(← main에서 `9c59f29`로 수정·푸시됨, **충돌 소지**)·`tasks/lessons/orchestration.md`.
  **가설(미검증 — 아키텍트 1차 판단):** 두 노선은 **경쟁이 아니라 상보**일 수 있다. pre-C가 잠근 것은 전부 *"결정이 전달됐는가"* 층(issuer 소유권·strict ACK 도달·quarantine 회복·currency stale 차단)이지 *"결정을 어떻게 내리는가"* 층이 아니며, 사람 확정 모델에서도 그 확정은 relay를 타고 **유실될 수 있으므로** 필요하다. **단 예외** — pre-C의 `presence_unknown` poll/strike/grace cadence(락 8)는 herdr 관측 기반이라 **오너가 지적한 구조 문제에 정면으로 걸린다** → 재검토 대상. 이 가설은 **커밋 통계·마커 카운트만으로 세운 것**이고 브랜치 diff·설계 문서를 읽지 않았다.
  **조사 3건(다음 세션 착수 · 코드 정독이므로 서브에이전트 위임):** ① `ec99b2c`와 `7ed314c`의 `bridge-runtime.ts` diff가 **같은 함수·같은 결정 지점**을 건드리는가 ② 브랜치 authority cut이 main의 issuer/ACK 층을 **전제하는가 대체하는가** ③ pre-C `presence_unknown` cadence가 브랜치 관점에서 **살아남는가**. → 결과로 통합 설계 → PLAN + R{n}(M-lock 인접, WORKFLOW §5.1).
  **cross-ref 교훈 (30)** — *"미실측 상수로 정확성 갭을 닫지 마라 · 불변식으로 하중 이전"*, fable-advisor 당시 판정 *"실측은 분포를 줄 뿐 상한을 주지 않는다(느린 것과 죽은 것의 원격 구별 불가)"*. **오너의 herdr 구조 한계 판단은 이 교훈과 같은 결론이다** — 브랜치 노선이 트랙 불변식("완료는 사람이 확정")을 더 곧이곧대로 구현한 것으로 읽힌다.
  **설계 정본** `docs/spikes/PANE-DEATH-DESIGN.md` §6.7~§6.7.3 · §9-bis 락 5·8·9·11·13. **(C) 본체 8항목**(pre-C 브리프 §0 기준): 자동 `done` 제거(락 11) · `needs_verification` + board `blocked` · `awaiting_human_verification` + 사람 확정 + tower receipt · `pane.close` 이동 · `rejection_escalation`(깊이 2) · phase registry(12원소) · lifecycle `generation`(락 8) · §7.1-0 "done 0건". **단 이 8항목은 main 단독 노선 전제로 작성된 것이므로 통합 설계에서 재작성 대상이다.**

- (4) **`.loom-impl-0270-brief.md`**: 삭제 vs `docs/` 보존 미정. 보존 시 §2(room.ts 무변경) ↔ §4.6 D2(주입 지점) 문면이 아키텍트에게 **"스펙 모순" 오독**을 유발한 경위를 함께 남길 것 — 실제로는 모순이 아니라 **모호성**이었다(fable-advisor 판정: §2 잠금 심볼에 `routeHandoff` 없음 · "기본 경로 무변경"은 비활성 심 허용 독해 가능).
- (4) **⚠️ session-context HARD_CAP 재초과 (2026-07-21 세션 말 · 절단 진행 중)**: **RAW 9776 > 9500 = 276 초과** → tail(workers 교훈 끝)이 매 주입에서 잘린다. 원인 = 교훈 (44)~(46) 추가(+470, 시작 9306). **구조 진단 2건 확정(다음 세션 착수용):** ⓐ `stripDetailsBlocks`가 **HANDOFF·lessons 양쪽에 적용**되므로 `<details>` 안 내용(lessons의 21KB 경위 블록 포함)은 **애초에 예산에 안 들어간다** — 아키텍트가 이를 "중복 잔재"로 오진해 삭제할 뻔했다(`scripts/session-context.ts:145,168`) ⓑ 따라서 **압축 대상은 인덱스의 짧은 줄 + HANDOFF Current action(details 밖)뿐**이고, 이미 한계까지 줄였다. **→ 실질 해법은 기존 인덱스 항목 정리 = 오너 결정 사안.** 남의 교훈을 아키텍트가 임의 삭제하지 않았다.
- (4) **(구) session-context 예산 초과 경위**: `bun run session-context:lint` FAIL. **주의 — lint의 숫자는 절단 후 상수라 실제 초과분을 감춘다.** 실측은 `bun -e 'import {buildAllContext} from "./scripts/session-context.ts"; console.log(buildAllContext().length)'`. 2026-07-21 기준 원본 9628 > HARD_CAP 9500 → **매 세션 주입에서 tail(=workers 교훈)이 조용히 절단 중**이었고, 교훈 (40)~(43) 추가가 breach를 유발했다. 자체 압축으로 하드캡 이하 복귀. **SOFT_CAP 8500 복귀는 기존 내용 정리가 필요 = 오너 결정 사안.** cross-ref 교훈 (42).

</details>
5~8. 대형 트랙 미정 · R{n} 유예 · Low 백로그 · npm publish 보류 · `.loom-*` 정리 → `docs/HANDOFF_ARCHIVE.md`.

---

## One-line resume

> **🎯 PANE-DEATH — 통합 설계 정본 + R44 통과 (2026-07-21, `3cf5139`).** **완료는 사람이 확정, 브릿지는 전달·회복만.** Fable 5 설계(락 U1~U11) · R44 grok `pending-revision`(High 0 · 자기모순 0) · Medium 4 반영 완료. **다음 = PLAN v0.28.0** — 구현 레인 Claude, codex 다운(07-25 복구).

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
| **PLAN** | **v0.27.0 `approved`** (R43e approve, 2026-07-21 — 4차 반영본을 R43e codex 단일 레인이 검증: 1차 pending-revision(Low 1=D8 북키핑) → `cabcb48` 정정 → 마이크로 재확인 **approve**. 5라운드 수렴 R43 High6→R43b High4→R43c High0→R43d reject(7/9)→R43e approve. 원장 `docs/reviews/PANEDEATH-R43E.md`. 코드 무변경). 직전 **v0.26.1** `approved`(R42 author-close) → 구현·dist·push 완료 |
| **Open blocking** | **없음** — v0.27.0 `approved`(R43e), R43d 잔여 3건 전부 resolved. 다음 = v0.27.0 **구현 웨이브**(코드 착수). R24–R43e closed · GitHub Issues 전부 closed |
| **Tests** | 전체 **662개** — 재실행 시 실패 0건(1회차 1 fail = 등재된 통합 flake) · hook-sensor 37/37 · typecheck 6/6 |
| **Verify** | VERIFY-0260 codex pane done — M-1·M-2·L-1..L-3·wire-lock PASS · D6(b)만 FAIL → FIX-0260b로 해소 |
| **Herdr design** | `docs/HERDR_DESIGN.md` · Conv spec `docs/CONV_SPEC.md` · hooks 정본 `docs/spikes/HOOKS-SENSOR-SPIKE.md` |
| **Nodes** | mac-node · Windows relay(durable) · WSL node-wsl-1(부팅 생존) · VPS node-vps-1 / kb(`@reboot`) — loom-dev `LOOM-GT4B` |
| **Boot persist** | 트랙 종료(2026-07-20, 오너 옵션 B) — 상세 lessons platform (17) · 팩 `.loom-boot-persist-pack.md` |
| **Remote** | `origin/main`: 4차 반영 `65b3fb3` · Low 정정 `cabcb48` push 완료. **이번 세션 R43e 종결 커밋**(원장 `PANEDEATH-R43E.md` 신설 + PLAN Status→`approved`/changelog/D8 + HANDOFF/ARCHIVE — **코드 무변경 문서**)은 아키텍트 검수 후 커밋·push 대기 |
| **Spikes** | **`PANE-DEATH-DESIGN.md`(§9-bis 락 — **락 8은 R43b에서 만료 dispose 삭제로 개정 완료** · §6.7~§6.7.3 실측 좌표·quarantine·issuer·currency 게이트) + `PANE-DEATH-OBSERVATIONS.md` + 리뷰 **8본**: `PANEDEATH-CODEX-REVIEW.md`(1차) · `…REVIEW2.md`(2차) · `…REVIEW3.md`(3차) · **`PANEDEATH-R43.md`(4차 = reject 정본)** · **`PANEDEATH-R43B.md`(5차 = R43b 2레인 검증 + 판정표)** · **`PANEDEATH-R43C.md`(6차 = R43c 2레인 검증 + 판정표)** · **`PANEDEATH-R43D.md`(7차 = R43d 단일 레인 reject + 잔여 3건 + codex 축자)** · **`PANEDEATH-R43E.md`(8차 = R43e approve — 1차 pending-revision + 마이크로 재확인 + codex 축자 2본 · v0.27.0 종결)** (리뷰 8본 수정 금지)** · **`AGENT-CLI-LIFECYCLE-HOOKS.md`(provisional)** · **`RULE-ENFORCEABILITY.md`(미적용)** · `HOOK-CACHE-FIX-DESIGN.md`(적용 완료) · `WARM-BASE-FORK-SPIKE.md` `defer` · hooks 센서 · DISPATCH-DEMO · STEP0/0.5 |
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
