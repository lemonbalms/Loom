/**
 * PreToolUse hook: Agent 스폰 시 model 명시 강제 (CLAUDE.md Orchestration standing rules 2).
 * model 미지정 = 본세션 모델(Fable) 조용한 상속 → 차단(exit 2).
 * 예외: 에이전트 정의가 모델을 고정하는 fable-advisor 계열.
 */
const raw = await Bun.stdin.text();
let input: {
  tool_name?: string;
  tool_input?: { model?: string; subagent_type?: string };
};
try {
  input = JSON.parse(raw);
} catch {
  process.exit(0); // 파싱 불가 시 통과 (fail-open — 훅이 작업을 죽이면 안 됨)
}

const ti = input.tool_input ?? {};
const sub = ti.subagent_type ?? "";

// 에이전트 정의가 model을 고정하는 타입은 통과
const PINNED = [/fable-advisor$/];
if (PINNED.some((re) => re.test(sub))) process.exit(0);

if (!ti.model) {
  console.error(
    [
      "Agent 스폰 차단: model 미지정 (CLAUDE.md Orchestration standing rules 2).",
      "미지정은 본세션 모델(Fable)을 조용히 상속합니다 — 기본값은 model: \"opus\",",
      "복잡한 판단이 필요한 자문만 fable(=fable-advisor 에이전트 사용).",
      "model 파라미터를 명시해 다시 호출하세요.",
    ].join("\n"),
  );
  process.exit(2);
}
process.exit(0);
