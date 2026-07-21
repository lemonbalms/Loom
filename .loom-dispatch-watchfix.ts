import { addTask } from "./packages/host/src/task-board";
import { dispatchCard } from "./packages/host/src/card-ops";

const task = addTask({
  title: "WATCH-CARD-FIX — 마커 echo 오탐 수정: 주입 프롬프트를 완료로 오인 (grok pane)",
  notes: "IMPL · 도그푸딩 1회차에서 즉시 재현 · lessons 'echo 오탐 주의' 재범",
});
console.log("task created:", task.id);

const result = await dispatchCard({
  taskId: task.id,
  node: "mac-node",
  prompt: [
    "scripts/watch-card.ts 에 결함이 있다. 첫 실사용에서 즉시 재현됐다.",
    "증상: 카드 발사 직후 watch-card가 exit=marker 로 즉시 종료했다. 워커는 아무 일도 하지 않은 상태였다.",
    "원인: 디스패치 프롬프트에 '완료 시 최종 줄에 정확히: [HOOKCACHE-D-VERIFY-DONE] fix1=<closed|open|partial> ...' 같은 지시문이 들어 있고, 그것이 pane 화면에 그대로 에코된다. watch-card가 그 에코를 완료 마커로 오인했다. (이 함정은 tasks/lessons.md에 '마커 감시 이중방어 유지 — echo 오탐 주의'로 이미 기록돼 있다.)",
    "수정 방향(하나만 고르지 말고 조합하라): ① 템플릿 판별 — 지시문의 마커는 fix1=<closed|open|partial> 처럼 꺾쇠·파이프 등 플레이스홀더 문자를 달고 있고 실제 출력은 fix1=closed 처럼 값이 채워진다. 플레이스홀더가 남아 있는 매치는 마커로 인정하지 마라. ② 위치 기준 — 실제 마커는 워커 출력의 말미에 나타난다. 화면 전체가 아니라 꼬리 N줄(기본값을 두되 인자로 조정 가능)만 검사하라. ③ 베이스라인 — 감시 시작 시점의 화면을 스냅샷해 두고, 그 시점에 이미 존재하던 매치는 무시하라(새로 나타난 것만 완료로 본다). ③이 가장 일반적인 해법이니 이것을 축으로 삼고 ①②를 보강으로 쓰라.",
    "주의: 지나치게 엄격해져 진짜 마커를 놓치면 더 나쁘다(감시가 침묵하면 워커 완료를 영영 모른다). 두 방향의 오류를 모두 테스트로 잠가라.",
    "유닛 테스트에 최소 다음을 추가하라: ① 플레이스홀더가 남은 템플릿 문자열은 마커로 인정하지 않음 ② 값이 채워진 실제 마커는 인정 ③ 감시 시작 시점에 이미 있던 매치는 무시하고 이후 새로 나타난 동일 마커는 인정 ④ 프롬프트 에코와 실제 출력이 같은 화면에 공존할 때 실제 출력만 잡음.",
    "기존 종료 사유 계약(marker=0 / pane-gone=1 / limit=2 / timeout=3 / usage err=64)과 기존 35개 유닛을 깨지 마라.",
    "다른 카드가 편집 중인 파일(scripts/session-context.ts · scripts/check-mem-header.ts · tasks/lessons.md · docs/spikes/)을 건드리지 마라.",
    "테스트는 env -u LOOM_RELAY_TOKEN -u LOOM_RELAY_URL bun test scripts/watch-card.test.ts 까지만. 전체 스위트는 아키텍트가 병행 실행 중이니 돌리지 마라.",
    "git commit/push 금지. 완료 시 최종 줄에 정확히: [WATCHFIX-DONE] units=<n/n> baseline=<ok|fail> template=<ok|fail>",
  ].join(" "),
  agentKind: "grok",
});
console.log(JSON.stringify(result));
