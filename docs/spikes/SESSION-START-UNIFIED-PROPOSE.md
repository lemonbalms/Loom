# Propose (draft) — 3-CLI 공통 세션 시작 규범

| Field | Value |
|---|---|
| **Status** | **draft for owner review** — not approved · not locked |
| **Date** | 2026-07-23 |
| **Audience** | Owner · architect (any of Claude Code / Codex / Grok) |
| **Depends on** | `SESSION-INJECT-VIEW-DESIGN.md` (inject = nine+traps · view≠model) · inject ops shipped · `HANDOFF-AUTHORING-OPT-PROPOSE.md` (A 템플릿) |
| **Related** | `AGENTS.md` session ritual · `docs/DOGFOOD_LOOP.md` §0.5 line/lane · `docs/spikes/AGENT-CLI-LIFECYCLE-HOOKS.md` (lifecycle hooks ≠ this doc) |
| **Does not** | product packages · herdr/card · WP5 warm-base re-fork · Phase E · second status dashboard schema · lifecycle Stop 센서 어댑터 |

> **리뷰 목적:** 규범·트리거·배달 분리를 확정하기 위한 **초안**.  
> 오너 사인오프 전 구현·HANDOFF 게이트 전환·커밋 필수 아님.  
> 확정 시 Status → `approved-for-implement` 및 아래 §9 Decision log 기입.

---

## 1. Problem

Loom 세션은 **Claude Code · Codex · Grok** 세 CLI에서 동시에 돈다.  
규범 문서(`AGENTS.md`)는 공통인데, **실제 세션 시작 배달 경로**가 어긋나 있다.

| 호스트 | 규칙 문서 로드 | 자동 컨텍스트 주입 (9축+traps) | 트리거 문장 반응 |
|--------|----------------|--------------------------------|------------------|
| Claude Code | AGENTS + CLAUDE | ✅ SessionStart → `session-context.ts` state/lessons | 훅 유무·습관에 따라 체감 차이 |
| Grok | AGENTS/Claude 계열 + hooks **가능** | ❌ 프로젝트 SessionStart 훅 미배선 (이 리포) | 리추얼·요청 의존 |
| Codex | AGENTS 로드 | ❌ SessionStart inject 없음 | 리추얼 의존 |

결과:

1. **동일 게이트**인데 호스트마다 복구 정보량이 다름 (Claude만 풀 inject).
2. **동일 말** (“핸드오프 확인해”, “이어서”)에 대한 응답 스키마가 흔들림.
3. Host/peer 신원이 status·inject에 안 보여 **역할 혼동** (impl vs arch, profile unset).
4. Handoff 확인 경로가 inject 메트릭·해시 나열로  degener (authoring-opt A와 동일 뿌리).

---

## 2. Goal

**세 CLI 어디서든:**

1. 같은 **규범** (autonomy · pause · lanes · view≠model · nine axes).
2. 같은 **복구 모델** (state: status 표 뷰 + HANDOFF 9축 + traps · lessons 인덱스).
3. 같은 **트리거 → 행동** 표 (lexicon).
4. 같은 **오너 브리프** 스키마 (`bun run status` 표 재작성 금지 + 확인 시 A 템플릿).

**호스트별로 달라도 되는 것:** 배달 수단(훅 vs 리추얼), hook JSON 포맷, Host 라벨 한 줄.

**Non-goal:** 호스트마다 다른 Invariants / 다른 Gate 해석 / status 2스키마.

---

## 3. Design principles (제안 고정 후보)

| ID | Principle | Binding meaning |
|----|-----------|-----------------|
| **P1** | Norms ≠ Delivery | 규칙은 L0/L1 한곳 · CLI는 배달 어댑터만 |
| **P2** | view ≠ model | 오너 = status 표 · 에이전트 = inject/ritual 9축+traps (`SESSION-INJECT-VIEW-DESIGN`) |
| **P3** | Host detect = label + delivery only | detect 결과로 **규범 분기 금지** |
| **P4** | Hook first · Ritual fallback | 훅 실패·무훅 ≡ 동일 bootstrap/ritual 결과 (equivalence) |
| **P5** | Trigger lexicon = single table | 동의어 포함 · 복붙 3중 금지 |
| **P6** | Scope = harness docs/scripts | product/herdr/card 비범위 |

---

## 4. Proposed architecture

```text
┌──────────────────────────────────────────────────────────────┐
│ L0  SESSION-START contract (신설, 짧음)                       │
│     ritual · trigger lexicon · brief templates · host meaning │
│ L1  AGENTS.md — product norms (autonomy, lanes, pause…)       │
│ L3  scripts: session-context · session-status · bootstrap     │
│     (동일 stdout 의미 · 센티널 유지)                            │
└───────────────────────────┬──────────────────────────────────┘
                            │
        ┌───────────────────┼───────────────────┐
        ▼                   ▼                   ▼
  Claude adapter      Grok adapter        Codex adapter
  SessionStart        SessionStart        ritual-first
  .claude/settings    .grok/hooks +       AGENTS turn-0
                      (compat ok)         + optional later hooks
```

### 4.1 Layers (파일 책임)

| Layer | Artifact (초안 이름) | Owns |
|-------|----------------------|------|
| **L0** | `docs/SESSION-START.md` (확정 시 신설) 또는 본 spike를 lock 후 승격 | ritual steps · **trigger lexicon** · A/상태 템플릿 · host detect 의미 · equivalence |
| **L1** | `AGENTS.md` | autonomy · commit · pause · lanes · “L0 실행 의무” 포인터 (트리거 표 복제 최소화) |
| **L2 thin** | `CLAUDE.md` · Codex/Grok 1블록 | “첫 행동 = bootstrap 또는 동등 리추얼” 포인터만 |
| **L3** | `scripts/session-context.ts` · `session-status.ts` · **`session:bootstrap` (신설 제안)** | 실제 바이트 · lint · Host footer |
| **L4 delivery** | `.claude/settings.json` · `.grok/hooks/*.json` · (Codex) AGENTS 문장 | 커맨드 1줄 연결 |

### 4.2 Bootstrap contract (초안)

```bash
bun run session:bootstrap
# 제안 동작:
# 1) detect host (+ LOOM_PROFILE if set, herdr pane if set)
# 2) emit state block  = existing --part state  (센티널 유지)
# 3) emit lessons block = existing --part lessons (캡 때문에 훅에선 분리 유지 가능)
# 4) footer Host line:
#    Host: <claude|grok|codex|unknown> · profile: <LOOM_PROFILE|unset>
#         · herdr: <pane|none> · inject: <hook|ritual-fallback>
```

**Equivalence (합격):**

- Hook inject core keys **⊇** no-hook ritual core keys  
  (nine `handoff:*` + traps 2 + status view) — 기존 SESSION-INJECT 계약 재확인.
