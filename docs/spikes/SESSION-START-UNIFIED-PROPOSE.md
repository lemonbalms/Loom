# Propose (rev-3) — 3-CLI 공통 세션 시작 규범

| Field | Value |
|---|---|
| **Status** | **revised after Addendum C full review** — still **not approved / not locked** |
| **Date** | 2026-07-23 (rev-3) |
| **Prior** | draft 2026-07-23; dual review in [`SESSION-START-UNIFIED-REVIEW.md`](./SESSION-START-UNIFIED-REVIEW.md) (Codex adversarial + Claude architect verify + fable-advisor) |
| **Review verdict** | Addendum C = rev-2 **full independent review**, PENDING-REVISION (H1 · M1–M4 · L1–L4) → rev-3 minimal delta applied; delta re-review required |
| **Audience** | Owner · architect (Claude Code / Codex / Grok) |
| **Depends on** | `SESSION-INJECT-VIEW-DESIGN.md` · inject ops shipped · `HANDOFF-AUTHORING-OPT-PROPOSE.md` |
| **Does not** | product packages · herdr/card · WP5 warm-base · Phase E · lifecycle Stop 센서 · R{n} |

> **리뷰 반영 원칙:** append-only 적층 금지. **불변식 1개에서 유도**해 delivery 코어를 짧게 재작성.
> 조사 장문·옵션 이력은 리뷰 문서에 남기고, 본 문서는 **실행 계약**만 소유한다.

---

## Review provenance and current applicability

| Review layer | Target snapshot | Current meaning |
|---|---|---|
| 최초 Codex 리뷰 F1–F8 | `ed90206c:docs/spikes/SESSION-START-UNIFIED-PROPOSE.md` · initial 897-line draft | 역사적 finding/evidence 원장 · 현재 line 좌표로 읽지 않음 |
| Addendum A | 같은 initial draft + 최초 리뷰 | 독립 검증·F2 처방 교정·A1–A3 발견의 provenance · **현재 verdict 아님** |
| rev-1 | 최초 findings를 반영한 author rewrite | “addressed”는 author claim · 전체 독립 재리뷰/승인 아님 |
| Addendum B D1–D7 | rev-1 §11 | Decision log blocker · rev-2에서 verified closed (§C.1) |
| Addendum C | `38202ff:docs/spikes/SESSION-START-UNIFIED-PROPOSE.md` · rev-2 전문 | **현재 유효 전체 리뷰** · PENDING-REVISION · rev-3 delta 재리뷰 대기 |

**Rules:**

- historical 좌표는 반드시 `commit:path:line`으로 읽는다.
- `addressed` ≠ `verified` ≠ `design-approved` ≠ `implementation-authorized`.
- 승인 전 이 rev-3를 **immutable blob/commit으로 freeze**한다. 현재 working-tree 문구 자체는
  아직 승인 대상 식별자가 아니다.

---

## 0. Binding invariant (단 하나)

> **리추얼(파일 읽기)이 전 호스트 정본이고, inject는 가속기일 뿐이다.**
> 적재 판정은 **창 내 봉투 증거**로만 하며, 증거가 없으면 클래스별 금지 행동이 발동한다.
> - **S 무증거** → 게이트 짐작 금지 (status/HANDOFF Read 후 진행)
> - **N 무증거** → 자율 commit/push 웨이브 금지 (규범 복구 또는 오너 명시 후)
> - **G** → 작업 맵 required 만 온디맨드

이 불변식이 서면: Grok SessionStart hook이 stdout을 무시해도 **아키텍처 붕괴가 아니라 baseline(=ritual)** 으로 흡수된다 (F1 재해석 · fable-advisor).

---

## 1. Problem (압축)

| 구멍 | 설명 |
|------|------|
| 배달 불균일 | Claude만 state inject; Codex hooks 가용하나 설계가 ritual-only로 방치; Grok hook stdout ≠ 모델 컨텍스트 |
| 로드 false positive | receipt/manifest만으로 N=LOADED 가능 (본문 없음) |
| wire 미정의 | raw vs `hookSpecificOutput` JSON 혼동 |
| 트리거 충돌 | “상태”=조회 vs first-turn 즉시 웨이브; pause 류 뭉개짐 |
| 승인 표면 불명 | β에 receipt/map/vendor가 섞임 |

