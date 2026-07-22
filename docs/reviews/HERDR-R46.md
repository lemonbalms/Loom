# HERDR R46 검증 원장 — PLAN v0.28.1 (herdr 0.7.5 / protocol-17 호환 어댑터)

| 항목 | 값 |
|---|---|
| **검증 대상** | `docs/PLAN.md` §0.28.1 절 + 정본 `docs/spikes/HERDR-0.7.5-COMPAT.md` §1~§8 |
| **리뷰어** | `claude-rev` (아키텍트 세션 · Loom peer) |
| **자문 레인** | `fable-advisor` (Fable 5, **read-only**) |
| **일자** | **2026-07-22** |
| **Verdict** | **`pending-revision` — High **0** · Medium **1** · Low **4**** |
| **재리뷰** | **불요 — author-close 허용**(아래 §7 조건 충족 시). **no R46b** |

**Advisor: fable-advisor consulted: yes.**

> **레인 고지 (교훈 34 — 자문 경로 폴백 기록).** 이 리뷰의 자문은 `Task` 래퍼(서브에이전트 스폰)로 먼저
> 시도했으나 **래퍼가 응답 없이 행(hang)** 했다. 이후 **설치된 `fable-advisor`를 직접(read-only) 호출**해
> 자문을 받았고, 그 산출물이 아래 §3~§5의 근거다. **자문 자체는 생략되지 않았다** — 호출 경로만
> 폴백했다. 자문은 읽기 전용이며 이 원장·PLAN·코드를 편집하지 않았다.

> **본 원장은 R46 산출물의 기록이다.** 선행 원장(`PANEDEATH-R43{,B,C,D,E}.md` · `PANEDEATH-R44.md` ·
> `PANEDEATH-R45.md` · `PANEDEATH-CODEX-REVIEW*.md`)은 **정본·수정 금지**이며 이 리뷰가 건드리지 않는다.

---

## 1. 게이트 성립 근거

`WORKFLOW.md` §5.1의 **세 조건이 동시 성립**해 R46은 필수이고 author-close 직행은 불가였다:

1. **프로토콜 와이어 의미 변경** — `agent.start` 필수 필드 교체 · `agent.send` 소멸 · `agent.prompt`/
   `agent.send_keys`/`agent.wait` 신설.
2. **호환 컷오버** — `HERDR_PROTOCOL_EXPECTED` 16 → 17 **단방향**.
3. **보안·신뢰 경계 재정의** — M-2(비신뢰 프롬프트 vs 제출)의 집행 지점이 클라이언트 분할에서
   herdr 서버 원자성으로 이동.

---

## 2. Verdict 요약

**High 0.** PLAN §0.28.1은 COMPAT를 유일 정본으로 세우고 와이어 사실을 복제하지 않는 규율,
v0.28.0 락 **U1~U11** · 게이트 **G-1~G-11** 보존, additive 이벤트 필드(`final_status`·`released`)의
**관용-하되-권위-아님** 하드 경계, tests-first PATCH 1~5 경계를 정확히 세웠다. 이 축들에서
자기모순·좌표 드리프트는 발견되지 않았다.

**결정적 결함은 Medium 1건**이며, 그것은 **프로토콜 원자성 전환이 재시도 정책의 안전 성질을
조용히 뒤집는다**는 것이다(§3). Low 4건은 전부 문면·좌표·기록 의무의 국소 결함이다(§4).

---

## 3. Medium — **M-1 (결정적): 원자적 `agent.prompt` 하에서 재시도 정책이 중복 제출 경로가 된다**

**지적.** protocol 16의 verify 루프는 실패 시 **`BARE_ENTER`(CR)만 재전송**했다. 이미 제출된
composer에 CR을 더 보내는 것은 **무해한 no-op**이었고, 그래서 "stall이면 일단 재전송"이 안전했다.
protocol 17에서 그 성질은 **소멸한다** — `agent.prompt`는 paste와 Enter를 서버가 **원자적으로**
소유하므로 **재발행 1회 = 워커 작업 1회 추가 실행**이다.

