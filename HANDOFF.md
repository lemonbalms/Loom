# HANDOFF — Loom (next session)

**Date:** 2026-07-17  
**Workspace:** `/Users/kyoungsiklee/projects/fable-advisor`  
**GitHub:** https://github.com/lemonbalms/Loom (`main`)  
**Language:** user often Korean · **Autonomy:** brief status → execute gate (no mid-wave "할까요?")

> ### Windows에서 볼 때
> **→ [`HANDOFF_WINDOWS.md`](./HANDOFF_WINDOWS.md)** — Step 0 완료 요약 · SSH · NAT 경로.  
> 이 파일(`HANDOFF.md`) = Mac/다음 세션 에이전트 진입점.

---

## ⭐ Current action (read first)

> **🎯 0.22.0 `loom bridge` shipped + 아키텍트 독립 검증 완료 (`89dbe34`).** M-1/M-2·L-1..L-3 코드 확인, `bun test` **214/0**, typecheck·biome clean. 검증 중 발견·수정: `resolveAgentArgv` shell 가드 no-op(레인 위임 수정 + 회귀 테스트). 남은 것 = **실물 herdr 라이브 스모크 수동 1회**(오너) 또는 **오너 OPS 트랙**(VPS/팀 dry-run).
>
> ### 이미 끝난 것 (다시 하지 말 것)
> | 항목 | 상태 | 산출물 |
> |------|------|--------|
> | Loom product 0.21.1 | PTY inject | `d05d714` |
> | Step 0 / 0.5 | **go** | spikes + fixtures |
> | PLAN 0.22.0 + R23 | **approved → implemented** | M-1/M-2 locks |
> | **`loom bridge` 구현** | **shipped** | herdr client · bridge daemon · MCP `dispatch_card`/`apply_card_result` · CLI · tests 213/0 |
>
> ### ⏩ 다음 세션 후보
>
> **1) (권장 검증)** 실물 herdr 라이브 스모크 1회 — `herdr server` 기동 → bridge config allowlist → `loom bridge start --allow <towerPeerId>` → 타워에서 `dispatch_card` → `[DONE]` + `apply_card_result`. (§5.3 이원화; 자동화는 fixture 전용)
>
> **2) (오너 OPS, 코드 아님)** VPS/공용 relay · 팀 6인 dry-run (`docs/DRY_RUN_RUNBOOK.md`)
>
> **3) FREEZE 유지** — work-watch·MCP 확대·C1/C2 등 신규 PLAN 오픈 금지(팀 pull 전).
>
> ### 하지 말 것
> - R23 재리뷰 / Step 0·0.5 재실행
> - relay wire/envelope 변경 · herdr 벤더링
> - M-1 없이 label-only 라우팅 재도입 · `pane.run`에 prompt 보간
>
> **Note:** `.playwright-mcp/` untracked — 커밋 제외.

---

## One-line resume

> **PLAN 0.22.0 implemented + 아키텍트 검증 완료 (2026-07-17, `a8de571`+`89dbe34`).** `loom bridge` + MCP dispatch/apply + M-1/M-2. `bun test` **214/0**, VERSION **0.22.0**, pushed. 다음 = 실물 herdr 수동 스모크 또는 오너 VPS/팀 온보딩. FREEZE 유지.

---

## Where we are

| Item | Value |
|------|--------|
| **CLI / code** | **0.22.0** — `loom bridge` + MCP card tools |
| **PLAN** | **v0.22.0** `approved` → **implemented** |
| **Open blocking** | none |
| **Tests** | `bun test` **214 pass / 0 fail** · 6 pkg typecheck green · biome bridge files clean |
| **Herdr design** | `docs/HERDR_DESIGN.md` |
| **Step 0 / 0.5** | **go** |
| **Remote** | `origin/main` synced (`89dbe34`) |

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

> Loom = 오너 6인 팀 내부 도구. FREEZE = 팀-pull 요구만. **남은 오너 블로커 = VPS/공용 relay.** 런북 `docs/DRY_RUN_RUNBOOK.md`.
>
> 0.22.0은 FREEZE **예외 한 건**(오너 pull) — 브릿지 수직 슬라이스만. 저널·supervision·멀티노드·wire 변경은 out of scope.

---

## Process notes

- Impl lane this session: **Grok** (direct session = implementer).
- Architect re-verify live herdr optional next.
- Deviations: `implementation-notes.md` (M-2 via double agent.send; stop without leave).