---

## 2. Goal

세 CLI에서 **같은 의미의** N 규범 · S 복구(status 뷰 + 9축 + traps + **lessons 인덱스**) · 트리거 표 · 오너 브리프(Template A/S).

달라도 되는 것: **wire/adapter** 와 **가속기 유무**뿐 (의미 동등성 ≠ wire 동일성).

---

## 3. Principles

| ID | Principle |
|----|-----------|
| **P0** | §0 불변식 — ritual SSOT · inject accelerator |
| **P1** | Norms ≠ Delivery |
| **P2** | view ≠ model (`bun run status` vs 9축 inject/ritual) |
| **P3** | Host detect = label only · 규범 분기 금지 |
| **P4** | Equivalence = **의미** (센티널·축·판정) · wire는 host별 |
| **P5** | Trigger precedence + capability mask (F5) |
| **P6** | harness docs/scripts only |
| **P7** | Session architect **never** hand-codes approved/locked spec — **single 및 full 공통** (F6 · AGENTS) |

---

## 4. Approval packages (F8 — 3분할)

**“β 승인” 금지.** 아래 단위만 개별 승인한다.

| Package ID | Owns | Out of package |
|------------|------|----------------|
| **SESSION-START-DELIVERY** | §0 · host matrix · wire formats · budgets · ritual · Template A/S/R precedence · smoke matrix | receipt schema deep-dive · W-map full |
| **NORMS-RECEIPT** | N 봉투 · LOADED 판정 · Claude `/context` hybrid | delivery adapters |
| **CONTEXT-MAP** | W-codes · Template M · gap check | delivery |

**권고 구현 순서:** DELIVERY design → CONTEXT-MAP M0 design 병행 가능. NORMS-RECEIPT
implementation은 DELIVERY L0 생성 후 시작한다.

| Package | Status |
|---------|--------|
| SESSION-START-DELIVERY | draft rev-3 · pending delta re-review/owner |
| NORMS-RECEIPT | draft rev-3 · pending delta re-review/owner; implementation fixture gated |
| CONTEXT-MAP | draft rev-3 (M0) · pending delta re-review/owner |

---

## 5. SESSION-START-DELIVERY

### 5.1 Layers

| Layer | Artifact | Owns |
|-------|----------|------|
| L0 | `docs/SESSION-START.md` (승인 후 신설 · **짧게**) | ritual · trigger+precedence · templates · host matrix 요약 |
| L1 | `AGENTS.md` | product norms · L0 포인터 · 트리거 표 **복제 최소화** |
| L2 | `CLAUDE.md` · thin Codex note | Claude: **`@AGENTS.md` import 필수** (A3) · ritual pointer |
| L3 | `session-context.ts` · `session-status.ts` · future `session:bootstrap` | **raw builder** + format adapters |
| L4 | host wiring | Claude/Codex hooks · Grok **non-stdout** paths only |

### 5.2 Wire contract (F3) — raw ≠ envelope

**Builder (host-neutral):**

```text
buildStateRaw()   → exactly one complete state envelope:
                    [LOOM-SESSION-CONTEXT v1 · state]
                    … body …
                    [LOOM-SESSION-CONTEXT-END v1 · state]
buildLessonsRaw() → exactly one complete lessons envelope:
                    [LOOM-SESSION-CONTEXT v1 · lessons]
                    … body …
                    [LOOM-SESSION-CONTEXT-END v1 · lessons]
buildHostFooter() → optional plain one-liner (not inside JSON unless envelope says so)
```

기존 `[LOOM-SESSION-CONTEXT v1 · <part>]` 줄이 각 S envelope의 **BEGIN marker**다.
omit/truncation 진단 줄은 호환상 BEGIN 앞에 올 수 있으므로 payload 첫 줄 계약이 아니다.
각 part의 matching END가 모델 창에 없으면 **S ≠ full**이다. self-truncation/omit 표식이 있으면
END가 있어도 `full`이 아니며, 판정은 §9 S 판정 규칙을 따른다.

**Adapters (stdout grammar):**