**그 위에 UK-9가 있다.** COMPAT §3 축자는 `agent_prompt_stalled`를
*"대기된 프롬프트에 ~5s간 **관측된 상태 변화 없음**"* 이라고만 말한다. 이것은
**"제출되지 않았다"의 증명이 아니다** — 제출은 됐고 워커 TUI가 아직 상태를 바꾸지 않은 경우와
**같은 에러 코드로 수렴**한다. 초판 PLAN은 *"재시도 정책이 `agent_prompt_stalled`를 명시해야
한다"* 와 *"멱등 경계 안에서만"* 이라는 **원칙만** 적었고, **stalled를 미제출로 읽는 구현**을
금지하는 문장이 없었다. 구현자가 자연스럽게 "stalled → 재발행"을 쓰면 **워커가 같은 카드를 두 번
수행**한다 — 이 트랙의 불변식(*비가역 행동은 결정적 증거 또는 멱등 경로에서만*)과 정면 충돌한다.

**처방 (락).** "증거를 어디서 구하나"를 묻지 않고 **"증거가 불확실해도 안전한 구조"** 를 잠근다
(교훈 32). Security/trust에 **중복 제출 방지 4절**을 명문화한다:

1. **전문 제출은 verify/주입 시도당 최대 1회** — stall·타임아웃 관측 시 **먼저 프로브**.
2. **재발행은 양성 프로브 미스에서만** — 스크레이프가 **composer 부재를 실제로 보여준** 경우에 한함.
   페이로드는 동일 캐시 문자열(재파생 금지 — R30 L-1 승계).
3. **프로브 히트(Claude Ink paste-플레이스홀더 포함)와 read-fail은 재발행 금지** — 둘 다
   "제출됐을 수 있음"과 양립하므로 **경계 있는 `agent.send_keys` Enter 넛지**만 허용.
4. **예산 소진은 fail-visible** — 조용한 재시도도, 무한 대기도 없다(`inject_unconfirmed` 계열 승계).

**부수 제약 2개** — (a) 현행 **`reinjectUsed`의 verify-호출(주입 시도) 스코프를 그대로 보존**한다
(R30 M-2가 flight-단위를 기각한 이유가 그대로 유효하다). (b) **새 타이밍 상수를 도입하지 않는다**
(교훈 30 — 미실측 상수로 정확성 갭을 닫지 않는다. 이 4절은 순서·분기 불변식만으로 성립한다).

**안전성 논증 (UK-9 양쪽 답에서 성립).** stalled가 실제 미제출이면 프로브가 composer 부재로 미스를
내고 재발행이 **열린다**. stalled인데 실제로는 제출됐다면 프로브 히트 또는 read-fail이 재발행을
**막고** 넛지만 남는다. 어느 쪽이든 중복 실행이 발생하지 않는다 — **UK-9의 실측은 착수 조건이 아니다.**

---

## 4. Low 4건

