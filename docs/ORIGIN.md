# ORIGIN — Loom 최초 설계안 (불변 baseline)

> ## ⛔ 이 문서는 불변(immutable)이다
> 이 문서는 **원래 개발 계획(v0.1.0)의 복원 baseline**이다. `docs/PLAN.md`처럼
> 버전마다 제자리 덮어쓰기 하지 **않는다.** 원래 설계 항목의 텍스트는 **수정·삭제 금지.**
> 현재 상태 변화는 아래 **"Delta 추적"** 표의 상태 열만 갱신하고, 결정은 append로 기록한다.
>
> **왜 이 문서가 존재하나:** 원래 `docs/plan.md`(v0.1.0)는 macOS 대소문자 무시 파일시스템에서
> `docs/PLAN.md`와 **동일 파일**이라, R1 피벗 당일(2026-07-09) v0.2.1로 **제자리 덮어쓰기**되어
> 소멸했다. git 초기 커밋조차 이미 0.7.1이다. 원래 설계는 이제 **claude-mem #1252 + `docs/plan_review_archive.md` R1**에만 생존한다. 이 문서는 그 둘에서 **복원**한 것이다(원본 verbatim 아님).

| 항목 | 값 |
|------|-----|
| **문서 성격** | 불변 baseline + delta 추적 (SSOT 아님 — SSOT는 `docs/PLAN.md`) |
| **원래 계획 버전** | v0.1.0 (2026-07-09) |
| **출처** | claude-mem 관측 #1252 "Fable Advisor Project Plan — Architecture and Design Intent Documented" · `docs/plan_review_archive.md` Review R1 |
| **복원 시점** | 2026-07-11 |
| **원래 이름** | **Fable** (→ 0.9.0에서 **Loom**으로 rename) |

---

## 1. 원래 설계 (v0.1.0) — 복원, 수정 금지

### 목표
**Mosaic**(Dorsa Rohani의 멀티플레이어 Claude Code 확장) **벤치마크 + 코어 재현.**
PTY 미들웨어 + WebSocket Room relay + 멀티에이전트 어댑터 패턴으로 재현한다.

### 차별점 (원래 포지셔닝)
> "Agent Teams = 1인 멀티에이전트 / **Fable = 다인(multi-human) + 이종(heterogeneous) 에이전트**"
> → *"connect your agents — and your teammates"*

### 코어 메커니즘
- Claude Code · Codex · **Gemini** CLI를 **PTY로 wrap** — 에이전트 런타임 재구현 없이 미들웨어 계층으로 동작.
- WebSocket **Room relay** (기본 포트 **7842**).
- transcript 미러링은 기본 off (handoff/chat/presence만).

### handoff 수신 경로 (원래 설계)
1. **PTY stdin 주입** — 에이전트 입력 스트림에 handoff 컨텍스트 블록 주입 (원래 주 경로)
2. MCP 서버 도구 (`fable-mcp`) — MCP 지원 CLI용
3. **슬래시 명령 인터셉트** — fallback

### presence (원래 설계)
**TUI 위 컬러 라벨 오버레이** — 다른 사람의 에이전트 터미널에 실시간 presence 표시.

### 아키텍처
Monorepo 6 패키지: `protocol` · `relay` · `host` · `adapters` · `cli` · `mcp-server`.
스택: TypeScript + Bun, `node-pty`/`bun-pty`, WebSocket(`ws`), Zod, Vitest.

### 원래 Phase 시퀀스
```
Phase 0  scaffold            (0.5–1d)
Phase 1  local room MVP      (3–5d)
Phase 2  multi-agent adapters(2–3d)
Phase 3  remote relay        (3–4d)
Phase 4  collaboration quality
Phase 5  UX polish
```

---

## 2. R1 판정 — 원래 계획을 바꾼 분기점 (2026-07-09)

**Fable 5 (fable-advisor) 판정: 보류(on-hold).**
방향성(에이전트 재구현 안 함 · 어댑터 패턴 · 로컬→원격 순서)은 타당하나,
**계획이 가장 어려운 부분을 이미 풀린 것처럼 취급**한다.

| # | R1 지적 | R1 결정 |
|---|---------|---------|
| 1 | **MCP는 송신 전용** — 수신 경로 PTY 주입은 풀스크린 TUI(Ink/ratatui)에서 입력 큐 꼬임·의도치 않은 제출로 깨짐 | **큐 + `check_handoffs` 폴링**으로 전환 |
| 2 | presence 오버레이는 tmux급 터미널 에뮬레이터 필요 (Phase 1 일정 불가) | **비목표(MVP 제외)** |
| 3 | 얇은 데몬 + MCP | 코어 아키텍처로 채택 |
| 4 | 일정·속도·ANSI body | 반영 |

