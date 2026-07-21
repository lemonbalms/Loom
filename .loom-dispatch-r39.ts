import { addTask } from "./packages/host/src/task-board";
import { dispatchCard } from "./packages/host/src/card-ops";

const task = addTask({
  title: "R39 리뷰 — PLAN 0.24.2 Windows 실배포 결함 2건 (claude-rev pane)",
  notes: "R-REQUEST · brief=.loom-r39-brief.md · reviewer=claude(Fable) · advisor 필수",
});
console.log("task created:", task.id);

const result = await dispatchCard({
  taskId: task.id,
  node: "mac-node",
  prompt: [
    "리포 루트의 .loom-r39-brief.md 파일을 읽고 그대로 수행하라.",
    "요지: 당신은 claude-rev 리뷰어다. docs/PLAN.md 0.24.2 블록(pending-review R39)을",
    "WORKFLOW §5 기준으로 리뷰한다. verdict 작성 전 fable-advisor 서브에이전트 자문이 필수이며,",
    "산출물은 docs/plan_review.md의 Review R39 하나뿐이다. 제품 코드 구현·타 파일 수정·git commit/push 금지.",
    "완료 시 브리프의 [R39-DONE] 형식 한 줄을 최종 출력하라.",
  ].join(" "),
  agentKind: "claude",
});
console.log(JSON.stringify(result));
