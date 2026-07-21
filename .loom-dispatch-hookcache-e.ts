// pane 종료 인지 설계(E) + D 감지기 보강 검증 — 둘 다 codex 레인 (CLAUDE.md 규칙 5).
// 실행: LOOM_PROFILE=claude-impl bun run .loom-dispatch-hookcache-e.ts
import { addTask } from "./packages/host/src/task-board";
import { dispatchCard } from "./packages/host/src/card-ops";

const cards = [
  {
    title: "PANE-DEATH-DESIGN — 브릿지 pane 사망 미인지 결함 해소 설계 (codex pane · 설계만)",
    notes: "DESIGN · brief=.loom-hookcache-E-brief.md · 오너 지시 2026-07-20 · PaneDied unknown pane 5/5 실증",
    lines: [
      "리포 루트의 .loom-hookcache-E-brief.md 파일을 읽고 그대로 수행하라. ⓪ 실측 근거부터 읽어라.",
      "요지: 당신은 codex 설계자다. Loom 브릿지가 워커 pane의 죽음을 인지하지 못하는 결함의 해소 설계를 쓴다. 제품 코드 구현 금지 — 산출물은 docs/spikes/PANE-DEATH-DESIGN.md 하나다.",
      "오늘 실측: herdr pane 5장이 전부 비정상 종료(exit 0 / 129 SIGHUP / Killed:9)했고 herdr는 매번 통지했으나 브릿지가 PaneDied for unknown pane 으로 5/5 전부 버렸다. 브릿지 로그에는 pane 종료 줄이 0건이다.",
      "피해: 가짜 card.done 2건(죽기 직전 TUI 초기화면 스크레이프 · Working 중 발행) · 보드 오염을 L-2 락이 우연히 막음 · 완주 판정이 아키텍트 육안에 의존.",
      "설계 목표 3: ① pane 사망을 브릿지가 인지(pane↔카드 바인딩이 어디서 끊기는지 규명이 출발점) ② 죽은 카드는 done이 될 수 없다 ③ 완주 후 정상종료와 사망을 구분 — 오늘 A는 SIGHUP·C는 SIGKILL인데 산출물은 정상이었다. '죽었다=실패'로 단순화하면 오탐이다.",
      "제약(락): wire 스키마 변경 최소화(card-contract.ts v1) · CONV_SPEC 승인 범위 · 원격 노드(WSL/VPS)에서도 성립 · 기존 락 M-1·L-2·still-running 유예(0.23.7)와 충돌 금지. 특히 still-running 유예가 codex의 Working 지표를 놓친 것이 가짜 done의 직접 원인이니 그 관계를 명시하라.",
      "조사: PaneDied가 herdr 쪽인지 브릿지 쪽인지 확정 · pane 등록/구독 코드 경로 · 과거 0.23.4 c7df503(2번째+ 카드 pane 구독 사망) 잔재인지 별개인지 판정 · 정상완주 pane과 사망 pane의 관측 가능한 차이 추출.",
      "산출 형식은 선례 docs/spikes/HOOK-CACHE-FIX-DESIGN.md를 따르되 §0-bis 프레임(코드로 잠글 축 ✅ vs 사람 판단 ❌·⚠️)을 반드시 포함하고, 선택지 최소 3안+권고 1안, 판정 규칙 초안이 오늘 실측 3케이스를 올바르게 분류하는지 대조하고, 검증 계획(사망을 인위 유발하는 스모크가 필요한가)과 R{n} 필요 여부(WORKFLOW §5.1)를 담아라.",
      "설계를 낙관적으로 쓰지 마라. 모르는 것은 미확정으로 남기고 무엇을 더 봐야 하는지 적어라 — 오늘 HOOK-CACHE-FIX-DESIGN §5가 확신에 차서 틀린 파일을 지목했고 그대로 갔으면 무효 패치였다.",
      "제품 코드 수정 금지 · 다른 카드가 편집 중인 scripts/session-context.ts·scripts/check-mem-header.ts·tasks/lessons.md 건드리지 마라 · git commit/push 금지.",
      "완료 시 최종 줄에 정확히: [PANE-DEATH-DESIGN-DONE] cause=<found|uncertain> options=<n> recommend=<안 이름> rgate=<needed|not-needed>",
    ],
  },
  {
    title: "HOOKCACHE-D-VERIFY — 감지기 보강 독립 검증 (codex pane · 읽기 전용)",
    notes: "VERIFY · D(grok) 산출물 검증 · 발견자(codex V)와 수정자(grok D) 분리 · 규칙 5",
    lines: [
      "당신은 codex 검증자다. 읽기 전용 — 파일을 고치지 마라.",
      "배경: 네가(codex V 카드) scripts/check-mem-header.ts 에서 결함 2건을 찾았다. ① :81 부근이 manifest 첫 존재 경로를 골라 실제 훅 해석 순서를 복제하지 않아 구버전 false OK 가능 ② :172 부근 앵커 미발견 시 SKIP/exit 0 이라 auto-update 회귀에 사각.",
      "grok(D 카드)이 그 둘을 수정했다고 보고했다. 아키텍트 1차 확인으로는 경로 해석이 CLAUDE_PLUGIN_ROOT → cache mtime 최신순 → marketplaces 폴백으로 바뀌었고, 앵커 미발견은 exit 1·설치본 없음만 fail-open으로 갈렸으며 유닛이 5→13개로 늘었다.",
      "검증할 것: ① 수정이 실제로 네가 지적한 결함을 닫는가(우회 경로·부분 수정 아닌가) ② 새로 생긴 결함은 없는가 — 특히 fail-open 경계가 과도하게 좁아져 다른 오너 환경에서 게이트를 막지 않는가 ③ 유닛 13개가 두 회귀를 실제로 잡는가(합성 픽스처가 진짜 케이스를 재현하는가, 통과하도록 느슨하게 쓰이지 않았는가) ④ 현재 홈이 패치된 상태에서 check:mem-header 가 OK exit 0 인 것이 무회귀 확인으로 충분한가.",
      "네가 지적한 사람이 검증까지 하면 확증 편향이 생긴다는 점을 의식하라 — 수정이 '내 지적을 반영했다'가 아니라 '결함이 실제로 닫혔다'를 기준으로 판정하라.",
      "테스트 실행은 env -u LOOM_RELAY_TOKEN -u LOOM_RELAY_URL bun test scripts/check-mem-header.test.ts 까지만. 전체 스위트는 아키텍트 몫이니 돌리지 마라.",
      "파일 수정·commit·push 금지.",
      "완료 시 최종 줄에 정확히: [HOOKCACHE-D-VERIFY-DONE] fix1=<closed|open|partial> fix2=<closed|open|partial> newissue=<none|found> units=<adequate|weak>",
    ],
  },
];

for (const c of cards) {
  const task = addTask({ title: c.title, notes: c.notes });
  const result = await dispatchCard({
    taskId: task.id,
    node: "mac-node",
    prompt: c.lines.join(" "),
    agentKind: "codex",
  });
  console.log(task.id, JSON.stringify(result));
  await new Promise((r) => setTimeout(r, 4000));
}
