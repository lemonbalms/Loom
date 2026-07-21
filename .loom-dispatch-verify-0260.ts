/**
 * VERIFY-0260 카드 발사 — PLAN 0.26.0 R41 락 대조 (codex pane · 읽기 전용).
 * 선례: verify-0250 독립 락 대조 · IMPL-0260 dispatch 패턴.
 * 바인딩: mac-node = loom-local (claude-impl active).
 * 실행: env -u LOOM_RELAY_URL -u LOOM_RELAY_TOKEN LOOM_PROFILE=claude-impl bun run .loom-dispatch-verify-0260.ts
 */
import { addTask } from "./packages/host/src/task-board";
import { dispatchCard } from "./packages/host/src/card-ops";

const task = addTask({
  title:
    "VERIFY-0260 — PLAN 0.26.0 hooks 보조 센서 독립 락 대조 (R41 M-1·M-2·L-1..L-3, codex pane · 읽기 전용)",
  notes:
    "VERIFY · brief=.loom-verify-0260-brief.md · agent=codex · 제품/테스트/문서 수정 금지 · 커밋·푸시 금지",
});
console.log("task created:", task.id);

const result = await dispatchCard({
  taskId: task.id,
  node: "mac-node",
  prompt: [
    "리포 루트 /Users/kyoungsiklee/projects/fable-advisor 의 .loom-verify-0260-brief.md 를 읽고 그대로 수행하라.",
    "요지: 당신은 읽기 전용 독립 검증자(codex)다. PLAN v0.26.0 구현(워크트리 미커밋 포함)이 R41 M-1·M-2 binding lock + L-1..L-3을",
    "코드에 정확히 반영했는지 문서↔코드 대조만 한다. 제품 코드·테스트·문서 수정 금지. git commit/push 금지.",
    "대조 대상: docs/PLAN.md ####0.26.0 · docs/plan_review.md R41 · packages/host/src/hook-sensor.ts(+test) ·",
    "bridge-runtime.ts hook 배선 · bridge-config.ts hookSensor · VERSION 0.26.0 (cli+mcp).",
    "체크리스트 12항(M-1.1..5 · M-2.1..5 · L-1..L-3 · D2/D4/D5/D6/D7 · wire-lock) 각 PASS/FAIL + file:line.",
    "완료 시 최종 출력에 브리프의 [VERIFY-0260] 표 + 정확히 한 줄:",
    "[VERIFY-0260-DONE] locks=<pass|fail> total=<n>/12",
  ].join(" "),
  agentKind: "codex",
});
console.log(JSON.stringify(result));
