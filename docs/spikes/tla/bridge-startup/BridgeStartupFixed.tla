---- MODULE BridgeStartupFixed ----
\* PROPOSED fix, round 3 (Astra 0222; round 2 = Astra 0219) — recommendation only, needs a PLAN gate. Same base as
\* BridgeStartup.tla (non-atomic, cancellable completion incl. the scrape-failure branch; ACK/push ordering;
\* wall-clock timeout; stall; Replay; optional herdr "done") plus:
\*  F1' make-before-break subscribe: openEventConnection keeps the old socket until the new socket's ACK is
\*      handled (today it destroys it first, herdr-client.ts:738-746). Overlap = two sockets, each FIFO, whose
\*      copies of the same status interleave arbitrarily at the bridge. Duplicate working is NOT a no-op: it
\*      cancels a still-running deferral (:3130-3134) and the completion guard then returns (:2918) — unless the
\*      settle scrape fails (:2898 has no requireDeferral, ScrapeErr).
\*      Drain = TRUE: at the new ACK the old socket is half-closed (end()) and read until the server closes it,
\*      so nothing written to it is lost (needs live confirmation that herdr closes a subscription on client
\*      EOF). Drain = FALSE: old socket destroyed at the new ACK with its unread bytes (round-1 F1 as written).
\*  F2' reconcile by agent.get (herdr-client.ts:427) as an ASYNC RPC on its own socket (:302-361):
\*      request -> server snapshot (some later step) -> response in flight -> applied or failed, independently
\*      ordered with event delivery. Snapshots report working/idle only (never "done").
\*      Recon = "none":    no reconcile.
\*      Recon = "once":    round-1 F2 — one agent.get after a lossy reconnect ACK, response applied as-is.
\*      Recon = "restart": (round 3 comparison) "once" plus, after the prompt RPC returned, keep issuing agent.get
\*                         while a completion was cancelled/reset by a working (deferral or pending idle cleared)
\*                         and not yet restarted; responses applied as-is (no discard).
\*      Recon = "pollraw": (round 3 comparison) continuous polling after the prompt RPC returned, responses
\*                         applied as-is (NO qdirty discard).
\*      Recon = "poll":    redesign — continuous polling after the prompt RPC returned; a response is DISCARDED if
\*                         any status event was handled after its request was sent (qdirty), otherwise fed through
\*                         the same gate. herdr exposes no usable monotonic marker for this: pane_agent_status_changed
\*                         carries no seq/revision (0.7.5 schema fixture :2007-2026, :640-669); PaneInfo.revision
\*                         exists but is not on the event, so event-vs-snapshot order cannot be compared.
\*  F3' prompt fence in the subscribe continuation: reset sawWorking / pending completion right before
\*      injectPromptAndSubmit; a completion-class status (idle after working, or done) seen before the prompt RPC
\*      returned is deferred until it returns (normal or stalled return — both continue to verification, :2060).
EXTENDS Naturals, Sequences

CONSTANTS MaxBoot, MaxOthers, MaxDrops, MaxRetries,
          MaxQFail,     \* agent.get failures (each is a lost request/response)
          LatencyBound, Replay, Stall,
          Drain,        \* F1' old-socket drain (TRUE) vs destroy at the new ACK (FALSE)
          Recon,        \* "none" | "once" | "restart" | "pollraw" | "poll"
          ScrapeFail,   \* TRUE = the settle scrape may fail (catch :2894 -> completion without requireDeferral)
          DoneWhen      \* "never" | "prompt" | "work" — when the agent may emit one herdr "done" status

