# GATE-POLICY — Loom 작업 게이트 정책 (승인 등급 · 완료 증거)

> 상태: **채택** (2026-10-24, 오너 이경식님 지시). 이 문서가 **승인 등급(R/I)과 "완료" 증거의 SSOT**다.
> 참조처: `AGENTS.md`(Standing rules) · `CLAUDE.md`(Orchestration standing rules) · `docs/WORKFLOW.md` · `HANDOFF.md`
> (`Must not` = §1의 I 등급 목록, `Done when` = §3 증거 목록). 다른 문서가 이 문서와 어긋나면 이 문서를 따른다.
>
> 변경 이력: 2026-10-24 — `~/.local/share/herdr-watch/loom-gate-policy.md` 초안 v0.1 §0–§6에서 오너 지시로 채택(loom 행만 유지).

## 0. 원칙 세 줄

1. **되돌릴 수 있는 일은 자동이다** — 읽기, 로컬 편집·테스트, temp HOME 프로브(`[herdr 전용]`·private 서버), 로컬 브랜치 커밋.
2. **되돌릴 수 없는 일·밖으로 나가는 일만 사람이 승인한다** — push/merge, 배포·DB 쓰기, 고객·PM 발송, 데이터 삭제,
   정본 재수집, 실 CLI 토큰·유료 API. 승인 범위는 `ownerDecision`(§2.1)에 기록한다.
3. **"완료"는 증거로만 선언한다** — 커밋 SHA, diff 범위, 테스트 결과, verify 레인 `meta.json`, 프로브 `summary.json`(§3).
   증거가 없으면 "진행 중" 또는 "모름"이다.

"되돌릴 수 있다"의 기준: 같은 세션이 사람 없이, 다른 세션·외부 시스템에 흔적을 남기지 않고 직전 상태로 돌릴 수 있는가.

## 1. 작업 등급표

| 등급 | 뜻 | 예 | 승인 |
|---|---|---|---|
| R0 읽기 | 상태를 바꾸지 않음 | 파일·로그 읽기, `herdr agent list/read`, `git log/diff`, `bun run status` | 자동 |
| R1 로컬 되돌림 가능 | 내 작업 트리·임시 HOME 안에서만 바뀜 | 로컬 편집, `bun test`·lint, scratchpad, temp HOME 프로브(`[herdr 전용]`·private 서버), 로컬 브랜치 커밋, `git stash` | 자동 |
| R2 공유 되돌림 가능 | 되돌릴 수 있지만 다른 세션이 볼 수 있음 | 공유 작업 트리의 미푸시 커밋, 세션 간 메시지 공지, 되돌림 스크립트가 있는 설정 변경 | 자동 + 사후 기록(HANDOFF/로그). 다른 세션 파일이면 그 세션에 먼저 묻는다 |
| I1 공유 기록 | 원격·정본에 남음 | `git push`, main 병합, 태그·릴리스 | 사람 승인 (회차마다) |
| I2 운영 반영 | 운영 시스템을 바꿈 | 라이브 launchd/systemd 등록, MBP relay 업그레이드, 배포, DB 쓰기 | 사람 승인 + 되돌림 절차 명시 |
| I3 외부 전달 | 사람·조직에게 나감 | 고객·PM 메일, 공개 게시 | 사람 승인 (문안 전체 확인) |
| I4 파괴·소진 | 되돌릴 수 없거나 비용이 듦 | 데이터 삭제, 정본 재수집·덮어쓰기, 실 CLI 토큰 소비, 유료 API·결제, 외부 계정 키 발급 | 사람 승인 + 사전 증거(백업 해시·예산) |

- 판단이 애매하면 **높은 등급**으로 본다.
- herdr pane에 키 입력·프롬프트 주입·승인 응답을 보내는 일은 그 pane이 할 행동의 등급을 따른다(행동이 I면 주입도 I).

### 1.1 기존 Loom 게이트 → 등급

| 기존 게이트 | 등급 | 비고 |
|---|---|---|
| `[herdr 전용]` 프로브 (temp HOME · private 서버) | R1 | `docs/spikes/HERDR-STATUS-PROBES.md` 머리 표 |
| `[herdr 전용]` 프로브의 shared 서버 모드 | R2 상당 (주의) | 같은 문서 §2.5 안전 블록 의무 |
| `[실 CLI — 오너 yes]` (B2·D2, `smoke:* --real-cli`) | I4 | 토큰 소비 · `--real-cli --owner-approved` 이중 플래그 |
| 라이브 launchd/systemd 등록 (`loom service` 실등록) | I2 | 되돌림 절차 명시 |
| MBP relay 업그레이드 | I2 | 되돌림 = `docs/spikes/MBP-RELAY-RUNBOOK.md` |
| `git push` · main 병합 · 릴리스 | I1 | topology `full`이면 §4 verify 증거 선행 |
| verify 레인 (`lane.ts verify`) | (게이트 아님) | topology `full`에서 I1 직전의 **필수 증거** |

## 2. 승인 규칙

- 승인은 **범위**가 있어야 한다: 무엇을 · 몇 회 · 어디에(예: "B2·D2 각 1회, `claude`만, private, §5.4 선택지 1"). 범위 밖은 새 승인.
- 승인은 **기록**한다: 결과 파일의 `ownerDecision`(§2.1)과 HANDOFF 해당 줄. 코드로 막을 수 있으면 막는다
  (예: 프로브의 `--real-cli --owner-approved` 이중 플래그).
