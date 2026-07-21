import { updateTask } from "./packages/host/src/task-board";
const fixes = [
  { id: "task_0876cb2acf96bfef", status: "done" as const,
    notes: "완주 — verdict=reject High3/Med6. 산출물 docs/reviews/PANEDEATH-CODEX-REVIEW.md 아키텍트 독립 검증. 브릿지 summary는 codex TUI 상태줄 스크레이프(무의미)." },
  { id: "task_e0ba2d6f57a5b803", status: "done" as const,
    notes: "완주 — verdict=reject/ready=no High1/Med7, docs/reviews/PANEDEATH-CODEX-REVIEW2.md 11.8KB 실재·마커 정상. 브릿지는 failed reason=agent_blocked 회신(관찰 ⓔ 재현) — 회신 무시하고 워킹트리 검증으로 done." },
  { id: "task_b5c28c87290db951", status: "done" as const,
    notes: "pane 사망으로 이 카드 자체는 산출물 0건 — 브릿지는 done 회신(진짜 가짜 done 실증). 실제 작업은 in-harness 폴백으로 완료(시나리오 D · replay=NOT_REPLAYED · PROBE_END 도달). 카드 done은 폴백 결과 기준." },
];
for (const f of fixes) { const r = updateTask(f.id, { status: f.status, notes: f.notes }); console.log(f.id, r?.status ?? r); }
