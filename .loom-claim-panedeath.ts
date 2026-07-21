/**
 * PANE-DEATH 웨이브 card.done 회수 — parse→apply→accept (선례 .loom-claim-hookcache.ts).
 * 실행: env -u LOOM_RELAY_URL -u LOOM_RELAY_TOKEN LOOM_PROFILE=claude-impl bun run .loom-claim-panedeath.ts
 */
import { opsClaim } from "./packages/host/src/room-ops";
import { applyCardResult, parseResultFromAttachments } from "./packages/host/src/card-ops";

const dones = [
  { id: "ho_88f63233409d8c78", lane: "REVIEW 1차 (codex)" },
  { id: "ho_c90246c5525093cd", lane: "REVIEW2 (codex)" },
  { id: "ho_1ee78f802ad4587d", lane: "STATUS-REPLAY (grok · pane 사망분)" },
];

for (const d of dones) {
  console.log(`\n${"=".repeat(60)}\n### ${d.lane}  ${d.id}`);
  const done = await opsClaim(d.id, "accept");
  if (!done.ok || !done.entry) {
    console.error("claim/accept failed:", done.error);
    continue;
  }
  const h = done.entry.handoff;
  const result = parseResultFromAttachments(h.attachments);
  if (!result) {
    console.error("no card-result attachment");
    continue;
  }
  console.log("status:", (result as { status?: string }).status);
  console.log("summary:", String((result as { summary?: string }).summary ?? "").slice(0, 200));
  const applied = applyCardResult({
    resultJson: JSON.stringify(result),
    fromPeerId: h.fromPeerId,
    fromNode: h.fromDisplayName ?? undefined,
  });
  console.log("applied:", applied.ok ? "ok" : `FAILED ${applied.error}`);
}
