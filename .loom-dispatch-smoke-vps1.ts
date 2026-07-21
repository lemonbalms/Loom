/**
 * SMOKE-VPS1 — Linux/VPS 노드(node-vps-1) 첫 카드 왕복 스모크 (0-c ③).
 * 타깃 node-vps-1 (peerId p_aadcd1e3dc9c5b5a, Ubuntu VPS) · 디스패처 = tower(claude-impl, p_45115c32d2c462f9).
 * 워커 cwd = kb의 ~/.loom-src.
 * 실행: 리포 루트에서  LOOM_PROFILE=claude-impl bun .loom-dispatch-smoke-vps1.ts
 * 선례: .loom-dispatch-smoke-wsl2d.ts (addTask → dispatchCard, benign goal-ack형).
 */
import { addTask } from "./packages/host/src/task-board";
import { dispatchCard } from "./packages/host/src/card-ops";

const task = addTask({
  title: "SMOKE-VPS1 — Linux/VPS 노드 카드 왕복 스모크 (0-c ③)",
  notes: "SMOKE · node-vps-1 첫 카드 왕복 · Ubuntu VPS · 0-c ③",
});
console.log("task created:", task.id);

const result = await dispatchCard({
  taskId: task.id,
  node: "node-vps-1",
  agentKind: "claude",
  prompt:
    "당신은 Linux/VPS 노드 스모크 워커다. 다음 두 명령을 실행하고 결과를 확인하라: git -C ~/.loom-src rev-parse --short HEAD 그리고 loom --version. 완료되면 최종 줄로 정확히 [SMOKE-VPS1-OK] head=<sha> loom=<버전> 형식 한 줄을 출력하라. git commit/push 금지.",
});
console.log(JSON.stringify(result));