VARIABLES bpc, sawWorking,
          pendingIdle,  \* F3' deferred completion-class status (idle after working, or done)
          deferral, cpc, result,
          cancelled,    \* Recon = "restart": a working cleared a deferral/pending completion, not yet restarted
          vpc, vround, reinjectUsed,
          apc, ast, bootLeft, runs, submitted, plost, agentDidWork, hist, doneSent,
          sk, carries, ackW, est, stream,   \* current (newest) event socket, as in BridgeStartup.tla
          ok,           \* previous socket under F1': "none" | "live" | "drain" (client sent EOF) | "flush" (server done)
          oCarries, oStream,
          lossy,        \* a drop happened since the last ACK
          q,            \* agent.get: "none" | "sent" | "snap" (server took the snapshot, response in flight)
          qv,           \* snapshot value: "W" | "I"
          qwant,        \* Recon \in {"once", "restart"}: a reconcile is owed after a lossy reconnect
          qfails,
          qdirty,       \* a status event was handled while the request was outstanding
          paneIn, others, drops

bridgeV == <<bpc, sawWorking, pendingIdle, deferral, cpc, result, cancelled>>
verifyV == <<vpc, vround, reinjectUsed>>
agentV  == <<apc, ast, bootLeft, runs, submitted, plost, agentDidWork, hist, doneSent>>
curV    == <<sk, carries, ackW, est, stream>>
oldV    == <<ok, oCarries, oStream>>
queryV  == <<lossy, q, qv, qwant, qfails, qdirty>>
envV    == <<paneIn, others, drops>>
vars    == <<bridgeV, verifyV, agentV, curV, oldV, queryV, envV>>

Init == /\ bpc = "spawn" /\ sawWorking = FALSE /\ pendingIdle = FALSE /\ deferral = FALSE /\ cpc = "none"
        /\ result = "none" /\ cancelled = FALSE
        /\ vpc = "off" /\ vround = 0 /\ reinjectUsed = FALSE
        /\ apc = "absent" /\ ast = "idle" /\ bootLeft = MaxBoot /\ runs = 0
        /\ submitted = FALSE /\ plost = FALSE /\ agentDidWork = FALSE /\ hist = <<>> /\ doneSent = FALSE
        /\ sk = "reg" /\ carries = FALSE /\ ackW = TRUE /\ est = TRUE /\ stream = <<>>
        /\ ok = "none" /\ oCarries = FALSE /\ oStream = <<>>
        /\ lossy = FALSE /\ q = "none" /\ qv = "I" /\ qwant = FALSE /\ qfails = 0 /\ qdirty = FALSE
        /\ paneIn = FALSE /\ others = 0 /\ drops = 0

Alive      == bpc \notin {"spawn", "reg"} /\ result = "none"
Dispatched == bpc \in {"inflight", "post"}
InSeq(s, e) == \E i \in 1..Len(s) : s[i] = e

Emit(e) == /\ stream' = IF sk = "reg" /\ carries THEN Append(stream, e) ELSE stream
           /\ oStream' = IF ok \in {"live", "drain"} /\ oCarries THEN Append(oStream, e) ELSE oStream
           /\ hist' = IF Replay THEN Append(hist, e) ELSE hist

\* F1': an established current socket becomes the previous socket (kept alive); a not-yet-ACKed current
\* socket is simply superseded. Only one previous socket is kept (MaxOthers <= 1 in every cfg).
OpenNew(carr) ==
  /\ IF sk = "reg" /\ est
       THEN /\ ok' = "live" /\ oCarries' = carries /\ oStream' = stream
       ELSE UNCHANGED oldV
  /\ sk' = "conn" /\ carries' = carr /\ ackW' = FALSE /\ est' = FALSE /\ stream' = <<>>

---------------------------------------------------------------------------
\* Bridge
Spawn     == /\ bpc = "spawn" /\ bpc' = "reg" /\ apc' = "boot"
             /\ UNCHANGED <<sawWorking, pendingIdle, deferral, cpc, result, cancelled, verifyV,
                            ast, bootLeft, runs, submitted, plost, agentDidWork, hist, doneSent,
                            curV, oldV, queryV, envV>>
Register  == /\ bpc = "reg" /\ bpc' = "sub"
             /\ UNCHANGED <<sawWorking, pendingIdle, deferral, cpc, result, cancelled, verifyV, agentV, curV, oldV,
                            queryV, envV>>
