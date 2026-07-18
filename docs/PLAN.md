# Loom — Multiplayer AI Terminal (Mosaic-class)

| Field | Value |
|-------|--------|
| **Document** | `docs/PLAN.md` |
| **Version** | **0.23.3** |
| **Status** | **`pending-review`** (R28 대기, 2026-07-18) — **conv 워커 산출물 파일-기반 artifact 트리거 (§5.1 자가 적용 규약)** (PATCH): 실측 확정된 구조적 블로커(Claude Ink TUI pane 스크레이프 ~5.3k 상한 → 브릿지 측정 32k 트리거 라이브 도달 불가)를 해소한다. 워커가 대용량 산출물을 규약 디렉터리에 **직접 파일로 쓰고** 마커 라인으로 알리면, 브릿지가 파일명 검증 후 기존 0.23.1 패키징 경로로 artifacts[] ref를 방출한다. **relay 와이어 protocol v1 무변경 · M-2 소비부 무변경.** |
| **Supersedes** | 0.23.2 |
| **Last updated** | 2026-07-18 |
| **Approval** | **R28 대기** — 직전: R27 `approved`(0.23.2) → implemented `91bee75` · R26 author-close `approved`(0.23.1) → implemented `e5ccc4d`. 스펙 정본 `docs/CONV_SPEC.md`는 R24 approved 유지(재론 없음 — 이 PATCH는 §5.1 "워커 CLI가 프롬프트 규약만으로 자가 적용" 원의도에 구현을 정렬하는 것). |
| **Fable 5 when** | **Required** — 워커 제어 입력(마커 파일명)이 브릿지의 파일 읽기·전송을 유도하는 **신뢰 경계 인접** 경로 신설 + §5.2 트리거 의미 변경 (§5.1 보수 판단). **R28 요청 중.** |
| **Priorities** | [`docs/PRIORITIES.md`](./PRIORITIES.md) — launcher UX after work bus |
| **Canonical path** | `docs/PLAN.md` (repo). Session copy is non-authoritative. |
| **Original design** | ⛔ **`docs/ORIGIN.md`** — 최초 설계안(v0.1.0) 불변 baseline + delta. 이 PLAN은 **as-built**이며 R1 피벗 당일 원래 비전을 제자리 덮어썼다. 원래 목적지(Mosaic-parity·presence·Phase 0~5) 대조는 ORIGIN 참조. |
| **Related** | `docs/WORKFLOW.md` (작업 규칙·§3.5 Unknowns), `docs/UNKNOWNS.md`, `docs/plan_review.md`, `docs/ARCHITECTURE.md`, `docs/PROTOCOL.md` |
| **Naming** | **Loom** = product. **Fable 5 / fable-advisor** = review agent (not the product). |
| **Workflow** | 구현·리뷰·ship 절차 → **[`docs/WORKFLOW.md`](./WORKFLOW.md)** |

---

## Version control (계획 버전 관리)

이 파일이 **제품 계획의 단일 원본(SSOT)** 이다. 구현·리뷰·승인 게이트는 아래 규칙을 따른다.

### 버전 번호 (SemVer 유사)

| 자리 | 의미 | 예 |
|------|------|-----|
| **MAJOR** (`1.0.0`) | 제품 방향·성공 정의 변경, 이전 계획과 양립 불가 | 멀티휴먼 포기 등 |
| **MINOR** (`0.2.0`) | 아키텍처 전제·수신 모델·페이즈 범위 변경 (리뷰 재요청) | MCP push 폐기, 큐 모드 기본 |
| **PATCH** (`0.2.1`) | 완료 기준 보강, 보안 범위 명확화, 일정·경로 (재리뷰 선택) | R2 H-1/M-1 → M1.1 |

### 상태 값

| Status | 의미 |
|--------|------|
| `draft` | 작성 중 |
| `pending-review` | 리뷰 요청 가능 / 대기 |
| `approved` | 이 버전 기준 구현 진행 허용 |
| `superseded` | 상위 버전에 대체됨 |
| `on-hold` | 블로커로 의도적 중단 |

### 변경 시 필수 절차

1. 상단 **Version** 올리고 **Status**를 `draft` 또는 `pending-review`로 둔다.
2. 아래 **Changelog**에 항목을 추가한다 (What / Why / Review impact).
3. 재리뷰가 필요하면 Status = `pending-review`, 리뷰어는 `docs/plan_review.md`에 **대상 버전**을 명시해 결과를 남긴다.
4. 승인 시 Status = `approved`, Changelog에 `Approved by …` 한 줄 추가.
5. 구현은 **approved 버전만** 기준으로 한다. 코드가 앞서 나가면 다음 PATCH/MINOR에 “Implemented as of …”로 동기화한다.

### Changelog

#### 0.23.3 — 2026-07-18 (`pending-review` R28 — **conv 워커 산출물 파일-기반 artifact 트리거 (§5.1 자가 적용 규약)** (PATCH))

**Product one-liner:** 32k 초과 산출물을 워커가 규약 디렉터리(`~/.loom/artifacts/<convId>/`)에 직접 파일로 쓰고 턴 끝에 `[ARTIFACT] <파일명>` 마커로 알리면, 브릿지가 파일명 검증 후 기존 0.23.1 패키징 경로(sha256·chars·틸드-리터럴 ref)로 artifacts[] ref를 회신한다 — pane 스크레이프 상한과 무관하게 §5.1 "절단 금지"가 라이브에서 실제로 성립한다.

**Why (후보 ⑩ 조사 결론, 2026-07-18 실측):** 0.23.1의 artifact 트리거는 브릿지가 pane 스크레이프 길이(>32k)를 측정하는 구조인데, 실물 스모크에서 **Claude Ink TUI pane 스크레이프는 소스 모드(`visible|recent|recent-unwrapped`)·요청 줄수 무관 ~5.3k 상한**이 실측됐다(TUI가 트랜스크립트를 접어 렌더 버퍼만 남김 — 원시 shell pane은 `recent 500`=51.7k로 스크롤백 보존, 차이 원인은 herdr가 아니라 TUI). 따라서 32k 측정 트리거는 **라이브에서 구조적으로 도달 불가**. 옵션 검토: **(b) herdr 노출 확대** — herdr 0.7.4의 `pane.read` 소스 3종 전부 렌더 버퍼 종속, 더 깊은 raw 모드 없음(upstream 기능 요청 외 불가, 기각) · **(c) 임계 하향(~5k)** — CONV_SPEC §5.1(32k) 위반 + TUI chrome 오염 스크레이프(관찰 ⑤ⓒ)를 패키징하게 됨(기각) · **(a) 워커 직접 파일 쓰기** — CONV_SPEC §5.1이 애초에 *"판정이 기계적이라 워커 CLI가 프롬프트 규약만으로 자가 적용"*으로 명시한 원의도와 일치(**채택**). 부수 효과: capable 모델(Sonnet 5/Opus 4.8) 워커가 injection형 대량 filler 지시를 거부하던 스모크 블로커(후보 ⑪)도 benign "실파일 artifact 전달"형으로 함께 해소된다.

**What (범위 — PATCH; 설계 정본 = CONV_SPEC §5, 스펙 재론 없음):**
| 항목 | 내용 |
|------|------|
| **워커 프롬프트 규약 (§5.1 자가 적용)** | conv goal 프롬프트(브릿지가 워커 pane에 주입하는 규약 문구)에 추가: 산출물이 인라인 32k를 초과하거나 pane 표시로 온전 전달이 불가능하면, 전문을 `~/.loom/artifacts/<convId>/<파일명>`에 직접 기록하고 턴 마지막에 **`[ARTIFACT] <파일명>`** 라인을 출력하라. `<convId>`는 기존 `LOOM_CONV` env로 워커에 이미 전달됨(0.23.0). 파일명 규약: **파일명만**(경로 구분자 금지), charset `[A-Za-z0-9._-]`, 선행 `-`·`.` 금지. |
| **브릿지 — 마커 소비부** | `sendWorkerTurnFromPane` 스크레이프에서 `[ARTIFACT] <파일명>` 라인 탐지(마커는 턴 말미라 ~5.3k 접힘 창에도 잔존) → 파일명 검증(위 규약 — 위반 시 해당 마커 무시 + bridge note 사유 회신) → `loomDir()/artifacts/<convId>/<파일명>`로만 해석(**realpath containment**: 해석 결과가 conv 디렉터리 내부임을 심링크 추적 후 확인, 탈출 시 fail-closed) → 크기 상한(10MB, 초과 fail-closed) → 파일 읽어 sha256·chars 계산 → **기존 0.23.1 방출 경로 재사용**(`packageConvTurnArtifact` 계약: 틸드-리터럴 ref.path(R26 L-1)·gist 안내 문구·scp transport). 파일 부재/검증 실패 시 턴 자체는 정상 진행(artifact 미방출 + note 사유). 마커 다건 허용(파일별 ref 1건, 상한 예: 턴당 4건). |
| **기존 트리거 유지 (회귀 없음)** | 브릿지 측정 32k 트리거(`output.length > MAX_CONV_TURN_INLINE_CHARS`)는 그대로 유지 — 스크레이프가 실제로 32k를 넘는 환경(비 TUI 워커 등)에서는 여전히 동작. |
| **스모크 재설계 (후보 ⑪ 흡수)** | §5.2 라이브 스모크 페이로드를 benign형으로 교체: "repo의 실제 대용량 파일(예: docs/PLAN.md, 154k) 전문을 artifact 규약으로 전달하라" — capable 모델이 거부할 이유가 없는 정상 작업으로 32k+ 전달을 실증. |
| **테스트** | 마커 탐지 → artifact 파일 읽기·sha256/chars·ref 방출(틸드-리터럴형) fake herdr fixture; 파일명 검증 거부 케이스(경로 구분자·`..`·선행 `-`/`.`·charset 위반·빈 이름); realpath 탈출(심링크로 conv 디렉터리 밖 지시) fail-closed; 파일 부재 → note 회신·턴 정상 진행; 크기 상한 초과 fail-closed; 마커 다건·상한; 기존 32k 스크레이프 트리거 회귀(무변경 확인); 32k 이하 + 마커 없음 = 기존 인라인 경로 회귀. |

**Out of scope (이 버전 아님):** herdr upstream raw 스크롤백 노출 모드(⑩(b) — 기각이 아니라 upstream 관찰 대상); 워커 턴 pane 스크레이프 delta화(⑤)·close 시 pane 정리 정책(⑥)·`loom conv-hosts set` CLI(⑦)·브릿지 주입 verify 루프 개선(⑨); artifact fetch 자동 실행(0.23.0 원칙 승계 — 제시까지만); 단발 card result 경로의 파일 규약 적용(§5.5 별도 유지 — conv 한정); 브릿지 자동 git push(0.23.1 Out 승계).

**Security / trust (R28 판단 대상):**
- **워커 제어 입력이 브릿지 파일 읽기를 유도한다** — 신설 신뢰 경계. 방어 4계층: ① 파일명-only(경로 구분자·`..` 금지) ② charset allowlist + 선행 `-`/`.` 금지 ③ realpath containment(`loomDir()/artifacts/<convId>/` 밖 해석 = fail-closed, 심링크 포함) ④ 크기 상한. 워커는 이미 해당 노드에서 자율 실행 중인 로컬 프로세스이므로(R23 신뢰 모델) 워커가 읽을 수 있는 파일은 원리상 pane 출력으로도 전달 가능 — 이 PATCH가 새로 주는 능력은 "브릿지가 전송 주체가 되는 것"뿐이고, 위 검증으로 워커 홈 임의 파일 지정 경로를 차단한다.
- **wire 무변경:** artifacts[] 스키마·M-2 수신 검증·타워 제시 표면(0.23.1) 전부 무변경 — 생산 트리거만 추가.
- **마커 위조:** conv pane에 제3자가 쓸 수 없다(herdr pane은 브릿지 스폰 전용, M-2 주입 경로 공용) — 마커 출처는 워커 자신뿐이며 워커는 이미 신뢰 모델상 자율 주체.

**Review impact:** 와이어 무변경·MCP 도구 수 무변경. M-2 신뢰 경계 **인접**(artifact 생산 트리거에 워커 제어 입력 도입) + §5.2 트리거 의미 변경 → §5.1 보수 판단으로 **R28 요청**.

**R28 질의:** *(현재 없음.)*

#### 0.23.2 — 2026-07-18 (`approved` R27 즉시 승인 — **dispatch/conv agentKind allowlist 확장 (codex·grok)** (PATCH))

**Product one-liner:** 타워가 카드 dispatch와 `conv.open`에서 `agentKind`로 codex/grok 워커를 지정할 수 있다 — 실행은 각 브릿지 오퍼레이터가 로컬 설정(`agentArgv`)에 해당 kind의 argv를 명시 등록한 노드에서만 성립하고(기본 fail-closed), wire에는 여전히 argv가 실리지 않는다(HERDR_DESIGN §4.4.2 원칙 유지).

**Why:** 0.22.0 슬라이스 allowlist는 `claude`만이었고(`card-contract.ts:19` — "Slice allowlist: claude only"), 0.23.0 Out-of-scope가 "agentKind allowlist 확장(codex/grok 등) = 후속 PATCH"로 명시 예약해 뒀다. dogfood에서 grok/codex 구현 레인은 현재 headless 서브에이전트로만 위임 가능한데(HANDOFF 실측 제약: "herdr dispatch allowlist = claude만"), herdr pane 레인에서도 같은 레인 선택지가 필요하다. herdr는 grok/codex pane agent 감지를 이미 지원한다(pane list 실측: `agent:"grok"` 감지, 2026-07-18).

**What (범위 — PATCH; 신규 표면·도구 없음):**
| 항목 | 내용 |
|------|------|
| **protocol — enum 확장** | `DispatchAgentKindSchema` `z.enum(["claude"])` → `z.enum(["claude","codex","grok"])` (`card-contract.ts`) — 카드 dispatch(`CardDispatchPayloadSchema.agentKind`)·conv scope(`ConvScopeSchema.agentKind`, `conv-contract.ts`) **공용 enum이라 두 표면이 동시 확장**된다. attachment 컨벤션 확장이며 **relay 와이어 protocol v1 무변경**. 하위호환: 구버전(≤0.23.1) 브릿지는 미지 kind payload를 zod parse 실패로 거부(카드 `payload_invalid` failed result / conv open 무시) — fail-closed. |
| **브릿지 로컬 설정 (변경 없음이 곧 설계)** | `DEFAULT_AGENT_ARGV`는 **`claude`만 유지**(`bridge-config.ts:21-23`) — codex/grok은 기본 미등록이라 `resolveAgentArgv` null → 카드 `agent_kind_not_allowed` failed result(`bridge-runtime.ts:434`)·conv reject(`:589`) 기존 fail-closed 경로 그대로. 스폰 활성화는 오퍼레이터가 `~/.loom/bridge/<profile>.json`의 `agentArgv`에 `"codex": ["codex"]` / `"grok": ["grok"]` 형태로 명시 등록할 때만. `shell`/`sh`/`bash` 영구 금지 가드(`resolveAgentArgv`) 불변. **R27 L-1(author-close): `loadBridgeConfig` 병합 시 `agentArgv` 값이 비어있지 않은 문자열 배열이 아니면 필터(무시=미등록과 동일 fail-closed)** — 오설정 값(예: `"codex": "codex"` 문자열)이 `resolveAgentArgv`에서 TypeError로 pollTimer 포괄 catch에 삼켜져 claim된 카드가 무신호 `doing` 고착되는 경로 차단(R23 L-1 재발 방지). |
| **MCP/타워 표면** | `dispatch_card`는 `agentKind` 파라미터 기노출(스키마 description만 3종 반영 갱신). `conv_open`에 optional `agentKind`(기본 `"claude"`) 추가 — `convOpen()`(`conv-ops.ts`)의 하드코딩 `"claude"`를 인자화. **도구 수 무변경.** |
| **문서** | HERDR_DESIGN §4.4.2 allowlist 서술 3종 반영 + 브릿지 설정 예시 1블록. **R27 L-2(author-close): 예시 블록에 등록 의미 고지 명시** — "argv 등록 = 해당 CLI의 기본 자율성(권한 모델·자동 실행 특성) 수용, 가드레일 플래그는 오퍼레이터가 argv에 직접 포함"(R23 "워커 pane = 자율 실행 전용" 신뢰 모델의 오퍼레이터 측 절반). |
| **테스트** | enum 왕복(codex/grok payload 유효 parse); 미등록 kind → 카드 `agent_kind_not_allowed` failed + conv reject(양 표면); `agentArgv` 등록 시 스폰 argv 반영(fake herdr — `agentStart` argv 검증); shell/sh/bash 가드 회귀(codex/grok 키에도 적용); `convOpen` agentKind 전파(기본값 claude 회귀 포함); 미지 kind 문자열(예: `"shell"`, `"gpt"`)은 스키마 거부; **비배열/오형상 `agentArgv` 값 → 병합 시 무시되어 미등록과 동일 fail-closed(R27 L-1)**. |

**Out of scope (이 버전 아님):** grok/codex pane **주입 UX 튜닝**(스타트업 레이스 프로파일은 CLI별 상이 — 실물 스모크에서 관찰 후 필요 시 별도 후보, 기존 후보 ⑤와 인접); **agentKind별 차등 인가**(per-kind dispatcher allowlist — 현행 M-1 단일 allowlist 유지, 필요 근거 없음); headless 레인(서브에이전트 위임) 대체 아님 — 병행 유지; agentKind별 cwd/writes 정책 차등(§2.1 scope 의미 무변경).

**Security / trust (R27 판단 대상):**
- **이 PATCH의 본질 = 원격 실행 표면 확대:** 인가된 dispatcher(M-1)가 원격 브릿지에 스폰 지정할 수 있는 CLI가 1종→3종. 방어선은 기존 2계층 그대로 — ① wire에 argv 금지(§4.4.2, enum kind만 전달) + ② 브릿지 로컬 argv 매핑(오퍼레이터 명시 opt-in, **신규 kind의 기본값을 등록하지 않는 것이 이 PATCH의 핵심 보수 결정**). 등록하지 않은 노드의 동작은 0.23.1과 완전 동일.
- **M-2 제출 분리(리터럴 send + 고정 상수 별도 Enter)는 agentKind 불문 공용 주입 경로** — 주입 코드 무변경, 신규 kind에 자동 적용.
- **하위호환 fail-closed:** 구버전 브릿지는 미지 kind를 parse 거부 — 확장 kind가 구노드에서 조용히 claude로 강등되는 경로 없음.

**R27 질의:** *(현재 없음.)*

**Approved by:** Fable 5 (fable-advisor) R27 — **즉시 `approved`**(M-lock 없음 — fail-closed 불변식(기본 미등록 = 0.23.1 동일 동작 + wire argv 금지 §4.4.2)이 코드로 보증됨을 확인), 2026-07-18. L-1(`loadBridgeConfig` `agentArgv` 병합 시 비배열 값 필터 + "비배열 `agentArgv` 값 → 무시(=미등록 fail-closed)" 테스트 — 오설정 시 TypeError가 pollTimer catch에 삼켜져 claim 후 무신호 증발=doing 고착 방지)·L-2(브릿지 설정 예시에 "argv 등록 = 해당 CLI의 기본 자율성 수용, 가드레일 플래그는 argv에 직접 포함" 고지)는 구현 PATCH 내 author-close(`docs/plan_review.md` R27).

**Implemented as of `91bee75` (2026-07-18, grok-impl 레인 · 아키텍트 독립 검증):** 13파일 +518줄 — enum 3종 확장(`card-contract.ts`)·`sanitizeAgentArgv()`(R27 L-1, `bridge-config.ts`)·`convOpen` agentKind 인자화(`conv-ops.ts`)·MCP `conv_open` agentKind 노출+`dispatch_card` 설명 갱신(`stdio.ts`/`tools.ts`)·HERDR_DESIGN §4.4.2 예시 블록+L-2 고지·VERSION 0.23.2(CLI+MCP). L-1·L-2 author-close 구현 포함 완료. 신규 테스트 15개 — `bun test` **309/0** · 6패키지 typecheck green. 이탈 없음(`implementation-notes.md` 추가 기록 없음).

#### 0.23.1 — 2026-07-18 (`approved` author-close after R26 `pending-revision` — **§5.2 artifact 패키징 호출부** (PATCH))

**Product one-liner:** 32k를 넘는 워커 턴이 잘려나가는 대신, 브릿지가 산출물 전문을 규약 디렉터리(`~/.loom/artifacts/<convId>/`)에 보존하고 artifacts[] ref로 회신하며, 타워는 M-2 검증을 통과한 fetch 명령을 **제시**받는다 — CONV_SPEC §5.1 "절단 금지"의 코드 회복.

**Why:** 0.23.0 구현은 M-2 검증 함수(`conv-contract.ts` `validateGitArtifactRef`/`validateScpArtifactRef`)를 완성·테스트했으나 **호출부가 없다** — 브릿지 `sendWorkerTurnFromPane`은 32k 초과 시 0.22.0 관례 tail-truncate 폴백(`bridge-runtime.ts:808,826,831`, 구현 노트에 문서화된 MVP 갭)으로 §5.1 "무조건 out-of-band 전환·절단 금지"와 불일치. conv 실물 스모크(2026-07-18, HANDOFF)로 0.23.0 왕복 경로가 검증된 지금이 이 정합 회복의 적기다.

