# Lessons — platform

Windows 3함정·WSL 5함정·경로 sep·크로스플랫폼 배포. 인덱스는 `tasks/lessons.md`.

## 2026-07-19 (13) — 크로스플랫폼 경로 비교에 구분자 하드코딩 금지 + POSIX 전용 테스트의 사각

**발견 (2026-07-19, 0.24.2 Windows 실배포):** `persist.ts:389`의 경로 가드가
`path.startsWith(realState + "/")`로 **POSIX `"/"`를 하드코딩**했다. Windows에선
`roomStatePath()`가 `join()`으로 산출한 백슬래시 경로가 이 `"/"` 프리픽스와 불일치해
**모든 스냅샷 쓰기가 결정론적으로 거부**됐다(스택 `Snapshot path escapes state dir`). 0.14.x부터
잠복해 온 결함이나 ① Windows relay가 v0.24.1 durable 배선 전까지 항상 ephemeral이라 미발화 ②
유닛 테스트가 전부 POSIX라 미검출 — **테스트 green + Windows 실배포 첫날 전 기능 마비**가
공존했다. 수정 = `node:path`의 `sep`(POSIX에선 `"/"`라 판정 완전 불변, Windows에선 `"\"`).

**Rule:** 경로 프리픽스/포함 비교는 구분자를 하드코딩하지 말고 `sep`(또는 `relative()`가
이탈 여부를 반환하게) 쓴다. 그리고 **신규 플랫폼 첫 배포는 "테스트 green"과 무관하게 핵심
경로(스냅샷 쓰기 등) 라이브 스모크가 필수** — POSIX 전용 유닛 스위트는 Windows 경로 의미론을
구조적으로 커버하지 못한다(플랫폼 사각은 절대 수치가 아니라 "그 플랫폼에서 한 번 돌려봤나"로
판정). 부정 테스트가 명세대로 구현 불가한 경우(가드 대상이 해시 파생이라 거부 분기 도달 불가)는
거부 어서션 대신 **containment 어서션**(적대적 입력도 안전 영역에 안착)으로 재정의한다(R39 M-1).

## 2026-07-19 (14) — Windows 원격 운영 3함정 (2026-07-19 실증)

durable relay를 Windows Scheduled Task로 상시화하며 셋 다 라이브로 물렸다:

1. **PS 5.1 래퍼에서 `$ErrorActionPreference="Stop"` + PS 스트림 `2>>` = 네이티브 stderr 첫
   줄에 래퍼 즉사.** PowerShell은 네이티브 프로세스의 stderr 한 줄을 ErrorRecord로 감싸
   `Stop`에서 래퍼(와 자식 relay)를 죽인다. durable relay는 persist 이벤트를 stderr에 로깅하므로
   **첫 room create에서 relay 동반 사망**했고, err.log는 0바이트로 남아 원인이 은폐됐다. 네이티브
   장기 프로세스의 리다이렉트는 `cmd.exe /c "... 1>>log 2>>err"` 경유가 정답(PS 스트림 우회).
2. **SSH 세션에서 띄운 프로세스는 세션 종료와 함께 사망.** SSH로 접속해 Start-Process로 relay를
   띄우면 로컬 `curl 127.0.0.1`은 성공하는데 Mac에서 원격 도달만 실패하는 **가짜 방화벽 증상**이
   나온다(세션이 끊기며 자식이 죽은 것). 상시 프로세스는 반드시 Scheduled Task 등 세션 독립
   런처로 띄운다.
3. **Scheduled Task `RestartCount`는 액션의 비영(非零) 종료에 미적용 + `bun install -g`는
   phantom-lock EBUSY 취약.** `RestartCount5`가 있어도 relay가 exit 1로 죽으면 자동 재시작되지
   않는다(크래시 자동 복구가 아님 — 수동 `Start-ScheduledTask` 필요). 그리고 `bun install -g`는
   Windows 캐시/설치 대상 디렉터리 delete-pending 잠금으로 EBUSY 반복 실패 — **리포 번들 직접
   실행**(`bun.exe <repo>\dist\loom.js relay …`)이 강건하고 재배포도 `git pull` + Task 재시작만으로
   끝난다.

## 2026-07-19 (15) — WSL 노드 브릿지 배치 5함정 (0-c ② 실증)

WSL(Ubuntu 26.04, root)에 두 번째 herdr 노드 브릿지를 세우며 다섯을 라이브로 물렸다.
전제: 순수 ops 웨이브(제품 코드 무변경·R{n} 불요 — 브릿지 코드는 플랫폼 중립).

