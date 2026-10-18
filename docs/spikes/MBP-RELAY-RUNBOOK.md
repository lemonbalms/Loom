# MBP relay 이전 런북 — Windows lg99 → MBP 2015 (Linux · systemd)

> **상태:** 2026-10-18 실행 완료 — 0–8단계(5단계는 기존 설정으로 생략, 7-0 사전 기동 시험 추가). **9b 미실행**(별도 owner yes).
> 결과는 맨 끝 "실행 기록 (2026-10-18)". 라이브 단계(1–8, 9b)는 각 절 끝의 **Owner yes required** 를 받아야만 실행한다.
> 0단계와 9a단계는 read-only다. 제품 코드는 바꾸지 않는다(D3).

## 대상

| 역할 | 호스트 | Tailscale IP | 비고 |
|------|--------|--------------|------|
| 현재 relay | Windows lg99 `DESKTOP-LG99QSS` | 100.65.103.113 | 실행 방식은 저장소에 기록 없음 — 오너/비서실장 세션이 안다 |
| 새 relay | MBP 2015 `mbp2015-bot` | 100.119.218.93 | Debian 13 trixie x86_64 · systemd 257 · bun 미설치 · passwordless sudo · logind lid 기본 = suspend |

접속: `ssh -o IdentitiesOnly=yes -i ~/.ssh/id_ed25519_mbp2015 zerocode@100.119.218.93` (이하 "MBP 셸").

## 아키텍트 결정 (locked)

- **D1 순서:** 0 read-only 점검 → 1 bun 1.3.11 (`/opt/bun`) → 2 `dist/loom.js` → `/opt/loom/loom.js` → 3 시스템 사용자
  `loom-relay` + state dir → 4 토큰 `/etc/loom-relay.env` → 5 덮개·절전 차단 → 6 유닛 작성(시작 안 함) → 7 **컷오버 창**
  (lg99 relay 정지 → state 1회 복사 → MBP relay 기동) → 8 클라이언트 URL 전환 + bridge 재시작 → 9a read-only 확인 →
  9b (별도 yes) lg99 원본 state 삭제.
- **D2 롤백 (7단계 이후 어디서든):** MBP `sudo systemctl disable --now loom-relay` → lg99 relay를 **손대지 않은 원본 state**로
  재기동 → 클라이언트 URL 원복(8단계의 백업 복원) → bridge 재시작. lg99 원본은 9b에서 성공 확인 뒤에만 지운다.
- **D3:** 제품 코드 변경 없음. `loom service`는 bridge 전용(`packages/host/src/service-units.ts:89-92` — 이름이
  `com.loom.bridge.<p>` / `loom-bridge-<p>.service`뿐)이므로 relay 유닛은 손으로 쓴다. 향후 후보:
  `loom service install --relay`.

## 코드에서 확인한 사실 (file:line)

### relay 기동 (`loom relay`)

- 번들 진입: `packages/cli/src/index.ts:3570-3679`. 하위 명령 없는 bare `loom relay` = 포그라운드 서버.
  - host: `--host` → `LOOM_RELAY_HOST` → `127.0.0.1` (`index.ts:3592-3595`, 기본값 `packages/protocol/src/envelope.ts:6-7`).
  - port: `--port` → `LOOM_RELAY_PORT` → `7842` (`index.ts:3596-3600`).
  - token: `--token` → `LOOM_RELAY_TOKEN` (`index.ts:3601-3604`, `packages/protocol/src/env.ts:67-68`).
    이 런북은 **env만** 쓴다(`EnvironmentFile=`) — `--token`은 `ps`/`/proc/<pid>/cmdline`에 노출되므로 쓰지 않는다.
  - `--insecure-open` (`index.ts:3605`) — 쓰지 않는다.
  - 기동 후 stdout: `Loom relay on ws://<host>:<port>/ws (token auth on)` · `Health: http://<host>:<port>/health` ·
    `State: durable <dir>` · `Clients need: --token <same> or LOOM_RELAY_TOKEN …` (`index.ts:3654-3669`,
    publicHint `packages/relay/src/server.ts:81-86`).
  - SIGINT/SIGTERM → `registry.close()`로 M-23 락 해제 후 exit 0 (`index.ts:3643-3653`) — `systemctl stop`이 깨끗하다.
- **H-5:** 토큰 없이 non-loopback bind 거부 (`packages/relay/src/server.ts:92-101`, `start()`에서 호출 `server.ts:105`).
  토큰이 비면 유닛이 즉시 실패한다 → 4단계가 6·7단계보다 먼저다.
- **state dir:** `LOOM_RELAY_STATE_DIR` 또는 기본 `~/.loom/relay-state`
  (`packages/relay/src/registry-options.ts:18`, `packages/relay/src/persist.ts:81-83`, 주석 `packages/relay/src/cli.ts:39`).
  `LOOM_RELAY_EPHEMERAL=1`이면 영속 없음(`registry-options.ts:13-16`) — 유닛에 넣지 않는다.
  state dir을 열 수 없으면 fail-closed exit 1(`index.ts:3619-3628`).
