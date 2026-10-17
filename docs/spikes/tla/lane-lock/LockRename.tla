---- MODULE LockRename ----
\* 아키텍트가 낸 H2 수정안: O_EXCL 생성 → 죽은 소유자면 rename으로 치우고 내용 확인 → 다르면 link로 복원 → 같으면 재생성.
\* 보유자는 끝나면 락 파일을 unlink 한다(무조건).
EXTENDS FiniteSets, Naturals
CONSTANTS Procs, None, Dead
VARIABLES lock, obs, ren, pc
vars == <<lock, obs, ren, pc>>
Alive(x) == x \in Procs
Init == /\ lock = Dead /\ obs = [p \in Procs |-> None] /\ ren = [p \in Procs |-> None]
        /\ pc = [p \in Procs |-> "try"]
Set(p, s) == pc' = [pc EXCEPT ![p] = s]
Try(p) == /\ pc[p] = "try"
          /\ IF lock = None THEN lock' = p /\ Set(p, "hold") /\ UNCHANGED <<obs, ren>>
             ELSE obs' = [obs EXCEPT ![p] = lock] /\ Set(p, "check") /\ UNCHANGED <<lock, ren>>
Check(p) == /\ pc[p] = "check" /\ Set(p, IF Alive(obs[p]) THEN "fail" ELSE "rename")
            /\ UNCHANGED <<lock, obs, ren>>
Rename(p) == /\ pc[p] = "rename"
             /\ IF lock = None THEN Set(p, "fail") /\ UNCHANGED <<lock, ren>>      \* ENOENT
                ELSE ren' = [ren EXCEPT ![p] = lock] /\ lock' = None /\ Set(p, "verify")
             /\ UNCHANGED obs
Verify(p) == /\ pc[p] = "verify" /\ Set(p, IF ren[p] # obs[p] THEN "restore" ELSE "retry")
             /\ UNCHANGED <<lock, obs, ren>>
Restore(p) == /\ pc[p] = "restore"
              /\ lock' = IF lock = None THEN ren[p] ELSE lock                     \* link, EEXIST면 포기
              /\ Set(p, "fail") /\ UNCHANGED <<obs, ren>>
Retry(p) == /\ pc[p] = "retry"
            /\ IF lock = None THEN lock' = p /\ Set(p, "hold") ELSE Set(p, "fail") /\ UNCHANGED lock
            /\ UNCHANGED <<obs, ren>>
Release(p) == /\ pc[p] = "hold" /\ lock' = None /\ Set(p, "done") /\ UNCHANGED <<obs, ren>>
Next == \E p \in Procs : Try(p) \/ Check(p) \/ Rename(p) \/ Verify(p) \/ Restore(p) \/ Retry(p) \/ Release(p)
Mutex == Cardinality({p \in Procs : pc[p] = "hold"}) <= 1
====
