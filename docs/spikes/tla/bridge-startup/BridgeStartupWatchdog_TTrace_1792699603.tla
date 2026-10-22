---- MODULE BridgeStartupWatchdog_TTrace_1792699603 ----
EXTENDS Sequences, TLCExt, BridgeStartupWatchdog, Toolbox, Naturals, TLC

_expression ==
    LET BridgeStartupWatchdog_TEExpression == INSTANCE BridgeStartupWatchdog_TEExpression
    IN BridgeStartupWatchdog_TEExpression!expression
----

_trace ==
    LET BridgeStartupWatchdog_TETrace == INSTANCE BridgeStartupWatchdog_TETrace
    IN BridgeStartupWatchdog_TETrace!trace
----

_inv ==
    ~(
        TLCGet("level") = Len(_TETrace)
        /\
        ackW = (FALSE)
        /\
        ast = ("working")
        /\
        paneIn = (TRUE)
        /\
        est = (FALSE)
        /\
        plost = (FALSE)
        /\
        reinjectUsed = (TRUE)
        /\
        doneSent = (FALSE)
        /\
        vround = (1)
        /\
        result = ("none")
        /\
        drops = (0)
        /\
        hist = (<<>>)
        /\
        bpc = ("post")
        /\
        apc = ("working")
        /\
        stream = (<<>>)
        /\
        wdFired = (FALSE)
        /\
        agentDidWork = (TRUE)
        /\
        cpc = ("none")
        /\
        sk = ("conn")
        /\
        wq = ("armed")
        /\
        others = (1)
        /\
        vpc = ("wait")
        /\
        bootLeft = (0)
        /\
        sawWorking = (FALSE)
        /\
        submitted = (TRUE)
        /\
        carries = (TRUE)
        /\
        deferral = (FALSE)
        /\
        runs = (2)
    )
----

_init ==
    /\ est = _TETrace[1].est
    /\ runs = _TETrace[1].runs
    /\ sawWorking = _TETrace[1].sawWorking
    /\ doneSent = _TETrace[1].doneSent
    /\ bpc = _TETrace[1].bpc
    /\ paneIn = _TETrace[1].paneIn
    /\ ackW = _TETrace[1].ackW
    /\ plost = _TETrace[1].plost
    /\ wdFired = _TETrace[1].wdFired
    /\ drops = _TETrace[1].drops
    /\ vpc = _TETrace[1].vpc
    /\ vround = _TETrace[1].vround
    /\ submitted = _TETrace[1].submitted
    /\ others = _TETrace[1].others
    /\ hist = _TETrace[1].hist
    /\ sk = _TETrace[1].sk
    /\ bootLeft = _TETrace[1].bootLeft
    /\ agentDidWork = _TETrace[1].agentDidWork
    /\ carries = _TETrace[1].carries
    /\ apc = _TETrace[1].apc
    /\ cpc = _TETrace[1].cpc
    /\ result = _TETrace[1].result
    /\ reinjectUsed = _TETrace[1].reinjectUsed
    /\ deferral = _TETrace[1].deferral
    /\ stream = _TETrace[1].stream
    /\ wq = _TETrace[1].wq
    /\ ast = _TETrace[1].ast
----