- **state dir 내용:**
  - 방 1개 = `<sha256(roomId) 앞 16 hex>.json` (`persist.ts:85-88`). 원자 쓰기 temp+rename, **0600** (`persist.ts:189-235`).
  - 쓰기 중 임시 파일 `.<base>.tmp.<pid>.<ms>` (`persist.ts:228`).
  - 단일 writer 락 **디렉터리** `.relay-writer.lock/` 안의 `owner.pid` (0600) (`persist.ts:100-106`, `112-169`);
    정상 종료 시 삭제(`persist.ts:171-186`).
  - 로드는 `.json`으로 끝나고 `.`으로 시작하지 않는 일반 파일만 (`persist.ts:424-429`).
  - **⇒ 복사 대상 = `^[0-9a-f]{16}\.json$`만.** `.relay-writer.lock/`·`.*.tmp.*` 제외.
- `/health` (인증 없음) → `{"ok":true,"rooms":<N>,"auth":true,"version":…}` (`server.ts:114-123`). `/ws`·`/rooms`는 인증 필요
  (`server.ts:125-143`).

### 클라이언트가 읽는 것

- URL 형식: `ws://host:port/ws`. `host:port`·bare host·`http://`도 받아 `ws://…/ws`로 정규화, `?token=`은 떼어 낸다
  (`packages/protocol/src/relay-url.ts:29-69`). 토큰은 Bearer 헤더로 간다(`relay-url.ts:5`, `server.ts:76-79`).
- **중요 — bridge는 `LOOM_RELAY_URL` env를 읽지 않는다.** 연결 URL은 **세션 파일의 `relayUrl` 필드**다
  (`packages/host/src/session-store.ts:411-420` `relayClientOptsFromSession`; `room-ops.ts:41-42`, `sticky-server.ts:57-58`).
  `LOOM_RELAY_URL`은 세션 없이 `create`/`join` 할 때만 쓰인다(`relay-url.ts:106-114`).
  ⇒ 스펙의 "각 클라이언트의 `LOOM_RELAY_URL` 전환"은 실제로는 **세션 파일 `relayUrl` 전환**이다(8단계). 셸 rc에
  `LOOM_RELAY_URL`을 export해 두었다면 그것도 같이 바꾼다(새 join용).
- 세션 파일 위치: `--profile` → `LOOM_SESSION` → `~/.loom/profiles/<LOOM_PROFILE>.json` → `~/.loom/session.json`
  (`session-store.ts:242-290`). 0600으로 저장(`session-store.ts:379-401`). 이름 붙은 바인딩은 `relays.<relayName>`에
  미러된다(`session-store.ts:344-364`) — 두 곳 다 바꾼다.
- 토큰: 세션 `relayToken`(디스크) 우선, 없으면 env (`session-store.ts:418`). `loom service install`은 env-only 토큰을
  거부한다(`packages/cli/src/service.ts:704-712`, `740-743`) — 서비스 bridge는 반드시 세션 파일에 토큰이 있다.
  **토큰은 바뀌지 않으므로 세션의 `relayToken`은 건드리지 않는다.**
- `loom service` 유닛 env는 정확히 `{HOME, PATH, LOOM_SERVICE, LOOM_SESSION, LOOM_PROFILE?}`
  (`packages/host/src/service-units.ts:1-8`, `179-188`; systemd `Environment=` 렌더 `service-units.ts:301`). 유닛에는
  URL도 토큰도 없다 → **유닛 파일은 고치지 않는다.** `LOOM_SESSION` 값이 그 bridge가 읽는 세션 파일 경로다.
  - macOS: `~/Library/LaunchAgents/com.loom.bridge.<p>.plist` · Linux: `~/.config/systemd/user/loom-bridge-<p>.service`.
  - `loom service`에는 restart 동사가 없다(`service.ts:358-367`: install/uninstall/start/status) → 재시작은
    `launchctl kickstart -k` / `systemctl --user restart`로 직접.
- bridge 로그: `~/.loom/bridge/<profile>.stderr.log` (`packages/host/src/bridge-spawn.ts:48-50`).

### 0.44.1 재연결 정지 → 순서의 근거

- `RECONNECT_STOP_CODES = {"peer_auth_failed","room_not_found"}` (`packages/host/src/relay-client.ts:20`).
  재연결 후 join이 이 코드로 실패하면 `autoReconnect=false` + `Reconnect stopped: <code> — <msg>`
  (`relay-client.ts:365-375`). 이후 **수동 재시작 전까지 영구 정지**.
- relay 측 발생 지점: `room_not_found` `server.ts:334`, `peer_auth_failed` `packages/relay/src/room.ts:420`.
- ⇒ 클라이언트가 **방 state가 없는** MBP relay에 붙으면 `room_not_found`로 영구 정지한다. 그래서 반드시
  **state 복사 → MBP relay 기동 → 확인 → 그 다음에** 클라이언트를 전환한다. lg99가 내려가 있는 동안 기존 URL로의
  재시도는 연결 실패일 뿐 정지 코드가 아니므로 무해하다(계속 재시도).

### 고정값

