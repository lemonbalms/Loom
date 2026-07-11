# HANDOFF — Loom (next session)

**Date:** 2026-07-11 (PM)  
**Workspace:** `/Users/kyoungsiklee/projects/fable-advisor`  
**GitHub:** https://github.com/lemonbalms/Loom (`main`)  
**Language:** user often Korean · **Autonomy:** brief status → execute gate (no mid-wave "할까요?")

---

## ⭐ Next action (strategic — read first)

> **목표 그대로:** 제품 검증 0 → 최고가치 = **"다른 머신의 실제 사람 ≥2명에게 태우기"** (`LOOM_PURPOSE_REVIEW`).
> **코드 잠금해제는 완료됨(0.18.0):** 자기완결 초대 blob — `loom room invite --link` → `loom room join <blob>` 한 명령 join(relay URL+token 내장). R19 approved, 구현·검증·커밋(`2b59dee`). 이제 **초대 하나만 넘기면** 됨(3-비밀 문제 해소).
>
> **A1 설치 경로도 완료됨(0.19.0):** `scripts/install.sh` (`curl … | bash`) — Bun 확보→clone→link→verify→PATH. 이제 초대받은 낯선 사람은 **한 줄 설치 + `loom room join <blob>`**. R20 approved, 구현·검증·커밋(`a9cefd0`).
>
> **⏩ 다음 세션 큐(사용자 지시): A3 `loom doctor` 구현** — PLAN **0.20.0 approved(R21)**, binding M-1..M-4 잠금 완료. `docs/PLAN.md` 0.20.0 + `plan_review.md` R21 읽고 바로 구현: `cmdDoctor`(read-only 5섹션 진단) + dispatch + 테스트. **M-1: `ensureRelay` 금지(직접 /health fetch+timeout)** · **M-2: `resolveAliveHostMeta` 금지(stale 보고만)** · M-3 exit code · M-4 no-session=info.
>
> **그다음(코드 아님, OPS/실사용, 사용자 필요):**
> 1. **relay를 도달 가능한 호스트에 배포** — `apps/relay-cloud/README.md` 경로(VPS/LAN, `--host 0.0.0.0 --token …`, H-5). 로컬(loopback)이면 blob이 타 머신에서 안 됨(M-2 경고).
> 2. 그 relay에서 `room create` → `room invite --link`로 blob 생성.
> 3. **2번째 머신**: `curl -fsSL https://raw.githubusercontent.com/lemonbalms/Loom/main/scripts/install.sh | bash` → `exec $SHELL` → `loom room join <blob>` → **시간 측정(목표 5분)**. install.sh 실경로 마찰이 A2 관찰 대상.
> 4. 첫-5분 마찰(A2)·수요 신호 1줄(A4) 기록.
> 티어 전체: `docs/DOGFOOD_FEATURES.md`.

---

## One-line resume

> **⏩ 다음 세션 = A3 `loom doctor` 구현.** PLAN **0.20.0 `approved` (R21)** — read-only 자가진단(install/home/session/relay/host 5섹션). binding **M-1 `ensureRelay` 금지** · **M-2 `resolveAliveHostMeta` 금지** · M-3 exit code · M-4 no-session=info. 게이트만 세워둠, 코드 미착수. → `docs/PLAN.md` 0.20.0 · `plan_review.md` R21.
>
> PLAN **0.19.0** `approved` (R20) — **Tier A1 5분 설치 경로 shipped (code)**:  
> `scripts/install.sh` (`curl \| bash`): Bun 확보→clone(~/.loom-src)→`bun link`→절대경로 verify→shell rc PATH append. `loomCmd()` helper로 share/next 힌트를 설치 시 `loom`으로 표시(미설치 시 `bun run loom` fallback). R20 binding M-1..M-4 준수, L-1..L-4 author-close.  
> **Code + PLAN both 0.19.0.** `bun test` **175 pass / 0 fail**, 6 pkg typecheck green, shellcheck clean, 격리 install.sh 라이브 smoke ✅. Committed (`a711478` plan, `a9cefd0` impl); **push pending / done this session**.
> **이전(0.18.0):** self-contained invite blob (`2b59dee`, R19) — join 3-비밀 해소. 이번 0.19.0이 설치 반쪽 해소 → 이제 초대받은 낯선 사람은 한 줄 설치+한 명령 join.

---

## Where we are

| Item | Value |
|------|--------|
| **CLI / code** | **0.19.0** (install script + loomCmd sweep) — shipped |
| **PLAN** | **v0.20.0** `approved` (R21) — `loom doctor`, **구현 대기(다음 세션)**. 0.19.0(R20) shipped |
| **Open blocking** | **none** — R21 approved. 다음 세션이 M-1..M-4 지켜 구현 |
| **Tests** | `bun test` 175 pass / 0 fail · 6 pkg typecheck green · shellcheck clean · Docker 하네스 A/B/LAN green |
| **Latest** | `632bbb4` LAN check · `3b6cc0c` Docker 하네스 · `a9cefd0` install path (0.19.0) |

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

### 3) 다음 세션 큐 = A3 `loom doctor` 구현 (R21 approved, 사용자 지시)
게이트 완료됨(PLAN 0.20.0 approved, R21, M-1..M-4 잠금). 바로 구현:
1. `cmdDoctor` — read-only 5섹션(install/home/session/relay/host), 섹션별 ok/warn/fail + 다음-조치 힌트.
2. **M-1 `ensureRelay` 금지** → 직접 `fetch(origin+"/health",{signal:AbortSignal.timeout(3000)})`. **M-2 `resolveAliveHostMeta` 금지** → `loadStickyMeta`+`isPidAlive`로 stale 보고만.
3. **M-3** exit: fail≥1→1, warn만→0. **M-4** no-session=`info`(fail 아님). token 값 출력 금지.
4. dispatch(`cmd === "doctor"`) + 테스트 + VERSION 0.20.0(CLI+MCP) + docs. L-1..L-3 author-close.
5. 검증: `bun test` + `test/docker/run-install-test.sh`(설치 직후 doctor 첫 실행 케이스 확인).

### 4) 그다음 전략 = OPS 2머신 dry-run (사용자/2nd 머신 필요)
relay 배포 → `room invite --link` blob → 2번째 머신 `curl … install.sh | bash` → join → 5분 측정 · A2/A4 기록. 네트워크 배관은 `test/docker/run-lan-check.sh`로 사전 검증 가능.

---

## Plan pointer
Read: `docs/PLAN.md` Changelog **0.20.0** (Tier A3 `loom doctor`, M-1..M-4 locks, **구현 대기**) + **0.19.0** (install script, shipped).  
Review: `docs/plan_review.md` **R21** (approved, v0.20.0, implement next session) · R20/R19 (closed, shipped).  
Harness: `test/docker/` (install 냉시동 · 2컨테이너 join · LAN 배관) — 전부 green.
