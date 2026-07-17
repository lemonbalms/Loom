# Step 0 — WSL2 / Windows ↔ Loom relay 네트워킹 PoC

| Field | Value |
|-------|--------|
| **Phase** | Loom × Herdr 브릿지 선행 게이트 (HERDR_DESIGN §5.1) |
| **Status** | **in progress** — Tailscale L3 확인 · 호스트 원격실행 대기 |
| **Verdict** | **pending** (Exit criteria 미충족) |
| **Date** | 2026-07-17 |
| **Related** | [`HERDR_DESIGN.md`](../HERDR_DESIGN.md) §5.1 · Step 0.5 [`STEP0.5-HERDR.md`](./STEP0.5-HERDR.md) |
| **Scripts** | [`scripts/step0-windows.ps1`](./scripts/step0-windows.ps1) · [`scripts/step0-wsl.sh`](./scripts/step0-wsl.sh) |

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
| TCP **22** SSH | **closed** |
| TCP **3389** RDP | **open** |
| TCP **445** SMB | **open** |
| TCP **7842** Loom relay | **closed** (not started on Windows yet) |
| TCP 5985/5986 WinRM | closed |
| Tailscale SSH / key SSH | **no** (host key / no sshd) |

**Implication:** Mac can **reach** the Windows machine over Tailscale, but **cannot run commands** until OpenSSH (or another remote shell) is enabled. Step 0 host-side actions need the owner once, or OpenSSH permanently.

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

### Checklist (HERDR_DESIGN §5.1)

| # | Item | Status |
|---|------|--------|
| ① | `.wslconfig` mirrored | **pending** (script will write if missing) |
| ② | Windows relay `0.0.0.0:7842` + token | **pending** (7842 closed on TS IP) |
| ③ | WSL `curl http://127.0.0.1:7842/health` | **pending** |
| ④ | NAT gateway fallback | **pending** |
| ⑤ | `loom room join` WS round-trip | **pending** |
| ⑥ | 30m soak (optional) | **pending** |
| TS | Mac ↔ Windows L3 Tailscale | **done** |

## Exit criteria

**Pass:** ③ health 200 with `version:1` **and** ⑤ join success (`peerSecret` present).  
**Fail:** mirrored + NAT + firewall all tried → still no ⑤ → Verdict **no-go**, consider reverse layout (relay inside WSL, Windows Loom client attaches).

## Current verdict

| Decision | Choice |
|----------|--------|
| Tailscale usable as underlay Mac↔Windows? | **Yes** (ping + direct path) |
| Step 0 relay/WSL path complete? | **No** — need host shell (OpenSSH) or owner script run |
| Blocker | **No SSH/WinRM on Windows**; relay not listening |

## Out of scope

- Bridge implementation
- herdr install on WSL (Step 0.5 already done on Mac; re-run optional on WSL)
- VPS public relay

## Next

1. Owner: **OpenSSH enable** (preferred) **or** run `step0-windows.ps1` and paste output.
2. Agent: complete ②–⑤ over SSH or from pasted logs; fill Verdict.
3. If go → PLAN 0.22.0 FREEZE exception + R23 queue.
