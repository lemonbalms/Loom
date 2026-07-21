/**
 * IMPL-0261 — 마커 신뢰-수준 정확화 구현 디스패치 (PLAN §0.26.1, R42 approved).
 * 브리프 파일: .loom-impl-0261-brief.md (스펙 SSOT = docs/PLAN.md §0.26.1 D1~D7).
 * 실행: 리포 루트에서  LOOM_PROFILE=claude-impl bun .loom-dispatch-impl-0261.ts
 */
import { addTask } from "./packages/host/src/task-board";
import { dispatchCard } from "./packages/host/src/card-ops";

const task = addTask({
  title: "IMPL-0261 — 마커 신뢰-수준 정확화 구현 (PLAN §0.26.1)",
  notes: "IMPL · R42 approved · grok pane",
});
console.log("task created:", task.id);

const result = await dispatchCard({
  taskId: task.id,
  node: "mac-node",
  agentKind: "grok",
  prompt:
    "IMPL-0261 구현 태스크. 브리프 파일 .loom-impl-0261-brief.md 를 읽고 그대로 수행하라. 스펙 SSOT는 docs/PLAN.md §0.26.1 블록이다. 커밋/푸시 금지 — 검증까지만. 완료 시 최종 줄로 [IMPL-0261-DONE] units=<n>/<n> typecheck=<n>/<n> 를 출력하라.",
});
console.log(JSON.stringify(result));