| Format | Host | Stdout | Notes |
|--------|------|--------|-------|
| `raw` | ritual · debug | plain blocks + optional footer | 수동 리추얼·검증 |
| `claude-json` | Claude SessionStart | **one** `{"hookSpecificOutput":{"hookEventName":"SessionStart","additionalContext":"<one part>"}}` | **part당 훅 1개** (state / lessons 분리 유지) |
| `codex-plain` | Codex SessionStart | **plain text only** → developer context | rev-3 wire SSOT · JSON alternative는 비범위 · **token budget** §5.4 |
| `grok-launch` | Grok | **not** SessionStart stdout (F1). 사전계산 파일/env 또는 no-op exit 0 | S 배달 = ritual / initial rules path only |

**Must not:** raw blocks를 그냥 이어 붙여 Claude/Codex JSON으로 위장 · `codex-plain`에서 JSON을 선택지로 재개방 · Grok SessionStart stdout을 acceptance 근거로 사용.

### 5.3 Host delivery matrix (F1 · F4 · C.M1–M2)

| Host | N (norms) primary | **N=LOADED 도달 경로** | S (state+lessons) primary | S accelerator | Fallback (정본) |
|------|-------------------|------------------------|---------------------------|---------------|-----------------|
| **Claude** | `CLAUDE.md` + **`@AGENTS.md`** + rules → 봉투 없으면 UNVERIFIED | budget 합격 시 별도 SessionStart `claude-json` NORMS hook ×1; 아니면 모델 가시 `bun run norms:raw` ritual | SessionStart hooks `claude-json` ×2 (state, lessons) matcher **`startup\|resume\|clear\|compact`** | same hooks | ritual: `bun run status` + HANDOFF nine + traps + lessons index |
| **Codex** | `AGENTS.md` discovery → 봉투 없으면 UNVERIFIED | budget 합격 시 별도 SessionStart `codex-plain` NORMS hook ×1; channel omission/overflow면 `norms:raw` ritual | **SessionStart hooks primary** (`codex-plain`; plain stdout; hooks default on) | hooks | ritual same; feature disabled / failure → fail-loud partial + ritual |
| **Grok** | project rules auto-load AGENTS/CLAUDE (**full file, no truncate**) → harness 증거라 UNVERIFIED | 세션마다 모델 가시 `bun run norms:raw` ritual; SessionStart stdout은 사용 금지 | **Ritual only** (또는 공식 launcher/initial-rules가 생기면 그때 승격) | SessionStart hook = **env/setup only** · **stdout ignored** (0.2.111) | ritual always baseline |

`norms:raw`/`norms:check`는 승인 후 구현될 NORMS artifact다. `norms:raw`와 NORMS hook payload는
NORMS-RECEIPT가 소유하고, host wiring·wire grammar·budget은
SESSION-START-DELIVERY가 소유한다. 두 package가 모두 implementation-authorized일 때만 N
accelerator를 배선한다. ritual `norms:raw`는 accelerator가 아니라 모델 가시 정본 복구 경로다.

Codex hook 표면은 CLI `0.144.6`과 `0.145.0` 관측에서 확인했다. 버전 영구 보장이 아니므로
업그레이드 시 grammar·large-output 동작을 fixture로 재검증한다.

**Grok must not:** `.grok/hooks` SessionStart → `session-context` stdout을 “S full” 근거로 삼기.
**Grok may:** SessionStart로 캐시 워밍·env; `grok inspect`로 harness instruction 목록 감사 (A2 · harness ≠ model context).

### 5.4 Host budgets (A1 · F3 동절)

| Host | Budget for accelerator payload | Defense |
|------|--------------------------------|---------|
| **Claude** | ~10_000 **chars** silent platform cut | our `HARD_CAP` 9500 chars · 2-hook split · **normal/self-truncate 모두 S BEGIN+END 필수** |
| **Codex** | model-visible hook output ~**2_500 tokens** (official “Large hook output”; overflow → temp file + head/tail) | **do not** assume 9500 chars safe; slim state / two hooks · BEGIN/END 또는 body 완전성 실패 시 ritual |
| **Grok (rules N)** | **no char cap** on project instruction files | diet still for adherence; not for cut safety |
| **Grok (S)** | n/a via hook stdout | ritual Read only |

