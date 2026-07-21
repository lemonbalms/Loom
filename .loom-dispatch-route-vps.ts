/**
 * ROUTE-VPS — @node 라우팅 운용 스모크: node-vps-1(Linux/VPS 노드) 카드 왕복 (0-c ④).
 * 타깃 node-vps-1 (Ubuntu VPS) · 디스패처 = tower(claude-impl). 워커 cwd = ~/.loom-src.
 * 실행: 리포 루트에서  LOOM_PROFILE=claude-impl bun .loom-dispatch-route-vps.ts
 * 선례: .loom-dispatch-smoke-vps1.ts (addTask → dispatchCard, benign goal-ack형).
 */
import { addTask } from "./packages/host/src/task-board";
import { dispatchCard } from "./packages/host/src/card-ops";

const task = addTask({
  title: "ROUTE-VPS — @node 라우팅 스모크 (node-vps-1 카드 왕복, 0-c ④)",
  notes: "ROUTE · node-vps-1 라우팅 왕복 · Ubuntu VPS · 0-c ④",
});
console.log("task created:", task.id);

const result = await dispatchCard({
  taskId: task.id,
  node: "node-vps-1",
  agentKind: "claude",
  prompt:
    "당신은 node-vps-1(Linux/VPS 노드) 라우팅 스모크 워커다. 다음 두 명령을 실행하고 결과를 확인하라: git -C ~/.loom-src rev-parse --short HEAD 그리고 loom --version. 이것은 라우팅 확인 전용 카드다 — 어떤 파일도 수정하지 말고, git commit/push는 절대 하지 말며, 오직 위 두 값을 확인만 하라. 완료되면 최종 줄로 정확히 [ROUTE-VPS-OK] node=node-vps-1 head=<sha> 형식 한 줄을 출력하라.",
});
console.log(JSON.stringify(result));
