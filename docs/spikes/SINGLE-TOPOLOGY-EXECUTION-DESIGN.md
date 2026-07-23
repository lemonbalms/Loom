# Single topology execution routing — current-session fold

| Field | Value |
|---|---|
| **Status** | **adopted-for-implement · Owner correction** |
| **Date** | 2026-07-23 |
| **Scope** | Loom repository process/harness execution routing · HANDOFF Line contract · semantic lint |
| **Owner decision** | `topology single` means the **current session** implements, verifies with objective commands, updates docs, and ships; do not dispatch Grok for this wave |
| **Primary SSOT** | `docs/DOGFOOD_LOOP.md` §0.5 |
| **Supersedes** | SESSION-START review F6 · rev-3 P7/§6/§8/§10/§13 statements that prohibit current-session implementation under `single` |
| **Preserves** | frozen `cc03474` NORMS §7 pack/envelope/digest/budget contract · product PLAN v0.28.1 · topology `full` delegation workflow |

> This is a process-policy correction, not a NORMS payload redesign. The frozen rev-3
> file remains immutable evidence; its functional N/S contracts stay authoritative.
> Its F6-derived routing statements are non-operative where they conflict with this
> Owner correction and `DOGFOOD_LOOP` §0.5.

---

## 0. Binding decision

Topology selects the **shape of execution**, not the model name and not the terminal
profile label.

| Topology | Preconditions | Implementation | Verification | Ship |
|---|---|---|---|---|
| **`single`** | bounded harness/docs work · contract already resolved · no new product/security decision | **current session** | same session runs objective commands | same session syncs docs and commits/pushes |
| **`full`** | unresolved contract · product meaning · security/trust decision · independent judgment has material value | separate implementer lane | separate verifier/advisor where possible | architect confirms reviewed diff and remote |

`single` does not mean “skip verification.” It folds implementation and verification
into one session and replaces peer attestation with command evidence.

**Lockedness is not a delegation trigger.** A locked, bounded harness contract can be
ideal `single` work because little implementation judgment remains. The trigger for
`full` is unresolved or high-risk judgment, not the mere presence of an approved spec.

### 0.1 Promotion boundary

Touching code that implements a reviewed fail-closed rule does not by itself force
`full`. Promotion is required when implementation discovers that the locked contract
does not answer a consequential question.

Promote or return to design when any of these appears:

- a new product or `packages/*` semantic decision;
- a new auth/permission/trust or data-loss decision;
- two SSOTs require incompatible runtime behavior;
- the implementation needs to weaken a fail-closed rule;
- repeated red shows that the “mechanical implementation” premise was false.

An Owner may explicitly select topology. Such a selection must be recorded in the
canonical HANDOFF Line. A topology change is not synonymous with selecting Grok;
vendor routing remains a separate axis.

---

## 1. Root cause and correction boundary

### 1.1 Causal chain

1. `dc83d2b` introduced delegation after a session model started writing approved
   **product code** without checking fallback lanes. `DOGFOOD_LOOP` §1.2 retained the
   product-code scope, while the AGENTS summary dropped that qualifier.
2. `5fafcd1` later introduced `single` as current-session implementation for bounded
   harness work, but did not narrow the older AGENTS delegation row atomically.
3. SESSION-START review F6 compared the draft only with the over-broad AGENTS summary
   and did not consult the already-declared topology SSOT (`DOGFOOD_LOOP` §0.5).
4. `38202ff` encoded that false-positive finding as P7 and repeated it in trigger,
   context-map, smoke, and Must-not sections.
5. `edfea98` copied both `topology single` and “architect hand-code locked NORMS” into
   the same HANDOFF. Structural lint passed because it did not validate routing meaning.
6. A later session preferred the emphatic prohibition over the terse topology field and
   attempted full-line Grok routing.

### 1.2 What changes

- `DOGFOOD_LOOP` §0.5 remains the sole owner of `single`/`full` execution meaning.
- `DOGFOOD_LOOP` §1.2 and AGENTS delegation text are narrowed to **`full` routing**.
- `single` explicitly folds the current session into implementation + command verify.
- HANDOFF records topology, execution, and verification as structured enums.
- lint/status consume the same parser and reject invalid pairings.
- the review ledger records F6 as retracted so the false finding is not reused.

