// B 레인 재라우팅 — codex pane이 스폰 6초 만에 exit 0으로 자멸(herdr pane 213).
// DOGFOOD §1.2 레인 체인 하강: codex → claude. 기존 task에 카드만 재부착(보드 중복 생성 없음).
// 실행: LOOM_PROFILE=claude-impl bun run .loom-redispatch-hookcache-b.ts
import { dispatchCard } from "./packages/host/src/card-ops";

const result = await dispatchCard({
  taskId: "task_afb44618340dc4cd",
  node: "mac-node",
  prompt: [
    "리포 루트의 .loom-hookcache-B-brief.md 파일을 읽고 그대로 수행하라. ⓪ blast-radius 경고를 먼저 읽어라.",
    "요지: claude-mem이 SessionStart로 주입하는 헤더의 분 단위 타임스탬프를 제거해 프롬프트 캐시 재사용 상한 1분 고정(원인 B)을 해소한다.",
    "중요 — 설계 문서 §5가 지목한 scripts/context-generator.cjs는 데드 번들이다(호출처 0건). 거기를 고치면 무효다.",
    "실제 대상은 ~/.claude/plugins/cache/thedotmack/claude-mem/13.11.0/scripts/worker-service.cjs 의 953행 qJ()(플레인 헤더)와 955행 eQ()(ANSI 헤더) 두 함수이며, 둘 다 날짜까지만 반환하도록 고친다.",
    "미니파이 단일행 번들이라 앵커는 함수명/줄번호가 아니라 본문 패턴(toLocaleDateString(\"en-CA\") + timeZoneName:\"short\")으로 잡아라. 재포맷·재빌드 금지, 최소 diff.",
    "로드 경로는 아키텍트가 실측 확정했다 — 13.11.0 한 곳만 패치하고 marketplaces 사본·구버전 13.10.x는 건드리지 마라. 재조사 불요.",
    "수정 전 원본 백업 필수(worker-service.cjs.pre-hookcache). 지정 함수 외 어떤 파일도 건드리지 마라. settings.json 수정·플러그인 비활성화(B-3/B-5)는 기각된 선택지다. 애매하면 멈추고 보고하라.",
    "⑤-bis 감지장치가 이 카드의 절반이다 — thedotmack은 autoUpdate:true라 패치가 예고 없이 조용히 사라진다.",
    "scripts/check-mem-header.ts 신설(installed_plugins.json의 installPath를 런타임 재해석, 경로 하드코딩 금지) + package.json check:mem-header 별칭 + 합성 문자열 유닛(실제 홈 파일 비의존, 설치본 없거나 경로 해석 실패 시 fail-open+stderr 고지).",
    "검증은 분 경계를 넘겨 최소 2회 새 세션 헤더를 육안 실측하고 헤더 문자열 실물을 회신에 붙여라. 메모리 주입 자체가 사라지면 실패다.",
    "tasks/lessons.md는 열지 마라 — 동시 진행 중인 C 카드가 같은 파일을 재작성 중이다. tasks/lessons/platform.md 전문만 쓰고, 인덱스 줄은 ≤120자 한 줄 텍스트로 회신에 제출하라(번호는 (n)으로 비워둘 것).",
    "테스트는 env -u LOOM_RELAY_TOKEN -u LOOM_RELAY_URL bun test. 전체 스위트 회귀 판정은 아키텍트 몫이니 신규 유닛만 돌려라.",
    "git commit/push 금지 — 검증까지만. 완료 시 브리프의 [HOOKCACHE-B-DONE] 형식 한 줄을 최종 출력하라.",
  ].join(" "),
  agentKind: "claude",
});
console.log("B→claude", JSON.stringify(result));
