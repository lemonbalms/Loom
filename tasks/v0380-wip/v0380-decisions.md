# Loom v0.38.0 — memory write path — architect decision list (LOCKED after loom-advisor consult 2026-10-17 — revise-then-proceed applied)

Scope source: PLAN §0.37.0 "다음 후보" (:307) items ①–④ + memory rule 3 ("카드가 끝나면 요약을 남기고 장기 기억 후보를 `proposed`로 올립니다. 카드 메모는 보관만 하고 이후에는 불러오지 않습니다"). Code baseline `d6f7cc2`.

D1 Scope split. 0.38.0 = ① card memory candidates → `proposed` and ② card notes `notes.md` (one failure mode: worker output → persistent operator data; first bridge-side store write). ③ snapshot mtime cache/async reader and ④ lookalike-marker hardening move to a later candidate (0.39) — different failure modes (perf; fingerprint-affecting sanitizer change); ③ evidence is weak (median 16–19 ms). Precedent: 0.36 D1, 0.37 authority note ②.

D2 Channel = host parses the worker's final output. No MCP memory tool, no worker-run CLI write path (precedent M-24: sensitive writes stay off agent tool surfaces; headless workers have no Loom MCP).

D3 Opt-in. New bridge key `worker.memory.cardWrites: true` (default false) enables both ① and ②. Requires `worker.memory.enabled` and `worker.skills.enabled`; otherwise the bridge refuses to start with a one-line reason. Off → workers, argv, first turns, fingerprints byte-identical to 0.37.

