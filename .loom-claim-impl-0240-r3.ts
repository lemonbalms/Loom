/**
 * IMPL-0240 3차(진짜) card.done 결과를 타워 보드에 반영 + 인박스 정리.
 * card.done handoff: ho_5af32801b6dddbdf (from mac-node) — card task_1322b92473c225c1.
 * 실행: LOOM_PROFILE=claude-impl bun run .loom-claim-impl-0240-r3.ts
 * 선례: .loom-claim-r37.ts / .loom-claim-impl-0240.ts (parse→apply→accept).
 */
import { opsClaim } from "./packages/host/src/room-ops";
import { applyCardResult, parseResultFromAttachments } from "./packages/host/src/card-ops";

const doneId = "ho_5af32801b6dddbdf"; // [DONE] card.done from mac-node (IMPL-0240 3차)

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
console.log(`IMPL-0240 board transition: ${applied.task.id} -> ${applied.status}`);
