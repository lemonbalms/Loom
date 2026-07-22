# Todo — Loom

## Current override — PANE-DEATH v0.28.0 implementation wave

> SSOT는 `HANDOFF.md`. SESSION-CONTINUITY Phase B/C는 ship 완료. 다음 제품 게이트는
> **후속 호환 PATCH — herdr 0.7.5/protocol 17 adapter**. PANE-DEATH PATCH 1–5는 v0.28.0 `d49a6b1`로 종결.

0. [x] **Phase B:** fixture V1~V6 + SOFT_CAP stale 단위 테스트 해소 + HANDOFF lint expected-red 고정 + state HARD_CAP 검증 (`e281587`)
1. [x] **Phase C:** archive 수납처·nine-section HANDOFF·shared headings·entry/session-context 동기화 → `handoff:lint` green (lower-tier in-harness fallback)
2. [x] **새 세션 복원 스모크:** PLAN·next gate·traps·Owner pending·Don't redo 복원 확인 (`[RESTORE-SMOKE] verdict=pass`)
3. [x] **Phase C ship:** `8a3ddba` on `origin/main` (`feat(handoff): ship session continuity Phase C`)
4. [x] **PANE-DEATH PATCH 1 (M1) tests-only expected-red:** `24ceede` on `origin/main` (`test(host): lock PANE-DEATH PATCH 1 expected-red`) — production 0줄 · U1·U2·U3·U4·U7 계약
5. [x] **PANE-DEATH PATCH 2 (M2) tower A2 fence:** `0b335a1` — `card-ops.ts` remote done→blocked + reason · MCP/HERDR_DESIGN/DISPATCH-DEMO 공개 계약 · 선행 red `24ceede` · 집중 3/3 · host/MCP typecheck green
6. [x] **PANE-DEATH PATCH 3 (M3):** `c475604` — bridge proposal API · card auto-done/auto-close 0 · 비수락 ACK 단일 quarantine · replay-preserving fold · live/offline ack CLI · `classifyAck` · map-miss 관측; Grok 4.5 구현 + Codex 독립 검증
7. [x] **PANE-DEATH PATCH 4 (M4):** `f9b0230` — tests-only 재기술 10파일(+923/−227) · §4.3/브랜치 순이득 감사 · production 0줄 · focused 165/1(known) · typecheck 6/6 · full 738/5 전량 분류
8. [x] **PANE-DEATH PATCH 5 (M5):** `d49a6b1` — CLI/MCP 0.28.0 · `preservedCardPanes` 관측 · dist 재번들 · typecheck/dist green · full 741/4 전량 분류
9. [ ] **Phase D 유예 해제:** PATCH 4→5 두 전환 green — adapter 뒤 lint/status 자동화 재검토
10. [ ] **⭐ 후속 호환 PATCH — herdr 0.7.5/protocol 17 adapter:** 정본 `docs/spikes/HERDR-0.7.5-COMPAT.md` §6. dogfood fail-closed until ship.

## 잔여 작업 로드맵 (2026-07-20, v0.26.1 ship 후)

> 이 섹션은 요약 뷰다. SSOT는 `HANDOFF.md` — 표현이 어긋나면 핸드오프가 우선한다.

**로드맵 골격 완료**: MVP 종료(오너 2026-07-19) → 프로덕션 전환 · 멀티노드 단계 3 전 단계 완주(⓪~④·ⓐ·ⓑ·부팅 생존 상시화) · v0.26.0 hooks 센서 + v0.26.1 마커 교정 shipped(신 마커 SMOKE-SONNET26 라이브 실증 완료).

0. **핸드오프 전환 비용 최적화** (2026-07-20 착수, 3-레인 수렴·R{n} 불요 만장일치)
   - [x] ~~WP1 HANDOFF 다이어트 `0c82108` (상단 26KB→7.6KB·완결 8블록 ARCHIVE 이관·정보손실 0)~~
   - [x] ~~WP2+WP3 SessionStart hook 2분할 `41b0877` (matcher `startup|clear`·state+lessons 각 ≤9,500 하드캡·fail-open·timeout 30s → 리추얼 3왕복→0 · `handoff:lint` >8,192B 경고 · AGENTS 센티널 분기)~~
   - [x] ~~WP4 claude-mem 주입 하향 (OBSERVATIONS 50→20·SESSION_COUNT 10→5, 백업 `settings.json.pre-ho`=롤백 복사 1줄, 전 프로젝트 공용)~~
   - [ ] **WP5 웜베이스 포크 스파이크 + hook 발효 실측** (새 세션 착수 — 미지수 5건·Go/No-Go 정량 기준). `docs/spikes/WARM-BASE-FORK-SPIKE.md`(HOOKS-SENSOR-SPIKE 형식) → Go 충족 시만 절차화(bake 스크립트+AGENTS 분기). 효과 실측(자동 주입 절반↓·리추얼 3왕복→0)은 새 세션 기동이 곧 hook 발효 실증 겸행.
1. **다음 대형 트랙 — 미정 (오너 결정 지점)** — 멀티노드 단계 3이 마지막 확정 트랙. 저널·supervision은 현재 out of scope 유지.
2. [ ] **R{n} 게이트 걸린 기능 유예 (유일)** — 브릿지 자동 git push(R26:431 유예). 착수 시 R{n} 재리뷰 필수.
3. [ ] **검증 유예 1건** — `agent_blocked` 1:1 교정 라이브 실증. 유닛 33/33 커버, 카드 경유 미실증. SMOKE-SONNET26(신 마커 sonnet 무거부 1회 실증)으로 재시도 여건 개선.
4. **잔존 Low 백로그 (결함 아님/무해 확정)**
   - [ ] summary 정보성 타이밍줄("Worked for Ns.") 개선
   - [ ] orphan durable 룸 정리 (ops)
   - [ ] 동시 디스패치 풀 탭 레이스 (무해 확정)
   - [ ] `stale_hint` reason 어휘 세분화
   - [ ] sleep형 still-running 상한 소진 시 pane 수동 정리
   - [ ] 공유-홈 claude-mem 오염 완화 (스모크 운영성)
   - [ ] conv 턴 조기 회신(~7–10s) 관찰 지속
   - [ ] 경쟁 분석발 A: `scripts/pane-inject.sh` read-guard 원자화 (R-gate 불요)
   - [ ] WSL non-root 전환 (선택)
   - [ ] R28 L-1 conv 테스트 타이밍 플레이크 (최근 런 미재현)
5. **오너 결정 대기** — npm publish 보류. 재개 시 계정+패키지명(`loom-terminal` vs `@lemonbalms/loom`) 선택 → login→meta→publish. 재조사 금지.
6. [ ] **부수 정리 (선택)** — 루트 `.loom-*` untracked 브리프/디스패치 스크립트 ~60개 정리.

## Done (recent)

- [x] **Dogfood PTY 분리 (2026-07-22)** — 아키텍트 direct Codex(`dogfood:architect`) · Grok worker `dispatch_card→mac-node→herdr pane` · room/allowlist bridge preflight · `loom run` TUI 화면 겹침 경로 제거
- [x] **Codex architect → Grok implementer dogfood 레인 정식화 (2026-07-22)** — `codex-arch` 피어·6프로필 launcher/status · `impl`→`grok-impl` 정규화 · 역할별 boot prompt · stale saved invite 자동 복구(`No room for code` 한정) · DOGFOOD/AGENTS/TEST_PLAN/HANDOFF 동기화
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
