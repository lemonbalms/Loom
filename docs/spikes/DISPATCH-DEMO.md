# 시연 인계 — Loom 직접통신 + dispatch 자동실행 (Windows → Mac)

**Date:** 2026-07-17 · **작성:** Windows 세션(`DESKTOP-LG99QSS`)
**목적:** Windows↔Mac이 git·사람 없이 Loom relay로 **직접** 통신하고, `dispatch_card`로 카드를 **무개입 자동 실행**하는 것을 실증.

> 이 문서는 **시연(데모) 런북**이다. 제품 PLAN/게이트 아님. FREEZE와 무관한 docs.
> room/프로파일(`demo` / `win-demo` / `mac`)은 **시연 전용** — 팀 dry-run 실제 room과 별개.

---

## 진행 상태

| 단계 | 상태 |
|------|------|
| relay 상시화 (Windows) | ✅ `ws://100.65.103.113:7842` (`LoomRelayTeam` Task) |
| room `demo` 생성 | ✅ `LOOM-4HXU` (`room_b8ea4daa12aef875`) |
| Mac join (`--as mac`) | ✅ |
| Windows → Mac 직접 handoff | ✅ 전달·수신 (`ho_56beff67`) |
| board add + assign → mac (+notify) | ✅ (`ho_29b1ea03`) |
| Mac → Windows 역방향 handoff | ✅ 수신 (`ho_017520f3`) |
| **dispatch_card 자동실행** | ⬅ **지금 이 단계 (Mac 세팅 대기)** |

---

## 배선 정보

| 항목 | 값 |
|------|-----|
| relay URL (Tailscale) | `ws://100.65.103.113:7842` |
| room invite | `LOOM-4HXU` |
| **Windows peer id (dispatcher)** | `p_1f01c881dc5598d7` |
| **Mac node 이름 (displayName)** | `mac` |
| **dispatch 대상 카드** | `task_cfac95cfe6c70763` |
| 토큰 | `$LOOM_RELAY_TOKEN` (Taildrop 별도 전달 · **미커밋**) |

---

## 1) Mac 측 — bridge + fake herdr 세팅

> **fake herdr = 배관 시뮬레이터.** 실제 Claude 실행/파일 변경 **없음**.
> dispatch → (가짜)spawn → 자동 `done` → `[DONE]` 회신 파이프라인이 **무개입으로 도는 것**을 실증한다.
> 진짜 에이전트 실행을 원하면 fake 자리에 **실물 herdr 실행**으로 교체.

**Mac Loom repo 루트에서** 실행 (`LOOM_RELAY_TOKEN` export + `bun` 필요):

```bash
export LOOM_HERDR_SOCKET=/tmp/loom-fake-herdr.sock
rm -f "$LOOM_HERDR_SOCKET"

# 1) fake herdr 백그라운드 기동 (repo 루트여야 상대경로 import 됨)
nohup bun -e 'import{startFakeHerdr}from"./packages/host/src/fake-herdr";await startFakeHerdr({socketPath:process.env.LOOM_HERDR_SOCKET,autoStatus:"done",autoStatusDelayMs:500});await new Promise(()=>{})' > /tmp/loom-fake-herdr.log 2>&1 &
sleep 2
cat /tmp/loom-fake-herdr.log || true

# 2) bridge 기동 — Windows peer 허용 (M-1 allowlist)
loom --profile mac --relay ws://100.65.103.113:7842 --token "$LOOM_RELAY_TOKEN" \
     bridge start --allow p_1f01c881dc5598d7

# 3) 상태 확인
loom --profile mac bridge status
```

`bridge status`가 **online + herdr 연결**이면 준비 완료 → Windows에 알림.

---

## 2) Windows 측 — dispatch 트리거 (dispatcher가 실행)

CLI에 dispatch 서브커맨드가 **없어서** `@loom/host`의 `dispatchCard()`를 직접 호출한다.
(사전조건: 대상 카드 `task_cfac95cfe6c70763`가 로컬 board에 존재 — 이미 생성됨.)

```bash
cd /e/projects/Loom
LOOM_SESSION="C:\Users\34970\.loom\profiles\win-demo.json" bun -e '
  import { dispatchCard } from "@loom/host";
  console.log(JSON.stringify(await dispatchCard({
    taskId:   "task_cfac95cfe6c70763",
    node:     "mac",
    prompt:   "write hello world",
    agentKind:"claude"
  })));
'
```

---

## 기대 결과 (무개입)

1. Windows dispatch → `mac` inbox에 `mode:task` + `loom-card-dispatch` 첨부 handoff
2. Mac bridge 폴링·claim → herdr `agent.start` → `BARE_ENTER` → 자동 `done`
3. bridge가 `[DONE]` + `loom-card-result` 첨부를 **Windows inbox로 회신**
4. Windows: `loom inbox`에서 `[DONE]` 확인, board 카드 `doing→done`

---

## 함정 / 주의

- `--allow` = **peer id (`p_...`)** / dispatch `node` = **displayName (`mac`)**. 혼동 시 조용히 실패(M-1 deny 또는 peer_unknown).
- `agentKind`는 `"claude"`만 허용. `shell/bash/sh`는 영구 차단.
- herdr는 bridge start 시 **fail-fast** — fake든 실물이든 **먼저 떠 있어야** bridge가 뜬다.
- 이미 `~/.loom/bridge/mac.json`이 있으면 그 파일의 `herdrSocketPath`가 env보다 우선 → 처음 `--allow` 전에 `LOOM_HERDR_SOCKET` 세팅하거나 파일을 직접 수정.
- fake herdr는 **실제 실행 아님** — relay↔bridge↔herdr 배관 실증용.

---

## 코드 근거 (참고)

- dispatch 인식 조건: `packages/host/src/bridge-runtime.ts` `processInboxEntry` (mode=task + `loom-card-dispatch` 라벨 + M-1)
- 라벨 상수: `packages/protocol/src/card-contract.ts` `CARD_DISPATCH_LABEL = "loom-card-dispatch"`
- dispatch 구현: `packages/host/src/card-ops.ts` `dispatchCard()`
- fake herdr: `packages/host/src/fake-herdr.ts` / e2e 참고 `packages/host/src/bridge.test.ts`
