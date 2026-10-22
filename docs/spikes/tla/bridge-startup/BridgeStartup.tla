---- MODULE BridgeStartup ----
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
\*   working->idle) | "work" (at most one done only after the real post-prompt working->idle). agent.get-free here.
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
          DoneWhen      \* "never" | "prompt" | "work" — when the agent may emit one herdr "done" status

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
          others, drops

bridgeV == <<bpc, sawWorking, deferral, cpc, result>>
verifyV == <<vpc, vround, reinjectUsed>>
agentV  == <<apc, ast, bootLeft, runs, submitted, plost, agentDidWork, hist, doneSent>>
sockV   == <<sk, carries, ackW, est, stream>>
envV    == <<paneIn, others, drops>>
vars    == <<bridgeV, verifyV, agentV, sockV, envV>>

Init == /\ bpc = "spawn" /\ sawWorking = FALSE /\ deferral = FALSE /\ cpc = "none" /\ result = "none"
        /\ vpc = "off" /\ vround = 0 /\ reinjectUsed = FALSE
        /\ apc = "absent" /\ ast = "idle" /\ bootLeft = MaxBoot /\ runs = 0
        /\ submitted = FALSE /\ plost = FALSE /\ agentDidWork = FALSE /\ hist = <<>> /\ doneSent = FALSE
        \* an established socket of earlier cards, without this pane
        /\ sk = "reg" /\ carries = FALSE /\ ackW = TRUE /\ est = TRUE /\ stream = <<>>
        /\ paneIn = FALSE /\ others = 0 /\ drops = 0

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
Register  == /\ bpc = "reg" /\ bpc' = "sub"
             /\ UNCHANGED <<sawWorking, deferral, cpc, result, verifyV, agentV, sockV, envV>>
Subscribe == /\ bpc = "sub" /\ bpc' = "ack" /\ paneIn' = TRUE /\ Reopen(TRUE)
             /\ UNCHANGED <<sawWorking, deferral, cpc, result, verifyV, agentV, others, drops>>

\* herdr server side of the current socket: register the subscription (backlog first if Replay), then ACK.
SrvReg == /\ sk = "conn" /\ sk' = "reg"
          /\ stream' = IF Replay /\ carries THEN hist ELSE stream
          /\ UNCHANGED <<bridgeV, verifyV, agentV, carries, ackW, est, envV>>
SrvAck == /\ sk = "reg" /\ ~ackW /\ ackW' = TRUE /\ stream' = Append(stream, "ack")
          /\ UNCHANGED <<bridgeV, verifyV, agentV, sk, carries, est, envV>>

