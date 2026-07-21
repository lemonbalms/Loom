import { addTask } from "./packages/host/src/task-board";
import { dispatchCard } from "./packages/host/src/card-ops";

const task = addTask({
  title: "ENFORCEABILITY — 규칙 강제가능성 판별 기준 설계 (codex pane · 설계만)",
  notes: "DESIGN · brief=.loom-enforceability-brief.md · 오너 지시 2026-07-20 · 근거=오늘 세션 A3/B4/C2 사례",
});
console.log("task created:", task.id);

const result = await dispatchCard({
  taskId: task.id,
  node: "mac-node",
  prompt: [
    "리포 루트의 .loom-enforceability-brief.md 파일을 읽고 그대로 수행하라. ⓪과 ① 원자료부터 읽어라.",
    "요지: 당신은 codex 설계자다. 이 프로젝트의 운영 규칙을 '코드로 강제할 수 있는 것'과 '그럴 수 없는 것'으로 가르는 판별 기준을 설계한다. 제품 코드·hook 구현 금지, 산출물은 docs/spikes/RULE-ENFORCEABILITY.md 하나다.",
    "배경(오너 지적): 규칙을 글로 적어도 작동이 그때그때 다르다. 코드로 명문화하는 방법을 찾아야 한다.",
    "오늘 한 세션에서 관측된 사실이 근거다 — 코드로 강제된 규칙 3건(M-1 allowlist · L-2 node/assignee 정합 · PreToolUse hook의 Agent model 필수)은 3/3 전부 위반을 막았고, 글로만 적힌 규칙 4건(orchestration 스킬 로드 · board claim · pane 카드 우선 · 마커 echo 오탐 주의)은 4/4 전부 위반됐다. 특히 마커 echo 오탐은 lessons에 이미 기록돼 있었는데도 재범했다 — '기록해두면 다음에 안 틀린다'는 가정의 반례다.",
    "그러나 코드화가 만능이 아니다. 코드화했는데 불충분했던 2건이 있다: check-mem-header가 훅 경로 해석을 복제하지 않아 구버전 false OK 가능하고 앵커 미발견 시 침묵했으며, watch-card가 프롬프트 에코를 완료 마커로 오인했다. 잘못 코드화된 가드는 '지켜지고 있다는 착각'을 만들어 문서보다 위험할 수 있다. 판별 기준은 이 위험까지 다뤄야 한다.",
    "설계할 것: ① 판정 축(무엇을 보고 가르는가 — 브리프의 예시를 그대로 쓰지 말고 자기 축을 세워라) ② 강제 수단 스펙트럼(코드냐 문서냐는 너무 거칠다 — 제품 런타임 락/하네스 hook/lint·테스트·CI/문서 최소 4층, 층 선택 기준) ③ 잘못 코드화된 가드를 막는 조건(오늘 두 사례 모두 '가드가 침묵하는 경로'가 문제였다 — 침묵을 성공으로 읽지 않게 하는 설계 요건) ④ 코드화 불가 규칙의 차선책(그냥 문서에 두는 것 말고 위반 확률을 낮추는 수단).",
    "필수: 오늘 사례 A3·B4·C2 전부를 당신 기준으로 분류하고 각각 권고 강제 수단을 붙여라. 특히 글로만 있던 4건은 '왜 문서에만 있었는가 / 코드로 옮길 수 있는가 / 어느 층인가'를 구체적으로 답하라. 기준의 판별력은 이 대조로만 확인된다.",
    "필수: 당신 기준으로도 애매한 케이스를 최소 2개 제시하고 왜 애매한지 적어라. 모든 규칙을 깔끔히 가르는 기준이 나왔다면 그것은 기준이 아니라 희망이다.",
    "선례: docs/spikes/HOOK-CACHE-FIX-DESIGN.md §0-bis가 'TS로 잠글 수 있는가'로 축을 가른 유사 프레임이다. 당신 설계는 그것의 일반화다.",
    "낙관 금지 — 오늘 그 문서 §5가 확신에 차서 틀린 파일을 지목했고 그대로 갔으면 무효 패치였다. 사실관계가 의심되면 로그·코드로 직접 확인하고, 모르는 것은 미확정으로 남겨라.",
    "다른 카드가 편집 중인 scripts/session-context.ts·scripts/check-mem-header.ts·scripts/watch-card.ts·tasks/lessons.md 를 건드리지 마라. git commit/push 금지.",
    "완료 시 최종 줄에 정확히: [ENFORCEABILITY-DONE] axes=<n> layers=<n> classified=<n건> ambiguous=<n>",
  ].join(" "),
  agentKind: "codex",
});
console.log(JSON.stringify(result));
