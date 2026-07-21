# Loom dogfood loop — Codex architect · Grok/Claude/Codex implement · Claude/Codex review

| Field | Value |
|-------|--------|
| **Document** | `docs/DOGFOOD_LOOP.md` |
| **Purpose** | Multi-agent development using **product Loom** (rooms, handoff, board) |
| **Architect** | **Codex** (`codex-arch`) — PLAN/spec · routing · independent verify; no locked-spec product coding |
| **Implementers** | **Grok** (`grok-impl`) · **Claude Code** (`claude-impl`) · **Codex** (`codex-impl`) — parallel lanes, same board/PLAN |
| **Reviewers** | **Claude Code** (primary R{n}, `claude-rev` profile) · **Codex** (adversarial / security, `codex-rev` profile) — **default; owner-configurable, see §1 roster** |
| **Related** | [`WORKFLOW.md`](./WORKFLOW.md) §5 · [`plan_review.md`](./plan_review.md) · [`PRIORITIES.md`](./PRIORITIES.md) |

---

## 0. Naming (do not confuse)

| Name | Role |
|------|------|
| **Loom** | Product CLI / MCP (`loom`, `@loom/*`) |
| **Fable 5 / fable-advisor** | Review judgment model / agent — **not** the product |
| **`fable-advisor` subagent** | Claude Code advisor consult pinned to **Fable** model (spawned via Task/Agent) |
| **`fable-advisor` plugin** | Orchestration tooling (DannyMac180, MIT) providing the grok/codex/fable lanes — **the dev tool, not the product**. Currently **v3.1.0**. |
| **directory `fable-advisor/`** | Local checkout path only — the product is **Loom** (remote: `lemonbalms/Loom`). Dir name is historical, pending rename. |

**Lane version pins:** Grok 4.5 · GPT-5.6 Sol (codex, high reasoning) · Fable 5 (advisor, read-only) · plugin **v3.1.0**.
When the `fable-advisor` plugin updates, bump these pins here so cache drift stays visible.

---

## 1. Room & profiles (owner-configurable roster)

**이 표가 역할 배정의 SSOT다.** 아래 배정은 **기본값(default)**이며, 고정이 아니라
**오너 결정 사항**이다 — 모델 성능은 고정된 것이 아니라 계속 발전하고, 그에 따라
피어(레인)는 계속 추가될 수 있다. 역할 배정은 **오너가 주로 사용하는 모델**을
따라간다. 배정을 바꿀 때는 이 표의 Role 칸을 수정하는 것으로 결정을 기록한다
(별도 게이트 불필요 — 오너 결정이 곧 게이트). 에이전트는 벤더를 하드코딩해
가정하지 말고 **매 세션 이 표를 읽고** 자기 역할을 확인한다.

| Profile (`--profile`) | Display name | Agent | Role (default — owner may reassign) |
|----------------------|--------------|-------|------|
| `codex-arch` | `codex-architect` | Codex | **architect** — PLAN/spec, implementation routing, review, independent verify |
| `grok-impl` | `grok-impl` | Grok | **default implementer** — code/test/docs/ship from the architect's locked spec |
| `claude-impl` | `claude-impl` | Claude Code | parallel/fallback implementation lane |
| `codex-impl` | `codex-impl` | Codex | cross-vendor fallback implementation lane; workspace-write |
| `claude-rev` | `claude-review` | Claude Code | **primary** plan_review R{n} |
| `codex-rev` | `codex-review` | Codex | secondary / adversarial |
| `grok-rev` | `grok-review` | Grok | **reserve** — 기본 미배정. 오너가 로테이션 편입 시 이 칸을 수정 |

The architect, `*-impl`, and `*-rev` profiles may run the same agent product, but
they are different Loom peer identities with different mandates. Never mix roles
in one terminal; verify `LOOM_PROFILE` at session start.

### One-shot setup (preferred) — 0.17 Launcher UX

```bash
cd /path/to/Loom   # or fable-advisor local path
bun run dogfood:up            # 0.17: ensure room + join all + sticky host per profile (background)
# bun run dogfood:up -- --fresh     # force new invite first
# bun run dogfood:up -- --status    # report host online/offline per profile (no spawn)

bun run dogfood:status        # invite + peers for all six active profiles
```

`dogfood:up` brings **every profile online in the background** (a sticky host each,
started sequentially per M-28). Close the terminal — peers stay online. Send work
with `board add`/`handoff`; open a `run` TUI **only to process** (see Daily below).
Stop all hosts with `bun run loom down`.

