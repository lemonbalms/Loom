# HANDOFF — Loom (next session)

**Date:** 2026-07-18  
**Workspace:** `/Users/kyoungsiklee/projects/fable-advisor`  
**GitHub:** https://github.com/lemonbalms/Loom (`main`)  
**Language:** user often Korean · **Autonomy:** brief status → execute gate (no mid-wave "할까요?")

> ### Windows에서 볼 때
> **→ [`HANDOFF_WINDOWS.md`](./HANDOFF_WINDOWS.md)** — **git pull 후 Windows 전용 실행 핸드오프**  
> (Step 0 사실 + ⭐ **Tailscale 팀 공용 relay 상시화** 복붙 절차). 제품 코드는 Mac만.  
> 이 파일(`HANDOFF.md`) = Mac/다음 세션 에이전트 진입점.

---

> 종결 웨이브 역사 기록: docs/HANDOFF_ARCHIVE.md (이 파일은 최신 상태만 유지)

## ⭐ Current action (read first)

> **🎯 노드 부팅 생존 상시화 완주 (2026-07-20 — 순수 ops·R{n} 불요).** kb·node-wsl-1 두 노드 재부팅 생존 배선 상시화. **kb** = `@reboot` crontab 2줄 설치(herdr + `sleep 8` 후 `cd $HOME/.loom-src && bridge start`, PATH 인라인·기존 backup job 보존 append·멱등). **node-wsl-1** = WSL systemd system service 2개(`loom-herdr`·`loom-bridge`, `Restart=always`) `enabled` + Windows `LoomWslBoot` LogonTrigger Task(`wsl.exe -d Ubuntu -e true`) 등록. 적용은 전부 오너 `!` 직접(지속성 메커니즘 = 분류기 차단, 읽기 커맨드만 본세션). **함정 1건 실증·해소 = systemd HOME 미상속**: 컷오버 직후 herdr는 `active`인데 bridge가 `herdr unreachable ENOENT /root/.config/herdr/herdr.sock` crash-loop — 근인은 systemd `[Service]`가 `HOME` 미설정이라 herdr 소켓이 `/tmp/herdr/`로 폴백, bridge는 HOME 기반 `/root/.config/herdr/`를 기대(불일치). 정답 = 두 unit에 drop-in `Environment=HOME=/root` 주입 → herdr `api socket: /root/.config/herdr/herdr.sock`·bridge PID 14019 `{"ready":true,"port":41293}` 정상 기동. (setsid/cron은 로그인 셸 HOME 상속이라 무해했던 잠복 결함 — 팩 §B-1 unit에 HOME 누락, 사후 선반영.) 상세 lessons platform (17). **잔여 = 실제 재부팅 실증(§C, 선택)** — 프로세스 확인은 `pgrep -f "bridge-main"`. 산출물: `.loom-boot-persist-pack.md`(✅ 적용 완료 반영)·lessons platform (17).**
> ─────── **직전 완주 = 0-c ⓐ artifact fetch 자동 실행(코드+게이트) — v0.25.0 `conv_fetch` (2026-07-19 — R40 `approved`, M-A~M-D 락 반영·구현+검증 완결).** R26이 "제시까지"로 유예했던 마지막 단계를 신규 MCP 툴 `conv_fetch(convId, seq, index)`로 자동화 — scp transport만, 셸 미경유 argv 직접 spawn, 실행 직전 host/path 재검증 fail-closed, post-fetch sha256 격리. **R40 판단**: R26 예약 M-1/M-2 High 승격을 다중 계층(argv 직접 실행·좌표-only·실행 직전 재검증·containment·sha 격리·BatchMode)이 닫고, argv 상위-방어 잔여 격차 2건을 M-B(host 실행-경로 `validateConvNodeHost` 전체 재적용)·M-C(원격 path charset 재검증)로 봉합. **구현/검증 완결**: `b343ada`(9파일 +1265, 신규 `conv-artifact-fetch.ts`+test) · 신규 유닛 25/0 · verify-0250 독립 락 대조 12/12 PASS · 아키텍트 독립 전체 스위트 538/0 · typecheck 6/6 · U2 실측 OpenSSH 10.2 scp `--` 지원→argv 채택(L-3). **dist `3e77409` 커밋·push 완료**(분류기 차단 → 오너 `!` 직접 해소, dist-guard ok — 소스 `b343ada`는 통과·dist/push만 차단, lessons (15)⑤). **잔여 2건 전부 해소**: ① ~~D10 라이브 스모크 미실시~~ → **완주(2026-07-19 — node-vps-1 `kb` 실 원격 scp 왕복, 5 시나리오 전부 PASS: happy-path sha 일치 회수·D5 덮어쓰기 거부·매핑 부재 fail-closed·M-B 오염 host argv 차단·D6 sha 불일치 격리, argv `--` 종료자 라이브 확인)** ② ~~conv-hosts 매핑 등록 확인~~ → **확정(`p_aadcd1e3dc9c5b5a → kb` 신규 등록·실 노드라 존치)**. **다음 최전선 = 노드 부팅 생존 상시화(순수 ops·R{n} 불요) — 프로브 완료(2026-07-19 읽기-전용, 미적용), 아래 경로 확정, 다음 세션은 프로브 재실행 없이 바로 적용(오너 `!`)**. **현재 두 노드 모두 online**(kb: herdr pid 541142·bridge pid 541727 `bun run ~/.loom-src/…/bridge-main.ts` cwd `~/.loom-src`, uptime 1일 14시간 / node-wsl-1: herdr pid 2628·6391·bridge pid 4592, WSL systemd=true running) — 재부팅 후 재기동이 문제(setsid는 세션 독립일 뿐 재부팅 미보장, lessons platform (15)-1). **확정 경로**: **node-vps-1 (kb)** = **`@reboot` crontab 2줄**(sudo·linger 불필요, cron·tailscaled enabled 확인 — 1줄 herdr, 1줄 `sleep 8` 후 `cd $HOME/.loom-src && … bridge start`, cron은 `.bashrc` 미소싱이라 PATH 인라인 필수·`BUN_INSTALL`+`$HOME/.bun/bin`+`$HOME/.local/bin`). 대안 `systemd --user`+linger는 linger 없으면 미로그인 재부팅 시 `/run/user/1000` 소멸로 무력이라 비권장. **⚠ 불일치**: `id`상 zerocode가 sudo 그룹 멤버로 나옴(브리핑은 "sudo 불가") — 오너 확인 권장(권장안은 sudo 무관 성립). **node-wsl-1** = **WSL systemd system service 2개 + Windows LogonTrigger Task(2단 체인)**. 결정적 발견: 기존 Windows Task `\LoomRelayTeam`은 **relay 전용**(Windows 네이티브 bun.exe)이라 WSL herdr/bridge 미커버 → **WSL 노드 재부팅 생존 현재 0**. 경로 = WSL 내부(root) `/etc/systemd/system/loom-herdr.service`(`ExecStart=/usr/local/bin/herdr server`·`Restart=always`) + `loom-bridge.service`(`WorkingDirectory=/root/.loom-src`·`ExecStart=…bun run …/bridge-main.ts`·`After=loom-herdr.service`·`Restart=always`)→`systemctl enable --now`, + Windows LoomRelayTeam LogonTrigger 패턴 승계 Task 신설(액션 `wsl.exe -d Ubuntu -e true`로 distro 부팅→systemd 기동). 1단 대안: Windows Task가 base64 래핑 `wsl -e bash -c "…setsid nohup…"` 직접 실행. **적용 블로커**: crontab 편집·systemd unit 작성·Windows Task 등록은 전부 원격 쓰기라 분류기 차단 → 오너 `!` 직접 실행(lessons platform (15)⑤·(16)). **cheat-sheet 정정**: bridge 실체는 `bun run …/bridge-main.ts` — `pgrep -f "bridge start"`는 못 잡음, `pgrep -f "bridge-main"` 또는 `bun run`으로 확인.**
> ─────── **직전 완주 = ⓑ hooks 보조 센서 스파이크(읽기-전용, 2026-07-19 커밋 `0b534a6`).** 오너가 "실시간 CLI 간 통신"을 물어 (a)상태 관전 / (b)출력 본문 스트리밍으로 분해, 오너 (a) 채택 → CONV_SPEC 3단계 전체가 아니라 **Claude Code hook 보조 센서로 저비용 실현**(COMPETITIVE §2.7 로드맵 5번, R 불요 읽기-전용 스파이크). **결론**: hook으로 승인대기(`Notification` matcher `permission_prompt`)·턴끝(`Stop`, payload `last_assistant_message`)·시작(`UserPromptSubmit`) 3상태를 화면 스크레이프 없이 감지 가능 → §5.2가 막혔던 ~5.3k 스크레이프 상한 우회. **Loom 배선 지점 전부 기존재**: 워커 스폰 `bridge-runtime.ts:1041` runCard·env 주입 `herdr-client.ts:387`·워커 cwd=타워 `:1072`·이벤트 합류 `onCardHerdrEvent`(`:1967-2010`)·로컬 0600 소켓 선례 `inject-control.ts`(moshi-hook 동형). **최소 배선 5단계**: `--settings` 인라인 JSON hook 주입 → 워커 hook이 `loomDir()/hook-<cardId>.sock` async append → 브릿지 watch → `flight.hookHint` 우선 분기(`onCardHerdrEvent`·still-running poll) → hook 부재 시 현행 스크레이프+5분 유예 폴백(fail-open). **R{n} 판정**: relay/conv wire·MCP **무변경**(브릿지-로컬 경로), 신규 = 브릿지-로컬 소켓 리스너(외부 프로세스 입력 = 신규 신뢰 경계)이나 inject-control 선례라 **경량 R{n}(PATCH~MINOR) 예상** — hook을 "완료 힌트"로만·결과는 스크레이프로 회수해 신뢰 노출 최소. **결정 SSOT = COMPETITIVE §2.5.2 "교체 아님, 센서 추가"**. 산출물: `docs/spikes/HOOKS-SENSOR-SPIKE.md` 신설 + COMPETITIVE §2.7 로드맵 5번 완료 갱신. **스파이크는 읽기만이라 종료 — 실제 PATCH는 §2.5.3 순서상 이득 empirical 입증(dogfood 로그: 조기 done·승인 미탐지 감소) 후 경량 R{n} 게이트.** ─────── **직전 완주(그 앞) = ④ `@node` 라우팅 운용**(2026-07-19 밤 — 순수 ops·R{n} 불요, ②③ 선례 승계): 노드 3식(mac-node·node-wsl-1·node-vps-1)에 ROUTE 카드 3발 라이브, 각 노드가 자기 카드만 스폰·card.done 3/3 회수·보드 done·pane 자동 정리.** **스코프 판정(신규 표면 없음 → R{n} 불요)**: `@node` 어드레싱은 이미 완비 — `@displayName` 파싱(`envelope.ts:59`) · relay `room.ts:452` resolveTargets→findPeerByName 단일-타깃 enqueue · 브릿지 M-1 allowlist+CARD_DISPATCH_LABEL 이중 게이트 · applyCardResult L-2 assignee 대조. **스코프 배제 2건**: 보드-레벨 노드 선택 편의 CLI 신설(신설 시 §5.1 게이트) · artifact fetch 자동화 편입(R26 M-1/M-2 승격 → R{n} 재리뷰 필수). **실증**: ROUTE-MAC task_be45eeb(mac-node, loom-local) `[ROUTE-MAC-OK] node=mac-node head=7cc071b` 마커 클린 / ROUTE-WSL task_8a4653a(node-wsl-1)·ROUTE-VPS task_9e5419e(node-vps-1) 같은 룸 loom-dev 동시 발사 → **각 노드 자기 카드만 스폰**(스폰 사이클 정확 1개·타 카드 흔적 0, bridge stderr 실측) · card.done 3/3 회수 · 보드 전이 done · 전 노드 pane 자동 정리 · 바인딩 local 원복. wsl/vps summary는 알려진 하단 상태줄 스크레이프 아티팩트로 덮임(기존 후속 후보 그대로). **신규 운용 지식(토폴로지)**: mac-node = loom-local 룸(room_32f3322b595456b7), wsl/vps = loom-dev(room_ca184b781cfdabdc) — tower(claude-impl)는 relay 이중 신원(local p_726870658689123e / win p_45115c32d2c462f9). **`dispatchCard`는 `loadSession()`=active 바인딩 룸으로 나가므로 멀티룸 dispatch는 `loom relay use <name>` 전환 후 발사**(새 bun 프로세스만 적용, sticky host 경고는 무해 — dispatch 스크립트는 새 프로세스라 즉시 반영). 회수도 바인딩별 인박스. **기타 실측**: `loom bridge status`는 foreground bun 브릿지에서 pidfile 미생성으로 false offline 표시(프로세스는 생존) — 상태 확인은 `--profile` 지정 + 프로세스/health 직접 확인 · 원격 WSL 명령은 cmd.exe 이스케이프 붕괴 → base64 래핑 권장 · VPS stat 타임스탬프는 UTC(mac/wsl은 KST) — 로그 시각 대조 주의 · mac-node bridge config에 스테일 dispatcher p_ed676195eecd9488 잔존(무해, 정리 후보). **운용 스크립트(untracked 잔존)**: `.loom-dispatch-route-{mac,wsl,vps}.ts` + `.loom-claim-route.ts`(인박스 자동 선별 공용 claim — 선례 FIXME 하드코딩 방식 일반화). **다음 최전선 = 0-c 트랙 유예분 ⓐ artifact fetch 자동 실행 도입 — R{n} 재리뷰 필수**(R26 M-1/M-2 High 승격, plan_review R26:435). **병렬 ops 후보**: 노드 부팅 생존 상시화(WSL systemd/Task + kb `systemd --user`).
>
> **③ Linux/VPS 노드 완주 요지(압축)**: Tailscale `kb`(100.116.39.101, Ubuntu 24.04.4·non-root·sudo 불가) 세 번째 노드 브릿지 online·스모크 1차 클린 `[SMOKE-VPS1-OK] head=d1c0dd9`(node-vps-1 `p_aadcd1e3dc9c5b5a`, loom-dev room_ca184b781cfdabdc, 초대 LOOM-GT4B) — sudo-less 3함정(bridge 기동 cwd `~/.loom-src` 필수·`~/.bashrc` 가드 앞 PATH 블록·Option B′ 파일-복제 이식)·`git bundle` scp→clone 설치(GitHub 접근 불요)·분류기 차단 8건 오너 `!` 직접 해소 — 상세 docs/HANDOFF_ARCHIVE.md.
>
> ### ✅ 후보 ⑩ 조사 종결 (2026-07-18 — 재조사 금지)
> §5.2 32k artifact 트리거 전제 재검토 종결. 워커 TUI 3종 스크레이프 상한 라이브 실측(claude ~5.3k·grok ~2.2k·codex ~1.4k — 소스·줄수 무관 포화). **결론**: 정답 경로 = **워커 직접 파일 쓰기**(§5.1로 이미 shipped·179KB 실증) / herdr 심층 스크롤백 = CLI 표면 부재 / 32k 임계 하향 = 접힌 스크레이프라 기각 → **§5.2 32k 분기는 방어적 잔존(삭제 아님)**. ⑪(capable 워커 benign 페이로드)은 §5.2 목적으론 무의미(선택적 잔존). 워커 모델별 거동·상세는 docs/HANDOFF_ARCHIVE.md.
>
> ### 다음 액션 (우선순위 순)
> 0. ~~⭐ 잔여 후보 일괄 적용 웨이브 (오너 지시)~~ → **완주(v0.23.11 `0ee8c50`+보정 3건 · ② `08d6091`) — 상세 docs/HANDOFF_ARCHIVE.md**.
> 0-a. **npm publish 보류 (오너 결정 2026-07-19: "계정이 없어 일단 보류 해")** — 진행분(재조사 금지): `loom` 선점·`loom-cli` npm 보안 홀드 확정 / **가용 = `loom-terminal`(무조건) · `@lemonbalms/loom`(계정·org가 lemonbalms일 때만)** / 오너 선택(보류 전) = `@lemonbalms/loom` + **UNLICENSED** / 타르볼 형태 검증 완료(dry-run 3파일 87.5kB — package.json + `dist/loom.js`(bun shebang, bunx 실행 전제) + README.md 자동 포함, 루트 devDependencies 미포함). **재개 절차**: ① 오너 npmjs.com 가입(계정명이 lemonbalms 아니면 org 생성 또는 `loom-terminal` 전환) → ② `! npm login` → ③ package.json 발행 메타 재적용(name·version 0.23.x 정합·license UNLICENSED·private 해제·`files:["dist/loom.js"]`·`publishConfig.access:public`·repository·engines.bun) → ④ `npm publish` → ⑤ `npm view`·`bunx` 검증 → ⑥ package.json은 발행 직후에도 **`private: true` 복원 여부 오너 확인**(현재는 원복해 가드 유지). |
> 0-b. ~~⭐ PLAN 0.23.12 웨이브(summary 타임스탬프 소거 + 풀 pane 균등 폭)~~ → **완주(v0.23.12 `d3afb55`, 474/0 — 상세 docs/HANDOFF_ARCHIVE.md)**. **잔존 후속 후보**: ① **위상-인지 균등화** — ⓑ의 L-2(i) 유일성 가드가 라이브 중첩-좌측 위상에서 발화(균등화 미적용·스폰 무영향), herdr 스폰 split 타깃 비제어(`pane_id` 무시, 0.23.9 실측)라 위상 가변이 구조적 → 트리 구조 판별 일반화 필요(직속 split = 최소-폭 포함 split + 서브트리 leaf-count 비율, 균등화 로직 변경이라 §5.1 게이트 판단) ② **sonnet 스모크 claude-mem 피드백 루프** — 거부 관찰이 저장→주입되어 후속 benign 스모크도 재거부(lessons (9)), 스모크 설계 대응 필요. 잔존 Low(등재만): claude TUI 말미 비콘텐츠 줄 추가 가족 표면화 시 개별 보정 대신 여기 등재(원칙 유지).
> 0-c. **⭐ 다음 제품 트랙 = 멀티노드 단계 3 (오너 확정 2026-07-19: "다음 트랙에서 진행" + MVP 종료·프로덕션 전환)** — Loom×Herdr 아키텍처 권고(`~/Downloads/loom-herdr-architecture.html`) §06 수직 슬라이스, 0~2 완료. **완결분(상세 docs/HANDOFF_ARCHIVE.md)**: ~~⓪ 단독 모드 기능화~~(v0.24.0 `b508a4c`+dist `2c513c9`) → ~~① Windows relay 복귀(D10)~~ → ~~①-b relay 룸 영속화~~(v0.24.1 `71ace35`+dist `b544429` — 영속화 체인 0.14.x 기구현·근인=`loom relay` 포그라운드 분기 durable 미배선의 **배선 갭 PATCH**) → ~~①-c Windows 재배포·실증~~(v0.24.2 `59bfeae`+dist `6aaf54f` — durable 첫 기동 결함 2건 **D1** persist 경로 가드 POSIX `"/"` 하드코딩 `sep` 교정·**D2** handleMessage uncaught 크래시 가드, **재로그온 룸 유지 확정**·loom-dev 재수립 초대 **LOOM-GT4B**·래퍼 리포 번들 직접 실행 전환) → ~~② WSL 노드 브릿지 복제~~(2026-07-19 저녁 — 순수 ops·R{n} 불요, WSL Ubuntu 26.04 두 번째 노드 브릿지 online·4차 클린 스모크 `[SMOKE-WSL2D-OK] head=b4a8e63`·상세 docs/HANDOFF_ARCHIVE.md) → ~~③ Linux/VPS 노드 브릿지 복제~~(2026-07-19 저녁 — 순수 ops·R{n} 불요, Tailscale `kb` Ubuntu 24.04·non-root·sudo 불가 세 번째 노드 online·스모크 1차 클린 `[SMOKE-VPS1-OK] head=d1c0dd9`·node-vps-1 `p_aadcd1e3dc9c5b5a`) → ~~④ `@node` 라우팅 운용~~(2026-07-19 밤 — 순수 ops·R{n} 불요, ②③ 선례 승계, 노드 3식 ROUTE 카드 3발 라이브·각 노드 자기 카드만 스폰·card.done 3/3·보드 done·pane 자동 정리·`dispatchCard`=active 바인딩 룸이라 멀티룸은 `relay use` 전환 후 발사·상세 docs/HANDOFF_ARCHIVE.md). → ~~ⓐ artifact fetch 자동 실행 도입~~(2026-07-19 — **v0.25.0 `conv_fetch` R40 `approved`+구현 `b343ada`**, M-A~M-D 락 반영·신규 유닛 25/0·아키텍트 독립 전체 538/0·U2 OpenSSH 10.2 scp `--` 지원→argv 채택(L-3) · **dist `3e77409` 푸시 완료 · ~~D10 라이브 스모크~~ 완주**(2026-07-19 — node-vps-1 `kb` 실 원격 scp 왕복, 5 시나리오 전부 PASS + conv-hosts 매핑 `p_aadcd1e3dc9c5b5a → kb` 확정)). → ~~ⓑ hooks 보조 센서 스파이크~~(2026-07-19 `0b534a6` — **읽기-전용 기술 가능성 확인 완료**, COMPETITIVE §2.7 로드맵 5번: Claude Code hook으로 3상태(승인대기 `Notification`/`permission_prompt`·턴끝 `Stop`/`last_assistant_message`·시작 `UserPromptSubmit`)를 스크레이프 없이 감지 가능 → §5.2 ~5.3k 상한 우회, Loom 배선점 전부 기존재·최소 배선 5단계 문서화, relay/conv wire·MCP 무변경이라 경량 R{n}(PATCH~MINOR) 예상 · SSOT COMPETITIVE §2.5.2, 산출물 `docs/spikes/HOOKS-SENSOR-SPIKE.md`. **스파이크는 읽기만이라 종료 — 실제 PATCH는 이득 empirical 입증(dogfood 조기 done·승인 미탐지 감소) 후 경량 R{n} 게이트**). **다음 최전선 = 노드 부팅 생존 상시화(순수 ops·R{n} 불요) — 프로브 완료(2026-07-19 읽기-전용, 미적용), 아래 경로 확정, 다음 세션은 프로브 재실행 없이 바로 적용(오너 `!`)**. 현재 두 노드 online(kb: herdr 541142·bridge 541727 uptime 1일14h / node-wsl-1: herdr 2628·6391·bridge 4592, WSL systemd=true) — 재부팅 후 재기동만 미보장. **node-vps-1 (kb)** = **`@reboot` crontab 2줄**(sudo·linger 불필요, cron·tailscaled enabled 확인 — 1줄 herdr, 1줄 `sleep 8`+`cd $HOME/.loom-src && bridge start`, cron은 `.bashrc` 미소싱이라 PATH 인라인 필수); `systemd --user`+linger 대안은 linger 없으면 미로그인 재부팅 시 `/run/user/1000` 소멸로 무력이라 비권장 · ⚠ `id`상 zerocode가 sudo 그룹 멤버(브리핑 "sudo 불가"와 불일치, 오너 확인 — 권장안은 sudo 무관 성립). **node-wsl-1** = **WSL systemd system service 2개(`loom-herdr.service`·`loom-bridge.service` `WorkingDirectory=/root/.loom-src` `After=`·`Restart=always` → `systemctl enable --now`) + Windows LogonTrigger Task(`wsl.exe -d Ubuntu -e true`로 distro 부팅→systemd 기동, 1단 대안 base64 `wsl -e bash -c`)** — 결정적 발견: 기존 Windows Task `\LoomRelayTeam`은 relay 전용이라 WSL herdr/bridge 미커버 → **WSL 노드 재부팅 생존 현재 0**. **적용 블로커**: crontab·systemd unit·Windows Task 등록은 원격 쓰기라 분류기 차단 → 오너 `!` 직접(lessons platform (15)⑤·(16)). **cheat-sheet 정정**: bridge 실체는 `bun run …/bridge-main.ts` — `pgrep -f "bridge start"` 대신 `pgrep -f "bridge-main"`. 트랙 내 잔여 **SSH/git 전송 자동화 유예분**: ⓑ 브릿지 자동 git push(R26:431 유예 — fetch와 달리 미도입). 참고: SSH를 herdr **제어 전송**으로 쓰는 안(배치 (b))은 기각 확정(장기 이벤트 스트림 취약) — 유예분은 **artifact 전송 자동화**에 한정. **후속 후보**: orphan durable 룸 정리(U1·R39 L-1)·create 개별 catch(R39 L-2)·룸 스냅샷 GC(D7) · **노드 부팅 생존 상시화**: WSL bridge/herdr(setsid는 세션 독립일 뿐 재부팅 미보장 — WSL systemd/Windows Task) + kb VPS(non-root라 `systemd --user` 후보 — WSL과 병렬, R{n} 불요 ops) · card summary가 워커 하단 상태줄(`⏸ manual mode on …`)을 잡는 스크레이프 개선(표시 아티팩트·output/마커 무오염, WSL·VPS 동형 재현)·WSL non-root 사용자 전환(선택 — skip-permissions 재개방용). **프로덕션 단계 기준**: 신규 표면은 §5.1 게이트 보수 관례 유지 + 팀 실사용(6인) 안정성이 완료 기준.
> 1. **잔여 PATCH 후보**: ~~② done_proposal 탐지~~·~~③ conv.open deny 클레임~~·~~⑧ 브릿지 pane 배치~~(0.23.9 `201e2db`+`5f8bf12`) · ~~⑥ close 시 pane 정리~~·~~⑦ conv-hosts CLI~~(0.23.8 `93c6283`) · ~~④ agentKind 확장~~(0.23.2 `91bee75` 기해소 스테일) → **전부 해소**. 잔존: **claude 상태줄 chrome**(`Fable 5 ⚡high 🧠 │ …` — summary·보드 노트 유입 2회 실증, 콘텐츠-포함 줄이라 0.23.8 필터 미커버·grok 상태줄 해소 선례 동형) · summary 정보성 타이밍줄("Worked for Ns.") 개선 여지(Low) · 동시 디스패치 풀 탭 레이스(workerPool 인메모리 경합·무침입 유지라 무해·Low) · sleep형 페이로드 still-running 유예 상한 소진(pane 수동 정리·Low). (⑩ 조사 종결·⑪ 선택적 잔존 — 위 참조.)
> 1-b. **신규 후보**: ~~settle card 경로 이식~~(0.23.7 `1160b38`) · ~~dist 드리프트 가드~~(`eb05310`) · ~~카드 summary chrome 미커버 2종~~(0.23.8) → **해소**. 잔여: conv 턴 조기 회신(~7–10s) 관찰 지속 · summary 정보성 타이밍줄("Worked for Ns.") 개선 여지(Low, 결함 아님).
> 2-b. **경쟁 분석발 후보(`docs/COMPETITIVE_NOTES.md` §1.3)**: ~~B bunx 온보딩~~ · ~~C 이미지 README~~ → **완료(2026-07-19 카드 웨이브)**. 잔여: A `scripts/pane-inject.sh`(수동 pane 레인 read-guard 원자화, R-gate 불요) · npm publish는 오너 결정(0-a).
> 3. **관찰 ⓔ (Low)**: codex pane 카드는 승인 프롬프트 대기 중 herdr가 `blocked`를 방출 → 브릿지가 `failed reason=agent_blocked`를 회신하지만 **작업 자체는 승인 후 완료**됨(0.23.4·0.23.5 자문 카드 2회 실증). codex 무인 운용은 오퍼레이터 argv 자율 플래그 결정 선행(lessons (5)).
>
> ### 실측 제약·교훈 (재확인 금지 — 상세 `tasks/lessons.md` 2026-07-18)
> - herdr dispatch allowlist = `claude`만 (`card-contract.ts:19`). codex/grok은 headless 레인(grok-implementer 서브에이전트)으로 위임 — 오너 승인된 방식.
> - M-1 allowlist엔 **전체 peer ID** (`loom peers` 표시값은 잘린 ID).
> - 브릿지 주입은 워커 TUI 스타트업 레이스에 질 수 있음 — composer 비면 `herdr agent send` 리터럴 재주입 + 별도 Enter로 수동 복구 (0.23.0 후속 개선 후보).
> - 워커 pane 정리는 **card.done 수신 후** (조기 close 시 브릿지 스크레이프 회신 유실 — R25에서 실증). → **0.23.8부터 확신-done·conv close는 브릿지가 자동 close**(`paneCleanup:"auto"`) — 수동 정리는 failed·exhausted·구-브릿지 카드 pane만.
> - `bun test`는 셸에 `LOOM_RELAY_TOKEN`/`LOOM_RELAY_URL`이 있으면 relay 테스트가 깨짐 — `env -u LOOM_RELAY_TOKEN -u LOOM_RELAY_URL bun test`.
>
> ### 하지 말 것
> - R25 결정·CONV_SPEC 재론 — plan_review R24·R25 본문이 SSOT
> - artifact 패키징 등 후속 PATCH를 리뷰 게이트 없이 착수 (M-lock 인접이면 R{n} 필요 여부 WORKFLOW §5.1 확인)

