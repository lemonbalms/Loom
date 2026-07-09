# Rename Plan — Product **Fable** → **Loom**

| Field | Value |
|-------|--------|
| **Document** | `docs/RENAME_TO_LOOM.md` |
| **Status** | **`implemented`** — code in tree as PLAN **0.9.0** (`pending-review` / R11) |
| **Target PLAN version** | **0.9.0** (MINOR: product identity / public surface rename) |
| **Depends on** | PLAN **0.8.1** `approved` (M-7 + R10 M-13/L-15). Separate wave — do not mix with feature work. |
| **Last updated** | 2026-07-09 |
| **Review** | `docs/rename_to_loom_review.md` **RN1** (보류 → 본 문서 패치로 해소 대상) |
| **Related** | `docs/PLAN.md`, `docs/ARCHITECTURE.md`, `docs/PROTOCOL.md`, `HANDOFF.md` |

---

## 0. RN1 changelog (plan patch)

RN1 필수 수정 반영 (2026-07-09):

1. **§4.2** live-process gate (sticky/relay PID) + EXDEV copy excludes `.lock`/`.tmp.*`
2. **§3.4 / §3.8** blast: `/fable` slash, `[FABLE HANDOFF]`, `fableSystemHint` body + compat defaults
3. **§4.5** Loom strip = exact anchors only; `hadLegacy` dual detect
4. **§4.3** case-only normalize; **prefix rewrite forbidden**
5. **§4.1** `*_RELAY_INSECURE_OPEN` **no dual-read** (H-5)
6. Absolute `*_SESSION` path not auto-migrated; project `.fable/` orphan leave policy restated

---

## 1. Why

### 1.1 Problem

| Name in use | What it is | Collision |
|-------------|------------|-----------|
| **fable-advisor** | 이 세션의 리뷰/어드바이저 에이전트·워크스페이스 경로 | 제품과 동일 어휘 |
| **Fable 5** | 리뷰 담당 모델명 (plan_review 사인오프) | 제품 “Fable”과 혼동 |
| **Fable / `fable` / `@fable/*`** | **제품** (멀티플레이어 AI terminal) | 위 둘과 겹침 |

### 1.2 Decision

**제품 공식 이름: Loom**

| 후보 | 판정 | 이유 |
|------|------|------|
| **Loom** | **채택** | Room + handoff 은유; 짧은 CLI (`loom room create`) |
| Ensemble / Muster | 보류 | 길이·뉘앙스 |
| Handoff | 기각 | 기능명과 제품명 충돌 |

### 1.3 Explicit non-goals

| Keep as-is | Reason |
|------------|--------|
| 리뷰 에이전트 **fable-advisor** / **Fable 5** | 메타 도구 |
| 워크스페이스 경로 `…/fable-advisor` (1차) | Phase E optional |
| Mosaic-class 표현 | 외부 레퍼런스 |

> **Loom** = product. **Fable 5 / fable-advisor** = review agent. Never call the product “Fable” after 0.9.0.

---

## 2. Product identity (post-rename)

| Surface | Before | After |
|---------|--------|--------|
| Product title | Fable | **Loom** — Multiplayer AI Terminal (Mosaic-class) |
| CLI | `fable` | **`loom`** (+ `fable` alias 1 minor) |
| npm scope | `@fable/*` | **`@loom/*`** |
| Root package name | `fable-advisor` | **`loom`** |
| Home dir | `~/.fable/` | **`~/.loom/`** |
| Env prefix | `FABLE_*` | **`LOOM_*`** (see §4.1 exceptions) |
| MCP server id | `fable` | **`loom`** |
| MCP bin | `fable-mcp` | **`loom-mcp`** |
| Invite code | `FABLE-7K2M` | **`LOOM-7K2M`** (mint); join accepts both |
| Board snapshot | `fable-board-snapshot` | **`loom-board-snapshot`** (import both) |
| Slash | `/fable …` | **`/loom …`** (+ `/fable` dual-accept) |
| Handoff banner | `[FABLE HANDOFF from …]` | **`[LOOM HANDOFF from …]`** (hard cut display) |
| Types | `FableSession`, … | **`LoomSession`**, … |

---

## 3. Inventory (blast radius)

### 3.1 Package / import graph

