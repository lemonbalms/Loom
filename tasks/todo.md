# 0.14.1 — P2 durable relay (done)

## Done

- [x] R15 M-21/M-22/M-23 PLAN locks + author-close
- [x] `packages/relay/src/persist.ts` + Room hydrate (M-22)
- [x] `relay-daemon` `LOOM_RELAY_STATE_DIR` (M-21)
- [x] Process lock M-23
- [x] Tests + VERSION 0.14.1
- [x] Fix `loom listen` crash (`createInterface` missing → peer offline)
- [x] `bun test` 152 pass · `bun run smoke:uc` OK

## Optional next

- [ ] git commit + push
- [ ] Dogfood: restart relay so running daemon loads durable code
