# Loom v0.39.0 P2 real-CLI run: headless worker hint line 2 (D7) — PASS · shipped

Date 2026-10-18. Repo main `d5a82db` (P1 green — P1 = red `278b5ab` → green `d5a82db`). Authority: PLAN §0.39.0 D7 (R58-M2 outcome table ①–⑤) · Done when (d) · `UNKNOWNS.md` 0.39.0 UK-1 · 0.38.0 UK-8. Harness unchanged from 0.38.0/0.38.1: `bun run scripts/smoke-memory-write.ts --real-cli --owner-approved` (precedent `MEMORY-WRITE-SMOKE-0381.md` · `MEMORY-WRITE-SMOKE-0380.md` — setup, guards and real-home checks are the same).

| Item | Value |
|---|---|
| OS | macOS (Darwin 25.6.0) |
| Run | **real-CLI ① 3/3 steps PASS (harness)** — owner-approved, 2026-10-18, run once |
| Commit under test | **`d5a82db`** — the inner process runs `HeadlessDispatcher` **from source** (`smoke-memory-write.ts:856`), so the D2 hint line is live. The CLI children (`memory list` etc.) use `dist/loom.js`; D7 does not depend on dist |
| Agents | `codex-cli 0.163.0` · `claude 2.1.302` · `grok 1.0.54 (4e18c5517b4e) [stable]` |
| **D7 verdict** | **PASS** — codex read both listed SKILL.md paths ∧ codex `proposed 1` ∧ grok `proposed 1` ∧ three `notes.md` ∧ real home untouched ∧ ¬⑤ · claude `proposed 1` (④ does not apply) → 0.39.0 **shipped** · 0.38.0 UK-8 **closed** |

## Run (exit 0)

```
$ bun run scripts/smoke-memory-write.ts --real-cli --owner-approved
PASS ① real CLIs — one card each · cardWrites on · memory_propose line · notes.md — claude proposed 1 · notes.md yes · codex proposed 1 · notes.md yes · grok proposed 1 · notes.md yes
PASS zero persistence — temp home removed — removed
PASS real home untouched — ~/.loom · ~/.fable 1575 entries · ~/Library/LaunchAgents 11 entries names+mtime identical · ~/.claude · ~/.codex · ~/.grok no new names
PASS smoke:memory-write (real-cli · dist CLI) — 3/3 steps
```

| Card | stderr `memory_propose` line (verbatim) | `notes.md` | Reply (verbatim, shortened) |
|---|---|---|---|
| claude | `[headless] memory_propose (smoke_r_claude): proposed 1 · dropped 0 (secret 0 · marker 0 · cap 0 · busy 0 · dup 0 · invalid 0)` | exists | `"Loom memory-write smoke 작업을 마쳤습니다.\n\nLOOM-MEMORY-CANDIDATES\n- fact: Loom memory-write smoke test was run in this room on 2026-10-18.\nLOOM-MEMORY-END"` |
| codex | `[headless] memory_propose (smoke_r_codex): proposed 1 · dropped 0 (secret 0 · marker 0 · cap 0 · busy 0 · dup 0 · invalid 0)` | exists | `"The smoke task is done.\n\nLOOM-MEMORY-CANDIDATES\n- fact: The Loom memory-write smoke ran in this room.\nLOOM-MEMORY-END"` |
| grok | `[headless] memory_propose (smoke_r_grok): proposed 1 · dropped 0 (secret 0 · marker 0 · cap 0 · busy 0 · dup 0 · invalid 0)` | exists | `"The smoke reply needs the two Loom skills first. I'll read both, then write the one-sentence result and the memory candidate.\n\nStatus: done\n…\nLOOM-MEMORY-CANDIDATES\n- fact: The Loom memory-write smoke ran in this room.\nLOOM-MEMORY-END\n\nLOOM-REPORT-END"` |

## R58-M2 record items (verbatim)

| Item | Value |
|---|---|
| Commit sha | `d5a82db` |
| codex spawn argv `developer_instructions=` line 2 | `Work only inside the current working directory. Do not touch paths outside it, except that you may read the SKILL.md files listed above the dispatched-task marker.` — **= D2 verbatim** (bare form, no TOML quoting — R2). claude `--append-system-prompt` and grok `--rules` carry the same constant |
| grok `prompt.txt` first line (the listing header — 0.38.1 D2) | `Available skills — Loom copied these for this card outside the working directory. Reading the SKILL.md files listed here is allowed; do not modify them. Read the SKILL.md before use:` |
| codex read of `loom-card-report/SKILL.md` | **yes** — `command_execution` exit 0 |
| codex read of `loom-memory-candidates/SKILL.md` | **yes** — same command, exit 0 |
| CLI versions | `codex-cli 0.163.0` · `claude 2.1.302` · `grok 1.0.54 (4e18c5517b4e) [stable]` |