Subscribe == /\ bpc = "sub" /\ bpc' = "ack" /\ paneIn' = TRUE /\ OpenNew(TRUE)
             /\ UNCHANGED <<sawWorking, pendingIdle, deferral, cpc, result, cancelled, verifyV, agentV, queryV,
                            others, drops>>

SrvReg == /\ sk = "conn" /\ sk' = "reg"
          /\ stream' = IF Replay /\ carries THEN hist ELSE stream
          /\ UNCHANGED <<bridgeV, verifyV, agentV, carries, ackW, est, oldV, queryV, envV>>
SrvAck == /\ sk = "reg" /\ ~ackW /\ ackW' = TRUE /\ stream' = Append(stream, "ack")
          /\ UNCHANGED <<bridgeV, verifyV, agentV, sk, carries, est, oldV, queryV, envV>>

\* ACK handled: F1' retires the previous socket; F2' "once"/"restart" owes a reconcile after a lossy reconnect;
\* F3' fence + prompt send in the continuation (every pre-ACK push of this stream was handled before).
ConsumeAck ==
  /\ stream # <<>> /\ Head(stream) = "ack"
  /\ stream' = Tail(stream) /\ est' = TRUE
  /\ IF ok = "live"
       THEN IF Drain
              THEN /\ ok' = "drain" /\ UNCHANGED <<oCarries, oStream>>
              ELSE /\ ok' = "none" /\ oStream' = <<>> /\ UNCHANGED oCarries
       ELSE UNCHANGED oldV
  /\ qwant' = (qwant \/ (lossy /\ Recon \in {"once", "restart"} /\ Alive))
  /\ lossy' = FALSE
  /\ IF bpc = "ack" /\ result = "none"
       THEN /\ bpc' = "inflight" /\ sawWorking' = FALSE /\ pendingIdle' = FALSE
       ELSE UNCHANGED <<bpc, sawWorking, pendingIdle>>
  /\ UNCHANGED <<deferral, cpc, result, cancelled, verifyV, agentV, sk, carries, ackW, q, qv, qfails, qdirty, envV>>

