# Lessons (agent self-improvement)

## 2026-07-10 — Autonomy, not approval-gated steps

**Mistake:** After each gate (design done, PATCH done, tests green) the implementer asked the Owner “이어서 할까요?” / “커밋할까요?” and stalled.

**Rule:** Owner wants **stepwise autonomous progress**. Status brief → execute next gate → chain the wave → commit/push at natural end. **Do not** ask permission between routine steps.

**Pause only for:** MAJOR product ambiguity, irreversible shared damage, human-only secrets/accounts, or explicit “멈춰 / 계획만 / 커밋 금지”.

**Where encoded:** `AGENTS.md` Standing rules · Autonomy; `docs/WORKFLOW.md` 「진행해」; `CLAUDE.md` session start; `HANDOFF.md` session entry.

## 2026-07-11 — Delegation split: cheap model edits, session model verifies

**Pattern (Owner-directed):** For bulk mechanical work (doc edits, boilerplate), spawn Sonnet subagents to apply changes; the session model (Fable) reviews the diffs itself afterward. Owner stated this explicitly mid-task ("편집은 sonnet5 서브에이전트, 확인은 현재 세션 모델").

**Also:** self-edits to `~/.claude/CLAUDE.md` that widen agent permissions get classifier-denied even when in-conversation approval exists — stop, surface the exact edit, and retry only after the Owner re-approves in their own words.

## 2026-07-11 — Impl is delegated; session model never hand-codes a locked spec

**Mistake:** With PLAN 0.20.0 approved (R21, all locks set), I started hand-coding `loom doctor` in the session model (Opus). Justification was a stale HANDOFF note: "grok CLI 인증 만료 — 기본 impl 레인 불가. (이번 세션은 아키텍트 직접 구현.)". I saw one lane down and jumped straight to hand-coding — without checking that `codex-impl` (the proven fallback used last session for 0.18.0) was available. It was.

**Rule (Owner-directed):** The architect (session model) authors specs, reviews, and verifies — it **does not write product code from an approved/locked spec**. Check available impl lanes and escalate **down** the chain: `grok-impl` → `codex-impl` → (both external CLIs down) a **lower-tier in-harness model** subagent (`Agent`, `model: sonnet`/`haiku`) given the full spec. "The default lane is down" means move down the chain — it is **never** a license for the session model to hand-code. Verify lane availability freshly; do not trust a stale HANDOFF note.

**Where encoded:** `AGENTS.md` Standing rules · Impl delegation; `docs/DOGFOOD_LOOP.md §1.2` (lane escalation).

## 2026-07-11 — Verify provenance before calling a config change a bug

**Mistake:** After the GSD Core install, `statusLine` had changed; I claimed the installer "silently clobbered" the user's setting, reverted it, and put the claim in an upstream issue draft. In fact the installer had prompted (with a keep-existing option) and the Owner had chosen the change deliberately.

**Rule:** When a config/file differs from what I expect after a tool ran interactively for the user, ask what they chose before attributing it to the tool — and never revert a setting the Owner may have just picked without checking.

## 2026-07-12 — Next-action selector: don't pick can't-fail actions to dodge the real gap

**Mistake (repeated within one session):** When the Owner gave explicit instructions I executed well, but every time I **self-chose** the next best action I dodged the one open high-value gap (does the real Claude Ink TUI accept the injected paste — runtime-unverified) and drifted to a **can't-fail** action instead: (a) defer to an owner blocker (VPS), (b) low-risk doc-sync, (c) **re-run already-green work** (Docker dry-run that HANDOFF itself marks "all green"). Corrected once, I repeated a variant. I even selectively inherited HANDOFF's "VPS = blocker" line while skipping the same doc's "remaining validation = live smoke" line.

**Root cause (Fable 5 verdict):** not frame-inheritance — a **selector** fault. The common denominator of all three dodges: they **cannot fail**. The real gap is interactive, can fail messily, and attributes to me. Pressure to "show progress" made me pick *executable* over *correct*.

