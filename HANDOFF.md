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

> **🎯 0.22.0 `loom bridge` shipped + 아키텍트 검증 + 실물 herdr 라이브 스모크 완료.** 라이브 스모크가 실버그 5건을 잡아 전부 수정(레인 위임): CLI `--allow` 배선 · **C4 transport**(herdr = 1 RPC/연결) · `BARE_ENTER` CR · submit 지연 · **submit 검증-재시도** + agent명 seq. 최종 라운드 **무개입 36초 왕복**(dispatch→spawn→auto-submit→[DONE]→board done). `bun test` **218/0**. 워커의 인젝션 거부 = M-4 설계 정상(S578 일치). 남은 것 = **오너 OPS 트랙**(VPS/팀 dry-run)만. Follow-up: seq-리셋(재시작 후 동일 카드 재dispatch) — implementation-notes 참조.
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
> **1) ~~(권장 검증) 실물 herdr 라이브 스모크~~ → 완료 (2026-07-17).** 5라운드 실행, 실버그 5건 수정, 최종 무개입 36초 왕복 성공. 상세 = `implementation-notes.md` 2026-07-17 rows + `docs/spikes/STEP0.5-HERDR.md` C4.
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

> **PLAN 0.22.0 implemented + 검증 + 라이브 스모크 완주 (2026-07-17).** `loom bridge` + MCP dispatch/apply + M-1/M-2. 라이브 스모크 실버그 5건 수정(C4 transport·CR·submit 검증-재시도 등), 최종 무개입 36초 왕복 성공. `bun test` **218/0**, VERSION **0.22.0**. 다음 = 오너 VPS/팀 온보딩만. FREEZE 유지.

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
