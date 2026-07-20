/**
 * HOOKCACHE-B — check-mem-header 유닛 테스트.
 * 합성 문자열·합성 픽스처만 사용한다 — 실제 홈 설치본에 의존하면 테스트가 오너 머신 상태에 묶인다.
 *
 * 픽스처는 미니파이 번들 원문을 그대로 옮긴 것이라 일반 문자열 안에 `${…}`가 들어간다
 * (템플릿 리터럴이 아니라 검사 대상 텍스트다) — noTemplateCurlyInString는 의도적으로 끈다.
 */
// biome-ignore-all lint/suspicious/noTemplateCurlyInString: 번들 원문 픽스처
import { afterEach, describe, expect, test } from "bun:test";
import {
  mkdirSync,
  mkdtempSync,
  rmSync,
  writeFileSync,
  utimesSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  checkHeaderSource,
  resolveWorkerServicePath,
  scanHeaderFunctions,
} from "./check-mem-header.ts";

/** 패치 전 형태(분 단위 ts 포함) — 13.11.0 worker-service.cjs 실물에서 발췌. */
const UNPATCHED =
  'function qJ(){let t=new Date,e=t.toLocaleDateString("en-CA"),r=t.toLocaleTimeString("en-US",{hour:"numeric",minute:"2-digit",hour12:!0}).toLowerCase().replace(" ",""),n=t.toLocaleTimeString("en-US",{timeZoneName:"short"}).split(" ").pop();return`${e} ${r} ${n}`}' +
  "function HJ(t){return[`# [${t}] recent context, ${qJ()}`,\"\"]}";

/** 패치 후 형태(날짜만). */
const PATCHED =
  'function qJ(){let t=new Date;return t.toLocaleDateString("en-CA")}' +
  "function HJ(t){return[`# [${t}] recent context, ${qJ()}`,\"\"]}";

/** 훅이 요구하는 최소 설치본 레이아웃(bun-runner + worker-service). */
function makeInstall(root: string, workerBody: string): void {
  mkdirSync(join(root, "scripts"), { recursive: true });
  writeFileSync(join(root, "scripts", "bun-runner.js"), "// test runner stub\n");
  writeFileSync(join(root, "scripts", "worker-service.cjs"), workerBody);
}

const tempDirs: string[] = [];

function tempConfigDir(prefix = "mem-header-"): string {
  const dir = mkdtempSync(join(tmpdir(), prefix));
  tempDirs.push(dir);
  return dir;
}

afterEach(() => {
  while (tempDirs.length > 0) {
    const d = tempDirs.pop();
    if (d) rmSync(d, { recursive: true, force: true });
  }
});

describe("scanHeaderFunctions", () => {
  test("분 단위 시그니처가 남아 있으면 검출한다", () => {
    const findings = scanHeaderFunctions(UNPATCHED);
    expect(findings).toEqual([{ fn: "qJ", hasMinuteTimestamp: true }]);
  });

  test("날짜만 반환하면 통과로 판정한다", () => {
    const findings = scanHeaderFunctions(PATCHED);
    expect(findings).toEqual([{ fn: "qJ", hasMinuteTimestamp: false }]);
  });

  test("플레인·ANSI 두 헤더 함수를 모두 찾는다", () => {
    const both =
      PATCHED +
      'function eQ(){let t=new Date,e=t.toLocaleDateString("en-CA"),r=t.toLocaleTimeString("en-US",{hour:"numeric",minute:"2-digit",hour12:!0}).toLowerCase().replace(" ",""),n=t.toLocaleTimeString("en-US",{timeZoneName:"short"}).split(" ").pop();return`${e} ${r} ${n}`}' +
      "function tQ(t){return[`[${t}] recent context, ${eQ()}`]}";
    const findings = scanHeaderFunctions(both);
    expect(findings.length).toBe(2);
    expect(findings.find((f) => f.fn === "qJ")?.hasMinuteTimestamp).toBe(false);
    expect(findings.find((f) => f.fn === "eQ")?.hasMinuteTimestamp).toBe(true);
  });

  test("미니파이 함수명이 바뀌어도 소비처 앵커로 따라간다", () => {
    // 13.10.4에서는 같은 함수가 ts()/ps()였다 — 이름에 의존하지 않는지 확인.
    const renamed = UNPATCHED.replaceAll("qJ", "ts").replaceAll("HJ", "ps");
    const findings = scanHeaderFunctions(renamed);
    expect(findings).toEqual([{ fn: "ts", hasMinuteTimestamp: true }]);
  });

  test("헤더 소비처가 없으면 빈 결과(→ checkHeaderSource가 비영 종료)", () => {
    expect(scanHeaderFunctions("function foo(){return 1}")).toEqual([]);
  });
});

