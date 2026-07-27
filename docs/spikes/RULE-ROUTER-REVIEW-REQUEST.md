# Review request — RULE-ROUTER propose **rev-13** (§5.3 문안 개정)

요청 2026-07-28 · 레인: 본세션(topology `single` · 저자) · **자기 종결 금지**
경로: **spike REVIEW** (D2 · 선례 `RULE-ROUTER-REVIEW.md` rev-4 · plan_review `R{n}` 아님)

---

## 0. 요청 한 줄

`docs/spikes/RULE-ROUTER-PROPOSE.md` **rev-13** 의 **§5.3 전면 재작성**을 spike REVIEW로 검토해
주세요. 승인 전 **Phase 3 착수 금지**(fail-closed).

---

## 1. 동결 대상

| 항목 | 좌표 |
|---|---|
| 문서 | `docs/spikes/RULE-ROUTER-PROPOSE.md` **rev-13** |
| 핵심 절 | **§5.3** (5.3.1–5.3.6) · §7 Phase 3 선결 문단 · Changelog rev-13 |
| 입력 정본 | `RULE-ROUTER-F1E-RESULT.md` **§8** · `RULE-ROUTER-F1D-RESULT.md` §3 · F1/F1B 결과 |
| 선행 리뷰 | `RULE-ROUTER-REVIEW.md` (rev-4 대상 · 조건 0 fold-in 완료) |

동결 절차: 리뷰 착수 전 `git rev-parse HEAD` + 해당 파일 blob을 리뷰 헤더에 박을 것
(선례 `RULE-ROUTER-REVIEW.md` §1).

---

## 2. 왜 리뷰가 필요한가

- 이 개정은 **용도 서술 축소/정정 블록 추가가 아니라** §5.3 **정본 문안 교체**다.
- Phase 3(JIT 실주입) 선결이 이 문안에 묶여 있다 — 자기 종결 시 P-A를 리뷰가 재생산한다
  (rev-4 조건 0과 같은 논리).
- 제품 PLAN/`plan_review` R{n} 대상이 아님(D2). 하네스 규범 spike 경로.

---

## 3. 리뷰어가 답할 질문 (닫힌 질문)

1. **§5.3.3 한 줄** (“경쟁하지 않는 한 따라진다”)이 F1b→F1d→F1e 데이터로 **지탱되는가**?
   과잉 일반화(무조건 준수율·다중 규범)가 문안에 스며 있지 않은가?
2. **§5.3.4 충돌 탐지·회피**가 “모델은 사용자를 택한다” 관측에서 **정당한 설계 의무**로
   읽히는가? 우선순위 *뒤집기* 처방이나 사용자 지시 재작성이 암시되지 않는가?
3. **§5.3.5 자유 변수** — 출처(U2 미판정) 비처방 · 10/10 인용 금지가 F1E §8 “들어가면 안 되는
   것”과 정합한가? 빠진 금지 항목이 있는가?
4. **C1–C3 + “직접 처방 아님”**이 원문/rev-10 오류를 흡수했는가? “호출 직전 = 그 호출 교정”
   잔존 문구가 문서 다른 곳에 남아 있지 않은가?
5. **Phase 3 선결**이 “rev-13 승인”으로 올바르게 전진했는가? 이 요청 문서나 rev-13이
   Phase 3 착수 권한으로 **오독될 여지**가 있는가?
6. **후보 A 채택·Phase 1–2·D1–D9**를 건드린 문장이 있는가? (있으면 binding finding)

---

## 4. 리뷰 산출물

| 산출 | 형식 |
|---|---|
| Verdict | `approve` / `approve — binding 조건부` / `pending-revision` |
| 문서 | 신규 `docs/spikes/RULE-ROUTER-REVIEW-rev-13.md` **또는**
  기존 `RULE-ROUTER-REVIEW.md`에 rev-13 섹션 append (저자 선호: **신규 파일**) |
| Advisor | Claude 리뷰 레인이면 **`fable-advisor` consult 필수** (`Advisor: … consulted: yes`) |
| 조건부 시 | 축자 delta를 사전 승인 문안으로 박아 **docs-only fold-in = 재리뷰 불요** 여부 명시
  (rev-4 조건 0 선례) |

---

## 5. Must not (리뷰·저자 공통)

- 봉인된 F1b/F1c/F1d/F1e 값·셀·문안 변경
- U2 미판정을 처방으로 승격
- 10/10을 무조건 준수율로 인용
- holdout 개봉 · 봉인 PREREG 값 변경
- Phase 3 구현 착수(승인 전)
- plan_review R{n}으로 경로 승격(D2 변경은 오너 결정)

---

## 6. 저자 체크리스트 (요청 전)

- [x] §5.3 재작성 (5.3.1–5.3.6)
- [x] §7 Phase 3 선결 문단 갱신
- [x] Changelog rev-13
- [x] 헤더 `pending-review`
- [x] F1E §8 들어갈 것 / 안 될 것 교차
- [ ] `bun run handoff:check` (HANDOFF 갱신 후)
- [ ] ship 커밋 (이 요청 + rev-13)

[RULE-ROUTER-REVIEW-REQUEST rev-13] target=PROPOSE-rev-13 focus=§5.3 path=spike-REVIEW phase3=blocked-until-approve
