# SnapshotAuthority — 0.46.0 P0 TLA oracle

Source rows: `docs/PLAN.md` §0.46.0 **D9 · R15 · P0** (incl. Astra 0261 M6 · Astra 0264 #3 · Astra 0266 #1/#2 ·
R69-M2 · R69-L1/L2) and the **Astra 0272** revision (#1–#7 — PLAN D4 · R10 · R11 patched for #3).
herdr facts: `docs/spikes/HERDR-STATUS-PROBES.md` §11 (H1–H22).
TLC = architect (lane has no Java). Every "expected" column below was written **before** the run of this revision.

- `SnapshotAuthority.tla` — model (one pane card · snapshot authority · events wake-only · relative clocks).
- `SnapshotAuthorityReach.tla` — `EXTENDS SnapshotAuthority`; `Not*` reachability invariants (expected violated).

Run from this folder (TLC 1.8.0 · Java 17, as in `BRIDGE-STARTUP-TLA.md`):

```bash
java -XX:+UseParallelGC -cp <tla2tools.jar> tlc2.TLC -deadlock -workers 4 -config SnapshotAuthority_Base.cfg SnapshotAuthority.tla
java -XX:+UseParallelGC -cp <tla2tools.jar> tlc2.TLC -deadlock -workers 4 -config SnapshotAuthorityReach_Completed.cfg SnapshotAuthorityReach.tla
```

`SnapshotAuthority_*.cfg` → `SnapshotAuthority.tla`; `SnapshotAuthorityReach_*.cfg` → `SnapshotAuthorityReach.tla`.
Any verdict other than the expected one → **P1 must not start**; record it; R69 re-judges (`_Base` violation =
design defect · `_NoFence` No error = fence rationale withdrawn).

**B** (base INV set) = `TypeOK NoEarlyCompletion NoFalseCompletion AtMostOneResult NoMixedAuthority NoStaleAttempt
NoDiscardedDelivery ReinjectBaselineIsEvidence WResetAuthorized` (`WResetAuthorized` added — Astra 0272 #3).
Base constants: `Capable` TRUE, all ablations FALSE (`PendingAsFallback NoFence NoToken StatusOnlyReset NoHintClear`),
environment switches FALSE (`MidRunCs Blocked LateDelivery Undeliverable SlowResp PermFail RepeatFail Hint TrackOld`),
`MaxFail 0`, `MaxRetries 1`, `W 3`, `WaitT 2`, `InitSts {"idle","done","working"}`. Every cfg assigns all 20
constants.

Properties: ER = `EventuallyResolved` · **CWAC-Final** = `CompletesWhenAgentCompletes` · **CWAC-Plan** =
`CompletesWhenAgentCompletesPlan` · CWAC-Uncond = `CompletesWhenAgentCompletesUncond` · CWAC-Old =
`CompletesWhenAgentCompletesOld`. A cfg expecting a violation checks only that property (TLC's first-violation stop
cannot hide the No error part — kept in a sibling cfg).

## CWAC — two antecedents (Astra 0272 #1)

- **CWAC-Final** (`ante ~> Completed`): *the final completion snapshot is applied before expiry* — a current-gen
  snapshot `status ∈ {done, idle} ∧ cs > lastConsumedCs` applied while the agent is quiet (no run, nothing submitted)
  and the snapshot is still the pane's current state (it excludes intermediate completions and completions while
  another submitted copy is pending). **This is PLAN's adopted contract** (PLAN D9/R15 narrowed 2026-10-24, Astra
  0272 #1). It is the property the positive cfgs check.
- **CWAC-Plan** (`anteP ~> Completed`): the **previous PLAN contract (CWAC-Plan)** — its literal antecedent *a*
  current-gen snapshot satisfying completion (`status ∈ {done, idle} ∧ cs > lastConsumedCs`) is applied before
  `lastAuthoritativeAt + W`. `_CwacPlanLiteralBase` (one run, nothing can cancel the attempt): **No error**.
  `_CwacPlanLiteral` (MidRunCs): **violated** — an intermediate completion is applied (antecedent true), a later
  snapshot `working` cancels the attempt (R6 ①), and W expires before the final completion snapshot applies. Kept
  as a record of why the previous contract was too weak once a completion attempt can be cancelled by re-entry.
- `Completed` = `result = "done"` ∨ (`result = "blocked"` ∧ `src = "hint"` ∧ ¬stale hint) — the existing completion
  machine may correct a completion to `agent_blocked` from a live `permission_prompt` hint (R5 M-2 ③, D1 "의미
  무변경"). Only reachable in `Hint` cfgs; elsewhere it is `result = "done"`.

## Liveness assumptions (Astra 0272 #2)

`Spec == Init ∧ [][Next]_vars ∧ Fairness`, `Fairness == ImplFair ∧ EnvAgentFair ∧ EnvFinishFair ∧ EnvHerdrFair`.

| conjunct | group | meaning | kind |
|---|---|---|---|
| `WF(AgentStart)` | `EnvAgentFair` | a submitted prompt eventually starts | **environment assumption** |
| `WF(AgentResume)` | `EnvAgentFair` | an intermediate `done` (MidRunCs) eventually resumes | **environment assumption** |
| `WF(AgentFinish)` | `EnvFinishFair` | a running card agent eventually stops working | **environment assumption** |
| `SF(PollOk)` | `EnvHerdrFair` | herdr answers successfully when recurrently asked | **environment assumption** |
| `WF(ConsumeEv)` | `ImplFair` | a delivered herdr push is handled | implementation obligation |
| `WF(PollSend)` | `ImplFair` | a queued `agent.get` is issued (bounded in-flight, FIFO executor) | implementation obligation |
| `WF(PollOk ∨ PollFail)` | `ImplFair` | an in-flight request returns or fails (RPC timeout) | implementation obligation |
| `WF(ScrapeDone)` | `ImplFair` | a settle scrape / still-running poll resolves (success or catch) | implementation obligation |
| `WF(WindowFire)` | `ImplFair` | an expired window fires at its tick | implementation obligation |
| `SF(Tick)` | `ImplFair` | the 2 s bridge-wide ticker keeps ticking | implementation obligation |
| `WF(Inject) WF(VerifyDelivered) WF(CloseRound) WF(ProbeResolve) WF(SendReinject) WF(CancelReinject) WF(FallbackResolve)` | `ImplFair` | inject / verify timers and awaits return | implementation obligation |

Unfair (environment options that may never happen): `AgentMid AgentBlock AgentUnblock Focus HintArrive Push GoDown`.

So **ER is not a consequence of polling plus W alone**: it also needs the agent to eventually stop working.
`_NoAgentFinish` (`SPECIFICATION SpecNoAgentFinish` — drops `WF(AgentFinish)`) records the violation: a delivered card
that works forever keeps resetting W (current gen ∧ `scs > b` ∧ `working` — R10). That case is outside P0 — the
existing card timeout / still-running path owns it. `SF(PollOk)` is **not** needed for ER: `_WeakPollFair`
(`SPECIFICATION SpecWeakPollFair`, `WF(PollOk)` only, `RepeatFail` world — polls may fail forever) expects No error
for ER (W expires: no successful snapshot = no reset; undelivered resets are bounded by retries) and for CWAC-Final
(its antecedent is the already-applied final completion; after that only the scrape — `ImplFair` — must run).
`SF(PollOk)` only matters for the *unconditional* CWAC, which is recorded as violated anyway.

## W reset (Astra 0272 #3 — PLAN D4 · R10 · R11 as patched)

W (`wAge`, the `lastAuthoritativeAt` analog) resets only on:

1. baseline success (R2 · R69-L1);
2. a round classified `undelivered` that consumes a retry (R3 · Astra 0266 #1);
3. an applied **current-generation** snapshot with `scs > b` ∧ (`scs > lastAppliedScs` ∨ status ≠ last applied
   status ∨ status = `working`).

A status change at `scs ≤ b` (e.g. focus `done → idle` at `scs = b`) and old-generation (discarded) responses do
**not** reset. `WResetAuthorized` (in B) is a ghost check (`badReset`) that every reset is one of these.
`_StatusOnlyReset` restores the retracted guard (status change / `scs > lastAppliedScs` regardless of `scs > b`, and
old-generation resets); the flag bypasses only the reset guard → `WResetAuthorized` violated (reused pane: baseline
`done`/`scs = b` → focus → applied `idle`/`scs = b` resets W).

## hookHint and R69-M2 (Astra 0272 #4)

`hookHint ∈ {"none", "permission_prompt"}`. `HintArrive` (environment, once, `Hint` TRUE) sets it while a card run is
`working`. Completion entry (R5) runs the M-2 ③ correction: a `permission_prompt` hint turns the completion into
`agent_blocked` (`src = "hint"`). R6 ② clears the hint on an observed `working ∧ scs > lastAppliedScs ∧ scs >
lastConsumedCs`. **R69-M2:** a snapshot `cs > lastConsumedCs` during an attempt (missed working) applies ① cancel +
token invalidation and ② hint clear **before** the re-entry (`Rearm`), so the correction at re-entry reads the
cleared hint. Ghost `hintStale` marks a hint that survived a Rearm; `NoStaleHintAfterRearm` = no completion is
corrected by such a hint. `_NoHintClear` skips only the Rearm clear → violated. `Reach_HintClearedOnRearm` witnesses
the clear followed by a `done`.

## Main cfgs (`SnapshotAuthority.tla`)

| cfg | purpose | INV | PROP | expected |
|---|---|---|---|---|
| `_Base` | p22 herdr, no failures, bounded latency | B | ER · CWAC-Final | No error |
| `_PollFail` | bounded agent.get failures (`MaxFail 2`) | B | ER · CWAC-Final | No error |
| `_RepeatFail` | unbounded intermittent failures (SF on PollOk) | B | ER · CWAC-Final | No error |
| `_Blocked` | card run may go `blocked` (D4 · R7) | B | ER · CWAC-Final | No error |
| `_MidRunCsRest` | MidRunCs world (Cancel · Rearm · M2 live) + `Hint` TRUE | B − NoEarly + NoStaleHintAfterRearm | ER · CWAC-Final | No error |
| `_Fallback` | capability-negative → `fallback` (D3) | TypeOK AtMostOneResult NoMixedAuthority | ER | No error |
| `_PermFail` | herdr may go permanently down | B | ER · CWAC-Final | No error |
| `_PermFailUncond` | same world | TypeOK | CWAC-Uncond | **CWAC-Uncond violated** (record — class 109) |
| `_SlowResp` | response may outlive W (Astra 0261 M6) | B | ER · CWAC-Final | No error (boundary witnessed by Reach `_SlowRespWindow`) |
| `_SlowRespUncond` | same world | TypeOK | CWAC-Uncond | **CWAC-Uncond violated** (record — class 119) |
| `_ResidualW` | completion snapshot after residual W (`MaxFail 2`, `MaxRetries 0`, `InitSts {"idle"}`) | B | ER · CWAC-Final | No error (antecedent false reachable — Reach `_AnteFalseResidualW`) |
| `_ResidualWOld` | same + `TrackOld` | TypeOK | CWAC-Old | **CWAC-Old violated** (boundary record) |
| `_AltRounds` | undelivered/unknown rounds alternate, then permanent failure (`Undeliverable`, `RepeatFail`, `PermFail`, `MaxRetries 2`, `InitSts {"idle","done"}`) | B − NoEarly − NoFalse + AltResultOK | ER | No error (mix witnessed by Reach `_AltRoundsMix`) |
| `_LateDeliveryCard` | `LateDelivery` world, narrowed guarantee (R17b) | B + CardPromptAttribution | ER · CWAC-Final | No error |
| `_CwacPlanLiteralBase` | Base world, previous PLAN contract (CWAC-Plan) antecedent (Astra 0272 #1) | TypeOK | CWAC-Plan | No error |
| `_CwacPlanLiteral` | MidRunCs world (`InitSts {"idle"}`), previous PLAN contract (CWAC-Plan) antecedent | TypeOK | CWAC-Plan | **CWAC-Plan violated** (record — antecedent too weak) |
| `_WeakPollFair` | `_RepeatFail` world, `SpecWeakPollFair` (WF instead of SF on PollOk) | B | ER · CWAC-Final | No error |
| `_NoAgentFinish` | Base world, `SpecNoAgentFinish` (no WF on AgentFinish) | TypeOK | ER | **ER violated** (record — outside P0) |
| `_NoFence` | ablation: remove only the `cs > lastConsumedCs` fence (H18; `InitSts {"idle","done"}`) | TypeOK NoFalseCompletion | — | **NoFalseCompletion violated** |
| `_NoToken` | ablation: bypass only the attempt-token check, generation check kept (H2; MidRunCs, `InitSts {"idle"}`) | TypeOK NoStaleAttempt | — | **NoStaleAttempt violated** |
| `_PendingAsFallback` | ablation: `pending` takes the 0.45.4 event path (H1) | TypeOK NoMixedAuthority | — | **NoMixedAuthority violated** |
| `_StatusOnlyReset` | ablation: retracted W-reset guard (Astra 0272 #3; `InitSts {"idle","done"}`) | TypeOK WResetAuthorized | — | **WResetAuthorized violated** |
| `_NoHintClear` | ablation: R69-M2 Rearm skips the hint clear (Astra 0272 #4; MidRunCs + Hint, `InitSts {"idle"}`) | TypeOK NoStaleHintAfterRearm | — | **NoStaleHintAfterRearm violated** |
| `_MidRunCs` | **environment boundary control**: cs rises mid-run (D11 · class 106; `InitSts {"idle"}`) | TypeOK NoEarlyCompletion | — | **NoEarlyCompletion violated** (declared limit) |
| `_LateDelivery` | **environment boundary control**: first delivery starts after the reinject (H4 · class 107; `InitSts {"idle"}`) | TypeOK CurrentRunAttribution | — | **CurrentRunAttribution violated** (declared limit) |

Ablations (`_NoFence _NoToken _PendingAsFallback _StatusOnlyReset _NoHintClear`) remove exactly one mechanism
(Astra 0272 #6: `_NoFence` no longer adds `curCopy > 0 ∧ ¬deferral` and keeps `lastConsumedCs` updates; `_NoToken`
keeps the `runGen` check). `_MidRunCs` / `_LateDelivery` are **environment boundary controls**, not ablations: they
widen the environment to show a declared limit, the mechanisms are unchanged.

Note on `_NoFence`: without the fence (and without the old `¬deferral` guard) every applied `done`/`idle` during an
attempt is a Rearm, so `tokCtr` is unbounded in that ablation. The expected violation is shallow (boot / post-prompt
`idle` at `scs = b` consumed with `cs = null` within ~8 steps), so BFS reports it before the growth matters; a
non-terminating `_NoFence` run means the violation was **not** found — treat as a mismatch.

## Reachability cfgs (`SnapshotAuthorityReach.tla`; all expected: `Invariant Not* is violated`)

| cfg | constants | INV | PROP | witness |
|---|---|---|---|---|
| `Reach_Completed` | base | TypeOK NotCompleted | — | snapshot completion fires |
| `Reach_CompletedAfterCR` | base | TypeOK NotCompletedAfterCR | — | completion after a CR reinject |
| `Reach_CompletedAfterRetype` | base | TypeOK NotCompletedAfterRetype | — | completion after a retype reinject |
| `Reach_ReinjectCR` | base | TypeOK NotReinjectCR | — | CR key sent (R17a hit / read-fail) |
| `Reach_ReinjectRetype` | base | TypeOK NotReinjectRetype | — | retype key sent (R17a miss, once per verify call) |
| `Reach_Undelivered` | base | TypeOK NotUndelivered | — | an `undelivered` round consumes a retry |
| `Reach_CancelReinject` | `LateDelivery`, `InitSts {"idle","done"}` | TypeOK NotCancelReinject | — | key-before cache check cancels the reinject (㉘) |
| `Reach_Unavail` | base | TypeOK NotUnavail | — | `status_unavailable` window fires |
| `Reach_Unconfirmed` | base | TypeOK NotUnconfirmed | — | retries exhausted → `inject_unconfirmed` |
| `Reach_Blocked` | `Blocked`, `InitSts {"idle"}` | TypeOK NotBlocked | — | `agent_blocked` from snapshot |
| `Reach_WakeInflight` | base | TypeOK NotWakeInflight | — | wake while `pq = "inflight"` → `snapDirty` |
| `Reach_PendingEvent` | base | TypeOK NotPendingEvent | — | event / ACK while `mode = "pending"` |
| `Reach_CancelWithScrape` | `MidRunCs`, `InitSts {"idle"}` | TypeOK NotCancelWithScrape | — | `Cancel` with the scrape still outstanding |
| `Reach_RearmNoCancel` | `MidRunCs`, `InitSts {"idle"}` | TypeOK NotRearmNoCancel | — | **R69-M2** Rearm without an observed `Cancel` |
| `Reach_CompletedAfterRearm` | `MidRunCs`, `InitSts {"idle"}` | TypeOK NotCompletedAfterRearm | — | the M2-rearmed attempt completes |
| `Reach_HintClearedOnRearm` | `MidRunCs` + `Hint`, `InitSts {"idle"}` | TypeOK NotHintClearedOnRearm | — | **R69-M2** Rearm clears a pre-Rearm hint, then `done` (㊹) |
| `Reach_AnteFalseResidualW` | `_ResidualW` | TypeOK NotAnteFalse | — | agent completed, window first, CWAC-Final antecedent false |
| `Reach_AnteFalseSlowResp` | `_SlowResp` (`InitSts {"idle"}`) | TypeOK NotAnteFalse | — | same under slow responses (kept; does **not** by itself witness the delay boundary — Astra 0272 #5) |
| `Reach_SlowRespWindow` | `_SlowResp` (`InitSts {"idle"}`) | TypeOK NotSlowRespWindow | — | window fires while a request issued before W expired (`pRem > 0`) and before the agent's completion (`pStale`) is still in flight, ≥ 1 tick old (`pAge > 0`) with latency ≥ the remaining W at issue (`pAge ≥ pRem`) — Astra 0275 #1 excludes the zero-latency issue at expiry |
| `Reach_AltRoundsMix` | `_AltRounds` | TypeOK NotAltRoundsMix | — | ≥ 1 `undelivered` (retry consumed) and ≥ 1 `unknown` round, `GoDown` after an `undelivered` classification (ghost `downAfterUndel` — Astra 0275 #2), then result ∈ {unconfirmed, failed_unavail} |
| `Reach_OldAnteUnavail` | `_ResidualWOld` | TypeOK NotOldAnteUnavail | — | old antecedent true ∧ `failed_unavail` |
| `Reach_Fallback` | `Capable` FALSE, `InitSts {"idle"}` | TypeOK NotFallback | — | `fallback` mode entered |

(file names carry the `SnapshotAuthority_` / `SnapshotAuthorityReach_` prefix; 25 + 22 = 47 cfgs.)

## Predicted verdicts for the 0272 revision (lane reasoning, before TLC)

- Existing positive cfgs stay **No error**: the narrowed W reset only removes resets (status change at `scs ≤ b`,
  old-generation responses), so ER can only get easier (fewer resets) and CWAC-Final's antecedent is post-application
  (the attempt then holds the window via `deferral`). `WResetAuthorized` holds by construction without the ablation.
- `_MidRunCsRest` with `Hint`: a fresh hint may turn the final completion into `agent_blocked`/`src = "hint"` —
  counted by `Completed`, so CWAC-Final stays No error; `NoStaleHintAfterRearm` holds because the Rearm clears.
- Existing negative cfgs keep their verdicts: `_NoFence` (boot `idle` consumed, `cs = null` ∉ card stamps), `_NoToken`
  (the stale scrape is from the same generation, so keeping the generation check does not hide it), `_MidRunCs`,
  `_LateDelivery`, `_PendingAsFallback`, the `Uncond`/`Old` records.
- Existing Reach witnesses stay reachable (none depended on a status-only or old-generation reset; `_ResidualW` /
  `_SlowResp` antecedent-false paths get easier with fewer resets).

## TLC results (architect run 3, 2026-10-24)

TLC `2026.10.20.183001` (= 1.8.0), `java -XX:+UseParallelGC -cp tla2tools.jar tlc2.TLC -workers 4 -deadlock -config
<cfg> <module>.tla`, Java 17.0.6, run by the architect on the Astra 0272 revision plus the Astra 0275 reach fixes
(`slowWin` tightened, `downAfterUndel` added). All 47 verdicts match the expected column above (mechanical
cross-check: 47 checked, 0 mismatch) and are identical to run 2. Exit distribution: 13 × exit 0 (No error) · 29 ×
exit 12 (invariant violated) · 5 × exit 13 (temporal property violated).

Architect fix before run 2: `SnapshotAuthority.tla:307` parenthesised `(IF SlowResp THEN W - wAge ELSE 0)` —
operator precedence made run 1 of this revision error on every cfg, so run 1 produced no verdicts.

Witness checks (architect, from the TLC traces — Astra 0275):

- `Reach_SlowRespWindow` depth 11 — request issued with `pRem = 2` before inject, `pAge = 2` at `WindowFire`,
  `pStale`, result `failed_unavail`.
- `Reach_AltRoundsMix` depth 18 — `undelivered` `CloseRound` → `GoDown` (`downAfterUndel`) → `unknown` `CloseRound`
  → `WindowFire` `failed_unavail`.

| cfg | verdict | distinct states | depth | expected vs actual |
|---|---|---|---|---|
| `SnapshotAuthority_AltRounds` | No error has been found | 27,422 | 33 | match |
| `SnapshotAuthority_Base` | No error has been found | 12,884 | 31 | match |
| `SnapshotAuthority_Blocked` | No error has been found | 14,713 | 33 | match |
| `SnapshotAuthority_CwacPlanLiteral` | Error: Temporal property CompletesWhenAgentCompletesPlan was violated. | 29,397 | 36 | match |
| `SnapshotAuthority_CwacPlanLiteralBase` | No error has been found | 23,829 | 31 | match |
| `SnapshotAuthority_Fallback` | No error has been found | 667 | 12 | match |
| `SnapshotAuthority_LateDelivery` | Error: Invariant CurrentRunAttribution is violated. | 12818 | 17 | match |
| `SnapshotAuthority_LateDeliveryCard` | No error has been found | 13,821 | 42 | match |
| `SnapshotAuthority_MidRunCs` | Error: Invariant NoEarlyCompletion is violated. | 930 | 10 | match |
| `SnapshotAuthority_MidRunCsRest` | No error has been found | 15,225 | 37 | match |
| `SnapshotAuthority_NoAgentFinish` | Error: Temporal property EventuallyResolved was violated. | 28484 | 21 | match |
| `SnapshotAuthority_NoFence` | Error: Invariant NoFalseCompletion is violated. | 518 | 8 | match |
| `SnapshotAuthority_NoHintClear` | Error: Invariant NoStaleHintAfterRearm is violated. | 20154 | 14 | match |
| `SnapshotAuthority_NoToken` | Error: Invariant NoStaleAttempt is violated. | 8380 | 13 | match |
| `SnapshotAuthority_PendingAsFallback` | Error: Invariant NoMixedAuthority is violated. | 26 | 4 | match |
| `SnapshotAuthority_PermFail` | No error has been found | 12,129 | 32 | match |
| `SnapshotAuthority_PermFailUncond` | Error: Temporal property CompletesWhenAgentCompletesUncond was violated. | 25692 | 16 | match |
| `SnapshotAuthority_PollFail` | No error has been found | 14,399 | 35 | match |
| `SnapshotAuthority_RepeatFail` | No error has been found | 10,548 | 31 | match |
| `SnapshotAuthority_ResidualW` | No error has been found | 11,972 | 28 | match |
| `SnapshotAuthority_ResidualWOld` | Error: Temporal property CompletesWhenAgentCompletesOld was violated. | 27409 | 17 | match |
| `SnapshotAuthority_SlowResp` | No error has been found | 12,398 | 37 | match |
| `SnapshotAuthority_SlowRespUncond` | Error: Temporal property CompletesWhenAgentCompletesUncond was violated. | 22521 | 15 | match |
| `SnapshotAuthority_StatusOnlyReset` | Error: Invariant WResetAuthorized is violated. | 602 | 8 | match |
| `SnapshotAuthority_WeakPollFair` | No error has been found | 13,452 | 31 | match |
| `SnapshotAuthorityReach_AltRoundsMix` | Error: Invariant NotAltRoundsMix is violated. | 10598 | 18 | match |
| `SnapshotAuthorityReach_AnteFalseResidualW` | Error: Invariant NotAnteFalse is violated. | 1437 | 11 | match |
| `SnapshotAuthorityReach_AnteFalseSlowResp` | Error: Invariant NotAnteFalse is violated. | 1271 | 10 | match |
| `SnapshotAuthorityReach_Blocked` | Error: Invariant NotBlocked is violated. | 448 | 10 | match |
| `SnapshotAuthorityReach_CancelReinject` | Error: Invariant NotCancelReinject is violated. | 15393 | 15 | match |
| `SnapshotAuthorityReach_CancelWithScrape` | Error: Invariant NotCancelWithScrape is violated. | 5032 | 13 | match |
| `SnapshotAuthorityReach_Completed` | Error: Invariant NotCompleted is violated. | 2189 | 10 | match |
| `SnapshotAuthorityReach_CompletedAfterCR` | Error: Invariant NotCompletedAfterCR is violated. | 15021 | 17 | match |
| `SnapshotAuthorityReach_CompletedAfterRearm` | Error: Invariant NotCompletedAfterRearm is violated. | 13146 | 15 | match |
| `SnapshotAuthorityReach_CompletedAfterRetype` | Error: Invariant NotCompletedAfterRetype is violated. | 15087 | 17 | match |
| `SnapshotAuthorityReach_Fallback` | Error: Invariant NotFallback is violated. | 22 | 5 | match |
| `SnapshotAuthorityReach_HintClearedOnRearm` | Error: Invariant NotHintClearedOnRearm is violated. | 32348 | 15 | match |
| `SnapshotAuthorityReach_OldAnteUnavail` | Error: Invariant NotOldAnteUnavail is violated. | 4122 | 14 | match |
| `SnapshotAuthorityReach_PendingEvent` | Error: Invariant NotPendingEvent is violated. | 8 | 3 | match |
| `SnapshotAuthorityReach_RearmNoCancel` | Error: Invariant NotRearmNoCancel is violated. | 8168 | 14 | match |
| `SnapshotAuthorityReach_ReinjectCR` | Error: Invariant NotReinjectCR is violated. | 4539 | 12 | match |
| `SnapshotAuthorityReach_ReinjectRetype` | Error: Invariant NotReinjectRetype is violated. | 4593 | 12 | match |
| `SnapshotAuthorityReach_SlowRespWindow` | Error: Invariant NotSlowRespWindow is violated. | 1982 | 11 | match |
| `SnapshotAuthorityReach_Unavail` | Error: Invariant NotUnavail is violated. | 202 | 6 | match |
| `SnapshotAuthorityReach_Unconfirmed` | Error: Invariant NotUnconfirmed is violated. | 14393 | 17 | match |
| `SnapshotAuthorityReach_Undelivered` | Error: Invariant NotUndelivered is violated. | 2226 | 10 | match |
| `SnapshotAuthorityReach_WakeInflight` | Error: Invariant NotWakeInflight is violated. | 56 | 4 | match |

Summary: positive No error 13 · ablations violated as expected 5 (`_NoFence _NoToken _PendingAsFallback
_StatusOnlyReset _NoHintClear`) · environment boundary controls violated as expected 2 (`_MidRunCs _LateDelivery`) ·
liveness records violated as expected 5 (`_PermFailUncond _SlowRespUncond` CWAC-Uncond · `_ResidualWOld` CWAC-Old ·
`_CwacPlanLiteral` CWAC-Plan · `_NoAgentFinish` ER) · reachability witnesses reached 22/22.

Superseded: the earlier architect run on the pre-Astra 0272 model (38 cfgs, all matched) was never committed — the
model was revised before the first commit. TLC trace files (`*_TTrace_*`) are not kept in the repo.

Known limit (Astra 0278 L, author-close Low backlog): `NotAltRoundsMix` does not itself order `GoDown` before the
terminal result (`GoDown` has no `Alive` guard), so a future violation of it needs trace inspection; the run-3 witness
above was inspected and has the required order.

## Modelling choices (`\* NOTE:` in the model)

- Time: 1 Tick = 1 poll period; `WaitT 2` = waitMs 4 s, `Half = 1`; W shrunk to 3 ticks. Relative saturating clocks.
- `~SlowResp`: a response lands before the next tick. A cap-queued request (㊲) is the same as a slow response.
- `~LateDelivery`: a submitted prompt starts before the next tick (LatencyBound analog).
- Late-half evidence counts by **receive** time (R3 literal); a `SlowResp` response from the previous round can land in the next round's late half.
- Old-generation responses: discarded, window clock untouched (R11 as patched for Astra 0272 #3).
- Scrape probe hit / miss / fail is nondeterministic regardless of the input box; retype absorbs an unsubmitted copy 1.
- CWAC-Final antecedent `ante` = the *final* completion snapshot (agent quiet, snapshot still current) was applied; CWAC-Plan antecedent `anteP` = any fenced completion snapshot applied.
- A busy pane (`InitSts` "working") never finishes its pre-existing work (UK-4 · class 118).
- hookHint: one `permission_prompt` arrival per flight (`Hint`); the correction table is collapsed to "permission_prompt → agent_blocked".

## Not covered by P0 (P1/P2/D11 obligations — Astra 0272 #7)

The TLC results do not discharge these; they remain code-test (P1/P2) or D11 obligations.

- Numeric-field normalization, missing/null distinctions, and capability-field loss after baseline (R1 · R13).
- Probe **hit / read-fail → CR** versus **miss → retype**: outcomes are collapsed into nondeterministic method
  selection (`ProbeResolve`); only the one-retype-per-verify-call guard is modelled (R17 · R69-M1).
- Still-running timeout behavior (folded into the scrape), the full hook-correction decision table (only one
  `permission_prompt` hint is modelled), the window-fire hint correction (R10 tail — `reason: "snapshot_unavailable"`),
  separate success/catch paths of the scrape (identical token re-check, one action), issuer lease and terminal-latch
  integration (CAS = `nres`).
- Global concurrency cap / FIFO across panes (R11 — single card; a cap-queued request = a slow response), shutdown
  cleanup, subscription failures (R9), `pane_closed` (R8), and the 0.45.4 fallback internals (`FallbackResolve`).
- Delivered `idle` with missing completion sequence (future herdr nulling cs — class 113), detector / focus behavior
  beyond H10 (`Focus`), and D11's real-card evidence.