**What (범위 — PATCH; 설계 정본 = CONV_SPEC §5):**
| 항목 | 내용 |
|------|------|
| **브릿지 — 패키징 호출부(§5.1→§5.2)** | `sendWorkerTurnFromPane`에서 인라인 32k 초과 시 truncate 대신: pane 산출물 **전문**(=회수된 스크레이프의 전문 — R26 L-2, 아래 참조)을 `~/.loom/artifacts/<convId>/turn-<seq>.txt`(디렉터리 0700·파일 0600, `loomDir()` 경유 M-14)에 기록 → `sha256`·`chars` 계산 → `artifacts:[{transport:"scp", ref:{host:<브릿지 노드 displayName>, path}, sha256, chars, gist}]` 방출. **wire의 `ref.path`는 규약형 틸드-리터럴 `~/.loom/artifacts/<convId>/…`로 방출**(R26 L-1) — 브릿지는 `loomDir()` 절대경로에 기록하되 wire엔 리터럴형만 싣는다(절대경로 방출 시 크로스머신 prefix 전량 불일치 + 브릿지 홈경로 노출). 인라인 `text` = 32k 이내 **gist**(tail 발췌 + artifact 안내 문구 — **회수 창(현행 `pane.read` recent 200줄) 명시 포함**, R26 L-2: 창 밖 출력은 artifact 파일에도 없으므로 "전문"은 회수분에 한정된 정직한 주장이어야 한다). truncate 폴백 제거. pane 스크레이프는 로그성 산출물이므로 §5.2 분류상 **scp 규약**이 정본 경로 — git 주수단은 repo-적합 산출물용(아래 Out). |
| **타워 — fetch 명령 제시(M-2 소비부)** | `conv_await`가 artifacts[] 포함 턴 수신 시, ref별로 M-2 검증 수행 후 **통과한 것만** fetch 명령 문자열(scp/git argv 조립, 셸 연결 없음)을 결과에 포함해 **제시**한다. **scp `host`는 수신측 로컬 명시 구성(설정)의 peer/node→ssh host 매핑에서만 해석한다 — conv state에 기록된 자기신고 displayName을 host로 쓰는 것 금지. 매핑 부재 시 명령 미조립 + 사유 표시(fail-closed)**(R26 M-1 — `validateScpArtifactRef`의 resolveHost null 경로가 fail-closed 원시로 기존재, 문안 고정). git ref는 `validateGitArtifactRef` — 기존 remote만. 타워 검증 root도 틸드-리터럴 규약형(R26 L-1 — 브릿지 방출형과 동일, 확장은 원격측). 검증 실패 ref는 명령 미조립 + 사유 표시. **자동 실행 없음** — 0.23.0 "제시까지" 원칙 그대로. |
| **제시 문자열 렌더링 규약 (R26 M-2)** | fetch 명령 제시 문자열 렌더링 시 **POSIX 단일인용 필수**(내장 `'`는 `'\''` 이스케이프) + branch·path의 convId-prefix 이후 접미에 **charset allowlist `[A-Za-z0-9._/-]`**(세그먼트 선행 `-` 금지)를 심층방어로 병행. 근거: M-2 검증 함수는 argv-수준 방어이고 스키마는 charset 무제약이라 `conv/<convId>/$(cmd)` 형 값이 검증을 통과하는데, 제시 문자열의 유력 복붙 실행자는 `conv_await` 결과를 컨텍스트로 받는 **타워 LLM 에이전트 자신**이라 "사람이 눈으로 거른다" 가정이 약하다. 인용 상호작용(R26 L-1): 단일인용 시 로컬 셸 틸드 확장이 죽으므로, 틸드-리터럴 path는 scp **원격 경로 위치**에서만 유효한 형태로 렌더링한다. (권고, non-binding: 제시 문자열에 "untrusted 출처 — 실행 전 검증" 프리픽스.) |
| **테스트** | fake herdr fixture: 32k 초과 스크레이프 → artifact 파일 생성·회수분 전문 보존(절단 없음)·sha256/chars 일치·ref 방출(틸드-리터럴형)·인라인 gist+안내 문구 합 ≤32k; 32k 이하는 기존 인라인 경로 무변경(회귀); 타워 측 M-2 검증 통과 시 fetch 명령 조립(단일인용 렌더링·charset allowlist)·실패 시(traversal path·**host 매핑 부재 fail-closed**·선행 `-`·allowlist 위반 접미) 미조립+사유 케이스; **생산 측 규약 위반 시 수신 검증이 정당 거부**하는 케이스. |

**Out of scope (이 버전 아님):** 브릿지의 **자동 git push** 패키징(원격 실행 표면 확대 — 워커 에이전트가 repo 산출물을 스스로 conv 브랜치에 push하는 경우의 ref 전달은 스키마상 이미 가능, 브릿지가 git을 실행하는 것은 별도 게이트); artifact fetch **자동 실행**(0.23.0 out-of-scope 승계); §5.4 정리 자동화(R25 L-4 승계); 워커 턴 pane 스크레이프 delta화·close 시 pane 정리 정책(스모크 관찰 ⑤⑥ — 별도 후보); done_proposal 탐지 규약·conv.open deny 클레임 순서·agentKind 확장(후보 ②③④).

**Security / trust (R26 판단 대상):**
- **브릿지가 M-2 ref 생산자가 된다:** 지금까지 M-2는 수신 방어만 존재했다. 이 PATCH로 브릿지가 규약 준수 ref를 만들기 시작하므로, 생산 측이 규약(path prefix·convId charset)을 어기면 수신 검증이 정당하게 거부함을 테스트로 고정한다.
- **타워 fetch 명령 제시 표면:** 제시 문자열은 M-2 검증 통과분만, argv 배열 조립(셸 보간 금지). wire의 host 필드는 표시용으로도 신뢰하지 않는다(로컬 매핑 해석 결과만 표시).
- **파일 기록은 브릿지 로컬 쓰기뿐** — 네트워크 실행(scp/git push) 없음. 원격 실행 표면 무증가.

**Review impact:** 와이어 무변경(artifacts 스키마 기존)·MCP 도구 수 무변경. M-2 신뢰 경계 **인접**(생산자 신설 + 소비부 제시 표면) → §5.1 보수 판단으로 **R26 요청**. 구현 중 CONV_SPEC과 충돌 발견 시 구현 보류 + 아래 "R26 질의"에 기록. **fetch 자동 실행을 도입하는 미래 버전은 M-1/M-2가 즉시 High로 승격 — 반드시 별도 R{n} 게이트**(R26 decision note).

**R26 질의:** *(현재 없음.)*

**Approved by:** Fable 5 (fable-advisor) R26 — `pending-revision` → M-1(scp host 해석 출처 = 수신측 로컬 명시 구성 + 매핑 부재 fail-closed)/M-2(제시 문자열 POSIX 단일인용 + charset allowlist) locks PLAN 본문 반영 → **author-close `approved`**(Fable 사전 승인, no R26b), 2026-07-18. L-1(ref.path 틸드-리터럴 규약형 — 브릿지 방출·타워 검증 양형 고정 + 인용 상호작용)·L-2("전문"=회수 스크레이프 전문 한정, gist 안내 문구에 회수 창 명시) author-close.

**Implemented as of `e5ccc4d` (2026-07-18, grok-impl 레인 · 아키텍트 독립 검증):** 16파일 +1,060줄 — 신규 `conv-artifact-pack.ts`(브릿지 패키징)·`conv-artifact-present.ts`(타워 제시)·`conv-node-hosts.ts`(M-1 로컬 매핑, `loomDir()/conv-node-hosts.json` 0600, **pinned peerId 키잉**) 각 +tests·계약 렌더 함수(`posixSingleQuote`/`presentGit|ScpFetchCommand`/`convArtifactsRootLiteral`)·`bridge-runtime.ts` truncate 폴백 제거·`conv_await` `artifactCommands[]`·VERSION 0.23.1(CLI+MCP — MCP 0.22.0 드리프트 동시 정정). `bun test` **294/0** · 6패키지 typecheck green. M-lock 코드 확인: M-1 fail-closed(`conv-node-hosts.ts:67-72` + pinnedPeerId 해석 `conv-artifact-present.ts:25-29`), M-2 렌더(`conv-contract.ts` allowlist+단일인용, 제시-only). 이탈 5건 `implementation-notes.md` §0.23.1. **Follow-up(후속 PATCH 후보):** `loom conv-hosts set` CLI 서브커맨드(현재 conv-node-hosts.json 수동 편집 — fail-closed 기본값과 일관하나 UX 갭).

#### 0.23.0 — 2026-07-18 (`approved` author-close after R25 `pending-revision` — **conv 멀티턴 수직 슬라이스**)

**Product one-liner:** 타워 에이전트와 원격 워커 에이전트가 하나의 목표를 두고 `conv.open`→`conv.accept` 개시 후 **엄격 교대 half-duplex**로 여러 턴을 왕복하며, 원격 done-제안을 타워가 검증·확정한다 — `docs/CONV_SPEC.md`(approved, R24 author-close 2026-07-18)의 1단계 스펙을 relay 와이어 protocol v1 무변경으로 구현한다.

**FREEZE 관계:** 오너가 conv 멀티턴 트랙 자체를 명시 승인(HANDOFF.md, 2026-07-18: *"FREEZE 해제됨 — conv 멀티턴 트랙 진행 승인"*) — 0.21.0/0.22.0처럼 개별 게이트 예외를 받는 구조가 아니라 이 트랙이 곧 해제 대상이다. 0.22.0 브릿지 수직 슬라이스가 herdr 연결점(데몬·dispatch/done 컨트랙트·M-1 dispatcher 인가)을 이미 검증했고, 이 PLAN은 그 위에 멀티턴을 얹는다.

**Why:** 0.22.0은 단발 card dispatch만 지원한다(타워→워커 1왕복, `[DONE]` 1회 회신). 목표 진행 중 왕복 대화(보완 요청·중간 확인·완료 협상)가 필요한 실사용 패턴이 wayfinder 맵 #1에서 확정됐고, 티켓 [#2 세션 의미론](https://github.com/lemonbalms/Loom/issues/2)·[#5 가드레일](https://github.com/lemonbalms/Loom/issues/5)·[#6 와이어](https://github.com/lemonbalms/Loom/issues/6)·[#7 MCP 표면](https://github.com/lemonbalms/Loom/issues/7)·[#8 긴 산출물](https://github.com/lemonbalms/Loom/issues/8)·[#9 진화 가드](https://github.com/lemonbalms/Loom/issues/9) 결정이 `docs/CONV_SPEC.md`로 통합됐다. R24(2026-07-18)가 스펙 자체를 M-1(conv↔peer pin)·M-2(artifact ref 검증 규약) locks 반영 + L-1..L-5 author-close로 `approved` 닫았으므로, 이 PLAN은 그 **승인된 스펙을 구현 계획으로 옮기는 것**이지 스펙 결정을 재론하지 않는다.

**What (범위 — 타워↔워커 1:1 대화 왕복이 실제로 도는 최소 수직 슬라이스; 설계 정본 = `docs/CONV_SPEC.md` §1–§6):**
| 항목 | 내용 |
|------|------|
| **protocol — conv 계약** | `card-contract.ts`(0.22.0) 선례를 미러하는 신규 클라이언트 로컬 zod 계약(`conv-contract.ts` **[가정]**, `packages/protocol`) — `loom-conv-open\|accept\|reject\|turn\|close` label attachment payload, `convId` 형식 `conv_[a-f0-9]{16}`(CONV_SPEC §1.1(개념)·§5.3①(형식), R25 L-2), `turnSeq` 배정 규약(open=0 타워/accept=1 워커/이후 짝=타워·홀=워커, §3.3), `kind: normal\|blocked\|done_proposal`(§1.3), artifact ref 스키마(§5.3) + **M-2 검증 함수**(②git ref는 `conv/<convId>/` prefix 매치 + `--` 구분자 + 선행 `-` 거부 + remote는 로컬 기존 remote만, ③scp host는 로컬 conv 상대 노드 매핑에서 해석 + path는 **정규화 후**(R25 L-3) `~/.loom/artifacts/<convId>/` prefix 강제, ④sha256은 fetch 후 무결성 검증일 뿐). **relay 와이어 protocol v1 무변경** — 전부 attachment 컨벤션(CONV_SPEC §0). |
| **host(타워 측) — conv 세션 상태** | conv별 상태 저장: **pin된 상대 peerId**(M-1, §2.1·§3.3) · last-seen `turnSeq`(멱등 폐기, §3.3) · 한도 카운터(턴 20·2h, §2.2). **M-1 pin 집행** — `turn`·`close`·`done_proposal` 등 모든 intent에서 pin된 peerId 불일치 시 무시+로그(R23 M-1 dispatcher 인가의 타워 측 대칭 짝). 한도 초과 시 **타워 로컬 보드 전이**로 pause(§2.2 — pause는 wire 어휘 아님, 워커 측은 advisory blocked 턴). 보드 매핑 = 대화 전체 카드 1장(§3.4, TaskStatus 5종 재사용·신규 컬럼 없음). 32k 인라인 임계 초과 턴은 artifact ref 강제(§5.1) — 절단 금지. |
| **host(워커/브릿지 측) — bridge-runtime 확장** | `bridge-runtime.ts`(0.22.0)에 conv 경로 추가: `conv.open` 수신 시 scope를 authorizedDispatchers·로컬 allowlist와 대조 후 `conv.accept`/`conv.reject`(§3.1 — M-1 dispatcher 인가 재사용). **conv↔peer pin (R25 M-1):** 브릿지는 `conv.open` 수신(accept) 시 `fromPeerId`를 해당 conv에 pin하고, 이후 `turn`·`close`는 pin 불일치 시 무시+로그; 브릿지 측도 conv별 last-seen `turnSeq`를 유지하며 `seq ≤ last` 멱등 폐기한다 — CONV_SPEC §2.1 "양측이 고정"·§3.3 "수신측은 conv별 last-seen 유지"(양측 수신자)의 브릿지 측 집행이며, 0.22.0 `bridge-runtime.ts:314-320`의 authorizedDispatchers **집합** 검사와는 별도로 **conv별 pin** 대조가 필요하다(인가 dispatcher 2명 시나리오에서 집합 검사만으로는 상호 conv 주입을 막지 못함). **conv.open 중복/재전달**은 이미 active/closed인 convId면 기존 accept 재송신 또는 reject(§4.1.3 멱등 확장). 2번째 이후 턴은 `conv_await` 폴링이 아니라 브릿지가 herdr `agent send`로 워커 pane에 직접 주입(§4.2) — **R23 M-2(제출 분리 — untrusted는 리터럴 send, 제출은 고정 상수 별도 호출)가 첫 프롬프트뿐 아니라 매 턴 적용**. |
| **mcp-server — 4도구** | `conv_open` / `conv_send` / `conv_await`(블로킹, timeoutSec) / `conv_close`만(CONV_SPEC §4.1). 내부는 기존 경로 재사용(opsHandoff sticky-RPC 우선·claim·mutateBoard·resolveTaskIndex) + §3.4 board 전이 자동 처리. 별도 conv_apply 없음 — `conv_await`가 claim+파싱+보드 반영 후 payload 반환(M-6 수신 경로 불변). 노드 조회는 기존 `list_peers`의 `node/` prefix 필터 재사용. |
| **artifact 전달(§5.2)** | git push/pull(conv 전용 throwaway 브랜치 `conv/<convId>/…`) 주수단, scp 폴백(`~/.loom/artifacts/<convId>/`). **1단계는 M-2 검증을 통과한 fetch 명령 문자열을 조립해 제시하는 데까지** — 자동 실행은 하지 않는다(실행은 에이전트/사람 판단, 비-스코프 참조). |
| **테스트** | `bun test` — conv 계약 스키마 왕복(open/accept/reject/turn/close), **M-1 pin 위조 거부 — 타워 수신 + 브릿지 수신 양측 케이스**(불일치 peerId 무시+로그, R25 M-1), turnSeq 멱등 폐기 + 배정 규약(짝/홀 검증), M-2 검증 함수 부정 케이스(선행 `-` 브랜치명·`conv/<convId>/` prefix 불일치·path traversal·wire의 host/URL 신뢰 거부), **미지 convId fail-closed 거부**(pin 상태 없는 convId의 turn/close/done_proposal 무시+로그, R25 M-2), §3.4 보드 매핑 전이, **L-5 중복 `conv.open` → accept 재송신 케이스**, **한도 초과 시 pause 보드 전이 케이스**(R25 L-1), 브릿지 턴 주입은 기존 fake herdr fixture(`docs/spikes/fixtures/herdr-v0.7.4/`) 재사용. |

**Fail-closed 기본값 (R25 M-2):** 타워/브릿지가 모르는(pin 상태가 없는) convId의 `turn`/`close`/`done_proposal`은 무시+로그 — **재시작으로 상태를 잃은 경우 포함**. 미지 convId 수신을 계기로 발신자에게 re-pin하는 관대한 재입양(re-adopt)은 금지한다. 영속화 설계 자체(재시작 시 conv 상태를 어디까지 보존할지)는 이 PLAN이 고정하지 않는다 — 구현 중 결정(in-memory 수용형 vs 최소 영속형 어느 쪽이든 이 기본값 하에서 보안 성질이 보존된다). 근거: R24 M-1 "pin 부재 = 거부"의 자연 귀결 + R23 M-1 "설정 부재 시 기본 거부"의 대칭.

**Out of scope (이 버전 아님 — `docs/CONV_SPEC.md` §8 승계 + 아키텍트 확정):** agentKind allowlist 확장(codex/grok 등 — 0.22.0과 동일하게 슬라이스는 `claude` 유지, 확장은 후속 PATCH); **artifact fetch 자동 실행**(M-2는 명령 조립을 방어하지 실행 여부를 결정하지 않음 — 1단계는 제시까지); 2+3 직결 채널(시그널링·재연결·폴백 상세 — §6 가드만 고정); crash 저널·bridge supervision(0.22.0과 동일 유보); 타워 stateless-relaunch(§4.2 — 2+3 진화 옵션 기록만); 실시간 관전 UX; 멀티파티 conv(1:1만, §8); **§5.4 정리(7일 삭제) 자동화**(R25 L-4 — 이 슬라이스는 삭제를 자동화하지 않는다; 1단계 삭제는 수동/생성측 판단, Security 섹션의 "위조 close = 삭제 시계 조기 가동" 논거는 그 수동 시계에 대한 것).

**Security / trust (R25 필수 이유):**
- **conv↔peer pin 미집행 시 위험(M-1, §2.1·§3.3):** authorizedDispatchers는 집합 검사라 인가 dispatcher가 2명이면 상호 conv 주입이 가능하다. 위조 턴은 타워 에이전트의 대화 입력으로 반복 소비되는 프롬프트 주입면이고, 위조 close는 §5.4의 7일 삭제 시계를 조기 가동(데이터 손실 인접)한다. `fromPeerId` 서버 지정(M-9)이라 집행 원시는 이미 존재 — 이 PLAN이 그 집행을 코드로 옮긴다.
- **artifact ref 기계 조립 방어(M-2, §5.3):** 수신 CLI가 검증 없이 fetch 명령을 조립하면 인자 주입(선행 `-` 브랜치명)·임의 host scp·path traversal이 스펙 준수의 결과물이 된다. 서버 sanitize는 방어가 아니다(제어문자·ESC만 제거, `sanitize.ts:18-50`) — M-2 검증 함수가 클라이언트 로컬 1차 방어선.
- **R23 M-2 매 턴 적용(§4.2):** 워커 pane 주입 경로는 R23이 잠근 제출 분리를 상속하며, 2번째 이후 턴에도 예외 없이 적용해야 프롬프트 자동 제출 위험이 재발하지 않는다.

**Review impact:** 새 MCP 표면(4도구) + 신뢰 경계 집행 코드(M-1 pin, M-2 검증 함수) + 와이어 인접(artifact fetch 명령의 로컬 조립 표면) → **R25 필수(Fable 5)**, §5.1 3중 해당(새 MINOR 표면·보안 경계 변경·프로토콜 인접). **relay 와이어 protocol v1은 무변경** — CONV_SPEC §0 원칙 그대로. 구현 중 스펙과 충돌하는 지점을 발견하면 **구현하지 말고** 아래 "R25 질의"에 기록한다(CONV_SPEC 재해석 금지).

**Unknowns (§3.5 → `docs/UNKNOWNS.md` §0.23.0):** `conv_await` 블로킹의 MCP 클라이언트별 tool-call 타임아웃 상호작용(실측 필요); 워커 pane 수명과 conv 수명 불일치(pane이 죽으면 conv는 pause인가 abort인가 — CONV_SPEC 미명시); 32k 임계 판정에서 herdr pane 스크레이프 기반 요약 회신과의 정합(`pane.read` 단발 회수가 실시간 턴 크기를 정확히 반영하는가); artifact fetch 명령 "제시"의 UX 표면(워커 CLI 프롬프트 노출 vs 사람 승인 큐 — 미정).

**R25 질의:** *(현재 없음. R25 검토는 PLAN 문안 lock 2건(M-1/M-2)으로 종결됐다 — 실제 구현 중 CONV_SPEC과 충돌을 발견하면 이 항목에 기록하고 해당 부분 구현을 보류한다.)*

**Approved by:** Fable 5 (fable-advisor) R25 — `pending-revision` → M-1(브릿지 측 conv↔peer pin·last-seen 집행 명문화)/M-2(미지 convId fail-closed 기본값) locks PLAN 본문 반영 → **author-close `approved`**(Fable 사전 승인, no R25b), 2026-07-18. L-1(테스트 열거 보강)·L-2(convId 형식 출처 표기)·L-3("정규화 후" 문구 복원)·L-4(§5.4 삭제 자동화 out-of-scope 명시) author-close.

**Implemented as of `e4dab9e` (2026-07-18, grok-impl 레인 · 아키텍트 독립 검증):** 13파일 +2,636줄 — `conv-contract.ts`(+tests)·`conv-ops.ts`·`conv-state.ts`(+tests)·`bridge-runtime.ts` conv 경로·MCP 4도구·CLI 0.23.0 범프. `bun test` **261/0** · 6패키지 typecheck green. M-lock 코드 확인: 양측 pin(`conv-state.ts:107` + conv-ops/bridge-runtime 호출부), fail-closed(`conv-state.ts:61-75,137`), M-2 검증(`conv-contract.ts:166-234` — argv 배열, 셸 연결 없음). 이탈 6건 `implementation-notes.md` §0.23.0. **Follow-up(후속 PATCH 후보):** ① §5.2 artifact 패키징 호출부(M-2 검증 함수는 완성·테스트됐으나 브릿지가 git push/scp 조립을 실제 호출하지 않음 — 32k 초과는 0.22.0 관례 tail-truncate 폴백, §5.1 "절단 금지"와의 정합은 이 PATCH에서 회복) ② done_proposal 탐지 휴리스틱(`[DONE_PROPOSAL]` prefix — 스펙 침묵 영역, 기본 normal) ③ conv.open M-1 deny 시 클레임 순서(카드 관례는 미클레임 — 저위험 divergence).

#### 0.22.0 — 2026-07-17 (`pending-review` R23 — **Loom×Herdr 노드 브릿지 수직 슬라이스 (`loom bridge`)**)

**Product one-liner:** 오너가 board 카드 한 장을 `dispatch_card`로 원격 노드에 보내면, 그 노드의 `loom bridge` 데몬이 herdr pane에서 에이전트를 실행하고 `[DONE]` 결과가 durable handoff로 돌아온다 — **relay 와이어(protocol v1) 무변경.**

**FREEZE 관계:** 오너 pull에 의한 **명시적 예외**(2026-07-17, 오너 승인: *"0.22.0 Loom×Herdr bridge — 오너 pull, FREEZE 예외 승인"*) — 이 게이트 **하나만**. 나머지 백로그(work-watch·MCP·C1/C2)는 동결 유지.

