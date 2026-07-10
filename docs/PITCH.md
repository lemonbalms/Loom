# Loom — connect your agents, and your teammates

![Loom demo — bob hands off work to alice while she's offline; alice checks her inbox and accepts it](./loom-demo.gif)

*(GIF above: two peers, one machine, zero babysitting — a handoff sent while the recipient is offline still lands safely in her inbox.)*

---

## 30초 요약

**Loom**은 서로 다른 코딩 에이전트(Claude Code, Codex, Grok…)를 쓰는 여러 사람이 하나의 **Room**에 모여 작업을 주고받는 멀티플레이어 레이어입니다. 에이전트를 새로 만드는 게 아니라, 기존 CLI들을 감싸서 **presence + offline-safe handoff inbox + MCP 도구**를 붙입니다.

> 상대가 오프라인이어도 메시지는 유실되지 않는다. 이게 제품의 전부다.

최근 출시: **Tauri 데스크톱 셸**(Status / Peers / Inbox / **Board**)과, 그걸 안전하게 열기 위한 **R13 보안 리뷰 게이트**(계획 공백을 코드 전에 잠금).

---

## 방금 뭐가 나왔나 (v0.12.0)

- **`apps/desktop`** — Tauri 2 셸. Status / Peers / Inbox / **Board** (추가·status 변경).
- **sticky host** loopback RPC 재사용 — **새 wire protocol 없음**. Board도 sticky `list_tasks` / `add_task` / `update_task`로 CLI와 **같은 로컬 보드 파일**.
- Rust가 토큰을 들고 있고, webview JS는 토큰을 **절대 보지 않음** (M-19).
- peer 문자열은 전부 `textContent` — `innerHTML` 금지 (M-20; terminal sanitize ≠ HTML escape).
- 헤드리스 dogfood: `bun run smoke:desktop` (status/peers/inbox/board/401).

CLI 코어(위 GIF)는 실사용 검증된 부분: 방 생성 → 초대 → 오프라인 핸드오프 → 인박스 accept, 피어 로스터, `[LOOM HANDOFF]` 배너 — 연출 없는 실제 실행 결과.

---

## 왜 이렇게 만들었나 (스펙 하이라이트)

- **Room**: 초대 코드(`LOOM-XXXX`)로 join. Relay가 로스터 + 온라인 맵을 들고 있고, **로스터는 소켓 연결과 분리** — 오프라인이어도 인박스는 살아 있음.
- **Handoff**: `@name` / `id` / `*` 큐잉. `queued → notified → accepted|claimed`, **first-wins**.
- **MCP**: `check_handoffs` / `claim_handoff` / `handoff` / board·pack — **pull only**.
- **보안**: peer 문자열 allowlist sanitize(터미널 ESC), 타이밍세이프 토큰 비교, non-loopback 무토큰 bind 거부, per-peer rejoin secret, desktop XSS 계층 분리.

---

## 어떻게 검증했나 — "그냥 만든 게 아니다"

`docs/PLAN.md`를 버전마다 갱신하고, MINOR/보안 변경마다 `docs/plan_review.md`에 리뷰(R1–R13)를 남깁니다. 데스크톱 셸은:

1. **코드 전에** 계획만으로 리뷰(R13).
2. 구현 전 블로커: Board 경로 공백(M-18), webview fetch/CORS·세션(M-19), sanitize≠HTML(M-20).
3. 잠금(0.11.1) → 셸(0.11.2) → Board sticky(0.12.0).

시리즈에서 잡아 온 것: 오프라인 유실, 세션 덮어쓰기, 타이밍-불안전 비교, identity takeover, 채널 간 sanitize 재발 패턴.

---

## 지금 상태 / 아직 아닌 것

**됨:**
- 로컬/원격 room, 오프라인-세이프 인박스, Claude/Codex/Grok + MCP
- 토큰 인증 원격 relay, sticky host, context pack, task board(+ 스냅샷 공유)
- per-peer rejoin secret
- Tauri 데스크톱: Status / Peers / Inbox / **Board**
- `bun run smoke:desktop`

**아직 아님 (의도적):**
- 실시간 멀티라이터 board CRDT / relay 보드 동기화
- 에이전트 TUI 임베드 (PTY inject no-go)
- 클라우드 계정 / 멀티테넌시 — 로컬-퍼스트

---

## 다음 / 요청

- 데모 피드백: 오프라인 핸드오프 체감, 데스크톱 첫인상, Board.
- 다음 후보: GUI polish, live board sync, pack file-body embed (L-5).
- 코드/스펙: [`README.md`](../README.md) · [`docs/PLAN.md`](./PLAN.md) · [`docs/plan_review.md`](./plan_review.md) · [`apps/desktop/README.md`](../apps/desktop/README.md)

---

*Slack: `docs/loom-demo.gif` 첨부 + 이 본문 붙여넣기.*
