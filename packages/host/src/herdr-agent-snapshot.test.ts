/**
 * PLAN 0.46.0 P1 red — `agentGet` snapshot normalization (R13 · R14 part).
 *
 * ① normalization table: `agentGet` result → `HerdrAgentSnapshot`
 *    (`{ status, stateChangeSeq, completionSeq }` — ② interface table) with the
 *    client's `request` stubbed to a raw `agent.get` result.
 * ② contract: 0.7.5 and 0.9.5 fixture `AgentInfo` carry `state_change_seq`;
 *    only 0.9.5 carries `completion_seq`.
 * ③ fake-herdr `seqMode`: "none" = neither key (today's bytes) · "p22" = both keys
 *    (global counter · stamp on change only · working→idle/done fills cs), read
 *    over the socket by a real `HerdrClient`.
 *
 * The shape is read as `unknown` and cast to a local type so this file typechecks
 * before the production type exists (red = assertion failures, not tsc errors).
 * Temp HOME via `LOOM_TEST_HOME`.
 */
import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { join } from "node:path";
import { type FakeHerdr, startFakeHerdr } from "./fake-herdr";
import { HerdrClient } from "./herdr-client";

const REPO_ROOT = join(import.meta.dir, "..", "..", "..");

/** PLAN 0.46.0 ② `HerdrAgentSnapshot` (local mirror — see header). */
type Snapshot = {
  status: string;
  stateChangeSeq: number | null;
  completionSeq: number | null | undefined;
};

/** `agentGet` over a stubbed `request` that returns `result` for agent.get. */
async function snapshotOf(result: unknown): Promise<Snapshot> {
  const client = new HerdrClient({ socketPath: "/nonexistent/herdr.sock" });
  client.request = (async (method: string) => {
    if (method !== "agent.get") throw new Error(`unexpected ${method}`);
    return result;
  }) as HerdrClient["request"];
  return (await client.agentGet("w1:p1")) as unknown as Snapshot;
}

/** Raw agent.get result with the given extra `agent` fields. */
function agentResult(fields: Record<string, unknown>, status: unknown = "idle") {
  return {
    type: "agent_info",
    agent: { pane_id: "w1:p1", terminal_id: "term_1", agent_status: status, ...fields },
  };
}

describe("PLAN 0.46.0 P1 — agentGet snapshot normalization (R13)", () => {
  test("① valid seqs pass through as numbers", async () => {
    const snap = await snapshotOf(agentResult({ state_change_seq: 7, completion_seq: 7 }));
    expect(snap).toEqual({ status: "idle", stateChangeSeq: 7, completionSeq: 7 });
    const zero = await snapshotOf(agentResult({ state_change_seq: 0, completion_seq: 0 }));
    expect(zero).toEqual({ status: "idle", stateChangeSeq: 0, completionSeq: 0 });
  });

  test("② state_change_seq missing / negative / string / non-integer / non-finite → null", async () => {
    const cases: Array<[string, Record<string, unknown>]> = [
      ["missing", {}],
      ["null", { state_change_seq: null }],
      ["negative", { state_change_seq: -1 }],
      ["string", { state_change_seq: "5" }],
      ["non-integer", { state_change_seq: 1.5 }],
      ["infinite", { state_change_seq: Number.POSITIVE_INFINITY }],
      ["NaN", { state_change_seq: Number.NaN }],
    ];
    for (const [label, fields] of cases) {
      const snap = await snapshotOf(agentResult({ ...fields, completion_seq: 3 }));
      expect({ label, scs: snap.stateChangeSeq }).toEqual({ label, scs: null });
      expect({ label, cs: snap.completionSeq }).toEqual({ label, cs: 3 });
    }
  });

  test("③ completion_seq key absent → undefined · JSON null → null (kept distinct)", async () => {
    const absent = await snapshotOf(agentResult({ state_change_seq: 4 }));
    expect(absent.stateChangeSeq).toBe(4);
    expect(absent.completionSeq).toBeUndefined();
    const nul = await snapshotOf(agentResult({ state_change_seq: 4, completion_seq: null }));
    expect(nul.stateChangeSeq).toBe(4);
    expect(nul.completionSeq).toBeNull();
    expect(nul.completionSeq).not.toBe(absent.completionSeq);
  });

  test("④ completion_seq negative / string / non-integer / non-finite → undefined (not capable)", async () => {
    const cases: Array<[string, unknown]> = [
      ["negative", -1],
      ["string", "3"],
      ["non-integer", 2.5],
      ["infinite", Number.POSITIVE_INFINITY],
      ["boolean", true],
      ["object", {}],
    ];
    for (const [label, cs] of cases) {
      const snap = await snapshotOf(agentResult({ state_change_seq: 4, completion_seq: cs }));
      expect({ label, scs: snap.stateChangeSeq }).toEqual({ label, scs: 4 });
      expect({ label, csUndefined: snap.completionSeq === undefined }).toEqual({
        label,
        csUndefined: true,
      });
    }
  });

  test("⑤ status normalization unchanged (0.45.4 R2) inside the snapshot", async () => {
    const upper = await snapshotOf(agentResult({ state_change_seq: 1, completion_seq: null }, "WORKING"));
    expect(upper.status).toBe("working");
    const odd = await snapshotOf(agentResult({ state_change_seq: 1, completion_seq: null }, "busy"));
    expect(odd.status).toBe("unknown");
    const none = await snapshotOf({ type: "agent_info" });
    expect(none).toEqual({ status: "unknown", stateChangeSeq: null, completionSeq: undefined });
    expect(none.completionSeq).toBeUndefined();
  });

  test("⑥ RPC error rejects (no snapshot)", async () => {
    const client = new HerdrClient({ socketPath: "/nonexistent/herdr.sock" });
    client.request = (async () => {
      throw new Error("agent.get: target not found");
    }) as HerdrClient["request"];
    await expect(client.agentGet("w1:p1")).rejects.toThrow("target not found");
  });
});

