/**
 * SMOKE-HOOK-D — v0.26.0 hookSensor 라이브 스모크 D(permission_prompt 실발화 — 자연문 페이로드, 마커 없음).
 * 실행: 리포 루트에서  LOOM_PROFILE=claude-impl bun .loom-dispatch-smoke-hook-d.ts
 */
import { addTask } from "./packages/host/src/task-board";
import { dispatchCard } from "./packages/host/src/card-ops";

const task = addTask({
  title: "SMOKE-HOOK-D — hookSensor permission_prompt 실발화 (자연문)",
  notes: "SMOKE · hookSensor:true · sonnet+permission-mode default · 마커 없는 benign 페이로드",
});
console.log("task created:", task.id);

const result = await dispatchCard({
  taskId: task.id,
  node: "mac-node",
  agentKind: "claude",
  prompt:
    "hookSensor 라이브 스모크를 진행 중입니다(오너 승인 하의 보드 태스크). Bash 도구로 touch /tmp/loom-smoke-hook-d 를 실행해 주세요. 실행 후 결과를 한 줄로 짧게 보고해 주시면 됩니다.",
});
console.log(JSON.stringify(result));