수치 출처: Codex hooks docs “Large hook output”; Claude platform 10k (existing session-context comments); Grok `12-project-rules.md` full load.
**한국어 9.5k chars > 2.5k tokens는 추정·토크나이저 미실측** — 개정 구현 시 Codex 경로 실측 필수 (A.5).

### 5.5 Ritual (전 호스트 정본)

```bash
bun run status                          # owner view SSOT
# then partial read:
# HANDOFF nine sections · traps 활성+하지 말 것 · lessons index
# optional: bun run session:bootstrap --format raw   (when exists)
```

Equivalence keys (의미): status view · nine headings · traps two · **lessons sentinel/index** · omit loud names.

### 5.6 Detect host (label only)

| Pri | Signal | Host |
|----:|--------|------|
| 1 | Claude env / `CLAUDE_PROJECT_DIR` | claude |
| 2 | `GROK_AGENT=1` | grok |
| 3 | codex parent/env | codex |
| 9 | — | unknown |

### 5.7 Enforcement registry (C.M4)

`code-lock` = 실행 경로가 구조적으로 차단 · `lint-gate` = 결정론 명령 실패가 ship 차단 ·
`prose` = 모델/오너 준수 계약. 아직 구현되지 않은 target lock을 현재 강제력으로 주장하지 않는다.

| Rule surface | Current class | Post-implementation class |
|--------------|---------------|---------------------------|
| §0 N/S 무증거 금지 행동 | `prose` | `prose` (판정 증거만 lint 보조) |
| 기존 S nine/traps/lessons completeness | `lint-gate` — nine/traps 결측·중복 = `handoff:lint`; budget/omission = `session-context:lint`; 합 = `handoff:check` | `lint-gate` (동일 분담) |
| rev-3 S BEGIN/END + omission 판정 | `prose` | `lint-gate` (adapter fixtures) |
| Claude lifecycle matcher | `code-lock` (config wiring) | `code-lock` + smoke |
| §6 trigger precedence/capability masks | `prose` | `prose` + equivalence tests |
| §7 exact N packs/digest/budget | `prose` | `lint-gate` (`norms:check`) |
| §8 architect/impl/reviewer lane 금지 | `prose` | `prose` (board locks는 claim만 보호) |
| §11 subset/freeze/approval eligibility | `prose` | `prose` + immutable git evidence |

§13은 별도 강제층이 아니라 위 규칙의 금지형 요약이며, 각 항목은 원 규칙의 class를 따른다.

---

## 6. Triggers + precedence (F5)

### 6.1 Precedence (높은 것 우선)

1. **Capability stop** — `멈춰` > `계획만` > `커밋 금지` (서로 다른 mask)
2. **Explicit read-only** — `상태` · `핸드오프 확인해`
3. **Explicit continue** — `이어서` · `진행해` · `자율적으로`
4. **Cold start default** — 세션 첫 턴 · 명시 트리거 없음 → Template R (brief **후** wave)
5. **Role triggers** — R{n} · 락 구현

### 6.2 Lexicon + capability masks

| Trigger | Action | read | write/impl | commit/push |
|---------|--------|:----:|:----------:|:-----------:|
| **상태** | Template **S** only | ✓ | ✗ | ✗ |
| **핸드오프 확인해** | Template **A** | ✓ | ✗ | ✗ |
| **이어서** / **진행해** / **자율적으로** | ritual if S incomplete → Template R wave | ✓ | ✓* | ✓* |
| **계획만** | plan/docs only · no product impl ship | ✓ | docs only | ✗ |
| **커밋 금지** | work ok · **no** commit/push | ✓ | ✓ | ✗ |
| **멈춰** | full pause · no wave | ✓ | ✗ | ✗ |
| **R{n}** | reviewer path | ✓ | rev only | n/a |
| **락 스펙 구현** | impl lane claim · **not** session architect hand-code | ✓ | impl lane | ship rules |

\* write/commit only if N/S evidence allows (§0) and not overridden by higher mask.

**First-turn + “상태”:** 오너가 **상태만** 물으면 Template S.
**First-turn 무트리거 / “이어서”:** Template R (status echo → 즉시 Current action).
AGENTS 개정 시: first-turn 목록에서 “상태”를 **wave 트리거에서 분리** (F5 · AGENTS 이중성 해소).

