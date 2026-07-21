import { addTask } from "./packages/host/src/task-board";
import { dispatchCard } from "./packages/host/src/card-ops";

const task = addTask({
  title: "IMPL-0240 — PLAN 0.24.0 단독 모드 기능화 구현 (grok pane)",
  notes: "brief=.loom-impl-0240-brief.md · R37 락 M-1·M-2·L-1..L-5 binding · 커밋 금지",
});
console.log("task created:", task.id);

const result = await dispatchCard({
  taskId: task.id,
  node: "mac-node",
  prompt: [
    "리포 루트의 .loom-impl-0240-brief.md 파일을 읽고 그대로 수행하라.",
    "요지: docs/PLAN.md 0.24.0 블록(approved R37)이 SSOT인 구현 카드다 — 브리프와 다르면 PLAN이 이긴다.",
    "R37 락 M-1·M-2·L-1..L-5는 구현 필수 요건이다. git commit/push 금지, docs/ 수정 금지, 스코프 밖 리팩터링 금지.",
    "검증: bun test 전체 + 6패키지 typecheck. 완료 시 브리프 §8의 [IMPL-0240-DONE] 형식 한 줄을 최종 출력하라.",
  ].join(" "),
  agentKind: "grok",
});
console.log(JSON.stringify(result));
