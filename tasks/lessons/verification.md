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

**재실증 (2026-07-20):** HANDOFF 잔존 Low "claude 상태줄 chrome"(`Fable 5 ⚡high 🧠 │ …`
필터 미커버)이 실은 0.23.11 ①(R35 approved) `stripTuiChrome`(`bridge-runtime.ts:218`)에서
**기해소·유닛 7케이스 커버**(`impl-02311.test.ts`, FIX3-02311 `c4f5a55`)였다. 증거팩 수집
단계에서 판명되어 코드 변경 없이 **문서 정정만으로 종결**. 규칙 재확인: 핸드오프의 잔존/미커버
주장도 힌트일 뿐 — 착수 전 현행 코드·claude-mem 대조 1회로 스테일 표기를 걸러낸다.

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

## 2026-07-19 (13) — 라이브 스모크 방법론: 합성 씨딩으로 저장 단계만 우회하고 실행 경로는 실증

**발견 (2026-07-19, v0.25.0 `conv_fetch` D10 라이브 스모크):** conv artifact fetch의
라이브 스모크를 실 원격 노드(node-vps-1 `kb`, Tailscale 100.116.39.101)로 scp 왕복해
5 시나리오 전부 PASS로 완주했다. 그 과정에서 스모크 설계상 걸린 함정 3건을 실증했다.

1. **CLI 표면 없는 툴은 리포 내부 드라이버 스크립트로 호출.** `convFetch()`는
   `@loom/host` export지만 MCP 경유(stdio→`tools.ts:452`)가 유일한 정식 트리거라
   CLI 표면이 없다. 워크스페이스 **밖**에서 `bun -e`로 `@loom/host`를 import하면 모듈
   해석에 실패한다 — 리포 **내부**에 상대 import(`./packages/host/src/conv-artifact-fetch`)
   드라이버 스크립트를 두고 호출해야 라이브 트리거가 성립한다.
2. **localhost 매핑은 happy-path 자멸.** conv→node 매핑을 localhost로 두면 convId가
   같을 때 원격 소스 경로 = 로컬 dest 경로가 동일해져, D5 덮어쓰기 거부에 스스로 걸려
   happy-path가 실패한다(음성 케이스 전용). **happy-path는 실 원격 노드 필수** — 원격
   소스와 로컬 dest가 물리적으로 분리돼야 회수-후-대조가 성립한다.
3. **합성 씨딩으로 저장 단계만 우회 — 실행 경로는 전부 라이브.** `artifactsBySeq`는
   실 conv 턴에서만(`conv-ops.ts:484`, `isFreshPeerSeq` 통과 후) 채워지므로 좌표만으로는
   fetch가 불가하고 저장분 실재가 전제다. 스모크는 이 wire→저장 관문(M-D)만 합성 씨딩으로
   우회하되, **M-D 자체는 verify-0250 유닛 12/12가 이미 커버**하므로 실증 공백이 없다 —
   나머지 실행 경로(argv 조립·host/path 재검증·containment·sha 격리)는 전부 실 scp로
   라이브 실증했다. **원칙: 유닛이 이미 잠근 단계만 우회하고, 우회 사실과 그 단계의
   유닛 커버리지를 명기한다** — 우회가 실증 공백을 만들지 않음을 문서로 못박아야 한다.

**부수 실증 (스키마가 좌표를 실제 검증):** 최초 convId `conv_smoke0250`는 ConvIdSchema
`/^conv_[a-f0-9]{16}$/` 위반으로 "invalid convId" 거부됐다 — `conv_d100000000000250`으로
교정 필요. 스키마 정규식이 장식이 아니라 좌표를 실제로 게이트한다는 방증(부정 입력이
스모크 중 실발화). **보너스 실손 경로 2건**: M-B(오염 host argv 차단)는 `conv-node-hosts.json`을
CLI charset 검증 우회로 직접 편집(`-oProxyCommand=touch /tmp/loom_pwn_d10`) → argv 상위-방어가
spawn 도달을 차단(`/tmp/loom_pwn_d10` 미생성 확인), D6(sha 불일치 격리)는 씨딩 sha를 0×64로
변조(원격 파일 불변) → 로컬 dest 격리 확인. **스모크는 happy-path만이 아니라 R40이 명시한
실손 경로(M-B·D6)를 직접 재현해 방어가 실제로 발화함을 확인해야 한다.**

