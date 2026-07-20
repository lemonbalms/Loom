# 활성 함정 · 하지 말 것 (Loom)

> 이 파일의 두 섹션은 **세션 시작 시 자동 주입**된다(`scripts/session-context.ts` state 파트).
> 상세 서사·재현 경위는 `tasks/lessons.md` — 여기에는 재확인용 한 줄 요약만 둔다.
> 항목 추가 시 주입 예산을 확인하라: `bun run session-context:lint` (SOFT_CAP 초과 시 게이트가 막는다).

## 활성 함정 (상세 `tasks/lessons.md` — 재확인 금지)

- **dispatch wrap 마커** = `▶ Loom dispatched task — …`, 검증 주장은 **디스패처 발신자 국한**(R42) · M-1 allowlist엔 **전체 peer ID** · 디스패처 신원 `claude-impl`.
- `bun test`는 `env -u LOOM_RELAY_TOKEN -u LOOM_RELAY_URL bun test`로. 워커 스위트와 **동시 실행 금지**(기아로 위양성).
- **`card.done` ≠ 완료 · claim까지 해야 닫힌다.** 산출물은 **워킹트리 독립 검증**(회신 불신). 종료 코드로 실패 판정 금지. `PaneDied unknown pane`=herdr 내부 경고.
- **워커 감시 = `watch-card.ts`**(marker 0/pane-gone 1/limit 2/timeout 3) · `--pane` 필수 · 파이프 금지.
- **terminal 이벤트는 신규 구독자에 재전달**(백로그 ≥10분) · **봉투에 시각·seq·id 없음** → replay/live 구분 불가.
- **claude-mem 패치 비영속**(`autoUpdate` 원복) — 방어선 `check:mem-header`, 재적용 lessons platform.
- **pane 레인 4개 중 3개 사망**(장기 카드) — **in-harness 폴백 우선**(`DOGFOOD_LOOP §1.2`).
- **`fake-herdr.ts:565` status는 underscore만, 실서버는 dotted** — 픽스처 갭(제품은 양쪽 수용).

## 하지 말 것

- R25 결정·CONV_SPEC 재론(plan_review R24·R25 SSOT) · 마커 문구·개명 재론(R42 approved) · R41 M-1·M-2 재론
- M-lock 인접 PATCH를 리뷰 게이트 없이 착수 (R{n} 필요 여부 WORKFLOW §5.1 확인)
