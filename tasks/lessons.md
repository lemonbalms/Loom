# Lessons (agent self-improvement) — 인덱스

**이 파일 사용 규칙 (3줄):**
1. 이 인덱스는 **세션 시작 시 정독**한다(전문 아님 — 각 줄이 트리거+규칙 알맹이).
2. 작업 유형이 카테고리에 매칭되면 **착수 전 해당 `tasks/lessons/<category>.md` 로드 의무**(서사·복구 절차·실증 경위는 거기 있음).
3. 새 교훈 기록 = 여기 **인덱스 1줄 추가** + 해당 카테고리 파일에 **전문 추가**(요약·삭제 금지, 이동만).

카테고리: `orchestration` · `bridge-ops` · `verification` · `platform` · `workers` (`tasks/lessons/`).

---

## orchestration — 위임·model 명시·autonomy·next-action·PLAN 분업·레인 지시

- [orchestration] 2026-07-10 Autonomy: 게이트마다 "이어서 할까요?" 금지 — 웨이브 체인 자율 진행(멈춤 조건 4가지).
<details><summary>경위·좌표</summary>

[orchestration] 2026-07-10 Autonomy: 게이트마다 "이어서 할까요?" 금지 — status→다음 게이트 실행→웨이브 체인→자연 종료 시 커밋. 멈춤은 MAJOR 모호성·비가역 손상·사람전용 비밀·명시적 "멈춰"뿐.

</details>

- [orchestration] 2026-07-11 Delegation split: 대량 기계작업은 하위 모델이 편집, 세션 모델이 diff 검수. 권한 확대 self-edit은 분류기 거부.
<details><summary>경위·좌표</summary>

[orchestration] 2026-07-11 Delegation split: 대량 기계작업은 하위 모델 서브에이전트가 편집, 세션 모델(Fable)이 diff 검수. `~/.claude/CLAUDE.md` 권한 확대 self-edit은 분류기 거부 — 정확한 편집 노출 후 오너 재승인 대기.

</details>

- [orchestration] 2026-07-11 Impl delegated: 승인/락된 스펙은 세션 모델이 직접 코딩 금지. 레인 다운 = 체인 하강.
<details><summary>경위·좌표</summary>

[orchestration] 2026-07-11 Impl delegated: 승인/락된 스펙은 세션 모델이 직접 코딩하지 않음. 레인 다운 = 체인 하강(grok→codex→하위 in-harness 모델), 하드코딩 라이선스 아님. 스테일 HANDOFF 신뢰 금지, 레인 가용성 재확인.

</details>

- [orchestration] 2026-07-12 Next-action test: "실패하면 새로 뭘 배우나?" — 못-실패 액션(문서작업·그린 재실행)은 실격.
<details><summary>경위·좌표</summary>

[orchestration] 2026-07-12 Next-action test: 자가 선택 액션 전 "실패하면 새로 뭘 배우나?" — 못-실패 액션(그린 재실행·오너 블로커 대기·문서작업)은 실격. HANDOFF "don't redo" 교차확인 후 가장 무서운 검증가능 체크 선택.

</details>

- [orchestration] 2026-07-18 (5) 오너 레인 지시: 구현·자문 전부 herdr pane dispatch, 긴 스펙은 파일+짧은 프롬프트. 디스패치 전 스키마 실측.
<details><summary>경위·좌표</summary>

[orchestration] 2026-07-18 (5) 오너 레인 지시: 구현·자문 전부 herdr pane dispatch, 긴 스펙은 파일+짧은 프롬프트. codex 기본 argv=승인프롬프트 모드(무인은 `-a never -s workspace-write` 등 신뢰결정 선행). R{n} fable-advisor 필수와 충돌 시 오너 확인/기록. **재범 2026-07-20**: headless 오라우팅(스테일 "allowlist=claude만" 신뢰) — agentKind 3종 pane은 0.23.2+ 지원(`card-contract.ts:20`), 디스패치 전 스키마 실측.

</details>

- [orchestration] 2026-07-19 (7) PLAN 컨텍스트 최소화: 본세션 코드정독 금지 — 조사·볼륨 위임, 판단·락-인접만. "규모 작아도" 예외 없음.
<details><summary>경위·좌표</summary>

[orchestration] 2026-07-19 (7) PLAN 컨텍스트 최소화: 본세션 직접 코드정독 금지 — ① 서브에이전트 증거팩 수집 ② 본세션은 판단-무거운 스펙 문안만. **"규모 작아도" 예외 없음**(20줄 스크립트·북키핑·조사도 위임). 성격으로 가름(판단·락-인접=본세션 / 볼륨·조사=위임).

</details>

- [orchestration] 2026-07-19 (8) model 명시 필수: Agent 도구 미지정=Fable 조용한 상속=결함. 기본 `opus`, `fable`은 fable-advisor뿐.
<details><summary>경위·좌표</summary>

