# HANDOFF — Loom (next session)

**Date:** 2026-07-10  
**Workspace:** `/Users/kyoungsiklee/projects/fable-advisor`  
**GitHub:** https://github.com/lemonbalms/Loom (`main`)  
**Language:** user often Korean

### Session entry
Read this + `docs/WORKFLOW.md` §0 (or `bun run status`) → short status table → **continue next gate without asking**. Autonomy default (AGENTS.md).

---

## One-line resume

> PLAN **0.16.1** work bus: board→handoff notify + `loom work`/`watch`. R17 locks M-26/L-31/L-32. CLI **0.16.1**.

---

## Where we are

| Item | Value |
|------|--------|
| **CLI** | **0.16.1** |
| **PLAN** | **v0.16.1** `approved` |
| **Open blocking** | none |
| **Shipped recently** | P0 install · P1 R14 · P2 durable 0.14.x · purpose 0.15.1 · work bus 0.16.1 |
| **Remote** | lemonbalms/Loom |

### Naming
**Loom** = product. **Fable 5** = review agent (not product).

---

## Product north star
Purpose-based multiplayer: **handoff = work bus**; board = status; purpose = why; receive = check_handoffs/claim.

---

## Immediate next
| Priority | Item |
|----------|------|
| Optional | dogfood: board add --as peer; work watch |
| Optional | P3 CRDT only if Owner wants multi-writer board |
| Skip | Low backlog thrash |

```bash
bun run status
bun test && bun run smoke:uc && bun run smoke:durable
bun run loom --profile impl host start
# board add "x" --as @claude-review  → handoff
# loom work / loom work watch
```

---

## Dogfood
| Profile | Role |
|---------|------|
| impl | grok-impl |
| claude-rev | primary R{n} + `/advisor fable` |
| codex-rev | adversarial; `run codex -- -a never -s workspace-write` |

Boot: `scripts/dogfood-reviewer-boot.txt`
