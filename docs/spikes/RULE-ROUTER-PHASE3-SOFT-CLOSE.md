# Phase 3 soft close — JIT opt-in freeze (3.0–3.2 live · further surfaces stopped)

작성 2026-07-28 · **rev-1** · 레인: 본세션(topology `single`)  
Authority: PHASE3-SPEC §2 · RESULT 3.0–3.4b · HANDOFF

> **제품 MINOR 아님.** PLAN 범위 변경 없음.  
> **default-on 아님·금지 유지.**  
> 봉인 PREREG(F1*/3.0–3.4b) **재측정 금지.**

---

## 0. 한 줄

Phase 3 soft JIT 웨이브를 **여기서 닫는다.**  
**live opt-in 유지:** delegation (3.0) · ship (3.1b) · dispatch (3.2).  
**live 차단·신규 미개방:** implementation (3.3) · platform (3.4/3.4b) · 3.5+ 기타.  
재개 = **오너 선포 + 새 SPEC+PREREG** 만.

---

## 1. 성적표 (역사 · 재측정 금지)

| Slice | Surface | Canary | Live |
|---|---|---|---|
| 3.0 | delegation | T1 PASS (계열) | **opt-in** `JIT=1` |
| 3.1 / 3.1b | ship | T1 PASS | **opt-in** + `PHASE3_1_SHIP_LIVE_AUTHORIZED` |
| 3.2 | dispatch | G0+T1a PASS | **opt-in** + `PHASE3_2_DISPATCH_LIVE_AUTHORIZED` |
| 3.3 | implementation | G0 PASS · T1 FAIL (secret-shaped / 거부) | **false** |
| 3.4 | platform | G0 PASS · T1 FAIL (COMPLY 3/5) | **false** |
| 3.4b | platform remount | G0 PASS · T1 FAIL (base ceiling 5/5) | **false** |

---

## 2. Soft-close 결정

| # | 결정 |
|---|---|
| C-1 | **3.0–3.2 soft live 유지** — unset=off · `JIT=1` opt-in · default-on **금지** |
| C-2 | **3.3 / 3.4 / 3.4b live 상수 false 고정** — T1(a) 없이 flip 금지 |
| C-3 | **3.5+ surface 미개방** — verification/review/gate는 prefix·리추얼 1차 (SPEC §2) |
| C-4 | **봉인 PREREG 재측정 금지** — 후속은 새 SPEC+PREREG+오너 선포 |
| C-5 | **제품 MINOR / default-on / pin 재설계** 이 문서에서 **열지 않음** |

---

## 3. 교훈 (다음 카나리아 설계 입력 · 지금 코드 변경 없음)

1. **COMPLY 표면이 시크릿/export 형태면** 모델 방어와 충돌 (3.3).  
2. **부분문자열 COMPLY**는 grep 가산으로 오염 (3.4) → strict exec 필요 (3.4b).  
3. **빈 probe**는 helper 미발견 · **repo cwd**는 package script로 base 천장 (3.4 vs 3.4b).  
4. soft JIT는 **전달 ≠ 준수 리프트** — live 승격은 T1(a) 리프트만.

---

## 4. 운영 상태 (코드 상수 · 2026-07-28)

| 상수 | 값 |
|---|---|
| `PHASE3_1_SHIP_LIVE_AUTHORIZED` | `true` |
| `PHASE3_2_DISPATCH_LIVE_AUTHORIZED` | `true` |
| `PHASE3_3_IMPLEMENTATION_LIVE_AUTHORIZED` | `false` |
| `PHASE3_4_PLATFORM_LIVE_AUTHORIZED` | `false` |
| `LOOM_RULE_ROUTER_JIT` unset | **off** |

---

## 5. Done-when (이 close 웨이브)

- [x] 본 문서 rev-1  
- [x] PHASE3-SPEC §2 표 close 주석  
- [x] HANDOFF / PRIORITIES / todo 정렬  
- [x] 재측정·default-on·silent MINOR 없음  

[RULE-ROUTER-PHASE3-SOFT-CLOSE rev-1] live=3.0-3.2_optin blocked=3.3-3.4b default_on=no remeasure=no
