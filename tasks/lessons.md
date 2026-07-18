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
