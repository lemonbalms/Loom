# Todo — Loom

## 잔여 작업 로드맵 (2026-07-21, v0.27.0 revision A 설계 승인 후)

> 이 섹션은 요약 뷰다. SSOT는 `HANDOFF.md` — 표현이 어긋나면 핸드오프가 우선한다.

**로드맵 골격 완료**: MVP 종료(오너 2026-07-19) → 프로덕션 전환 · 멀티노드 단계 3 전 단계 완주(⓪~④·ⓐ·ⓑ·부팅 생존 상시화) · v0.26.0 hooks 센서 + v0.26.1 마커 교정 shipped(신 마커 SMOKE-SONNET26 라이브 실증 완료).

0. **PANE-DEATH authority cut 구현** — PLAN v0.27.0 revision A `approved` (R43b author-close)
   - [x] 새 설계 워크트리/브랜치 생성
   - [x] R43 결합 설계 폐기 → authority cut 정본 작성
   - [x] R43b + fable-advisor 자문, 조건 3건 반영 후 author-close approved
   - [x] 설계 문서 검증(status/handoff lint/diff-check green); 전체 suite 베이스라인 WebSocket race는 HANDOFF 기록
   - [x] **G0** TEST-BASELINE PATCH: 실제 원인은 server-ready race가 아니라 ambient
     `LOOM_RELAY_TOKEN`(무토큰 client에 401)·`LOOM_PROFILE`(inject socket 경로 불일치) 누수와
     테스트의 subscription/ACK/scrape-fixture 준비 전 이벤트 발행이었다. 공용 preload 환경 격리와
     test harness readiness wait만 수정, production 변경 0.
   - [x] **G0 완료 증거**: relay 대표 1/1 · relay server/auth 17/17 · 관련 host 181/181 ·
     전체 `bun test` 670/670 3회 연속 green (280.28s · 280.41s · 280.19s)
   - [x] **G1** repo producer/consumer scan 기록 + 외부 consumer rolling-upgrade gate 확인:
     production producer 1(`bridge-runtime.sendResult`) · board mutation consumer 1
     (`apply_card_result`→`applyCardResult`) · tracked structured claim consumer 21/21 · repo body-only
     자동 board consumer 0. 외부 목록은 배포 전 운영자 확인, 존재 시 선이행 또는 배포 중단.
   - [x] **G2** 설계 §8 tests-only 추가 → production 무변경 expected-red 확인 → 독립 커밋
     `93f1db1` pushed
   - [x] **G3** `codex-impl` 구현: remote result→blocked, bridge proposal-only, dispatch issuer,
     card auto-close 0. 관련 29/29 + 37/37 + 94/94 · typecheck 6/6 green
   - [ ] **G4** 검증은 완료: 전체 674/674 · dist guard · source/dist version 0.27.0 green.
     자동 승인 서비스 사용량 한도로 source/docs/dist commit·push와 Loom `[VERIFY]`만 대기
1. **핸드오프 전환 비용 최적화** (2026-07-20 착수, 3-레인 수렴·R{n} 불요 만장일치)
   - [x] ~~WP1 HANDOFF 다이어트 `0c82108` (상단 26KB→7.6KB·완결 8블록 ARCHIVE 이관·정보손실 0)~~
   - [x] ~~WP2+WP3 SessionStart hook 2분할 `41b0877` (matcher `startup|clear`·state+lessons 각 ≤9,500 하드캡·fail-open·timeout 30s → 리추얼 3왕복→0 · `handoff:lint` >8,192B 경고 · AGENTS 센티널 분기)~~
   - [x] ~~WP4 claude-mem 주입 하향 (OBSERVATIONS 50→20·SESSION_COUNT 10→5, 백업 `settings.json.pre-ho`=롤백 복사 1줄, 전 프로젝트 공용)~~
   - [ ] **WP5 웜베이스 포크 스파이크 + hook 발효 실측** (새 세션 착수 — 미지수 5건·Go/No-Go 정량 기준). `docs/spikes/WARM-BASE-FORK-SPIKE.md`(HOOKS-SENSOR-SPIKE 형식) → Go 충족 시만 절차화(bake 스크립트+AGENTS 분기). 효과 실측(자동 주입 절반↓·리추얼 3왕복→0)은 새 세션 기동이 곧 hook 발효 실증 겸행.
2. **다음 MINOR 후보 — 역할·권한·프로필 통합** (v0.27.0 G4 이후, 아직 PLAN 아님)
   - [x] 후보 설계 `docs/spikes/ROLE-PERMISSION-PROFILE-UNIFICATION.md`
   - [ ] P0: MCP env 상속·Claude/Grok permission 표면·display rename 영향·동시 profile 실측
   - [ ] P0 증거 뒤 PLAN 승격 + R{n}; 구현 전 tests-only red commit
   - [ ] canonical `<agent>-<role>` + `codex-arch` + neutral MCP + role guard 구현
   - **동결:** 현재 v0.27 G0~G4에 섞지 않는다. 저널·supervision은 out of scope 유지.
3. [ ] **R{n} 게이트 걸린 기능 유예 (유일)** — 브릿지 자동 git push(R26:431 유예). 착수 시 R{n} 재리뷰 필수.
4. [ ] **검증 유예 1건** — `agent_blocked` 1:1 교정 라이브 실증. 유닛 33/33 커버, 카드 경유 미실증. SMOKE-SONNET26(신 마커 sonnet 무거부 1회 실증)으로 재시도 여건 개선.
5. **잔존 Low 백로그 (결함 아님/무해 확정)**
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
6. **오너 결정 대기** — npm publish 보류. 재개 시 계정+패키지명(`loom-terminal` vs `@lemonbalms/loom`) 선택 → login→meta→publish. 재조사 금지.
7. [ ] **부수 정리 (선택)** — 루트 `.loom-*` untracked 브리프/디스패치 스크립트 ~60개 정리.

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
