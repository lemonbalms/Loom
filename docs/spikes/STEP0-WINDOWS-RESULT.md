# Step 0 — Windows host 준비 결과 (`DESKTOP-LG99QSS`)

| Field | Value |
|-------|-------|
| **Date** | 2026-07-17 |
| **Host** | `DESKTOP-LG99QSS` · Tailscale `100.65.103.113` · `desktop-lg99qss.tail536996.ts.net` |
| **Windows user** | `34970` (Administrators 그룹) |
| **Session** | Windows (갈래 A — OpenSSH 활성화 → Mac 에이전트가 SSH로 원격 마무리) |
| **Related** | [`STEP0-WSL2-NETWORKING.md`](./STEP0-WSL2-NETWORKING.md) (판정 문서) · [`../../HANDOFF_WINDOWS.md`](../../HANDOFF_WINDOWS.md) |
| **Scope** | host-side 준비만. 코드 **FREEZE** 준수 — 브릿지/PLAN 0.22 코드 미작성. relay ③/⑤ 왕복은 Mac이 이어서 진행. |

## 요약

이 Windows 세션에서 Step 0의 **host-side 준비**를 완료했다. `STEP0-WSL2-NETWORKING.md`가
지목한 Blocker("No SSH/WinRM on Windows; relay not listening")를 해소했고, relay가 이
머신에서 실제로 뜨는 것까지 로컬 스모크로 확인했다. relay↔WSL 왕복(③⑤)은 갈래 A
설계대로 Mac 에이전트가 SSH로 이어서 진행한다.

| # | 작업 | 상태 | 핵심 검증 |
|---|------|------|-----------|
| 1 | OpenSSH Server 활성화 | ✅ | sshd Running/Automatic · 배너 응답 (127.0.0.1 + TS IP) |
| 2 | Mac 공개키 등록 (키 인증) | ✅ | `administrators_authorized_keys` · ACL = SYSTEM+Administrators만 |
| 3 | Ubuntu 26.04 설치 (WSL 노드) | ✅ | root 접근 · `curl`/`ip` 존재 |
| 4 | 방화벽 7842 인바운드 | ✅ | `Loom relay 7842` Inbound TCP Allow (Profile Any) |
| 5 | loom 설치 (Windows) | ✅ | `loom v0.21.1` @ `~/.bun/bin/loom.exe` · PATH 영구 등록 |
| 6 | relay 동작 스모크 | ✅ | `health = {"ok":true,"rooms":0,"auth":true,"version":1}` |

## 상세

### 1. OpenSSH Server (STEP0-WSL2-NETWORKING §Fast path A)

관리자 PowerShell(UAC 상승)에서:

- `Add-WindowsCapability -Online -Name OpenSSH.Server~~~~0.0.1.0` (NotPresent → Installed)
- `sshd`: **Running / StartupType Automatic**
- 방화벽 `OpenSSH-Server-In-TCP`: Enabled / Inbound / Allow (capability가 자동 추가)
- 리스닝: `0.0.0.0:22`, `[::]:22`
- 배너 검증: `SSH-2.0-OpenSSH_for_Windows_9.5` — `127.0.0.1:22` **및** `100.65.103.113:22`(Tailscale) 양쪽 응답

### 2. Mac 공개키 등록 (키 인증)

Windows user `34970`이 **Administrators 그룹**이므로 sshd_config의
`Match Group administrators` 규칙에 따라 일반 `~/.ssh/authorized_keys`가 아닌
`C:\ProgramData\ssh\administrators_authorized_keys`에 등록해야 인식됨.

- `HANDOFF_WINDOWS.md`에 임베드된 Mac ed25519 공개키(`loom-windows-kyoungsiklee@...`) 1줄 등록 (dedup 처리)
- ACL: `icacls /inheritance:r` 후 `Administrators:F` + `SYSTEM:F`만 — sshd가 요구하는 권한 조건 충족
- `Restart-Service sshd`

Mac 접속:

```bash
ssh -i ~/.ssh/id_ed25519_loom_windows 34970@100.65.103.113
# 또는: ssh -i ~/.ssh/id_ed25519_loom_windows 34970@desktop-lg99qss.tail536996.ts.net
```

> 키 인증 최종 성공은 Mac 실제 접속 시 확정(개인키가 Windows 쪽에 없어 로컬 e2e 불가).
> TS IP:22 배너가 응답하므로 접속 경로는 열려 있음.

