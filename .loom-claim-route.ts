/**
 * ROUTE-* card.done 결과 일괄 반영 (mac/wsl/vps 3카드 공용 1본, 0-c ④).
 * 인박스의 card.done handoff(= card-result attachment 보유)를 순회하며 accept → applyCardResult.
 * 선례: .loom-claim-smoke-vps1.ts / .loom-claim-smoke-wsl2d.ts (parse→apply→accept).
 *   차이: 하드코딩 doneId 대신 인박스를 순회해 card-result가 붙은 항목을 자동 선별.
 * 실행: env -u LOOM_RELAY_URL -u LOOM_RELAY_TOKEN LOOM_PROFILE=claude-impl bun run .loom-claim-route.ts
 */
import { opsClaim, opsListInbox } from "./packages/host/src/room-ops";
import { applyCardResult, parseResultFromAttachments } from "./packages/host/src/card-ops";

const inbox = await opsListInbox();
console.log(`inbox entries: ${inbox.count} (source=${inbox.source})`);

// card-result attachment이 붙은 handoff = card.done. 그 외(chat/일반 handoff)는 스킵.
const cardDone = inbox.entries.filter(
  (e) => parseResultFromAttachments(e.handoff.attachments) !== null,
);
console.log(`card.done candidates: ${cardDone.length}`);
if (cardDone.length === 0) {
  console.log("반영할 card.done 없음. (디스패치 후 워커 응답 도착 전이거나 이미 처리됨)");
  process.exit(0);
}

let applied = 0;
for (const entry of cardDone) {
  const id = entry.handoff.id;
  console.log(`\n=== ${id} (from ${entry.handoff.fromPeerId}, status=${entry.status}) ===`);

  const done = await opsClaim(id, "accept");
  if (!done.ok || !done.entry) {
    console.error(`  claim/accept failed: ${done.error}`);
    continue;
  }
  const h = done.entry.handoff;
  const result = parseResultFromAttachments(h.attachments);
  if (!result) {
    console.error(`  no card-result attachment on ${id}`);
    continue;
  }
  console.log(`  node:    ${result.node}`);
  console.log(`  status:  ${result.status}`);
  console.log(`  summary: ${result.summary ?? "(no summary)"}`);

  const res = applyCardResult({
    resultJson: JSON.stringify(result),
    fromPeerId: h.fromPeerId,
    fromNode: h.fromDisplayName ?? undefined,
  });
  if (!res.ok) {
    console.error(`  apply failed: ${res.error}`);
    continue;
  }
  console.log(`  board transition: ${res.task.id} -> ${res.status}`);
  applied += 1;
}

console.log(`\napplied ${applied}/${cardDone.length} card.done result(s).`);
