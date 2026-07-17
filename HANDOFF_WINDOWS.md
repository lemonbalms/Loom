# HANDOFF — Windows (`DESKTOP-LG99QSS`)

> **이 파일만 보면 됩니다.** Mac 세션이 남긴 **지금 Windows에서 할 일** 전용 핸드오프입니다.  
> 전체 프로젝트 맥락은 [`HANDOFF.md`](./HANDOFF.md) · 설계는 [`docs/HERDR_DESIGN.md`](./docs/HERDR_DESIGN.md).

| | |
|--|--|
| **Date** | 2026-07-17 |
| **Repo** | https://github.com/lemonbalms/Loom (`main`) |
| **Windows host** | `DESKTOP-LG99QSS` · Tailscale `100.65.103.113` · `desktop-lg99qss.tail536996.ts.net` |
| **Mac peer** | `kyoungsik` · Tailscale `100.69.230.114` · `kyoungsik.tail536996.ts.net` |
| **Gate** | **Step 0** — WSL ↔ Windows-host Loom relay 네트워킹 PoC |
| **이미 끝남** | Step 0.5 herdr 실측 (Mac) · Loom 0.21.1 · Herdr 설계서 |
| **코드 구현** | 아직 **FREEZE** — 브릿지 코드 치지 말 것. 이 문서는 **측정·스크립트만**. |

---

## 0) 이 PC에서 git으로 최신 받기

### PowerShell (Windows)

```powershell
# 처음이면
cd $HOME\projects   # 또는 원하는 폴더
git clone https://github.com/lemonbalms/Loom.git
cd Loom

# 이미 clone 했으면
cd path\to\Loom
git fetch origin
git checkout main
git pull --ff-only origin main
```

### WSL (Ubuntu) — 권장 작업 위치

```bash
cd ~
# 처음
git clone https://github.com/lemonbalms/Loom.git
cd Loom
# 이후
git pull --ff-only origin main
```

읽을 파일 (우선순위):

1. **`HANDOFF_WINDOWS.md`** ← 지금 이 파일  
2. `docs/spikes/STEP0-WSL2-NETWORKING.md` — Step 0 스파이크 본문  
3. `docs/spikes/scripts/step0-windows.ps1` · `step0-wsl.sh`  
4. `docs/HERDR_DESIGN.md` §5.1 — 게이트 정의  
5. `HANDOFF.md` — 전체 세션 상태  

---

## 1) 목표 (Step 0 Exit criteria)

| # | 통과 조건 |
|---|-----------|
| **③** | WSL에서 `curl http://…:7842/health` → `{"ok":true,"version":1,...}` |
| **⑤** | (이어서) `loom room join` WebSocket 왕복 — ③ 통과 후 |

설계 의도: **Windows = Loom 컨트롤 타워(relay)** · **WSL/Mac/Linux = herdr 노드**.  
지금은 relay가 Windows에서 떠서 WSL이 붙는지가 핵심입니다.

Mac에서 이미 확인한 것:

- Tailscale L3: Mac → 이 PC **ping OK** (~5 ms, direct)
- **SSH(22) 닫힘** · RDP(3389)/SMB(445) 열림 · **relay 7842 아직 없음**

---

## 2) 지금 할 일 — 두 갈래 중 하나

### 갈래 A (권장) — OpenSSH + Mac 공개키 → Mac 에이전트가 원격으로 마무리

#### A1. OpenSSH 서버

**관리자 PowerShell:**

```powershell
Add-WindowsCapability -Online -Name OpenSSH.Server~~~~0.0.1.0
Start-Service sshd
Set-Service -Name sshd -StartupType Automatic
Get-Service sshd
Get-NetFirewallRule -Name *OpenSSH* | Format-Table DisplayName, Enabled
```

#### A2. Mac 공개키 등록 (키 인증 — 준비됨 2026-07-17)

Mac 전용 키: `~/.ssh/id_ed25519_loom_windows`  
**아래 한 줄을 그대로** `authorized_keys`에 넣습니다 (줄바꿈 없이 1줄).

```
ssh-ed25519 AAAAC3NzaC1lZDI1NTE5AAAAIC8tV+XLiEuWg06S2Wi072aShc8ppd9i7w97yiLV7xtZ loom-windows-kyoungsiklee@KYOUNGSIKui-noteubug
```

**일반 사용자 계정** (대부분의 경우 — 관리자 PowerShell 불필요):