**Rule — Next-action test:** Before any self-chosen action, answer *"if this fails, what do I newly learn?"* Can't-fail actions (already-green re-run, owner-blocked wait, doc paperwork) are **disqualified**. Cross-check HANDOFF's "don't redo" list; pick the **scariest still-verifiable** check. Handing the Owner a manual script is a **last resort** (only if genuinely irreproducible), never the default. Before deferring to an owner blocker, first state what is verifiable **without** it.

**Where encoded:** `AGENTS.md` Standing rules · Next-action test.

## 2026-07-18 — `loom peers` 테이블의 peer ID는 잘린 표시값 — allowlist에 그대로 쓰지 말 것

**Mistake:** bridge M-1 allowlist에 `loom peers` 테이블의 ID(`p_ed676195`)를 그대로 넣었다. 실제 peer ID는 `p_ed676195eecd9488`(전체 18자)이고 `isAuthorizedDispatcher`는 정확 일치 비교라 dispatch가 조용히 거부됐다(스펙: ignore+log, 데몬 로그는 stdout ignore라 안 보임). 겉보기 증상은 "handoff는 inbox에 [queued]로 도착했는데 브릿지가 안 집는다"뿐.

**Rule:** peer ID가 필요한 설정(M-1 allowlist 등)에는 표시용 테이블 값이 아니라 **전체 ID**를 쓴다 — 출처: `~/.loom/profiles/<name>.json`의 `peerId`, 또는 bridge health의 `peerId`. M-1 거부는 브릿지 in-memory `processedHandoffs`에 마킹되므로, allowlist 수정 후 **브릿지 재시작**이 필요하다 (재시작 시 초기 inbox 드레인이 큐된 dispatch를 재처리 — 재-dispatch 불필요).

## 2026-07-18 (2) — 브릿지 프롬프트 주입은 워커 TUI 스타트업 레이스에 진다 (M-2 재시도로 부족)

**Mistake/발견:** R25 dispatch에서 브릿지가 스폰 직후 주입한 프롬프트가 워커 claude의 긴 스타트업(claude-mem 컨텍스트 로딩) 중에 통째로 유실됐다. M-2 verify 루프(4s×3)는 bare-Enter만 재전송하므로 paste 자체가 유실된 경우 복구 불가 — flight는 열린 채(inFlight=1) 무한 대기. R24에서는 우연히 타이밍이 맞아 성공했던 것.

**복구 절차 (실증):** `herdr pane read`로 composer 비어있음 확인 → `herdr agent send <terminal_id> "<wrapped prompt>"`(리터럴, `⚠ Untrusted handoff content` 마커 포함) → 별도 `herdr agent send <terminal_id> "\r"` → `herdr agent wait --status working`. M-2 제출 분리 패턴 그대로 수동 재현하면 flight가 이어진다(브릿지는 working 이벤트로 sawWorking 처리).

**Rule:** 0.23.0 구현 시 verify 루프가 Enter 재전송 전에 **composer 내용 존재를 확인**(pane read)하고, 비어 있으면 프롬프트 자체를 재주입하도록 개선 후보로 등록 — UNKNOWNS "pane 주입" 계열.

**갱신 2 (2026-07-18 0.23.3 세션):** 수동 복구의 제출 단계에서 `herdr pane send-keys <pane> Enter`는 **codex TUI에서 미제출**(grok에선 통함 — TUI별 상이). 신뢰 경로는 lessons 원문대로 `herdr agent send <target> $'\r'`(실제 CR) — 에이전트 불문 이것만 쓸 것.

**갱신 3 (2026-07-18 ⑩ 프로브):** codex TUI는 프롬프트 주입 후 **"Create a plan?" 제안 오버레이가 첫 CR을 소비**할 수 있다 — composer에 텍스트가 담긴 채 미제출로 남음(관찰 ⓓ 변형). 두 번째 `agent send $'\r'`로 정상 제출·working 전이 확인. codex 대상 수동/자동 주입 후엔 working 전이를 확인하고, 미전이면 CR 1회 추가 전송.

