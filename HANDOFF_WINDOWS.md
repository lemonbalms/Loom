# HANDOFF — Windows (`DESKTOP-LG99QSS`)

> **Windows 세션 진입점.** 이 파일만 읽고 아래에서 위로 실행하면 된다.  
> 제품 코드/PLAN 게이트는 Mac [`HANDOFF.md`](./HANDOFF.md). **Windows에서는 제품 코드 치지 말 것** (FREEZE · 브릿지 구현 금지).

| | |
|--|--|
| **Date** | 2026-07-17 |
| **Repo** | https://github.com/lemonbalms/Loom (`main`) |
| **Windows host** | `DESKTOP-LG99QSS` · Tailscale **`100.65.103.113`** · user **`34970`** (Administrators) |
| **Mac peer** | `kyoungsik` · `100.69.230.114` · SSH key on Mac `~/.ssh/id_ed25519_loom_windows` |
| **Clone path (typical)** | `E:\projects\Loom` (없으면 아래 §0-B) |
| **Step 0 (WSL↔host relay)** | **go** — 재실행 금지. 상세 `docs/spikes/STEP0-WINDOWS-RESULT.md` |
| **제품** | **0.22.0 shipped** (`loom bridge` 등). Windows OPS만 남음 |
| **지금 Windows 할 일** | **⭐ 시연 dispatch** — [`docs/spikes/DISPATCH-DEMO.md`](./docs/spikes/DISPATCH-DEMO.md) **§2** (`dispatchCard`). relay 상시화는 ✅ |

---

## ⭐ Current action (Windows — read first)

> **🎯 다음 = 시연 `dispatchCard()` 트리거.**  
> Mac bridge+fake herdr **준비 완료** (2026-07-17).  
> → **`git pull`** 후 **[`docs/spikes/DISPATCH-DEMO.md`](./docs/spikes/DISPATCH-DEMO.md) §2** 만 실행.  
> 기대: 무개입 `[DONE]` → Windows `loom inbox` / board `done`.
>
> ### 이미 끝난 것 (다시 하지 말 것)
> | 항목 | 상태 |
> |------|------|
> | Step 0 · relay Task `LoomRelayTeam` · 방화벽 Tailscale-only | ✅ |
> | room `demo` 양방향 handoff/board | ✅ |
> | Mac §1 fake herdr + bridge + M-1 allow | ✅ (Mac 재세팅 금지) |
> | PLAN/코드 / R23 / live herdr smoke | Mac shipped — Windows 코딩 금지 |
>
> ### 하지 말 것
> - `packages/**` / `apps/**` 제품 코드 · 신규 PLAN
> - Mac bridge 재기동·`--allow` 재실험 (이미 online)
> - `--insecure-open` · 공인 포트포워드 · Step 0 재측정

---

## 0) git으로 최신 받기 (항상 먼저)

### 0-A. 이미 clone 있음

**PowerShell (Windows):**

```powershell
cd E:\projects\Loom
# 경로가 다르면: Get-ChildItem -Path E:\,C:\Users\34970 -Filter HANDOFF_WINDOWS.md -Recurse -ErrorAction SilentlyContinue | Select-Object -First 3 FullName

git fetch origin
git checkout main
git pull --ff-only origin main

# 이 파일 확인
Get-Content .\HANDOFF_WINDOWS.md -Head 40
git log -1 --oneline
```

### 0-B. clone 없음

```powershell
# git 필요: https://git-scm.com/download/win
cd E:\projects   # 없으면 mkdir
git clone https://github.com/lemonbalms/Loom.git
cd Loom
# private이면: git clone git@github.com:lemonbalms/Loom.git
```

### 0-C. Mac에서 push 직후 Windows가 안 보이면

Mac에서 `git push origin main` 됐는지 확인. Windows는 **항상 `git pull --ff-only origin main`** 후 이 파일만 따른다.  
로컬 수정이 있으면:

```powershell
git status
# 의도 없는 로컬 변경이면:
# git checkout -- .
# git clean -fd   # 주의: untracked 삭제
git pull --ff-only origin main
```

### 0-D. Mac → Windows SSH (선택)

```bash
# Mac
ssh -i ~/.ssh/id_ed25519_loom_windows 34970@100.65.103.113
```

