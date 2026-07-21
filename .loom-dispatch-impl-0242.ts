import { addTask } from "./packages/host/src/task-board";
import { dispatchCard } from "./packages/host/src/card-ops";

const task = addTask({
  title: "IMPL-0242 — PLAN 0.24.2 Windows 실배포 결함 2건 수정 (grok pane)",
  notes: "IMPL · brief=.loom-impl-0242-brief.md · impl=grok · R39 approved(M-1 containment lock)",
});
console.log("task created:", task.id);

const result = await dispatchCard({
  taskId: task.id,
  node: "mac-node",
  prompt: [
    "리포 루트의 .loom-impl-0242-brief.md 파일을 읽고 그대로 수행하라.",
    "요지: 당신은 grok-impl 구현자다. PLAN §0.24.2(approved R39, docs/PLAN.md 정독 필수)를 구현한다 —",
    "D1 persist 경로 가드 구분자 교정(persist.ts:23 sep import·:389 realState+sep)·D2 server.ts:176 handleMessage try/catch(생존)·",
    "D9 VERSION 0.24.2·테스트 2종(containment 어서션 — 거부 어서션 금지·D2 크래시 가드). create 롤백/rethrow(room.ts:743-752) 무변경.",
    "git commit/push 금지 — 검증까지만. 완료 시 브리프의 [IMPL-0242-DONE] 형식 한 줄을 최종 출력하라.",
  ].join(" "),
  agentKind: "grok",
});
console.log(JSON.stringify(result));
