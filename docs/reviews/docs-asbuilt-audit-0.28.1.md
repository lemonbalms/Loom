# Docs as-built audit

**Pin:** `0.28.1`  
**Date:** 2026-07-22  
**Mode:** read-only (workflow host tool unavailable — equivalent scan executed in-session)  
**Sources:** `docs/USER_GUIDE.md` · `ARCHITECTURE.md` · `ADAPTERS.md` · `PROTOCOL.md` · `HERDR_DESIGN.md` · `TEST_PLAN.md` · `CHANGELOG.md` · `PRIORITIES.md` · `GLOSSARY.md` · `index.md` · `README.md` · cross-check `docs/PLAN.md` + CLI  

---

## Summary

Product pin **0.28.1** is consistent across PLAN (`approved`), CHANGELOG top section, CLI (`loom v0.28.1`), and most product-facing headers after the docs refresh wave.

**Residual drift is small but real:** one hard version-footer contradiction in `TEST_PLAN`, one live priority row still calling the docs wave “in progress,” and a few hygiene gaps (README pin field, index HEAD placeholder, historical execution log banner, HERDR body that still reads operational if the as-built banner is skipped).

| Severity | Count | Verdict |
|----------|------:|---------|
| High | 1 | Fix before treating TEST_PLAN as current gate evidence |
| Medium | 2 | Next docs PATCH hygiene |
| Low | 4 | Optional / ship-with-next-docs |
| Clean surfaces | 7 | USER · ARCH · ADAPTERS · PROTOCOL · CHANGELOG · GLOSSARY · (HERDR banner OK) |

**Forbidden residuals:** no live `fable --` CLI surface; no dual-`agent.send` presented as the current submit path (contrast / obsolete / history only). Completion-authority language (`card.done` ≠ board done) is present in USER · ARCH · CHANGELOG · GLOSSARY · TEST UC-15/17.

**Cross-check:** PLAN **Version 0.28.1** / **Status `approved`** · CHANGELOG **## 0.28.1** · `bun run loom --version` → **Loom v0.28.1** — **pin agrees.**

---

## High

### 1. `docs/TEST_PLAN.md` — footer product pin still **0.13.12**

| | |
|--|--|
| **Issue** | Document footer contradicts header pin and UC-15–18 |
| **Evidence** | Header: `제품 기준 \| CLI **v0.28.1**`. Footer (end of file): `*기준 버전: 제품 **0.13.12**. …*` |
| **Why high** | Workflow criterion #1: “Header/version pin older than pin.” Footer is a second pin that readers and agents treat as SSOT. UC-15–18 claim 0.28 while the closing stamp says 0.13.12. |

**Edit:** change footer to `*기준 버전: 제품 **0.28.1** …*` (and keep execution-log SHAs as historical).

---

## Medium

### 2. `docs/PRIORITIES.md` — P0b still “in progress” after docs wave executed

| | |
|--|--|
| **Issue** | Live next-action table presents docs as-built as current work |
| **Evidence** | P0b status: `**in progress / ship with wave**`. `docs/DOC-REFRESH-PLAN.md` Status: `**executed** (docs-only wave, 2026-07-22)`. `HANDOFF.md`: “docs as-built 0.28 wave landed”. §1 “문서” row still only says “0.28 as-built 정렬 웨이브” without “executed”. |
| **Why medium** | PRIORITIES is the one-page “what next” map. Leaving P0b open pulls sessions back into closed docs work and competes with Phase D (P0). |

**Edit:** set P0b → `done / executed 2026-07-22` (link DOC-REFRESH-PLAN); drop or demote from “지금 할 일”; keep Phase D as sole P0.

### 3. `docs/TEST_PLAN.md` — “실행 기록 (실제)” looks like live gate evidence

| | |
|--|--|
| **Issue** | Historical run log without banner; first builds are 0.13.x |
| **Evidence** | `## 실행 기록 (실제)` then `Build \| dee900a · loom v0.13.3` (2026-07-10), later 0.13.5 / 0.14.2 / 0.17.1 — no “historical snapshot / not current release gate” line under the heading. Compare `docs/DOGFOOD_FEATURES.md` which has an explicit ⚠ Historical banner. |
| **Why medium** | Criterion #5: historical snapshots that look like live SSOT without a banner. Header pin is correct; the log section still fails the honesty test. |

**Edit:** add a one-line banner under `## 실행 기록 (실제)`: historical only; current pin/UCs above; new runs append with version/SHA.

---

## Low

### 4. `README.md` — no explicit product pin field

| | |
|--|--|
| **Issue** | Header table links Changelog (0.22–0.28.1) and USER_GUIDE (v0.28.1) but has no `**Version** \| v0.28.1` row |
| **Evidence** | Quick-start table lines for CLI / Plan / Changelog / User guide — no pin cell. |
| **Edit (optional)** | Add `| **Version** | CLI **v0.28.1** (\`loom --version\` / PLAN) |` |

### 5. `index.md` — HEAD still a placeholder instruction

| | |
|--|--|
| **Issue** | Index meta does not pin a commit |
| **Evidence** | `기준 커밋(HEAD) \| 갱신 시점 working tree — ship 후 git rev-parse …로 맞출 것`. Audit HEAD was `728bde6` (workflows chore); product ship cite remains `6e2df8a`. |
| **Edit (optional)** | Pin short SHA at last docs/product ship; or mark “not version authority — use PLAN + loom --version”. |

