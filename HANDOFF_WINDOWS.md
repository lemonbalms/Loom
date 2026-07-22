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
| **지금 Windows 할 일** | **⭐ 실물 herdr dispatch** — [`docs/spikes/DISPATCH-DEMO.md`](./docs/spikes/DISPATCH-DEMO.md) **§3-2** (`task_5b240cad…` bun.lock). Mac 실물 herdr ✅ |

---

## ⭐ Current action (Windows — read first)

> **🎯 다음 = §3-2 실물 herdr `dispatchCard(bun.lock 카드)`.**  
> **⚠️ 2026-07-22:** Mac herdr는 **0.7.5 / protocol 17**이 오너 표준이다. Loom 어댑터는 아직
> protocol 16 (`HERDR_PROTOCOL_EXPECTED=16`)이라 **dogfood/mac-node dispatch는 fail-closed**.
> 정본·이행 범위 → [`docs/spikes/HERDR-0.7.5-COMPAT.md`](./docs/spikes/HERDR-0.7.5-COMPAT.md).  
> 구 서술 “Mac 실물 herdr 0.7.4 + bridge ready”는 **protocol-16 시대 스냅샷**이며 재세팅 목표가 아니다.  
> → **`git pull`** 후 어댑터 ship 전에는 Windows 측에서도 **실물 카드 발사 기대하지 말 것**.  
> 어댑터 이후: [`docs/spikes/DISPATCH-DEMO.md`](./docs/spikes/DISPATCH-DEMO.md) §3-2 (서술형 prompt).
>
> ### 이미 끝난 것 (다시 하지 말 것)
> | 항목 | 상태 |
> |------|------|
> | relay Task · room `demo` · fake dispatch 시연 | ✅ |
> | Mac §3 실물 herdr 전환 (0.7.4 시대) | ✅ (재세팅 금지 · 버전은 0.7.5로 상향됨) |
> | PLAN/코드 수정 | Windows 코딩 금지 |
>
> ### 하지 말 것
> - herdr 0.7.4 다운그레이드 / 0.7.4 병행 세션 요청 (오너 기각)
> - config `herdrProtocol`만 17로 올려 ping-only green 위장
> - Mac bridge/herdr 재기동 요청 (어댑터 웨이브 전 무의미 반복 금지)
> - 명령형 prompt로 push 강제 (M-4 — 서술형 사용)
> - `--insecure-open` · 제품 코드 수정

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

> **v0.24.2 신 래퍼(2026-07-19 전환).** 종전 래퍼는 두 함정을 안고 있었다: ① `bun install -g`(loom.exe)가 Windows 캐시 phantom-lock EBUSY로 반복 실패 → **리포 번들 직접 실행**으로 전환(재배포 = `git pull` + Task 재시작만) ② `$ErrorActionPreference="Stop"` + PS 스트림 `2>>`가 네이티브 stderr 첫 줄에 래퍼를 즉사시킴(durable relay는 persist 이벤트를 stderr에 로깅 → **첫 room create에서 래퍼·relay 동반 사망**, err.log 0바이트의 원인) → **cmd.exe 경유 리다이렉트**로 교체. 아래가 現 Windows `~/.loom/start-relay.ps1` 배포본 전문이다.

```powershell
$wrapper = @'
$ErrorActionPreference = "Stop"
# v0.24.2: run the relay straight from the repo bundle — redeploy is just
# `git pull` + task restart (no `bun install -g`, whose Windows cache hit
# phantom-lock EBUSY on 2026-07-19).
$bun   = Join-Path $env:USERPROFILE ".bun\bin\bun.exe"
$entry = "E:\projects\Loom\dist\loom.js"
$token = (Get-Content (Join-Path $env:USERPROFILE ".loom\relay-token.txt") -Raw).Trim()
$logDir = Join-Path $env:USERPROFILE ".loom"
if (-not (Test-Path $bun))   { throw "bun.exe not found: $bun" }
if (-not (Test-Path $entry)) { throw "loom bundle not found: $entry" }
if (-not $token) { throw "empty relay token" }
$log = Join-Path $logDir "relay.log"
$err = Join-Path $logDir "relay.err.log"
try {
  $h = Invoke-WebRequest -Uri "http://127.0.0.1:7842/health" -UseBasicParsing -TimeoutSec 2
  if ($h.StatusCode -eq 200) { exit 0 }
} catch {}
# Run via cmd.exe so native stderr appends straight to the err file. Under
# $ErrorActionPreference=Stop, PowerShell-level 2>> wraps any native stderr
# line into an ErrorRecord and kills the wrapper (and the relay) on the
# relay's first stderr write — the durable relay logs persist events to
# stderr, so the old wrapper died at the first room create.
$ErrorActionPreference = "Continue"
& cmd.exe /c "`"$bun`" `"$entry`" relay --host 0.0.0.0 --port 7842 --token $token 1>>`"$log`" 2>>`"$err`""
exit $LASTEXITCODE
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

## 2.5) WSL 노드 브릿지 (2번째 herdr 노드 · 2026-07-19 실증)

