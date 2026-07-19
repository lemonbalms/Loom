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

**→ 완료 (2026-07-19, `08d6091`)**: 5단계 원자화 + JSON 봉투 파싱·settle 재시도 보정 2건, 라이브 5단계 왕복 검증 + read-guard가 오너 사용-중 pane 개입을 실제 차단(존재 의의 첫 실행 실증).

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

---

## 2. Moshi (getmoshi.app) — 분석일 2026-07-19

| Field | Value |
|-------|-------|
| 제품 | **Moshi** — Mobile terminal for AI coding agents |
| 사이트 | https://getmoshi.app · Docs https://getmoshi.app/docs |
| 플랫폼 | iOS/iPadOS 17+ · Android 10+ (App Store / Play) |
| 제작 | 인디 (Joel / @odd_joel) · 클로즈드 소스 · 광고·데이터 판매 없음 표방 |
| 가격 | Free(진짜 쓸 만함) · Pro $7.99/mo · $69.99/yr · Lifetime $199 (≤3 devices) |
| 한 줄 | **내 호스트에서 도는 코딩 에이전트를 폰에서 조종** — 진짜 터미널 + 승인 인박스 + 푸시 + 리뷰 표면 |
| 이름 주의 | **≠** Kyutai Moshi(음성 LLM) · **≠** Mosh 프로토콜 단독. 연결 유지에는 Mosh를 씀. |
| 갱신 | 2026-07-19 세션 Q&A — **hooks/스크레이프 용어 · “훅으로 바꾸면?” 결정** → §2.5 |

> 세션 맥락: 오너가 처음 Blink(`blinksh/blink`)와 혼동 가능한 "MOSHI"를 물었고, 정본은
> **getmoshi.app**. Blink = 프로 셸 / Moshi = **에이전트 조종석** / Loom = **멀티 피어 작업 버스**.
### 2.1 무엇을 하나

**문제:** 노트북을 닫아도 Claude Code·Codex 등이 내 Mac/Linux/VPS에서 계속 돌게 두고,
이동 중 **승인·질문·완료**만 폰으로 처리하고 싶다. 기존 모바일 SSH(Blink/Termius)는
셸 접속은 잘하지만 “에이전트가 막혔다”를 **스크롤백 글자**로만 보여 준다.

**해결 (제품 비유):** *잠든 아이 옆 베이비 모니터 = 에이전트 옆 Moshi.*