**Why:** Loom(휴먼 컨트롤 타워)과 herdr(에이전트 실행 멀티플렉서)의 결합점은 handoff 계층이고, herdr 소켓이 로컬 전용이라 각 노드에 브릿지가 구조적으로 강제된다 — 설계 전체는 **`docs/HERDR_DESIGN.md`**(멀티에이전트 워크플로 작성, 적대적 코드 대조 검증 반영). 선행 게이트 둘 다 **go**: **Step 0** WSL→Windows relay 인바운드 네트워킹(`docs/spikes/STEP0-WSL2-NETWORKING.md` — Win10 NAT 경로, health `version:1` + `LOOM-D3FT` join 왕복) + **Step 0.5** herdr 실측(`docs/spikes/STEP0.5-HERDR.md` — v0.7.4 / protocol 16, NDJSON 프레이밍, 보정 C1–C3, fixture `docs/spikes/fixtures/herdr-v0.7.4/`).

**What (범위 — 노드 1개 WSL 수직 슬라이스; 설계 정본 = HERDR_DESIGN §2–§5):**
| 항목 | 내용 |
|------|------|
| **`loom bridge` 데몬** | CLI 서브커맨드 + detach 데몬(별도 바이너리 아님). sticky host 데몬 관례 3종 재사용: spawn+unref+ping 폴링, `<session>.bridge.json` 메타 사이드카(0600, `profilesWithSession()` 제외 필터 1줄 동반), M-27형 안전 stop. herdr `ping` 성공 후에만 room join(fail-fast) (§2.1–§2.3) |
| **dispatch/done 컨트랙트** | 새 envelope 타입 **없음** — `mode:'task'` handoff + `[GOAL]`/`[DONE]` body 태그 + `intent:`/`task:`/`seq:` 독립 줄 헤더 + 라벨된 JSON attachment(`loom-card-dispatch`/`loom-card-result`). 상관관계 키 = `cardId`(M-9: handoff id 사용 불가). 클라이언트 로컬 zod 계약 `card-contract.ts` (§3.1–§3.3) |
| **herdr 클라이언트** | NDJSON 소켓(Step 0.5 fixture 고정) — `ping`/`agent.start`(env `LOOM_CARD`만)/`agent.send`(no-Enter)/`events.subscribe`(C2 이원 네이밍)/`pane.read` 단발/`session.snapshot` reconcile. 완료 감지는 C1 반영(report `done` 쓰기 불가 → detection/idle 조합) (§2.3–§2.5) |
| **네트워크 lock** | WSL 브릿지의 relay attach = **host NAT 게이트웨이 IP**(Win10, mirrored 불가 — Step 0 실측 `ws://172.27.80.1:7842/ws` 패턴). `127.0.0.1` 가정 금지 |
| **MCP 도구 (타워 측)** | `dispatch_card`(카드→handoff 발행 + `doing`/assignee/handoffId 기록) · `apply_card_result`(result JSON→board 반영: done→`done`, failed→`blocked`). 기존 3단계 등록 관례 (§3.6) |
| **보드 매핑** | `TaskStatus` 5종 그대로(컬럼 신설 없음). board는 local-only 유지 — `[DONE]` 반영은 오너 노드 로컬 갱신만 (§3.5) |
| **전달 시맨틱** | **at-most-once**(저널 없음) — claim 후 crash는 사람이 board에서 재발행. 타임아웃·자동재시도·supervision 의도적 생략 (§4.2–§4.3) |
| **테스트** | relay는 **in-process 실물**(ephemeral port), herdr는 **fixture 기반 fake 소켓 서버**(`Bun.listen({unix})`) — 오프라인 dispatch·peerSecret rejoin·fail-fast 부정 경로 포함. 실물 herdr는 수동 라이브 스모크 1회 (§5.3–§5.4) |

**Out of scope (이 버전 아님 — HERDR_DESIGN §7):** 진행 로그 스트리밍(pane.read 루프); 멀티 노드/Mac·Linux 복제; Windows 네이티브 herdr(named pipe — 구조적 회피가 존재 이유); relay 와이어·envelope 스키마 변경(별도 R{n}); board relay 동기화; 브릿지 supervision/자동 재시작; herdr 포크·벤더링(AGPL — 소켓 호출만); 카드발 argv/env 전달(영구 금지); crash 복구 저널(확장 1순위 §2.6).

**Security / trust (R23 필수 이유):**
- **원격 프롬프트 주입 신뢰 경계(판정 대상):** untrusted handoff body가 원격 노드의 에이전트 프롬프트로 주입됨. 브릿지 워커 pane은 **자율 실행 전용**(오너의 dispatch 행위 = 실행 승인)이라 0.21.1 M-2(no-auto-submit)와 **별도 신뢰 모델** — 이 구분 자체가 R23 명시 승인 대상(§2.5-4, §4.4.1). M-4의 절반(sanitize 산출물만 + `⚠ Untrusted` 마커)은 유지.
- **임의-argv 원격 실행 차단:** wire에 argv **금지** — `agentKind`만 싣고 argv 매핑은 브릿지 로컬 allowlist(슬라이스: `claude` 하나, `shell` 영구 제외). env는 브릿지 생성 `LOOM_CARD` 하나만 (§4.4.2).
- **자격증명:** relayToken(Bearer 헤더, URL 금지 H-6)·peerSecret(M-7 rejoin 열쇠) 0600 영속, `loomDir()` 경유(M-14) (§4.4.3).
- **AGPL 경계:** herdr는 무수정 바이너리 + 소켓 호출만 — 링크·벤더링 금지 (§4.4.4).

**Review impact:** 새 데몬 표면 + MCP 표면 확대 + 신뢰 경계 → **R23 필수(Fable 5)** (§5.1 기준 3중 해당). **relay 와이어 protocol v1 무변경** — handoff 옵셔널 필드 추가가 필요해지는 순간 별도 R{n}으로 분리(HERDR_DESIGN §3.1 비교표: 옵셔널 필드도 `resolveHandoff` 재구성 수정을 강제).

**Unknowns (§3.5 → `docs/UNKNOWNS.md` §0.22.0):** 장기 `events.subscribe` 구독 안정성(절단→재구독 공백); inbox 100건 trim vs 장기 오프라인 노드 유실 수용; 워커 pane 자동 제출의 별도 신뢰 모델 승인 가능성(R23 판단); herdr `done` 롤업 정확도(실제 Claude/Codex detection 미검증 — Step 0.5 잔여); WSL 절전/Windows 재부팅 시 소켓 생존.

**Binding on impl (R23 M-1…M-2 locks — 구현 필수):**
- **M-1 (High):** **dispatcher 인가** — 브릿지는 dispatch handoff의 `fromPeerId`가 브릿지 로컬 설정의 **authorized-dispatcher allowlist**(타워 peer id)에 있을 때만 실행한다. **label 매치 단독으로 실행 금지.** 비인가 dispatch는 무시+로그. 설정 부재 시 **기본 거부**. (근거: attachment label은 room 내 **모든** peer가 붙일 수 있어 "오너 dispatch = 실행 승인" 전제가 미집행 — `fromPeerId`는 서버 지정·peerSecret 없이 탈취 불가(room.ts:443, 241-251)이므로 집행 원시는 존재.)
- **M-2 (Med):** **제출 분리** — untrusted 텍스트는 오직 `agent.send` **리터럴로만** 전달. 제출은 untrusted 내용을 전혀 포함하지 않는 **고정 상수 입력(bare Enter)의 별도 호출**로 수행 — prompt를 `pane.run` 인자로 보간하는 것 **영구 금지**. 실제 제출 메커니즘은 fixture 검증 + 라이브 스모크로 확인. (근거: `agent.send`는 no-Enter 리터럴(Step 0.5 실측)인데 설계 §2.5-4 "send + 제출"의 제출 방식이 미정의 + §4.4.1 `pane.run` 금지와 자기모순이었음.)
- **L-1 (author-close):** label 매치 + zod 파싱 실패 시 조용한 무시 금지 — `failed reason=payload_invalid` 결과 회신(카드 `doing` 고착 방지).
- **L-2 (author-close):** `apply_card_result`는 claim한 handoff의 `fromPeerId`/`node`를 카드 `assignee`와 대조 — 불일치 시 경고·거부(위조 `[DONE]` 차단).
- **L-3 (author-close):** attachment 크기 사슬 보정 — relay는 초과 attachment를 truncate가 아니라 **거부**(bad_message)하므로 송신 측(타워·브릿지)이 직렬화 후 크기를 사전 검증. zero-width/bidi는 JSON.stringify가 이스케이프하지 않음(파싱 안전, 내용 무손실은 아님). 스키마 초안 `.nonneg()` → `.nonnegative()`.

**Approved by:** Fable 5 (fable-advisor) R23 — `pending-revision` → M-1/M-2 locks 본문 반영 → **author-close `approved`** (Fable 사전 승인, no R23b), 2026-07-17.

**Implemented as of 2026-07-17** — Grok impl lane. 신규: `card-contract.ts` · `herdr-client.ts` · `bridge-{config,meta,runtime,main,spawn}.ts` · `card-ops.ts` · MCP `dispatch_card`/`apply_card_result` · CLI `loom bridge start|stop|status`. **M-1** allowlist 기본 거부 · **M-2** `agent.send`+`BARE_ENTER` 분리 · L-1 payload_invalid 회신 · L-2 assignee/node 대조 · L-3 직렬화 사전 검증. 테스트: fake herdr + in-process relay (authorized dispatch, M-1 deny, offline queue+rejoin, fail-fast). VERSION **0.22.0** (CLI+MCP). `bun test` 213 pass/0 fail · 6-pkg typecheck green. **알려진 갭:** 실물 herdr 라이브 스모크는 수동 1회(§5.3) — 자동화는 fixture 전용.

#### 0.21.0 → 0.21.1 — 2026-07-11 (`approved` author-close after R22 `pending-revision` — **PTY handoff inject (원래 설계 유보 수신 경로 고도화)**)

**Product one-liner:** 수락한 handoff를 실행 중인 에이전트 **입력창에 유휴일 때만 붙여넣되(자동 제출 없이) 사람이 Enter** — 원래 v0.1.0 설계의 PTY 수신 경로를 R1이 정한 안전조건대로 고도화한다.

**Why:** 원래 설계(`docs/ORIGIN.md` §1)의 코어 수신 메커니즘은 **PTY stdin 주입**이었다. R1은 이를 **폐기가 아니라 Phase 1.5 유보**로 판정했다(`docs/spikes/PHASE-1.5-PTY.md`: default **no-go**, opt-in **deferred** — idle 감지 + 사람 수락 우선 필요). 기반코드(`handoff-inject.ts`의 `prepareInjectText`/`injectIntoStdin` — experimental 플래그 뒤, 기본경로 미호출)는 이미 있으나 고도화 미착수. 오너가 이 고도화를 **pull**(내부 도구 필수 기능, 2026-07-11) → **FREEZE 예외**. R1이 "가장 어려운 부분·결정적 리스크"로 지목한 영역이므로 **좁고 안전한 첫 슬라이스**로 착수한다.

**What (범위 — Claude-first · opt-in · accept+idle-gated):**
| 항목 | 내용 |
|------|------|
| **opt-in 플래그** | `loom run claude --inject-handoffs` — **기본경로(큐+`check_handoffs`/`inbox`)는 불변**(회귀 없음). 플래그 없으면 주입 코드 미도달. |
| **accept-gated** | auto-inject **금지**. 사람이 `inbox accept` / `claim_handoff`한 **특정** handoff만 주입 대상. |
| **idle-gated** | 에이전트가 **생성 중이 아닐 때만** 주입(R1 입력 레이스 방지). **1차 신호 = Claude Code hooks(Stop/idle), quiescence는 AND-보조만**(M-3). 감지 방식 상세는 Unknown(아래). |
| **no-auto-submit (M-2)** | trailing `\n` **금지** — bracketed-paste로 입력창에 채우고 **제출은 사람이 Enter**. 권한 프롬프트 대기 중 오판 주입이 위험 액션을 자동 승인하는 R1 최악형을 **구조적으로 차단**. |
| **주입 내용** | `prepareInjectText`로 sanitize + `⚠ Untrusted handoff content` 마커 포함(기존 함수 재사용, 단 M-2 모드에서 `\n` 강제 우회). |
| **제어 채널** | 실행 중 `loom run`(PTY 래퍼)에 "이 handoff 지금 주입" 신호를 넣는 경로. 구현 방식 Unknown. |
| **Claude Code만** | Codex/Grok(ratatui)은 idle 신호가 불명확 → **이 MINOR 범위 밖**(큐+폴링 유지). |

**Out of scope (이 버전 아님):** auto-inject(사람 수락 없이); Codex/Grok/기타 에이전트 주입; **생성 중(busy) 주입**; presence 오버레이/VT 에뮬레이터; MCP notify 경로 주입; 기본 수신 경로(큐+폴링) 변경; 와이어 프로토콜 변경.

**Security / trust (R{n} 필수 이유):** 주입은 에이전트 입력 스트림에 **untrusted peer 텍스트**를 쓰는 행위 → sanitize(`prepareInjectText`) + untrusted 마커 + **사람 수락 게이트**로 방어. opt-in 없으면 경로 비활성. R1의 결정적 리스크(입력 큐 꼬임·의도치 않은 제출)를 idle-gated로 완화하나, 완화의 신뢰성이 판정 대상.

**Review impact:** 수신 모델에 **새 경로 추가**(아키텍처 전제 변경) + R1 결정적 리스크 영역 → **R22 필수(Fable 5).** 와이어 프로토콜 **변경 없음**(주입은 클라이언트 로컬).

**Unknowns (§3.5 → `docs/UNKNOWNS.md` §0.21.0):**
- **에이전트 유휴 감지 메커니즘(판정 리스크):** Claude Code **hooks**(idle 이벤트) vs PTY 출력 **정적(quiescence) 휴리스틱**(N ms 무출력). 어느 게 신뢰 가능하며 오탐 시 어떻게 되나.
- **제어 채널:** `run-with-pty.py`(또는 Bun 래퍼)에 주입 트리거를 넣는 방식 — named pipe / unix socket / sticky RPC / 별도 fd.
- **accept→inject 구동 위치:** `loom run` 프로세스 vs sticky host 중 누가 주입을 실행하나(둘의 생명주기·소유권).
- **에이전트별 실제 동작 검증:** 주입 텍스트를 에이전트가 사용자 입력으로 처리하는가(Phase 1.5 수동 매트릭스 미완 — Claude Code부터 채운다).

**Binding on impl (R22 M-1…M-6 locks — 구현 필수):**
- **M-1 (High):** auto-inject 경로 **코드상 부재.** `injectIntoStdin` 호출부는 `--inject-handoffs` **AND** 명시 `accept`/`claim` 뒤에만 도달. flag off → 미호출 **테스트 필수**.
- **M-2 (High):** **no-auto-submit** — trailing `\n` 금지(paste-only, bracketed-paste), 제출은 사람 Enter. `prepareInjectText`의 `\n` 강제를 이 모드에서 우회. (권한 프롬프트 자동 승인 차단 — 이 lock 없이는 approve 불가.)
- **M-3 (High):** **fail-safe = no-inject.** hook 부재·불확실·busy면 취소 + 큐 유지(손실 없음). **buffer-and-apply-later 금지**(Phase 1.5 `busy_sleep_then_read` 실패 모드). accept당 **at-most-once**.
- **M-4 (High):** 주입 페이로드는 **`prepareInjectText` 산출물만**(sanitize + untrusted 마커). 임의 텍스트 주입 불가.
- **M-5 (Med):** 제어 채널은 **로컬 same-UID 전용**(0600 socket/pipe). **relay 발 트리거 금지.**
- **M-6 (Med):** 기본 큐+폴링 경로 + flag 없는 `loom run` **회귀 테스트 불변.**

**Approved by:** Fable 5 (fable-advisor) R22 — `pending-revision` → PATCH 0.21.1에 M-1…M-6 lock → **author-close `approved`** (Fable 사전 승인, no R22b).

**Implemented as of `d05d714`** (2026-07-12) — via codex-impl lane (GPT-5.5), 아키텍트 독립 검증. 신규: `inject-control.ts`(로컬 0600 소켓 제어채널)·`inject-handoffs.ts`(flag+Stop-hook). `handoff-inject.ts` paste 함수군, `run-with-pty.py` env-gated 주입(마커 ≤30s + quiescence ≥300ms + bracketed-paste no-newline). **M-1..M-6 전부 TS·python 양 레이어 코드 확인.** `bun test` 190 pass/0 fail, 6-pkg typecheck, biome(touched) clean, VERSION 0.21.1(CLI+MCP). **알려진 갭:** python 주입 경로는 코드리뷰만(런타임 미실행) — flag 활성화 전 라이브 스모크 권장(`implementation-notes.md`).

**FREEZE 관계:** 오너 pull에 의한 **명시적 예외**(2026-07-11) — 이 게이트 **하나만**. 나머지 백로그(work-watch·MCP·C1/C2)는 **동결 유지** — 팀 실사용 pull 전엔 열지 않음.

#### 0.20.0 — 2026-07-11 (`approved` R21 — **Tier A3: `loom doctor` 자가진단** · 구현 다음 세션)

**Product one-liner:** 낯선 사람이 막혔을 때 `loom doctor` 한 번으로 **어디가 문제인지** 스스로 안다.

**Why:** Tier A3(`docs/DOGFOOD_FEATURES.md` · `PRIORITIES.md §3 #4`). A1(설치)·invite(join)로 경로는 열렸지만, 첫-5분에 막히면(잘못된 profile, host 미기동, relay 미도달, loopback blob) **낯선 사람은 원인을 모른 채 이탈**한다(A2 마찰). 읽기전용 진단 한 명령이 "지금 상태 + 다음 한 걸음"을 알려주면 마찰이 준다. Docker 하네스가 이미 드러낸 실패 모드(PATH 미활성, unzip 부재, loopback relay)를 진단 항목으로 흡수.

**What (범위 — read-only, 상태 변경 없음):** `loom doctor`가 섹션별 `ok`/`warn`/`fail` + 다음 조치 힌트를 출력:
| 검사 | 내용 | 근거 표면 |
|------|------|-----------|
| **Install/env** | `loom` on PATH? (아니면 `scripts/install.sh` 안내) · `bun` 존재 · VERSION | `Bun.which`(loomCmd), `VERSION` |
| **Home/profile** | `~/.loom` 존재·쓰기가능 · active profile | `loomDir`, `getActiveProfile`, `resolveStateHomeDir` |
| **Session** | 방 참여 상태 · `inviteCode`/`relayUrl` 유무 | `loadSession` |
| **Relay** | `relayUrl` 파싱 · `/health` 도달성 · **loopback 경고(M-2: blob 타 머신 불가)** · non-loopback인데 token 없음 경고 | `parseRelayUrl`, `isLoopbackHost`, health GET |
| **Host** | sticky host online/offline · pid alive · relay connected | `resolveLiveHostMeta`, `describeHostMeta`, `stickyRpc({op:"status"})` |

**Out of scope (이 버전 아님):** 상태 **변경/자동수정**(진단만 — `--fix` 없음). 네트워크 프로브는 자기 relay `/health` GET만(스캔·외부 호출 금지). 새 의존성. MCP 표면 확대.

**Security / trust:** read-only. token/peerSecret 값 **출력 금지**(존재 여부만 `present`/`missing`). health GET은 세션의 relayUrl로만.

**Review impact:** 와이어/프로토콜 변경 없음. 새 CLI 서브커맨드(표면) → **R21 필수**.

**Unknowns (§3.5, MINOR 권장 → `docs/UNKNOWNS.md`):**
- exit code 계약 — 항상 0인가, `fail` 시 non-zero인가(스크립트/CI 사용), `--strict` 여부.
- `/health` 프로브 타임아웃·오프라인 relay에서 매달림 방지.
- 세션 없음(설치 직후)일 때 출력이 도움이 되는가(막 설치한 낯선 사람의 첫 실행 케이스).
- `loom doctor`가 auto-host를 절대 안 띄우는지(LOOM_NO_AUTO_HOST 무관 read-only 보장).

**Binding on impl (R21 M-1…M-4 locks):**
- **M-1:** relay 검사는 **`ensureRelay` 절대 호출 금지**(죽은 local relay를 spawn+pid write, `relay-daemon.ts:91-105`). `parseRelayUrl` + 직접 `fetch(origin+"/health", { signal: AbortSignal.timeout(3000) })`만.
- **M-2:** host 검사는 **`resolveAliveHostMeta` 금지**(stale meta를 `clearStickyMeta`로 삭제, `sticky-client.ts:25-27`). `loadStickyMeta`+`isPidAlive`로 stale을 **보고만**.
- **M-3:** exit code — `fail`≥1 → exit 1, `warn`만 → exit 0. `--strict`(warn도 non-zero)는 범위 밖.
- **M-4:** no-session(설치 직후)은 `fail` 아님 — Session/Relay/Host는 `info: no session — next: loom room join <blob>`.

**Approved by:** Fable 5 (fable-advisor) R21 `approved`, 2026-07-11 — binding M-1…M-4; L-1..L-3 author-close.

**Implemented as of `c15de88`** (2026-07-11) — via codex-impl lane (GPT-5.5), architect-verified. All M-1…M-4 met (M-1 direct /health+3s no ensureRelay · M-2 loadStickyMeta+isPidAlive report-only no resolveAliveHostMeta · M-3 exit 1 iff fail · M-4 no-session=info, live-confirmed exit 0). L-1..L-3 author-closed (`implementation-notes.md`). Read-only deviation documented (hand-rolled home/session resolution to avoid `resolveStateHomeDir` migration side-effect). `bun test` 180 pass/0 fail (5 new), 6 pkg typecheck green, biome clean, live `loom doctor` run verified. VERSION 0.20.0 (CLI + MCP).

#### 0.19.0 — 2026-07-11 (`approved` R20 — **Tier A1: 5분 설치 경로 (install script)**)

**Product one-liner:** 낯선 사람이 **한 줄**로 설치하고 5분 안에 방에 참여한다 — `curl -fsSL … | bash` → `loom room join <blob>`.

