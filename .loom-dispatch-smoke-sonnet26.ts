/**
 * SMOKE-SONNET26 — v0.26.1 새 dispatch 마커 하에서 sonnet 워커 무거부 완주 검증 (benign goal-ack).
 * 종전 `⚠ Untrusted handoff content` 마커 시절 sonnet 거부 루프 재현 여부 확인용.
 * 실행: 리포 루트에서  LOOM_PROFILE=claude-impl bun .loom-dispatch-smoke-sonnet26.ts
 * 선례: .loom-dispatch-smoke-hook-a.ts (addTask → dispatchCard, mac-node, goal-ack).
 */
import { addTask } from "./packages/host/src/task-board";
import { dispatchCard } from "./packages/host/src/card-ops";

const task = addTask({
  title: "SMOKE-SONNET26 — v0.26.1 dispatch 마커 sonnet 무거부 완주",
  notes: "SMOKE · v0.26.1 dispatch marker · sonnet 워커 · benign goal-ack (no-op)",
});
console.log("task created:", task.id);

const result = await dispatchCard({
  taskId: task.id,
  node: "mac-node",
  agentKind: "claude",
  prompt:
    "This is a Loom bridge connectivity smoke test. Do not create any files and do not run any commands. As the final line, reply with exactly the form `[SMOKE-SONNET26-OK] <one-sentence summary of the task you received>` and nothing after it.",
});
console.log(JSON.stringify(result));
