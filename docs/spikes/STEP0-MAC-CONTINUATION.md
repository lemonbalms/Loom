# Step 0 — Mac 에이전트 연속 실측 (Windows 준비 이후)

| Field | Value |
|-------|--------|
| **Date** | 2026-07-17 |
| **Follows** | [`STEP0-WINDOWS-RESULT.md`](./STEP0-WINDOWS-RESULT.md) (`0f968be`) |
| **Host** | `DESKTOP-LG99QSS` · user `34970` · TS `100.65.103.113` |
| **Verdict** | **go** (③ health + ⑤ join 충족) |
| **Related** | [`STEP0-WSL2-NETWORKING.md`](./STEP0-WSL2-NETWORKING.md) · [`HERDR_DESIGN.md`](../HERDR_DESIGN.md) §5.1 |

## What Windows had already done

See `STEP0-WINDOWS-RESULT.md`: OpenSSH + Mac ed25519 key, Ubuntu WSL, firewall 7842, loom v0.21.1, local relay smoke. Mirrored intentionally deferred (docker-desktop).

## What Mac agent did next

### SSH

```bash
ssh -i ~/.ssh/id_ed25519_loom_windows 34970@100.65.103.113
# ✅ key auth OK
```

### Relay durable start

One-shot `Start-Process` from SSH **dies after the session** (process tree).  
**Fix used:** Scheduled Task `LoomRelayStep0` → `loom.exe relay --host 0.0.0.0 --port 7842 --token <ephemeral>`.

Host health (stable):

```json
{"ok":true,"rooms":0,"auth":true,"version":1}
```

### WSL → host health (③)

| Path | Result |
|------|--------|
| `http://127.0.0.1:7842/health` (WSL) | fail — **not mirrored** |
| `http://172.27.80.1:7842/health` (WSL NAT gateway) | **OK** `version:1` auth true |
| Mac → `http://100.65.103.113:7842/health` | timeout (Tailscale path; not required for Step 0) |

**Windows edition note:** `Windows 10.0.19045` — **mirrored networking is Win11-only** and was ignored even after writing `.wslconfig`. Step 0 on this machine is **NAT gateway path**, not localhost mirror.

Firewall: with durable relay + existing/added 7842 allow rules, NAT path worked **with firewall ON**.

### Join round-trip (⑤)

| Step | Result |
|------|--------|
| Host create | `LOOM-D3FT` · peer `tower` · profile `step0-host` |
| WSL join | `loom.exe` via WSL interop · `--relay ws://172.27.80.1:7842/ws` · peer `wslnode` |
| Roster | **2 peers** (`tower`, `wslnode`) — join handshake succeeded |

Invite blob embedded `127.0.0.1` (loopback warning). Join used **explicit gateway URL** instead of blob URL — correct for NAT.

Online flags after one-shot CLI: both often `offline` without sticky host — expected; not a join failure.

## Checklist (final)

| # | Item | Status |
|---|------|--------|
| TS | Mac ↔ Windows L3 | done |
| SSH | OpenSSH + key | done |
| ① | mirrored | **N/A on Win10** (config written, ineffective) |
| ② | `0.0.0.0:7842` + token | done (scheduled task) |
| ③ | WSL health | **done** via `172.27.80.1` |
| ④ | NAT fallback | **done** (primary path) |
| ⑤ | room join | **done** LOOM-D3FT · 2 peers |

## Verdict

| Decision | Choice |
|----------|--------|
| Step 0 Exit criteria | **Pass / go** |
| Default node attach URL from WSL | `ws://<Windows-vEthernet-WSL-IP>:7842/ws` (here `172.27.80.1`) |
| Mirrored localhost share | Not available on this Win10 host |
| Bridge planning implication | Node bridge on WSL must resolve **host LAN/NAT IP**, not assume `127.0.0.1` unless Win11 mirrored |

## Cleanup notes (optional)

- Scheduled task `LoomRelayStep0` may still be running — stop when done:  
  `Unregister-ScheduledTask -TaskName LoomRelayStep0 -Confirm:$false`  
  + kill listener on 7842.
- Ephemeral relay token was session-local; not committed.
- `.wslconfig` still contains `networkingMode=mirrored` (harmless on Win10; useful if upgraded to Win11).

## Next product gate

PLAN **0.22.0** `pending-review` still needs **FREEZE 예외 = 오너 pull 한 줄** → R23 → implement `loom bridge` using Step 0.5 fixtures + this network model.