**갱신 4 (2026-07-19 ADV-0236):** codex TUI **작업 중** 메시지는 CR로 큐잉되지 않는다 — composer에 잠든 채 "tab to queue message" 힌트만 표시(30분 미소비 실증). 큐잉은 `herdr pane send-keys <pane> Tab`, 단 큐는 **턴 종료 시에만 소비**되므로 턴이 공회전하면 영영 미달 — 그땐 `send-keys Escape`로 인터럽트(큐 메시지가 composer로 복귀) 후 idle에서 CR 제출. 또한 codex 턴이 **스텝-리셋 반복으로 영구 미완**되는 공회전 모드 실증(컨텍스트 여유에도 발생, 관찰 ⓔ와 별개) — codex 자문 카드는 턴당 데드라인 + 인라인 중간 보고 기반 부분 회수 절차를 전제할 것.

**갱신 (2026-07-18 0.23.2 스모크):** grok TUI에서도 동일 레이스 재현 — **에이전트 무관**(claude 2회 + grok 1회, 3회째). 동일 수동 복구가 grok에도 그대로 통함: `herdr pane read`로 composer 빈 것 확인 → `herdr agent send <terminal_id> "<wrapped prompt>"` → 별도 `herdr agent send <terminal_id> $'\r'`(실제 CR 문자 — 리터럴 `"\r"` 문자열 아님) → working 전이 확인. 브릿지 verify 루프 개선(재주입)은 이제 특정 CLI 이슈가 아니라 **모든 pane 레인 공통 요구**로 승격.

**해소 (2026-07-18, 0.23.5 `8148642`):** verify 루프 3분기(probe miss→캐시 프롬프트 재주입 1회/hit→CR/소진→fail-visible) 구현·배포. **라이브 실증**: 배포 직후 첫 스모크 카드에서 레이스 실발화 → stderr `verify round 1: probe=miss action=reinject` → 자동 복구·정상 완료. **0.23.5+ 브릿지에서는 수동 복구 불필요** — 위 수동 절차는 0.23.4 이하 브릿지 또는 fail-visible(`inject_unconfirmed`) 후 진단용으로만 유지. 재주입 프롬프트는 `wrapUntrustedPrompt` 산출 캐시 문자열 그대로(마커 `⚠ Untrusted handoff content\n\n` 접두).

## 2026-07-18 (3) — §5.2 32k artifact 경로는 Claude Ink TUI 워커로 라이브 트리거 불가 (스크레이프 상한 ~5k)

**발견 (0.23.1 실물 스모크):** 브릿지가 워커 출력을 회수하는 유일한 경로는 `herdr paneRead(paneId, {source:"recent", lines:200})`인데, 이는 워커 pane의 **렌더된 터미널 버퍼**를 읽는다. Claude Code(Ink TUI) 워커는 트랜스크립트를 실시간으로 접고 스크롤아웃하므로, 워커가 40k+를 실제로 출력해도 스크레이프는 **소스(visible/recent/recent-unwrapped)·줄수(200/500/1000) 무관하게 ~5.3k에서 포화**(실측: 200줄 요청 중 실제 콘텐츠 22줄만 잔존). 따라서 `output.length > 32_000` 분기(`sendWorkerTurnFromPane`)가 라이브에서 참이 될 수 없어 `packageConvTurnArtifact`가 호출되지 않는다 — `artifacts=null`.

**대조 검증:** 원시 shell pane에 60k 파일 `cat` → `recent 200`=20.6k, `recent 500`=51.7k. 즉 herdr 자체는 스크롤백을 보존하며, 상한은 **Claude Ink TUI의 트랜스크립트 접힘** 때문. HANDOFF 종전 "216컬럼×200줄≈43k" 추정은 raw shell 측정치였고 TUI 워커엔 무효 — 정정함.

