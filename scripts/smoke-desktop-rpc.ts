/**
 * Headless dogfood for desktop sticky path (no Tauri window).
 * Mirrors apps/desktop Rust sticky client ops: status, peers, inbox, board.
 *
 * Usage (repo root):
 *   bun run smoke:desktop
 */
import { mkdirSync, readFileSync, rmSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { spawn } from "bun";

const root = join(import.meta.dir, "..");
const home = join(tmpdir(), `loom-smoke-${Date.now()}`);
mkdirSync(join(home, ".loom"), { recursive: true });

const env = {
  ...process.env,
  LOOM_TEST_HOME: home,
  LOOM_PROFILE: "smoke",
};

function loom(...args: string[]) {
  return spawn({
    cmd: ["bun", "run", "packages/cli/src/index.ts", ...args],
    cwd: root,
    env,
    stdout: "pipe",
    stderr: "pipe",
  });
}

async function out(p: ReturnType<typeof spawn>) {
  const [code, stdout, stderr] = await Promise.all([
    p.exited,
    new Response(p.stdout).text(),
    new Response(p.stderr).text(),
  ]);
  return { code, stdout, stderr };
}

async function rpc(metaPath: string, body: unknown) {
  const meta = JSON.parse(readFileSync(metaPath, "utf8")) as {
    port: number;
    token: string;
  };
  const res = await fetch(`http://127.0.0.1:${meta.port}/rpc`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      authorization: `Bearer ${meta.token}`,
    },
    body: JSON.stringify(body),
  });
  const json = await res.json();
  return { status: res.status, json };
}

let failed = false;
function check(name: string, ok: boolean, detail?: string) {
  if (ok) console.log(`  ok  ${name}`);
  else {
    failed = true;
    console.error(`  FAIL ${name}${detail ? ` — ${detail}` : ""}`);
  }
}

try {
  console.log("smoke-desktop-rpc");
  console.log(`  home ${home}`);

  let r = await out(loom("--profile", "smoke", "room", "create", "--as", "smoke", "--name", "smoke-room"));
  check("room create", r.code === 0, r.stderr || r.stdout);

  r = await out(loom("--profile", "smoke", "host", "start"));
  check("host start", r.code === 0, r.stderr || r.stdout);

  const metaPath = join(home, ".loom", "profiles", "smoke.host.json");
  await Bun.sleep(400);

  let x = await rpc(metaPath, { op: "status" });
  check("status", x.status === 200 && x.json?.ok === true, JSON.stringify(x.json));

  x = await rpc(metaPath, { op: "list_peers" });
  check("list_peers", x.json?.ok === true && Array.isArray(x.json?.peers));

  x = await rpc(metaPath, { op: "list_inbox" });
  check("list_inbox", x.json?.ok === true);

  x = await rpc(metaPath, { op: "list_tasks" });
  check("list_tasks empty-ish", x.json?.ok === true);

  x = await rpc(metaPath, {
    op: "add_task",
    title: "smoke task",
    status: "todo",
  });
  check("add_task", x.json?.ok === true && x.json?.task?.id, JSON.stringify(x.json));
  const tid = x.json?.task?.id as string | undefined;

  if (tid) {
    x = await rpc(metaPath, { op: "update_task", id: tid, status: "doing" });
    check("update_task", x.json?.ok === true && x.json?.task?.status === "doing");
  }

  x = await rpc(metaPath, { op: "status" });
  // bad token
  const meta = JSON.parse(readFileSync(metaPath, "utf8")) as {
    port: number;
  };
  const bad = await fetch(`http://127.0.0.1:${meta.port}/rpc`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      authorization: "Bearer wrong",
    },
    body: JSON.stringify({ op: "ping" }),
  });
  check("401 unauthorized", bad.status === 401);

  r = await out(loom("--profile", "smoke", "host", "stop"));
  check("host stop", r.code === 0, r.stderr || r.stdout);

  if (failed) {
    console.error("smoke FAILED");
    process.exit(1);
  }
  console.log("smoke OK");
} finally {
  try {
    rmSync(home, { recursive: true, force: true });
  } catch {
    /* */
  }
}
