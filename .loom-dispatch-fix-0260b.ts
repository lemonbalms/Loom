/**
 * FIX-0260b 카드 발사 — D6(b) 정상 폴백 계측 배선 핫픽스 (grok pane).
 * 실행: env -u LOOM_RELAY_URL -u LOOM_RELAY_TOKEN LOOM_PROFILE=claude-impl bun run .loom-dispatch-fix-0260b.ts
 */
import { addTask } from "./packages/host/src/task-board";
import { dispatchCard } from "./packages/host/src/card-ops";

const task = addTask({
  title:
    "FIX-0260b — D6(b) 정상 폴백 계측 배선: hookSensor 활성 claude done 시 fallback append 정확히-1회 (grok pane)",
  notes:
    "FIX · IMPL-0260 후속 · 독립 검증 유일 FAIL(D6 정상 폴백 미배선) 핫픽스 · hook-sensor.ts/bridge-runtime.ts/hook-sensor.test.ts 3파일만 · 제품 판정·wire 무변경(additive append+플래그)",
});
console.log("task created:", task.id);

const result = await dispatchCard({
  taskId: task.id,
  node: "mac-node",
  prompt: [
    "당신은 grok-impl 구현자다. 리포 루트 `.loom-fix-0260b-brief.md`를 처음부터 끝까지 정독하고 그대로 수행하라.",
    "요지: hookSensor 활성 claude 카드가 hookHint 없이/스테일 힌트로 기존 스크레이프 경로로 done 확정될 때",
    "appendHookTelemetry({type:'fallback',reason:...})를 정확히 1회 append. 분류 순수 함수를 hook-sensor.ts에 추출·export,",
    "bridge-runtime.ts finishCard 단일 초크포인트(read 해소 후 status==='done')에서 호출. 스폰 폴백 2곳에 정확히-1회 플래그 set.",
    "락 준수: hookSensor off/비-claude 미발화(L-2) · M-1/M-2/L-3 코드 무변경 · 신규 type 금지(fallback 재사용) · VERSION 무변경.",
    "제품 코드는 브리프 §2의 3파일(hook-sensor.ts·bridge-runtime.ts·hook-sensor.test.ts)만 — 그 외 파일 수정 금지.",
    "검증: env -u LOOM_RELAY_TOKEN -u LOOM_RELAY_URL bun test packages/host/src/hook-sensor.test.ts 전건 green +",
    "cd packages/host && bun run typecheck green. 결과 요약을 회신에 포함. git commit/push 금지 — 구현+유닛 검증까지만.",
    "완료 시 최종 줄에 정확히: [FIX-0260B-DONE] units=<pass>/<total> typecheck=pass|fail (실패·부분완료면 [FIX-0260B-PARTIAL] reason=<짧게>)",
  ].join(" "),
  agentKind: "grok",
});
console.log(JSON.stringify(result));