[orchestration] 2026-07-19 (8) model 명시 필수: Agent 도구 미지정=Fable 조용한 상속=결함. 스폰 시 model 명시, **기본 `opus`**, `fable`은 fable-advisor뿐. 위임 직전 orchestration 스킬 로드 선행.

</details>

- [orchestration] 2026-07-19 (18) 전체 스위트 = 아키텍트 몫: 워커가 중도 중단을 정직 보고하면 재디스패치 불요.
<details><summary>경위·좌표</summary>

[orchestration] 2026-07-19 (18) 전체 스위트 = 아키텍트 몫(위임 경계): 워커가 전체 `bun test` 중도 중단을 **정직 보고**하고 DONE 마커 보류 시 **재디스패치 불요** — 전체 회귀 판정 provenance는 애초 아키텍트 독립 실행이 SSOT(verification (4) 동시-실행 금지의 연장). 워커 deliverable = 신규 유닛 + 구현까지, 전체 스위트는 아키텍트 독립 실행으로 완결. 보드는 done 전이(중도 중단 ≠ 워커 실패, 과잉 주장 회피가 올바른 거동). 이번 실증(v0.25.0 IMPL-0250 grok, 538/0). cross-ref: verification·workers.

</details>

- [orchestration] 2026-07-20 (20) 코드 락 vs 문서 규칙: 코드 강제 3/3 준수 · 문서만 4/4 위반(기록해도 재범).
<details><summary>경위·좌표</summary>

[orchestration] 2026-07-20 (20) 코드 락 vs 문서 규칙: 같은 세션에서 **코드로 강제된 규칙 3건**(M-1 dispatcher allowlist · L-2 `result.node`↔assignee 정합 · PreToolUse hook의 Agent `model` 필수)은 **3/3 전부 위반을 막았고**, **문서에만 있던 규칙 4건**(orchestration 스킬 로드 · board claim 선행 · pane 카드 우선 · 마커 echo 오탐 주의)은 **4/4 전부 위반됐다**. 특히 마커 echo 오탐은 lessons에 **이미 기록이 있었는데도 재범** — "기록하면 다음에 안 틀린다"의 반례다. 규칙을 새로 만들 때는 문서에 쓸지 코드로 잠글지를 먼저 판별하라. 판별 기준 정본 = `docs/spikes/RULE-ENFORCEABILITY.md`(§7 판별표·§7.1 우선순위).

</details>

- [orchestration] 2026-07-20 (24·34) 레인 분리: 구현=grok · 검증=codex · 자문=fable(발견자≠수정자). `subagent_type` 지정 ≠ 실제 레인 — 신원 고지 의무, 폐기는 발견자≠수정자로 판정.
<details><summary>경위·좌표</summary>

[orchestration] 2026-07-20 (24) 검증 레인 분리(CLAUDE.md 규칙 5): **구현 = `grok`** · **검증 = `codex`** · **자문 = `fable-advisor`**(read-only). 검증을 구현자와 같은 레인에 주면 교차 검증이 성립하지 않는다 — 발견자와 수정자를 분리해야 한다. 이번 웨이브 실증: codex가 **아키텍트의 진단 오류**(`PaneDied for unknown pane` 오독)와 **감지기 결함 2건**을 잡아냈다. 같은 레인이었다면 자기 산출물을 자기가 승인하는 구조라 셋 다 통과했을 것이다. cross-ref: verification (23)·bridge-ops (21).

</details>

- [orchestration] 2026-07-20 (27) 위임 범위 축소가 정합성을 깬다 — 참조처까지 최소범위. **편집뿐 아니라 조사·스캔 범위도**(재범 3회).

- [orchestration] 2026-07-21 (46) **레인 다운 시 재배정은 문자가 아니라 목적으로** — 발견자≠수정자+벤더 다양성 성립 여부. 워커 임의 대체는 결함. grok 헤드리스=읽기전용 allowlist 필수.

## bridge-ops — 주입 레이스·card.done·pane 정리·TUI 제출 함정·still-running·스크레이프 상한

- [bridge-ops] 2026-07-18 잘린 peer ID: `loom peers` 표 ID는 표시용 절단값 — allowlist엔 전체 ID. 수정 후 브릿지 재시작 필수.
<details><summary>경위·좌표</summary>

[bridge-ops] 2026-07-18 잘린 peer ID: `loom peers` 테이블 ID는 표시용 절단값 — allowlist엔 **전체 ID**(`~/.loom/profiles/<name>.json` `peerId`) 사용. allowlist 수정 후 브릿지 재시작 필수(재시작이 큐 dispatch 재처리).

</details>

- [bridge-ops] 2026-07-18 (2) 주입 레이스: 스폰 직후 프롬프트가 워커 TUI 스타트업 중 유실(에이전트 무관). 0.23.5+ 자동복구.
<details><summary>경위·좌표</summary>

