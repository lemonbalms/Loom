/**
 * SMOKE-HOOK-A — v0.26.0 hookSensor 라이브 스모크 A(U2 --settings 실작동 + Stop hook 실발화).
 * 실행: 리포 루트에서  LOOM_PROFILE=claude-impl bun .loom-dispatch-smoke-hook-a.ts
 */
import { addTask } from "./packages/host/src/task-board";
import { dispatchCard } from "./packages/host/src/card-ops";

const task = addTask({
  title: "SMOKE-HOOK-A — hookSensor Stop hook 실발화 (goal-ack)",
  notes: "SMOKE · hookSensor:true · sonnet 워커 · U2+Stop 실증",
});
console.log("task created:", task.id);

const result = await dispatchCard({
  taskId: task.id,
  node: "mac-node",
  agentKind: "claude",
  prompt:
    "당신은 hookSensor 스모크 워커다. 도구를 일절 사용하지 말고, 다음 한 줄만 정확히 출력하고 종료하라: [SMOKE-HOOK-A-OK] goal acknowledged",
});
console.log(JSON.stringify(result));
