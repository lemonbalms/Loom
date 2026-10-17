---- MODULE LockKernel ----
\* 고친 설계(최종): 소유권은 커널 락이 쥔다 — `<runs>/heavy.lock`을 열어 flock(fd, LOCK_EX|LOCK_NB).
\* 획득은 원자적(성공/EWOULDBLOCK), 해제는 close 또는 프로세스 종료 시 커널이 자동 수행.
\* 파일 안의 pid는 진단용 메모일 뿐 권한이 아니다 → 누구도 파일을 지우거나 덮어써서 락을 "회수"하지 않는다.
EXTENDS FiniteSets, Naturals
CONSTANTS Procs, None
VARIABLES holder, alive, pc
vars == <<holder, alive, pc>>
Init == /\ holder = None                       \* 이전 실행이 죽었어도 커널이 이미 풀었다 = stale 상태 없음
        /\ alive = [p \in Procs |-> TRUE]
        /\ pc = [p \in Procs |-> "try"]
Set(p, s) == pc' = [pc EXCEPT ![p] = s]
Try(p) == /\ pc[p] = "try" /\ alive[p]
          /\ IF holder = None THEN holder' = p /\ Set(p, "hold")    \* flock 성공
             ELSE Set(p, "fail") /\ UNCHANGED holder               \* EWOULDBLOCK → exit 1
          /\ UNCHANGED alive
Again(p) == /\ pc[p] \in {"fail", "done"} /\ alive[p] /\ Set(p, "try") /\ UNCHANGED <<holder, alive>>
Release(p) == /\ pc[p] = "hold" /\ alive[p] /\ holder' = None /\ Set(p, "done") /\ UNCHANGED alive
Crash(p) == /\ alive[p] /\ alive' = [alive EXCEPT ![p] = FALSE] /\ Set(p, "dead")
            /\ holder' = IF holder = p THEN None ELSE holder       \* 커널이 프로세스 종료와 함께 해제
Next == \E p \in Procs : Try(p) \/ Again(p) \/ Release(p) \/ Crash(p)
Spec == Init /\ [][Next]_vars /\ \A p \in Procs : WF_vars(Release(p))
Mutex     == Cardinality({p \in Procs : pc[p] = "hold"}) <= 1
LockOwned == \A p \in Procs : pc[p] = "hold" => holder = p
NoStale   == holder # None => alive[holder]                      \* 죽은 소유자가 락을 붙잡는 상태가 없다
\* 진행성: 살아 있는 보유자가 있으면 결국 락은 풀린다(보유자는 반드시 Release/Crash 한다)
EventuallyFree == []<>(holder = None)
====