[bridge-ops] 2026-07-18 (2) 주입 레이스: 스폰 직후 프롬프트가 워커 TUI 스타트업 중 유실 — 에이전트 무관(claude·grok·codex 공통). 수동 복구는 `pane read`로 composer 빈 것 확인→`agent send "<wrapped>"`→별도 `agent send $'\r'`(실제 CR)→working 확인. **0.23.5+ 브릿지는 자동복구(재주입)** — 수동은 0.23.4 이하/진단용만. 제출 확인은 항상 working 전이/composer 비움 직독. 상세 로드 권장(TUI별 CR 함정·codex Tab 큐잉).

</details>

- [bridge-ops] 2026-07-18 (3) §5.2 스크레이프 상한: Claude Ink TUI 접힘으로 `paneRead` ~5.3k 포화. 모델별 마커 거부 거동도 여기 기록.
<details><summary>경위·좌표</summary>

[bridge-ops] 2026-07-18 (3) §5.2 스크레이프 상한: Claude Ink TUI는 트랜스크립트를 접어 `paneRead`가 소스·줄수 무관 ~5.3k 포화 — 32k artifact 분기 라이브 도달 불가. herdr 자체는 스크롤백 보존(원인은 TUI 접힘). **모델별 마커 거부 거동도 여기 기록**(Fable만 자율 수행, Sonnet 5·Opus 4.8은 injection형 거부 — capable 워커 스모크는 benign goal-ack형 설계). cross-ref: workers.

</details>

- [bridge-ops] 2026-07-18 (4) card.done 유실: 같은 브릿지 2번째+ 카드 pane 구독 사망 — 0.23.4 해소. 마커 감시 이중방어는 유지.
<details><summary>경위·좌표</summary>

[bridge-ops] 2026-07-18 (4) card.done 유실: 같은 브릿지 2번째+ 카드 pane 이벤트 구독 사망(후보 ⑫). **해소 0.23.4 `c7df503`** — card.done 인박스 신뢰 회복, "새 카드 전 재시작" 워크어라운드 해제. 마커 감시 이중방어 유지(echo 오탐 주의). 긴 브리프는 저장소 내부 untracked 파일(grok `/private/tmp` 샌드박스 읽기 실패).

</details>

- [bridge-ops] 2026-07-18 (7) TUI 3종 composer 가시성: claude(Ink)만 Pasted 플레이스홀더+꼬리. 인박스/보드 grep은 짧은 접두사로.
<details><summary>경위·좌표</summary>

[bridge-ops] 2026-07-18 (7) TUI 3종 composer 가시성: claude(Ink)=Pasted 플레이스홀더+꼬리 원문(줄바꿈 쪼개짐 주의, 두번째 paste는 append), grok/codex=원문 전체. **인박스/보드 grep은 짧은 접두사**(전체 18자 ID는 `loom inbox` 절단표시로 미매치). 관찰 ⓔ: codex 완주해도 `agent_blocked` 회신 불일치.

</details>

- [bridge-ops] 2026-07-18 (6) "입력만 되고 미제출": 성공경로 감시로는 미제출 idle이 안 보임 — 실패신호에 "idle+composer 잔류" 포함.
<details><summary>경위·좌표</summary>

[bridge-ops] 2026-07-18 (6) "입력만 되고 미제출": 성공경로 감시(마커·inbox·pane 소멸)로는 미제출 idle이 안 보임. ① 주입 직후 제출 성사 확인 ② 모니터에 "idle+composer 잔류 텍스트" 실패신호 포함 ③ 제품 verify 루프 3분기(해소 0.23.5 — 브릿지 경로 자동, ①②는 수동 주입 시 유효).

</details>

- [bridge-ops] 2026-07-19 카드 완료 인지: board 폴링은 자기참조 — 신호는 inbox `card.done`(짧은 주기 감시).
<details><summary>경위·좌표</summary>

[bridge-ops] 2026-07-19 카드 완료 인지: board 폴링은 자기참조(전이는 tower가 claim해야 발생) — 신호는 inbox `card.done`. 발사 후 inbox 짧은 주기 감시, 회수는 claim 스크립트(parse→apply→accept).

</details>

- [bridge-ops] 2026-07-19 (2) card.done 조기 회신(still-running 중 스크레이프) — 0.23.7 해소. pane 마커 재확인 유지.
<details><summary>경위·좌표</summary>

[bridge-ops] 2026-07-19 (2) card.done 조기 회신: 워커 "1 command still running" 중 스크레이프해 조기 회신. **해소 0.23.7 `1160b38`** — still-running 지표 감지→10s 폴링·5분 상한 유예→실완료본 회신. card.done 후에도 pane 마커 재확인 이중방어 유지.

</details>

- [bridge-ops] 2026-07-19 (6) `agent read`=JSON 봉투 vs `pane read`=평문. 미푸시 커밋 급감은 `git fetch` 먼저.
<details><summary>경위·좌표</summary>

[bridge-ops] 2026-07-19 (6) 0.23.11 웨이브: `agent read`=JSON 봉투(`.result.read.text` 추출 필수) vs `pane read`=평문. claude TUI 말미 비콘텐츠 줄 다가족(상태줄·bare ❯·✻ 동사·● effort) 순차 보정. 미푸시 커밋 급감 시 워커 push 의심 전 `git fetch`로 오너 병렬 세션 확인.