> Windows 호스트의 WSL(Ubuntu 26.04)에 두 번째 herdr 노드 브릿지가 online이다
> (`node-wsl-1` = `p_de58fbe9f67451a1`, 팀 룸 loom-dev/`LOOM-GT4B`). 제품 코드가 아니라
> **ops 셋업**이라 Windows FREEZE 원칙과 무관. relay는 위 §2의 Tailscale relay를 물린다
> (`ws://100.65.103.113:7842/ws` — WSL NAT 게이트웨이 IP 아님, 그건 재부팅마다 변동).

**설치물 위치 (WSL 안):**

| 항목 | 위치 |
|------|------|
| loom 소스 클론 | `~/.loom-src` (= `git clone /mnt/e/projects/Loom`) — 데몬이 소스 `bridge-main.ts` 필요라 dist 번들 불가 |
| PATH 심링크 | `/usr/local/bin`의 `bun`·`loom`·`claude`·`herdr` (비로그인 셸 `~/.bashrc` 미소싱 회피) |
| workspace 신뢰 | `/root/.claude.json` (`hasTrustDialogAccepted`) |
| user-레벨 allow | `/root/.claude/settings.json` (`permissions.allow` — root 워커 자율화, `--dangerously-skip-permissions` 금지: root에서 보안 거부·워커 즉사) |
| bridge config | `~/.loom/bridge/node-wsl-1.json` (`authorizedDispatchers` 직접 기재, `--allow` 미사용 — save-back이 herdrSocketPath 재주입) |

**재기동 (SSH 세션 독립 — `setsid` 필수):**

```bash
# WSL 안에서 (SSH로 그냥 띄우면 세션 종료와 함께 죽는다 — 로컬 curl만 성공하는 가짜 증상)
setsid nohup herdr server >/tmp/herdr.log 2>&1 &
setsid nohup loom --profile node-wsl-1 bridge start >/tmp/loom-bridge.log 2>&1 &
loom --profile node-wsl-1 bridge status   # 프로필 미지정 시 offline 오진 (LOOM_PROFILE 부재)
```

> ⚠️ `setsid`는 세션 독립일 뿐 **재부팅은 미보장** — 부팅 상시화(WSL systemd 또는 Windows Task)는 후속 후보.

**재배포:** Mac에서 push → Windows `E:\projects\Loom`에서 `git pull` → WSL에서
`cd ~/.loom-src && git pull && bun install` → 위 재기동. (WSL 소스는 `/mnt/e`가 아니라
`~/.loom-src` **독립 클론**임에 주의.)

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
| 2026-07-19 | **v0.24.2 durable relay 배포·실증 완결** | 래퍼를 **리포 번들 직접 실행**(`bun.exe E:\projects\Loom\dist\loom.js relay …`)으로 전환 + cmd.exe 경유 stderr 리다이렉트(§2-3). relay `State: durable C:\Users\34970\.loom\relay-state` 기동 → **room create 생존 → 재시작 후 동일 초대코드(LOOM-YS2Z) join 성공 = 재로그온 룸 유지 확정** · 팀 룸 loom-dev 재수립(초대 **LOOM-GT4B**·로스터 7종 win 바인딩·정확 7 peers) · win relay 스냅샷 2개(winprobe-room 802B·loom-dev 2,140B). **운영 노트 3건**: ① Scheduled Task `RestartCount`는 액션의 **비영(非零) 종료에 미적용** — relay가 exit 1로 죽어도 자동 재시작 안 됨(크래시 복구 아님, 수동 `Start-ScheduledTask` 필요) ② **SSH 세션에서 Start-Process로 띄운 자식은 세션 종료와 함께 사망** — 로컬 curl은 성공하고 원격 도달만 실패하는 가짜 방화벽 증상, 상시 프로세스는 반드시 Task 경유 ③ `bun install -g`(loom.exe)는 phantom-lock EBUSY 취약으로 **폐기** — 정본 실행 = 리포 번들 |

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
| rooms 리셋 | **v0.24.2+: durable — 재시작에도 룸 유지(2026-07-19 실증)**. 룸·초대코드·멤버십이 `~/.loom/relay-state`에 스냅샷으로 남아 relay 재시작·재로그온에도 복원된다(팀 재join 불필요) |

> ✅ **v0.24.2 durable relay 배포·실증 완결(2026-07-19).** 현 Windows 상시 relay는 리포 번들(`E:\projects\Loom\dist\loom.js`) durable로 구동 중이며, **재시작 후 동일 초대코드(LOOM-YS2Z) join 성공·팀 룸 loom-dev(LOOM-GT4B) 복원**까지 라이브 실증했다. 향후 재배포는 간단하다:
> 1. `git pull` (Mac에서 커밋·푸시 후) → 번들(`dist/loom.js`) 갱신 확인
> 2. `Stop-ScheduledTask -TaskName LoomRelayTeam` → `Start-ScheduledTask -TaskName LoomRelayTeam` (재시작) — **끝**
>
> `bun install -g`(loom.exe)는 phantom-lock EBUSY로 폐기했으므로 재배포에 불필요하다. **재시작·재로그온에도 룸이 유지되므로 룸 재수립도 불필요**(초대코드 무효화 없음). PROTOCOL_VERSION=1 와이어 호환 무영향.

---

**한 줄:** Windows = **인프라 only**. `git pull` → §2 Tailscale relay Task → Mac health → 오너 invite. 코딩 게이트는 Mac `HANDOFF.md`.
