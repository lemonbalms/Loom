# Loom v0.38.1 P2 real-CLI run: codex/grok skill-listing header (D7) — outcome ① (codex refused) → D8 · not shipped

Date 2026-10-18. Repo main `76be19b` (P1b — the last P1 commit; P1 = red `0603e7f` → green `7348d15` → P1b `76be19b`). Authority: PLAN §0.38.1 D7 (R57-M1 outcome table) · D8 · Done when (d) · `UNKNOWNS.md` 0.38.1 UK-1 · 0.38.0 UK-8. Harness unchanged from 0.38.0: `bun run scripts/smoke-memory-write.ts --real-cli --owner-approved` (precedent `MEMORY-WRITE-SMOKE-0380.md` — setup, guards and real-home checks are the same).

| Item | Value |
|---|---|
| OS | macOS (Darwin 25.6.0) |
| Run | **real-CLI ① 3/3 steps PASS (harness)** — owner-approved, 2026-10-18, run once |
| Commit under test | **`76be19b`** — the inner process runs `HeadlessDispatcher` **from source** (`smoke-memory-write.ts:856`), so the D2 header is live; the harness line says "dist CLI" because the CLI children (`memory list` etc.) use `dist/loom.js`, which is still v0.38.0 (no version bump — not shipped). D7 does not depend on dist |
| Agents | `codex-cli 0.163.0` · `claude 2.1.302` · `grok 1.0.54 (4e18c5517b4e) [stable]` |
| **D7 verdict** | **FAIL — outcome ① (codex did not read a listed path · refused) → D8** · 0.38.1 is **not shipped as a fix** · 0.38.0 UK-8 stays open · next = `HEADLESS_WORKER_HINT` change (fingerprint-changing · MINOR) — **owner pick** |

## Run (exit 0 — harness PASS ≠ D7 PASS)

```
$ bun run scripts/smoke-memory-write.ts --real-cli --owner-approved
PASS ① real CLIs — one card each · cardWrites on · memory_propose line · notes.md — claude proposed 1 · notes.md yes · codex proposed 0 · notes.md yes · grok proposed 1 · notes.md yes
PASS zero persistence — temp home removed — removed
PASS real home untouched — ~/.loom · ~/.fable 1575 entries · ~/Library/LaunchAgents 11 entries names+mtime identical · ~/.claude · ~/.codex · ~/.grok no new names
PASS smoke:memory-write (real-cli · dist CLI) — 3/3 steps
```

The harness keeps the 0.38.0 rule (all three `notes.md` · at least one card `proposed ≥ 1`). The 0.38.1 ship gate is stricter (D7): codex must read a listed SKILL.md path **and** propose ≥ 1. It did neither.

| Card | stderr `memory_propose` line (verbatim) | `notes.md` | Reply (verbatim, shortened) |
|---|---|---|---|
| claude | `[headless] memory_propose (smoke_r_claude): proposed 1 · dropped 0 (secret 0 · marker 0 · cap 0 · busy 0 · dup 0 · invalid 0)` | exists | `"Status: done\nSummary: Loom memory-write 스모크 작업을 마쳤습니다. …\nLOOM-MEMORY-CANDIDATES\n- fact: Loom memory-write 스모크 테스트가 이 room에서 실행되었다.\nLOOM-MEMORY-END\nLOOM-REPORT-END"` |
| codex | `[headless] memory_propose (smoke_r_codex): proposed 0 · dropped 0 (secret 0 · marker 0 · cap 0 · busy 0 · dup 0 · invalid 0)` | exists | `"Blocked: the required skills are outside the working directory, and worker instructions prohibit accessing those paths."` |
| grok | `[headless] memory_propose (smoke_r_grok): proposed 1 · dropped 0 (secret 0 · marker 0 · cap 0 · busy 0 · dup 0 · invalid 0)` | exists | `"스모크 응답 전에 카드 보고와 메모리 후보 스킬을 확인합니다.\n\nStatus: done\n…\nLOOM-MEMORY-CANDIDATES\n- fact: The Loom memory-write smoke ran in this room.\nLOOM-MEMORY-END\nLOOM-REPORT-END"` |