</details>

- [bridge-ops] 2026-07-19 (17) 멀티룸 dispatch: `dispatchCard`는 active 바인딩 룸으로만 — `loom relay use` 전환 후 발사·회수.
<details><summary>경위·좌표</summary>

[bridge-ops] 2026-07-19 (17) 멀티룸 dispatch 라우팅: `dispatchCard`는 `loadSession()` **active 바인딩 룸**으로만 나감 — 룸이 흩어지면 `loom relay use <name>` 전환 **후** 발사, 회수도 바인딩별 인박스. `@node` 어드레싱 자체는 기완비(신규 표면 없음). `loom bridge status`는 foreground bun 브릿지서 **false offline**(프로세스 직접 확인) · 원격 WSL 명령은 base64 래핑 · VPS stat은 UTC.

</details>

- [bridge-ops] 2026-07-20 (21) `card.done` ≠ 완료 — 종료코드·시그널로 실패 판정 금지.
<details><summary>경위·좌표</summary>

[bridge-ops] 2026-07-20 (21) `card.done` 수신 ≠ 완료. **인과 주의(codex 교차검증 정정)**: pane이 죽어서 가짜 done이 나는 것이 아니라, **브릿지가 완료 후보를 너무 일찍 `done`으로 커밋하고 그 결과로 `pane.close`를 호출**한다(`finishCard()` — `bridge-runtime.ts:2310-2323`). 따라서 ① 산출물은 **아키텍트가 워킹트리에서 독립 검증**해야 확정되고 ② **종료 코드·시그널만으로 실패를 판정하지 마라** — 정상 cleanup에서도 exit 129/SIGKILL이 나온다(실측: pane **215·217**은 `status=done` result 전송 뒤 **106ms/4ms** 만의 정상 정리였다). ③ `PaneDied for unknown pane`은 **herdr 내부 경고**이지 브릿지가 통지를 버렸다는 증거가 아니다 — 아키텍트가 이 오독으로 오너에게 **틀린 진단을 보고**했다. 설계 정본 `docs/spikes/PANE-DEATH-DESIGN.md`. cross-ref: orchestration (24).

</details>

- [bridge-ops] 2026-07-20 (22) 임시 셸 감시 금지(4연속 실패) — `watch-card.ts`.
<details><summary>경위·좌표</summary>

[bridge-ops] 2026-07-20 (22) 임시 셸 감시 4연속 실패: 손으로 짠 감시가 **매번 다른 곳에서** 뚫렸다 — ① 마커만 보고 **pane 사망을 놓침** ② "codex는 안 죽는다"는 **관측을 가정으로 승격**해 소멸 감시를 제외 → 사용자 수동 종료를 놓침 ③ macOS **bash 3.2 연관배열 미지원**으로 즉사하며 "35분 경과" **거짓 성공** 보고 ④ 마커 검출 후 종료하지 않아 **알림 미전달**. 규칙 = 임시 셸 감시 금지, **`scripts/watch-card.ts` 사용**(종료 사유를 exit code로 구분: `marker`=0 · `pane-gone`=1 · `limit`=2 · `timeout`=3). **완주와 사망을 같은 코드로 뭉개지 마라** — 그것이 거짓 성공의 근원이다. cross-ref: bridge-ops (21)·verification (23).

</details>

## verification — 차집합 판정·dist 재빌드 순서·독립검증·provenance·힌트 교차검증

- [verification] 2026-07-11 Provenance: config가 예상과 다르면 툴 탓 전에 오너 선택 여부 확인 — 방금 고른 설정 임의 원복 금지.
- [verification] 2026-07-19 (4) 아키텍트 독립 `bun test`는 워커 스위트와 동시 실행 금지 · 스모크 bare `sleep N` 금지.
<details><summary>경위·좌표</summary>

[verification] 2026-07-19 (4) 0.23.10 웨이브: ① 아키텍트 독립 `bun test`를 워커 검증 스위트와 동시 실행 금지(공유자원 경합 플레이크) — card.done 후 시작. ② 스모크 페이로드 bare `sleep N` 금지(still-running 유예 소진). ③ rewind 유실 복구는 claude-mem 관찰이 SSOT. cross-ref: bridge-ops(②)·orchestration(③).

</details>

- [verification] 2026-07-19 (10) 차집합 판정: 통합 테스트 회귀에 절대 수치 금지 — HEAD 베이스라인 fail 차집합만(단위·typecheck는 OK).
<details><summary>경위·좌표</summary>

[verification] 2026-07-19 (10) 차집합 판정: 통합 테스트 fail의 회귀 판정은 **절대 수치 금지** — 환경마다 스위트 수치 통째로 변동. HEAD 베이스라인 worktree에서 동일 스위트 돌려 fail 집합 확보 후 **차집합**만 본다(차집합 0=신규 회귀 없음). 단위 스위트·typecheck는 절대 수치 OK.

</details>

