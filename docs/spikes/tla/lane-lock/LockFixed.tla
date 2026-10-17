---- MODULE LockFixed ----
\* 고친 설계: 락 파일은 O_EXCL 생성으로만 얻는다. 래퍼는 남의 락을 절대 지우거나 덮어쓰지 않는다(자동 회수 없음).
\* 보유자만 자기 락을 unlink 한다. 보유자가 죽으면 락은 stale로 남고, 래퍼는 fail-fast(exit 1)로 알린다.
\* stale 락은 아키텍트(Breaker, 한 명)가 `--break-stale-lock`으로만 치운다: 내용 읽기 → 소유 pid가 죽었는지 확인 → unlink.
EXTENDS FiniteSets, Naturals
CONSTANTS Procs, Breakers, None, Dead
VARIABLES lock, alive, pc, bobs, bpc
vars == <<lock, alive, pc, bobs, bpc>>
IsDead(x) == x = Dead \/ (x \in Procs /\ ~alive[x])
Init == /\ lock = Dead                         \* 이전 실행이 죽으며 남긴 stale 락에서 시작
        /\ alive = [p \in Procs |-> TRUE]
        /\ pc = [p \in Procs |-> "try"]
        /\ bobs = [b \in Breakers |-> None]
        /\ bpc = [b \in Breakers |-> "read"]
Set(p, s) == pc' = [pc EXCEPT ![p] = s]
Try(p) == /\ pc[p] = "try" /\ alive[p]
          /\ IF lock = None THEN lock' = p /\ Set(p, "hold")      \* openSync(lock, "wx") 성공
             ELSE Set(p, "fail") /\ UNCHANGED lock                \* EEXIST → exit 1 (살았든 죽었든 손대지 않음)
          /\ UNCHANGED <<alive, bobs, bpc>>
Again(p) == /\ pc[p] \in {"fail", "done"} /\ alive[p] /\ Set(p, "try")   \* 아키텍트가 나중에 다시 실행
            /\ UNCHANGED <<lock, alive, bobs, bpc>>
Release(p) == /\ pc[p] = "hold" /\ alive[p] /\ lock' = None /\ Set(p, "done")   \* 자기 락만 unlink
              /\ UNCHANGED <<alive, bobs, bpc>>
Crash(p) == /\ alive[p] /\ alive' = [alive EXCEPT ![p] = FALSE] /\ Set(p, "dead")  \* SIGKILL 등: 락은 그대로 남음
            /\ UNCHANGED <<lock, bobs, bpc>>
BRead(b) == /\ bpc[b] = "read" /\ bobs' = [bobs EXCEPT ![b] = lock] /\ bpc' = [bpc EXCEPT ![b] = "check"]
            /\ UNCHANGED <<lock, alive, pc>>
BCheck(b) == /\ bpc[b] = "check"
             /\ bpc' = [bpc EXCEPT ![b] = IF bobs[b] # None /\ IsDead(bobs[b]) THEN "unlink" ELSE "read"]
             /\ UNCHANGED <<lock, alive, pc, bobs>>
BUnlink(b) == /\ bpc[b] = "unlink" /\ lock' = None /\ bpc' = [bpc EXCEPT ![b] = "read"]
              /\ UNCHANGED <<alive, pc, bobs>>
Next == \/ \E p \in Procs : Try(p) \/ Again(p) \/ Release(p) \/ Crash(p)
        \/ \E b \in Breakers : BRead(b) \/ BCheck(b) \/ BUnlink(b)
Mutex     == Cardinality({p \in Procs : pc[p] = "hold"}) <= 1
LockOwned == \A p \in Procs : pc[p] = "hold" => lock = p      \* 보유 중인 락 파일을 누구도 빼앗지 않는다
====
