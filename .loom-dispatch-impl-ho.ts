/**
 * IMPL-HO — 세션 시작 리추얼 원샷화(WP2) + handoff:lint 가드(WP3) 구현 디스패치.
 * 짧은 프롬프트 + 저장소 루트 `.loom-impl-ho-brief.md` 파일 브리프 방식
 * (lessons: 긴 브리프는 untracked 파일로, 프롬프트엔 참조만).
 * 실행: 리포 루트에서  LOOM_PROFILE=claude-impl bun .loom-dispatch-impl-ho.ts
 * 선례: .loom-dispatch-smoke-sonnet26.ts (addTask → dispatchCard, mac-node).
 */
import { addTask } from "./packages/host/src/task-board";
import { dispatchCard } from "./packages/host/src/card-ops";

const task = addTask({
  title: "IMPL-HO — 세션 시작 리추얼 원샷화(WP2) + handoff:lint 가드(WP3)",
  notes:
    "IMPL · WP2 SessionStart hook 주입 + WP3 handoff:lint · grok 워커 · 브리프 .loom-impl-ho-brief.md",
});
console.log("task created:", task.id);

const result = await dispatchCard({
  taskId: task.id,
  node: "mac-node",
  agentKind: "grok",
  prompt:
    "리포 루트의 `.loom-impl-ho-brief.md`를 읽고 그대로 구현하라. 커밋 금지. " +
    "완료 시 최종 줄에 `[IMPL-HO-DONE] state=<chars> lessons=<chars> lint=<exit>` 마커.",
});
console.log(JSON.stringify(result));
