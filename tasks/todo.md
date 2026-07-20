# Todo — Loom

## Next (0.26.0 ship)

1. [ ] **⭐ ship 커밋 (이번 세션)** — `build:cli` · 소스+문서 커밋 → dist 커밋 → push · PLAN Implemented sha 확정
2. [ ] (선택) 라이브 스모크 — `hookSensor: true` + 승인 대기 카드(U2 `--settings` 실작동 확정)
3. [ ] 잔존 Low들 — 상태줄 chrome · summary 타이밍줄 · orphan durable 룸 정리 등

## Done (recent)

- [x] R41 author-close → PLAN 0.26.0 approved
- [x] IMPL-0260 hooks 센서 구현 (워크트리 미커밋)
- [x] FIX-0260 소켓 path 길이 · 유닛 22/22
- [x] VERIFY-0260 codex pane 11/12 (D6(b) 정상 폴백 계측만 FAIL)
- [x] **FIX-0260b — D6(b) 해소** (grok pane `task_62b7d8c…` · 순수 함수 export + finishCard 단일 초크포인트 + Flight 3필드) · 유닛 33/33
- [x] suite-0260b 571/0 · 차집합 0 vs HEAD (R28 L-1 플레이크 미재현)
- [x] PLAN §0.26.0 `Implemented as of …` 블록 + HANDOFF · todo 동기
- [x] 노드 부팅 생존 상시화 트랙 종료
- [x] v0.25.0 conv_fetch R40 + D10 라이브 스모크

## FREEZE

신규 기능 = 팀 pull만. 시연은 제품 게이트 아님.

## Don't redo

- R41 / M-1·M-2 재론
- R28 L-1 suite fail 재조사 (HEAD 선재 · 차집합 0 확정)
- 부팅 생존 프로브 재실행
- R25 / CONV_SPEC 재론
