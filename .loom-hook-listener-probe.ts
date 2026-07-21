/**
 * HOOK-LISTENER-PROBE — 브릿지 없이 hook-sensor 리스너를 직접 띄워 claude CLI의
 * hook 발화를 관찰하는 수동 프로브 드라이버 (cardId "manual-probe" · seq 1).
 *
 * 사용: 리스너를 띄우고, 출력된 [SETTINGS-JSON] 한 줄을 claude CLI의 `--settings`
 *       인라인 값으로 붙여 워커를 수동 기동한 뒤 [HOOK-EVENT] 수신을 관찰한다.
 * 실행: 리포 루트에서  LOOM_PROFILE=claude-impl bun .loom-hook-listener-probe.ts
 *       (Ctrl-C로 종료 — 리스너 정리는 best-effort)
 */
import {
  hookSocketPath,
  startHookListener,
  buildHookSettingsJson,
} from "./packages/host/src/hook-sensor";

const socketPath = hookSocketPath("manual-probe", 1);

const started = await startHookListener({
  socketPath,
  onEvent: (hint) => {
    console.log("[HOOK-EVENT]", hint.kind, new Date().toISOString());
  },
  onMalformed: () => {
    console.log("[HOOK-MALFORMED]", new Date().toISOString());
  },
});

if (!started.ok) {
  console.log(`[LISTENER] failed reason=${started.reason}`);
  process.exit(1);
}

console.log(`[LISTENER] ok socketPath=${started.listener.socketPath}`);
console.log("[SETTINGS-JSON]", buildHookSettingsJson(started.listener.socketPath));

// best-effort SIGINT 정리
process.on("SIGINT", () => {
  try {
    started.listener.close();
  } catch {
    /* best-effort */
  }
  process.exit(0);
});

console.log("[LISTENER] waiting for hook events… (Ctrl-C to stop)");
await new Promise<never>(() => {});
