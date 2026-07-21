/**
 * IMPL-0261 card.done 결과를 타워 보드에 반영 + 인박스 정리.
 * card.done handoff: ho_aa04c868d43fffc5 (IMPL-0261) — card task_dfd33e28eb85bc68.
 * 실행: env -u LOOM_RELAY_URL -u LOOM_RELAY_TOKEN LOOM_PROFILE=claude-impl bun run .loom-claim-impl-0261.ts
 */
import { opsClaim } from "./packages/host/src/room-ops";
import { applyCardResult, parseResultFromAttachments } from "./packages/host/src/card-ops";

const doneId = "ho_aa04c868d43fffc5"; // [DONE] card.done (IMPL-0261)

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
console.log("=== card.result status ===");
console.log(result.status ?? "(no status)");
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
console.log(`\nIMPL-0261 board transition: ${applied.task.id} -> ${applied.status}`);
console.log("board notes:", applied.task.notes);
