# Step 0.5 — herdr 실측 (소켓 API · 프레이밍 · 라이선스)

| Field | Value |
|-------|--------|
| **Phase** | Loom × Herdr 브릿지 선행 게이트 (HERDR_DESIGN §5.2) |
| **Status** | **done** (macOS aarch64 live probe) · WSL 재현 권장(동일 바이너리 경로) |
| **Verdict** | **go for bridge design** — 핵심 [가정-H] 해소. 보정 4건 설계서에 반영 필요 (C4는 0.22.0 라이브 스모크에서 추가) |
| **Date** | 2026-07-17 |
| **herdr** | **v0.7.4** stable · protocol **16** |
| **Platform** | macOS aarch64 (Apple Silicon). herdr는 Linux/Mac/WSL 대상 — 본 실측은 **Mac 노드**. WSL2는 Step 0 네트워킹과 별개로 동일 API 재확인 권장 |
| **GitHub** | https://github.com/ogulcancelik/herdr |
| **Install** | `curl -fsSL https://herdr.dev/install.sh \| sh` → `~/.local/bin/herdr` |
| **Fixtures** | [`docs/spikes/fixtures/herdr-v0.7.4/`](./fixtures/herdr-v0.7.4/) |
| **Related** | [`docs/HERDR_DESIGN.md`](../HERDR_DESIGN.md) §0.1 · §5.2 · §5.4 |

## Goal

HERDR_DESIGN §0.1 **[가정-H]** 전량을 실물 herdr로 재확정하고, CI fake herdr의 근거가 되는 **요청/응답 원문 fixture**를 고정한다.  
이 게이트 없이 브릿지 코드 착수 금지.

## Automated / live harness

```bash
# install (once)
curl -fsSL https://herdr.dev/install.sh | sh
export PATH="$HOME/.local/bin:$PATH"

# headless server (no TUI required)
herdr server          # api socket: ~/.config/herdr/herdr.sock (0600)
herdr status          # client/server version + protocol
herdr api schema --json > schema.json
herdr api snapshot

# raw NDJSON probe (example)
python3 - <<'PY'
import socket, json
s = socket.socket(socket.AF_UNIX, socket.SOCK_STREAM)
s.connect("$HOME/.config/herdr/herdr.sock".replace("$HOME", __import__("os").path.expanduser("~")))
s.sendall(b'{"id":"1","method":"ping","params":{}}\n')
print(s.recv(4096).decode())
PY
```

Fixtures under `fixtures/herdr-v0.7.4/` were captured against a live `herdr server` on this machine (2026-07-17).

## Checklist (§5.2) — results

| # | Item | Result | Evidence |
|---|------|--------|----------|
| 1 | 설치·버전·라이선스 | **OK** · pre-1.0 **v0.7.4** · **AGPL-3.0-or-later + commercial dual** | `herdr --version` · GitHub `LICENSE` · `INDEX.json` |
| 2 | 소켓 경로·프레이밍·ping | **OK** · path `~/.config/herdr/herdr.sock` · mode **0600** · **NDJSON** · `params` **필수** | `rpc-01-ping.json` · status |
| 3 | `agent.start` `--env` · `HERDR_PANE_ID` | **OK** · env 적용 · `HERDR_PANE_ID=<pane_id>` 자동 주입 · 반환 `agent.pane_id`/`terminal_id`/`name` | `rpc-03-agent.start.json` · `rpc-06-pane.read-recent.json` |
| 4 | `agent.send` no-Enter | **OK** · CLI: "writes literal text; use pane run … plus Enter" · live: 리터럴이 pane에 찍히고 Enter 없음 | `agent-help.txt` · `rpc-08` · `rpc-09` |
| 5 | `events.subscribe` · 상태 · 본문 부재 | **OK (보정 있음)** · subscribe `{type, pane_id}` · push `{event, data}` · **status 이벤트에 출력 본문 없음** · 상태 enum 5종 관측 가능 | `rpc-10b` · `rpc-15` · schema |
| 6 | `pane.read --source recent` | **OK** · sources: `visible` \| `recent` \| `recent_unwrapped` \| `detection` · result nested under `result.read` | `rpc-06-*` · schema `ReadSource` |
| 7 | pane/agent 스냅샷 (reconcile) | **OK** · `session.snapshot` → workspaces/tabs/panes/agents + focused_* | `rpc-02` · CLI `herdr api snapshot` |
| 8 | `pane.report_metadata` seq | **PARTIAL** · method + `seq` 필드 존재 · **낮은 seq 거부는 이 프로브에서 관찰 실패**(여전히 `ok`) | `rpc-11`–`13` |
| 9 | fixture 캡처 | **OK** | `fixtures/herdr-v0.7.4/` |

