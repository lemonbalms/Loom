/**
 * HOOKCACHE-B 감지장치 — claude-mem 헤더 분 단위 타임스탬프 재발 검사.
 *
 * claude-mem이 SessionStart로 주입하는 컨텍스트 헤더에 분 단위 ts가 박히면
 * 프롬프트 캐시 재사용 상한이 1분으로 고정된다(세션당 33,915토큰 cache-write).
 * 해소는 홈 디렉터리 설치본 직접 패치(B-4)라 **비영속**이다 —
 * thedotmack은 `autoUpdate: true`이므로 플러그인이 갱신되면 패치는 예고 없이 사라진다.
 * 이 스크립트가 그 조용한 원복을 잡는 1차 방어선이다.
 *
 * Usage:
 *   bun run check:mem-header   (or: bun run scripts/check-mem-header.ts)
 *
 * fail-open 원칙: **설치본 자체가 없을 때만** 통과(exit 0)+stderr 고지.
 * 다른 머신·다른 오너 환경에서 이 스크립트가 게이트를 막으면 안 된다.
 * 설치본이 있는데 앵커를 못 찾거나 분 ts가 살아 있으면 **실패**(exit 1) —
 * 번들 구조 변경/auto-update 원복이 바로 감지해야 할 케이스다.
 */
import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";

/** 헤더 소비처 — 미니파이 함수명은 버전마다 바뀌므로 이 문자열이 앵커다. */
export const CONSUMER_ANCHOR = "recent context, ${";
/** 분 단위 ts 시그니처(둘 다 있어야 미패치로 판정). */
const MINUTE_SIG = 'minute:"2-digit"';
const TZ_SIG = 'timeZoneName:"short"';

export type HeaderFinding = {
  /** 헤더를 생성하는 미니파이 함수명(예: qJ, eQ — 버전마다 다름). */
  fn: string;
  /** 해당 함수 본문에 분 단위 시그니처가 살아 있는가. */
  hasMinuteTimestamp: boolean;
};

export type ResolveOptions = {
  /** 테스트용 — 기본은 CLAUDE_CONFIG_DIR || ~/.claude */
  configDir?: string;
  /** 테스트용 — 기본은 process.env */
  env?: NodeJS.ProcessEnv;
};

export type CheckOutcome = {
  exitCode: number;
  stdout: string;
  stderr: string;
};

/**
 * 번들 소스에서 헤더 생성 함수들을 찾아 분 단위 ts 잔존 여부를 판정한다.
 * 순수 함수 — 파일 시스템에 의존하지 않는다(유닛 테스트가 합성 문자열로 검증).
 */
export function scanHeaderFunctions(source: string): HeaderFinding[] {
  const names = new Set<string>();
  let i = source.indexOf(CONSUMER_ANCHOR);
  while (i !== -1) {
    const rest = source.slice(i + CONSUMER_ANCHOR.length);
    const m = /^([A-Za-z_$][A-Za-z0-9_$]*)\(\)\}/.exec(rest);
    if (m) names.add(m[1]!);
    i = source.indexOf(CONSUMER_ANCHOR, i + 1);
  }

  const findings: HeaderFinding[] = [];
  for (const fn of names) {
    const body = extractFunctionBody(source, fn);
    if (body === null) continue;
    findings.push({
      fn,
      hasMinuteTimestamp: body.includes(MINUTE_SIG) && body.includes(TZ_SIG),
    });
  }
  return findings;
}

/** `function NAME(){…}` 본문을 중괄호 균형으로 잘라낸다. 없으면 null. */
function extractFunctionBody(source: string, name: string): string | null {
  const head = `function ${name}(){`;
  const start = source.indexOf(head);
  if (start < 0) return null;
  let depth = 0;
  for (let i = start + head.length - 1; i < source.length; i++) {
    const c = source[i];
    if (c === "{") depth++;
    else if (c === "}") {
      depth--;
      if (depth === 0) return source.slice(start, i + 1);
    }
  }
  return null;
}

/**
 * 훅이 쓰는 설치 루트 정규화.
 * `…/plugin/scripts` 가 있으면 `…/plugin` 을, 아니면 인자 그대로를 쓴다.
 */