- [verification] 2026-07-19 (11·36) 위임 **전에** 핸드오프 스코프 대조(`git log`+mem) — 스테일 3회.
<details><summary>경위·좌표</summary>

[verification] 2026-07-19 (11) 핸드오프 힌트 교차검증: 스코프 힌트의 핵심 전제("신설이다"·규모/버전)를 증거수집 위임 **전에** claude-mem으로 1회 대조 — 힌트는 직전 세션 가설일 뿐. 이번엔 "신설 MINOR"가 실제로 "배선 갭 PATCH"였음(persist.ts 기존재). **재실증 2026-07-20**: 잔존-Low 표기("claude 상태줄 chrome 미커버")가 기해소(0.23.11 ①) 스테일 — 착수 전 증거팩/claude-mem 대조가 무코드 종결로 판정.

</details>

- [verification] 2026-07-19 (12) 구현 중 pre-push dist-guard 실패는 정상. 순서 = 구현 커밋→검증→`build:cli`→dist 커밋→push.
<details><summary>경위·좌표</summary>

[verification] 2026-07-19 (12) dist 재빌드 순서: 워커 구현 진행 중 pre-push dist-guard 실패는 **정상 신호**(커밋된 번들 vs 반제품 소스) — 통과시키려 재빌드-커밋하면 미검증 반제품 유출. 순서: 구현 커밋→검증→`build:cli`→dist 커밋→push.

</details>

- [verification] 2026-07-19 (13) 라이브 스모크: CLI 표면 없는 툴은 리포 내부 드라이버 · localhost 매핑 자멸 · 실손 경로 직접 재현.
<details><summary>경위·좌표</summary>

[verification] 2026-07-19 (13) 라이브 스모크 방법론: ① CLI 표면 없는 툴(`conv_fetch`)은 워크스페이스 밖 `bun -e` 모듈 해석 실패 → **리포 내부 상대-import 드라이버 스크립트**로 호출(MCP 경유가 정식). ② localhost 매핑은 원격 소스=로컬 dest 동일 경로라 D5 덮어쓰기 거부로 **happy-path 자멸** → happy-path는 실 원격 노드 필수. ③ 유닛이 이미 잠근 단계(M-D wire→저장)만 **합성 씨딩으로 우회**하고 나머지 실행 경로는 전부 라이브 실증 — 우회 사실+그 단계 유닛 커버리지를 명기해 실증 공백 없음을 못박음. ④ 스모크는 happy-path만이 아니라 R40 명시 **실손 경로(M-B 오염 host·D6 sha 격리)를 직접 재현**해 방어 발화 확인. 스키마 정규식이 좌표를 실제 게이트(`conv_smoke0250` 실거부).

</details>

- [verification] 2026-07-20 (23) 설계 문서도 틀린다 — 좌표는 실행 경로로 검증하라.
<details><summary>경위·좌표</summary>

[verification] 2026-07-20 (23) 설계 문서도 틀린다 — 실행 경로로 검증하라: `HOOK-CACHE-FIX-DESIGN.md` **§5가 패치 대상으로 `context-generator.cjs`를 지목**했으나 그것은 **데드 번들**이었다(호출처 0건). 승인된 설계 문서의 좌표라도 그대로 믿고 편집하면 아무 효과 없는 패치를 "적용 완료"로 보고하게 된다. **정적 grep이 아니라 훅이 실제로 실행하는 커맨드에서 출발해 호출 사슬을 따라가야** 진짜 좌표(`worker-service.cjs`의 `qJ()`/`eQ()`)가 나온다. codex 교차검증이 이를 confirm했다. cross-ref: orchestration (24)·platform (19).

</details>

- [verification] 2026-07-20 (25) `watch-card`를 파이프로 실행 금지 — 종료 코드가 `tail`의 0이 돼 사망이 완주로 둔갑.
<details><summary>경위·좌표</summary>

[verification] 2026-07-20 (25) 감시 도구의 종료 코드를 파이프로 파괴하지 마라: 아키텍트가 `bun run scripts/watch-card.ts … | tail -20`으로 실행했다. 파이프라인 종료 코드는 마지막 명령(`tail`)의 **0**이 되므로, `watch-card`가 exit **1(`pane-gone`)**로 애써 구분해준 **사망을 완주로 오독**했다. stdout에는 `exit=pane-gone`이 찍혀 있었는데 종료 코드만 보고 "완주"로 보고했다. 이는 bridge-ops (22) "완주와 사망을 같은 코드로 뭉개지 마라"의 **재범**이며, 이번엔 도구가 아니라 **호출 방식**이 원인이다. 규칙 = `watch-card`는 **파이프 없이** 실행하고 종료 코드를 직접 읽어라. 파이프가 꼭 필요하면 `PIPESTATUS`/`set -o pipefail`을 쓰라. cross-ref: bridge-ops (22).

</details>

- [verification] 2026-07-20 (26) 관측자를 관측 대상과 같은 생명주기에 두지 마라 — 완주 마커 존재로 검증.
<details><summary>경위·좌표</summary>

