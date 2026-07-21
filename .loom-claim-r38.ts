/**
 * R38 card.done 결과를 타워 보드에 반영 + 인박스 정리.
 * card.done handoff: ho_6d37da72681303e5 (from mac-node) — card task_722db4f6bc8eab54.
 * 실행: env -u LOOM_RELAY_URL -u LOOM_RELAY_TOKEN LOOM_PROFILE=claude-impl bun run .loom-claim-r38.ts
 * 선례: .loom-claim-r37.ts (parse→apply→accept).
 */
import { opsClaim } from "./packages/host/src/room-ops";
import { applyCardResult, parseResultFromAttachments } from "./packages/host/src/card-ops";

const doneId = "ho_6d37da72681303e5"; // [DONE] card.done from mac-node (R38)

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
console.log(`R38 board transition: ${applied.task.id} -> ${applied.status}`);