_next ==
    /\ \E i,j \in DOMAIN _TETrace:
        /\ \/ /\ j = i + 1
              /\ i = TLCGet("level")
        /\ est  = _TETrace[i].est
        /\ est' = _TETrace[j].est
        /\ runs  = _TETrace[i].runs
        /\ runs' = _TETrace[j].runs
        /\ sawWorking  = _TETrace[i].sawWorking
        /\ sawWorking' = _TETrace[j].sawWorking
        /\ doneSent  = _TETrace[i].doneSent
        /\ doneSent' = _TETrace[j].doneSent
        /\ bpc  = _TETrace[i].bpc
        /\ bpc' = _TETrace[j].bpc
        /\ paneIn  = _TETrace[i].paneIn
        /\ paneIn' = _TETrace[j].paneIn
        /\ ackW  = _TETrace[i].ackW
        /\ ackW' = _TETrace[j].ackW
        /\ plost  = _TETrace[i].plost
        /\ plost' = _TETrace[j].plost
        /\ wdFired  = _TETrace[i].wdFired
        /\ wdFired' = _TETrace[j].wdFired
        /\ drops  = _TETrace[i].drops
        /\ drops' = _TETrace[j].drops
        /\ vpc  = _TETrace[i].vpc
        /\ vpc' = _TETrace[j].vpc
        /\ vround  = _TETrace[i].vround
        /\ vround' = _TETrace[j].vround
        /\ submitted  = _TETrace[i].submitted
        /\ submitted' = _TETrace[j].submitted
        /\ others  = _TETrace[i].others
        /\ others' = _TETrace[j].others
        /\ hist  = _TETrace[i].hist
        /\ hist' = _TETrace[j].hist
        /\ sk  = _TETrace[i].sk
        /\ sk' = _TETrace[j].sk
        /\ bootLeft  = _TETrace[i].bootLeft
        /\ bootLeft' = _TETrace[j].bootLeft
        /\ agentDidWork  = _TETrace[i].agentDidWork
        /\ agentDidWork' = _TETrace[j].agentDidWork
        /\ carries  = _TETrace[i].carries
        /\ carries' = _TETrace[j].carries
        /\ apc  = _TETrace[i].apc
        /\ apc' = _TETrace[j].apc
        /\ cpc  = _TETrace[i].cpc
        /\ cpc' = _TETrace[j].cpc
        /\ result  = _TETrace[i].result
        /\ result' = _TETrace[j].result
        /\ reinjectUsed  = _TETrace[i].reinjectUsed
        /\ reinjectUsed' = _TETrace[j].reinjectUsed
        /\ deferral  = _TETrace[i].deferral
        /\ deferral' = _TETrace[j].deferral
        /\ stream  = _TETrace[i].stream
        /\ stream' = _TETrace[j].stream
        /\ wq  = _TETrace[i].wq
        /\ wq' = _TETrace[j].wq
        /\ ast  = _TETrace[i].ast
        /\ ast' = _TETrace[j].ast

\* Uncomment the ASSUME below to write the states of the error trace
\* to the given file in Json format. Note that you can pass any tuple
\* to `JsonSerialize`. For example, a sub-sequence of _TETrace.
    \* ASSUME
    \*     LET J == INSTANCE Json
    \*         IN J!JsonSerialize("BridgeStartupWatchdog_TTrace_1792699603.json", _TETrace)

=============================================================================

 Note that you can extract this module `BridgeStartupWatchdog_TEExpression`
  to a dedicated file to reuse `expression` (the module in the 
  dedicated `BridgeStartupWatchdog_TEExpression.tla` file takes precedence 
  over the module `BridgeStartupWatchdog_TEExpression` below).

---- MODULE BridgeStartupWatchdog_TEExpression ----
EXTENDS Sequences, TLCExt, BridgeStartupWatchdog, Toolbox, Naturals, TLC

expression == 
    [
        \* To hide variables of the `BridgeStartupWatchdog` spec from the error trace,
        \* remove the variables below.  The trace will be written in the order
        \* of the fields of this record.
        est |-> est
        ,runs |-> runs
        ,sawWorking |-> sawWorking
        ,doneSent |-> doneSent
        ,bpc |-> bpc
        ,paneIn |-> paneIn
        ,ackW |-> ackW
        ,plost |-> plost
        ,wdFired |-> wdFired
        ,drops |-> drops
        ,vpc |-> vpc
        ,vround |-> vround
        ,submitted |-> submitted
        ,others |-> others
        ,hist |-> hist
        ,sk |-> sk
        ,bootLeft |-> bootLeft
        ,agentDidWork |-> agentDidWork
        ,carries |-> carries
        ,apc |-> apc
        ,cpc |-> cpc
        ,result |-> result
        ,reinjectUsed |-> reinjectUsed
        ,deferral |-> deferral
        ,stream |-> stream
        ,wq |-> wq
        ,ast |-> ast
        
        \* Put additional constant-, state-, and action-level expressions here:
        \* ,_stateNumber |-> _TEPosition
        \* ,_estUnchanged |-> est = est'
        
        \* Format the `est` variable as Json value.
        \* ,_estJson |->
        \*     LET J == INSTANCE Json
        \*     IN J!ToJson(est)
        
        \* Lastly, you may build expressions over arbitrary sets of states by
        \* leveraging the _TETrace operator.  For example, this is how to
        \* count the number of times a spec variable changed up to the current
        \* state in the trace.
        \* ,_estModCount |->
        \*     LET F[s \in DOMAIN _TETrace] ==
        \*         IF s = 1 THEN 0
        \*         ELSE IF _TETrace[s].est # _TETrace[s-1].est
        \*             THEN 1 + F[s-1] ELSE F[s-1]
        \*     IN F[_TEPosition - 1]
    ]