### 6. `docs/HERDR_DESIGN.md` — body still operational p16 prose after banner

| | |
|--|--|
| **Issue** | As-built banner + obsolete table are correct; long body still reads as implementable p16 design and ends with “Next session: PLAN 0.22.0 pending-review” |
| **Evidence** | Banner L16–36 present; body still has `agent.send` call graphs, v0.7.4 tables, §6 UNKNOWNS draft with Next session 0.22.0. |
| **Verdict** | **Not a high defect** (banner + obsolete table satisfy A3 DoD). Residual risk if an agent implements from mid-file. |
| **Edit (optional)** | One-line “baseline archive from here” before §0; or strikethrough Next-session block as **historical**. |

### 7. Dual package versioning (cross-note)

| | |
|--|--|
| **Issue** | Root/`@loom/*` package.json often **0.1.0** while CLI/PLAN are **0.28.1** |
| **Evidence** | `package.json` → `0.1.0`; `loom --version` → `v0.28.1`. DOC-REFRESH C3 already documents the dual. |
| **Edit** | No product-doc change required if README/ARCH already point at PLAN/CLI; optional one-line in README under Version. |

---

## Clean (no findings after read)

| File | Pin / notes |
|------|-------------|
| `docs/USER_GUIDE.md` | v0.28.1 · §12.8 / §13 completion · §14 herdr 0.7.5 · COMPAT + PANE-DEATH links |
| `docs/ARCHITECTURE.md` | as-built 0.28.1 · completion authority · p17 call shape · spikes linked |
| `docs/ADAPTERS.md` | 0.28.1 · COMPAT link · dual-send **removed** on p17 · card worker not auto board done |
| `docs/PROTOCOL.md` | Relay wire **v1** only (correct axis) · herdr → COMPAT · Loom rename residual only historical |
| `docs/CHANGELOG.md` | Top **0.28.1** · p17 habits · 0.28.0 authority · COMPAT/PANE links |
| `docs/GLOSSARY.md` | pin v0.28.1 · agent.prompt / send_keys / completion authority |
| `docs/HERDR_DESIGN.md` (banner) | Status + as-built pin 0.28.1 + obsolete table — **pass for criterion #4/#5 at top** |

---

## Recommended next edits

1. **PATCH (docs-only, ~5 min)**  
   - `TEST_PLAN.md` footer → **0.28.1**  
   - `TEST_PLAN.md` “실행 기록 (실제)” → historical banner  
   - `PRIORITIES.md` P0b → **done/executed**; §1 문서 row → executed  

2. **Optional hygiene**  
   - README Version row  
   - `index.md` HEAD pin or “not authority” note  
   - HERDR_DESIGN mid-body “baseline archive” marker  

3. **Do not open** product/code wave for these; Phase D remains HANDOFF P0.

4. **Re-run** `/docs-asbuilt-audit` (or this report path) after the PATCH; expect High=0.

---

## Findings JSON (machine)

```json
{
  "pin": "0.28.1",
  "finding_count": 7,
  "findings": [
    {
      "file": "docs/TEST_PLAN.md",
      "issue": "Footer product pin still 0.13.12 while header and UC-15–18 claim 0.28.1",
      "severity": "high",
      "evidence": "Line ~788: *기준 버전: 제품 **0.13.12*** vs header 제품 기준 v0.28.1"
    },
    {
      "file": "docs/PRIORITIES.md",
      "issue": "P0b Docs as-built still 'in progress / ship with wave' after DOC-REFRESH executed and HANDOFF landed",
      "severity": "medium",
      "evidence": "P0b status vs DOC-REFRESH-PLAN Status=executed (2026-07-22)"
    },
    {
      "file": "docs/TEST_PLAN.md",
      "issue": "실행 기록 (실제) section has 0.13.x builds without historical-snapshot banner",
      "severity": "medium",
      "evidence": "Build dee900a · loom v0.13.3 under ## 실행 기록 (실제); no ⚠ Historical line"
    },
    {
      "file": "README.md",
      "issue": "No explicit product version pin field in header table",
      "severity": "low",
      "evidence": "Links Changelog 0.22–0.28.1 and USER_GUIDE v0.28.1 but no Version row"
    },
    {
      "file": "index.md",
      "issue": "HEAD meta is a placeholder instruction, not a pin",
      "severity": "low",
      "evidence": "기준 커밋(HEAD) | 갱신 시점 working tree — ship 후 …"
    },
    {
      "file": "docs/HERDR_DESIGN.md",
      "issue": "Body still operational p16 prose and Next-session 0.22.0 if reader skips as-built banner",
      "severity": "low",
      "evidence": "Banner L16–36 OK; body agent.send graphs + §6 Next session PLAN 0.22.0"
    },
    {
      "file": "package.json (cross)",
      "issue": "package 0.1.0 vs CLI/PLAN 0.28.1 dual versioning (documented C3; optional README note)",
      "severity": "low",
      "evidence": "package.json 0.1.0; loom --version v0.28.1"
    }
  ]
}
```
