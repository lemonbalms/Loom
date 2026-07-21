# Loom 역할·권한·프로필 통합 설계

| Field | Value |
|-------|-------|
| **Status** | candidate design — PLAN SSOT 아님 |
| **Date** | 2026-07-21 |
| **Target** | v0.27.0 G4 이후 독립 MINOR 후보 |
| **Review** | PLAN 승격 시 R{n} 필수 — 신원·권한·전역 설정 경계 변경 |
| **Related** | `AGENTS.md` · `docs/DOGFOOD_LOOP.md` · `docs/ADAPTERS.md` · `docs/spikes/RULE-ENFORCEABILITY.md` |

---

## 0. 결정 요약

Loom의 에이전트 실행은 앞으로 세 축을 따로 선택하지 않는다.

1. **누구인가** — agent: `grok | claude | codex`
2. **무슨 역할인가** — role: `arch | impl | rev`
3. **무엇을 할 수 있는가** — role permission policy

세 축은 하나의 canonical identity **`<agent>-<role>`** 로 결속한다.

```text
grok-arch    grok-impl    grok-rev
claude-arch  claude-impl  claude-rev
codex-arch   codex-impl   codex-rev
```

프로필 이름·display name·`LOOM_PROFILE`·board assignee·handoff target·로컬
에이전트 권한 프로필이 모두 같은 문자열을 사용한다. 역할을 바꾸려면 기존 터미널에서 설정만
바꾸지 않고 **새 profile/session으로 다시 실행**한다.

**핵심 불변식:**

> 한 프로세스의 Loom 신원과 로컬 실행 권한은 같은 canonical identity에서 유도된다.
> 둘이 다르면 에이전트 TUI를 띄우기 전에 fail-closed한다.

`fable-advisor`는 위 3×3 peer matrix에 넣지 않는다. 공식 R{n}의 read-only 자문자로서
`advisor` capability를 가지며 독립 Loom 작업 peer·board assignee가 아니다.

---

## 1. 문제 정의

### 1.1 현행은 역할과 권한이 분리돼 있다

현행 Loom roster의 역할 분리는 대체로 옳다.

- `grok-impl` / `claude-impl` / `codex-impl`: 구현 lane
- `claude-rev`: primary R{n}
- `codex-rev`: secondary/adversarial review
- `grok-rev`: reserve

하지만 Codex 로컬 권한 프로필은 `loom-design` / `loom-code`이고 Loom identity를 포함하지
않는다. 동시에 `~/.codex/config.toml`의 단일 managed MCP block은 현재
`LOOM_PROFILE=codex-rev`에 pinned돼 있다.

따라서 다음 조합이 가능하다.

```text
local permission profile = loom-code
Loom MCP identity        = codex-rev
```

이 프로세스는 구현 권한을 가졌지만 room에서는 reviewer로 보인다. 프롬프트가 역할을 올바르게
설명해도 실행 경계가 잘못됐으므로 구조적 오라우팅이다.

### 1.2 `--write-user-config`는 last-writer 상태를 만든다

`loom --profile X run codex --write-user-config`는 전역 `mcp_servers.loom` block을 X의
`LOOM_SESSION`/`LOOM_PROFILE`로 다시 쓴다. 이미 실행 중인 Codex는 자기 환경을 유지하지만,
**다음에 시작하는 Codex는 마지막 writer의 profile을 상속**한다. 그래서 현행 문서는 Codex
lane을 순차 기동하라고 요구한다.

순차 기동은 경합 확률을 낮추지만 다음을 불가능하게 만들지는 않는다.

- 다른 터미널이 중간에 `--write-user-config` 실행
- plain `codex`가 마지막 pinned identity로 기동
- permission profile만 바꾸고 Loom identity는 그대로인 실행
- 재시작 뒤 어떤 role이 전역에 남았는지 기억에 의존

### 1.3 이름 규약도 두 종류다

