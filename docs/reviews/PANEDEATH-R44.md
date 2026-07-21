# PANE-DEATH R44 검증 원장 — 통합 설계 (PLAN v0.28.0 입력)

검증 대상 `docs/spikes/PANE-DEATH-UNIFIED-DESIGN.md` (커밋 `694e08c`, 579줄).
설계 작성 = **Fable 5**(오너 지시 2026-07-21: *"중요한 결정을 최상위 모델에 위임한다"*).
좌표의 `:N`은 별도 표기 없으면 `packages/host/src/bridge-runtime.ts`.

> **본 원장은 R44 산출물의 기록이며, 기존 리뷰 원장 8본(`PANEDEATH-CODEX-REVIEW*.md` ·
> `PANEDEATH-R43{,B,C,D,E}.md`)은 수정하지 않는다.** 아키텍트 반영(§4)은 확정이다.

---

## 1. Verdict

**`pending-revision` — High 0건 · Medium 4건 · Low 5건. 전량 문서 국소 수정으로 닫힘(코드 변경 불요).**
**→ 아키텍트가 같은 세션에서 Medium 4건 + Low 2건 반영 완료(§4). 잔여 Low 3건은 §5.**

**레인 (고지 의무 — 교훈 34):**

| 시도 | 레인 | 결과 |
|---|---|---|
| 1차 | **codex** (표준 검증 레인, 규칙 5) | **unavailable** — 계정 사용량 하드 한도(리셋 2026-07-25 14:27). `codex-cli 0.144.6` 설치·PATH 정상, `"reply with OK"` 자명 프로브도 동일 오류. **워커가 임의 대체를 거부하고 구조화된 오류로 반환** |
| 2차 | **grok** (아키텍트 재배정) | **실행됨** — `grok 0.2.106` / `grok-4.5` / `effort=high`, 14 turns · 71 tool calls, `stopReason=end_turn` |

**재배정 근거:** 설계 작성자가 Fable 5(Anthropic)이므로 grok(xAI)이면 **벤더 다양성**과
**발견자≠수정자**가 둘 다 성립한다. 규칙 5의 문자(검증=codex)에서 벗어나되 **목적(교차 검증 성립)은
유지**했다. 후속 구현은 Claude 레인으로 돌린다(grok을 구현에 다시 쓰면 발견자=수정자가 된다).

**grok 레인 구동 이력(재현용):** 첫 3회 실패 — ① `${T:+$T 600}` zsh 미분할 exit 127
② `--permission-mode acceptEdits`로 `run_terminal_command`가 `PermissionCancelled`(헤드리스는 ask
프롬프트를 못 띄우고 즉시 취소) ③ `dontAsk`도 프로젝트 `.claude/settings.local.json`의 ask 정책을
못 넘김. **4회차에 읽기 전용 커맨드 allowlist를 세션 스코프로 부여해 성공.** git은
`log/show/diff/status/rev-parse/ls-files/merge-base/blame/grep/cat-file/branch/worktree list`만 허용해
커밋·푸시·체크아웃을 **권한 계층에서 차단**했다. 사용자 설정 파일 미수정.
read-only 확인: HEAD·`git status` 불변, md/ts 313개 shasum 전량 동일.

---

## 2. 자기모순 전수 검사 — **0건**

이 트랙 **3연속 reject의 근인이 이번엔 재발하지 않았다.** (1차 = 좌표 드리프트 · 2차 = 락
자기모순(락을 고치자 본문이 반대 전이를 명령) · 3차 = **요약 표 1곳**이 옛 전이를 서술해 High 미종결)

grok이 6개 축으로 대조했고 반대 전이·반대 권한 서술 **0건**:

1. §0 D1~D10 ↔ §1.2 전이
2. §1.2 cleanup ↔ §3 ↔ U3 ↔ G-3
3. §1.2 ACK ↔ U5 ↔ §2.3 ① ↔ §4.2 ↔ G-5
4. §4.1 ↔ U6 ↔ D4
5. §0.3-3 / D7 ↔ U8 ↔ §7 후속 C
6. G-1~G-9 ↔ U1~U7

문면 긴장 2건은 모순이 아니라 **명명 혼재**로 강등 — "strict ACK 3분기"(현행 코드 서술) vs
"2+1분기"(목표 상태). §2.3 ①이 rejected를 흡수하므로 전이 방향은 동일. → §4에서 명명 규약으로 종결.

---

## 3. 지적

### 3.1 좌표 대조 — 검사 87 / 불일치 5

아키텍트 기확인분(U1 5곳 · U3 3곳 · U6 · U2)도 **재실측 통과**.

