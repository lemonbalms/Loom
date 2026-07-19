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

> **🎯 0-c ② WSL 노드 브릿지 복제 완주 (2026-07-19 저녁 — 순수 ops 웨이브, 제품 코드 무변경·R{n} 불요 판정) — WSL(Ubuntu 26.04) 두 번째 노드 브릿지 online, 스모크 4회 끝 클린 완주 `[SMOKE-WSL2D-OK] head=b4a8e63 loom=v0.24.2`.** **ops 판정 근거(증거 팩 2건 evidence-wsl2·probe-wsl2)**: 브릿지 코드가 플랫폼 중립(darwin/sep 하드코딩 부재)이고 §06 Step 3 = "동일 브릿지 복제"라 신규 표면 없음 → R{n} 불요. 핵심 단서 = 브릿지 데몬은 소스 `bridge-main.ts` 필요(bridge-spawn.ts)라 **dist 번들 불가·git clone 설치 필수**. **WSL 실측**: Ubuntu 26.04(x86_64, root), `.wslconfig` mirrored 잔존하나 **미실효(NAT 구동)** → relay 경로 = **Tailscale URL `ws://100.65.103.113:7842/ws`**(WSL에서 라이브 도달 실증 — NAT 게이트웨이 IP는 재부팅 변동이라 기각). **셋업**: bun 1.3.14 · herdr 0.7.4(protocol 16) · loom v0.24.2(`git clone /mnt/e/projects/Loom ~/.loom-src` + bun install + bun link) · `/usr/local/bin` 심링크(bun·loom·claude·herdr — 비로그인 셸 PATH 해결) · claude CLI 2.1.215 + **Mac Keychain 자격증명 이전(오너 위임)** · room join LOOM-GT4B → **node-wsl-1 = `p_de58fbe9f67451a1`**(win 바인딩, loom-dev 8 peers) · bridge config 직접 작성(authorizedDispatchers=[p_45115c32d2c462f9], **`--allow` 미사용 — save-back이 herdrSocketPath 트랩 재주입**). **스모크 4회 경위**: 1차 = 배선 전구간 성공하나 **승인게이트 blocked**(agent_blocked — 관찰 ⓔ의 claude판, 수동 승인 1회로 실작업 완주 `[SMOKE-WSL2-OK]`) → 2·3차 = `--dangerously-skip-permissions` 시도 실패(**root에서 보안 거부·워커 즉사** → inject_unconfirmed) → **Option B′**(argv `["claude"]` 원복 + `/root/.claude.json` workspace 신뢰 + `/root/.claude/settings.json` user-레벨 allow 10종) → **4차 클린 완주**: 개입 0·승인 프롬프트 없음·card.done **done**·마커 `[SMOKE-WSL2D-OK] head=b4a8e63 loom=v0.24.2` 무오염·pane 자동 close. 워커 실구동 = Opus 4.8(Claude Max). **오너 협업 특기**: 분류기(고위험 리터럴·권한-확장 쓰기·전역 설치)가 에이전트 실행을 차단 → 오너 `!` 직접 실행 6회로 해소(설치 2·인증 이전 1·신뢰/allow 3). **Loom-레벨 승인과 Claude Code 분류기는 별개 레이어임이 실증**. **최종 상태**: WSL bridge online pid 4592(setsid — SSH 세션 독립)·herdr server 생존·tower local 복원·보드 스모크 태스크 4건 전부 done(1~3차 아티팩트 note 종결). **후속 후보 등재**: ① WSL bridge/herdr **부팅 생존 상시화**(setsid는 세션 독립일 뿐 재부팅 미보장 — WSL systemd 또는 Windows Task 경유) ② card summary가 워커 TUI 하단 상태줄(`⏸ manual mode on …`)을 잡는 스크레이프 개선(output·마커는 무오염, 표시 아티팩트) ③ WSL non-root 사용자 전환(선택 — skip-permissions 계열 재개방용). **다음 최전선 = 0-c ③ Linux/VPS 노드**(② 완주로 노드 복제 절차 확립 — WSL 절차 재사용).
>
> ### ✅ 후보 ⑩ 조사 종결 (2026-07-18 — 재조사 금지)
> §5.2 32k artifact 트리거 전제 재검토 종결. 워커 TUI 3종 스크레이프 상한 라이브 실측(claude ~5.3k·grok ~2.2k·codex ~1.4k — 소스·줄수 무관 포화). **결론**: 정답 경로 = **워커 직접 파일 쓰기**(§5.1로 이미 shipped·179KB 실증) / herdr 심층 스크롤백 = CLI 표면 부재 / 32k 임계 하향 = 접힌 스크레이프라 기각 → **§5.2 32k 분기는 방어적 잔존(삭제 아님)**. ⑪(capable 워커 benign 페이로드)은 §5.2 목적으론 무의미(선택적 잔존). 워커 모델별 거동·상세는 docs/HANDOFF_ARCHIVE.md.
>
> ### 다음 액션 (우선순위 순)
> 0. ~~⭐ 잔여 후보 일괄 적용 웨이브 (오너 지시)~~ → **완주(v0.23.11 `0ee8c50`+보정 3건 · ② `08d6091`) — 상세 docs/HANDOFF_ARCHIVE.md**.
> 0-a. **npm publish 보류 (오너 결정 2026-07-19: "계정이 없어 일단 보류 해")** — 진행분(재조사 금지): `loom` 선점·`loom-cli` npm 보안 홀드 확정 / **가용 = `loom-terminal`(무조건) · `@lemonbalms/loom`(계정·org가 lemonbalms일 때만)** / 오너 선택(보류 전) = `@lemonbalms/loom` + **UNLICENSED** / 타르볼 형태 검증 완료(dry-run 3파일 87.5kB — package.json + `dist/loom.js`(bun shebang, bunx 실행 전제) + README.md 자동 포함, 루트 devDependencies 미포함). **재개 절차**: ① 오너 npmjs.com 가입(계정명이 lemonbalms 아니면 org 생성 또는 `loom-terminal` 전환) → ② `! npm login` → ③ package.json 발행 메타 재적용(name·version 0.23.x 정합·license UNLICENSED·private 해제·`files:["dist/loom.js"]`·`publishConfig.access:public`·repository·engines.bun) → ④ `npm publish` → ⑤ `npm view`·`bunx` 검증 → ⑥ package.json은 발행 직후에도 **`private: true` 복원 여부 오너 확인**(현재는 원복해 가드 유지). |
> 0-b. ~~⭐ PLAN 0.23.12 웨이브(summary 타임스탬프 소거 + 풀 pane 균등 폭)~~ → **완주(v0.23.12 `d3afb55`, 474/0 — 상세 docs/HANDOFF_ARCHIVE.md)**. **잔존 후속 후보**: ① **위상-인지 균등화** — ⓑ의 L-2(i) 유일성 가드가 라이브 중첩-좌측 위상에서 발화(균등화 미적용·스폰 무영향), herdr 스폰 split 타깃 비제어(`pane_id` 무시, 0.23.9 실측)라 위상 가변이 구조적 → 트리 구조 판별 일반화 필요(직속 split = 최소-폭 포함 split + 서브트리 leaf-count 비율, 균등화 로직 변경이라 §5.1 게이트 판단) ② **sonnet 스모크 claude-mem 피드백 루프** — 거부 관찰이 저장→주입되어 후속 benign 스모크도 재거부(lessons (9)), 스모크 설계 대응 필요. 잔존 Low(등재만): claude TUI 말미 비콘텐츠 줄 추가 가족 표면화 시 개별 보정 대신 여기 등재(원칙 유지).
> 0-c. **⭐ 다음 제품 트랙 = 멀티노드 단계 3 (오너 확정 2026-07-19: "다음 트랙에서 진행" + MVP 종료·프로덕션 전환)** — Loom×Herdr 아키텍처 권고(`~/Downloads/loom-herdr-architecture.html`) §06 수직 슬라이스, 0~2 완료. **완결분(상세 docs/HANDOFF_ARCHIVE.md)**: ~~⓪ 단독 모드 기능화~~(v0.24.0 `b508a4c`+dist `2c513c9`) → ~~① Windows relay 복귀(D10)~~ → ~~①-b relay 룸 영속화~~(v0.24.1 `71ace35`+dist `b544429` — 영속화 체인 0.14.x 기구현·근인=`loom relay` 포그라운드 분기 durable 미배선의 **배선 갭 PATCH**) → ~~①-c Windows 재배포·실증~~(v0.24.2 `59bfeae`+dist `6aaf54f` — durable 첫 기동 결함 2건 **D1** persist 경로 가드 POSIX `"/"` 하드코딩 `sep` 교정·**D2** handleMessage uncaught 크래시 가드, **재로그온 룸 유지 확정**·loom-dev 재수립 초대 **LOOM-GT4B**·래퍼 리포 번들 직접 실행 전환) → ~~② WSL 노드 브릿지 복제~~(2026-07-19 저녁 — 순수 ops·R{n} 불요, WSL Ubuntu 26.04 두 번째 노드 브릿지 online·4차 클린 스모크 `[SMOKE-WSL2D-OK] head=b4a8e63`·상세 docs/HANDOFF_ARCHIVE.md). **미완(다음 최전선)**: **③ Linux/VPS 노드**(② 완주로 노드 복제 절차 확립 — WSL 절차 재사용) → **④ `@node` 라우팅 운용**. 트랙 내 **SSH/git 전송 자동화 유예분 점진 도입**: ⓐ artifact fetch 자동 실행(현행 "제시까지" — 도입 시 R26 M-1/M-2 High 승격이라 **R{n} 재리뷰 필수**, plan_review R26:435) ⓑ 브릿지 자동 git push(R26:431 유예). 참고: SSH를 herdr **제어 전송**으로 쓰는 안(배치 (b))은 기각 확정(장기 이벤트 스트림 취약) — 유예분은 **artifact 전송 자동화**에 한정. **후속 후보**: orphan durable 룸 정리(U1·R39 L-1)·create 개별 catch(R39 L-2)·룸 스냅샷 GC(D7) · **WSL 노드 3건**: bridge/herdr 부팅 생존 상시화(setsid는 세션 독립일 뿐 재부팅 미보장 — WSL systemd/Windows Task, R{n} 불요 ops)·card summary가 워커 하단 상태줄(`⏸ manual mode on …`)을 잡는 스크레이프 개선(표시 아티팩트·output/마커 무오염)·WSL non-root 사용자 전환(선택 — skip-permissions 재개방용). **프로덕션 단계 기준**: 신규 표면은 §5.1 게이트 보수 관례 유지 + 팀 실사용(6인) 안정성이 완료 기준.
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

