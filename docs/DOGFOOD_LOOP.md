# Loom dogfood loop — Grok implement · Claude/Codex review

| Field | Value |
|-------|--------|
| **Document** | `docs/DOGFOOD_LOOP.md` |
| **Purpose** | Multi-agent development using **product Loom** (rooms, handoff, board) |
| **Implementer** | **Grok** (`loom run grok` / this repo’s coding lane) |
| **Reviewers** | **Claude Code** (primary R{n}) · **Codex** (adversarial / security) |
| **Related** | [`WORKFLOW.md`](./WORKFLOW.md) §5 · [`plan_review.md`](./plan_review.md) · [`PRIORITIES.md`](./PRIORITIES.md) |

---

## 0. Naming (do not confuse)

| Name | Role |
|------|------|
| **Loom** | Product CLI / MCP (`loom`, `@loom/*`) |
| **Fable 5 / fable-advisor** | Review judgment model / agent — **not** the product |
| **`/advisor fable`** | Claude Code **advisor** consult pinned to **Fable** model |

---

## 1. Room & profiles (fixed)

| Profile (`--profile`) | Display name | Agent | Role |
|----------------------|--------------|-------|------|
| `impl` | `grok-impl` | Grok | implement |
| `claude-rev` | `claude-review` | Claude Code | **primary** plan_review R{n} |
| `codex-rev` | `codex-review` | Codex | secondary / adversarial |

### One-shot setup (preferred)

```bash
cd /path/to/Loom   # or fable-advisor local path
bun run dogfood:room          # create + join all three profiles
# bun run dogfood:room -- --fresh   # force new invite

bun run dogfood:status        # invite + peers for impl / claude-rev / codex-rev
```

State (gitignored): `.loom/dogfood-room.env`, `.loom/dogfood-next-session.txt`

### Daily (after setup)

```bash
# A — implementer (sticky recommended)
bun run loom --profile impl host start
bun run loom --profile impl run grok

# B — Claude primary reviewer
bun run loom --profile claude-rev run claude   # 0.13.14+ for resize; R{n} → /advisor fable

# C — Codex second opinion
bun run loom --profile codex-rev run codex
```

---

## 2. Claude Code — **must** use `/advisor fable` for reviews

When Claude (profile `claude-rev` or any Claude session) receives a Loom **review request**
(`[R-REQUEST]`, “Fable 리뷰”, “R{n}”, plan pending-review handoff):

### Mandatory sequence

1. **Do not implement.** Read-only except `docs/plan_review.md` (and Open/header sync).
2. Run **`/advisor fable`** (Claude Code advisor UI / skill with model **Fable**).  
   Equivalent: spawn the **`fable-advisor`** subagent (`model: fable`, read-only).
3. Pass the advisor:
   - decision = approve vs pending-revision for **PLAN vX.Y.Z**
   - constraints = WORKFLOW §5, security boundaries, stated non-goals
   - options = any design alternatives in PLAN/UNKNOWNS
4. **Act on the verdict** — write `docs/plan_review.md` **Review R{n}** (WORKFLOW §5.2 format).
5. Handoff result back to `@grok-impl` with `[R-RESULT]`.

### Forbidden for Claude-on-review

- Writing product code / “quick fixes” in packages/
- Rubber-stamp `approved` without `/advisor fable` (or fable-advisor) consult
- Confusing **Loom MCP tools** with plan approval

### Claude session system note (paste into first message or CLAUDE.md)

```text
You are claude-review on the Loom dogfood room. When you get [R-REQUEST] or
"Fable 리뷰" / R{n}:
1) Invoke /advisor fable (or Task subagent fable-advisor) BEFORE writing plan_review.
2) Write docs/plan_review.md Review R{n} from the advisor verdict + your code read.
3) Handoff [R-RESULT] to @grok-impl. Never implement.
```

Plugin: `fable-advisor` installed (`claude plugin install fable-advisor`).  
Agent file: `agents/fable-advisor.md` (`model: fable`).

---

## 3. Codex — secondary review

