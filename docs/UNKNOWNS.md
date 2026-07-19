# Unknowns — 지도 ≠ 영토

| Field | Value |
|-------|--------|
| **Document** | `docs/UNKNOWNS.md` |
| **Role** | 미지 템플릿 + 게이트별 **짧은** 표 |
| **SSOT** | **아님** — 제품 계획 SSOT는 `docs/PLAN.md` |
| **Workflow** | `docs/WORKFLOW.md` **§3.5** |
| **Last updated** | 2026-07-20 |

---

## 왜 있는가

프롬프트·PLAN·스킬은 **지도**다. 코드·보안·툴체인·실제 UX는 **영토**다.  
그 간극이 **미지(unknowns)** 이고, 에이전트는 여기서 추측 결정을 한다.

이 파일은 미지를 **값싸게** 드러내기 위한 체크리스트다.  
규칙 본문: WORKFLOW §3.5.

| 이름 | 의미 |
|------|------|
| **Loom** | 제품 |
| **Fable 5 / fable-advisor** | 리뷰 에이전트 |
| **Unknowns** | 작업 방법론 (제품명 아님) |

---

## 템플릿 (게이트마다 복사)

```markdown
## 0.X.Y — <한 줄 제목>
| 분면 | 내용 |
|------|------|
| Known knowns | … |
| Known unknowns | … |
| Unknown knowns | … |
| Unknown unknowns | … |
```

---

## Gate log

### 0.26.0 — hooks 보조 센서 (claude 워커 상태 힌트 · 스파이크 최소 배선 5단계)

| Field | Value |
|-------|-------|
| **PLAN** | v0.26.0 (`pending-review`) |
| **Date** | 2026-07-20 |
| **Review** | R41 required (신규 config hook 주입 옵션 + 브릿지-로컬 소켓 리스너 = 신규 신뢰 경계; **경량 예상** — `inject-control` 선례·신규 wire/MCP 없음) |

| 분면 | 내용 |
|------|------|
| Known knowns | 스파이크 실측 확정분(정본 `docs/spikes/HOOKS-SENSOR-SPIKE.md`): (1) **3상태 hook 매핑** — 승인 대기=`Notification`(matcher `permission_prompt`)·턴 종료/유휴=`Stop`(또는 `idle_prompt`)·작업 시작=`UserPromptSubmit`/`SessionStart`, matcher로 승인 대기와 단순 유휴가 **깔끔히 분리**(승인만 골라 잡음). (2) **배선 지점 전부 기존재** — 스폰 훅포인트·argv 조립(`resolveAgentArgv`)·이벤트 합류부(`onCardHerdrEvent`)·still-running 유예 poll이 코드에 이미 있어 hookHint 우선 분기를 **얹기만** 함. (3) **fail-open exit 규약** — 관측 훅은 exit 2여도 워커 흐름 차단 불가 → 항상 exit 0, `UserPromptSubmit`/`SessionStart` stdout만 컨텍스트 주입 함정(비움 필수). (4) **`inject-control` 선례** — loomDir 0600 소켓 + `isPathUnderLoomDir` 가드·no_listener 폴백이 승인된 정본(여기선 방향만 역전 — 브릿지가 리스너/서버). 이득 empirical 입증 완료(2026-07-20, 근거 중~강 — 통증 2 승인 미탐지 정면). |
| Known unknowns | U1~U6(아래 표) — 전부 PLAN §0.26.0 Unknowns 요약. 요지: claude 워커 배포 버전의 hook 표면 실재·`--settings` 인라인 주입 실작동·소켓 리스너 생명주기·`Stop`↔유예 상호작용·서브에이전트 라우팅·계측 JSONL 회전이 라이브 실측 대상. |
| Unknown knowns | hook은 "훅이라서 신뢰"가 성립하지 않는다(워커/훅 스크립트가 emit — §2.5.2③) → 페이로드는 신뢰 입력이 아니라 **완료 힌트로만** 소비, 실제 결과 회수는 스크레이프 유지·본문 정본은 §5.1 artifact. hook 미주입/`no_listener`는 현행과 **바이트 동일**(fail-open, 회귀 0) — 신규 판정 경로가 아니라 기존 판정에 우선 분기를 얹는 additive. |
| Unknown unknowns | 워커 claude 버전업 시 hook 이벤트/matcher 표면 변동(스파이크는 읽기-전용 조사라 라이브 미발화); 브릿지가 서버(방향 역전)로서 다수 워커 소켓을 장시간 watch할 때의 리소스·스테일 소켓 누적; hook 페이로드 경로가 여는 미지의 간접 프롬프트 주입 표면(stdout 함정 외). |

