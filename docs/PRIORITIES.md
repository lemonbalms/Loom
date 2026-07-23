# Loom 우선순위 (Priorities)

**철학 (첫 문단):** 우선순위 문서는 지난 백로그 회고장이 아니라, **지금 세션이 고를 수 있는 다음 검증 가능한 한 수**의 SSOT다. “이미 그린 재실행”·“오너 블로커만 기다림”·“문서 동기만”은 next-action 실격이다. 실패하면 **새로 배우는 것**이 있는 일만 위에 둔다.

| Field | Value |
|-------|--------|
| **문서** | `docs/PRIORITIES.md` |
| **제품 핀** | PLAN / CLI **v0.28.1** `approved` (2026-07-22) |
| **게이트 핀** | `HANDOFF.md` · `bun run status` (항상 이 파일보다 우선) |
| **관련** | [`CHANGELOG.md`](./CHANGELOG.md) · [`PLAN.md`](./PLAN.md) · [`WORKFLOW.md`](./WORKFLOW.md) · [`DOC-REFRESH-PLAN.md`](./DOC-REFRESH-PLAN.md) · [PANE-DEATH unified](./spikes/PANE-DEATH-UNIFIED-DESIGN.md) · [HERDR-0.7.5-COMPAT](./spikes/HERDR-0.7.5-COMPAT.md) |

---

## 1. 한 줄 상태

| 축 | 상태 |
|----|------|
| **제품 MVP (room·handoff·bridge·0.28.x)** | **shipped** — 0.28.1 release close complete |
| **Open blocking** | **없음** |
| **다음 제품 기능 MAJOR** | 없음 (오너 지시 전 대기) |
| **다음 실행 게이트 (HANDOFF)** | **Phase D** — session continuity bounded automation (lint/status fail-loud · path equivalence) · **product behavior 무변경** |
| **문서** | 0.28 as-built 정렬 웨이브 (`DOC-REFRESH-PLAN.md`) |

---

## 2. 지금 할 일 (우선순위 표)

| 순위 | 테마 | 목표 | 검증 | 상태 |
|------|------|------|------|------|
| **P0** | **Session continuity Phase D** | ~~shared-heading lint · status fail-loud · SessionStart vs no-hook~~ **shipped 2026-07-23** | `handoff:lint` · checkpoint tests | **done** |
| **P0c** | **WP5-followup (defer)** | prefix normalize + SessionStart **hook-cache** fix (not warm-base re-fork) | `HOOK-CACHE-FIX-DESIGN.md` · HOOKCACHE-D-VERIFY | **owner track pick** — spike done/`defer` in `WARM-BASE-FORK-SPIKE.md` |
| **P0b** | **Docs as-built (본 웨이브)** | CHANGELOG·ARCH·USER·HERDR 배너·TEST·index가 0.28.1과 모순 없음 | 문서 DoD (`DOC-REFRESH-PLAN` §6) | **in progress / ship with wave** |
| **P1** | **UK-5..UK-9 관찰** | 후속 후보만 — 범위 확대 금지 | PLAN 메모 | nonblocking |
| **P1b** | **Integration-test flake track** | isolation recipe 유지 | owner pending | **owner** — 범위 확장 금지 |
| **P2** | **HOOKCACHE-D-VERIFY** | deferred | design doc | paused |
| **P2b** | **RULE-ENFORCEABILITY apply** | 코드 강제 여부 = 제품 결정 | `spikes/RULE-ENFORCEABILITY.md` | document only |
| **P3** | **멀티노드 단계 3** | Windows relay 복귀 · 노드 복제 · `@node` 등 | 아키텍처 권고 | 의도적 후순위 (MVP 종료 후 트랙) |

---

## 3. MVP 종료 (보존 — 2026-07-19 오너 재판정)

다음 항목은 **완료**로 간주한다. 재착수하지 않는다.

| 과거 순위 | 테마 | 완료 힌트 |
|-----------|------|-----------|
| P0 | 설치·실행 DX | 0.13+ `link:loom` / install |
| P1 | 신뢰 게이트 | R14 계열 |
| P2 | Relay 내구성 | 0.14 snapshot |
| P2.5–P2.7 | Purpose · work bus · launcher | 0.15–0.17 |
| — | Bridge 수직 슬라이스 | 0.22 |
| — | 운영 품질 · conv · hooks | 0.23–0.26 |
| — | result issuer · PANE-DEATH · p17 adapter | 0.27–0.28.1 |

상세 사용자 노트: [`CHANGELOG.md`](./CHANGELOG.md). 설계 SSOT: [PANE-DEATH unified](./spikes/PANE-DEATH-UNIFIED-DESIGN.md) · [HERDR-0.7.5-COMPAT](./spikes/HERDR-0.7.5-COMPAT.md).

---

## 4. Owner pending (진행을 막지 않음)

| Decision | Safe default |
|----------|----------------|
| Integration-test flake track | keep isolation recipe; do not expand scope |
| HOOKCACHE-D-VERIFY resume | remain paused through current harness wave |
| RULE-ENFORCEABILITY code apply | document only; no silent enforcement |

---

## 5. Don't redo (제품·게이트)

- Protocol research / COMPAT 전면 재매핑  
- herdr 0.7.4 다운그레이드 · dual session · config-only protocol 17  
- [`card.done`](./spikes/PANE-DEATH-UNIFIED-DESIGN.md) / pane exit를 완료 권위로 취급  
- [PANE-DEATH U1–U11](./spikes/PANE-DEATH-UNIFIED-DESIGN.md) · [adapter](./spikes/HERDR-0.7.5-COMPAT.md) through `6e2df8a` 재발명  
- Phase E / ROADMAP **before** Phase D lands  
- 이미 그린 live 3-kind / dogfood 전면 재실행 (신규 결함 없을 때)

---

## 6. 작업 라인 (기본)

| Choice | Orchestrator → implementation → verification |
|--------|-----------------------------------------------|
| **Default** | Codex → Grok → Codex verification |
| Claude line | Claude → Grok → Claude Advisor |
| Grok line | Grok → Grok → Claude + Codex verification (fallback: Grok verify) |

오너 override 즉시 적용. 없으면 Default 상속 (`HANDOFF.md`).

---

*이 파일이 HANDOFF와 충돌하면 **HANDOFF + `bun run status`가 이긴다.** 본문은 그 요약 레이어다.*