### 보정 4건 (설계 가정 vs 실측)

| ID | 가정 (권고/설계) | 실측 | 설계 영향 |
|----|------------------|------|-----------|
| **C1** | `pane.report_agent` / 대기로 `done` 상태를 직접 씀 | `PaneAgentState` = `idle\|working\|blocked\|unknown` 만 허용. **`done` report 시 invalid_request**. `AgentStatus` enum에는 `done` 존재(관측/롤업용) | 완료 감지는 **detection 롤업 `done` 이벤트** 또는 idle/exit 조합으로 설계. `report_agent(state=done)` 의존 금지 |
| **C2** | 이벤트 이름 단일 표기 | **subscribe** 필터: dotted (`pane.agent_status_changed`) + `type` 키 · **wait/match & push**: underscored (`pane_agent_status_changed`) + `event` 키 | 브릿지/fake는 두 네이밍을 구분 구현 |
| **C3** | `agent.wait`가 소켓 method | CLI 전용 래퍼. 소켓은 **`events.wait`** (`match_event.event` + `timeout_ms`) | 브릿지는 `events.subscribe` 장기 구독 또는 `events.wait` 사용 |
| **C4** | 단일 지속 연결에 RPC 다중화 (2026-07-17 라이브 스모크 실측) | **RPC 1건 = 연결 1개.** 모든 요청은 응답 직후 **서버 FIN**으로 종료. 유일 예외 `events.subscribe`(push용 연결 유지) — 단 그 연결로 추가 RPC 전송 시 무응답 FIN. 연속 요청은 in-flight FIN과 경합해 `This socket has been ended by the other party` | 클라이언트 = **요청별 신규 연결** + 구독 전용 장기 연결(끊김 시 재구독). fake herdr도 FIN-per-response 재현 필수(지속 연결 fake는 이 버그를 놓침 — 0.22.0 라이브 스모크에서 `prompt_inject_failed`로 발현) |

## Wire contract (locked for fake herdr)

### Framing

```
request:  {"id":"<str>","method":"<str>","params":{...}}\n
success:  {"id":"<str>","result":{"type":"<str>", ...}}\n
error:    {"id":"<str>","error":{"code":"<str>","message":"<str>"}}\n
event:    {"event":"<underscore_name>","data":{...}}\n   # after events.subscribe on same conn
```

- **params always required** (empty `{}` for `ping`).
- Not length-prefixed; not LSP Content-Length.
- Socket: Unix domain, **0600**, default `~/.config/herdr/herdr.sock` (override via env — CLI documents `HERDR_SOCKET_PATH` on site docs; status prints resolved path).

### Minimal method set for Loom bridge (§5.4)

| Method | Purpose |
|--------|---------|
| `ping` | version + protocol fail-fast |
| `session.snapshot` | reconnect reconcile |
| `agent.start` | spawn worker (`name`, `argv`, `env`, optional cwd/split/workspace) |
| `agent.send` | literal prompt inject (**no Enter**) |
| `pane.read` / `agent.read` | harvest output (`source: recent`) |
| `events.subscribe` | long-lived status push |
| `events.wait` | one-shot match (optional) |
| `pane.list` / `agent.list` | inventory |
| `pane.close` | cleanup |

### agent.start result shape (live)