**Why:** 전략 최우선(Tier A1, `docs/DOGFOOD_FEATURES.md` · `LOOM_PURPOSE_REVIEW` #1)은 "다른 머신의 실제 사람 ≥2명 태우기". 0.18.0이 join의 3-비밀 문제를 blob으로 해소했으나, **설치(get-`loom`-runnable) 반쪽**이 여전히 막혀 있다. 현 README 경로는 수동 실패점 4개(Bun 유무·clone·`link`·PATH export)이고 `scripts/link-loom.sh`는 PATH 안내만 **출력하고 종료** → 낯선 사람은 거기서 멈춘다(첫-5분 마찰). Fable 5 방향 자문(2026-07-11): **Option 1 설치 스크립트** 커밋(②는 스크립트 내부 fallback 텍스트, ③ 바이너리는 spawn 리팩터 선행+비목표라 유보). repo는 PUBLIC 확인(익명 클론 가능) — Option 1 성립 전제 충족.

**What (범위):**
| 항목 | 내용 |
|------|------|
| **`scripts/install.sh`** | `curl \| bash` 가능. (a) Bun 없으면 설치, (b) 고정 디렉토리로 clone/update, (c) `bun install`, (d) `bun link`(packages/cli), (e) **절대경로 `$HOME/.bun/bin/loom --version`로 검증**, (f) 사용자 shell rc에 PATH 라인 **멱등 append**, (g) 마지막에 `exec $SHELL` 후 `loom room join <blob>` 명시 |
| **README 원라이너** | Quick start 최상단에 `curl -fsSL <raw-url> \| bash` 한 줄. 기존 A/B/C 표는 fallback으로 하단 유지(=Option 2 텍스트) |
| **명령 접두 스윕** | share/next-step 문자열의 `bun run loom`을 설치 감지 시 `loom`으로 해석하는 단일 helper(`loomCmd`)로 통일. 설치 안 됐으면 `bun run loom` 유지(회귀 없음) — cli `index.ts` share 라인(478/479)·next 라인(492/601) 등 |

**Security / trust (R{n} 필수 이유):**
- **`curl \| bash` 신뢰 경계** — 스크립트는 사용자 홈 디렉토리·shell rc만 건드림(sudo 없음), PATH append는 멱등(중복 금지), clone는 고정 URL(`lemonbalms/Loom`). 원격 스크립트 실행은 명시적 raw URL로만 안내(핀 대상=브랜치 vs 태그는 Unknown).
- **낯선 머신 first-run** = 새 제품 표면. Bun 설치 경로(공식 `bun.sh` installer 위임)의 신뢰 체인 명시.

**Review impact:** 프로토콜 **와이어 변경 없음**, 제품 런타임 로직 변경 없음(설치/문서/문자열 표면만). 새 표면 + `curl\|bash` 신뢰 경계 → **R20 필수**.

**Out of scope (이 버전 아님):**
- Prebuilt binary / `bun compile`(유보 — spawn `import.meta.url` 리팩터 선행). npm/npx·Homebrew·서명 설치본·Windows 서비스(비목표 유지). VPS relay 배포(병렬 **ops** 트랙 — A1과 무결합; 단 2머신 수용 테스트는 양쪽 필요). 기본 share 라인 토큰 자동 삽입(0.18.0 불변).

**Unknowns (§3.5, MINOR 권장 → `docs/UNKNOWNS.md`):**
- **PATH 활성화(판정 리스크):** `curl\|bash`는 호출자 셸을 못 바꿈 → "done인데 command not found". 완화=절대경로 검증 + rc append + `exec $SHELL` 안내. 검증 방법 충분한가?
- shell rc 감지 — bash/zsh/fish 중 어디에 append할지(멱등·다중 셸).
- 고정 clone 디렉토리 선택 + 기존 디렉토리/repo 충돌 시 update vs 거부.
- 재실행 멱등성(두 번 돌려도 안전).
- `curl\|bash` 핀 — main 브랜치 vs 태그(공급망 신뢰).

**Binding on impl (R20 M-1…M-4 locks):**
- **M-1:** bin dir는 `bun pm bin -g`(또는 `${BUN_INSTALL:-$HOME/.bun}/bin`)로 해석 — verify(`loom --version`)·rc append 양쪽 동일 값. `$HOME/.bun/bin` 하드코딩 금지.
- **M-2:** `exec $SHELL`를 마지막 실행 단계로 두지 말 것(`curl\|bash`는 stdin=파이프 → 즉시 EOF 종료). 안내로 출력하거나 tty 체크 후 `</dev/tty`로만 exec.
- **M-3:** `loomCmd` 스윕은 문자열별 열거형 — self-ref fallback 노트(`index.ts:495,604`)와 **실행되는** spawnSync(`index.ts:2350`)는 제외(리터럴/절대경로 유지).
- **M-4:** Bun을 script 내에서 설치하면 직후 해석된 bin dir를 `export PATH`(또는 절대경로 bun) — 이후 `bun install`/`bun link` 성공 보장.

**Approved by:** Fable 5 (fable-advisor) R20 `approved`, 2026-07-11 — binding M-1…M-4; L-1..L-4 author-close.

#### 0.18.0 — 2026-07-11 (`approved` R19 — **Self-contained invite (portable join blob)**)

**Product one-liner:** 낯선 사람을 다른 머신에서 **한 명령으로** 방에 넣는다 — `loom room join <blob>`.

**Why:** 전략 최우선(Tier A1, `docs/DOGFOOD_FEATURES.md` · `LOOM_PURPOSE_REVIEW`)은 "다른 머신의 실제 사람 ≥2명 태우기". 지금 원격 온보딩은 **비밀 3개 수동 전달**(invite `LOOM-XXXX` + `--relay ws://…` + `--token …`, cli `index.ts:160,180`)이 필요해 5분 안에 불가. 초대 하나에 relay 도달정보를 담으면 join이 단일 명령이 된다. (Fable 자문 R-consult: binary는 spawn 경로가 `.ts` 소스를 파일시스템에서 찾아 `bun compile`에서 깨지므로 **유보**; repo-clone(~3분)은 첫 사용자에 수용 가능. 진짜 병목은 3-비밀.)

**What (범위):**
| 항목 | 내용 |
|------|------|
| **Portable invite blob** | `{ relayUrl, token, inviteCode }`(현 `index.ts:473`이 이미 shell 문자열로 조립하는 3종)을 단일 문자열로 인코딩 — `loom://join/<base64url>` 또는 base64url blob |
| **`loom room invite --link`** | **opt-in** 명령: 현재 세션의 portable blob 출력. 기본 share 라인은 **token-less 유지**(UC-10.5 불변) — blob은 명시적 opt-in에서만 |
| **`room join <blob>`** | bare `LOOM-XXXX`(기존) **또는** blob 수용. blob이면 relayUrl+token+code 파싱해 `--relay`/`--token` 수동 없이 join |

**Security / trust (R{n} 필수 이유):**
- blob이 relay **token**을 운반 → 토큰 경로 변경. **H-5 불변**(non-loopback bind은 여전히 token 요구), 기본 share는 token-less 유지, blob은 bearer capability로 **명시적 opt-in**만. `LOOM-XXXX`도 이미 bearer secret(Fable 자문: H-5 안 깨짐).
- 새 제품 표면(`room invite --link`, invite 포맷).

**Review impact:** 프로토콜 **와이어 변경 없음**(join envelope 불변, blob은 CLI측 인코딩). 새 표면 + 토큰 경로 → **R19 필수**.

**Out of scope (이 버전 아님):**
- Prebuilt binary / `bun compile` (유보 — spawn이 `.ts` 경로 참조, 리팩터 선행). VPS relay 배포(ops). npm/npx publish. per-user 토큰 rotation·계정(멀티테넌트 유보 유지). 기본 share 라인에 토큰 자동 삽입(금지 — blob opt-in만).

**Unknowns (§3.5, MINOR 권장):**
- blob 포맷 `loom://` URL vs bare base64url — 파싱·복붙 견고성.
- 터미널/히스토리에 token 노출(blob) — 신뢰 코호트엔 수용, bearer secret임을 안내로 명시할지.
- relayUrl 정규화(ws:// vs wss://, 호스트 도달성) 검증 범위.

**Approved by:** Fable 5 (fable-advisor) R19 `approved`, 2026-07-11 — binding: M-1 (`loom://join/` prefix + parse order), M-2 (loopback guard); L-1/L-2 author-close.

#### 0.17.1 — 2026-07-10 (`approved` — **author-close**, R18 M-27/M-28 + L-33/L-34/L-35 locks)

**Why:** R18 `pending-revision` — `down`의 kill-safety가 프로세스 신원을 실제로 검증하지 않음(M-27) + multi-profile `up`이 전역 `sessionPath()`를 매 호출 재평가해 동시 처리 시 세션 혼선 가능(M-28). PLAN 텍스트 lock rows only; 새 아키텍처·표면·프로토콜 변경 없음. **No R18b.**

| Finding | Lock |
|---------|------|
| **M-27** | `down`/`host stop`이 쓰는 `stopStickyHostProcess`의 raw `SIGTERM` 폴백 전 **독립적 프로세스 신원 확인**을 통과해야 한다: 대상 pid의 cmdline에 `sticky-main.ts`가 포함되는지(`ps -p <pid> -o command=`) 확인(또는 시작 시각이 `meta.startedAt`과 근사). 확인 실패 시 **SIGTERM을 보내지 않고** meta만 정리한 뒤 경고를 출력한다. `pid alive` + `sessionPath` 문자열 일치만으로는 신원을 증명하지 못한다(reboot 후 pid 재사용). |
| **M-28** | multi-profile `up`/`down`은 profile을 **순차 처리(no `Promise.all`)** 하며, 각 profile 처리 직전 `setActiveProfile(profile, { explicit: true })`로 전역 세션을 고정한 뒤 `startStickyHostProcess`/`stopStickyHostProcess`를 **완전히 await** 한다. 동시 처리로 인한 `LOOM_SESSION` 혼입을 구조적으로 배제한다. |
| **L-33** | 테스트 하네스(`bun test` 실행 환경)는 `LOOM_NO_AUTO_HOST=1`을 기본 적용하여 auto-host가 CI/비대화형에서 sticky host를 조용히 스폰하지 않게 한다. Acceptance에 "bun test는 sticky host를 스폰하지 않는다"를 추가한다. |
| **L-34** | join의 auto-host는 기존 `stopStickyBeforeSessionChange()`(구세션 host 정지) 위에 겹쳐 정지→재시작 이중 동작이 되며 `startStickyHostProcess` 폴링이 최대 8초 걸릴 수 있다 — USER_GUIDE/DOGFOOD_LOOP에 명시하고, auto-host 성공 시 `host auto-started (pid N); disable with --no-host` 안내를 출력한다. |
| **L-35** | Acceptance에 ①idempotent double-`up`(meta 미손상) ②`LOOM_NO_AUTO_HOST=1` 시 join이 host 미시작 ③`down` 신원 확인 가드 단위테스트 존재를 추가한다. |

**Approved by:** plan author after R18 Decision notes (author-close per WORKFLOW §5.1; **no R18b**). **Implement next** under 0.17.1.

#### 0.17.0 — 2026-07-10 (`superseded` by 0.17.1; was `pending-revision` — **Launcher UX: up + host-default + work-first**)

**Why:** Work bus (0.16) delivers via handoff, but **operator UX still forces multi-terminal host/run mental model**. Owner feedback: “online 유지에 창이 왜 필요?” / “왜 터미널마다 구동?”. Sticky host is already a **background process** (`unref`), but **entry surface** still looks like per-role terminal ops. Goal: **background online by default; send work with board/handoff; open `run` only when working.**

**Product one-liner:**  
*`loom up` / `dogfood:up` brings room peers online in the background; join auto-starts sticky; users live on work bus; TUI `run` is opt-in for actual agent work.*

**Review impact:** MINOR — default behavior change on join, new multi-profile launcher, optional background watch. **No wire protocol change.** **R18 required.**

##### User journey (target — lock for docs/acceptance)

```text
아침 1회:  bun run dogfood:up     # 또는 loom up --profiles impl,claude-rev,codex-rev
           → 창 닫아도 peers online

낮 송신:   loom board add "…" --as claude-review
           loom handoff @claude-review "[R-REQUEST] …"
           → 끝 (host 수동 start 없음)

수신 인지: (옵션) dogfood:up 이 work-watch 데몬도 띄움
           또는 나중에 loom work

처리 시:   loom --profile claude-rev run claude   # TUI 창 1개만
           boot → check_handoffs → claim

결과:      loom work / inbox
```

##### In (scope) — four pillars

**1) `loom up` / `dogfood:up` (background multi-host)**

| What | Why |
|------|-----|
| `bun run dogfood:up` | Prefer enhance existing `scripts/dogfood-room-up.sh` (or sibling): ensure room + **start sticky host for each dogfood profile** (impl, claude-rev, codex-rev) if session exists |
| `loom up [--profiles a,b]` | Product CLI: for each profile with a session file, `startStickyHostProcess` in background; print summary table (profile, peer, host pid, online) |
| `loom down [--profiles …]` | Stop sticky hosts for those profiles (idempotent) |
| `loom up --status` / reuse dogfood:status | Show hosts alive + peers |
| No TUI spawned by up | **run is separate** (pillar 4) |
| Idempotent | Already-running host → “already running”, not error |

**2) Host default on join (hide host start for normal path)**

| What | Why |
|------|-----|
| After successful `room create` / `room join` | **Auto `host start`** for that profile (default **on**) |
| Escape hatch | `--no-host` on create/join **or** `LOOM_NO_AUTO_HOST=1` |
| Docs | USER_GUIDE: host is default; `host start/stop` advanced/power-user |
| CLI help | Deprioritize host in “daily path”; keep commands for stop/debug |
| Do **not** remove `host start/stop/status` | Power users + recovery |

**3) Work bus front-and-center (docs + thin CLI polish)**

| What | Why |
|------|-----|
| Docs rewrite daily path | Send = board/handoff; receive = work / run; not “6 terminals” |
| `loom work` already 0.16 | Ensure up/status mention work |
| Optional: `dogfood:up --watch` | Start `work watch` as background for listed profiles (log file under loomDir) — **opt-in flag** to avoid surprise CPU |
| Default up **without** watch | Watch is optional (L-31 CPU concern) |

**4) `run` only when working**

| What | Why |
|------|-----|
| Docs + dogfood loop | Explicit: online ≠ agent TUI; open run only to process |
| No auto-run on up | Never spawn claude/codex from up (cost, secrets, TUI) |
| Boot prompt path unchanged | `scripts/dogfood-reviewer-boot.txt` still first message on run |

##### Out (non-goals)

| Out | Why |
|-----|-----|
| CRDT / live multi-writer board | P3; orthogonal |
| Single process multi-peer in one OS process | Larger redesign; up multi-process is enough |
| Auto-claim | Untrusted; stays out |
| PTY inject | no-go |
| Auto `run` agents on up | User must opt into TUI/cost |
| Killing unrelated user processes | down only stops **our** sticky meta pids |
| Windows service installer | macOS/Linux dogfood first; launchd plist optional later not required in 0.17 |

##### Security / failure locks (authoritative — **0.17.1**)

| Case | Required behavior |
|------|-------------------|
| up only starts host for **profiles with existing session** | No invent peer / no join without invite |
| **M-27** `down` kill-safety | `pid alive` + `sessionPath` 문자열 일치만으로는 신원 증명 불가. raw `SIGTERM` 폴백 전 **독립 신원 확인**(cmdline에 `sticky-main.ts` 포함, `ps -p <pid> -o command=`; 또는 start-time ≈ `meta.startedAt`)을 통과해야 한다. 확인 실패 시 **SIGTERM 안 보냄** — meta만 정리 + 경고. |
| **M-28** Profile isolation | multi-profile `up`/`down`은 **순차 처리(no `Promise.all`)**; 각 profile 직전 `setActiveProfile(profile,{explicit:true})`로 전역 세션 고정 후 spawn/stop을 완전히 await. 절대 `LOOM_SESSION`을 profile 간에 섞지 않는다. |
| **L-34** Auto-host on join | Fail soft: host start 실패해도 join 성공(경고 + `host status` tip). 기존 `stopStickyBeforeSessionChange()`(구세션 정지) 위에 정지→재시작 이중 동작이며 폴링 최대 8초 소요 가능 — docs에 명시. 성공 시 `host auto-started (pid N); disable with --no-host` 출력. |
| **L-33** CI/test hygiene | 테스트 하네스는 `LOOM_NO_AUTO_HOST=1` 기본 — `bun test`가 sticky host를 스폰하지 않는다. |
| Logs | sticky remains stdout/stderr ignore (or optional log file path under loomDir, 0600) — no secrets in logs |
| Concurrent up | Idempotent; second up does not corrupt meta (already-running → "already running") |
| watch daemon (if --watch) | Same clamp as L-31; log path not world-writable |

##### Acceptance (0.17.1 — implement)

1. Fresh dogfood: `dogfood:up` (or room + up) → profiles host running; `peers` shows online without any `host start` typed manually.  
2. Terminal closed after up → `host status` still running (daemon).  
3. `room join` without `--no-host` → sticky auto-started for that profile.  
4. `room join --no-host` **or** `LOOM_NO_AUTO_HOST=1` → no sticky (L-33/L-35).  
5. `loom down` stops hosts; peers go offline (after presence update).  
6. Docs daily path matches journey above; no “6 terminals required” as default (L-34: join 정지→재시작 + 최대 8초 명시).  
7. **Idempotent double-`up`** does not corrupt meta (second run → "already running") (L-35).  
8. **`down` identity guard** unit test: pid alive but cmdline ≠ `sticky-main.ts` → meta cleared, **no SIGTERM** (M-27/L-35).  
9. **`bun test` does not spawn a sticky host** (harness sets `LOOM_NO_AUTO_HOST=1`) (L-33).  
10. `bun test` green; VERSION **0.17.1** on implement.

##### Implementation sketch (not approved work)

| Area | Touch |
|------|--------|
| `scripts/dogfood-room-up.sh` or `dogfood-up.sh` | multi host start after room ready |
| `packages/cli` `up` / `down` commands | loop profiles |
| `cmdRoomCreate` / `cmdRoomJoin` | auto host unless --no-host |
| package.json `dogfood:up` | alias |
| docs USER_GUIDE, DOGFOOD_LOOP, HANDOFF | journey rewrite |
| tests | unit: auto-host flag parsing; script dry-run if feasible |

**Unknowns:** `docs/UNKNOWNS.md` §0.17.0.

**R18 done → `pending-revision`** (`docs/plan_review.md` R18: M-27/M-28). **PATCH 0.17.1 applied** (M-27/M-28/L-33/L-34/L-35 locks above) → **author-close `approved`**. Implement Launcher UX under **0.17.1**.

#### 0.16.1 — 2026-07-10 (`superseded` by 0.17.0; was `approved` — **author-close**, R17 M-26/L-31/L-32 + work bus)

**Why:** R17 `pending-revision` — template line injection (M-26) + watch interval + MCP notify default.

| Finding | Lock |
|---------|------|
| **M-26** | Before substituting into handoff template, **flatten single-line fields** (title): replace `\r` `\n` `\t` with space. Parsers trust header only until first blank line. Board-stored title may keep newlines for display. |
| **L-31** | `loom work watch --interval`: **clamp ≥ 250ms** (warn if raised); default **2000ms** |
| **L-32** | MCP `add_task`/`update_task` **`notify` default false** (opt-in). CLI: assignee set ⇒ notify default on (CLI-only policy). |

**Approved by:** plan author after R17 Decision notes. **Implement next.**

#### 0.16.0 — 2026-07-10 (`superseded` by 0.16.1; was `pending-revision` — **Work bus**)

**Why:** Owner goal: **작업 내역을 실시간으로 전달하고, 받아서 바로 처리**. Purpose (0.15) + durable handoff (0.14) exist, but **board cards do not push work** and there is **no first-class “my work” CLI feed**. Dogfood still requires humans to remember `handoff` text; assignees do not learn about board tasks unless someone handoffs manually.

**Product one-liner:**  
*Board (and explicit work CLI) creates/assigns work → **handoff is the delivery bus** → assignee inbox notifies when online → `loom work` / receive path surfaces items for immediate claim/process. Not multi-writer CRDT board.*

**Review impact:** MINOR — behavior change on board mutations (optional/default notify), new CLI commands, possibly sticky poll. **Wire protocol v1 unchanged** (reuse handoff envelopes). **R17 required.**

##### Architecture lock (SSOT)

| Concern | SSOT |
|---------|------|
| **Delivery / queue / notify / durable** | **Handoff + inbox** (existing) |
| **Status tracking** | Board task (`handoffId` link when notify used) |
| **Purpose alignment** | Purpose card + body tags `[GOAL]` / `[R-REQUEST]` / … (0.15) |
| **Live multi-writer board** | **Out** — P3 CRDT later |

```text
board add/assign --notify (or policy default)
    → opsHandoff @assignee  body with tags + task:<id>
    → enqueue (+ notify if online)
    → assignee: sticky/run banner + loom work [watch] + check_handoffs → claim → process
    → [DONE]/board set done
```

##### In (scope) — S1 + S2

**S1 — Board → handoff bridge**

| What | Why |
|------|-----|
| `loom board add "title" --as @peer` **with notify** | Card UX creates real work delivery |
| Flag: `--notify` **or** default when `--as` present | Review: lock **default = notify when assignee set**; bare `board add` without `--as` = no handoff |
| `loom board assign <taskId> @peer --notify` | Re-assign pushes new handoff (or only if status still todo/doing) |
| Handoff body template (fixed shape) | Machine + human parse |
| Set `task.handoffId` from ack when notify succeeds | Board ↔ inbox link |
| MCP `add_task` / `update_task` optional `notify: true` | Agents can create work the same way |
| Fail closed if handoff `peer_unknown` | Do not pretend card was delivered; print error; task may still exist locally |

**Body template (plan lock):**

```text
[GOAL]
task:<taskId>
title: <sanitized title>
assignee: @name or peerId

<optional notes>

(Untrusted handoff — review before acting.)
```

For review-shaped work, caller may use `[R-REQUEST]` instead of `[GOAL]` via `--tag R-REQUEST` (optional; default `[GOAL]` for board notify).

**S2 — CLI work feed**

| What | Why |
|------|-----|
| `loom work` | List **my** open work: (1) inbox pending, (2) board tasks where assignee matches me and status ∈ todo\|doing\|blocked |
| `loom work watch` | Poll interval default **2s** (flag `--interval ms`); print new inbox ids / task changes to stderr; exit on Ctrl+C |
| `loom run *` start banner | Extend 0.15 banner: pending inbox **and** count of my open board tasks |
| Hint text | “Prefer loom work / check_handoffs; board --notify delivers via handoff” |
| Docs | USER_GUIDE “Work bus”; DOGFOOD_LOOP one-liner |

**Watch implementation (plan lock):**  
v1 = **client poll** of `list_inbox` + local `loadTaskBoard` (and sticky RPC when host up). **No new relay envelope** for board.changed in 0.16.0.

##### Out (non-goals)

| Out | Why |
|-----|-----|
| CRDT / multi-machine live board merge | P3; not required for deliver-and-process |
| Auto-claim without agent/human | Untrusted body; remains out (0.15) |
| PTY inject into agent stdin | Phase 1.5 no-go |
| sticky `board.changed` fanout / new wire types | Can be 0.16.x follow-up if poll insufficient |
| Desktop-only work UI | CLI first |
| Changing durable inbox / claim first-wins | Orthogonal |
| Default notify on **every** board set (status spam) | Only add/assign notify; status changes do not auto-handoff unless explicit later flag |

##### Security / failure locks (authoritative — **0.16.1**)

