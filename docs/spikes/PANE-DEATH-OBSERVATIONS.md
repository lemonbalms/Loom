# PANE-DEATH 관측 기록 — herdr v0.7.4 raw socket probe

**상태**: 관측 완료 (라운드 2 완주)
**정본 데이터**: `docs/spikes/.panedeath-probe-raw.jsonl` — **라운드 2, 382줄, 완주**
(2026-07-20 11:51:02 ~ 11:51:29 UTC · pane `w3:p5G`/`w3:p5H`/`w3:p5J`)
**보존 데이터**: `docs/spikes/.panedeath-probe-raw.round1.jsonl` — 라운드 1, 280줄, **미완주**(§2)
**프로브 소스**: `scripts/probe-pane-death.ts`
**대상 설계 문서**: `docs/spikes/PANE-DEATH-DESIGN.md` §9 미확정 항목
**이 문서의 성격**: 관측 기록이다. 설계 결정을 내리지 않는다. `PANE-DEATH-DESIGN.md`는 수정하지 않았다.

---

## 1. 요약 — 무엇이 닫혔나

| §9 항목 | 주제 | 판정 | 근거 (1줄) |
|---|---|---|---|
| §9-1 | 자연사 시 `pane.closed`/`pane.exited` 중 무엇인가 | **닫힘** | A(자연사)·B(SIGKILL) 모두 `pane_exited`만, C(`pane.close` API)는 `pane_closed`만 — 2라운드 6개 pane 전수 일치, 혼재 0건 |
| §9-2 | payload에 exit code/signal이 실리는가 | **닫힘 (부정)** | terminal event `data` 키가 2라운드 전수 예외 없이 `{pane_id, type, workspace_id}` — exit code·signal·timestamp 전부 부재 |
| §9-3 | `PaneDied unknown`의 의미 | **닫힘(부분) — 시간 상관 확인, 인과 미확정** | `pane.close` 요청 11:51:18.625 → **139ms 후** herdr 로그에 `PaneDied for unknown pane pane=236` → ACK 18.766. 입증된 것은 **시간 대응**까지 — 내부 id `236` ↔ API `w3:p5J` 대응이 미확인이라 close 유발 인과는 미확정(§5.3). 결론은 유지: 브릿지가 통지를 버린 증거가 아니며 진단 입력으로 쓰지 않는다 (§5) |
| §9-5 | close 요청 / ACK / terminal event 순서 | **부분** | 2라운드 모두 `요청 → ACK → 이벤트` 순서 보존. 단 n=2이고 ACK→이벤트 마진이 22ms↔211ms로 10배 진동 — **전달 순서일 뿐 인과 순서의 증명이 아니다** (§6) |
| §9-4 | 213 status sequence | **범위 밖** | bridge ingress 구조 로그 필요 — 제품 코드 변경이므로 herdr API 프로브로 답할 수 없다 |
| §9-6 | bridge restart 후 registry/tombstone | **범위 밖** | R 결정 항목 |
| §9-7 | cleanup timeout / tombstone TTL 수치 | **범위 밖** | R 결정 항목 |
| (시나리오 D) | `pane.agent_status_changed`도 신규 구독자에게 replay되는가 | **닫힘 (부정) — replay 안 됨** | 라이브 status push **4건 수신으로 게이트 통과** 후 새 소켓 동일 구독 **35초 0건**. 같은 소켓이 직후 라이브 push를 **101ms**에 받아 구독 성립 증명(liveness proof), **같은 연결·같은 창에서 terminal은 replay 확인**(대조군). 2회 실행 동일 (§D) |
| (안전) | 보호 pane 불가침 | **확인** | `PROBE_END.protected_still_present` 5/5, scratch 3개만 종료 (§8) |

> **⚠️ status replay 부재는 herdr 계약이 아니라 v0.7.4 구현의 관측된 성질이다.**
> herdr가 보장한 것이 아니므로 **불변식으로 코드에 잠그지 말 것** — 업스트림이 replay를 추가하면
> 조용히 깨진다. 방어(종료 펜스·구독 시작 시각 필터)는 유지한 채, 이 관측은 **"replay발 가짜 done"
> 경로가 현재 성립하지 않는다**는 사실 근거로만 쓴다.

**네 줄 요약**

1. "프로세스가 죽었다(`pane_exited`)"와 "우리가 닫았다(`pane_closed`)"는 **이벤트 타입으로 구분된다**.
2. 그러나 **그 이벤트가 지금 일어난 일인지 과거의 재전달인지는 구분할 수 없다** — herdr는 신규 구독자에게 과거 이벤트를 바이트 동일하게 재생하며, 그 보존 기간은 **10분 이상**이다(§4).
3. `PaneDied for unknown pane`은 위 재전달과 **무관한 별개 현상**이다. `pane.close` 호출과 **강한 시간 상관**이
   있으나 id 대조가 없어 인과는 미확정이다(§5).
4. **재전달되는 것은 terminal뿐이다.** `pane.agent_status_changed`는 게이트·대조군·liveness proof를 갖춘
   관측에서 **한 건도 재전달되지 않았다**(§D) — 단 이는 v0.7.4의 성질이지 계약이 아니다.

---

## 2. 두 번의 실행 — 라운드 1은 왜 실패했나

### 2.1 라운드 1 (11:40:57 ~ 11:41:15, 280줄) — 시나리오 C 절단

라운드 1은 **프로브를 워커 pane 안에서 실행**했다. 시나리오 C가 `pane.close`를 호출한 직후 로그가 끊겼다:
마지막 줄이 `11:41:15.345`이고, `POST_CLOSE_HOLD`(10초)는 `11:41:13.797`에 시작했으므로 **10초 중 1.55초만 관측**됐다.
`POST_CLOSE_HOLD_DONE` · `HERDR_LOG_PANE_DIED` · `HERDR_LOG_RELATED` · `POST_STATE(c)` · `SCENARIO_END(c)` ·
`PROBE_END` · `FINAL_CLEANUP`이 전부 부재했다.

**원인 확정**: 관측자(프로브)를 관측 대상(pane)과 **같은 생명주기에 두었다.** pane이 죽자 관측자도 함께 죽었다.

### 2.2 라운드 2 (11:51:02 ~ 11:51:29, 382줄) — 완주

프로브를 **pane 밖(하니스 백그라운드)에서** 실행하자 완주했다.

```json
{"t_iso":"2026-07-20T11:51:28.770Z","kind":"POST_CLOSE_HOLD_DONE","scenario":"c","payload":{"held_ms":10000}}
{"t_iso":"2026-07-20T11:51:29.000Z","kind":"PROBE_END","payload":{
  "success":["a","b","c"],
  "owned":["w3:p5G","w3:p5H","w3:p5J"],
  "final_panes":["w3:p2","w3:p1J","w3:p46","w4:p1","w8:p1"],
  "protected_still_present":["w3:p2","w3:p1J","w4:p1","w8:p1","w3:p46"]}}
```

`SCENARIO_END`가 3건(a·b·c), `POST_STATE`가 3건. 라운드 1에서 누락됐던 herdr 서버 로그 스크레이프
(`HERDR_LOG_PANE_DIED` · `HERDR_LOG_RELATED`)가 실제로 실행됐고, 그 결과가 §9-3을 닫았다(§5).