1. **브릿지 데몬도 SSH 세션 종료와 동반 사망** (lessons (14)-2의 WSL판). SSH로 접속해
   띄운 `herdr server`·`loom bridge start`는 세션이 끊기면 자식까지 죽는다 — 로컬은 살아
   보이는데 원격만 실패하는 가짜 증상. **장기 프로세스는 `setsid nohup … &`로 세션 독립
   분리 필수.** 단 setsid는 세션 독립일 뿐 **재부팅은 미보장**(부팅 상시화는 WSL systemd
   또는 Windows Task — 후속 후보).
2. **WSL 비로그인 셸은 `~/.bashrc` PATH 미소싱.** Ubuntu 기본 `.bashrc`는 인터랙티브가
   아니면 조기 `return`하므로, `bun`/`loom`/`claude`/`herdr`를 `~/.bun/bin` 등에서만 찾게
   해두면 브릿지가 스폰하는 비로그인 워커가 PATH 미해결로 즉사한다. **정답 = `/usr/local/bin`
   심링크**(로그인 형태 무관 상시 PATH).
3. **root + `--dangerously-skip-permissions` = Claude Code 보안 거부·즉시 종료.** root에서
   이 플래그로 워커를 띄우면 Claude Code가 거부하고 프로세스가 죽는데, **브릿지 관점에선
   `inject_unconfirmed`로만 표면화**(워커 사망이 주입 실패로 위장 — 진짜 원인이 은폐됨).
   root 워커 자율화 정공법 = **user-레벨 `permissions.allow`**(`/root/.claude/settings.json`)
   **+ workspace 신뢰**(`/root/.claude.json`의 `hasTrustDialogAccepted`) — skip-permissions에
   기대지 말 것. (non-root 사용자 전환 시 skip 계열 재개방 여지 — 후속 후보.)
4. **`bridge start --allow`는 config 재주입 트랩.** `--allow`는 loadBridgeConfig→saveBridgeConfig
   경로로 실행 시점의 `herdrSocketPath`(env 우선 해석값)를 config에 되써버린다. 다음 기동에서
   env가 다르면 스테일 소켓을 물게 됨. **config(`~/.loom/bridge/<profile>.json`)에
   `authorizedDispatchers`를 미리 써두고 bare `bridge start`**를 쓴다(save-back 회피).
5. **분류기 레이어 분리 — 오너 제품-레벨 승인 ≠ 에이전트 실행 허가.** Loom 카드 디스패치가
   승인돼 있어도, 에이전트가 원격에서 시도하는 **권한-확장 쓰기·고위험 리터럴·전역 설치**는
   Claude Code 분류기가 별도로 차단한다(이번 웨이브 6회 — 설치 2·Keychain 인증 이전 1·
   신뢰/allow 파일 3). 해제 경로는 **오너 `!` 직접 실행**뿐 — 우회 시도 금지. Loom-레벨 승인과
   Claude Code 분류기는 독립 레이어임을 전제로 원격 노드 셋업 절차를 설계할 것. **오너와의
   대화-레벨 승인이 있어도 분류기는 미해제** — (16) VPS 웨이브에서 8회로 폭이 더 넓게 재실증됐다.
   **Mac 본세션 재실증(2026-07-19, v0.25.0 conv_fetch):** 원격 노드뿐 아니라 **로컬 Mac
   본세션에서도 dist 커밋·`git push`가 분류기 차단** — 소스 커밋(`b343ada`)은 통과하고
   **dist 커밋·push만 차단**된다(소스 vs 빌드산출물·push의 차등). dist 재빌드 후 반영은
   오너 `!` 직접 2커맨드(`git add dist/loom.js && git commit …` · `git push`) 필요.
   **추가 재실증(2026-07-19, 부팅 생존 상시화):** 지속성 메커니즘(crontab·systemd unit·
   Scheduled Task) 커맨드 팩 작성을 서브에이전트에 위임하려 하자 **Agent 스폰 자체가
   차단**됨(프롬프트 내용 기준 판정 — 실행이 아니라 문서 작성 위임인데도). 우회 = 본세션이
   읽기-전용 조사(Explore)만 위임하고 팩 문서는 직접 Write(로컬 md 작성은 통과). 즉 위임
   규칙(orchestration (7))의 분류기-차단 예외 선례.

## 2026-07-19 (16) — VPS(sudo-less·non-root) 노드 브릿지 배치 3함정 (0-c ③ 실증)

Tailscale `kb`(100.116.39.101, Ubuntu 24.04.4 LTS, x86_64, non-root `zerocode`·**sudo 불가**)에
세 번째 herdr 노드 브릿지를 세우며 물린, ②(WSL)와 구별되는 신규 함정 셋. 전제는 동일한
순수 ops 웨이브(제품 코드 무변경·R{n} 불요 — ② 선례 승계). 설치는 git 없는 노드라
`git bundle` scp → `git clone ~/loom-main.bundle ~/.loom-src` + `bun install` + `bun link`로
**GitHub 접근 없이** 소스 리포를 얹었고(unzip 부재는 busybox shim으로 해결), claude 자격증명은
오너가 Keychain에서 이전했다.

