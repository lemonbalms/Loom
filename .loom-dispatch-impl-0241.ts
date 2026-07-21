import { addTask } from "./packages/host/src/task-board";
import { dispatchCard } from "./packages/host/src/card-ops";

const task = addTask({
  title: "IMPL-0241 — PLAN 0.24.1 relay 포그라운드 durable 배선 (grok pane)",
  notes: "IMPL · brief=.loom-impl-0241-brief.md · impl=grok · R38 approved(M-1 lock 반영본)",
});
console.log("task created:", task.id);

const result = await dispatchCard({
  taskId: task.id,
  node: "mac-node",
  prompt: [
    "리포 루트의 .loom-impl-0241-brief.md 파일을 읽고 그대로 수행하라.",
    "요지: 당신은 grok-impl 구현자다. PLAN §0.24.1(approved R38, docs/PLAN.md 정독 필수)을 구현한다 —",
    "loom relay 포그라운드 분기에 durable RoomRegistry 배선 이식(D1 배선·D2 셧다운 훅·D3 fail-closed·",
    "D6 공유 헬퍼(M-1 lock)·D9 VERSION 0.24.1·D11 상태 로그·테스트 3케이스). 배선만 — persist/room/server 로직 무변경.",
    "git commit/push 금지 — 검증까지만. 완료 시 브리프의 [IMPL-0241-DONE] 형식 한 줄을 최종 출력하라.",
  ].join(" "),
  agentKind: "grok",
});
console.log(JSON.stringify(result));