- Bootstrap 유무와 관계없이 오너에게 보여주는 표는 **`bun run status` SSOT**.

**예산:** state/lessons **2-hook 분할 유지** 권고 (Claude/Grok 플랫폼 ~10k 침묵 절단).  
`HARD_CAP` 9500 · `STATE_TARGET` 7500 · `omitted:(none)` 커밋 게이트 불변.

### 4.3 Host detect (초안 신호표)

| Priority | Signal (예시) | Host |
|---------:|---------------|------|
| 1 | `CLAUDE_PROJECT_DIR` / Claude Code env family | `claude` |
| 2 | `GROK_AGENT=1` / grok agent runtime | `grok` |
| 3 | Codex TUI/exec env · parent `codex` | `codex` |
| 9 | none | `unknown` |

**Must not:** host 값에 따라 Invariants·Gate·autonomy 문구 변경.  
**May:** footer 라벨 · 훅 페이로드 포맷 · “inject:ritual-fallback” 고지.

### 4.4 Delivery per host (초안)

| Host | Primary | Fallback |
|------|---------|----------|
| **Claude Code** | 기존 SessionStart 2 hooks (`state` + `lessons`) 유지 또는 bootstrap이 동일 파트 호출 | AGENTS ritual |
| **Grok** | 프로젝트 `.grok/hooks/session-start.json` → 동일 스크립트; **folder trust** (`/hooks-trust`) 문서화 | AGENTS ritual · Host `inject:ritual-fallback` |
| **Codex** | Turn-0 의무: `bun run session:bootstrap` (또는 동등 ritual) in AGENTS | 동일; 향후 Codex hooks 생기면 L4만 추가 |

Grok는 Claude settings compat 스캔이 가능하나, **의도 명시·trust 경계를 위해 `.grok/hooks` 명시 배선**을 1차 권고.

---

## 5. Trigger lexicon (초안 SSOT)

> 확정 시 L0로 이동. AGENTS는 요약 링크만.

| 정규 트리거 | 동의어 (비제한) | 필수 행동 | 금지 |
|-------------|-----------------|-----------|------|
| **상태** | `status` · `bun session status` · `세션 상태` · `bun run status` | `bun run status` 출력 **그대로** echo | 표 재작성 · inject 전문 |
| **핸드오프 확인해** | `handoff 확인` · `핸드오프` (확인 문맥) | **Template A** (§6.1) | inject 메트릭·해시 기본 노출 (요청 시에만) |
| **이어서** | `진행해` · `자율적으로` · `단계적으로` · `핸드오프` (진행 문맥) | bootstrap/ritual 완료 후 **Current action 전 웨이브** 자율 | “진행할까요?” 기본 종료 |
| **멈춰** | `계획만` · `커밋 금지` | 즉시 pause · 비가역 중단 | 웨이브 강행 |
| **R{n} / Fable 리뷰** | `[R-REQUEST]` · plan review | `claude-rev` 경로 + fable-advisor (해당 시) | implementer가 R verdict 작성 |
| **락 스펙 구현** | PATCH 구현 · ship impl | claim → grok-impl 기본 레인 | 세션 아키텍트 손코딩 (DOGFOOD §1.2) |

**모호 시:** “확인” 문맥이면 Template A · “진행” 문맥이면 웨이브.  
한 메시지에 둘 다면: **status/A 짧게 → 이어서 웨이브** (오너 블로커 없을 때).

---

## 6. Response templates (초안)

### 6.1 Template A — 핸드오프 확인 (오너용)

```markdown
## Loom · session
| Key | Value |
|-----|--------|
| … | *(bun run status 출력 그대로 — 행 재작성 금지)* |

### Gate
- **Now:** <Current action title only>
- **Done when:** <1–2 lines from HANDOFF>
- **Must not:** <1–3 bullets max>

### Health
`handoff:check` → <ok | fail summary one line>
```

- inject raw/omit 표·커밋 해시 나열 = **기본 숨김**. 오너가 “메트릭/lint 표” 요청 시만.
- Host footer 한 줄은 **선택** (확인 응답 가독성 해치지 않을 때만).

### 6.2 Template S — 상태만

`bun run status` 표 (+ 선택: Gate 제목 한 줄). Template A의 Done/Must not 생략 가능.

### 6.3 Template R — 세션 시작 브리프 (에이전트 → 오너)

AGENTS 기존 스키마 유지:

- status 표 SSOT echo
- 그 다음 **즉시** Current action 실행 (물어보지 않음)
- 센티널 없으면 ritual로 9축+traps 복구 후 동일

---

## 7. Options (리뷰용)

| ID | Option | Effort | Effect | Risk | 초안 권고 |
|----|--------|--------|--------|------|-----------|
| **α** | 문서만 통일 (AGENTS 보강) | S | 약함 (또 스킵) | 낮음 | 부족 |
| **β** | 공통 bootstrap + Claude/Grok 훅 + Codex ritual + L0 lexicon | M | 높음 | 중간 (Grok trust) | **권고** |
| **γ** | β + UserPromptSubmit 트리거 리마인더 (가능 호스트) | M–L | 트리거 일관성↑ | 훅 노이즈 | β 안정 후 |
| **δ** | host별 규범 파일 분기 | — | 파편화 | 높음 | **금지** |
| **ε** | status 대시보드 다행 확장 (Agent/Inject/…) | M | view 비대화 | 중 (authoring D와 동일) | **1차 비권장** · Host **footer 1줄**만 허용 |

**Recommended package:** **β** + Template A/S (HANDOFF-AUTHORING **A**와 병합) · **γ**는 후속 · **ε** 축소(footer only).

---

## 8. Phased plan (확정 시 실행 순서)

| Phase | Deliverable | Exit |
|-------|-------------|------|
| **0** | L0 문안 확정 · AGENTS 포인터 · lexicon 표 고정 | Owner: approved-for-implement |
| **1** | `session:bootstrap` · host detect · tests · lint green | `bun test` 관련 · handoff:check |
| **2** | Grok `.grok/hooks` 배선 · Claude 훅 정리/유지 · Codex turn-0 문장 | 3-host smoke checklist (§10) |
| **3** | Template A 전 호스트 · authoring-opt A Done 정의에 3-host 동일 스키마 포함 | 오너 스팟 체크 |
| **4** | (optional) γ 트리거 가드 | 노이즈 없으면 keep |

**현재 HANDOFF 게이트와의 정렬 (초안):**

| 기존 | 본 초안 |
|------|---------|
| Handoff authoring **A** | §6.1 Template A = 동일 산출 · **3-host 동일**을 Done에 명시 권고 |
| Handoff authoring **B** | 작성 도우미 — 호스트 무관 · 본 문서와 독립 병행 가능 |
| inject ops | 전제 · 재설계 없음 |