profile은 `claude-rev` / `codex-rev`인데 display name은 `claude-review` /
`codex-review`다. board assignee·handoff 주소·문서 표기가 profile과 다른 어휘를 사용한다.
이는 기능 결함은 아니지만 역할 확인을 문자열 번역에 의존시킨다.

### 1.4 `never + workspace-write`는 구현 mandate와 충돌한다

현행 Codex dogfood 명령은 `-a never -s workspace-write`다. 이 조합은 질문을 없애지만
workspace 경계 밖 작업을 자동 승인하지 않는다. `.git` 보호 경로·차단된 network가 필요하면
**실패를 모델에 반환**한다. 그런데 `codex-impl` mandate는 commit/push까지 포함한다.

따라서 구현자가 ship까지 맡는 계약과 현재 권한 preset은 일치하지 않는다.

---

## 2. 목표와 비목표

### 2.1 목표

1. agent·role·permission을 canonical identity 하나로 결속한다.
2. 같은 agent 제품의 `arch`/`impl`/`rev`가 동시에 실행돼도 identity drift가 없다.
3. 구현자와 리뷰어가 서로의 권한을 조용히 획득하지 못한다.
4. 모델 교체 시 역할 정책을 다시 설계하지 않고 adapter만 번역한다.
5. 전역 설정의 last-writer-wins session pin을 제거한다.
6. 기존 profile/session/room을 단계적으로 이전하고 즉시 파괴하지 않는다.
7. 문서 규칙의 고위험 부분을 실행 경로에서 fail-closed한다.

### 2.2 비목표

- OS 사용자 또는 컨테이너 수준의 적대적 격리
- peer role의 암호학적 인증을 한 번에 도입
- 기존 room wire protocol의 즉시 교체
- 모든 3×3 profile을 항상 online으로 유지
- agent 모델의 품질·우선순위 결정
- Fable 5를 일반 구현/review peer로 승격

**정직한 경계:** v1 역할 정보는 로컬 session/profile과 Loom 실행 경로가 강제하는
운영 권위다. relay가 서명한 보안 principal은 아니다. 원격 hostile peer까지 role ACL로
차단하려면 별도 protocol/relay PLAN이 필요하다.

---

## 3. Canonical identity와 roster

### 3.1 타입

```ts
type AgentProduct = "grok" | "claude" | "codex";
type AgentRole = "arch" | "impl" | "rev";
type CanonicalAgentIdentity = `${AgentProduct}-${AgentRole}`;
```

`advisor`는 peer role enum에 넣지 않고 별도 capability로 둔다.

### 3.2 이름 불변식

활성 profile P에 대해 아래가 모두 같아야 한다.

| Surface | Required value |
|---------|----------------|
| profile filename/key | `P = <agent>-<role>` |
| session `profile` | P |
| `displayName` | P |
| child `LOOM_PROFILE` | P |
| local permission profile | P |
| board assignee | P |
| handoff target | `@P` |
| run preflight agent adapter | `<agent>` |

`agentKind` 런타임 관측값도 `<agent>`와 같아야 한다. `unknown` 또는 불일치는 session을
자동 수정하지 않고 실행을 거부한다.

### 3.3 활성화 규칙

9개 이름은 **스키마**일 뿐 roster가 아니다. 실제 owner roster에 배정된 identity만 join하고
sticky host를 띄운다. 예를 들어 `grok-arch`가 미배정이면 이름 규약·policy template만 있고
session 파일이나 peer를 만들지 않는다.

초기 권장 roster:

| Identity | Default mandate | Activation |
|----------|-----------------|------------|
| `codex-arch` | 이 저장소의 설계·게이트·HANDOFF·독립 검증 | active candidate |
| `grok-impl` | 기본 구현 | active |
| `claude-impl` | 병렬 구현 | active |
| `codex-impl` | cross-vendor 구현 fallback | active |
| `claude-rev` | primary R{n} + fable-advisor consult | active |
| `codex-rev` | adversarial/security second pass | active |
| `grok-rev` | reserve | inactive |
| `grok-arch`, `claude-arch` | owner가 architect를 재배정할 때 | inactive |

