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

**갱신 (2026-07-18 0.23.2 스모크):** grok TUI에서도 동일 레이스 재현 — **에이전트 무관**(claude 2회 + grok 1회, 3회째). 동일 수동 복구가 grok에도 그대로 통함: `herdr pane read`로 composer 빈 것 확인 → `herdr agent send <terminal_id> "<wrapped prompt>"` → 별도 `herdr agent send <terminal_id> $'\r'`(실제 CR 문자 — 리터럴 `"\r"` 문자열 아님) → working 전이 확인. 브릿지 verify 루프 개선(재주입)은 이제 특정 CLI 이슈가 아니라 **모든 pane 레인 공통 요구**로 승격.

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

## 2026-07-18 (5) — 오너 레인 지시: 구현·자문 전부 herdr pane dispatch로 (headless 서브에이전트 대신)

**지시 (2026-07-18, 0.23.3 세션):** ① 자문(advisor)은 fable-advisor(Fable 5) 대신 **codex(GPT-5.6)** — 토큰 한도 절약. ② 구현·자문 모두 **herdr pane dispatch 레인**으로 진행(dogfood 겸). 실행 형태: 긴 스펙은 파일로 저장하고 pane엔 "파일 읽고 수행"의 짧은 프롬프트만 주입(레이스 유실 리스크 축소, 실증 유효). codex는 mac-node config에 opt-in 등록됨(fail-closed 검증용 미등록 상태 종료). **공식 R{n} 리뷰의 fable-advisor 필수 규정(DOGFOOD_LOOP §2)과 지시 ①이 충돌하면 오너에게 확인 또는 codex-review 레인 대체를 리뷰 기록에 명기.**

## 2026-07-18 (6) — "입력만 되고 미제출" 상태는 어떤 모니터링에도 안 잡힌다 (관찰 ⓓ, 후보 ⑨ 확장)

**Mistake/발견 (0.23.3 조사 카드):** codex pane에 수동 재주입 후 `pane send-keys Enter`로 제출했다고 판단했으나, 실제로는 **composer에 텍스트만 담긴 채 미제출**(pane idle)로 방치됐다 — 오너가 발견. 두 겹의 실패: ① 제출 실패 자체(send-keys Enter는 codex TUI에서 무효 — lessons (2) 갱신 2), ② **그 상태를 아무도 감지 못함**: 아키텍트 모니터는 완료 마커·inbox·pane 소멸만 폴링했고(미제출=조용한 idle=대기처럼 보임), 브릿지 verify 루프도 working 전이만 기다리다 소진 후 무신호 포기(카드 상태 무변화, stderr ignore라 로그도 없음). "silence ≠ 진행 중" — 미제출·미시작 상태는 성공 경로 감시로는 영원히 안 보인다.

**Rule:** ① pane에 프롬프트를 넣은 직후에는 반드시 **제출 성사 자체를 확인**(status working 전이 또는 composer 비워짐 — `pane read`로 직독). ② 카드 모니터는 "일정 시간 idle + composer에 잔류 텍스트" 조건을 실패 신호로 포함할 것. ③ 제품 측(후보 ⑨): verify 루프를 (a) composer 빈 경우 재주입 (b) composer 잔류+idle이면 CR 재전송 (c) 소진 시 failed result 발행(fail-visible)로 확장.
