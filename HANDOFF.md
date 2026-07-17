# HANDOFF — Loom (next session)

**Date:** 2026-07-18  
**Workspace:** `/Users/kyoungsiklee/projects/fable-advisor`  
**GitHub:** https://github.com/lemonbalms/Loom (`main`)  
**Language:** user often Korean · **Autonomy:** brief status → execute gate (no mid-wave "할까요?")

> ### Windows에서 볼 때
> **→ [`HANDOFF_WINDOWS.md`](./HANDOFF_WINDOWS.md)** — **git pull 후 Windows 전용 실행 핸드오프**  
> (Step 0 사실 + ⭐ **Tailscale 팀 공용 relay 상시화** 복붙 절차). 제품 코드는 Mac만.  
> 이 파일(`HANDOFF.md`) = Mac/다음 세션 에이전트 진입점.

---

## ⭐ Current action (read first)

> **🎯 dispatch 시연 §3-2 완료 — M-4 거부(설계대로) + bun.lock 신뢰경로로 완수 (`1811aa9`).**  
> 문서: **[`docs/spikes/DISPATCH-DEMO.md`](./docs/spikes/DISPATCH-DEMO.md)** §3-2.
>
> | 단계 | 상태 |
> |------|------|
> | fake dispatch 시연 | ✅ board done |
> | **Mac 실물 herdr 0.7.4 + bridge** | ✅ `herdrOk:true` · `~/.config/herdr/herdr.sock` · repo cwd server · allow win peer |
> | **Windows §3-2 `dispatchCard(bun.lock)`** | ✅ 실행 → Fable 5 워커 spawn → **M-4 untrusted 거부**(설계대로) |
> | **bun.lock sync (신뢰경로)** | ✅ 오너 직접 커밋·푸시 **`1811aa9`** — Windows·origin·Mac 3곳 정렬 |
>
> ### 이번 세션 학습 (중요)
> - **카드 상태-회신 = 짧은 요약만 신뢰** (~35s 왕복). raw/긴 출력은 결과-캡처(pane 스크레이프)가 붕괴 → 쓰지 말 것.
> - **Mac↔Windows Taildrop 불가**(양방향). Mac App Store Tailscale: 샌드박스 앱 CLI 파일 못 읽음 + homebrew 1.94.1↔daemon 1.98.8 스큐 no-op. 같은 user·active-direct라 네트워크/ACL 아님.
> - **Mac status/파일 = SSH/scp가 정답.** `ssh -i ~/.ssh/id_mac_auto kyoungsiklee@100.69.230.114` (herdr·bridge 정상 직접 확인: herdrOk:true·inFlight:0).
>
> ### 이미 끝난 것 (다시 하지 말 것)
> | 항목 | 상태 | 산출물 |
> |------|------|--------|
> | PLAN 0.22.0 + R23 + live herdr smoke | shipped | tests **218/0** |
> | Windows relay · fake+실물 dispatch 시연 | ✅ | DISPATCH-DEMO |
> | **§3-2 dispatch + bun.lock 완수** | ✅ | M-4 거부 실증 · `1811aa9` 3곳 정렬 |
>
> ### 병렬 / 이후
> - 팀 6인 dry-run 온보딩: `docs/DRY_RUN_RUNBOOK.md` (시연 room `demo`와 **별개**)
> - Windows 재부팅 후 relay health · 절전 금지 (아직 미검증)
> - **FREEZE 유지** — 신규 PLAN / work-watch·MCP 확대 금지
>
> ### 하지 말 것
> - R23 재리뷰 / Step 0·0.5 재실행 / relay wire 변경
> - 시연을 제품 게이트로 승격 · fake herdr를 실사용 경로로 문서화
> - **카드 채널로 raw/긴 출력 받기 · Mac↔Win Taildrop 재시도** (둘 다 불가 확정 — SSH/scp 사용)
> - M-1 없이 label-only 라우팅 · `pane.run` prompt 보간
>
> **Note:** `.playwright-mcp/` untracked — 커밋 제외. 시연 토큰/세션은 `~/.loom` · **미커밋**.

---

## One-line resume

> **0.22.0 shipped.** dispatch 시연 §3-2 **완료** — M-4 거부 실증 + bun.lock 신뢰경로 완수(`1811aa9`, Windows·origin·Mac 정렬). Mac status/파일은 **SSH/scp**(카드캡처·Taildrop 불가). FREEZE 유지.

---

## Where we are

| Item | Value |
|------|--------|
| **CLI / code** | **0.22.0** — `loom bridge` + MCP card tools |
| **PLAN** | **v0.22.0** `approved` → **implemented** |
| **Open blocking** | none |
| **Tests** | `bun test` **218 pass / 0 fail** · 6 pkg typecheck green · biome bridge files clean |
| **Herdr design** | `docs/HERDR_DESIGN.md` |
| **Step 0 / 0.5** | **go** |
| **Remote** | `origin/main` **`1811aa9`** (Windows·Mac 정렬) · 시연 `docs/spikes/DISPATCH-DEMO.md` |

### Access cheat-sheet

```bash
# Mac → Windows
ssh -i ~/.ssh/id_ed25519_loom_windows 34970@100.65.103.113

# Bridge (node with herdr)
loom --profile node-wsl-1 bridge start --allow <towerPeerId>
loom bridge status
loom bridge stop

# herdr
herdr status   # or: herdr server
# LOOM_HERDR_SOCKET overrides socket path (tests/fake)
```

### Already shipped (don't redo)

| Area | Version / note |
|------|----------------|
| Durable inbox … doctor · PTY inject | 0.14–0.21.1 |
| **loom bridge (Herdr)** | **0.22.0** |
| Step 0 / 0.5 spikes | done 2026-07-17 |

### Naming
**Loom** = product · **Fable 5** = review agent

---

## This session (2026-07-17) — 0.22.0 bridge implement

| 영역 | 결과 |
|------|------|
| card-contract | `packages/protocol/src/card-contract.ts` — dispatch/result zod + body helpers |
| herdr client | NDJSON unix socket · ping/start/send/subscribe/read · M-2 bare Enter |
| bridge daemon | start/stop/status · fail-fast herdr · M-1 allowlist · claim → agent → [DONE] |
| MCP | `dispatch_card` · `apply_card_result` (L-2) |
| CLI | `loom bridge start\|stop\|status --allow` · profiles exclude `.bridge.json` |
| Tests | fake herdr + in-process relay · M-1 deny · offline queue · fail-fast |
| Verify | bun test 213/0 · typecheck 6/6 |

---

## Strategic context (unchanged)

> Loom = 오너 6인 팀 내부 도구. FREEZE = 팀-pull 요구만.  
> **공용 relay** = Windows Tailscale 상시화 완료. 온보딩 = `docs/DRY_RUN_RUNBOOK.md` (팀 room; 시연 `demo`와 분리).  
> **지금 시연 트랙** = `docs/spikes/DISPATCH-DEMO.md` (fake herdr 배관 실증 · 제품 게이트 아님).
>
> 0.22.0 브릿지 수직 슬라이스 **shipped**. 저널·supervision·멀티노드·wire 변경은 out of scope.

---

## Process notes

- Impl lane this session: **Grok** (direct session = implementer).
- Architect re-verify live herdr optional next.
- Deviations: `implementation-notes.md` (M-2 via double agent.send; stop without leave).