[verification] 2026-07-20 (26) 관측자를 관측 대상과 같은 생명주기에 두지 마라: PANE-DEATH 스파이크에서 pane 사망을 관측하는 프로브를 **워커 pane 안에서** 돌렸다. pane이 죽자 프로브도 함께 죽어 시나리오 C가 절단됐고, `PaneDied` 로그 스크레이프가 **한 번도 실행되지 않았다**. **절단은 조용했다** — 마지막 줄은 문법적으로 유효한 JSON이었고 부분 산출물이 완전한 것처럼 보였다. pane 밖(하니스 백그라운드)에서 재실행하니 즉시 완주했고, **바로 그 마지막 단계가 §9-3을 닫는 결정적 증거**를 냈다. 규칙 = ① 무언가의 **죽음을 관측하는 도구는 그 죽음의 영향권 밖에서** 돌려라 ② 프로브 산출물은 **완주 마커(`PROBE_END`)의 존재로 검증**하라 — 줄 수나 파일 존재로 판단하지 마라. 좌표: `scripts/probe-pane-death.ts` · `docs/spikes/PANE-DEATH-OBSERVATIONS.md` §2. cross-ref: verification (25)·bridge-ops (21).

</details>

- [verification] 2026-07-20 (28) 부정 결과엔 게이트+대조군 필수 — 없으면 "없음"이 아니라 "미확인".

- [verification] 2026-07-21 (30) 미실측 상수로 정확성 갭을 닫지 마라 — 타임아웃·grace는 튜닝값일 뿐. 불변식으로 하중 이전.
<details><summary>경위·좌표</summary>

[verification] 2026-07-21 (30) 미실측 상수로 정확성 갭을 닫지 마라: 아키텍트가 reconcile cadence(`+1s / poll 5s / grace 3s / 연속 2회 / 최대 12회 / commit_unknown 10분`)를 **실측 없이** 설계 락에 넣었다. codex 3차가 ① 그 수치가 **새 High를 생성**(`present` 카운터 리셋 미규정 → 60초 넘게 도는 **건강한** flight가 `commit_unknown`으로 떨어져 완료 경로 소멸) ② 원래 막으려던 **두 실패 모드 어느 쪽도 배제 못함**(`pane.list` 가시성 지연 **상한 미실측**)을 잡았다. codex 원문: *"수치는 유리한 타이밍에서 확률을 낮출 뿐 불가능하게 만들지 못한다."* fable-advisor: 실측으로도 못 닫는다 — **실측은 분포를 줄 뿐 상한을 주지 않는다**(느린 것과 죽은 것의 원격 구별 불가 = 분산시스템 고전 한계). 규칙 = 상수는 **운영 튜닝 파라미터일 뿐 correctness 근거가 아니다**. 안전성이 상수에 의존하면 상수를 조정하지 말고 **불변식으로 하중을 옮겨라**: "불확실한 관측은 회복 가능한 행동만 유발한다. 비가역 행동은 결정적 증거 또는 멱등 경로에서만." cross-ref: verification (28)·(31).

</details>

- [verification] 2026-07-21 (31) 2회+ 연속 reject에 매번 새 결함 = 구조 문제. 축자 반영 중단 → 불변식 1개에서 유도.
<details><summary>경위·좌표</summary>

[verification] 2026-07-21 (31) 반복 reject는 문안 문제가 아니라 구조 문제 신호: `PANE-DEATH-DESIGN.md`가 **3연속 reject**. 매 라운드 대응이 "지적을 축자 반영"이었고 **매번 새 모순**이 났다 — 1차(High 3) → 락 문안 교체 → 본문과 자기모순 → 2차 High / 2차(High 1) → 본문 9지점 통합 → **요약 표 1곳 누락** + 아키텍트 수치가 새 High 생성 → **3차(High 2)**. fable-advisor 진단: **락들이 공유 불변식 없이 개별 패치로 누적된 결과** — 문안을 덧댈수록 상호 정합성 검증 부담이 조합적으로 커져 수렴하지 않는다. 규칙 = **2회 이상 연속 reject + 매번 새 결함**이면 반영을 **중단**하고 "이 문서/코드에 **공유 불변식이 있는가**"를 묻는다. 없으면 **불변식 1개를 정본으로 세우고 나머지를 거기서 유도해 재작성**하고, 리뷰어에게도 **"N개 문안"이 아니라 "불변식 1개 + 유도"**를 검증 대상으로 제시하라 — 모순 생성 경로 자체가 닫힌다. cross-ref: orchestration (27)·verification (30).

</details>

- [verification] 2026-07-21 (32) "결정적 증거를 어디서 구하나"는 틀린 질문 — "증거가 불확실해도 안전한 구조"를 물어라.

- [verification] 2026-07-21 (33·37) **지적·verdict는 존재의 증거일 뿐 서술의 증거가 아니다** — 전칭 부정은 코드 대조 · 자문엔 내 리스크 서술도 검증 대상임을 명시 · **자문 용어 기각은 채택보다 높은 입증 책임**(락 본문만 보면 폐기 식별자 부활함)

