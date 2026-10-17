---- MODULE LockCurrent ----
\* 현재 lane.ts(P1 1차): 락 파일이 있으면 소유 pid를 읽고, 죽었으면 무조건 덮어쓴다.
EXTENDS FiniteSets, Naturals
CONSTANTS Procs, None, Dead          \* Dead = 이미 죽은 이전 소유자 pid
VARIABLES lock, obs, pc
Alive(x) == x \in Procs
Init == /\ lock = Dead /\ obs = [p \in Procs |-> None] /\ pc = [p \in Procs |-> "try"]
Try(p) == /\ pc[p] = "try"
          /\ IF lock = None THEN lock' = p /\ pc' = [pc EXCEPT ![p] = "hold"] /\ UNCHANGED obs
             ELSE obs' = [obs EXCEPT ![p] = lock] /\ pc' = [pc EXCEPT ![p] = "check"] /\ UNCHANGED lock
Check(p) == /\ pc[p] = "check"
            /\ pc' = [pc EXCEPT ![p] = IF Alive(obs[p]) THEN "fail" ELSE "overwrite"]
            /\ UNCHANGED <<lock, obs>>
Overwrite(p) == /\ pc[p] = "overwrite" /\ lock' = p
                /\ pc' = [pc EXCEPT ![p] = "hold"] /\ UNCHANGED obs
Next == \E p \in Procs : Try(p) \/ Check(p) \/ Overwrite(p)
Mutex == Cardinality({p \in Procs : pc[p] = "hold"}) <= 1
====