| # | 문서 | 실측 | 심각도 |
|---|---|---|---|
| 1-3 | §2.2 Flight-less `:850 :1114 :1204` | 각각 **conv 라벨 비교 · pool tab `try {` · Stop hint** — 셋 다 `sendFailedResult`가 아니다. 실경로 = `:893`(payload_invalid) `:1160`(agent_kind_not_allowed) `:1250`(herdr_spawn_failed) | **Medium** |
| 4 | §4.2 `herdr-lifecycle.test.ts:366-367` "정확 1건 패턴" | `:366`은 status fetch 주석. 해당 파일의 유일한 `toHaveLength(1)`은 **`:169`**(pane.closed) | **Medium** |
| 5 | l.18 기준 커밋 `89dd931` | 검증 HEAD는 `694e08c`(`89dd931`은 증거 팩 커밋) | Low |

### 3.2 High — **없음**

### 3.3 Medium

1. **Flight-less 3경로 좌표 드리프트**(§2.2). "상당" 완화 표현이 있으나 **U4 각주·구현 탐색 경로에
   실려 있어** 이 트랙 교훈의 재발형. 처방: `:893 :1160 :1250`으로 교체, 구 좌표는 역사로만.
2. **§4.2 ↔ §4.3 accepted 관측점 비정합 (실질 최중요).**
   §4.2 accepted 필수 어서션 ①은 `awaitCardResult` payload 1건인데, §4.3은 같은 행을 **ACK 주입
   테스트 ①·①b**(`impl-0270.test.ts:662-705`, `setHandoffAckInjection`)로 이식한다. 그런데 그 주석
   (`:669-671`)이 축자로 *"Injection early-returns without wire send — assert termination branch only
   (tower inbox reach is covered by `pane-cleanup.test.ts` real-relay path)"* 다 → **동시 성립 불가.**
   구현자가 **red 고정 또는 payload 어서션 생략** 중 하나를 고르게 되며, 교훈 40 닫힘이 불완전해진다.
   **처방: 주입 seam / 실 relay 분기 분리.**
