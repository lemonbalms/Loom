# Loom Grok workflows

Project workflows for [Grok Build](https://x.ai/cli) multi-agent orchestration (`.rhai` scripts).

These **do not** replace:

- herdr pane dogfood lanes (`docs/DOGFOOD_LOOP.md`)
- formal Fable R{n} when `docs/WORKFLOW.md` §5.1 requires it
- architect hand-coding bans for locked product specs

They **do** automate read-heavy audit / verify / evidence assembly that this repo repeatedly did by hand.

---

## Catalog

| Name | File | Purpose | Typical agents |
|------|------|---------|----------------|
| `docs-asbuilt-audit` | `docs-asbuilt-audit.rhai` | Doc pin/drift audit | ~12–15 |
| `handoff-path-equivalence` | `handoff-path-equivalence.rhai` | SessionStart vs no-hook gaps (Phase D) | ~4–5 |
| `gate-adversarial-verify` | `gate-adversarial-verify.rhai` | Dimensional review + skeptic panel | ~8–20 |
| `preflight-dont-redo` | `preflight-dont-redo.rhai` | traps / don't-redo / lessons match | ~5 |
| `ship-evidence-pack` | `ship-evidence-pack.rhai` | Ship readiness evidence pack | ~10–15 |

---

## How to run (Grok TUI)

From repo root (`fable-advisor` / Loom):

### By slash name (after workflows are discovered)

```text
/docs-asbuilt-audit
/handoff-path-equivalence
/gate-adversarial-verify
/preflight-dont-redo
/ship-evidence-pack
```

### With args

```text
/workflow docs-asbuilt-audit {"pin":"0.28.1"}

/workflow handoff-path-equivalence {"mode":"preflight"}
/workflow handoff-path-equivalence {"mode":"postcheck"}

/workflow gate-adversarial-verify {"target":"HEAD~20..HEAD"}

/workflow preflight-dont-redo {"intent":"Phase D handoff lint automation","paths":["scripts/session-context.ts","HANDOFF.md"]}

/workflow ship-evidence-pack {"pin":"0.28.1","include_dogfood_herdr":false}
```

### Dashboard

- `/workflows` — live and retained **runs** (not the definition catalog)
- Watch phase rail: Scan/Review/… as defined in each script
- Scratch reports appear as run artifacts (`scratch/*.md` ids in the result)

### Resume

- Ordinary pause: `/workflow resume <display-name>` (name from `/workflows`)
- Budget-limited resume needs raised `agent_budget` via the workflow tool (not bare slash resume)

---

## Per-workflow usage

### 1. `docs-asbuilt-audit`

**When:** after a product or docs wave; weekly hygiene.

**Args**

| Key | Default | Meaning |
|-----|---------|---------|
| `pin` | `0.28.1` | Product version pin to enforce |

**Output:** `findings[]`, scratch `docs-asbuilt-audit.md`

**Next step:** open High items → edit docs (or dispatch a docs PATCH). No code required.

---

### 2. `handoff-path-equivalence`

**When:** before implementing Phase D; after Phase D lands.

**Args**

| Key | Default | Meaning |
|-----|---------|---------|
| `mode` | `preflight` | `preflight` or `postcheck` (label only; same analysis) |

**Output:** gap list + `handoff-path-equivalence.md`; treat `equivalence` carefully (`no_scanner_findings` ≠ proven equal).

**Next step:** feed gaps into Phase D implementation spec.

---

### 3. `gate-adversarial-verify`

**When:** after non-trivial commits on `main` or a feature branch.

**Args**

| Key | Default | Meaning |
|-----|---------|---------|
| `target` | `HEAD~15..HEAD` | Git range or ref expression for reviewers |

**Output:** `confirmed[]` only (skeptics must supply evidence)

**Caution:** Not formal R{n}. If PLAN is `pending-review` for MINOR/security, still run `fable-advisor` per WORKFLOW.

---

### 4. `preflight-dont-redo`

**When:** start of any wave / board claim.

**Args**

| Key | Required | Meaning |
|-----|----------|---------|
| `intent` | **yes** | One-line work description |
| `paths` | no | Optional path list JSON array |

**Output:** short implementer brief + hits

**Next step:** load matched `tasks/lessons/<category>.md` before coding.

---

### 5. `ship-evidence-pack`

**When:** before commit/push of a completed gate.

**Args**

| Key | Default | Meaning |
|-----|---------|---------|
| `pin` | `0.28.1` | Version pin |
| `include_dogfood_herdr` | `false` | Set `true` only if herdr 0.7.5 is up |

**Output:** overall READY/NOT_READY-ish summary + `ship-evidence-pack.md`

**Commands phase** uses `execute` capability (status/lint/version). Full `bun test` may be skipped — run it yourself for release-critical ships.

---

## Authoring notes

- Scripts live under **project** `.grok/workflows/` (shareable with the repo).
- Dialect: pure-literal `meta`, JSON Schema keys quote `"type"`, guard `args` and agent results, prefer `+=` for long prompts.
- Smoke validation: in Grok, run with `validate_only` via the workflow tool when iterating; canned host success does not prove live tool quality.
- Prefer raising `agent_budget` only if a panel is large (`gate-adversarial-verify` with many findings).

---

## Suggested order for this repo right now

1. `handoff-path-equivalence` `mode=preflight` → Phase D  
2. `preflight-dont-redo` with Phase D intent  
3. implement Phase D (outside workflow / proper lanes)  
4. `handoff-path-equivalence` `mode=postcheck`  
5. `ship-evidence-pack` before push  
6. `docs-asbuilt-audit` if docs moved  
7. `gate-adversarial-verify` on the ship range  

---

## Related docs

- `docs/DOC-REFRESH-PLAN.md` — docs wave  
- `docs/spikes/HANDOFF-CHECKPOINT-DESIGN.md` — Phase D  
- `docs/PROBLEM_CONSCIOUSNESS.md` — why false success / archive≠map  
- `docs/DOGFOOD_LOOP.md` — real impl/verify lanes  