---

## One-line resume

> **🎯 노드 부팅 생존 상시화 완주 (2026-07-20 — 순수 ops·R{n} 불요).** kb = `@reboot` crontab 2줄 · node-wsl-1 = WSL systemd service 2개(`Restart=always`) `enabled` + Windows `LoomWslBoot` LogonTrigger Task. 적용 전부 오너 `!` 직접(지속성 메커니즘 분류기 차단). **함정 해소 = systemd HOME 미상속** → herdr 소켓 `/tmp/herdr/` 폴백·bridge `/root/.config/herdr/` 기대 불일치 crash-loop → 두 unit drop-in `Environment=HOME=/root` 주입으로 bridge PID 14019 정상 기동(lessons platform (17)). 잔여 = 실제 재부팅 실증(§C, 선택). 산출물 `.loom-boot-persist-pack.md`(✅ 적용 완료). **직전 완주 = 0-c ⓐ artifact fetch 자동 실행 (코드+게이트, 2026-07-19).** v0.25.0 신규 MCP 툴 `conv_fetch(convId, seq, index)` — R26 "제시까지" 유예 해제, R40 `approved`(M-A~M-D 락 반영). scp-only·셸 미경유 argv 직접 spawn·실행 직전 host/path 재검증 fail-closed·post-fetch sha256 격리. 구현 `b343ada`(9파일 +1265, `conv-artifact-fetch.ts`+test) · 신규 유닛 25/0·verify-0250 락 대조 12/12·아키텍트 독립 전체 538/0·typecheck 6/6·U2 OpenSSH 10.2 scp `--` 지원→argv(L-3). **dist `3e77409` 커밋·push 완료(분류기 차단 → 오너 `!` 해소). 잔여 2건 전부 해소: ① D10 라이브 스모크 완주(node-vps-1 `kb` 실 원격 scp 왕복, 5 시나리오 PASS — happy-path 회수·D5 덮어쓰기 거부·매핑 부재 fail-closed·M-B 오염 host 차단·D6 sha 격리) ② conv-hosts 매핑 `p_aadcd1e3dc9c5b5a → kb` 확정.** 최전선 = 노드 부팅 생존 상시화 — **프로브 완료·경로 확정(kb=`@reboot` crontab 2줄 / node-wsl-1=WSL systemd 서비스 2개+Windows LogonTrigger Task, 기존 `\LoomRelayTeam` Task는 relay 전용이라 WSL 재부팅 생존 현재 0), 다음 세션은 바로 적용(원격 쓰기라 오너 `!`)**. **직전 완주 = ⓑ hooks 보조 센서 스파이크**(읽기-전용, 2026-07-19 `0b534a6`): Claude Code hook으로 승인대기(`Notification`/`permission_prompt`)·턴끝(`Stop`/`last_assistant_message`)·시작(`UserPromptSubmit`) 3상태를 스크레이프 없이 감지 가능 확인 → §5.2 ~5.3k 스크레이프 상한 우회, Loom 배선점 전부 기존재(최소 배선 5단계 문서화), relay/conv wire·MCP 무변경이라 경량 R{n}(PATCH~MINOR) 예상 — 실제 PATCH는 이득 empirical 입증 후 게이트. SSOT = COMPETITIVE §2.5.2/§2.7 로드맵 5번, 산출물 `docs/spikes/HOOKS-SENSOR-SPIKE.md`. **그 앞 완주 = ④ `@node` 라우팅**(2026-07-19 밤):** 순수 ops 웨이브(제품 코드 무변경·R{n} 불요, ②③ 선례 승계) — `@node` 어드레싱은 이미 완비(`@displayName` 파싱·relay resolveTargets 단일-타깃 enqueue·M-1 allowlist+CARD_DISPATCH_LABEL 이중 게이트·L-2 assignee 대조)라 신규 표면 없음. 노드 3식(mac-node·node-wsl-1·node-vps-1)에 ROUTE 카드 3발 라이브: ROUTE-MAC task_be45eeb(loom-local) `[ROUTE-MAC-OK] node=mac-node head=7cc071b` / ROUTE-WSL task_8a4653a·ROUTE-VPS task_9e5419e(loom-dev 동시 발사) → **각 노드 자기 카드만 스폰**(스폰 사이클 정확 1개·타 카드 흔적 0, bridge stderr 실측)·card.done 3/3 회수·보드 done·pane 자동 정리·바인딩 local 원복. **신규 운용 지식**: `dispatchCard`=`loadSession()` active 바인딩 룸으로 나가므로 멀티룸 dispatch는 `loom relay use <name>` 전환 후 발사(새 bun 프로세스만 적용, sticky host 경고 무해)·회수도 바인딩별 인박스 / `loom bridge status`는 foreground bun 브릿지서 pidfile 미생성 false offline(프로세스 생존, `--profile`+직접 확인) / 원격 WSL 명령은 base64 래핑 / VPS stat = UTC. **최전선 = 0-c 유예분 ⓐ artifact fetch 자동 실행 도입**(R26 M-1/M-2 High 승격 → R{n} 재리뷰 필수, plan_review R26:435). 병렬 ops 후보: 노드 부팅 생존 상시화(WSL systemd/Task + kb `systemd --user`)·summary 하단 상태줄 스크레이프(표시 아티팩트, wsl/vps 동형). npm publish는 오너 계정 대기(0-a).