---

## 4. 역할 계약

### 4.1 `*-arch`

**허용:**

- PLAN/설계/Unknowns/HANDOFF 작성
- gate 판단과 구현 lane 선택
- 코드·테스트 read/diagnose
- 워커 산출물 독립 검증
- 전체 suite 최종 provenance 확보

**금지:**

- 승인/락된 spec의 제품 코드 hand-code
- 자기 PLAN의 공식 R{n} verdict 작성
- implementer assignee로 board claim
- 불확실한 관측으로 destructive cleanup 또는 완료 확정

### 4.2 `*-impl`

**허용:**

- claim-first 후 PLAN draft/PATCH 적용
- 제품 코드·테스트·관련 docs 작성
- 관련 테스트 실행
- 검증 완료 뒤 source/dist 순서 commit/push
- `[R-REQUEST]`와 `[VERIFY]` handoff

**금지:**

- 다른 implementer가 `doing`인 같은 task 중복 claim
- 자기 작업의 공식 R{n} verdict
- reviewer/architect identity로 결과 전송
- 승인 범위 밖 spec 재설계

### 4.3 `*-rev`

**허용:**

- 코드·PLAN read
- security/race/fail-open/auth/data-loss 검토
- findings artifact/handoff 작성
- primary reviewer이면 R{n} 기록

**금지:**

- product implementation 또는 implementer task claim
- 자기가 구현한 diff의 독립 reviewer 역할
- owner 지시 없이 primary/secondary 경계 변경

### 4.4 `fable-advisor`

- Claude primary reviewer가 R{n} 전에 호출하는 read-only 자문
- 선택지·전제·commitment boundary 검증
- 파일 수정·board claim·commit/push·Loom peer identity 없음

---

## 5. 역할별 권한 정책

역할 정책이 SSOT이며 agent adapter는 이를 각 CLI 형식으로 번역한다.

| Capability | `arch` | `impl` | `rev` | `advisor` |
|------------|--------|--------|-------|-----------|
| repo read | allow | allow | allow | allow |
| workspace write | docs/gate 범위 | allow | review artifact 범위 | deny |
| product code write | deny | allow | deny | deny |
| test execution | allow | allow | allow | deny/default |
| network command | default deny | allow with policy | default deny | deny |
| board implement claim | deny | allow, claim-first | deny | deny |
| official R{n} | deny for own spec | deny | primary only | advice only |
| commit/push | docs wave only | allow after green | deny/default | deny |
| destructive action | human approval | human approval | deny | deny |

### 5.1 Codex translation

`arch`:

```toml
sandbox_mode = "workspace-write"
approval_policy = "on-request"
approvals_reviewer = "auto_review"
[sandbox_workspace_write]
network_access = false
```

`impl`:

```toml
sandbox_mode = "workspace-write"
approval_policy = "on-request"
approvals_reviewer = "auto_review"
[sandbox_workspace_write]
network_access = true
```

`rev`는 `workspace-write + auto_review`를 유지하되 role-aware write guard가 product path를
차단한다. `read-only + never`는 Loom handoff 같은 필요한 side effect도 실패시킬 수 있으므로
기본안으로 채택하지 않는다.

### 5.2 Claude/Grok translation

Claude와 Grok도 같은 역할 표를 사용한다. 각 adapter가 지원하는 permission flag·settings·hook으로
번역하되 다음을 보장해야 한다.

- agent별 편의 기본값이 role policy보다 넓어지지 않는다.
- 해당 CLI가 어떤 capability를 강제할 수 없으면 `unsupported`로 보고하고 조용히 allow하지 않는다.
- unsupported hard requirement가 있으면 실행 전 fail-closed하거나 별도 격리 lane으로 내린다.

