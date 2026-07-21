// D 검증 3차 발사 (1·2차는 pane 유실로 미완). 규칙 5: 검증=codex.
// 실행: LOOM_PROFILE=claude-impl bun run .loom-dispatch-dverify.ts
import { addTask } from "./packages/host/src/task-board";
import { dispatchCard } from "./packages/host/src/card-ops";

const task = addTask({
  title: "HOOKCACHE-D-VERIFY(3차) — 감지기 보강 독립 검증 (codex pane · 읽기 전용)",
  notes: "VERIFY · 1·2차 pane 유실로 미완 · watch-card 감시 적용",
});
console.log("task created:", task.id);

const result = await dispatchCard({
  taskId: task.id,
  node: "mac-node",
  prompt: [
    "당신은 codex 검증자다. 읽기 전용 — 파일을 고치지 마라. (앞선 2회 발사가 pane 종료로 중단되어 재발사된 카드다. 결론을 서두르지 말고 근거를 남겨라.)",
    "배경: codex가 앞선 교차검증에서 scripts/check-mem-header.ts 결함 2건을 지적했다. ① manifest 첫 존재 경로를 골라 실제 훅 해석 순서를 복제하지 않아 구버전 false OK 가능 ② 앵커 미발견 시 SKIP/exit 0 이라 auto-update 회귀에 사각.",
    "grok이 그 둘을 수정했다. 아키텍트 1차 확인: 경로 해석이 CLAUDE_PLUGIN_ROOT → cache mtime 최신순(ls -dt 복제) → marketplaces 폴백으로 바뀌었고, 앵커 미발견은 exit 1·설치본 없음만 fail-open으로 갈렸으며 유닛이 5→13개로 늘었다.",
    "검증할 것: ① 수정이 실제로 그 결함을 닫는가(우회 경로·부분 수정 아닌가) ② 새 결함은 없는가 — 특히 fail-open 경계가 좁아져 claude-mem 미설치 등 다른 오너 환경에서 게이트를 막지 않는가 ③ 유닛 13개가 두 회귀를 실제로 잡는가(합성 픽스처가 진짜 케이스를 재현하는가, 통과하도록 느슨하지 않은가) ④ 홈이 패치된 상태에서 check:mem-header 가 OK exit 0 인 것이 무회귀 확인으로 충분한가.",
    "확증 편향을 경계하라 — '내 지적이 반영됐다'가 아니라 '결함이 실제로 닫혔다'를 기준으로 판정하라. 지적자와 검증자가 같은 모델이라는 점을 의식하고, 반증을 먼저 시도하라.",
    "테스트는 env -u LOOM_RELAY_TOKEN -u LOOM_RELAY_URL bun test scripts/check-mem-header.test.ts 까지만. 전체 스위트는 돌리지 마라(아키텍트가 병행 실행 중이라 경합한다).",
    "파일 수정·commit·push 금지.",
    "완료 시 최종 줄에 정확히: [HOOKCACHE-D-VERIFY-DONE] fix1=<closed|open|partial> fix2=<closed|open|partial> newissue=<none|found> units=<adequate|weak>",
  ].join(" "),
  agentKind: "codex",
});
console.log(JSON.stringify(result));
