# SESSION-START — L0 execution contract

| Field | Value |
|---|---|
| **Status** | DELIVERY Phase 0a+ (implementation-authorized) |
| **Authority** | `docs/spikes/SESSION-START-UNIFIED-PROPOSE.md` rev-3 · freeze `cc03474` · owner approval `5b14012` |
| **Scope** | ritual · triggers · templates · host matrix summary · wire pointers |
| **Does not** | NORMS pack extractor · CONTEXT-MAP Template M · product/herdr |

> **Ritual is SSOT on every host. Inject/hooks are accelerators only.**  
> Full design: spike rev-3 §§0–14. This file is the short L0 agents load.

---

## Binding invariant

1. **S (state + lessons):** model-visible BEGIN+matching END for each part, or ritual recovery. Hook exit 0 alone ≠ S full.
2. **N (norms):** LOADED only with outer+pack BEGIN/END + non-empty bodies (NORMS package; not wired until separately implementation-authorized).
3. **No evidence → no forbidden action:** S absent/partial → recover before gate guess; N unverified → no autonomous commit/push wave without recovery or owner explicit.

---

## Ritual (all hosts — baseline)

```bash
bun run status
# then partial Read:
# HANDOFF nine sections · traps (활성 함정 + 하지 말 것) · lessons index
```

Optional raw dump (when adapters exist):

```bash
bun run scripts/session-context.ts --part all --format raw
# diagnostic splits still work:
#   --part state | --part lessons
```

Owner brief = **status table only** — never dump inject envelopes to the owner.

---

## Triggers + precedence

Higher wins.

### Precedence

1. **Capability stop** — `멈춰` > `계획만` > `커밋 금지` (different masks)
2. **Explicit read-only** — `상태` · `핸드오프 확인해` · `status`
3. **Explicit continue** — `이어서` · `진행해` · `자율적으로` · `단계적으로`
4. **Cold start default** — first turn, no explicit trigger → Template **R** (brief then wave)
5. **Role triggers** — `R{n}` · locked-spec impl lane

### Capability masks

| Trigger | Template | read | write/impl | commit/push |
|---------|----------|:----:|:----------:|:-----------:|
| **상태** / status | **S** | ✓ | ✗ | ✗ |
| **핸드오프 확인해** | **A** | ✓ | ✗ | ✗ |
| **이어서** / **진행해** / **자율적으로** / **단계적으로** | **R** | ✓ | ✓* | ✓* |
| **계획만** | plan/docs | ✓ | docs only | ✗ |
| **커밋 금지** | work ok | ✓ | ✓ | ✗ |
| **멈춰** | pause | ✓ | ✗ | ✗ |
| **R{n}** | reviewer | ✓ | rev only | n/a |
| **락 스펙 구현** | impl lane | ✓ | impl lane | ship rules |

\* write/commit only if N/S evidence allows and no higher mask.

### Composite utterances (acceptance #12)

| Utterance shape | Interpretation |
|-----------------|----------------|
| “상태만” / “핸드오프만 확인해” | Template **S** or **A** only — **no wave** |
| “상태 확인하고 이어서 해” / “status then continue” | Template **S** first, then Template **R** wave (ordered, not a conflict) |
| First-turn bare “이어서” / “진행해” | Template **R** (status echo → Current action) |
| First-turn no trigger | Template **R** after ritual |

**Must not:** treat bare **상태** / **status** as a wave trigger.

---

## Templates

| ID | Agent response | Wave? |
|----|----------------|:-----:|
| **S** | `bun run status` output as-is (+ optional one-line Gate title) | no |
| **A** | status + Gate Now/Done/Must not + `handoff:check` one line | no |
| **R** | status, then execute Current action (no “진행할까요?”) | yes* |

\* If S is incomplete in context, run ritual recovery first.

---

## Host delivery matrix (summary)

| Host | S primary | S accelerator | S fallback | Must not |
|------|-----------|---------------|------------|----------|
| **Claude** | SessionStart **×1** `--part all` (`claude-json`), matcher `startup\|resume\|clear\|compact` | same | ritual | dual-hook race; treat partial END as S full |
| **Codex** | SessionStart **×1** `--part all` (`codex-plain` plain stdout), matcher same | same | ritual on fail/disabled | reopen JSON as default wire |
| **Grok** | **Ritual only** | SessionStart = env/setup only (stdout **ignored**) | ritual always | treat hook stdout as S full |

Wire formats (builder vs adapter): `scripts/session-context.ts`  
`--format raw | claude-json | codex-plain`  
Each S part is one complete envelope:

```text
[LOOM-SESSION-CONTEXT v1 · <part>]
… body …
[LOOM-SESSION-CONTEXT-END v1 · <part>]
```

Budgets: Claude ~10k chars (our HARD_CAP 9500); Codex ~2500 tokens model-visible (overflow → head/tail + file — fail-loud partial, not silent full); Grok rules uncapped for N files.

---

## Templates A/S/R host notes

- Owner-facing channel always Template S/A shape (`bun run status`), never inject dump.
- Claude/Codex accelerators may pre-load S so Template R can skip re-Read when BEGIN+END evidence is in-window.
- Grok always assumes ritual for S until an official non-stdout path ships.

---

## Enforcement (current)

| Surface | Class |
|---------|-------|
| Trigger masks / Template S no-wave | prose + unit tests (`session-start-triggers`) |
| S BEGIN/END completeness | lint-gate fixtures on adapters |
| nine/traps inject completeness | `handoff:check` |
| Architect locked-spec hand-code | prose (DOGFOOD / AGENTS) |

---

## Pointers

| Doc | Role |
|-----|------|
| `AGENTS.md` | product norms + ritual entry (L1) |
| `CLAUDE.md` | `@AGENTS.md` + Claude orchestration |
| `docs/spikes/SESSION-START-UNIFIED-PROPOSE.md` | full design + Decision log |
| `docs/spikes/SESSION-INJECT-VIEW-DESIGN.md` | status view vs nine-axis model |
| `scripts/session-context.ts` | raw builder + host adapters |
| `.claude/settings.json` | Claude SessionStart wiring |
| `.codex/hooks.json` | Codex SessionStart wiring |
