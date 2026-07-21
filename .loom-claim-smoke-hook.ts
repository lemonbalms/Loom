/**
 * SMOKE-HOOK A/B/C card.done 결과를 타워 보드에 일괄 반영 + 인박스 정리 (3건 순차).
 * card.done handoffs: ho_68fe4eef7a346d79(A) · ho_defb06ee403d709b(B) · ho_981b30320a4dbd89(C).
 * 실행: env -u LOOM_RELAY_URL -u LOOM_RELAY_TOKEN LOOM_PROFILE=claude-impl bun run .loom-claim-smoke-hook.ts
 */
import { opsClaim } from "./packages/host/src/room-ops";
import { applyCardResult, parseResultFromAttachments } from "./packages/host/src/card-ops";

const dones: [string, string][] = [
  ["ho_68fe4eef7a346d79", "SMOKE-HOOK-A"],
  ["ho_defb06ee403d709b", "SMOKE-HOOK-B"],
  ["ho_981b30320a4dbd89", "SMOKE-HOOK-C"],
];

for (const [doneId, label] of dones) {
  console.log(`\n========== ${label} (${doneId}) ==========`);
  try {
    const done = await opsClaim(doneId, "accept");
    if (!done.ok || !done.entry) {
      console.error(`${label} claim/accept failed:`, done.error);
      continue;
    }
    const h = done.entry.handoff;
    const result = parseResultFromAttachments(h.attachments);
    if (!result) {
      console.error(`${label} no card-result attachment on`, doneId);
      continue;
    }
    console.log(`=== ${label} card.result status ===`);
    console.log(result.status ?? "(no status)");
    console.log(`=== ${label} card.result summary ===`);
    console.log(result.summary ?? "(no summary)");
    console.log(`=== ${label} card.result output (tail) ===`);
    console.log(String(result.output ?? "").slice(-2500));

    const applied = applyCardResult({
      resultJson: JSON.stringify(result),
      fromPeerId: h.fromPeerId,
      fromNode: h.fromDisplayName ?? undefined,
    });
    if (!applied.ok) {
      console.error(`${label} apply failed:`, applied.error);
      continue;
    }
    console.log(`\n${label} board transition: ${applied.task.id} -> ${applied.status}`);
    console.log(`${label} board notes:`, applied.task.notes);
  } catch (err) {
    console.error(`${label} unexpected error:`, err);
    continue;
  }
}
