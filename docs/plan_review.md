# Plan Review — Loom

> **버전 관리:** 계획 SSOT는 `docs/PLAN.md`이다. 리뷰는 반드시 **대상 Plan version**을 헤더에 적는다.  
> **최신:** PLAN **v0.13.1** `approved (author-close, Low backlog)` — L-4 `requestId`. **No R{n} / no Owner sign-off.**  
> **규칙:** PLAN `Status=approved`는 **Fable 5 R{n} 사인오프 후**가 원칙. Low author-close 시 출처 명시. **언제 R{n} 필수?** → [`WORKFLOW.md` §5.0–5.1](./WORKFLOW.md).  
> **이름:** 제품 = **Loom** (`loom`, `@loom/*`); 검토자 **Fable 5** / fable-advisor = 에이전트, not product.  
> **아카이브:** R1–R11 전문 → [`docs/plan_review_archive.md`](./plan_review_archive.md)  
> **스냅샷:** 닫힌 R{n} 본문의 줄 번호·패키지명은 **검토 당시** 기준. 현재 코드는 follow-up 표 + PLAN을 볼 것.

---

## Active review

| Review | Plan | Status | Gate |
|--------|------|--------|------|
| *(none)* | | | **0.13.1** author-close; Owner may request R14 |

---

## Open (blocking)

| ID | Sev | 요약 | 상태 |
|----|-----|------|------|
| *(none)* | | | |

---

## Deferred / backlog (open only)

| ID | Sev | 요약 | 상태 |
|----|-----|------|------|
| L-5 | Low | pack embed TOCTOU | **done 0.13.0** |
| L-4 residual | Low | wire `requestId` | **done 0.13.1** |
| L-23 | Low | sticky `GET /health` unauth loopback | **accepted** in 0.11.1 (document only) |
| Product | — | Board UI / sticky board ops | **done 0.12.0** (M-18 A) |

---

## Recent follow-ups (last waves)

| Finding | 처리 |
|---------|------|
| **0.13.1 L-4** | wire `requestId` — **author-close** (not R{n}; not Owner approve). Commit `676d4f3` 2026-07-10 |
| **0.13.0 L-5** | `--with-pack-embed` / `withPackEmbed`; re-resolve allowlist at send; caps |
| **0.12.2 send** | desktop Send tab (handoff/chat) + invite display + smoke handoff/chat |
| **0.12.1 polish** | auto-refresh, tab badges, peer names, board groups, PITCH 0.12 |
| **0.12.0 board** | sticky board RPC + desktop Board + `smoke:desktop` |
| **0.11.2 desktop** | shell Status/Peers/Inbox; Rust sticky; `cargo test` |
| **R13 M-18 / M-19 / M-20** | **0.11.1** locks → **0.11.2** code |
| **R13 L-21** | **superseded by M-20** (closed as Med) |
| **R13 L-22** | UNKNOWNS 0.11 filled |
| **R13 L-24** | folded into M-19 token boundary in 0.11.1 |
| **R13 L-25** | acceptance host-absent cases split in 0.11.1 |
| **R13** | **closed** — pending-revision → 0.11.1 approved (body below) |
| **Unknowns §3.5** | WORKFLOW + `docs/UNKNOWNS.md` |
| **0.10.3** docs honesty / Tauri unblocked | done |
| **R12** M-17 + L-17/18/20; L-19 residual | **0.10.1** / closed residual |
| Older | [`plan_review_archive.md`](./plan_review_archive.md) |

---

## Review index

| Review | Plan | Conclusion | Notes |
|--------|------|------------|-------|
| **R13** | v0.11.0 | pending-revision → **0.11.1 approved** | M-18/19/20 closed — body below |
| **R12** | v0.10.0 | pending-revision → **0.10.1 approved** | M-17 closed — body below |
| **R11** | v0.9.0 | → **0.9.1 approved** | [archive](./plan_review_archive.md) |
| **R10** | v0.8.0 | → **0.8.1 approved** | [archive](./plan_review_archive.md) |
| **R9** | v0.7.0 | → **0.7.1 approved** | [archive](./plan_review_archive.md) |
| **R8** | v0.6.0 | → **0.6.1 approved** | [archive](./plan_review_archive.md) |
| **R7** | v0.5.0 | **approved** | [archive](./plan_review_archive.md) |
| R6–R1 | … | … | [archive](./plan_review_archive.md) |