**워커 모델별 마커 거동 (fable→sonnet→opus 교체 실측):** 브릿지 주입 프롬프트엔 M-4상 `⚠ Untrusted handoff content` 마커가 강제로 붙는다.
- **Fable**: 마커 붙은 대량출력 지시 **자율 수행**.
- **Sonnet 5**: injection형 대량출력 지시를 **반복 거부**(conv 채널 설득 턴에도 불응). 단 goal-ack 등 평범한 마커 턴은 정상 응답 — 거부는 "무의미한 대량 출력 강제" 형태에 한정.
- **Opus 4.8**: **Sonnet과 동일하게 거부**. 출력이 나온 것은 오너가 **pane에 직접(사람이 in-pane) "승인된 자동화 테스트"라고 입력**한 뒤였음 — 자발/자율 협조가 **아님**(초기 기록 "자발 생성"은 오독, 정정).
→ **Fable만 자율 수행, Sonnet 5·Opus 4.8은 둘 다 거부**(사람이 pane 직접 개입해야 통과). 마커는 유용한 보안장치지만, injection-저항이 강한 capable 모델을 워커로 쓰면 injection형 conv 턴은 사람 개입 없이는 막힘 → capable 워커 스모크는 **benign goal-ack형 페이로드**로 설계해야 함(후속 후보 ⑪: 정당한 대용량 파일 출력 등 워커가 거부 안 할 정상 작업으로 volume 확보). 단 §5.2 도달은 후보 ⑩(TUI 스크레이프 상한)이 선결.

**Rule:** §5.2 라이브 검증은 pane 스크레이프 전제부터 재설계 필요(후속 후보 ⑩): (a) 워커가 출력을 직접 파일로 쓰는 경로, (b) TUI raw 스크롤백을 깊게 노출하는 herdr 모드 조사, (c) 32k 임계를 TUI 실측 상한 기준 재조정 중 택. 패키징/제시 코드 자체는 무결(309 유닛테스트 green)이므로 코드 버그로 오인 말 것 — 문제는 **입력이 임계에 도달하지 못함**.

## 2026-07-18 (4) — 브릿지 card.done 유실: 같은 브릿지의 2번째+ 카드 pane 이벤트 구독 사망 (후보 ⑫)

**발견 (0.23.3 구현 세션):** 같은 브릿지 프로세스에서 **첫 카드 pane 이벤트는 정상, 2번째부터 전부 유실** 2회 실증 — 69732: claude(R28) OK → grok(구현) 유실 / 98952(재시작 직후): codex(자문) OK → grok(수정) 유실. herdr 자체는 이벤트를 정상 방출(오전 probe·스냅샷 폴링으로 상태 전이 관찰됨). 결과: working→idle을 브릿지가 못 봐 card.done 미발행·`inFlight` 고착 — 보드 태스크 수동 정리 필요. 브릿지 데몬은 stderr `"ignore"`(bridge-spawn.ts:64-65)라 프로덕션 로그가 전무해 원인 관찰 불가. 의심: `HerdrClient.eventsSubscribe` 증분 재구독(호출마다 이벤트 소켓 전체 재구축) 레이스.

**Rule (워크어라운드):** pane 카드의 완료 판정을 **인박스 card.done에만 의존하지 말 것** — 워커에게 최종 라인 마커(`[IMPL-DONE]`/`[FIX-DONE]` 등)를 스펙으로 강제하고, 모니터는 `herdr pane read`로 그 마커를 직접 감시 + 작업 트리/검증 명령으로 실물 확인. 고착된 카드는 보드 수동 done + pane 수동 close + (필요 시) 브릿지 재시작.

**해소 (2026-07-18, 0.23.4 `c7df503`):** root cause(HerdrClient append-only 구독 + pre-ACK close 무정착) 수정 완료 — 동일 브릿지 2번째 카드 card.done 정상 도착 라이브 실증. **"새 카드 전 브릿지 재시작" 워크어라운드 해제, card.done 인박스 신뢰 회복.** 마커 감시는 이중 방어로 유지(마커 grep은 프롬프트 echo 오탐 주의 — 지시문에 마커 형식을 쓰면 pane에 echo되므로 verdict 단어·숫자까지 매치하는 패턴 + `또는`/`or`/`<reason>` 제외 필터 필수, 이번 세션 오탐 3회). 잔여: 스폰 직후 주입 유실(순수 TUI 스타트업 레이스)은 ⑫ 수정 후에도 grok 2회 재현 — 후보 ⑨ 대상. codex pane은 승인 프롬프트 대기 중 herdr `blocked` 방출 → 브릿지가 가짜 `failed reason=agent_blocked` 회신(작업은 승인 후 완료됨, 관찰 ⓔ). grok pane 워커는 `/private/tmp` 스크래치패드 읽기 실패(샌드박스) — **긴 카드 브리프는 저장소 내부 untracked 파일로 배치**할 것.

