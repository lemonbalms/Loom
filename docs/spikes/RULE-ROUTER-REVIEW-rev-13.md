# Review — RULE-ROUTER propose **rev-13** (§5.3 문안 개정)

리뷰 2026-07-28 · 레인: 본세션(topology `single`) 리뷰어  
저자 = 직전 웨이브(commit `15fa73f`) · **레인 분리: 리뷰는 별 커밋·별 산출**  
대상(동결): `docs/spikes/RULE-ROUTER-PROPOSE.md` **rev-13**  
· HEAD `15fa73f718c1b6ff3d944ccfdab3cb76dbc17582`  
· blob PROPOSE `c99134602e3801e906524853660ed7973ac1fd79`  
· request blob `d01bbf5fd8bb220f585c5b837fcea8ed28f88465`  
· 728줄  
Advisor: **fable-advisor consulted: yes** (claude CLI · model fable · read-only · 2026-07-28)

---

## 0. Verdict

**approve — binding 조건부 (조건 0 1건).**

> **조건 0 · docs-only fold-in.** §4의 축자 delta를 propose §5.3.4에 반영한 뒤  
> 헤더 상태를 `approved`(§5.3 개정분)로 올린다. 문안이 사전 승인된 좌표만 바꾸므로  
> **재리뷰 불요**(rev-4 조건 0 선례). Phase 3 구현 착수는 **별도 게이트**.

§5.3 정본 재작성의 방향(전달 계약 · 준수 한 줄 · 충돌 회피 · 출처 비처방 · Phase 3 비권한)은  
F1E-RESULT §8과 정합한다. 후보 A 채택·Phase 1–2·D1–D9는 불변.

---

## 1. 리뷰 절차 기록

- 동결 좌표: HEAD `15fa73f` · PROPOSE blob `c9913460…` · REQUEST `d01bbf5…` — 리뷰 착수 시 일치.
- 정독: PROPOSE §5.3.1–5.3.6 · §7 Phase 3 선결 · Changelog rev-13 · F1E §0/§2/§7/§8 · F1D §3 ·  
  REVIEW-REQUEST §3 Q1–Q6 · 선행 `RULE-ROUTER-REVIEW.md` §0 형식.
- residual grep: `직접 처방`/`호출 직전` 잔존은 (a) 흡수 고지 (b) §5.3.1 부정문  
  (c) P3 표 “도구 호출 직전”=**훅 발화 시점**(모델 가시=C1과 별개) — 위험 잔존 처방 문장 없음.
- 자문: fable-advisor — verdict lean **approve-conditional** · binding 1건(§4와 동일 취지).

---

## 2. 요청서 §3 여섯 질문

### Q1 · §5.3.3 한 줄 지탱 — **예 (과잉 일반화 봉인됨)**

한 줄은 F1E §8 “들어갈 수 있는 것”과 **축자 정합**. 표가 0/21 → 4/12 → 10/10과  
충돌 축을 나란히 보여 단독 10/10 과독을 막는다. §5.3.5가 저비용·무충돌·단일 규범 ·  
다중 규범 미측정을 즉시 봉인. **합격.**

### Q2 · §5.3.4 충돌 탐지·회피 — **예 · 단 예시 괄호 binding 결함**

“모델은 사용자를 택한다 → 우선순위 뒤집기 금지 · 탐지·회피”는 F1d 6/8 · F1E §8과 정합.  
우선순위 뒤집기·사용자 지시 재작성 암시 **없음**.  
그러나 예시 괄호 **“pin/전량 또는 미주입”**이 회피의 예로 읽히면 **전량이 충돌 유닛까지  
실어 회피가 아니다**(F1b/F1c가 그 조건). → **조건 0 fold-in**.

### Q3 · §5.3.5 ↔ F1E §8 금지 — **예**

출처 비처방(U2) · 10/10 무조건 인용 금지 · Phase 3 착수 권한 부정(§7·헤더·Changelog) 정합.  
빠진 binding 금지 항목 없음. Low: §5.3.3 준수 카나리아 불릿에 “(착수 권한 아님)” 6어 부기 가능  
— author-close 선택.

### Q4 · C1–C3 · 직접 처방 흡수 — **예**

§5.3.1–2가 용도를 “다음 턴 규범을 싸게 얹는 경로”로 고정하고 직접 처방을 명시 부정.  
P3 표 “호출 직전”은 캐시 결정 시점 라벨이며 C1과 충돌하지 않음(가시 ≠ 발화).  
**합격.**

### Q5 · Phase 3 선결 전진 — **예 · 오독 위험 낮음**

선결 = “rev-13 spike REVIEW 승인”으로 올바름. rev-13 자체 비권한 문구가 헤더·§7·Changelog에  
중복. 승인 후에도 Phase 3 **착수**는 별 게이트 — 이 리뷰는 문안만 연다.

### Q6 · A / Phase 1–2 / D1–D9 재개 — **아니오**

§5.3 머리 고지 “후보 A 채택·Phase 1–2 결과 불변”. 설계·게이트 숫자 변경 없음.

---

## 3. Findings

| Sev | ID | Finding | Outcome |
|---|---|---|---|
| **Med binding** | **M-1** | §5.3.4 “pin/전량 또는 미주입”이 충돌 **회피** 예시로 오독 가능 — 전량은 충돌 유닛 포함 주입 | **조건 0 축자 fold-in** (§4) |
| Low | L-1 | §5.3.3 준수 카나리아 불릿에 착수 비권한 6어 부기 | author-close 선택 |
| Low | L-2 | P3 표 “호출 직전”에 C1 교차 참조 가능 | 불요(§5.3.2가 정본) |

**High 없음.**

---

## 4. 조건 0 · 사전 승인 축자 delta (fold-in · 재리뷰 불요)

**위치:** `RULE-ROUTER-PROPOSE.md` §5.3.4 · “라우터 의무” 불릿 직후(또는 같은 불릿 확장).

**추가 문장 (축자):**

> pin/전량은 충돌 **회피가 아니라 라우터 재량 제거**다 — 충돌 유닛도 함께 주입되며, 그 경우  
> 우선순위는 관측된 대로 사용자에게 있고 라우터는 해당 surface의 준수를 주장하지 않는다.

(자문 확정 문안과 동일.)

---

## 5. Decision notes

- 경로 = **spike REVIEW**(D2). plan_review R{n} 승격 없음.
- 저자·리뷰 동일 호스트 연속 세션 리스크는 있으나 산출 분리·자문·동결 좌표·적대적 1건 발견으로  
  절차 최소 충족. 오너가 독립 재리뷰를 원하면 그때 claude-rev 재실행.
- 이 verdict는 **§5.3 문안**만 연다. Phase 3 구현 범위·surface 순서·충돌 탐지 알고리즘은  
  다음 게이트 몫.

---

## 6. Must not (이 리뷰 준수)

- 봉인 F1* / PREREG 값 변경 없음
- U2 처방 승격 없음
- 10/10 무조건 인용 없음
- Phase 3 코드 착수 없음

[RULE-ROUTER-REVIEW-rev-13] verdict=approve-conditional binding=M-1 fold-in=yes re-review=no phase3=still-separate-gate advisor=yes
