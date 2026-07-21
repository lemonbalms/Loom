/**
 * SMOKE-HOOK-D card.done 결과를 타워 보드에 반영 + 인박스 정리.
 * card.done handoff: ho_40322f94a2655d42 (SMOKE-HOOK-D) — card task_db71ab590f18300b.
 * 실행: env -u LOOM_RELAY_URL -u LOOM_RELAY_TOKEN LOOM_PROFILE=claude-impl bun run .loom-claim-smoke-hook-d.ts
 */
import { opsClaim } from "./packages/host/src/room-ops";
import { applyCardResult, parseResultFromAttachments } from "./packages/host/src/card-ops";

const doneId = "ho_40322f94a2655d42"; // [DONE] card.done (SMOKE-HOOK-D)

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
console.log(`\nSMOKE-HOOK-D board transition: ${applied.task.id} -> ${applied.status}`);
console.log("board notes:", applied.task.notes);