\* Shared status gate for events and applied agent.get snapshots (onCardHerdrEvent + F3').
\* "D" (done) is completion-class without sawWorking (:3165); F3' fences it like idle.
Gate(e) ==
  LET work   == Alive /\ e = "W"
      idleOK == Alive /\ ((e = "I" /\ sawWorking) \/ e = "D")
      start  == idleOK /\ bpc = "post" /\ ~deferral
      pend   == idleOK /\ bpc # "post"
  IN /\ sawWorking' = (sawWorking \/ work)
     /\ pendingIdle' = IF work THEN FALSE ELSE IF pend THEN TRUE ELSE pendingIdle
     /\ deferral' = IF work THEN FALSE ELSE IF start THEN TRUE ELSE deferral
     /\ cpc' = IF start THEN "scrape" ELSE cpc
     /\ cancelled' = IF Recon # "restart" THEN cancelled
                     ELSE IF work /\ (deferral \/ pendingIdle) THEN TRUE
                     ELSE IF start THEN FALSE ELSE cancelled

ConsumeCur == /\ stream # <<>> /\ Head(stream) \in {"W", "I", "D"}
              /\ stream' = Tail(stream) /\ Gate(Head(stream))
              /\ qdirty' = (qdirty \/ q # "none")
              /\ UNCHANGED <<bpc, result, verifyV, agentV, sk, carries, ackW, est, oldV,
                             lossy, q, qv, qwant, qfails, envV>>
ConsumeOld == /\ ok # "none" /\ oStream # <<>>
              /\ oStream' = Tail(oStream) /\ Gate(Head(oStream))
              /\ qdirty' = (qdirty \/ q # "none")
              /\ UNCHANGED <<bpc, result, verifyV, agentV, curV, ok, oCarries,
                             lossy, q, qv, qwant, qfails, envV>>
\* Drain: the server processes the client's EOF and stops writing; the client reads the rest, then 'close'.
OldSrvClose == /\ ok = "drain" /\ ok' = "flush"
               /\ UNCHANGED <<bridgeV, verifyV, agentV, curV, oCarries, oStream, queryV, envV>>
OldClosed   == /\ ok = "flush" /\ oStream = <<>> /\ ok' = "none"
               /\ UNCHANGED <<bridgeV, verifyV, agentV, curV, oCarries, oStream, queryV, envV>>

\* settle scrape succeeds: requireDeferral guard (:2918).
ScrapeDone == /\ cpc = "scrape" /\ cpc' = "none"
              /\ result' = IF deferral /\ Alive THEN "completed" ELSE result
              /\ UNCHANGED <<bpc, sawWorking, pendingIdle, deferral, cancelled, verifyV, agentV, curV, oldV,
                             queryV, envV>>
\* settle scrape fails (catch :2894): guard without requireDeferral (:2898) -> completion-class proposal (:2912).
ScrapeErr  == /\ ScrapeFail /\ cpc = "scrape" /\ cpc' = "none"
              /\ result' = IF Alive THEN "completed" ELSE result
              /\ UNCHANGED <<bpc, sawWorking, pendingIdle, deferral, cancelled, verifyV, agentV, curV, oldV,
                             queryV, envV>>

\* F3': prompt RPC returned (normally or agent_prompt_stalled) -> a deferred completion-class status acts now.
\* (pendingIdle from an idle implies sawWorking: a working clears it and only the fence resets sawWorking, which
\* also clears it — so dropping the round-2 sawWorking conjunct changes nothing when DoneWhen = "never".)
ReturnEffects ==
  LET start == pendingIdle /\ Alive /\ ~deferral
  IN /\ bpc' = "post" /\ vpc' = "wait" /\ pendingIdle' = FALSE
     /\ deferral' = IF start THEN TRUE ELSE deferral
     /\ cpc' = IF start THEN "scrape" ELSE cpc
     /\ cancelled' = IF start THEN FALSE ELSE cancelled
SubmitReturn == /\ bpc = "inflight" /\ submitted /\ ReturnEffects
                /\ UNCHANGED <<sawWorking, result, vround, reinjectUsed, agentV, curV, oldV, queryV, envV>>
SubmitStall == /\ Stall /\ bpc = "inflight" /\ ReturnEffects
               /\ IF submitted THEN UNCHANGED plost ELSE plost' \in BOOLEAN
               /\ UNCHANGED <<sawWorking, result, vround, reinjectUsed,
                              apc, ast, bootLeft, runs, submitted, agentDidWork, hist, doneSent,
                              curV, oldV, queryV, envV>>

\* F2' agent.get: request, server snapshot, response applied (or discarded / failed).
QIssue == /\ q = "none" /\ Alive
          /\ \/ Recon \in {"poll", "pollraw"} /\ bpc = "post"
             \/ Recon \in {"once", "restart"} /\ qwant
             \/ Recon = "restart" /\ cancelled /\ bpc = "post"
          /\ q' = "sent" /\ qwant' = FALSE /\ qdirty' = FALSE
          /\ UNCHANGED <<bridgeV, verifyV, agentV, curV, oldV, lossy, qv, qfails, envV>>
QSnap  == /\ q = "sent" /\ q' = "snap" /\ qv' = IF ast = "working" THEN "W" ELSE "I"
          /\ UNCHANGED <<bridgeV, verifyV, agentV, curV, oldV, lossy, qwant, qfails, qdirty, envV>>
QApply == /\ q = "snap" /\ q' = "none"
          /\ IF Recon = "poll" /\ qdirty
               THEN UNCHANGED <<sawWorking, pendingIdle, deferral, cpc, cancelled>>
               ELSE Gate(qv)
          /\ UNCHANGED <<bpc, result, verifyV, agentV, curV, oldV, lossy, qv, qwant, qfails, qdirty, envV>>
QFail  == /\ qfails < MaxQFail /\ q \in {"sent", "snap"} /\ q' = "none" /\ qfails' = qfails + 1
          /\ UNCHANGED <<bridgeV, verifyV, agentV, curV, oldV, lossy, qv, qwant, qdirty, envV>>

VerifyDone == /\ vpc = "wait" /\ (sawWorking \/ result # "none") /\ vpc' = "done"
              /\ UNCHANGED <<bridgeV, vround, reinjectUsed, agentV, curV, oldV, queryV, envV>>
Plausible == /\ apc # "prompted"
             /\ ~InSeq(stream, "W") /\ ~InSeq(oStream, "W")
             /\ ~(apc = "boot" /\ ~submitted /\ ~plost /\ bpc = "post")
             /\ ~(q = "snap" /\ qv = "W")
VerifyTimeout ==
  /\ vpc = "wait" /\ ~sawWorking /\ result = "none"
  /\ (LatencyBound => Plausible)
  /\ IF vround < MaxRetries
       THEN /\ vround' = vround + 1
            /\ \/ UNCHANGED <<reinjectUsed, apc, submitted, plost>>
               \/ /\ ~reinjectUsed /\ reinjectUsed' = TRUE
                  /\ IF apc = "idle" \/ (apc = "boot" /\ ast = "idle")
                       THEN /\ apc' = "prompted" /\ submitted' = TRUE /\ plost' = FALSE
                       ELSE UNCHANGED <<apc, submitted, plost>>
            /\ UNCHANGED <<result, vpc>>
       ELSE /\ result' = "failed" /\ vpc' = "done"
            /\ UNCHANGED <<vround, reinjectUsed, apc, submitted, plost>>
  /\ UNCHANGED <<bpc, sawWorking, pendingIdle, deferral, cpc, cancelled, ast, bootLeft, runs, agentDidWork, hist,
                 doneSent, curV, oldV, queryV, envV>>

---------------------------------------------------------------------------
\* herdr agent (as in BridgeStartup.tla)
BootWork == /\ apc = "boot" /\ ast = "idle" /\ bootLeft > 0 /\ ast' = "working" /\ Emit("W")
            /\ UNCHANGED <<bridgeV, verifyV, apc, bootLeft, runs, submitted, plost, agentDidWork, doneSent,
                           sk, carries, ackW, est, ok, oCarries, queryV, envV>>
BootIdle == /\ apc = "boot" /\ ast = "working" /\ ast' = "idle" /\ bootLeft' = bootLeft - 1 /\ Emit("I")
            /\ UNCHANGED <<bridgeV, verifyV, apc, runs, submitted, plost, agentDidWork, doneSent,
                           sk, carries, ackW, est, ok, oCarries, queryV, envV>>
PromptArrive == /\ bpc \in {"inflight", "post"} /\ apc = "boot" /\ ast = "idle" /\ ~plost
                /\ apc' = "prompted" /\ submitted' = TRUE
                /\ UNCHANGED <<bridgeV, verifyV, ast, bootLeft, runs, plost, agentDidWork, hist, doneSent,
                               curV, oldV, queryV, envV>>
AgentWork == /\ apc = "prompted" /\ apc' = "working" /\ ast' = "working" /\ runs' = runs + 1 /\ Emit("W")
             /\ UNCHANGED <<bridgeV, verifyV, bootLeft, submitted, plost, agentDidWork, doneSent,
                            sk, carries, ackW, est, ok, oCarries, queryV, envV>>
AgentIdle == /\ apc = "working" /\ apc' = "idle" /\ ast' = "idle" /\ agentDidWork' = TRUE /\ Emit("I")
             /\ UNCHANGED <<bridgeV, verifyV, bootLeft, runs, submitted, plost, doneSent,
                            sk, carries, ackW, est, ok, oCarries, queryV, envV>>
\* herdr "done" (round 3), as in BridgeStartup.tla.
DoneOK == CASE DoneWhen = "prompt" -> submitted
          []   DoneWhen = "work"   -> agentDidWork
          []   OTHER               -> FALSE
AgentDone == /\ DoneOK /\ ~doneSent /\ doneSent' = TRUE /\ Emit("D")
             /\ UNCHANGED <<bridgeV, verifyV, apc, ast, bootLeft, runs, submitted, plost, agentDidWork,
                            sk, carries, ackW, est, ok, oCarries, queryV, envV>>

\* environment
OtherSubscribe == /\ others < MaxOthers /\ others' = others + 1 /\ OpenNew(paneIn)
                  /\ UNCHANGED <<bridgeV, verifyV, agentV, queryV, paneIn, drops>>
\* Unplanned drop of an established socket with no previous socket alive (pre-ACK drops fail visibly with
\* events_subscribe_failed and are left to BridgeStartup.tla).
Drop == /\ drops < MaxDrops /\ sk = "reg" /\ est /\ ok = "none" /\ drops' = drops + 1
        /\ sk' = "gone" /\ stream' = <<>> /\ est' = FALSE /\ ackW' = FALSE /\ lossy' = TRUE
        /\ UNCHANGED <<bridgeV, verifyV, agentV, carries, oldV, q, qv, qwant, qfails, qdirty, paneIn, others>>
Reconnect == /\ sk = "gone" /\ sk' = "conn" /\ carries' = paneIn /\ ackW' = FALSE /\ est' = FALSE
             /\ stream' = <<>>
             /\ UNCHANGED <<bridgeV, verifyV, agentV, oldV, queryV, envV>>

Next == \/ Spawn \/ Register \/ Subscribe \/ SrvReg \/ SrvAck \/ ConsumeAck \/ ConsumeCur \/ ConsumeOld
        \/ OldSrvClose \/ OldClosed \/ ScrapeDone \/ ScrapeErr \/ SubmitReturn \/ SubmitStall
        \/ QIssue \/ QSnap \/ QApply \/ QFail
        \/ VerifyDone \/ VerifyTimeout
        \/ BootWork \/ BootIdle \/ PromptArrive \/ AgentWork \/ AgentIdle \/ AgentDone
        \/ OtherSubscribe \/ Drop \/ Reconnect

\* BootWork, SubmitStall, ScrapeErr, AgentDone, QFail, OtherSubscribe and Drop are unfair (possible, never forced).
Fairness == /\ WF_vars(Spawn) /\ WF_vars(Register) /\ WF_vars(Subscribe)
            /\ WF_vars(SrvReg) /\ WF_vars(SrvAck) /\ WF_vars(ConsumeAck) /\ WF_vars(ConsumeCur)
            /\ WF_vars(ConsumeOld) /\ WF_vars(OldSrvClose) /\ WF_vars(OldClosed)
            /\ WF_vars(ScrapeDone) /\ WF_vars(SubmitReturn)
            /\ WF_vars(QIssue) /\ WF_vars(QSnap) /\ WF_vars(QApply)
            /\ WF_vars(VerifyDone) /\ WF_vars(VerifyTimeout)
            /\ WF_vars(BootIdle) /\ WF_vars(PromptArrive) /\ WF_vars(AgentWork) /\ WF_vars(AgentIdle)
            /\ WF_vars(Reconnect)

Spec == Init /\ [][Next]_vars /\ Fairness

---------------------------------------------------------------------------
TypeOK == /\ bpc \in {"spawn", "reg", "sub", "ack", "inflight", "post"}
          /\ result \in {"none", "completed", "failed"} /\ cpc \in {"none", "scrape"}
          /\ sk \in {"conn", "reg", "gone"} /\ ok \in {"none", "live", "drain", "flush"}
          /\ q \in {"none", "sent", "snap"} /\ Recon \in {"none", "once", "restart", "pollraw", "poll"}
          /\ DoneWhen \in {"never", "prompt", "work"}
          /\ Len(stream) <= 16 /\ Len(oStream) <= 16 /\ runs <= 2
NoEarlyCompletion == result = "completed" => submitted
NoFalseCompletion == result = "completed" => agentDidWork
AtMostOneRun == runs <= 1
EventuallyResolved == Dispatched ~> (result # "none")
CompletesWhenAgentCompletes == agentDidWork ~> (result = "completed")
====