**Unknowns 요약 (정본 = PLAN §0.26.0):**

| # | 요지 | 무회귀 대비 |
|---|------|-------------|
| U1 | claude 버전별 matcher 지원 편차(`permission_prompt`/`idle_prompt`·팀 워커 matcher v2.1.198+) 미검증 | 미지원 버전 = hook 미발화 → D5 폴백으로 무회귀, 이득 발생 버전 실측 필요 |
| U2 | `--settings` 인라인 JSON 주입이 워커 claude에서 실제 hook 발화시키는지 라이브 미검증 | 인라인 JSON/파일/env 중 실작동 방식을 라이브 스모크로 확정 |
| U3 | 브릿지 소켓 리스너 생명주기·정리 원자성(`hook-<cardId>.sock` unlink 시점·재-cardId 충돌) | 스테일 소켓·경합 정책 미정 |
| U4 | `Stop` 힌트 ↔ still-running 유예 상호작용(백그라운드 실행 중 `Stop`이 조기 완료 유발 위험) | D3 "done 최종 권위=기존 경로"가 막는지·스크레이프 still-running과 AND 결합 실측 |
| U5 | 서브에이전트 문맥 라우팅(`session_id`/`agent_id` 부모-자식 귀속) | 부모 카드 귀속 vs 별도 표면화 미정 |
| U6 | 계측 JSONL(D6) 회전·크기 상한 (0.24.1 룸 스냅샷 GC 후속 동계열) | 회전/상한/GC 정책 미정 |

**Next:** R41(claude-rev + fable-advisor 필수) → approved 후에만 구현(레인 위임). 라이브 스모크로 **U1**(버전별 matcher 발화)·**U2**(`--settings` 인라인 주입 실작동)를 해소하고 실측 결과를 PLAN `Implemented` 블록에 명기.

### 0.24.2 — Windows 실배포 결함 2건 (persist 경로 가드 구분자 오탐 + 메시지 핸들러 uncaught 크래시)

| Field | Value |
|-------|-------|
| **PLAN** | v0.24.2 (`pending-review`) |
| **Date** | 2026-07-19 |
| **Review** | R39 required (보안·신뢰 경계 — 경로 가드 계약 변경; PATCH여도 필수) |

| 분면 | 내용 |
|------|------|
| Known knowns | 결함 근인 2건 코드 대조 확정: (1) `persist.ts:389` 가드 `path.startsWith(realState + "/")`가 POSIX `"/"` 하드코딩 — `roomStatePath`(`persist.ts:67-69` `join()`)의 Windows 백슬래시 경로와 불일치해 **모든 스냅샷 쓰기 거부**(0.14.x부터 잠복, Windows relay가 0.24.1 전까지 항상 ephemeral이라 미발화·유닛은 POSIX 전용). `path`는 realState 파생이라 **구분자만이 유일 실패 모드**. (2) `room.ts:751` create의 fail-closed rethrow가 `server.ts:176` `handleMessage` 호출부(ws message 콜백)에 try/catch 부재 → uncaught → **bun 프로세스 종료**(나쁜 create 1건 = 서버 전멸). 기존 개별 op catch는 `server.ts:317·392·485·510`(handleMessage 내부 회신·비-rethrow). 라이브 실증: v0.24.1 Windows 재배포 후 첫 room create에서 relay 사망 2회 재현·err.log 스택 `Snapshot path escapes state dir` 포집. |
| Known unknowns | (1) D2 가드(message 콜백 외곽 전역 방어) 외 다른 op의 persist 경유 추가 uncaught 표면 — op별 실패 UX(무응답 vs 명시 error envelope) 차이. (2) 대소문자/8.3 단축 경로 변형이 `realpathSync` 산출에 섞일 가능성(파생-경로 구조상 무해 논증이나 Windows 실기 확인은 배포 후). |
| Unknown knowns | 가드 교정은 **신규 정책이 아니라 기존 계약의 크로스플랫폼 복원** — `node:path`의 `sep`는 join과 짝을 이루는 정본 구분자이며, POSIX 판정은 문자 그대로 불변(`sep === "/"`). "가드 완화"가 아니라 "Windows에서만 깨져 있던 정상 판정의 복구". |
| Unknown unknowns | Windows 고유 FS 의미론(파일 잠금·안티바이러스의 rename 간섭)이 원자쓰기/스냅샷 경로에서 후속 발화할 가능성; ephemeral→durable 전환으로 Windows 팀 relay에 처음 디스크 쓰기가 실제 발생하며 드러날 미지의 경로/권한 상호작용. |

