# Loom 우선순위 (Priorities)

| Field | Value |
|-------|--------|
| **문서** | `docs/PRIORITIES.md` |
| **기준 시점** | PLAN **v0.15.0** (`pending-review`) · 2026-07-10 |
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
| 설치·PATH (`loom` 단독) | **완화** — `bun run link:loom` / `scripts/loom` (P0) |
| PLAN 승인 형식 | R14/R15 게이트 후 author-close 잔여 있음 |
| Relay 재시작 내구성 | **done 0.14.x** — disk snapshot (inbox+roster) |
| Live board sync | 없음 (스냅샷만) — P3 |

---

## 2. 우선순위 표

| 순위 | 테마 | 목표 | Fable R{n} | 상태 |
|------|------|------|------------|------|
| **P0** | **설치·실행 DX** | 클론 후 `loom` 을 헤매지 않게 | 보통 불필요 | **done 0.13.3** |
| **P1** | **신뢰 게이트** | Owner 사인 또는 R14(최근 diff) | **R14 done** | **done 0.13.4** |
| **P2** | **내구성** | Relay 재시작 후에도 handoff 유지 | **필수** (보안·데이터) | **done 0.14.1–0.14.2** |
| **P2.5** | **목적 루프** | Purpose card · handoff contracts · receive claim | **R16** | **done 0.15.1** |
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

**P1 완료 (B):** R14 **approved** 2026-07-10 — 산출 `docs/plan_review.md` R14.  
R14 Low: **L-26 / L-27 done 0.13.5**.  
규칙: [`WORKFLOW.md` §5.0–5.1](./WORKFLOW.md).

---

## 5. P2 — 내구성 (**done**)

- Relay 인박스/로스터 **디스크 스냅샷** (`~/.loom/relay-state` / `LOOM_RELAY_STATE_DIR`)  
- R15 M-21/22/23 locks · 0.14.2 symlink/fail-closed harden  
- 검증: `packages/relay` persist tests · `bun run smoke:durable`  

→ **다음 우선순위는 P3 또는 제품 마무리(문서·dogfood)** — 필수 백로그 비움.

---

## 6. P3 — 의도적 후순위

- Live multi-writer board CRDT  
- 클라우드 계정 / 멀티테넌시  
- PTY inject  
- Low 백로그만 계속 파기

---

## 7. 실행 순서 (권장)

```text
① P0 설치 DX 구현 + 문서     ← done 0.13.3
② TEST_PLAN P0 수동 1회 기록 (UC-1 + UC-3)  ← done 2026-07-10
③ P1 Owner 사인 또는 R14     ← done R14 (0.13.4)
④ P2 durable inbox           ← done 0.14.1–0.14.2
⑤ 문서 honesty / smoke:durable     ← done
⑥ Purpose-based sprint 1 (0.15.0) ← **pending-review R16**
⑦ P3 only if Owner picks
```

---

## 8. 변경 이력

| 날짜 | 내용 |
|------|------|
| 2026-07-10 | 초안 — 0.13.2 시점 진단 및 P0=설치 DX |
| 2026-07-10 | P0 implemented (link:loom, scripts/loom, docs) — 0.13.3 |
| 2026-07-10 | TEST_PLAN P0 gate 기록 (UC-0/1/3/11); P1 next |
| 2026-07-10 | P1-B R14 approved — 0.13.4; next P2 |
| 2026-07-10 | R14 Low L-26/L-27 implemented — 0.13.5 |
| 2026-07-10 | P2 PLAN **0.14.0** draft pending-review (R15) |
| 2026-07-10 | R15 → **0.14.1** implement · **0.14.2** harden · docs honesty wave |
| 2026-07-10 | **0.15.0** Purpose-based sprint 1 draft (R16) |

---

*이 문서가 PLAN 기능 범위와 충돌하면 **PLAN 버전 게이트를 우선**하고, 이 문서는 “무엇을 먼저 할지” 운영 우선순위만 담당한다.*
