---- MODULE BridgeStartupWatchdog ----
\* 0.45.4 P0 — status-loss watchdog oracle (docs/PLAN.md §0.45.4 rows D8 · R3 · R4 · R14 "모델 모양(P0)" · P0).
\* Base = BridgeStartup.tla (CURRENT design, main 56a171a, round 3) copied verbatim; the only additions are the
\* watchdog variables wq / wdFired / wsnap / wregen, the constants WdGuard / QFail, the ConsumeAck arming and
\* re-get mark, the R5 working-in-grace re-ask in ConsumeStatus, the actions WdGetReq / WdGetResp / WdGetFail /
\* WdFire / WdDrop, their fairness, and the invariant WatchdogSound.
\* R68-M1 / R68-M2 (R68 fixes): agent.get is split into request (snapshot wsnap = ast) and response (reads wsnap,
\*   not the current ast — a stale reply); an ACK while a get or grace is open sets the re-get mark wregen, and a
\*   non-fire exit consumes it by re-arming (exactly one more get); a working push during grace re-arms instead of
\*   withdrawing the verdict (replayed old working vs real re-entry is indistinguishable — UK-2).
\* R68-L3 scope: ast holds only "idle" | "working" here, so only the idle branch of the reply is modelled; the
\*   agent.get "blocked" / "done" branches are covered by code tests only.
\* Watchdog (product draft): every events.subscribe ACK after the first schedules an agent.get reconciliation
\*   for each in-flight pane card (R1). Target predicate = sawWorking (R3; variant "verified" = vpc = "done" is
\*   the falsification run). If agent.get shows a non-working status the flight has not observed, a grace window
\*   opens; at its end the "not observed" predicate (R4) is re-checked and the card fails loudly
\*   (failed / status_lost) — never a completion, never a reinject, never a pane close.
\* Expected TLC verdicts (P0 row; any mismatch = do not start P1, record, R68 re-judges):
\*   BridgeStartupWatchdog_Gap.cfg          No error (TypeOK NoEarlyCompletion NoFalseCompletion WatchdogSound · ER)
\*   BridgeStartupWatchdog_Drop.cfg         No error (same INV/PROP)
\*   BridgeStartupWatchdog_GapCompletes.cfg CompletesWhenAgentCompletes VIOLATED (by design — class 98)
\*   BridgeStartupWatchdog_GapRun.cfg       AtMostOneRun VIOLATED (same as C6 — watchdog untouched reinject)
\*   BridgeStartupWatchdog_DropRun.cfg      AtMostOneRun VIOLATED (same class as F8 — R14 ⓑ)
\*   BridgeStartupWatchdog_GapVerified.cfg  EventuallyResolved VIOLATED (R3 evidence: "verified" guard leaves C5)
\*   BridgeStartupWatchdog_GapReplay.cfg    No error (R68-M1: _Gap + Replay = TRUE — replayed backlog incl. old W)
\* R14 ⓐ structural claim: WdGetReq / WdGetResp / WdGetFail / WdFire / WdDrop leave agentV and verifyV
\*   UNCHANGED, and the watchdog part of ConsumeAck / ConsumeStatus touches only wdV, so no watchdog step raises
\*   runs.
\*
\* Base header (BridgeStartup.tla):
\* CURRENT design (main 56a171a), round 3 (Astra 0222; round 2 = Astra 0219): one card's startup + status handling.
\* Sequence: spawnWorkerAgent (bridge-runtime.ts:1983) -> flights.set (:2026) -> herdr.eventsSubscribe (:2030,
\*   awaits the ACK) -> injectPromptAndSubmit (:2058; agent_prompt_stalled continues, :2060) -> verifyInjectOrRetry
\*   (:2082 -> :2618, wall-clock deadline :2638).
\* Status reaction: onHerdrEvent (:2758, unknown flight ignored :2764) -> onCardHerdrEvent (:3084):
\*   working -> sawWorking (:3141) and cancels a still-running deferral (:3130-3134);
\*   (done \/ idle /\ sawWorking) /\ ~deferral -> deferral := TRUE, beginCardCompletion (:3165, :3192) —
\*   "done" needs NO sawWorking (:3165);
\*   completion-class while deferral is set -> no-op (:3187).
\* Completion is NOT atomic: beginCardCompletion awaits the settle scrape (:2893). On success it returns without a
\*   result if a working event cleared the deferral meanwhile (guard :2918, requireDeferral). On scrape FAILURE
\*   (catch :2894) the guard at :2898 has NO requireDeferral and :2912 proposes a completion-class result anyway —
\*   a cancelled completion still completes (round 3, ScrapeFail). Still-running polling (:2953) is folded into the
\*   same "scrape" step; its read-failure catch keeps requireDeferral (:2980), so applying the failure branch to the
\*   folded step over-approximates the poll case.
\* Event socket (herdr-client.ts): every events.subscribe destroys the old socket first (:738-746) and opens a
\*   new one (:752); a dropped socket reconnects with backoff (:873-888). On the new socket the server first
\*   registers the subscription, then writes the ACK; pushes written before the ACK are dispatched
\*   synchronously in the same parse loop (:807-830), so they are handled before the ACK resolves the
\*   subscribe promise. The continuation that sends the prompt therefore runs after every pre-ACK push
\*   (modelled: consuming the "ack" message performs the prompt send atomically).
\* herdr "done" status (round 3): DoneWhen = "never" (scope exclusion, round-2 behaviour) | "prompt" (at most one
\*   done any time after the prompt arrived — includes after the prompt RPC returned but before the real
\*   working->idle) | "work" (at most one done only after the real post-prompt working->idle). agent.get-free in
\*   the base; the watchdog's agent.get snapshots ast at request time (WdGetReq) and its reply carries that
\*   snapshot (WdGetResp — R68-M2).
\* Not modelled: pane.closed except as the optional operator close (CloseFair), blocked, hook sensor, conv path.
EXTENDS Naturals, Sequences