정확한 Claude/Grok flag·hook 매핑은 PLAN 승격 전 버전별 live preflight로 확정한다. 이 설계는
미실측 CLI flag를 lock하지 않는다.

---

## 6. 원자적 실행 모델

### 6.1 전역 MCP 설정은 identity-neutral

Codex 전역 설정에는 Loom MCP executable만 두고 session identity를 넣지 않는다.

```toml
[mcp_servers.loom]
command = "bun"
args = ["run", "/absolute/path/to/packages/mcp-server/src/stdio.ts"]

# 금지: 전역 LOOM_SESSION / LOOM_PROFILE pin
```

### 6.2 identity는 `loom run`이 소유

현재 `loom run`은 선택한 profile에서 `LOOM_SESSION`과 `LOOM_PROFILE`을 만들어 agent child
environment에 넣는다. MCP config에 같은 키의 고정 override가 없으면 Codex가 띄운 Loom MCP
process도 이 environment를 상속한다.

이 상속은 표준 process 동작과 현행 spawn 사슬에 근거한 **구현 가설**이다. PLAN 승격 전
실물 Codex/Claude/Grok에서 세 profile 동시 실행 smoke로 확정한다. 확정 전에는 보장으로 쓰지 않는다.

### 6.3 실행 명령

```bash
# architect
bun run loom --profile codex-arch run codex -- -p codex-arch

# implementer
bun run loom --profile codex-impl run codex -- -p codex-impl

# reviewer
bun run loom --profile codex-rev run codex -- -p codex-rev
```

plain `codex -p codex-impl`은 Loom role-bearing session의 정식 진입점이 아니다. `loom run`을
통하지 않아 `LOOM_SESSION`/`LOOM_PROFILE`이 없으면 Loom MCP는 role-required operation을
fail-closed한다.

### 6.4 `--write-user-config` 전환

기존 session-pinned `--write-user-config`는 즉시 삭제하지 않는다.

1. 신규 identity-neutral 설치 표면을 추가한다(이름은 PLAN에서 확정).
2. dogfood runbook은 neutral install + inherited runtime identity로 전환한다.
3. 기존 pinned mode는 한 MINOR 동안 deprecation warning과 함께 유지한다.
4. 두 mode가 섞이면 startup doctor가 경고가 아니라 role-required run을 거부한다.
5. 관찰 기간 뒤 pinned session env 쓰기를 제거한다.

`--write-user-config`의 기존 의미를 같은 이름 아래 조용히 바꾸지 않는다.

---

## 7. 강제 지점

문서 규칙만으로 역할을 보장하지 않는다. 손실과 우회 비용에 따라 강제 층을 나눈다.

### E0 — launch identity guard (필수, 첫 wave)

agent TUI spawn 전에 다음을 모두 검사한다.

- profile name parse 성공
- session `profile`·`displayName` 일치
- 선택 adapter와 agent prefix 일치
- child `LOOM_PROFILE` 일치
- permission bundle role 일치

하나라도 다르면 pane/TUI/MCP를 띄우지 않는다.

### E1 — Loom operation guard (필수)

- `impl`만 implementer `doing` claim 가능
- `arch`/`rev`는 implementer assignee claim 거부
- `impl`은 공식 R{n} author operation 거부
- `rev`는 product implementation card claim 거부

초기에는 local session role을 근거로 한다. 이를 원격 보안 ACL로 표현하지 않는다.

### E2 — write/ship guard (필수, adapter별)

- `arch`: locked spec 상태에서 product path write 차단
- `rev`: product path write 차단
- `impl`: R{n} verdict path write 차단
- pre-commit은 role별 허용 path를 검사
- `--no-verify` 가능성 때문에 pre-commit 하나만 correctness 근거로 삼지 않는다.

도구 hook + ship-time diff guard 두 층을 사용한다. 어느 agent CLI가 write hook을 지원하지 않으면
별도 worktree/OS sandbox 또는 ship-time hard gate로 보완한다.

### E3 — human boundary (불변)