**Next:** R39(claude-rev + fable-advisor 필수) → approved 후에만 구현(레인 위임). 라이브 스모크 = Mac 로컬(0.24.1 절차 재사용) + Windows 재배포 라이브(room create 성공→스냅샷 생성→Task 재시작→룸 생존). 이 웨이브가 0.24.1 유예분(Windows 재로그온 룸 유지)을 완결.

### 0.24.1 — relay 룸 영속화 배선 갭 (`loom relay` 포그라운드 durable)

| Field | Value |
|-------|-------|
| **PLAN** | v0.24.1 (`pending-review`) |
| **Date** | 2026-07-19 |
| **Review** | R38 required (보안·신뢰 경계 — peerSecret 평문 스냅샷의 적용 범위 확대; PATCH여도 필수) |

| 분면 | 내용 |
|------|------|
| Known knowns | durable 경로 전 체인이 기구현·정상 — 영속화(`persist.ts` RoomSnapshotV1)·기동 복원(`room.ts:687` `loadFromDisk`→`:709-732`, 초대코드 byCode `:720`·`:730`)·멤버십/secret 복원(`room.ts:102-151`, M-22/M-7)·M-23 락(`room.ts:682` acquire·`:691-696` close). 로컬 데몬 durable 실측(`~/.loom/relay-state` 3스냅샷·15:00 갱신). relay 재시작 룸 소실 4회가 **전부 포그라운드 경로**(`index.ts:3204` 무-registry `RelayServer`). durable 배선 정본은 `relay/cli.ts:38-80`(데몬 CLI). |
| Known unknowns | (1) Mac에서 로컬 데몬 relay 구동 중 `loom relay` 포그라운드 실행 시 기본 stateDir(`~/.loom/relay-state`) 충돌 → M-23 락 fail-closed 발화 빈도가 운영상 수용 가능한지(escape hatch 2종 `LOOM_RELAY_EPHEMERAL`·`LOOM_RELAY_STATE_DIR`로 대응). (2) Windows(NTFS)에서 chmod 0600·mkdir 락 의미론 — 코드는 chmod try/catch fail-safe 기확인(`persist.ts:216-220`), 락은 mkdir 원자성이나 Windows 실검증은 배포 후로 유예. |
| Unknown knowns | "Production durable ON by default"가 이미 제품 방침(`relay/cli.ts:41` 주석) — 포그라운드도 그 방침의 적용일 뿐, 신규 정책 결정이 아니다. |
| Unknown unknowns | 스냅샷 무한 누적의 장기 영향(GC 부재 — `maybeGc` no-op `room.ts:765-767`, D7 후속); 두 relay 프로세스가 서로 다른 stateDir로 같은 포트를 경합하는 배치 오류류. |

**Next:** R38(claude-rev + fable-advisor 필수) → approved 후에만 구현(레인 위임). 라이브 스모크 = `loom relay` 포그라운드 durable 왕복(룸 생성→SIGTERM→재기동→초대코드 join). Windows 실증은 오너 배포 후 유예.

### 0.23.0 — conv 멀티턴 수직 슬라이스

| Field | Value |
|-------|-------|
| **PLAN** | v0.23.0 (`pending-review`) |
| **Date** | 2026-07-18 |
| **Review** | R25 required (새 MCP 표면 4도구 + M-1/M-2 신뢰 경계 집행 코드 + 프로토콜 인접) |