| 키 | 값 |
|----|----|
| bun | `1.3.11` → `/opt/bun/bin/bun` |
| 번들 | `/opt/loom/loom.js` (root:root 0644) |
| 사용자 | `loom-relay` (system, nologin, home `/var/lib/loom-relay`) |
| state dir | `/var/lib/loom-relay/relay-state` (0700, 파일 0600) |
| 토큰 파일 | `/etc/loom-relay.env` (root:root 0600) — 내용 `LOOM_RELAY_TOKEN=<기존 토큰>` |
| bind | `100.119.218.93:7842` (0단계에서 현재 포트가 7842가 아니면 그 포트로 전부 치환) |
| 새 클라이언트 URL | `ws://100.119.218.93:7842/ws` |
| 유닛 | `/etc/systemd/system/loom-relay.service` |

**토큰 취급:** 토큰은 이 런북·터미널 출력·로그·셸 히스토리에 절대 쓰지 않는다. 확인은 개수/길이/해시 비교로만 한다.

---

## 0단계 — read-only 사전 점검 (yes 불필요)

MBP 셸에서, 각 명령 따로:

```bash
uname -m
cat /etc/debian_version
systemctl --version
command -v bun
command -v unzip
command -v curl
tailscale ip -4
systemctl is-active tailscaled.service
systemctl is-enabled tailscaled.service
id loom-relay
ls -ld /opt/bun /opt/loom /var/lib/loom-relay /etc/loom-relay.env /etc/systemd/system/loom-relay.service
ls /etc/systemd/logind.conf.d/
busctl get-property org.freedesktop.login1 /org/freedesktop/login1 org.freedesktop.login1.Manager HandleLidSwitch
systemctl is-enabled sleep.target suspend.target hibernate.target hybrid-sleep.target
sudo ss -ltnp
sudo nft list ruleset
df -h /opt /var/lib
```

기대: `x86_64` · `13.x` · `systemd 257` · `bun` 없음 · `unzip`/`curl` 경로 있음(없으면 1단계 전에 `sudo apt-get install -y unzip curl`
— 그것도 라이브 변경이므로 1단계 yes에 포함) · `100.119.218.93` · `active` / `enabled` · `id: 'loom-relay': no such user` ·
ls는 전부 `No such file or directory` · lid = `s "suspend"` · 7842 LISTEN 없음 · nft에 tailscale0 7842를 막는 규칙 없음.

현재 relay·클라이언트 사실(오너/비서실장 세션이 채움, 토큰 값은 적지 않는다):

| 항목 | 값 |
|------|----|
| lg99 relay 실행 방식 (작업 스케줄러 / 서비스 / 콘솔 창 / …) | 작업 스케줄러 `LoomRelayTeam` → `start-relay.ps1` → `bun.exe …\dist\loom.js relay --host 0.0.0.0 --port 7842 --token …` |
| lg99 relay 포트 (클라이언트 세션 `relayUrl`에서) | 7842 |
| lg99 state dir (`LOOM_RELAY_STATE_DIR` 또는 `%USERPROFILE%\.loom\relay-state`) | lg99 durable state (원본 보존 — 9b 전까지) |
| lg99 방 파일 수 (`<16hex>.json`) | 2 (`8d66842a136bcac7.json` winprobe-room · `ef0245c2a460a8b4.json` loom-dev) |
| 클라이언트 목록: 호스트 · bridge 프로파일 · 세션 파일(`LOOM_SESSION`) · 실행 방식(launchd / systemd --user / 수동) | lg99 URL을 쓰는 클라이언트는 Mac `~/.loom/profiles/mac.json` 하나(이를 쓰는 실행 중 세션 없음). lg99-로컬 프로파일 step0-host / win-demo / step0-wsl은 대상 아님(오너) |

MBP 0단계 실측(2026-10-18): Debian 13.7 x86_64 · systemd 257.13 · tailscale `100.119.218.93` active/enabled · 7842 비어 있음 ·
**logind drop-in `/etc/systemd/logind.conf.d/10-lid.conf`(2026-10-12)가 이미 HandleLidSwitch / ExternalPower / Docked = ignore +
IdleAction=ignore, sleep/suspend/hibernate/hybrid-sleep target 이미 masked → 5단계 생략** · unzip 없음(1단계에서 설치).

클라이언트마다 (macOS 예):

```bash
grep -A1 LOOM_SESSION ~/Library/LaunchAgents/com.loom.bridge.<p>.plist
grep -E '"relayUrl"|"relayName"' <세션 파일>
grep -c 'Reconnect stopped' ~/.loom/bridge/<p>.stderr.log
```

Linux 클라이언트는 `grep LOOM_SESSION ~/.config/systemd/user/loom-bridge-<p>.service`. 기존 `Reconnect stopped` 개수를 기준선으로
기록한다(9a에서 "새로 생긴 것 0"을 판정).

되돌리기: 없음(read-only).

---

## 1단계 — bun 1.3.11 시스템 설치 (`/opt/bun`)

MBP 셸:

```bash
curl -fsSL https://bun.sh/install -o /tmp/bun-install.sh
less /tmp/bun-install.sh
sudo env BUN_INSTALL=/opt/bun bash /tmp/bun-install.sh bun-v1.3.11
rm /tmp/bun-install.sh
```

기대: `bun was installed successfully to /opt/bun/bin/bun` (설치기가 셸 rc에 PATH를 추가하라는 안내를 내도 따르지 않는다 —
유닛은 절대 경로를 쓴다). 설치기가 root의 셸 rc를 수정했다면 0단계 기준과 비교해 원복한다.

