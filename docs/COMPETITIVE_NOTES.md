# Competitive notes — 유사 프로젝트 분석

> 목적: Loom과 문제의식이 겹치는 외부 프로젝트를 기록하고, 차별점과 배울 점을
> 실행 가능한 적용방안으로 변환한다. 새 항목은 아래 형식으로 추가.

---

## 1. tmux-bridge-mcp (howardpen9) — 분석일 2026-07-19

| Field | Value |
|-------|-------|
| Repo | https://github.com/howardpen9/tmux-bridge-mcp (MIT) |
| 이력 | 생성 **2026-03-28** (Loom 개발 시작보다 앞섬) · 커밋 24건이 3/28–4/1 **나흘**에 집중 후 **~3.5개월 휴면** (마지막 push 2026-04-01) |
| 트랙션 | star 72 · fork 11 · open issues 2 |
| 규모 | TS ~1,300줄 (테스트 제외) · v0.1.0 · npx 배포 |
| 한 줄 | tmux `capture-pane`/`send-keys`를 감싼 MCP 서버 — 에이전트들이 서로의 pane을 읽고/타이핑하게 함 |

### 1.1 무엇을 하나

- MCP 툴 9종: `tmux_list / read / type / message / keys / name / resolve / id / doctor`.
- "통신"의 실체 = **상대 pane composer에 텍스트를 타이핑**(발신자 헤더+correlation ID 자동 부착). 회신은 상대가 내 pane에 타이핑해 주는 push 모델 — "회신 폴링 금지"가 규약.
- 안전장치: **read guard**(해당 pane을 `tmux_read`한 적 없으면 type/message/keys 거부), 자기 pane 메시지 금지(루프 방지). 나머지 규율(Read-Act-Read 사이클)은 시스템 프롬프트 스킬 문서로 해결.
- 지원: Claude Code / Gemini CLI / Codex / Kimi (stdio MCP면 무엇이든).

### 1.2 Loom과의 구조 비교

| 축 | tmux-bridge-mcp | Loom |
|---|---|---|
| 계층 | pane I/O 프리미티브만 | 신원(peer/room) + 전송(relay) + 프로토콜(handoff/conv/card) + 프로세스(보드/R-gate) |
| 범위 | 단일 머신, 단일 tmux 세션 | 멀티 머신 팀 룸 (relay + invite blob) |
| 전달 보장 | 없음 — pane 텍스트가 곧 wire | seq 단조·pin·durable inbox·card.done·fail-closed |
| 신뢰/보안 | 전무 (아무 pane이나 타이핑 가능) | 토큰 인증·dispatcher allowlist·untrusted 마커·artifact sha256 |
| 대용량 출력 | pane 텍스트 그대로 | §5.1 artifact ref(절단 금지) + delta/chrome 필터(0.23.6) |
| 주입 신뢰성 | read guard + 프롬프트 규율 | verify 루프(probe→reinject) 코드 강제, 라이브 자동복구 실증(0.23.5) |
| 강제 지점 | 에이전트의 선의(프롬프트) | 코드·프로토콜 |

**그들이 아직 만나지 않은 문제 (Loom 실측 완료):**

- TUI 트랜스크립트 접힘 — `tmux_read`도 렌더 버퍼만 읽으므로 스크레이프 상한(실측 claude ~5.3k / grok ~2.2k / codex ~1.4k)에 동일하게 걸림. 대용량 결과 전달 불가.
- codex 작업 중 CR 큐잉 불가(Tab만 큐잉, lessons) — "상대 pane에 타이핑" push 모델은 상대가 working이면 유실/오배달.
- 워커 TUI 스타트업 레이스, codex 승인 프롬프트 고착(관찰 ⓔ) 등.

**포지셔닝:** 단일 머신 편의 도구 vs 멀티 머신·전달 보장·보안이 있는 팀 인프라. 동시에
"터미널 에이전트들이 pane으로 협업한다"는 Loom 핵심 논지가 독립 재발명된 **시장 신호**
(우리보다 먼저 시작했고 나흘 만에 star 72 — 수요는 실재).

### 1.3 배울 점 → 적용방안

#### A. read guard의 코드 강제 (발신 측 가드)

현황: 브릿지 주입 경로는 이미 read-first가 코드 강제됨(0.23.5 verify 루프: probe read → miss 시 reinject). **갭 = 수동 pane 레인** — 아키텍트가 `herdr agent send`를 직접 조작할 때의 read→inject→re-read→CR 절차가 lessons(문서 규율)로만 존재.

적용방안 (PATCH 후보 등록):

1. `scripts/pane-inject.sh <target> <text-file>` 신설 — lessons의 수동 복구 절차를 원자화:
   ① `herdr pane read`로 composer 상태 확인(비어 있지 않으면 중단·경고) →
   ② `herdr agent send` 리터럴 주입 → ③ re-read로 착지 검증(공백-정규화 매치, paste
   placeholder 대응) → ④ 별도 CR(`$'\r'`) → ⑤ `herdr agent wait --status working` 확인.
2. 스크립트 층위이므로 R-gate 불요(WORKFLOW §5.1 M-lock 비인접). 브릿지 코드로
   승격(예: `loom pane inject` CLI)할 경우에만 R{n}.

#### B. npx/bunx 원커맨드 온보딩

현황: 온보딩 = repo clone + bun install + `loom room join <blob>` (DRY_RUN_RUNBOOK Step 2).
온보딩 마찰이 채택의 결정 리스크로 이미 기록돼 있음.

적용방안 (단계별, 뒤로 갈수록 오너 결정 필요):

1. **[즉시]** `package.json` `bin` 필드 정리 → `bunx --bun github:lemonbalms/Loom loom join <blob>` 동작 검증. repo가 private인 동안은 팀원 gh 인증으로 충분.
2. **[선택]** `bun build --compile`로 단일 바이너리 릴리스 첨부(GitHub Releases) —
   Node/bun 미설치 팀원 대응.
3. **[오너 결정]** npm publish(`npx loom-cli` 류 공개 배포)는 제품 공개 전략과 결부 —
   FREEZE 해제 범위 밖이므로 별도 결정.
4. 완료 기준: DRY_RUN_RUNBOOK Step 2가 "설치 1줄 + join 1줄"로 줄어드는 것.

#### C. 이미지 중심 README

현황: Loom README/RUNBOOK은 텍스트 위주. tmux-bridge는 hero banner + problem/solution
다이어그램으로 60초 안에 what/why가 전달됨 — 온보딩 첫인상에 직결.

적용방안:

1. `docs/images/` 신설, 3컷 우선: ① hero(룸+피어+브릿지 한 장) ② problem(사람이
   클립보드 메시지 버스가 되는 그림) ③ solution(handoff/conv 흐름). PITCH.md 소재 재활용.
2. 제작 경로: mermaid 소스를 repo에 두고 export(PNG) 커밋 — 수정 가능성 유지.
3. README 최상단을 "이미지 + 한 줄 정의 + Quick start(위 B의 1줄 설치)"로 재배치.
   상세는 기존 문서 링크로 위임.
4. 문서 작업이므로 R-gate 불요. B의 설치 1줄이 먼저 있어야 Quick start가 성립 —
   순서는 B → C.

### 1.4 결론

기능 격차는 크고(계층 1개 vs 스택 전체), 그들의 휴면 상태(3.5개월)로 보아 직접적 경쟁
위협은 낮다. 가치는 두 가지: (1) 수요 검증 신호, (2) 포장 기술(read guard의 강제 지점
설계, npx 온보딩, 이미지 README) — 위 A/B/C로 흡수한다.