### 1.3 What does not change

- No NORMS extractor, envelope, budget, or hook implementation in this correction wave.
- No product/package behavior, version, protocol, relay, herdr, or card change.
- No weakening of `full` topology’s implementer/verifier separation.
- No mutation of frozen `cc03474` text; correction provenance is additive.
- No claim that current-session verification is independent review.

---

## 2. Authority and precedence

For execution routing, read authorities in this order:

1. explicit current Owner topology/vendor instruction;
2. live HANDOFF structured Line (this session’s recorded selection);
3. `DOGFOOD_LOOP` §0.5 topology semantics;
4. AGENTS/SESSION-START summaries, which must point to §0.5 and may not broaden it;
5. historical proposal/review prose.

The frozen SESSION-START rev-3 remains authoritative for its package contracts. F6/P7
is a cross-cutting orchestration statement outside the NORMS package ownership table;
this design retracts only that routing interpretation. Changes to §7 pack selection,
N envelope grammar, digest, budget, or enablement still require a new design target.

---

## 3. Canonical HANDOFF Line grammar

`Current action` must contain exactly one canonical Line declaration.

### 3.1 Single

```markdown
**Line:** topology **`single`** · execution **`current-session`** · verify **`objective-commands`** · full fallback Codex→Grok→Codex
```

### 3.2 Full

```markdown
**Line:** topology **`full`** · execution **`delegated`** · verify **`independent`** · chain Codex→Grok→Codex
```

Stable enums:

| Field | Values |
|---|---|
| `topology` | `single` · `full` |
| `execution` | `current-session` · `delegated` |
| `verify` | `objective-commands` · `independent` |

Valid tuples:

| topology | execution | verify |
|---|---|---|
| `single` | `current-session` | `objective-commands` |
| `full` | `delegated` | `independent` |

All other tuples fail lint. Free-form suffixes may describe a full fallback or selected
vendor chain, but must not redefine the enum tuple.

### 3.3 Status rendering

The Dashboard continues to use one `Line` row. It derives the execution path from the
canonical tuple instead of inferring it from nearby prose.

```text
single → topology **single** · current-session→objective-commands→ship
full   → topology **full** · delegated→independent→ship · chain …
```

Malformed or missing routing is fail-loud (`malformed`), never silently interpreted as
the inherited full chain.

---

## 4. Implementation design

### 4.1 Shared parser

Add a small host-neutral module used by both status and lint.

```ts
type SessionTopology = "single" | "full";
type SessionExecution = "current-session" | "delegated";
type SessionVerification = "objective-commands" | "independent";

type SessionRouting = {
  topology: SessionTopology;
  execution: SessionExecution;
  verify: SessionVerification;
  suffix: string;
};
```

Responsibilities:

- extract exactly one canonical Line from `Current action`;
- require all three enum fields;
- validate the two allowed tuples;
- expose one status formatter;
- return structured errors rather than guessing defaults.

The parser does not attempt natural-language understanding. The structured tuple is the
machine contract; surrounding prose remains explanatory only.

### 4.2 `handoff:lint`

Add fail-closed checks for:

- missing or duplicate canonical Line;
- unknown enum value;
- invalid topology/execution/verify tuple;
- `single` without a `full fallback` suffix;
- `full` without a `chain` suffix.

The live contradictory “single + architect must not implement” sentence is removed from
HANDOFF. Cross-document prose is corrected at its source rather than regex-policed.

### 4.3 `status`

Replace the separate topology and vendor-chain heuristics with the shared routing
parser. Preserve the Dashboard schema; only the `Line` cell becomes unambiguous.

### 4.4 Process docs

| File | Change |
|---|---|
| `docs/DOGFOOD_LOOP.md` | §0.5 remains SSOT; §1.2 explicitly `full` only; clarify role fold |
| `AGENTS.md` | retain `Impl delegation` row label for future NORMS extraction; narrow its value to topology-aware routing |
| `docs/SESSION-START.md` | enforcement summary points to structured routing lint |
| `docs/spikes/SESSION-START-UNIFIED-REVIEW.md` | additive erratum retracting F6 with commit evidence |
| `tasks/lessons/orchestration.md` + index | record scope-loss/partial-migration lesson |
| `HANDOFF.md` | record Owner `single/current-session/objective-commands` selection |
| `tasks/todo.md` | policy correction precedes NORMS Phase 3 |