### 6.3 Templates

**Template S** — `bun run status` 그대로 (+ optional Gate title one line). No wave.

**Template A** — status + Gate Now/Done/Must not + `handoff:check` one line. No inject dump.

**Template R** — status + **then** execute Current action (no “진행할까요?”). Requires S recovery first if absent.

---

## 7. NORMS-RECEIPT (F2 · advisor 제3안)

### 7.1 LOADED 정의 (교체)

**금지 (구 알고리즘):** receipt 존재 + disk hash + grammar → LOADED.

**채택:** 규범 **본문**을 begin/end 센티널로 감싼 **봉투**.

```text
[LOOM-NORMS-BEGIN v1 · packs: core@… lexicon@… traps-norm@…]
[LOOM-NORMS-PACK-BEGIN core]
… core의 정확한 source bytes …
[LOOM-NORMS-PACK-END core]
[LOOM-NORMS-PACK-BEGIN lexicon]
… lexicon의 정확한 source bytes …
[LOOM-NORMS-PACK-END lexicon]
[LOOM-NORMS-PACK-BEGIN traps-norm]
… traps-norm의 정확한 source bytes …
[LOOM-NORMS-PACK-END traps-norm]
[LOOM-NORMS-END v1]
```

| 관측 | N status |
|------|----------|
| outer BEGIN/END + 선언된 **모든 pack의 BEGIN/END + non-empty body** 가시 | **LOADED** |
| outer/pack marker 일부 부재 · 빈 pack · 본문 잘림 | **UNVERIFIED** (절단·누락 fail-loud) |
| 봉투 내부/pack 사이에 host의 channel omission·head/tail 표식 가시 | **UNVERIFIED** (모든 marker가 보여도 동일) |
| 완전한 봉투이나 canonical source와 digest 불일치가 확인됨 | **STALE** |
| 봉투 없음 · AGENTS 문구만 (harness) | **UNVERIFIED** |
| 아무 증거 없음 | **ABSENT** |

- `loaded_via` · disk hash = **claimed metadata only** · LOADED 증거 아님.
- harness load (`grok inspect`, Claude `/context` file list) = **UNVERIFIED 보조 증거** · LOADED 아님.
- Claude: `/context`·`InstructionsLoaded`로 파일 목록 확인 권장 · 봉투와 병행.
- **STALE 판정 주체는 모델이 아니라 `norms:raw`/`norms:check` 스크립트**다. 스크립트가
  현재 canonical extraction과 envelope metadata를 비교해 불일치를 확인했을 때만 STALE이다.

### 7.2 원자성

가능하면 **같은 주입 단위**에 BEGIN…본문…END.
절단 시 END 부재 → LOADED 금지.
채널 head/tail(Codex large output)은 END 유무와 무관하게 omission 표식이 있으면 UNVERIFIED.

### 7.3 Pack contract (D5 — design/implementation gate)

LLM 생성 요약은 pack payload가 아니다. 아래 source에서 **결정론적으로 추출한 UTF-8
바이트(LF 정규화)** 만 허용한다.

| Pack | Canonical source | Exact selection | Failure rule |
|------|------------------|-----------------|--------------|
| `core` | `AGENTS.md` | `## Standing rules` 표의 `Autonomy (default)` · `Next-action test` · `Verify` · `Commit/push` · `Impl delegation` 행 + `### Pause only when (true blockers)`의 전체 bullet | row/heading missing or duplicate → non-zero · envelope 미생성 |
| `lexicon` | `docs/SESSION-START.md` | `Triggers + precedence`의 precedence·capability-mask 표 전체 | L0 미생성 → NORMS implementation blocked |
| `traps-norm` | `tasks/traps.md` | `## 하지 말 것` 섹션 전체 | heading missing/empty → non-zero · envelope 미생성 |

**Assembly:** `core → lexicon → traps-norm` 고정 순서 · 위 pack marker 사이에 source bytes를
그대로 둔다. `packs`의 `core@sha8`·`lexicon@sha8`·`traps-norm@sha8`는 **각 pack body별**
SHA-256 앞 8자다. stale 비교용 claimed metadata일 뿐 LOADED 근거가 아니다.