> ⚠️ **훼손 지점:** R1 결정 2번("presence → 비목표")은 *"미룬 핵심 차별점"*이었으나, 이후 문서에
> **"비목표" 한 단어로만** 남아 *"원래 안 원했던 것"*처럼 읽히게 되었다. 원래 목적지(Mosaic-parity)의
> 맥락이 소거됨. 이 문서가 그 맥락을 복원한다.

---

## 3. Delta 추적 — 원래 설계 vs 현재 (상태 열만 갱신 가능)

| 원래 요소 | 현재 상태 | 성격 | 결정 근거 |
|-----------|----------|------|-----------|
| Mosaic 벤치마크 + 코어 재현 | 🔴 명시적 벤치마크 기록 없음 | **미검증 — 결정된 적 없음** | — (원래 목표, 추적 소멸) |
| 차별점 "다인 + 이종 에이전트" | 🟢 유지 (Claude·Codex·Grok·shell 이종 지원) | 유지 | as-built |
| PTY 미들웨어 wrap | 🟡 PTY는 TUI 실행용으로만 잔존 (`run-with-pty.py`), 주입 아님 | 축소 | R1 #1 |
| **handoff 수신 = PTY stdin 주입** | ❌ 폐기 → 큐 + `check_handoffs` 폴링 | **의식적 폐기 (올바름)** | R1 #1 · Phase 1.5 spike no-go |
| handoff 수신 = MCP 도구 | 🟢 배송 (`check_handoffs`/`claim_handoff`) | 유지·강화 | as-built |
| **handoff 수신 = 슬래시 인터셉트 fallback** | ❌ 소멸 (`/fable` 슬래시가 rename 0.10.0에서 제거됨) | **rename 부수효과 — 명시적 결정 아님** | 0.10.0 |
| **presence 컬러 오버레이** | ❌ 미배송 (roster online/offline + color만, TUI 오버레이 없음) | **미룸에 의한 사고적 누락 (귀환 게이트 부재)** | R1 #2 "비목표" |
| Gemini 어댑터 | ❌ 제거, Grok로 교체 | 변경 | Phase 2 |
| relay 포트 7842 | 🟢 유지 | 유지 | as-built |
| Room relay (로컬→원격) | 🟢 배송 (원격 토큰인증 0.3.1 + durable 0.14.x) | 배송·초과달성 | Phase 3/5 |
| Monorepo 6 패키지 | 🟢 유지 | 유지 | as-built |
| **Phase 4 collaboration quality** | 🔴 원래 의미로 배송된 적 없음 (Phase 번호가 4.0a sticky host 등으로 재사용됨) | **번호 재사용으로 의미 증발** | 0.4.0~ |
| **Phase 5 UX polish** | 🔴 원래 의미로 배송된 적 없음 | **의미 증발** | — |

**범례:** 🟢 배송/유지 · 🟡 축소·부분 · ❌ 미배송/폐기 · 🔴 원래 목적지 미도달

---

## 4. as-built가 원래 계획을 넘어 추가한 것 (원래 설계엔 없던 궤도)

R1 이후 실제 빌드는 원래 Phase 4/5(협업품질·UX polish) 대신 다른 궤도로 갔다:

```
Phase 4.0a sticky host → 4.1 context pack → 4.2 task board → 4.3a board share
→ 5 durable relay(0.14) → 6 purpose loop(0.15) → 7 work bus(0.16)
→ 8 launcher UX(0.17) → invite blob(0.18) → install.sh(0.19) → loom doctor(0.20) → Windows WSL
```

전략 피벗 3회가 목표를 재정박했다 (매번 원래 설계와 대조 없이):
1. **0.9.0** Fable → Loom rename (정체성 이동)
2. **0.11 (`LOOM_PURPOSE_REVIEW`)** "Mosaic-parity 제품" → "수요 검증/온보딩"
3. **이번 세션** 내부 도구 채택(adoption) — 효용 확정 전제

---

## 5. 미해결 결정 (오너 판단 필요) — "완성"의 정의를 가름

원래 설계 요소 중 **미도달**한 것들을, 각각 **의식적으로** 처리해야 한다
(조용한 드리프트 → 명시적 결정으로 전환):

| 원래 요소 | 결정 필요 |
|-----------|-----------|
| **presence 컬러 오버레이** | (A) 복원해 "완성"에 포함 / (B) 의식적 폐기(사유 기록). Mosaic-parity 핵심 차별점이었음 |
| **Phase 4 협업 품질** | 원래 의미를 정의·복원할지, 아니면 as-built(work bus 등)로 대체 확정할지 |
| **Phase 5 UX polish** | 내부 팀 채택에 필요한 UX 최소선을 정의할지 |
| **Mosaic 벤치마크** | 원래 목표대로 Mosaic과 대조 벤치마크를 1회 수행할지, 아니면 목표에서 공식 폐기할지 |

> 이 결정들이 정해지면 `docs/PLAN.md`에 반영하고, 이 문서 3절 Delta 표의 상태 열을 갱신한다.
> **원래 설계 텍스트(1·2절)는 어떤 경우에도 수정하지 않는다.**