```powershell
# 현재 로그인 사용자에 키 등록
$dir = "$env:USERPROFILE\.ssh"
New-Item -ItemType Directory -Force -Path $dir | Out-Null
$pub = "ssh-ed25519 AAAAC3NzaC1lZDI1NTE5AAAAIC8tV+XLiEuWg06S2Wi072aShc8ppd9i7w97yiLV7xtZ loom-windows-kyoungsiklee@KYOUNGSIKui-noteubug"
$ak = Join-Path $dir "authorized_keys"
if (-not (Test-Path $ak) -or -not (Select-String -Path $ak -Pattern "loom-windows-kyoungsiklee" -Quiet)) {
  Add-Content -Path $ak -Value $pub -Encoding ascii
}
# OpenSSH on Windows: authorized_keys must not be overly open
icacls $ak /inheritance:r
icacls $ak /grant:r "$env:USERNAME:(R)"
icacls $dir /inheritance:r
icacls $dir /grant:r "$env:USERNAME:(OI)(CI)(F)"
Write-Host "registered. user=$env:USERNAME"
Write-Host "tell Mac: OpenSSH on. user=$env:USERNAME"
Get-Content $ak
```

**Administrators 그룹 계정**으로 로그인하는 경우 (키 무시되면):

```powershell
# 관리자 PowerShell
$pub = "ssh-ed25519 AAAAC3NzaC1lZDI1NTE5AAAAIC8tV+XLiEuWg06S2Wi072aShc8ppd9i7w97yiLV7xtZ loom-windows-kyoungsiklee@KYOUNGSIKui-noteubug"
$ak = "C:\ProgramData\ssh\administrators_authorized_keys"
Add-Content -Path $ak -Value $pub -Encoding ascii
icacls $ak /inheritance:r
icacls $ak /grant "Administrators:F"
icacls $ak /grant "SYSTEM:F"
# sshd_config: 관리자 키 경로 확인 (기본이 위 파일인 경우가 많음)
Get-Content C:\ProgramData\ssh\sshd_config | Select-String -Pattern "admin|Authorized"
Restart-Service sshd
```

#### A3. Mac에 알려 줄 한 줄

```text
OpenSSH on. user=<Windows사용자명>
```

예: `OpenSSH on. user=kyoungsiklee`  
Mac은 그 이름으로:

```bash
ssh -i ~/.ssh/id_ed25519_loom_windows USER@100.65.103.113
# 또는 Host 별칭 (User를 실제 이름으로 바꾼 뒤):
# ssh desktop-lg99qss
```

### 갈래 B — SSH 없이 이 PC에서 스크립트 실행 후 결과 붙여넣기

**관리자 PowerShell** (repo pull 후):

```powershell
cd path\to\Loom
git pull --ff-only origin main
powershell -ExecutionPolicy Bypass -File .\docs\spikes\scripts\step0-windows.ps1
```

또는 raw (clone 없이):

```powershell
irm https://raw.githubusercontent.com/lemonbalms/Loom/main/docs/spikes/scripts/step0-windows.ps1 | iex
```

스크립트가 하는 일:

1. `.wslconfig`에 `networkingMode=mirrored` 없으면 작성 (이후 `wsl --shutdown` 필요할 수 있음)  
2. 방화벽 `7842/tcp` 인바운드 시도  
3. Windows PATH에 `loom` 있으면 host relay 기동  
4. WSL 안에서 health 프로브  

**출력 끝부분** (`WIN_HOST=… TOKEN=… PORT=…` 블록)을 Mac 채팅에 그대로 붙여 주세요.

---

## 3) 수동 체크리스트 (스크립트 안 쓸 때)

### 3.1 WSL mirrored (권장)

`%UserProfile%\.wslconfig`:

```ini
[wsl2]
networkingMode=mirrored
```

적용:

```powershell
wsl --shutdown
# Ubuntu 다시 열기
wsl --version
```

### 3.2 Windows 또는 WSL에서 Loom 설치

WSL:

```bash
curl -fsSL https://raw.githubusercontent.com/lemonbalms/Loom/main/scripts/install.sh | bash
exec $SHELL -l
loom --version
```

### 3.3 Relay 기동 (Windows host 권장)

PowerShell (loom이 Windows에 있을 때):

```powershell
$env:LOOM_RELAY_TOKEN = -join ((1..24) | ForEach-Object { '{0:x2}' -f (Get-Random -Max 256) })
Write-Host "TOKEN=$env:LOOM_RELAY_TOKEN"
loom relay --host 0.0.0.0 --port 7842 --token $env:LOOM_RELAY_TOKEN
```