The frozen proposal file is not rewritten in place. The review erratum and this adopted
design make the correction explicit while preserving the immutable target evidence.

---

## 5. Verification contract

### 5.1 Unit scenarios

| ID | Input | Expected |
|---|---|---|
| V1 | canonical single tuple | parse success · current-session status |
| V2 | canonical full tuple | parse success · delegated status + chain |
| V3 | single + delegated | lint failure |
| V4 | single + independent | lint failure |
| V5 | full + current-session | lint failure |
| V6 | missing execution/verify | lint failure |
| V7 | duplicate Line | lint failure |
| V8 | unknown enum | lint failure |
| V9 | live HANDOFF | single/current-session/objective-commands |

### 5.2 Ship gates

```bash
bun test scripts/session-routing.test.ts
bun test scripts/handoff-checkpoint.test.ts
bun test scripts/session-start-triggers.test.ts
bun run status
bun run handoff:check
env -u LOOM_RELAY_TOKEN -u LOOM_RELAY_URL bun test
```

Pass conditions:

- Dashboard Line cannot be read as a Grok dispatch instruction under `single`;
- HANDOFF semantic tuple is valid and unique;
- existing nine-section/inject budgets remain green;
- full suite has no new failures;
- no product or dist change.

---

## 6. Rollout order

| Phase | Work | Exit |
|---|---|---|
| **A** | adopt this correction design | Owner direction recorded · scope fixed |
| **B** | shared routing parser + lint/status tests | V1–V8 green |
| **C** | policy docs + review erratum | no duplicated broad rule remains in live norms/docs |
| **D** | HANDOFF/todo migration | live V9 + `handoff:check` green |
| **E** | full tests · commit/push policy correction | remote commit confirmed |
| **F** | implement NORMS-RECEIPT under corrected `single` | separate implementation wave |

The policy correction ships as a separate commit before NORMS. This ordering is
load-bearing: NORMS `core` will extract and digest the AGENTS `Impl delegation` row.
Implementing NORMS first would turn the over-broad rule into automatically injected
norm bytes on every host.

---

## 7. Risks and mitigations

| Risk | Mitigation |
|---|---|
| Frozen rev-3 still contains P7 | immutable evidence preserved; additive review erratum explicitly retracts F6/P7 routing interpretation |
| Parser becomes a second policy SSOT | parser owns syntax/tuple validity only; DOGFOOD §0.5 owns meaning |
| Free prose contradicts tuple again | live routing authority is the canonical Line; remove known contradiction; reviews must cite the owner SSOT |
| `single` used for genuinely ambiguous work | promotion boundary is “new consequential decision,” with fail-loud return to design |
| Same-session verify overstated | status says `objective-commands`, never `independent` |
| Owner vendor restriction lost | HANDOFF records current-session execution; full fallback is descriptive, not active routing |

---

## 8. Review hygiene rule

Any future finding that claims an SSOT conflict must include:

1. the document that **owns** the rule;
2. every summary/pointer that restates it;
3. `rg` results for the conflicting phrase family;
4. `git blame`/chronology when the taxonomy changed recently;
5. at least one concrete execution scenario showing different outcomes.

A summary cannot be promoted over the document it points to merely because its wording
is more absolute. This is the specific review failure that produced F6.

---

## 9. Decision log

| Decision | Pick | Reason |
|---|---|---|
| Execution authority | `DOGFOOD_LOOP` §0.5 | already registered as topology SSOT |
| Current wave topology | `single` | Owner explicit · bounded harness policy correction |
| Current implementer | current Codex session | `single` role fold; no Grok dispatch |
| Verification claim | objective commands | same-session verification is not independent review |
| Frozen rev-3 handling | additive erratum, no in-place rewrite | preserve immutable evidence while retracting false F6 |
| NORMS ordering | policy correction first | avoid digesting/injecting the wrong AGENTS rule |
| Product PLAN/R{n} | not opened | process/harness PATCH; no product surface or trust boundary change |