권고 실행 순서 (리뷰 후): **A(템플릿+lexicon) → bootstrap β Phase1–2 → B** 또는 **A∥B 후 bootstrap**.  
A만 하고 배달 β를 미루면 Claude 편향이 남음 → **A Done에 3-host 스키마**를 넣는 쪽을 권고.

---

## 9. Decision log (오너 기입)

| Decision | Options | Owner pick | Date |
|----------|---------|------------|------|
| Package | α / **β** / β+γ / other | _TBD_ | |
| L0 location | new `docs/SESSION-START.md` / keep in this spike until ship | _TBD_ | |
| Bootstrap CLI name | `session:bootstrap` / other | _TBD_ | |
| Grok delivery | `.grok/hooks` explicit / rely on Claude compat only | _TBD_ | |
| Codex | ritual-only now / investigate Codex hooks in-scope | _TBD_ | |
| Host on status table | footer only / new status row / none | _TBD_ | |
| Merge with authoring-opt A | same wave / after A / separate gate | _TBD_ | |
| Implement now? | no (review only) / Phase 0 only / Phase 0–2 | _TBD_ | |

**Approval line (확정 시):**

```text
Status: approved-for-implement
Owner: <name>
Date: YYYY-MM-DD
Package: β (+ …)
Next gate owner: HANDOFF Current action update required: yes/no
```

---

## 10. Acceptance / smoke (3-host)

콜드 스타트 각 1회:

| # | Check | Pass |
|---|-------|------|
| 1 | state 센티널 **또는** ritual로 9축+traps 복구 | |
| 2 | 오너 첫 브리프 status 표 스키마 동일 (재작성 없음) | |
| 3 | “핸드오프 확인해” → Template A | |
| 4 | “이어서” → Current action 자율 (불필요 승인 질문 없음) | |
| 5 | Host 라벨 있어도 Invariants 문구 동일 | |
| 6 | `handoff:check` · `omitted:(none)` 의미 동일 | |
| 7 | `LOOM_PROFILE` unset 시 peer 역할 단정 금지 | |
| 8 | Grok untrusted hooks → ritual-fallback 고지 가능 | |

---

## 11. Must not

- permanent slim-delete of nine HANDOFF axes  
- silent mid-section state char-cut  
- second competing status schema (authoring-opt **D** / 본안 **ε** 확정 전)  
- host-based **norm** forks (δ)  
- dump full inject into owner chat  
- product / herdr / card / Phase E scope creep  
- lifecycle Stop/Notification 센서 작업과 범위 혼동 (`AGENT-CLI-LIFECYCLE-HOOKS`는 별 트랙)  
- peer secret / full profile JSON을 status·chat에 노출  

---

## 12. Open questions (리뷰 시 해소)

1. Codex에 공식 SessionStart 주입이 가능해지는 시점을 이 게이트에 넣을지, ritual-only로 닫을지.  
2. Host footer를 `bun run status` Health 확장으로  squish 할지, bootstrap-only로 둘지 (ε 경계).  
3. lessons 인덱스를 무훅 ritual에 **항상** 넣을지, “인덱스 정독 의무” 문서만으로 둘지 (토큰).  
4. 트리거 표 i18n: 한글 정규 + 영문 동의어로 충분한지.  
5. herdr pane에서 뜬 Grok가 “architect 대화” vs `grok-impl` 카드인지 구분 규칙을 footer에 넣을 깊이.

---

## 13. References

- `docs/spikes/SESSION-INJECT-VIEW-DESIGN.md` — inject model · budget · owner≠inject dump  
- `docs/spikes/HANDOFF-AUTHORING-OPT-PROPOSE.md` — Template A / writing helper B  
- `AGENTS.md` — session start ritual · autonomy  
- `docs/DOGFOOD_LOOP.md` — line/lane · profiles · impl delegation  
- `docs/spikes/AGENT-CLI-LIFECYCLE-HOOKS.md` — 종료 센서 (본 문서와 직교)  
- Grok user-guide: hooks · project rules (`AGENTS.md` discovery)  
- Claude: `.claude/settings.json` SessionStart  

---

## 14. Suggested first commands (after approval only)

```bash
bun run status
bun run handoff:check
# implement Phase 0–1 per Decision log — do not start on draft alone
```

---

## 15. Appendix — 규범 컨텍스트 vs 일반 컨텍스트 · 로드 여부 판별 (draft)

> 2026-07-23 추가. 본문 §1–14와 같이 **미승인 초안**.  
> 질문: 공통 규범/규칙 컨텍스트와 일반(작업) 컨텍스트를 구분하고,  
> **지금 세션에 우리 규범이 로드돼 있는지**를 판별하는 방안.

### 15.1 이해한 문제 (재진술)

| 구분 | 의미 | 지금 관측되는 혼동 |
|------|------|-------------------|
| **규범 컨텍스트 (Normative)** | “어떻게 행동해야 하는가” — 호스트 불변의 운영 체제 | AGENTS를 **파일이 있다**고 해서 모델 창에 **들어와 있다**고 착각 |
| **상태 컨텍스트 (State restore)** | “지금 어디 게이트인가” — HANDOFF 9축+traps+status | Claude inject vs Grok ritual 불일치 |
| **일반 컨텍스트 (General / work)** | “이 턴 무엇을 다루는가” — 코드·spike·테스트 출력·대화 | 규범과 섞여 “읽은 것 = 규칙 적용 중”으로 오인 |

원하는 것:

1. **종류 라벨** — 이 덩어리가 N / S / G 중 무엇인지.  
2. **존재 판별** — N이 **현재 컨텍스트 창에 실재**하는지 (디스크 SSOT와 별개).  
3. 없으면 **재로드 트리거**가 명확할 것.

### 15.2 컨텍스트 3분류 (제안)

| Class | 코드 | 내용 예 | 수명 | 채널 |
|-------|------|---------|------|------|
| **Norms** | **N** | AGENTS standing rules · autonomy/pause · trigger lexicon · lane 규칙 · view≠model · must-not 핵심 · traps “하지 말 것” 중 규범성 항목 | 세션 수명 (콜드스타트·클리어 시 재주입) | project rules + optional norms pack |
| **State** | **S** | `[LOOM-SESSION-CONTEXT v1 · state]` · 9축 · status 표 · traps 활성 함정 · lessons 인덱스 | 세션 수명 · HANDOFF 갱신 시 stale 가능 | SessionStart / bootstrap / ritual |
| **General** | **G** | 현재 게이트 spike 본문 · PLAN 절 · 소스·diff · 테스트 로그 · 오너 이번 메시지 · 조사 메모 | 턴·웨이브 단위 | 온디맨드 Read/tool |

**규칙:**

- **N**은 “행동 제약”. 없어도 코드는 짤 수 있으나 **프로세스 결함**.  
- **S**는 “좌표”. 없으면 게이트를 짐작 금지 → bootstrap.  
- **G**는 “재료”. 없어도 N/S만으로 브리프·확인 가능.