CONSTANTS MaxBoot,      \* boot working->idle pairs the agent may emit before the prompt arrives
          MaxOthers,    \* other cards' events.subscribe during this card (socket replacement)
          MaxDrops,     \* unplanned socket drops (reconnect with backoff)
          MaxRetries,   \* submitVerify.retries (3 in prod; small here)
          LatencyBound, \* TRUE = explicit assumption: waitMs outlasts prompt->working latency (see Plausible)
          Replay,       \* TRUE = herdr replays this pane's status backlog to a new subscriber (not seen on 0.7.4)
          Stall,        \* TRUE = agent.prompt may return agent_prompt_stalled (prompt may or may not arrive)
          CloseFair,    \* TRUE = an operator eventually closes a dispatched pane (pane.closed -> failed result)
          ScrapeFail,   \* TRUE = the settle scrape may fail (catch :2894 -> completion without requireDeferral)
          DoneWhen,     \* "never" | "prompt" | "work" — when the agent may emit one herdr "done" status
          WdGuard,      \* watchdog target predicate: "sawWorking" (R3 draft) | "verified" (D5 wording, vpc = "done")
          QFail         \* TRUE = agent.get may error / return unknown (no action — class 99; unfair)

VARIABLES bpc,          \* bridge: "spawn" "reg" "sub" "ack" "inflight" "post"
          sawWorking,   \* flight.sawWorking
          deferral,     \* flight.stillRunningDeferral
          cpc,          \* beginCardCompletion: "none" | "scrape" (settle scrape / still-running poll outstanding)
          result,       \* "none" | "completed" (completion-class) | "failed"
          vpc,          \* verifyInjectOrRetry: "off" | "wait" | "done"
          vround, reinjectUsed,
          apc,          \* agent: "absent" | "boot" | "prompted" | "working" | "idle"
          ast,          \* status herdr currently reports ("idle" | "working")
          bootLeft,
          runs,         \* times the agent started working on the prompt (reinject can make it 2)
          submitted,    \* prompt arrived at the agent (ghost)
          plost,        \* a stalled prompt that will never arrive by itself
          agentDidWork, \* agent went idle after a post-prompt working (ghost)
          hist,         \* status backlog of this pane (kept only when Replay)
          doneSent,     \* the agent emitted its (single) "done" status
          sk,           \* current event socket: "conn" (opened, server not registered) | "reg" | "gone"
          carries,      \* current socket's subscription list includes this pane
          ackW,         \* server wrote the ACK on the current socket
          est,          \* client consumed the ACK on the current socket
          stream,       \* bytes on the current socket not yet handled by the client: "W" "I" "D" "ack"
          paneIn,       \* this pane is in the client's subscription list
          others, drops,
          wq,           \* watchdog check for this flight: "none" | "armed" (ACK seen, reconciliation scheduled)
                        \*   | "get" (agent.get outstanding) | "grace" (grace window open)
          wdFired,      \* ghost: the watchdog emitted failed / status_lost
          wsnap,        \* R68-M2: ast as herdr saw it when the outstanding agent.get was served ("none" = no get)
          wregen        \* R68-M2: re-get mark — an ACK arrived while wq \in {"get", "grace"}

