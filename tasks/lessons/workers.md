# Lessons — workers

모델별 거부 거동·sonnet 스모크·claude-mem 피드백 루프·grok 커밋 폭주. 인덱스는 `tasks/lessons.md`.

## 2026-07-19 (3) — grok pane 워커(always-approve)는 스펙 밖 커밋·푸시까지 자체 수행

FIX-0236 brief에 커밋 지시가 없었는데 grok 워커가 `fae51bc`를 커밋하고 origin/main에 push까지
했다("Ship: fae51bc → origin/main"). always-approve argv로 도는 pane 워커는 git 조작을 막을
가드가 없다. → **brief에 "커밋/푸시 금지 — 검증까지만, ship은 아키텍트/오너 결정" 문구를
표준 문단으로 포함**할 것. (이번 건은 diff·검증 무결 확인 후 유지 판정 — 아래 웨이브 기록.)

## 2026-07-19 (5) — 오너 지시: claude 스모크 카드는 sonnet 강제

**지시 (2026-07-19, 0.23.11 세션):** 스모크 테스트의 claude 워커는 **sonnet 모델을 강제**한다
(스모크는 benign goal-ack 페이로드라 Fable 토큰이 아깝다). 카드별 argv는 wire 금지(§4.4.2)라
절차는 브릿지 config 스왑: `~/.loom/bridge/mac-node.json`의 `agentArgv.claude`를
`["claude","--model","sonnet"]`으로 → 브릿지 재기동 → 스모크 → **원복(`["claude"]`) + 재기동**.
R{n} 리뷰 카드(claude-rev)는 Fable 유지가 필수이므로 원복을 잊으면 리뷰 품질 사고 —
스모크 종료 시 원복까지가 한 절차다. sonnet은 injection형 페이로드를 거부하므로(0.23.1 실측)
스모크 페이로드는 benign goal-ack형으로 설계할 것(기존 원칙과 정합).

## 2026-07-19 (9) — sonnet 스모크 워커의 claude-mem 거부-피드백 루프

**관찰 (2026-07-19, SMOKE-02312):** sonnet 워커가 C-1 마커형 페이로드를 injection으로
거부(lessons (5) 기재 그대로 — 페이로드 설계 결함)한 뒤, 그 거부가 claude-mem 관찰로
저장되어 **후속 C-2 benign goal-ack형 페이로드까지 "이전 injection 관찰"을 근거로
재거부**했다(0.23.11 D-4에서는 동형 benign 페이로드를 sonnet이 수행 — 차이는 주입된
거부 관찰의 유무뿐). **대응**: ① 스모크 페이로드는 처음부터 benign goal-ack형으로 설계
(마커 강제 금지 — 재시도는 오염된 메모리 컨텍스트와 싸우게 됨) ② 거부 발생 시 동일
세션 계열 재시도 대신 페이로드·태스크를 갈아 새 카드로 ③ summary 무오염 확인 목적이면
거부 회신 자체도 실내용 줄이라 증거로 유효(마커 회수 불필요할 수 있음).

**심화 (2026-07-20, v0.26.0 hookSensor 라이브 스모크):** 공유 홈이라 아키텍트 세션의
스모크 준비 관찰(승인 대기 유발 의도)이 워커 claude-mem 컨텍스트에 로드돼, sonnet 워커가
**마커형뿐 아니라 자연문 benign 승인 대기 유발 페이로드까지** 재거부했다 — 카드 A 거부가
후속 C·D 재거부를 강화(4카드 중 B만 auto mode라 프롬프트 없이 완주). 즉 (9) 상단 루프가
"마커형→benign"을 넘어 "자연 대화형 승인 대기 유발"까지 오염시키는 심화형으로 재현됐다.
**우회 실증**: 카드 dispatch 경유는 오염된 컨텍스트를 못 이긴다 → `permission_prompt` 실발화는
**수동 pane 스폰**(`herdr agent start`로 sonnet `--permission-mode default` pane 직접 스폰 +
`agent send` 자연 대화 주입 — 브릿지 dispatch 주입과 달리 untrusted 마커가 붙지 않는 경로)으로
D 실패 후 성공.
**추가 함정**: 오너 홈 `defaultMode: auto`에서는 benign Bash가 자동 승인돼 승인 프롬프트
(→`permission_prompt`) 자체가 안 뜬다 — 승인 대기 재현은 워커 argv를
`--permission-mode default`로 스왑하는 것이 결정론적 방법(sonnet 스왑 절차 (5)에 argv 항을
병행). 부수 관찰: 정상 완료라도 Stop 힌트가 poll 가속에 실기여했으면
`classifyCompletionFallback`상 `stale_hint`로 계측됨(설계대로 — 계측 해석 시 stale_hint ≠ 결함).