**Diet rule:** budget 초과 시 런타임 요약·부분 절단 금지. canonical source selection을 설계
리뷰로 줄이거나 ritual `norms:raw`를 사용한다. BEGIN/END 또는 pack 하나라도 불완전하면
`LOADED`를 내지 않는다.

**Implementation and enablement gates:**

1. **Implementation entry:** NORMS design approval + implementation authorization + DELIVERY L0
   존재가 필요하다 (`lexicon` source).
2. **First implementation artifact:** extractor fixture가 exact selection·missing/duplicate
   fail-loud를 잠근다. fixture 작성 자체는 authorization 이후 Phase 3 작업이다.
3. **Accelerator enablement:** Claude/Codex/Grok ritual 각 경로에서 assembled
   chars/bytes/tokens를 실측한 뒤에만 host accelerator를 켠다.
4. accelerator visible budget을 넘는 host는 envelope accelerator를 끄고 ritual을 정본으로 쓴다.
5. N accelerator가 enabled인 동안 `bun run norms:check`를 commit gate에 포함한다. canonical
   source 또는 adapter budget fixture가 바뀔 때 pack digest와 host별 chars/bytes/tokens를
   재측정하며, overflow·omission 가능성이 생기면 해당 accelerator를 fail-closed로 끈다.

---

## 8. CONTEXT-MAP (F6 수정 · M0)

### 8.1 Work codes (유지 · 손코딩 수정)

| Code | 작업 | 비고 |
|------|------|------|
| W0 | 콜드 스타트 | S full 목표 |
| W1 | 오너 확인 | Template A/S · G 최소 |
| W2 | **게이트 오케스트레이션** (실행 판단·디스패치·docs 웨이브 조율) | **구현 코딩 아님** |
| W3 | **락 스펙 구현** | **impl lane only** · session architect hand-code **금지 (single·full 공통)** |
| W4–W9 | 리뷰·검증·문서·디스패치·디버그 | 리뷰 표 유지 |

**Lane 표 수정 (F6):**

| Lane | Work | Must not |
|------|------|----------|
| session architect | W0–W2, W7, dispatch | **approved/locked spec 손코딩** (topology 무관) |
| impl (grok/claude/codex-impl) | W3 | R{n} verdict |
| claude-rev / codex-rev | W4 / W5 | product impl |

W3 “손코딩 금지” 주어 = **session architect** (impl은 스펙대로 코딩).

**현재 게이트 예:** Handoff authoring A = **W1** · B 문서/도우미 = **W7**.

### 8.2 Template M (gap)

```markdown
### Context map check
- Work: W<n>
- Inventory: N=… · S=… · G=…   (Template I)
- Missing required: …
- Next load: …
- Must not: …
```

---

## 9. Template I (inventory — 유지)

| Class | Status tokens | Evidence |
|-------|---------------|----------|
| N | LOADED / STALE / UNVERIFIED / ABSENT | complete outer+pack 봉투 · channel omission 없음 · STALE은 script 비교 |
| S | full / partial / absent | state와 lessons 각각 BEGIN+matching END · omit/truncation · ritual 완전성 |
| G | (none) \| paths | 이번 세션 툴 로드만 |

**S 판정:** 두 part의 BEGIN/END와 required body가 모두 가시고 요구 축 누락 표식이 없을 때만
`full`이다. part 하나의 END 부재, channel/self-truncation, required omit은 `partial`; 두 part
증거도 없고 ritual 복구도 안 했으면 `absent`다. 진단 줄이 BEGIN 앞에 있다는 이유만으로
partial로 내리지는 않는다.

---

## 10. Acceptance matrix (F7)

### 10.1 Axes

| Axis | Values |
|------|--------|
| Host | claude · codex · grok |
| Lifecycle | startup · resume · clear · compact |
| Delivery outcome | accel ok · accel fail · hook disabled · untrusted (Grok) · timeout · malformed |
| Class | N · S(state) · S(lessons) · G |

### 10.2 Smoke (문서 합격 조건)

각 host × startup 최소 + resume/compact **문서 계약** 명시:

| # | Check |
|---|--------|
| 1 | S: nine + traps + **lessons index** 의미 복구 (hook **or** ritual) |
| 2 | hook command exit 0 but S BEGIN/END 중 하나라도 context에 없음 → **not** full (detect fail · ritual) |
| 3 | N LOADED only with outer BEGIN/END + 선언된 모든 pack BEGIN/END + non-empty body |
| 4 | Template S never starts wave |
| 5 | architect no locked hand-code on single |
| 6 | Grok: hook stdout success ≠ S full |
| 7 | Codex: over token budget/head-tail omission → partial/fail-loud not silent full |
| 8 | Claude matcher includes resume\|compact |
| 9 | Owner brief = status table not inject dump |
| 10 | N: 모든 marker가 보여도 channel omission 표식이 있으면 UNVERIFIED |
| 11 | enabled N accelerator: canonical source drift/overflow가 `norms:check` commit gate를 실패시킴 |
| 12 | 복합 발화 “상태 확인하고 이어서 해” = Template S 후 wave; “상태만” = Template S only |

Live multi-host smoke = implement-phase (review was static).

Check #12의 명시적 순차 발화는 §6 precedence 충돌이 아니라 두 동작의 순서 지정으로 읽는다.

### 10.3 Re-review questions (must answer without ambiguity)

1. 각 host에서 **어떤 바이트가 어떤 wire로** 모델 컨텍스트에 들어가는가? → §5.2–5.3
2. hook 성공 · context 실패 감지? → S matching END 부재/omission → partial + ritual
3. 규범 본문 적재 증명? → outer+all-pack BEGIN/END + body + no channel omission
4. 각 트리거 capability? → §6.2
5. single에서 architect hand-code? → **No** (P7)
6. lifecycle/failure paths S 판정? → §10.1–10.2

---

## 11. Single Decision log (F8 · D1–D7)

**Constraint:** `implementation-authorized ⊆ design-approved`.

**Approval eligibility:** Addendum C의 rev-2 full review와 rev-3 delta 재리뷰를 합친 현재
verdict가 `APPROVE`여야 `approve` 선택지가 유효하다. 그 전에는 `changes` 또는 `defer`만
기록할 수 있다.

**DELIVERY adapter implementation prerequisites (Phase 1–2 · 선택지 아님):**

1. `docs/SESSION-START.md` L0 생성.
2. AGENTS trigger split(`상태` read-only vs cold/continue wave) 반영.
3. 위 둘은 implementation authorization 이후 Phase 0a에서 수행하며, 완료 전 adapter 구현
   Phase 1–2 시작 금지.

**NORMS implementation entry:** NORMS design-approved pack contract + implementation authorization
및 DELIVERY L0. extractor/budget fixture와 측정은 Phase 3 내부의 enablement gate다.

| # | Decision | Options | Owner pick |
|---|----------|---------|------------|
| 1 | SESSION-START-DELIVERY design | approve rev-3 / changes / defer | **approve rev-3** |
| 2 | NORMS-RECEIPT design | approve rev-3 pack contract / changes / defer | **approve rev-3 pack contract** |
| 3 | CONTEXT-MAP M0 design | approve / defer | **approve** |
| 4 | Implementation authorization | none / **design-approved package IDs only** | **SESSION-START-DELIVERY only** |
| 5 | Pre-applied A3/F7 (`CLAUDE.md` import · matcher expansion) | accept / revise / revert | **accept** |

```text
Target revision: rev-3
Target git blob/commit: cc03474:docs/spikes/SESSION-START-UNIFIED-PROPOSE.md · blob 6966d57c
Independent re-review: SESSION-START-UNIFIED-REVIEW.md Addendum C + Addendum D (APPROVE-DELTA) · 3110e29
Design-approved: SESSION-START-DELIVERY · NORMS-RECEIPT · CONTEXT-MAP
Implementation-authorized: SESSION-START-DELIVERY
Deferred/changes: none
Pre-applied A3/F7: accepted
Owner: lemonbalms
Date: 2026-07-23
```

**Freeze/record rule:** Owner pick이 비어 있는 rev-3를 먼저 commit/blob으로 고정하고, 위 기록은
그 고정 대상을 가리킨다. 이후 허용되는 무대상 변경은 이 표의 `Owner pick`과 approval record
필드 기입뿐이며, 그 기입은 target을 다시 계산하지 않는다. 그 밖의 §§0–14 변경은 새 target을
freeze하고 **design approval과 implementation authorization 모두 재확인**한다.
`Addressed in rev-3` 또는 changelog 행은 승인을 대신하지 않는다.