| 분면 | 내용 |
|------|------|
| Known knowns | `docs/CONV_SPEC.md`가 R24 author-close로 `approved`(M-1 conv↔peer pin·M-2 artifact ref 검증 규약 locks 반영 + L-1..L-5 완료); 0.22.0이 herdr 연결점(데몬·dispatch/done 컨트랙트·M-1 dispatcher 인가·M-2 제출 분리)을 이미 검증·shipped; `card-contract.ts`/`bridge-runtime.ts`/`herdr-client.ts` 선례가 conv 계약·브릿지 확장의 미러 대상; relay 와이어 protocol v1 무변경 원칙(attachment 컨벤션만)이 0.22.0에서 실증됨; 오너가 conv 멀티턴 트랙을 명시 승인(HANDOFF.md, 2026-07-18). |
| Known unknowns | (1) `conv_await` 블로킹의 MCP 클라이언트별 tool-call 타임아웃 상호작용 — 실측 필요(CLI마다 타임아웃 편차 가능); (2) 워커 pane 수명과 conv 수명 불일치 — pane이 죽으면 conv는 pause인가 abort인가(CONV_SPEC 미명시); (3) 32k 임계 판정과 herdr pane 스크레이프 기반 요약 회신의 정합 — `pane.read` 단발 회수가 실시간 턴 크기를 정확히 반영하는가; (4) artifact fetch 명령 "제시"의 UX 표면 — 워커 CLI 프롬프트 노출 vs 사람 승인 큐(미정, 자동 실행은 비-스코프로 확정됐으나 제시 방식은 미정). |
| Unknown knowns | M-1 pin과 M-2 검증 함수 둘 다 "이미 존재하는 집행 원시(fromPeerId 서버 지정)를 코드로 옮기는" 성격 — R23 locks 구현 경험(allowlist·제출 분리)이 그대로 이전 가능할 가능성이 높으나 conv의 다턴 특성(pin이 대화 전체 수명 동안 유지)이 카드 dispatch의 1회성 인가와 실제로 동형인지는 구현 중 확인 필요. |
| Unknown unknowns | conv 세션 상태(pin·last-seen turnSeq·한도 카운터)의 영속화 경계 — 타워 재시작 시 진행 중 conv의 pin/seq 상태가 살아남아야 하는지 스펙이 명시하지 않음; 브릿지 측 herdr `agent send` pane 주입이 다턴 대화에서 반복될 때 pane 상태 누적(컨텍스트 오염)의 실제 동작은 0.22.0 단발 dispatch에서 검증되지 않은 영역. |

**Next:** R25(claude-rev + fable-advisor 필수) → approved 후에만 구현(레인 위임). CONV_SPEC과 충돌 발견 시 PLAN 0.23.0의 "R25 질의"에 기록하고 구현 보류.

### 0.22.0 — Loom×Herdr 노드 브릿지 (수직 슬라이스)

| Field | Value |
|-------|--------|
| **PLAN** | v0.22.0 (`pending-review`) |
| **Date** | 2026-07-17 |
| **Review** | R23 required (새 데몬 표면 + MCP 표면 확대 + 원격 프롬프트 주입 신뢰 경계) |

