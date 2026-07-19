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
   Claude Code 분류기는 독립 레이어임을 전제로 원격 노드 셋업 절차를 설계할 것.
