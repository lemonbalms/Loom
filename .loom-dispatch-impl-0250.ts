import { addTask } from "./packages/host/src/task-board";
import { dispatchCard } from "./packages/host/src/card-ops";

const task = addTask({
  title: "IMPL-0250 — PLAN 0.25.0 conv artifact fetch 자동 실행: 신규 MCP 툴 conv_fetch (scp transport v1) (grok pane)",
  notes: "IMPL · brief=.loom-impl-0250-brief.md · impl=grok · R40 approved(M-A/M-B/M-C/M-D lock)",
});
console.log("task created:", task.id);

const result = await dispatchCard({
  taskId: task.id,
  node: "mac-node",
  prompt: [
    "리포 루트의 .loom-impl-0250-brief.md 파일을 읽고 그대로 수행하라.",
    "요지: 당신은 grok-impl 구현자다. PLAN §0.25.0(approved R40, docs/PLAN.md 53~110행 정독 필수)을 구현한다 —",
    "신규 MCP 툴 conv_fetch(convId, seq, index)로 scp ref 좌표만으로 브릿지 노드에서 산출물 파일 실제 회수.",
    "신설 packages/host/src/conv-artifact-fetch.ts(+.test.ts)·conv-state에 턴별 artifacts ref additive 저장(M-D fresh turn만)·",
    "mcp-server tools.ts+stdio.ts에 conv_fetch 등록·VERSION 0.25.0 동기(cli index.ts:144·mcp stdio.ts:381).",
    "락: M-A(sha256 부재 ref 거부)·M-B(host validateConvNodeHost 전체 재적용)·M-C(원격 path charset+isSafeConvSuffix 실행-경로 적용)·M-D(fresh turn만)·",
    "D4 셸 미경유 argv 직접 spawn+실행 직전 재검증·D5 containment(root realpath)+덮어쓰기 거부·D6 sha 불일치 즉시 삭제·D7 60s 타임아웃·10MiB·직렬화.",
    "conv_await 반환 계약·기존 present 경로·wire 무변경. scp -- 옵션 종료 지원 실측 후 채택(U2).",
    "git commit/push 금지 — 검증까지만. 완료 시 브리프의 [IMPL-0250-DONE] 형식 한 줄을 최종 출력하라.",
  ].join(" "),
  agentKind: "grok",
});
console.log(JSON.stringify(result));
