# HANDOFF — Loom (next session)

**Date:** 2026-07-17  
**Workspace:** `/Users/kyoungsiklee/projects/fable-advisor`  
**GitHub:** https://github.com/lemonbalms/Loom (`main`)  
**Language:** user often Korean · **Autonomy:** brief status → execute gate (no mid-wave "할까요?")

> ### Windows에서 볼 때
> **→ [`HANDOFF_WINDOWS.md`](./HANDOFF_WINDOWS.md)** — **git pull 후 Windows 전용 실행 핸드오프**  
> (Step 0 사실 + ⭐ **Tailscale 팀 공용 relay 상시화** 복붙 절차). 제품 코드는 Mac만.  
> 이 파일(`HANDOFF.md`) = Mac/다음 세션 에이전트 진입점.

---

## ⭐ Current action (read first)

> **🎯 시연 인계 진행 중 — Mac bridge 준비 완료 → Windows dispatch 대기.**  
> 문서: **[`docs/spikes/DISPATCH-DEMO.md`](./docs/spikes/DISPATCH-DEMO.md)** (제품 PLAN 아님 · FREEZE 무관 데모).
>
> | 단계 | 상태 |
> |------|------|
> | Windows Tailscale relay | ✅ `ws://100.65.103.113:7842` |
> | room `demo` + 양방향 handoff/board | ✅ `LOOM-4HXU` |
> | **Mac fake herdr + `loom bridge`** | ✅ `herdrOk:true` · allow `p_1f01c881dc5598d7` · peer `mac` |
> | **Windows `dispatchCard()`** | ⬅ **다음** — DISPATCH-DEMO §2 복붙 (카드 `task_cfac95cfe6c70763` → node `mac`) |
> | 기대 | 무개입: claim → fake spawn → `[DONE]` → Windows inbox / board done |
>
> ### Windows에서 할 일
> ```powershell
> cd E:\projects\Loom
> git pull --ff-only origin main
> # docs/spikes/DISPATCH-DEMO.md §2 실행
> ```
>
> ### 이미 끝난 것 (다시 하지 말 것)
> | 항목 | 상태 | 산출물 |
> |------|------|--------|
> | PLAN 0.22.0 + R23 + live herdr smoke | shipped | `5e2c058` 등 · tests **218/0** |
> | Windows relay 상시화 | ✅ | `LoomRelayTeam` · Taildrop token |
> | Mac health + token room create 검증 | ✅ | 2026-07-17 Mac 실측 |
> | **Mac §1 bridge+fake herdr (시연)** | ✅ | 재기동 불필요(살아 있음) |
>
> ### 병렬 / 이후
> - 팀 6인 dry-run 온보딩: `docs/DRY_RUN_RUNBOOK.md` (시연 room `demo`와 **별개**)
> - Windows 재부팅 후 relay health · 절전 금지 (아직 미검증)
> - **FREEZE 유지** — 신규 PLAN / work-watch·MCP 확대 금지
>
> ### 하지 말 것
> - R23 재리뷰 / Step 0·0.5 재실행 / relay wire 변경
> - 시연을 제품 게이트로 승격 · fake herdr를 실사용 경로로 문서화
> - M-1 없이 label-only 라우팅 · `pane.run` prompt 보간
>
> **Note:** `.playwright-mcp/` untracked — 커밋 제외. 시연 토큰/세션은 `~/.loom` · **미커밋**.

---

## One-line resume

> **0.22.0 shipped (218/0).** Windows Tailscale relay + room `demo` 양방향 OK. **Mac bridge+fake herdr ready** → **Windows `dispatchCard()` (§2 DISPATCH-DEMO)** 가 다음. FREEZE 유지.

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
| **Remote** | `origin/main` (see `git log -1`) · 시연 문서 `docs/spikes/DISPATCH-DEMO.md` |

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