| Case | Required behavior |
|------|-------------------|
| Notify body | Full sanitize; untrusted banner on receive unchanged |
| **M-26** template fields | **Single-line flatten** for title (and any other header field): `\r` `\n` `\t` → space **at template insertion only**. Header block ends at first blank line. |
| Assignee resolution | Same as handoff (`@name` / peer id / unknown → error, no silent drop to `*`) |
| Spam | One handoff per add/assign notify; no loop on board set done |
| Local board residual | Same-UID multi-profile share board file — accepted (like today) |
| **L-31** watch interval | Default **2000ms**; CLI `--interval` **clamped ≥ 250ms** (stderr warn if clamped) |
| **L-32** MCP notify | **`notify` default false**; must pass `notify: true` explicitly. CLI assignee-implies-notify is CLI-only |
| MCP notify | If `notify: true` and no session/room → error |
| Partial failure | Task created but handoff fails → non-zero CLI + message; do not set handoffId |

##### Acceptance (implement under 0.16.1)

1. `board add "T" --as @bob` (bob on roster) → bob inbox has `[GOAL]` body with `task:task_…`; task.handoffId set.  
2. Without `--as`, `board add` does **not** handoff.  
3. Unknown assignee → handoff not silent-success; error visible.  
4. Title with embedded newlines does **not** inject extra `task:`/`assignee:` header lines in body.  
5. `loom work` as bob shows that task and/or inbox row.  
6. `loom work watch --interval 100` effectively ≥250ms.  
7. MCP add_task without notify does not handoff.  
8. `bun test` green; no protocol version bump.

##### Implementation sketch (approved under 0.16.1)

| Area | Touch |
|------|--------|
| `packages/host` `work-bus.ts` + task-board | template flatten, notifyTask |
| `packages/cli` board flags, `cmdWork`, run banner | |
| `packages/mcp-server` add_task notify opt-in | |
| `packages/adapters` hints | |
| tests | M-26 flatten; work list; interval clamp |
| docs | USER_GUIDE Work bus |
| VERSION | **0.16.1** on ship |

**Unknowns:** `docs/UNKNOWNS.md` §0.16.0.

**Implement under PLAN 0.16.1 `approved`.**

#### 0.15.1 — 2026-07-10 (`superseded` by 0.16.0; was `approved` — **author-close**, R16 M-24/M-25 locks + purpose implement)

**Why:** R16 `pending-revision` — verify[] exec trust boundary. PLAN-text locks only; no architecture change. **No R16b.**

| Finding | Lock (now in Failure/security locks) |
|---------|--------------------------------------|
| **M-24** | MCP `set_purpose` **must reject** create/modify of `verify[]` with **explicit error** (no silent drop). `verify[]` writable **only** via CLI `loom purpose set` (agent harness exec-permission stays on the only path that plants recipes). Remove “owner-controlled” wording for verify. |
| **M-25** | `loom verify` **prints full command list verbatim** before run. If `verify[]` hash ≠ last-acknowledged hash under `loomDir()`, require **TTY confirm** or explicit **`--yes`** (still echoes). Never silently run unacknowledged recipe. |

Also: L-30 last-writer-wins residual accepted (like board); `updatedByPeerId` OK.

**Approved by:** plan author after R16 Decision notes (author-close). **Implement next.**

#### 0.15.0 — 2026-07-10 (`superseded` by 0.15.1; was `pending-revision` — **Purpose-based sprint 1**)

**Why:** Loom exists for **purpose-based multiplayer development** (agents + humans aligned on a stated goal). P0–P2 shipped connect/handoff/durable queue, but work is still **task-shaped** (raw handoff text + board todos) without a **room-scoped purpose**, **intent contracts**, or a **receive path that starts execution**. Dogfood showed: handoff arrives, Claude/Codex UI stays empty until a human pastes or the agent happens to `check_handoffs`.

**Product one-liner (this MINOR):**  
*Anchor a Purpose on the room; stamp handoffs with intent; force receive-side claim loop; optional local verify recipe.*

**Review impact:** MINOR — new local data surface + agent receive contract + CLI. **R16 required.** Wire protocol v1 **unchanged** (purpose is local file + optional handoff attachment text; no new envelope types required in v1).

##### In (scope) — sprint 1

| What | Why |
|------|-----|
| **Purpose card** room-scoped local file | Single “why / DoD / out-of-scope” anchor for the room |
| CLI `loom purpose show \| set \| clear` | Human/agent can read/write purpose without editing JSON by hand |
| Schema v1 (below) | Stable fields for tools + docs |
| Optional attach on handoff: `--with-purpose` | Receivers see purpose without separate fetch |
| MCP `get_purpose` / `set_purpose` (**M-24:** set cannot write `verify[]`) | Agents pull purpose; cannot plant recipes via MCP |
| **Handoff intent tags** (convention + light parse) | `[GOAL]` `[R-REQUEST]` `[R-RESULT]` `[VERIFY]` `[DONE]` prefixes documented + helper to detect |
| Optional structured fields on handoff body header lines | `intent:` `goalId:` `round:` as first-line metadata (still body text — no wire change) |
| **Receive path (run start)** | On `loom run *`: after join, print pending inbox count + **force system/agent hint**: “NOW call check_handoffs; claim [R-REQUEST]/[GOAL]” |
| Strengthen `loomSystemHint` | Same contract for MCP-configured agents |
| Dogfood templates | `docs/DOGFOOD_LOOP.md` + `scripts/dogfood-reviewer-boot.txt` first-message paste |
| Board helper (optional thin) | `loom board add` from purpose next-gate line **or** document manual; prefer **auto-suggest print** not silent board mutation |
| **`loom verify` (lite)** | Run purpose.`verify[]` commands (default cwd repo); print pass/fail; optional handoff body template `[VERIFY]` |
| Docs | USER_GUIDE purpose section; PROTOCOL note “local only”; ARCHITECTURE purpose flow |
| Tests | purpose file round-trip; sanitize; path under loomDir; tag detect helper; verify dry-run empty recipe |
| VERSION bump on implement | CLI/MCP match PLAN after approve |

##### Purpose schema v1 (plan lock)

```ts
// ~/.loom/purposes/<sha256(roomId)[0:16]>.json  mode 0600
type PurposeV1 = {
  v: 1;
  roomId: string;
  roomName?: string;
  /** One-line north star */
  purpose: string;       // max ~500 chars sanitized
  /** Falsifiable success checks (human-readable) */
  successCriteria: string[];  // max 12 × ~300 chars
  /** Explicit non-goals */
  outOfScope: string[];       // max 12
  /** Shell recipes relative to process cwd when loom verify runs */
  verify: string[];           // max 8 × ~200 chars; e.g. "bun test"
  /** Free notes */
  notes?: string;
  updatedAt: string; // ISO
  updatedByPeerId?: string;
};
```

Atomic write pattern = host `atomic-json` (same as board/pack). Scope = **roomId** (shared across profiles same UID — intentional, like board).

##### Handoff contract (plan lock — body convention, not new wire types)

| Prefix | Intent | Expected receiver action |
|--------|--------|---------------------------|
| `[GOAL]` | Align / set work against purpose | Read purpose; optionally `purpose set` only if owner role |
| `[R-REQUEST]` | Plan/code review request | Reviewer: `fable-advisor` subagent if Claude; write plan_review; no product implement |
| `[R-RESULT]` | Review outcome | Implementer: apply Open blocking only or ship |
| `[VERIFY]` | Evidence of DoD | Record pass/fail; do not invent green |
| `[DONE]` | Claim work complete | Point to evidence (sha, tests) |

Detection helper in `@loom/protocol` or host: `parseHandoffContract(body) → { tags, intent? }` — best-effort, never blocks send.

##### Receive path (plan lock)

| Step | Behavior |
|------|----------|
| `loom run` after successful join | `list_inbox`; if count>0 stderr: yellow banner + top ids/tags |
| Agent hint | **Must** include: on start and between tasks → `check_handoffs` then `claim_handoff` for `[R-REQUEST]`/`[GOAL]`/`[VERIFY]` |
| Auto-claim | **Out of v1** (too dangerous unattended). Human/agent still claims. |
| PTY inject of body into agent stdin | **Out** (Phase 1.5 no-go) |

##### Out (non-goals for 0.15.0)

| Out | Why |
|-----|-----|
| Wire protocol new envelope types | Keep v1; body convention + local files first |
| Auto-claim without agent | Untrusted body risk |
| PTY inject / wake dead agent process | Prior no-go; OS-specific |
| Full playbook orchestrator YAML | Later; docs templates enough for sprint 1 |
| Live CRDT board / cloud accounts | P3 |
| Purpose encryption / multi-tenant | Overkill |
| Changing claim first-wins or durable inbox | Orthogonal (0.14 done) |
| Desktop UI purpose tab | Later; CLI/MCP first |

##### Security / failure locks (authoritative — **0.15.1**)

| Case | Required behavior |
|------|-------------------|
| Purpose strings | Same sanitize as peer text before store/display |
| Path | Only under `loomDir()/purposes/`; hash roomId filename |
| Corrupt purpose file | backup `.corrupt-*` + throw/empty with error (board pattern) — **not** silent empty success |
| Purpose fields (non-verify) | Same-UID room peers may write purpose/successCriteria/outOfScope/notes via CLI or MCP (board-class residual; document) |
| **M-24** `verify[]` write path | **MCP `set_purpose` MUST reject** any request that creates or modifies `verify[]` with an **explicit error** (not silent drop). **`verify[]` writable only via CLI** `loom purpose set` (and related CLI-only paths). Do **not** call this “owner-controlled” — gate is **CLI vs MCP**, not peer role. |
| **M-25** `loom verify` run gate | Before executing: **print every command verbatim**. Compute hash of `verify[]`; if ≠ last-ack hash stored under `loomDir()` (e.g. `purposes/<id>.verify-ack`), require **interactive TTY confirm** or **`--yes`** (still prints list). Persist ack hash only after successful confirm/`--yes`. Never silent unacknowledged run. |
| `verify` execution | Run only **local disk** `purpose.verify[]` via controlled spawn (no remote handoff argv injection; no freeform `shell: true` of handoff body) |
| Untrusted handoff | Tags do not skip untrusted banner |
| L-30 multi-profile | last-writer-wins on purpose file — accepted residual like board; `updatedByPeerId` optional |

##### Acceptance (implement under 0.15.1)

1. `loom purpose set "…"` then `show` round-trips; file 0600 under purposes/.  
2. `loom handoff @x "…" --with-purpose` includes purpose summary in attachments or body section.  
3. `loom run shell` (or mock) after queued `[R-REQUEST]` prints pending inbox banner.  
4. System hint text contains check_handoffs/claim contract (unit string test).  
5. `parseHandoffContract("[R-REQUEST] …")` detects tag.  
6. `loom verify` with `verify: ["bun test"]` prints commands; first run needs confirm/`--yes`; exits non-zero on fail (or skip if recipe empty).  
7. MCP `set_purpose` with `verify` field → **error** (M-24).  
8. `bun test` green; no protocol version bump required.  
9. Docs: USER_GUIDE + DOGFOOD_LOOP boot prompt committed.

##### Implementation sketch (approved under 0.15.1)

| Area | Touch |
|------|--------|
| `packages/host/src/purpose.ts` (+ test) | load/save/schema; verify ack hash; CLI vs MCP set |
| `packages/cli` purpose + verify + run banner | M-25 gate |
| `packages/adapters/src/hints.ts` | receive contract |
| `packages/mcp-server` | get_purpose; set_purpose **rejects verify[]** |
| `packages/protocol` (optional) | parseHandoffContract |
| `docs/DOGFOOD_LOOP.md`, `scripts/dogfood-reviewer-boot.txt` | |
| VERSION | bump on implement ship |

**Unknowns:** `docs/UNKNOWNS.md` §0.15.0.

**Implemented as of 0.15.1** (purpose.ts, CLI purpose/verify, MCP get/set_purpose M-24, verify M-25, hints receive path).

#### 0.14.2 — 2026-07-10 (`superseded` by 0.15.0; was `approved` — **author-close**, P2 durable security harden)

**Why:** Adversarial dogfood (Codex) showed (1) `writeAtomicJson` could write-through a final-path symlink (TOCTOU) and (2) `removePeer`/mutations swallowed persist I/O errors → leave appeared OK but peer/inbox **resurrected** after restart.

| What | Why |
|------|-----|
| `writeAtomicJson`: realpath parent, unlink symlink at final, no write-through | Symlink TOCTOU |
| `saveRoomSnapshot` path must stay under realpath(stateDir) | Path escape |
| Persist failures **throw**; leave/claim/addPeer/routeHandoff **rollback** memory | Fail closed durability |
| Server replies `persist_failed` instead of half-applied leave | Wire honesty |
| Tests: symlink victim untouched; leave EACCES no resurrection | Regression |
| VERSION **0.14.2** | CLI/MCP parity |

**author-close, Low security harden** (no re-R{n}; tightens 0.14.1 locks).

#### 0.14.1 — 2026-07-10 (`superseded` by 0.14.2; was `approved` — **author-close**, R15 M-21/M-22/M-23 locks)

**Why:** R15 `pending-revision` — three Med findings, all **PLAN-text lock rows** only (no architecture change). Decision notes: PATCH → **author-close, no re-review (no R15b)**.

| Finding | Lock (now in Failure/security locks table) |
|---------|-----------------------------------------------|
| **M-21** | Auto-daemon **must** pass `LOOM_RELAY_STATE_DIR=join(loomDir(),"relay-state")` to child; standalone/remote `loom relay` documents independent default (gate-exempt) |
| **M-22** | Hydrate reconstructs `members`/`inboxes` from stored `secret` — **never** `addPeer` / `generatePeerSecret` |
| **M-23** | **(a) required:** pid-ownership exclusive lock on state dir / per-room write (same class as `atomic-json.ts` `withFileLock`) in relay-local `persist.ts` — not “optional” |

Also: L-28/L-29 remain Low backlog (non-blocking). Cross-ref L-29 disk growth residual under locks table.

**Approved by:** plan author after R15 Decision notes (author-close). **Implement next** under 0.14.1.

**Implemented as of 0.14.1** (CLI/MCP VERSION **0.14.1**).

#### 0.13.15 — 2026-07-10 (`approved` — **author-close**, dogfood multi-profile / Codex MCP)

**Why:** Inside `loom run`, inherited `LOOM_SESSION` overrode CLI `--profile` (wrong peer inbox). Codex global config still had legacy `mcp_servers.fable` → `/tmp/fake-stdio.ts`. MCP `serverInfo.version` lagged at 0.13.3.

| What | Why |
|------|-----|
| CLI `--profile` → `setActiveProfile(..., { explicit: true })` beats `LOOM_SESSION` | Dogfood multi-peer ops from agent shells |
| MCP `serverInfo.version` **0.13.15** | Parity with CLI |
| DOGFOOD_LOOP §6.1 | Codex MCP + sticky host recovery |
| (ops, not git) `~/.codex/config.toml` → strip fable, install `mcp_servers.loom` (codex-rev) | Unblock Codex tools |

**Not** P2 durable inbox / not R15 scope. **author-close, Low dogfood DX.**

#### 0.14.0 — 2026-07-10 (`superseded` by 0.14.1; was `pending-revision` — **P2 durable relay state**)

**Why:** PRIORITIES **P2** — relay restart currently wipes in-memory rooms, roster (`peerSecret`), and per-peer handoff inboxes. Offline-safe handoff is only process-lifetime durable; product north star needs handoffs to survive local/remote relay restarts.

**Review impact:** MINOR + **security/data** surface → **R15** → pending-revision → **0.14.1** locks + author-close. Wire protocol stays v1.

##### In (scope)

| What | Why |
|------|-----|
| Persist **room meta** (id, name, inviteCode, createdAt) on disk | Rejoin same invite after relay restart |
| Persist **roster** incl. **peerSecret** (M-7) | Identity rejoin proof survives process death |
| Persist **pending inbox** (`queued` \| `notified` only) | Handoff bodies/attachments not lost on restart |
| Load all room snapshots at relay start into `RoomRegistry` | Transparent recovery; clients use existing session |
| Atomic write (temp + rename + **mode 0600**) | Same pattern as board/pack; no torn JSON |
| Default state dir `~/.loom/relay-state/` (override `LOOM_RELAY_STATE_DIR`) | Align with `~/.loom` local-first; remote relay = host machine disk |
| Per-room file `<sha256(roomId)[0:16]>.json` | Bound path; no raw roomId in filename |
| Persist after create / join-mutate / leave / enqueue / claim | Durability = last successful mutation |
| On load: all peers **offline** (`socket = null`) | No fake online; presence reattaches on rejoin |
| Production `loom relay` / auto-daemon: durable **ON** by default | Real dogfood path recovers |
| Tests: `persist: false` or `LOOM_RELAY_EPHEMERAL=1` | Unit tests stay hermetic; no home pollution |
| Caps unchanged (100 inbox/peer, attach size, etc.) | Disk DoS bound same as memory L-11/L-16 |
| leave still drops peer inbox + roster entry + flush | Explicit leave semantics unchanged |
| claim/accept first-wins + delete terminal entry + flush | No re-claim after restart |
| Docs: ARCHITECTURE, RISK, PROTOCOL residual, USER_GUIDE restart, TEST_PLAN UC | Honesty after implement |
| CLI/MCP **VERSION** bump on implement ship (0.14.x) | Plan was ahead of code; ship with implement |

##### Schema (snapshot v1 — plan lock)

```ts
// packages/relay — conceptual; exact field names free in impl if zod-validated
type RoomSnapshotV1 = {
  v: 1;
  room: { id: string; name: string; inviteCode: string; createdAt: string };
  members: Array<{
    peer: { id: string; displayName: string; color: string; agentKind: string; joinedAt: string };
    secret: string; // M-7 — never log; file 0600 only
  }>;
  inboxes: Record<string /* peerId */, Array<{
    status: "queued" | "notified";
    toPeerId: string;
    handoff: HandoffPayload; // existing protocol shape
  }>>;
  colorIndex: number;
  updatedAt: string; // ISO
};
```

##### Out (non-goals for 0.14.0)

| Out | Why |
|-----|-----|
| Protocol wire / envelope changes | Transparent server-side durability |
| Chat history persistence | Separate product surface |
| Live board CRDT / multi-writer board | P3 |
| Encryption at rest / KMS | Residual: OS-user file perms (document) |
| Multi-relay HA / shared-disk multi-writer | Single relay process owns state dir |
| Claimed/accepted archive | Terminal entries already deleted (L-11) |
| Room auto-GC / TTL eviction of disk rooms | Keep process+disk; GC later if needed |
| Client session / sticky / desktop API changes | Reuse existing rejoin + list_inbox |
| Moving `atomic-json` into protocol (optional later) | Relay may ship small `persist.ts` (host→relay cycle if import host) |

##### Failure / security locks (authoritative for implement — 0.14.1)

| Case | Required behavior |
|------|-------------------|
| Missing state file | Treat as empty; create on first write |
| Corrupt JSON | Backup `*.corrupt-<ts>`; **skip that room**; log error; never silently treat as empty success for that file |
| Write I/O error | Log; keep in-memory truth for process life; retry on next mutation |
| **M-21** state dir / M-14 | **Auto-daemon** (`ensureLocalRelay` / `relay-daemon` spawn) **must** set child env `LOOM_RELAY_STATE_DIR = join(loomDir(), "relay-state")` so durable path honors the same home migration gate as sessions. **Standalone / remote** `loom relay` (no host parent): default may be `~/.loom/relay-state` or `LOOM_RELAY_STATE_DIR` if set — **documented as gate-exempt** (operator owns home layout). Never invent a second home that ignores live `.fable` PID gate without docs. |
| **M-22** hydrate secrets | **Hydrate must NOT call `addPeer` / `generatePeerSecret`.** Reconstruct `members` Map and `inboxes` Map **directly** from snapshot fields (including stored `secret`). New joins after load still use `addPeer` as today. |
| **M-23** multi-writer | **Required (a):** relay-local `persist.ts` uses **pid-ownership exclusive lock** (same class as `packages/host/src/atomic-json.ts` `withFileLock` — lock dir + owner.pid, reclaim only if owner dead). Apply around load-all and each room snapshot write. Port bind + `relay.pid` remain; lock is **not optional**. (Option b — ephemeral-only `dev:relay` — is **not** the sole control.) |
| Two processes same state dir | Port bind + `relay.pid` **and** M-23 file lock; second process must fail loud (log/exit), not silent last-write-wins |
| peerSecret on disk | **0600**; never in logs/health; same residual class as `session.json` peerSecret |
| Remote operator | Host UID can read secrets — **accepted** local-first residual (document) |
| Load order / invite index | Rebuild `byId` + `byCode` from all snapshots; **L-28** invite-code collision → log (do not silent last-wins without log) |
| **L-29** disk growth | Room files accumulate until explicit leave/GC — residual accepted (Out: no auto-GC in v1); document in USER_GUIDE/ARCHITECTURE on ship |

##### Acceptance (implement under 0.14.1)

1. handoff → kill relay → restart same state dir → target `list_inbox` still has entry; `claim`/`accept` works once.  
2. After claim, restart → entry gone (first-wins).  
3. leave peer → restart → peer + inbox absent.  
4. Rejoin with correct `peerSecret` OK; wrong/missing → `peer_auth_failed`.  
5. Corrupt one room file → other rooms still load.  
6. `LOOM_RELAY_EPHEMERAL=1` → no state files written.  
7. Auto-daemon child has `LOOM_RELAY_STATE_DIR` under `loomDir()` (M-21).  
8. Restart does **not** mint new secrets for existing peers (M-22).  
9. Second writer against locked state dir fails loud (M-23).  
10. `bun test` + `bun run smoke:uc` green.

##### Implementation sketch (approved under 0.14.1)

| Area | Touch |
|------|--------|
| `packages/relay/src/persist.ts` (new) | snapshot schema, path, atomic write 0600, **pid lock (M-23)**, loadAll |
| `packages/relay/src/room.ts` | serialize hooks; **hydrate without addPeer (M-22)**; registry load/save |
| `packages/relay/src/server.ts` / `cli.ts` | wire stateDir from env; ephemeral flag |
| `packages/host/src/relay-daemon.ts` | **must** pass `LOOM_RELAY_STATE_DIR` (M-21) |
| Tests | unit persist + restart simulation; hydrate secret stability; lock contention; no live port required |

**Unknowns:** see `docs/UNKNOWNS.md` §0.14.0.

**Implemented as of 0.14.1** (`packages/relay/src/persist.ts`, Room hydrate M-22, `relay-daemon` M-21, process lock M-23). R15 Med closed by lock rows above.

#### 0.13.14 — 2026-07-10 (`superseded` by 0.14.0; was `approved` — **author-close**, TUI resize robust)

