# Todo — Loom

## Current — RULE-ROUTER rev-4 · **review this session**

> SSOT = `HANDOFF.md`. Start: **`bun run status`**.
> Target is frozen: commit `7a47aad` · blob `a4a0b47` · `docs/spikes/RULE-ROUTER-PROPOSE.md` (523 lines).
> The propose was authored in the previous session — this session reviews it, and must not extend it.

### Do now (review order)

- [ ] Read the frozen propose in full (rev-4). Context it reuses: `RULE-ENFORCEABILITY.md` (H/G/A/J · L0–L5)
- [ ] Spawn the `fable-advisor` subagent (`model: fable`, read-only) — **mandatory before any verdict**
- [ ] Answer §8's seven questions without ambiguity:
      ①P2 grade↔routing-safety correspondence (반례 있나) ②pinned 판정 권한 ③JIT 주입의 타 하네스 범위
      ④G1이 못-실패 게이트 아닌가 ⑤리뷰 경로 R{n} vs spike ⑥α 해석 ⑦M7 임계 사전등록 주체
- [ ] Rule on D1–D9 (§10) — 특히 D1(Phase 1 착수) · D2(리뷰 경로) · D9(카테고리 정본)
- [ ] Write the verdict to `docs/spikes/RULE-ROUTER-REVIEW.md` (default) with frozen coordinates;
      only use `plan_review.md R{n}` if the Owner picks that path
- [ ] No Phase 1 work — registry/router/inject stay untouched until the verdict
- [ ] Keep CONTEXT-MAP/product closed

### Review scope notes (what the propose already settled — do not re-derive)

- rev-2 demoted the 3-layer hybrid to a candidate; A/B/C adoption goes through the §6.5 bake-off
- rev-3 §6.6 defines reproducibility (R1/R2/R3), the LLM devices B-1–B-5, and D8 add-only authority
- rev-4 §5.2.1 puts Owner-declared categories under all three candidates; ambiguity = union, not a pick
- Known-open by design: M7 threshold unset · B-2 cache invalidation unspecified · category coverage unmeasured

### Open issues (not current gate)

- [ ] **ISSUE · cause B (claude-mem header minute ts)** — root = upstream B-7; B-4+`check:mem-header` temp only

### Shipped (don't redo)

- [x] R28 conv/inject flake · per-inject working latch · immediate fake-herdr working · awaited delta anchor · full suite green
- [x] Phase D · Dashboard · Product 0.28.1 · adapter `6e2df8a`
- [x] SESSION-START rev-3 design · DELIVERY 0a–2 · `5b14012` (impl = DELIVERY only)
- [x] Handoff authoring B · WP5-followup M-1 cutover
- [x] NORMS impl-readiness **review** (prereqs met; logged in HANDOFF — not implementation)
- [x] Single/current-session routing correction · semantic Line lint · 814/814 tests
- [x] NORMS-RECEIPT exact packs · sha8 envelope · Claude measured accelerator · Codex/Grok fail-closed ritual