| 분면 | 내용 |
|------|------|
| Known knowns | handoff는 durable inbox로 전달 보장(persist fail-closed); peerSecret rejoin(M-7); 데몬 관례 완비(메타 사이드카·Bearer IPC·M-27 안전 stop); work-bus `[GOAL]`/`[DONE]` 태그 dispatch 선례; **Step 0 go** — WSL→Windows relay는 Win10 NAT 게이트웨이 IP 경로(health `version:1` + join 왕복 실측); **Step 0.5 go** — herdr v0.7.4 NDJSON 소켓 표면 실측 + fixture 고정(보정 C1–C3 설계 반영) |
| Known unknowns | (1) 장기 `events.subscribe` 구독 안정성 — 절단 시 재구독·이벤트 유실·at-most-once dispatch 보장(재연결 순서 ①재핸드셰이크→②재구독→③스냅샷 reconcile로 설계, 실증 미완); (2) inbox 100건 trim vs 장기 오프라인 브릿지의 카드 유실 허용 여부; (3) 워커 pane 자동 제출이 M-2와 별도 신뢰 모델로 승인 가능한가(R23 판단); (4) 브릿지 AgentKind — `bridge` enum 확장 vs `shell` 유지(슬라이스는 shell, 확장은 와이어 인접이라 별도 게이트); (5) 실제 Claude/Codex detection이 `done`을 언제 emit하는가(Step 0.5 잔여 — 배시 프로브만 검증됨) |
| Unknown knowns | herdr `done` 롤업의 정확도 — 에이전트가 정말 끝났는가 vs idle 오판(PTY spike의 idle 감지 교훈이 이 경계에도 적용될 것); "이벤트에 출력 본문 없음 = 백프레셔 설계"라는 권고 문서 해석의 타당성 |
| Unknown unknowns | WSL 절전·Windows 재부팅 시 브릿지/소켓 생존(Step 0 ⑥ 30m soak 생략됨); herdr AGPL 결합 경계가 배포 형태에 따라 달라지는 지점; Bun WS 클라이언트 장시간 연결의 미지 동작; herdr pre-1.0 와이어 변동(protocol 16 기준 fixture 고정으로 완화) |

**Next:** R23(claude-rev + fable-advisor 필수) → approved 후에만 구현(레인 위임). fake herdr는 `docs/spikes/fixtures/herdr-v0.7.4/` 고정.

### 0.21.0 — PTY handoff inject (pending-review R22)
| 분면 | 내용 |
|------|------|
| Known knowns | 기반코드 존재(`handoff-inject.ts` `prepareInjectText`/`injectIntoStdin` experimental); PTY 실행 래퍼(`run-with-pty.py`); R1이 default no-go·opt-in deferred로 판정; 안전조건 3개(idle+accept+opt-in) 이미 정의됨 |
| Known unknowns | **에이전트 유휴 감지 방식**(Claude hooks vs 출력 quiescence 휴리스틱, 오탐 처리); 제어 채널(named pipe/unix socket/sticky RPC/fd); accept→inject 구동 위치(`loom run` vs sticky host) |
| Unknown knowns | 주입 텍스트를 에이전트가 실제 사용자 입력으로 처리하는지(Phase 1.5 수동 매트릭스 미완 — Claude Code부터 채움); busy-중 주입의 실패 양상이 에이전트별로 다를 수 있음 |
| Unknown unknowns | Claude Code 버전업 시 hooks/TUI 동작 변화; PTY 래퍼(python)와 Bun 프로세스 간 신호/소유권 경합; 주입이 에이전트 세션 상태를 오염시키는 미지 경로 |

### 0.20.0 — Tier A3 `loom doctor` 자가진단 (pending-review)

| Field | Value |
|-------|--------|
| **PLAN** | v0.20.0 (`pending-review`) |
| **Date** | 2026-07-11 |
| **Review** | R21 required (새 CLI 서브커맨드 표면). **구현은 다음 세션** |

| 분면 | 내용 |
|------|------|
| Known knowns | 진단 표면 다 존재: `Bun.which`/loomCmd(install), `loomDir`/`getActiveProfile`(home), `loadSession`(session), `parseRelayUrl`/`isLoopbackHost`+`/health`(relay), `resolveLiveHostMeta`/`describeHostMeta`/`stickyRpc`(host). Docker 하네스가 실패 모드(PATH·unzip·loopback) 이미 노출. |
| Known unknowns | (1) exit code 계약 — 항상 0 vs `fail`시 non-zero vs `--strict`. (2) `/health` 프로브 타임아웃(오프라인 relay 매달림 방지). (3) 세션 없음(설치 직후) 첫 실행 출력이 유용한가. (4) read-only 보장 — auto-host 절대 안 띄움. |
| Unknown knowns | 낯선 사람은 "무엇이 틀렸는지"가 아니라 "다음 한 걸음"을 원함 → 각 fail에 조치 힌트 필수. |
| Unknown unknowns | 비표준 셸/컨테이너/CI에서의 health GET 동작·타임아웃, describeHostMeta가 stale pid를 live로 오판하는 경계. |

