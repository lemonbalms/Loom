# PANE-DEATH R43e 검증 원장 (PLAN v0.27.0 — approve 종결)

R43e는 **v0.27.0 게이트의 종결 라운드**다. R43d reject 잔여 3건의 **4차 반영(문면 정정)**을 검증하고
approve로 닫아 v0.27.0을 `approved`로 전이시킨다. 레인 = **단일 레인**(로컬 `codex-cli`,
`codex exec` read-only 샌드박스, reasoning=high) — **경량 델타 검증**. 사유: 4차 반영이 전원 문면
전파·순서 확정·판별 유니언 정정이고 설계 재론이 0이었으므로, 그 문면이 R43d 원장의 지적을 정확히
닫았는지만 확인하면 되는 델타 검증이다.

- **1차 실행:** 대상 커밋 `65b3fb3`(4차 반영 델타 `e329031..65b3fb3`) — verdict **`pending-revision`**.
  H-new-1·M-new-1·L-new-1 **전부 resolved**이나 4차 반영이 스스로 만든 **신규 Low 1건**(D8 라운드
  북키핑 불일치 — `docs/PLAN.md:97,139`)이 잡혔다.
- **Low 정정:** 커밋 `cabcb48` — D8 행이 ①–⑦을 "R43d까지 확인 완료 이력(재검증 불요)"으로,
  R43e 범위를 "⑧뿐"으로 한정하고, Status(`:7`)·Review impact(`:139`)를 "R43e 필수"로 동기
  ("R43d 필수" 전역 0건).
- **마이크로 재확인:** 대상 커밋 `cabcb48` — verdict **`approve`**. Low(D8 북키핑) resolved,
  잔여 설계 모순 0. **v0.27.0 게이트 통과.**

좌표의 `:N`은 별도 표기가 없으면 `docs/spikes/PANE-DEATH-DESIGN.md`의 행 번호다. PLAN 좌표는
`docs/PLAN.md:N`으로 명시한다.

> **본 원장은 R43e 단일 레인 산출물(1차 pending-revision + 마이크로 재확인 approve)의 기록이며,
> 기존 리뷰 원장 7본**
> (`PANEDEATH-CODEX-REVIEW*.md`·`PANEDEATH-R43.md`·`PANEDEATH-R43B.md`·`PANEDEATH-R43C.md`·`PANEDEATH-R43D.md`)**은
> 수정하지 않는다.** 아키텍트 판정(§1)은 확정이다. **정본·수정 금지.**

## 1. Verdict

**codex 레인 최종 verdict: `approve`** (마이크로 재확인, 대상 커밋 `cabcb48`). 1차(`65b3fb3`)는
**`pending-revision`** — R43d 잔여 3건은 전부 resolved였고 유일한 보류 사유는 4차 반영이 파생시킨
**Low 1건(D8 라운드 북키핑)**이었다. 그 Low를 `cabcb48`로 축자 정정한 뒤 재확인에서 approve.

**아키텍트 판정(확정):**
- **R43d 잔여 3건(H-new-1·M-new-1·L-new-1) resolved 수용.** codex가 재실측한 좌표로 4차 반영의
  문면이 §6.7.2 시대 매개변수화·§6.7.1 supersede 순서·§6.7.1 판별 유니언과 정합함을 확인했다.
- **1차 신규 Low(D8 북키핑) 축자 반영.** codex 지적 그대로 ①–⑦=R43d까지 확인 완료 이력·R43e
  범위=⑧ 한정으로 재라벨하고 Review impact·Status를 "R43e 필수"로 동기했다(정정 커밋 `cabcb48`).
  Status 헤더 본문의 세 번째 "R43d 필수" 잔재도 같은 load-bearing forward 문구라 함께 정정해
  "R43d 필수" 전역 0건을 달성했다(아키텍트 스코핑).
- **§10 phase registry·lifecycle generation 무태그 유지는 아키텍트 스코핑 승인.** 이 두 항목은
  (C) 본체 소관이나 R43d가 지목한 시대 태그 좌표(`:1581-1585`) 밖이고, §10 헤더 스코핑 註가
  산문으로 이미 포괄한다. 인라인 `[(C) 본체]` 토큰을 추가하면 R43d 지목 범위를 넘는 스코프
  크리프이므로 무태그를 유지한다(R43e 브리프에 근거 명기).

**결론:** v0.27.0 = **`approved`**. 5라운드(R43→R43b→R43c→R43d→R43e) 수렴 종결. 코드 무변경
(문서만 변경). 다음 = **구현 웨이브**(구현=grok 레인 · board claim §1.1 선행 · 불변식 유지).

## 2. 레인 실측 (codex 단일 레인)

- **CLI:** `codex-cli` 0.144.6 · 모델 `gpt-5.6-sol` · reasoning=high · **read-only 샌드박스** ·
  래퍼 = in-harness Claude(opus) 서브에이전트.
- **모델 성립 경위(명기):** 1차 실행에서 `-m gpt-5.6-codex` 오버라이드를 시도했으나 ChatGPT 계정
  경로에서 **400 에러**가 반환됐다. 오버라이드를 제거하고 **기본 config**(`gpt-5.6-sol` · high)로
  실행해 성립했다. 따라서 R43e 두 실행 모두 `gpt-5.6-sol`·high·read-only 기준이다.
