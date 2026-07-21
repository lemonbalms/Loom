/**
 * FIX-0260 카드 발사 — hook-sensor.test.ts 소켓 경로 길이 4건 수정 (grok pane).
 * 실행: env -u LOOM_RELAY_URL -u LOOM_RELAY_TOKEN LOOM_PROFILE=claude-impl bun run .loom-dispatch-fix-0260.ts
 */
import { addTask } from "./packages/host/src/task-board";
import { dispatchCard } from "./packages/host/src/card-ops";

const task = addTask({
  title: "FIX-0260 — hook-sensor.test.ts 소켓 바인딩 4건 실패 수정: macOS sun_path 104B 한계 (grok pane)",
  notes: "FIX · IMPL-0260 후속 · 테스트 하네스만 수정 · 제품 코드 무변경",
});
console.log("task created:", task.id);

const result = await dispatchCard({
  taskId: task.id,
  node: "mac-node",
  prompt: [
    "당신은 grok-impl 구현자다. packages/host/src/hook-sensor.test.ts의 실패 4건을 수정하라.",
    "근인(아키텍트 진단 확정): 소켓 바인딩 테스트가 mkdtempSync(join(tmpdir(),...)) 기반 LOOM_TEST_HOME을 쓰는데",
    "macOS tmpdir가 /var/folders/... 장경로라 hook-<cardId>-<seq>.sock 전체 경로가 112B > unix sun_path 한계(~104B)",
    "→ startHookListener가 bind_failed로 ok:false. 실패 4건 전부 이 패턴(bind-before-unlink·flight guard·close idempotent·malformed).",
    "수정: 소켓을 실제 바인딩하는 테스트만 짧은 베이스 경로 사용 — 예: mkdtempSync('/tmp/lhs-')를 LOOM_TEST_HOME으로",
    "(기존 beforeEach/afterEach의 프로필 리셋·정리 의미론 유지, 경로 길이만 단축). 제품 코드(hook-sensor.ts 등) 수정 금지 —",
    "L-1 slice(0,80)·bind 전 unlink는 이미 락 준수 구현 확인됨. 테스트 의미(어서션 대상) 변경 금지 — 경로 베이스만.",
    "검증: env -u LOOM_RELAY_TOKEN -u LOOM_RELAY_URL bun test packages/host/src/hook-sensor.test.ts 로 22/22 green +",
    "bun run --filter '*' typecheck 6/6. git commit/push 금지.",
    "완료 시 최종 줄에 정확히: [FIX-0260-DONE] units=<pass/fail> typecheck=<ok|fail>",
  ].join(" "),
  agentKind: "grok",
});
console.log(JSON.stringify(result));