Windows 콘솔에서 직접 작업해도 된다. **토큰·invite는 채팅 장기 방치 금지.**

---

## 1) 환경 스냅샷 (사실 — 재설치 불필요하면 스킵)

| 항목 | 값 / 기대 |
|------|-----------|
| OpenSSH | Running · Automatic |
| Mac 키 | `C:\ProgramData\ssh\administrators_authorized_keys` |
| Ubuntu WSL | 설치됨 · host NAT gateway ≈ `172.27.80.1` (재부팅 후 변할 수 있음) |
| loom (과거 Step 0) | `C:\Users\34970\.bun\bin\loom.exe` — 버전 구버전이어도 **relay는 동작** |
| 방화벽 7842 | Allow (Step 0) |
| mirrored 모드 | Win10 → **무시됨** (localhost 공유 없음) — 팀 relay와 무관 |
| Tailscale | 이 머신 `100.65.103.113` · 팀원 **같은 tailnet** 필수 |

```powershell
tailscale status
tailscale ip -4
# 기대: 100.65.103.113  (다르면 아래 모든 URL을 새 IP로 치환 + 팀 invite 재발급)

& "$env:USERPROFILE\.bun\bin\loom.exe" --version
# 없으면: Bun + Loom 재설치 또는 WSL에서 install.sh 후 Windows PATH 확인
```

loom이 없으면 (WSL Ubuntu 권장 설치 경로와 별개로, Windows native가 이미 있었다면 path만 확인):

```powershell
# 기존 Step 0 경로 우선
Test-Path "$env:USERPROFILE\.bun\bin\loom.exe"
# true 아니면 Mac/문서 README 설치 후 다시 --version
```

---

## 2) ⭐ 실행: Tailscale 팀 relay 상시화

### 2-1. 토큰

```powershell
$dir = "$env:USERPROFILE\.loom"
New-Item -ItemType Directory -Force -Path $dir | Out-Null

# 이미 있으면 재사용 (덮어쓰지 말 것 — 팀 invite 무효화됨)
if (-not (Test-Path "$dir\relay-token.txt")) {
  $token = -join ((1..48) | ForEach-Object { '{0:x}' -f (Get-Random -Max 16) })
  Set-Content -Path "$dir\relay-token.txt" -Value $token -NoNewline
  Write-Host "NEW TOKEN (백업 필수): $token"
} else {
  Write-Host "existing token kept:"
  Get-Content "$dir\relay-token.txt"
}
```

토큰을 **1Password 등**에 백업. Mac 오너 세션에서도 같은 값 필요.

### 2-2. 수동 스모크 (Task 등록 전 필수)

```powershell
$loom  = "$env:USERPROFILE\.bun\bin\loom.exe"
$token = (Get-Content "$env:USERPROFILE\.loom\relay-token.txt" -Raw).Trim()
& $loom relay --host 0.0.0.0 --port 7842 --token $token
```

**다른 PowerShell:**

```powershell
curl.exe http://127.0.0.1:7842/health
# {"ok":true,...,"auth":true,"version":1}
```

**Mac (Tailscale on):**

```bash
curl -sS http://100.65.103.113:7842/health
```

| 실패 | 조치 |
|------|------|
| Mac timeout | Tailscale 양쪽 로그인? IP 변경? PC sleep? |
| connection refused | relay 미기동 · 다른 포트 |
| bind/token 거부 | `--token` 누락 금지 (`0.0.0.0`은 토큰 필수) |

통과 후 포그라운드는 `Ctrl+C`로 종료 → 2-3.

### 2-3. 래퍼 + Scheduled Task (`LoomRelayTeam`)

