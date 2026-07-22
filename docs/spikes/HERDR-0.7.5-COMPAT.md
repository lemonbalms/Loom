# herdr 0.7.5 compatibility checkpoint

**Date:** 2026-07-22
**Verdict:** **blocked — owner standard is current herdr 0.7.5/protocol 17; migrate Loom adapter before dispatch**

## Trigger

The local herdr installation upgraded from 0.7.4/protocol 16 to
0.7.5/protocol 17. Changing only `~/.loom/bridge/mac-node.json` from protocol
16 to 17 makes the bridge pass its startup ping, but does **not** establish card
dispatch compatibility.

## Evidence

- `herdr --version`: `0.7.5`
- `herdr status server --json`: running server protocol `17`
- `herdr api schema --json` versus
  `docs/spikes/fixtures/herdr-v0.7.4/schema.json`: schema version remains 1, but
  the agent control request contract is breaking.
- Official v0.7.5 release notes describe the new live-agent facade and replacement
  of `agent send` by `agent send-keys`.

| Loom protocol-16 call | herdr 0.7.5 / protocol-17 contract | Impact |
|---|---|---|
| `agent.start({name, argv, cwd, env, workspace/tab/split, focus})` | `agent.start({name, kind, pane_id, args?, timeout_ms?})` against an existing pane | topology creation and env injection must move before start |
| `agent.send({target, text})` followed by TUI-specific Enter injection | `agent.prompt({target, text, wait?})` or logical `agent.send_keys` | injection/submit/verification flow must be redesigned |
| old wait/send CLI facade | server-owned `agent.wait`, `pane.wait-output`, `agent.send-keys` | monitoring adapter changes |
| `pane.agent_detected` without release result fields | additive `final_status` and `released` | event parser needs compatibility coverage |

Startup-only smoke is insufficient: ping and the global event subscription can
succeed under protocol 17 while the first worker spawn fails. The compatibility
gate therefore runs before room/bridge mutation in `scripts/dogfood-herdr-check.sh`.

## Operating decision

1. The owner uses current herdr **0.7.5 / protocol 17**; downgrade/pin and a
   side-by-side 0.7.4 session are not the target architecture.
2. Do not edit only `herdrProtocol` to 17 as a bypass.
3. Keep the historical 0.7.4 fixture immutable; add a separate 0.7.5 fixture when
   implementing compatibility.
4. 0.7.5 support is a product compatibility PATCH with tests-first coverage for
   pane creation, env (`LOOM_CARD`) injection, named agent start, atomic prompt,
   event completion, scrape, and cleanup. It is outside the bounded
   SESSION-CONTINUITY Phase B/C wave unless the owner explicitly reprioritizes it.
5. `dogfood:herdr` verifies both sides: live herdr must be 0.7.5/17 and Loom's
   committed `HERDR_PROTOCOL_EXPECTED` must also be 17. Until then `dogfood:up`
   stops before room/profile/host mutation.

Official sources: [herdr v0.7.5 release](https://github.com/ogulcancelik/herdr/releases/tag/v0.7.5),
[herdr repository/install guidance](https://github.com/ogulcancelik/herdr).