**Why:** Owner still saw fixed Claude layout after 0.13.13; SIGWINCH often delivered only to Loom parent.

| What | Why |
|------|-----|
| `run-with-pty.py` openpty + 200ms winsize poll | resize without relying on signal delivery |
| Loom parent `forwardWinch` → python child | parent is foreground process group |
| VERSION **0.13.14** | PATCH dogfood |

#### 0.13.13 — 2026-07-10 (`superseded` by 0.13.14; was `approved` — **author-close**, TUI resize / SIGWINCH)

**Why:** `script(1)` PTY fixed Claude kqueue but frozen terminal size at launch; resize ignored.

| What | Why |
|------|-----|
| `scripts/run-with-pty.py` (python3 `pty.spawn`) | forwards SIGWINCH + TIOCSWINSZ |
| Prefer python-pty over `script` for TUI agents | dynamic cols/rows |
| VERSION **0.13.13** | PATCH dogfood |

#### 0.13.12 — 2026-07-10 (`superseded` by 0.13.13; was `approved` — **author-close**, TUI PTY for Claude)

**Why:** `loom run claude` started then Claude (Bun TUI) crashed with EINVAL kqueue on inherited tty.

| What | Why |
|------|-----|
| `runTuiAgent`: script PTY → fds → /dev/tty | real PTY for Claude/Codex/Grok |
| stdio `[0,1,2]` instead of inherit | less Bun stream wrapping |
| workaround tip if all fail | direct `claude --mcp-config` |
| VERSION **0.13.12** | PATCH UC-9.3 |

#### 0.13.11 — 2026-07-10 (`superseded` by 0.13.12; was `approved` — **author-close**, shell fd-only)

**Why:** Even `process.stdout.isTTY` / stdin stream APIs trigger Bun TTY WriteStream kqueue crash.

| What | Why |
|------|-----|
| REPL reads `readSync(0)` only | no process.stdin |
| spawn stdio `[0,1,2]` | no inherit streams |
| VERSION **0.13.11** | PATCH |

#### 0.13.10 — 2026-07-10 (`superseded` by 0.13.11; was `approved` — **author-close**, writeSync stderr)

**Why:** Crash was on `process.stderr.write` itself (`WriteStream` / kqueue), not only readline.

| What | Why |
|------|-----|
| `eprint`/`print` via `writeSync(1|2)` | bypass Bun TTY stream layer |
| `cmdRun` / shell REPL use eprint | UC-9.2 dogfood |
| VERSION **0.13.10** | PATCH |

#### 0.13.9 — 2026-07-10 (`superseded` by 0.13.10; was `approved` — **author-close**, shell REPL no node:tty)

**Why:** Owner hit Bun `EINVAL kqueue` / `WriteStream` crash via readline `terminal:true`.

| What | Why |
|------|-----|
| REPL = raw `stdin` line loop | avoid `node:tty` WriteStream |
| try/catch around run shell | no hard crash |
| VERSION **0.13.9** | PATCH |

#### 0.13.8 — 2026-07-10 (`superseded` by 0.13.9; was `approved` — **author-close**, shell REPL default)

**Why:** Nested zsh under Bun still returned to the outer prompt with no fallback message (Owner dogfood). Default `run shell` is now an in-process **Loom REPL**.

| What | Why |
|------|-----|
| `run shell` → `loom-shell>` REPL | reliable interactive UC-9.2 |
| `run shell --nested` | optional real $SHELL |
| shortcuts: `peers` → `bun run loom peers` | less typing |
| VERSION **0.13.8** | PATCH |

#### 0.13.7 — 2026-07-10 (`superseded` by 0.13.8; was `approved` — **author-close**, UC-9.2 shell robust)

**Why:** Nested zsh still exited immediately for Owner after 0.13.6.

| What | Why |
|------|-----|
| shell spawn: `/dev/tty` → `script` PTY → inherit → **Loom REPL** | always leave an interactive prompt |
| VERSION **0.13.7** | PATCH dogfood |

#### 0.13.6 — 2026-07-10 (`superseded` by 0.13.7; was `approved` — **author-close**, UC-9.2 shell)

**Why:** `loom run shell` exited immediately after “Starting Shell…” (non-interactive zsh under Bun spawn).

| What | Why |
|------|-----|
| shell adapter `-i` | force interactive zsh/bash |
| `cmdRun` uses `node:child_process` stdio inherit | better TTY for agent child |
| immediate-exit tip | dogfood diagnosis |
| VERSION **0.13.6** | PATCH |

#### 0.13.5 — 2026-07-10 (`superseded` by 0.13.6; was `approved` — **author-close**, R14 Low L-26/L-27)

**Why:** Owner chose Low backlog before P2; close R14 residuals.

| What | Why |
|------|-----|
| **L-26** desktop `load_live_meta` F-2 room/peer match | parity with CLI `resolveLiveHostMeta` |
| UI CTA `session_mismatch` | clear host restart guidance |
| **L-27** pack embed open `O_NOFOLLOW` + fd read + re-check | reduce check→read TOCTOU |
| VERSION **0.13.5** | PATCH Low |

**Review impact:** R14 said Low may author-close; no re-R{n} required.

#### 0.13.4 — 2026-07-10 (`superseded` by 0.13.5; was `approved` — **R14** cumulative trust)

**Why:** Owner chose **P1-B** — external R{n} over author-close series 0.11–0.13.3.

| What | Why |
|------|-----|
| R14 code review (sticky / pack embed / claim / XSS / requestId / install DX) | Trust gate before next MINOR |
| `docs/plan_review.md` R14 | Findings L-26, L-27 Low only |
| PRIORITIES P1 → done | Next = P2 durable inbox |
| No CLI feature change | Review/docs PATCH only |

**Review impact:** R14 **approved**. No blocking fixes required.

#### 0.13.3 — 2026-07-10 (`superseded` by 0.13.4; was `approved` — **author-close**, P0 install DX)

**Why:** Short-term priorities doc + make `loom` easy to run without guessing PATH.

| What | Why |
|------|-----|
| `docs/PRIORITIES.md` | P0=install DX, P1=trust, P2=durable inbox, P3=big features |
| `scripts/loom` | Repo-local wrapper (`PATH=…/scripts`) |
| `bun run link:loom` / `unlink:loom` | Bun global bin for `loom` |
| README / USER_GUIDE install options A/B/C | Dogfood friction |
| VERSION **0.13.3** | PATCH DX |

#### 0.13.2 — 2026-07-10 (`superseded` by 0.13.3; was `approved` — **author-close**, dogfood UX)

**Why:** Real-use dogfood fixes after Owner request.

| What | Why |
|------|-----|
| `renderInbox` resolves fromPeerId → displayName + attachment count | List showed raw `p_…` only; pack embed invisible until accept |
| inbox accept loads peers for `formatIncomingHandoff` from-name | Same dogfood pain |
| Share/Next tips: `bun run loom …` + PATH note | `loom: command not found` after create |
| host stop tip when no host: same `--profile` | Stop without profile looked broken |
| VERSION **0.13.2** | PATCH dogfood |

#### 0.13.1 — 2026-07-10 (`superseded` by 0.13.2; was `approved` — **author-close**, Low backlog)

**Why:** Close backlog **L-4 residual** — wire-level `requestId` on RPC request/reply (beyond FIFO waiters).

| What | Why |
|------|-----|
| Client messages optional `requestId` | Correlation token |
| Reply envelopes optional `requestId` (BaseEnvelope) | Relay echo |
| `RelayServer.reply` echoes id on create/join/handoff/list_*/claim errors | End-to-end match |
| `RelayClient.requestOnce` always sends id; match by id when present | Concurrent same-type RPCs |
| FIFO type-match remains if reply has no id | Backward compatible with older relays |
| VERSION **0.13.1** | PATCH: protocol optional field |

**Approval provenance (honest):**

| | |
|--|--|
| **When** | 2026-07-10 (commit `676d4f3`, ~11:01 +0900) |
| **Who** | Plan author / implementer (agent session under Owner “다음 진행해”) — **not** Reviewer Fable 5, **not** explicit Owner approve |
| **How** | Author-close after Low backlog implement; declared “no re-review required” |
| **Not** | R14 / formal review sign-off / Owner decision log row |

Git author on machine: local `skywk` account (agent commit via that identity).

#### 0.13.0 — 2026-07-10 (`superseded` by 0.13.1; was `approved`)

**Why:** Close backlog **L-5** with **opt-in** pack file-body embed — re-resolve allowlist at **send/read** time (TOCTOU).

| What | Why |
|------|-----|
| `packToAttachments({ embedFiles })` + `embedPackFileBodies` | L-5: re-check path under cwd allow root before read |
| CLI `--with-pack-embed` (implies pack attach) | Explicit opt-in; default paths-only unchanged |
| MCP `withPackEmbed` | Agent parity |
| Caps: 8 files, 64k chars/file, skip binary/dirs/oversized | Keep handoffs bounded |
| Host tips use `bun run loom host …` | UX (PATH without global bin) |
| VERSION **0.13.0** | MINOR: new attach surface |

Default `--with-pack` still **paths/notes only**. Receivers treat path attachments as metadata (not auto-open FS).

No full re-review required (Low backlog L-5; security-conservative caps + re-resolve).

#### 0.12.2 — 2026-07-10 (`superseded` by 0.13.0; was `approved`)

**Why:** Desktop can **send** handoffs/chat (not only receive); show invite code for share.

| What | Why |
|------|-----|
| sticky `handoff` / `chat` via desktop invoke | Complete human loop without CLI |
| Send tab: to peer / `*` / modes message\|task\|chat | Sticky RPC already supported |
| Status: invite code + `loom room join …` hint | Share without leaving app |
| `smoke:desktop` covers handoff + chat | Regression |
| VERSION **0.12.2** | Parity |

No re-review (uses existing sticky ops; M-19/M-20 unchanged).

#### 0.12.1 — 2026-07-10 (`superseded` by 0.12.2; was `approved`)

**Why:** GUI polish after 0.12.0 dogfood; keep external pitch honest.

| What | Why |
|------|-----|
| Desktop: auto-refresh 5s, R key, last-updated, tab badges | Scanability / less manual refresh |
| Inbox: resolve fromPeerId → displayName via peers map | UX |
| Board: group tasks by status | Scanability |
| `docs/PITCH.md` → v0.12.0 (Board shipped, smoke) | Pitch was stale (said Board deferred) |
| CLI / desktop VERSION **0.12.1** | Parity |

No re-review (UX + docs honesty only).

#### 0.12.0 — 2026-07-10 (`superseded` by 0.12.1; was `approved`)

**Why:** Close M-18 deferral with **option A** — board via sticky host RPC + desktop Board tab. Dogfood sticky path automated.

| What | Why |
|------|-----|
| sticky `list_tasks` / `add_task` / `update_task` | Same local board file as CLI/MCP; F-3 serialized |
| Desktop Board tab + add/status update | Product surface; textContent-only (M-20) |
| `bun run smoke:desktop` | Headless dogfood (status/peers/inbox/board/401) |
| CLI / desktop VERSION **0.12.0** | Parity |

Security: titles/notes sanitized on sticky out; no token to webview; no new bind.

No re-review required beyond R13 locks (Board path A was listed option; XSS/transport unchanged).

#### 0.11.2 — 2026-07-09 (`superseded` by 0.12.0; was `approved`)

**Why:** Implement M4.3b thin **Tauri desktop shell** per **0.11.1** locks.

| What | Why |
|------|-----|
| `apps/desktop` Tauri 2 + static `ui/` | Product desktop surface |
| Rust sticky client (`sticky.rs`) + invoke commands | M-19: no webview fetch/token |
| Views: Status / Peers / Inbox (claim/accept) | Sticky RPC surface |
| Host CTAs: none / stale_pid / unauthorized / refused | L-25 |
| textContent-only UI (`app.js` setText) | M-20 |
| No Board UI | M-18 C |
| `bun run desktop` / `cargo test` in src-tauri | Dev path |
| CLI / MCP VERSION **0.11.2** | PLAN parity |

**Implemented as of 0.11.2.** No re-review (implements approved 0.11.1).

#### 0.11.1 — 2026-07-09 (`superseded` by 0.11.2; was `approved`)

**Why:** R13 **pending-revision** close — lock M-18 / M-19 / M-20 before any `apps/desktop` code.

| Finding | Decision (locked) |
|---------|-------------------|
| **M-18** | **Option C** — **Board out of v1** shell. Views = Status / Peers / Inbox only. Board UI deferred (needs sticky board ops or explicit file path later). |
| **M-19** | **Rust-side sticky RPC only** — Tauri `invoke` → Rust HTTP to `127.0.0.1` + Bearer. **No** webview `fetch` to sticky. **No** CORS on sticky required. |
| **M-19** session | Resolve session file: `LOOM_SESSION` → profile via `LOOM_PROFILE` / `~/.loom/profiles/<name>.json` → default `~/.loom/session.json`. Meta = that path’s `*.host.json`. |
| **M-19** / **L-24** token | Token + raw `*.host.json` **Rust only**. Webview never receives token or meta file contents; only invoke results (peers/inbox/status DTOs). |
| **M-20** | Peer strings: **textContent / text binding only** — **no `innerHTML`**. `@loom/protocol` sanitize is **terminal ESC**, not HTML escape — do not treat sanitize as XSS fix. |
| **L-25** | Acceptance host-absent cases split (below). |
| L-22 | UNKNOWNS 0.11 filled from R13. |
| L-23 | `GET /health` unauthenticated on loopback — **accepted** (ok:true only). |

No re-review required (R13 said PATCH then author-close). **Implement next** under this approved plan.

##### Scope (v1 shell — **in**) — supersedes 0.11.0 tables

| What | Why |
|------|-----|
| `apps/desktop` Tauri **2** (Rust + web UI) | Product desktop surface |
| Data via **sticky host** loopback `POST /rpc` only | No second WS join; reuse F-3 |
| Transport: **Rust invoke → HTTP** (not webview fetch) | M-19; no sticky CORS |
| Views: **Status**, **Peers**, **Inbox** (list / claim / accept) | Sticky RPC already covers |
| Host required: CTA if missing / stale / unauthorized | L-25 |
| Peer UI: textContent-only; optional terminal sanitize for ESC | M-20 |
| Loopback sticky only; CSP default-deny | H-5 / XSS surface |
| Dev: `bun run desktop` / `cargo tauri dev` | Contributors |

##### Explicitly **out** of 0.11.1 v1

| Out | Why |
|-----|-----|
| **Board UI / board sticky ops** | M-18 **C** — defer |
| Live multi-writer board CRDT | Later |
| Pack file-body embed (L-5) | Paths-only |
| Agent TUI embed / PTY inject | Spike no-go |
| Cloud relay / accounts | Local-first |
| Webview holding host token or calling sticky HTTP | M-19 / L-24 |

##### Architecture sketch (locked)

```
[ Tauri webview ]  ──invoke only──►  [ Rust commands ]
                                        │ read *.host.json (token never to JS)
                                        │ HTTP POST 127.0.0.1:<port>/rpc + Bearer
                                        ▼
                                 [ loom sticky host ] ──WS──► [ relay ]
```

##### Security checklist (locked)

| Topic | Rule |
|-------|------|
| Host token | Rust-only; 0600 meta; never log; never to webview |
| Bind | Sticky loopback; desktop opens no public server |
| XSS | textContent only; sanitize.ts ≠ HTML escape |
| Path attachments | Display only |
| CSP | default-deny; no remote script CDN |

##### Acceptance (v1)

1. Room + `loom host start` → desktop shows peers online/offline.  
2. Inbox list + claim/accept; first-wins vs CLI.  
3. **No Board view** in v1 (M-18 C).  
4. Host problems — distinct CTAs: (a) no meta / host not running → start host; (b) stale pid / dead meta → clear+restart; (c) 401/refused → token/meta mismatch. No crash.  
5. XSS: payload displayName/body containing `<img onerror=…>` renders as **text only** (automated or manual).  
6. `bun test` green; desktop smoke optional separate.

##### Review impact

R13 closed by this PATCH. **Approved by** plan author after R13 required locks (0.8.1/0.10.1 pattern).

#### 0.11.0 — 2026-07-09 (`superseded` by 0.11.1; was `pending-revision`)

**Why:** Phase **M4.3b** draft — thin Tauri shell via sticky RPC.  
**R13:** `pending-revision` (M-18/M-19/M-20) — resolved in **0.11.1**.

Draft scope (Board “if RPC covers”, webview fetch wording) **superseded** — do not implement 0.11.0 tables.

#### 0.10.3 — 2026-07-09 (`superseded` by 0.11.0; was `approved`)

**Why:** Docs honesty + backlog hygiene after dual-compat cutover; unlock next product gate (Tauri) now that Rust toolchain is present.

| What | Why |
|------|-----|
| `docs/ADAPTERS.md` → Loom paths / `loom` CLI / `mcp_servers.loom` | User-facing docs still said `fable` / `.fable` / `FABLE_*` |
| Open follow-ups defaults: bin `loom`, session `~/.loom` | Stale pre-rename defaults |
| plan_review: close optional `fable` bin row; note L-19 residual only intentional legacy | 0.10.2 already removed bins |
| HANDOFF: Tauri unblocked (`cargo`/`rustc` available) | Product next gate was wrongly still “no Rust” |
| CLI / MCP VERSION **0.10.3** | PLAN ↔ runtime string parity |

No re-review required (docs + status honesty only; no runtime surface change beyond version string).

#### 0.10.2 — 2026-07-09 (`superseded` by 0.10.3; was `approved`)

**Why:** Complete dual-compat cutover for **CLI entrypoints** — remove transitional `fable` / `fable-mcp` bins.

| What | Why |
|------|-----|
| `@loom/cli` bin: `loom` only | Product surface is Loom |
| `@loom/mcp-server` bin: `loom-mcp` only | Same |
| Root script `fable` removed | Use `bun run loom` |
| **Still keep:** `FABLE-` invites, `fable-board-snapshot` import, MCP strip of legacy fable tables | On-disk/wire data compat |

No re-review required (documented Owner optional after R12; Low surface break for alias only).

#### 0.10.1 — 2026-07-09 (`superseded` by 0.10.2; was `approved`)

**Why:** R12 **M-17** — wire relay URL/host/port/token through `envLoom` so FABLE_* warns; Codex session-entry.

| What | Why |
|------|-----|
| `resolveRelayEndpoint` / relay cli / `loom relay` use `envRelay*` | M-17 no silent local fallback without warn |
| `envTokenInQuery` for relay-client | L-20 pattern |
| L-17 warn test + L-18 legacy board snapshot test | R12 Low |
| `AGENTS.md` Codex ritual + `bun run status` | Codex/Claude session entry |

#### 0.10.0 — 2026-07-09 (`superseded` by 0.10.1; was `pending-review` → R12 `pending-revision`)

**Why:** Drop **runtime dual-compat** for rename transition (RENAME Phase E / 0.10).

| What | Why |
|------|-----|
| Env: **LOOM_* only** (FABLE_* warns, not read) | End dual-read window |
| Slash: **/loom only** (`/fable` → help / no dual-accept) | Product CLI surface |
| sticky-spawn: LOOM_SESSION/PROFILE only | Match write-path policy |
| Relay token/host/port: LOOM only | Same |
| **Keep:** `FABLE-` invite join, `fable-board-snapshot` import, MCP strip of legacy fable tables, `fable` bin alias | Data/tooling compat (conservative) |

**Implemented as of 0.10.0.** Awaiting **R12**.

**Not in 0.10.0:** remove `fable` bin; remove legacy invite/board accept; L-5 embed; Tauri.

#### 0.9.4 — 2026-07-09 (`superseded` by 0.10.0; was `approved`)

**Why:** Backlog **L-4** — concurrent `requestOnce` stole acks by replacing `onEnvelope`.

| What | Why |
|------|-----|
| FIFO `pendingRequests` queue on RelayClient | Concurrent handoffs each get an ack |
| Do not hijack `opts.onEnvelope` | User listen handlers always see envelopes |
| claim_result match prefers handoff id | Concurrent claims less ambiguous |
| Reject pending on close/leave | No hung promises |
| Integration test concurrent handoffs | L-4 regression guard |

**Not in 0.9.4:** wire-level `requestId` correlation (optional later if multi-multiplex needs it). Sticky RPC serialization (F-3) remains.

No re-review required (Low backlog PATCH; conservative client-only fix).

#### 0.9.3 — 2026-07-09 (`superseded` by 0.9.4; was `approved`)

**Why:** Backlog **L-14** / **L-16** (R10 Low).

| What | Why |
|------|-----|
| `timingSafeStringEqual` / `timingSafeTokenEqual` in `@loom/protocol` | Single compare impl for relay token + peer secret (L-14) |
| room/server/sticky import shared util | No divergent copy drift |
| Attachment/body caps documented as **chars** (JS string length), not bytes | L-16 honesty |

No re-review required (Low backlog PATCH).

#### 0.9.2 — 2026-07-09 (`superseded` by 0.9.3; was `approved`)

**Why:** R11 Low residual — product-facing “Fable” strings, MCP WARNING scope, legacy INSECURE env warn.

| What | Why |
|------|-----|
| User-facing CLI/adapter/sticky tips → `loom` | Branding consistency |
| `isManagedComment` scoped WARNING to mcp_servers only | Avoid deleting unrelated comments |
| Warn if only `FABLE_RELAY_INSECURE_OPEN` set | RENAME §4.1 UX; still no dual-read open |
| MCP serverInfo version 0.9.2 | Stale 0.7.3 cleanup |

No re-review required (Low residual PATCH).

#### 0.9.1 — 2026-07-09 (`superseded` by 0.9.2; was `approved`)

**Why:** R11 **pending-revision** — M-14 migration bypass, M-15 sticky env, M-16 missing tests.

| What | Why |
|------|-----|
| `relay-daemon` / `mcp-server` config use `loomDir()` | M-14: no hardcode `~/.loom` that orphans `~/.fable` under live-PID gate |
| sticky-spawn writes `LOOM_SESSION`/`LOOM_PROFILE` (+ FABLE dual) | M-15 write-path LOOM_* |
| Tests: live-PID gate + `FABLE-` full-code join (no rewrite) | M-16 RN1 Phase D |
| `LOOM_TEST_HOME` + `resetStateHomeDirCache` | testable migration |

**Approved by:** plan author after R11 M-14/15/16 fix (rename baseline).

#### 0.9.0 — 2026-07-09 (`superseded` by 0.9.1; was `pending-review` → R11 `pending-revision`)

**Why:** Product rename **Fable → Loom** (disambiguate review agent fable-advisor / Fable 5). Plan: `docs/RENAME_TO_LOOM.md` (RN1-patched).

