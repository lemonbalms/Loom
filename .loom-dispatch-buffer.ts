import { addTask } from "./packages/host/src/task-board";
import { dispatchCard } from "./packages/host/src/card-ops";

const cards = [
  {
    title: "BUFFER-CODE — D2 필터를 state 경로에도 적용 (grok pane)",
    notes: "IMPL · 예산 버퍼 임시조치 · 오너 승인 2026-07-20",
    kind: "grok" as const,
    lines: [
      "scripts/session-context.ts 의 buildStateContext() 에도 stripDetailsBlocks() 를 적용한다. 지금은 buildLessonsContext() 에만 걸려 있다.",
      "목적: HANDOFF.md에서 <details>로 접은 구간이 SessionStart 주입에서 제외되게 한다. 파일에는 정보가 그대로 남고(왕복 없이 펼쳐 봄), 매 세션 주입할 내용을 문서 작성자가 고를 수 있게 된다.",
      "배경: state(HANDOFF 파생)와 lessons가 단일 10,000자 캡을 나눠 쓴다. 현재 --part all 이 8,495자로 SOFT_CAP 8,500에 여유 5자뿐이라 lessons 신규 기록을 못 넣는다.",
      "구현은 최소로: buildStateContext() 가 HANDOFF에서 뽑은 섹션 텍스트에 stripDetailsBlocks 를 통과시키면 된다. 기존 필터 함수를 재사용하고 새 필터를 만들지 마라.",
      "주의 — 어디에 거는지가 중요하다: buildStatus() 산출물이나 checkHandoffBudget() 결과까지 필터링하면 안 된다(그쪽엔 <details>가 없고, 통과시켜도 무해하지만 의도를 흐린다). HANDOFF 추출 섹션에만 걸어라.",
      "유닛 테스트를 scripts/session-context.test.ts 에 추가하라: ① HANDOFF 섹션 안의 <details> 블록이 state 산출물에서 제외됨 ② 그 바깥 텍스트는 보존됨 ③ <details>가 없는 HANDOFF에서 기존 동작 무회귀 ④ 센티널 [LOOM-SESSION-CONTEXT v1 · state] 축자 보존. 합성 입력으로 하고 실제 HANDOFF.md에 의존하지 마라.",
      "기존 23개 유닛과 --part state|lessons|all 계약, --lint fail-open 제외 규칙을 깨지 마라.",
      "HANDOFF.md·tasks/lessons.md 는 건드리지 마라 — 동시 진행 중인 다른 카드가 편집한다.",
      "테스트는 env -u LOOM_RELAY_TOKEN -u LOOM_RELAY_URL bun test scripts/session-context.test.ts 까지만. 전체 스위트는 아키텍트 몫이다.",
      "git commit/push 금지. 완료 시 최종 줄에 정확히: [BUFFER-CODE-DONE] units=<n/n> statefilter=<ok|fail>",
    ],
  },
  {
    title: "BUFFER-DOC — HANDOFF 저순위 항목 <details> 이동 + lessons 신규 기록 (claude pane)",
    notes: "DOC · 예산 버퍼 확보 + 오늘 웨이브 교훈 기록",
    kind: "claude" as const,
    lines: [
      "두 파일을 편집한다: HANDOFF.md 와 tasks/lessons.md (+ tasks/lessons/ 카테고리 파일). scripts/ 는 건드리지 마라 — 동시 진행 카드가 편집 중이다.",
      "전제: 동시 진행 중인 BUFFER-CODE 카드가 scripts/session-context.ts 의 buildStateContext() 에 <details> 제외 필터를 추가하고 있다. 즉 HANDOFF에서 <details>로 접은 구간은 SessionStart 주입에서 빠지지만 파일에는 남는다.",
      "작업1 — HANDOFF.md 버퍼 확보: '다음 액션' 섹션의 5번(잔존 Low 백로그)·6번(오너 결정 대기 npm)·7번(부수 정리)을 <details><summary>…</summary> … </details> 로 감싸라. 항목 내용은 한 글자도 지우지 말고 그대로 접어라. summary 텍스트는 각 항목이 무엇인지 한눈에 보이게 쓰라(예: '5·6·7 — 잔존 Low 백로그 · npm 보류 · 부수 정리 (펼쳐보기)'). 0~4번과 '활성 함정'·'하지 말 것'은 절대 접지 마라 — 세션 시작 시 즉시 필요하다.",
      "<details> 태그는 반드시 행 맨 앞(열 0)에서 시작해야 한다. 들여쓰면 필터가 인식하지 못한다. 중첩 금지, 열고 반드시 닫아라.",
      "작업2 — tasks/lessons.md 에 오늘(2026-07-20) 웨이브 교훈을 기록하라. 형식은 그 파일 상단 '이 파일 사용 규칙 3줄'과 기존 줄 형식을 그대로 따르라: 인덱스 1줄(≤120자, 트리거 문구 필수) + 같은 파일 <details>에 경위 전문. 카테고리 파일(tasks/lessons/<category>.md)에도 전문을 추가하라.",
      "기록할 교훈 5건 — 각각 카테고리를 판단해 배치하라:",
      "(1) 코드 락 vs 문서 규칙: 같은 세션에서 코드로 강제된 규칙 3건(M-1 allowlist · L-2 result.node↔assignee 정합 · PreToolUse hook의 Agent model 필수)은 3/3 전부 위반을 막았고, 문서에만 있던 규칙 4건(orchestration 스킬 로드 · board claim · pane 카드 우선 · 마커 echo 오탐 주의)은 4/4 전부 위반됐다. 특히 마커 echo 오탐은 lessons에 기록이 있었는데도 재범 — '기록하면 다음에 안 틀린다'의 반례. 판별 기준 정본 docs/spikes/RULE-ENFORCEABILITY.md.",
      "(2) card.done ≠ 완료 · 종료코드로 실패 판정 금지: 브릿지가 완료 후보를 조기 커밋하고 그 결과로 pane.close를 호출한다(finishCard — bridge-runtime.ts:2310-2323). 따라서 정상 cleanup에서도 exit 129/SIGKILL이 나온다(실측: pane 215·217은 status=done result 전송 뒤 106ms/4ms 만의 정상 정리). PaneDied for unknown pane 은 herdr 내부 경고이지 브릿지가 통지를 버린 증거가 아니다 — 아키텍트가 이 오독으로 오너에게 틀린 진단을 보고했다. 설계 docs/spikes/PANE-DEATH-DESIGN.md.",
      "(3) 임시 셸 감시 4연속 실패: 손으로 짠 감시가 매번 다른 곳에서 뚫렸다 — ① 마커만 보고 pane 사망 놓침 ② 'codex는 안 죽는다'는 관측을 가정으로 승격해 소멸 감시 제외, 사용자 수동 종료를 놓침 ③ macOS bash 3.2 연관배열 미지원으로 즉사하며 '35분 경과' 거짓 성공 보고 ④ 마커 검출 후 종료하지 않아 알림 미전달. 대응: scripts/watch-card.ts 사용(exit: marker 0/pane-gone 1/limit 2/timeout 3).",
      "(4) 설계 문서도 틀린다 — 실행 경로로 검증하라: HOOK-CACHE-FIX-DESIGN.md §5가 패치 대상으로 context-generator.cjs를 지목했으나 그것은 데드 번들이었다(호출처 0건). 정적 grep이 아니라 훅이 실행하는 커맨드에서 출발해 실제 호출 사슬을 따라가야 진짜 좌표(worker-service.cjs의 qJ/eQ)가 나온다. codex 교차검증이 이를 confirm했다.",
      "(5) 검증 레인 분리: 구현=grok · 검증=codex · 자문=fable-advisor(CLAUDE.md 규칙 5). 발견자와 수정자를 분리해야 교차 검증이 성립한다. 이번 웨이브에서 codex가 아키텍트의 진단 오류와 감지기 결함 2건을 잡아냈다.",
      "예산 주의: tasks/lessons.md 인덱스는 SessionStart에 주입되며 SOFT_CAP 8500 게이트가 있다. 인덱스 줄은 ≤120자로 짧게, 경위는 전부 <details>와 카테고리 파일로 보내라.",
      "작업 후 반드시 bun run handoff:lint 와 bun run session-context:lint 를 직접 실행해 둘 다 통과를 확인하고 수치를 보고하라. 통과하지 못하면 <details> 대상을 늘려 조정하라(단 0~4번·활성 함정·하지 말 것은 접지 마라).",
      "git commit/push 금지. 완료 시 최종 줄에 정확히: [BUFFER-DOC-DONE] handoff-lint=<pass|fail> ctx-lint=<pass|fail> all-len=<n> lessons-added=<n건>",
    ],
  },
];

for (const c of cards) {
  const task = addTask({ title: c.title, notes: c.notes });
  const result = await dispatchCard({
    taskId: task.id, node: "mac-node", prompt: c.lines.join(" "), agentKind: c.kind,
  });
  console.log(c.kind, task.id, JSON.stringify(result));
  await new Promise((r) => setTimeout(r, 4000));
}