describe("PLAN 0.46.0 P1 — fixture contract (R13)", () => {
  type AgentInfo = { properties: Record<string, unknown> };
  function agentInfoOf(v: "herdr-v0.7.5" | "herdr-v0.9.5"): AgentInfo {
    const raw = readFileSync(join(REPO_ROOT, "docs", "spikes", "fixtures", v, "schema.json"), "utf8");
    const schema = JSON.parse(raw) as {
      schemas: { success_response: { $defs: { AgentInfo: AgentInfo } } };
    };
    return schema.schemas.success_response.$defs.AgentInfo;
  }

  test("⑦ AgentInfo carries state_change_seq in 0.7.5 and 0.9.5", () => {
    for (const v of ["herdr-v0.7.5", "herdr-v0.9.5"] as const) {
      expect({ v, has: "state_change_seq" in agentInfoOf(v).properties }).toEqual({ v, has: true });
    }
  });

  test("⑧ only 0.9.5 AgentInfo carries completion_seq (integer | null)", () => {
    expect("completion_seq" in agentInfoOf("herdr-v0.7.5").properties).toBe(false);
    const cs = agentInfoOf("herdr-v0.9.5").properties.completion_seq as { type?: unknown };
    expect(cs).toBeDefined();
    expect(cs.type).toEqual(["integer", "null"]);
  });
});

