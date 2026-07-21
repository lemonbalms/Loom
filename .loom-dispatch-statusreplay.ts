/**
 * STATUS-REPLAY — 구현 전 필수 실험: pane.agent_status_changed 가 replay 되는가 (grok pane)
 * 실행: env -u LOOM_RELAY_URL -u LOOM_RELAY_TOKEN LOOM_PROFILE=claude-impl bun run .loom-dispatch-statusreplay.ts
 */
import { addTask, updateTask } from "./packages/host/src/task-board";
import { dispatchCard } from "./packages/host/src/card-ops";

const lines = [
  "목표: herdr가 pane.agent_status_changed 이벤트도 신규 구독자에게 재전달(replay)하는지 관측으로 확정한다. 관측 전용 스파이크다 — 제품 코드(packages/**)는 한 줄도 고치지 마라.",
  "왜 중요한가: 이미 terminal 이벤트(pane_exited/pane_closed)가 신규 구독자에게 바이트 동일로 재전달된다는 것이 확인됐다(docs/spikes/PANE-DEATH-OBSERVATIONS.md). status 이벤트도 같다면, 브릿지가 새 카드 구독을 추가할 때마다 기존 카드의 오래된 working→idle 전이가 재생돼 조기 완료(가짜 done)를 만들 수 있다. 즉 terminal만 방어해서는 부족해진다. 이것이 구현 착수의 선결 조건이다.",
  "선행 자산: scripts/probe-pane-death.ts 가 이미 원시 소켓 JSON-RPC 프로브의 전 구조를 갖고 있다(소켓 연결·구독·이벤트 로깅·scratch pane 생성·완주 마커 PROBE_END). 이것을 재사용하라 — 새 프로브를 처음부터 짜지 마라.",
  "구현: scripts/probe-pane-death.ts 에 시나리오 D 를 추가하라. --scenario d 로 단독 실행 가능해야 하고, 기존 --scenario a|b|c|all 동작을 깨뜨리지 마라. HerdrClient 를 경유하지 말고 기존 프로브와 동일하게 원시 소켓을 쓰라.",
  "시나리오 D 절차: ① scratch agent pane 을 하나 만든다 — 이번엔 plain bash 가 아니라 실제로 agent_status 전이가 관측되는 형태여야 한다(기존 프로브의 라운드2에서 plain bash 는 status push 0건이었다. agent kind 를 지정해 띄우거나, herdr 가 status 를 부여하는 형태를 찾아라 — pane.list 의 agent_status 필드가 unknown 이 아닌 값으로 바뀌는지 확인하는 것이 성공 판정이다). ② 그 pane 에 대해 pane.agent_status_changed 를 구독하고 working→idle 전이를 최소 1회 실제로 발생시켜 원문을 기록한다. ③ 전이가 끝난 뒤 구독 소켓을 닫고, 새 소켓으로 같은 pane 을 다시 구독한다. ④ 과거 status push 가 다시 오는지 최소 15초 관측하고 원문·수신 시각을 기록한다. ⑤ 대조군: 같은 창에서 terminal 이벤트도 함께 구독해, terminal 은 replay 되는데 status 는 안 되는지(혹은 둘 다 되는지) 같은 실행 안에서 비교한다.",
  "판정 기준을 명확히 하라: status push 가 0건이면 그것은 'replay 없음의 증거'가 아니라 '전이를 만들지 못했거나 구독이 성립하지 않았다'일 수 있다. ②에서 라이브 status push 를 최소 1건 실제로 받은 경우에만 ④의 0건이 의미를 갖는다. 이 구분을 보고서에 반드시 명시하라 — 1차 관측에서 정확히 이 함정이 있었다.",
  "안전 규칙 — 위반 시 카드 실패로 간주한다. 죽이거나 닫는 pane 은 오직 네가 이 시나리오를 위해 직접 만든 scratch pane 뿐이다. 기존 pane 은 무엇도 건드리지 마라. 기존 프로브의 보호 목록(protected) 메커니즘을 그대로 재사용하고, 현재 살아있는 pane 을 실행 시점에 보호 목록으로 잡아라.",
  "산출물: 관측 결과를 docs/spikes/PANE-DEATH-OBSERVATIONS.md 에 '## 시나리오 D — status replay 여부' 절로 추가하라(기존 절은 수정하지 마라 — 정본이다). 구성: 재현 명령 1줄 · 라이브 status push 원문(수신 시각 ms) · 재구독 후 관측 원문 또는 0건 · terminal 대조군 결과 · 판정 1줄(replay 됨 / replay 안 됨 / 미확인 셋 중 하나와 근거).",
  "docs/spikes/PANE-DEATH-DESIGN.md 와 docs/reviews/ 이하는 읽기만 하고 수정하지 마라.",
  "완주 검증: 프로브는 반드시 PROBE_END 마커까지 도달해야 한다. 도달하지 못했으면 부분 결과를 '절단됨'이라고 명시하고 완주로 보고하지 마라.",
  "테스트: bun run --filter '*' typecheck 가 네 변경으로 깨지지 않는지 확인하라. 전체 스위트는 아키텍트 몫이다.",
  "git commit / push 금지. 브랜치 생성 금지.",
  "완료 시 최종 줄에 정확히: [STATUS-REPLAY-DONE] live_status=<n건> replay=<yes|no|unknown> terminal_control=<yes|no> probe_end=<yes|no>",
];

const task = addTask({
  title: "STATUS-REPLAY — pane.agent_status_changed replay 여부 관측 (grok pane)",
  notes: "SPIKE · 구현 전 필수(codex 2차 분류) · 관측 전용 · 제품 코드 무변경",
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