- [verification] 2026-07-21 (38) **인용 단위는 줄이 아니라 블록** — 락 인용 시 본문+표+註가 한 단위(4회 재범 정정).

- [verification] 2026-07-21 (39) **정정 지시의 근거도 실측이어야 한다** — 서브에이전트 실측("14")으로 원장 수치("15")를 뒤집는 정정 지시 전 아키텍트 직접 재실측 선행. 워커의 "코드=SSOT 반증+판단요청" 절차가 오정정 차단(정례). (38)의 위임-실측 확장.

- [verification] 2026-07-21 (40) **skip 블록 안 어서션 = 검증된 적 없는 어서션** — 소스-락은 환경 게이트 밖에.

- [verification] 2026-07-21 (41) **env는 생성 시점 latch** — `start()` 아닌 생성자 확인. describe 본문은 훅보다 먼저.

- [verification] 2026-07-21 (42) **앰비언트 env 오염은 테스트를 사라지게 한다** — 판정은 pass/fail 아닌 **총수+실행시간**.

- [verification] 2026-07-21 (43) **세션 메모리 서술도 검증 대상** — 오진 3회 동일 원인. 인과엔 대조군 선행.

- [verification] 2026-07-21 (44) **정의부 존재 ≠ 호출의 증거** — 동작 주장엔 호출부 grep. 자문의 "미확인"을 자기 실측으로 뒤집을 땐 한 단계 더.

- [verification] 2026-07-21 (45) **diff 방향이 인과를 뒤집는다** — A→B diff에서 A의 신규 파일은 "삭제"로 보인다. 계보=`merge-base`+parent, 삭제=`--diff-filter=D`.

## platform — Windows·WSL·경로 sep·크로스플랫폼 배포

- [platform] 2026-07-19 (13) 경로 sep 하드코딩 금지(`node:path` `sep`). 신규 플랫폼 첫 배포는 라이브 스모크 필수.
<details><summary>경위·좌표</summary>

[platform] 2026-07-19 (13) 경로 sep: 프리픽스/포함 비교에 `"/"` 하드코딩 금지 — `node:path` `sep` 사용(Windows 백슬래시 경로에서 스냅샷 쓰기 전멸했던 `persist.ts:389`). 신규 플랫폼 첫 배포는 테스트 green 무관하게 핵심 경로 라이브 스모크 필수(POSIX 유닛은 Windows 의미론 미커버). 부정 테스트 불가 시 containment 어서션으로 재정의(R39 M-1).

</details>

- [platform] 2026-07-19 (14) Windows 원격 3함정: PS 5.1 stderr 래퍼 즉사 · SSH 프로세스 동반사 · `bun install -g` EBUSY.
<details><summary>경위·좌표</summary>

[platform] 2026-07-19 (14) Windows 원격 3함정: ① PS 5.1 `$ErrorActionPreference="Stop"`+PS `2>>`는 네이티브 stderr 첫 줄에 래퍼 즉사 — `cmd.exe /c "... 1>>log 2>>err"` 경유. ② SSH 세션 프로세스는 세션 종료 시 사망(가짜 방화벽 증상) — Scheduled Task 등 세션 독립 런처. ③ `RestartCount`는 비영 종료 미적용 + `bun install -g` EBUSY — 리포 번들 직접 실행.

</details>

- [platform] 2026-07-19 (15) WSL 노드 브릿지 5함정: 데몬 SSH 동반사망 · PATH 미소싱 · root 거부 · config 재주입 · 분류기는 독립 레이어.
<details><summary>경위·좌표</summary>

[platform] 2026-07-19 (15) WSL 노드 브릿지 5함정: ① 데몬도 SSH 종료 동반 사망 — `setsid nohup … &`. ② 비로그인 셸 `~/.bashrc` PATH 미소싱 — `/usr/local/bin` 심링크. ③ root+`--dangerously-skip-permissions`=Claude 거부(`inject_unconfirmed`로 위장) — user `permissions.allow`+workspace 신뢰. ④ `bridge start --allow`는 config 재주입 트랩 — config 미리 쓰고 bare start. ⑤ 오너 제품승인 ≠ Claude 분류기 허가(독립 레이어, 해제는 오너 `!` 직접 — 오너 대화 승인으로도 미해제, (16) VPS서 재실증 · **Mac 본세션 dist 커밋·push도 차단 실증 v0.25.0** — 소스 커밋 통과, dist/push만).

</details>

- [platform] 2026-07-20 (18) hook 스펙 3사실: 출력 10,000자 캡 · `SessionStart`는 resume도 발화 · 명령형 주입문은 방어에 걸림.
<details><summary>경위·좌표</summary>