---

## Where we are

| Item | Value |
|------|--------|
| **CLI / code** | **0.25.0** — **conv artifact fetch 자동 실행** 신규 MCP 툴 `conv_fetch(convId, seq, index)`(scp transport만·셸 미경유 argv 직접 spawn·실행 직전 host/path 재검증 fail-closed·post-fetch sha256 격리, 0.25.0 `b343ada`+dist `3e77409`) + Windows persist 경로 가드 `sep` 교정(POSIX `"/"` 하드코딩 → Windows 스냅샷 쓰기 전면 거부의 근인 제거·0.14.x 잠복) + relay 메시지 핸들러 uncaught 크래시 가드(`server.ts:176` try/catch, msg type·peerId 로그, `59bfeae`+dist `6aaf54f`) + `loom relay` 포그라운드 durable `RoomRegistry` 배선(룸/초대코드/멤버십 재시작 보존·D6 헬퍼 `resolveRegistryOptionsFromEnv`·D2 SIGTERM 락 해제·D11 `State: durable\|ephemeral` 로그, 0.24.1 `71ace35`) + 단독 모드 기능화(relay별 신원 병존 `relays`·`relay use <name>`·`--as` 멱등·이종-relay 파괴 가드·`relay list`·`relay local start\|stop\|status`, 0.24.0 `b508a4c`) + claude 상태줄 chrome 필터·summary 실내용 선별·스폰 직렬화·still-running supersession(0.23.11) + pane-inject.sh + 워커 풀 탭 수평 배치(0.23.10) + done_proposal 규약 완결·conv.open deny 정합·풀 탭 배치(0.23.9) + pane 정리 정책·conv-hosts CLI(0.23.8) + still-running 유예(0.23.7) + 스크레이프 delta화·chrome 필터(0.23.6) + 주입 verify 3분기(0.23.5) + conv 멀티턴 + artifact 트리거 + agentKind 3종 |
| **PLAN** | **v0.25.0** `approved` (R40 정식 리뷰·author-close 아님, M-A~M-D 락 반영 + L-1..L-3) → **implemented** (`b343ada` + dist `3e77409`) · verify-0250 opus 독립 락 대조 12/12 PASS · **D10 라이브 스모크 완주**(node-vps-1 `kb` 실 원격 scp 왕복, 5 시나리오 전부 PASS). 직전: **v0.24.2** `approved` (R39 author-close, no R39b) → **implemented** (`59bfeae` + dist `6aaf54f`) · **Windows 라이브 실증 완결**(재로그온 룸 유지 확정·loom-dev LOOM-GT4B 7 peers 재수립) |
| **Open blocking** | none — R24–R40 모두 closed · GitHub Issues 전부 closed |
| **Tests** | 전체 스위트 **538 pass / 0 fail**(아키텍트 독립 실행 — v0.25.0 `conv_fetch` 신규 유닛 25 포함) · 6 pkg typecheck green |
| **Herdr design** | `docs/HERDR_DESIGN.md` · **Conv spec: `docs/CONV_SPEC.md`** |
| **Nodes** | mac-node(tower·local) · **Windows relay**(durable, Tailscale `100.65.103.113:7842`, 재로그온 룸 유지) · **WSL node-wsl-1**(`p_de58fbe9f67451a1`, Ubuntu 26.04, **부팅 생존 상시화 — systemd `loom-herdr`·`loom-bridge` `Restart=always`+`enabled`, bridge pid 14019, Windows `LoomWslBoot` Task**) · **VPS node-vps-1**(`p_aadcd1e3dc9c5b5a`, Tailscale `kb` 100.116.39.101, Ubuntu 24.04.4·non-root·sudo 불가, **부팅 생존 상시화 — `@reboot` crontab 2줄**, bridge online pid 541727/setsid) — 팀 룸 loom-dev 초대 `LOOM-GT4B` |
| **Boot persist** | **양 노드 상시화 완료(2026-07-20)** — kb `@reboot` crontab 2줄 · node-wsl-1 systemd 2 unit(drop-in `HOME=/root`)+Windows LogonTrigger Task. 함정 = systemd HOME 미상속 → herdr 소켓 경로 불일치 crash-loop(lessons platform (17)). 실제 재부팅 실증(§C)만 선택 잔여. 팩 `.loom-boot-persist-pack.md` |
| **Remote** | `origin/main` **`0b534a6`** — 전부 푸시·동기 완료(v0.25.0 소스 `b343ada` + dist `3e77409` + D10 완주 docs `6af5760` + **hooks 스파이크 docs `0b534a6`**, HEAD=origin/main). **⚠️ 이 HANDOFF 편집 커밋(이 세션분)만 새 미푸시가 됨** — 아키텍트 검수 후 커밋·푸시 · 시연 `docs/spikes/DISPATCH-DEMO.md` |
| **Spikes** | **hooks 보조 센서**(`0b534a6`, `docs/spikes/HOOKS-SENSOR-SPIKE.md`) — 읽기-전용 기술 가능성 확인 완료(3상태 스크레이프-없이 감지·최소 배선 5단계·경량 R{n} 예상), COMPETITIVE §2.7 로드맵 5번 · 직전: DISPATCH-DEMO · STEP0/0.5 |
| **Untracked (커밋 제외)** | `.playwright-mcp/` · `docs/agents/` (mattpocock-skills 셋업분) · `docs/ANALYSIS_NOTES_2026-07-19.md` (오너 병렬 세션 작업 파일) — 커밋 여부 오너 판단 |