확인 (read-only):

```bash
/opt/bun/bin/bun --version
ls -l /opt/bun/bin/bun
```

기대: `1.3.11` · 소유 root, 다른 사용자 실행 가능(`-rwxr-xr-x`). `loom-relay`가 실행할 수 있어야 한다(`/opt/bun`, `/opt/bun/bin`
디렉터리가 o+x).

되돌리기: `sudo rm -rf /opt/bun`

**Owner yes required**

---

## 2단계 — 번들 복사 `/opt/loom/loom.js` (root 0644) + sha256 기록

개발 Mac(저장소 루트, 빌드된 `dist/loom.js` — 현재 0.45.1):

```bash
shasum -a 256 dist/loom.js
scp -o IdentitiesOnly=yes -i ~/.ssh/id_ed25519_mbp2015 dist/loom.js zerocode@100.119.218.93:/tmp/loom.js
```

MBP 셸:

```bash
sha256sum /tmp/loom.js
sudo install -d -o root -g root -m 0755 /opt/loom
sudo install -o root -g root -m 0644 /tmp/loom.js /opt/loom/loom.js
rm /tmp/loom.js
```

기대: Mac과 MBP sha256이 같다. 이 값을 아래에 기록한다.

| 파일 | 버전 | sha256 | 날짜 |
|------|------|--------|------|
| `/opt/loom/loom.js` | 0.45.1 | `cf27ce350137f3358ddccf44322ff3e09abda2bcbb1a670b672e0349ae93964c` (= 개발 Mac `dist/loom.js`) | 2026-10-18 |

확인 (read-only):

```bash
ls -l /opt/loom/loom.js
sha256sum /opt/loom/loom.js
/opt/bun/bin/bun /opt/loom/loom.js version
```

기대: `-rw-r--r-- 1 root root` · 기록한 sha256 · `0.45.1`. `version`이 모듈 해석 오류를 내면(번들이 외부 의존을 가짐) 여기서
멈추고 보고한다.

되돌리기: `sudo rm -rf /opt/loom`

**Owner yes required**

---

## 3단계 — 시스템 사용자 `loom-relay` + state dir

MBP 셸:

```bash
sudo useradd --system --home-dir /var/lib/loom-relay --create-home --shell /usr/sbin/nologin --user-group loom-relay
sudo chmod 0700 /var/lib/loom-relay
sudo install -d -o loom-relay -g loom-relay -m 0700 /var/lib/loom-relay/relay-state
```

확인 (read-only):

```bash
getent passwd loom-relay
sudo stat -c '%a %U:%G %n' /var/lib/loom-relay /var/lib/loom-relay/relay-state
```

기대: `loom-relay:x:<uid<1000>:<gid>::/var/lib/loom-relay:/usr/sbin/nologin` · `700 loom-relay:loom-relay` 두 줄.

되돌리기:

```bash
sudo userdel --remove loom-relay
```

(`--remove`가 `/var/lib/loom-relay`를 지운다 — 7단계 이후라면 state가 들어 있으니 롤백 D2 뒤에만.)

**Owner yes required**

---

## 4단계 — 토큰 파일 `/etc/loom-relay.env` (root 0600)

토큰은 **클라이언트가 이미 쓰는 것과 같은 값**이다(오너 제공 — 예: 클라이언트 세션 파일의 `relayToken`). 화면·로그에 출력하지 않는다.

MBP 셸:

```bash
sudo install -o root -g root -m 0600 /dev/null /etc/loom-relay.env
sudoedit /etc/loom-relay.env
```

편집기에서 한 줄만 입력: `LOOM_RELAY_TOKEN=<토큰>` (따옴표·공백·`export` 없이). `sudoedit`는 셸 히스토리에 값을 남기지 않는다.
`echo … | sudo tee` 형태는 쓰지 않는다.

확인 (read-only — 값은 보이지 않는다):

```bash
sudo stat -c '%a %U:%G' /etc/loom-relay.env
sudo grep -c '^LOOM_RELAY_TOKEN=.' /etc/loom-relay.env
sudo awk -F= '/^LOOM_RELAY_TOKEN=/{print length($2)}' /etc/loom-relay.env
```

기대: `600 root:root` · `1` · 클라이언트 토큰과 같은 길이(오너가 클라이언트 쪽에서 같은 방식으로 길이만 비교).
더 강한 대조가 필요하면 양쪽에서 `sha256sum`을 값에만 적용해 해시끼리 비교한다(값 자체는 출력하지 않는다).

되돌리기: `sudo rm /etc/loom-relay.env`

**Owner yes required**

---

## 5단계 — 덮개 닫힘·절전 차단

MBP 셸:

```bash
sudo install -d -m 0755 /etc/systemd/logind.conf.d
sudoedit /etc/systemd/logind.conf.d/50-loom-lid.conf
```

내용:

```ini
[Login]
HandleLidSwitch=ignore
HandleLidSwitchExternalPower=ignore
HandleLidSwitchDocked=ignore
```