[platform] 2026-07-20 (18) Claude Code hook 스펙 실측 3사실(공식 문서 대조): ① hook 출력은 **10,000자 캡** — 초과 시 파일화(우리 SessionStart를 state/lessons 2분할한 근거). ② `SessionStart`는 **resume에서도 실발화**(source=resume — claude-mem matcher엔 resume 없어 우리 hook과 중복 없음). ③ **명령형 주입문은 프롬프트-인젝션 방어에 걸릴 수 있어** 사실 서술형으로 작성(AGENTS 센티널·hook 컨텍스트 문안이 명령형 회피). cross-ref: 핸드오프 전환 최적화 웨이브.

</details>

- [platform] 2026-07-20 (19) hook 캐시 3실측: `source` 4종(fork 포함) · 한 이벤트 커맨드 2개=완료순 concat=캐시 파괴 · 캡 초과=영구 미스.
<details><summary>경위·좌표</summary>

[platform] 2026-07-20 (19) hook 캐시 3실측: ① SessionStart `source`는 **4종**(startup/resume/clear/**fork**) — `--fork-session`은 독립값이라 `startup|clear` matcher가 배제. ② 한 이벤트에 hook 커맨드 2개 = **완료 순서 concat = 캐시 파괴**(`41b0877` 자초, 길이 동일 순열이라 길이비교로 미검출). ③ 10,000자 초과 = 조용한 절단 아님 — 디스크 영속화 + 2,000자 프리뷰 + **세션마다 바뀌는 UUID 2개 경로 봉투** = 영구 미스 + 왕복 부활.

</details>

- [platform] 2026-07-19 (16) VPS(sudo-less) 3함정: bridge cwd=소스 리포 · PATH는 `~/.bashrc` 삽입 · 파일-복제 이식.
<details><summary>경위·좌표</summary>

[platform] 2026-07-19 (16) VPS(sudo-less·non-root) 노드 3함정: ① bridge 기동 cwd = 소스 리포(`~/.loom-src`) 필수 — `bridge-spawn.ts:29` bridgeMainPath()가 import.meta(bun link 심 miss)→`cwd+packages/host/src/bridge-main.ts` 2단 해석이라 홈 기동은 "Cannot find bridge-main.ts" 즉사. ② sudo-less PATH = `/usr/local/bin` 불가 → `~/.bashrc` 인터랙티브 가드 앞에 PATH 블록 삽입(`sed -i '1r …'`, 비로그인 셸 해결). ③ Option B′ 파일-복제 이식 = 경로-독립 `settings.json` 그대로 복사 + `.claude.json` 신뢰 2키 python 병합(기존 클로버 금지, 스크립트화 가능). git 없는 노드는 `git bundle` scp→clone(GitHub 접근 불요).

</details>

## workers — 모델별 거부 거동·sonnet 스모크·claude-mem 루프·grok 커밋 폭주

- [workers] 2026-07-19 (3) grok 스펙 밖 커밋: always-approve grok이 지시 없이 커밋·push — brief에 "커밋/푸시 금지" 표준 문단 필수.
<details><summary>경위·좌표</summary>

[workers] 2026-07-19 (3) grok 스펙 밖 커밋: always-approve grok 워커가 지시 없이 커밋·push 자체 수행 — brief에 "커밋/푸시 금지, 검증까지만, ship은 아키텍트/오너 결정" 표준 문단 포함.

</details>

- [workers] 2026-07-19 (5) claude 스모크 sonnet 강제: `agentArgv.claude` 스왑→재기동→스모크→**원복+재기동**이 한 절차. 페이로드 benign형.
<details><summary>경위·좌표</summary>

[workers] 2026-07-19 (5) claude 스모크 sonnet 강제(오너 지시): 스모크 claude 워커는 sonnet — config `agentArgv.claude`를 `["claude","--model","sonnet"]`로 스왑→재기동→스모크→**원복(`["claude"]`)+재기동**까지 한 절차(R{n} 리뷰는 Fable 필수, 원복 잊으면 사고). 페이로드는 benign goal-ack형.

</details>

- [workers] 2026-07-19 (9) sonnet claude-mem 거부 루프: 거부가 저장돼 benign 페이로드까지 재거부 — 처음부터 benign, 거부 시 새 카드.
<details><summary>경위·좌표</summary>

[workers] 2026-07-19 (9) sonnet claude-mem 거부 루프: 거부가 claude-mem에 저장돼 후속 benign 페이로드까지 재거부(공유-홈 오염은 자연문 승인 대기 유발까지 확산). 규칙 = 처음부터 benign goal-ack형 설계 · 거부 시 새 카드로 교체 · `permission_prompt` 재현은 수동 pane 스폰 + 워커 argv `--permission-mode default` 스왑. 신 마커(0.26.1) 무거부 완주 1회 실증했으나 변인 2개라 단독 효과 단정 금지.

</details>

- [workers] 2026-07-20 (29) pane 레인 반복 실패 시 DOGFOOD_LOOP §1.2로 in-harness 하강.

- [workers] 2026-07-21 (35) idle 통지 ≠ 실패 — nudge 1회 표준, 회신 전 워킹트리·`git diff --stat`으로 산출물 먼저 확인.