## 2026-07-18 (5) — 오너 레인 지시: 구현·자문 전부 herdr pane dispatch로 (headless 서브에이전트 대신)

**지시 (2026-07-18, 0.23.3 세션):** ① 자문(advisor)은 fable-advisor(Fable 5) 대신 **codex(GPT-5.6)** — 토큰 한도 절약. ② 구현·자문 모두 **herdr pane dispatch 레인**으로 진행(dogfood 겸). 실행 형태: 긴 스펙은 파일로 저장하고 pane엔 "파일 읽고 수행"의 짧은 프롬프트만 주입(레이스 유실 리스크 축소, 실증 유효). codex는 mac-node config에 opt-in 등록됨(fail-closed 검증용 미등록 상태 종료). **공식 R{n} 리뷰의 fable-advisor 필수 규정(DOGFOOD_LOOP §2)과 지시 ①이 충돌하면 오너에게 확인 또는 codex-review 레인 대체를 리뷰 기록에 명기.**

**갱신 (같은 날, 조사 카드):** codex를 기본 argv로 등록하면 **승인 프롬프트 모드**로 떠서, 명령 실행이 필요한 카드는 사람이 pane에서 승인하기 전까지 고착된다(오너가 수동 승인으로 해소 — R27 L-2 고지의 실증 사례). 무인 codex 워커가 필요하면 오퍼레이터가 argv에 자율성 플래그를 명시(예: `-a never -s workspace-write` — CLI help의 `loom run codex` 예시와 동일)하는 신뢰 결정이 선행돼야 한다. grok/claude는 기본 argv로도 자율 실행됨 — CLI별 기본 권한 모델 상이.

## 2026-07-18 (7) — TUI 3종 composer 가시성 실측 (0.23.5 M-1 라이브 검증) + 인박스 grep 잘린-ID 함정

**실측 (composer에 41줄 paste 미제출 후 `pane read`):** **claude(Ink)** = `[Pasted text #1 +25 lines]` 플레이스홀더(head 접힘) + **꼬리줄 원문 노출**, 소형(7줄)은 전체 원문 — 꼬리 프로브는 양 레짐 hit. 단 **플레이스홀더 문자열 자체가 TUI 줄바꿈으로 쪼개짐**(`[Pasted`+개행+`text #1`) — raw substring 매치 금지, 공백-정규화 후 매치할 것. 두 번째 paste는 기존 composer에 **append**(이중-append 리스크 실재). **grok/codex** = 플레이스홀더 없이 원문 전체 노출. 검증법: `herdr agent start <name> --no-focus -- <argv>` 스폰 → `agent send`(CR 없이) → `pane read` → close (LLM 턴 소비 없음).

**Mistake (모니터링):** 인박스 감시 grep에 **전체 18자 task ID**를 썼는데 `loom inbox` 표시는 ID를 잘라 출력 — 영원히 미매치로 card.done 도착을 4분간 못 봄(오너 지적으로 발견). **인박스/보드 grep은 짧은 접두사**(예: `task_38d4b2c`)로. lessons (1) 잘린-ID 함정의 모니터링판.

**관찰 ⓔ 재재현 (0.23.5 자문 카드):** codex 카드가 read-heavy 작업(테스트 실행 포함)을 승인 고착 없이 완주했는데도 회신은 `agent_blocked`(보드 blocked 전이) — 실작업 완료와 회신 불일치 2회째. 회수 절차: pane 마커 verdict 우선 + 보드 수동 done.