describe("resolveWorkerServicePath — 훅 우선순위 복제 (결함1 회귀)", () => {
  test("복수 버전 캐시 중 mtime 최신(ls -dt 상당) 활성본을 고른다", () => {
    // 이름 순이면 13.10.0 이 먼저지만, mtime 최신은 13.11.0 이 되도록 깐다.
    // 구 구현(첫 존재 경로)은 배열/재귀 순으로 구버전을 집어 false OK를 냈다.
    const configDir = tempConfigDir();
    const cache = join(
      configDir,
      "plugins",
      "cache",
      "thedotmack",
      "claude-mem",
    );
    const older = join(cache, "13.10.0");
    const newer = join(cache, "13.11.0");
    makeInstall(older, "/* older unpatched stub */");
    makeInstall(newer, "/* newer active stub */");

    const now = Date.now() / 1000;
    utimesSync(older, now - 200, now - 200);
    utimesSync(newer, now - 10, now - 10);

    const path = resolveWorkerServicePath({ configDir, env: {} });
    expect(path).toBe(join(newer, "scripts", "worker-service.cjs"));
  });

  test("mtime이 더 새 구버전 디렉터리가 있으면 그걸 활성본으로 고른다(이름 정렬 금지)", () => {
    // 이름 내림차순(13.11.0 먼저)이 아니라 mtime 내림차순임을 강제.
    const configDir = tempConfigDir();
    const cache = join(
      configDir,
      "plugins",
      "cache",
      "thedotmack",
      "claude-mem",
    );
    const v111 = join(cache, "13.11.0");
    const v110 = join(cache, "13.10.0");
    makeInstall(v111, "/* 13.11.0 older mtime */");
    makeInstall(v110, "/* 13.10.0 newer mtime = active */");

    const now = Date.now() / 1000;
    utimesSync(v111, now - 300, now - 300);
    utimesSync(v110, now - 5, now - 5);

    const path = resolveWorkerServicePath({ configDir, env: {} });
    expect(path).toBe(join(v110, "scripts", "worker-service.cjs"));
  });

  test("CLAUDE_PLUGIN_ROOT 가 cache 최신보다 우선한다", () => {
    const configDir = tempConfigDir();
    const cache = join(
      configDir,
      "plugins",
      "cache",
      "thedotmack",
      "claude-mem",
    );
    const cacheVer = join(cache, "13.11.0");
    const forced = join(configDir, "forced-root");
    makeInstall(cacheVer, "/* cache */");
    makeInstall(forced, "/* forced */");

    const path = resolveWorkerServicePath({
      configDir,
      env: { CLAUDE_PLUGIN_ROOT: forced },
    });
    expect(path).toBe(join(forced, "scripts", "worker-service.cjs"));
  });

  test("cache 가 없으면 marketplaces 폴백을 쓴다", () => {
    const configDir = tempConfigDir();
    const market = join(
      configDir,
      "plugins",
      "marketplaces",
      "thedotmack",
      "plugin",
    );
    makeInstall(market, "/* marketplace */");

    const path = resolveWorkerServicePath({ configDir, env: {} });
    expect(path).toBe(join(market, "scripts", "worker-service.cjs"));
  });

  test("설치본이 전혀 없으면 null (호출부 fail-open)", () => {
    const configDir = tempConfigDir();
    expect(resolveWorkerServicePath({ configDir, env: {} })).toBeNull();
  });
});

describe("checkHeaderSource — 앵커 미발견 실패 (결함2 회귀)", () => {
  test("앵커 없는 합성 번들은 비영 종료한다", () => {
    const result = checkHeaderSource(
      "function foo(){return 1}",
      "/synthetic/worker-service.cjs",
    );
    expect(result.exitCode).not.toBe(0);
    expect(result.stderr).toContain("앵커");
    expect(result.stderr).toContain("recent context, ${");
    expect(result.stderr).toContain("/synthetic/worker-service.cjs");
  });

  test("패치된 번들은 exit 0", () => {
    const result = checkHeaderSource(PATCHED, "/synthetic/patched.cjs");
    expect(result.exitCode).toBe(0);
    expect(result.stdout).toContain("OK");
    expect(result.stdout).toContain("qJ");
  });

  test("미패치 번들은 exit 1 + 분 ts 안내", () => {
    const result = checkHeaderSource(UNPATCHED, "/synthetic/unpatched.cjs");
    expect(result.exitCode).toBe(1);
    expect(result.stderr).toContain("분 단위 타임스탬프");
    expect(result.stderr).toContain("qJ");
  });
});
