/**
 * IMPL-0260 구현 카드 발사 — PLAN 0.26.0 hooks 보조 센서 (grok pane).
 * 선례: .loom-dispatch-impl-0250.ts (addTask → dispatchCard, agentKind grok).
 * 바인딩 전제: mac-node = loom-local — active 바인딩이 다르면 `loom relay use loom-local` 후 실행.
 * 실행: env -u LOOM_RELAY_URL -u LOOM_RELAY_TOKEN LOOM_PROFILE=claude-impl bun run .loom-dispatch-impl-0260.ts
 */
import { addTask } from "./packages/host/src/task-board";
import { dispatchCard } from "./packages/host/src/card-ops";

const task = addTask({
  title: "IMPL-0260 — PLAN 0.26.0 hooks 보조 센서 (claude 워커 상태 힌트): 스파이크 최소 배선 5단계 (grok pane)",
  notes: "IMPL · brief=.loom-impl-0260-brief.md · impl=grok · R41 approved(M-1/M-2 lock)",
});
console.log("task created:", task.id);

const result = await dispatchCard({
  taskId: task.id,
  node: "mac-node",
  prompt: [
    "리포 루트의 .loom-impl-0260-brief.md 파일을 읽고 그대로 수행하라.",
    "요지: 당신은 grok-impl 구현자다. PLAN §0.26.0(approved R41, docs/PLAN.md 53~110행 정독 필수)을 구현한다 —",
    "hooks 보조 센서: 신규 packages/host/src/hook-sensor.ts(+.test.ts)·bridge-runtime.ts 배선(hook 주입 :1047·hookHint 우선 분기 :1945·still-running poll·생명주기 정리)·",
    "bridge-config.ts hookSensor 옵트인(기본 off)·VERSION 0.26.0 동기(cli index.ts:144·mcp stdio.ts:403).",
    "락(브리프 §4 전문 전사분 — 재량 금지): M-1 소켓 attempt(seq)-스코프 hook-<cardId>-<seq>.sock + bind 전 unlink + flight 소멸 시 close/unlink + 늦은 이벤트 flight 동일성 가드 드롭 ·",
    "M-2 hookHint 소비 계약 4항(단일 슬롯 last-event-wins·소거 규칙·교정 결정표·Stop×still-running AND 결합) ·",
    "자동 close/approve 금지 · relay/conv wire·MCP·herdr RPC 무변경 · fail-open 폴백(L-2 스코프) · 계측 JSONL 메타데이터-only(L-3).",
    "라이브 hook 주입/실발화 시도 금지(U1·U2는 아키텍트 후속 스모크). 전체 bun test 금지(아키텍트 몫) —",
    "신규 유닛·관련 스위트·bun run --filter '*' typecheck만 env -u LOOM_RELAY_TOKEN -u LOOM_RELAY_URL 하 실행.",
    "git commit/push 금지 — 검증까지만. 완료 시 브리프의 [IMPL-0260-DONE] 형식 한 줄을 최종 출력하라.",
  ].join(" "),
  agentKind: "grok",
});
console.log(JSON.stringify(result));