적용 — 세션을 죽이지 않는 reload(logind는 SIGHUP에 설정을 다시 읽는다; `systemctl restart systemd-logind`는 쓰지 않는다):

```bash
sudo systemctl kill -s HUP systemd-logind
sudo systemctl mask sleep.target suspend.target hibernate.target hybrid-sleep.target
```

기대: mask는 `Created symlink '/etc/systemd/system/sleep.target' → '/dev/null'.` 4줄. ssh 세션은 끊기지 않는다.

확인 (read-only):

```bash
busctl get-property org.freedesktop.login1 /org/freedesktop/login1 org.freedesktop.login1.Manager HandleLidSwitch
busctl get-property org.freedesktop.login1 /org/freedesktop/login1 org.freedesktop.login1.Manager HandleLidSwitchExternalPower
busctl get-property org.freedesktop.login1 /org/freedesktop/login1 org.freedesktop.login1.Manager HandleLidSwitchDocked
systemctl is-enabled sleep.target suspend.target hibernate.target hybrid-sleep.target
```

기대: 세 줄 모두 `s "ignore"` · 네 줄 모두 `masked`. 실기 확인(선택): 덮개를 닫고 1분 뒤 다른 기기에서
`tailscale ping 100.119.218.93`이 응답.

**전원 상실 후 자동 부팅:** 펌웨어(EFI/SMC) 설정이며 이 런북 범위 밖 — **미검증**. 정전 복구가 필요하면 별도 확인.

되돌리기:

```bash
sudo systemctl unmask sleep.target suspend.target hibernate.target hybrid-sleep.target
sudo rm /etc/systemd/logind.conf.d/50-loom-lid.conf
sudo systemctl kill -s HUP systemd-logind
```

**Owner yes required**

---

## 6단계 — 유닛 작성 + `daemon-reload` (시작하지 않음)

MBP 셸:

```bash
sudoedit /etc/systemd/system/loom-relay.service
```

내용:

```ini
[Unit]
Description=Loom team relay (hand-written; loom service is bridge-only — D3)
After=network-online.target tailscaled.service
Wants=network-online.target
StartLimitIntervalSec=0

[Service]
Type=simple
User=loom-relay
Group=loom-relay
Environment=LOOM_RELAY_STATE_DIR=/var/lib/loom-relay/relay-state
EnvironmentFile=/etc/loom-relay.env
ExecStart=/opt/bun/bin/bun /opt/loom/loom.js relay --host 100.119.218.93 --port 7842
Restart=always
RestartSec=5
NoNewPrivileges=true
ProtectSystem=strict
ReadWritePaths=/var/lib/loom-relay/relay-state
ProtectHome=true
PrivateTmp=true

[Install]
WantedBy=multi-user.target
```

메모:
- 토큰은 `EnvironmentFile`로만 — `ExecStart`에 `--token`을 두지 않는다(cmdline 노출).
- 부팅 직후 Tailscale IP가 아직 없으면 bind가 실패하고 exit 1 → `Restart=always`/`RestartSec=5`로 IP가 생길 때까지 재시도.
  systemd 기본 start-limit(10초 안 5회)에 걸리지 않도록 RestartSec=5를 유지한다.
- `StartLimitIntervalSec=0`([Unit]) — 오너 조건(2026-10-18): tailscaled보다 먼저 뜬 부팅 시 bind 실패가 길어져도 기본
  start-limit에 걸려 유닛이 `failed`로 멈추지 않게 재시도 제한을 끈다.
- `MemoryDenyWriteExecute`는 넣지 않는다(bun JIT 필요).
- `ProtectSystem=strict`라 `/var/lib/loom-relay` 자체는 읽기 전용이다. 7단계 기동 시 journal에 `/var/lib/loom-relay/.loom`
  관련 `EROFS`/`read-only file system`이 보이면(CLI가 시작 시 홈 아래를 만드는 경우 — 코드상 미확인) `ReadWritePaths=`를
  `/var/lib/loom-relay`로 넓히는 것이 보수적 대안이다(오너 yes 후 `daemon-reload`).
- `Restart=always`라 `systemctl stop` 없이 프로세스를 죽이면 다시 뜬다 — 멈출 땐 항상 `systemctl stop|disable --now`.

```bash
sudo chmod 0644 /etc/systemd/system/loom-relay.service
sudo systemctl daemon-reload
```

확인 (read-only):

```bash
systemd-analyze verify /etc/systemd/system/loom-relay.service
systemctl is-enabled loom-relay
systemctl is-active loom-relay
systemctl cat loom-relay
```

기대: verify 출력 없음(경고 없음) · `disabled` · `inactive` · 위 내용 그대로. **아직 start/enable 하지 않는다.**

되돌리기:

```bash
sudo rm /etc/systemd/system/loom-relay.service
sudo systemctl daemon-reload
```

**Owner yes required**

---

## 7단계 — 컷오버 창 (lg99 정지 → state 1회 복사 → MBP 기동)

이 창 동안 팀 relay가 없다. 클라이언트는 기존 URL로 재시도만 한다(정지 코드 아님 — 무해). **이 단계 시작 시점부터 롤백 = D2.**

### 7-0 사전 기동 시험 (빈 state, lg99 정지 전)