### Access cheat-sheet

```bash
# Mac → Windows
ssh -i ~/.ssh/id_ed25519_loom_windows 34970@100.65.103.113

# Windows → Mac (status/파일 — 카드캡처·Taildrop 불가 확정)
ssh -i ~/.ssh/id_mac_auto kyoungsiklee@100.69.230.114

# Bridge (node with herdr) — config 직접 작성 후 bare start
#   `--allow`는 loadBridgeConfig→saveBridgeConfig로 herdrSocketPath를 config에 재주입(env-우선 트랩)
#   → authorizedDispatchers를 config(~/.loom/bridge/<profile>.json)에 미리 넣고 bare `bridge start`.
loom --profile node-wsl-1 bridge start
loom bridge status && loom bridge stop

# WSL 노드 재기동 (SSH 세션 독립 — setsid 필수, /usr/local/bin 심링크 전제)
setsid nohup herdr server >/tmp/herdr.log 2>&1 &
setsid nohup loom --profile node-wsl-1 bridge start >/tmp/loom-bridge.log 2>&1 &

# VPS 노드 (kb, non-root zerocode·sudo 불가 — PATH는 ~/.bashrc 가드 앞 블록으로 해결)
ssh kb    # Tailscale 100.116.39.101, Ubuntu 24.04.4
# 재기동 (bridge 기동은 소스 리포 cwd 필수 — bridge-main.ts 해석)
setsid nohup herdr server >/tmp/herdr.log 2>&1 &
cd ~/.loom-src && setsid nohup loom --profile node-vps-1 bridge start >/tmp/loom-bridge.log 2>&1 &

# 프로세스 생존 확인 — bridge 실체는 `bun run …/bridge-main.ts`
#   `pgrep -f "bridge start"`는 실체를 못 잡음 → `pgrep -f "bridge-main"` 또는 `pgrep -f "bun run"`

# herdr
herdr status   # LOOM_HERDR_SOCKET overrides socket path (tests/fake)
```

