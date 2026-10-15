# Loom v0.30.0 Done-when (h) live smoke: headless worker, real CLIs

Date 2026-10-15. claude/codex runs on repo main 471226d; the final grok run on 5fae1fe (after the two grok argv fixes, see below). Reproducible harness: `scripts/smoke-headless.ts <claude|codex|grok> [reanalyze]` (re-runnable: a fresh run removes the previous per-kind dir; base dir `SMOKE_BASE` env, default `$TMPDIR/loom-smoke0300`).
Real `HeadlessDispatcher` (packages/host/src/headless-worker.ts), default permission profiles, allowedRoots = fresh temp git repo (one README commit), localPeerId `smoke-peer`, timeoutMs 15 min, capturing sink. Artifacts per kind: `<kind>/{repo,loom,result.json,output.txt}`. The original run used the session scratchpad; the committed harness `scripts/smoke-headless.ts` defaults to `$SMOKE_BASE` or `$TMPDIR/loom-smoke0300`.
Prompt: the "400-line report.md + END-OF-REPORT" card, unchanged, same for each CLI.

## Result

| Item | claude | codex | grok |
|---|---|---|---|
| CLI version | 2.1.300 | codex-cli 0.162.1 | 1.0.54 (alpha) |
| Wall time | 204 s | 232 s | 532 s (final run; ~9 min) |
| Exit / terminal event | result subtype=success, terminal_reason=completed, is_error=false, 6 turns | turn.completed (rc 0) | completed, attempts 1 (record state exited) |
| Result status / reason | failed / needs_verification (the by-design "unverified" shape) | same | same |
| Output length (chars) | 24038 | 21562 | 35048 |
| truncated | false | false | false |
| Contains END-OF-REPORT | yes (last line) | yes (last line) | yes |
| Lines matching `^Line \d+:` in output | 400 | 400 | 399 (text-run joining, see finding 5) |
| report.md on disk | 23976 bytes, 400 lines | 21549 bytes, 400 lines | 34917 bytes, 400 lines |
| Session id captured | yes, 2eea4e42-96a0-481f-9045-dc58a51e85ed (parsed and in record) | yes, 01a13d51-7d3b-7830-b3dd-82e4684c54c4 | yes, 78c18233-d3ac-4cf6-9c58-9081b5c1ddac (parsed = record) |
| Transcript file | transcript-1.jsonl 226,815 B | transcript-1.jsonl 25,141 B | transcript-1.jsonl 934,609 B |
| Permission denials surfaced | 2 (see below) | 1 entry, a false positive (see below; fixed in 587539e) | none |
| summary field | first line of output (Korean preface) | "Line 1: Tests reveal unexpected software behavior." | Korean preface runs glued to "Line 1: …" (finding 5) |
| Errors | none | none | none in the final run; two earlier runs failed on argv (finding 3) |

Full capture verified: output (24 KB / 21.5 KB / 35 KB, far below OUTPUT_CAP 200,000) carried all 400 report lines plus END-OF-REPORT with truncated=false and no truncation note, for claude, codex and (final run) grok. Output is a superset of report.md (claude prepended one preface sentence; the model's own text, not the worker).

## Findings

1. claude denials surfaced via `permission_denials`: (a) Bash `python3 - <<EOF ...` heredoc that would generate the file, (b) Bash `wc -l ...; sed ... | sort | uniq -d` verify pipeline. The default allow-list has no python and no pipelines, so the denials are expected. Claude recovered by using the Write tool and simpler allowed-prefix-free commands (`wc -l report.md`); the card still succeeded. Surfacing works.
2. codex "denial" is a parser false positive (minor): the entry is the exec of `rg --files ...` with exit code 1 (no match), printed as a denial with toolName undefined. No sandbox denial occurred; codex wrote report.md through its `file_change` item inside the cwd.
3. grok needed two argv fixes before it ran (grok 1.0.54). **Run 1** (471226d): `grokArgv()` emitted `-p --prompt-file <file>`, but `-p` is `--single <PROMPT>` and needs a value → `error: a value is required for '--single <PROMPT>'`, exit at once, 2 attempts, output "", stderr only in transcript-N.stderr. Fixed in `587539e` (`--prompt-file` alone; the fake CLI is now strict, unknown flags exit 2). **Run 2** (after 587539e): `--allow`/`--deny` are single-valued in 1.0.54, so passing several rules to one flag failed with "unexpected argument 'Write'". Fixed in `5fae1fe` (one `--allow`/`--deny` per rule; strict fake mirrors it; the attempts-exhausted note now carries the last stderr line). **Run 3** (5fae1fe, final): success — see the table. The dispatcher behaved correctly in all three (retry to MAX_ATTEMPTS=2, sink called once, no hang, no leftover processes).
4. The dispatcher's reported result is `status: failed, reason: needs_verification` even on a clean success. That matches the documented happy-path contract in headless-worker.test.ts, noted for completeness.

5. grok text-run joining (parser): grok streams the final message as several text runs; the parser concatenated them without the separating newline, so the preface sentences were glued onto "Line 1: …" and only 399 lines matched `^Line \d+:` in the output although report.md on disk has 400 and END-OF-REPORT is present. Capture was complete (nothing dropped); **Fixed in `a2e9eec`** (`agent-stream-parsers.ts`): the grok parser now joins text runs separated by non-text events with a blank line (the claude fallback joins only when `message.id` changes). The real grok transcript now parses to 400 `Line N:` lines (test in `headless-stream.test.ts`), so the 399 in the table above is resolved.

## UK-8 (HEADLESS_WORKER_HINT compliance)

UK-8 was observed for claude and codex only (grok optional, D14).

| Check | claude | codex |
|---|---|---|
| Asked questions / waited for input | no | no |
| Stayed in cwd | yes (Write path and relative shell cmds inside repo); git status shows only `?? report.md` | yes (`pwd` in repo, file_change path inside repo) |
| Pushed / deployed | no | no |
| Wrote only the final message as result | yes | yes |
Leftover processes: none from this run (grok processes visible in `ps` belong to other sessions, cwd fable-advisor, not started here).

## Safety

No bypass or dangerous flags used (defaults: claude acceptEdits + allow/deny lists, codex workspace-write + approval never, grok acceptEdits + one `--allow`/`--deny` per rule). cwd was always a fresh temp repo under scratchpad. Relay env vars were unset. Nothing committed; the only new repo files are `scripts/smoke-headless.ts` and this doc. Note: claude's `wallMs` in result.json was overwritten by a `reanalyze` pass (0); wall times above are from the original runs.
