// 교차 검증 레인 — codex가 같은 설계를 독립 재확인 (읽기 전용).
// 실행: LOOM_PROFILE=claude-impl bun run .loom-dispatch-hookcache-v.ts
import { addTask } from "./packages/host/src/task-board";
import { dispatchCard } from "./packages/host/src/card-ops";

const task = addTask({
  title: "HOOKCACHE-V — hook 캐시 해소 설계·패치 좌표 교차 검증 (codex pane · 읽기 전용)",
  notes: "VERIFY · brief=.loom-hookcache-V-brief.md · verify=codex · 설계 §5 오류 실증 후 독립 재확인",
});
console.log("task created:", task.id);

const result = await dispatchCard({
  taskId: task.id,
  node: "mac-node",
  prompt: [
    "리포 루트의 .loom-hookcache-V-brief.md 파일을 읽고 그대로 수행하라. ⓪부터 읽어라.",
    "요지: 당신은 codex 검증자다. 다른 레인이 구현 중인 hook 캐시 해소 작업의 설계와 패치 좌표가 옳은지 독립 재확인한다. 읽기 전용 — 파일을 고치지 마라.",
    "이 카드가 있는 이유: 설계 정본 HOOK-CACHE-FIX-DESIGN.md §5가 이미 한 번 틀렸다. 패치 대상으로 지목한 context-generator.cjs가 데드 번들이었고 그대로 갔으면 무효 패치였다.",
    "따라서 아키텍트의 교정(실제 대상 = worker-service.cjs의 qJ()/eQ())도 실측 1회에 기댄 것이라 틀릴 수 있다. 그 교정을 믿지 말고 처음부터 네 자신의 증거로 확인하라.",
    "V-a 패치 좌표: SessionStart hooks.json이 실행하는 커맨드에서 출발해 실제 실행 경로를 따라가 헤더 문자열 생성 지점에 도달하라. 정적 grep만으로 결론 내지 마라. 동적 require 여지·제3의 복제본·활성 설치본 버전을 확인하라.",
    "V-b 원인 A 설계: .claude/settings.json의 SessionStart 구성과 scripts/session-context.ts를 읽고 hook 커맨드 2개의 concat 순서가 정말 비결정적인지 판단하라. 결정적이라면 원인 A 자체가 오진이다. 10,000자 캡 초과 거동도 문서가 아니라 코드·관측에서 근거를 찾아라.",
    "V-c 누락: 원인 A·B를 다 고쳐도 여전히 매 세션 프리픽스를 바꾸는 다른 요소가 남아 있지 않은가. 이게 가장 값진 발견이 될 항목이다.",
    "아키텍트와 다른 결론이 나오면 그것이 이 카드의 성공이다. 동의하도록 자신을 설득하지 마라. 확신이 안 서면 uncertain으로 두고 무엇이 부족한지 적어라.",
    "다른 레인이 동시에 편집 중이므로 중간 상태를 볼 수 있음을 감안하라. git commit/push 금지.",
    "완료 시 브리프의 [HOOKCACHE-V-DONE] 형식 한 줄을 최종 출력하라.",
  ].join(" "),
  agentKind: "codex",
});
console.log(JSON.stringify(result));
