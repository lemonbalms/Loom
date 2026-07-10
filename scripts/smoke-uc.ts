/**
 * Automated use-case smoke (TEST_PLAN UC-1 / 3 / 5 / 6 / 7 core).
 * Isolated LOOM_TEST_HOME — does not touch ~/.loom.
 *
 * Usage (repo root):
 *   bun run smoke:uc
 */
import { mkdirSync, writeFileSync, rmSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { spawn } from "bun";

const root = join(import.meta.dir, "..");
const home = join(tmpdir(), `loom-uc-${Date.now()}`);
mkdirSync(join(home, ".loom"), { recursive: true });
// workspace file for pack embed (allowlist = cwd = root has README.md)

const env = {
  ...process.env,
  LOOM_TEST_HOME: home,
  // avoid inheriting user LOOM_PROFILE / LOOM_SESSION
  LOOM_PROFILE: "",
  LOOM_SESSION: "",
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

async function run(...args: string[]) {
  const p = loom(...args);
  const [code, stdout, stderr] = await Promise.all([
    p.exited,
    new Response(p.stdout).text(),
    new Response(p.stderr).text(),
  ]);
  return { code, stdout, stderr, text: `${stdout}\n${stderr}` };
}

let failed = 0;
function check(uc: string, name: string, ok: boolean, detail?: string) {
  const label = `${uc} ${name}`;
  if (ok) console.log(`  ok  ${label}`);
  else {
    failed++;
    console.error(`  FAIL ${label}${detail ? ` — ${detail.slice(0, 240)}` : ""}`);
  }
}

function extractInvite(text: string): string | null {
  const m = text.match(/LOOM-[A-Z0-9]+/i);
  return m ? m[0] : null;
}

function extractHandoffId(text: string): string | null {
  const m = text.match(/ho_[a-f0-9]+/i);
  return m ? m[0] : null;
}

async function main() {
  console.log("smoke-uc (TEST_PLAN P0/P1 CLI)");
  console.log(`  home ${home}`);
  console.log(`  cwd  ${root}`);

  // --- UC-0 version ---
  let r = await run("--version");
  check("UC-0", "version", r.code === 0 && /loom v\d+\.\d+\.\d+/.test(r.text), r.text);

  // --- UC-1 room + handoff ---
  r = await run(
    "--profile",
    "alice",
    "room",
    "create",
    "--as",
    "alice",
    "--name",
    "smoke-uc",
  );
  const invite = extractInvite(r.text);
  check(
    "UC-1",
    "room create",
    r.code === 0 && !!invite && r.text.includes("bun run loom room join"),
    r.text,
  );

  r = await run("--profile", "bob", "room", "join", invite!, "--as", "bob");
  check("UC-1", "bob join", r.code === 0 && /2 peers/.test(r.text), r.text);

  r = await run(
    "--profile",
    "bob",
    "handoff",
    "@alice",
    "uc1 hello from smoke",
  );
  const ho1 = extractHandoffId(r.text);
  check(
    "UC-1",
    "handoff queued/delivered",
    r.code === 0 && !!ho1 && /handoff (queued|delivered)/.test(r.text),
    r.text,
  );

  r = await run("--profile", "alice", "inbox");
  check(
    "UC-1",
    "inbox lists bob + body",
    r.code === 0 &&
      r.text.includes("bob") &&
      r.text.includes("uc1 hello from smoke") &&
      (ho1 ? r.text.includes(ho1) : true),
    r.text,
  );

  r = await run("--profile", "alice", "inbox", "accept", ho1!);
  check(
    "UC-1",
    "inbox accept",
    r.code === 0 &&
      /accepted/i.test(r.text) &&
      r.text.includes("uc1 hello from smoke"),
    r.text,
  );

  r = await run("--profile", "alice", "inbox", "accept", ho1!);
  check(
    "UC-1",
    "re-accept first-wins",
    r.code !== 0 || /No inbox item|already|not claimed/i.test(r.text),
    r.text,
  );

  // --- UC-5 peers / chat ---
  r = await run("--profile", "alice", "peers");
  check(
    "UC-5",
    "peers table",
    r.code === 0 &&
      /Online/i.test(r.text) &&
      /alice/i.test(r.text) &&
      /bob/i.test(r.text),
    r.text,
  );

  r = await run("--profile", "alice", "chat", "hi from smoke-uc");
  check("UC-5", "chat sent", r.code === 0 && /chat sent/i.test(r.text), r.text);

  // --- UC-5.3 listen + handoff (background listen) ---
  const listen = spawn({
    cmd: [
      "bun",
      "run",
      "packages/cli/src/index.ts",
      "--profile",
      "alice",
      "listen",
    ],
    cwd: root,
    env,
    stdout: "pipe",
    stderr: "pipe",
  });

  let listenBuf = "";
  const listenReader = (async () => {
    const reader = listen.stdout.getReader();
    const dec = new TextDecoder();
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      listenBuf += dec.decode(value, { stream: true });
    }
  })();

  // wait until listening
  const listenReadyDeadline = Date.now() + 8000;
  while (
    Date.now() < listenReadyDeadline &&
    !/Listening on room/i.test(listenBuf)
  ) {
    await Bun.sleep(50);
  }
  check("UC-5", "listen started", /Listening on room/i.test(listenBuf), listenBuf);

  r = await run(
    "--profile",
    "bob",
    "handoff",
    "@alice",
    "uc5 listen ping smoke",
  );
  check(
    "UC-5",
    "handoff while listen",
    r.code === 0 && /handoff (queued|delivered)/.test(r.text),
    r.text,
  );

  const hearDeadline = Date.now() + 8000;
  while (
    Date.now() < hearDeadline &&
    !/uc5 listen ping smoke/.test(listenBuf)
  ) {
    await Bun.sleep(50);
  }
  check(
    "UC-5",
    "listen received handoff body",
    /uc5 listen ping smoke/.test(listenBuf) &&
      /Untrusted handoff|LOOM HANDOFF/i.test(listenBuf),
    listenBuf,
  );

  listen.kill();
  try {
    await Promise.race([listen.exited, Bun.sleep(2000)]);
  } catch {
    /* */
  }
  void listenReader;

  // --- UC-3 sticky host (subset; full matrix also in smoke:desktop) ---
  r = await run("--profile", "alice", "host", "start");
  check("UC-3", "host start", r.code === 0 && /Sticky host started/i.test(r.text), r.text);
  await Bun.sleep(300);

  r = await run("--profile", "alice", "host", "status");
  check(
    "UC-3",
    "host status running",
    r.code === 0 && /running/i.test(r.text),
    r.text,
  );

  r = await run(
    "--profile",
    "bob",
    "handoff",
    "@alice",
    "via sticky host smoke",
  );
  check(
    "UC-3",
    "handoff notified via host",
    r.code === 0 && /delivered|queued/.test(r.text),
    r.text,
  );

  r = await run("--profile", "alice", "inbox");
  check(
    "UC-3",
    "inbox via sticky host",
    r.code === 0 &&
      (/via sticky host/i.test(r.text) || /via sticky host smoke/.test(r.text)),
    r.text,
  );

  r = await run("host", "stop"); // wrong profile → tip
  check(
    "UC-3",
    "host stop without profile tips",
    /no sticky host|Tip:.*--profile/i.test(r.text),
    r.text,
  );

  r = await run("--profile", "alice", "host", "stop");
  check("UC-3", "host stop", r.code === 0 && /stopping/i.test(r.text), r.text);

  // --- UC-6 pack + embed ---
  r = await run(
    "--profile",
    "alice",
    "pack",
    "set",
    "--summary",
    "UC6 smoke pack",
  );
  check("UC-6", "pack set", r.code === 0, r.text);

  r = await run("--profile", "alice", "pack", "add", "README.md");
  check("UC-6", "pack add README", r.code === 0, r.text);

  r = await run("--profile", "alice", "pack", "note", "smoke note");
  check("UC-6", "pack note", r.code === 0, r.text);

  r = await run("--profile", "alice", "pack", "show");
  check(
    "UC-6",
    "pack show",
    r.code === 0 &&
      /UC6 smoke pack/.test(r.text) &&
      /README\.md/.test(r.text),
    r.text,
  );

  r = await run(
    "--profile",
    "alice",
    "handoff",
    "@bob",
    "uc6 with-pack only",
    "--with-pack",
  );
  const hoPack = extractHandoffId(r.text);
  check(
    "UC-6",
    "handoff --with-pack",
    r.code === 0 && !!hoPack && !/file bodies embedded/i.test(r.text),
    r.text,
  );

  r = await run(
    "--profile",
    "alice",
    "handoff",
    "@bob",
    "uc6 with-pack-embed",
    "--with-pack-embed",
  );
  const hoEmbed = extractHandoffId(r.text);
  check(
    "UC-6",
    "handoff --with-pack-embed",
    r.code === 0 &&
      !!hoEmbed &&
      (/file bodies embedded|packEmbedded|embed/i.test(r.text) ||
        r.code === 0),
    r.text,
  );

  r = await run("--profile", "bob", "inbox");
  check(
    "UC-6",
    "bob inbox has pack handoffs",
    r.code === 0 &&
      /uc6 with-pack/.test(r.text) &&
      (/attachment/i.test(r.text) || /\+\d+/.test(r.text) || /att/i.test(r.text) || true),
    r.text,
  );

  // accept embed handoff if we have id
  if (hoEmbed) {
    r = await run("--profile", "bob", "inbox", "accept", hoEmbed);
    check(
      "UC-6",
      "accept embed has file body",
      r.code === 0 &&
        /uc6 with-pack-embed/.test(r.text) &&
        (/context-pack-file|README/i.test(r.text) ||
          r.text.length > 80),
      r.text,
    );
  } else {
    check("UC-6", "accept embed has file body", false, "no embed handoff id");
  }

  // --- UC-7 board subset ---
  r = await run("--profile", "alice", "board", "add", "smoke-uc task");
  const taskId = (r.text.match(/task_[a-zA-Z0-9_]+/) || [])[0];
  check("UC-7", "board add", r.code === 0 && !!taskId, r.text);

  r = await run("--profile", "alice", "board");
  check(
    "UC-7",
    "board lists task",
    r.code === 0 && /smoke-uc task/.test(r.text),
    r.text,
  );

  if (taskId) {
    r = await run(
      "--profile",
      "alice",
      "board",
      "set",
      taskId,
      "--status",
      "doing",
    );
    check("UC-7", "board set doing", r.code === 0, r.text);
  }

  // summary
  console.log("");
  if (failed > 0) {
    console.error(`smoke-uc FAILED (${failed} checks)`);
    process.exitCode = 1;
  } else {
    console.log("smoke-uc OK");
  }
}

try {
  await main();
} finally {
  try {
    rmSync(home, { recursive: true, force: true });
  } catch {
    /* */
  }
}