`dogfood:room` still exists for **join-only** setup. Note (L-34): with auto-host
default-on, each `room join` first stops the old-session host, then starts a new one
— so an individual join can take **up to ~8s** while the sticky host becomes ready.
`dogfood:up` suppresses per-join auto-host (`LOOM_NO_AUTO_HOST=1`) and batches the
hosts in one `loom up`, which is faster and clearer.

State (gitignored): `.loom/dogfood-room.env`, `.loom/dogfood-next-session.txt`

### Daily (after setup) — `run` only when actually working

Peers are already **online in the background** from `dogfood:up` — no `host start`
needed. Sending work needs no TUI (`board add`/`handoff`); open a `run` window
**only to process** claimed work. Stop hosts with `bun run loom down`.

```bash
# A — Codex architect (PLAN/spec/review/verify; no locked-spec product coding)
bun run loom --profile codex-arch run codex --write-user-config -- -a never -s workspace-write
# first prompt: scripts/dogfood-architect-boot.txt

# B — Grok implementer (online already; open run only to process)
bun run loom --profile grok-impl run grok
# first prompt: scripts/dogfood-grok-impl-boot.txt

# B2 — Claude implementer (parallel lane; claim a board task first, see §1.1)
bun run loom --profile claude-impl run claude

# B3 — Codex implementer (fallback lane; separate from codex-arch/codex-rev)
bun run loom --profile codex-impl run codex --write-user-config -- -a never -s workspace-write

# C — Claude primary reviewer
bun run loom --profile claude-rev run claude   # 0.13.14+ for resize; R{n} → fable-advisor subagent

# D — Codex second opinion
# Autonomy without full FS escape: approval never + workspace-write sandbox
bun run loom --profile codex-rev run codex --write-user-config -- -a never -s workspace-write
# equivalent env default:
#   LOOM_CODEX_ARGS="-a never -s workspace-write" bun run loom --profile codex-rev run codex --write-user-config
```

When using multiple Codex lanes, start them **sequentially** and let each launch
finish before starting the next. `--write-user-config` rebinds the single managed
`mcp_servers.loom` block to that launch's profile; an already-running Codex/MCP
process keeps its own session, while later Codex launches use the latest block.

### Codex architect → Grok implementation path

1. `codex-arch` completes the session ritual, chooses the gate, and locks a
   five-part implementation contract: scope, non-goals, invariants, verification,
   and return/ship contract.
2. It creates/assigns a board task to `grok-impl` and sends the detailed handoff.
3. `grok-impl` claims the task as `doing/grok-impl`, then becomes the only writer
   for the assigned shared-worktree scope. The architect does not edit overlapping
   files while implementation is in flight.
4. Grok returns `[IMPL-RESULT]` before shipping. Codex inspects the diff and runs
   independent verification; corrections go back through handoff, not architect
   hand-coding.
5. Codex sends `[SHIP]` only after verification; Grok commits/pushes and returns
   the SHA. Codex confirms the remote and updates gate bookkeeping.

```bash
bun run loom --profile codex-arch board add "<locked implementation task>" --as grok-impl
bun run loom --profile codex-arch handoff @grok-impl \
  "[IMPL] <five-part locked spec>" --with-pack --with-board
```

Boot prompts: `scripts/dogfood-architect-boot.txt` and
`scripts/dogfood-grok-impl-boot.txt`.

### 1.1 Three implementers — avoid double work

`grok-impl` (Grok), `claude-impl` (Claude), and `codex-impl` (Codex) all write
product code against the **same git working tree**. Without
coordination they can pick up the same PATCH/phase and collide (merge conflicts,
duplicate PLAN sections). Rule:

1. Before starting new work, run `check_handoffs` + board `list_tasks` and
   look for a task already `doing` with the *other* implementer as assignee.
   If found, skip it — do not start the same work.
2. Claim your task first: `update_task` → `status: doing`, `assignee: <your
   display name>` (`grok-impl`, `claude-impl`, or `codex-impl`) — *then* start editing files.
3. Prefer explicit routing: the Owner (human) or a handoff addresses work to
   `@grok-impl`, `@claude-impl`, or `@codex-impl` by name. Unaddressed board items are
   first-claim-wins per rule 2.