> **🎯 0-c ② WSL 노드 브릿지 복제 완주 (오너 위임, 2026-07-19 저녁).** 순수 ops 웨이브(제품 코드 무변경·R{n} 불요) — WSL(Ubuntu 26.04, root) 두 번째 노드 브릿지 online. 증거 팩 2건으로 ops 판정(브릿지 코드 플랫폼 중립·§06 Step 3=동일 브릿지 복제, 데몬은 소스 `bridge-main.ts` 필요라 git clone 설치 필수) → 셋업(bun 1.3.14·herdr 0.7.4·loom v0.24.2 `git clone`+`bun link`·`/usr/local/bin` 심링크·claude 2.1.215+Keychain 이전·room join LOOM-GT4B node-wsl-1 `p_de58fbe9f67451a1`·bridge config 직접 작성 no `--allow`) → 스모크 4회(1차 승인게이트 blocked→수동 승인 완주 · 2·3차 root skip-permissions 보안거부·워커 즉사 · **Option B′** user-레벨 allow+workspace 신뢰 → **4차 클린 완주** `[SMOKE-WSL2D-OK] head=b4a8e63`, 개입 0·자동 close, 워커=Opus 4.8). 오너 `!` 직접 실행 6회로 분류기 차단 해소(Loom 승인과 Claude Code 분류기는 별개 레이어). WSL bridge online pid 4592(setsid — SSH 세션 독립). 후속 후보: ① 부팅 생존 상시화(setsid 재부팅 미보장) ② summary가 워커 하단 상태줄 스크레이프(표시 아티팩트) ③ non-root 전환(선택). **최전선 = 0-c ③ Linux/VPS 노드**(WSL 절차 재사용). npm publish는 오너 계정 대기(0-a).