force-push·shared data 삭제·secret publish·권한 영구 확대는 auto-review 대상이 아니라 사람 승인
대상이다. role policy가 이 경계를 완화하지 않는다.

---

## 8. 호환성과 마이그레이션

### 8.1 이름 이전

현행 대부분의 profile key는 이미 `<agent>-<role>` 형식이다. 변경 대상은 주로 display name과
신규 architect identity다.

| Old | New | Policy |
|-----|-----|--------|
| profile `claude-rev`, display `claude-review` | 둘 다 `claude-rev` | handoff alias 한 MINOR |
| profile `codex-rev`, display `codex-review` | 둘 다 `codex-rev` | handoff alias 한 MINOR |
| profile `grok-rev`, display `grok-review` | 둘 다 `grok-rev` | inactive profile에서 먼저 전환 |
| Codex local `loom-design` | `codex-arch` | compatibility file/경고 후 제거 |
| Codex local `loom-code` | `codex-impl` | compatibility file/경고 후 제거 |

alias는 주소 해석에만 사용하고 새 board assignee·새 handoff에는 canonical name만 쓴다.

### 8.2 profile/session 보존

- 기존 credential을 문서나 repo로 복사하지 않는다.
- display rename은 room rejoin/identity update의 실제 의미론을 실측한 뒤 수행한다.
- peerId가 바뀌면 inbox/allowlist/board provenance 영향표를 먼저 만든다.
- 기존 `.json`을 일괄 재작성하지 않고 profile별 backup + validation + rollback으로 이전한다.

### 8.3 rollback

전환 실패 시:

1. 새 role-aware launcher 사용 중단
2. neutral MCP block backup 복원
3. legacy canonical profile session으로 재기동
4. alias window 동안 구 display target 사용

rollback은 room credential 재발급을 요구하지 않아야 한다. 이를 만족하지 못하는 migration 안은
PLAN에서 reject한다.

---

## 9. 구현 웨이브와 선후관계

이 후보는 v0.27.0 G4 완료 뒤에만 PLAN으로 승격한다.

```text
P0 evidence/preflight
  → P1 canonical identity schema + doctor
  → P2 neutral MCP install + inherited identity smoke
  → P3 role permission adapters
  → P4 operation/write/ship guards
  → P5 compatibility migration + docs
  → P6 independent cross-agent verification
```

### P0 — evidence/preflight

- Claude/Grok/Codex 현행 permission flag와 hook capability 실측
- MCP child environment 상속 실측
- 세 Codex role 동시 실행에서 global config hash 불변 확인
- display rename이 peerId/allowlist/inbox에 미치는 영향 확인

### P1 — identity schema

- `AgentRole`/canonical identity validator
- roster manifest에 agent·role 명시
- session/profile/display/adapter mismatch red tests
- `dogfood:status`에 role/permission bundle 표시

### P2 — neutral MCP

- identity-neutral install 표면
- inherited `LOOM_SESSION`/`LOOM_PROFILE`
- legacy pinned mode warning·혼용 fail-closed
- 동시 launch isolation tests

### P3 — permission adapters

- role policy 한 곳에서 agent별 config 생성
- unsupported capability 명시
- role과 다른 CLI override 탐지

### P4 — enforcement

- claim/R author operation guard
- role-aware write hook
- ship-time diff guard
- destructive human boundary 고정

### P5 — migration

- display canonicalization + alias
- runbook/scripts/AGENTS/HANDOFF 동기
- `loom-design`/`loom-code` deprecation

### P6 — verification

- 발견자≠수정자 분리
- 3 agent × active role matrix smoke
- legacy rollback smoke
- 전체 suite + dogfood live room

---

## 10. 선행 red tests / acceptance

PLAN 승인 뒤 production 변경보다 먼저 아래를 tests-only commit으로 잠근다.

