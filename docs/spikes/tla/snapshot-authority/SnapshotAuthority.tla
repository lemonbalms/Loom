---- MODULE SnapshotAuthority ----
\* 0.46.0 P0 — snapshot-authority oracle (docs/PLAN.md §0.46.0 rows D9 · R15 · P0, incl. Astra 0261 M6 ·
\* Astra 0264 #3 · Astra 0266 #1/#2 · R69-M2 · R69-L1/L2 · Astra 0272 #1–#6). A NEW small model derived from the
\* invariant (not the 4-round BridgeStartupFixed): one pane card, one flight, herdr agent.get snapshots as the only
\* completion/failure authority, events = poller wake-ups only.
\*
\* herdr facts the agent model respects (HERDR-STATUS-PROBES.md §11):
\*   H7  scs = per-pane last-change stamp drawn from a global counter (ctr); a same-status re-report and a
\*       focus change do not bump it.          H8/H20 working->idle publishes level "done"; cs = that scs;
\*       cs = null (0 here) while working; cs survives a focus change.   H9 "done" at every working->idle
\*       edge incl. intermediate ones (MidRunCs).   H10 focus during "done" -> "idle", scs unchanged (Focus).
\*   H6/H17 no replay to a new subscriber; H13 events carry no seq -> events only wake the poller.
\*   H18 agent.prompt returns while the pane is still "idle" at scs = b (Inject changes no herdr state;
\*       AgentStart happens later).        H12 unknown / not found / RPC error = no authority (PollFail).
\*
\* Expected TLC verdicts (P0 row; run from this folder, `-deadlock -workers 4`; any mismatch = P1 must not
\* start, record, R69 re-judges). Per-cfg list with INV/PROP and reasoning: README.md in this folder.
\*   _Base _PollFail _RepeatFail _Blocked _MidRunCsRest _Fallback _PermFail _SlowResp _ResidualW
\*   _LateDeliveryCard _AltRounds _CwacPlanLiteralBase _WeakPollFair                No error
\*   _PermFailUncond _SlowRespUncond                       CompletesWhenAgentCompletesUncond VIOLATED
\*   _ResidualWOld                                         CompletesWhenAgentCompletesOld VIOLATED (boundary)
\*   _CwacPlanLiteral                                      CompletesWhenAgentCompletesPlan VIOLATED (record)
\*   _NoAgentFinish                                        EventuallyResolved VIOLATED (record)
\*   _NoFence  NoFalseCompletion VIOLATED      _MidRunCs  NoEarlyCompletion VIOLATED
\*   _LateDelivery  CurrentRunAttribution VIOLATED       _NoToken  NoStaleAttempt VIOLATED
\*   _PendingAsFallback  NoMixedAuthority VIOLATED       _StatusOnlyReset  WResetAuthorized VIOLATED
\*   _NoHintClear  NoStaleHintAfterRearm VIOLATED
\*   SnapshotAuthorityReach_*.cfg  each Not* invariant VIOLATED (= the path is reachable, non-vacuous)
\*
\* Time is discrete: one Tick = one poll period (SNAPSHOT_POLL_MS 2 s). WaitT = submitVerify.waitMs in ticks
\* (4 s = 2 ticks), Half = WaitT \div 2 (the late-half boundary t0 + waitMs/2), W = status_unavailable window
\* in ticks (shrunk from 300 ticks to a small constant). Clocks are relative (wAge, rAge, fAge, pAge —
\* saturating), so the state space stays finite without a global clock.
\*
\* Not modelled (code tests only — README "Not covered by P0"): agentGetConcurrency cap / global FIFO (single
\* card — a cap-queued request is the same as a slow response, see SlowResp), the hook-correction decision
\* table beyond one permission_prompt hint (Hint), the window-fire hint correction (R10 tail), still-running poll
\* (folded into the scrape), pane_closed (R8 — lifecycle event, unchanged), the 0.45.4 fallback path itself
\* (abstracted to FallbackResolve; only its *activation* in the wrong mode is checked), other panes' stamps (they
\* only create gaps in ctr; every comparison here is order-only).
EXTENDS Naturals, FiniteSets