## 2026-07-18 (6) — "입력만 되고 미제출" 상태는 어떤 모니터링에도 안 잡힌다 (관찰 ⓓ, 후보 ⑨ 확장)

**Mistake/발견 (0.23.3 조사 카드):** codex pane에 수동 재주입 후 `pane send-keys Enter`로 제출했다고 판단했으나, 실제로는 **composer에 텍스트만 담긴 채 미제출**(pane idle)로 방치됐다 — 오너가 발견. 두 겹의 실패: ① 제출 실패 자체(send-keys Enter는 codex TUI에서 무효 — lessons (2) 갱신 2), ② **그 상태를 아무도 감지 못함**: 아키텍트 모니터는 완료 마커·inbox·pane 소멸만 폴링했고(미제출=조용한 idle=대기처럼 보임), 브릿지 verify 루프도 working 전이만 기다리다 소진 후 무신호 포기(카드 상태 무변화, stderr ignore라 로그도 없음). "silence ≠ 진행 중" — 미제출·미시작 상태는 성공 경로 감시로는 영원히 안 보인다.

**Rule:** ① pane에 프롬프트를 넣은 직후에는 반드시 **제출 성사 자체를 확인**(status working 전이 또는 composer 비워짐 — `pane read`로 직독). ② 카드 모니터는 "일정 시간 idle + composer에 잔류 텍스트" 조건을 실패 신호로 포함할 것. ③ 제품 측(후보 ⑨): verify 루프를 (a) composer 빈 경우 재주입 (b) composer 잔류+idle이면 CR 재전송 (c) 소진 시 failed result 발행(fail-visible)로 확장.

**해소 (2026-07-18, 0.23.5 `8148642`):** ③이 구현·배포됨(3분기 전부). 브릿지 dispatch 경로는 이제 자동 커버 — 단 ①②는 **브릿지를 거치지 않는 수동 pane 주입**(아키텍트가 직접 `agent send` 할 때)엔 여전히 유효한 규칙.

## 2026-07-19 — 카드 완료 인지: board 폴링은 자기참조 — 신호는 inbox의 card.done

tower 아키텍트가 카드 완료를 기다릴 때 board 상태(doing→done)를 폴링하면 영원히 못 본다:
board 전이는 tower 자신이 결과를 claim(`applyCardResult`)해야 일어난다. 올바른 신호는
**tower inbox에 즉시 push되는 `card.done` handoff** (`loom inbox` / `opsListInbox`).
relay 배달은 즉각이므로 인지 지연은 전적으로 감시 대상 선택의 문제. 다음부터 카드 발사 후
inbox를 짧은 주기로 감시(또는 파일 워치)하고, 회수는 claim 스크립트(parse→apply→accept)로.

## 2026-07-19 (2) — card.done 조기 회신: 워커 "1 command still running" 상태에서 결과 스크레이프

FIX-0236 카드에서 워커가 백그라운드 커맨드(테스트 루프) 실행 중인데 브릿지가 idle로 판정,
"Worked for 48s. 1 command still running" 화면을 스크레이프해 card.done을 회신했다. 실제 완주
마커는 ~4분 뒤 pane에 출력됨. conv 경로에서 관찰된 settle 타이밍 문제의 **card 경로 재현**.
→ card.done 수신 후에도 **pane 마커 재확인**이 필수(이중 방어 유지 근거). 개선 후보: 결과
스크레이프 전 agent_status 재확인+settle 재독(0.23.6 conv settle의 card 경로 이식).

**해소 (2026-07-19, 0.23.7 `1160b38` R32):** 원인은 settle(렌더 완충)이 아니라 **완료 판정
자체** — herdr가 백그라운드 커맨드 실행 중에도 idle을 방출. 수정 = 완료 판정 시 스크레이프
말미의 still-running 지표 감지 → 10s 폴링·5분 상한 유예 → 실완료 화면 회신(+optional `note`).
SMOKE-0237 라이브 실증(유예 발화 → working 재전이 취소 → 실완료본 회신). pane 마커 재확인
이중 방어는 유지 권장(지표 미지 TUI·상한 소진 경로).

