/**
 * SMOKE-WSL2B — WSL 노드(node-wsl-1) 2차 카드 왕복 스모크 (skip-permissions 자율 완주 검증).
 * 실행: 리포 루트에서  LOOM_PROFILE=claude-impl bun .loom-dispatch-smoke-wsl2b.ts
 * 선례: .loom-dispatch-smoke-wsl2.ts.
 */
import { addTask } from "./packages/host/src/task-board";
import { dispatchCard } from "./packages/host/src/card-ops";

const task = addTask({
  title: "SMOKE-WSL2B — WSL 노드 카드 왕복 스모크 (자율 완주)",
  notes: "SMOKE · node-wsl-1 2차 카드 왕복 · skip-permissions 검증 · 0-c ②",
});
console.log("task created:", task.id);

const result = await dispatchCard({
  taskId: task.id,
  node: "node-wsl-1",
  agentKind: "claude",
  prompt:
    "당신은 WSL 노드 스모크 워커다. 다음 두 명령을 실행하고 결과를 확인하라: git -C /root/.loom-src rev-parse --short HEAD 그리고 loom --version. 완료되면 최종 줄로 정확히 [SMOKE-WSL2B-OK] head=<sha> loom=<버전> 형식 한 줄을 출력하라. git commit/push 금지.",
});
console.log(JSON.stringify(result));
