# Unknowns — 지도 ≠ 영토

| Field | Value |
|-------|--------|
| **Document** | `docs/UNKNOWNS.md` |
| **Role** | 미지 템플릿 + 게이트별 **짧은** 표 |
| **SSOT** | **아님** — 제품 계획 SSOT는 `docs/PLAN.md` |
| **Workflow** | `docs/WORKFLOW.md` **§3.5** |
| **Last updated** | 2026-07-09 |

---

## 왜 있는가

프롬프트·PLAN·스킬은 **지도**다. 코드·보안·툴체인·실제 UX는 **영토**다.  
그 간극이 **미지(unknowns)** 이고, 에이전트는 여기서 추측 결정을 한다.

이 파일은 미지를 **값싸게** 드러내기 위한 체크리스트다.  
규칙 본문: WORKFLOW §3.5.

| 이름 | 의미 |
|------|------|
| **Loom** | 제품 |
| **Fable 5 / fable-advisor** | 리뷰 에이전트 |
| **Unknowns** | 작업 방법론 (제품명 아님) |

---

## 템플릿 (게이트마다 복사)

```markdown
## 0.X.Y — <한 줄 제목>
| 분면 | 내용 |
|------|------|
| Known knowns | … |
| Known unknowns | … |
| Unknown knowns | … |
| Unknown unknowns | … |
```

---

## Gate log

### 0.11.1 — M4.3b Tauri shell (plan locked)

| Field | Value |
|-------|--------|
| **PLAN** | v0.11.1 (`approved`) |
| **Date** | 2026-07-09 |

| 분면 | 내용 |
|------|------|
| Known knowns | sticky RPC status/peers/inbox/claim; loopback; M-18 **C** no Board v1; M-19 Rust invoke + session order; M-20 textContent-only |
| Known unknowns | Tauri 2 monorepo layout polish; macOS signing later; multi-window |
| Unknown knowns | desktop visual taste — optional mock during implement |
| Unknown unknowns | (closed for plan) board gap, CORS, sanitize≠HTML — locked in 0.11.1 |

**Next:** implement `apps/desktop` under 0.11.1. Board UI = later gate.

### 0.11.0 — superseded

R13 pending-revision material; see plan_review R13 + PLAN 0.11.1.

---

## Changelog

| 날짜 | 내용 |
|------|------|
| 2026-07-09 | 초안 + 0.11 stub |
| 2026-07-09 | R13 fill; 0.11.1 locks |
