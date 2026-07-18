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