```powershell
$wrapper = @'
$ErrorActionPreference = "Stop"
$loom  = Join-Path $env:USERPROFILE ".bun\bin\loom.exe"
$token = (Get-Content (Join-Path $env:USERPROFILE ".loom\relay-token.txt") -Raw).Trim()
$logDir = Join-Path $env:USERPROFILE ".loom"
if (-not (Test-Path $loom)) { throw "loom.exe not found: $loom" }
if (-not $token) { throw "empty relay token" }
$log = Join-Path $logDir "relay.log"
$err = Join-Path $logDir "relay.err.log"
try {
  $h = Invoke-WebRequest -Uri "http://127.0.0.1:7842/health" -UseBasicParsing -TimeoutSec 2
  if ($h.StatusCode -eq 200) { exit 0 }
} catch {}
& $loom relay --host 0.0.0.0 --port 7842 --token $token 1>> $log 2>> $err
'@
Set-Content -Path "$env:USERPROFILE\.loom\start-relay.ps1" -Value $wrapper -Encoding UTF8

$taskName = "LoomRelayTeam"
$ps1 = "$env:USERPROFILE\.loom\start-relay.ps1"
Unregister-ScheduledTask -TaskName $taskName -Confirm:$false -ErrorAction SilentlyContinue
# 구 Step 0 작업 중복 방지
Unregister-ScheduledTask -TaskName "LoomRelayStep0" -Confirm:$false -ErrorAction SilentlyContinue

$action = New-ScheduledTaskAction `
  -Execute "powershell.exe" `
  -Argument "-NoProfile -ExecutionPolicy Bypass -WindowStyle Hidden -File `"$ps1`""
$trigger = New-ScheduledTaskTrigger -AtLogOn -User $env:USERNAME
$settings = New-ScheduledTaskSettingsSet `
  -AllowStartIfOnBatteries `
  -DontStopIfGoingOnBatteries `
  -StartWhenAvailable `
  -RestartCount 5 `
  -RestartInterval (New-TimeSpan -Minutes 1) `
  -ExecutionTimeLimit ([TimeSpan]::Zero)
$principal = New-ScheduledTaskPrincipal `
  -UserId $env:USERNAME `
  -LogonType Interactive `
  -RunLevel Limited

Register-ScheduledTask `
  -TaskName $taskName `
  -Action $action `
  -Trigger $trigger `
  -Settings $settings `
  -Principal $principal `
  -Description "Loom team relay on Tailscale :7842"

Start-ScheduledTask -TaskName $taskName
Start-Sleep -Seconds 2
curl.exe http://127.0.0.1:7842/health
```

### 2-4. 관리 치트시트

```powershell
Get-ScheduledTask -TaskName LoomRelayTeam | Get-ScheduledTaskInfo
Start-ScheduledTask -TaskName LoomRelayTeam
Stop-ScheduledTask  -TaskName LoomRelayTeam

# 프로세스 강제 종료
Get-CimInstance Win32_Process -Filter "Name = 'loom.exe'" |
  Where-Object { $_.CommandLine -match 'relay' } |
  ForEach-Object { Stop-Process -Id $_.ProcessId -Force }

Get-Content $env:USERPROFILE\.loom\relay.err.log -Tail 40
```

**절전:** dry-run 기간 노트북 **절전 안 함** (또는 AC + 뚜껑 닫아도 켜둠). sleep = 팀 relay 다운.

### 2-5. 완료 체크 (Windows 측)

- [ ] `curl.exe http://127.0.0.1:7842/health` → ok + auth
- [ ] Mac: `curl http://100.65.103.113:7842/health` → 동일
- [ ] Windows **재부팅 1회** 후 health 재확인
- [ ] 토큰 백업 완료
- [ ] (선택) 이 파일 §5 완료 메모에 날짜·결과 한 줄 추가 후 **Mac에서 commit** (Windows는 docs만 고칠 때 `git pull` 전 충돌 주의)

Windows에서 이 파일에 완료 메모를 직접 커밋해도 된다 (docs only):

```powershell
cd E:\projects\Loom
git pull --ff-only origin main
# §5 체크 업데이트 후
git add HANDOFF_WINDOWS.md
git commit -m "docs(handoff-windows): team Tailscale relay online"
git push origin main
```

---

## 3) Mac / 오너 후속 (Windows 완료 후 — Mac 터미널)

Windows health가 Mac에서 보이면:

```bash
export LOOM_RELAY_URL=ws://100.65.103.113:7842
export LOOM_RELAY_TOKEN='<Windows ~/.loom/relay-token.txt 내용>'

loom --profile owner room create --name team --as owner
loom --profile owner room invite --link
# loom://join/...  → 팀 전달 (신뢰 채널)
```

팀원 (Mac/Linux/WSL · **Tailscale 필수**):