| Package | Today | Target |
|---------|-------|--------|
| `@fable/protocol` | envelopes, codes, sanitize | `@loom/protocol` |
| `@fable/relay` | Room, RelayServer | `@loom/relay` |
| `@fable/host` | session, sticky, pack, board | `@loom/host` |
| `@fable/adapters` | claude/codex/grok writers | `@loom/adapters` |
| `@fable/mcp-server` | MCP tools + stdio | `@loom/mcp-server` |
| `@fable/cli` | bin `fable` | `@loom/cli` bin **`loom`** |

### 3.2 Environment variables

| Old | New | Dual-read? |
|-----|-----|------------|
| `FABLE_SESSION` | `LOOM_SESSION` | Yes + deprecation warn |
| `FABLE_PROFILE` | `LOOM_PROFILE` | Yes |
| `FABLE_RELAY_URL` | `LOOM_RELAY_URL` | Yes |
| `FABLE_RELAY_TOKEN` | `LOOM_RELAY_TOKEN` | Yes |
| `FABLE_RELAY_HOST` | `LOOM_RELAY_HOST` | Yes |
| `FABLE_RELAY_PORT` | `LOOM_RELAY_PORT` | Yes |
| **`FABLE_RELAY_INSECURE_OPEN`** | **`LOOM_RELAY_INSECURE_OPEN`** | **No** — see §4.1 |
| `FABLE_RELAY_TOKEN_IN_QUERY` | `LOOM_RELAY_TOKEN_IN_QUERY` | Yes (legacy; still discouraged) |
| `FABLE_NAME` / `AGENT` / `ACTIVE` / `MCP_CONFIG` / `SHELL` | `LOOM_*` | Yes |

### 3.3 On-disk paths

| Old | New |
|-----|-----|
| `~/.fable/session.json` | `~/.loom/session.json` |
| `~/.fable/profiles/<name>.json` | `~/.loom/profiles/<name>.json` |
| `~/.fable/*.host.json` | `~/.loom/*.host.json` |
| `~/.fable/packs/`, `boards/`, `mcp.json`, `relay.pid` | under `~/.loom/` |
| project `.fable/` | **`.loom/`** (write new; do not auto-delete old) |

### 3.4 Wire / schema / user-facing strings (compat-sensitive)

| Kind | Old | New | Compat |
|------|-----|-----|--------|
| Invite prefix | `FABLE-` | `LOOM-` | Join accepts **exact full code** either prefix; mint only `LOOM-`. **Never rewrite** `FABLE-X`→`LOOM-X` (§4.3) |
| Board kind/label | `fable-board-snapshot` | `loom-board-snapshot` | Import accepts both |
| MCP table | `mcp_servers.fable` | `mcp_servers.loom` | Strip both on upsert |
| Managed TOML markers | `Fable multiplayer` | `Loom multiplayer` | Strip both; Loom side = **exact phrase only** (§4.5) |
| MCP `serverInfo.name` | `fable` | `loom` | — |
| CLI banner | `fable v…` | `loom v…` | — |
| **Slash commands** | `/fable peers` 등 (`slash.ts`) | `/loom …` | **`/fable` dual-accept** 1 minor (CLI alias 대칭) |
| **Handoff inject banner** | `[FABLE HANDOFF from …]` (`format.ts`) | `[LOOM HANDOFF from …]` | **Hard cut** display (not wire schema); tests update |
| **System hint body** | “Fable multiplayer room…” (`hints.ts`) | “Loom multiplayer room…” + `loom` CLI refs | Full rewrite with symbol `loomSystemHint` |

### 3.5 TypeScript symbols

- `FableSession` → `LoomSession`
- `ensureFableDir` / `fableDir` → `ensureLoomDir` / `loomDir`
- `buildFableMcpTomlBlock` / `stripAllFableMcpSections` → Loom names (impl still strips **legacy fable** tables + markers)
- `fableSystemHint` → `loomSystemHint` (**body copy** included, not just rename)
- Test tmp prefixes `fable-*` → `loom-*`

### 3.6 Docs / product copy

| File | Action |
|------|--------|
| `docs/PLAN.md` | Title Loom; changelog 0.9.0 |
| `docs/PROTOCOL.md` | Invite / ownership examples |
| `docs/ARCHITECTURE.md` | `@loom/*` |
| `docs/ADAPTERS.md` | MCP/env |
| `docs/plan_review.md` | Product Loom; Reviewer Fable 5 = agent |
| `docs/plan_review_archive.md` | Minimal (banner only) |
| `apps/relay-cloud/README.md` | Full rewrite |
| `README.md`, `HANDOFF.md` | Identity |
| `docs/spikes/*` | Light touch |

