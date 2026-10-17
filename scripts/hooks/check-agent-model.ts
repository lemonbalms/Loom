/**
 * PreToolUse hook: Agent 스폰 가드 (CLAUDE.md Orchestration standing rules 2 · 8).
 * - 규칙 2: model 미지정 = 본세션 모델 조용한 상속 → 차단(exit 2).
 * - 규칙 8: 자문 = 프로젝트 에이전트 `loom-advisor`(Opus 5.5 high, read-only).
 *   플러그인 에이전트 `fable-advisor` 와 `fable` 모델은 이 프로젝트에서 제외 → 차단.
 *   `loom-advisor` 는 정의가 model/effort를 고정하므로 호출측 model 지정 금지.
 */
export type AgentInput = { model?: string; subagent_type?: string; effort?: string };

/** 런타임 비문자열 입력 정규화: string 유지 · undefined/null → undefined · 그 외 → String(v). trim/lowercase 없음. */
function norm(v: unknown): string | undefined {
  if (typeof v === "string") return v;
  if (v === undefined || v === null) return undefined;
  return String(v);
}

export function checkAgentSpawn(raw: AgentInput): { ok: true } | { ok: false; reason: string } {
  const ti: AgentInput = {
    subagent_type: norm(raw?.subagent_type),
    model: norm(raw?.model),
    effort: norm(raw?.effort),
  };
  const sub = ti.subagent_type ?? "";

  if (sub === "fable-advisor" || sub.endsWith(":fable-advisor")) {
    return {
      ok: false,
      reason: [
        `Agent 스폰 차단: ${sub} 에이전트는 이 프로젝트에서 제외됨 (CLAUDE.md 규칙 8).`,
        '자문은 subagent_type: "loom-advisor" 를 사용하세요.',
      ].join("\n"),
    };
  }

  if (ti.model === "fable") {
    return {
      ok: false,
      reason: [
        "Agent 스폰 차단: fable 모델은 이 프로젝트에서 사용하지 않음 (CLAUDE.md 규칙 8).",
        '기본값은 model: "opus", 자문은 subagent_type: "loom-advisor".',
      ].join("\n"),
    };
  }

  if (sub === "loom-advisor") {
    if (ti.model !== undefined) {
      return {
        ok: false,
        reason: [
          "Agent 스폰 차단: loom-advisor 정의가 model: claude-opus-5-5 를 고정합니다 (CLAUDE.md 규칙 8).",
          "호출측 model 은 frontmatter를 덮어쓰므로 model 파라미터를 빼고 다시 호출하세요.",
        ].join("\n"),
      };
    }
    if (ti.effort !== undefined && ti.effort !== "high") {
      return {
        ok: false,
        reason: [
          "Agent 스폰 차단: loom-advisor 정의가 effort: high 를 고정합니다 (CLAUDE.md 규칙 8).",
          'effort 파라미터를 빼거나 "high" 로 다시 호출하세요.',
        ].join("\n"),
      };
    }
    return { ok: true };
  }

  if (!ti.model) {
    return {
      ok: false,
      reason: [
        "Agent 스폰 차단: model 미지정 (CLAUDE.md Orchestration standing rules 2).",
        '미지정은 본세션 모델을 조용히 상속합니다 — 기본값은 model: "opus",',
        '구현 레인은 model: "opus" + effort: "medium", 자문은 subagent_type: "loom-advisor".',
        "model 파라미터를 명시해 다시 호출하세요.",
      ].join("\n"),
    };
  }

  return { ok: true };
}

if (import.meta.main) {
  const raw = await Bun.stdin.text();
  let input: { tool_name?: string; tool_input?: AgentInput };
  try {
    input = JSON.parse(raw);
  } catch {
    process.exit(0); // 파싱 불가 시 통과 (fail-open — 훅이 작업을 죽이면 안 됨)
  }
  const result = checkAgentSpawn(input?.tool_input ?? {});
  if (!result.ok) {
    console.error(result.reason);
    process.exit(2);
  }
  process.exit(0);
}
