/**
 * 스모크 아티팩트 보드 정리 — 1~3차 blocked 태스크에 실증 기록 note 부착 + done 종결.
 * loom-dev 보드(room_ca184b781cfdabdc) 대상. 4차(task_f32bdcbf)는 이미 done.
 * 실행: LOOM_PROFILE=claude-impl bun run .loom-board-tidy-smoke.ts
 */
import { updateTask, findTask } from "./packages/host/src/task-board";

const roomId = "room_ca184b781cfdabdc"; // loom-dev
const note =
  "스모크 실증 기록 — 1차 승인게이트, 2차/3차 root+skip-permissions 즉사(inject_unconfirmed) 아티팩트, 4차(task_f32bdcbfbe977496) 클린 완주. 0-c ②";

const ids = [
  "task_ae5c1fe784b7469b", // 1차 (agent_blocked)
  "task_082a7b13dafa12de", // 2차 (inject_unconfirmed)
  "task_bf2d6dcc5d7b9b42", // 3차 (inject_unconfirmed)
];

for (const id of ids) {
  const t = findTask(id, roomId);
  if (!t) {
    console.log("NOT FOUND:", id);
    continue;
  }
  const u = updateTask(id, { notes: note, status: "done" }, roomId);
  console.log(`${id} -> ${u.status} | ${u.notes}`);
}