### 3.7 Root scripts

```jsonc
{
  "name": "loom",
  "scripts": {
    "loom": "bun run packages/cli/src/index.ts",
    "fable": "bun run packages/cli/src/index.ts"  // alias 1 minor
  }
}
```

### 3.8 User-facing command surfaces (RN1)

| Surface | Files | Decision |
|---------|-------|----------|
| Slash `/fable` | `host/src/slash.ts`, `slash.test.ts`, CLI listen | Primary `/loom`; accept `/fable` until 0.10 |
| Handoff banner | `protocol/src/format.ts`, inject/pty tests | New string only; update tests |
| Agent system hint | `adapters/src/hints.ts` + consumers | Full Loom wording |

---

## 4. Compatibility & migration strategy

### 4.1 Env resolution (read path)

**Normal vars** (`SESSION`, `PROFILE`, `RELAY_URL`, `RELAY_TOKEN`, …):

```
LOOM_* if set → use
else FABLE_* if set → use (deprecated; one stderr warn per process)
else default
```

Write path / docs: only `LOOM_*`.

#### Security exception — `*_RELAY_INSECURE_OPEN` (RN1 / H-5)

| Rule | Detail |
|------|--------|
| **No dual-read** of `FABLE_RELAY_INSECURE_OPEN` | Legacy env must **not** silently keep the relay open after rename |
| Accept only | `LOOM_RELAY_INSECURE_OPEN=1|true` **or** CLI `--insecure-open` |
| If only old env is set | **Ignore for auth bypass**; print strong stderr: set `LOOM_RELAY_INSECURE_OPEN` or `--insecure-open` explicitly |
| Rationale | Dual-read would re-introduce fail-open via forgotten shell env (opposes H-5) |

### 4.2 Home directory migration (**live-process gate — RN1 High**)

On first `loadSession` / `ensureLoomDir` after upgrade:

#### Algorithm

1. If `~/.loom` exists → use it (no further migrate).
2. Else if `~/.fable` does **not** exist → create `~/.loom`.
3. Else (`~/.fable` exists, no `~/.loom`) → **migrate only if safe**:

**Before any rename/copy — live process check:**

- Scan `~/.fable/**/*.host.json` and `~/.fable/relay.pid` (if present).
- Parse PID(s); use existing `isPidAlive` (`sticky-meta.ts` / `atomic-json.ts`).
- **If any PID is alive:**
  - **Do not** rename or copy.
  - Use `~/.fable` as state dir for this process **read/write** (legacy path) **or** fail with clear message (prefer: **abort migrate**, continue with `~/.fable` until next launch when hosts are down — document both; **default = refuse rename, keep using `~/.fable` this run, print once:**  
    `loom: stop sticky host / relay (pids …) then re-run to migrate ~/.fable → ~/.loom`).
  - Never leave half-migrated tree.
- **If no live PIDs:**
  - Prefer `renameSync("~/.fable", "~/.loom")`.
  - On EXDEV / rename failure: **copy** then remove old only if copy verified.
    - Copy **must exclude** `**/*.lock`, `**/.tmp.*`, `**/*.tmp.*`, and empty lock dirs.
    - Do not copy torn temp files into `~/.loom`.

#### Absolute session env

- If `LOOM_SESSION` or `FABLE_SESSION` is an **absolute path**, that path is SSOT for session file.
- **Do not** move/rewrite that file as part of home-dir migrate.
- Packs/boards still use home dir helper (may still migrate when safe).

#### Dual-write

- **Never** silently dual-write forever.
- After successful migrate, only `~/.loom`.

### 4.3 Invite codes

- **Mint:** `LOOM-` + body only (`generateInviteCode`).
- **Lookup:** `registry.getByCode(code)` — **full string**, `toUpperCase()` only (existing behavior).
- **Dual-accept:** rooms minted as `FABLE-…` keep that exact code; join with the **same full code** works. Rooms minted as `LOOM-…` likewise.
- **Forbidden:** rewriting prefix (`FABLE-7K2M` → `LOOM-7K2M`) for lookup or storage. That could collide two distinct rooms.
- “Normalize case” = **ASCII case fold of the entire code only**, never prefix substitution.
- Display in `room.state`: leave **minted** code as-is (old rooms show `FABLE-…` until recreate).