CONSTANTS Capable,           \* TRUE = agent.get carries numeric state_change_seq + completion_seq key (p22)
          PendingAsFallback, \* ablation (Astra 0261 H1): treat mode "pending" as "fallback" for events/ACK
          NoFence,           \* ablation (H18): drop only the cs > lastConsumedCs fence (status alone completes)
          NoToken,           \* ablation (Astra 0261 H2): skip only the attempt-token check (generation kept)
          MidRunCs,          \* H9 / D11: cs may rise mid-run (one intermediate working->done->working)
          Blocked,           \* the card run may go "blocked" once
          LateDelivery,      \* FALSE = a submitted prompt starts before the next tick (LatencyBound analog)
          Undeliverable,     \* TRUE = every Enter is lost (prompt stays in the input box) — stallDelivery
          SlowResp,          \* TRUE = an agent.get response may stay in flight across ticks (> W possible)
          PermFail,          \* TRUE = herdr may go permanently unavailable (GoDown, once, unfair)
          RepeatFail,        \* TRUE = unbounded intermittent poll failures (SF on PollOk still holds)
          MaxFail,           \* bounded poll failures when ~RepeatFail
          MaxRetries,        \* submitVerify.retries (undelivered rounds that may consume a retry)
          W,                 \* status_unavailable window, ticks
          WaitT,             \* verify round length, ticks
          InitSts,           \* pane status at flight creation: "idle" (boot, cs null) | "done" (reused pane,
                             \*   stale done cs = scs) | "working" (busy pane — pre-existing work never ends)
          TrackOld,          \* TRUE = maintain fAge for the retracted (old) CWAC antecedent (_ResidualWOld)
          StatusOnlyReset,   \* ablation (Astra 0272 #3): the retracted W-reset guard (status change regardless
                             \*   of scs > b, old-generation responses reset too) — bypasses only the reset guard
          NoHintClear,       \* ablation (Astra 0272 #4): the R69-M2 rearm skips the hookHint clear (R6 ②)
          Hint               \* environment: one permission_prompt hookHint may arrive during a card run

ASSUME /\ W \in Nat /\ W >= 1 /\ WaitT \in Nat /\ WaitT >= 2 /\ MaxRetries \in Nat /\ MaxFail \in Nat
       /\ InitSts \subseteq {"idle", "done", "working"} /\ InitSts # {}
       /\ \A c \in {Capable, PendingAsFallback, NoFence, NoToken, MidRunCs, Blocked, LateDelivery,
                    Undeliverable, SlowResp, PermFail, RepeatFail, TrackOld,
                    StatusOnlyReset, NoHintClear, Hint} : c \in BOOLEAN

Half   == WaitT \div 2
NULL   == 0                         \* cs null; real stamps start at 1
Copies == {1, 2}                    \* prompt copies: 1 = first inject, 2 = the (single) retype — R17 / R69-M1
NoSnap == [st |-> "none", scs |-> 0, cs |-> 0]
Min(x, y) == IF x < y THEN x ELSE y

VARIABLES
  \* --- herdr / agent (environment) ---
  ast,        \* status agent.get would report now: "idle" | "done" | "working" | "blocked"
  scs,        \* state_change_seq of this pane
  cs,         \* completion_seq (NULL = 0)
  ctr,        \* herdr global stamp counter (H7)
  rs,         \* per copy: "none" | "box" (typed, Enter lost) | "pend" (submitted, not started) | "run" | "fin"
  cur,        \* copy currently running (0 = none; a pre-existing "working" has cur = 0 and never ends)
  midOpen,    \* MidRunCs: the current run is in its intermediate "done"
  midUsed, blkUsed,
  cardSt,     \* ghost: stamps produced by card runs, <<stamp, copy, "fin" | "mid">>
  fAge,       \* ticks since the latest card-run finish (TrackOld only)
  evq,        \* one pending herdr push: "none" | "ack" | a status (content = status at push time)
  down,       \* PermFail happened
  fails,      \* bounded poll failures used
  \* --- bridge flight ---
  mode,       \* SnapMode: "pending" | "snapshot" | "fallback" (R1 — fixed after the baseline)
  gen,        \* runGen
  b,          \* runBaseline
  lastCs,     \* lastConsumedCs (initial = b; stays on the original b across reinjects — R2)
  lastScs,    \* lastAppliedScs
  lastSt,     \* last applied status
  dseen,      \* deliveredSeen (current gen applied a snapshot with scs > b)
  wAge,       \* ticks since lastAuthoritativeAt (saturates at W)
  \* --- inject / verify ---
  curCopy,    \* latest prompt copy the bridge typed (0 = not injected)
  vpc,        \* "none" (before inject) | "wait" (round open) | "reinj" (undelivered, reinject pending) | "off"
  rAge,       \* ticks since t0 of the open round
  rHalf,      \* this round received a current-gen authoritative {idle, done} /\ scs = b in its late half
  rEv,        \* scs of that evidence snapshot
  retries,    \* remaining retries
  reinjectUsed, \* the retype budget of this verify call is spent (R30 M-2 · R69-M1)
  retyped,    \* flight.reinjectRetyped
  pendRe,     \* "none" | "probe" (R17 scrape probe outstanding) | "cr" | "retype" (method chosen, key pending)
  evScs,      \* verifyRound.evidenceScs (= b' of the reinject)
  lastRe,     \* "none" | "cr" | "retype" — method of the last reinject key
  \* --- poller (R11) ---
  pq,         \* snapGet: "none" | "queued" | "inflight"
  dirty,      \* snapDirty
  psnap,      \* herdr state captured when the in-flight request was served
  pgen,       \* runGen at request send
  \* --- completion attempt (R5 / R6) ---
  deferral,   \* stillRunningDeferral: a completion attempt is in progress (window does not fire — R10)
  att,        \* flight.completionAttempt (0 = invalidated)
  tokCtr,     \* bridge-global attempt counter
  scrs,       \* outstanding settle scrapes: <<token, gen, consumed cs>>
  \* --- result / CAS ---
  result,     \* "none" | "done" | "failed_unavail" | "blocked" | "unconfirmed" | "fallback" | "status_lost"
  src,        \* "none" | "snap" | "hint" | "window" | "verify" | "event" | "fallback"
  nres,       \* results issued (CAS)
  \* --- ghosts ---
  mixed,      \* an event-path result / 0.45.4 watchdog fired while mode # "fallback"
  staleRes,   \* a result came from a scrape whose token was not current
  falseC,     \* the consumed cs is not a card-run stamp
  early,      \* the run owning the consumed stamp had not finished at result time
  cardAttr,   \* the consumed cs is the finish stamp of some card-prompt run
  curAttr,    \* ... of the run of curCopy
  m2,         \* R69-M2 path taken: cs > lastCs applied during an attempt with no observed working
  reCancel,   \* CancelReinject happened
  ante,       \* CWAC-Final antecedent: the final completion snapshot was applied (before expiry)
  oldAnte,    \* retracted antecedent: a final completion snapshot arrived within W after agent completion
  keyAfterDeliv, \* a reinject key was sent after a current-gen scs > b snapshot was applied
  badB,       \* a reinject baseline differed from its round's evidence scs (or the evidence from b)
  \* --- hookHint (R5 M-2 ③ correction · R6 ② clear · R69-M2 — Astra 0272 #4) ---
  hookHint,   \* "none" | "permission_prompt" (set by a hook during the current flight)
  hintUsed,   \* the single hint arrival (Hint) happened
  hintStale,  \* ghost: the current hookHint was set before the latest Rearm (survived it)
  staleCorr,  \* ghost: a completion was corrected to blocked by a stale (pre-Rearm) hint
  hintCleared, \* ghost: a Rearm cleared a non-"none" hookHint
  \* --- slow-response ghosts (Astra 0272 #5 — Reach_SlowRespWindow) ---
  pAge,       \* ticks the in-flight request has been outstanding (SlowResp only — saturates at W)
  pRem,       \* remaining W (W - wAge) when the in-flight request was issued (SlowResp only)
  pStale,     \* the agent finished after the in-flight request was issued (SlowResp only)
  slowWin,    \* the window fired while such a request was in flight, issued before expiry (pRem > 0), with
              \*   positive elapsed latency (pAge > 0) >= remaining W at issue (Astra 0275 #1)
  \* --- other 0272 ghosts ---
  badReset,   \* a W reset happened on a cause outside R10 (Astra 0272 #3)
  anteP,      \* CWAC-Plan antecedent (previous PLAN contract): a current-gen snapshot with {done, idle} /\
              \*   cs > lastCs was applied
  sawUndel,   \* a round was classified "undelivered"
  sawUnk,     \* a round was classified "unknown"
  downAfterUndel \* GoDown (permanent failure) happened after >= 1 "undelivered" classification (Astra 0275 #2)

agentV  == <<ast, scs, cs, ctr, rs, cur, midOpen, midUsed, blkUsed, cardSt, fAge>>
envV    == <<evq, down, fails>>
flightV == <<mode, gen, b, lastCs, lastScs, lastSt, dseen, wAge>>
verifyV == <<curCopy, vpc, rAge, rHalf, rEv, retries, reinjectUsed, retyped, pendRe, evScs, lastRe>>
pollV   == <<pq, dirty, psnap, pgen>>
complV  == <<deferral, att, tokCtr, scrs>>
resV    == <<result, src, nres>>
ghostV  == <<mixed, staleRes, falseC, early, cardAttr, curAttr, m2, reCancel, ante, oldAnte,
             keyAfterDeliv, badB>>
hintV   == <<hookHint, hintUsed, hintStale, staleCorr, hintCleared>>
slowV   == <<pAge, pRem, pStale, slowWin>>
g2V     == <<badReset, anteP, sawUndel, sawUnk, downAfterUndel>>
extraV  == <<hintV, slowV, g2V>>
vars    == <<agentV, envV, flightV, verifyV, pollV, complV, resV, ghostV, extraV>>

Init == /\ \E st \in InitSts :
             /\ ast = st /\ ctr = 1 /\ scs = 1 /\ cs = IF st = "done" THEN 1 ELSE NULL
        /\ rs = [i \in Copies |-> "none"] /\ cur = 0 /\ midOpen = FALSE /\ midUsed = FALSE
        /\ blkUsed = FALSE /\ cardSt = {} /\ fAge = 0
        /\ evq = "none" /\ down = FALSE /\ fails = 0
        /\ mode = "pending" /\ gen = 1 /\ b = 0 /\ lastCs = 0 /\ lastScs = 0 /\ lastSt = "none"
        /\ dseen = FALSE /\ wAge = 0                    \* window clock starts at flights.set (R2)
        /\ curCopy = 0 /\ vpc = "none" /\ rAge = 0 /\ rHalf = FALSE /\ rEv = 0 /\ retries = MaxRetries
        /\ reinjectUsed = FALSE /\ retyped = FALSE /\ pendRe = "none" /\ evScs = 0 /\ lastRe = "none"
        /\ pq = "queued" /\ dirty = FALSE /\ psnap = NoSnap /\ pgen = 0   \* baseline read requested (R2)
        /\ deferral = FALSE /\ att = 0 /\ tokCtr = 0 /\ scrs = {}
        /\ result = "none" /\ src = "none" /\ nres = 0
        /\ mixed = FALSE /\ staleRes = FALSE /\ falseC = FALSE /\ early = FALSE /\ cardAttr = FALSE
        /\ curAttr = FALSE /\ m2 = FALSE /\ reCancel = FALSE /\ ante = FALSE /\ oldAnte = FALSE
        /\ keyAfterDeliv = FALSE /\ badB = FALSE
        /\ hookHint = "none" /\ hintUsed = FALSE /\ hintStale = FALSE /\ staleCorr = FALSE
        /\ hintCleared = FALSE
        /\ pAge = 0 /\ pRem = 0 /\ pStale = FALSE /\ slowWin = FALSE
        /\ badReset = FALSE /\ anteP = FALSE /\ sawUndel = FALSE /\ sawUnk = FALSE /\ downAfterUndel = FALSE

---------------------------------------------------------------------------
Alive        == result = "none"                       \* flights.get(pane) = this flight, CAS free
SnapActive   == mode \in {"pending", "snapshot"}       \* window + tick run here (R10 · R11)
EvPathActive == mode = "fallback" \/ (PendingAsFallback /\ mode = "pending")
FinStamps    == {x[1] : x \in {y \in cardSt : y[3] = "fin"}}
CardStamps   == {x[1] : x \in cardSt}
AgentCanStart == cur = 0 /\ ast \in {"idle", "done"} /\ \E i \in Copies : rs[i] = "pend"
\* the agent will never change status again on its own (no run, nothing submitted)
AgentQuiet   == cur = 0 /\ ast \in {"idle", "done"} /\ \A i \in Copies : rs[i] # "pend"

\* schedule a poll (R11 "예약만"): none -> queued · queued -> unchanged · inflight -> dirty
SchedPq    == IF pq = "none" THEN "queued" ELSE pq
SchedDirty == IF pq = "inflight" THEN TRUE ELSE dirty

\* prompt Enter outcome: lost (stays typed in the box) or submitted
Outcomes == IF Undeliverable THEN {"box"} ELSE {"box", "pend"}

Issue(r, s) == /\ result' = r /\ src' = s /\ nres' = nres + 1

---------------------------------------------------------------------------
\* ===== agent / herdr environment =====
AgentStart ==
  /\ AgentCanStart
  /\ LET i == IF rs[1] = "pend" THEN 1 ELSE 2 IN
       /\ rs' = [rs EXCEPT ![i] = "run"] /\ cur' = i
  /\ ast' = "working" /\ ctr' = ctr + 1 /\ scs' = ctr + 1 /\ cs' = NULL
  /\ UNCHANGED <<midOpen, midUsed, blkUsed, cardSt, fAge, envV, flightV, verifyV, pollV, complV, resV, ghostV,
                 extraV>>

AgentFinish ==       \* unfocused working->idle publishes level "done" with cs = new scs (H8 · H20)
  /\ cur # 0 /\ ast = "working" /\ ~midOpen
  /\ ast' = "done" /\ ctr' = ctr + 1 /\ scs' = ctr + 1 /\ cs' = ctr + 1
  /\ rs' = [rs EXCEPT ![cur] = "fin"] /\ cur' = 0
  /\ cardSt' = cardSt \cup {<<ctr + 1, cur, "fin">>}
  /\ fAge' = 0
  /\ pStale' = (pStale \/ (SlowResp /\ pq = "inflight"))   \* the in-flight request predates this completion
  /\ UNCHANGED <<midOpen, midUsed, blkUsed, envV, flightV, verifyV, pollV, complV, resV, ghostV,
                 hintV, pAge, pRem, slowWin, g2V>>

AgentMid ==          \* H9: intermediate working->idle edge publishes "done" + cs mid-run (class 106)
  /\ MidRunCs /\ ~midUsed /\ cur # 0 /\ ast = "working"
  /\ ast' = "done" /\ ctr' = ctr + 1 /\ scs' = ctr + 1 /\ cs' = ctr + 1
  /\ midOpen' = TRUE /\ midUsed' = TRUE
  /\ cardSt' = cardSt \cup {<<ctr + 1, cur, "mid">>}
  /\ UNCHANGED <<rs, cur, blkUsed, fAge, envV, flightV, verifyV, pollV, complV, resV, ghostV, extraV>>

AgentResume ==
  /\ midOpen /\ ast \in {"done", "idle"}
  /\ ast' = "working" /\ ctr' = ctr + 1 /\ scs' = ctr + 1 /\ cs' = NULL /\ midOpen' = FALSE
  /\ UNCHANGED <<rs, cur, midUsed, blkUsed, cardSt, fAge, envV, flightV, verifyV, pollV, complV, resV, ghostV,
                 extraV>>

AgentBlock ==
  /\ Blocked /\ ~blkUsed /\ cur # 0 /\ ast = "working" /\ ~midOpen
  /\ ast' = "blocked" /\ ctr' = ctr + 1 /\ scs' = ctr + 1 /\ blkUsed' = TRUE
  /\ UNCHANGED <<cs, rs, cur, midOpen, midUsed, cardSt, fAge, envV, flightV, verifyV, pollV, complV, resV, ghostV,
                 extraV>>

AgentUnblock ==
  /\ ast = "blocked"
  /\ ast' = "working" /\ ctr' = ctr + 1 /\ scs' = ctr + 1
  /\ UNCHANGED <<cs, rs, cur, midOpen, midUsed, blkUsed, cardSt, fAge, envV, flightV, verifyV, pollV, complV, resV,
                 ghostV, extraV>>

Focus ==             \* H10: focus during "done" -> "idle", scs and cs unchanged (probe f: cs kept/filled)
  /\ ast = "done"
  /\ ast' = "idle"
  /\ UNCHANGED <<scs, cs, ctr, rs, cur, midOpen, midUsed, blkUsed, cardSt, fAge, envV, flightV, verifyV, pollV,
                 complV, resV, ghostV, extraV>>

\* a permission_prompt hook during a card run (environment option, once): sets hookHint for this flight.
\* It changes no herdr status / stamp (the M-2 correction table reads the hint, not the snapshot).
HintArrive ==
  /\ Hint /\ ~hintUsed /\ Alive /\ cur # 0 /\ ast = "working"
  /\ hookHint' = "permission_prompt" /\ hintUsed' = TRUE /\ hintStale' = FALSE
  /\ UNCHANGED <<agentV, envV, flightV, verifyV, pollV, complV, resV, ghostV, staleCorr, hintCleared,
                 slowV, g2V>>

Push ==              \* a herdr push (status level incl. H10 focus push, or a re-subscribe ACK); may be lost
  /\ Alive /\ evq = "none"
  /\ evq' \in {"ack", ast}
  /\ UNCHANGED <<agentV, down, fails, flightV, verifyV, pollV, complV, resV, ghostV, extraV>>

GoDown ==
  /\ PermFail /\ ~down
  /\ down' = TRUE
  /\ downAfterUndel' = (downAfterUndel \/ sawUndel)     \* ghost (Astra 0275 #2): permanent failure after undelivered
  /\ UNCHANGED <<agentV, evq, fails, flightV, verifyV, pollV, complV, resV, ghostV, hintV, slowV,
                 badReset, anteP, sawUndel, sawUnk>>

---------------------------------------------------------------------------
\* ===== events: wake-only on the snapshot path (D5 · D8 · R12) =====
ConsumeEv ==
  /\ evq # "none"
  /\ evq' = "none"
  /\ IF Alive /\ EvPathActive
       THEN \* 0.45.4 event path (abstract): status "done" completes; an ACK may fire the watchdog
            \/ /\ evq = "done"
               /\ Issue("done", "event") /\ mixed' = (mixed \/ mode # "fallback")
               /\ UNCHANGED <<pq, dirty>>
            \/ /\ evq = "ack"
               /\ Issue("status_lost", "event") /\ mixed' = (mixed \/ mode # "fallback")
               /\ UNCHANGED <<pq, dirty>>
            \/ /\ UNCHANGED <<resV, mixed>>
               /\ IF SnapActive THEN pq' = SchedPq /\ dirty' = SchedDirty ELSE UNCHANGED <<pq, dirty>>
       ELSE /\ UNCHANGED <<resV, mixed>>
            /\ IF Alive /\ SnapActive THEN pq' = SchedPq /\ dirty' = SchedDirty ELSE UNCHANGED <<pq, dirty>>
  /\ UNCHANGED <<agentV, down, fails, flightV, verifyV, psnap, pgen, complV,
                 staleRes, falseC, early, cardAttr, curAttr, m2, reCancel, ante, oldAnte, keyAfterDeliv, badB,
                 extraV>>

---------------------------------------------------------------------------
\* ===== poller (R11) =====
PollSend ==
  /\ pq = "queued" /\ Alive
  /\ pq' = "inflight" /\ psnap' = [st |-> ast, scs |-> scs, cs |-> cs] /\ pgen' = gen
  /\ pAge' = 0 /\ pRem' = (IF SlowResp THEN W - wAge ELSE 0) /\ pStale' = FALSE
  /\ UNCHANGED <<agentV, envV, flightV, verifyV, dirty, complV, resV, ghostV, hintV, slowWin, g2V>>

AfterResp == /\ pq' = IF dirty /\ Alive THEN "queued" ELSE "none"
             /\ dirty' = FALSE /\ psnap' = NoSnap /\ pgen' = 0
             /\ pAge' = 0 /\ pRem' = 0 /\ pStale' = FALSE

PollFail ==          \* RPC error / unknown / not found = no authority (H12): nothing applied, W keeps flowing
  /\ pq = "inflight"
  /\ down \/ RepeatFail \/ fails < MaxFail
  /\ fails' = IF down \/ RepeatFail THEN fails ELSE fails + 1
  /\ AfterResp
  /\ UNCHANGED <<agentV, evq, down, flightV, verifyV, complV, resV, ghostV, hintV, slowWin, g2V>>

\* the retracted CWAC antecedent (Astra 0264 #3): a final completion snapshot *arrives* while the agent
\* completed less than W ago — recorded even when the flight is already resolved (response discarded)
OldAnteHit(s) == /\ TrackOld /\ s.st \in {"done", "idle"} /\ s.cs \in FinStamps
                 /\ fAge < W /\ AgentQuiet /\ s.scs = scs

\* W reset of a discarded old-generation response: never under R10/R11 (Astra 0272 #3); only the
\* StatusOnlyReset ablation restores the retracted "status change or scs > lastAppliedScs" reset
OldGenReset(s) == StatusOnlyReset /\ (s.scs > lastScs \/ s.st # lastSt)

\* full application of a current-generation authoritative snapshot (R4 · R5 · R6 · R7 · R10 · R3)
ApplyCur(s) ==
  LET \* R10 (Astra 0272 #3): reset only on current gen /\ scs > b /\ (scs > lastAppliedScs \/ status change \/
      \* working). Current generation is the caller's guard (pgen = gen).
      authR   == s.scs > b /\ (s.scs > lastScs \/ s.st # lastSt \/ s.st = "working")
      oldProg == s.scs > lastScs \/ s.st # lastSt \/ (s.st = "working" /\ s.scs > b)   \* retracted rule
      reset   == IF StatusOnlyReset THEN oldProg ELSE authR
      newWork == s.st = "working" /\ s.scs > lastScs                                   \* R6 canonical
      fenceOk == s.cs # NULL /\ s.cs > lastCs                                           \* D3 fence
      complOk == s.st \in {"done", "idle"} /\ (NoFence \/ fenceOk)
      blk     == s.st = "blocked" /\ s.scs > b                                          \* D4 / R7
      halfEv  == vpc = "wait" /\ rAge >= Half /\ s.st \in {"idle", "done"} /\ s.scs = b  \* R3 (R69-L2)
      rearm   == complOk /\ deferral                                                    \* R69-M2
      \* R69-M2: on rearm R6 ② (hookHint clear) is applied before re-entry, unless the ablation skips it
      hintIn  == IF rearm /\ ~NoHintClear THEN "none" ELSE hookHint
      staleIn == IF rearm THEN hintIn # "none" ELSE hintStale
      corr    == hintIn = "permission_prompt"          \* R5 M-2 ③ shouldCorrectCompletionToBlocked at entry
  IN /\ lastScs' = IF s.scs > lastScs THEN s.scs ELSE lastScs
     /\ lastSt' = s.st
     /\ wAge' = IF reset THEN 0 ELSE wAge
     /\ badReset' = (badReset \/ (reset /\ ~authR))
     /\ dseen' = (dseen \/ s.scs > b)
     /\ rHalf' = (rHalf \/ halfEv)
     /\ rEv' = IF halfEv THEN s.scs ELSE rEv
     /\ IF blk
          THEN /\ Issue("blocked", "snap")
               /\ UNCHANGED <<lastCs, complV, m2, ante, anteP, hintV>>
        ELSE IF complOk
          THEN \* (R69-M2) cs > lastCs during an attempt = missed working re-entry: R6 ① cancel + token
               \* invalidation and ② hookHint clear are applied first, then re-entry (R5)
               /\ m2' = (m2 \/ deferral)
               /\ lastCs' = s.cs
               /\ ante' = (ante \/ (AgentQuiet /\ s.scs = scs))
               /\ anteP' = (anteP \/ fenceOk)
               /\ hookHint' = hintIn /\ hintStale' = staleIn
               /\ hintCleared' = (hintCleared \/ (rearm /\ ~NoHintClear /\ hookHint # "none"))
               /\ UNCHANGED hintUsed
               /\ IF corr
                    THEN \* the existing completion machine corrects the completion to agent_blocked
                         /\ Issue("blocked", "hint") /\ staleCorr' = staleIn
                         /\ deferral' = FALSE /\ att' = 0
                         /\ UNCHANGED <<tokCtr, scrs>>
                    ELSE /\ tokCtr' = tokCtr + 1 /\ att' = tokCtr + 1 /\ deferral' = TRUE
                         /\ scrs' = scrs \cup {<<tokCtr + 1, gen, s.cs>>}
                         /\ UNCHANGED <<resV, staleCorr>>
        ELSE IF newWork
          THEN \* R6 ①: cancel an attempt in progress, invalidate its token · ②: clear hookHint (scs > lastCs)
               /\ deferral' = FALSE /\ att' = IF deferral THEN 0 ELSE att
               /\ hookHint' = IF s.scs > lastCs THEN "none" ELSE hookHint
               /\ hintStale' = IF s.scs > lastCs THEN FALSE ELSE hintStale
               /\ UNCHANGED <<lastCs, tokCtr, scrs, resV, m2, ante, anteP, hintUsed, staleCorr, hintCleared>>
        ELSE UNCHANGED <<lastCs, complV, resV, m2, ante, anteP, hintV>>

PollOk ==
  /\ pq = "inflight" /\ ~down
  /\ LET s == psnap IN
     /\ oldAnte' = (oldAnte \/ OldAnteHit(s))
     /\ IF ~Alive \/ mode = "fallback"
          THEN \* resolved flight: discarded · fallback: 0.45.4 watchdog reads .status only — abstracted
               UNCHANGED <<flightV, rHalf, rEv, complV, resV, m2, ante, hintV, badReset, anteP>>
        ELSE IF mode = "pending"
          THEN \* baseline (R1 · R2 · R69-L1): capability judged once, b / lastAppliedScs / status / W reset
               /\ IF Capable
                    THEN /\ mode' = "snapshot" /\ b' = s.scs /\ lastCs' = s.scs /\ lastScs' = s.scs
                         /\ lastSt' = s.st /\ wAge' = 0
                    ELSE /\ mode' = "fallback"
                         /\ UNCHANGED <<b, lastCs, lastScs, lastSt, wAge>>
               /\ UNCHANGED <<gen, dseen, rHalf, rEv, complV, resV, m2, ante, hintV, badReset, anteP>>
        ELSE IF pgen # gen
          THEN \* R11: old-generation response discarded — window clock untouched (Astra 0272 #3)
               /\ wAge' = IF OldGenReset(s) THEN 0 ELSE wAge
               /\ badReset' = (badReset \/ OldGenReset(s))
               /\ UNCHANGED <<mode, gen, b, lastCs, lastScs, lastSt, dseen, rHalf, rEv, complV, resV, m2, ante,
                              hintV, anteP>>
        ELSE /\ ApplyCur(s)
             /\ UNCHANGED <<mode, gen, b>>
  /\ AfterResp
  /\ UNCHANGED <<agentV, envV, curCopy, vpc, rAge, retries, reinjectUsed, retyped, pendRe, evScs, lastRe,
                 mixed, staleRes, falseC, early, cardAttr, curAttr, reCancel, keyAfterDeliv, badB,
                 slowWin, sawUndel, sawUnk, downAfterUndel>>

---------------------------------------------------------------------------
\* ===== completion attempt (R5 — token re-check after every await, CAS) =====
\* The scrape's success and failure (catch) branches re-check the token identically (R5), so the outcome
\* (R15 "inflight_ok" | "inflight_fail") is not a separate variable; still-running poll folded in.
\* NoToken ablation bypasses only the token comparison; the generation check stays.
ScrapeDone(sc) ==
  /\ sc \in scrs
  /\ scrs' = scrs \ {sc}
  /\ LET valid == (NoToken \/ sc[1] = att) /\ sc[2] = gen
         c     == sc[3]
     IN IF valid /\ Alive
          THEN /\ Issue("done", "snap") /\ deferral' = FALSE
               /\ staleRes' = (sc[1] # att \/ sc[2] # gen)
               /\ falseC'   = (c \notin CardStamps)
               /\ early'    = ~(\E x \in cardSt : x[1] = c /\ rs[x[2]] = "fin")
               /\ cardAttr' = (c \in FinStamps)
               /\ curAttr'  = (\E x \in cardSt : x[1] = c /\ x[3] = "fin" /\ x[2] = curCopy)
          ELSE /\ UNCHANGED <<resV, deferral, staleRes, falseC, early, cardAttr, curAttr>>  \* silent abort
  /\ UNCHANGED <<agentV, envV, flightV, verifyV, pollV, att, tokCtr,
                 mixed, m2, reCancel, ante, oldAnte, keyAfterDeliv, badB, extraV>>

\* ===== window (D4 · R10) =====
WindowFire ==
  /\ Alive /\ SnapActive /\ wAge >= W /\ ~deferral      \* never during an attempt / still-running grace
  /\ Issue("failed_unavail", "window")
  \* ghost (Astra 0275 #1): issued before expiry (pRem > 0) and >= 1 tick in flight — excludes 0 >= 0
  /\ slowWin' = (slowWin \/ (pq = "inflight" /\ pStale /\ pRem > 0 /\ pAge > 0 /\ pAge >= pRem))
  /\ UNCHANGED <<agentV, envV, flightV, verifyV, pollV, complV, ghostV, hintV, pAge, pRem, pStale, g2V>>

Tick ==
  /\ Alive /\ SnapActive
  /\ ~(vpc = "wait" /\ rAge = WaitT)                    \* round close happens at its deadline
  /\ SlowResp \/ pq # "inflight"                        \* ~SlowResp: a response lands within the tick
  /\ LateDelivery \/ ~AgentCanStart                     \* ~LateDelivery: a submitted prompt starts now
  /\ ~(wAge >= W /\ ~deferral)                          \* expiry fires at its tick (urgent)
  /\ wAge' = Min(wAge + 1, W)
  /\ rAge' = IF vpc = "wait" THEN rAge + 1 ELSE rAge
  /\ fAge' = IF TrackOld /\ FinStamps # {} THEN Min(fAge + 1, W) ELSE fAge
  /\ pAge' = IF pq = "inflight" THEN Min(pAge + 1, W) ELSE pAge
  /\ pq' = SchedPq /\ dirty' = SchedDirty               \* bridge-wide tick (pending incl. — baseline retry)
  /\ UNCHANGED <<ast, scs, cs, ctr, rs, cur, midOpen, midUsed, blkUsed, cardSt, envV,
                 mode, gen, b, lastCs, lastScs, lastSt, dseen,
                 curCopy, vpc, rHalf, rEv, retries, reinjectUsed, retyped, pendRe, evScs, lastRe,
                 psnap, pgen, complV, resV, ghostV, hintV, pRem, pStale, slowWin, g2V>>

---------------------------------------------------------------------------
\* ===== inject + verify rounds (R2 · R3 · R4 · R17 · Astra 0266) =====
Inject ==            \* after a capability-positive baseline; H18: herdr state unchanged by the RPC
  /\ Alive /\ mode = "snapshot" /\ curCopy = 0
  /\ curCopy' = 1
  /\ \E o \in Outcomes : rs' = [rs EXCEPT ![1] = o]
  /\ vpc' = "wait" /\ rAge' = 0 /\ rHalf' = FALSE /\ rEv' = 0
  /\ pq' = SchedPq /\ dirty' = SchedDirty               \* verify wake
  /\ UNCHANGED <<ast, scs, cs, ctr, cur, midOpen, midUsed, blkUsed, cardSt, fAge, envV, flightV,
                 retries, reinjectUsed, retyped, pendRe, evScs, lastRe, psnap, pgen, complV, resV, ghostV,
                 extraV>>

VerifyDelivered ==   \* R4: deliveredSeen ends verify
  /\ Alive /\ vpc = "wait" /\ dseen
  /\ vpc' = "off"
  /\ UNCHANGED <<agentV, envV, flightV, curCopy, rAge, rHalf, rEv, retries, reinjectUsed, retyped,
                 pendRe, evScs, lastRe, pollV, complV, resV, ghostV, extraV>>

CloseRound ==        \* R3 canonical classification at t0 + waitMs, this round's own evidence only
  /\ Alive /\ vpc = "wait" /\ rAge = WaitT /\ ~dseen
  /\ IF rHalf
       THEN /\ sawUndel' = TRUE /\ UNCHANGED sawUnk
            /\ IF retries = 0
                 THEN /\ Issue("unconfirmed", "verify") /\ vpc' = "off"     \* exhausted -> inject_unconfirmed
                      /\ UNCHANGED <<wAge, retries, pendRe, evScs, rAge, rHalf, rEv, pq, dirty>>
                 ELSE \* "undelivered": consume a retry, reset W at this moment (0266 #1), confirm reinject
                      /\ retries' = retries - 1 /\ wAge' = 0
                      /\ vpc' = "reinj" /\ pendRe' = "probe" /\ evScs' = rEv
                      /\ rAge' = 0 /\ rHalf' = FALSE /\ rEv' = 0
                      /\ UNCHANGED <<resV, pq, dirty>>
       ELSE \* "unknown": no retry consumed, W keeps flowing, open a new round
            /\ sawUnk' = TRUE /\ UNCHANGED sawUndel
            /\ rAge' = 0 /\ rHalf' = FALSE /\ rEv' = 0
            /\ pq' = SchedPq /\ dirty' = SchedDirty
            /\ UNCHANGED <<wAge, retries, vpc, pendRe, evScs, resV>>
  /\ UNCHANGED <<agentV, envV, mode, gen, b, lastCs, lastScs, lastSt, dseen, curCopy, reinjectUsed,
                 retyped, lastRe, psnap, pgen, complV, ghostV, hintV, slowV, badReset, anteP, downAfterUndel>>

ProbeResolve ==      \* R17(a): hit / read-fail -> CR; miss /\ ~reinjectUsed -> retype (once per verify call)
  \* NOTE: hit / miss / fail is nondeterministic regardless of the box (hit is not proof of non-submission).
  /\ Alive /\ pendRe = "probe"
  /\ pendRe' \in IF reinjectUsed THEN {"cr"} ELSE {"cr", "retype"}
  /\ UNCHANGED <<agentV, envV, flightV, curCopy, vpc, rAge, rHalf, rEv, retries, reinjectUsed, retyped,
                 evScs, lastRe, pollV, complV, resV, ghostV, extraV>>

\* key-before cache check (R2 — cache only, no RPC) + generation switch + key, one synchronous section
SendReinject ==
  /\ Alive /\ pendRe \in {"cr", "retype"} /\ ~dseen
  /\ gen' = gen + 1 /\ b' = evScs /\ dseen' = FALSE
  /\ badB' = (badB \/ evScs # b) /\ keyAfterDeliv' = (keyAfterDeliv \/ dseen)
  /\ lastRe' = pendRe /\ pendRe' = "none"
  /\ vpc' = "wait" /\ rAge' = 0 /\ rHalf' = FALSE /\ rEv' = 0 /\ evScs' = 0
  /\ pq' = SchedPq /\ dirty' = SchedDirty               \* verify wake for the new round
  /\ IF pendRe = "cr"
       THEN \* CR submits whatever is typed in the box; no new prompt copy
            /\ \E o \in Outcomes : rs' = [i \in Copies |-> IF rs[i] = "box" THEN o ELSE rs[i]]
            /\ UNCHANGED <<curCopy, reinjectUsed, retyped>>
       ELSE \* retype (agentPrompt): new copy 2. NOTE: an unsubmitted copy 1 in the box is absorbed into
            \* the same input (one combined prompt = copy 2).
            /\ curCopy' = 2 /\ reinjectUsed' = TRUE /\ retyped' = TRUE
            /\ \E o \in Outcomes :
                 rs' = [rs EXCEPT ![1] = IF @ = "box" THEN "none" ELSE @, ![2] = o]
  \* lastCs stays on the original b (R2); lastScs / lastSt unchanged
  /\ UNCHANGED <<ast, scs, cs, ctr, cur, midOpen, midUsed, blkUsed, cardSt, fAge, envV,
                 mode, lastCs, lastScs, lastSt, wAge, retries, psnap, pgen, complV, resV,
                 mixed, staleRes, falseC, early, cardAttr, curAttr, m2, reCancel, ante, oldAnte, extraV>>

CancelReinject ==    \* cache shows current-gen scs > b applied after the round closed: no key, no refund
  /\ Alive /\ pendRe \in {"cr", "retype"} /\ dseen
  /\ pendRe' = "none" /\ vpc' = "off" /\ reCancel' = TRUE /\ evScs' = 0
  /\ UNCHANGED <<agentV, envV, flightV, curCopy, rAge, rHalf, rEv, retries, reinjectUsed, retyped, lastRe,
                 pollV, complV, resV, mixed, staleRes, falseC, early, cardAttr, curAttr, m2, ante, oldAnte,
                 keyAfterDeliv, badB, extraV>>

\* ===== fallback (D3): 0.45.4 path, out of model scope =====
FallbackResolve ==
  /\ Alive /\ mode = "fallback"
  /\ Issue("fallback", "fallback")
  /\ UNCHANGED <<agentV, envV, flightV, verifyV, pollV, complV, ghostV, extraV>>

---------------------------------------------------------------------------
Next == \/ AgentStart \/ AgentFinish \/ AgentMid \/ AgentResume \/ AgentBlock \/ AgentUnblock \/ Focus
        \/ HintArrive \/ Push \/ GoDown \/ ConsumeEv
        \/ PollSend \/ PollOk \/ PollFail
        \/ \E sc \in scrs : ScrapeDone(sc)
        \/ WindowFire \/ Tick
        \/ Inject \/ VerifyDelivered \/ CloseRound \/ ProbeResolve \/ SendReinject \/ CancelReinject
        \/ FallbackResolve

\* ===== liveness assumptions (Astra 0272 #2 — README "Liveness assumptions") =====
\* Unfair (environment options, may never happen): AgentMid, AgentBlock, AgentUnblock, Focus, HintArrive, Push,
\* GoDown.
\* Environment assumptions — not provable from the bridge implementation:
EnvAgentFair  == WF_vars(AgentStart) /\ WF_vars(AgentResume)   \* a submitted prompt starts; a mid-run pause ends
EnvFinishFair == WF_vars(AgentFinish)                          \* a running card agent eventually stops working
EnvHerdrFair  == SF_vars(PollOk)                               \* herdr answers successfully when recurrently asked
\* Implementation obligations — 2 s ticker, bounded in-flight with RPC timeout, timers / awaits that return:
ImplFair == /\ WF_vars(ConsumeEv) /\ WF_vars(PollSend)
            /\ WF_vars(PollOk \/ PollFail)
            /\ WF_vars(\E sc \in scrs : ScrapeDone(sc))
            /\ WF_vars(WindowFire) /\ SF_vars(Tick)
            /\ WF_vars(Inject) /\ WF_vars(VerifyDelivered) /\ WF_vars(CloseRound)
            /\ WF_vars(ProbeResolve) /\ WF_vars(SendReinject) /\ WF_vars(CancelReinject)
            /\ WF_vars(FallbackResolve)

Fairness == ImplFair /\ EnvAgentFair /\ EnvFinishFair /\ EnvHerdrFair

Spec == Init /\ [][Next]_vars /\ Fairness
\* _NoAgentFinish: drop the "agent eventually stops working" assumption
SpecNoAgentFinish == Init /\ [][Next]_vars /\ ImplFair /\ EnvAgentFair /\ EnvHerdrFair
\* _WeakPollFair: herdr success only weakly fair (a continuously enabled PollOk) instead of SF
SpecWeakPollFair  == Init /\ [][Next]_vars /\ ImplFair /\ EnvAgentFair /\ EnvFinishFair /\ WF_vars(PollOk)

---------------------------------------------------------------------------
Statuses == {"idle", "done", "working", "blocked"}
TypeOK == /\ ast \in Statuses /\ scs \in Nat /\ cs \in Nat /\ ctr \in Nat /\ scs <= ctr /\ cs <= scs
          /\ rs \in [Copies -> {"none", "box", "pend", "run", "fin"}] /\ cur \in {0} \cup Copies
          /\ evq \in {"none", "ack"} \cup Statuses
          /\ mode \in {"pending", "snapshot", "fallback"} /\ gen \in 1..(MaxRetries + 1)
          /\ wAge \in 0..W /\ rAge \in 0..WaitT /\ fAge \in 0..W /\ retries \in 0..MaxRetries
          /\ curCopy \in {0} \cup Copies /\ vpc \in {"none", "wait", "reinj", "off"}
          /\ pendRe \in {"none", "probe", "cr", "retype"} /\ lastRe \in {"none", "cr", "retype"}
          /\ pq \in {"none", "queued", "inflight"} /\ dirty \in BOOLEAN
          /\ deferral \in BOOLEAN /\ att \in Nat /\ tokCtr \in Nat
          /\ result \in {"none", "done", "failed_unavail", "blocked", "unconfirmed", "fallback", "status_lost"}
          /\ src \in {"none", "snap", "hint", "window", "verify", "event", "fallback"}
          /\ hookHint \in {"none", "permission_prompt"}
          /\ hintUsed \in BOOLEAN /\ hintStale \in BOOLEAN /\ staleCorr \in BOOLEAN /\ hintCleared \in BOOLEAN
          /\ pAge \in 0..W /\ pRem \in 0..W /\ pStale \in BOOLEAN /\ slowWin \in BOOLEAN
          /\ badReset \in BOOLEAN /\ anteP \in BOOLEAN /\ sawUndel \in BOOLEAN /\ sawUnk \in BOOLEAN
          /\ downAfterUndel \in BOOLEAN

SnapDone == result = "done" /\ src = "snap"
\* a completion trigger that the existing completion machine resolved: done, or the M-2 ③ correction to
\* agent_blocked from a hint that is not stale (pre-Rearm) — D1 "의미 무변경" behind the trigger
Completed == \/ result = "done"
             \/ result = "blocked" /\ src = "hint" /\ ~staleCorr

\* --- invariants (P0 row) ---
NoFalseCompletion      == SnapDone => ~falseC   \* consumed cs is a stamp of a card run (not boot / stale / H18)
NoEarlyCompletion      == SnapDone => ~early    \* the run owning the consumed stamp had finished
AtMostOneResult        == nres <= 1
NoMixedAuthority       == ~mixed                \* event-path result / watchdog only in mode "fallback"
NoStaleAttempt         == ~staleRes             \* no result from an invalidated completion attempt
NoDiscardedDelivery    == ~keyAfterDeliv        \* 0261 H3 goal: no reinject key after current-gen scs > b
ReinjectBaselineIsEvidence == /\ ~badB          \* b' = the round's evidence scs, and that evidence = b
                              /\ (pendRe # "none" => evScs = b)
CurrentRunAttribution  == SnapDone => curAttr   \* consumed = finish of the run of the latest copy
CardPromptAttribution  == SnapDone => cardAttr  \* consumed = finish of some run of this card prompt (R17b)
AltResultOK            == result \in {"none", "unconfirmed", "failed_unavail"}   \* _AltRounds
\* Astra 0272 #3: every W reset is one of — baseline success (R69-L1), an undelivered round consuming a retry
\* (R3), or an applied current-gen snapshot with scs > b /\ (scs > lastAppliedScs \/ status change \/ working)
WResetAuthorized       == ~badReset
\* Astra 0272 #4: after a Rearm, a later completion is never turned into blocked by a hint set before it
NoStaleHintAfterRearm  == ~staleCorr

\* --- liveness ---
EventuallyResolved == <>(result # "none")
\* CWAC-Final (Astra 0264 #3 · 0272 #1): antecedent = the agent's *final* completion snapshot was applied
\* (agent quiet, snapshot still current) — which can only happen before lastAuthoritativeAt + W fired.
\* This is PLAN's adopted contract (PLAN D9/R15 narrowed 2026-10-24, Astra 0272 #1).
CompletesWhenAgentCompletes       == ante ~> Completed
\* CWAC-Plan (Astra 0272 #1): the previous PLAN contract's literal antecedent — *a* current-gen snapshot with
\* status \in {done, idle} /\ cs > lastConsumedCs was applied before lastAuthoritativeAt + W (intermediate
\* completions included); kept as a record (_CwacPlanLiteral violated · _CwacPlanLiteralBase No error)
CompletesWhenAgentCompletesPlan   == anteP ~> Completed
\* unconditional CWAC (recorded violation in _PermFail / _SlowResp)
CompletesWhenAgentCompletesUncond == (FinStamps # {} /\ AgentQuiet) ~> (result = "done")
\* retracted antecedent "completion snapshot arrives within W after agent completion" (boundary, _ResidualW)
CompletesWhenAgentCompletesOld    == oldAnte ~> (result = "done")
====