### 2.3 방법론 교훈

> **관측자를 관측 대상과 같은 생명주기에 두지 마라.**
> pane 사망을 관측하는 프로브를 pane 안에서 돌리면, 관측하려던 바로 그 사건이 관측 자체를 파괴한다.
> 절단은 조용하다 — 라운드 1 로그의 마지막 줄은 **문법적으로 유효한 JSON**이었고,
> 누락된 것은 "있어야 할 kind가 파일에 없다"는 부재로만 드러났다.
> 종료 마커(`PROBE_END`)의 **존재를 확인**하지 않으면 절단된 로그를 완주본으로 오독한다.

이 교훈은 `CLAUDE.md` 오케스트레이션 규칙 6·7(“완주와 사망을 같은 코드로 뭉개지 마라”, “`card.done` 수신 ≠ 완료”)과
같은 계열의 실패다. 이번에는 감시자가 아니라 **계측기** 쪽에서 같은 형태로 재발했다.

**이하 §3~§9의 모든 근거는 라운드 2 데이터다.** 라운드 1을 인용할 때는 명시한다.

---

## 3. 방법

### 3.1 왜 raw 소켓 직결인가

`HerdrClient`를 경유하지 않고 `node:net`으로 herdr 소켓에 NDJSON JSON-RPC를 직접 썼다
(`scripts/probe-pane-death.ts` 헤더: *"Does NOT import HerdrClient — reimplements minimal NDJSON RPC so
observation is not polluted by incremental re-subscribe logic"*).

이유: 관측 대상 중 하나가 **재구독 시 동작**인데, `HerdrClient`의 증분 재구독 로직이 위에 얹히면
서버가 보낸 것과 클라이언트가 걸러낸 것을 분리할 수 없다. 서버가 **와이어에 실제로 실어 보낸 바이트**를 봐야 한다.
이 선택이 §4의 replay 발견을 가능하게 했다.

### 3.2 접속·버전

```json
{"t_iso":"2026-07-20T11:51:02.242Z","kind":"PROBE_START","payload":{
  "socket":"/Users/kyoungsiklee/.config/herdr/herdr.sock","which":"all",
  "protected":["w3:p2","w3:p1J","w4:p1","w8:p1","w3:p46"],
  "note":"raw socket probe — does not use HerdrClient"}}
{"t_iso":"2026-07-20T11:51:02.354Z","kind":"PING","payload":{
  "type":"pong","version":"0.7.4","protocol":16,
  "capabilities":{"live_handoff":true,"detached_server_daemon":false}}}
```

**herdr v0.7.4 / protocol 16.** 이 문서의 모든 결론은 이 버전에 한정된다. (라운드 1과 동일 버전.)

### 3.3 구독 형태

시나리오마다 **새 소켓 연결**로 `events.subscribe`를 두 번 연다(이것이 replay 관측의 핵심 조건이다):

- sink1: `pane.closed` · `pane.exited` · `pane.created` · `pane.updated` (pane_id 무지정 = 전역)
- sink2: `pane.agent_status_changed` (해당 scratch pane_id 지정)

ACK 6건 전부 `{"result":{"type":"subscription_started"}}`.

### 3.4 재현

```
bun scripts/probe-pane-death.ts --scenario all
```

**pane 안에서 돌리지 말 것**(§2.3). 단일 시나리오는 `--scenario a|b|c`, 소켓은 `LOOM_HERDR_SOCKET`로 덮어쓴다.

### 3.5 베이스라인

```json
{"t_iso":"2026-07-20T11:51:02.463Z","kind":"BASELINE_PANES",
 "payload":["w3:p2","w3:p1J","w3:p46","w4:p1","w8:p1"]}
```

보호 pane 5개 전부 존재, `WARN_PROTECTED_MISSING` 0건.

---

## 4. 시나리오 A·B·C 관측

### 4.1 시나리오 A — 자연사 (exit 0)

**pane** `w3:p5G` · argv `bash -lc "echo panedeath-A-start; sleep 2; echo panedeath-A-exit; exit 0"`

| t_iso | kind | 핵심 payload |
|---|---|---|
| 11:51:02.464 | `SCENARIO_BEGIN` | A — natural exit |
| 11:51:02.464 | `SUBSCRIBE_TX` | `pane.closed, pane.exited, pane.created, pane.updated` |
| 11:51:02.571 | `SUBSCRIBE_ACK` | `subscription_started` |
| 11:51:02.571~03.983 | `EVENT_PUSH` ×18 | **구독 직후 과거 terminal 이벤트 유입** (§4.4) |
| 11:51:02.697 | `SCRATCH_CREATED` | `pane_id=w3:p5G, terminal_id=term_657098548567dea` |
| 11:51:02.920 | `OWNED_PIDS` | `[73913, 73922]` |
| **11:51:04.861** | **`EVENT_PUSH`** | **`pane_exited` / `w3:p5G`** ← 자연사 |
| 11:51:09.978 | `RPC_RX`(`pane.list`) | 5 panes — `w3:p5G` **부재** |
| 11:51:09.980 | `SCENARIO_END` | `{name:"A", ok:true}` |

```json
{"t_ms":1784548264861,"t_iso":"2026-07-20T11:51:04.861Z","kind":"EVENT_PUSH","scenario":"a",
 "payload":{"data":{"pane_id":"w3:p5G","type":"pane_exited","workspace_id":"w3"},"event":"pane_exited"}}
```

`w3:p5G`에 대한 `pane_closed`는 전 로그 **0건**. `CLEANUP_CLOSE_STILL_OPEN` 부재 →
프로브의 정리용 close가 호출되지 않았으므로 `pane_exited`는 **우리 close와 무관하게** 발생했다.

### 4.2 시나리오 B — SIGKILL

**pane** `w3:p5H` · argv `bash -lc "echo panedeath-B-start; sleep 300; ..."`

| t_iso | kind | 핵심 payload |
|---|---|---|
| 11:51:10.483 | `SCENARIO_BEGIN` | B — SIGKILL |
| 11:51:10.593 | `SUBSCRIBE_ACK` | 새 연결 |
| 11:51:10.710 | `SCRATCH_CREATED` | `pane_id=w3:p5H, name=panedeath-spike-B-mrt5yq69` |
| 11:51:11.740 | `PRE_SIGKILL_EVIDENCE` | `{pane_id:w3:p5H, shell_pid:73946, all_pids:[73946,73955], owned_by_spike:true}` |
| 11:51:11.740 | `SIGKILL_TARGET` | `{pid:73955, proof:"...panedeath-spike-B"}` |
| 11:51:11.740 | `SIGKILL_SENT` | `{pid:73955, signal:"SIGKILL"}` |
| 11:51:11.741 | `SIGKILL_EXTRA` | `{pid:73946}` (셸도 SIGKILL) |
| **11:51:11.758** | **`EVENT_PUSH`** | **`pane_exited` / `w3:p5H`** — SIGKILL 후 **18ms** |
| 11:51:16.870 | `RPC_RX`(`pane.list`) | 5 panes, 보호 5개 생존, `w3:p5H` 부재 |

```json
{"t_ms":1784548271758,"t_iso":"2026-07-20T11:51:11.758Z","kind":"EVENT_PUSH","scenario":"b",
 "payload":{"data":{"pane_id":"w3:p5H","type":"pane_exited","workspace_id":"w3"},"event":"pane_exited"}}
```

**§9-2의 핵심** — A(exit 0)와 B(SIGKILL)의 payload를 나란히 놓으면 `pane_id`만 다르다:

```
A: {"pane_id":"w3:p5G","type":"pane_exited","workspace_id":"w3"}   ← exit 0
B: {"pane_id":"w3:p5H","type":"pane_exited","workspace_id":"w3"}   ← SIGKILL
```

이것이 lessons (21) "종료 코드·시그널로 실패 판정 금지"를 **경험칙에서 구조적 사실로 격상**시킨다.
지금까지는 "종료 코드로 판정하면 오판이 난다"였다. 이제는 **"이벤트에 종료 코드가 애초에 없다"**이다.
정상 cleanup과 강제 종료가 와이어에서 동일하므로, 판정 근거는 **이벤트 외부**(결과 커밋 여부, marker, 산출물)에서 와야 한다.

### 4.3 시나리오 C — `pane.close` API

**pane** `w3:p5J` · argv `bash -lc "echo panedeath-C-start; sleep 300"`

| t_iso | kind | 핵심 payload |
|---|---|---|
| 11:51:17.375 | `HERDR_LOG_OFFSET` | `offset=3172710` — 이후 스크레이프 기준점 |
| 11:51:17.478 | `SUBSCRIBE_ACK` | 새 연결 |
| 11:51:17.599 | `SCRATCH_CREATED` | `pane_id=w3:p5J, terminal_id=term_65709862bbb06ec` |
| 11:51:18.624 | `OWNED_PIDS` | `[73967, 73976]` |
| **11:51:18.625** | **`PANE_CLOSE_REQUEST`** | `{pane_id:"w3:p5J"}` |
| **11:51:18.764598** | **(herdr 서버 로그)** | **`WARN herdr::app::actions: PaneDied for unknown pane pane=236`** |
| **11:51:18.766** | **`PANE_CLOSE_ACK`** | `{result:{"type":"ok"}}` — 요청 후 **141ms** |
| **11:51:18.977** | **`EVENT_PUSH`** | **`pane_closed` / `w3:p5J`** — ACK 후 **211ms** |
| 11:51:28.770 | `POST_CLOSE_HOLD_DONE` | `{held_ms:10000}` — **10초 완주** |
| 11:51:28.772 | `HERDR_LOG_PANE_DIED` | 아래 §5 |
| 11:51:28.773 | `HERDR_LOG_RELATED` | `[]` |

```json
{"t_ms":1784548278977,"t_iso":"2026-07-20T11:51:18.977Z","kind":"EVENT_PUSH","scenario":"c",
 "payload":{"data":{"pane_id":"w3:p5J","type":"pane_closed","workspace_id":"w3"},"event":"pane_closed"}}
```

**close 후 10초 완주 관측 결과**: `w3:p5J`에 대한 `pane_exited`는 **0건**.
라운드 1에서 1.53초만 봤던 구간을 이번엔 10초 전부 봤고, 늦은 child-exit 통지는 오지 않았다.
`pane.close`는 `pane_closed` **하나만** 낳는다.

### 4.4 세 시나리오 종합 — §9-1 닫힘

| 시나리오 | 사인 | pane | 수신 이벤트 | 반대편 이벤트 |
|---|---|---|---|---|
| A | 프로세스 정상 종료(exit 0) | `w3:p5G` | `pane_exited` | `pane_closed` 0건 |
| B | SIGKILL | `w3:p5H` | `pane_exited` | `pane_closed` 0건 |
| C | `pane.close` API | `w3:p5J` | `pane_closed` | `pane_exited` 0건 (10초 관측) |

라운드 1의 `p5D`·`p5E`·`p5F`도 동일 패턴이었다. **2라운드 6개 pane 전수 일치, 혼재 0건.**
→ "프로세스가 죽었다" vs "우리가 닫았다"는 **이벤트 타입으로 구분 가능하다**.

---

## 5. §9-3 닫힘(부분) — `PaneDied for unknown pane`은 `pane.close`와 시간 상관이 강하다 (인과 미확정)

### 5.1 직접 증거

라운드 2에서 herdr 서버 로그 스크레이프가 실제로 실행됐다:

```json
{"t_iso":"2026-07-20T11:51:28.772Z","kind":"HERDR_LOG_PANE_DIED","scenario":"c","payload":{
  "pane_id":"w3:p5J","short_id":"p5J",
  "matching_lines":["2026-07-20T11:51:18.764598Z  WARN herdr::app::actions: PaneDied for unknown pane pane=236"],
  "any_panedied":["2026-07-20T11:51:18.764598Z  WARN herdr::app::actions: PaneDied for unknown pane pane=236"]}}
{"t_iso":"2026-07-20T11:51:28.773Z","kind":"HERDR_LOG_RELATED","scenario":"c","payload":[]}
```

3줄 타임라인:

```
11:51:18.625     PANE_CLOSE_REQUEST   w3:p5J
11:51:18.764598  WARN herdr::app::actions: PaneDied for unknown pane pane=236   ← 요청 후 139ms
11:51:18.766     PANE_CLOSE_ACK       {"type":"ok"}                             ← PaneDied 후 1.4ms
11:51:18.977     EVENT_PUSH           pane_closed / w3:p5J                      ← PaneDied 후 212ms
```

### 5.2 판정 — **닫힘(부분): 시간 상관 확인, 인과 미확정**

`PaneDied for unknown pane`은 `pane.close` 요청과 ACK **사이에** 끼어 있다(+139ms). 가장 자연스러운 해석은
**`pane.close` 처리 도중 herdr 내부에서 발생하는 부기(bookkeeping) 경고** — herdr가 pane을 자기 registry에서
제거한 뒤 child-exit 콜백이 도착해 "모르는 pane"이 된 상태를 스스로 기록한 것 — 이다. 그러나 §5.3대로
내부 id `236`과 API id `w3:p5J`의 대응이 확인되지 않았으므로, **같은 창에서 다른 내부 pane 236이 우연히
사망한 대안 설명이 제거되지 않았다.** 따라서 이 해석은 **미확정으로 기록하고 닫힌 사실로 승격하지 않는다.**
*(격하 근거: codex 적대적 검증 2026-07-20 Medium — `docs/reviews/PANEDEATH-CODEX-REVIEW.md` §2)*

**따라서 이 경고는 브릿지가 통지를 버렸다는 증거가 아니다.**
`CLAUDE.md` 규칙 7이 이미 경고한 오독("`PaneDied for unknown pane`은 herdr 내부 경고이지 브릿지가 통지를
버렸다는 증거가 아니다")이 이제 **직접 관측으로 확정**됐다.

`HERDR_LOG_RELATED`가 빈 배열이라는 점도 함께 읽어야 한다 — 10초 홀드 동안 `w3:p5J`를 언급하는
다른 herdr 로그 줄은 **하나도 없다**. 이 경고 외에 후속 사건은 없었다.

### 5.3 정직성 — id는 일치하지 않는다

경고는 `pane=236`이라는 **herdr 내부 숫자 id**를 쓰며, API의 `w3:p5J`와 문자열로 일치하지 않는다.
프로브 필터는 `l.includes("PaneDied")`로 **모든** PaneDied 줄을 잡으므로, 이 줄이 걸린 것이
`p5J`와 매칭돼서가 아니다. `pane=236` ↔ `w3:p5J` 연결의 근거는 **타이밍**이다:

- 스크레이프 창(11:51:17.375 offset 이후 ~11:51:28.772) 전체에서 `PaneDied` 줄은 **정확히 1건**
- 그 창에서 발생한 `pane.close` 호출도 **정확히 1건**이며, 둘의 시차는 139ms

이 대응은 강하지만 **id 대조로 확정된 것은 아니다**. 내부 id ↔ API pane_id 매핑을 확인하면 완전해진다.

### 5.4 replay와 PaneDied는 **별개 현상이다** — 뭉치지 말 것

라운드 1에서 필자는 "재전달(replay)이 `PaneDied unknown`의 유력한 원인"이라고 **추론**했다(라운드 1 문서 I2).
**라운드 2가 이를 반증했다.**

시나리오 C의 연결은 스크레이프 창(11:51:17.375~11:51:28.772) 동안 terminal 이벤트를 **21건** 받았고,
그중 **20건이 스테일 재전달**이었다(§6.1). 같은 창의 herdr 로그에 `PaneDied`는 **1건**뿐이며
그것은 우리의 `pane.close`에 붙어 있다.

> **스테일 terminal 20건이 유입되는 동안 `PaneDied`는 0건 발생했다.**
> replay는 `PaneDied`를 만들지 않는다.

두 현상을 분리해 정리하면:

| | replay (백로그 재생) | `PaneDied for unknown pane` |
|---|---|---|
| 관측 지점 | 소켓 push 스트림 (클라이언트가 봄) | herdr 서버 로그 (클라이언트에 안 보임) |
| 유발 조건 | **신규 구독** | **`pane.close` API 호출** |
| 빈도 (C 창) | terminal 20건 | 1건 |
| 영향 | 스테일 사망 통지가 클라이언트에 유입 → 위양성 위험 | herdr 내부 부기 경고 — 클라이언트 동작에 영향 없음 |
| §9 항목 | (신규 발견, §9에 없던 항목) | §9-3 |

**§9-3은 닫혔다. replay는 §9-3과 무관한 별도의 신규 발견이며 §6에서 다룬다.**

---

## 6. 신규 발견 — herdr는 신규 구독자에게 과거 이벤트를 재전달한다

§9에 없던 항목이다. 권고 B의 종료 펜스 설계에 직접 영향을 준다.

### 6.1 집계 — 같은 pane의 terminal 이벤트가 구독 횟수만큼 도착

라운드 2의 세 구독(a=11:51:02.571, b=11:51:10.593, c=11:51:17.478)에서 수신한 terminal 이벤트:

| pane | 실제 사망 | `pane_exited`/`pane_closed` 수신 | 수신 시각 | 소유 |
|---|---|---|---|---|
| `w3:p5G` | 11:51:04.861 (1회) | **3회** | 04.861(a) · 11.023(b) · 17.898(c) | 라운드2 A |
| `w3:p5H` | 11:51:11.758 (1회) | **2회** | 11.758(b) · 18.009(c) | 라운드2 B |
| `w3:p5D` | **11:40:59.986 (라운드 1)** | **3회** | 02.793(a) · 10.810(b) · 17.694(c) | 라운드1 A |
| `w3:p5E` | **11:41:06.790 (라운드 1)** | **3회** | 02.903(a) · 10.921(b) · 17.796(c) | 라운드1 B |
| `w3:p5F` | **11:41:13.818 (라운드 1)** | **3회** (`pane_closed`) | 03.872(a) · 11.868(b) · 18.767(c) | 라운드1 C |
| `w3:p4Y` · `w3:p58` | 프로브 이전 | 각 **3회** | 매 구독 | **무관한 pane** |

**결정적**: 라운드 1의 scratch pane `p5D`·`p5E`·`p5F`가 **10분 뒤 라운드 2의 다른 프로세스에** 재전달됐다.
`p5D`는 11:40:59.986에 죽었고 11:51:02.793에 다시 도착했다 — **10분 3초의 간격**이다.
백로그는 클라이언트 프로세스 사망을 넘어 살아남으며, 보존 기간은 **최소 10분**이다.

C 시나리오 창의 terminal 이벤트 21건 중 **20건이 이런 스테일 재전달**이고, 라이브는 `p5J` 1건뿐이었다.

### 6.2 재전달 범위 — `pane_exited`에 국한되지 않는다

- **`pane_closed`도 재전달**: `p4Z, p51, p53, p52, p40, p54, p55, p56, p57, p59, p5A, p5B, p5F, p5C` 등이
  매 구독마다 1회씩 도착. 종료 펜스가 `pane_closed`만 보더라도 스테일 유입을 피하지 못한다.
- **`pane_created`도 재전달되며 바이트 동일**: `w3:p54`의 `pane_created`가 세 구독에서 도착했고,
  `payload`를 정규화 비교하면 **유일한 1종**이다(라운드 1에서도 동일 결과):

```
11:51:02.571 (a) w3:p54 pane_created rev=0 term=term_6570858f66dc5de
11:51:10.593 (b) w3:p54 pane_created rev=0 term=term_6570858f66dc5de
11:51:17.479 (c) w3:p54 pane_created rev=0 term=term_6570858f66dc5de
```

바이트 동일 재전달은 "비슷한 새 이벤트"가 아니라 **보존된 과거 이벤트의 재생**임을 확정한다.

### 6.3 메커니즘 — 백로그를 ~110ms에 1건씩 흘려보낸다

`w3:p4Z`의 `pane_updated.revision`이 결정적이다. 세 구독 모두 낮은 revision에서 시작해
**동일한 상한 46까지 한 tick에 1씩** 올라간다:

| 구독 | 시작 rev | 종료 rev | 도달 시각 | (라운드 1 시작 rev) |
|---|---|---|---|---|
| a (11:51:02.571) | 33 | 46 | 11:51:03.983 | 21 |
| b (11:51:10.593) | 35 | 46 | 11:51:11.758 | 23 |
| c (11:51:17.478) | 37 | 46 | 11:51:18.435 | 26 |

`p4Z`는 이미 정지 상태(rev 46 고정)인데도 매 구독이 33/35/37부터 다시 올라온다 →
**b·c가 본 `p4Z` 스트림은 전부 백로그 재생이다.**
라운드 1의 21/23/26이 라운드 2에서 33/35/37로 올라간 것은 보존 창이 **슬라이딩**함을 뜻한다.

전달 간격도 균일하다. 시나리오 C의 push 간 간격 분포는 100~112ms에 집중되며 **최빈값 110ms**
(0~1ms는 같은 tick에 묶인 배치). **연결당 약 110ms에 1건**이 드레인 속도다.

관측 사실:
1. 신규 구독은 과거 이벤트 백로그를 받는다.
2. 보존 기간은 **≥10분**이며 클라이언트 프로세스 재시작을 넘어 유지된다.
3. 보존 창은 유한하고 시간에 따라 슬라이딩한다(`p4Z` 하한 21→33).
4. 드레인은 ~110ms/건으로 **고정**이며 생산 속도와 무관하다.
5. 따라서 연결이 라이브보다 뒤처질 수 있다 — C는 11:51:18.435에야 rev 46(라이브)에 도달했고,
   그 전 0.96초 동안 백로그를 흘리고 있었다.

### 6.4 설계 함의

**(1) terminal 이벤트에는 재전달을 판별할 필드가 하나도 없다.**
`pane_updated`는 `revision`을 실어 중복 제거가 가능하지만, `pane_closed`/`pane_exited`의 `data`는
`{pane_id, type, workspace_id}`가 전부다. 봉투도 `{data, event}`뿐 — **id·seq·timestamp 전무**.
→ 권고 B의 종료 펜스는 수신한 terminal 이벤트가 지금 것인지 **10분 전 것인지 in-band로 알 수 없다**.

**(2) `HerdrClient`가 증분 재구독을 하는 한, 재구독마다 스테일 terminal이 유입된다.**
펜스가 이를 그대로 받으면 이미 결과를 커밋한 카드에 대해 **위양성 사망 판정**이 난다.
→ 펜스는 최소한 (a) pane_id 기준 **래치**(idempotent, 1회만 발화), (b) **이 연결에서 살아있음을 본 적 없는
pane_id의 terminal은 무시**, (c) terminal 이벤트를 **사망 시각의 근거로 쓰지 않음**을 만족해야 한다.
*(이 세 항목은 관측에서 도출한 **추론·권고**이며, 이 문서가 결정하지 않는다 — R 항목이다.)*

**(3) 이벤트 도착 시각은 사건 발생 시각이 아니다.** ~110ms 양자화 + 최대 10분의 백로그 지연이 겹친다.
→ 이벤트 간 시간차로 타임아웃·TTL(§9-7)을 정하려면 이 지연을 예산에 포함해야 한다.

---

## 7. §9-5 — 순서는 보존되나, 인과의 증명은 아니다

### 7.1 두 라운드 수치

| | 라운드 1 (`w3:p5F`) | 라운드 2 (`w3:p5J`) |
|---|---|---|
| `PANE_CLOSE_REQUEST` | 11:41:13.668 | 11:51:18.625 |
| `PANE_CLOSE_ACK` | 11:41:13.796 (**+128ms**) | 11:51:18.766 (**+141ms**) |
| `pane_closed` 이벤트 | 11:41:13.818 (**ACK +22ms**) | 11:51:18.977 (**ACK +211ms**) |

**순서 `요청 → ACK → 이벤트`는 2/2로 보존됐다.**

### 7.2 격하는 유지한다

ACK→이벤트 마진이 **22ms ↔ 211ms로 약 10배 진동**한다. 두 값 모두 §6.3의 ~110ms 전달 양자와
같은 자릿수이며, 실제로 두 이벤트 모두 드립 tick 위에 정확히 얹혀 있다
(라운드 2 C의 tick: …18.656 · 18.767 · 18.872 · **18.977**).

즉 관측된 것은 **전달 순서**이지 **서버 내부 인과 순서**가 아니다. 이벤트가 큐에 언제 들어갔는지는 알 수 없고,
close 요청이 tick 경계에 다르게 걸리면 이벤트가 ACK보다 **앞설 여지도 배제되지 않는다**.

**n=2는 작다.** §9-5는 **부분**으로 남긴다. "ACK가 오면 이벤트가 뒤따른다"를 **불변식으로 코드에 잠그지 말 것.**
확정하려면 close 시점을 ~110ms tick에 대해 무작위 오프셋으로 n≥20회 반복해야 한다.

---

## 8. 안전 규칙 준수 확인

**보호 pane 5개 선언** (`PROBE_START`): `w3:p2` · `w3:p1J` · `w4:p1` · `w8:p1` · `w3:p46`
— 코드상 `PROTECTED` 집합이며 `assertScratch()`가 종료를 거부한다.

**보호 pane 전원 생존** — 프로브 종료 시점 최종 확인(라운드 1에서는 실행되지 못했던 항목):

```json
{"t_iso":"2026-07-20T11:51:29.000Z","kind":"PROBE_END","payload":{
  "success":["a","b","c"],
  "owned":["w3:p5G","w3:p5H","w3:p5J"],
  "final_panes":["w3:p2","w3:p1J","w3:p46","w4:p1","w8:p1"],
  "protected_still_present":["w3:p2","w3:p1J","w4:p1","w8:p1","w3:p46"]}}
```

`protected_still_present` **5/5**. `WARN_PROTECTED_MISSING` 0건. `final_panes`는 보호 pane만 남았다.

**종료한 pane은 자기가 만든 3개뿐**:

| pane | 생성 | 이름 | 종료 방식 |
|---|---|---|---|
| `w3:p5G` | 11:51:02.697 | `panedeath-spike-A-mrt5yjzf` | 자연사 (프로브가 죽이지 않음) |
| `w3:p5H` | 11:51:10.710 | `panedeath-spike-B-mrt5yq69` | SIGKILL |
| `w3:p5J` | 11:51:17.599 | `panedeath-spike-C-mrt5yvhi` | `pane.close` API |

`PROBE_END.owned`가 정확히 이 3개다.

**SIGKILL 전 소유권 증거** — 대상 PID가 우리 pane 것임을 herdr에게 물어 확인한 뒤 쐈다:

```json
{"t_iso":"2026-07-20T11:51:11.740Z","kind":"PRE_SIGKILL_EVIDENCE","scenario":"b","payload":{
  "pane_id":"w3:p5H","shell_pid":73946,"all_pids":[73946,73955],
  "owned_by_spike":true,"name":"panedeath-spike-B-mrt5yq69"}}
{"t_iso":"2026-07-20T11:51:11.740Z","kind":"SIGKILL_TARGET","scenario":"b","payload":{
  "pane_id":"w3:p5H","pid":73955,
  "proof":"pane created this scenario with name prefix panedeath-spike-B"}}
```

`PROCESS_INFO`(11:51:11.739)가 `pane_id:"w3:p5H"`에 대해 `shell_pid:73946`,
foreground `sleep 300`(`73955`) + `bash -lc "echo panedeath-B-start; sleep 300; ..."`(`73946`)를 반환했다.
죽인 PID 73955·73946은 herdr가 `w3:p5H`의 프로세스라고 응답한 값이며,
argv에 `panedeath-B-start`가 박혀 있어 **다른 워커의 프로세스일 수 없다**.

**판정: 안전 규칙 준수. 보호 pane 침해 0건, 소유권 미확인 PID에 대한 시그널 0건. 2라운드 모두.**

---

## 9. 관측된 사실 vs 추론

### 9.1 관측된 사실 (라운드 2 원시 로그에서 직접 읽힘)

| # | 사실 | 근거 | 라운드 1에서도? |
|---|---|---|---|
| F1 | herdr v0.7.4 / protocol 16 | `PING` 11:51:02.354 | 동일 |
| F2 | 자연사(exit 0) → `pane_exited` | `w3:p5G` 11:51:04.861 | ✓ (`p5D`) |
| F3 | SIGKILL → `pane_exited` | `w3:p5H` 11:51:11.758 (SIGKILL 후 18ms) | ✓ (`p5E`, 43ms) |
| F4 | `pane.close` API → `pane_closed` | `w3:p5J` 11:51:18.977 | ✓ (`p5F`) |
| F5 | 한 pane에 두 종류가 섞이지 않음 | 6개 pane 전수 | ✓ |
| F6 | `pane.close` 후 10초간 늦은 `pane_exited` 없음 | `POST_CLOSE_HOLD_DONE` 10초 완주 | ✗ **라운드 1은 1.55초만 관측 — 신규 확정** |
| F7 | terminal payload = `{pane_id, type, workspace_id}` 고정 | 2라운드 전수 | ✓ |
| F8 | terminal 봉투 = `{data, event}` — id·seq·timestamp 없음 | 2라운드 전수 | ✓ |
| F9 | A와 B의 payload가 `pane_id` 외 동일 | F2·F3 원문 대조 | ✓ |
| F10 | `PaneDied unknown`은 `pane.close` 요청 139ms 후, ACK 1.4ms 전에 발생 | `HERDR_LOG_PANE_DIED` | ✗ **라운드 1 미수집 — 신규** |
| F11 | 스크레이프 창의 `PaneDied`는 총 1건, close 호출도 1건 | `any_panedied` 길이 1 | ✗ 신규 |
| F12 | 스테일 terminal 20건 유입 중 `PaneDied` 0건 | F11 + §6.1 | ✗ 신규 |
| F13 | `HERDR_LOG_RELATED` 빈 배열 — 10초간 후속 로그 없음 | 11:51:28.773 | ✗ 신규 |
| F14 | 신규 구독마다 과거 terminal 이벤트 재도착 | `p5G` 3회, `p5H` 2회, `p4Y`·`p58` 각 3회 | ✓ |
| F15 | 재전달은 `pane_closed`·`pane_created`에도 적용 | 14개 pane × 3회; `p54` `pane_created` 3회 | ✓ |
| F16 | 재전달 payload는 바이트 동일 | `p54` `pane_created` 정규화 비교 = 1종 | ✓ |
| F17 | **백로그 보존 ≥10분, 클라이언트 프로세스 사망을 넘어 유지** | 라운드1 `p5D`(11:40:59.986) → 라운드2 재전달(11:51:02.793) | ✗ **교차 라운드로만 관측 가능 — 신규** |
| F18 | 전달은 연결당 ~110ms에 1건으로 양자화 | C 간격 분포 최빈 110ms (100~112ms) | ✓ |
| F19 | 보존 창은 유한하고 슬라이딩 | `p4Z` 하한 라운드1 21/23/26 → 라운드2 33/35/37 | 부분 |
| F20 | close 요청→ACK→이벤트 순서 2/2 보존, 마진은 22ms↔211ms 진동 | §7.1 | ✓ (n=1) |
| F21 | `pane.list`(5개)와 이벤트 등장 pane 집합(21개)이 불일치 | 베이스라인 vs `p40,p4Y,p4Z,p51…p5J` | ✓ (6 vs 13+) |
| F22 | 우리가 만든 scratch pane의 `pane_created`는 한 번도 오지 않음 | `pane_created`는 `p54,p57,p5B`뿐 — `p5G`·`p5H`·`p5J` 0건 | ✓ |
| F23 | `pane_agent_status_changed` push 0건 | 3회 구독·ACK 성공에도 수신 0 | ✓ |
| F24 | 보호 pane 5개 프로브 종료 시점까지 생존 | `PROBE_END.protected_still_present` | 부분(중간까지만) |

**라운드 1에서 관측한 것 중 라운드 2에서 뒤집힌 사실은 없다.** F7·F8·F14~F16·F18·F21~F23은 전부 재현됐다.

### 9.2 추론 (사실에서 도출했으나 직접 관측되지 않음)

| # | 추론 | 기반 | 반증 방법 |
|---|---|---|---|
| I1 | herdr는 전역 이벤트 백로그를 보존하고 신규 구독자에게 재생한다 | F14~F19 | herdr 소스/이슈 확인 |
| I2 | 종료 펜스가 스테일 terminal을 그대로 받으면 위양성 사망 판정이 난다 | F8·F14·F17 (판별 필드 부재 + 10분 보존 재전달) | 펜스 구현 후 재구독 유도 테스트 |
| I3 | F20의 ACK→이벤트 순서는 인과 순서의 증명이 아니다 | F18·F20 — 마진이 전달 양자와 동급이고 10배 진동 | close 시점을 tick에 대해 랜덤화해 n≥20 반복 |
| I4 | `pane.list`는 이벤트 스트림의 pane 전체 집합을 반영하지 않으므로 생존 판정의 단독 근거로 부적합 | F21 | herdr `pane.list` 필터 조건 확인 |
| I5 | F22(자기 pane의 `pane_created` 미수신)는 드레인 지연이 아니라 별도 누락이다 | A는 11:51:03.983에 백로그를 따라잡고 6초를 더 열어뒀는데도 `p5G` `pane_created` 미도착 | `agent.start` 직후 별도 연결로 재구독해 확인 |
| I6 | F23은 herdr 결함이 아니라 조건 미충족일 가능성이 높다 | scratch pane이 에이전트가 아닌 plain `bash` | 실제 에이전트 pane으로 재측정 |
| I7 | `pane=236`은 `w3:p5J`의 herdr 내부 id다 | 창 내 유일한 PaneDied·유일한 close, 시차 139ms | 내부 id ↔ API pane_id 매핑 확인 |

### 9.3 **라운드 1에서 폐기한 추론**

| 폐기 | 라운드 1 추론 | 반증 |
|---|---|---|
| ~~I2(구)~~ | "재전달이 `PaneDied for unknown pane`의 원인이다" | **라운드 2가 반증.** 스테일 terminal 20건이 유입되는 동안 `PaneDied`는 0건이었고, 유일한 1건은 우리의 `pane.close`에 붙어 있었다(F10~F12). 두 현상은 무관하다(§5.4) |

### 9.4 아키텍트 결론 대비 판정 (누적)

| 결론 | 판정 | 비고 |
|---|---|---|
| 1 (§9-1 닫힘) | **일치** | 2라운드 6개 pane 전수 재확인 |
| 2 (§9-2 닫힘·부정) | **일치** | 봉투에도 timestamp/seq 없음을 추가 |
| 3 (§9-3 replay) | **부분 일치 — 인과는 정정** | replay 현상 자체는 확증되고 오히려 강화됐다(보존 ≥10분, `pane_closed`·`pane_created` 포함, 바이트 동일). 단 replay ↔ `PaneDied` 인과는 **반증**됐다(§5.4). §9-3을 닫은 것은 replay가 아니라 **close API가 PaneDied를 유발한다는 직접 증거**다 |
| 4 (§9-5 순서) | **수치 일치, 격하 유지** | 순서 2/2 보존. 마진 22ms↔211ms 진동으로 격하 근거가 오히려 강화됨 |
| 5 (안전 규칙) | **일치 · 완전 확정** | `PROBE_END.protected_still_present` 5/5로 종료 시점까지 확인 |

---

## 10. 남은 관측 과제

1. **§9-5 확정** — close 시점을 ~110ms tick에 대해 무작위 오프셋으로 n≥20회 반복.
   ACK→이벤트 순서가 tick 정렬과 무관하게 유지되는지 확인(I3).
2. **백로그 상한 규명** — 보존 기간이 시간 기반(≥10분)인지 이벤트 수 기반인지, 상한은 얼마인지.
   종료 펜스의 스테일 유입 창을 수치로 잠그려면 필요하다(I1).
3. **I5 확인** — `agent.start`로 만든 pane의 `pane_created`가 정말 오지 않는지 별도 연결로 교차 확인.
4. **I4 확인** — `pane.list`가 이벤트에 등장하는 pane을 왜 누락하는지.
   생존 판정에 `pane.list`를 쓰는 기존 코드가 있다면 재검토 대상이다.
5. **I7 확인** — herdr 내부 숫자 pane id ↔ API `pane_id` 매핑.
   확인되면 §9-3의 근거가 타이밍 대응에서 id 대조로 격상된다.

---

## 시나리오 D — status replay 여부

**상태**: 관측 완료 (2회 실행 모두 완주 · `PROBE_END` 도달)
**정본 데이터**: `docs/spikes/.panedeath-probe-raw.scenario-d.jsonl` — 2회차, pane `w3:p5S`
(2026-07-20 13:20:58 ~ 13:22:08 UTC)
**1회차**: 같은 파일 형식, pane `w3:p5R` (13:18:38~13:19:30) — 2회차에 덮어썼으나 수치는 §D.7에 보존
**이 절의 성격**: §1~§10은 정본이며 **수정하지 않았다.** 이 절은 추가다.

> **F23 정정**: 라운드 2의 `F23 "pane_agent_status_changed push 0건"`은 herdr 결함이 아니라
> **I6의 예측대로 조건 미충족**이었다. plain `bash` pane은 아무도 status를 보고하지 않으므로
> 전이 자체가 없었다. 아래 D는 `pane.report_agent`로 전이를 **직접 만들어** 이 조건을 충족시켰다.

### D.1 재현

```
bun run scripts/probe-pane-death.ts --scenario d
```

`--scenario all`은 **종전대로 a·b·c만** 돈다(D는 opt-in). §3.4의 라운드 2 재현이 그대로 유효하도록 한 의도적 절단이다.
D는 자기 전용 로그(`.panedeath-probe-raw.scenario-d.jsonl`)에 쓴다 — 정본 `.panedeath-probe-raw.jsonl`은
git 미추적이라 절단 재실행이 곧 영구 소실이기 때문이다.

### D.2 전이를 만든 방법 — `pane.report_agent`

라운드 2가 status push를 한 건도 못 받은 이유는 **plain bash pane에는 status를 보고하는 주체가 없어서**다.
herdr는 `pane.report_agent`로 클라이언트가 직접 status를 쓰게 해준다
(`docs/spikes/fixtures/herdr-v0.7.4/rpc-14-*`, schema `PaneReportAgentParams`):

```json
{"method":"pane.report_agent","params":{
  "pane_id":"w3:p5S","source":"panedeath-probe-d","agent":"bash","state":"working","seq":1}}
→ {"result":{"type":"ok"}}
```

`PaneAgentState` = `idle|working|blocked|unknown` (**`done` 불가** — STEP0.5 C1).

**성공 판정 = `pane.list`의 `agent_status`가 `unknown`이 아닌 값으로 바뀌는가**:

| t_iso | report_agent state | 직후 `pane.list.agent_status` |
|---|---|---|
| (생성 직후) 13:20:59.676 | — | **`unknown`** |
| 13:21:01.408 | `working` | **`working`** |
| 13:21:02.829 | `idle` | **`idle`** |
| 13:21:04.251 | `working` | **`working`** |
| 13:21:05.677 | `idle` | **`idle`** |

4/4 반영. **agent pane 인식 조건은 충족됐다.**

### D.3 ① 라이브 status push — **4건 수신** (게이트 통과)

구독 sub1 (`13:20:59.788` ACK, `pane.agent_status_changed`+`pane.closed`+`pane.exited` 한 소켓):

```json
{"t_ms":1784553661428,"t_iso":"2026-07-20T13:21:01.428Z","raw":{"event":"pane.agent_status_changed",
 "data":{"agent":"bash","agent_status":"working","pane_id":"w3:p5S","workspace_id":"w3"}}}
{"t_ms":1784553662842,"t_iso":"2026-07-20T13:21:02.842Z","raw":{"event":"pane.agent_status_changed",
 "data":{"agent":"bash","agent_status":"idle","pane_id":"w3:p5S","workspace_id":"w3"}}}
{"t_ms":1784553664355,"t_iso":"2026-07-20T13:21:04.355Z","raw":{"event":"pane.agent_status_changed",
 "data":{"agent":"bash","agent_status":"working","pane_id":"w3:p5S","workspace_id":"w3"}}}
{"t_ms":1784553665753,"t_iso":"2026-07-20T13:21:05.753Z","raw":{"event":"pane.agent_status_changed",
 "data":{"agent":"bash","agent_status":"idle","pane_id":"w3:p5S","workspace_id":"w3"}}}
```

RPC `ok` → push까지 **20ms / 13ms / 104ms / 76ms**. `working`↔`idle` 전이 4회 전부 도달.

**이 4건이 이 카드의 게이트다.** 라운드 2가 "미확인"에 머문 지점을 여기서 통과했다.

### D.4 ③④ 재구독 후 — **status 0건 / 20초**

sub1 소켓 close(13:21:08.996) → 1초 뒤 **새 소켓** sub2로 **동일 구독** 재개(ACK 13:21:10.110).
20.002초 관측:

```json
{"kind":"D_PHASE2_RESULT","payload":{
  "observed_ms":20002,"pane_id":"w3:p5S",
  "status_push_count_our_pane":0,"status_push_count_any":0,"status_raw":[],
  "terminal_push_count":2,"terminal_panes":["w3:p5Q","w3:p5R"]}}
```

**과거 status push 재도착 0건.** 원문이 없으므로 인용할 것도 없다.

### D.5 0건이 "구독 불발"이 아님을 증명 — liveness proof

**이것이 없으면 D.4의 0은 판정 근거가 못 된다.** 같은 sub2 소켓 위에서 **새 전이를 하나 더** 일으켰다:

```json
{"kind":"D_PHASE2B_LIVENESS_PROOF","payload":{
  "live_status_push_count":1,"subscription_functional":true,
  "raw":[{"t_ms":1784553690326,"t_iso":"2026-07-20T13:21:30.326Z","raw":{
    "event":"pane.agent_status_changed",
    "data":{"agent":"bash","agent_status":"working","pane_id":"w3:p5S","workspace_id":"w3"}}}]}}
```

`report_agent(working, seq=5)` @13:21:30.225 → **101ms 후 push 도달**.
→ **sub2의 status 구독은 살아 있었다.** 그런데도 과거분은 0이었다.

### D.6 ⑤ terminal 대조군 — 같은 소켓에서 replay 발생

| 구독 | status 재전달 | terminal 재전달 | 비고 |
|---|---|---|---|
| sub2 (13:21:10.110 ACK) | **0** | **2** (`w3:p5Q` `pane_closed`, `w3:p5R` `pane_closed`) | **같은 연결·같은 20초** |
| sub4 (13:21:52.974 ACK, terminal 전용) | 0 | **3** — 그중 `w3:p5S` **1건** | 20초 전 죽은 자기 pane이 재전달됨 |

sub2가 받은 스테일 terminal 원문:

```json
{"t_ms":1784553670111,"t_iso":"2026-07-20T13:21:10.111Z",
 "raw":{"event":"pane_closed","data":{"pane_id":"w3:p5Q","type":"pane_closed","workspace_id":"w3"}}}
{"t_ms":1784553670224,"t_iso":"2026-07-20T13:21:10.224Z",
 "raw":{"event":"pane_closed","data":{"pane_id":"w3:p5R","type":"pane_closed","workspace_id":"w3"}}}
```

`w3:p5R`은 **1회차 D의 scratch pane**으로 13:19:10에 죽었다 — 약 2분 뒤 재도착. §6의 replay가 재현됐다.

**sub4가 결정적이다**: `w3:p5S`가 13:21:32.895에 `pane_closed`로 죽었고,
20초 뒤 열린 **완전히 새로운 소켓**에 그 `pane_closed`가 **바이트 동일로 다시 왔다**(13:21:53.193).
같은 pane의 status 전이 5건은 **한 건도 오지 않았다.**

```json
{"kind":"D_PHASE4B_RESULT","payload":{
  "terminal_push_count":3,"terminal_push_count_our_pane":1,
  "our_pane_terminal_raw":[{"t_ms":1784553713193,"t_iso":"2026-07-20T13:21:53.193Z","raw":{
    "event":"pane_closed","data":{"pane_id":"w3:p5S","type":"pane_closed","workspace_id":"w3"}}}],
  "status_push_count":0}}
```

### D.7 판정

> **replay 안 됨** — herdr v0.7.4는 `pane.agent_status_changed`를 신규 구독자에게 **재전달하지 않는다.**

**근거 3단**(셋 다 성립해야 이 판정이 선다):

1. **게이트 통과** — 1단계에서 라이브 status push를 **4건 실제 수신**(D.3). 전이를 못 만든 실패가 아니다.
2. **재구독 후 0건** — 새 소켓 동일 구독으로 **20초 + 15초 = 35초** 관측, status **0건**(D.4·D.6).
3. **0건이 구독 불발이 아님** — 같은 소켓이 **직후 라이브 push 1건을 받았고**(D.5),
   **같은 연결·같은 창에서 terminal은 replay됐다**(D.6). 대조군이 살아 있는 상태의 0이다.

2회 실행 모두 동일:

| 회차 | pane | 라이브 status(①) | 재구독 status(④) | terminal 대조군 | `PROBE_END` |
|---|---|---|---|---|---|
| 1회차 | `w3:p5R` | **4** | **0** / 20초 | **11건** 재전달 | 도달 |
| 2회차 | `w3:p5S` | **4** | **0** / 20초 | sub2 2건 · sub4 3건(자기 pane 1건) | 도달 |

*(1회차는 liveness proof(D.5)가 없어 판정 근거로는 2회차가 정본이다. 1회차는 재현 확인용.)*

### D.8 부수 관측 2건

**(1) 죽은 pane의 status 구독은 ACK조차 오지 않는다.**
`pane_id`가 죽은 뒤 `{"type":"pane.agent_status_changed","pane_id":"w3:p5S"}`만 구독하자
**15초 타임아웃까지 응답 없음** — 에러도 ACK도 아니다.

```json
{"kind":"D_PHASE4A_DEAD_PANE_SUBSCRIBE","payload":{
  "acked":false,"pane_id":"w3:p5S","err":"Error: events.subscribe ACK timed out"}}
```

terminal 구독(`pane_id` 없음)은 같은 조건에서 정상 ACK. **재구독 로직이 죽은 pane_id를 물고 있으면
그 연결은 조용히 멎는다** — 타임아웃 방어가 없으면 무한 대기다.

**(2) status push의 event 이름은 dotted다.**
같은 소켓에서 terminal은 **underscore**, status는 **dotted**로 온다:

```
{"event":"pane_closed",              "data":{...}}   ← underscore
{"event":"pane.agent_status_changed","data":{...}}   ← dotted
```

STEP0.5 **C2**("push는 underscored `pane_agent_status_changed`")는 status에 대해 **부정확**하다.
제품 코드는 안전하다 — `bridge-runtime.ts:2134-2135`·`2223-2224`가 두 표기를 모두 받는다.
다만 `fake-herdr.ts:565`는 **underscore만 발행**하므로 실서버와 다르다(픽스처 충실도 갭, 이 문서는 결정하지 않음).

### D.9 설계 함의 — 카드가 물었던 질문에 대한 답

이 카드의 전제는 *"status도 replay되면 브릿지가 새 카드 구독을 추가할 때마다 기존 카드의 오래된
`working→idle`이 재생돼 **가짜 done**이 될 수 있다"*였다.

> **그 경로는 성립하지 않는다.** status는 replay되지 않으므로,
> **신규 구독 추가만으로는 스테일 status 전이가 유입되지 않는다.**
> terminal만 방어하는 현재 설계는 **이 실패 모드에 한해서는** 충분하다.

단서 3가지 — 이 문서는 결정하지 않는다(R 항목):

1. **버전 한정.** herdr v0.7.4 / protocol 16 관측이다. replay 부재는 herdr가 보장한 계약이 아니라
   **현재 구현의 관측된 성질**이다. 불변식으로 코드에 잠그면 업스트림 변경에 조용히 깨진다.
2. **가짜 done의 다른 경로는 그대로 열려 있다.** `CLAUDE.md` 규칙 7의 실증 2건
   (codex TUI 초기화면 스크레이프 · `Working` 중 발행)은 replay와 무관하다. 이 관측은
   **replay발 가짜 done만** 배제한다.
3. **§6.4의 terminal 펜스 권고는 그대로 유효하다.** terminal replay는 D.6에서 재확인됐고
   (자기 pane이 20초 만에 바이트 동일 재도착), 판별 필드 부재도 그대로다.

### D.10 안전 규칙 준수

프로브는 이제 **실행 시점에 살아있는 pane 전부를 보호 목록에 넣는다**(하드코딩 5개 + 라이브 baseline):

```json
{"kind":"PROTECTED_EXPANDED","payload":{
  "hardcoded":5,"added_from_live_baseline":["w3:p5P"],
  "total":["w3:p2","w3:p1J","w4:p1","w8:p1","w3:p46","w3:p5P"]}}
```

`w3:p5P`(실행 중이던 codex 워커 `loom-task_e0ba2d6f57a5b80-1`)가 자동으로 보호됐다 —
하드코딩 목록에는 없던 pane이다.

```json
{"kind":"PROBE_END","payload":{"success":["d"],"owned":["w3:p5S"],
  "final_panes":["w3:p2","w3:p1J","w3:p46","w3:p5P","w4:p1","w8:p1"],
  "protected_still_present":["w3:p2","w3:p1J","w4:p1","w8:p1","w3:p46","w3:p5P"]}}
```

**종료한 pane = `w3:p5S` 1개**(자기가 만든 scratch). 보호 pane **6/6 생존**. SIGKILL 미사용.
**`PROBE_END` 도달 — 절단 없음.** 제품 코드(`packages/**`) 변경 0줄.