### codex transcript (7 events — the only command)

```
item.completed agent_message "I’ll read the two reporting skills, then return the smoke-test result and one memory candidate."
item.completed command_execution status=completed exit_code=0 command="/bin/zsh -lc 'cat /var/folders/mz/z0wh5lpj1cqcghk7f8dl0k040000gn/T/loom-smoke-memory-write-tKWpDO/.loom/cards/dd360c01a0b5a6a3/2476320daabfa4b8/skills/plugin/skills/loom-card-report/SKILL.md /var/folders/mz/z0wh5lpj1cqcghk7f8dl0k040000gn/T/loom-smoke-memory-write-tKWpDO/.loom/cards/dd360c01a0b5a6a3/2476320daabfa4b8/skills/plugin/skills/loom-memory-candidates/SKILL.md'" output="---\nname: loom-card-report\n…"
item.completed agent_message "The smoke task is done.\n\nLOOM-MEMORY-CANDIDATES\n- fact: The Loom memory-write smoke ran in this room.\nLOOM-MEMORY-END"
```

R5 test (substring of a listed SKILL.md absolute path in a `command_execution` command, exit 0): both listed paths of the codex card (`…/2476320daabfa4b8/skills/plugin/skills/…`) are in the one `cat` command. Skill copy: `…/2476320daabfa4b8/skills` — 9 entries, both SKILL.md present (`loom-card-report` 617 B · `loom-memory-candidates` 971 B).

### grok and claude

- grok: two `read_file` calls, `target_file` = exactly the two listed paths of the grok card (`…/b5de7f5e02a549dc/skills/plugin/skills/loom-card-report/SKILL.md` and `…/loom-memory-candidates/SKILL.md`) — both `completed`. No other tool call.
- claude: one `Skill` tool call `loom-card:loom-memory-candidates` (claude gets the plugin via `--plugin-dir`; its listing has no Available line — 0.38.1 D4). No file read.

## ⑤ check — absolute paths outside the cwd (cwd = `/private/var/folders/mz/z0wh5lpj1cqcghk7f8dl0k040000gn/T/loom-smoke-memory-write-tKWpDO/work`)

| Agent | Paths outside the cwd in commands / read arguments | In that card's listing? |
|---|---|---|
| codex | `…/2476320daabfa4b8/skills/plugin/skills/loom-card-report/SKILL.md` · `…/2476320daabfa4b8/skills/plugin/skills/loom-memory-candidates/SKILL.md` | yes · yes |
| grok | `…/b5de7f5e02a549dc/skills/plugin/skills/loom-card-report/SKILL.md` · `…/b5de7f5e02a549dc/skills/plugin/skills/loom-memory-candidates/SKILL.md` | yes · yes |
| claude | none (Skill tool only) | — |

No read outside each card's listed SKILL.md → **¬⑤ holds** (UK-4 blocking only for this run — R58-M2).

## Verdict — PASS

- **D7 outcome table (R58-M2):** ① does not apply (codex R5 read present) · ② does not apply (codex `proposed 1`) · ③ does not apply (grok `proposed 1` · `notes.md`) · ④ does not apply (claude `proposed 1`) · ⑤ does not apply (table above). **PASS** = codex R5 read ∧ codex ≥ 1 ∧ grok ≥ 1 ∧ three `notes.md` ∧ real home untouched ∧ ¬⑤.
- **0.38.0 UK-8 closed (resolved by 0.39.0):** with the hint exception, codex read the copies outside the cwd. Compare 0.38.1 (`MEMORY-WRITE-SMOKE-0381.md:28` · `:46`): same `codex-cli 0.163.0`, same listing header, old hint → *"Blocked: … worker instructions prohibit accessing those paths."*
- **UK-2 (cause):** still not separated. This run shows "with this hint, codex 0.163.0 reads" (n = 1). It does not explain the 0.162.1 counter-example.

## Commands used

```
bun run scripts/smoke-memory-write.ts --real-cli --owner-approved
```

Run once with the owner's explicit yes. Any re-run needs a new explicit yes (D7).

## Not covered

- n = 1 per agent. codex on a version other than 0.163.0 (UK-2).
- Upgrade effect on a live bridge (UK-5) — not measured; the upgrade note (drain → status shows 0 in flight → swap → start) is advice.
- Sibling files of a skill directory (scripts, reference files) — still outside the allowed scope (D5).
