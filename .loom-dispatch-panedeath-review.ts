/**
 * PANEDEATH-REVIEW — R{n} 선행 적대적 검증 (codex pane · 오너 지시 2026-07-20 "검증은 codex")
 * 실행: env -u LOOM_RELAY_URL -u LOOM_RELAY_TOKEN LOOM_PROFILE=claude-impl bun run .loom-dispatch-panedeath-review.ts
 */
import { addTask, updateTask } from "./packages/host/src/task-board";
import { dispatchCard } from "./packages/host/src/card-ops";

const lines = [
  "역할: 너는 적대적 검증자다. 구현자가 아니다. 제품 코드(packages/**)를 고치지 마라. 네 임무는 아키텍트가 세운 설계 결정을 깨뜨리려고 시도하는 것이다.",
  "대상: docs/spikes/PANE-DEATH-DESIGN.md 의 §9(미확정 판정)와 §9-bis(R{n} 락 후보 8건). 관측 근거는 docs/spikes/PANE-DEATH-OBSERVATIONS.md 다. 원시 로그는 docs/spikes/.panedeath-probe-raw.jsonl(라운드2 완주본 382줄)과 .panedeath-probe-raw.round1.jsonl(라운드1 미완주본)이며 커밋되지 않았지만 워킹트리에 있다. 프로브 소스는 scripts/probe-pane-death.ts 이고 bun run scripts/probe-pane-death.ts --scenario all 로 재현할 수 있다.",
  "배경 한 문단: 브릿지가 카드 완료 후보를 너무 일찍 done으로 커밋하고 그 결과로 pane.close를 호출한다(finishCard — packages/host/src/bridge-runtime.ts, pane.close 지점 2320 부근, finishCard 정의 2246, disposeCardFlight 1946, pane_closed 핸들러 2119). 이 때문에 가짜 card.done과 워커 조기 종료가 발생했다. 채택 예정 설계는 권고 B(종료 펜스 + 결과-커밋 tombstone + bounded reconcile)다.",
  "검증할 것 1 — §9 판정이 관측으로 실제로 뒷받침되는가. 특히 §9-3(PaneDied for unknown pane 은 우리 자신의 pane.close 가 유발한다)의 근거는 식별자 매칭이 아니라 타이밍 대응이다(경고는 내부 id pane=236 을 쓰고 pane_id 는 w3:p5J 였다). 이 추론이 정당한가, 아니면 대안 설명이 남아 있는가. 원시 로그로 직접 확인하라.",
  "검증할 것 2 — §9-5(순서 보존)를 '부분'으로 두고 불변식으로 잠그지 않기로 한 판단이 옳은가. 마진이 22ms~211ms로 진동하고 n=2다. 구현이 이 순서에 암묵적으로 의존하게 될 지점이 코드에 있는지 찾아라.",
  "검증할 것 3 — 락 후보 8건 각각에 대해: 이 락이 실제로 필요한가, 문구가 구현자에게 모호하지 않은가, 그리고 이 락을 지켜도 여전히 깨지는 시나리오가 있는가. 특히 3번(replay 방어 이중 조건: 현재 flight의 pane_id 일치 + 구독 시작 이후 도착)과 5번(result_sending→committed 원자 CAS로 이중 발행 방지)을 집중 공격하라. 이 둘이 이번 PATCH의 핵심이다.",
  "검증할 것 4 — 관측이 놓친 실패 모드. herdr가 신규 구독자에게 과거 terminal 이벤트를 바이트 동일로 재전달한다는 사실(슬라이딩 백로그, 보존 10분 이상, 클라이언트 사망을 넘어 생존)이 확인됐다. 이 replay가 종료 펜스 외에 브릿지의 다른 경로를 오염시키지 않는지 확인하라 — packages/host/src/herdr-client.ts 의 구독 진입(544-566 부근)과 eventsPrune(274 부근), onHerdrEvent(bridge-runtime.ts 1899-1916)를 읽고 판단하라.",
  "검증할 것 5 — 좌표 검증. 위에 적은 파일:라인 좌표가 실제와 맞는지 직접 확인하라. 오늘 설계 문서 좌표가 틀린 사례가 이미 두 번 나왔다(§2.1의 1179-1203은 실제 1200, HOOK-CACHE 설계가 지목한 context-generator.cjs는 데드 번들이었다). 틀린 좌표는 그 자체로 findings 항목이다.",
  "판정 규칙: 확신이 없으면 없다고 써라. 설계 문서가 그렇게 말한다는 이유로 확인되지 않은 것을 확인됨으로 쓰지 마라. 네가 반증하지 못했다는 것과 그것이 참이라는 것은 다르다 — 구분해서 써라.",
  "산출물: docs/reviews/PANEDEATH-CODEX-REVIEW.md 를 새로 만들어라(디렉터리가 없으면 만들어라). 구성 — ① 한 줄 verdict: approve / approve-with-changes / reject 중 하나와 이유 한 문장 ② findings 표(심각도 High/Medium/Low · 대상 §번호 또는 파일:라인 · 결함 1문장 · 구체적 실패 시나리오 1문장) ③ 락 후보 8건 각각에 대한 유지/수정/삭제 의견과 수정 시 대체 문구 ④ 네가 깨뜨리려 시도했으나 실패한 항목 목록(이게 신뢰의 근거다) ⑤ 미확인으로 남긴 것.",
  "다른 파일은 수정하지 마라. 특히 docs/spikes/PANE-DEATH-DESIGN.md 와 PANE-DEATH-OBSERVATIONS.md 와 docs/plan_review.md 는 읽기만 하고 절대 편집하지 마라. R{n} verdict 본문 작성은 네 역할이 아니다.",
  "git commit / push 금지. 브랜치 생성 금지.",
  "작업이 길어지면 중간 보고를 pane에 인라인으로 남겨라 — 턴이 끊겨도 부분 회수가 가능하도록.",
  "완료 시 최종 줄에 정확히: [PANEDEATH-REVIEW-DONE] verdict=<approve|approve-with-changes|reject> high=<n> med=<n> low=<n>",
];

const task = addTask({
  title: "PANEDEATH-REVIEW — §9 판정 + 락 후보 8건 적대적 검증 (codex pane · 읽기 전용)",
  notes: "REVIEW · 오너 지시: 검증은 codex 레인 · R{n} 게이트 선행",
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
