# Loom 팀 온보딩 런북 (내부 도구 배포)

> **목적:** 오너의 **6인 팀**을 Loom에 온보딩해, 실제 워크플로에서 **오프라인-세이프 핸드오프가 매일 왕복**하게 만든다.
> 이건 시장 수요 실험이 **아니다** — 효용은 확정된 전제(내부 도구, 팀에 꼭 필요한 기능)다. 목적은 **채택(adoption)**이다.
>
> **"완성"의 정의(Fable 5, 2026-07-11):** 팀 6인 온보딩 + relay 상시가동(재시작 내구 = 0.14.x 확보) + 실제 핸드오프가 매일 왕복하며 팀이 기존 채널(Slack 등)로 회귀하지 않는 상태 **1~2주 지속.** 버전 리스트 소진이 아니다.
>
> **네트워크:** 원격(다른 네트워크/지역) → relay는 도달 가능한 공용 호스트에 배포.
> **개발 규칙(FREEZE, 근거 교체판):** 신규 기능은 **팀 실사용에서 pull된 요구만** 구현. 에이전트 추측(push) 금지. 백로그(work-watch·MCP·C1/C2)는 팀이 요구하기 전엔 열지 않는다.

---

## 선행 상태

- [x] 5분 설치(`scripts/install.sh`, macOS/Linux) · self-contained invite blob · `loom doctor` — 완비
- [x] relay 재시작 내구(0.14.x) · 배관 검증(Docker/LAN 하네스)
- [x] **Windows 온보딩 경로 = WSL 안내** (Step 2 참조). `install.sh`는 bash 전용 → Windows 팀원은 WSL(Ubuntu) 안에서 동일 2줄 실행. docs-only(이미 R20 리뷰된 install.sh 재사용, 코드 추가 없음).
- [ ] **⚠️ 공용 relay 호스트(VPS) — 미확보.** 오너 확보 대기(외부 의존).

---

## Step 0 — 공용 호스트에 relay 상시 배포 ⚠️ 오너 전용 (호스트 확보 후)

도달 가능한 호스트(VPS/팀 공용 서버)에 relay를 **상시** 기동한다. 팀 전원이 붙을 단일 relay다.

```bash
# (호스트에서) Loom 설치
curl -fsSL https://raw.githubusercontent.com/lemonbalms/Loom/main/scripts/install.sh | bash
exec $SHELL

# 공유 토큰 생성 (팀 전원이 공유하는 서버 토큰)
export LOOM_RELAY_TOKEN=$(openssl rand -hex 24)
echo "TOKEN=$LOOM_RELAY_TOKEN"   # ← 안전하게 보관
```

**상시가동 (프로세스가 죽어도 자동 부활 — 택 1):**

```bash
# systemd (Linux VPS 권장)
sudo tee /etc/systemd/system/loom-relay.service >/dev/null <<EOF
[Unit]
Description=Loom relay
After=network.target
[Service]
ExecStart=%h/.bun/bin/loom relay --host 0.0.0.0 --port 7842 --token ${LOOM_RELAY_TOKEN}
Restart=always
Environment=LOOM_RELAY_STATE_DIR=%h/.loom/relay-state
[Install]
WantedBy=default.target
EOF
systemctl --user enable --now loom-relay   # 또는 시스템 유닛으로

# launchd (macOS 호스트) 또는 임시: nohup loom relay --host 0.0.0.0 --port 7842 --token "$LOOM_RELAY_TOKEN" &>~/loom-relay.log &
```

- 방화벽/보안그룹에서 **7842/tcp** 인바운드 허용.
- **도달성 확인:** `curl http://HOST:7842/health` → `{"ok":true,...,"auth":true}`.
- **TLS(권장):** Caddy/nginx로 `wss://relay.example.com/ws → ws://127.0.0.1:7842/ws` 종단.
- `RELAY_URL` = TLS면 `wss://relay.example.com`, 아니면 `ws://HOST_IP:7842`.

---

## Step 1 — 오너(머신 A): 팀 방 생성 + 팀원별 invite blob

```bash
export LOOM_RELAY_URL=ws://HOST_IP:7842        # 또는 wss://relay.example.com
export LOOM_RELAY_TOKEN=<Step0의 TOKEN>

loom --profile owner room create --name team --as owner
loom --profile owner room invite --link          # ← loom://join/... blob 출력
```