### 4.4 Board snapshots

- Export/new: `kind` + `label` = `loom-board-snapshot`.
- Import / handoff extract: accept `fable-board-snapshot` **or** `loom-board-snapshot`.

### 4.5 MCP user config (RN1 exact-anchor rules)

- Upsert writes **`mcp_servers.loom`** only; markers: `# --- Loom multiplayer (managed) BEGIN/END ---`.
- `stripAllLoomMcpSections` removes:

| Target | Match rule |
|--------|------------|
| Loom managed block | Exact BEGIN/END marker strings |
| Fable managed block | Exact legacy `Fable multiplayer` markers |
| Tables | `^\s*\[mcp_servers\.(fable|loom)(?:\.|])` only |
| Related comments | **`Fable multiplayer`**, **`Loom multiplayer`**, `legacy [mcp_servers.fable|loom]`, `WARNING: legacy` — **never** bare `/Loom/i` or `/loom/i` word match |

**Invariant:** “loom” is a common English word (`# deadline looming`). Strip heuristics must **not** use standalone `/Loom/i` the way old code used `/Fable/i` for follow-on comment lines. Prefer exact phrases + table headers only.

- `hadLegacy` / `strippedLegacy` detection must treat as legacy if **either**:
  - `[mcp_servers.fable]` or Fable markers, **or**
  - `[mcp_servers.loom]` / Loom markers (re-upsert path)
- H-4: never leave duplicate tables.

### 4.6 CLI + slash shim

- Primary bin: `loom`.
- Optional bin/script `fable` → same entry; one-line deprecation once per process.
- Slash: parse `/loom` and `/fable` (dual) until 0.10.

### 4.7 Protocol version

Envelope `v: 1` unchanged. PROTOCOL documents invite prefix dual-accept and board kind dual-accept; handoff banner is client display only.

---

## 5. Phased execution

Do **not** mix with feature work. Single MINOR **0.9.0**. Separate commits/PRs: **Phase A** then **Phase B** (RN1: R11 focuses B2 migration, B5 MCP, B3 invite).

### Phase A — Identity & packages (mechanical)

1. Root + package.json: `@loom/*`, bin `loom`, scripts.
2. Imports `@fable/` → `@loom/`.
3. `bun install` / lockfile.
4. `bun test` (expect path/env red → Phase B).

### Phase B — Runtime surface

1. Env dual-read helper (**except** `INSECURE_OPEN`).
2. Home dir + **live-process gate** + packs/boards/sticky/relay.pid.
3. Project `.loom/` for adapter MCP files.
4. Invite mint `LOOM-`; lookup unchanged (no prefix rewrite).
5. Board kind dual.
6. MCP name + dual-strip exact anchors + `hadLegacy` dual.
7. Slash `/loom` + `/fable` dual; handoff banner LOOM; `loomSystemHint` body.
8. TS renames (`LoomSession`, …).
9. CLI help/banner/VERSION **0.9.0**.

### Phase C — Docs

1. README, ARCHITECTURE, PROTOCOL, ADAPTERS, relay-cloud.
2. PLAN 0.9.0 product Loom; status `pending-review` (R11).
3. plan_review glossary; HANDOFF.
4. Archive: one-line banner only.

### Phase D — Verification

```bash
bun test
bun run loom --version   # loom v0.9.0
# migrate: no live sticky → ~/.loom
# migrate: live sticky → no rename, message, still works on ~/.fable
# join FABLE-XXXX exact code still works
# board import old kind works
# MCP strip: does not delete unrelated comments containing "loom"
# FABLE_RELAY_INSECURE_OPEN alone does not open non-loopback
```

**Automated tests to add (RN1):**

- live-process gate unit (mock pid alive → no rename)
- MCP strip: `# deadline looming` preserved; `mcp_servers.fable` removed
- invite: case fold works; no prefix rewrite helper exists
- slash accepts `/loom` and `/fable`

### Phase E — Later (not 0.9.0)

Drop dual aliases; optional folder rename; npm publish check.

---

## 6. Risks & mitigations

