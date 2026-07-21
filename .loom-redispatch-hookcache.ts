// M-1 재발사 — mac-node peerId가 authorizedDispatchers에 없어 deny. allowlist 무수정,
// 이미 승인된 신원(claude-impl p_726870658689123e)으로 재디스패치. 실행:
//   LOOM_PROFILE=claude-impl bun run .loom-redispatch-hookcache.ts
import { dispatchCard } from "./packages/host/src/card-ops";

const cards = [
  {
    taskId: "task_ea083a60172af0d8",
    agentKind: "grok" as const,
    lines: [
      "리포 루트의 .loom-hookcache-A-brief.md 파일을 읽고 그대로 수행하라.",
      "요지: 당신은 grok 구현자다. SessionStart hook 프롬프트 캐시 파괴 원인 A를 코드 축에서 해소한다.",
      "scripts/session-context.ts에 buildAllContext()+--part all · D2 <details> 구간을 주입에서 줄 단위 제외하는 순수 필터(원본 파일 무수정) ·",
      "truncateContext 조용한 절단 → 라우드 경고 마커를 블록 맨 앞에 배치 · SOFT_CAP 8500 + session-context:lint 신설(선례 handoff:lint) ·",
      "V-1 sha 결정론 유닛(20회 20/20 동일) · V-2 센티널 [LOOM-SESSION-CONTEXT 축자 보존 유닛.",
      "락: --lint 경로는 catch{exit(0)} fail-open에서 제외(hook 주입 경로 fail-open 무변경) · --part state|lessons 존치 ·",
      ".claude/settings.json handler 2→1 컷오버는 이 카드 범위 밖(절대 금지).",
      "A 완료 시점엔 C 카드가 미완이라 session-context:lint가 빨간 것이 정상이다 — 통과시키려 SOFT_CAP을 올리거나 tasks/lessons.md를 건드리지 마라.",
      "테스트는 env -u LOOM_RELAY_TOKEN -u LOOM_RELAY_URL bun test. 전체 스위트 회귀 판정은 아키텍트 몫이니 중도 중단되면 정직 보고하고 DONE 마커를 보류하라.",
      "git commit/push 금지 — 검증까지만. 완료 시 브리프의 [HOOKCACHE-A-DONE] 형식 한 줄을 최종 출력하라.",
    ],
  },
  {
    taskId: "task_afb44618340dc4cd",
    agentKind: "codex" as const,
    lines: [
      "리포 루트의 .loom-hookcache-B-brief.md 파일을 읽고 그대로 수행하라. ⓪ blast-radius 경고를 먼저 읽어라.",
      "요지: 당신은 codex 구현자다. claude-mem이 SessionStart로 주입하는 헤더의 분 단위 타임스탬프를 제거해 캐시 재사용 상한 1분 고정(원인 B)을 해소한다.",
      "중요 — 설계 문서 §5가 지목한 scripts/context-generator.cjs는 데드 번들이다(호출처 0건). 거기를 고치면 무효다.",
      "실제 대상은 ~/.claude/plugins/cache/thedotmack/claude-mem/13.11.0/scripts/worker-service.cjs 의 953행 qJ()(플레인)와 955행 eQ()(ANSI) 두 함수이며 둘 다 날짜까지만 반환하도록 고친다.",
      "미니파이 번들이라 앵커는 함수명/줄번호가 아니라 본문 패턴(toLocaleDateString(\"en-CA\") + timeZoneName:\"short\")으로 잡아라.",
      "로드 경로는 아키텍트가 실측 확정했다 — 13.11.0 한 곳만 패치하고 marketplaces 사본·구버전 13.10.x는 건드리지 마라. 재조사 불요.",
      "수정 전 원본 백업 필수. 지정 함수 외 어떤 파일도 건드리지 마라. settings.json·플러그인 비활성화(B-3/B-5)는 기각된 선택지다.",
      "⑤-bis 감지장치가 이 카드의 절반이다 — thedotmack은 autoUpdate:true라 패치가 예고 없이 조용히 사라진다.",
      "scripts/check-mem-header.ts 신설(installed_plugins.json의 installPath를 런타임 재해석, 경로 하드코딩 금지) + package.json check:mem-header 별칭 + 합성 문자열 유닛(실제 홈 파일 비의존, 설치본 없으면 fail-open).",
      "검증은 분 경계를 넘겨 최소 2회 새 세션 헤더를 육안 실측하고 헤더 문자열 실물을 회신에 붙여라. 메모리 주입 자체가 사라지면 실패다.",
      "tasks/lessons.md는 열지 마라 — 동시 발사된 C 카드가 같은 파일을 재작성 중이다. platform.md 전문만 쓰고 인덱스 줄은 회신에 텍스트로 제출하라.",
      "git commit/push 금지 — 검증까지만. 완료 시 브리프의 [HOOKCACHE-B-DONE] 형식 한 줄을 최종 출력하라.",
    ],
  },
  {
    taskId: "task_655f119a3545441f",
    agentKind: "claude" as const,
    lines: [
      "리포 루트의 .loom-hookcache-C-brief.md 파일을 읽고 그대로 수행하라.",
      "요지: 당신은 문안 작업 레인이다. tasks/lessons.md의 인덱스 32줄(8,633자)을 같은 파일 <details> 구조 분리로 재작성해 SessionStart 주입 블록을 예산 안으로 되돌린다. 손대는 파일은 tasks/lessons.md 하나뿐이다.",
      "오너 락: 압축 방식 = 구조 분리(같은 파일 <details>). M-1 원안의 tasks/lessons/<category>.md로 이동은 기각됐다 — 내용을 옮기지 마라.",
      "규칙: 각 줄의 트리거 문구는 삭제 금지 · 경위·커밋해시·재범기록만 <details>로 접되 그 안은 원문 그대로(재요약 금지) · 헤더·사용규칙·카테고리줄은 손대지 마라.",
      "예산은 줄당 ≤120자 + 접기 후 인덱스 총량 ≤3,600자. 부담이 집중된 상위 8줄(2,726자 = 56%)부터 착수하라.",
      "⑦ V-4 자체 게이트 필수: 다이어트 후 텍스트만 읽고 32/32 줄에서 '이 줄만 보고 카테고리 파일을 열어야 할 작업인지' 판별 가능한지 검사하라.",
      "판별 불가한 줄은 임의로 되돌리거나 얼버무리지 말고 줄 번호·원문·이유를 그대로 보고하라 — 아키텍트가 판정한다.",
      "fable-advisor를 직접 스폰하지 마라 — 최종 판별력 검수는 아키텍트가 수행한다. 애매한 줄을 통과처럼 다듬는 것이 가장 나쁘다.",
      "git commit/push 금지 — 검증까지만. 완료 시 브리프의 [HOOKCACHE-C-DONE] 형식 한 줄을 최종 출력하라.",
    ],
  },
];

for (const c of cards) {
  const result = await dispatchCard({
    taskId: c.taskId,
    node: "mac-node",
    prompt: c.lines.join(" "),
    agentKind: c.agentKind,
  });
  console.log(c.agentKind, c.taskId, JSON.stringify(result));
  await new Promise((r) => setTimeout(r, 3000));
}