1. **브릿지 기동은 소스 리포(`~/.loom-src`) cwd가 필수 — 홈에서 띄우면 즉사.**
   `bridge-spawn.ts:29`의 `bridgeMainPath()`는 ① `import.meta` 기준 경로 ② `process.cwd()` +
   `packages/host/src/bridge-main.ts` 폴백의 2단으로 `bridge-main.ts`를 찾는다. `bun link`로
   심어진 `loom`은 심링크라 ①이 miss하고, 홈 디렉터리에서 기동하면 ②도 `~/packages/...`를
   가리켜 빗나가 **"Cannot find bridge-main.ts"로 즉사**한다. 정답 =
   `cd ~/.loom-src && setsid nohup loom --profile node-vps-1 bridge start …`(setsid 세션 독립은
   ②-1 그대로).
2. **sudo 불가라 `/usr/local/bin` 심링크 경로가 막힘 — PATH는 `~/.bashrc` 가드 앞에 삽입.**
   ②-2의 정답(`/usr/local/bin` 심링크)은 root 권한 전제였다. non-root·sudo 불가 노드에선
   그 경로가 막히므로, `bun`/`loom`/`claude`/`herdr`의 PATH 블록을 **`~/.bashrc`의 인터랙티브
   조기-`return` 가드보다 앞줄에 삽입**한다(`sed -i '1r /home/zerocode/loom-node-path.block'`).
   이래야 브릿지가 스폰하는 비로그인 셸에서도 4개 도구가 전부 해석된다(라이브 확인).
3. **Option B′는 파일-복제로 이식 가능 — 스크립트화한다.** ②에서 손으로 세운 워커 신뢰
   설정(Option B′)을 WSL 원본에서 그대로 복제했다. `/root/.claude/settings.json`(153B)은
   **내용이 경로-독립**이라 kb `~/.claude/settings.json`(0600)으로 그대로 복사하면 되고,
   workspace 신뢰는 kb `~/.claude.json`에 두 키(`hasTrustDialogAccepted`·
   `hasCompletedProjectOnboarding`, `projects."/home/zerocode/.loom-src"` 아래)를 **python으로
   병합**한다(기존 파일 통째 덮어쓰기(클로버) 금지). WSL 원본 접근은
   `ssh win-loom 'wsl -e bash -c …'` 경유. bridge config도 손으로 작성했다(no `--allow` —
   ②-4 트랩 회피: `authorizedDispatchers=[p_45115c32d2c462f9]`,
   `herdrSocketPath=/home/zerocode/.config/herdr/herdr.sock`, `agentArgv.claude=["claude"]`,
   protocol 16, paneCleanup auto, panePlacement pool).

스모크 1차 클린 완주(`[SMOKE-VPS1-OK] head=d1c0dd9 loom=0.24.2` — 무오염·승인 프롬프트 0회·
pane 자동 close·inFlight=0·board done). node-vps-1 = `p_aadcd1e3dc9c5b5a`(loom-dev
`room_ca184b781cfdabdc`, 초대 LOOM-GT4B), bridge online pid 541727(setsid). 알려진 summary
스크레이프 아티팩트(워커 하단 상태줄이 board notes에 유입 — output·마커는 무오염)는 VPS에서도
**동형 재현**(기존 후속 후보 그대로). 분류기 차단은 이번 웨이브 **8회**(②의 6회보다 폭 확대 —
PATH sed·자격증명 이전·온보딩 플래그·room join·config scp·Option B′ 스크립트·데몬 기동 2건)로
오너 `!` 직접 실행으로만 해소됐고, (15)-⑤의 독립 레이어 명제를 재실증했다. 후속 후보 추가:
kb 부팅 생존 상시화(non-root라 `systemd --user` 후보 — WSL 상시화 후보와 병렬).

## 2026-07-20 (17) — 노드 부팅 생존 상시화 완주 + systemd HOME 소켓-경로 함정 (0-c 후속 실증)

두 노드(kb·node-wsl-1) 재부팅 생존 배선을 상시화하며 물린 **systemd 서비스 특유의 함정 1건**.
전제는 순수 ops(제품 코드 무변경·R{n} 불요). 적용은 전부 오너 `!` 직접(crontab·systemd
unit·Scheduled Task = 지속성 메커니즘이라 (15)⑤ 분류기 차단, 읽기 커맨드만 본세션 직접).

