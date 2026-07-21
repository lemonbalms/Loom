/**
 * SMOKE-HOOK-B — v0.26.0 hookSensor 라이브 스모크 B(permission_prompt 실발화 + agent_blocked 1:1 교정).
 * 실행: 리포 루트에서  LOOM_PROFILE=claude-impl bun .loom-dispatch-smoke-hook-b.ts
 */
import { addTask } from "./packages/host/src/task-board";
import { dispatchCard } from "./packages/host/src/card-ops";

const task = addTask({
  title: "SMOKE-HOOK-B — hookSensor permission_prompt 실발화 (승인 대기)",
  notes: "SMOKE · hookSensor:true · sonnet 워커 · permission_prompt→agent_blocked 교정 실증",
});
console.log("task created:", task.id);

const result = await dispatchCard({
  taskId: task.id,
  node: "mac-node",
  agentKind: "claude",
  prompt:
    "당신은 hookSensor 스모크 워커다. Bash 도구로 다음 명령을 실행하라: touch /tmp/loom-smoke-hook-b — 실행 후 최종 줄로 정확히 [SMOKE-HOOK-B-OK] touched 를 출력하라. git 조작 금지.",
});
console.log(JSON.stringify(result));
