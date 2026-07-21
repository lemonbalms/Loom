// 감지기 보강 — V(codex) 교차 검증이 찾은 결함 2건 수정. 수정 레인은 grok(발견자와 분리).
// 실행: LOOM_PROFILE=claude-impl bun run .loom-dispatch-hookcache-d.ts
import { addTask } from "./packages/host/src/task-board";
import { dispatchCard } from "./packages/host/src/card-ops";

const task = addTask({
  title: "HOOKCACHE-D — check-mem-header 감지기 보강: 훅 경로 해석 복제 + 앵커 미발견 시 실패 (grok pane)",
  notes: "IMPL · V(codex) 교차검증 V-c 발견 2건 · 발견자(codex)와 수정자(grok) 분리",
});
console.log("task created:", task.id);

const result = await dispatchCard({
  taskId: task.id,
  node: "mac-node",
  prompt: [
    "scripts/check-mem-header.ts 를 보강한다. 이 스크립트는 claude-mem 플러그인이 auto-update로 원복될 때 프롬프트 캐시 파괴가 재발한 것을 감지하는 장치다.",
    "독립 교차 검증(codex)이 결함 2건을 찾았다. 둘 다 '감지기가 조용히 통과시켜 원복을 놓치는' 형태라 장치의 존재 이유를 무효화한다.",
    "결함1 — 경로 해석: 현재 :81 부근이 manifest에서 첫 번째로 존재하는 경로를 고른다. 실제 훅의 해석 순서(CLAUDE_PLUGIN_ROOT 환경변수 → cache 디렉터리 중 최신(ls -dt 상당) → marketplaces 폴백)를 복제하지 않는다. 그래서 cache에 구버전이 남아 있으면 활성본이 아닌 구버전을 검사해 false OK가 난다. 실제 훅과 동일한 우선순위로 활성 설치본을 해석하도록 고쳐라.",
    "결함2 — 앵커 미발견: 현재 :172 부근이 헤더 생성 함수의 소비처 앵커를 못 찾으면 SKIP하고 exit 0 한다. 그런데 '번들 구조가 바뀌어 앵커를 못 찾는 상황'이 바로 auto-update가 일어난 상황이라, 감지해야 할 케이스에서 정확히 침묵한다. 앵커를 못 찾으면 실패(비영 종료)하고 무엇을 못 찾았는지 stderr에 적어라.",
    "단 '설치본 자체가 없음'(claude-mem 미설치·다른 머신)은 종전대로 fail-open(exit 0 + stderr 고지)을 유지하라 — 다른 오너 환경에서 게이트가 막히면 안 된다. 구분 기준: 설치본이 있는데 앵커가 없다=실패 / 설치본이 없다=통과.",
    "유닛 테스트(scripts/check-mem-header.test.ts)에 두 결함의 회귀 케이스를 추가하라: ① 복수 버전 디렉터리에서 활성본을 고르는지 ② 앵커 없는 합성 번들에서 비영 종료하는지. 실제 홈 파일에 의존하지 말고 합성 픽스처를 쓰라(기존 테스트 방식 유지).",
    "현재 홈은 이미 패치된 상태다(qJ/eQ 둘 다 날짜만 반환). 보강 후 bun run check:mem-header 가 여전히 OK exit 0 이어야 한다 — 그게 무회귀 확인이다.",
    "테스트는 env -u LOOM_RELAY_TOKEN -u LOOM_RELAY_URL bun test scripts/check-mem-header.test.ts. 전체 스위트 회귀 판정은 아키텍트 몫이니 돌리지 마라.",
    "claude-mem 설치본을 수정하지 마라(이미 패치 완료). tasks/lessons.md·scripts/session-context.ts 도 건드리지 마라 — 다른 카드 산출물이다.",
    "git commit/push 금지 — 검증까지만. 완료 시 최종 줄에 정확히 다음 형식으로 출력하라: [HOOKCACHE-D-DONE] pathfix=<ok|fail> anchorfix=<ok|fail> units=<n/n> check=<ok|fail>",
  ].join(" "),
  agentKind: "grok",
});
console.log(JSON.stringify(result));
