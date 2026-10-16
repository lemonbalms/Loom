# v0.36.0 deviations (for implementation-notes §0.36.0)

1. P1: renderMemoryBlock validates the nonce before the empty-text early return (bad nonce throws even for empty text).
2. P1: stableStringify is private in agent-argv.ts; memory-inject.test.ts keeps a local copy (as headless-argv.test.ts does) to keep the agent-argv.ts diff to the 6th field.
3. P1: import guard split into three tests (regex samples · allowed importers · headless-worker must import — expected red until P2 green).
4. P1 verify (V-L4, no code change in 0.36): existing containsMarker (locked unchanged) misses confusable markers (Cyrillic о, Greek α, dotless ı, NFKC-precomposed ó) — recorded under loss classes 11/13; 0.37 candidate: NFKD + strip \p{M} + confusables skeleton.
5. P1 verify (V-L1/L2/L3/L5/L6): test gaps folded into P2 red (CRLF/trailing-whitespace byte keep, marker after >40-char prefix, zero-width/soft-hyphen marker, wider IMPORT_RE, renderMemoryBlock("", bad) throws).
6. P2: extra tests-only commit a869a30 between red (f66a12d) and green (38bf86c) — harness defects: `toHaveBeenCalledWith` ran after `mockRestore()` cleared calls (now args captured in the call-through mock); 0500 card-dir write-failure case was ineffective (spawnOnce `mkdir0700` chmods the dir back) → removed; the non-empty-directory blocker case still covers memory-snapshot.md write failure.
7. P2: resume write-ahead hash (`SpawnPlan.memorySnapshotHash`, R10) left to P3 per ⑦ P3 row — until P3, a resume write-ahead drops the key and uses the 5-input fingerprint.
8. P2: the nonce is drawn (and validated by renderMemoryBlock) even when the snapshot text is empty — a bad `memoryNonce` seam is `spawn_setup_failed` on an empty store too. stderr `text <T> B` = UTF-8 bytes of the reader text (before env redaction).
9. P2: memory-snapshot.md temp file is created with flag "wx" (exclusive) in addition to mode 0600.
10. P2 verify: test gaps V-L1 (off-path loadSpy count read after mockRestore — vacuous) and V-L2 (atomic tmp→rename not pinned) folded into P3 red; V-L3 (block on resume) covered by P3 R3 test.
11. P2 verify note (0.37 candidate): an unreadable store logs the same "empty — no block" stderr line as an empty store, with no read_errors count.
12. P3: extra tests-only commit 67c2651 between red ee5fb82 and green 50d7a37 ((i) tests asserted reason ≠ needs_verification, but every parsed headless result has it — now assert output "done" and no fingerprint_changed note; biome quotes).
13. P3: R18 read = lstat, then open O_NOFOLLOW|O_NONBLOCK, fstat re-check, size re-check after read (closes swap-after-lstat window); ELOOP → "not a regular file".
14. P3: "bad record field" logged with `[headless] memory snapshot check failed (<id>):` prefix; existing skills-copy-failed stderr line now replaces CR/LF in cardId with spaces (small change to an existing line).
15. P3: recover() rebuilds the card with prompt "" so the recovery resume body is `RESUME\n\n` + wrapDispatchedPrompt("") — existing behaviour, now pinned.
16. P3: the "read error" test is skipped when running as root.
17. P3 verify (L1): swap-after-lstat hardening (O_NOFOLLOW/O_NONBLOCK/fstat) had no committed test — race tests folded into P4 red (probe: scratchpad/p3vprobe/p3v-probe.test.ts).
18. P3 verify (I1, docs): D9 is near-unobservable in practice — 0.35 already gave needs_verification on recovery/adopt mismatch via fingerprintChangedLocked; the removed randomUUID branch was reachable only in-process and headlessConfig is built once (bridge-runtime.ts:881). PLAN's upgrade memo example (permission/policy edit) was already needs_verification in 0.35 — correct in P5 docs. Upgrade 0.35→0.36 with memory off: 8/8 resume unchanged (verified with 5fa8167-written records).
19. P4: bridge-config memory tests in new bridge-config-memory.test.ts (no existing bridge-config.test.ts).
20. P4: R16 extra cases — profile omitted (resolveBridgeProfile → displayName e.g. "node/wsl-1" → hashed agentKey store read) and {enabled:false}; bridge reloads the session file per restart.
21. P4: R16 result asserted failed/needs_verification (normal for a finished headless card).
22. P4: parseMemory runs after workerConfigFromParts/parseAgentBin — with several invalid sections the earlier error wins.
23. P4: two non-race tests (directory / FIFO in place of the snapshot file) added with the race tests.
24. P4 verify (UK-6 measured): 13/13 same-env profile rows agree (CLI write store == bridge read store), incl. --profile, LOOM_PROFILE, LOOM_SESSION combos, hashed displayName, 4 service-unit rows. Docs: a service unit pins LOOM_SESSION, so `loom memory add` from a plain shell may write another store — use `--profile <service profile>` (or LOOM_SESSION). 0.37 note: a CLI run with the worker's scrubbed env (no LOOM_*) resolves to displayName, not the bridge profile — matters for worker-proposed memory.
25. P4 verify (docs): a 0.35 binary silently ignores `worker.memory` (memory off) and a 0.35 save (e.g. `bridge start --allow`) strips the key from the config file — downgrade note.
26. P4 verify (low, equivalent mutants): runtime `=== true` on memory.enabled is an extra unpinned safeguard (parser already guarantees boolean).