## R57-L4 record items (verbatim)

| Item | Value |
|---|---|
| Commit sha | `76be19b` |
| grok `prompt.txt` first line (proxy for the non-claude branch — real-CLI mode does not capture codex stdin, `smoke-memory-write.ts:344`) | `Available skills — Loom copied these for this card outside the working directory. Reading the SKILL.md files listed here is allowed; do not modify them. Read the SKILL.md before use:` — **= D2 verbatim** |
| codex read of `loom-memory-candidates/SKILL.md` | **none** |
| codex read of `loom-card-report/SKILL.md` | **none** |
| CLI versions | `codex-cli 0.163.0` · `claude 2.1.302` · `grok 1.0.54 (4e18c5517b4e) [stable]` |

### codex transcript (7 events — the only command)

```
item.completed agent_message "I’ll check the workspace for the required report and memory-candidate instructions.\n"
item.completed command_execution status=failed exit_code=1 command="/bin/zsh -lc \"pwd\nrg --files --hidden -g 'AGENTS.md' -g 'SKILL.md' -g '\"'!*node_modules*'\"' -g '\"'!.git'\"'\"" output="/private/var/folders/mz/z0wh5lpj1cqcghk7f8dl0k040000gn/T/loom-smoke-memory-write-VaO883/work\n"
item.completed agent_message "Blocked: the required skills are outside the working directory, and worker instructions prohibit accessing those paths."
```

No `command_execution` string contains either listed SKILL.md path (R4 test — substring, `/var` or `/private/var`). The skill copy was correct (`…/2476320daabfa4b8/skills` — 9 entries, both SKILL.md present: `loom-card-report` 617 B · `loom-memory-candidates` 971 B). spawn argv is byte-for-byte the 0.38.0 form (`developer_instructions` = `HEADLESS_WORKER_HINT`, incl. *"Work only inside the current working directory. Do not touch paths outside it."*).

### grok and claude

- grok read both listed paths with `read_file` (`…/b5de7f5e02a549dc/skills/plugin/skills/loom-card-report/SKILL.md` and `…/loom-memory-candidates/SKILL.md` — both `completed`) and no other path outside the cwd (UK-4 observation). Block placed before `LOOM-REPORT-END`.
- claude used the Skill tool: `loom-card:loom-memory-candidates` then `loom-card:loom-card-report` (claude gets the plugin via `--plugin-dir`; its listing has no Available line — D4).

## Verdict — outcome ① → D8

- **D7 outcome table (R57-M1):** ① codex did not read a listed path (refused) → **D8**. ② does not apply (codex did not read) · ③ does not apply (grok `proposed 1` · `notes.md`) · ④ does not apply (claude `proposed 1`).
- **D8:** 0.38.1 is **not shipped as a fix**. No version bump, dist, CHANGELOG or USER_GUIDE change. 0.38.0 UK-8 stays **open** with this second data point. Next option = change `HEADLESS_WORKER_HINT` (a `workerFingerprint` input — `agent-argv.ts:280-293` — so MINOR, `needs_verification` on in-flight cards) — **owner pick**. 0.38.1 contains no hint change.
- **The R57 deciding risk is confirmed (n = 1):** codex followed the `developer_instructions` hint over the user-turn header. The reply names the "worker instructions" as the reason, even though the first line of its prompt allows reading the listed paths. Class 31 (header ↔ hint conflict) was decided by the model in favour of the hint.
- **UK-2 (cause):** not separated. Same `codex-cli 0.163.0` as the two 0.38.0 runs; the explicit permission did not change the outcome. The 0.162.1 counter-example (`HEADLESS-SMOKE-0310.md` h2) is still unexplained.

## Commands used

```
bun run scripts/smoke-memory-write.ts --real-cli --owner-approved
```

Run once with the owner's explicit yes. Any re-run needs a new explicit yes (D7).

## Not covered

- Whether a hint change (D8 next option) makes codex read the listed paths — not tested here (out of 0.38.1 scope).
- codex on a version other than 0.163.0 (UK-2). n = 1 per agent.
- Fake-CLI `bun run smoke:memory-write` was not part of this record.
