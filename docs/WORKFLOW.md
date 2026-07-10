# Loom — 워크플로우 규칙 (Workflow Rules)

이 문서는 **현재 레포에서 실제로 쓰는 작업 방식**을 규칙으로 고정한 SSOT다.  
에이전트·기여자·리뷰어는 이 규칙을 따른다. 제품 기능 계획은 `docs/PLAN.md`가 SSOT다.

| Field | Value |
|-------|--------|
| **Document** | `docs/WORKFLOW.md` |
| **Status** | **active** |
| **Last updated** | 2026-07-09 |
| **Related** | `docs/PLAN.md`, `docs/plan_review.md`, `docs/UNKNOWNS.md`, `implementation-notes.md`, `HANDOFF.md`, `AGENTS.md` |

---

## 0. 세션 진입 (Session start) — 필수

새 세션(또는 컨텍스트 리셋 직후)에 에이전트는 **첫 응답 전에** 아래를 수행한다.

### 0.1 읽을 파일

| 순서 | 파일 | 목적 |
|------|------|------|
| 1 | `HANDOFF.md` | 현재 게이트·다음 액션·함정 |
| 2 | `docs/WORKFLOW.md` | 이 규칙 |
| 3 | `docs/PLAN.md` **헤더** | Version / Status |
| 4 | `docs/plan_review.md` **헤더 + Open** | blocking / 최신 R{n} |

상세 진입 지시: 루트 **`AGENTS.md`** (Codex·공용), **`CLAUDE.md`** (Claude).