컷오버 창을 열기 전에 유닛이 실제로 뜨는지 빈 state로 확인한다. 클라이언트는 아직 lg99를 보므로 영향 없음.

MBP 셸:

```bash
sudo find /var/lib/loom-relay/relay-state -mindepth 1
sudo systemctl start loom-relay
sudo ss -ltnp 'sport = :7842'
sudo journalctl -u loom-relay -b --no-pager -n 30
```

다른 기기(Mac)에서: `curl -s http://100.119.218.93:7842/health`

기대: find 출력 없음(빈 state) · LISTEN은 `100.119.218.93:7842`에만 · health `{"ok":true,"rooms":0,"auth":true,…}` · journal에
`Refusing to bind`·`EROFS` 등 오류 없음. 그 다음:

```bash
sudo systemctl stop loom-relay
sudo find /var/lib/loom-relay/relay-state -mindepth 1
```

기대: `inactive` · state dir 다시 비어 있음(락 디렉터리 정상 해제). 비어 있지 않으면 7d 전에 비운다. **enable은 하지 않는다.**

되돌리기: `sudo systemctl stop loom-relay`

### 7a — lg99 relay 정지

lg99에서 relay를 어떻게 돌리는지는 저장소에 없다 → **오너/비서실장 세션이 그 방식대로 정지**한다(Ctrl-C / SIGTERM 상당이면
M-23 락이 해제된다 — `index.ts:3643-3653`). 정지 후 lg99에서(PowerShell, read-only):

```powershell
Get-NetTCPConnection -LocalPort 7842 -State Listen -ErrorAction SilentlyContinue
Test-Path "$env:USERPROFILE\.loom\relay-state\.relay-writer.lock"
```

기대: 첫 명령 출력 없음(포트 닫힘) · `False`. 다른 기기에서 `curl -s --max-time 3 http://100.65.103.113:7842/health`가 실패.
락이 `True`면 비정상 종료 — 그래도 진행 가능(복사는 `.json`만), 다만 기록한다. (state dir이 기본값이 아니면 0단계에 적은 경로로.)

### 7b — 방 파일 목록·해시 (lg99, read-only)

```powershell
Get-ChildItem "$env:USERPROFILE\.loom\relay-state" -File | Where-Object { $_.Name -match '^[0-9a-f]{16}\.json$' } | Get-FileHash -Algorithm SHA256 | Format-Table Hash, Path -AutoSize
```

개수와 해시를 기록한다(Windows는 대문자 hex — 비교는 대소문자 무시).

### 7c — MBP로 1회 전송 (staging)

MBP 셸:

```bash
install -d -m 0700 /home/zerocode/relay-import
```

lg99 → MBP 전송 방법은 lg99 사정에 따라 오너가 하나 고른다:
- (a) lg99 OpenSSH 클라이언트: `<16hex>.json` 파일만 `scp`로 `zerocode@100.119.218.93:/home/zerocode/relay-import/`
  (lg99에 MBP용 키가 있어야 함).
- (b) Taildrop: lg99에서 `tailscale file cp <파일들> mbp2015-bot:` → MBP 셸에서
  `sudo tailscale file get /home/zerocode/relay-import/` 후 `sudo chown zerocode: /home/zerocode/relay-import/*`.
