# HANDOFF — Windows (`DESKTOP-LG99QSS`)

> **다음 세션용.** Step 0은 **완료(go)**. 이 파일은 Windows 쪽 사실·접속·정리만 담는다.  
> 제품 다음 게이트(PLAN 0.22.0)는 Mac [`HANDOFF.md`](./HANDOFF.md) 참고.

| | |
|--|--|
| **Date** | 2026-07-17 (EOD) |
| **Repo** | https://github.com/lemonbalms/Loom (`main`) |
| **Windows host** | `DESKTOP-LG99QSS` · Tailscale `100.65.103.113` · user **`34970`** (Administrators) |
| **Mac peer** | `kyoungsik` · `100.69.230.114` · key `~/.ssh/id_ed25519_loom_windows` |
| **Step 0** | **go** — 상세 [`docs/spikes/STEP0-WINDOWS-RESULT.md`](./docs/spikes/STEP0-WINDOWS-RESULT.md) · [`STEP0-MAC-CONTINUATION.md`](./docs/spikes/STEP0-MAC-CONTINUATION.md) |
| **다음 제품 작업** | Mac 쪽 PLAN 0.22.0 (FREEZE 예외 후). **Windows에서 브릿지 코드 치지 말 것.** |

---

## 0) git으로 최신 보기

```powershell
cd E:\projects\Loom   # 또는 clone 경로
git pull --ff-only origin main
# 이 파일 + HANDOFF.md + docs/spikes/STEP0-*.md
```

---

## 1) Step 0 결과 요약 (다시 측정 불필요)

| 항목 | 결과 |
|------|------|
| OpenSSH | Running · Automatic |
| Mac 키 | `C:\ProgramData\ssh\administrators_authorized_keys` |
| Ubuntu WSL | 설치됨 · NAT `172.27.80.1` = host vEthernet (WSL) |
| loom | v0.21.1 · `C:\Users\34970\.bun\bin\loom.exe` |
| 방화벽 7842 | Allow |
| WSL health | `curl http://172.27.80.1:7842/health` → version 1 |
| join | `LOOM-D3FT` · tower + wslnode |
| mirrored | **Win10이라 무시됨** — localhost 공유 없음 |

Mac SSH:

```bash
ssh -i ~/.ssh/id_ed25519_loom_windows 34970@100.65.103.113
```

---

## 2) 다음 세션에서 Windows가 할 수 있는 것 (선택)

제품 게이트는 Mac PLAN/R23. Windows는 **인프라 유지**만.

| 우선 | 작업 |
|------|------|
| 선택 | Scheduled Task `LoomRelayStep0` 정리(안 쓰면 중지/삭제) 또는 상시 relay 운영 문서로 고정 |
| 선택 | WSL에 herdr 설치 후 `docs/spikes/STEP0.5-HERDR.md` 매트릭스 재확인 |
| 선택 | Mac Tailscale → `:7842` 방화벽/바인딩 점검 (Step 0 필수 아님) |
| 금지 | `loom bridge` 구현 · FREEZE 예외 없이 PLAN 코드 |

relay 재기동 참고 (상시):

```powershell
# 일회 Start-Process는 SSH 종료 시 죽을 수 있음 → Scheduled Task 권장
# 작업 스케줄러 이름 예: LoomRelayStep0
# loom relay --host 0.0.0.0 --port 7842 --token <secret>
```

WSL 노드 attach URL 패턴:

```text
ws://172.27.80.1:7842/ws
# IP는 `ip route` default gateway로 확인 (재부팅 후 바뀔 수 있음)
```

---

## 3) Mac 공개키 (재등록 필요 시)

```
ssh-ed25519 AAAAC3NzaC1lZDI1NTE5AAAAIC8tV+XLiEuWg06S2Wi072aShc8ppd9i7w97yiLV7xtZ loom-windows-kyoungsiklee@KYOUNGSIKui-noteubug
```

관리자 계정 → `C:\ProgramData\ssh\administrators_authorized_keys` + ACL SYSTEM/Administrators only.

---

## 4) 관련 문서

| 문서 | 용도 |
|------|------|
| [`HANDOFF.md`](./HANDOFF.md) | **다음 세션 메인** — PLAN 0.22.0 순서 |
| [`docs/HERDR_DESIGN.md`](./docs/HERDR_DESIGN.md) | 브릿지 설계 |
| [`docs/spikes/STEP0.5-HERDR.md`](./docs/spikes/STEP0.5-HERDR.md) | herdr 실측 |
| [`docs/spikes/fixtures/herdr-v0.7.4/`](./docs/spikes/fixtures/herdr-v0.7.4/) | fake herdr fixtures |

---

**한 줄:** Windows Step 0 끝. `git pull` → 이상 없으면 대기. 다음 코딩 게이트는 Mac `HANDOFF.md`의 PLAN 0.22.0.