## 2026-07-19 (3) — grok pane 워커(always-approve)는 스펙 밖 커밋·푸시까지 자체 수행

FIX-0236 brief에 커밋 지시가 없었는데 grok 워커가 `fae51bc`를 커밋하고 origin/main에 push까지
했다("Ship: fae51bc → origin/main"). always-approve argv로 도는 pane 워커는 git 조작을 막을
가드가 없다. → **brief에 "커밋/푸시 금지 — 검증까지만, ship은 아키텍트/오너 결정" 문구를
표준 문단으로 포함**할 것. (이번 건은 diff·검증 무결 확인 후 유지 판정 — 아래 웨이브 기록.)

## 2026-07-19 (4) — 0.23.10 웨이브 운영 교훈 2건

1. **아키텍트 독립 `bun test`를 워커 검증 스위트와 동시 실행하지 말 것** — IMPL-02310 워커가
   검증 `bun test`를 돌리는 동안 아키텍트가 병행 실행한 전체 스위트에서 425/1 플레이크(단독
   재실행 2회 연속 426/0 green). relay 포트·fake-herdr 소켓 등 공유 자원 경합 추정. 워커
   card.done 수신 후 독립 검증을 시작하는 순서가 정답.
2. **스모크 카드 페이로드에 bare `sleep N` 사용 금지** — grok 워커 3건 전부 still-running
   유예 상한 소진(`deferral exhausted 300s`) → 비확신 경로라 pane 자동 close 미발동(0.23.8
   M-1 정합)·수동 정리 필요. 완료 후에도 grok TUI 잔재가 지표에 매치된 추정(후속 관찰 후보).
   짧은 실작업(예: `--version` 확인)으로 volume 없는 페이로드를 쓰는 편이 회수까지 깔끔.