| # | 지적 | 처방 |
|---|---|---|
| **L-1** | **`submitDelayMs`가 죽은 노브로 잔존한다.** protocol-16의 dual-`agent.send` **사이** 유예값이었는데, 원자적 `agent.prompt`에는 유예를 넣을 "두 호출 사이"가 존재하지 않는다. 존치하면 없는 정책을 서술하는 노브가 된다 | PLAN 클라이언트 API 행에 **명시적 제거**를 적는다. **코드 편집은 PATCH 2에서** — 이 리뷰 반영 단계에서는 문서만 |
| **L-2** | **좌표 드리프트 — `verifySubmitOrRetry`는 현행 이름이 아니다.** 0.23.5(`8148642`)에서 `verifySubmitOrRetry`/`verifyConvSubmitOrRetry`가 **`verifyInjectOrRetry` 단일 헬퍼로 통합**됐다(PLAN §0.23.5 Implemented 축자). 폐기된 이름을 신규 작업 지시가 참조하면 구현자가 grep miss로 잘못된 자리를 찾는다 | PLAN 주입 호출부 행 + COMPAT §4 Inject callers 행을 **`verifyInjectOrRetry`** 로 정정. **§0.23.5 역사 본문은 당시 사실이므로 불변** |
| **L-3** | **M-2 deviation 기록 자리가 미지정.** done-when은 *"`implementation-notes.md` Deviations에 기록"* 까지만 말한다. 기존 파일에는 **protocol-16 M-2/bare-Enter deviation**이 이미 있어, 지시가 모호하면 구현자가 그 항목을 **덮어써** 역사를 지울 수 있다 | done-when을 **신규 섹션 `§0.28.1`에 append**로 구체화(기존 항목 무수정) |
| **L-4** | **`BARE_ENTER` 처분 미결.** `agent.send`가 사라져도 상수는 남는다. production은 `agent.prompt`로 가고 테스트만 CR 어서션을 유지하면 **미검토 dual-send 의미론**이 테스트에만 화석으로 남아, 다음 리뷰가 없는 채로 "그렇게 동작한다"는 오독을 만든다 | PLAN 테스트 행에 **처분 확정**을 건다: 논리 Enter가 필요하면 **`agent.send_keys`용 논리 키 표현으로 교체·export**, 불필요하면 **제거** — production과 테스트가 **하나를 일관되게** 택한다. **스키마 근거가 키 토큰 이름을 명시하지 않으므로 herdr 축자 키 토큰을 발명하지 않는다**(PATCH 1 픽스처 실측분을 쓴다) |

---

## 5. Review impact 체크리스트 ①~⑥ 결과

PLAN §0.28.1 "R46이 최소 확인해야 할 것" 6항 전수:

| # | 확인 항목 | 결과 |
|---|---|---|
| **①** | protocol-17 인터페이스 표가 COMPAT §2.1·§3 실측과 **축자 일치**하는가(발명 파라미터·누락 필수 필드) | **PASS.** 필수 `name`·`kind`·`pane_id`, 제거된 `argv`/`cwd`/`env`/`focus`/`tab_id`/`workspace_id`/`split`, `agent.prompt{target,text,wait?}` · `agent.send_keys{target,keys[]}` · `agent.wait{target,until?,timeout_ms?}`, 에러 3종이 COMPAT 표와 일치. 발명된 파라미터 **0건**. **단 L-4가 남긴 예외** — 키 토큰 이름은 어느 문서에도 없으므로 발명 금지를 명문화해야 함 |
| **②** | M-2 결정이 **보호 대상을 실제로 유지**하는가, 집행점 이동을 근거로 약화시켰는가 · UK-6 위에 선 선택임을 정직히 기재했는가 | **PASS(보호 유지) + M-1 조건부.** 보호 대상(비신뢰 텍스트의 명령-문맥 탈출)은 유지된다 — 셸 미경유·opaque 파라미터·keys 변환 금지. UK-6(비원자 경로 미측정) 기재도 정직하다. **그러나 M-2 전환이 만든 새 위험(재발행 = 실제 재실행)이 미기재**였다 → **M-1** |
| **③** | additive 필드 관용이 완료 권위로 새지 않도록 **G-1·G-2·G-3 유지를 done-when에 건 것**으로 충분한가 | **PASS.** 관용은 파싱 층에서 종결되고 U1/U2/U3 금지가 명시적이며, G-1~G-3 green이 done-when 체크박스로 걸려 있다. 기계적 방어선이 성립 |
| **④** | 픽스처 규약(0.7.4 불변 · 0.7.5 병존)이 **schema version 무변경**이라는 감지 불가 조건에 대한 유일 방어선으로 성립하는가 | **PASS.** 양쪽 `version=1`이라 버전으로는 감지 불가하고, 두 픽스처의 **차집합**이 유일한 기계적 증거라는 서술이 정확. 0.7.4 덮어쓰기 금지가 명문 |
| **⑤** | 구현 순서가 **tests-first 규율**을 실제로 만족하는가 — PATCH 1이 fixture/tests only(production 0줄) · PATCH 4 green이 test-after로 오독되지 않는가 | **PASS.** PATCH 1이 production 0줄로 명시되고 red가 "다음 커밋들의 수용 계약"임을 커밋 메시지에 남기도록 걸려 있다. PATCH 4는 **PATCH 1의 red를 닫는** 것으로 서술되어 test-after 오독 여지가 없다(v0.28.0 미검증 이월 ⑪ 재범 방지 성립) |
| **⑥** | PATCH 판정 근거(Loom 공개 표면 무변경 · 하위 RPC 어댑터 한정)가 **컷오버 비가역성**과 양립하는가 | **PASS.** SemVer 판정 대상은 **Loom 자신의 공개 계약**(card contract v1 · relay/conv wire · MCP 이름·입력 schema · board 전이)이고 전부 무변경이다. 비가역성은 **운영 축**의 성질이며 fail-closed 게이트(단독 bump 금지 · 호스트 변경 이전 차단)로 관리된다 — 버전 등급을 올릴 근거가 아니다. **PATCH 확정** |

