# Todo — Loom

## Current — RULE-ROUTER · rev-5 fold-in (리뷰 조건 0) → Owner D1–D9

> SSOT = `HANDOFF.md`. Start: **`bun run status`**.
> Review done 2026-07-23: **approve + binding 조건 0** — `docs/spikes/RULE-ROUTER-REVIEW.md`
> (advisor consulted · §8 7답 · D1–D9 권고 · findings F1–F4).

### Do now

- [ ] Fold `RULE-ROUTER-REVIEW.md` **§4 delta ①–⑧ verbatim** into the propose → **rev-5 (docs-only)**
      + changelog entry. Pre-approved text — no re-review; deviation from wording = re-review
- [ ] Brief the Owner on D1–D9 with review §5 (D1 승인 권고 · D2 spike · D3 3원천 ·
      D6 Phase 1 스키마 필드 예약만 · D7 3단 사전등록 · D8 add-only 유지 · D9 오너 선포)
- [ ] No Phase 1 work (registry/router/inject) until rev-5 **and** Owner D1
- [ ] Keep CONTEXT-MAP/product closed

### Review outcome notes (do not re-derive)

- §8 핵심 답: ①P2는 조건부(무성-deny H는 pin 기본값 · A1 반례 실증) ④G1 J-miss=0은
  contract test로 재배치, 강한-positive miss = 등급 재감사 트리거 ⑤spike 경로 확정
- Findings: F1 **JIT 비차단 주입 미실측(High → Phase 3 선결 PoC)** · F2 레지스트리 커버리지
  사각(파일 digest + triage receipt) · F3 replay 표본추출 사전등록 · F4 G5 모니터링 강등

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