- 출력된 **`loom://join/...` blob**을 각 팀원에게 전달(같은 방이면 같은 blob 재사용 가능).
- blob에 relay URL·token·invite code가 모두 들어있어 **팀원은 이 한 줄만 있으면 join.**
- ⚠️ blob은 bearer secret — 신뢰하는 팀원 채널로만.

---

## Step 2 — 각 팀원(머신 B…F): 설치 + join

**macOS/Linux 팀원 — 딱 2줄:**

```bash
curl -fsSL https://raw.githubusercontent.com/lemonbalms/Loom/main/scripts/install.sh | bash
exec $SHELL
loom room join "loom://join/<받은-blob>"
```

**Windows 팀원 — WSL 경로** (팀에 Windows 사용자 있음 → 이 경로가 온보딩 표준):

1. **관리자 PowerShell**에서 WSL 설치 후 재부팅:
   ```powershell
   wsl --install
   ```
   - Win10 2004+(Build 19041+) / Win11 필요. 그 이하면 → [수동 설치](https://learn.microsoft.com/windows/wsl/install-manual).
   - `wsl --install`이 도움말만 뜨면(이미 부분 설치됨): `wsl --list --online` → `wsl --install -d Ubuntu`.
   - 0.0%에서 멈추면: `wsl --install --web-download`.
   - 기본 배포판 = Ubuntu. 재부팅 후 Ubuntu가 열리며 사용자명·비밀번호 1회 설정.
2. 재부팅 후 **Ubuntu 터미널**에서 macOS/Linux와 동일한 2줄 실행:
   ```bash
   curl -fsSL https://raw.githubusercontent.com/lemonbalms/Loom/main/scripts/install.sh | bash
   exec $SHELL
   loom room join "loom://join/<받은-blob>"
   ```
   - relay는 원격(VPS)이므로 WSL2의 아웃바운드 `ws://`만 있으면 됨 — 추가 네트워크 설정 불필요.
   - 막히면 Ubuntu에서 `loom doctor` → `fail` 섹션 스크린샷.
   - 전제: BIOS 가상화 활성(대개 기본 on). `wsl --install` 실패 시 첫 의심 지점.

- 막히면 `loom doctor` → `fail` 섹션 스크린샷으로 오너에게.
- 온보딩 후 팀원 host는 기본 자동 기동(0.17) → 창 닫아도 online.

---

## Step 3 — 실사용 루프 (핵심 가치 = 오프라인 핸드오프)

팀이 매일 이걸 하면 채택이다.

```bash
# 보내는 사람: 상대가 오프라인이어도 전송
loom --profile owner handoff @teammate "이 작업 넘김 — 오프라인이어도 인박스에 남음"

# 받는 사람: 접속해서 수령
loom work            # 또는 loom inbox → 유실 없이 도착
```

- 팀 전원 host 상시 online + 매일 핸드오프 왕복 = "완성" 상태 진입.

---

## Step 4 — 채택 관측 (1~2주)

| 항목 | 값 |
|------|-----|
| **온보딩 완료 인원** | ____ / 6 (macOS·Linux ____, Windows ____ ⚠️경로 대기) |
| **온보딩 마찰** | 팀원별 막힌 지점 (설치·join·relay·`doctor` 유용성) |
| **매일 핸드오프 왕복?** | 예/아니오 — 일평균 ____건 |
| **Slack 등으로 회귀?** | 예(어떤 상황) / 아니오 |
| **보드 불일치 체감?** | 머신마다 보드가 갈라져(`task-board.ts`는 로컬 파일, relay 미동기) 혼란·중복작업을 겪었는가 — 예(상황) / 아니오 |
| **chat 유실 아쉬움?** | 오프라인 동안의 chat이 사라져(relay는 handoff만 persist, chat 휘발) 아쉬웠는가 — 예(상황) / 아니오 |
| **팀이 pull한 신규 요구** | (여기서 나오는 것만 신규 PLAN 대상 — 에이전트 추측 금지) |

> 팀이 실제로 쓰기 시작하면 며칠 안에 진짜 요구가 pull된다. **그때 로드맵이 다시 열린다.** 그 전까지는 온보딩 경로 + relay 운영만이 정당한 투자다.
>
> **결정 리스크:** 첫 온보딩 날 팀원이 진짜 결함(Windows 미지원·relay 다운)에 부딪히면 첫인상이 죽고 채택 무산 → 추측 기능이 아니라 온보딩 경로와 relay 운영이 배포 전 유일한 정당 투자.