---

## Where we are

| Item | Value |
|------|--------|
| **CLI / code** | **0.24.2** — Windows persist 경로 가드 `sep` 교정(POSIX `"/"` 하드코딩 → Windows 스냅샷 쓰기 전면 거부의 근인 제거·0.14.x 잠복) + relay 메시지 핸들러 uncaught 크래시 가드(`server.ts:176` try/catch, msg type·peerId 로그, `59bfeae`+dist `6aaf54f`) + `loom relay` 포그라운드 durable `RoomRegistry` 배선(룸/초대코드/멤버십 재시작 보존·D6 헬퍼 `resolveRegistryOptionsFromEnv`·D2 SIGTERM 락 해제·D11 `State: durable\|ephemeral` 로그, 0.24.1 `71ace35`) + 단독 모드 기능화(relay별 신원 병존 `relays`·`relay use <name>`·`--as` 멱등·이종-relay 파괴 가드·`relay list`·`relay local start\|stop\|status`, 0.24.0 `b508a4c`) + claude 상태줄 chrome 필터·summary 실내용 선별·스폰 직렬화·still-running supersession(0.23.11) + pane-inject.sh + 워커 풀 탭 수평 배치(0.23.10) + done_proposal 규약 완결·conv.open deny 정합·풀 탭 배치(0.23.9) + pane 정리 정책·conv-hosts CLI(0.23.8) + still-running 유예(0.23.7) + 스크레이프 delta화·chrome 필터(0.23.6) + 주입 verify 3분기(0.23.5) + conv 멀티턴 + artifact 트리거 + agentKind 3종 |
| **PLAN** | **v0.24.2** `approved` (R39 author-close, no R39b) → **implemented** (`59bfeae` + dist `6aaf54f`) · verify-0242 opus 독립 검증 7항목 전 PASS · **Windows 라이브 실증 완결**(재시작 후 LOOM-YS2Z join 성공 = 재로그온 룸 유지 확정·loom-dev LOOM-GT4B 7 peers 재수립). 직전: **v0.24.1** `approved`(R38)→implemented `71ace35` · SMOKE-0241 A~D PASS. **✅ Windows durable relay 배포·실증 완결(재배포 유예분 소멸 — 재로그온 룸 유지)** |
| **Open blocking** | none — R24–R39 모두 closed · GitHub Issues 전부 closed |
| **Tests** | relay 스위트 **52 pass / 0 fail** · 전체 스위트 **513 pass / 0 fail** · 6 pkg typecheck green(D1 containment 어서션 7종·D2 서버 생존 신규) |
| **Herdr design** | `docs/HERDR_DESIGN.md` · **Conv spec: `docs/CONV_SPEC.md`** |
| **Nodes** | mac-node(tower·local) · **Windows relay**(durable, Tailscale `100.65.103.113:7842`, 재로그온 룸 유지) · **WSL node-wsl-1**(`p_de58fbe9f67451a1`, Ubuntu 26.04, bridge online pid 4592/setsid) — 팀 룸 loom-dev 초대 `LOOM-GT4B` |
| **Remote** | `origin/main` **`6aaf54f`** (v0.24.2 구현 `59bfeae`+dist 푸시 완료) · docs 갱신 예정 · 시연 `docs/spikes/DISPATCH-DEMO.md` |
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
> 순서: 멀티노드 트랙 진행 중 — ⓪ 단독 모드·① Windows relay 복귀·①-b relay 룸 영속화·② WSL 노드 브릿지 복제 완주, **다음 = ③ Linux/VPS 노드**(WSL 절차 재사용) → ④ @node 라우팅.  
> 공용 relay = **Windows durable relay 상시(Tailscale `100.65.103.113:7842`, 재로그온 룸 유지)** + 로스터 7종 win 바인딩 + **WSL 노드(node-wsl-1) 합류**. 온보딩 = `docs/DRY_RUN_RUNBOOK.md`.  
> 저널·supervision은 여전히 out of scope. wire 변경은 CONV_SPEC 승인 범위 내에서만.
