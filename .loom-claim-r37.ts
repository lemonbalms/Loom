/**
 * R37 card.done 결과를 타워 보드에 반영 (L-2 검증 포함) + 인박스 정리.
 * card.done handoff: ho_b5cb878b072809de (from mac-node) — card task_8752614047decdb2.
 * 실행: LOOM_PROFILE=claude-impl bun run .loom-claim-r37.ts
 * 선례: .loom/apply-r24-result.ts (parse→apply→accept).
 */
import { opsClaim } from "./packages/host/src/room-ops";
import { applyCardResult, parseResultFromAttachments } from "./packages/host/src/card-ops";

const doneId = "ho_b5cb878b072809de"; // [DONE] card.done from mac-node (R37)

// accept 모드: 엔트리(+attachment) 회수 + 인박스에서 제거를 한 번에.
const done = await opsClaim(doneId, "accept");
if (!done.ok || !done.entry) {
  console.error("claim/accept failed:", done.error);
  process.exit(1);
}
const h = done.entry.handoff;
const result = parseResultFromAttachments(h.attachments);
if (!result) {
  console.error("no card-result attachment on", doneId);
  process.exit(1);
}
console.log("parsed card.result:", JSON.stringify(result, null, 2));

const applied = applyCardResult({
  resultJson: JSON.stringify(result),
  fromPeerId: h.fromPeerId,
  fromNode: h.fromDisplayName ?? undefined,
});
console.log("applyCardResult:", JSON.stringify(applied, null, 2));
if (!applied.ok) {
  console.error("apply failed:", applied.error);
  process.exit(1);
}
console.log(`R37 board transition: ${applied.task.id} -> ${applied.status}`);
