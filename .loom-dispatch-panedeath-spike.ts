/**
 * PANEDEATH-SPIKE — §9 미확정(1·2·3·5) 닫기: 원시 herdr event 구독 프로브
 * 실행: env -u LOOM_RELAY_URL -u LOOM_RELAY_TOKEN LOOM_PROFILE=claude-impl bun run .loom-dispatch-panedeath-spike.ts
 */
import { addTask, updateTask } from "./packages/host/src/task-board";
import { dispatchCard } from "./packages/host/src/card-ops";

const lines = [
  "목표: pane이 죽을 때 herdr가 실제로 방출하는 이벤트의 원문·순서·payload를 관측해 기록한다. 이것은 관측 전용 스파이크다 — 제품 코드(packages/** )는 한 줄도 고치지 마라. 설계 반영은 다음 카드의 몫이다.",
  "배경: 브릿지가 완료 후보를 너무 일찍 done으로 커밋하고 그 결과로 pane.close를 호출한다(finishCard — packages 내 bridge-runtime.ts, pane.close 지점 2320 부근). 이 때문에 가짜 card.done이 발생한다. 설계 정본은 docs/spikes/PANE-DEATH-DESIGN.md 이고, 그 §9에 미확정 항목이 남아 있다. 이 카드는 그중 1·2·3·5만 닫는다.",
  "닫을 항목 4개를 정확히 이해하라. (1) 자연사 시 방출되는 이벤트가 pane.closed 인지 pane.exited 인지, 실제 push 원문과 순서. (2) exit code / signal 이 소켓 이벤트 payload에 실리는가 — 필드 원문 덤프로 확인. (3) API로 pane을 close 한 뒤에 뒤늦은 child-exit 콜백이 오는가, 그리고 PaneDied for unknown pane 경고가 어떤 조건에서 나오는가. (5) result ACK ↔ 마커 ↔ close 의 monotonic 순서가 보존되는가 — 각 이벤트 수신 시각을 밀리초로 찍어 순서를 증거로 남겨라.",
  "구현 지시 — 프로브는 반드시 원시 소켓 JSON-RPC로 직접 구독하라. packages/host/src/herdr-client.ts 의 HerdrClient 를 경유하지 마라. 이유: 그 클라이언트의 증분 재구독 로직 자체가 과거 이벤트 유실의 원인이었고(2026-07-18 구독 사망 사건), 관측 도구가 용의자를 경유하면 관측이 오염된다. 소켓 경로와 subscribe 메서드 이름·페이로드 형식은 herdr-client.ts(544-566 부근의 eventsSubscribe)를 읽어서 알아내되, 코드는 새로 짜라.",
  "선례 형식 모델: 리포 루트의 .loom-hook-listener-probe.ts 를 참고하라 — 브릿지 없이 리스너를 직접 기동하는 프로브의 선례다.",
  "파일: 프로브는 scripts/probe-pane-death.ts 로 새로 만들어라. 관측 결과는 docs/spikes/PANE-DEATH-OBSERVATIONS.md 에 새 파일로 써라. 기존 docs/spikes/PANE-DEATH-DESIGN.md 는 수정하지 마라(설계 반영은 R 게이트 후의 별도 작업이다).",
  "관측 시나리오 3개를 각각 수행하고 전부 원문 로그로 남겨라. A: scratch pane에서 셸을 정상 종료(exit)시켰을 때. B: scratch pane의 프로세스를 SIGKILL 했을 때. C: herdr pane close API로 닫았을 때, 그리고 close 직후 뒤늦은 이벤트가 오는지 최소 10초 더 구독을 유지하며 관측.",
  "안전 규칙 — 위반 시 카드 실패로 간주한다. 죽이는 pane은 오직 네가 이 스파이크를 위해 직접 새로 만든 scratch pane 뿐이다. 기존 pane은 무엇도 건드리지 마라. 특히 w3:p2(아키텍트 세션)·w3:p1J(브릿지 로그 tail)·w4:p1·w8:p1·w3:p46 은 절대 종료 대상이 아니다. SIGKILL 전에 대상 pane_id 와 pid 를 로그에 먼저 출력해 네가 만든 것임을 증거로 남겨라.",
  "브릿지가 이벤트를 구독 중인 워커 pane은 이동하지도 종료하지도 마라.",
  "보고서 docs/spikes/PANE-DEATH-OBSERVATIONS.md 구성: ① 시나리오 A·B·C 각각의 이벤트 원문 시퀀스(수신 시각 ms 포함, JSON 원문 그대로 — 요약 금지) ② §9-1·2·3·5 각 항목별로 '닫힘/미확인' 판정 1줄 + 근거가 되는 로그 줄 지시 ③ 관측으로 확인된 사실과 추론을 구분해 표기 ④ 재현 명령 1줄.",
  "정직성 요구: 관측하지 못한 것은 '미확인'이라고 써라. 설계 문서가 그렇게 말한다는 이유로 관측되지 않은 것을 확인됨으로 쓰지 마라 — 오늘 설계 문서 좌표가 틀린 사례가 이미 나왔다.",
  "테스트: 프로브는 일회성 관측 도구라 유닛 테스트를 새로 만들지 않아도 된다. 다만 bun run --filter '*' typecheck 가 네 신규 파일 때문에 깨지지 않는지는 확인하라. 전체 테스트 스위트 실행은 아키텍트 몫이다.",
  "git commit / git push 금지. 브랜치 생성 금지.",
  "완료 시 최종 줄에 정확히: [PANEDEATH-SPIKE-DONE] scenarios=<a|b|c 중 성공한 것> closed=<닫은 §9 항목 번호들> typecheck=<pass|fail>",
];

const task = addTask({
  title: "PANEDEATH-SPIKE — §9 미확정(1·2·3·5) 원시 이벤트 구독 관측 (grok pane)",
  notes: "SPIKE · 관측 전용 · 제품 코드 무변경 · PANE-DEATH 구현 선행",
});
updateTask(task.id, { status: "doing", assignee: "grok-impl" });
console.log("claimed:", task.id);

const result = await dispatchCard({
  taskId: task.id,
  node: "mac-node",
  prompt: lines.join(" "),
  agentKind: "grok",
});
console.log("dispatched:", JSON.stringify(result));
