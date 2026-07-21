/**
 * R41 리뷰 카드 발사 — PLAN 0.26.0 hooks 보조 센서 (claude-rev pane).
 * 선례: .loom-dispatch-r39.ts / .loom-dispatch-r38.ts (addTask → dispatchCard).
 *
 * 바인딩 전제 (lessons bridge-ops (17)): dispatchCard는 loadSession() active 바인딩 룸으로만
 * 나간다. claude-rev = mac-node = loom-local `room_32f3322b595456b7` (R38/R39 선례 동일 전제 —
 * `node: "mac-node"` 무-use 발사 = active 바인딩이 loom-local일 때 성립). 만약 현재 active
 * 바인딩이 다른 룸이면 발사 전 `loom relay use loom-local`로 전환 후 실행.
 * 실행 예: env -u LOOM_RELAY_URL -u LOOM_RELAY_TOKEN LOOM_PROFILE=claude-impl bun run .loom-dispatch-r41.ts
 */
import { addTask } from "./packages/host/src/task-board";
import { dispatchCard } from "./packages/host/src/card-ops";

const task = addTask({
  title: "R41 리뷰 — PLAN 0.26.0 hooks 보조 센서 (claude 워커 상태 힌트) (claude-rev pane)",
  notes: "R-REQUEST · brief=.loom-r41-brief.md · reviewer=claude(Fable) · advisor 필수",
});
console.log("task created:", task.id);

const result = await dispatchCard({
  taskId: task.id,
  node: "mac-node",
  prompt: [
    "리포 루트의 .loom-r41-brief.md 파일을 읽고 그대로 수행하라.",
    "요지: 당신은 claude-rev 리뷰어다. docs/PLAN.md 0.26.0 블록(pending-review R41 — hooks 보조 센서)을",
    "WORKFLOW §5 기준으로 리뷰한다. verdict 작성 전 fable-advisor 서브에이전트 자문이 필수이며,",
    "산출물은 docs/plan_review.md의 Review R41 하나뿐이다. 제품 코드 구현·타 파일 수정·git commit/push 금지.",
    "완료 시 브리프의 [R41-DONE] 형식 한 줄을 최종 출력하라.",
  ].join(" "),
  agentKind: "claude",
});
console.log(JSON.stringify(result));
