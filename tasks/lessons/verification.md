# Lessons — verification

차집합 판정법·dist 재빌드 순서·독립 검증·provenance 확인·핸드오프 힌트 교차검증·웨이브 검증 운영. 인덱스는 `tasks/lessons.md`.

## 2026-07-11 — Verify provenance before calling a config change a bug

**Mistake:** After the GSD Core install, `statusLine` had changed; I claimed the installer "silently clobbered" the user's setting, reverted it, and put the claim in an upstream issue draft. In fact the installer had prompted (with a keep-existing option) and the Owner had chosen the change deliberately.

**Rule:** When a config/file differs from what I expect after a tool ran interactively for the user, ask what they chose before attributing it to the tool — and never revert a setting the Owner may have just picked without checking.

## 2026-07-19 (4) — 0.23.10 웨이브 운영 교훈 2건

1. **아키텍트 독립 `bun test`를 워커 검증 스위트와 동시 실행하지 말 것** — IMPL-02310 워커가
   검증 `bun test`를 돌리는 동안 아키텍트가 병행 실행한 전체 스위트에서 425/1 플레이크(단독
   재실행 2회 연속 426/0 green). relay 포트·fake-herdr 소켓 등 공유 자원 경합 추정. 워커
   card.done 수신 후 독립 검증을 시작하는 순서가 정답.
2. **스모크 카드 페이로드에 bare `sleep N` 사용 금지** — grok 워커 3건 전부 still-running
   유예 상한 소진(`deferral exhausted 300s`) → 비확신 경로라 pane 자동 close 미발동(0.23.8
   M-1 정합)·수동 정리 필요. 완료 후에도 grok TUI 잔재가 지표에 매치된 추정(후속 관찰 후보).
   짧은 실작업(예: `--version` 확인)으로 volume 없는 페이로드를 쓰는 편이 회수까지 깔끔.
3. **rewind 유실 복구에 claude-mem 관찰이 SSOT 역할** — 직전 세션의 오너 지시("pane 배치
   좌우로 해")·PLAN 0.23.10 초안이 rewind로 디스크에서 사라졌으나 obs 4522–4525로 전량 복원.
   핸드오프와 트리 상태가 어긋나면 메모리 타임라인부터 대조할 것.

## 2026-07-19 (10) — 독립 검증 테스트 판정 = 절대 수치 아닌 HEAD 베이스라인 worktree 차집합 대조

**발견 (2026-07-19, IMPL-0240/v0.24.0 독립 검증):** 아키텍트 Bash 환경에서 전체 `bun test`가
통합 테스트의 **환경성 실패 클래스**(EACCES·herdr-연결 실패)로 401/14 fail이 났다. 워커/터미널
환경 기준 오전 수치는 474/0(0.23.12)·relay-bindings 단위는 29/0이었는데, **환경이 다르면 스위트
절대 수치가 통째로 달라져** "몇/몇 pass"만으로는 신규 회귀 여부를 판정할 수 없다(같은 코드가
환경에 따라 400대 후반~470대 편차).

**Rule (판정법):** 아키텍트 독립 검증에서 통합 테스트 fail이 보이면 **절대 수치로 회귀를 판단하지
말 것.** 반드시 **HEAD 베이스라인(변경 전) worktree에서도 동일 스위트를 돌려 fail 집합을 확보**하고,
현재 트리의 fail 집합과의 **차집합**을 본다 — 차집합 0이면 신규 회귀 없음 확정, 차집합에 남는
항목만이 실제 신규 회귀다. 이번 세션 실증: 현재 트리 401/14 fail vs HEAD 베이스라인 358/21 fail,
**tree-only 실패 차집합 0 → 신규 회귀 없음 확정**(수치가 다른 것은 순전히 환경성 실패의 비결정성).
환경성 실패 클래스(EACCES·herdr 소켓 연결)는 이 리포에 상존하므로, 단위 스위트(예:
`relay-bindings.test.ts` 29/0)와 typecheck는 절대 수치로 보되 **통합 포함 전체 스위트는 차집합으로만**
회귀를 판정한다.

## 2026-07-19 (11) — 핸드오프 스코프 힌트는 메모리 교차 검증 후 착수

**발견 (2026-07-19, 0.24.1/①-b relay 룸 영속화 웨이브):** 핸드오프의 스코프 힌트가
"`packages/relay/src/server.ts` 레지스트리 영속화 **신설**·MINOR·R38 리뷰 필요"였다. 그대로
따랐으면 이미 있는 영속화 체인(`persist.ts` `RoomSnapshotV1`·기동 복원·초대코드/멤버십
재구축·M-23 락 — 0.14.x부터 기구현)을 **재발명**할 뻔했다. claude-mem 관찰 교차(persist.ts
기존재)로 근인이 `loom relay` 포그라운드 분기(`cli/index.ts:3204`)만 durable `RoomRegistry`
미배선(데몬 경로 `relay/cli.ts`는 정상)임을 밝혀 **"신설 MINOR"가 아니라 "배선 갭 보완
PATCH"로 재프레임**했다 — 실제 diff는 6파일 +252/-13(신설 헬퍼 20줄 + 배선).

**Rule:** 증거 수집을 서브에이전트에 위임하기 **전에**, 핸드오프 스코프 힌트의 핵심 전제
("신설이다"·"미구현이다"·규모/버전 등급)를 **메모리(claude-mem)로 1회 대조**한다. 저비용
고수익 — 0.23.10 (4)-3 rewind 복구가 착수-후 판단이라면 이건 **착수-전 판단판**이다. 힌트는
직전 세션이 "다음 세션 몫"으로 남긴 가설일 뿐 확정 스펙이 아니므로, 기구현 여부·근인 위치를
먼저 확정한 뒤 PLAN을 연다.

## 2026-07-19 (12) — 워커 구현 진행 중 dist 재빌드 금지 (pre-push dist-guard 드리프트는 정상 신호)

**발견 (2026-07-19, 0.24.1 세션):** pre-push dist-guard(`check:dist`)는 **커밋된 `dist/loom.js`
vs 워킹 트리 소스의 fresh build**를 비교한다. 그래서 워커가 트리에서 구현 중(소스가 아직
반제품)일 때 가드가 실패하는 것은 **정상 동작**이다 — 커밋된 번들과 진행-중 소스가 다른 게
당연하기 때문. 이때 "가드를 통과시키려" `bun run build:cli`로 재생성-커밋하면 **미검증
반제품 소스가 번들에 실린다**(이번 세션 실제 근접 사례 — `git checkout -- dist/loom.js`로
원복, diff 검사로 회피).

**Rule:** dist 재빌드·커밋은 **구현 커밋이 확정된 후에만** 한다. 워커 구현이 진행 중일 때
뜨는 dist-guard 실패는 손대지 말 것(가드가 제 역할을 하는 신호). push 순서는 구현 커밋 →
검증 완료 → `bun run build:cli` → dist 커밋 → push 이며, 이 순서를 벗어난 dist 재생성은
반제품 유출 경로다.