---

## 6. 반영 편집 E-1..E-7

| # | 대상 | 편집 | 근거 |
|---|---|---|---|
| **E-1** | `docs/PLAN.md` §0.28.1 **Security / trust** | **중복 제출 방지 4절** 신설(시도당 전문 1회 · stall 시 프로브 선행 · 양성 미스에서만 재발행 · 히트/read-fail은 넛지만 · 소진은 fail-visible) + `reinjectUsed` verify-호출 스코프 보존 + **신규 타이밍 상수 금지** | **M-1** |
| **E-2** | 동 **구현 순서 표 PATCH 3 행** | 재시도 정책의 **수용 계약 = E-1 4절**임을 명시(4절 미충족 = PATCH 미완) | **M-1** |
| **E-3** | 동 **추정/실측 표 + Unknowns** | **미실측 행 1개**(`agent_prompt_stalled` ≠ 미제출) + **UK-9** 신설 — 정책이 **어느 답에서도 안전**함을 논증 | **M-1** |
| **E-4** | `PLAN` 주입 호출부 행 + `COMPAT` §4 Inject callers 행 | `verifySubmitOrRetry` → **`verifyInjectOrRetry`**(두 문서만 · §0.23.5 역사 본문 불변) | **L-2** |
| **E-5** | `PLAN` 클라이언트 API 행 | **`submitDelayMs` 명시적 제거**(원자적 `agent.prompt`가 dual-send 유예를 소멸시킴) · **코드는 아직 편집하지 않음** | **L-1** |
| **E-6** | `PLAN` done-when | M-2 deviation을 `implementation-notes.md` **신규 섹션 §0.28.1**에 기록(기존 protocol-16 항목 무수정 append) | **L-3** |
| **E-7** | `PLAN` fake+테스트 행 | **`BARE_ENTER` 처분 확정** — `agent.send_keys`용 논리 키 표현으로 교체·export 또는 제거, production·테스트 **일관 택일**, 미검토 dual-send 의미론 잔존 금지, **축자 키 토큰 발명 금지** | **L-4** |

---

## 7. Author-close 조건 — **충족 (no R46b)**

**조건:** verdict의 **enumerable E-1..E-7이 축자대로, 누락·확대 없이 전량 반영**될 것. High 0이고
Medium은 1건이며 그 처방이 **PLAN 문안 lock**(코드 변경 0)이므로, 반영이 정확하면 재리뷰가 새로
확인할 대상이 없다.

**판정:** 2026-07-22 같은 세션에서 **E-1~E-7 7건 전량을 축자 반영 완료**. 따라서
`docs/PLAN.md` Status를 **`approved` (R46 author-close)** 로 전환한다. **R46b는 열지 않는다.**

**반영 범위 밖(의도적):** 코드·테스트·`HANDOFF.md`·`tasks/todo.md`·`implementation-notes.md`는
이 게이트에서 **편집하지 않았다** — E-5(`submitDelayMs` 제거)와 E-6(§0.28.1 deviation 기록)은
각각 **PATCH 2 · PATCH 5의 구현 의무**로 걸려 있고, 문서 게이트에서 선행 편집하면 tests-first
규율과 done-when 증거 순서가 깨진다.