- `.relay-writer.lock\`·`.*.tmp.*`는 **보내지 않는다**. 중간 경유지(USB·다른 PC 등)를 쓰면 그곳 사본은 7e에서 지운다.

확인 (MBP, read-only):

```bash
ls -la /home/zerocode/relay-import
sha256sum /home/zerocode/relay-import/*.json
```

기대: 7b와 같은 개수·같은 해시, 이름이 전부 `<16hex>.json`, 점파일 없음.

### 7d — state dir에 설치 + 기동

MBP 셸:

```bash
sudo install -o loom-relay -g loom-relay -m 0600 /home/zerocode/relay-import/*.json /var/lib/loom-relay/relay-state/
sudo stat -c '%a %U:%G %n' /var/lib/loom-relay/relay-state /var/lib/loom-relay/relay-state/*
sudo systemctl enable --now loom-relay
```

기대: 디렉터리 `700`, 파일 전부 `600 loom-relay:loom-relay` · enable은 `Created symlink …multi-user.target.wants/loom-relay.service …`.

확인 (read-only):

```bash
systemctl is-active loom-relay
sudo ss -ltnp 'sport = :7842'
sudo journalctl -u loom-relay -b --no-pager -n 30
curl -s http://100.119.218.93:7842/health
```

기대: `active` · `LISTEN … 100.119.218.93:7842 … users:(("bun",pid=…))` (0.0.0.0이 아님) · journal에 `Loom relay on
ws://100.119.218.93:7842/ws (token auth on)` / `State: durable /var/lib/loom-relay/relay-state` / `Clients need: …`, 그리고
`Refusing to bind`·`locked by another process`·`Invalid snapshot`·`EROFS` 없음 · health
`{"ok":true,"rooms":<7b 개수>,"auth":true,…}`. `rooms`가 7b 개수와 다르면 **8단계로 가지 말고** D2 롤백 여부를 오너와 판단한다
(클라이언트를 붙이면 빠진 방은 `room_not_found`로 영구 정지).

### 7e — 중간 사본 정리

```bash
rm -rf /home/zerocode/relay-import
```

중간 경유지·Taildrop 수신함(`sudo tailscale file get`이 비웠는지)도 정리한다. lg99 **원본 state는 그대로 둔다**(D2).

되돌리기(= D2 롤백):

```bash
sudo systemctl disable --now loom-relay
```

→ lg99 relay를 원래 방식으로 재기동(원본 state 무손상) → 다른 기기에서 `curl -s http://100.65.103.113:7842/health`가
`"ok":true`. MBP state dir 사본은 `sudo find /var/lib/loom-relay/relay-state -mindepth 1 -delete`로 비워 둔다(다음 시도 때
7c부터 새로 복사 — 롤백 동안 lg99 state가 다시 바뀌기 때문).

**Owner yes required**

---

## 8단계 — 클라이언트 URL 전환 + bridge 재시작

7d 확인이 전부 통과한 뒤에만. 클라이언트마다(0단계 표 순서), 그 bridge의 세션 파일(`LOOM_SESSION` 값)에 대해:

```bash
cp -p "<세션 파일>" "<세션 파일>.pre-mbp"
```

`relayUrl`이 lg99 URL인 바인딩만 새 URL로 바꾼다(최상위 `relayUrl` + `relays.*.relayUrl` — 토큰·peerSecret 등 다른 필드는
그대로, 모드 0600 유지). bun이 있는 클라이언트에서:

```bash
F="<세션 파일>" OLD="ws://100.65.103.113:7842/ws" NEW="ws://100.119.218.93:7842/ws" bun -e 'const fs=require("fs");const f=process.env.F;const s=JSON.parse(fs.readFileSync(f,"utf8"));const swap=(u)=>typeof u==="string"&&u.split("?")[0]===process.env.OLD?process.env.NEW:u;s.relayUrl=swap(s.relayUrl);for(const b of Object.values(s.relays??{}))b.relayUrl=swap(b.relayUrl);fs.writeFileSync(f,JSON.stringify(s,null,2)+"\n",{mode:0o600});fs.chmodSync(f,0o600);'
```

(OLD는 0단계에서 본 실제 `relayUrl` 문자열로. 세션이 정규화돼 있으면 `ws://…/ws` 형태다 — `relay-url.ts:57-63`.)

확인 (read-only):

```bash
grep -E '"relayUrl"' "<세션 파일>"
stat -f '%Lp' "<세션 파일>"
```

기대: lg99 URL이 남지 않고 새 URL만 · `600` (Linux는 `stat -c '%a'`). 셸 rc에 `LOOM_RELAY_URL=…100.65.103.113…`이 있으면
같이 바꾼다(새 join용, bridge와 무관).

bridge 재시작:
- macOS `loom service`: `launchctl kickstart -k gui/$(id -u)/com.loom.bridge.<p>`
- Linux `loom service`: `systemctl --user restart loom-bridge-<p>.service`
- 수동 실행 bridge: 원래 띄운 방식으로 정지 후 재기동.

재시작 후 (read-only):

```bash
tail -n 50 ~/.loom/bridge/<p>.stderr.log
grep -c 'Reconnect stopped' ~/.loom/bridge/<p>.stderr.log
```

기대: 0단계 기준선 대비 `Reconnect stopped` 증가 0. 증가했으면 메시지의 코드(`room_not_found`/`peer_auth_failed`)를 기록하고
멈춘다 — 다음 클라이언트로 넘어가지 않는다.

되돌리기(클라이언트별):

```bash
mv "<세션 파일>.pre-mbp" "<세션 파일>"
```

→ 같은 방식으로 bridge 재시작. 전체 롤백이면 D2 순서(MBP disable → lg99 재기동 → 모든 클라이언트 원복).
성공한 클라이언트의 `.pre-mbp` 백업(peerSecret 포함, 0600)은 9b에서 같이 지운다.

**Owner yes required**

---

## 9a단계 — 최종 read-only 확인 (yes 불필요)

MBP 셸:

```bash
systemctl is-active loom-relay
systemctl is-enabled loom-relay
curl -s http://100.119.218.93:7842/health
sudo journalctl -u loom-relay --since "-30 min" --no-pager
```

모든 클라이언트:

```bash
grep -c 'Reconnect stopped' ~/.loom/bridge/<p>.stderr.log
grep -E '"relayUrl"' "<세션 파일>"
```

통과 기준: `active` · `enabled` · `rooms` = 7b 개수 · 클라이언트마다 `Reconnect stopped` 증가 0 · 모든 세션 파일이 새 URL ·
각 방에서 피어가 보임(예: 각 클라이언트에서 `loom status` 또는 룸 멤버 확인). 선택: MBP 재부팅 1회 후 같은 확인
(재부팅도 라이브 변경 — 별도 yes).

---

## 9b단계 — lg99 원본 state 삭제 (별도 yes)

9a 통과 후, 그리고 롤백 가능성이 더 필요 없다고 오너가 판단한 뒤에만. lg99(PowerShell):

```powershell
Remove-Item -Recurse -Force "$env:USERPROFILE\.loom\relay-state"
```

(경로는 0단계에서 적은 실제 state dir.) lg99 relay의 자동 기동(작업 스케줄러 등)이 있었다면 같이 해제해 MBP와
이중 기동되지 않게 한다. 클라이언트의 `<세션 파일>.pre-mbp` 백업도 지운다.

확인 (read-only): `Test-Path "$env:USERPROFILE\.loom\relay-state"` → `False`.

되돌리기: **불가.** 이 단계 이후 롤백 경로는 MBP state의 역복사뿐이다.

**Owner yes required**

**보류 — 2026-10-25 재검토(MBP 1주 안정 운영 후 재상신) · 그때까지 lg99 `LoomRelayTeam` Disabled 유지** (오너 결정
2026-10-18).

---

## 미결·미검증

- lg99 relay 실행 방식·state dir 실제 경로·포트 — 저장소에 없음(0단계 표에서 확정).
- 전원 상실 후 자동 부팅 — 펌웨어, 미검증.
- `dist/loom.js`가 외부 의존 없이 단독 실행되는지 — 2단계 `version`으로 확인.
- `ProtectSystem=strict` 하에서 CLI가 홈(`/var/lib/loom-relay/.loom`)에 쓰는지 — 7d journal로 확인, 필요 시 6단계 메모의 대안.
- 향후: `loom service install --relay` (D3 후보).

---

## 실행 기록 (2026-10-18)

단계마다 오너 yes, 비서실장 세션 themeflow-38 경유. 토큰 값은 어디에도 기록하지 않았다.

| 단계 | 결과 |
|------|------|
| 0 | Debian 13.7 x86_64 · systemd 257.13 · tailscale `100.119.218.93` active/enabled · 7842 비어 있음 · logind drop-in `10-lid.conf`(2026-10-12)로 lid 3종 ignore + IdleAction=ignore, sleep 계열 target 이미 masked · unzip 없음 |
| 1 | `apt-get install unzip` · bun 1.3.11 → `/opt/bun` (설치기를 `SHELL=/bin/sh`로 실행해 rc 수정 없음 — root `.bashrc`/`.profile` 해시 불변; `nobody`로 실행 확인) |
| 2 | `/opt/loom/loom.js` 0.45.1 sha256 `cf27ce35…3964c` = 개발 Mac `dist/loom.js` |
| 3 | `loom-relay` uid 996 gid 987 nologin · `/var/lib/loom-relay` + `relay-state` 700 |
| 4 | `/etc/loom-relay.env` 600 root:root · 토큰은 ssh stdin으로만 전달 · 길이 48 · sha256 `460787b5…dc44` = lg99 `relay-token.txt` = Mac `mac.json` relayToken |
| 5 | **생략** — 0단계에서 이미 적용돼 있음 |
| 6 | 런북 유닛 + `StartLimitIntervalSec=0`(오너 조건) · `systemd-analyze verify` 깨끗 |
| 7-0 | 빈 state 기동 → LISTEN `100.119.218.93:7842`만 · Mac에서 health `{"ok":true,"rooms":0,"auth":true}` · journal 깨끗 → stop → state dir 비어 있음 |
| 7 | 비서실장 세션이 lg99 relay 정지 · 작업 `LoomRelayTeam` **Disabled**(이중 relay 방지) · lg99 원본 방 파일 보존(롤백용). 방 파일 2개(`8d66842a136bcac7.json` winprobe-room 802 B sha `46440996…ce4e` · `ef0245c2a460a8b4.json` loom-dev 2678 B sha `e761448a…dfce`) lg99 → Mac → MBP, 각 홉 해시 일치 · 600 loom-relay로 설치 · `enable --now` · health `rooms:2` · MBP·Mac staging 사본 삭제 |
| 8 | lg99 URL 클라이언트 = Mac `mac.json` 하나(실행 중 세션 없음) · relayUrl → `ws://100.119.218.93:7842/ws` · 백업 `mac.json.pre-mbp`(600). lg99-로컬 프로파일 step0-host / win-demo / step0-wsl 미변경(오너) |
| 9b | **미실행 · 보류** — 2026-10-25 재검토(MBP 1주 안정 운영 후 재상신) · 그때까지 lg99 `LoomRelayTeam` Disabled 유지 |

발견(기존 문제 — 이전 작업의 회귀 아님): `loom peers --profile mac` → "No room for code LOOM-4HXU". `mac.json`의 방 "demo"
(`room_b8ea4daa12aef875`, 2026-07-18)는 lg99 durable state에도 없었다.

오너 결정 (2026-10-18, 비서실장 세션 themeflow-38 경유 · 권고안대로 승인):

1. Mac `mac` 프로파일은 **그대로 둔다** — 방 "demo"(LOOM-4HXU)는 계속 도달 불가로 남고, loom-dev에 재가입하지 않는다.
2. 9b(lg99 원본 relay-state 삭제)는 **보류** — MBP 1주 안정 운영 후 재상신, **재검토일 2026-10-25**. 그때까지 lg99
   작업 스케줄러 `LoomRelayTeam`은 **Disabled** 유지.

롤백(9b 전까지 유효): lg99 작업 `LoomRelayTeam` Enable + Start · MBP `sudo systemctl disable --now loom-relay` · Mac
`mac.json.pre-mbp` 복원.
