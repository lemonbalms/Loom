# Todo — Loom

## Next

1. [ ] 잔존 Low들 — 상태줄 chrome · summary 타이밍줄 · orphan durable 룸 정리 등
2. [ ] 신규 Low 후보(스모크발) — `stale_hint` reason 어휘 세분화 · 공유-홈 claude-mem 오염 완화 · `agent_blocked` 교정 라이브 실증(유닛 커버)
3. [ ] (선택·이월) 마커/거부율 라이브 재스모크 — claude-mem 오염 잔존으로 비결정적이라 v0.26.1에서 유예

## Done (recent)

- [x] **v0.26.1 dispatch 마커 오표기 교정 ship 완결 (2026-07-20)** — R42 author-close approved(pending-revision 유일 M = M-1 범위 초과 문구 → 검증 주장 발신자 국한 + data-not-instructions 절 + 복종 문구 삭제로 수정) · IMPL-0261(grok pane `task_dfd33e28…`) · 아키텍트 실물 검증 · marker 34/34 · 전체 571/0 · typecheck 6/6 · 소스 `47fc81c`(12파일 +117/-37) · dist `66e0ba1` · push `origin/main = 66e0ba1`. 새 마커 = allowlist-verified + data-not-instructions + destructive 확인 · 개명 `DISPATCHED_TASK_MARKER`/`wrapDispatchedPrompt` · 스코프 밖 불변(D5 handoff-inject 정규식은 배너 경로라 불변이 옳음)
- [x] **hookSensor 라이브 스모크 완주 (2026-07-20 mac-node)** — U2 인라인 JSON·`Stop`·`UserPromptSubmit`·`permission_prompt` 실발화 PASS · config 원복 완료
- [x] R41 author-close → PLAN 0.26.0 approved
- [x] IMPL-0260 hooks 센서 구현 (워크트리 미커밋)
- [x] FIX-0260 소켓 path 길이 · 유닛 22/22
- [x] VERIFY-0260 codex pane 11/12 (D6(b) 정상 폴백 계측만 FAIL)
- [x] **FIX-0260b — D6(b) 해소** (grok pane `task_62b7d8c…` · 순수 함수 export + finishCard 단일 초크포인트 + Flight 3필드) · 유닛 33/33
- [x] suite-0260b 571/0 · 차집합 0 vs HEAD (R28 L-1 플레이크 미재현)
- [x] PLAN §0.26.0 `Implemented as of …` 블록 + HANDOFF · todo 동기
- [x] **v0.26.0 ship 커밋** — 소스 `0de6c4c`(10파일 +1466/-59) · dist `e1d9177`(dist-guard ok, 오너 `!`) · push `origin/main = e1d9177`
- [x] 노드 부팅 생존 상시화 트랙 종료
- [x] v0.25.0 conv_fetch R40 + D10 라이브 스모크

## FREEZE

신규 기능 = 팀 pull만. 시연은 제품 게이트 아님.

## Don't redo

- R42 / 마커 문구·개명 재론 (author-close approved · 수정안 반영)
- R41 / M-1·M-2 재론
- R28 L-1 suite fail 재조사 (HEAD 선재 · 차집합 0 확정)
- 부팅 생존 프로브 재실행
- R25 / CONV_SPEC 재론