배선 요지: **kb** = `@reboot` crontab 2줄(herdr + `sleep 8` 후 `cd $HOME/.loom-src && bridge
start`, cron은 `.bashrc` 미소싱이라 PATH·BUN_INSTALL 인라인·기존 backup job 보존 append·멱등).
**node-wsl-1** = WSL systemd system service 2개(`loom-herdr`·`loom-bridge`, `Restart=always`,
`enable --now` 대신 enable-only 후 명시적 컷오버) + Windows `LoomWslBoot` LogonTrigger Task
(`wsl.exe -d Ubuntu -e true`로 distro만 깨우면 내부 systemd가 서비스 기동 — 기존
`\LoomRelayTeam`은 relay 전용이라 WSL 미커버였음).

1. **systemd 서비스는 셸과 달리 `HOME` 미상속 → herdr 소켓이 엉뚱한 곳에 열려 bridge가 즉사.**
   컷오버 직후 herdr는 `active`인데 bridge가 `herdr unreachable … ENOENT
   /root/.config/herdr/herdr.sock`으로 crash-loop(`Restart=always`라 무한 재시작)에 빠졌다.
   근인: **herdr는 소켓 경로를 `$HOME/.config/herdr/`로 정하는데** systemd `[Service]`는
   `Environment=`가 비어 `HOME` 미설정 → herdr가 `/tmp/herdr/herdr.sock`으로 폴백. 반면
   bridge config(`node-wsl-1.json`)엔 `herdrSocketPath` 키가 **없어** bridge도 HOME 기반
   기본 경로(`/root/.config/herdr/herdr.sock`)를 계산 → 양쪽 경로 불일치. 기존 setsid 기동은
   root **로그인 셸**이라 `HOME=/root`가 상속돼 우연히 일치했던 것(어제 `/root/.config/herdr/`에
   소켓 잔존이 증거). **정답 = 두 unit에 `HOME=/root` 주입.** 원본 unit을 안 건드리는 drop-in
   (`/etc/systemd/system/loom-{herdr,bridge}.service.d/home.conf`에 `[Service]\nEnvironment=
   HOME=/root`) + `daemon-reload` + restart. 적용 후 herdr `api socket:
   /root/.config/herdr/herdr.sock`·bridge `[loom-bridge] herdr ok v0.7.4 protocol 16`
   `{"ready":true,"pid":14019,"port":41293}` 정상 기동 확인. **팩 원본 §B-1 unit엔 이 HOME
   줄이 누락돼 있었음 — systemd로 herdr를 띄우는 모든 노드에 선반영 필요(cron/setsid는
   로그인 셸 HOME 상속이라 무해했던 잠복 결함).**
2. **enable-only 후 명시적 컷오버가 옳다.** `enable --now`로 바로 띄우면 기존 setsid
   프로세스와 중복 기동. `enable`만 걸어 재부팅 생존은 확보하고, 컷오버(`pkill` 기존 →
   `systemctl start`)를 **오너가 보는 앞에서** 수행하니 위 HOME 결함이 무인 재부팅이 아니라
   즉시 노출돼 그 자리에서 고칠 수 있었다(팩 §B-2 권고의 실효 입증).

완주 상태(프로세스 레벨): kb crontab `@reboot` 2줄 설치(멱등)·node-wsl-1 unit 2개 `enabled` +
drop-in 반영 + bridge PID 14019 `active (running)` + Windows `LoomWslBoot` Task 등록. 프로세스
확인은 `pgrep -f "bridge-main"`(`bridge start` 아님, 실체는 `bun run bridge-main.ts`). 비대칭
유지: kb는 supervision 없음(cron 부팅 1회 기동만, sudo-less 최소 경로), WSL은 systemd
`Restart=always`.

3. **WSL cold-boot 실증은 `wsl --shutdown`→wake로 물리 재부팅 없이 가능.** Windows
   `LoomWslBoot` Task의 실질 동작은 `wsl.exe -d Ubuntu -e true`(distro만 깨움)이고 실제 서비스
   기동은 내부 systemd가 하므로, `ssh win 'wsl --shutdown'`으로 distro를 완전히 내린 뒤
   `wsl -d Ubuntu -e true`로 깨우면 **재부팅의 systemd 경로 전체를 물리 재부팅 없이 실증**할 수
   있다(라이브 확인: herdr PID 159·bridge PID 162로 재기동 — 낮은 PID가 cold boot 증거).
   주의: `timeout`은 ssh→Windows 셸에서 Windows `TIMEOUT.exe`로 해석돼 깨진다(GNU timeout
   아님) — wsl 커맨드는 빨리 반환하니 불요. kb는 `@reboot` 발효가 실제 재부팅에서만 일어나고
   `sudo reboot`이 비밀번호를 요구(§D sudo 메모)해 실증은 다음 자연 재부팅으로 유예
   (crontab 설치·PATH·cwd 정합은 확인 완료, `/tmp/loom-bridge-boot.log`가 발효 증거가 됨).