3. **§4.2 경쟁 패자 패턴 좌표 오인용**(위 표 #4).
4. **D4/§4.2의 "3분기 구별" 표현 과대.** 목표 상태는 accepted vs 비수락(단일 `send_unknown`)
   **2갈래**이고 rejected는 reason 접두로만 남는다(§2.3 ①). 방향 동의·기제 기각은 타당하나 정밀화 필요.

### 3.4 Low

1. 기준 커밋 표기 `89dd931` → `694e08c`.
2. D7 교차참조 "§1.4" 오지정(본문은 §0.3-3 · §1.3).
3. "3분기"/"2+1분기" 명명 통일 권고.
4. D10 map-miss 무로그 — `:2001-2011` silent return 확인. §5 이관은 맞으나 **G-표 명시 항목 없음**(누락에 가까움).
5. §0.3 헤더 "5건" vs 본문 1~6.

### 3.5 §0.3 "아키텍트가 놓친 것" 사실성 — 전건 확인

| # | 주장 | 판정 |
|---|---|---|
| 1 | `rejected` = quarantine 미진입 + 정규식 휴리스틱 | **확인** — `:2778-2780`이 `enterSendUnknown` 없이 return, 판정은 `/reject\|denied\|forbidden\|invalid/i`. **아키텍트 직접 재확인** |
| 2 | `pane_exited` 비테스트 소스 전무 | **확인** — production 0건(리포 전체는 untracked 스크립트 1건뿐). **아키텍트 직접 재확인** |
| 3 | absent-합성이 issuer 발행 예산을 태움 | **확인(유도)** — 현재 합성 코드 0(`enterPresenceUnknown` void `:2139`)이나 `result-issuer.ts:46-49` `acquire("initial")` 1회 구조상 반사실 유도가 코드 모델과 일치 |
| 4 | quarantine `process_exit`가 미해소를 해소로 fold | **확인** — `result-quarantine.ts:128-133` `open.delete`, `:361-392` 종료 시 전 미해소 append. **단 구현 의도는 미확인** |
| 5 | issuer 생성 시점 문서-코드 불일치 | **확인** — 생성은 발행 진입 `getOrCreate` `:2537-2540` · `:2635` |
| 6 | 운영자 ack production 0건 | **확인** — `store.ack`는 `impl-0270.test.ts:217`뿐 |

### 3.6 항목 6·7

- **U8 vs R43b §4 "락 11 재론 기각":** grok은 **충돌 없음**으로 봤다(본 설계가 R43b가 말한 (C) 본체에
  해당). 다만 **근거 제시가 얇다** — 정합 표 한 줄로만 다뤘고 R43b §4 축자 대조를 보이지 않았다.
  → **§5 UNVERIFIED로 이월.**
- **범위·U11 liveness debt:** 락 재론·범위 재획정 불요. 과장 기재 지적 없음.

---

## 4. 아키텍트 반영 (확정 — 같은 세션)

| 지적 | 반영 | 좌표 |
|---|---|---|
| **M1** 좌표 드리프트 | `:893 :1160 :1250`으로 교체(각각 `await sendFailedResult({` 실측 확인) + **구 좌표를 역사로만 쓰라는 註** 신설 | §2.2 |
| **M2** accepted 관측점 비정합 | **accepted 행을 (a) 주입 seam / (b) 실 relay 2행으로 분리.** (a) = 종결 분기 + pane 보존 + quarantine 미증가(**payload 요구 금지**), (b) = payload 정확 1건 + 각인 + board `blocked`. §4.3에서 ①·①b를 (a)로 라우팅하고 **(b) 행을 신설 의무화** — (b)가 없으면 "전달됐는가"가 **어떤 테스트로도 관측되지 않는다**. 재발 경위 註 추가 | §4.2 · §4.3 |
| **M3** 테스트 좌표 오인용 | `herdr-lifecycle.test.ts:169`로 교체(전수 grep 확인 — 해당 파일 유일) | §4.2 |
| **M4 + L3** "3분기" 과대·명명 혼재 | **명명 규약 註 신설**: "3분기"=현행 코드(`SendResultOutcome` 3값 `:2671-2679`), "2+1"=목표 상태. **관측이 구별할 것은 accepted인가 아닌가 2갈래뿐**이고 비수락 내부 사유는 quarantine `reason` 문자열의 몫임을 명시 | §4.1 |
| **L1** 기준 커밋 | `89dd931` → `694e08c` 정정(초판이 증거 팩 커밋을 적었음) | l.18 |

**M2 반영의 성격 — 재발 차단:** 이 함정은 **v0.27.0 구현 검증에서 이미 한 번 발생했다.** 아키텍트가
발견한 유닛 결함 ⓑ가 정확히 *"①·①b가 주입 ACK(전송 우회)와 tower 도달을 동시 요구"*였고, 그때
종결 분기 단언으로 재작성하며 `impl-0270.test.ts:669-671` 주석을 남겼다. **설계 층에서 같은 요구가
되살아났다.** 반영 註에 이 경위와 함께, 심을 relay로 옮기는 안이 그때 이미 기각됐다는 사실(ACK 위조
심을 신뢰 경계 안에 두는 자기모순)을 명시했다.

---

## 5. 잔여 (미반영 Low 3건 + UNVERIFIED)

**미반영 Low:** L2(D7 교차참조 §1.4 오지정) · L4(D10 map-miss 무로그의 G-표 명시) · L5(§0.3 헤더
"5건" vs 본문 6). 전부 북키핑이며 **PLAN v0.28.0 작성 시 동반 정정**한다.

**UNVERIFIED — "없음"과 구별(교훈 28):**

*grok 자기 신고분:*
1. relay 명시-거부 봉투의 **실제 wire 형상** — 정규식 휴리스틱에 실측 근거 없음
2. `pane_exited`가 `pane.closed` 구독으로 전달되는지 — 처리 코드 0건만 확인, **프로브 미실행**
3. 브랜치 `bridge.test.ts` +244줄 전량 정독 미완
4. `process_exit` fold의 **원래 구현 의도** — 결함 판정은 설계의 해석
5. `bun test` · 라이브 스모크 · dist 대조 미실행(지시대로)
6. ACK 주입 경로에서 `resultPhase`/`relayAcceptedAt`의 **테스트 관측 가능성** ← M2 반영의 전제
7. 브랜치 워크트리 HEAD `dfc1eeb` 태그 정렬 전수 미확인

*보고자 추가:*
8. **"검사한 좌표 87"이라는 수치 자체는 미검증** — 표본 6개를 재실측해 일치를 확인했을 뿐, 87건
   전수를 재현하지 않았다
9. **U8 ↔ R43b §4 충돌 여부는 실질 미검증**(§3.6)
10. shell 명령 3건이 allowlist 밖이라 차단됨 — grok이 read_file/grep으로 우회했으나 **그 3건이
    겨냥한 확인은 이뤄지지 않았을 수 있다**

**⚠️ 6번은 M2 반영의 전제다** — accepted (a) 행이 요구하는 "종결 분기 + quarantine 미증가" 양성
어서션이 주입 경로에서 **실제로 관측 가능한지**는 구현 착수 시 **가장 먼저 확인할 것**. 관측 불가로
판명되면 (a) 행의 어서션을 재설계해야 한다(교훈 40의 재범 위험 지점).

---

## 6. 다음

**PLAN v0.28.0 작성** — 본 설계를 PATCH 단위로 분해. 잔여 Low 3건 동반 정정.
구현 레인 = **Claude**(grok은 R44 검증자이므로 발견자≠수정자 유지). codex 레인 복구 후에는
**UNVERIFIED 9번(U8↔R43b §4)을 우선 재검증**한다 — 락 철회의 정당성이 걸린 유일한 미검증 항목이다.
