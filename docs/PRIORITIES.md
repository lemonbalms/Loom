# Loom 우선순위 (Priorities)

| Field | Value |
|-------|--------|
| **문서** | `docs/PRIORITIES.md` |
| **기준 시점** | PLAN **v0.13.3** · 2026-07-10 |
| **목적** | “지금 무엇을 할지” Owner·에이전트 공통 SSOT (단기) |
| **관련** | [`PLAN.md`](./PLAN.md) · [`WORKFLOW.md`](./WORKFLOW.md) §5 · [`TEST_PLAN.md`](./TEST_PLAN.md) · [`USER_GUIDE.md`](./USER_GUIDE.md) |

---

## 1. 현재 진단

**기능·보안 필수 백로그는 비어 있다.**  
Open blocking 없음. L-4 / L-5 닫힘. 코어 루프(room · handoff · offline inbox · sticky · board · pack embed · desktop)는 동작·테스트 존재.

**병목은 “다음 큰 기능”이 아니라 “남이 쓰고 믿을 수 있게 만드는 것”이다.**

| 영역 | 상태 |
|------|------|
| 코어 멀티플레이 | 사용 가능 |
| Desktop / pack embed | 사용 가능 |
| 설치·PATH (`loom` 단독) | **마찰 큼** — 대부분 `bun run loom` 필수 |
| PLAN 승인 형식 | 최근 author-close 다수 → 외부 신뢰 약함 |
| Relay 재시작 내구성 | 인박스 유실 (MVP 한계) |
| Live board sync | 없음 (스냅샷만) |

---

## 2. 우선순위 표

| 순위 | 테마 | 목표 | Fable R{n} | 상태 |
|------|------|------|------------|------|
| **P0** | **설치·실행 DX** | 클론 후 `loom` 을 헤매지 않게 | 보통 불필요 | **done 0.13.3** |
| **P1** | **신뢰 게이트** | Owner 사인 또는 R14(최근 diff) | Owner 선택 / R14 시 필수 | **next** |
| **P2** | **내구성** | Relay 재시작 후에도 handoff 유지 | **필수** (보안·데이터) | 백로그 |
| **P3** | **큰 신기능** | live board CRDT, 클라우드 계정 등 | **필수** | 의도적 후순위 |
| — | Low 백로그 더 파기 | — | — | **하지 않음** (소진) |

---

## 3. P0 — 설치·실행 DX (상세)

### 왜 1순위인가

- dogfood에서 `loom: command not found` 반복  
- Share 문구는 `bun run loom` 으로 고쳤지만 **글로벌/로컬 link 경로**가 문서에 약함  
- 기능이 있어도 **첫 5분이 막히면 제품 가치가 전달되지 않음**

### 완료 조건 (DoD)

- [x] 레포에서 **한 명령**으로 `loom` 을 PATH에 올리는 방법이 문서화됨 (`bun run link:loom`)  
- [x] `loom --version` (link 후) 동작  
- [x] README Quick start 옵션 A/B/C  
- [x] USER_GUIDE §0  
- [x] `scripts/loom` 래퍼  
- [x] `bun test` + `smoke:desktop` green  

### 비목표 (P0에 넣지 않음)

- npm 퍼블리시 / 홈브루  
- 서명된 desktop .dmg (별도 마일스톤)

### 작업 분해

1. `scripts/loom` 래퍼 (레포 상대, bun 실행)  
2. `bun run link:loom` / `unlink:loom` (packages/cli `bun link`)  
3. README + USER_GUIDE 설치 절  
4. (선택) `loom doctor` 간단 진단 — session/host/profile tip  

---

## 4. P1 — 신뢰 게이트

| 옵션 | 내용 | Owner 액션 |
|------|------|------------|
| **A (빠름)** | 0.13.x author-close 묶음을 **인정** → PLAN Approval 한 줄 | 아래 문구 승인 |
| **B (엄격)** | **R14**: 0.11–0.13 누적 diff 보안·정합성 (Fable 5) | “R14 돌려” |

권장: 다음 MINOR(**P2 durable inbox**) 전에 **A 또는 B 하나**.  
규칙: [`WORKFLOW.md` §5.0–5.1](./WORKFLOW.md).

### P1-A — Owner 사인 초안 (복붙용)

Owner가 동의 시 에이전트가 PLAN/plan_review에 반영:

```text
Owner acknowledges 0.13.0–0.13.3 author-close series (L-5, L-4, dogfood UX, install DX)
as acceptable without external R{n}; next external review required at P2 durable inbox (MINOR) or earlier if security-sensitive.
```

### P1-B — R14 범위 (요청 시)

| 범위 | 내용 |
|------|------|
| Diff | ~0.11.0 … 0.13.3 (desktop sticky, pack embed, requestId, dogfood, install DX) |
| 초점 | sticky token/RPC, pack embed allowlist, inbox claim first-wins, desktop XSS (M-20) |
| 산출 | `docs/plan_review.md` R14 + Open/Closed |

---

## 5. P2 — 내구성 (다음 마일스톤 후보)

- Relay 인박스/로스터 **디스크 또는 재기동 복구**  
- 문서화된 “재시작 시 유실” 한계를 줄이는 것이 제품 북극성에 직접 연결  

→ PLAN MINOR + **Fable R{n} 필수**.

---

## 6. P3 — 의도적 후순위

- Live multi-writer board CRDT  
- 클라우드 계정 / 멀티테넌시  
- PTY inject  
- 문서만 계속 늘리기 (가이드·테스트 플랜은 충분)

---

## 7. 실행 순서 (권장)

```text
① P0 설치 DX 구현 + 문서     ← done 0.13.3
② TEST_PLAN P0 수동 1회 기록 (UC-1 + UC-3)  ← done 2026-07-10
③ P1 Owner 사인 또는 R14     ← next (Owner 선택)
④ P2 durable inbox (설계 → Fable → 구현)
```

---

## 8. 변경 이력

| 날짜 | 내용 |
|------|------|
| 2026-07-10 | 초안 — 0.13.2 시점 진단 및 P0=설치 DX |
| 2026-07-10 | P0 implemented (link:loom, scripts/loom, docs) — 0.13.3 |
| 2026-07-10 | TEST_PLAN P0 gate 기록 (UC-0/1/3/11); P1 next |

---

*이 문서가 PLAN 기능 범위와 충돌하면 **PLAN 버전 게이트를 우선**하고, 이 문서는 “무엇을 먼저 할지” 운영 우선순위만 담당한다.*