function normalizePluginRoot(raw: string): string {
  const trimmed = raw.replace(/\/+$/, "");
  if (existsSync(join(trimmed, "plugin", "scripts"))) {
    return join(trimmed, "plugin");
  }
  return trimmed;
}

/**
 * 후보 루트가 훅 기준으로 "유효한 설치본"인지.
 * SessionStart 훅은 bun-runner.js + worker-service.cjs 둘 다 있을 때 채택한다.
 */
function isValidInstallRoot(root: string): boolean {
  return (
    existsSync(join(root, "scripts", "bun-runner.js")) &&
    existsSync(join(root, "scripts", "worker-service.cjs"))
  );
}

/**
 * cache/thedotmack/claude-mem 아래 숫자-시작 버전 디렉터리를 mtime 내림차순으로 나열 (ls -dt 상당).
 * 훅의 ls -dt cache/thedotmack/claude-mem 버전 디렉터리 glob 을 복제한다.
 */
function listCacheVersionsByMtime(cacheBase: string): string[] {
  if (!existsSync(cacheBase)) return [];
  let names: string[];
  try {
    names = readdirSync(cacheBase);
  } catch {
    return [];
  }

  const entries: { full: string; mtimeMs: number }[] = [];
  for (const name of names) {
    // bash glob [0-9]* — 숫자로 시작하는 디렉터리만
    if (!/^[0-9]/.test(name)) continue;
    const full = join(cacheBase, name);
    try {
      const st = statSync(full);
      if (!st.isDirectory()) continue;
      entries.push({ full, mtimeMs: st.mtimeMs });
    } catch {
      // 레이스/권한 — 건너뜀
    }
  }
  entries.sort((a, b) => b.mtimeMs - a.mtimeMs);
  return entries.map((e) => e.full);
}

/**
 * 활성 claude-mem 설치 루트를 훅과 동일한 우선순위로 해석한다.
 *
 * 1. CLAUDE_PLUGIN_ROOT || PLUGIN_ROOT (설정돼 있으면)
 * 2. cache/thedotmack/claude-mem 아래 숫자-시작 버전 디렉터리, mtime 최신순 (ls -dt)
 * 3. marketplaces/thedotmack/plugin 폴백
 *
 * 각 후보에 대해 plugin/scripts 중첩을 정규화한 뒤,
 * bun-runner.js + worker-service.cjs 가 있는 첫 유효 루트를 반환.
 *
 * installed_plugins.json 의 "첫 존재 경로"를 쓰지 않는다 —
 * cache에 구버전이 남아 있으면 활성본이 아닌 구버전을 집어 false OK가 난다(결함1).
 */
export function resolveActiveInstallRoot(
  options: ResolveOptions = {},
): string | null {
  const env = options.env ?? process.env;
  const configDir =
    options.configDir ?? env.CLAUDE_CONFIG_DIR ?? join(homedir(), ".claude");

  const candidates: string[] = [];

  const pluginRoot = env.CLAUDE_PLUGIN_ROOT || env.PLUGIN_ROOT;
  if (typeof pluginRoot === "string" && pluginRoot.length > 0) {
    candidates.push(pluginRoot);
  }

  const cacheBase = join(
    configDir,
    "plugins",
    "cache",
    "thedotmack",
    "claude-mem",
  );
  for (const v of listCacheVersionsByMtime(cacheBase)) {
    candidates.push(v);
  }

  candidates.push(
    join(configDir, "plugins", "marketplaces", "thedotmack", "plugin"),
  );

  for (const raw of candidates) {
    const root = normalizePluginRoot(raw);
    if (isValidInstallRoot(root)) return root;
  }
  return null;
}

/**
 * 활성 claude-mem 설치본의 worker-service.cjs 경로를 런타임에 재해석한다.
 * 경로 하드코딩 금지 — 버전이 오르면 디렉터리가 바뀐다.
 */
export function resolveWorkerServicePath(
  options: ResolveOptions = {},
): string | null {
  const root = resolveActiveInstallRoot(options);
  if (!root) return null;
  const candidate = join(root, "scripts", "worker-service.cjs");
  return existsSync(candidate) ? candidate : null;
}

