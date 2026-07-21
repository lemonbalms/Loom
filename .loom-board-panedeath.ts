import { updateTask } from "./packages/host/src/task-board";
const r = updateTask("task_8439e93627e29f30", {
  status: "done",
  notes: "부분 완주 — grok pane이 보고서 작성 중 사망(프로브를 관측 대상과 같은 pane에서 돌린 설계 실수). 산출물 scripts/probe-pane-death.ts는 정상 동작. 아키텍트가 pane 밖에서 라운드2 재실행해 완주(PROBE_END success=[a,b,c], 382줄). §9-1·2·3 닫힘, §9-5 부분.",
});
console.log(JSON.stringify(r?.status ?? r));