`lessons` 전문 카테고리 파일은 **G에 가깝다** (작업 유형 매칭 시 로드).  
인덱스는 **S 또는 N-lite** (세션 시작 의무) — 초안 권고: **S 쪽 lessons part 유지**.

### 15.3 로드됨 = 디스크에 있다 ≠ 창에 있다

| 층 | 질문 | 판정 수단 |
|----|------|-----------|
| **Disk SSOT** | 파일이 저장소에 있나? | `test -f` · git |
| **Harness load** | CLI가 project rules로 붙였나? | 벤더 의존 (Grok AGENTS 스캔 · Claude CLAUDE · Codex AGENTS) — **불투명** |
| **Model context** | 이 대화 컨텍스트에 바이트가 있나? | **우리가 심는 센티널·영수증만** 신뢰 |

→ **규범 로드 여부의 정본은 Model context 영수증**으로 둔다.  
Harness load는 보조(추정)일 뿐, “로드됨” 주장에 쓰지 않는다.

### 15.4 방안 — Norms Receipt (권고)

세션에 **규범 영수증** 한 블록을 넣는다. State 센티널과 **분리**.  
아래 **§15.4.1** 이 영수증 **출력 스키마 정본(초안)** 이다.  
**(스펙 문장만 — `norms:receipt` 스크립트 구현은 이 문서 범위 밖 · 별도 승인 후.)**

#### 15.4.1 Receipt 출력 스키마 (v1 · 문장 계약)

**목적:** Template I 의 `N` 행 Evidence / `LOADED|STALE` 판정의 **기계 판독 가능한 근거**.  
**아님:** 오너 브리프 · status 표 · inject 본문 · AGENTS 전문 재출력.

##### 와이어 형태

- **인코딩:** UTF-8 plain text. JSON 아님 (SessionStart additionalContext·채팅 붙여넣기 친화).
- **첫 줄:** 센티널 단독 라인 — 정확히  
  `[LOOM-NORMS v1]`  
  (대소문자·공백 고정. `v1` 뒤에 접미사 금지.)
- **본문:** `key: value` 한 줄당 하나. 키 순서 **고정** (아래 표 순서). 빈 줄 없음.
- **끝:** 본문 마지막 필드 다음 추가 트레일러 없음. (뒤에 state inject가 오면 빈 줄 1개로 구분 권고.)
- **최대 크기 (권고):** 전체 블록 ≤ **800 chars** (state HARD_CAP과 경쟁하지 않게).

##### 필드 표 (필수/선택)

| # | Key | Required | Value grammar | 의미 |
|---|-----|:--------:|---------------|------|
| 1 | *(sentinel line)* | yes | `[LOOM-NORMS v1]` | 클래스 **N** 블록 식별 |
| 2 | `status` | yes | `present` \| `absent` | `present` = 아래 packs가 “창에 실렸다고 주장”. `absent` = 명시적 미로드 고지(드묾; 보통은 블록 자체 생략) |
| 3 | `host` | yes | `claude` \| `grok` \| `codex` \| `unknown` | 영수증 생성 시점 호스트 라벨 (규범 분기 금지 · 관측만) |
| 4 | `packs` | yes if `status=present` | 공백 구분 `name@hex` 목록, 1..N개 | 내용 지문. `status=absent` 이면 `packs: (none)` |
| 5 | `loaded_via` | yes | `project-rules` \| `bootstrap` \| `ritual` \| `hook` \| `unknown` | 주입 경로 투명성 |
| 6 | `generated_at` | yes | UTC ISO-8601 `YYYY-MM-DDTHH:mm:ssZ` | 생성 시각 |
| 7 | `schema` | no | `1` (정수) | 미래 확장; 생략 시 v1 센티널과 동일 취급 |
| 8 | `note` | no | 단일 라인, ≤120 chars, ASCII 권장 | 사람용 힌트만 (판정에 사용 금지) |

##### `packs` name 레지스트리 (초안)

| name | 지문 대상 (디스크 SSOT) | 비고 |
|------|-------------------------|------|
| `core` | `AGENTS.md` 중 Standing rules 표 + Session start 의무 블록 (구현 시 바이트 범위 고정) | 행동 규범 코어 |
| `lexicon` | L0 trigger lexicon 표 (`docs/SESSION-START.md` 확정 후; 그전엔 본 spike §5) | 트리거→행동 |
| `traps-norm` | `tasks/traps.md` 의 `## 하지 말 것` 섹션만 | 금지 규범 (활성 함정 서사는 S 쪽) |

- **hash:** 해당 바이트의 SHA-256 **앞 8자** hex 소문자 (`[0-9a-f]{8}`).  
- **순서:** `core` → `lexicon` → `traps-norm` → (확장 name은 레지스트리 추가 후만).  
- **미존재 파일:** 그 name 생략하지 말고 `name@missing` 금지 → 해당 pack 제외 + `note`에 사유 (또는 receipt 자체를 실패·미생성). 초안 권고: **core 없으면 receipt 미생성** (UNVERIFIED 경로).

##### 정규 출력 예시

**A. present (정상)**

```text
[LOOM-NORMS v1]
status: present
host: grok
packs: core@a1b2c3d4 lexicon@e5f60718 traps-norm@90ab12cd
loaded_via: ritual
generated_at: 2026-07-23T05:30:00Z
```

**B. absent (명시 — 드묾)**

```text
[LOOM-NORMS v1]
status: absent
host: codex
packs: (none)
loaded_via: unknown
generated_at: 2026-07-23T05:30:00Z
```

**C. 금지 예 (스키마 위반)**

```text
# JSON 래핑 금지
{"sentinel":"LOOM-NORMS"}

# 센티널 변형 금지
[LOOM-NORMS v1 · norms]

# packs에 경로·장문 금지
packs: AGENTS.md entire file follows...
```

##### Template I 매핑

| Receipt 관측 | Template I `N` Status | Evidence 칸에 쓸 말 (예) |
|--------------|----------------------|---------------------------|
| 블록 없음 | `ABSENT` 또는 `UNVERIFIED`* | `영수증 없음` / `AGENTS 문구만·영수증 없음` |
| `status: present` + packs | `LOADED` | `core@a1b2c3d4 lexicon@…` (줄임 가능) |
| present 이나 disk hash 불일치 **확인** | `STALE` | `receipt core@a1… ≠ disk core@b2…` |
| `status: absent` | `ABSENT` | `receipt status=absent` |

\* AGENTS 전문이 시스템 프롬프트에 보이면 `UNVERIFIED`, 전혀 없으면 `ABSENT` (§15.6 판정표).

##### 에이전트 판정 알고리즘 (스키마 기준)