다른 창에서:

```powershell
curl http://127.0.0.1:7842/health
# 기대: {"ok":true,...,"auth":true,"version":1}
```

### 3.4 WSL에서 health

```bash
# mirrored면 보통:
curl -m 5 http://127.0.0.1:7842/health

# 실패 시 NAT 게이트웨이:
GW=$(ip route show default | awk '/default/{print $3; exit}')
echo "GW=$GW"
curl -m 5 "http://${GW}:7842/health"

# Tailscale (이 PC IP, Mac에서 관측값):
curl -m 5 http://100.65.103.113:7842/health

# 레포 스크립트
export WIN_TS_IP=100.65.103.113
export MAC_TS_IP=100.69.230.114
bash docs/spikes/scripts/step0-wsl.sh
# 또는
curl -fsSL https://raw.githubusercontent.com/lemonbalms/Loom/main/docs/spikes/scripts/step0-wsl.sh | bash
```

### 3.5 (③ 통과 후) join 왕복 — ⑤

Windows/WSL 아무 쪽이나 loom 있는 셸:

```bash
# 토큰·URL을 맞춘 뒤 (예)
export LOOM_RELAY_URL="ws://127.0.0.1:7842/ws"   # 또는 Tailscale IP
export LOOM_RELAY_TOKEN="(위에서 쓴 토큰)"
loom room create --name step0-poc
loom room invite --link
# 나온 blob으로 다른 프로필/WSL에서:
# loom room join 'loom://join/...'
loom status
```

---

## 4) Mac에서 이미 돌려 둔 것 (참고)

| 항목 | 상태 |
|------|------|
| herdr v0.7.4 설치·실측 | ✅ Mac · `docs/spikes/STEP0.5-HERDR.md` · fixtures |
| Herdr 브릿지 설계 | ✅ `docs/HERDR_DESIGN.md` |
| Tailscale → 이 PC | ✅ ping / direct |
| 이 PC SSH | ❌ 22 closed |
| 이 PC loom :7842 | ❌ 아직 미기동 (Step 0이 하는 일) |
| Mac 임시 relay (역방향 스모크) | 있을 수 있음 · **Step 0 정방향과 별개** |

Mac Tailscale IP로 역방향만 보고 싶다면 (선택):

```bash
# WSL에서
curl -m 5 http://100.69.230.114:7842/health
```

정방향 Step 0 통과 조건은 **Windows(또는 동일 LAN/TS의 타워) relay + WSL 클라이언트**입니다.

---

## 5) 끝나면 채팅에 붙일 템플릿

```text
## Step 0 result (Windows)
hostname:
wsl_version:
mirrored: yes/no
relay_where: windows-host | wsl | none
token: (있으면)
health_127:
health_gateway:
health_ts_100.65.103.113:
loom_version:
herdr_version: (optional)
notes:
```

또는 스크립트 출력 전문.

---

## 6) 하지 말 것

- `loom bridge` / PLAN 0.22 구현 코드 작성 (FREEZE · R23 전)
- force-push / 비밀 토큰을 이 파일에 커밋
- herdr 소스를 Loom 레포에 벤더링 (AGPL 경계 — 소켓 호출만)

---

## 7) 관련 링크 (repo 내부)

| 문서 | 용도 |
|------|------|
| [`docs/spikes/STEP0-WSL2-NETWORKING.md`](./docs/spikes/STEP0-WSL2-NETWORKING.md) | Step 0 판정 표 |
| [`docs/spikes/scripts/step0-windows.ps1`](./docs/spikes/scripts/step0-windows.ps1) | Windows 원샷 |
| [`docs/spikes/scripts/step0-wsl.sh`](./docs/spikes/scripts/step0-wsl.sh) | WSL 프로브 |
| [`docs/spikes/STEP0.5-HERDR.md`](./docs/spikes/STEP0.5-HERDR.md) | herdr 실측 (완료) |
| [`docs/HERDR_DESIGN.md`](./docs/HERDR_DESIGN.md) | 브릿지 설계 |
| [`docs/DRY_RUN_RUNBOOK.md`](./docs/DRY_RUN_RUNBOOK.md) | 팀 온보딩 런북 |
| [`HANDOFF.md`](./HANDOFF.md) | 전체 세션 핸드오프 |

---

**한 줄 요약:** `git pull` → 이 파일 → **OpenSSH 켜기** 또는 **`step0-windows.ps1` 실행** → health 결과 붙여넣기.
