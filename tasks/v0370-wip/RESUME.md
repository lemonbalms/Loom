# Loom v0.37.0 — 재개 메모 (2026-10-17 07:55 중지)

저장소 `~/projects/loom` main = `8140c97` (원격 미푸시 · origin/main = `acd53a0` v0.36.0). 작업 트리 깨끗.

## 끝난 것
- 게이트 `5860990` (PLAN §0.37.0 approved, R55 approved-with-fixes, no R55b)
- P1 `addcd52`/`ae65e42` — 검증 PASS-with-lows (P3에 반영)
- P2 `1ba49c2`/`cd5130c`/`af47f4d` — 검증 PASS-with-lows (P4 red에 반영)
- P3 `b16b900`/`ddecf6d`/`29bbe62`/`2e82446` — 검증 PASS-with-lows (P4c로 수정)
- P4 `db0cbfb`/`bf010c2` (AGENT_HINT·systemHint 삭제) · P4b `a2abb7f`/`1ca58e6` (스킬 라벨) · P4c `4fd633f`/`8140c97` (enabledHeadlessAgents · legacy 행 · flag 줄 일치) — **검증 미완(중지됨)**

## 다음 순서
1. P4·P4b·P4c 검증 (Opus 5.5 xhigh, 읽기 전용, `git archive 8140c97` 트리 · node_modules는 **심볼릭 링크** · 테스트는 하나씩 · 전체 1회). 검증 범위·체크리스트는 이전 프롬프트와 같음: deviations 35–57 판정 포함.
2. P5: `scripts/smoke-policy-honesty.ts`(가짜 CLI) + 문서(USER_GUIDE fence 머리말 :1635, ② grep 문구 = production .ts만, ③ legacy/disabled 행 문구, 기본 간극 6→1 재계산 — dev 57, class 20/UK-6/strict 꼬리, implementation-notes §0.37.0 deviations 1–57+) + VERSION 0.37.0 (cli index.ts VERSION, bridge-runtime.ts BRIDGE_VERSION, mcp-server stdio.ts) + dist 재빌드.
3. ship 검사 재실행 (full bun test 임시 HOME · typecheck · biome · handoff:check · build:cli 재현성 · 보호 파일 diff · 버전 핀).
4. **ship 차단(R55-M2):** 실 CLI ① 1회 — `smoke:policy --real-cli --owner-approved`, codex·grok·claude 각 1카드 `Reply with the single word ok.`, policy.json 없음, 기억·규칙 꺼짐, **bridge 설정에 agentArgv.codex·agentArgv.grok 명시**(Fable 판정). 오너 "yes" 필요.
5. Fable 최종 리뷰 → release 커밋 → push.

## 파일
- `v0370-inputs.md` 잠긴 결정 D1–D9 · `R55-review.md` · `v0370-deviations.md` (1–57 + 검증 판정 · 아키텍트 판정) · `v0370-survey.md`
- 규칙: 모든 bun = `env -u LOOM_RELAY_TOKEN -u LOOM_RELAY_URL HOME=$T LOOM_TEST_HOME=$T` · launchctl/systemctl 금지 · 실 CLI 금지(승인 전) · 레인 git stash/reset/checkout/push/amend 금지 · 사용자 홈 설정 쓰기 금지.
- 오너가 팬 소음/부하를 지적함 → 레인은 한 번에 하나, 검증 트리 node_modules는 링크.
