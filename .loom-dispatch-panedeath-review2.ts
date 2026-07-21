/**
 * PANEDEATH-REVIEW2 — 락 교체본 반영 충실도 + 잔여 결함 (codex pane · 2차)
 * 실행: env -u LOOM_RELAY_URL -u LOOM_RELAY_TOKEN LOOM_PROFILE=claude-impl bun run .loom-dispatch-panedeath-review2.ts
 */
import { addTask, updateTask } from "./packages/host/src/task-board";
import { dispatchCard } from "./packages/host/src/card-ops";

const lines = [
  "역할: 적대적 검증자 2차. 구현자가 아니다. 제품 코드(packages/**)를 고치지 마라.",
  "경위: 네가(codex 레인) 1차 검증에서 verdict=reject, High 3 / Medium 6 을 냈다. 보고서는 docs/reviews/PANEDEATH-CODEX-REVIEW.md 다. 아키텍트가 이를 전면 수용해 docs/spikes/PANE-DEATH-DESIGN.md §9-bis 의 락 8건 중 7건을 네 보고서 §3의 대체 문구로 축자 교체했고, 아키텍트 범위 판정으로 락 9번을 신설했다. 커밋 5df040e.",
  "주의 — 이 카드에는 구조적 약점이 있다: 대체 문구의 저자가 너 자신이므로 이 2차 검증은 자기 문안 자기 검토다. 그 편향을 의식하고, '내가 쓴 것이니 맞다'로 기울지 마라. 별도로 독립 스켑틱 검토가 병행되고 있다.",
  "검증할 것 1 — 반영 충실도. §9-bis 락 1~8이 네 보고서 §3의 대체 문구와 축자로 일치하는가. 누락·변형·문맥 유실이 있는가. 특히 '유지' 판정이었던 락 2가 원문 그대로인지 확인하라.",
  "검증할 것 2 — 신설된 락 9번(아키텍트 범위 판정)을 공격하라. 내용: commit_unknown 도입과 ACK 엄격 판정(status ∈ {queued, delivered} 이고 recipientCount=1 일 때만 committed)은 이번 PATCH 채택, relay/tower idempotency 와 inbox reconcile 은 별도 PATCH 분리, 그동안 wire exactly-once 를 주장하지 않는다. 질문: 이 분리로 이번 PATCH가 여전히 유의미한 보장을 제공하는가, 아니면 핵심을 뺀 껍데기가 되는가. relay 코드를 읽고 status 와 recipientCount 가 실제로 그 의미로 반환되는지 확인하라 — 반환값 계약이 문서 가정과 다르면 그 자체가 High 다.",
  "검증할 것 3 — 락 사이의 정합성. 락 3(unexpected terminal → bounded reconcile trigger) · 락 6(unknown terminal inert + 등록 직전 사망 회수) · 락 8(연속 2회 absent strike)이 서로 모순 없이 동시에 성립하는가. lifecycle generation 개념이 9개 락에서 일관된 의미로 쓰이는가. 한 락을 지키면 다른 락이 깨지는 조합이 있는가.",
  "검증할 것 4 — 구현 준비도. 이 문안만 받은 구현자가 서로 다르게 구현할 수 있는 지점을 찾아라. 락은 모호하면 락이 아니다. 각 모호점에 대해 구체적으로 어떻게 갈리는지 두 가지 구현을 제시하라.",
  "검증할 것 5 — 1차에서 네가 '미확인'으로 남긴 7건(내부 id 대응 · status replay 여부 · pane_id 재사용 · 백로그 상한 · ACK 유실 재현 · WSL/VPS 차이 · 프로브 미재실행) 중, 구현 전에 반드시 닫아야 하는 것과 구현 후로 미뤄도 되는 것을 분류하라. 반드시 닫아야 하는 것이 있다면 그것을 닫는 최소 실험을 1줄로 제시하라.",
  "판정 규칙: 네가 반증하지 못했다는 것과 그것이 참이라는 것은 다르다 — 구분해서 써라. 확신 없으면 없다고 써라.",
  "산출물: docs/reviews/PANEDEATH-CODEX-REVIEW2.md 를 새로 만들어라. 구성 — ① 한 줄 verdict: approve / approve-with-changes / reject 와 이유 한 문장 ② 반영 충실도 판정(축자 일치 여부, 불일치 항목 나열) ③ findings 표(심각도 · 대상 · 결함 1문장 · 실패 시나리오 1문장) ④ 미확인 7건의 구현 전/후 분류표 ⑤ 구현 착수 가능 여부와 그 조건.",
  "1차 보고서 docs/reviews/PANEDEATH-CODEX-REVIEW.md 는 정본이므로 수정하지 마라. docs/spikes/ 이하와 docs/plan_review.md 도 읽기 전용이다. R{n} verdict 본문 작성은 네 역할이 아니다.",
  "git commit / push 금지. 브랜치 생성 금지.",
  "작업이 길어지면 중간 보고를 pane에 인라인으로 남겨라 — 턴이 끊겨도 부분 회수가 가능하도록.",
  "완료 시 최종 줄에 정확히: [PANEDEATH-REVIEW2-DONE] verdict=<approve|approve-with-changes|reject> high=<n> med=<n> ready=<yes|no>",
];

const task = addTask({
  title: "PANEDEATH-REVIEW2 — 락 교체본 반영 충실도 + 잔여 결함 (codex pane · 읽기 전용)",
  notes: "REVIEW 2차 · 자기 문안 자기 검토 편향 명시 · 독립 스켑틱 병행",
});
updateTask(task.id, { status: "doing", assignee: "codex-impl" });
console.log("claimed:", task.id);

const result = await dispatchCard({
  taskId: task.id,
  node: "mac-node",
  prompt: lines.join(" "),
  agentKind: "codex",
});
console.log("dispatched:", JSON.stringify(result));
