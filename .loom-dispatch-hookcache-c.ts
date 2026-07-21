import { addTask } from "./packages/host/src/task-board";
import { dispatchCard } from "./packages/host/src/card-ops";

const task = addTask({
  title: "HOOKCACHE-C — lessons 인덱스 문안 재작성: 같은 파일 <details> 구조 분리 (claude pane)",
  notes: "IMPL · brief=.loom-hookcache-C-brief.md · impl=claude · 오너 락 (a)=구조 분리(이동안 기각) · 최종 판별력 검수는 아키텍트가 fable-advisor로",
});
console.log("task created:", task.id);

const result = await dispatchCard({
  taskId: task.id,
  node: "mac-node",
  prompt: [
    "리포 루트의 .loom-hookcache-C-brief.md 파일을 읽고 그대로 수행하라.",
    "요지: 당신은 문안 작업 레인이다. tasks/lessons.md의 인덱스 32줄(8,633자)을 같은 파일 <details> 구조 분리로 재작성해",
    "SessionStart 주입 블록을 예산 안으로 되돌린다. 이 카드가 손대는 파일은 tasks/lessons.md 하나뿐이다.",
    "오너 락: 압축 방식 = 구조 분리(같은 파일 <details>). M-1 원안의 tasks/lessons/<category>.md로 이동은 기각됐다 — 내용을 옮기지 마라.",
    "규칙: 각 줄의 트리거 문구(어떤 작업 유형에서 이 카테고리를 열게 하는가)는 삭제 금지 ·",
    "경위·커밋해시·재범기록만 <details>로 접되 그 안은 원문 그대로(재요약 금지) · 헤더·사용규칙·카테고리줄은 손대지 마라.",
    "예산은 줄당 ≤120자 + 접기 후 인덱스 총량 ≤3,600자. 부담이 집중된 상위 8줄(2,726자 = 56%)부터 착수하라.",
    "⑦ V-4 자체 게이트 필수: 다이어트 후 텍스트만 읽고 32/32 줄에서 '이 줄만 보고 카테고리 파일을 열어야 할 작업인지' 판별 가능한지 검사하라.",
    "판별 불가한 줄은 임의로 되돌리거나 얼버무리지 말고 줄 번호·원문·이유를 그대로 보고하라 — 아키텍트가 판정한다.",
    "fable-advisor를 직접 스폰하지 마라 — 최종 판별력 검수는 아키텍트가 수행한다. 애매한 줄을 통과처럼 다듬는 것이 가장 나쁘다.",
    "git commit/push 금지 — 검증까지만. 완료 시 브리프의 [HOOKCACHE-C-DONE] 형식 한 줄을 최종 출력하라.",
  ].join(" "),
  agentKind: "claude",
});
console.log(JSON.stringify(result));
