// 카드 감시 코드화(F) + D-VERIFY 재발사. 규칙 5: 구현=grok, 검증=codex.
// 실행: LOOM_PROFILE=claude-impl bun run .loom-dispatch-watch.ts
import { addTask } from "./packages/host/src/task-board";
import { dispatchCard } from "./packages/host/src/card-ops";

const cards = [
  {
    title: "WATCH-CARD — 카드 감시 코드화: scripts/watch-card.ts (모든 종료 경로) (grok pane)",
    notes: "IMPL · 오너 지시 2026-07-20 '코드로 작성' · 임시 bash 감시 2회 연속 구멍 실증",
    kind: "grok" as const,
    lines: [
      "scripts/watch-card.ts 를 신설한다. 아키텍트가 herdr pane 워커 카드의 종료를 감시하는 도구다. 지금은 매번 임시 bash를 손으로 짜고 있고, 두 번 연속 서로 다른 구멍이 났다. 코드로 고정하고 테스트로 잠근다.",
      "배경(실측 2026-07-20): ① 1차 감시는 마커만 봐서 pane 사망을 놓쳤다 ② 2차 감시는 'codex는 완주해도 안 죽는다'는 관측을 가정으로 승격해 pane 소멸을 뺐고, 사용자가 pane을 수동 종료하자 아무것도 감지하지 못했다. 결론: 감시는 레인별 거동 가정에 기대면 안 되고 모든 종료 경로를 동등하게 봐야 한다.",
      "요구사항 — 다음을 전부 종료 조건으로 삼고, 어느 쪽이든 한 번 보고하고 끝낸다: ① 완료 마커 검출(호출자가 정규식/문자열로 지정) ② pane 소멸(사망·완주 후 종료·사용자 수동 종료를 구분하지 말고 전부) ③ 레인 한도·인증 실패 신호(usage limit reached / Weekly limit / Authentication failed / rate limit) ④ 타임아웃(기본 30분, 인자로 조정).",
      "핵심 설계 원칙: '이 워커가 지금 죽으면 내 필터가 무언가를 출력하는가?'가 아니오이면 그 필터는 틀렸다. 침묵은 성공이 아니다. 종료 사유를 반드시 구분해 보고하라(marker / pane-gone / limit / timeout) — 호출자가 완주와 사망을 다르게 처리해야 하기 때문이다.",
      "인터페이스: CLI로 `bun run scripts/watch-card.ts --pane <id> --marker <문자열>` 형태를 기본으로 하되, pane id 대신 agentKind+cwd로 자동 탐색하는 경로도 제공하라(발사 직후엔 pane id를 모른다). 순수 판정 로직은 export된 함수로 분리해 유닛 테스트가 가능하게 하라 — herdr 실물에 의존하는 테스트를 쓰지 마라.",
      "herdr 인터페이스는 `herdr pane list`(JSON 봉투)와 `herdr pane read <id>`(평문)이다. 주의: agent read는 JSON 봉투라 .result.read.text 추출이 필요하지만 pane read는 평문이다(기존 실측).",
      "유닛 테스트(scripts/watch-card.test.ts)로 최소 다음을 잠가라: 마커 검출 / pane 소멸 감지 / 한도 신호 감지 / 타임아웃 / '마커도 없고 pane도 살아있음'에서 계속 대기. 합성 입력으로 하라.",
      "package.json에 별칭을 추가하라(예: watch:card).",
      "다른 카드가 편집 중인 파일(scripts/session-context.ts · scripts/check-mem-header.ts · tasks/lessons.md · docs/spikes/)을 건드리지 마라.",
      "테스트는 env -u LOOM_RELAY_TOKEN -u LOOM_RELAY_URL bun test scripts/watch-card.test.ts 까지만. 전체 스위트는 아키텍트 몫이다.",
      "git commit/push 금지 — 검증까지만. 완료 시 최종 줄에 정확히: [WATCH-CARD-DONE] units=<n/n> exits=<marker|pane-gone|limit|timeout 전부 구현했으면 4/4> alias=<ok|fail>",
    ],
  },
  {
    title: "HOOKCACHE-D-VERIFY(재발사) — 감지기 보강 독립 검증 (codex pane · 읽기 전용)",
    notes: "VERIFY · 1차 발사분은 사용자 pane 종료로 미완 · 규칙 5",
    kind: "codex" as const,
    lines: [
      "당신은 codex 검증자다. 읽기 전용 — 파일을 고치지 마라. (이 카드는 1차 발사가 pane 종료로 중단되어 재발사된 것이다.)",
      "배경: codex가 앞선 교차검증에서 scripts/check-mem-header.ts 결함 2건을 지적했다. ① manifest 첫 존재 경로를 골라 실제 훅 해석 순서를 복제하지 않아 구버전 false OK 가능 ② 앵커 미발견 시 SKIP/exit 0 이라 auto-update 회귀에 사각.",
      "grok이 그 둘을 수정했다. 아키텍트 1차 확인: 경로 해석이 CLAUDE_PLUGIN_ROOT → cache mtime 최신순 → marketplaces 폴백으로 바뀌었고, 앵커 미발견은 exit 1·설치본 없음만 fail-open으로 갈렸으며 유닛이 5→13개로 늘었다.",
      "검증할 것: ① 수정이 실제로 그 결함을 닫는가(우회 경로·부분 수정 아닌가) ② 새 결함은 없는가 — 특히 fail-open 경계가 좁아져 다른 오너 환경에서 게이트를 막지 않는가 ③ 유닛 13개가 두 회귀를 실제로 잡는가(합성 픽스처가 진짜 케이스를 재현하는가, 통과하도록 느슨하지 않은가) ④ 홈이 패치된 상태에서 check:mem-header 가 OK exit 0 인 것이 무회귀 확인으로 충분한가.",
      "확증 편향을 경계하라 — '내 지적이 반영됐다'가 아니라 '결함이 실제로 닫혔다'를 기준으로 판정하라.",
      "테스트는 env -u LOOM_RELAY_TOKEN -u LOOM_RELAY_URL bun test scripts/check-mem-header.test.ts 까지만. 전체 스위트는 돌리지 마라.",
      "파일 수정·commit·push 금지.",
      "완료 시 최종 줄에 정확히: [HOOKCACHE-D-VERIFY-DONE] fix1=<closed|open|partial> fix2=<closed|open|partial> newissue=<none|found> units=<adequate|weak>",
    ],
  },
];

for (const c of cards) {
  const task = addTask({ title: c.title, notes: c.notes });
  const result = await dispatchCard({
    taskId: task.id,
    node: "mac-node",
    prompt: c.lines.join(" "),
    agentKind: c.kind,
  });
  console.log(c.kind, task.id, JSON.stringify(result));
  await new Promise((r) => setTimeout(r, 4000));
}