- Focus: security, races, fail-open, auth, data loss.
- May add High/Med findings; does **not** alone close R{n} without Claude primary body
  (unless Owner says otherwise).
- No `/advisor fable` (Claude-only). Codex uses its own adversarial pass.

---

## 4. Grok — implementer handoff templates

### 4.1 Review request → Claude (requires /advisor fable)

```text
[R-REQUEST] PLAN vX.Y.Z pending-review
Scope: <one sentence>
Read: docs/PLAN.md, docs/plan_review.md, <paths>
YOU MUST: run /advisor fable (or fable-advisor agent) first, then write
docs/plan_review.md Review R{n} (WORKFLOW §5.2).
Verdict: approved | pending-revision | on-hold
Do not implement. Reply with [R-RESULT] handoff.
```

CLI:

```bash
bun run loom --profile impl handoff @claude-review "$(cat <<'EOF'
[R-REQUEST] PLAN v0.14.0 pending-review
Scope: durable inbox P2
Read: docs/PLAN.md, packages/relay/**
YOU MUST: /advisor fable first, then plan_review.md R15.
Do not implement.
EOF
)"
```

### 4.2 Same request → Codex (no advisor slash)

```text
[R-REQUEST] PLAN vX.Y.Z — adversarial / security pass
Scope: …
Focus: auth, persistence, fail-open, races
Report High/Med only with file:line. Do not implement.
```

### 4.3 Result → Grok

```text
[R-RESULT] R15 pending-revision
Blocking: M-xx …
Non-blocking: L-xx …
Next: fix M-xx only; re-request R15b
Advisor: /advisor fable consulted (yes/no)
```

### 4.4 Verify

```text
[VERIFY] SHA <short> · bun test · smoke:uc · smoke:desktop green
```

---

## 5. Gate rules (unchanged product process)

| Gate | Who |
|------|-----|
| PLAN draft / implement | Grok |
| R{n} primary + `/advisor fable` | Claude Code |
| R{n} security second pass | Codex |
| Owner go/no-go | Human |

MINOR / security / protocol → R{n} **required** (WORKFLOW §5.1).  
P2 durable inbox = MINOR → R{n} required.

---

## 6. Session start (all peers)

```bash
bun run status
bun run loom --profile <me> peers
bun run loom --profile <me> inbox
bun run loom --profile <me> board
```

Then: Grok → HANDOFF/PLAN; Claude/Codex → process inbox R-REQUEST only.

### 6.1 Codex MCP + sticky host (common failure)

| Symptom | Cause | Fix |
|---------|--------|-----|
| Codex has no Loom tools | Global `~/.codex/config.toml` still has legacy `mcp_servers.fable` → `/tmp/fake-stdio.ts`, or never wrote `loom` | Remove fable; `bun run loom --profile codex-rev run codex -- --write-user-config` **or** managed block with `mcp_servers.loom` + `LOOM_SESSION=…/codex-rev.json` |
| Project `.loom/codex.mcp.toml` exists but Codex ignores it | Codex does **not** auto-load project snippet; needs **user** config (opt-in) | `--write-user-config` (R3 M-3) |
| `loom --profile X inbox` shows wrong peer / empty while work was sent | Inside `loom run`, `LOOM_SESSION` used to beat `--profile` | **0.13.15+**: explicit `--profile` wins. Older: `env -u LOOM_SESSION loom --profile X inbox` |
| peer offline / no sticky | Only impl host started | `bun run loom --profile claude-rev host start` and same for `codex-rev` |

Claude uses `--mcp-config` (always project path) so it does not need `~/.codex` style write.

Handoffs are **pull**: Claude/Codex must `check_handoffs` / `claim_handoff` (or human paste). They do not appear as native IDE tasks.

---

## 7. Board columns (suggested)

| Status | Meaning |
|--------|---------|
| todo | Planned |
| doing | Grok implementing or drafting PLAN |
| blocked | Waiting R{n} / Open Med |
| done | Verified + shipped |

---

*Loom = product. Fable 5 / `/advisor fable` = review judgment. Keep them separate in docs and handoffs.*