**Next session:** R21 → 0.20.x implement(`cmdDoctor` + dispatch + 테스트) → docs.

### 0.19.0 — Tier A1 5분 설치 경로 install script (pending-review)

| Field | Value |
|-------|--------|
| **PLAN** | v0.19.0 (`pending-review`) |
| **Date** | 2026-07-11 |
| **Review** | R20 required (새 표면 + `curl\|bash` 신뢰 경계) |

| 분면 | 내용 |
|------|------|
| Known knowns | repo PUBLIC(익명 clone 가능). blob이 relayUrl+token 운반(0.18.0). `bun link`는 이미 있으나 `link-loom.sh`는 PATH 안내만 출력하고 종료. Bun 공식 installer(`bun.sh`) 위임 가능. |
| Known unknowns | (1) **PATH 활성화**(판정 리스크) — curl\|bash는 호출자 셸 못 바꿈 → 절대경로 검증 + rc append + `exec $SHELL` 안내로 충분한가. (2) shell rc 감지(bash/zsh/fish, 멱등). (3) 고정 clone 디렉토리 + 기존 충돌 시 update vs 거부. (4) 재실행 멱등성. (5) `curl\|bash` 핀 — main vs 태그(공급망). |
| Unknown knowns | 낯선 사람은 4개 수동 실패점 중 첫 하나에서 멈춘다 — 스크립트가 그 판단을 대신 내려줘야 함. |
| Unknown unknowns | Bun 설치 실패(네트워크·권한)·기존 다른 버전 Bun 충돌·비표준 셸 환경에서의 rc 위치. |

**Next session:** R20 → 0.19.x implement(install.sh + README + `loomCmd` 스윕) → tests → docs.

### 0.17.0 — Launcher UX up / host-default (pending-review)

| Field | Value |
|-------|--------|
| **PLAN** | v0.17.0 (`pending-review`) |
| **Date** | 2026-07-10 |
| **Review** | R18 required; **next session implements after approve** |

| 분면 | 내용 |
|------|------|
| Known knowns | sticky already daemonizes (unref). Multi-profile = multi session file. Work bus ships 0.16. dogfood-room-up exists for join only. |
| Known unknowns | (1) dogfood:up vs loom up naming — plan: both (script + CLI). (2) Auto-host on every join may surprise headless CI — plan: LOOM_NO_AUTO_HOST + --no-host. (3) Whether --watch on up is default — plan: **opt-in only**. |
| Unknown knowns | Users think host = open terminal; education + up removes the confusion. |
| Unknown unknowns | Orphan hosts after crash; down must be robust via meta.pid. |

**Next session:** R18 → 0.17.x implement → tests → docs.

### 0.16.0 — Work bus board notify + loom work (pending-review)

| Field | Value |
|-------|--------|
| **PLAN** | v0.16.0 (`pending-review`) |
| **Date** | 2026-07-10 |
| **Review** | R17 required |

| 분면 | 내용 |
|------|------|
| Known knowns | Handoff is delivery SSOT (durable, notify when online). Board is local file. Receive path is pull (`check_handoffs`). No CRDT. 0.15 tags/purpose exist. |
| Known unknowns | (1) Default notify-on-assignee vs require `--notify` — plan locks **default on when --as set**. (2) watch poll vs sticky events — plan locks **poll v1**. (3) Re-assign spam if assign called twice — plan: one handoff per assign call. |
| Unknown knowns | Users think “board = work queue”; without bridge they are wrong. |
| Unknown unknowns | Flood of notify if scripts loop board add; mitigate with docs + no notify on status-only updates. |

**Next:** R17 → implement or pending-revision locks only.

### 0.15.0 — Purpose-based sprint 1 (pending-review)

| Field | Value |
|-------|--------|
| **PLAN** | v0.15.0 (`pending-review`) |
| **Date** | 2026-07-10 |
| **Review** | R16 required before implement |

