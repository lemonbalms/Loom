---- MODULE SnapshotAuthorityReach ----
\* 0.46.0 P0 reachability helpers (PLAN §0.46.0 R15 "도달 확인 필수 — 공허한 통과 배제", §8 precedent).
\* Every Not* below is checked as an INVARIANT in its own SnapshotAuthorityReach_*.cfg; the expected TLC
\* verdict is "Invariant Not* is violated" — the counterexample trace IS the witness that the path exists.
\* An unexpected "No error" means the corresponding SnapshotAuthority_*.cfg No error is vacuous on that path.
EXTENDS SnapshotAuthority

\* completion fired (snapshot path)
NotCompleted          == ~SnapDone
\* completion after a CR reinject / after a retype reinject (R17 a / b)
NotCompletedAfterCR   == ~(SnapDone /\ lastRe = "cr")
NotCompletedAfterRetype == ~(SnapDone /\ retyped)
\* reinject keys: CR and retype, each
NotReinjectCR         == lastRe # "cr"
NotReinjectRetype     == ~retyped
\* an "undelivered" round consumed a retry (Astra 0266 #1)
NotUndelivered        == retries = MaxRetries
\* key-before cache check cancelled a confirmed reinject (Astra 0266 #2 · test ㉘)
NotCancelReinject     == ~reCancel
\* window fired · inject_unconfirmed · agent_blocked
NotUnavail            == result # "failed_unavail"
NotUnconfirmed        == result # "unconfirmed"
NotBlocked            == result # "blocked"
\* poller re-get mark: a wake while the request is in flight (R11 "inflight -> snapDirty")
NotWakeInflight       == ~(pq = "inflight" /\ dirty)
\* mode race: an event / ACK arrives while the flight is still "pending" (Astra 0261 H1)
NotPendingEvent       == ~(mode = "pending" /\ evq # "none")
\* Cancel while a scrape is outstanding: attempt cancelled, its scrape still pending (scrape # none /\ Cancel)
NotCancelWithScrape   == ~(~deferral /\ \E sc \in scrs : sc[1] # att)
\* R69-M2: Rearm without an observed Cancel (missed working; new cs > lastCs during the attempt)
NotRearmNoCancel      == ~m2
\* a completion after a stale scrape existed (old attempt pending when the new one won — test ㉗)
NotCompletedAfterRearm == ~(SnapDone /\ m2)
\* conditional-CWAC antecedent false while the agent completed (Astra 0264 #3 — _ResidualW / _SlowResp).
\* NOTE (Astra 0272 #5): for _SlowResp this does not by itself witness the response-delay boundary — see
\* NotSlowRespWindow.
NotAnteFalse         == ~(result = "failed_unavail" /\ FinStamps # {} /\ AgentQuiet /\ ~ante)
\* the retracted antecedent held but the window fired first (boundary witness for _ResidualWOld)
NotOldAnteUnavail     == ~(oldAnte /\ result = "failed_unavail")
\* capability-negative baseline -> fallback (D3)
NotFallback           == mode # "fallback"
\* Astra 0272 #5 · 0275 #1 (_SlowResp constants): the window fires while a poll request is still in flight that
\* was issued before W expired (pRem > 0) and before the agent's completion (pStale), has been in flight >= 1 tick
\* (pAge > 0), and whose latency already reached the remaining W at issue time (pAge >= pRem) — ghost slowWin
NotSlowRespWindow     == ~slowWin
\* Astra 0272 #5 · 0275 #2 (_AltRounds constants): >= 1 "undelivered" round (a retry consumed) and >= 1 "unknown"
\* round in this flight, permanent failure (GoDown) after an "undelivered" classification, then a terminal result
\* \in {unconfirmed, failed_unavail}
NotAltRoundsMix       == ~(sawUndel /\ sawUnk /\ retries < MaxRetries /\ downAfterUndel
                           /\ result \in {"unconfirmed", "failed_unavail"})
\* Astra 0272 #4 (MidRunCs + Hint): an R69-M2 Rearm cleared a permission_prompt hint, then the rearmed attempt
\* completed as done (not corrected to blocked)
NotHintClearedOnRearm == ~(SnapDone /\ hintCleared)
====