## 2026-07-20 (23) — 설계 문서도 틀린다: 실행 경로로 좌표를 검증하라

**실증 (2026-07-20, hook 캐시 결함 B):** `HOOK-CACHE-FIX-DESIGN.md` **§5가 패치 대상으로
`context-generator.cjs`를 지목**했다. 그런데 그 파일은 **데드 번들**이었다 — 호출처 **0건**.
설계 문서대로 편집했다면 아무 효과 없는 패치를 "적용 완료"로 보고했을 것이다.

**규칙:** 승인된 설계 문서의 좌표라도 **그대로 믿고 편집하지 마라.** **정적 grep이 아니라
훅이 실제로 실행하는 커맨드에서 출발해 실제 호출 사슬을 따라가야** 진짜 좌표가 나온다.
이번 경우 진짜 좌표는 `worker-service.cjs`의 **`qJ()` / `eQ()`**였다.

**교차검증:** codex가 이 판정을 confirm했다(구현 레인과 분리된 독립 검증 — orchestration (24)).

**일반화:** "문서가 SSOT"는 **결정**에 대해서만 참이다. **좌표(파일·심볼·라인)는 코드가
SSOT**이고, 문서의 좌표는 작성 시점의 스냅샷일 뿐 시간이 지나면 스테일해진다.
cross-ref: verification (11) 핸드오프 힌트 교차검증·platform (19).

## 2026-07-20 (25) — 감시 도구의 종료 코드를 파이프로 파괴하지 마라

**실증 (2026-07-20, PANE-DEATH 스파이크 웨이브):** 아키텍트가 워커를 감시하며 이렇게 실행했다.

```bash
bun run scripts/watch-card.ts --pane <id> ... | tail -20     # ← 결함
```

`watch-card`는 종료 사유를 **exit code로 구분**한다 — `marker`=0 · `pane-gone`=1 · `limit`=2 ·
`timeout`=3. 그런데 **파이프라인의 종료 코드는 마지막 명령(`tail`)의 것**이므로 언제나 **0**이다.
`watch-card`가 exit **1(`pane-gone`)**로 애써 신호한 **사망이 완주로 둔갑**했다.

**정직한 부분:** stdout에는 `exit=pane-gone`이 그대로 찍혀 있었다. 도구는 제 몫을 다했다.
아키텍트가 **종료 코드만 보고** "완주"로 보고했을 뿐이다.

**규칙:**
1. `watch-card`는 **파이프 없이** 실행하고 **종료 코드를 직접 읽어라.**
2. 파이프가 꼭 필요하면 `set -o pipefail` 또는 `${PIPESTATUS[0]}`으로 첫 명령의 코드를 보존하라.
3. 출력을 저장하려면 파이프 대신 리다이렉션(`> log 2>&1`)을 쓰고, 종료 후 로그를 읽어라.

**일반화:** 이것은 bridge-ops (22) *"완주와 사망을 같은 코드로 뭉개지 마라"*의 **재범**이다.
그때는 **도구**가 두 결과를 뭉갰고, 이번엔 **호출 방식**이 도구가 이미 분리해둔 것을 다시 뭉갰다.
도구를 고쳐도 호출 규약을 지키지 않으면 같은 거짓 성공이 돌아온다.
cross-ref: bridge-ops (22)·verification (26).

## 2026-07-20 (26) — 관측자를 관측 대상과 같은 생명주기에 두지 마라

**실증 (2026-07-20, PANE-DEATH 스파이크 라운드 1):** pane 사망을 관측하는 프로브
(`scripts/probe-pane-death.ts`)를 **워커 pane 안에서** 실행했다. 시나리오 C가 `pane.close`를
호출하자 **pane과 함께 프로브도 죽었다.** `POST_CLOSE_HOLD`(10초) 중 **1.55초만 관측**됐고,
`POST_CLOSE_HOLD_DONE` · `HERDR_LOG_PANE_DIED` · `HERDR_LOG_RELATED` · `POST_STATE(c)` ·
`SCENARIO_END(c)` · `PROBE_END` · `FINAL_CLEANUP`이 **전부 부재**했다.

**절단은 조용했다.** 로그의 마지막 줄은 **문법적으로 유효한 JSON**이었고, 파일은 280줄로
충분히 커 보였다. 결함은 "있어야 할 `kind`가 파일에 없다"는 **부재로만** 드러났다.
줄 수·파일 존재·마지막 줄 유효성 — 어느 것도 절단을 잡아내지 못한다.