=============================================================================



Parsing and semantic processing can take forever if the trace below is long.
 In this case, it is advised to uncomment the module below to deserialize the
 trace from a generated binary file.

\*
\*---- MODULE BridgeStartupWatchdog_TETrace ----
\*EXTENDS IOUtils, BridgeStartupWatchdog, TLC
\*
\*trace == IODeserialize("BridgeStartupWatchdog_TTrace_1792699603.bin", TRUE)
\*
\*=============================================================================
\*

---- MODULE BridgeStartupWatchdog_TETrace ----
EXTENDS BridgeStartupWatchdog, TLC

trace == 
    <<
    ([ackW |-> TRUE,ast |-> "idle",paneIn |-> FALSE,est |-> TRUE,plost |-> FALSE,reinjectUsed |-> FALSE,doneSent |-> FALSE,vround |-> 0,result |-> "none",drops |-> 0,hist |-> <<>>,bpc |-> "spawn",apc |-> "absent",stream |-> <<>>,wdFired |-> FALSE,agentDidWork |-> FALSE,cpc |-> "none",sk |-> "reg",wq |-> "none",others |-> 0,vpc |-> "off",bootLeft |-> 0,sawWorking |-> FALSE,submitted |-> FALSE,carries |-> FALSE,deferral |-> FALSE,runs |-> 0]),
    ([ackW |-> TRUE,ast |-> "idle",paneIn |-> FALSE,est |-> TRUE,plost |-> FALSE,reinjectUsed |-> FALSE,doneSent |-> FALSE,vround |-> 0,result |-> "none",drops |-> 0,hist |-> <<>>,bpc |-> "reg",apc |-> "boot",stream |-> <<>>,wdFired |-> FALSE,agentDidWork |-> FALSE,cpc |-> "none",sk |-> "reg",wq |-> "none",others |-> 0,vpc |-> "off",bootLeft |-> 0,sawWorking |-> FALSE,submitted |-> FALSE,carries |-> FALSE,deferral |-> FALSE,runs |-> 0]),
    ([ackW |-> TRUE,ast |-> "idle",paneIn |-> FALSE,est |-> TRUE,plost |-> FALSE,reinjectUsed |-> FALSE,doneSent |-> FALSE,vround |-> 0,result |-> "none",drops |-> 0,hist |-> <<>>,bpc |-> "sub",apc |-> "boot",stream |-> <<>>,wdFired |-> FALSE,agentDidWork |-> FALSE,cpc |-> "none",sk |-> "reg",wq |-> "none",others |-> 0,vpc |-> "off",bootLeft |-> 0,sawWorking |-> FALSE,submitted |-> FALSE,carries |-> FALSE,deferral |-> FALSE,runs |-> 0]),
    ([ackW |-> FALSE,ast |-> "idle",paneIn |-> TRUE,est |-> FALSE,plost |-> FALSE,reinjectUsed |-> FALSE,doneSent |-> FALSE,vround |-> 0,result |-> "none",drops |-> 0,hist |-> <<>>,bpc |-> "ack",apc |-> "boot",stream |-> <<>>,wdFired |-> FALSE,agentDidWork |-> FALSE,cpc |-> "none",sk |-> "conn",wq |-> "none",others |-> 0,vpc |-> "off",bootLeft |-> 0,sawWorking |-> FALSE,submitted |-> FALSE,carries |-> TRUE,deferral |-> FALSE,runs |-> 0]),
    ([ackW |-> FALSE,ast |-> "idle",paneIn |-> TRUE,est |-> FALSE,plost |-> FALSE,reinjectUsed |-> FALSE,doneSent |-> FALSE,vround |-> 0,result |-> "none",drops |-> 0,hist |-> <<>>,bpc |-> "ack",apc |-> "boot",stream |-> <<>>,wdFired |-> FALSE,agentDidWork |-> FALSE,cpc |-> "none",sk |-> "reg",wq |-> "none",others |-> 0,vpc |-> "off",bootLeft |-> 0,sawWorking |-> FALSE,submitted |-> FALSE,carries |-> TRUE,deferral |-> FALSE,runs |-> 0]),
    ([ackW |-> TRUE,ast |-> "idle",paneIn |-> TRUE,est |-> FALSE,plost |-> FALSE,reinjectUsed |-> FALSE,doneSent |-> FALSE,vround |-> 0,result |-> "none",drops |-> 0,hist |-> <<>>,bpc |-> "ack",apc |-> "boot",stream |-> <<"ack">>,wdFired |-> FALSE,agentDidWork |-> FALSE,cpc |-> "none",sk |-> "reg",wq |-> "none",others |-> 0,vpc |-> "off",bootLeft |-> 0,sawWorking |-> FALSE,submitted |-> FALSE,carries |-> TRUE,deferral |-> FALSE,runs |-> 0]),
    ([ackW |-> TRUE,ast |-> "idle",paneIn |-> TRUE,est |-> TRUE,plost |-> FALSE,reinjectUsed |-> FALSE,doneSent |-> FALSE,vround |-> 0,result |-> "none",drops |-> 0,hist |-> <<>>,bpc |-> "inflight",apc |-> "boot",stream |-> <<>>,wdFired |-> FALSE,agentDidWork |-> FALSE,cpc |-> "none",sk |-> "reg",wq |-> "armed",others |-> 0,vpc |-> "off",bootLeft |-> 0,sawWorking |-> FALSE,submitted |-> FALSE,carries |-> TRUE,deferral |-> FALSE,runs |-> 0]),
    ([ackW |-> TRUE,ast |-> "idle",paneIn |-> TRUE,est |-> TRUE,plost |-> FALSE,reinjectUsed |-> FALSE,doneSent |-> FALSE,vround |-> 0,result |-> "none",drops |-> 0,hist |-> <<>>,bpc |-> "inflight",apc |-> "prompted",stream |-> <<>>,wdFired |-> FALSE,agentDidWork |-> FALSE,cpc |-> "none",sk |-> "reg",wq |-> "armed",others |-> 0,vpc |-> "off",bootLeft |-> 0,sawWorking |-> FALSE,submitted |-> TRUE,carries |-> TRUE,deferral |-> FALSE,runs |-> 0]),
    ([ackW |-> TRUE,ast |-> "idle",paneIn |-> TRUE,est |-> TRUE,plost |-> FALSE,reinjectUsed |-> FALSE,doneSent |-> FALSE,vround |-> 0,result |-> "none",drops |-> 0,hist |-> <<>>,bpc |-> "post",apc |-> "prompted",stream |-> <<>>,wdFired |-> FALSE,agentDidWork |-> FALSE,cpc |-> "none",sk |-> "reg",wq |-> "armed",others |-> 0,vpc |-> "wait",bootLeft |-> 0,sawWorking |-> FALSE,submitted |-> TRUE,carries |-> TRUE,deferral |-> FALSE,runs |-> 0]),
    ([ackW |-> FALSE,ast |-> "idle",paneIn |-> TRUE,est |-> FALSE,plost |-> FALSE,reinjectUsed |-> FALSE,doneSent |-> FALSE,vround |-> 0,result |-> "none",drops |-> 0,hist |-> <<>>,bpc |-> "post",apc |-> "prompted",stream |-> <<>>,wdFired |-> FALSE,agentDidWork |-> FALSE,cpc |-> "none",sk |-> "conn",wq |-> "armed",others |-> 1,vpc |-> "wait",bootLeft |-> 0,sawWorking |-> FALSE,submitted |-> TRUE,carries |-> TRUE,deferral |-> FALSE,runs |-> 0]),
    ([ackW |-> FALSE,ast |-> "working",paneIn |-> TRUE,est |-> FALSE,plost |-> FALSE,reinjectUsed |-> FALSE,doneSent |-> FALSE,vround |-> 0,result |-> "none",drops |-> 0,hist |-> <<>>,bpc |-> "post",apc |-> "working",stream |-> <<>>,wdFired |-> FALSE,agentDidWork |-> FALSE,cpc |-> "none",sk |-> "conn",wq |-> "armed",others |-> 1,vpc |-> "wait",bootLeft |-> 0,sawWorking |-> FALSE,submitted |-> TRUE,carries |-> TRUE,deferral |-> FALSE,runs |-> 1]),
    ([ackW |-> FALSE,ast |-> "idle",paneIn |-> TRUE,est |-> FALSE,plost |-> FALSE,reinjectUsed |-> FALSE,doneSent |-> FALSE,vround |-> 0,result |-> "none",drops |-> 0,hist |-> <<>>,bpc |-> "post",apc |-> "idle",stream |-> <<>>,wdFired |-> FALSE,agentDidWork |-> TRUE,cpc |-> "none",sk |-> "conn",wq |-> "armed",others |-> 1,vpc |-> "wait",bootLeft |-> 0,sawWorking |-> FALSE,submitted |-> TRUE,carries |-> TRUE,deferral |-> FALSE,runs |-> 1]),
    ([ackW |-> FALSE,ast |-> "idle",paneIn |-> TRUE,est |-> FALSE,plost |-> FALSE,reinjectUsed |-> TRUE,doneSent |-> FALSE,vround |-> 1,result |-> "none",drops |-> 0,hist |-> <<>>,bpc |-> "post",apc |-> "prompted",stream |-> <<>>,wdFired |-> FALSE,agentDidWork |-> TRUE,cpc |-> "none",sk |-> "conn",wq |-> "armed",others |-> 1,vpc |-> "wait",bootLeft |-> 0,sawWorking |-> FALSE,submitted |-> TRUE,carries |-> TRUE,deferral |-> FALSE,runs |-> 1]),
    ([ackW |-> FALSE,ast |-> "working",paneIn |-> TRUE,est |-> FALSE,plost |-> FALSE,reinjectUsed |-> TRUE,doneSent |-> FALSE,vround |-> 1,result |-> "none",drops |-> 0,hist |-> <<>>,bpc |-> "post",apc |-> "working",stream |-> <<>>,wdFired |-> FALSE,agentDidWork |-> TRUE,cpc |-> "none",sk |-> "conn",wq |-> "armed",others |-> 1,vpc |-> "wait",bootLeft |-> 0,sawWorking |-> FALSE,submitted |-> TRUE,carries |-> TRUE,deferral |-> FALSE,runs |-> 2])
    >>
----


=============================================================================

---- CONFIG BridgeStartupWatchdog_TTrace_1792699603 ----
CONSTANTS
    MaxBoot = 0
    MaxOthers = 1
    MaxDrops = 0
    MaxRetries = 2
    LatencyBound = TRUE
    Replay = FALSE
    Stall = FALSE
    CloseFair = FALSE
    ScrapeFail = TRUE
    DoneWhen = "never"
    WdGuard = "sawWorking"
    QFail = FALSE

INVARIANT
    _inv

CHECK_DEADLOCK
    \* CHECK_DEADLOCK off because of PROPERTY or INVARIANT above.
    FALSE

INIT
    _init

NEXT
    _next

CONSTANT
    _TETrace <- _trace

ALIAS
    _expression
=============================================================================
\* Generated on Fri Oct 23 05:06:44 KST 2026