const FAILURE_NOTE = [
  "check:mem-header FAIL — claude-mem 헤더에 분 단위 타임스탬프가 살아 있다.",
  "",
  "원인: claude-mem이 SessionStart로 주입하는 헤더가 `recent context, YYYY-MM-DD h:mmpm TZ`",
  "      형태라 프롬프트 캐시 재사용 상한이 1분으로 고정된다(세션당 ~33,915토큰 cache-write).",
  "      플러그인 autoUpdate:true — 새 버전이 깔리면서 기존 패치가 조용히 원복된 것이 가장 유력.",
  "",
  "조치: worker-service.cjs에서 헤더 생성 함수(아래 보고된 이름 — 미니파이라 버전마다 바뀜)의",
  "      본문을 날짜까지만 반환하도록 되돌린다:",
  '        function <fn>(){let t=new Date;return t.toLocaleDateString("en-CA")}',
  "      ⚠ scripts/context-generator.cjs는 데드 번들이다(호출처 0건). 거기를 고치면 무효.",
  "      수정 전 백업 필수. 패치 후 워커 재기동 필요:",
  "        node <installPath>/scripts/bun-runner.js <installPath>/scripts/worker-service.cjs restart",
  "",
  "배경: tasks/lessons/platform.md — [platform] claude-mem 헤더 분 단위 ts (HOOKCACHE-B)",
].join("\n");

/**
 * 이미 읽은 번들 소스에 대해 검사 결과를 낸다.
 * 순수 함수 — 유닛 테스트가 합성 문자열로 비영 종료(앵커 미발견)를 검증한다.
 *
 * 구분: 설치본 없음 = 호출부가 fail-open / 설치본 있는데 앵커 없음 = 여기 exitCode 1.
 */
export function checkHeaderSource(source: string, path: string): CheckOutcome {
  const findings = scanHeaderFunctions(source);
  if (findings.length === 0) {
    return {
      exitCode: 1,
      stdout: "",
      stderr: [
        `check:mem-header FAIL — ${path} 에서 헤더 생성 함수 앵커를 찾지 못했다.`,
        `  못 찾은 앵커: "${CONSUMER_ANCHOR}"`,
        "  설치본은 있으나 소비처 앵커가 없다 = 번들 구조 변경 또는 auto-update 원복 후보.",
        "  조용히 통과시키면 감지 장치가 무효화되므로 실패로 처리한다.",
      ].join("\n"),
    };
  }

  const bad = findings.filter((f) => f.hasMinuteTimestamp);
  if (bad.length > 0) {
    return {
      exitCode: 1,
      stdout: "",
      stderr: [
        FAILURE_NOTE,
        "",
        `대상 파일: ${path}`,
        `분 ts 잔존 함수: ${bad.map((f) => f.fn).join(", ")}`,
      ].join("\n"),
    };
  }

  return {
    exitCode: 0,
    stdout: `check:mem-header OK — 헤더 함수 ${findings.length}개 모두 날짜까지만 반환 (${findings
      .map((f) => f.fn)
      .join(", ")})`,
    stderr: "",
  };
}

function main(): never {
  const path = resolveWorkerServicePath();
  if (!path) {
    console.error(
      "check:mem-header SKIP — claude-mem 설치본을 찾지 못했다(경로 해석 실패). fail-open으로 통과시킨다.",
    );
    process.exit(0);
  }

  let source: string;
  try {
    source = readFileSync(path, "utf8");
  } catch {
    // 설치본 경로를 잡았으나 읽기 실패 — 다른 환경/권한. fail-open 유지.
    console.error(
      `check:mem-header SKIP — ${path} 를 읽지 못했다. fail-open으로 통과시킨다.`,
    );
    process.exit(0);
  }

  const result = checkHeaderSource(source, path);
  if (result.stdout) console.log(result.stdout);
  if (result.stderr) console.error(result.stderr);
  process.exit(result.exitCode);
}

if (import.meta.main) {
  try {
    main();
  } catch (err) {
    // 예기치 못한 예외도 fail-open — 게이트를 막을 대상은 "패치 원복·앵커 소실"이다.
    // 해석 자체 붕괴(권한·FS 예외)는 다른 오너 환경을 막지 않기 위해 통과.
    console.error(
      `check:mem-header SKIP — 예외 발생: ${err instanceof Error ? err.message : String(err)}`,
    );
    process.exit(0);
  }
}