D4 Format delivery = a NEW builtin skill `loom-memory-candidates` (SKILL.md defines the block grammar), materialized into the card's skills only when cardWrites is on (independent of the room's skill selection). `loom-card-report` SKILL.md is NOT edited (so skills users who don't opt in see no manifest/fingerprint change). No argv / hint / template / ARGV_TEMPLATE_VERSION change; fence text unchanged.
  Interactions (advisor): the forced skill obeys policy allow/deny — if policy denies `loom-memory-candidates`, the bridge refuses to start (no bypass); a user skill of the same name shadows it as `resolveSkill` already does (operator's own choice; P4b shadow label shows it); a room `skills.json` that also selects it → deduplicated; `loom skills list` gains the builtin row for every user (declared test edit `skill-materialize.test.ts:144`); turning cardWrites ON changes `manifestHash` → in-flight cards go `needs_verification` once (declared). Editing `loom-card-report` was rejected: it would change every skills-enabled card's fingerprint for users who never opted in.

D5 Grammar. Block `LOOM-MEMORY-CANDIDATES` … `LOOM-MEMORY-END`, one candidate per line `- <fact|decision|preference>: <body>`. Only the LAST complete block in the untruncated `parsed.finalText` counts. Max 5 candidates per card attempt; body per store rule (≤2000, sanitized). Timeout (raw transcript), give-up path, agent_disabled / fingerprint_changed / spawn_setup_failed → no candidates. The delivered result text is unchanged (block stays in output; no mutation). Every candidate is written with `supersedes: null` (a card candidate can never retire/replace an entry when approved).

D6 Outcome independence. Candidates are proposed whenever a non-timeout final output parses, regardless of the eventual dispatcher verdict — the human approval gate is the control; host cannot know the verdict.

D7 Scope of a candidate = `room:<roomKey(card.roomId)>` always (narrowest). Worker cannot choose `project`. Widening = human adds a project entry (`loom memory add`/`--supersedes`). No approve-time scope edit in 0.38.

D8 Source + attribution. `source = {kind:"card", room:<roomKey>, card:<cardRef sha16>, attempt:<n>, by:<dispatcher peerId, sanitized ≤64>}` (≤1024 B). `loom memory list/show` display source kind + dispatcher for proposed entries; `list` gains `--source <kind>` filter. JSON output shape: additive field only. `show` and `approve` echo body + source kind + dispatcher (approve prints what it activated).

D9 Caps. Card-sourced proposed ≤50 in total per agentKey (inside the existing proposed ≤200), ≤10 per room, ≤5 per card attempt; over cap → drop and count. The human `propose` path keeps ≥150 headroom.

D10 Write-time filters (agent-sourced only): redaction would change the body → drop+count (0.35 class 6 rule); body contains a Loom marker per the existing `containsMarker` or a `LOOM-` fence/nonce lookalike → drop+count; store's sanitize as today. No new normalization (④ deferred).

D11 Idempotency. Dedupe key = (cardRef, sha16(dispatchHandoffId), attempt) — attempts restart at 1 per handoff (`headless-worker.ts:1237`), so (card, attempt) alone would drop a later handoff's real candidates. Before append, under the store lock, skip if `entries.jsonl` OR `entries.archive.jsonl` holds an entry with the same key (archive scan closes the compacted-reject resurrection gap). Dedupe is load-bearing: the exited-recovery branch (`:1247-1256`) re-runs sendParsed on the full transcript. Order: propose BEFORE `sendAndMark`, outside the card lock. The card record also persists `memoryProposed` per key (fast path).

D12 Locking. New async append path (`appendMemoryEntriesAsync`) that acquires the SAME mkdir lock directory as the human CLI (`entries.jsonl.lock` via `tryAcquireLock` / `tryReclaimStaleLock`, `atomic-json.ts`) with an awaited retry timer — NOT the room-event-log lock protocol (incompatible: CLI and bridge would not exclude each other). Borrow only room-event-log's ≤250 ms budget + fail-open rule: timeout → drop+count `busy`; result delivery never waits on memory. Work under the lock (read, fold, append, fsync of a ≤1 MiB file) stays synchronous and bounded. Never on the WS receive path. Human CLI path unchanged (sync, `busy` exit 1). Required test: CLI and bridge contending for the lock.

D13 Profile. Writes use the already-resolved `HeadlessDeps.profile` (bridge-runtime resolution, R53-L2); if absent → no writes (skip, counted).

D14 Visibility. One new stderr line per card `[headless] memory_propose (<card>): proposed N · dropped M (secret a · marker b · cap c · busy d · dup e · invalid f)` — separate line, pinned 0.36/0.37 regexes untouched. `loom memory list` header shows "K card proposals awaiting review". No doctor change.

D15 Card notes. Host writes `<cardDir>/notes.md` (sibling of `skills/`, outside the skills manifest), 0600 atomic, content = `redactSecrets(finalText or raw-on-timeout, process.env)` truncated to OUTPUT_CAP, overwritten per attempt (last attempt wins), on every sendParsed/give-up path that has text. Never re-read by Loom; no CLI view in 0.38 (path documented). Removed with the card directory (existing retention). Honesty: `transcript-N.jsonl` already keeps the raw output, so `notes.md` is a redacted copy of the final output — NOT a generated summary; rule 3's "요약" is met only as far as the worker's own report summarizes.

D16 Worker shell bypass (pre-existing since 0.35): a worker with a shell can run `loom memory add` (resolves to the displayName profile → possibly the bridge's store) and create an ACTIVE entry with source human, skipping approval. 0.38 does NOT add a builtin shell.deny (would change policyHash → every card's fingerprint). Declared as acceptance class 23 + USER_GUIDE warning + CHANGELOG honesty line. Candidate for a later fix (e.g. a per-store "agent write" lock or CLI refusing inside LOOM_CARD env).
D16' INCLUDED (advisor): `loom memory add|propose|approve|retire|compact` refuse (exit 1, one-line reason) when env `LOOM_CARD` is set — set for both backends (`headless-worker.ts:317`, `bridge-runtime.ts:1968`). An accidental-write guard, NOT a boundary: a worker can `env -u LOOM_CARD` or write `entries.jsonl` directly → class 23 stays for that residual. `list`/`show` are not refused. A human typing in a pane-backend worker terminal is refused too (documented; they unset LOOM_CARD deliberately).

D17 Excluded: pane backend, sticky host, MCP, knowledge files, guideline writes by agents, approve-time edits.

D19 Honesty row (advisor): D6 proposes candidates from work the dispatcher may later reject — declared in the 증명 못함/수용 손실 tables; the human approval gate is the only control.

D18 Ship gate. Fake-CLI smoke covering ①② + idempotency + caps + filters; real-CLI smoke with cardWrites ON (one card each codex/grok/claude, prompt asks for one candidate) — owner approval at ship time (first real-CLI run of the new skill text). R56 mandatory (new trust boundary — WORKFLOW §5.1, no author-close).

Acceptance classes start at 23. PATCH plan sketch: P1 store async append + caps + filters + dedupe (red/green) · P2 bridge config key + validation + skill materialization · P3 sendParsed parse → propose + notes.md + stderr line · P4 CLI list/show source + filter + header (+ D16' CLI refusal) · P5 smoke + docs + VERSION + dist.