\* ACK handled: the shared subscribe promise resolves (any generation's ACK resolves it, :764-776);
\* its continuation sends the prompt (no fence in the current design).
ConsumeAck == /\ stream # <<>> /\ Head(stream) = "ack"
              /\ stream' = Tail(stream) /\ est' = TRUE
              /\ bpc' = IF bpc = "ack" /\ result = "none" THEN "inflight" ELSE bpc
              /\ UNCHANGED <<sawWorking, deferral, cpc, result, verifyV, agentV, sk, carries, ackW, envV>>

\* onCardHerdrEvent status gate (:3127-3194). "D" (done) is completion-class without sawWorking (:3165).
Gate(e) ==
  LET work  == Alive /\ e = "W"
      start == Alive /\ ((e = "I" /\ sawWorking) \/ e = "D") /\ ~deferral
  IN /\ sawWorking' = (sawWorking \/ work)
     /\ deferral' = IF work THEN FALSE ELSE IF start THEN TRUE ELSE deferral
     /\ cpc' = IF start THEN "scrape" ELSE cpc

ConsumeStatus == /\ stream # <<>> /\ Head(stream) \in {"W", "I", "D"}
                 /\ stream' = Tail(stream) /\ Gate(Head(stream))
                 /\ UNCHANGED <<bpc, result, verifyV, agentV, sk, carries, ackW, est, envV>>

\* settle scrape succeeds: guardFlightCompletion(requireDeferral) (:2918) -> result, else return silently.
ScrapeDone == /\ cpc = "scrape" /\ cpc' = "none"
              /\ result' = IF deferral /\ Alive THEN "completed" ELSE result
              /\ UNCHANGED <<bpc, sawWorking, deferral, verifyV, agentV, sockV, envV>>
\* settle scrape fails (catch :2894): guard WITHOUT requireDeferral (:2898) -> completion-class proposal (:2912)
\* even if a working event cancelled the deferral meanwhile.
ScrapeErr  == /\ ScrapeFail /\ cpc = "scrape" /\ cpc' = "none"
              /\ result' = IF Alive THEN "completed" ELSE result
              /\ UNCHANGED <<bpc, sawWorking, deferral, verifyV, agentV, sockV, envV>>

SubmitReturn == /\ bpc = "inflight" /\ submitted /\ bpc' = "post" /\ vpc' = "wait"
                /\ UNCHANGED <<sawWorking, deferral, cpc, result, vround, reinjectUsed, agentV, sockV, envV>>
\* agent_prompt_stalled (:2060): continue to verification; the prompt may still arrive, or never.
SubmitStall == /\ Stall /\ bpc = "inflight" /\ bpc' = "post" /\ vpc' = "wait"
               /\ IF submitted THEN UNCHANGED plost ELSE plost' \in BOOLEAN
               /\ UNCHANGED <<sawWorking, deferral, cpc, result, vround, reinjectUsed,
                              apc, ast, bootLeft, runs, submitted, agentDidWork, hist, doneSent, sockV, envV>>

\* verifyInjectOrRetry: wait for sawWorking or flight gone; on timeout probe + nudge / one reinject;
\* retries exhausted -> inject_unconfirmed (failed).
VerifyDone == /\ vpc = "wait" /\ (sawWorking \/ result # "none") /\ vpc' = "done"
              /\ UNCHANGED <<bridgeV, vround, reinjectUsed, agentV, sockV, envV>>
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

---------------------------------------------------------------------------
\* herdr agent
BootWork == /\ apc = "boot" /\ ast = "idle" /\ bootLeft > 0 /\ ast' = "working" /\ Emit("W")
            /\ UNCHANGED <<bridgeV, verifyV, apc, bootLeft, runs, submitted, plost, agentDidWork, doneSent,
                           sk, carries, ackW, est, envV>>
BootIdle == /\ apc = "boot" /\ ast = "working" /\ ast' = "idle" /\ bootLeft' = bootLeft - 1 /\ Emit("I")
            /\ UNCHANGED <<bridgeV, verifyV, apc, runs, submitted, plost, agentDidWork, doneSent,
                           sk, carries, ackW, est, envV>>
PromptArrive == /\ bpc \in {"inflight", "post"} /\ apc = "boot" /\ ast = "idle" /\ ~plost
                /\ apc' = "prompted" /\ submitted' = TRUE
                /\ UNCHANGED <<bridgeV, verifyV, ast, bootLeft, runs, plost, agentDidWork, hist, doneSent,
                               sockV, envV>>
AgentWork == /\ apc = "prompted" /\ apc' = "working" /\ ast' = "working" /\ runs' = runs + 1 /\ Emit("W")
             /\ UNCHANGED <<bridgeV, verifyV, bootLeft, submitted, plost, agentDidWork, doneSent,
                            sk, carries, ackW, est, envV>>
AgentIdle == /\ apc = "working" /\ apc' = "idle" /\ ast' = "idle" /\ agentDidWork' = TRUE /\ Emit("I")
             /\ UNCHANGED <<bridgeV, verifyV, bootLeft, runs, submitted, plost, doneSent,
                            sk, carries, ackW, est, envV>>
\* herdr "done" (round 3): at most one, when DoneWhen allows it. Does not change the reported idle/working.
DoneOK == CASE DoneWhen = "prompt" -> submitted
          []   DoneWhen = "work"   -> agentDidWork
          []   OTHER               -> FALSE
AgentDone == /\ DoneOK /\ ~doneSent /\ doneSent' = TRUE /\ Emit("D")
             /\ UNCHANGED <<bridgeV, verifyV, apc, ast, bootLeft, runs, submitted, plost, agentDidWork,
                            sk, carries, ackW, est, envV>>

\* environment
OtherSubscribe == /\ others < MaxOthers /\ others' = others + 1 /\ Reopen(paneIn)
                  /\ UNCHANGED <<bridgeV, verifyV, agentV, paneIn, drops>>
\* Drop: unread bytes lost. Before the client saw the ACK, the subscribe promise rejects (:853-858): this
\* card fails with events_subscribe_failed if it was the one waiting.
Drop == /\ drops < MaxDrops /\ sk # "gone" /\ drops' = drops + 1
        /\ sk' = "gone" /\ stream' = <<>> /\ est' = FALSE /\ ackW' = FALSE
        /\ result' = IF ~est /\ bpc = "ack" /\ result = "none" THEN "failed" ELSE result
        /\ UNCHANGED <<bpc, sawWorking, deferral, cpc, verifyV, agentV, carries, paneIn, others>>
Reconnect == /\ sk = "gone" /\ Reopen(paneIn)
             /\ UNCHANGED <<bridgeV, verifyV, agentV, envV>>
\* pane.closed (global subscription, terminal events are replayed): optional operator resolution (:3091-3119).
PaneClose == /\ CloseFair /\ Alive /\ Dispatched /\ result' = "failed"
             /\ UNCHANGED <<bpc, sawWorking, deferral, cpc, verifyV, agentV, sockV, envV>>

Next == \/ Spawn \/ Register \/ Subscribe \/ SrvReg \/ SrvAck \/ ConsumeAck \/ ConsumeStatus
        \/ ScrapeDone \/ ScrapeErr
        \/ SubmitReturn \/ SubmitStall \/ VerifyDone \/ VerifyTimeout
        \/ BootWork \/ BootIdle \/ PromptArrive \/ AgentWork \/ AgentIdle \/ AgentDone
        \/ OtherSubscribe \/ Drop \/ Reconnect \/ PaneClose

\* BootWork, SubmitStall, ScrapeErr, AgentDone, OtherSubscribe and Drop are unfair (possible, never forced).
Fairness == /\ WF_vars(Spawn) /\ WF_vars(Register) /\ WF_vars(Subscribe)
            /\ WF_vars(SrvReg) /\ WF_vars(SrvAck) /\ WF_vars(ConsumeAck) /\ WF_vars(ConsumeStatus)
            /\ WF_vars(ScrapeDone) /\ WF_vars(SubmitReturn) /\ WF_vars(VerifyDone) /\ WF_vars(VerifyTimeout)
            /\ WF_vars(BootIdle) /\ WF_vars(PromptArrive) /\ WF_vars(AgentWork) /\ WF_vars(AgentIdle)
            /\ WF_vars(Reconnect) /\ WF_vars(PaneClose)

Spec == Init /\ [][Next]_vars /\ Fairness

---------------------------------------------------------------------------
TypeOK == /\ bpc \in {"spawn", "reg", "sub", "ack", "inflight", "post"}
          /\ result \in {"none", "completed", "failed"} /\ cpc \in {"none", "scrape"}
          /\ sk \in {"conn", "reg", "gone"} /\ DoneWhen \in {"never", "prompt", "work"}
          /\ Len(stream) <= 16 /\ runs <= 2
NoEarlyCompletion == result = "completed" => submitted
NoFalseCompletion == result = "completed" => agentDidWork
AtMostOneRun == runs <= 1
EventuallyResolved == Dispatched ~> (result # "none")
CompletesWhenAgentCompletes == agentDidWork ~> (result = "completed")
====
