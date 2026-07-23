# Todo — Loom

## Current — post WP5-followup M-1 · Owner product/idle

> SSOT = `HANDOFF.md`. Start: **`bun run status`**.
> DELIVERY · handoff B · M-1 cutover **shipped**. NORMS/MAP design-only (`5b14012`).

### Do now (next session)

- [ ] Owner: **product** | **idle** (safe default = idle)

### Open issues (solve later — not current gate)

- [ ] **ISSUE · cause B (claude-mem header minute ts)**  
  - Symptom: SessionStart memory header includes minute-level timestamp → prompt-cache reuse ≤ ~1 min (~34k cache-write miss).  
  - Temp: B-4 patch `worker-service.cjs` date-only + `bun run check:mem-header` (autoUpdate reverts).  
  - **Root fix:** upstream B-7 — header time granularity option/default date-only (`HOOK-CACHE-FIX-DESIGN.md` §5).  
  - Do **not** mark closed by re-patch alone.

### Shipped (don't redo)

- [x] Phase D · Dashboard v1 · Product 0.28.1 · adapter `6e2df8a`
- [x] SESSION-START rev-3 design · DELIVERY 0a–2 · owner approval `5b14012`
- [x] Handoff authoring B — `handoff:budget` + `docs/HANDOFF-AUTHORING.md`
- [x] WP5-followup M-1 cutover — single `--part all` · joint budget fit · Claude/Codex hooks ×1