4. If both sessions are mid-flight on unrelated phases, that's fine — the
   collision risk is same-phase/same-PATCH, not general parallelism.

| Codex flag | Meaning |
|------------|---------|
| `-a never` / `--ask-for-approval never` | Do not prompt the human for command approval; failures return to the model |
| `-s workspace-write` / `--sandbox workspace-write` | Sandbox: write only inside the workspace (not danger-full-access) |

Outside the sandbox, commands **fail** instead of asking — safer than `--dangerously-bypass-approvals-and-sandbox`.

**Reviewer boot prompt (paste as first message):**  
`scripts/dogfood-reviewer-boot.txt` — forces `check_handoffs` → claim `[R-REQUEST]`.

### 1.2 Impl lane escalation — the session model does NOT hand-code a locked spec

The architect (session model, e.g. Opus/Fable) authors specs, reviews, and
verifies. It **does not write product code from an approved/locked spec** —
implementation is delegated. When work is ready to implement, pick a lane by
**availability**, escalating down this chain (check first, don't assume from a
stale HANDOFF note):

1. **Default:** `grok-impl` (Grok) — verify auth (`grok` CLI logged in). If expired, don't stop here.
2. **Cross-vendor fallback:** `codex-impl` (Codex / GPT-5.x) — verify `codex` CLI installed + authenticated. Use when grok is down or a second model family is wanted.
3. **Last resort — neither external CLI lane available:** the architect **still does not hand-code**. Spawn a **lower-tier in-harness model** subagent (`Agent` / `Workflow`) to implement from the locked spec, given the full five-part spec. The session model then reviews the diff and verifies. **Effort tracks the task, not the model tier** — and applies only at this in-harness tier (cross-vendor lanes carry their own reasoning config; never set Anthropic `effort` on them). Defaults:
   - **Locked-spec implementation** → `model: sonnet`, `effort: xhigh` (a locked spec is coding/agentic work, for which `xhigh` is the documented default — Claude Code's own default).
   - **Trivial mechanical edit** → `model: haiku` — **pass no `effort` param** (Haiku 4.5 has no effort knob; setting `effort` is a hard API error).

   Do **not** invert this into a "lower tier → higher effort" ladder: Haiku has no bottom rung (it takes no effort), and the mirror image would run verify/judge tiers at low effort — exactly backwards. Verify/judge stays at `high` (the API default when `effort` is omitted) or `max` for adversarial judging.

**The criterion is spec-lockedness, not raw difficulty.** Intelligence is spent at plan time (approved PLAN + R{n} locks), so a locked spec tolerates a mid-tier implementer. **Corollary:** if a task seems to need the **Opus/Fable tier** *to implement* (not merely `xhigh` — `xhigh` is the normal locked-spec effort above), the spec is not actually locked — send it back to the architect as **spec work** (PLAN/R{n}), do not raise the implementer tier to compensate. (Adversarial verify/judge tiers are governed by §2 / Standing rules, not this step.)

Rule of thumb: **check available lanes → delegate to the highest available →
only escalate to a lower-tier model, never to hand-coding by the session
model.** "The default lane is down" is a reason to move down the chain, *not* a
license for the architect to implement directly. (Lesson: 2026-07-11 —
`tasks/lessons.md`.)

### 1.3 Pane 배치 규칙 (owner 지시, 2026-07-19)

herdr 워커/모니터 pane 배치는 **탭당 최대 4개(좌우 수평 나란히)** — 초과분은 **새 탭을 만들어**
띄운다 (`herdr pane move <id> --new-tab`). 슬롯 관례: 아키텍트 pane 좌측 ·
워커 pane을 그 오른쪽부터 좌→우로 채움 · 로그/모니터 pane은 같은 탭 내 추가 우측 슬롯.

운영 주의: **브릿지가 이벤트 구독 중인 워커 pane은 이동하지 않는다** — 아키텍트·로그 등
비추적 pane을 옮겨 격자를 만든다. (pane move 시 pane_id는 유지 실측(2026-07-19)이나,
card.done 구독이 걸린 pane을 옮길 이유가 없다 — 보수 기본값.) 같은 탭 내 `pane move`는
no-op(`reason=same_tab`)이므로 재배치는 임시 탭 경유(`--new-tab` → `--tab <원탭> --split …`).

---

## 2. Claude Code — **must** consult the `fable-advisor` subagent for reviews

When Claude (profile `claude-rev` or any Claude session) receives a Loom **review request**
(`[R-REQUEST]`, “Fable 리뷰”, “R{n}”, plan pending-review handoff):

### Mandatory sequence

1. **Do not implement.** Read-only except `docs/plan_review.md` (and Open/header sync).
2. Spawn the **`fable-advisor`** subagent (`model: fable`, read-only).
3. Pass the advisor:
   - decision = approve vs pending-revision for **PLAN vX.Y.Z**
   - constraints = WORKFLOW §5, security boundaries, stated non-goals
   - options = any design alternatives in PLAN/UNKNOWNS
4. **Act on the verdict** — write `docs/plan_review.md` **Review R{n}** (WORKFLOW §5.2 format).
5. Handoff result back to the requesting implementer with `[R-RESULT]`.

### Forbidden for Claude-on-review

- Writing product code / “quick fixes” in packages/
- Rubber-stamp `approved` without a `fable-advisor` consult
- Confusing **Loom MCP tools** with plan approval

### Claude session system note (paste into first message or CLAUDE.md)

```text
You are claude-review on the Loom dogfood room. When you get [R-REQUEST] or
"Fable 리뷰" / R{n}:
1) Spawn the fable-advisor subagent (Task/Agent tool) BEFORE writing plan_review.
2) Write docs/plan_review.md Review R{n} from the advisor verdict + your code read.
3) Handoff [R-RESULT] to the requesting implementer. Never implement.
```

Plugin: `fable-advisor` installed (`claude plugin install fable-advisor`).  
Agent file: `agents/fable-advisor.md` (`model: fable`).

---

## 2.1 Claude Code — as implementer (`claude-impl` profile)

A Claude Code session running under profile `claude-impl` (peer display name
`claude-impl`) is an **implementer**, not a reviewer — the opposite role from
§2. Trigger: session was started with `--profile claude-impl`, or the Loom
peer identity for this session is `claude-impl`.

### Allowed / expected

- Draft new PLAN.md versions (bump version, write user journey / pillars /
  acceptance per WORKFLOW §5 shape) — same as Grok's PLAN-author role.
- Write product code in `packages/`, run tests, commit, push.
- Apply PATCH lock rows requested by an `[R-RESULT] pending-revision` from
  `@claude-review` / `@codex-review` (mirror the Grok PATCH-then-author-close
  flow — see `HANDOFF.md` playbook for the current PATCH).
- Send `[R-REQUEST]` to `@claude-review` (and `@codex-review` if
  security-relevant) when a new/patched PLAN needs review.
- Send `[VERIFY]` after implementing (SHA, test result).

### Forbidden for claude-impl

- Approving its own PLAN (`docs/plan_review.md` R{n} verdicts are written only
  by a `claude-rev`-profile session, per §2).
- Skipping the claim step in §1.1 before starting work already claimed by
  `grok-impl` (Grok).
- Treating this session's context as interchangeable with a `claude-rev`
  session — they are different peers with different mandates even though
  both are Claude Code.

### Claude-impl session system note (paste into first message)

```text
You are claude-impl on the Loom dogfood room — an implementer, not a
reviewer. On start:
1) check_handoffs + board list_tasks. Skip any task already "doing" under
   a different implementer assignee (grok-impl/codex-impl).
2) Claim your task: update_task status=doing, assignee=claude-impl.
3) Draft PLAN / apply PATCH locks / write code / test / commit / push.
4) Handoff [R-REQUEST] to @claude-review (+ @codex-review if security-
   relevant) for new or patched PLAN. Send [VERIFY] after implementing.
Never write docs/plan_review.md R{n} verdicts — that's claude-rev's job.
```

---

## 3. Codex lanes

### 3.1 Secondary review (`codex-rev`)

- Focus: security, races, fail-open, auth, data loss.
- May add High/Med findings; does **not** alone close R{n} without Claude primary body
  (unless Owner says otherwise).
- No `fable-advisor` consult (Claude-only capability). Codex uses its own adversarial pass.
- Do not implement product code or claim implementer work from this profile.

### 3.2 Implementer (`codex-impl`)

`codex-impl` follows the same claim-first implementation lane as `grok-impl` and
`claude-impl`, but remains a different peer from `codex-rev`.

- Verify `LOOM_PROFILE=codex-impl`, then check handoffs and the shared board.
- Skip any task already `doing` under another implementer; claim the selected
  task as `doing` / assignee `codex-impl` before editing.
- Implement the locked PLAN/PATCH, write tests, sync docs, commit, and push.
- Send `[R-REQUEST]` to `@claude-review`; add `@codex-review` only when an
  independent adversarial pass is useful. Never write the R{n} verdict for its
  own work.
- Launch with the current MCP profile installed:
  `bun run loom --profile codex-impl run codex --write-user-config -- -a never -s workspace-write`.

**Codex-impl session note:**

```text
You are codex-impl in the Loom dogfood room: implementer, not reviewer.
Verify LOOM_PROFILE, check handoffs + board, and claim one unclaimed task as
doing/codex-impl before editing. Do not duplicate another implementer's work.
Follow PLAN → review gate → implement → bun test → docs → commit/push. Never
author your own docs/plan_review.md R{n} verdict.
```

---

## 4. Implementer handoff templates (`grok-impl`, `claude-impl`, `codex-impl`)

All implementer profiles use the same templates below. Route results back to
the requesting peer (`@grok-impl`, `@claude-impl`, or `@codex-impl`).

### 4.1 Review request → Claude (requires fable-advisor consult)

```text
[R-REQUEST] PLAN vX.Y.Z pending-review
Scope: <one sentence>
Read: docs/PLAN.md, docs/plan_review.md, <paths>
YOU MUST: spawn the fable-advisor subagent first, then write
docs/plan_review.md Review R{n} (WORKFLOW §5.2).
Verdict: approved | pending-revision | on-hold
Do not implement. Reply with [R-RESULT] handoff.
```

CLI:

```bash
bun run loom --profile grok-impl handoff @claude-review "$(cat <<'EOF'
[R-REQUEST] PLAN v0.14.0 pending-review
Scope: durable inbox P2
Read: docs/PLAN.md, packages/relay/**
YOU MUST: fable-advisor subagent first, then plan_review.md R15.
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

### 4.3 Result → requesting implementer

```text
[R-RESULT] R15 pending-revision
Blocking: M-xx …
Non-blocking: L-xx …
Next: fix M-xx only; re-request R15b
Advisor: fable-advisor consulted (yes/no)
```

### 4.4 Verify

```text
[VERIFY] SHA <short> · bun test · smoke:uc · smoke:desktop green
```

---

## 5. Gate rules (unchanged product process)

| Gate | Who |
|------|-----|
| PLAN/spec + route + independent verify | Codex (`codex-arch`) — never claims locked-spec implementation |
| Implement locked spec | Grok (`grok-impl`) by default; Claude (`claude-impl`) or Codex (`codex-impl`) fallback — claim first, §1.1 |
| R{n} primary + `fable-advisor` consult | Claude Code (`claude-rev`) |
| R{n} security second pass | Codex (`codex-rev`) |
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

Then: `codex-arch` → spec/route/verify; `*-impl` → claimed HANDOFF/PLAN task;
`*-rev` → process review requests only.

### 6.1 Codex MCP + sticky host (common failure)

| Symptom | Cause | Fix |
|---------|--------|-----|
| Codex has no Loom tools | Global `~/.codex/config.toml` still has legacy `mcp_servers.fable` → `/tmp/fake-stdio.ts`, or never wrote `loom` | Remove fable; launch the intended Codex profile with `--write-user-config`, or install a managed `mcp_servers.loom` block with that profile's `LOOM_SESSION` |
| Project `.loom/codex.mcp.toml` exists but Codex ignores it | Codex does **not** auto-load project snippet; needs **user** config (opt-in) | `--write-user-config` (R3 M-3) |
| `loom --profile X inbox` shows wrong peer / empty while work was sent | Inside `loom run`, `LOOM_SESSION` used to beat `--profile` | **0.13.15+**: explicit `--profile` wins. Older: `env -u LOOM_SESSION loom --profile X inbox` |
| peer offline / no sticky | Only one profile host started | Start the host for the intended profile; `dogfood:status` lists all six |

Claude uses `--mcp-config` (always project path) so it does not need `~/.codex` style write.

Handoffs are **pull**: Claude/Codex must `check_handoffs` / `claim_handoff` (or human paste). They do not appear as native IDE tasks.

---

## 7. Board columns (suggested)

| Status | Meaning |
|--------|---------|
| todo | Planned |
| doing | One claimed implementer is drafting or implementing |
| blocked | Waiting R{n} / Open Med |
| done | Verified + shipped |