bridgeV == <<bpc, sawWorking, deferral, cpc, result>>
verifyV == <<vpc, vround, reinjectUsed>>
agentV  == <<apc, ast, bootLeft, runs, submitted, plost, agentDidWork, hist, doneSent>>
sockV   == <<sk, carries, ackW, est, stream>>
envV    == <<paneIn, others, drops>>
wdV     == <<wq, wdFired, wsnap, wregen>>
vars    == <<bridgeV, verifyV, agentV, sockV, envV, wdV>>

Init == /\ bpc = "spawn" /\ sawWorking = FALSE /\ deferral = FALSE /\ cpc = "none" /\ result = "none"
        /\ vpc = "off" /\ vround = 0 /\ reinjectUsed = FALSE
        /\ apc = "absent" /\ ast = "idle" /\ bootLeft = MaxBoot /\ runs = 0
        /\ submitted = FALSE /\ plost = FALSE /\ agentDidWork = FALSE /\ hist = <<>> /\ doneSent = FALSE
        \* an established socket of earlier cards, without this pane
        /\ sk = "reg" /\ carries = FALSE /\ ackW = TRUE /\ est = TRUE /\ stream = <<>>
        /\ paneIn = FALSE /\ others = 0 /\ drops = 0
        /\ wq = "none" /\ wdFired = FALSE /\ wsnap = "none" /\ wregen = FALSE

Alive      == bpc \notin {"spawn", "reg"} /\ result = "none"   \* flights.get(pane) = this flight, no result
Dispatched == bpc \in {"inflight", "post"}
InSeq(s, e) == \E i \in 1..Len(s) : s[i] = e

\* herdr broadcast: only to a subscription the server has registered; the backlog is kept for Replay.
Emit(e) == /\ stream' = IF sk = "reg" /\ carries THEN Append(stream, e) ELSE stream
           /\ hist' = IF Replay THEN Append(hist, e) ELSE hist

\* openEventConnection: the old socket is destroyed with its unread bytes (herdr-client.ts:738-746).
Reopen(carr) == /\ sk' = "conn" /\ carries' = carr /\ ackW' = FALSE /\ est' = FALSE /\ stream' = <<>>

---------------------------------------------------------------------------
\* Bridge startup (processCard ~:1903-2088)
Spawn     == /\ bpc = "spawn" /\ bpc' = "reg" /\ apc' = "boot"
             /\ UNCHANGED <<sawWorking, deferral, cpc, result, verifyV,
                            ast, bootLeft, runs, submitted, plost, agentDidWork, hist, doneSent, sockV, envV>>
             /\ UNCHANGED wdV
Register  == /\ bpc = "reg" /\ bpc' = "sub"
             /\ UNCHANGED <<sawWorking, deferral, cpc, result, verifyV, agentV, sockV, envV>>
             /\ UNCHANGED wdV
Subscribe == /\ bpc = "sub" /\ bpc' = "ack" /\ paneIn' = TRUE /\ Reopen(TRUE)
             /\ UNCHANGED <<sawWorking, deferral, cpc, result, verifyV, agentV, others, drops>>
             /\ UNCHANGED wdV

\* herdr server side of the current socket: register the subscription (backlog first if Replay), then ACK.
SrvReg == /\ sk = "conn" /\ sk' = "reg"
          /\ stream' = IF Replay /\ carries THEN hist ELSE stream
          /\ UNCHANGED <<bridgeV, verifyV, agentV, carries, ackW, est, envV>>
          /\ UNCHANGED wdV
SrvAck == /\ sk = "reg" /\ ~ackW /\ ackW' = TRUE /\ stream' = Append(stream, "ack")
          /\ UNCHANGED <<bridgeV, verifyV, agentV, sk, carries, est, envV>>
          /\ UNCHANGED wdV