- 승인 요청은 결정 대기열 한 곳(HANDOFF `Owner pending`)에 모은다. 요청에는 선택지·추천·근거·되돌림 방법·마감을 적는다.
- 거절·만료는 최종이다. 같은 일을 다른 경로(다른 세션·스크립트)로 다시 하지 않는다.
- "진행해" 같은 넓은 승인도 I3·I4는 항목별로 한 줄 확인한다.

### 2.1 `ownerDecision` 기록 형식 (모든 곳 공통)

```ts
ownerDecision: {
  date: "YYYY-MM-DD",            // 승인 일자
  scope: string,                  // 무엇 · 몇 회 · 어디에 (서버·HOME·kind 등 "어디" 포함)
  source: string,                 // 오너 원문 그대로, 또는 원문 위치 포인터(대화·HANDOFF 줄)
  recordedIn: string[],           // 이 결정을 적은 곳 (summary.json 경로, HANDOFF 섹션 등)
}
```

- 참조 구현: `scripts/probe-herdr-status.ts`의 `OWNER_DECISION` 상수 — B2·D2 실행의 `PROBE_BEGIN` 이벤트와 결과
  `summary.json`의 `ownerDecision`에 기록된다(실 CLI가 아니면 `null`).
- 현 구현은 `{date, source, recordedIn, scope, server, homeChoice}`다(2026-10-24 정렬): `server`·`homeChoice`는 위 `scope`의
  "어디에"를 나눠 적은 필드다.

## 3. "완료" 선언에 필요한 증거

| 작업 종류 | 최소 증거 |
|---|---|
| 코드 변경 | 커밋 SHA, diff 범위(파일 목록), 실행한 테스트 명령과 통과 수(예: `bun test` N/N) |
| 독립 검증 | `bun run scripts/lane.ts verify` 결과와 `.loom-lanes/<seq>-<lane>/meta.json`(exit 0 · 고정 모델 · `effortResolved`). 구현자와 다른 벤더 |
| 프로브·실측 | 실행 명령, run id, `summary.json`(verdict·code·facts·leftover), 판정 PASS/FAIL/INCONCLUSIVE 그대로, I4면 `ownerDecision` |
| 배포·운영 | 전후 해시·버전, 헬스체크 출력, 되돌림 경로 |
| 데이터 이동·백업 | 원본·사본 해시 대조, 개수·용량 일치 |
| 화면·UI | 스크린샷·녹화 경로. 보지 않은 화면은 "모름" |
| 외부 전달 | 보낸 문안 원문, 수신자, 발송 시각, message id |

- 증거가 일부만 있으면 "완료(제한: …)"로 쓰고 빠진 것을 적는다.
- 다른 세션의 상태를 화면으로 읽어 정본에 쓰지 않는다 — 그 세션에 메시지로 원문·시각을 받는다.

## 4. Loom 장치와의 연결

- **verify 레인**: topology `full`에서 I1(push/ship) 직전의 기본 게이트 — verify 레인 PASS 증거 없이 push하지 않는다
  (CLAUDE.md 규칙 8). `single` 강등은 오너 승인(HANDOFF `Must not`과 같음).
- **HANDOFF.md**: `Must not` = 이 문서 §1의 I 등급 항목 목록, `Owner pending` = 승인 대기열, `Done when` = §3의 필요 증거.
- **프로브 문서(`docs/spikes/`)**: 문서 맨 앞 표에 프로브 등급을 적는다. `HERDR-STATUS-PROBES.md` 결과표 형식
  (run id · verdict · code · leftover · I4면 `ownerDecision`)이 프로브 완료 증거 형식이다.
- **herdr**: 상태값(`idle/working/done/blocked`)은 완료 증거가 아니다(CLAUDE.md 규칙 7). 입력란에 쓰였지만
  전송되지 않은 지시는 승인으로 보지 않는다.

## 5. 적용 — loom

| 세션 | 자동(R) | 승인(I) | 완료 증거 |
|---|---|---|---|
| loom | PLAN 초안, TLA/TLC, 단위 테스트, temp HOME `[herdr 전용]` 프로브, 로컬 커밋 | B2 재실행·실 CLI 카드(I4), MBP relay 업그레이드(I2), 라이브 서비스 등록(I2), 릴리스 push(I1) | run id + `summary.json`, verify 레인 `meta.json`, 테스트 수, 커밋 SHA |

다른 프로젝트(lr-assist·L&R·tradelore·themeflow·Ivy 등)의 적용표는 각 저장소가 자기 규칙으로 소유한다 — 이 문서에 두지 않는다.

## 6. 열린 질문 — 미결 · 오너 결정

| # | 질문 | 상태 |
|---|---|---|
| Q1 | R2(공유 작업 트리의 미푸시 커밋)를 자동으로 둘지, 다른 세션과 같은 트리를 쓰는 경우 I1로 올릴지 | 미결 — 오너 결정 |
| Q2 | verify 레인을 loom 밖 프로젝트에도 의무로 할지, 프로젝트별 독립 리뷰를 같은 등급으로 인정할지 | 미결 — 오너 결정 |
| Q3 | 이 정책을 loom 제품 기능(카드 등급 필드·게이트)으로 넣을지, 문서 규칙으로만 둘지 | 미결 — 오너 결정 |
