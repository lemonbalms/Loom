/**
 * IMPL-0250 card.done 결과를 타워 보드에 반영 + 인박스 정리.
 * card.done handoff: <ho_...> (from mac-node) — card <task_...>.
 * 발사 후 card.done 도착 시 doneId를 실제 handoff id로 채워 실행:
 *   env -u LOOM_RELAY_URL -u LOOM_RELAY_TOKEN LOOM_PROFILE=claude-impl bun run .loom-claim-impl-0250.ts
 * 선례: .loom-claim-impl-0242.ts (parse→apply→accept).
 */
import { opsClaim } from "./packages/host/src/room-ops";
import { applyCardResult, parseResultFromAttachments } from "./packages/host/src/card-ops";

const doneId = "ho_66ad5a0b695350ad"; // [DONE] card.done from mac-node (IMPL-0250)

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
console.log("=== card.result summary ===");
console.log(result.summary ?? "(no summary)");
console.log("=== card.result output (tail) ===");
console.log(String(result.output ?? "").slice(-2500));

const applied = applyCardResult({
  resultJson: JSON.stringify(result),
  fromPeerId: h.fromPeerId,
  fromNode: h.fromDisplayName ?? undefined,
});
if (!applied.ok) {
  console.error("apply failed:", applied.error);
  process.exit(1);
}
console.log(`\nIMPL-0250 board transition: ${applied.task.id} -> ${applied.status}`);
console.log("board notes:", applied.task.notes);