```text
if context has line exactly "[LOOM-NORMS v1]":
  parse key:value until blank or next sentinel
  if status == present and packs matches name@hex grammar:
    N = LOADED
    if (optional) live disk short-hash ≠ packs → N = STALE
  else if status == absent:
    N = ABSENT
  else:
    N = UNVERIFIED   # malformed receipt — do not treat as LOADED
else if AGENTS/standing-rules prose visible without receipt:
  N = UNVERIFIED
else:
  N = ABSENT
```

##### 생성 경로 (구현 시 · 지금 문서만)

| 경로 | 언제 | stdout |
|------|------|--------|
| `bun run norms:receipt` | 수동·리추얼 | 위 plain 블록 only (exit 0). 실패 시 exit ≠0 · **빈 stdout** (가짜 present 금지) |
| `bun run norms:check` | CI/로컬 | packs 표 + disk 일치 여부; receipt 본문 없어도 됨 |
| SessionStart / bootstrap | 세션 시작 | state **앞** 또는 **뒤**에 블록 1개; state HARD_CAP과 **별 예산** 권고 |

**fail-open:** 생성 실패 시 세션을 막지 않음 → Template I 는 `UNVERIFIED`/`ABSENT`.  
**fail-closed for LOADED:** 스키마 위반 블록으로 `LOADED` 주장 금지.

##### Must not (스키마)

- peer secret · 전체 profile JSON · AGENTS 전문을 packs 대신 붙이기  
- state 센티널 `[LOOM-SESSION-CONTEXT …]` 와 한 블록으로 합치기  
- status 표 Health 행을 receipt 대체로 쓰기  
- hash 미계산 placeholder (`core@TODO`) 를 present 로 내기  

### 15.5 State receipt와 관계 (이미 있는 것)

| 센티널 | Class | “로드됨” 의미 |
|--------|-------|----------------|
| `[LOOM-SESSION-CONTEXT v1 · state]` | **S** | 게이트 좌표·traps 활성 복구됨 |
| `[LOOM-SESSION-CONTEXT v1 · lessons]` | **S** (인덱스) | lessons 인덱스 복구됨 |
| `[LOOM-NORMS v1]` **(신설 제안)** | **N** | 행동 규범 팩이 창에 있음 |
| (없음 · 툴 결과만) | **G** | 일반 작업 재료 |

`inject omitted:` → **S의 부분 부재** (특정 축). N과 독립.  
S 있어도 N 없을 수 있음 (Grok가 HANDOFF만 읽고 AGENTS 요약을 창에 안 넣은 경우).  
N 있어도 S 없을 수 있음 (rules만 로드되고 SessionStart 실패).

### 15.6 오너/에이전트 질문 → 고정 응답 문안 (문안만 · 구현 아님)

에이전트가 **그대로 채우는** 응답 템플릿.  
스크립트·훅·커밋 대상이 아님. 판정 규칙만 문서 계약.

#### 트리거 (동의어)

| 정규 | 동의어 예 |
|------|-----------|
| 컨텍스트 인벤토리 | 컨텍스트 뭐 있어 · 메모리에 뭐 올라갔어 · context inventory · N/S/G · 규범 로드됐어? · 상태 복구됐어? |

한 질문이면 **Template I 전체**를 쓴다 (부분 질문도 표 3행을 채운 뒤 해당 행만 강조하지 말고 표로 통일).

#### 상태 어휘 (고정 · 영어 토큰 유지)

| Class | 허용 값 | 의미 (한 줄) |
|-------|---------|----------------|
| **N** | `LOADED` · `STALE` · `UNVERIFIED` · `ABSENT` | 창에 규범 영수증/동등 증거 여부 |
| **S** | `full` · `partial` · `absent` | state 센티널·9축+traps 복구 완전성 |
| **G** | `(none)` 또는 경로 나열 | 이번 세션 **툴로 읽은** 작업 재료만 |

**N 판정 (문안 계약):**

| 값 | 언제 쓴다 |
|----|-----------|
| `LOADED` | 컨텍스트에 `[LOOM-NORMS v1]` 이고 `status: present` (또는 확정 후 동등 영수증) |
| `STALE` | 영수증은 있으나 pack 지문이 디스크와 불일치함을 **확인**했을 때만 (미확인이면 STALE 금지) |
| `UNVERIFIED` | AGENTS/CLAUDE 등 규범 **문구는 보이는데** 영수증 없음 — “있는 것 같음” 추측 |
| `ABSENT` | 규범 문구·영수증 모두 없음 |

**S 판정:**

| 값 | 언제 쓴다 |
|----|-----------|
| `full` | `[LOOM-SESSION-CONTEXT v1 · state]` 있고 `inject omitted:` 없음 (또는 ritual로 9축+traps **전부** 읽음) |
| `partial` | 일부만 있음 · omit 목록 있음 · ritual로 일부만 읽음 |
| `absent` | state 센티널 없고 HANDOFF/traps도 이번 세션에 안 읽음 |

**G 판정:** 디스크에 파일이 있다는 사실이 아니라, **이 대화에서 Read/grep 등으로 올린 경로**만. 시스템 프롬프트 기본 AGENTS는 G에 넣지 않는다 (N/UNVERIFIED 쪽).

#### Template I — 컨텍스트 인벤토리 (복붙 골격)

```markdown
### Context inventory

| Class | Status | Evidence |
|-------|--------|----------|
| N norms | <LOADED\|STALE\|UNVERIFIED\|ABSENT> | <센티널 유무 · packs 한 줄 또는 "영수증 없음"> |
| S state | <full\|partial\|absent> | <센티널 유무 · omit 목록 또는 ritual로 읽은 축 · "없음"> |
| G work | <(none) 또는 경로들> | <이번 세션 툴 로드만 · 최대 8개 · 넘치면 "+N more"> |

**한 줄 요약:** N=<…> · S=<…> · G=<없음|있음>.

**아님:** inject/HANDOFF 전문 · 해시 나열 · status 표 재작성 · “파일은 디스크에 있음”을 LOADED로 주장.
```

#### Template I — 작성 예시 (이 세션 가정 · 참고용)

```markdown
### Context inventory

| Class | Status | Evidence |
|-------|--------|----------|
| N norms | UNVERIFIED | AGENTS/CLAUDE 시스템 쪽 가능 · `[LOOM-NORMS v1]` 없음 |
| S state | partial | SessionStart 센티널 없음 · status+HANDOFF 일부+traps를 요청/리추얼로 읽음 |
| G work | docs/spikes/SESSION-START-UNIFIED-PROPOSE.md | 초안 작성·편집 대화 |

**한 줄 요약:** N=UNVERIFIED · S=partial · G=있음.

**아님:** inject 전문 덤프.
```

#### 짧은 변형 (오너가 한 가지만 물을 때)

표는 **생략하지 않는다.** 첫 문장만 강조:

- “규범만?” → 표 유지 + 첫 문장: `N → UNVERIFIED (영수증 없음).`
- “상태만?” → 표 유지 + 첫 문장: `S → partial (… ).`

#### Must not (응답)

- inject·lessons **본문** 붙여 넣기  
- N=`LOADED`를 “AGENTS.md가 리포에 있다”만으로 쓰기  
- G에 시스템 기본 지시 전체를 나열  
- status Dashboard를 inventory로 대체하거나 이중 표 발명  

“컨텍스트 메모리에 뭐 올라갔어?” = **Template I만**. (P2: 오너 채널 ≠ inject 덤프.)

### 15.7 일반 컨텍스트(G) 표시 (가볍게)

G는 센티널 폭주 금지. 관례만:

- 에이전트가 큰 G를 넣었을 때 한 줄: `G-loaded: docs/spikes/FOO.md (request|gate)`.  
- 또는 inventory의 G 행에 경로 나열.  
- **해시 영수증 필수 아님** (토큰·복잡도). N/S만 기계 검증.

### 15.8 옵션 (이 appendix)

| ID | 방안 | Effort | 효과 | 권고 |
|----|------|--------|------|------|
| **N0** | 문서 분류만 (N/S/G 정의) | S | 공통 언어 | 최소 |
| **N1** | Norms receipt 센티널 + `norms:receipt` | S–M | 로드 여부 판별 가능 | **권고** (β에 포함) |
| **N2** | receipt 해시를 disk와 `norms:check`로 stale 검출 | M | 규칙 파일 수정 후 세션 표류 방지 | N1 직후 |
| **N3** | 매 턴 PreToolUse “N absent면 차단” | L | 강함 · 노이즈 | 비권장 1차 |
| **N4** | AGENTS 전문을 state inject에 합침 | — | 캡 폭발 · lessons 실수 재현 | **금지** |

**권고:** **N0+N1**을 SESSION-START β에 포함 · **N2** 후속 · N3/N4 금지/보류.

### 15.9 Decision log 추가 행 (오너)

| Decision | Options | Owner pick |
|----------|---------|------------|
| N/S/G taxonomy | accept / revise labels | _TBD_ |
| Norms receipt | N0 only / **N1** / N1+N2 | _TBD_ |
| Receipt in bootstrap | always / opt-in | _TBD_ |
| Inventory on “컨텍스트 뭐 있어?” | Template yes/no | _TBD_ |

### 15.10 Must not (이 축)

- 디스크에 AGENTS 있다고 LOADED 주장  
- N을 status 표 다행으로 확장 (view 오염)  
- G 파일마다 센티널  
- N 전문을 HARD_CAP state에 병합  

### 15.11 에이전트 작업별 컨텍스트 맵 (draft)

> 아이디어: 작업 종류마다 **올려야 할 N/S/G 최소 세트**를 표로 고정.  
> “뭐가 창에 있나?”(Template I) + “이 작업에 **부족하면** 뭘 읽나?”(이 맵).  
> **맵 = 체크리스트 계약 · 자동 로더 구현 아님** (승인 전).

#### 15.11.1 왜 필요한가

| 지금 | 맵이 있으면 |
|------|-------------|
| 세션마다 “뭘 읽지?” 재발명 | 작업 코드 → 필수/권장/금지 G 가 한 줄 |
| N/S는 공통인데 G가 과다·과소 | 웨이브 착수 전 **갭 검사** 가능 |
| 레인(arch/impl/rev)마다 필요가 다름 | 역할 열로 분기 (규범 분기 아님 · **재료** 분기) |

판정 흐름:

```text
1) 작업 종류 W 선택 (아래 표 또는 HANDOFF Current action)
2) Template I 로 현재 N/S/G 인벤토리
3) 맵[W].required 와 비교 → missing 만 로드
4) 맵[W].forbidden 은 올리지 않음 (노이즈·역할 침해)
```

#### 15.11.2 작업 코드 레지스트리 (초안)

| Code | 작업 | 누가 (전형) | 트리거 예 |
|------|------|-------------|-----------|
| **W0** | 콜드 스타트 / 이어서 | any architect | 세션 첫 턴 · 이어서 · 상태 |
| **W1** | 오너 확인 (핸드오프) | any | 핸드오프 확인해 · 상태 |
| **W2** | 게이트 실행 (구현 웨이브) | impl / single arch | 진행해 · Current action 실행 |
| **W3** | 락 스펙 구현 (위임) | grok-impl 등 | PATCH 구현 · claim 후 |
| **W4** | R{n} 플랜 리뷰 | claude-rev + advisor | R-REQUEST · Fable 리뷰 |
| **W5** | 적대/보안 2차 리뷰 | codex-rev | adversarial review |
| **W6** | 검증 only (테스트·diff 검수) | verify lane | card.done 후 독립 검증 |
| **W7** | 문서/spike only | arch | propose · SESSION-START 문안 |
| **W8** | 디스패치/보드 | dispatcher | board claim · dispatch_card |
| **W9** | 디버그/장애 | any | 실패 로그 · pane 이슈 |

한 턴에 코드 **하나**를 primary로 고른다. 확인 후 진행이면 **W1 → W2** 순차.

#### 15.11.3 컨텍스트 맵 표 (최소 세트)

범례: **Req** = 착수 전 창에 있어야 함 · **Rec** = 권장 · **No** = 올리지 말 것(역할·노이즈) · **—** = 무관

| Work | N | S | G required (최소) | G recommended | G / 행동 No |
|------|---|---|-------------------|---------------|-------------|
| **W0** 스타트 | Req ≥ UNVERIFIED (목표: receipt 후 LOADED) | Req **full** (hook 또는 ritual 9축+traps) | (none) — 좌표만 | lessons 인덱스(S lessons part) | inject 전문 오너 덤프 |
| **W1** 확인 | — | Req: status 실행 가능 (S partial+도 가능) | (none) | Current action 제목·Done·Must not 3줄 | inject 메트릭·해시 나열 · Template A 외 장문 |
| **W2** 게이트 실행 | Req UNVERIFIED+ | Req full | HANDOFF Current action · 게이트이 가리키는 spike/PLAN 절 | 관련 lessons 카테고리 1개 · traps 이미 S | 무관한 packages 전체 정독 |
| **W3** 락 구현 | Req (impl 규범: claim·손코딩 금지) | Req full + board/claim 상태 | **락된 스펙 파일 전문** · 테스트 경로 | 인접 모듈 최소 | plan_review R 작성 · 스펙 밖 리팩터 |
| **W4** R{n} | Req rev 규범 | Req (Open/Version) | PLAN 해당 절 · plan_review 직전 R · WORKFLOW §5.1 | UNKNOWNS if MINOR | **제품 코드 구현** · R 없는 승인 |
| **W5** 적대 리뷰 | Req | Rec | diff/스펙 · 위협 표면 목록 | 보안 lessons | primary R 단독 close |
| **W6** 검증 | Req (card.done≠완료) | Rec | 워킹트리 diff · 실패 테스트 출력 | watch-card 규약 | 종료 코드만으로 실패 단정 · 회신 맹신 |
| **W7** 문서 | Rec | Rec partial+ | 편집 대상 md · 상위 계약 spike | AGENTS 관련 절만 | 제품 패키지 대규모 로드 |
| **W8** 디스패치 | Req (마커·allowlist·claim) | Rec | card 스펙 경로 · peer/profile | DOGFOOD §1.1 | 잘린 peer ID · claim 없이 3중 착수 |
| **W9** 디버그 | Req (traps 관련) | Rec | 재현 로그 · 최소 의심 파일 | PANE-DEATH / lessons bridge | 추측 대규모 rewrite |