**해소:** 프로브를 **pane 밖(하니스 백그라운드)**에서 재실행하자 382줄로 완주했다. 그리고
라운드 1에서 잘려나갔던 **바로 그 마지막 단계**(herdr 서버 로그 스크레이프)가 §9-3을 닫는
결정적 증거를 냈다 — `PaneDied for unknown pane`이 우리 자신의 `pane.close`가 유발하는
herdr 내부 경고임을 확정했다. **절단된 단계가 하필 가장 중요한 단계였다.**

**규칙:**
1. **무언가의 죽음을 관측하는 도구는 그 죽음의 영향권 밖에서 돌려라.** pane 사망을 보려면
   pane 밖에서, 프로세스 사망을 보려면 다른 프로세스에서.
2. **프로브 산출물은 완주 마커(`PROBE_END`)의 존재로 검증하라.** 줄 수·파일 크기·마지막 줄
   파싱 성공은 완주의 증거가 아니다. 프로브는 **끝에 마커를 찍도록 설계**하고, 소비자는
   **그 마커를 확인한 뒤에만** 데이터를 신뢰한다.

**일반화:** (25)와 같은 계열이다 — 둘 다 **"부분 산출물이 완전한 것처럼 보이는"** 실패다.
(25)는 종료 코드를 뭉갰고, (26)은 계측기 자체를 잃었다. 방어는 같은 형태다:
**성공을 명시적으로 선언하는 신호를 만들고, 그 신호의 존재를 확인하라.**
좌표: `scripts/probe-pane-death.ts` · `docs/spikes/PANE-DEATH-OBSERVATIONS.md` §2·§2.3.
cross-ref: verification (25)·bridge-ops (21)(22).

## 2026-07-20 (28) — 부정 결과에는 게이트와 대조군이 필요하다

**실증 (2026-07-20, PANE-DEATH 시나리오 D — status replay 여부):**
*"herdr는 `pane.agent_status_changed`를 신규 구독자에게 재전달하지 않는다"*는 **부정 명제**를
주장해야 했다. **0건 관측만으로는 부족하다** — 0은 "없음"과 "못 봄"을 구분하지 못한다.

**라운드 2가 그 함정에 빠졌었다.** `F23 "status push 0건"`을 herdr 결함처럼 기록했으나,
실제 원인은 **plain `bash` pane에 status를 보고하는 주체가 없어 전이 자체가 발생하지 않은
조건 미충족**이었다. 결함이 아니라 **실험 설계 실패**였다.

**부정 결과를 세우는 3단 (셋 다 있어야 한다):**

1. **게이트** — 관측하려는 사건을 **실제로 한 번은 받아야** 이후의 0이 의미를 갖는다.
   D는 `pane.report_agent`로 전이를 직접 만들어 **라이브 status push 4건을 수신**한 뒤에야
   재구독 관측으로 넘어갔다(D.3). 게이트 없는 0건은 조건 미충족과 구별되지 않는다.
2. **대조군** — **같은 연결·같은 창**에서 다른 이벤트는 재전달되는 것을 확인해
   "구독이나 연결이 죽은 게 아님"을 증명한다. D는 같은 소켓의 terminal replay를 확인했다(D.6).
3. **재확인(liveness proof)** — 0건을 관측한 **바로 그 소켓**이 직후 라이브 push를 받는 것으로
   소켓·구독 생존을 증명한다. D는 101ms 만의 push 도달을 기록했다(D.5).

**규칙:** 이 셋이 없는 부정 결과는 **"미확인"이지 "없음"이 아니다.** 보고서에 "0건"을 쓸 때는
게이트·대조군·liveness를 함께 쓰거나, 쓰지 못하면 판정을 **미확인으로 격하**하라.
**부수 규칙:** 부정 결과가 성립해도 그것이 **관측된 성질**인지 **보장된 계약**인지 구분하라 —
D의 결론은 herdr v0.7.4 구현의 성질이므로 **불변식으로 코드에 잠그면 업스트림 변경에 조용히 깨진다**.

좌표: `docs/spikes/PANE-DEATH-OBSERVATIONS.md` §D(D.3 게이트·D.5 liveness·D.6 대조군·D.7 판정) ·
`docs/spikes/PANE-DEATH-DESIGN.md` §9-8. cross-ref: verification (26)·orchestration (24).
