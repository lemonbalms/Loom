# hard 가드 — `bun test` LOOM_RELAY unset (Path B)

작성 2026-07-28 · **rev-1** · topology `single`  
Authority: [`RULE-ROUTER-PHASE3.1-SPEC-REV.md`](./RULE-ROUTER-PHASE3.1-SPEC-REV.md) Path B ·  
[`RULE-ENFORCEABILITY.md`](./RULE-ENFORCEABILITY.md) · traps.bun-test-env

---

## 0. 한 줄

Claude Code **Bash PreToolUse**에서 `bun test` 가  
`LOOM_RELAY_TOKEN`·`LOOM_RELAY_URL` unset 형태가 아니면 **exit 2 차단**.  
soft JIT와 **분리**(가드는 deny, JIT는 append-only exit 0).

---

## 1. 범위

| In | Out |
|---|---|
| Claude Code · matcher `Bash` · command에 `bun test` | 다른 셸/IDE/CI 직접 호출 |
| 판정: 동일 명령 문자열 unset 형태 | 명령 자동 재작성 |
| settings: **deny 훅 먼저** · 그다음 `rule-router-jit` | soft live 대체 주장 |

**주장 경계:** “정의된 Claude Code Bash 경로에서 위반 차단”.  
전 지구 셸 H 아님.

---

## 2. 계약

| 입력 | 결과 |
|---|---|
| Bash + `bun test` + 양쪽 unset | exit 0 |
| Bash + `bun test` + 미준수 | exit 2 · stderr 권장 커맨드 |
| Bash + 기타 명령 | exit 0 |
| 파싱 실패 | exit 0 (fail-open) |

권장 충분 형태:  
`env -u LOOM_RELAY_TOKEN -u LOOM_RELAY_URL bun test`

---

## 3. 산출

| 파일 | 역할 |
|---|---|
| `scripts/hooks/check-bun-test-env.ts` | 가드 |
| `scripts/hooks/check-bun-test-env.test.ts` | 결정론 유닛 |
| `.claude/settings.json` | Bash: guard → jit |

---

## 4. soft JIT 관계

| 층 | 역할 |
|---|---|
| hard 가드 | 효과 전 차단 (H 범위 한정) |
| soft JIT (`=1` / canary) | 규범 가시·유도 (3.1b T1a) |
| unset JIT | no-op inject · **가드는 여전히 동작** |

---

## 5. Must not

- JIT 훅에 exit 2 섞기  
- default-on JIT  
- “모든 환경에서 bun test 안전” 전칭  

[RULE-ROUTER-BUN-TEST-ENV-HARD rev-1] path=Bash-PreToolUse deny=exit2 soft=independent