```bash
curl -fsSL https://raw.githubusercontent.com/lemonbalms/Loom/main/scripts/install.sh | bash
exec $SHELL
loom room join "loom://join/<blob>"
```

상세 온보딩: [`docs/DRY_RUN_RUNBOOK.md`](./docs/DRY_RUN_RUNBOOK.md) Step 1–4.  
URL만 VPS 대신 **`ws://100.65.103.113:7842`**.

---

## 4) Step 0 참고 (재실행 금지 · 사실만)

| 항목 | 결과 |
|------|------|
| WSL health (host relay) | `curl http://172.27.80.1:7842/health` (gateway는 `ip route`로 확인) |
| join 예 | `LOOM-D3FT` · tower + wslnode (옛 스모크) |
| WSL attach 패턴 | `ws://172.27.80.1:7842/ws` — **팀 공용 URL 아님** (host NAT). 팀 공용 = Tailscale `100.65…` |

Mac SSH:

```bash
ssh -i ~/.ssh/id_ed25519_loom_windows 34970@100.65.103.113
```

Mac 공개키 (재등록 시):

```
ssh-ed25519 AAAAC3NzaC1lZDI1NTE5AAAAIC8tV+XLiEuWg06S2Wi072aShc8ppd9i7w97yiLV7xtZ loom-windows-kyoungsiklee@KYOUNGSIKui-noteubug
```

→ `C:\ProgramData\ssh\administrators_authorized_keys` + ACL SYSTEM/Administrators only.

---

## 5) 완료 메모 (Windows 작업자가 채움)

| 날짜 | 결과 | 비고 |
|------|------|------|
| 2026-07-17 | **Windows측 상시화 done** | Task `LoomRelayTeam` (AtLogOn·RestartCount5) · relay=**bun 프로세스**(loom.exe가 bun 런타임 → `Get-Process loom` 안 잡힘, `Get-NetTCPConnection -LocalPort 7842`로 확인) · `0.0.0.0:7842` health `ok+auth:true` · 방화벽 7842 = **Tailscale(100.64/10)+WSL 사설만** (Step 0의 `Remote=Any` 규칙 2개 삭제, WSL 172.16/12·172.27/16 유지) · 토큰 `~/.loom/relay-token.txt` 생성(48자). **오너 미검증: ① Mac `curl http://100.65.103.113:7842/health` ② 재부팅 1회 후 health ③ 절전 금지.** IP 변동 없음(100.65.103.113). 다음=§3 room create+invite |

---

## 6) 관련 문서

| 문서 | 용도 |
|------|------|
| [`HANDOFF.md`](./HANDOFF.md) | Mac/에이전트 메인 · 제품 상태 |
| [`docs/DRY_RUN_RUNBOOK.md`](./docs/DRY_RUN_RUNBOOK.md) | 팀 6인 온보딩 Step 1–4 |
| [`apps/relay-cloud/README.md`](./apps/relay-cloud/README.md) | relay 토큰·TLS·health |
| [`docs/spikes/STEP0-WINDOWS-RESULT.md`](./docs/spikes/STEP0-WINDOWS-RESULT.md) | Step 0 실측 (재실행 금지) |
| [`docs/HERDR_DESIGN.md`](./docs/HERDR_DESIGN.md) | 브릿지 설계 (Windows 코딩 대상 아님) |

---

## 트러블슈팅

| 증상 | 조치 |
|------|------|
| `git pull` 거부 | 로컬 수정 정리 또는 stash · `main` 맞는지 |
| Tailscale IP ≠ 100.65.103.113 | `tailscale ip -4`로 URL 전면 치환 · invite 재발급 |
| 재부팅 후 죽음 | `Get-ScheduledTaskInfo` · AtLogOn · 로그온 했는지 |
| port in use | 옛 `LoomRelayStep0`/수동 relay kill |
| 팀원만 timeout | 팀원 Tailscale 미가입 · 다른 tailnet |
| rooms 리셋 | relay 프로세스 재시작 → 팀 재join |

---

**한 줄:** Windows = **인프라 only**. `git pull` → §2 Tailscale relay Task → Mac health → 오너 invite. 코딩 게이트는 Mac `HANDOFF.md`.