| What | Why |
|------|-----|
| CLI `loom`, packages `@loom/*`, env `LOOM_*`, `~/.loom` | Public identity |
| Dual-read most `FABLE_*` (not `INSECURE_OPEN`) | Compat without H-5 regression |
| Home migrate with live-PID gate | No sticky/relay split-brain |
| Invite mint `LOOM-`; join exact full code (no prefix rewrite) | No room collision |
| MCP `mcp_servers.loom` + exact-anchor dual-strip | H-4 + no bare “loom” wipe |
| Slash `/loom` + `/fable`; `[LOOM HANDOFF]`; loom system hint | User/agent surfaces |
| `fable` bin alias 1 minor | Transition |

**Implemented as of 0.9.0** (code + tests 116 pass). Awaiting **R11**.

#### 0.8.1 — 2026-07-09 (`approved`)

**Why:** R10 **pending-revision** — M-13 silent join failure on `fable run`; L-15 sticky peerSecret persist.

| What | Why |
|------|-----|
| `fable run` checks `joinRoom` result; exit 1 on `error` | Do not spawn agent off-room (M-13) |
| run/listen/sticky `onError` → stderr | Reconnect `peer_auth_failed` not silent |
| run `onEnvelope` handles `error` | Live error envelopes visible |
| sticky (+ run) save `peerSecret` from `room.state` | L-15 parity with room-ops |
| `RelayClient.setReconnectPeerSecret` | Keep auto-reconnect creds in sync |

**Approved by:** plan author after R10 M-13/L-15 fix (re-review of M-7 core not required per R10).

L-14 (shared timing-safe util), L-16 (KB vs chars) remain backlog.

#### 0.8.0 — 2026-07-09 (`superseded` by 0.8.1; was `pending-review` → R10 `pending-revision`)

**Why:** R5/R9 backlog **M-7** — token + invite alone must not allow taking over another peer’s roster identity / inbox.

| What | Why |
|------|-----|
| Relay mints `peerSecret` (base64url 24B) on first join/create | Unforgeable rejoin proof bound to `peer.id` |
| Rejoin with existing `peer.id` requires matching `peer.secret` (timing-safe) | Blocks identity takeover by invite+token holders |
| `room.state.peerSecret` only to the joining socket (never roster broadcast) | Secret not leaked to other peers |
| Session stores `peerSecret` (mode **0600**); sticky/CLI reconnect sends it | Survive disconnect / sticky host restart |
| Error `peer_auth_failed` on mismatch / missing secret | Explicit failure mode |
| Threat model updated in `apps/relay-cloud/README.md` + PROTOCOL | Operators know residual risk |

**Implemented as of 0.8.0** (code + tests). Awaiting **R10** review.

**Not in 0.8.0:** rotating secrets; mTLS/JWT peer certs; secret recovery if session file lost (must rejoin as **new** peer id).

#### 0.7.3 — 2026-07-09 (`superseded` by 0.8.0; was `approved`)

**Why:** R9 L-12 backlog — safer file locks for board/pack concurrent updates.

| What | Why |
|------|-----|
| Lock `owner.pid` — only reclaim if owner **dead** and lock **stale** | Two waiters must not rmdir a live lock |
| Release only if pid matches (or force reclaim dead) | Accidental unlock of peer process |
| `sleepMs` via `Bun.sleepSync` / `Atomics.wait` | No busy-spin CPU burn |

Re-review not required (Low backlog PATCH).

#### 0.7.2 — 2026-07-09 (`superseded` by 0.7.3)

**Why:** R9 L-11 backlog — bound relay memory for large handoff attachments / board snapshots.

| What | Why |
|------|-----|
| Attachment content max **256_000 chars** (JS length, not bytes), max **32** attachments, body max **100_000 chars** | DoS / memory (L-11; units clarified L-16) |
| Inbox max **100** entries/peer with trim | Bound growth |
| Claim/accept **deletes** entry (no permanent claimed retention) | Repeated `--with-board` cannot pin memory |

Re-review not required (Low backlog PATCH).

#### 0.7.1 — 2026-07-09 (`superseded` by 0.7.2; Phase 4.3a baseline)

**Why:** R9 `pending-revision` — board snapshot trust boundary.

| What | Why |
|------|-----|
| **M-10:** ISO timestamp + clamp to now in `normalizeTimestamp` | peer spoofed `updatedAt` cannot dominate merge |
| **M-11:** always `parseBoardSnapshot` (no kind cast shortcut) | malformed tasks crash |
| **M-12:** `resolveHandoffEntryIndex` for import-handoff | M-8 regression |
| **L-9:** foreign `sourceRoomId` requires `--force` | accidental cross-room merge |
| **L-10/L-13:** sanitize timestamps/names; format who/id/mode | peer-controlled strings |

**Merge trust model:** after clamp, higher `updatedAt` wins; spoofed future times become import-time.

#### 0.7.0 — 2026-07-09 (`superseded` — R9 pending-revision)

**Why:** Phase 4.3a — multi-machine board **share** without live relay sync (Tauri deferred: no Rust toolchain in env).

| What | Why |
|------|-----|
| `fable board export` / `import` (merge\|replace) | Portable snapshot JSON |
| `handoff --with-board` + MCP `withBoard` | Attach `fable-board-snapshot` attachment |
| `fable board import-handoff <ho_id>` | Apply snapshot from inbox |
| MCP `export_board` / `import_board` | Agent-side portability |
| Honest scope: **not** live multi-writer remote board | Avoid false "synced" claims |

**R9:** M-10/M-11/M-12 → **0.7.1**.

**Not in 0.7.0:** relay-persisted board CRDT, Tauri UI, auto-merge conflicts UI.

#### 0.6.1 — 2026-07-09 (`superseded` by 0.7.0; Phase 4.2 baseline)

**Why:** R8 `pending-revision` — task board integrity + handoff id sanitize.

| What | Why |
|------|-----|
| **H-7:** `writeAtomicJson` + `withFileLock` + corrupt backup (board **and** pack) | Concurrent agents must not wipe board |
| **M-8:** task id exact/suffix only; empty/ambiguous error | Silent wrong-task updates |
| **M-9:** relay always generates handoff id; sanitize id/from/mode on output | Peer-controlled string invariant |
| L-6 id format on normalize; L-7 `clear-done --yes`; L-8 Security docs | R8 Lows |

#### 0.6.0 — 2026-07-09 (`superseded` — R8 pending-revision)

**Why:** Phase 4.2 task board — track work without leaving the multiplayer room workflow.

| What | Why |
|------|-----|
| Local room-scoped board (`~/.fable/boards/<hash(roomId)>.json`, 0600) | Same model as context pack (UID+room shared) |
| Statuses: todo / doing / done / blocked / cancelled | Minimal kanban |
| `fable board show\|add\|set\|assign\|note\|rm\|clear-done` | Human CLI |
| MCP `list_tasks` / `add_task` / `update_task` | Agent tooling |
| `handoff --board` or `mode=task` → create linked task | Handoff ↔ board |
| Optional `handoffId` on tasks | Traceability (no referential integrity after relay restart) |

**R8:** H-7 concurrent write, M-8 id match, M-9 handoff id → **0.6.1**.

**Not in 0.6.0:** relay-synced board, multi-machine live board, Tauri UI, dependency graph.

#### 0.5.1 — 2026-07-09 (`superseded` by 0.6.0; Phase 4.1 baseline)

**Why:** R7 Low follow-ups (L-1–L-3); re-review not required.

| What | Why |
|------|-----|
| **L-1:** document room-scoped pack sharing (same UID + roomId) | Intentional; not profile-isolated |
| **L-2:** symlink→outside-cwd rejection test | Regression guard for allowlist |
| **L-3:** path attachment label prefix `context-pack-path:`; hint sender-relative warning | Receiver identification + trust |
| Security invariant: receivers never fs-open pack paths | Display/metadata only until v2 redesign |
| Review docs: `plan_review_archive.md` for R1–R6 | Structure debt |

**Deferred:** L-4 requestOnce correlation id; L-5 v2 embed TOCTOU re-resolve.

#### 0.5.0 — 2026-07-09 (`superseded` by 0.5.1; R7 **approved**)

**Why:** Phase 4.1 context pack — portable room context without reimplementing agents.

| What | Why |
|------|-----|
| Local **room-scoped** pack (`~/.fable/packs/<hash(roomId)>.json`, 0600) | summary + cwd-allowlisted paths + notes; **same OS user + same roomId → one pack file (all profiles)** |
| `fable pack show\|set\|add\|remove\|note\|clear` | Human manage pack |
| `handoff --with-pack` / MCP `withPack` | Share pack only on send (attachments) |
| MCP `get_context_pack` | Agents read local pack |
| Path allowlist = cwd realpath | Security (no escape to /etc etc.) |
| No file body embed in v1 | Keep envelopes small; paths only |

**R7:** approved; L-1–L-5 → 0.5.1 / backlog.

**Not in 0.5.0:** relay-shared pack across machines, auto-sync, full file content embed, task board, Tauri.

#### 0.4.1 — 2026-07-09 (`superseded` by 0.5.0; Phase 4.0a baseline)

**Why:** R6 `pending-revision` — sticky host correctness/security PATCH.

| What | Why |
|------|-----|
| **F-2:** `resolveLiveHostMeta` requires meta.roomId/peerId == session; room create/join stops host | 구 room으로 handoff 오배달 방지 |
| **F-3:** sticky `/rpc` handlers serialized (promise chain) | 동시 handoff/claim ack 혼선 방지 |
| **F-1:** sticky Bearer uses `timingSafeTokenEqual` | M-5 회귀 제거 |
| Tests: session mismatch; concurrent RPC | 회귀 가드 |

**Implemented as of 2026-07-09.** Re-review optional (PATCH).

#### 0.4.0 — 2026-07-09 (`superseded` — R6 pending-revision)

**Why:** Phase 4.0a — sticky long-lived host as foundation for context pack / task board.

| What | Why |
|------|-----|
| `fable host start\|stop\|status` | Opt-in daemon holds one WS + auto-reconnect per session |
| Loopback IPC `POST /rpc` + Bearer token in `*.host.json` (0600) | CLI/MCP avoid join→close per call |
| `opsListPeers` / handoff / inbox / claim prefer host, **fallback one-shot** | Backward compatible |
| MCP tools return `via: host\|oneshot` | Observability |
| Integration tests sticky IPC | Regression |

**R6:** F-2 host/session mismatch, F-3 concurrent ack, F-1 timing → **0.4.1**.

**Not in 0.4.0:** context pack, task board, Tauri, force-host mode, M-7 peer ownership.

#### 0.3.1 — 2026-07-09 (`superseded` by 0.4.0 sticky host)

**Why:** R5 `pending-revision` on 0.3.0 — first network exposure must not fail-open; token handling hardened.

| What | Why | Review impact |
|------|-----|----------------|
| **H-5:** non-loopback bind without token → **refuse start** unless `--insecure-open` / `FABLE_RELAY_INSECURE_OPEN` | fail-open 기본값 제거 | Phase 3 done |
| **H-6:** WS **Bearer preferred**; Share hides token unless `--show-token`; session `relayToken` + URL strip; file **0600** | access log / Share 유출 | Phase 3 done |
| **M-5:** `timingSafeTokenEqual` on Bearer + query | 타이밍 누출 완화 | PATCH |
| **M-6:** `setOfflineIfSocket` — stale close ignored after reconnect | 재연결 offline 오판 방지 | PATCH |
| Threat model (M-7 peerId) in `apps/relay-cloud/README.md` | **0.8.0** | done |

**Implemented as of 2026-07-09.** Tests: auth Bearer, H-5 refuse, M-5 equal, M-6 unit, relay-url no-token-in-wsUrl. Re-review optional (PATCH).

#### 0.3.0 — 2026-07-09 (`superseded` — R5 pending-revision)

**Why:** Phase 3 remote multiplayer (skeleton). **Not done for production LAN** until 0.3.1.

| What | Why |
|------|-----|
| `FABLE_RELAY_URL` / `--relay` + `FABLE_RELAY_TOKEN` / `--token` | Multi-machine clients |
| Relay bind `0.0.0.0`, token on WS/HTTP | LAN/cloud host |
| `ensureRelay` remote health check (no auto-spawn) | Don't spawn daemon against remote |
| `RelayClient` auto-reconnect + re-join | listen/run survive brief drops |
| `apps/relay-cloud/README.md` | Deploy notes (TLS terminate at proxy) |
| Auth integration tests | 401 without token; create with token |

**R5:** H-5 fail-open, H-6 token-in-query/Share, M-5 timing, M-6 stale close → **0.3.1**.

**Not in 0.3.0:** durable inbox; mTLS/JWT; peerId ownership (M-7).

#### 0.2.4 — 2026-07-09 (`superseded` by 0.3.0)

**Why:** R4 conditional approve — H-4 legacy TOML duplicate table on `--write-user-config`.

| What | Why |
|------|-----|
| `stripAllFableMcpSections` before upsert | Remove unmarker v0.2.2 `[mcp_servers.fable]` so TOML stays valid |
| Legacy auto-added comments stripped | Migration path for existing ~/.codex and ~/.grok |
| Test: H-4 unmarker block | Regression guard |
| parseArgs boolean allowlist | `--write-user-config codex` no longer swallows agent id |
| usage PLAN version string | Match VERSION 0.2.4 |
| Grok MCP path documented from official user-guide | R4 M-4 format evidence |

**R4:** approved with H-4 PATCH — this version.

#### 0.2.3 — 2026-07-09 (`superseded` by 0.2.4 H-4)

**Why:** R3 `pending-revision` — Phase 2 wiring honesty (M-3 + post-R3 Grok).

| What | Why |
|------|-----|
| Codex/Grok **user-global MCP write = opt-in** (`--write-user-config`) | R3 M-3 무단 append 제거 |
| Managed TOML block + **FABLE_SESSION env** + upsert | multi-profile MCP 세션 바인딩 |
| Gemini removed earlier; Grok same policy as Codex | M-2 obsolete; Grok not re-introduce M-3 |
| `isOnline` unregistered → false | R3 Low bug |
| sanitize bidi/ZW; check/claim re-sanitize | R3 Low |
| Claude ensureMcpConfig returns null (global --mcp-config SSOT) | R3 Low 중복 제거 |
| ADAPTERS matrix: `userConfigWrite: opt-in` | 정직한 표기 |

#### 0.2.2 — 2026-07-09 (`superseded` — Phase 2 wiring incomplete per R3)

**Why:** Phase 2 multi-agent adapter depth after M1.1.

| What | Why |
|------|-----|
| Adapter `capabilities` + `ensureMcpConfig` per CLI | Codex/Grok MCP paths beyond env-only |
| Shared `fableSystemHint` with check/claim | Hetero agents same receive contract |
| `fable run` auto-pick; `agents --matrix` | UX |
| Claude/Codex/Grok project MCP config writers | Practical multi-CLI |
| Hetero handoff unit tests (claude→codex claim) | Phase 2 done criterion without requiring all CLIs installed |
| ADAPTERS.md matrix | Docs |

**Next optional:** Phase 1.5 PTY spike · Phase 3 remote relay

#### 0.2.1 — 2026-07-09 (`superseded` by 0.2.2 implementation notes; still the M1.1 contract baseline)

**Why:** `docs/plan_review.md` **Review R2** (Plan v0.2.0) 조건부 승인 — High/Med finding을 M1.1 완료 기준에 반영. MINOR 재리뷰 불필요 (PATCH).

| What | Why | Review impact |
|------|-----|----------------|
| **H-1:** roster(멤버십)와 live socket **분리**; offline 멤버 대상 handoff **enqueue** | 소켓 close 시 `removePeer`면 수신자 거의 항상 offline → inbox 무의미 | M1.1 필수 |
| **`*` broadcast** inbox 적재 규칙 정의 | offline 포함 전원 queued | M1.1 필수 |
| peers에 **online/offline** 표시 | roster 분리 후 UX | M1.1 |
| **M-1:** `FABLE_SESSION` env 및/또는 `--profile` 로 세션 파일 분리 | 같은 머신 2-peer 시 `~/.fable/session.json` 덮어쓰기 | 데모 전제 |
| sanitize 범위 = **모든 peer-controlled 문자열** (body, chat, displayName, roomName); **allowlist** (인쇄 가능 + `\n\t`) | body만 잡으면 우회 | Security 필수 |
| handoff MCP 반환: `queued` \| `delivered` \| `peer_unknown` (무조건 `ok:true` 금지) | offline enqueue 후 의미 명확화 | Low→M1.1 |
| claim vs `inbox accept`: **first-wins** 상태 전이 | 경합 | Low→M1.1 |
| `handoff.ack` envelope (room.state 재전송 잔재 제거) | server.ts ack 정리 | Low→M1.1 |
| `injectIntoStdin` = **unused / Phase 1.5 only** 표기 | dead path 혼동 방지 | docs |
| Inbox 저장 = **relay 메모리, room 수명** (프로세스 재시작 시 유실 OK for MVP) | 공수 통제 | 명시 |
| leave 명시 시에만 roster 제거; socket close = **offline** | H-1 정책 | M1.1 |

**Approved by:** Fable 5 (R2, conditional) + plan owner acceptance of 0.2.1 PATCH.  
**Next:** 구현 단위 **M1.1** 착수. 완료 후 Changelog에 `Implemented as of …` PATCH 가능.

#### 0.2.0 — 2026-07-09 (`superseded`)

**Why:** R1 보류 사유 반영 (큐 수신, 오버레이 제외, ANSI body, PTY 후순위).  
**Review R2:** `approved` 조건부 → findings는 **0.2.1**에 흡수.

| What | Why | Review impact |
|------|-----|----------------|
| 수신 = 큐 + 알림 + `check_handoffs` | MCP non-push | 재리뷰 필수였음 |
| PTY/오버레이 비목표 | 일정·실현성 | 해소 |
| 버전 관리 도입 | 추적 | 프로세스 |

#### 0.1.0 — 2026-07-09 (`superseded` / R1 **on-hold**)

- PTY 주입·오버레이 가정. R1 보류.

---

## Review resolution

### R1 (v0.1.0 → v0.2.0) — 해소

| # | 지적 | 결정 |
|---|------|------|
| 1 | MCP 송신 전용 / PTY 위험 | 큐 + 폴링 |
| 2 | presence 오버레이 | 비목표 |
| 3 | 얇은 데몬+MCP | 코어 아키텍처 |
| 4 | 일정·속도·ANSI body | 반영 |

### R2 (v0.2.0 → v0.2.1) — 해소 (본 버전)

| Sev | Finding | 0.2.1 반영 |
|-----|---------|------------|
| H-1 | roster/socket 결합, offline handoff 실패 | 분리 + offline enqueue + broadcast 규칙 |
| M-1 | 전역 session.json | `FABLE_SESSION` / `--profile` |
| Med | sanitize body only | peer-controlled 전체 + allowlist |
| Low | handoff 무조건 ok | `queued\|delivered\|peer_unknown` |
| Low | claim/accept 경합 | first-wins |
| Low | room.state ack 잔재 | `handoff.ack` |

---

## Context

Mosaic-class: 여러 사람 + 여러 에이전트 CLI가 Room에서 협업하고 handoff로 작업/메시지를 넘긴다.

**제품 한 줄:** 선호 에이전트 CLI를 유지한 채 Room + presence + **safe handoff inbox**로 연결.

| 결정 | 선택 |
|------|------|
| 협업 범위 | 로컬 → 원격 |
| 배포 | CLI 우선 |
| AI 런타임 | multi-CLI: claude, codex, grok, shell |
| 수신 모델 | **큐 + 알림 + MCP 폴링** (offline enqueue 포함) |
| 포지셔닝 | 속도 (해자 주장 최소화) |

---

## Recommended approach

### 핵심 통찰

1. 에이전트 재구현 안 함.  
2. MCP = 송신·폴링 only.  
3. Handoff는 **roster 기준 inbox**에 쌓임 (live socket 불필요).  
4. PTY 주입 = 선택 (Phase 1.5).

### 아키텍처 (v0.2.1 코어)

```
Agent CLIs ──MCP/CLI──► Fable Host ──WebSocket──► Relay
                              │                      │
                         session profile         roster (members)
                         sanitize all out        sockets (online map)
                         inbox CLI/MCP           per-peer inbox queue
```

- **Roster member:** join 후 명시 `leave` 또는 TTL까지 유지.  
- **Socket close:** member는 남고 `online=false`.  
- **Handoff to offline member:** inbox enqueue, 송신 결과 `queued`.  
- **Online + connected listener:** enqueue + 실시간 notify envelope, 결과 `delivered` (또는 `queued`+notify — 구현 시 하나로 통일, 권장: 항상 inbox 적재 후 online이면 push notify → ack `queued` with `notified: true`).

**권장 ack 의미 (M1.1 고정):**

| Result | 의미 |
|--------|------|
| `queued` | inbox에 적재됨 (offline이거나 online 알림 여부 무관; 최소 보장) |
| `delivered` | 적재 + 현재 online socket에 notify 성공 |
| `peer_unknown` | roster에 대상 없음 |

### 비목표 (MVP)

- pair-programming 공유 커서  
- 에이전트 루프 재구현  
- presence **인라인 오버레이**  
- 기본 경로 PTY stdin 주입 (`injectIntoStdin` unused until 1.5)  
- Windows 1급  
- 데스크톱 스토어  
- inbox disk 영속 (MVP = relay 메모리)

---

## Product surface

### CLI

```bash
# 프로필 (같은 머신 2인 데모 필수)
export FABLE_SESSION=~/.fable/profiles/alice.json
# 또는
fable --profile alice room create --name demo --as alice
fable --profile bob room join FABLE-XXXX --as bob

fable peers                 # id, name, agent, online/offline
fable handoff @alice "…"
fable listen
fable inbox                 # queued list
fable inbox accept <id>     # human accept (first-wins vs claim)
fable run claude
```

### Presence

- 배지 + `fable peers` (color, **online**)  
- listen/run stderr 알림  
- 오버레이 없음  

### Handoff + inbox 상태

```
queued → notified (optional) → accepted | claimed → (done)
         └ first-wins: accept 또는 claim 중 먼저 성공한 쪽만 body 확정
```

| status | 의미 |
|--------|------|
| `queued` | inbox 대기 |
| `notified` | online peer에 push 알림 보냄 (여전히 claim/accept 가능) |
| `accepted` | 사람이 `inbox accept` |
| `claimed` | 에이전트 `claim_handoff` |
| `expired` | (optional) TTL |

### 수신 경로

```
handoff → sanitize → resolve roster targets
       → enqueue each target inbox
       → if online: send notify envelope
       → ack sender: queued | delivered | peer_unknown
```

Agent: `check_handoffs` → `claim_handoff(id)`.  
Human: `fable inbox` → `accept`.

### MCP 도구