### 3. Ubuntu 26.04 (WSL 노드)

기존 WSL에는 `docker-desktop` 배포판만 있어 Step 0의 WSL health 클라이언트로 부적합.
`wsl --install -d Ubuntu --no-launch`로 **Ubuntu 26.04 LTS** 설치(계정 생성 프롬프트 회피).

- `wsl -d Ubuntu -u root` 접근 OK
- `curl` = `/usr/bin/curl`, `ip` = `/usr/sbin/ip` — health/게이트웨이 프로브 도구 준비됨

### 4. 방화벽 7842 + loom 설치 + relay 검증

**방화벽** (관리자 PowerShell):
`New-NetFirewallRule -DisplayName "Loom relay 7842" -Direction Inbound -Protocol TCP -LocalPort 7842 -Action Allow -Profile Any` → Enabled.

**loom 설치** (Windows, Bun 1.3.13 기설치):
repo가 이미 `E:\projects\Loom`에 clone되어 있어 `install.sh`의 별도 `~/.loom-src` clone 없이 여기서 직접:

- `bun install` (repo 루트) — 60 packages
- `bun link` (`packages/cli`) → `~/.bun/bin/loom.exe`
- `loom v0.21.1` 확인 · 사용자 PATH에 `.bun\bin` 영구 등록됨(SSH 새 세션에서도 loom 해석)

**relay 스모크** (로컬 전용, 임시 토큰):
`loom relay --host 127.0.0.1 --port 7842 --token <임시>` → `curl 127.0.0.1:7842/health` →
`{"ok":true,"rooms":0,"auth":true,"version":1}` (문서 기대값 일치). 검증 후 프로세스 종료,
7842 리스닝 잔존 없음. **임시 토큰은 폐기** — 실제 relay는 Mac이 새 토큰으로 기동.

## Step 0 체크리스트 매핑 (STEP0-WSL2-NETWORKING §Checklist)

| # | Item | 이 세션 결과 |
|---|------|--------------|
| TS | Mac ↔ Windows L3 Tailscale | done (기존) |
| — | Blocker: host shell 없음 | **해소** — OpenSSH on, Mac 키 등록 |
| ① | `.wslconfig` mirrored | **미적용(의도)** — 아래 주의 참고 |
| ② | Windows relay `0.0.0.0:7842` + token | **부분** — 방화벽 열림 + loom 설치 + 로컬 스모크 통과. 상시 `0.0.0.0` 기동은 Mac. |
| ③ | WSL `curl .../7842/health` | pending — Mac이 SSH로 |
| ④ | NAT gateway fallback | pending |
| ⑤ | `loom room join` WS 왕복 | pending — Mac이 SSH로 |

## Mac 에이전트 인수인계

1. `ssh 34970@100.65.103.113` 접속 (위 키)
2. relay 상시 기동 (방화벽 7842 이미 열림):
   ```powershell
   $env:LOOM_RELAY_TOKEN = -join ((1..24) | ForEach-Object { '{0:x2}' -f (Get-Random -Max 256) })
   loom relay --host 0.0.0.0 --port 7842 --token $env:LOOM_RELAY_TOKEN
   ```
3. WSL Ubuntu에서 ③ health 프로브 → NAT 게이트웨이(④) fallback → join 왕복(⑤)
4. `STEP0-WSL2-NETWORKING.md` 체크리스트/Verdict 갱신

한 줄 신호: **`OpenSSH on. user=34970`**

## 주의 / 관찰

- **`.wslconfig` mirrored 미적용(의도적)**: 적용하려면 `wsl --shutdown`이 필요한데 현재
  `docker-desktop` 배포판이 Running 중이라 Docker Desktop이 중단됨. relay↔WSL 붙이는
  단계에서 필요할 때 판단하도록 남겨 둠. (mirrored 없이도 NAT 게이트웨이 경로 ④로 우회 가능)
- **`bun.lock` 관찰**: `bun install` 시 커밋돼 있던 lockfile이 현재 `package.json`과
  재동기화되며 2줄 삭제(`@loom/mcp-server`의 `fable-mcp` bin, `zod` dep). 즉 lockfile이
  package.json보다 stale 상태였음. 이 커밋에는 **미포함** — 별도 판단 필요.
- OpenSSH/방화벽/loom relay는 **외부 접근을 여는 변경**이며 갈래 A 선택에 따른 의도된 결과.