\* ACK handled: the shared subscribe promise resolves (any generation's ACK resolves it, :764-776);
\* its continuation sends the prompt (no fence in the current design).
\* Watchdog (R1 · R14): the ACK callback schedules a reconciliation — wq "none" -> "armed"; "armed" unchanged
\* (the pending get will read the state after this ACK); "get" / "grace" -> set the re-get mark wregen
\* (R68-M2: the outstanding reply may predate this ACK's loss; consumed by WdGetResp / WdGetFail / WdDrop).
\* NOTE: arming is unconditional on Alive / sawWorking here; WdGetReq's guard decides whether the flight is a
\*   target. This card's own subscribe ACK (bpc = "ack") arms too and is discarded by WdGetReq (sawWorking is
\*   FALSE then), matching R1 "first ACK -> no target" without a separate flag.
ConsumeAck == /\ stream # <<>> /\ Head(stream) = "ack"
              /\ stream' = Tail(stream) /\ est' = TRUE
              /\ bpc' = IF bpc = "ack" /\ result = "none" THEN "inflight" ELSE bpc
              /\ wq' = IF wq = "none" THEN "armed" ELSE wq
              /\ wregen' = IF wq \in {"get", "grace"} THEN TRUE ELSE wregen
              /\ UNCHANGED <<sawWorking, deferral, cpc, result, verifyV, agentV, sk, carries, ackW, envV,
                             wdFired, wsnap>>

\* onCardHerdrEvent status gate (:3127-3194). "D" (done) is completion-class without sawWorking (:3165).
Gate(e) ==
  LET work  == Alive /\ e = "W"
      start == Alive /\ ((e = "I" /\ sawWorking) \/ e = "D") /\ ~deferral
  IN /\ sawWorking' = (sawWorking \/ work)
     /\ deferral' = IF work THEN FALSE ELSE IF start THEN TRUE ELSE deferral
     /\ cpc' = IF start THEN "scrape" ELSE cpc

\* R5 (R68-M1): a working event for a live flight during "grace" clears the grace timer and re-asks — wq
\*   "grace" -> "armed" (one agent.get), mark absorbed. It is not a withdrawal: a replayed old "W" (Replay) and a
\*   real re-entry look the same (UK-2), so the next agent.get decides. Every other status leaves wq to the
\*   existing gate (R4 at grace end).
WdReask(e) == Alive /\ e = "W" /\ wq = "grace"
ConsumeStatus == /\ stream # <<>> /\ Head(stream) \in {"W", "I", "D"}
                 /\ stream' = Tail(stream) /\ Gate(Head(stream))
                 /\ wq' = IF WdReask(Head(stream)) THEN "armed" ELSE wq
                 /\ wregen' = IF WdReask(Head(stream)) THEN FALSE ELSE wregen
                 /\ UNCHANGED <<bpc, result, verifyV, agentV, sk, carries, ackW, est, envV>>
                 /\ UNCHANGED <<wdFired, wsnap>>

\* settle scrape succeeds: guardFlightCompletion(requireDeferral) (:2918) -> result, else return silently.
ScrapeDone == /\ cpc = "scrape" /\ cpc' = "none"
              /\ result' = IF deferral /\ Alive THEN "completed" ELSE result
              /\ UNCHANGED <<bpc, sawWorking, deferral, verifyV, agentV, sockV, envV>>
              /\ UNCHANGED wdV
\* settle scrape fails (catch :2894): guard WITHOUT requireDeferral (:2898) -> completion-class proposal (:2912)
\* even if a working event cancelled the deferral meanwhile.
ScrapeErr  == /\ ScrapeFail /\ cpc = "scrape" /\ cpc' = "none"
              /\ result' = IF Alive THEN "completed" ELSE result
              /\ UNCHANGED <<bpc, sawWorking, deferral, verifyV, agentV, sockV, envV>>
              /\ UNCHANGED wdV

SubmitReturn == /\ bpc = "inflight" /\ submitted /\ bpc' = "post" /\ vpc' = "wait"
                /\ UNCHANGED <<sawWorking, deferral, cpc, result, vround, reinjectUsed, agentV, sockV, envV>>
                /\ UNCHANGED wdV
\* agent_prompt_stalled (:2060): continue to verification; the prompt may still arrive, or never.
SubmitStall == /\ Stall /\ bpc = "inflight" /\ bpc' = "post" /\ vpc' = "wait"
               /\ IF submitted THEN UNCHANGED plost ELSE plost' \in BOOLEAN
               /\ UNCHANGED <<sawWorking, deferral, cpc, result, vround, reinjectUsed,
                              apc, ast, bootLeft, runs, submitted, agentDidWork, hist, doneSent, sockV, envV>>
               /\ UNCHANGED wdV

\* verifyInjectOrRetry: wait for sawWorking or flight gone; on timeout probe + nudge / one reinject;
\* retries exhausted -> inject_unconfirmed (failed).
VerifyDone == /\ vpc = "wait" /\ (sawWorking \/ result # "none") /\ vpc' = "done"
              /\ UNCHANGED <<bridgeV, vround, reinjectUsed, agentV, sockV, envV>>
              /\ UNCHANGED wdV
\* Explicit latency assumption (only when LatencyBound): the 4 s deadline does not overtake an agent that has
\* the prompt but has not reported working, a working already on the wire, or a stalled prompt still in transit.
\* It does NOT bound socket gaps / reconnect backoff.
Plausible == /\ apc # "prompted"
             /\ ~InSeq(stream, "W")
             /\ ~(apc = "boot" /\ ~submitted /\ ~plost /\ bpc = "post")
VerifyTimeout ==
  /\ vpc = "wait" /\ ~sawWorking /\ result = "none"
  /\ (LatencyBound => Plausible)
  /\ IF vround < MaxRetries
       THEN /\ vround' = vround + 1
            /\ \/ UNCHANGED <<reinjectUsed, apc, submitted, plost>>     \* probe hit / read-fail -> CR nudge
               \/ /\ ~reinjectUsed /\ reinjectUsed' = TRUE               \* probe miss -> full reinject
                  /\ IF apc = "idle" \/ (apc = "boot" /\ ast = "idle")
                       THEN /\ apc' = "prompted" /\ submitted' = TRUE /\ plost' = FALSE
                       ELSE UNCHANGED <<apc, submitted, plost>>
            /\ UNCHANGED <<result, vpc>>
       ELSE /\ result' = "failed" /\ vpc' = "done"
            /\ UNCHANGED <<vround, reinjectUsed, apc, submitted, plost>>
  /\ UNCHANGED <<bpc, sawWorking, deferral, cpc, ast, bootLeft, runs, agentDidWork, hist, doneSent, sockV, envV>>
  /\ UNCHANGED wdV

---------------------------------------------------------------------------
\* herdr agent
BootWork == /\ apc = "boot" /\ ast = "idle" /\ bootLeft > 0 /\ ast' = "working" /\ Emit("W")
            /\ UNCHANGED <<bridgeV, verifyV, apc, bootLeft, runs, submitted, plost, agentDidWork, doneSent,
                           sk, carries, ackW, est, envV>>
            /\ UNCHANGED wdV
BootIdle == /\ apc = "boot" /\ ast = "working" /\ ast' = "idle" /\ bootLeft' = bootLeft - 1 /\ Emit("I")
            /\ UNCHANGED <<bridgeV, verifyV, apc, runs, submitted, plost, agentDidWork, doneSent,
                           sk, carries, ackW, est, envV>>
            /\ UNCHANGED wdV
PromptArrive == /\ bpc \in {"inflight", "post"} /\ apc = "boot" /\ ast = "idle" /\ ~plost
                /\ apc' = "prompted" /\ submitted' = TRUE
                /\ UNCHANGED <<bridgeV, verifyV, ast, bootLeft, runs, plost, agentDidWork, hist, doneSent,
                               sockV, envV>>
                /\ UNCHANGED wdV
AgentWork == /\ apc = "prompted" /\ apc' = "working" /\ ast' = "working" /\ runs' = runs + 1 /\ Emit("W")
             /\ UNCHANGED <<bridgeV, verifyV, bootLeft, submitted, plost, agentDidWork, doneSent,
                            sk, carries, ackW, est, envV>>
             /\ UNCHANGED wdV
AgentIdle == /\ apc = "working" /\ apc' = "idle" /\ ast' = "idle" /\ agentDidWork' = TRUE /\ Emit("I")
             /\ UNCHANGED <<bridgeV, verifyV, bootLeft, runs, submitted, plost, doneSent,
                            sk, carries, ackW, est, envV>>
             /\ UNCHANGED wdV
\* herdr "done" (round 3): at most one, when DoneWhen allows it. Does not change the reported idle/working.
DoneOK == CASE DoneWhen = "prompt" -> submitted
          []   DoneWhen = "work"   -> agentDidWork
          []   OTHER               -> FALSE
AgentDone == /\ DoneOK /\ ~doneSent /\ doneSent' = TRUE /\ Emit("D")
             /\ UNCHANGED <<bridgeV, verifyV, apc, ast, bootLeft, runs, submitted, plost, agentDidWork,
                            sk, carries, ackW, est, envV>>
             /\ UNCHANGED wdV

\* environment
OtherSubscribe == /\ others < MaxOthers /\ others' = others + 1 /\ Reopen(paneIn)
                  /\ UNCHANGED <<bridgeV, verifyV, agentV, paneIn, drops>>
                  /\ UNCHANGED wdV
\* Drop: unread bytes lost. Before the client saw the ACK, the subscribe promise rejects (:853-858): this
\* card fails with events_subscribe_failed if it was the one waiting.
Drop == /\ drops < MaxDrops /\ sk # "gone" /\ drops' = drops + 1
        /\ sk' = "gone" /\ stream' = <<>> /\ est' = FALSE /\ ackW' = FALSE
        /\ result' = IF ~est /\ bpc = "ack" /\ result = "none" THEN "failed" ELSE result
        /\ UNCHANGED <<bpc, sawWorking, deferral, cpc, verifyV, agentV, carries, paneIn, others>>
        /\ UNCHANGED wdV
Reconnect == /\ sk = "gone" /\ Reopen(paneIn)
             /\ UNCHANGED <<bridgeV, verifyV, agentV, envV>>
             /\ UNCHANGED wdV
\* pane.closed (global subscription, terminal events are replayed): optional operator resolution (:3091-3119).
PaneClose == /\ CloseFair /\ Alive /\ Dispatched /\ result' = "failed"
             /\ UNCHANGED <<bpc, sawWorking, deferral, cpc, verifyV, agentV, sockV, envV>>
             /\ UNCHANGED wdV

---------------------------------------------------------------------------
\* Status-loss watchdog (0.45.4 — PLAN §0.45.4 D2 · D4 · D5 · R3 · R4 · R11 · R14)
\* Target guard (R3): "sawWorking" = flight.sawWorking (draft); "verified" = inject verification finished
\*   (vpc = "done", the D5 wording) — the falsification variant.
WdTarget == CASE WdGuard = "sawWorking" -> sawWorking
            []   WdGuard = "verified"   -> vpc = "done"
            []   OTHER                  -> FALSE
\* R4 "not observed": guardFlightCompletion without requireDeferral (map identity = Alive, no side-effect
\*   owner / pending terminal = cpc = "none") /\ ~stillRunningDeferral.
\* NOTE: the model has no separate flightSideEffectOwner / terminalPending; cpc = "none" (no completion in
\*   progress) is the closest existing state, the same conjunct the WdGetReq / WdGetResp guard uses.
WdNotObserved == Alive /\ ~deferral /\ cpc = "none"

WdCandidate == Alive /\ Dispatched /\ WdTarget /\ WdNotObserved
\* Non-fire exit of "get" / "grace": the re-get mark buys exactly one more agent.get (R68-M2), else idle.
WdNext == IF wregen THEN "armed" ELSE "none"

\* R68-M2: agent.get is not atomic. Request (fair): R4 "just before the get" — a non-target goes back to
\*   "none"; a target sends the get and herdr serves it from the status it holds now (wsnap' = ast). Concurrent
\*   agent.get per flight <= 1: a request is only possible from "armed", and "armed" is never re-entered while
\*   wq = "get".
WdGetReq == /\ wq = "armed"
            /\ IF WdCandidate
                 THEN /\ wq' = "get" /\ wsnap' = ast /\ UNCHANGED wregen
                 ELSE /\ wq' = "none" /\ wregen' = FALSE /\ UNCHANGED wsnap
            /\ UNCHANGED <<bridgeV, verifyV, agentV, sockV, envV, wdFired>>
\* Response (fair): reads the snapshot, not the current ast (the reply may be stale). R4 "just after the reply":
\*   snapshot "idle" (the only non-working status ast can hold here — R68-L3) and still a candidate -> grace,
\*   mark cleared (grace end re-checks R4; an ACK inside grace sets it again); otherwise WdNext.
WdGetResp == /\ wq = "get"
             /\ IF WdCandidate /\ wsnap = "idle"
                  THEN /\ wq' = "grace" /\ wregen' = FALSE
                  ELSE /\ wq' = WdNext /\ wregen' = FALSE
             /\ wsnap' = "none"
             /\ UNCHANGED <<bridgeV, verifyV, agentV, sockV, envV, wdFired>>
\* agent.get error / "unknown" on the response side (QFail, unfair — class 99): no verdict; the mark still
\*   re-asks once (an ACK that arrived meanwhile is a new question), else idle.
WdGetFail == /\ QFail /\ wq = "get" /\ wq' = WdNext /\ wregen' = FALSE /\ wsnap' = "none"
             /\ UNCHANGED <<bridgeV, verifyV, agentV, sockV, envV, wdFired>>
\* Grace end, R4 still true: fail loudly (failed / status_lost) — same UNCHANGED shape as PaneClose.
WdFire == /\ wq = "grace" /\ WdNotObserved
          /\ result' = "failed" /\ wdFired' = TRUE /\ wq' = "none" /\ wregen' = FALSE
          /\ UNCHANGED <<bpc, sawWorking, deferral, cpc, verifyV, agentV, sockV, envV, wsnap>>
\* Grace end, R4 false (a real event won via the existing path, or the flight is gone): retire; an ACK seen
\*   during grace re-asks once (WdNext — WdGetReq discards it if the flight is no longer a candidate).
WdDrop == /\ wq = "grace" /\ ~WdNotObserved /\ wq' = WdNext /\ wregen' = FALSE
          /\ UNCHANGED <<bridgeV, verifyV, agentV, sockV, envV, wdFired, wsnap>>

Next == \/ Spawn \/ Register \/ Subscribe \/ SrvReg \/ SrvAck \/ ConsumeAck \/ ConsumeStatus
        \/ ScrapeDone \/ ScrapeErr
        \/ SubmitReturn \/ SubmitStall \/ VerifyDone \/ VerifyTimeout
        \/ BootWork \/ BootIdle \/ PromptArrive \/ AgentWork \/ AgentIdle \/ AgentDone
        \/ OtherSubscribe \/ Drop \/ Reconnect \/ PaneClose
        \/ WdGetReq \/ WdGetResp \/ WdGetFail \/ WdFire \/ WdDrop

\* BootWork, SubmitStall, ScrapeErr, AgentDone, OtherSubscribe, Drop and WdGetFail are unfair
\* (possible, never forced).
Fairness == /\ WF_vars(Spawn) /\ WF_vars(Register) /\ WF_vars(Subscribe)
            /\ WF_vars(SrvReg) /\ WF_vars(SrvAck) /\ WF_vars(ConsumeAck) /\ WF_vars(ConsumeStatus)
            /\ WF_vars(ScrapeDone) /\ WF_vars(SubmitReturn) /\ WF_vars(VerifyDone) /\ WF_vars(VerifyTimeout)
            /\ WF_vars(BootIdle) /\ WF_vars(PromptArrive) /\ WF_vars(AgentWork) /\ WF_vars(AgentIdle)
            /\ WF_vars(Reconnect) /\ WF_vars(PaneClose)
            /\ WF_vars(WdGetReq) /\ WF_vars(WdGetResp) /\ WF_vars(WdFire) /\ WF_vars(WdDrop)

Spec == Init /\ [][Next]_vars /\ Fairness

---------------------------------------------------------------------------
TypeOK == /\ bpc \in {"spawn", "reg", "sub", "ack", "inflight", "post"}
          /\ result \in {"none", "completed", "failed"} /\ cpc \in {"none", "scrape"}
          /\ sk \in {"conn", "reg", "gone"} /\ DoneWhen \in {"never", "prompt", "work"}
          /\ Len(stream) <= 16 /\ runs <= 2
          /\ wq \in {"none", "armed", "get", "grace"} /\ wdFired \in BOOLEAN
          /\ wsnap \in {"none", "idle", "working"} /\ wregen \in BOOLEAN
          /\ (wsnap # "none" <=> wq = "get")
          /\ WdGuard \in {"sawWorking", "verified"} /\ QFail \in BOOLEAN
NoEarlyCompletion == result = "completed" => submitted
NoFalseCompletion == result = "completed" => agentDidWork
AtMostOneRun == runs <= 1
\* R14 soundness: status_lost only after the agent really finished post-prompt work. agentDidWork is the base
\* model's existing ghost (set by AgentIdle: idle after a post-prompt working), so no derivation is needed.
WatchdogSound == wdFired => agentDidWork
EventuallyResolved == Dispatched ~> (result # "none")
CompletesWhenAgentCompletes == agentDidWork ~> (result = "completed")
====