#### 15.11.4 레인 × 맵 (재료만 갈림)

| Lane | 기본 Work | 맵에서 특히 Req | 절대 No (G/행동) |
|------|-----------|----------------|------------------|
| architect (single/full) | W0→W2/W7 | S full · 게이트 spike | 락 스펙 손코딩 (full일 때) |
| grok-impl / claude-impl / codex-impl | W3 | 스펙 전문 · claim | R{n} verdict 작성 |
| claude-rev | W4 | PLAN+§5.1 · fable-advisor | 구현 커밋 |
| codex-rev | W5 | diff·위협 | primary R 대체 |

N 문구 자체는 레인 공통(P3). 다른 것은 **G 목록과 금지 행동**.

#### 15.11.5 갭 검사 응답 (Template M · 문안 초안)

작업 착수 전 또는 오너가 “이 작업 컨텍스트 충분해?” 할 때:

```markdown
### Context map check
- **Work:** W<n> — <이름>
- **Inventory:** N=<…> · S=<…> · G=<…>   ← Template I 한 줄
- **Missing required:** <없음 | 항목 리스트>
- **Next load:** <명령/경로 또는 (none) — 바로 착수>
- **Must not load:** <맵 No 열 요약>
```

Missing 이 있으면 **로드 후** 웨이브 시작.  
W1(확인)은 Missing G가 정상에 가깝다 (표+A만).

#### 15.11.6 Template I 와의 관계

| 도구 | 질문 |
|------|------|
| **Template I** | 지금 창에 **뭐가 있나?** (존재) |
| **Context map** | 이 작업에 **뭐가 있어야 하나?** (필요) |
| **I − map** | **갭** → 읽기 목록 |
| **map No ∩ G** | **과잉** → 무시·올리지 말 것 |

#### 15.11.7 옵션

| ID | 방안 | 권고 |
|----|------|------|
| **M0** | 표만 문서 (본 절) | **지금** — 리뷰용 |
| **M1** | HANDOFF Current action 에 `Work: W2` 한 줄 | 후속 |
| **M2** | `bun run context:map --work W3` 가 required 목록 인쇄 | 구현 승인 후 |
| **M3** | 자동으로 G 프리페치 | 비권고 1차 (과잉 로드) |

#### 15.11.8 Decision 추가

| Decision | Options | Owner pick |
|----------|---------|------------|
| Work map | accept M0 / edit codes / defer | _TBD_ |
| HANDOFF Work: 태그 | yes M1 / no | _TBD_ |
| CLI context:map | later M2 / never | _TBD_ |

### 15.12 Vendor alignment — 공식 가이드 대조 (2026-07-23)

> 조사 목적: 본 초안(공통 규범 · SessionStart 주입 · 로드 판별 · 작업별 맵 · 트리거)이  
> Claude Code / OpenAI Codex / Grok Build **공식(또는 벤더 배포) 문서**와 맞는지 피드백.  
> **구현 지시 아님** · 설계 리뷰 입력.

#### 15.12.1 벤더별 공식 표면

| 축 | Claude Code | OpenAI Codex | Grok Build (xAI) |
|----|-------------|--------------|------------------|
| **프로젝트 규칙 파일** | `CLAUDE.md` / `.claude/rules/` 정본. **`AGENTS.md`는 기본 미로드** — `@AGENTS.md` import 또는 symlink 필요 | `AGENTS.md` **정본**. global `~/.codex` + project walk · override / fallback 이름 | `AGENTS.md` 계열 **자동 로드** + Claude/Cursor 호환 파일명 |
| **규칙 로드 확인** | **`/context`** (Memory files) · **`/memory`** | “Summarize instructions” · `log_dir` / session jsonl 감사 | 훅 탭 등 · 별도 공식 inventory API 약함 |
| **SessionStart 훅** | 공식. `additionalContext` JSON | 공식 Hooks. plain stdout 또는 JSON `additionalContext` · feature/hooks 설정 필요할 수 있음 | 공식 user-guide: `SessionStart` · 컨텍스트 셋업 용도 |
| **강제 실행** | CLAUDE.md = **context not enforcement** → must-run은 **hook** | AGENTS = 지시 체인 · 강제는 hooks/sandbox | hooks로 block/setup |
| **용량 가이드** | CLAUDE.md **~200 lines** 권고 · 길면 adherence↓ | `project_doc_max_bytes` **기본 32 KiB** 후 truncate | 강한 상한 문구 약함 · 실무상 토큰 경쟁 |
| **작업별 컨텍스트 맵** | **없음** (skills · path-scoped rules 근접) | **없음** (nested AGENTS · skills 근접) | **없음** (skills 근접) |
| **N/S/G · receipt** | **없음** (커스텀) | **없음** | **없음** |

**Sources (primary / vendor-shipped):**

| Vendor | URLs / paths |
|--------|----------------|
| Claude | https://code.claude.com/docs/en/memory · https://code.claude.com/docs/en/hooks |
| Codex | https://learn.chatgpt.com/docs/agent-configuration/agents-md · https://developers.openai.com/codex/hooks |
| Grok | https://x.ai/cli · install docs `~/.grok/docs/user-guide/10-hooks.md` · `12-project-rules.md` |

#### 15.12.2 우리 설계 항목별 피드백

##### A. `AGENTS.md`를 3-CLI 공통 규범 SSOT로

| Vendor | 판정 |
|--------|------|
| Codex | ✅ 공식과 **정합** (discovery · override · byte cap 문서화) |
| Grok | ✅ 공식/유저가이드와 **정합** (다이름 로드 · 깊은 path 우선) |
| Claude | ⚠️ **갭** — 공식: Claude Code reads `CLAUDE.md`, **not** `AGENTS.md` |

**함의:** Loom이 AGENTS만 키우면 Claude는 import 없이 N이 UNVERIFIED/ABSENT에 가깝다.  
`CLAUDE.md` thin 포인터(`@AGENTS.md` 또는 symlink)는 선택이 아니라 **Claude 필수**.

##### B. SessionStart로 state inject (bootstrap / `session-context`)