| Tool | 설명 |
|------|------|
| `handoff` | 송신; 반환 `{ status, to, id? }` |
| `list_peers` | peers + online |
| `room_chat` | 채팅 (text sanitize) |
| `check_handoffs` | 내 queued/notified 목록 (body preview sanitized) |
| `claim_handoff` | id claim; first-wins |

---

## Security

| 규칙 | 수준 |
|------|------|
| invite code join | 로컬 MVP |
| 모든 **peer-controlled** 문자열 sanitize 후 터미널/도구 응답 | **필수** |
| Allowlist: printable Unicode + `\n` + `\t`; strip ESC/CSI/OSC 등 | **필수** |
| 적용 대상: handoff body, chat text, displayName, roomName, attachment labels, **handoff id/from/mode**, board title/notes/assignee | **필수** |
| 프롬프트 인젝션 배너 | 보조 |
| context pack path: cwd **realpath** allowlist on add | **필수** |
| **Invariant:** receivers must **not** open pack/path attachments as filesystem paths | **필수** (display/metadata only; v2 embed needs redesign) |
| pack file key = roomId (room-scoped; shared across profiles on same UID) | 문서화된 의도 |
| pack leave room on wire only via `--with-pack` / `withPack` | **필수** |
| relay 본문 디스크 로그 | off |

---

## Implementation status & phases

### 완료 (M0 / M1)

| ID | 상태 |
|----|------|
| M0 protocol monorepo | **done** |
| M1-core local room CLI/MCP send | **done** |
| M1-demo human handoff (listen) | **done** (주의: 세션 파일 수동 분리 시에만 안정) |

### M1.1 — **done** (2026-07-09)

**목표:** offline-safe inbox + multi-profile + sanitize + pull tools.

| # | 작업 | 상태 |
|---|------|------|
| 1 | Roster ≠ socket | **done** |
| 2 | Offline enqueue | **done** (E2E verified) |
| 3 | `*` broadcast inbox | **done** (unit tests) |
| 4 | online 플래그 | **done** |
| 5 | `--profile` / `FABLE_SESSION` | **done** |
| 6 | Sanitize allowlist | **done** (tests) |
| 7 | Inbox API (relay memory) | **done** |
| 8 | MCP check/claim + status enum | **done** |
| 9 | CLI inbox / accept | **done** |
| 10 | `handoff.ack` | **done** |
| 11 | Docs | **done** |
| 12 | `injectIntoStdin` unused | **done** |

**Verified demo:** bob handoff @alice while offline → `queued` → alice `inbox` + `accept`.

### Phase 1.5 — PTY spike — **done** (verdict: **no-go** for default inject)

- Harness: `fable spike pty` + `packages/host/src/pty-spike.ts`
- Automated: idle line-reader works; **busy inject buffers → late submit risk**
- `injectIntoStdin` requires `{ experimental: true }`; default path never calls it
- Report: `docs/spikes/PHASE-1.5-PTY.md`
- **Product receive path unchanged:** queue + `check_handoffs` / inbox only
- Manual Claude/Codex/Grok matrix optional; not required to close phase

### Phase 2 — Multi-CLI depth — **done** (0.2.3 wiring fixed)

- Adapter capabilities + `ensureMcpConfig` (claude json, codex/grok toml)
- **Default: project-only MCP**; `--write-user-config` opt-in with session env + managed upsert
- Gemini **removed**; **Grok** added (same opt-in policy as Codex)
- Hetero room tests; `fable agents --matrix` shows `user-cfg`
- Docs: `docs/ADAPTERS.md`

### Phase 3 — Remote relay — **done** (0.3.0 + **0.3.1** security)

- Token-auth relay (`FABLE_RELAY_TOKEN`), bind `0.0.0.0`
- Clients: `--relay` / `FABLE_RELAY_URL` + `--token` (Bearer header preferred)
- Auto-reconnect on `listen` / `run` (M-6 stale-close safe)
- H-5: non-loopback without token refused (`--insecure-open` opt-in only)
- H-6: session `relayToken` separate; Share default no token; file 0600
- TLS: terminate at reverse proxy (`wss://` → local `ws://`)
- Docs: `apps/relay-cloud/README.md`

### Phase 4.0a — Sticky host — **done** (0.4.0 + **0.4.1** R6)

- `fable host start|stop|status` — long-lived `RelayClient` + reconnect
- Loopback RPC for peers / handoff / chat / inbox / claim
- Without host: previous one-shot behavior unchanged
- Meta: `~/.fable/session.host.json` (or profile sibling), mode 0600
- **0.4.1:** session match (F-2), serialized RPC (F-3), timing-safe token (F-1)

### Phase 4.1 — Context pack — **done** (0.5.0 R7 + **0.5.1** Lows)

- Local pack per **roomId** (not per profile): summary, paths (cwd-allowlisted), notes
- Same machine + same room + same OS user → **shared pack file** across `--profile`s (L-1 intentional)
- CLI `fable pack …`; attach via `handoff --with-pack` only
- MCP `get_context_pack` + handoff `withPack`
- Path attachments: `context-pack-path` / `context-pack-path:<label>`; **display only** (never auto-open as FS)
- Uses existing handoff `attachments` (no wire protocol version bump)

### Phase 4.2 — Task board — **done** (0.6.0 + **0.6.1** R8)

- Local board per roomId: tasks with status/assignee/notes/handoffId
- CLI `fable board …`; MCP list/add/update
- Handoff can spawn task (`--board` or `mode=task`)
- Not relay-synced across machines (honest local room-scope)
- **0.6.1:** atomic write+lock; strict task id match; server-only handoff ids

### Phase 4.3a — Board snapshot share — **done** (0.7.0 + **0.7.1** R9)

- Export/import board JSON; attach via handoff `--with-board`
- Import from file or inbox handoff attachment
- Merge by task id (clamped `updatedAt` wins) or replace; foreign room needs `--force`
- **Not** live remote sync — intentional
- **0.7.1:** timestamp clamp, always-parse snapshot, strict handoff id match

### Phase 8 — Launcher UX (up / host-default) — **planned 0.17.0** (`pending-review`)

**목표:** 백그라운드 multi-host, join 시 sticky 기본, work bus 일상 경로, run은 작업 시에만.

| Item | Status |
|------|--------|
| dogfood:up / loom up·down | planned |
| join auto-host + --no-host | planned |
| docs journey rewrite | planned |
| R18 | **open** |
| Implement | **blocked on R18** |

### Phase 7 — Work bus (deliver & process) — **done 0.16.1**

### Phase 6 — Purpose-based sprint 1 — **done 0.15.1**

### Phase 5 — Durable relay state (P2) — **done 0.14.1–0.14.2**

**목표:** Relay 프로세스 재시작 후에도 room invite · roster(+peerSecret) · pending handoff inbox 유지.

| Item | Status |
|------|--------|
| Disk snapshot schema v1 | planned (locked) |
| Atomic 0600 write + load-at-start | planned |
| M-21/M-22/M-23 locks | **locked in 0.14.1** |
| leave / claim / caps semantics unchanged | planned |
| Wire protocol v1 unchanged | planned |
| R15 Fable review | **closed** (pending-revision → PATCH author-close) |
| Implement | **done 0.14.1** |

### Phase 4+

Tauri UI (done through 0.12.x); optional live relay board later (P3).

---

## Risk register

| 리스크 | 완화 |
|--------|------|
| offline handoff 유실 | roster+inbox (H-1) |
| 세션 덮어쓰기 | profiles (M-1) |
| ANSI/OSC | allowlist sanitize all peer strings |
| MCP push 환상 | pull only |
| PTY 오염 | default off |
| claim/accept race | first-wins |
| relay restart 유실 inbox | **done 0.14.1** — disk snapshot + M-21/22/23 locks |
| 오버레이 일정 | 비목표 |
| **비루프백 무토큰 바인드 (H-5)** | 기동 거부; `--insecure-open` only (0.3.1) |
| **토큰 쿼리/Share/session 유출 (H-6)** | Bearer 우선; Share 기본 숨김; `relayToken` 분리 + 0600 (0.3.1) |
| **stale close → offline 오판 (M-6)** | current-socket 비교 후 setOffline (0.3.1) |
| peerId 클라이언트 제공 (M-7) | **0.8.0** per-peer `peerSecret` rejoin proof; session 0600; residual: lost secret ⇒ new peer id |
| 토큰 보유자 room/rate 남용 | MVP 수용; room GC / rate limit later |
| context pack path escape | cwd realpath allowlist; no body embed v1; symlink test (0.5.1) |
| pack 오공유 (remote) | opt-in `--with-pack` / `withPack` only |
| pack 프로필 간 공유 (local) | **intentional room-scope** — same UID+roomId shares file; document, not a bug |
| pack path attachment 오해석 | rel path + label prefix; agents must not treat as local FS (invariant) |
| requestOnce ack 상관 (L-4) | sticky RPC serialize; correlation id backlog |
| v2 pack embed TOCTOU (L-5) | re-resolve allowlist at read time when embed lands |

---

## Verification

### 자동

- Existing protocol/room/slash tests  
- Sanitize allowlist fixtures  
- Offline enqueue → rejoin → check/claim  
- Broadcast to mixed online/offline  
- Profile isolation (two session files)  
- first-wins claim vs accept  

### 수동 E2E

1. Offline-at-send handoff (M1.1 데모)  
2. Two profiles same machine  
3. ANSI in body/chat/name — no raw ESC on terminal  
4. Online notify path still works with listen  
5. Phase 2+ hetero agents  

---

## Milestone map

| Milestone | 상태 |
|-----------|------|
| M0 | **done** |
| M1 | **done** |
| **M1.1** | **done** (roster/offline inbox, profiles, sanitize, check/claim) |
| M1.5 PTY spike | **done** — default inject **no-go**; see `docs/spikes/PHASE-1.5-PTY.md` |
| M2 multi-CLI depth | **done** (0.2.3 R3 wiring) |
| M3 remote relay | **done** (0.3.1 H-5/H-6/M-5/M-6) |
| **M4.0a sticky host** | **done** (0.4.1 F-1/F-2/F-3) |
| **M4.1 context pack** | **done** (0.5.0 R7 + 0.5.1 L-1–L-3) |
| **M4.2 task board** | **done** (0.6.1 H-7/M-8/M-9) |
| **M4.3a board snapshot share** | **done** (0.7.1 M-10/M-11/M-12) |
| M4.3b Tauri desktop shell | **0.11.2** shell + **0.12.0** Board via sticky |
| **M5 durable relay state (P2)** | **0.14.1–0.14.2** done |
| **M6 purpose-based sprint 1** | **0.15.1** done |
| **M7 work bus (board notify + work CLI)** | **0.16.1** done |
| **M8 launcher UX (up / host-default)** | **0.17.0** plan `pending-review` (R18) |

---

## Open follow-ups (defaults)

| 항목 | 기본값 |
|------|--------|
| bin | `loom` (mcp: `loom-mcp`) |
| port | `7842` |
| session | `~/.loom/session.json` or `~/.loom/profiles/<name>.json` |
| state home | `~/.loom` (migrate from `~/.fable` when no live sticky/relay PID) |
| inbox store | **0.14.0:** disk under `~/.loom/relay-state/` (memory + snapshot); ephemeral for tests |
| roster TTL | **0.14.0:** room process **and** disk snapshot lifetime (leave still removes) |
| PTY inject | off |
| overlay | never MVP |
| context pack scope | **roomId** (shared across profiles, same UID) |
| context pack attach | opt-in `--with-pack` only |
| task board scope | **roomId** (local file; not multi-machine live) |
| handoffId on tasks | traceability string only — **no** referential integrity after relay restart |
| board snapshot merge | timestamps clamped to now; ISO only; foreign roomId needs force |
| handoff attachment size | max 256_000 **chars** content, 32 attachments, 100 inbox/peer; claim evicts (L-16) |

### Backlog (non-blocking)

| ID | Item |
|----|------|
| L-4 | ~~wire-level `requestId`~~ | **done 0.13.1** (echo + client match; FIFO fallback) |
| L-5 | ~~v2 pack file-body embed~~ | **done 0.13.0** (`--with-pack-embed` / `withPackEmbed`) |
| M4.3b | Tauri desktop shell — **0.11.1 approved**; implement next (Board deferred M-18 C) |

---

## Success definition

- 서로 다른 에이전트/프로필로 Room 참가  
- peers에서 online/offline 확인  
- **상대가 offline이어도** handoff가 inbox에 쌓임  
- 알림 또는 `check_handoffs` / `loom inbox`로 안전 수신  
- sanitize된 출력만 터미널에 표시  
- 원격: **토큰 없이 비루프백 바인드 거부**; 클라이언트는 Bearer(헤더) 우선; Share에 토큰 기본 미포함  
- room context pack 로컬 관리 + opt-in handoff attach; path attachments are **not** auto-opened as FS  


---

## Approval block

| Role | Name | Decision | Date | Version |
|------|------|----------|------|---------|
| Reviewer | Fable 5 | R2 **approved** (conditional → PATCH findings) | 2026-07-09 | 0.2.0 reviewed |
| Reviewer | Fable 5 | R4 **approved** (conditional H-4) | 2026-07-09 | 0.2.3 reviewed |
| Plan author | implementation | **0.2.4** H-4 fixed | 2026-07-09 | **0.2.4** |
| Reviewer | Fable 5 | R5 **pending-revision** (H-5/H-6 block Phase 3 done) | 2026-07-09 | 0.3.0 reviewed |
| Plan author | implementation | **0.3.1** H-5/H-6/M-5/M-6 **implemented** | 2026-07-09 | **0.3.1** |
| Owner | | treat **0.3.1** as Phase 3 baseline | 2026-07-09 | **0.3.1** |
| Plan author | implementation | **0.4.0** sticky host **implemented** | 2026-07-09 | **0.4.0** |
| Reviewer | Fable 5 | R6 **pending-revision** (F-1/F-2/F-3) | 2026-07-09 | 0.4.0 reviewed |
| Plan author | implementation | **0.4.1** F-1/F-2/F-3 **implemented** | 2026-07-09 | **0.4.1** |
| Owner | | treat **0.4.1** as Phase 4.0a baseline | 2026-07-09 | **0.4.1** |
| Plan author | implementation | **0.5.0** context pack **implemented** | 2026-07-09 | **0.5.0** |
| Reviewer | Fable 5 | R7 **approved** (L-1–L-5 → PATCH/backlog) | 2026-07-09 | 0.5.0 reviewed |
| Plan author | implementation | **0.5.1** L-1–L-3 **implemented** | 2026-07-09 | **0.5.1** |
| Owner | | treat **0.5.1** as Phase 4.1 baseline | 2026-07-09 | **0.5.1** |
| Plan author | implementation | **0.6.0** task board **implemented** | 2026-07-09 | **0.6.0** |
| Reviewer | Fable 5 | R8 **pending-revision** (H-7/M-8/M-9) | 2026-07-09 | 0.6.0 reviewed |
| Plan author | implementation | **0.6.1** H-7/M-8/M-9 **implemented** | 2026-07-09 | **0.6.1** |
| Owner | | treat **0.6.1** as Phase 4.2 baseline | 2026-07-09 | **0.6.1** |
| Plan author | implementation | **0.7.0** board snapshot share **implemented** | 2026-07-09 | **0.7.0** |
| Reviewer | Fable 5 | R9 **pending-revision** (M-10/M-11/M-12) | 2026-07-09 | 0.7.0 reviewed |
| Plan author | implementation | **0.7.1** M-10/M-11/M-12 **implemented** | 2026-07-09 | **0.7.1** |
| Owner | | treat **0.7.1** as Phase 4.3a baseline | 2026-07-09 | **0.7.1** |
| Plan author | implementation | **0.7.2** L-11 caps/eviction | 2026-07-09 | **0.7.2** |
| Plan author | implementation | **0.7.3** L-12 lock pid + sleep | 2026-07-09 | **0.7.3** |
| Plan author | implementation | **0.8.0** M-7 peer rejoin secret **implemented** | 2026-07-09 | **0.8.0** |
| Reviewer | Fable 5 | R10 **pending-revision** (M-13; L-14–L-16) | 2026-07-09 | 0.8.0 reviewed |
| Plan author | implementation | **0.8.1** M-13 + L-15 **implemented** | 2026-07-09 | **0.8.1** |
| Owner | | treat **0.8.1** as M-7 baseline (done) | 2026-07-09 | **0.8.1** |
| Plan author | implementation | **0.9.0** Loom rename **implemented** | 2026-07-09 | **0.9.0** |
| Reviewer | Fable 5 | R11 **pending-revision** (M-14/M-15/M-16) | 2026-07-09 | 0.9.0 reviewed |
| Plan author | implementation | **0.9.1** M-14/15/16 **implemented** | 2026-07-09 | **0.9.1** |
| Owner | | treat **0.9.1** as Loom rename baseline | 2026-07-09 | **0.9.1** |
| Plan author | implementation | **0.9.2** R11 Low residual branding | 2026-07-09 | **0.9.2** |
| Plan author | implementation | **0.9.3** L-14 timing-safe share + L-16 chars | 2026-07-09 | **0.9.3** |
| Plan author | implementation | **0.9.4** L-4 requestOnce waiter queue | 2026-07-09 | **0.9.4** |
| Plan author | implementation | **0.10.0** dual-compat drop (env/slash) | 2026-07-09 | **0.10.0** |
| Reviewer | Fable 5 | R12 **pending-revision** (M-17) | 2026-07-09 | 0.10.0 reviewed |
| Plan author | implementation | **0.10.1** M-17 + Codex entry | 2026-07-09 | **0.10.1** |
| Plan author | implementation | **0.10.2** remove fable bin aliases | 2026-07-09 | **0.10.2** |
| Plan author | implementation | **0.10.3** docs honesty + Tauri unblocked | 2026-07-09 | **0.10.3** |
| Plan author | plan | **0.11.0** M4.3b Tauri shell draft | 2026-07-09 | **0.11.0** pending-review |
| Reviewer | Fable 5 + implementer | R13 **pending-revision** (M-18/M-19/M-20) | 2026-07-09 | 0.11.0 reviewed |
| Plan author | plan | **0.11.1** R13 locks (M-18 C, M-19 Rust, M-20 textContent) | 2026-07-09 | **0.11.1** `approved` |
| Plan author | implementation | **0.11.2** `apps/desktop` thin shell | 2026-07-09 | **0.11.2** |
| Plan author | implementation | **0.12.0** sticky board + desktop Board + smoke | 2026-07-10 | **0.12.0** |
| Plan author | implementation | **0.12.1** desktop polish + PITCH sync | 2026-07-10 | **0.12.1** |
| Plan author | implementation | **0.12.2** desktop Send handoff/chat + invite | 2026-07-10 | **0.12.2** |
| Plan author | implementation | **0.13.0** L-5 pack file embed opt-in | 2026-07-10 | **0.13.0** |
| Plan author | implementation | **0.13.1** L-4 wire requestId — **`approved` author-close (Low)**; no R{n}, no Owner sign-off | 2026-07-10 | **0.13.1** |
| Plan author | implementation | **0.13.2** dogfood UX (inbox names, share tips) author-close | 2026-07-10 | **0.13.2** |
| Plan author | implementation | **0.13.3** PRIORITIES + link:loom install DX author-close | 2026-07-10 | **0.13.3** |
| Reviewer | Fable 5–equivalent | **R14 approved** (cumulative trust 0.11–0.13.3); L-26/L-27 Low | 2026-07-10 | **0.13.4** |
| Plan author | plan/docs | **0.13.4** record R14 + P1 close | 2026-07-10 | **0.13.4** |
| Plan author | implementation | **0.13.5** L-26/L-27 — **author-close** (R14 Low; no re-R{n}) | 2026-07-10 | **0.13.5** |
| Plan author | implementation | **0.13.6** run shell interactive fix — author-close | 2026-07-10 | **0.13.6** |
| Plan author | implementation | **0.13.7** shell multi-strategy + REPL fallback — author-close | 2026-07-10 | **0.13.7** |
| Plan author | implementation | **0.13.8** run shell REPL default — author-close | 2026-07-10 | **0.13.8** |
| Plan author | implementation | **0.13.9** shell REPL raw stdin (no node:tty) — author-close | 2026-07-10 | **0.13.9** |
| Plan author | implementation | **0.13.10** eprint writeSync(2) for run shell — author-close | 2026-07-10 | **0.13.10** |
| Plan author | implementation | **0.13.11** shell REPL readSync(0) only — author-close | 2026-07-10 | **0.13.11** |
| Plan author | implementation | **0.13.12** TUI agent script PTY (Claude kqueue) — author-close | 2026-07-10 | **0.13.12** |
| Plan author | implementation | **0.13.13** TUI python pty SIGWINCH resize — author-close | 2026-07-10 | **0.13.13** |
| Plan author | implementation | **0.13.14** TUI winsize poll + parent SIGWINCH forward — author-close | 2026-07-10 | **0.13.14** |
| Plan author | plan | **0.14.0** P2 durable relay inbox/roster MINOR draft | 2026-07-10 | **0.14.0** `pending-review` |
| Reviewer | Claude + Fable 5 | **R15 pending-revision** (M-21/M-22/M-23) | 2026-07-10 | 0.14.0 reviewed |
| Plan author | plan | **0.14.1** R15 locks PATCH — **author-close** (no R15b) | 2026-07-10 | **0.14.1** `approved` |
| Plan author | implementation | **0.14.1** P2 durable relay (persist + M-21/22/23) | 2026-07-10 | **0.14.1** |
| Plan author | implementation | **0.14.2** durable symlink/fail-closed harden | 2026-07-10 | **0.14.2** |
| Plan author | plan | **0.15.0** Purpose-based sprint 1 MINOR draft | 2026-07-10 | **0.15.0** `pending-review` |
| Reviewer | Claude + Fable 5 | **R16 pending-revision** (M-24/M-25) | 2026-07-10 | 0.15.0 reviewed |
| Plan author | plan | **0.15.1** R16 locks — **author-close** (no R16b) | 2026-07-10 | **0.15.1** `approved` |
| Plan author | implementation | **0.15.1** purpose + receive path + verify lite | 2026-07-10 | **0.15.1** |
| Plan author | plan | **0.16.0** work bus (board notify + loom work) MINOR draft | 2026-07-10 | **0.16.0** `pending-review` |
| Reviewer | Claude + Fable 5 | **R17 pending-revision** (M-26; L-31/L-32) | 2026-07-10 | 0.16.0 reviewed |
| Plan author | plan+impl | **0.16.1** R17 locks + work bus implement | 2026-07-10 | **0.16.1** `approved` |
| Plan author | plan | **0.17.0** launcher UX (up / host-default / work-first) draft | 2026-07-10 | **0.17.0** `pending-review` |

**구현 게이트:** code **0.16.1**. PLAN **0.17.0** `pending-review` — **next session: R18 then implement**.