| 도구 | 진입 파일 |
|------|-----------|
| **OpenAI Codex CLI** | 루트 `AGENTS.md` 자동 로드 ([Codex AGENTS.md](https://developers.openai.com/codex/guides/agents-md)) |
| **Claude Code** | `CLAUDE.md` + `AGENTS.md` |
| **빠른 상태** | `bun run status` → PLAN/Open/HANDOFF 요약 출력 |

### 0.2 사용자에게 바로 알릴 것

첫 사용자 메시지에 대한 **첫  substantive 응답**에 상태 브리핑을 포함한다 (한국어 세션이면 한국어):

```markdown
## 세션 상태
| 항목 | 값 |
|------|-----|
| PLAN | v… (`status`) |
| Open blocking | … |
| 다음 액션 | HANDOFF의 Immediate next steps |
| 워크플로 | docs/WORKFLOW.md |
| 제품/에이전트 | Loom ≠ Fable 5 |

이어서 진행할까요?
```

사용자가 이미 매우 구체적인 명령만 준 경우(예: “이 파일만 고쳐”)는 브리핑을 **짧게** 하고 바로 실행해도 된다.  
「진행해」「이어서」「단계적으로」「자율적으로」는 **반드시** HANDOFF 기준 다음 게이트를 따르고, **승인 대기 없이** 웨이브를 진행한다.  
브리핑 끝에 “이어서 할까요?”를 붙여 진행을 멈추지 말 것.

### 0.3 세션 종료 / 게이트 완료 시

다음 진입이 맞도록 **`HANDOFF.md`** 를 갱신한다 (Where we are, next steps, resume prompt).

---

## 1. 역할과 이름

| 이름 | 역할 | 비고 |
|------|------|------|
| **Loom** | **제품** (CLI `loom`, 패키지 `@loom/*`) | 구 이름 Fable — dual-compat만 예외 |
| **fable-advisor / Fable 5** | **리뷰·조언 에이전트** (제품 아님) | 제품 CLI와 혼동 금지 |
| **Plan author / implementer** | PLAN 작성·코드 구현·PATCH 반영 | |
| **Reviewer** | `plan_review.md`에 R{n} 작성 | 코드 실증 권장 |
| **Owner** | 우선순위·승인 최종 판단 | 사용자 |

문서·커밋·리뷰에서 “Fable이 고쳤다”처럼 모호한 주어를 쓰지 않는다.  
→ **Loom(제품)** vs **Fable 5(리뷰어)** 를 구분한다.

---

## 2. 문서 지도 (무엇을 어디에)

| 문서 | 역할 |
|------|------|
| **`docs/PLAN.md`** | 제품 계획 **SSOT** — 버전, status, changelog, decision log |
| **`docs/plan_review.md`** | 리뷰 결과 **SSOT** — R{n}, open/blocking, backlog |
| **`docs/plan_review_archive.md`** | 오래된 리뷰 본문 아카이브 |
| **`docs/PROTOCOL.md`** | 와이어/프로토콜 |
| **`docs/ARCHITECTURE.md`** | 패키지·데이터 플로우 |
| **`docs/UNKNOWNS.md`** | 미지(지도≠영토) 템플릿·게이트별 짧은 표 — **PLAN 대체 금지** |
| **`implementation-notes.md`** | 계획 이탈(**Deviations**) 실시간 로그 |
| **`HANDOFF.md`** | 세션 간 인수인계 (상태 스냅샷) |
| **`tasks/todo.md`** | 단기 체크리스트 (비-SSOT) |
| **`README.md`** | 외부용 목적·구조·퀵스타트 |

**금지:** PLAN status를 리뷰 없이 `approved`로 올리기.  
**예외 관례:** 리뷰가 “이 Med들 PATCH 후 approve 가능”이라고 명시한 경우, 구현자가 해당 PATCH를 반영한 뒤 author-close로 `approved` 가능 (0.8.1, 0.9.1 패턴).  
**Low backlog author-close:** 선택적 Low만 구현하고 재리뷰를 생략할 때는 Status에 **`(author-close, Low backlog)`** 를 붙이고, Changelog에 **when / who / not R{n}·not Owner** 를 적는다. 모호한 bare `approved` 금지 (0.13.1 정직화).

---

## 3. 핵심 루프 (Plan → Review → Implement → Verify → Ship)

```
┌─────────────┐
│ 0. Unknowns │  MINOR/새 표면: 미지 표 (docs/UNKNOWNS.md) — §3.5
│  (optional) │  Low PATCH: 스킵
└──────┬──────┘
       ▼
┌─────────────┐
│ 1. Plan     │  PLAN version ↑, Status draft|pending-review, Changelog
└──────┬──────┘
       ▼
┌─────────────┐
│ 2. Review   │  plan_review.md ← R{n} (대상 버전 명시)
│             │  approved | pending-revision | on-hold
└──────┬──────┘
       ▼
┌─────────────┐
│ 3. Implement│  approved 기준 (또는 pending-revision 필수 finding)
│             │  이탈 시 implementation-notes Deviations
└──────┬──────┘
       ▼
┌─────────────┐
│ 4. Verify   │  bun test (필수) · 관련 수동 스모크
└──────┬──────┘
       ▼
┌─────────────┐
│ 5. Sync     │  PLAN “Implemented as of…”, plan_review follow-up,
│             │  README 버전, CLI VERSION, HANDOFF/todo
└──────┬──────┘
       ▼
┌─────────────┐
│ 6. Ship     │  commit + push (main); 원격: lemonbalms/Loom
└─────────────┘
```

사용자 지시 **「진행해」/「단계적으로 진행해」/「자율적으로」/「이어서」** 의미:

1. 현재 게이트의 **다음 단계부터 웨이브를 끝까지** 실행한다 (리뷰 대기면 리뷰 요청·본문, 블로커면 수정, approved면 구현…).
2. 단계마다 **사용자 승인 질문을 하지 않는다** (“해도 될까요?”, “커밋할까요?” 금지가 기본).
3. 한 웨이브 종료: **`bun test` (관련 시 smoke) → 문서 동기화 → 커밋·푸시(`main`)** 까지 기본 수행.
4. 세션 시작 브리핑(상태 표)은 하되, 브리핑 직후 **바로 다음 액션에 착수**한다.
5. **새 MINOR/보안 Med+** 를 열 때는 먼저 PLAN을 올리고 리뷰 게이트를 탄다.  
   (가능하면 PLAN `pending-review` 전·또는 R{n} 직전에 **§3.5 Unknowns**.)
6. **멈춤 조건만:** MAJOR 방향 모호 · 파괴적 공유 작업 · 사람만 가능한 외부 의존 · 사용자가 “멈춰/계획만/커밋 금지”.

---

## 3.5 Unknowns — 지도 ≠ 영토

에이전트 품질의 병목은 구현 속도가 아니라 **미지(unknowns) 해소**인 경우가 많다.

| | |
|--|--|
| **지도** | PLAN, 프롬프트, 스킬, 컨텍스트 — 에이전트에게 준 것 |
| **영토** | 코드베이스, 보안 불변식, 툴체인, 실제 UX 제약 |
| **미지** | 지도와 영토의 간극 — 여기서 에이전트가 “추측 결정”을 함 |

미지를 **고치기 비싸지기 전에** 값싸게 드러낸다.  
상세 템플릿·게이트별 표: **`docs/UNKNOWNS.md`** (에세이 복붙 금지, 짧은 표만).

**이름:** 이 절은 작업 **방법론**이다. 제품 = **Loom**, 리뷰 에이전트 = **Fable 5** — 혼동 금지.

### 언제 의무 / 스킵

| 상황 | Unknowns 패스 |
|------|----------------|
| Low PATCH, 문서 hygiene, 버전 문자열 | **스킵** |
| Med finding 수정 (범위가 리뷰에 명확) | **스킵 가능** (선택: 1문단 blindspot) |
| 새 MINOR / 새 제품 표면 (Tauri, 프로토콜, 호환 제거) | **필수** — PLAN `pending-review` 전 또는 R{n} 직전 |
| 낯선 모듈·도메인 첫 터치 | **권장** |

### 4분면 (MINOR 착수 시 5분)

| 분면 | 질문 | 어디에 남기나 |
|------|------|----------------|
| **Known knowns** | 이번 웨이브에서 확정된 것 | PLAN What / in 표 |
| **Known unknowns** | 모르는 줄 아는 것 | `docs/UNKNOWNS.md` 또는 PLAN Open questions |
| **Unknown knowns** | 보면 알 암묵 기준 (취향·UX) | 목업/스파이크 반응으로 언어화 |
| **Unknown unknowns** | 아예 안 떠올린 것 | Blindspot pass → UNKNOWNS |

### 기법 라우팅

| 증상 | 기법 | 산출물 |
|------|------|--------|
| 모듈/도메인을 모름 | **Blindspot** | 함정 목록 + 더 나은 프롬프트 질문 |
| “보면 알겠는데 말로 못 함” | **프로토타입/목업** | `docs/spikes/` 또는 임시 HTML (**앱 본구현 금지**) |
| 결정이 갈림 | **인터뷰** (한 질문씩; 아키텍처 영향 우선) | 결정 표 → PLAN 반영 |
| 원하는 동작이 남의 코드에 있음 | **Reference** | 경로 + 재구현 시맨틱 |
| 구현 직전 | **Plan** (바뀔 결정 앞세움) | 데이터/타입/UX 먼저; 기계적 리팩터 하단 |
| 계획 이탈 | **Deviations** | `implementation-notes.md` (현행 §6.2) |
| 머지 전 Owner 이해 | **Quiz** (선택) | 짧은 퀴즈 |
| 리뷰 지지 | **Pitch** (선택) | `plan_review` Decision notes 보강 |

html-effectiveness 등 외부 스킬(`blindspot`, `interview`, `plan`, `quiz`…)이 있으면 **같은 순서로** 써도 된다.  
**플러그인 없이도** 이 절 + `docs/UNKNOWNS.md`만으로 동작해야 한다 (Codex/기타 에이전트).

### 금지

- `UNKNOWNS.md`로 **PLAN status / SSOT를 대체**하지 말 것  
- Blindspot 결과만으로 **본구현을 시작**하지 말 것 (먼저 PLAN in/out)  
- 모든 PATCH에 4분면 **강제 금지**  
- 방법론 문서를 `FABLE_*.md` 등 **제품 인접 이름**으로 두지 말 것  

### R{n} 리뷰 시 한 줄 (MINOR)

- [ ] Known unknowns가 PLAN in/out 또는 Open questions / UNKNOWNS에 반영됐는가  
- [ ] 보안 표면에 닿는 unknown unknowns가 finding으로 올라왔는가 (해당 시)

---

## 4. PLAN 버전·상태 규칙

### 4.1 SemVer (PLAN 상단과 동일)

| 자리 | 언제 |
|------|------|
| **MAJOR** | 제품 방향 전환, 이전 계획과 양립 불가 |
| **MINOR** | 아키텍처·페이즈 범위·공개 표면 의미 변경 (rename, 새 페이즈) → **리뷰 권장** |
| **PATCH** | finding 수정, Low backlog, 문서 정직화, 국소 리팩터 → **재리뷰 선택** |

CLI `VERSION` 문자열과 PLAN Version을 **같은 숫자**로 맞춘다 (`packages/cli`, MCP `serverInfo` 등).

### 4.2 Status

| Status | 의미 | 구현 |
|--------|------|------|
| `draft` | 작성 중 | 본구현 금지 (스파이크만) |
| `pending-review` | 리뷰 대기/진행 | 구현 가능하나 **approved 전 머지 정책은 Owner** |
| `pending-revision` | *(리뷰 결론)* PLAN 헤더에도 반영 권장 | **Open blocking only** 수정 |
| `approved` | 이 버전 기준 진행 허용 | 정상 구현·ship |
| `superseded` | 상위 버전에 대체 | 읽기 전용 이력 |
| `on-hold` | 의도적 중단 | 구현 중지 |

### 4.3 Changelog 필수 항목

- **Why** (한 줄)
- **What** 표 (What / Why)
- Implemented as of … (코드가 앞선 경우)
- Not in … (범위 밖)
- Review impact (재리뷰 필요 여부)

---

## 5. 리뷰 규칙 (`docs/plan_review.md`)

### 5.0 역할 — 누가 “승인”하나

| 이름 | 역할 | PLAN에 남기는 것 |
|------|------|------------------|
| **Owner** (사용자) | 제품 우선순위·최종 go/no-go | 선택적으로 Approval block “Owner” 행 |
| **Fable 5 / fable-advisor** | **계획·보안·코드 대조 리뷰 에이전트** (제품 Loom 아님) | `plan_review.md` **R{n}** 결론 (`approved` / `pending-revision` / `on-hold`) |
| **Plan author / implementer** | PLAN 작성·코드 구현·문서 동기화 | Changelog; Low만 **author-close** 가능 (출처 명시) |

**“Fable 승인”** = Fable 5가 `docs/plan_review.md`에 **R{n}** 을 쓰고 결론을 **`approved`** 로 남기는 것.  
Git 커밋 author 이름이나 bare `PLAN Status=approved` 만으로 “Fable 승인”이 된 것이 **아니다**.

### 5.1 언제 **Fable 5 리뷰(R{n})가 필요한가**

| 상황 | Fable 5 (R{n}) | PLAN Status 관례 |
|------|----------------|------------------|
| 새 **MINOR** / 신규 제품 표면 (Tauri 셸, 보드 UI, MCP 표면 확대) | **필수** | `pending-review` → R{n} 후 `approved` 또는 `pending-revision` |
| **보안·신뢰 경계** 변경 (auth, peerSecret, sanitize 계약, bind/H-5, 토큰 경로) | **필수** | 동일 |
| **프로토콜 와이어** 의미 변경 (필수 필드 추가, 호환 깨짐) | **필수** | 동일 |
| **호환 제거 / 컷오버** (0.10 dual-compat drop 등) | **필수** | 동일 |
| R{n} **`pending-revision`** 의 Med/High finding 수정 후 | **필수** 재확인 또는 “PATCH 후 author-close 가능” 문구 따름 | 리뷰 결론 따름 |
| Owner가 **「리뷰해」「R{n}」「Fable 리뷰」** 명시 | **필수** | 지시 따름 |
| **Low** backlog만 (문서, caps 표기, 선택 opt-in, additive optional 필드) | **선택** | author-close 가능 → Status에 `(author-close, Low backlog)` + Changelog 출처 |
| 순수 오타·주석·VERSION 문자열·HANDOFF 정리 | **불필요** | 보통 PLAN 버전 안 올림 |

**필수일 때 절차 요약**

1. PLAN Version↑, Status = `pending-review`, Changelog What/Why/Out.  
2. (MINOR) Unknowns §3.5 권장.  
3. Fable 5(또는 동등 리뷰 에이전트)가 코드·PLAN 대조 → `plan_review.md` **R{n}**.  
4. `approved` → 구현·ship. `pending-revision` → Open blocking만 수정.  
5. 리뷰가 “이 Med PATCH 후 재리뷰 없이 approve 가능”이면 implementer **author-close** 허용 (출처 기록).

**Fable 승인이 *불필요*한 예 (최근)**

- 0.13.1 L-4 residual `requestId` (optional additive) → author-close  
- 0.12.1 desktop polish / PITCH sync → author-close  
- 문서-only hygiene  

**Fable 승인이 *필요*했던 예**

- R13 — Tauri 셸 계획 (0.11.0) 보안·스코프  
- R12 — dual-compat 제거 (0.10.0)  
- R10–R11 — M-7 peerSecret, Loom rename 게이트  

### 5.1b 현재 게이트 스냅샷

**현재(PLAN 0.14.1 `approved`):** Open blocking **없음**. R15 closed via 0.14.1 locks. Priorities: [`PRIORITIES.md`](./PRIORITIES.md) **P2**. Next = **implement durable relay** under 0.14.1.

### 5.2 리뷰어 절차

1. **대상** `docs/PLAN.md` **vX.Y.Z** 헤더에 명시.
2. 관련 계획 부속 문서·**코드를 직접** 확인 (줄 근거).
3. `plan_review.md`에 섹션 추가:

```markdown
## Review R{n} — Plan vX.Y.Z
**검토 대상:** …
**검토자:** …
**날짜:** …
**결론:** approved | pending-revision | on-hold
### Checklist
### Findings (Sev: High|Med|Low, ID)
### Decision notes
```

4. 상단 **최신**, **Open (blocking)**, **Review index** 갱신.
5. PLAN 헤더 Status를 리뷰 결론과 **동기화** (`pending-revision` 포함).

### 5.3 Finding 심각도

| Sev | 의미 | 게이트 |
|-----|------|--------|
| **High** | 보안 실패·데이터 손실·기본값 위험 | 즉시 블로커 |
| **Med** | 실질 오동작·게이트 우회·호환 구멍 | 보통 PATCH 블로커 |
| **Low** | 정리·문서·미래 회귀 | backlog 허용 |

### 5.4 Finding ID 관례

- 리뷰 내 일련: `H-n`, `M-n`, `L-n` (시리즈 전역 증가 가능: M-13, M-14…).
- 닫을 때: Open에서 제거, Recent follow-ups에 처리 버전 기록.

### 5.5 아카이브

`plan_review.md`가 비대해지면 닫힌 R{n} 본문을 `plan_review_archive.md`로 옮긴다.  
인덱스·Open·최신 헤더는 활성 파일에 유지.

---

## 6. 구현 규칙

### 6.1 범위

- **한 웨이브 = 한 게이트** (예: R11 블로커만, 또는 L-4만).  
  rename + 새 기능 혼합 금지.
- 최소 변경: 필요한 파일만. 드라이브바이 리팩터 금지.
- 보안 불변식 유지: sanitize, timing-safe compare, M-7 peerSecret, H-5 fail-open 거부, H-4 MCP 단일 테이블 등.

### 6.2 계획 이탈 (`implementation-notes.md`)

계획/리뷰와 다른 선택을 해야 하면:

1. **보수적 선택** (데이터 보존 · 보안 · dual-compat > 순수성).
2. **`implementation-notes.md` → Deviations** 표에 한 줄 추가  
   (날짜 | 계획 참조 | 한 일 | 왜 보수적 | follow-up).
3. **멈추지 말고 진행**.

침묵 즉흥 구현 금지.

### 6.3 검증

구현 웨이브 종료 시:

```bash
bun test          # 필수, green 전에 done 선언 금지
bun run loom --version   # PLAN 버전과 일치
```

필요 시 관련 통합 테스트·수동 스모크.

### 6.4 문서 동기화 (웨이브 끝)

- [ ] `docs/PLAN.md` version/status/changelog/decision log  
- [ ] `docs/plan_review.md` open/follow-up (해당 시)  
- [ ] CLI `VERSION` / MCP version 문자열  
- [ ] `README.md` Plan 버전  
- [ ] `tasks/todo.md`  
- [ ] `HANDOFF.md` (세션 넘길 때)  
- [ ] Deviations (이탈 시)

---

## 7. Git / 원격

| 항목 | 규칙 |
|------|------|
| 원격 | `https://github.com/lemonbalms/Loom.git` (`origin`) |
| 기본 브랜치 | `main` |
| 커밋 | 웨이브 완료 후; 메시지에 버전·finding ID 포함 권장 (`fix(0.9.4): L-4 …`) |
| 푸시 | Owner/사용자가 푸시를 원하거나 「커밋하고 푸시해」「단계적으로 진행」으로 ship까지 포함한 경우 |
| 시크릿 | `~/.loom`, `.env`, session, peerSecret **커밋 금지** (`.gitignore`) |
| force-push main | 금지 (명시 승인 없이) |

---

## 8. 백로그 처리 순서 (관례)

Open **blocking** 이 있으면 항상 최우선.

blocking 없을 때 기본 순서:

1. 리뷰 `pending-revision` 잔여  
2. Med 보안/호환 backlog  
3. Low (L-n) — 작은 PATCH로 묶기 가능 (0.9.2–0.9.4)  
4. Product (Tauri 등) — 환경 블로커 명시  
5. 호환 제거 MINOR (0.10) — 별도 리뷰

---

## 9. 사용자 지시 치트시트

| 사용자 말 | 에이전트 행동 |
|-----------|----------------|
| **진행해 / 단계적으로 진행해** | 현재 게이트 다음 단계 실행 → 테스트 → 문서 동기화 → (관례) 커밋·푸시 |
| **리뷰해 / plan_review 피드백 / Fable 리뷰 / R{n}** | Fable 5(또는 동등) 게이트: PLAN+코드 대조 → `plan_review.md` R{n}; **필수 상황 §5.1**. Claude Code dogfood: **`/advisor fable` 필수** → [`DOGFOOD_LOOP.md`](./DOGFOOD_LOOP.md) |
| **승인 / approve** (Owner) | Owner 최종 go — PLAN Approval block에 Owner 행 (선택·권장 when MINOR) |
| **미지 / blindspot / 블라인드** | 코드베이스 스캔 → 4분면 표 + 관련 unknown unknowns (§3.5, `docs/UNKNOWNS.md`) |
| **인터뷰해** | 아키텍처를 바꿀 질문을 **한 번에 1개** (우선순위: 분기 큰 것) |
| **목업 / 프로토타입** | 앱 본코드 안 건드리고 HTML/`docs/spikes/` 만 |
| **퀴즈** | 최근 diff/웨이브 이해 퀴즈 (머지 전 Owner용, 선택) |
| **커밋하고 푸시해** | status clean 확인 후 commit + push |
| **핸드오프 작성** | `HANDOFF.md` 갱신 |
| 계획 이탈 발생 | Deviations 기록 후 계속 |

---

## 10. 리뷰 vs 구현 담당 분리

| 작업 | 산출물 |
|------|--------|
| 리뷰어 | `plan_review.md` R{n} 결론·findings (**코드 수정 최소화**) |
| 구현자 | 코드 + PLAN PATCH + tests + follow-up 표 |
| 메타 피드백 (“plan_review 검토해”) | 리뷰 품질·SSOT 드리프트 지적; 자동 approve 아님 |

---

## 11. 완료 정의 (Definition of Done) — 한 웨이브

- [ ] 목표 finding/기능이 코드에 반영됨  
- [ ] `bun test` green  
- [ ] PLAN 버전·changelog 일치  
- [ ] plan_review Open/follow-up 갱신 (해당 시)  
- [ ] 이탈 시 Deviations 기록  
- [ ] (ship 시) commit + push, 워킹트리 clean  

---

## 12. 변경 이력 (이 규칙 문서)

| 날짜 | 내용 |
|------|------|
| 2026-07-09 | 초안 — 0.9.x 시리즈에서 확정된 Plan/Review/Implement/Ship 관례 성문화 |
| 2026-07-09 | **§3.5 Unknowns** — 지도≠영토; `docs/UNKNOWNS.md`; 치트시트 미지/인터뷰/목업/퀴즈 |
| 2026-07-09 | §5.1 현재 게이트 → 0.11.0 R13 (M-18/M-19); 구 0.9.4 문구 삭제 |
| 2026-07-09 | §5.1 → **0.11.1 approved**; implement desktop next |
| 2026-07-10 | author-close Low 표기 규칙 (0.13.1 정직화) |
| 2026-07-10 | **§5.0–5.1** Fable 5 승인이 필요한 경우 / 역할 표 |
| 2026-07-09 | §0 세션 진입 의식 + `AGENTS.md` / `CLAUDE.md` 연동 |

---

*이 규칙과 `PLAN.md` 절차가 충돌하면 **PLAN의 버전 게이트 문구를 우선**하고, 이 문서의 운영 세부(Deviations, ship, 이름 경계)를 보완 규칙으로 본다.*
