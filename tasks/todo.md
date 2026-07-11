# 0.21.1 — PTY handoff inject (shipped d05d714)

## Done

- [x] PLAN **v0.21.1** approved (R22 author-close, M-1..M-6 locks)
- [x] PTY handoff inject implemented (codex-impl lane) + architect-verified
- [x] `bun test` 190/0 · 6-pkg typecheck · biome touched clean · VERSION 0.21.1 (CLI+MCP)
- [x] Committed `d05d714` + pushed

## Next

1. [ ] **라이브 스모크 (flag 개방 전 권장)** — 실제 `loom run claude --inject-handoffs`로
       accept→paste-not-submit + busy-중 no-inject 확인. python 주입 경로가 유일한 런타임 미검증 지점.
2. [ ] **relay 공용 호스트(VPS) 확보 = 오너 블로커** → 확보 시 `docs/DRY_RUN_RUNBOOK.md` Step 0부터 팀 온보딩.
3. [ ] **원래설계 나머지 결정 4개** (`docs/ORIGIN.md` §5): presence 오버레이 / Phase 4 협업품질 / Phase 5 UX polish / Mosaic 벤치마크 — 복원 vs 의식적 폐기.

## FREEZE (유효)

신규 기능은 팀 실사용에서 pull된 요구만. 백로그(work-watch·MCP·C1/C2)는 동결. (PTY inject는 오너 pull 예외였음.)