### Already shipped / done (don't redo)

| Area | Version / note |
|------|----------------|
| Durable inbox … doctor · PTY inject | 0.14–0.21.1 |
| **loom bridge (Herdr)** | **0.22.0** · PLAN R23 · live herdr smoke |
| Step 0 / 0.5 spikes | done 2026-07-17 |
| dispatch 시연 §3-2 + bun.lock 완수 | M-4 거부 실증 · `1811aa9` 3곳 정렬 |
| **멀티턴 대화 1단계 스펙 차팅** | **wayfinder 맵 #1 완주 · `docs/CONV_SPEC.md`** |

### 실증 확정 사실 (재시도 금지)

- **카드 상태-회신 = 짧은 요약만 신뢰** (~35s 왕복). raw/긴 출력은 pane 스크레이프 붕괴 → 스펙 §5가 이를 32k 임계 + artifact ref로 프로토콜화함.
- **Mac↔Windows Taildrop 불가**(양방향, 샌드박스+버전 스큐) → SSH/scp가 정답.

### Naming
**Loom** = product · **Fable 5** = review agent

---

## Strategic context

> Loom = 오너 6인 팀 내부 도구.  
> **⭐ MVP 종료 선언 (오너, 2026-07-19): "mvp는 여기서 종료 프로덕션으로 전환."** 0.22.0 브릿지 + conv 멀티턴 + 0.23.x 운영 품질 웨이브(R23–R35)까지가 MVP. 이후 작업은 **프로덕션 단계** 기준으로 판단한다.  
> **다음 제품 트랙 = 멀티노드 단계 3 (오너 확정 2026-07-19: "다음 트랙에서 진행")** — 아키텍처 권고 §06 잔여 단계: **⓪ 단독 모드 기능화(relay 모드 전환 CLI + relay별 신원 병존 — 오너 결정 2026-07-19)** → 기능으로 Windows relay 복귀 → WSL/Linux 노드 브릿지 복제 → `@node` 라우팅 → SSH/git 전송 자동화 유예분 점진 도입(fetch 자동 실행은 R{n} 재리뷰 필수 — 다음 액션 0-c). **멀티노드 out of scope 해제.**  
> 순서: 멀티노드 트랙 진행 중 — ⓪ 단독 모드·① Windows relay 복귀·①-b relay 룸 영속화·② WSL 노드 브릿지 복제·③ Linux/VPS 노드 브릿지 복제·④ `@node` 라우팅 운용·ⓐ artifact fetch 자동 실행 도입(v0.25.0 `conv_fetch` R40 approved+구현 `b343ada`+D10 라이브 스모크 완주) 완주, **다음 = 노드 부팅 생존 상시화(WSL systemd/Task + kb `systemd --user`)**.  
> 공용 relay = **Windows durable relay 상시(Tailscale `100.65.103.113:7842`, 재로그온 룸 유지)** + 로스터 7종 win 바인딩 + **WSL 노드(node-wsl-1) + VPS 노드(node-vps-1) 합류**. 온보딩 = `docs/DRY_RUN_RUNBOOK.md`.  
> 저널·supervision은 여전히 out of scope. wire 변경은 CONV_SPEC 승인 범위 내에서만.
