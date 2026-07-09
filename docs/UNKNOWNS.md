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
장문 에세이·방법론 복붙을 두지 않는다. 규칙 본문은 WORKFLOW §3.5.

**이름 혼동 금지**

| 이름 | 의미 |
|------|------|
| **Loom** | 제품 |
| **Fable 5 / fable-advisor** | 리뷰·조언 에이전트 |
| **Unknowns** | 작업 방법론 (제품명 아님) |

---

## 의무 / 스킵 (요약)

| 상황 | 이 파일 |
|------|---------|
| Low PATCH / hygiene | **스킵** |
| Med finding (범위 명확) | 스킵 가능 |
| MINOR / 새 표면 / 낯선 모듈 | **게이트 섹션 추가** (아래 템플릿) |

---

## 템플릿 (게이트마다 복사)

```markdown
## 0.X.Y — <한 줄 제목>

| Field | Value |
|-------|--------|
| **PLAN** | v0.X.Y (`draft` \| `pending-review` \| …) |
| **Date** | YYYY-MM-DD |
| **Owner context** | (예: sticky RPC는 익숙, Tauri 2는 처음) |

### 4분면

| 분면 | 내용 |
|------|------|
| Known knowns | … |
| Known unknowns | … |
| Unknown knowns | … (목업/반응으로 언어화할 것) |
| Unknown unknowns | … (blindspot 후 채움) |

### Blindspot (함정 / 더 물을 질문)

- …

### Decisions needed (인터뷰 후보 — 아키텍처 영향 순)

1. …
2. …

### Out of scope (이 웨이브에서 안 푼 미지)

- …
```

채운 내용은 **PLAN in/out·Open questions**에 흡수하는 것이 목표다.  
이 파일에만 쌓아 두고 PLAN을 안 고치지 말 것.

---

## 선택 로그

구현 중 계획 이탈은 여기가 아니라 **`implementation-notes.md` → Deviations**.

스파이크/목업 산출물: **`docs/spikes/`** (본구현 트리와 분리).

---

## Gate log

### 0.11.0 — M4.3b Tauri shell *(stub — fill before R13)*

| Field | Value |
|-------|--------|
| **PLAN** | v0.11.0 (`pending-review`) |
| **Date** | 2026-07-09 |
| **Owner context** | sticky RPC / room 모델 익숙; desktop shell 미구현 |

| 분면 | 내용 |
|------|------|
| Known knowns | sticky `POST /rpc` + Bearer; peers/inbox/board 목표; loopback only; no new wire protocol |
| Known unknowns | sticky 미기동 UX; board write RPC 범위; sanitize 위치(JS vs Rust); multi-profile meta |
| Unknown knowns | “좋은 데스크톱 UI” — 목업 전 미정의 |
| Unknown unknowns | sticky에 **board RPC 없음** (R13 M-18); webview **CORS 없음** (R13 M-19); multi-profile meta 선택 |

### Blindspot / R13 (filled from review)

- Board acceptance vs sticky surface gap → **M-18**
- Desktop must use **Rust HTTP invoke**, not webview fetch → **M-19**
- `list_peers` raw displayName → desktop XSS (L-21)
- Session/meta: which `*.host.json` for profile

**Next:** PLAN **0.11.1** locks M-18/M-19 → then `approved` → scaffold. Optional HTML mock still useful for unknown knowns (UI taste).

---

## Changelog (이 문서)

| 날짜 | 내용 |
|------|------|
| 2026-07-09 | 초안 — WORKFLOW §3.5와 쌍; 0.11.0 stub 섹션 |