---

## Review R13 — Plan v0.11.0 (M4.3b Tauri desktop shell)

**검토 대상:** `docs/PLAN.md` **v0.11.0** — thin Tauri 2 shell via sticky host loopback RPC  
**검토자:** implementer lane + **Fable 5 second opinion**  
**날짜:** 2026-07-09  
**결론:** **`pending-revision`** → **0.11.1 applied / approved**

> Snapshot: plan-vs-territory review (no `apps/desktop` yet at review time).

### Checklist (summary)

| # | Item | Result |
|---|------|--------|
| A2 | Sticky: status/peers/inbox/claim | **Yes** |
| A3 | Sticky board ops | **No** → M-18 |
| A7 | webview fetch / CORS | **Broken** → M-19 |
| A9 / M-20 | sanitize ≠ HTML escape | **Med** after second opinion |
| P4 | cargo/rustc / tauri CLI | **Yes** (build cross-check) |

### Findings → outcomes

| Sev | ID | Finding | Outcome |
|-----|-----|---------|---------|
| **Med** | **M-18** | Board promised; not on sticky RPC | **0.11.1 C** — Board **out of v1** |
| **Med** | **M-19** | Transport + session + (L-24) token boundary | **0.11.1** Rust invoke-only; session order; token Rust-only |
| **Med** | **M-20** | sanitize ≠ HTML; textContent required | **0.11.1** locked + XSS acceptance |
| Low | L-21 | (original) peer XSS | **→ M-20** |
| Low | L-22 | UNKNOWNS stub | **filled** |
| Low | L-23 | /health unauth | **accepted** document |
| Low | L-24 | token to webview | **→ M-19** |
| Low | L-25 | host-absent cases | **0.11.1** acceptance #4a–c |

### Decision notes (as-reviewed)

Direction sound (sticky reuse, no second join). Blockers were plan blanks, not code bugs. Second opinion correctly raised L-21→M-20.

### R13 follow-up (0.11.1 — applied)

| Finding | 처리 |
|---------|------|
| **M-18** | Option **C** — no Board view/ops in v1 |
| **M-19** | Rust `invoke` → HTTP loopback + Bearer; session `LOOM_SESSION` → profile → default; token never to JS |
| **M-20** | textContent-only; sanitize not HTML; XSS acceptance test |
| **L-25** | meta missing / stale pid / 401 CTAs |
| PLAN | **v0.11.1** `approved` |
| Gate | Implement `apps/desktop` next; CLI VERSION on implement wave |

### R13 second opinion (Fable 5) — retained summary

Independent Read/Grep agreed M-18/M-19; promoted HTML/XSS to **M-20**; L-24/L-25 added (folded/closed in 0.11.1). Toolchain `cargo build` cross-check OK.

---

## Review R12 — Plan v0.10.0 (dual-compat drop)

**결론:** **`pending-revision`** → **0.10.1 approved** (M-17 + L-17/L-18/L-20). **L-19** closed residual.

### R12 follow-up (0.10.1)

| Finding | 처리 |
|---------|------|
| **M-17** | `envRelay*` wiring |
| **L-17/L-18/L-20** | tests + `envTokenInQuery` |
| **L-19** | won't-fix residual legacy |

---

## How to add a new review

1. Bump `docs/PLAN.md` Version / Status = `pending-review`.  
2. Append `## Review R{N}` here; update Active review, Open, index, header.  
3. On approve: PLAN `approved`; findings → Recent follow-ups.  
4. Archive older full bodies if active file grows past ~250 lines historical.  
5. MINOR: WORKFLOW §3.5 / `docs/UNKNOWNS.md` pre-check.