| 축 | 내용 |
|----|------|
| 터미널 | 진짜 PTY 세션 (Ghostty/Metal GPU 렌더 표방). SSH / **Mosh** / ET(experimental) |
| 호스트 | 사용자 소유 머신. 코드·에이전트 CLI·git·구독은 **Moshi 클라우드에 안 올라감** |
| 세션 수명 | mosh + tmux/Zellij/**Herdr** — 앱 백그라운드·네트워크 전환·잠금에도 에이전트 유지 |
| 에이전트 루프 | `moshi-hook` 데몬 → 승인/완료/툴 이벤트를 **Inbox · Live Activity · Watch · 푸시** |
| 입력 | 음성(on-device Whisper/Parakeet/Apple · cloud 쿼터) · image/file paste → 호스트 경로 주입 |
| 리뷰 | Diff viewer · repo browse · localhost browser preview (로컬 게이트웨이 터널) |
| 보드 | Agents 칸반 (Needs you / Working / Done) · Usage rings · context % |
| 온보딩 | Easy Pair QR (`moshi-hook host setup`) · brew / install.sh |

**지원 에이전트 (hooks 정규화):** Claude Code, Codex, OpenCode, Gemini, Antigravity,
Cursor, Kimi, Qwen, Grok, Pi, OMP, Hermes 등. 목록 밖 CLI도 “그냥 셸”로는 동작.

### 2.2 아키텍처 (요지)

```
Phone (Moshi app)
  │ SSH/Mosh/ET ──────────────► Host PTY (tmux/herdr 안 에이전트)
  │ WebSocket (알림·승인 요약) ► Moshi backend (짧은 이벤트만)
  │ SSH-forward local gateway ► host:127.0.0.1:24543 (diff/transcript/preview)
Host
  moshi-hook serve  · Unix socket ◄── agent hooks
                    · gateway :24543  ◄── app
```

**프라이버시 경계 (docs 주장, 검증 필요 시 dogfood로 재확인):**

| 로컬 또는 폰↔호스트 직결 | 서버 경유 (요약) |
|--------------------------|------------------|
| 터미널 트래픽 · 전체 트랜스크립트 · diff · 소스 | inbox 카테고리 + 프롬프트 ≤200자 · 응답 타이틀 ≤80자 · 승인 질문 ≤256자 · 메타(프로젝트/session/agent/model/context%) |

**Inbox 정규 카테고리 (의도적으로 작음):**  
`approval_required` · `task_complete` · `session_started` · `tool_running` · `tool_finished`  
→ **세션당 1행 갱신** (알림 스택 폭발 방지).

### 2.3 Loom과의 구조 비교

| 축 | Moshi | Loom |
|----|-------|------|
| 사용자 | **1인 + 폰/태블릿** | **멀티 피어 팀** (타워·워커·리뷰) |
| 연결 | 폰 → **내 호스트** 직결 (SSH/Mosh) | 피어 → **relay/room** → 브릿지/host |
| 세션 표면 | 모바일 네이티브 터미널 앱 | herdr pane + CLI/MCP + (desktop) |
| 작업 단위 | 에이전트 turn / approval | board card · handoff · conv turn |
| 상태 버스 | moshi-hook 이벤트 → 인박스 칸반 | durable inbox · board · card.done · conv |
| 승인 UX | 푸시 / Live Activity / **Watch 원탭** | 타워·보드 관측 · 워커 pane 스크레이프 |
| 멀티플렉서 | tmux · Zellij · **Herdr** (pane 상태 jump) | **Herdr** (브릿지 스폰·풀 탭·pane close) |
| 전달 보장 | 훅 이벤트 + 알림 (세션 자체는 mosh/tmux) | seq · pin · fail-closed · artifact sha256 |
| 신뢰 모델 | 호스트 키 + 앱 Keychain · 훅 페어링 토큰 | peerSecret · allowlist · untrusted 마커 |
| 스크레이프 | Chat View 등 (실험, 호스트 게이트웨이) | delta + chrome 필터 + still-running 유예 (0.23.x) |
| 오픈소스 | ❌ | ✅ (팀 레포; 제품 공개 전략은 별도) |
| 포지션 | **모바일 agent babysitter** | **팀 작업 버스 + 에이전트 오케스트레이션** |

**겹치는 진짜 문제 (시장 신호):**

1. 에이전트는 **장시간 · 비동기 · 승인 대기** 한다 → “지켜보는 사람”이 필요.
2. 순수 터미널(글자 파이프)만으로는 **Needs you** 가 안 보인다.
3. **Herdr** 가 양쪽 생태계에 등장 — “에이전트 멀티플렉서”가 공통 인프라로 수렴.
4. PTY 스크롤백만으로는 부족 → **구조화 이벤트**(hooks / card.done / done_proposal) 가 필요.

**그들이 푸는 것 / Loom이 푸는 것 (겹침 ≠ 대체):**

- Moshi: *내가 떠난 뒤에도 내 에이전트가 나를 부른다* (개인·모바일).
- Loom: *여러 모델/사람이 같은 룸에서 카드·대화를 넘긴다* (팀·프로토콜).
- 경쟁 위협: **직접 대체 아님**. 같은 유저가 둘 다 쓸 수 있음 (폰=Moshi, 데스크=Loom).
  위협 시나리오는 “팀 협업 없이도 1인 멀티에이전트면 충분” 포지션 잠식 — Loom의
  존재 이유(멀티 피어·리뷰 게이트·전달 보장)를 문서·데모로 계속 박아야 함.

### 2.4 Blink와의 관계 (참고)

공식 compare: Blink = 최고의 셸 파이프 · Moshi = 에이전트 루프.  
Loom 문서 포지션에 쓸 삼각 정리:

| | Blink | Moshi | Loom |
|--|-------|-------|------|
| 1급 표면 | 셸 | 에이전트 인박스+셸 | 룸·보드·conv·브릿지 |
| 연결 | Mosh/SSH | Mosh/SSH + hooks 백엔드 | relay + herdr |
| 모바일 | iOS | iOS+Android | 없음(현행) |
| 팀 | 없음 | 없음(1인 다중 호스트) | 핵심 |

### 2.5 관측 모델: hooks vs 스크레이프 (용어 · 결정)

> 세션 질문: “에이전트 hooks가 정교하다 = 무슨 뜻?” / “스크레이프는?” /
> “hook으로 바꾸는 게 좋지 않아?”  
> **결정 SSOT는 이 절.** §2.6 C는 적용 체크리스트만.

#### 2.5.1 용어

**에이전트 hooks (구조화 신호)**  
코딩 에이전트(Claude Code, Codex 등)가 라이프사이클 순간에 **공식 출구로 이벤트를 쏨**.  
Moshi는 호스트의 `moshi-hook`이 그 훅을 받아 작은 카테고리로 정규화한다.

```
에이전트 ──hook──► moshi-hook (소켓) ──► 정규 이벤트
  예: approval_required / task_complete / session_started / tool_*
       → 폰 Inbox · 푸시 · Live Activity
```

- “정교하다” = AI가 똑똑하다가 아니라, **상태 전달이 화면 글자 추측이 아니라 이벤트 타입**이라는 뜻.
- 비유: 직원이 무전으로 “승인 필요 / 작업 끝” 보고.

**스크레이프 (scrape)**  
에이전트 속을 API로 여는 게 아니라, **터미널 pane에 이미 그려진 글자를 읽어** 상태를 짐작.  
Loom 브릿지 경로:

```
워커 TUI ──화면 그림──► herdr pane
                            ▲
                            │ pane read
                      브릿지 ── chrome 제거 · delta · 마커/휴리스틱 ──►
                              card.done / conv turn / notes
```

- 웹 스크레이핑과 동형; 대상만 HTML이 아니라 **PTY 렌더 텍스트**.
- 비유: 창밖 화이트보드·표정을 보고 짐작 (카메라 + 자막 읽기).
- Loom 0.23.x가 고치는 축: chrome 필터 · delta · still-running 유예/supersession ·
  done_proposal 말미 마커 — 전부 **스크레이프 해석 품질**.

| | **Hooks** | **스크레이프** |
|--|-----------|----------------|
| 정보 출처 | 에이전트 → vendor hook → 데몬 | pane 렌더 텍스트 |
| 형태 | 작은 이벤트 카테고리 | 마커·휴리스틱·필터 |
| 잘 하는 것 | 승인/막힘/턴 끝 **순간** | 이질 워커 공통 관측 · 주입 검증 · 턴 본문 조각 |
| 못 하는 것 | 긴 본문·팀 전달 보장·벤더 없는 CLI | 접힌 TUI 출력(상한 실측) · 승인 문구 미탐지 |
| 본문/대용량 | 보통 없음 | 스크롤백 상한으로 불충분 → **§5.1 artifact** |
| 신뢰 | emit 주체가 워커면 위조 가능 (자동 close 금지 필요) | untrusted 본문과 동일 클래스 |

#### 2.5.2 “전부 훅으로 바꾸면?” — **No (교체 금지)**

| 선택 | 평가 |
|------|------|
| 스크레이프 **완전 폐기** → hooks only | ❌ |
| hooks **완전 무시** | △ 가능, 승인/막힘 UX는 계속 아픔 |
| **하이브리드** (훅=보조 센서, 스크레이프=공통 눈, artifact=본문 정본) | ✅ |

**전부 훅이 Loom에 안 맞는 이유**

1. **제품 형태:** Moshi=1인·내 호스트·소수 에이전트. Loom=**멀티 피어·이질 워커·팀 프로토콜**.
   훅 1급화 = 벤더별 어댑터 묶음 → “공통 버스” 정체성과 충돌.
2. **훅이 안 주는 것:** 긴 답·툴 출력 정본, seq/pin/durable inbox, untrusted 분리,
   R{n} 프로세스. 대용량은 훅으로 바꿔도 §5.1이 정답.
3. **신뢰:** 훅 이벤트도 워커/훅 스크립트가 emit → “훅이라서 신뢰” 성립 안 함.
   done_proposal과 동형으로 **자동 close·자동 approve 금지**.
4. **운영:** 호스트마다 데몬·에이전트 버전 맞춤, dogfood N프로필 × 벤더 회귀 폭발.
5. **스크레이프가 남는 순간:** 훅 미지원 CLI, **주입 probe hit**, conv 요약 조각,
   스모크/디버그, 허위 완료와 화면 교차 확인.

**훅이 싸게 이득인 곳 (버리기 아까움)**

| 고통 | 스크레이프만 | 훅 보조 시 |
|------|--------------|------------|
| 승인 대기 (codex plan, y/n) | 글자 패턴, 자주 놓침 | `approval_required` |
| 조기 card.done | still-running 휴리스틱 | `turn_complete` + 스크레이프 확증 |
| Needs you 보드 | notes 짐작 | 이벤트 출처 상태 마커 |

#### 2.5.3 Loom 권장 아키텍처 (하이브리드)

```
                    ┌─ hooks (있으면) ──► blocked / idle / turn_end     보조 신호
워커 ──PTY/TUI──►   ├─ scrape (항상) ──► delta, 요약, 주입 검증, 폴백
                    └─ §5.1 파일     ──► 긴 결과 정본

                         ▼
              Loom 프로토콜 (card / conv / handoff)
              타워 전권 · untrusted · durable
```

**규칙**

1. 훅 없음 = **현행과 동일** (fail-open, 회귀 없음).
2. 훅 있음 = 보드/유예 **힌트만** — 자동 close·자동 approve 금지.
3. 본문·전달 보장 = **프로토콜 + artifact** (훅/스크레이프 둘 다 아님).
4. 벤더 어댑터는 얇게 — Claude 1종 스파이크 → 이득 입증 후 확장.
5. **교체하지 말고 센서를 더한다.** 스크레이프=공통 눈, 훅=무전.

**실무 순서**

| 단계 | 내용 | 비고 |
|------|------|------|
| 지금 | 스크레이프 품질 (0.23.11 chrome/summary/still-running 등) | 공통 경로 |
| 스파이크 | Claude hooks로 idle/permission **읽기만** (1–2일, R 불요) | `docs/spikes/` 또는 본 절 갱신 |
| 이득 수치 | 조기 done·승인 미탐지 감소가  empirically 있으면 다음 |
| PATCH | optional sensor → notes / still-running 유예 입력만 | 필드 신설 시 R{n} |
| 이후 | Codex/Grok 개별 어댑터 | 증명 후 |
| 안 함 | 모바일 푸시 데몬 · moshi-hook 의존 · 스크레이프 폐기 | §2.6 H |

### 2.6 배울 점 → Loom 적용방안

원칙: **모바일 앱·Moshi 백엔드·moshi-hook을 이식하지 않는다.**  
가져올 것은 **이벤트 정규화 · 인박스 UX 패턴 · 프라이버시 경계 · Herdr jump · 온보딩
마찰** 이다. 관측 계층은 **§2.5 하이브리드** (훅 교체 아님).  
PLAN 게이트 없이 문서/스크립트만 가능한 것과 R{n} 필요한 것을 분리.
#### A. 에이전트 이벤트 정규 카테고리 (인박스 어휘) — **문서 → 점진 코드**

**현황:** Loom은 card.done / conv turn / handoff / done_proposal 등 **프로토콜 메시지**는
있으나, “Needs you / Working / Done” 한 화면에 모이는 **사람용 어휘·수명**이 Moshi만큼
선명하지 않다. 보드 notes·inbox 목록이 가깝지만 칸반 붕괴 규칙(완료 10분 Active → 6h
archive 등)은 없음.

**적용방안:**

1. **[즉시 · 문서]** `docs/DOGFOOD_LOOP.md` 또는 본 노트 하위 표로 **운영 칸반 매핑** 고정:
   | Moshi 카테고리 | Loom 대응 (현행) | 빈 칸 |
   |----------------|------------------|--------|
   | approval_required | 워커 TUI 승인 프롬프트 · 관찰 ⓔ (codex plan 고착) | **구조화 이벤트 없음** — 스크레이프/수동 |
   | task_complete | card.done · conv close(done) · done_proposal notes | 표면 분산 |
   | session_started | pane spawn · card doing | OK |
   | tool_running/finished | 없음(의도) | 노이즈라 Moshi도 throttle — Loom 도입 비추 |
2. **[PATCH 후보 · Med]** “Needs you” 표면: 워커가 **승인 대기**일 때 보드/카드에
   고정 상태 마커(예: notes `status=blocked_approval`) — **와이어 새 타입이 아니라**
   기존 notes/status 정규화 + 탐지 패턴. R{n} 여부는 “새 MCP/프로토콜 필드” 생기면
   필수, 보드 notes 관례만이면 author-close 가능 구간.
3. **비목표:** 모바일 푸시 서버, Apple Watch, Live Activity. 팀 dogfood 단계 과투자.

#### B. 세션당 1행 갱신 · 알림 스팸 방지 — **이미 부분 구현, 문서화 강화**

**현황:** Moshi inbox = 세션당 1행 갱신. Loom card/conv도 flight 단위로 갱신하는 방향
(0.23.x finishCard · applyConvTurn). 다만 보드 notes에 chrome·타이밍줄 유입이 반복
(0.23.6–0.23.11 웨이브) — **“한 행이 지저분하면 1행 정책이 무의미”**.

**적용방안:**

1. **[진행 중]** PLAN 0.23.11 후보 ①③⑤ (claude chrome · summary 타이밍 · still-running
   supersession) — **Moshi 교훈과 동일 축**: 사람 스캔 가능한 한 줄/한 카드.
2. **[즉시 · 문서]** 보드/카드 표시 불변식 한 줄 추가(DOGFOOD 또는 lessons):
   *“카드/컨브 한 행 = 지금 행동에 필요한 신호만; chrome·타이밍·에코는 필터 또는 말미
   스킵.”* — 0.23.x 구현 근거를 경쟁 노트와 교차 링크.
3. 신규 이벤트 종류를 늘리기 전에 **throttle·collapse 규칙**을 PLAN에 먼저 쓰기
   (Moshi tool_running 의도적 억제 선례).

#### C. 구조화 훅 vs PTY 스크레이프 — **§2.5 결정 실행 체크리스트**

**결정 (SSOT = §2.5):** 스크레이프 **교체 금지**. 훅 = **optional 보조 센서**.  
본문 정본 = §5.1. 프로토콜/타워 전권 유지.

**현황 한 줄:** Moshi = hooks 1급 · Loom = scrape+마커 1급 (claude ~5.3k / grok ~2.2k /
codex ~1.4k 상한 실측) · 대용량은 artifact.

**적용방안 (실행만):**

1. **[진행 중]** 스크레이프 품질 — 0.23.11 등 (공통 눈 유지).
2. **[스파이크 · R 불요]** Claude Code hooks → idle / `approval_required` **읽기만**;
   fail-open(훅 없으면 현행). 결과 `docs/spikes/` 또는 §2.5 갱신.
3. **[PATCH · 이득 입증 후]** 훅 신호를 notes / still-running 유예 입력에만 연결;
   자동 close·approve 금지. 와이어/MCP 신설 시 R{n}.
4. **비목표:** 스크레이프 폐기 · moshi-hook/getmoshi 의존 · 벤더 훅 올인.

#### D. Herdr “이벤트 → 해당 pane jump” — **브릿지/타워 UX**

**현황:** Moshi는 Herdr pane의 blocked/working/done을 읽어 **인박스 탭 → 그 pane** 착지.
Loom 브릿지는 spawn·pool·close·scrape는 하나, **“이 카드의 pane으로 포커스”** 는
아키텍트 수동/`herdr` CLI.

**적용방안:**

1. **[Low · 스크립트]** `scripts/pane-focus-card.sh <cardId>` 또는
   `loom board focus <cardId>` 초안: board metadata의 pane id → `herdr` focus RPC
   (존재 여부 Step 0 프로브 필요 — 없으면 herdr 이슈/우회).
2. **[PATCH 후보]** card.done / blocked 시 타워 TUI 또는 `loom watch` 한 줄에
   `pane=<id> tab=<id>` 표기 — **점프는 사람**, 발견 비용만 제거 (R-gate 낮음).
3. 풀 탭 정책(0.23.9–0.23.10)과 결합: “Needs you” 카드 = 해당 워커 pane 위치 힌트.

#### E. 로컬 게이트웨이 패턴 (전문은 직결, 서버는 요약) — **이미 Loom 철학과 정합**

**현황:** Moshi: transcript/diff는 host→phone 직결, 서버는 푸시 요약만.  
Loom: §5.1 artifact는 파일/scp, relay는 메타·작은 페이로드 — **같은 정신**.

**적용방안:**

1. **[문서 강화]** PITCH / USER_GUIDE / 경쟁 노트에 한 문장 SSOT:
   *“큰 결과물은 피어 간 파일·artifact; relay/inbox는 신호와 작은 계약.”*
2. 새 기능 제안 시 리트머스: *이 페이로드가 relay를 타면 Moshi가 서버에 올리지 말라고
   한 클래스인가?* → 그렇다면 §5.1 경로 강제.
3. **비목표:** 모바일용 로컬 게이트웨이 포트 제품화 (팀 데스크 단계).

#### F. Easy Pair / 원커맨드 온보딩 — **§1 B와 합류**

**현황:** Moshi Easy Pair = QR + 키 생성 + authorized_keys. Loom join = invite blob +
profile. 이미 COMPETITIVE §1 B/C (bunx · 이미지 README) 가 같은 마찰을 다룸.

**적용방안:**

1. §1 B/C 완료 상태를 전제로, **팀 dry-run 1페이지**에 “Moshi Easy Pair에 해당하는
   Loom 경로 = `loom room join <blob>` + dogfood-up” 를 명시 (비유만, 기능 복제 아님).
2. 호스트 준비 체크리스트를 Moshi docs 권장 세트에 맞춰 **선택 정렬**:
   `herdr` + (팀 환경) Tailscale + loom bridge — mosh/tmux는 Loom 필수 아님을 명시
   (오해 방지: Loom ≠ 모바일 mosh 클라이언트).

#### G. Free vs Pro 게이팅 철학 — **제품 공개 시 참고, 지금 코드 금지**

Moshi: Free = 진짜 SSH+푸시; Pro = Mosh·이미지·무제한 인박스.  
Loom 공개/ monetize 시점 전 참고만. **현재 FREEZE·팀 dogfood 단계에서는 적용 안 함.**

#### H. 가져오면 안 되는 것 (명시 배제)

| 배제 | 이유 |
|------|------|
| 네이티브 iOS/Android 앱 착수 | 스택·유지비·FREEZE 밖 · Loom 코어(룸/프로토콜) 미성숙 |
| moshi-hook / getmoshi API 의존 | 외부 단일 벤더 · 프라이버시·가용성 타사 |
| 푸시 알림 서버 우선 구현 | 팀 책상 dogfood 병목 아님 |
| Blink/Moshi 터미널 에뮬 경쟁 | Loom 가치 = 오케스트레이션, 에뮬 아님 |
| “에이전트 hooks만으로 스크레이프 폐기” | 벤더 파편 · 전달 보장·artifact와 충돌 · **§2.5 결정** |

### 2.7 우선 적용 로드맵 (실행 순서)

| 순서 | 항목 | 형태 | R-gate | 의존 |
|------|------|------|--------|------|
| 1 | 본 노트(§2) + hooks/스크레이프 결정(§2.5) 문서화 | 문서 | 불요 | — |
| 2 | 칸반 매핑 표 → DOGFOOD_LOOP 또는 lessons 교차 링크 | 문서 | 불요 | — |
| 3 | 0.23.11 (chrome/summary/still-running) 완주 — **스크레이프 공통 눈** | PATCH 진행 중 | R35 | PLAN |
| 4 | §1 A `pane-inject.sh` + §2.6 D pane 위치 힌트 | 스크립트/Low | 보통 불요 | herdr RPC 프로브 |
| 5 | Claude hooks 보조 신호 스파이크 (**교체 아님**, §2.5.3) | spike 메모 | 불요 | 조사 |
| 6 | Needs you 보드 상태 정규화 (훅 힌트 가능 시) | PATCH 후보 | 필드 신설 시 R{n} | 5 결과 |
| 7 | 모바일/푸시 · 스크레이프 폐기 | 하지 않음 | — | 제품 공개 이후 재평가 |

### 2.8 결론

- **Moshi는 Loom의 경쟁 대체가 아니라**, “에이전트를 사람 없이도 돌리려면 **구조화
  신호 + 한눈 인박스 + 세션 생존**이 필요하다”는 **시장·UX 교과서**.
- Loom이 이길 축: **멀티 피어 · 리뷰 게이트 · durable 전달 · untrusted 분리 · herdr
  팀 브릿지** — Moshi에 없음.
- Loom이 당장 훔칠 축: (1) 이벤트 어휘·collapse 규칙, (2) 카드/노트 **스캔 가능성**
  (chrome 필터 웨이브와 동일), (3) Herdr pane으로의 **발견 가능성**, (4) “큰 페이로드는
  직결/파일” 경계의 문서 날카로움, (5) Easy Pair급 온보딩 마찰 제거(§1 B/C와 합류).
- **관측 계층 결정 (§2.5):** hooks로 **바꾸지 않는다**. 스크레이프=공통 눈(유지·품질
  개선), hooks=optional 센서(승인/막힘/턴끝), 본문=§5.1, 팀 계약=프로토콜.
  “hooks가 정교하다” = 이벤트 타입 전달이지 전체 아키텍처 우월이 아님.
- 구현 기본 자세: **문서·스파이크·Low 스크립트 먼저**, 프로토콜/MCP 새 표면은 스파이크
  근거 있을 때만 PLAN.