| 분면 | 내용 |
|------|------|
| Known knowns | Handoff is pull (`check_handoffs`/`claim`); no PTY inject. Board/pack are room-scoped local 0600 files. Dogfood roles impl/reviewer exist as docs+profiles. Wire v1 frozen for this sprint. |
| Known unknowns | (1) MCP `set_purpose` vs CLI-only for v1 — plan includes both. (2) Whether `--with-purpose` is attachment vs body section — impl free if sanitize+caps. (3) `loom verify` cwd = process.cwd() vs session-bound path — plan: process cwd at invoke. |
| Unknown knowns | Reviewers ignore stderr handoff banners; only first-prompt + MCP pull works in practice. |
| Unknown unknowns | Agents ignoring hints still; purpose file races multi-profile same UID (accept like board); verify recipe abuse if agent can set_purpose then verify — residual local UID trust. |

**Next:** R16 → if approved implement; if pending-revision only Open locks.

### 0.14.0 — P2 durable relay inbox/roster (pending-review)

| Field | Value |
|-------|--------|
| **PLAN** | v0.14.0 (`pending-review`) |
| **Date** | 2026-07-10 |
| **Review** | R15 required before implement |

| 분면 | 내용 |
|------|------|
| Known knowns | Today: `Room.inboxes` + `members` in memory only (`packages/relay/src/room.ts`); restart loses handoffs. Board/pack already use atomic JSON + 0600 under `~/.loom`. M-7 peerSecret must survive with roster. Protocol v1 / claim first-wins / leave-drops-inbox stay. Caps L-11/L-16 stay. |
| Known unknowns | (1) Sync write every mutation vs short debounce — plan prefers **sync** for simpler durability proof. (2) Whether auto-daemon (`ensureLocalRelay`) needs explicit `LOOM_RELAY_STATE_DIR` or just default home. (3) Disk growth if rooms never left — accept until GC backlog. (4) Exact placement of atomic helper (relay-local vs lift from host) — plan: **relay-local `persist.ts`** to avoid host↔relay cycle. |
| Unknown knowns | Operators expect “restart relay ≠ lose handoffs” once dogfood documents it; empty inbox after restart is a trust-break. |
| Unknown unknowns | Multi-host same NFS path; crash mid-rename on exotic FS; very large attachment spam filling disk despite caps; partial write if chmod fails on Windows (out of primary dogfood). R15 should probe fail-open vs fail-closed on load errors. |

**Next:** R15 on PLAN 0.14.0 → if approved, implement; if pending-revision, only Open blocking.

### 0.11.1 — M4.3b Tauri shell (plan locked)

| Field | Value |
|-------|--------|
| **PLAN** | v0.11.1 (`approved`) |
| **Date** | 2026-07-09 |

| 분면 | 내용 |
|------|------|
| Known knowns | sticky RPC status/peers/inbox/claim; loopback; M-18 **C** no Board v1; M-19 Rust invoke + session order; M-20 textContent-only |
| Known unknowns | Tauri 2 monorepo layout polish; macOS signing later; multi-window |
| Unknown knowns | desktop visual taste — optional mock during implement |
| Unknown unknowns | (closed for plan) board gap, CORS, sanitize≠HTML — locked in 0.11.1 |

**Next:** implement `apps/desktop` under 0.11.1. Board UI = later gate.

### 0.11.0 — superseded

R13 pending-revision material; see plan_review R13 + PLAN 0.11.1.

---

## Changelog

| 날짜 | 내용 |
|------|------|
| 2026-07-09 | 초안 + 0.11 stub |
| 2026-07-09 | R13 fill; 0.11.1 locks |
| 2026-07-10 | 0.14.0 P2 durable inbox unknowns |
| 2026-07-10 | 0.15.0 purpose-based sprint 1 unknowns |
| 2026-07-10 | 0.16.0 work bus unknowns |
| 2026-07-10 | 0.17.0 launcher UX unknowns |
| 2026-07-17 | 0.22.0 Loom×Herdr 노드 브릿지 unknowns (Step 0/0.5 go 반영) |
| 2026-07-18 | 0.23.0 conv 멀티턴 수직 슬라이스 unknowns (CONV_SPEC R24 approved 반영) |
| 2026-07-19 | 0.24.1 relay 룸 영속화 배선 갭 unknowns (`loom relay` 포그라운드 durable) |
| 2026-07-20 | 0.26.0 hooks 보조 센서 unknowns (U1~U6 요약 + 스파이크 실측 Known knowns · `pending-review` R41) |
