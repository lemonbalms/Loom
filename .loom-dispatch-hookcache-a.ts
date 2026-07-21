import { addTask } from "./packages/host/src/task-board";
import { dispatchCard } from "./packages/host/src/card-ops";

const task = addTask({
  title: "HOOKCACHE-A — 원인 A 코드 축: buildAllContext/--part all · 라우드 절단 · session-context:lint · sha 결정론 (grok pane)",
  notes: "IMPL · brief=.loom-hookcache-A-brief.md · impl=grok · 설계 HOOK-CACHE-FIX-DESIGN.md · 오너 락 (a)=구조 분리",
});
console.log("task created:", task.id);

const result = await dispatchCard({
  taskId: task.id,
  node: "mac-node",
  prompt: [
    "리포 루트의 .loom-hookcache-A-brief.md 파일을 읽고 그대로 수행하라.",
    "요지: 당신은 grok 구현자다. SessionStart hook 프롬프트 캐시 파괴 원인 A(한 이벤트에 hook 커맨드 2개 → 완료순 concat)를",
    "코드 축에서 해소한다. scripts/session-context.ts에 buildAllContext()+--part all 추가 ·",
    "D2 <details> 구간을 주입에서 줄 단위 제외하는 순수 필터(원본 파일 무수정) ·",
    "truncateContext 조용한 절단 → 라우드 경고 마커를 블록 맨 앞에 배치 ·",
    "SOFT_CAP 8500 + session-context:lint 신설(package.json 별칭, 선례는 handoff:lint) ·",
    "V-1 sha 결정론 유닛(20회 실행 20/20 동일) · V-2 센티널 [LOOM-SESSION-CONTEXT 축자 보존 유닛.",
    "락: --lint 경로는 현행 catch{exit(0)} fail-open에서 제외(hook 주입 경로 fail-open은 무변경) ·",
    "--part state|lessons는 진단용 존치 · .claude/settings.json handler 2→1 컷오버는 이 카드 범위 밖(절대 금지).",
    "A 완료 시점엔 C 카드가 미완이라 session-context:lint가 빨간 것이 정상이다 — 통과시키려고 SOFT_CAP을 올리거나 tasks/lessons.md를 건드리지 마라.",
    "테스트는 env -u LOOM_RELAY_TOKEN -u LOOM_RELAY_URL bun test. 전체 스위트 회귀 판정은 아키텍트 몫이니 중도 중단되면 정직 보고하고 DONE 마커를 보류하라.",
    "git commit/push 금지 — 검증까지만. 완료 시 브리프의 [HOOKCACHE-A-DONE] 형식 한 줄을 최종 출력하라.",
  ].join(" "),
  agentKind: "grok",
});
console.log(JSON.stringify(result));