- **테스트·라이브 프로브 미실행**(경량 델타 — 대상 커밋은 문서만 변경). 정적 문면 대조로 판정.

## 3. R43d 잔여 3건 해소 확인 (codex 재실측 좌표)

| 지적 | 결과 | 좌표·근거 (codex 재실측) |
|---|---|---|
| **H-new-1** 시대 태그 전파 | **resolved** | PLAN D6/D8(`docs/PLAN.md:95,97`) · 결정 1·2(`DESIGN:959-964,1008-1014`) · §7.1 항목 5/6a/12(`:1067-1071,1081-1083,1094-1096`) · Smoke 1(`:1147-1152`) · §10(`:1622-1627`)이 §6.7.2(`:799-840`)와 **동형으로 두 시대를 구분**한다 |
| **M-new-1** supersede↔자동 해제(c) 순서 | **resolved** | supersede 선행 → presence 즉시 fold → accepted 시 seq fold → 실패 시 seq만 잔존 순서가 **확정**(`DESIGN:745-754`) · 기존 (c)·락 8·13(`:731-743,1442-1449,1608-1613,1672-1675`)과 **충돌 없음** |
| **L-new-1** quarantine 메타데이터 판별 유니언 | **resolved** | PLAN 판별 유니언이 `send_unknown=seq 필수` · `presence_unknown="presence"`·seq 없음으로 정정(`docs/PLAN.md:111`) → §6.7.1·U2(`DESIGN:699-709` · `PLAN:135`)와 정합 |

**1차 신규 지적 (Low · D8 북키핑, `cabcb48`로 해소):** D8이 R43e를 경량 델타라 하면서 누적 ①–⑦까지
"R43e 최소 확인"으로 재지정했고 Review impact가 여전히 "R43d 필수"로 남았다(`docs/PLAN.md:97,139`).
→ ①–⑦=R43d까지 완료 이력 표시 · R43e 범위=⑧ 한정 · `:139`(+ Status `:7`)를 "R43e 필수"로 갱신.
**마이크로 재확인에서 resolved 확인.**

## 4. 부록 A — codex 레인 [R-RESULT] 축자 전재 (2본)

세션 스크래치패드(영속 저장소 아님, 이 원장으로 영속화):
`…/scratchpad/R43e-codex-out.txt`(1차)·`…/scratchpad/R43e-micro-out.txt`(재확인). 각 파일의 최종
`[R-RESULT]` 블록을 아래에 축자 전재한다.

### A-1. 1차 (대상 `65b3fb3`) — verdict: pending-revision

```
[R-RESULT] R43e — verdict: pending-revision
- H-new-1: resolved — PLAN D6/D8(`docs/PLAN.md:95,97`), 결정 1·2(`DESIGN:959-964,1008-1014`), §7.1 5/6a/12(`:1067-1071,1081-1083,1094-1096`), Smoke 1(`:1147-1152`), §10(`:1622-1627`)이 §6.7.2(`:799-840`)와 동형으로 두 시대를 구분한다.
- M-new-1: resolved — supersede 선행→presence 즉시 fold→accepted 시 seq fold→실패 시 seq만 잔존 순서가 확정됐고(`DESIGN:745-754`), 기존 (c)·락 8·13(`:731-743,1442-1449,1608-1613,1672-1675`)과 충돌하지 않는다.
- L-new-1: resolved — PLAN 판별 유니언이 `send_unknown=seq 필수`, `presence_unknown="presence"`·seq 없음으로 정정되어(`docs/PLAN.md:111`) §6.7.1·U2(`DESIGN:699-709`; `PLAN:135`)와 정합한다.
- 신규 지적: Low · `docs/PLAN.md:97,139` · D8은 R43e를 경량 델타라고 하면서 누적 ①–⑦까지 "R43e 최소 확인"으로 재지정했고, Review impact는 여전히 "R43d 필수"로 남았다. ①–⑦은 R43d까지의 완료 이력으로 표시하고 R43e 범위를 ⑧로 한정하며 `:139`를 R43e로 갱신해야 한다.
- 판정 근거 요약: 잔여 3건의 실질 문면은 모두 정확히 닫혔다.
- 새 설계 모순은 없으나 R43e 범위·라운드 북키핑에 Low 불일치가 남아 approve는 보류한다.
```

### A-2. 마이크로 재확인 (대상 `cabcb48`) — verdict: approve

```
[R-RESULT] R43e(최종) — verdict: approve
- Low(D8 북키핑): resolved — 근거(`docs/PLAN.md:97`, `:139`)
- 근거: D8은 ①–⑦을 "R43d까지 확인 완료 이력"으로, R43e 최소 범위를 "⑧뿐"으로 명시한다(`:97`).
- 근거: Status·Review impact가 "R43e 필수"로 갱신됐고(`:7`, `:139`), "R43d 필수"는 전역 0건이다.
```

---

**정본·수정 금지.**