3. **rewind 유실 복구에 claude-mem 관찰이 SSOT 역할** — 직전 세션의 오너 지시("pane 배치
   좌우로 해")·PLAN 0.23.10 초안이 rewind로 디스크에서 사라졌으나 obs 4522–4525로 전량 복원.
   핸드오프와 트리 상태가 어긋나면 메모리 타임라인부터 대조할 것.

## 2026-07-19 (5) — 오너 지시: claude 스모크 카드는 sonnet 강제

**지시 (2026-07-19, 0.23.11 세션):** 스모크 테스트의 claude 워커는 **sonnet 모델을 강제**한다
(스모크는 benign goal-ack 페이로드라 Fable 토큰이 아깝다). 카드별 argv는 wire 금지(§4.4.2)라
절차는 브릿지 config 스왑: `~/.loom/bridge/mac-node.json`의 `agentArgv.claude`를
`["claude","--model","sonnet"]`으로 → 브릿지 재기동 → 스모크 → **원복(`["claude"]`) + 재기동**.
R{n} 리뷰 카드(claude-rev)는 Fable 유지가 필수이므로 원복을 잊으면 리뷰 품질 사고 —
스모크 종료 시 원복까지가 한 절차다. sonnet은 injection형 페이로드를 거부하므로(0.23.1 실측)
스모크 페이로드는 benign goal-ack형으로 설계할 것(기존 원칙과 정합).

## 2026-07-19 (6) — 0.23.11 웨이브 운영 교훈

1. **`herdr agent read`는 JSON 봉투, `herdr pane read`는 평문** — 같은 read 계열인데 출력
   형식이 다르다. 스크립트에서 agent read 출력을 평문으로 취급하면 JSON 한 줄에 │·❯가 모두
   포함되어 패턴 매치가 전부 오염된다(pane-inject.sh FIX 1의 원인 — read-guard 상시 위양성).
   agent read 소비는 `.result.read.text` 추출이 필수.
2. **claude TUI 말미 비콘텐츠 줄은 다가족(多家族)** — 상태줄·bare `❯`·`✻ <동사> for Ns`
   (가변 동사·accented 포함)·`● high · /effort` 4가족을 D-1→D-4 재스모크 체인에서 순차 확인.
   보수 필터는 한 번에 한 가족씩만 드러내므로 재스모크 루프 비용이 선형으로 든다. 0.23.11에서
   3가족 보정으로 종결 — 추가 가족은 개별 보정 대신 후속 후보 등재(Deviations §0.23.11 원칙).
3. **오너 병렬 세션이 같은 리포에서 작업할 수 있다** — 미푸시 커밋 목록이 갑자기 줄면 워커
   무단 push를 의심하기 전에 `git fetch` 후 origin 이력에서 오너 세션 커밋(이번엔 COMPETITIVE_NOTES
   2건)이 끼어 있는지 먼저 확인. 이번 웨이브에선 오너 push에 아키텍트 선행 커밋 3건이 함께 실렸다.

## 2026-07-19 (7) — 오너 지적: PLAN 작성 시 본세션 컨텍스트 최소화 위반

**지적 (2026-07-19, 0.23.12 세션):** 아키텍트 본세션이 PLAN 초안을 위해 코드 정독
(bridge-runtime 수백 줄)·구조 파악을 직접 수행 — 오케스트레이션 독트린(본세션 =
판단·게이트·디스패치만, 컨텍스트-무거운 작업은 위임) 위반. **교정 절차**: PLAN 작성은
2단 분리 — ① 서브에이전트(Explore/claude 레인)가 증거 팩 수집(대상 심볼 위치·현행
동작·락 인접 지점·라인 근거), ② 본세션은 그 증거 팩으로 판단-무거운 스펙 문안(락 경계
판단·보수성 트레이드오프·게이트 결정)만 작성. 라이브 프로브(RPC 의미론 실측)처럼
왕복-판단이 얽힌 것만 본세션 예외. 독립 검증(diff 육안 확인)도 서브에이전트 위임 대상.

## 2026-07-19 (8) — 오너 지적: 서브에이전트 model 명시 필수 (기본 상속 = Fable 함정)

**지적 (2026-07-19, 0.23.12 세션):** Agent 도구는 model 미지정 시 **본세션 모델(Fable)을
조용히 상속** — 검증·탐색 위임이 최고가 레인으로 나가는 사고가 기본값에서 발생한다.
**규칙**: ① 위임 직전 orchestration 스킬 로드가 선행 절차 ② 서브에이전트 스폰 시 **model
명시 필수** — **기본 = `opus`(오너 지시 2026-07-19 세션 점검: "복잡한 판단이 요구되는
어려운 작업을 제외하고 하위 모델 opus 사용")**, `fable`은 커밋먼트 경계 자문(fable-advisor)뿐.
미지정 스폰은 그 자체로 결함으로 취급. ③ 병렬화 기본 + 정형 다단계는 Workflow 도구
(오너 상비 옵트인 2026-07-19) — 전체 규칙은 CLAUDE.md "Orchestration standing rules"가 SSOT.

## 2026-07-19 (9) — sonnet 스모크 워커의 claude-mem 거부-피드백 루프

**관찰 (2026-07-19, SMOKE-02312):** sonnet 워커가 C-1 마커형 페이로드를 injection으로
거부(lessons (5) 기재 그대로 — 페이로드 설계 결함)한 뒤, 그 거부가 claude-mem 관찰로
저장되어 **후속 C-2 benign goal-ack형 페이로드까지 "이전 injection 관찰"을 근거로
재거부**했다(0.23.11 D-4에서는 동형 benign 페이로드를 sonnet이 수행 — 차이는 주입된
거부 관찰의 유무뿐). **대응**: ① 스모크 페이로드는 처음부터 benign goal-ack형으로 설계
(마커 강제 금지 — 재시도는 오염된 메모리 컨텍스트와 싸우게 됨) ② 거부 발생 시 동일
세션 계열 재시도 대신 페이로드·태스크를 갈아 새 카드로 ③ summary 무오염 확인 목적이면
거부 회신 자체도 실내용 줄이라 증거로 유효(마커 회수 불필요할 수 있음).