| Risk | Sev | Mitigation |
|------|-----|------------|
| Live host split-brain on rename | **High** | §4.2 PID gate; refuse rename if alive |
| Half-renamed monorepo | High | Phase A atomic; test gate |
| MCP TOML H-4 / loom word false strip | High | Exact anchors; dual-strip tests |
| INSECURE_OPEN silent fail-open | High | No dual-read §4.1 |
| Invite prefix rewrite collision | High | Forbidden §4.3 |
| User loses session | Med | Migrate when safe; absolute SESSION untouched |
| Old board/invite break | Med | Dual-accept |
| Agent/product name confusion | Low | Glossary |

---

## 7. Acceptance criteria (0.9.0 done)

- [ ] Workspace packages are `@loom/*` only at runtime.
- [ ] Primary CLI `loom` v0.9.0; product help not branded Fable (except deprecation).
- [ ] Default state `~/.loom`; migrate from `~/.fable` only when no live host/relay PIDs.
- [ ] Live PID → no rename; clear message; no split-brain.
- [ ] Env `LOOM_*` documented; most `FABLE_*` dual-read; **`INSECURE_OPEN` not dual-read**.
- [ ] Mint `LOOM-`; join exact `FABLE-` / `LOOM-` codes; no prefix rewrite.
- [ ] Board kind dual; MCP strip dual with exact Loom anchors; no bare `loom` comment wipe.
- [ ] `/loom` + `/fable` slash; `[LOOM HANDOFF…]` banner; Loom system hint body.
- [ ] `bun test` green including new RN1 tests.
- [ ] PLAN product name Loom; R11 requested; HANDOFF agent vs product clear.

---

## 8. PLAN.md changelog blurb (when implementing)

```markdown
#### 0.9.0 — … (`pending-review`)

**Why:** Product rename Fable → Loom (disambiguate fable-advisor / Fable 5).

| What | Why |
|------|-----|
| CLI loom, @loom/*, LOOM_*, ~/.loom | Identity |
| Dual-read FABLE_* except INSECURE_OPEN | Compat without H-5 regression |
| Home migrate with live-PID gate | No sticky split-brain |
| Invite full-code dual; no prefix rewrite | No room collision |
| MCP exact-anchor dual-strip | H-4 + no "loom" word wipe |
```

---

## 9. Implementation checklist

```
## 0.9.0 Loom rename
- [ ] A1 package.json scope + bin + lockfile
- [ ] A2 import rewrite @loom/*
- [ ] B1 env dual-read (except INSECURE_OPEN)
- [ ] B2 home migrate + live-PID gate + lock/tmp exclude
- [ ] B3 invite LOOM- mint; no prefix rewrite
- [ ] B4 board kind dual
- [ ] B5 MCP strip exact anchors + hadLegacy dual
- [ ] B6 slash /loom+/fable; LOOM HANDOFF; loomSystemHint
- [ ] B7 TS renames LoomSession…
- [ ] B8 CLI VERSION 0.9.0
- [ ] C  docs
- [ ] D  tests (RN1 cases) + smoke
- [ ] R  R11 plan review
```

**Effort:** ~1–2 eng-days (migration + MCP tests dominate).  
**Order:** A → B → D (green) → C → R11.

---

## 10. Decision log

| Decision | Default |
|----------|---------|
| Product name | **Loom** |
| Agent name fable-advisor / Fable 5 | Keep |
| Dual-read most FABLE_* | Yes until 0.10 |
| Dual-read INSECURE_OPEN | **No** |
| Migrate ~/.fable | Yes when no live PIDs |
| Live PIDs | Refuse rename; message; use legacy dir that run |
| Invite prefix rewrite | **Forbidden** |
| Slash dual `/fable` | Yes 1 minor |
| Handoff banner | Hard cut to LOOM |
| Project `.fable/` | Leave orphan; write `.loom/` |
| Root package name | `loom` |
| Workspace folder rename | Not in 0.9.0 |

---

## 11. Open questions (resolved defaults)

1. Invite display rewrite? → **No**; keep minted code.
2. Project `.fable/` delete? → **No** auto-delete.
3. Root name? → **`loom`**.
4. Korean docs? → English **Loom** in code/docs.

---

## 12. Resume prompt

> `docs/RENAME_TO_LOOM.md` (RN1-patched, pending-review) 기준으로 PLAN 0.9.0 Phase A→B 구현. 제품 Loom / 에이전트 Fable 5. B2 live-PID gate, B5 exact MCP strip, B3 no invite prefix rewrite, B1 no INSECURE dual-read 필수.

---

*RN1 plan patch applied. Implementation when owner says 진행 / status approved.*