describe("PLAN 0.46.0 P1 — fake-herdr seqMode (R14) through agentGet", () => {
  const dir = mkdtempSync("/tmp/lhs-");
  const prevHome = process.env.LOOM_TEST_HOME;
  let seq = 0;
  const open: FakeHerdr[] = [];

  beforeAll(() => {
    process.env.LOOM_TEST_HOME = dir;
  });

  afterAll(async () => {
    for (const f of open) await f.close();
    if (prevHome === undefined) delete process.env.LOOM_TEST_HOME;
    else process.env.LOOM_TEST_HOME = prevHome;
    rmSync(dir, { recursive: true, force: true });
  });

  async function rig(seqMode?: "none" | "p22", autoStatus: "done" | "none" = "none") {
    seq += 1;
    const socketPath = join(dir, `h${seq}.sock`);
    const fake = await startFakeHerdr({ socketPath, autoStatus, autoStatusDelayMs: 400, seqMode });
    open.push(fake);
    const client = new HerdrClient({ socketPath });
    const split = (await client.request("pane.split", { direction: "right" })) as {
      pane: { pane_id: string };
    };
    return { fake, client, paneId: split.pane.pane_id };
  }

  async function rawAgent(client: HerdrClient, paneId: string): Promise<Record<string, unknown>> {
    const r = (await client.request("agent.get", { target: paneId })) as {
      agent: Record<string, unknown>;
    };
    return r.agent;
  }

  async function snap(client: HerdrClient, paneId: string): Promise<Snapshot> {
    return (await client.agentGet(paneId)) as unknown as Snapshot;
  }

  test("⑨ seqMode default / \"none\": agent.get has neither key → scs null · cs undefined", async () => {
    for (const mode of [undefined, "none"] as const) {
      const { fake, client, paneId } = await rig(mode);
      fake.setAgentStatus(paneId, "working");
      fake.setAgentStatus(paneId, "idle");
      const agent = await rawAgent(client, paneId);
      expect({ mode, scs: "state_change_seq" in agent }).toEqual({ mode, scs: false });
      expect({ mode, cs: "completion_seq" in agent }).toEqual({ mode, cs: false });
      const s = await snap(client, paneId);
      expect(s).toEqual({ status: "idle", stateChangeSeq: null, completionSeq: undefined });
      expect(s.completionSeq).toBeUndefined();
    }
  });

  test("⑩ seqMode \"p22\": fresh pane scs 0 · cs null", async () => {
    const { client, paneId } = await rig("p22");
    const agent = await rawAgent(client, paneId);
    expect(agent.state_change_seq).toBe(0);
    expect(agent.completion_seq).toBeNull();
    expect(await snap(client, paneId)).toEqual({
      status: "unknown",
      stateChangeSeq: 0,
      completionSeq: null,
    });
  });

  test("⑪ seqMode \"p22\": working → cs null · working→idle → cs = scs · unchanged status keeps the stamp", async () => {
    const { fake, client, paneId } = await rig("p22");
    fake.setAgentStatus(paneId, "working");
    expect(await snap(client, paneId)).toEqual({
      status: "working",
      stateChangeSeq: 1,
      completionSeq: null,
    });
    fake.setAgentStatus(paneId, "idle");
    expect(await snap(client, paneId)).toEqual({ status: "idle", stateChangeSeq: 2, completionSeq: 2 });
    fake.setAgentStatus(paneId, "idle"); // no change → no stamp (H7)
    expect(await snap(client, paneId)).toEqual({ status: "idle", stateChangeSeq: 2, completionSeq: 2 });
    fake.setAgentStatus(paneId, "working");
    expect(await snap(client, paneId)).toEqual({
      status: "working",
      stateChangeSeq: 3,
      completionSeq: null,
    });
  });

  test("⑫ seqMode \"p22\": the counter is global across panes", async () => {
    const { fake, client, paneId } = await rig("p22");
    const other = (await client.request("pane.split", { direction: "right" })) as {
      pane: { pane_id: string };
    };
    const paneB = other.pane.pane_id;
    fake.setAgentStatus(paneId, "working"); // 1
    fake.setAgentStatus(paneB, "working"); // 2
    fake.setAgentStatus(paneId, "done"); // 3
    expect(await snap(client, paneId)).toEqual({ status: "done", stateChangeSeq: 3, completionSeq: 3 });
    expect(await snap(client, paneB)).toEqual({
      status: "working",
      stateChangeSeq: 2,
      completionSeq: null,
    });
  });

  test("⑬ seqMode \"p22\": agent.prompt autoStatus working→done stamps cs = that scs", async () => {
    const { client, paneId } = await rig("p22", "done");
    await client.request("agent.prompt", { target: paneId, text: "hi" });
    const during = await snap(client, paneId);
    expect(during.status).toBe("working");
    expect(during.completionSeq).toBeNull();
    await Bun.sleep(800);
    const after = await snap(client, paneId);
    expect(after.status).toBe("done");
    expect(after.stateChangeSeq).toBe(2);
    expect(after.completionSeq).toBe(2);
  });
});