```json
{
  "type": "agent_started",
  "agent": {
    "terminal_id": "term_…",
    "name": "loom-probe",
    "pane_id": "w1:p1",
    "workspace_id": "w1",
    "tab_id": "w1:t1",
    "agent_status": "unknown",
    "revision": 0
  },
  "argv": ["…"]
}
```

### events.subscribe (live)

```json
// request
{"id":"sub1","method":"events.subscribe","params":{
  "subscriptions":[
    {"type":"pane.agent_status_changed","pane_id":"w1:p1"}
  ]
}}
// response
{"id":"sub1","result":{"type":"subscription_started"}}
// later push (NO output body)
{"event":"pane_agent_status_changed","data":{
  "pane_id":"w1:p1","workspace_id":"w1",
  "agent_status":"idle","agent":"bash"
}}
```

### events.wait (live)

```json
// request
{"method":"events.wait","params":{
  "match_event":{
    "event":"pane_agent_status_changed",
    "pane_id":"w2:p1",
    "agent_status":"idle"
  },
  "timeout_ms":5000
}}
// success
{"result":{"type":"wait_matched","event":{…}}}
// timeout
{"error":{"code":"timeout","message":"timed out waiting for event match"}}
```

### Status model

| Surface | Values |
|---------|--------|
| Observed `AgentStatus` (events, lists, snapshot) | `idle` · `working` · `blocked` · **`done`** · `unknown` |
| Writable `pane.report_agent.state` | `idle` · `working` · `blocked` · `unknown` (**no `done`**) |
| CLI `herdr agent wait --status` | `idle` · `working` · `blocked` · `unknown` |

**Bridge completion strategy (revised):** prefer subscribe on `pane.agent_status_changed` and treat **`done` if detection emits it**; otherwise combine **idle after work** + optional `pane.exited` / process exit. Always follow with **one-shot `pane.read` source=recent** for body (status events carry no transcript).

## License

Confirmed dual-license on upstream:

1. **AGPL-3.0-or-later** (open source)
2. **Commercial** (hey@herdr.dev)

Loom boundary (HERDR_DESIGN §4.4.4): **socket client only** — do not link herdr into Loom process; do not vendor AGPL sources into `@loom/*`. Fake herdr in CI is a separate test double.

## Verdict

| Decision | Choice |
|----------|--------|
| Bridge implementation unblocked on herdr API? | **Yes (go)** — framing, start/send/read/subscribe/snapshot 실측됨 |
| Use design assumptions unchanged? | **No** — apply **C1–C3** corrections before PLAN 0.22.0 / R23 |
| WSL-specific? | **Not required for API surface** on same released binary; still need **Step 0** for Windows↔WSL relay networking |
| Fake herdr source of truth | **These fixtures** (`fixtures/herdr-v0.7.4/`) |

## Exit criteria

- [x] Install + version + license recorded
- [x] Socket path + NDJSON framing + ping
- [x] agent.start env + HERDR_PANE_ID
- [x] agent.send no-Enter
- [x] events.subscribe + status push without output body
- [x] pane.read recent
- [x] session.snapshot inventory
- [x] pane.report_metadata exists (seq strictness partial)
- [x] Fixture directory committed
- [ ] Optional: re-run same probe matrix on **WSL Ubuntu** once Step 0 host available
- [ ] Optional: capture a **real coding agent** (Claude/Codex) reaching detected `done` (not just bash + report_agent)

## Out of scope

- Loom bridge implementation (`loom bridge`)
- PLAN 0.22.0 open (needs FREEZE 예외 오너 확인 + Step 0 if WSL path)
- Windows native herdr (design: avoid; tower is Loom-only)
- Full 85-method matrix beyond bridge minimum

## Follow-ups

1. Patch `docs/HERDR_DESIGN.md` §0.1 / event completion path with C1–C3.
2. Step 0 WSL2 networking spike (owner Windows) — independent track.
3. When owner confirms FREEZE exception: PLAN 0.22.0 `pending-review` → R23.
