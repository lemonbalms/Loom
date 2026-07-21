import { updateTask } from "./packages/host/src/task-board";
const r = updateTask("task_b5c28c87290db951", {
  status: "todo",
  notes: "pane 사망으로 완전 손실(산출물 0건) — 오늘 4개 pane 카드 중 3번째 동일 결함 사망. in-harness 폴백으로 재수행(DOGFOOD_LOOP §1.2 에스컬레이션).",
});
console.log(JSON.stringify(r?.status ?? r));