---

## 12. Phased plan (post-approve)

| Phase | Package | Work |
|-------|---------|------|
| 0 | — | Addendum C full review + rev-3 delta re-review APPROVE → immutable blob/commit 고정 → Owner design picks · pre-applied A3/F7 추인 |
| 0a | DELIVERY | implementation-authorized일 때 L0 extract + AGENTS trigger split · L0 `Triggers + precedence` 절에 §10.2 #12 복합 발화 해석을 포함해 `lexicon` pack이 흡수하게 한다 (**Phase 1 prerequisite**) |
| 1 | DELIVERY | raw builder + fixed format adapters(`codex-plain` 단일 grammar) · Codex SessionStart wiring · Grok ritual docs · tests |
| 2 | DELIVERY | Template A/S/R host response docs · trigger capability-mask/equivalence tests |
| 3 | NORMS | extractor fixture → host별 budget 측정 → `norms:check` gate → 합격 host만 outer+per-pack envelope enable · Template I LOADED rules · optional `/context` note |
| 4 | MAP | HANDOFF `Work:` optional · Template M only |
| 5 | — | 3-host live smoke matrix |

**Already applied (low-risk · review A.6-3 · independent of approve):**

1. `CLAUDE.md` — `@AGENTS.md` import (A3)
2. `.claude/settings.json` SessionStart matcher → `startup|resume|clear|compact` (F7)

---

## 13. Must not

- Grok SessionStart stdout = S delivery
- N=LOADED from receipt-only / disk hash-only / harness list-only
- wire-identical stdout across hosts as goal
- single topology architect hand-code locked spec
- “상태” → wave
- 멈춰/계획만/커밋 금지 동일 mask
- single β blob approval
- product/herdr/card scope

---

## 14. Vendor alignment (rev — 정정 포함)

| Item | rev-3 position |
|------|----------------|
| Claude AGENTS | **@ import required** · gap was real in-repo (A3) |
| Codex hooks | **current primary** for S accel · not future (F4) · CLI 0.144.6/0.145.0 관측, upgrade 재검증 |
| Grok hooks stdout | **ignored** on SessionStart (0.2.111) · not S path (F1) |
| Grok inspect | harness instruction audit exists (A2) · ≠ model LOADED |
| Budgets | per-host · Codex tokens ≠ Claude chars (A1) |
| Custom layers | N/S/G · envelopes · W-map · triggers = Loom · OK as process |

Sources: review doc Evidence · Claude memory/hooks · Codex agents-md/hooks · Grok user-guide 10/12.

---

## 15. Changelog

| Date | Note |
|------|------|
| 2026-07-23 | Initial draft + appendices (§15 N/S/G · receipt · map · vendor). |
| 2026-07-23 | Dual review PENDING-REVISION (F1–F8). |
| 2026-07-23 | Architect verify 8/8 + fable-advisor · F2 third way · A1–A3. |
| 2026-07-23 | **rev-1 rewrite** from §0 invariant · packages split · Grok ritual · wire formats · triggers · BEGIN/END · W2/W3/P7 · acceptance · single Decision log. Supersedes contradictory β/Grok-hook-stdout claims in prior draft body. |
| 2026-07-23 | **rev-2** — review provenance snapshot 고정 · `codex-plain` 단일 grammar · exact NORMS pack registry/markers/gates · §11 design approval와 implementation authorization 분리 · invalid combination 제거 · pre-applied A3/F7 추인 행. |
| 2026-07-23 | **rev-3** — Addendum C full review 반영: S END marker/full 판정 · N host delivery/LOADED path · channel omission fail-loud · per-pack digest/STALE 주체 · `norms:check` budget gate · enforcement registry · composite trigger acceptance · Codex version provenance. |
| 2026-07-23 | **rev-3 delta 재리뷰(Addendum D) APPROVE-DELTA** + Low 3건 정정: registry lint 명령 귀속(`handoff:lint` vs `session-context:lint`) · §5.2↔§9 truncation 판정 문언 정합 · §10.2 #12를 Phase 0a에서 `lexicon` pack에 흡수 예약. |
