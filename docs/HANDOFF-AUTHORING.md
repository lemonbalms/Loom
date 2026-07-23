# HANDOFF authoring & confirm guide

**SSOT for confirm (A) + write (B) checklists.**  
Budget/inject model detail: [`docs/spikes/SESSION-INJECT-VIEW-DESIGN.md`](./spikes/SESSION-INJECT-VIEW-DESIGN.md).  
Propose trail: [`docs/spikes/HANDOFF-AUTHORING-OPT-PROPOSE.md`](./spikes/HANDOFF-AUTHORING-OPT-PROPOSE.md).

## Two channels (do not mix)

| Channel | Consumer | Command / response |
|---------|----------|-------------------|
| **Confirm (owner)** | Human | `bun run status` table + Gate/Done/Must not brief + `handoff:check` one-liner |
| **Restore (agent)** | SessionStart inject | nine HANDOFF axes + traps — **not** pasted into owner chat |
| **Author (writer)** | Agent editing HANDOFF | `bun run handoff:budget` while drafting → `bun run handoff:check` before ship |

Bare **상태** / **status** = Template **S** only (no auto-wave).  
**핸드오프 확인해** = Template **A** (confirm path). Never dump full inject hashes as the owner brief.

---

## Confirm checklist (Template A)

```bash
bun run status
bun run handoff:check
```

Owner-facing reply shape:

1. Echo the **status table** (do not invent a second schema).
2. **Gate brief** — Current action title + Goal / Done when / Must not (short).
3. **handoff:check** — lint ✓ · inject omitted (none) · optional raw/target numbers if asked.

---

## Author checklist (Template B / any HANDOFF edit)

### While writing

```bash
bun run handoff:budget          # per-part chars · D1 · One-line · diet list
bun run handoff:budget --template   # nine-section skeleton only
```

| Check | Target |
|-------|--------|
| Nine `##` headings | exact titles in `REQUIRED_HANDOFF_HEADINGS` |
| One-line body | ≤ **120** chars (blockquote stripped) |
| File UTF-8 | ≤ **8192** B (D1) — archive history out |
| State inject raw | prefer ≤ **STATE_TARGET 7500**; never rely on omit |
| Omit | **(none)** required to ship |
| Current action | exactly **one** `###` gate title |
| Blockers | `(none)` or clear-condition form |
| No `<details>` | in live HANDOFF |
| traps | edit `tasks/traps.md` 활성 함정 / 하지 말 것 — not HANDOFF |

### Before claim done

```bash
bun run handoff:check   # handoff:lint && session-context:lint
bun run status          # Health: inject:full when under target
```

---

## Section templates (dense defaults)

Use `bun run handoff:budget --template` for a full skeleton. Per-section intent:

| Section | Shape | Diet tip |
|---------|-------|----------|
| One-line resume | `> …` one line | Cap 120 — product · gate · next |
| Current loop | small table | Axis + authority path only |
| Current action | Goal · Authority · steps · Done · Must not | **Pinned** — keep sharp, never omit |
| Active checks | table of open/done checks | Close done rows to archive |
| Owner pending | decision · default · evidence | One row per decision |
| Blockers | `(none)` or condition | Empty body fails lint |
| Invariants | bullet prohibitions | Lines, not essays |
| Evidence | paths/SHAs in backticks | Must exist under docs/tasks/scripts |
| Don't redo | bullet never-again | Highest dropOrder — keep short |

**Pinned inject parts:** sentinel · status · Current action · traps.  
Under HARD_CAP, drop order prefers Don't redo → Evidence → Invariants first — **fix by dieting HANDOFF**, not by deleting axes permanently.

---

## Must not

- Permanent nine-axis slim-delete from inject model
- Second status table schema
- Silent mid-section char-cut for state (whole-section omit only as safety net)
- Owner brief = inject dump
- Treat bare status as wave trigger
- product/herdr scope under this guide

---

## Related commands

| Script | Role |
|--------|------|
| `bun run status` | Owner dashboard view |
| `bun run handoff:budget` | Author per-section budget (this guide) |
| `bun run handoff:lint` | Structure + D1 + One-line |
| `bun run session-context:lint` | Inject omit + STATE_TARGET warn |
| `bun run handoff:check` | lint + session-context:lint (ship gate) |
