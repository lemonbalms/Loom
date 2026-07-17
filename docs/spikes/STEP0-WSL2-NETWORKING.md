# Step 0 — WSL2 / Windows ↔ Loom relay 네트워킹 PoC

| Field | Value |
|-------|--------|
| **Phase** | Loom × Herdr 브릿지 선행 게이트 (HERDR_DESIGN §5.1) |
| **Status** | **done** (2026-07-17) |
| **Verdict** | **go** — ③ WSL→host health + ⑤ join (2 peers). Win10 → NAT path (mirrored N/A) |
| **Date** | 2026-07-17 |
| **Results** | Windows prep [`STEP0-WINDOWS-RESULT.md`](./STEP0-WINDOWS-RESULT.md) · Mac continuation [`STEP0-MAC-CONTINUATION.md`](./STEP0-MAC-CONTINUATION.md) |
| **Related** | [`HERDR_DESIGN.md`](../HERDR_DESIGN.md) §5.1 · Step 0.5 [`STEP0.5-HERDR.md`](./STEP0.5-HERDR.md) |
| **Scripts** | [`scripts/step0-windows.ps1`](./scripts/step0-windows.ps1) · [`scripts/step0-wsl.sh`](./scripts/step0-wsl.sh) |
| **Windows handoff** | 레포 루트 [`HANDOFF_WINDOWS.md`](../../HANDOFF_WINDOWS.md) — Windows에서 `git pull` 후 이 파일부터 |

## Goal

Windows 호스트에서 도는 **Loom relay**에, 같은 머신의 **WSL** (나중: herdr 브릿지 노드)이  
**인바운드 경계**를 넘어 HTTP `/health` + WebSocket join 왕복으로 붙는지 판정한다.

기존 런북은 WSL → 원격 VPS **아웃바운드**만 검증했다. 이번 PoC는 반대 방향이다 역방향 배치 가능성을 닫거나 연다.

## Topology discovered (Tailscale)

From Mac `kyoungsik` (`100.69.230.114`, macOS):

| Peer | Tailscale IP | DNS | OS | Online |
|------|--------------|-----|-----|--------|
| **DESKTOP-LG99QSS** | **100.65.103.113** | `desktop-lg99qss.tail536996.ts.net` | **windows** | **yes** |
| kb | 100.116.39.101 | `kb.tail536996.ts.net` | linux | yes |
| kyoungsik (self) | 100.69.230.114 | `kyoungsik.tail536996.ts.net` | macOS | yes |

### L3 / port probe (Mac → Windows TS IP)

| Check | Result |
|-------|--------|
| ICMP ping | **OK** (~5–77 ms) |
| `tailscale ping` | **OK** direct path (~4 ms via `211.43.19.247:41641`) |
| TCP **22** SSH | **open** (after Windows prep) |
| TCP **3389** RDP | **open** |
| TCP **445** SMB | **open** |
| TCP **7842** Loom relay | host-local + WSL NAT OK; Mac Tailscale path timed out |
| Tailscale key SSH | **yes** — `34970@100.65.103.113` + `id_ed25519_loom_windows` |

**Implication (final):** SSH + NAT path closed Step 0. Win10 → no mirrored localhost; use `172.27.80.1` (vEthernet WSL).

## Automated harness (Mac-side so far)

```bash
tailscale status
ping -c 2 100.65.103.113
tailscale ping -c 3 100.65.103.113
# ports
nc -z -G 2 100.65.103.113 22   # expect fail
nc -z -G 2 100.65.103.113 3389 # expect ok
nc -z -G 2 100.65.103.113 7842 # expect fail until relay up
```

Optional reverse path (Mac = temporary tower, for TS path smoke only — **not** Step 0 primary topology):

```bash
# Mac (already exercised 2026-07-17):
TOKEN=$(openssl rand -hex 24)
bun run loom relay --host 0.0.0.0 --port 7842 --token "$TOKEN"
curl -s http://100.69.230.114:7842/health
# → {"ok":true,"rooms":0,"auth":true,"version":1}
```

## Manual matrix (Windows + WSL) — owner / OpenSSH

### Fast path A — enable OpenSSH (then Mac agent finishes alone)

In **Admin PowerShell** on DESKTOP-LG99QSS:

```powershell
Add-WindowsCapability -Online -Name OpenSSH.Server~~~~0.0.1.0
Start-Service sshd
Set-Service -Name sshd -StartupType Automatic
# confirm
Get-Service sshd
# optional: ensure key auth — append Mac pubkey to
#   C:\ProgramData\ssh\administrators_authorized_keys  (admin)
#   or  C:\Users\<you>\.ssh\authorized_keys
```

Then from Mac:

```bash
ssh USER@100.65.103.113
# or: ssh USER@desktop-lg99qss.tail536996.ts.net
```

### Fast path B — no SSH: run scripts on Windows

1. PowerShell (Admin preferred):

```powershell
# from a clone or raw:
irm https://raw.githubusercontent.com/lemonbalms/Loom/main/docs/spikes/scripts/step0-windows.ps1 | iex
# or download then:
# powershell -ExecutionPolicy Bypass -File step0-windows.ps1
```

2. Paste the printed `TOKEN` / health lines back to the agent.

3. From Mac verify:

```bash
curl -m 5 http://100.65.103.113:7842/health
```

### Checklist (HERDR_DESIGN §5.1) — final

| # | Item | Status |
|---|------|--------|
| TS | Mac ↔ Windows L3 Tailscale | **done** |
| SSH | OpenSSH + Mac ed25519 | **done** (`34970`) |
| ① | `.wslconfig` mirrored | **N/A** — host is **Windows 10** (mirrored needs Win11) |
| ② | Windows relay `0.0.0.0:7842` + token | **done** (Scheduled Task `LoomRelayStep0`) |
| ③ | WSL health | **done** — `http://172.27.80.1:7842/health` → `version:1` |
| ④ | NAT gateway fallback | **done** (primary path on Win10) |
| ⑤ | `loom room join` WS | **done** — `LOOM-D3FT` · peers `tower` + `wslnode` |
| ⑥ | 30m soak (optional) | skipped |

## Exit criteria

**Pass:** ③ health 200 with `version:1` **and** ⑤ join success.  
**Result:** **Pass / go** — detail in [`STEP0-MAC-CONTINUATION.md`](./STEP0-MAC-CONTINUATION.md).

## Current verdict

| Decision | Choice |
|----------|--------|
| Tailscale usable as underlay Mac↔Windows? | **Yes** (SSH; Mac→7842 TS optional/failed) |
| Step 0 relay/WSL path complete? | **Yes** |
| Node attach model on this host | **NAT:** `ws://<vEthernet WSL host IP>:7842/ws` |

## Out of scope

- Bridge implementation
- herdr install on WSL (Step 0.5 already done on Mac; re-run optional on WSL)
- VPS public relay

## Next

1. PLAN **0.22.0** after FREEZE 예외 오너 확인 → R23.
2. Design: WSL bridge uses host gateway IP on Win10 NAT (not `127.0.0.1`).
