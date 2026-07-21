/**
 * HOOKCACHE A/B/C card.done 회수 — parse→apply→accept (선례 .loom-claim-impl-0250.ts).
 * 실행: env -u LOOM_RELAY_URL -u LOOM_RELAY_TOKEN LOOM_PROFILE=claude-impl bun run .loom-claim-hookcache.ts
 */
import { opsClaim } from "./packages/host/src/room-ops";
import { applyCardResult, parseResultFromAttachments } from "./packages/host/src/card-ops";

const dones = [
  { id: "ho_a8dba91430b9a778", lane: "A (grok)" },
  { id: "ho_7225b5a06764bfef", lane: "B (claude)" },
  { id: "ho_e41e36709a35dee5", lane: "C (claude)" },
];

for (const d of dones) {
  console.log(`\n${"=".repeat(70)}\n### ${d.lane}  ${d.id}\n${"=".repeat(70)}`);
  const done = await opsClaim(d.id, "accept");
  if (!done.ok || !done.entry) {
    console.error("claim/accept failed:", done.error);
    continue;
  }
  const h = done.entry.handoff;
  const result = parseResultFromAttachments(h.attachments);
  if (!result) {
    console.error("no card-result attachment on", d.id);
    continue;
  }
  console.log("--- summary ---");
  console.log(result.summary ?? "(no summary)");
  console.log("--- output (tail 3000) ---");
  console.log(String(result.output ?? "").slice(-3000));

  const applied = applyCardResult({
    resultJson: JSON.stringify(result),
    fromPeerId: h.fromPeerId,
    fromNode: h.fromDisplayName ?? undefined,
  });
  if (!applied.ok) {
    console.error("apply failed:", applied.error);
    continue;
  }
  console.log(`\nboard: ${applied.task.id} -> ${applied.status}`);
}