| ID | Scenario | Expected |
|----|----------|----------|
| R1 | `codex-rev` Loom identity + `codex-impl` permission bundle | spawn 전 mismatch 거부 |
| R2 | profile=`claude-rev`, display=`claude-review` 신규 생성 | canonical violation + migration 안내 |
| R3 | adapter codex로 `grok-impl` 실행 | spawn 전 거부 |
| R4 | `arch`가 implementer `doing` claim | 명시적 role error |
| R5 | `impl`이 공식 R{n} author operation | 명시적 role error |
| R6 | `rev` product path write/ship | hook 또는 ship guard 거부 |
| R7 | Codex impl/rev/arch 동시 실행 | 각 MCP가 자기 profile, cross-read 0 |
| R8 | 세 실행 전후 `~/.codex/config.toml` | hash 불변, session env pin 없음 |
| R9 | plain Codex + role-required Loom operation | missing runtime identity로 fail-closed |
| R10 | legacy pinned config와 inherited mode 혼용 | 경고가 아닌 role-required run 거부 |
| R11 | old review display handoff | alias window에는 전달 + canonical deprecation |
| R12 | inactive 3×3 profile | peer/session 자동 생성 0 |
| R13 | role adapter unsupported hard capability | 조용한 allow 없이 실행 거부 |
| R14 | force-push/shared delete | role 무관 human approval 유지 |
| R15 | migration rollback | 기존 credential/peer identity로 복구 가능 |

**라이브 수용 기준:**

1. `codex-arch`·`codex-impl`·`codex-rev`를 동시에 띄운다.
2. 각 세션이 MCP `LOOM_PROFILE`과 display를 자기 canonical identity로 보고한다.
3. 세 세션 기동·종료 동안 전역 Codex config hash가 변하지 않는다.
4. impl만 board claim·코드 write를 성공한다.
5. rev의 독립 finding이 impl에게 전달되고 자기 작업 self-review가 거부된다.
6. legacy profile rollback이 room/inbox를 잃지 않고 완료된다.

---

## 11. Unknowns와 PLAN 승격 게이트

| ID | Unknown | PLAN 전 해소 방법 |
|----|---------|-------------------|
| U1 | Codex MCP child가 parent `LOOM_*`를 config override 없이 항상 상속하는가 | 3-profile live smoke |
| U2 | Claude/Grok에서 role permission을 강제할 정확한 현행 표면 | 버전 고정 CLI help + live negative test |
| U3 | display rename이 peerId·allowlist·미수신 inbox에 미치는 영향 | 복제 room migration probe |
| U4 | board/R operation guard가 local policy로 충분한가 | threat model; hostile remote면 후속 protocol PLAN |
| U5 | `arch` product-path write를 locked-spec 상태에만 제한할 상태 입력 | PLAN status/handoff/task 결합 설계 |
| U6 | auto-review가 agent별 destructive boundary를 동일하게 유지하는가 | vendor별 negative smoke |
| U7 | alias 기간과 제거 버전 | active automation/운영자 scan |
| U8 | architect를 모든 agent에 materialize할 필요가 있는가 | owner roster 결정; 기본은 active identity만 |

PLAN 승격 조건:

- P0 네 실측 완료
- active roster와 architect 기본 agent owner 결정
- U1~U3 해소
- local cooperative role과 remote security role의 주장 경계 명시
- MINOR version + R{n} review

---

## 12. 하지 말 것

- 이름만 바꾸고 전역 pinned identity를 유지하지 않는다.
- 9개 profile을 자동 join/online하지 않는다.
- profile suffix만 보고 remote security ACL을 주장하지 않는다.
- `danger-full-access + never`를 역할 기본값으로 사용하지 않는다.
- `--write-user-config` 의미를 호환 고지 없이 바꾸지 않는다.
- prompt 문구만으로 product write/self-review를 막았다고 주장하지 않는다.
- 미실측 Claude/Grok flag를 승인 lock으로 복사하지 않는다.
- 현재 v0.27.0 G0~G4 사이에 이 후보 구현을 섞지 않는다.