| Vendor | 판정 |
|--------|------|
| Claude | ✅ SessionStart → command → `hookSpecificOutput.additionalContext` |
| Codex | ✅ SessionStart · plain developer context 또는 JSON · **hooks feature 확인** |
| Grok | ✅ SessionStart · project hooks는 **folder trust** 없으면 silent skip |

**함의:** 훅 주입은 3사 지원 방향. 출력 포맷·trust·feature = **어댑터** (본안 β와 일치).  
Grok untrusted → `inject:ritual-fallback` 고지 유지.

##### C. 컨텍스트 윈도우 적재 여부 (Template I / receipt)

| Vendor | 공식 수단 |
|--------|-----------|
| Claude | `/context` · `/memory` · **`InstructionsLoaded` 훅** (어떤 지시 파일이 로드됐는지 로깅) |
| Codex | 모델에게 instruction 요약 · log로 로드 파일 감사 |
| Grok | occupancy API 없음 · rules 자동 로드 + hooks |

**함의:** 센티널/영수증/self-report는 벤더 API 공백을 메우는 **합리적 커스텀**.  
Claude에서는 `[LOOM-NORMS]`만 고집하기보다 **`/context` + InstructionsLoaded 우선 · receipt 보강**이 공식과 더 맞음.  
디스크 존재 ≠ 로드 — Claude 트러블슈팅과 동일 정신.

##### D. N / S / G 분류

- 3사 공식 용어 **없음**.
- 가까운 개념: Claude CLAUDE.md vs auto-memory vs tools · Codex instruction chain vs task · Grok project rules vs session work.
- **함의:** Loom 온톨로지로 유효 · **벤더 표준 아님** → 문서에 “Loom custom” 유지.  
  분류론 전문을 CLAUDE에 넣지 말고 **짧은 포인터 + L0** (200-line 가이드).

##### E. 작업별 컨텍스트 맵 (W0–W9)

- 3사 공식 **없음**.
- 근접: Claude skills · path-scoped rules · Codex nested AGENTS · Grok skills.
- **함의:** 프로세스 레이어. W 코드 벤더 등록 API **없음**. 일부만 skill/rules로 이식 가능.

##### F. 트리거 lexicon

- 공식 lexicon **없음**. 근접: slash/skills · UserPromptSubmit 힌트.
- **함의:** 팀 계약 문서 · 강제 시 훅 리마인더(γ).

##### G. Host detect

- unified host API **없음**.
- **함의:** 라벨만 · 규범 분기 금지(P3) 유지.

#### 15.12.3 정합 / 리스크

**공식과 잘 맞는 것**

1. 규칙 파일 + SessionStart 훅 이중 구조 (Claude: md=context, must-run=hook).  
2. Codex/Grok AGENTS 자동 로드.  
3. 훅으로 세션 시작 컨텍스트 추가 (3사).  
4. 로드 여부를 추측이 아니라 증거로 (Claude `/context`, Codex 감사).  
5. 긴 절차는 md 상시 로드 금지 · skill/온디맨드 (W맵 G 최소주의와 통함).

**공식과 어긋나거나 위험**

1. Claude **AGENTS 미자동로드** — CLAUDE `@AGENTS.md` 필수.  
2. 거대 AGENTS/CLAUDE — ~200 lines / **32 KiB** → L0 diet 필수.  
3. 커스텀 receipt를 벤더 진단 **대체**로 쓰면 Claude에서 중복·유지비.  
4. Codex hooks **feature/설정** 누락 시 무동작.  
5. Grok project hooks **trust silent skip**.  
6. N/S/G · W맵 · Template I = **전부 Loom custom**.

**공식에 없는 것 (우리가 발명하는 층)**

- `[LOOM-NORMS v1]` · `[LOOM-SESSION-CONTEXT …]`  
- Template I / Template M  
- Work codes W0–W9  
- view(status) ≠ model(inject) 채널 분리  

→ 제품/프로세스 레이어 · “벤더 가이드 준수” 범위 밖 · 소유권 명시.

#### 15.12.4 공식 정렬 우선순위 (설계 권고)

| 순위 | 권고 | 이유 |
|:----:|------|------|
| 1 | Claude: `CLAUDE.md` → `@AGENTS.md` (또는 symlink) **고정** | 공식 AGENTS 미로드 |
| 2 | L0 짧게 · AGENTS diet | 200 lines / 32 KiB |
| 3 | State inject = SessionStart 훅 (3 어댑터) | 공식 지원 축 |
| 4 | 로드 확인: Claude `/context` 우선 + (옵션) receipt | 공식 진단 채널 |
| 5 | Codex: hooks 활성화 + AGENTS byte 감시 | 공식 cap · feature |
| 6 | Grok: folder trust 문서화 + ritual fallback | 공식 silent skip |
| 7 | W맵 · Template I = Loom docs only | 벤더 대체물 없음 |

#### 15.12.5 Decision 추가 (vendor)

| Decision | Options | Owner pick |
|----------|---------|------------|
| Claude AGENTS bridge | `@AGENTS.md` in CLAUDE / symlink / both | _TBD_ |
| Receipt vs `/context` | receipt primary / Claude hybrid / defer receipt | _TBD_ |
| AGENTS size budget | enforce diet now / later with implement | _TBD_ |

#### 15.12.6 한 줄 결론

| 질문 | 답 |
|------|-----|
| 공식 가이드 있나? | 규칙 파일 · hooks · (Claude) memory 진단까지는 **3사 있음**. |
| N/S/G · receipt · W맵 · 트리거 표? | **공식 없음** — Loom 커스텀. |
| 지금 설계가 틀렸나? | 훅+규칙+폴백은 **공식과 잘 맞음**. 최대 구멍 = **Claude≠AGENTS 자동 로드** · **지시 파일 비대화**. |
| 윈도우 적재 여부? | 공통 occupancy API **없음**. Claude `/context` · Codex 로그 · 센티널/self-report가 실무 정본. |

---

## 16. Changelog (this draft)

| Date | Note |
|------|------|
| 2026-07-23 | Initial draft for owner review (session discussion: multi-CLI norms · detect · triggers · bootstrap β). |
| 2026-07-23 | §15 Appendix: N/S/G taxonomy · norms receipt · load presence (owner question). |
| 2026-07-23 | §15.6 Template I only: fixed inventory response copy (no implementation). Owner correction: “다듬어” ≠ ship code. |
| 2026-07-23 | §15.4.1 Norms receipt **output schema** (wire form · fields · packs registry · examples · Template I map). Spec text only — no script. |
| 2026-07-23 | §15.11 Work-type **context map** (W0–W9 · N/S/G required · Template M · gap = I − map). Design only. |
| 2026-07-23 | §15.12 **Vendor alignment** (Claude/Codex/Grok official guides · AGENTS gap · hooks · load diagnostics). |
