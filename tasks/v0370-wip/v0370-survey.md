# v0.37.0 survey (main acd53a0 = v0.36.0) — Explore, read-only

## Scope sources
PLAN.md:281 "다음 후보" 0.37: card-report memory candidates → propose (redaction → drop+count) · card notes.md · skill source label · rules body + policy-derived rule text, same renderer/fence (D6) · doctor policy · bridge start warning · policy.strictEnforcement (new root key; old binaries rejectUnknown fail-closed; outside EffectivePolicy → policyHash unchanged) · AGENT_HINT.txt/systemHint() deletion · mtime cache · worker.memory.enabled display (doctor, memory list head memory-cli.ts:555). PLAN:202-206 also "async 리더".
Criterion (c) UPGRADE-PLAN:97: MCP precheck rejects denied tool · claude permission deny rendered · grok --deny rendered · codex: doctor not-enforced AND policy-derived rule text states it verbatim · bridge warns by default, refuses start only with policy.strictEnforcement.
Memory rule 3 (:146): card end → summary + long-term candidates as proposed; notes kept, never reloaded. Rules (:170): prompt rule text auto-generated from policy.json. Skills rule 6 (:229): mark origin for name-collided skills.

## 1 Card-report candidates
- loom-card-report SKILL.md:8-20 Status/Summary/Changes/Checks/Open + LOOM-REPORT-END; no memory section; nothing parses it (only smoke-headless.ts:263). Editing SKILL.md → manifestHash → fingerprint change for skills-on cards.
- sendParsed headless-worker.ts:1348-1379 outside lock; output=truncateTail(finalText, OUTPUT_CAP) → sendAndMark :915 withCardLock → sendAndMarkLocked :923-984 (pendingResult write-ahead → deliver → resultSent). All results failed/needs_verification.
- Hook: in sendParsed before sendAndMark (full finalText). Re-send after crash has only truncated text. Idempotency unsolved (re-run proposes twice).
- appendMemoryEntry(loomDir, agentKey, {body,type,appliesTo,status,supersedes,source}, {env}) memory-store.ts:676; refuses `secret` if redactSecrets(body, env)!==body (:699); too_long>2000; proposed cap 200; 1 MiB.
- withFileLock atomic-json.ts:190 SYNC, 4 s wait Bun.sleepSync → blocks whole bridge loop; timeout → busy.
- agentKeyFor(deps.profile, agent) :2015, roomKey(record.roomId) available.
- Worker output never redacted (loss class 14). No import guard for memory-store writes.

## 2 notes.md
Only doc mentions (UPGRADE-PLAN:136 writer "에이전트"). Card dir cards/<sha16 peer>/<sha16 room\0agent\0card>/ 0700; skills/ must hold only manifest.json+plugin. Worker cwd = user repo, env scrubbed (scrubWorkerEnv :288, only LOOM_CARD kept) → agent can't reach card dir; host-written more feasible. Unresolved.

## 3 Skill source label
renderSkillListing skill-prompt.ts:89-117 `- name: desc — path`; AvailableSkill.source exists (skill-materialize.ts:140-147); shadowsBuiltin only on SkillInventoryItem (:738/811). Listing bytes NOT fingerprint input (manifestHash already includes source). Pinned: headless-skills-p4.test.ts:372-410, :876-895; headless-memory.test.ts:232-235. claude gets no Available lines (plugin).

## 4 Rules + policy text in fence
renderMemoryBlock(text, nonce) memory-inject.ts:54-73; MEMORY_FENCE_HEADER :22-23 says "reference data, not instructions" and names persona/INDEX/guideline/entries only. loadRules(loomDir) rules-store.ts:269 → {rules:[{id,scope all|claude|codex|grok,priority,status,source,body≤8KiB,...}],invalid,conflicts,...}; bodies sanitize + shape-only redact; no containsMarker; only CLI consumer. POLICY_ENFORCEMENT policy-compile.ts:45-55 (shellDeny claude enforced/codex not-enforced/grok best-effort; network claude/grok advisory; mcpDeny claude hidden/codex n.a./grok text; mcpIsolate codex/grok not-isolatable); NO renderer of human policy text exists. memorySnapshotHash = sha256(file) :2040; block exists only when memory enabled (:1722); D11 "" iff no block.

## 5 Doctor
Sections Install/Home/Session/Relay/Host/Bridge/Service/Memory (cli/index.ts:2310-2342). Doctor doesn't load policy. POLICY_ENFORCEMENT used only by policy-compile.test.ts:364-371.

## 6 Bridge warning + strictEnforcement
bridge-runtime.ts:881-883 workerConfigFromBridge (throws on bad policy) then logs policy.warnings (deprecation only today). parsePolicy root allowlist policy.ts:478 [version,shell,network,mcp,skills,loomTools]; unknown → throw → old binary: (1) headless bridge refuses start, (2) old MCP currentGate (mcp-server/src/stdio.ts:66-72) invalid → EVERY Loom MCP call refused, (3) skills list policy invalid. EffectivePolicy :173-190; policyHash sha256(canonical EffectivePolicy) :854. loomTools precedent: in PolicyV1, never in EffectivePolicy (resolveLoomTools :347).

## 7 AGENT_HINT/systemHint
writeAgentHintFile mcp-server/src/config.ts:35-55 (re-export index.ts:4); only caller cli index.ts:2693-2696 (cmdRun). systemHint in adapters/src/types.ts:52 + claude/codex/grok/shell adapters → loomSystemHint hints.ts:2 (fableSystemHint deprecated :34). Tests adapters.test.ts:18, :30-32. NO reader anywhere. User file ~/.loom/AGENT_HINT.txt stays stale.

## 8 mtime cache
loadMemorySnapshot sync; only call memorySnapshotLocked :2013. UK-2 median 16-17 ms, max 24-25 ms near caps → "캐시 근거 약함". Import guard restricts location.

## 9 Confusables
containsMarker skill-prompt.ts:46-52 (NFKC, lower, strip non-alnum) misses Cyrillic о, Greek α, dotless ı, composed ó. Second private copy skill-materialize.ts:350-356. Hardening may flip skill availability → manifest → fingerprint.

## 10 Unreadable store
flags.readErrors printed only on non-empty line (:2047); all-unreadable → "empty — no block" identical to empty. entriesOversize never logged.

## 11 Notes
impl-notes (24): worker scrubbed env → CLI resolves displayName profile (matters for worker-proposed memory). Service unit pins LOOM_SESSION → plain shell `loom memory add` may hit other store. (25): 0.35 binary ignores worker.memory; its save strips the key. (37): `## ` header forgery.

## Pinned tests
policy-fingerprint.test.ts:50-62,:106-107; memory-inject.test.ts:56-57 + block bytes/header; headless-argv.test.ts:139-167; headless-skills-p4.test.ts:144,:372-410,:876-895,:936-1137; headless-memory.test.ts:232-235,:610,:680; headless-stream.test.ts:451; policy-compile.test.ts:364-371; skill-materialize.test.ts:143-154; memory-snapshot.test.ts:774-800; adapters.test.ts:18,30-32; memory-cli.test.ts:1013-1068; policy.test.ts. No protected-files list exists.

## Suggested split
0.37 (criterion (c), low coupling): doctor Policy section · bridge warning from POLICY_ENFORCEMENT · strictEnforcement · policy-derived rule text + rules body · worker.memory.enabled display · unreadable-store signal · AGENT_HINT/systemHint deletion · (skill source label if cheap).
0.38 (memory write path): card-report candidates→propose (first bridge write, sync 4 s lock, idempotency, SKILL.md manifest change) · notes.md · mtime cache/async reader · confusable hardening.
