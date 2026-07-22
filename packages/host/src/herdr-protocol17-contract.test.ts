/**
 * PLAN 0.28.1 — herdr 0.7.5 / protocol-17 adapter contract.
 *
 * Fixture + adapter assertions are green after PATCH 2–4a (protocol-17 client,
 * bridge CR nudge local to send_keys, fake-herdr 0.7.5 model).
 */
import { describe, expect, test } from "bun:test";
import * as herdrClientModule from "./herdr-client";
import { HERDR_PROTOCOL_EXPECTED, HerdrClient } from "./herdr-client";

type CapturedCall = {
  method: string;
  params: Record<string, unknown>;
};

const fixtureRoot = new URL("../../../docs/spikes/fixtures/herdr-v0.7.5/", import.meta.url);

async function fixtureJson<T>(name: string): Promise<T> {
  return (await Bun.file(new URL(name, fixtureRoot)).json()) as T;
}

function recordingClient(): {
  client: HerdrClient;
  calls: CapturedCall[];
} {
  const calls: CapturedCall[] = [];
  const client = new HerdrClient({
    socketPath: "/fixture/not-connected.sock",
  });
  client.request = async (method, params = {}) => {
    calls.push({ method, params });
    if (method === "agent.start") {
      return {
        type: "agent_started",
        agent: {
          pane_id: "w1:p_fixture",
          terminal_id: "term_fixture",
          name: "loom-fixture-worker",
        },
      };
    }
    if (method === "tab.create") {
      return {
        type: "tab_created",
        tab: { tab_id: "w1:t_fixture" },
        root_pane: { pane_id: "w1:p_root" },
      };
    }
    return { type: "ok" };
  };
  return { client, calls };
}

function functionBlock(source: string, name: string): string {
  const start = source.indexOf(`async function ${name}`);
  if (start < 0) return "";
  const next = source.indexOf("\n  async function ", start + name.length + 15);
  return source.slice(start, next < 0 ? source.length : next);
}

describe("herdr 0.7.5 fixture contract (green evidence)", () => {
  test("schema remains version 1 while protocol is 17", async () => {
    const schema = await fixtureJson<{
      protocol: number;
      schema_version: number;
    }>("schema.json");
    expect(schema.protocol).toBe(17);
    expect(schema.schema_version).toBe(1);
  });

  test("agent.start locks request fields only, without duplicating timeout bounds", async () => {
    const schema = await fixtureJson<{
      schemas: {
        request: {
          $defs: {
            AgentStartParams: {
              required: string[];
              properties: Record<string, unknown>;
            };
          };
        };
      };
    }>("schema.json");
    const start = schema.schemas.request.$defs.AgentStartParams;
    expect(start.required).toEqual(["name", "kind", "pane_id"]);
    expect(Object.keys(start.properties).sort()).toEqual([
      "args",
      "kind",
      "name",
      "pane_id",
      "timeout_ms",
    ]);
  });

  test("methods replace agent.send with prompt, send_keys, and wait", async () => {
    const inventory = await fixtureJson<{
      method_count: number;
      methods: string[];
    }>("methods.json");
    expect(inventory.method_count).toBe(89);
    expect(inventory.methods).toContain("agent.prompt");
    expect(inventory.methods).toContain("agent.send_keys");
    expect(inventory.methods).toContain("agent.wait");
    expect(inventory.methods).not.toContain("agent.send");
  });

  test("tab.create and pane.split own cwd/env before agent.start", async () => {
    const focus = await fixtureJson<{
      request_definitions: Record<string, { properties: Record<string, unknown> }>;
    }>("schema-focus.json");
    for (const name of ["TabCreateParams", "PaneSplitParams"]) {
      const fields = Object.keys(focus.request_definitions[name]!.properties);
      expect(fields).toContain("cwd");
      expect(fields).toContain("env");
    }
    const startFields = Object.keys(focus.request_definitions.AgentStartParams!.properties);
    expect(startFields).not.toContain("cwd");
    expect(startFields).not.toContain("env");
  });
});

describe("protocol-17 additive event compatibility (green guard)", () => {
  test("final_status/released remain an opaque additive callback payload", () => {
    const events: Array<{ event: string; data: unknown }> = [];
    const client = new HerdrClient({
      socketPath: "/fixture/not-connected.sock",
      onEvent: (event, data) => events.push({ event, data }),
    });
    const callback = (
      client as unknown as {
        opts: { onEvent?: (event: string, data: unknown) => void };
      }
    ).opts.onEvent;
    callback?.("pane_agent_detected", {
      type: "pane_agent_detected",
      pane_id: "w1:p_additive",
      workspace_id: "w1",
      agent: "claude",
      final_status: "done",
      released: true,
    });
    expect(events).toHaveLength(1);
    expect(events[0]).toMatchObject({
      event: "pane_agent_detected",
      data: { final_status: "done", released: true },
    });
    client.close();
  });
});

describe("PLAN 0.28.1 protocol-17 adapter", () => {
  test("client protocol cutover is 17", () => {
    expect(HERDR_PROTOCOL_EXPECTED).toBe(17);
  });

  test("agent.start emits only name/kind/pane_id plus schema-supported optionals", async () => {
    const { client, calls } = recordingClient();
    await client.agentStart({
      name: "loom-fixture-worker",
      kind: "grok",
      paneId: "w1:p_fixture",
      args: ["--example"],
      timeoutMs: null,
    } as never);
    // Non-pending start: resolve immediately; do not poll agent.get.
    expect(calls).toEqual([
      {
        method: "agent.start",
        params: {
          name: "loom-fixture-worker",
          kind: "grok",
          pane_id: "w1:p_fixture",
          args: ["--example"],
          timeout_ms: null,
        },
      },
    ]);
    client.close();
  });

  /**
   * PATCH5 (live protocol-17 2026-07-22): agent.start may return
   * launch_pending=true before the named agent is interactive_ready. The wrapper
   * must not resolve that pending record; it must observe agent.get{target:pane_id}
   * until interactive_ready=true and launch_pending is not true.
   */
  test("agentStart barriers on agent.get until interactive_ready when launch_pending", async () => {
    const calls: CapturedCall[] = [];
    let getCount = 0;
    const client = new HerdrClient({
      socketPath: "/fixture/not-connected.sock",
    });
    client.request = async (method, params = {}) => {
      calls.push({ method, params });
      if (method === "agent.start") {
        return {
          type: "agent_started",
          agent: {
            pane_id: "w1:p_launch",
            terminal_id: "term_launch",
            name: "loom-launch-worker",
            launch_pending: true,
            agent_status: "unknown",
          },
        };
      }
      if (method === "agent.get") {
        getCount += 1;
        // Two pending gets, then ready (deterministic). launch_pending omitted
        // on the ready record matches live false-by-omission.
        if (getCount < 3) {
          return {
            type: "agent",
            agent: {
              pane_id: "w1:p_launch",
              terminal_id: "term_launch",
              name: "loom-launch-worker",
              launch_pending: true,
              agent_status: "unknown",
            },
          };
        }
        return {
          type: "agent",
          agent: {
            pane_id: "w1:p_launch",
            terminal_id: "term_launch",
            name: "loom-launch-worker",
            interactive_ready: true,
            agent_status: "idle",
          },
        };
      }
      return { type: "ok" };
    };

    const started = await client.agentStart({
      name: "loom-launch-worker",
      kind: "grok",
      paneId: "w1:p_launch",
      timeoutMs: 120_000,
    });

    expect(calls).toEqual([
      {
        method: "agent.start",
        params: {
          name: "loom-launch-worker",
          kind: "grok",
          pane_id: "w1:p_launch",
          timeout_ms: 120_000,
        },
      },
      {
        method: "agent.get",
        params: { target: "w1:p_launch" },
      },
      {
        method: "agent.get",
        params: { target: "w1:p_launch" },
      },
      {
        method: "agent.get",
        params: { target: "w1:p_launch" },
      },
    ]);
    expect(started).toMatchObject({
      pane_id: "w1:p_launch",
      terminal_id: "term_launch",
      name: "loom-launch-worker",
      interactive_ready: true,
    });
    expect(started.launch_pending).not.toBe(true);
    client.close();
  });

  test("agentStart launch readiness rejects agent.get identity mismatch", async () => {
    const client = new HerdrClient({
      socketPath: "/fixture/not-connected.sock",
    });
    client.request = async (method) => {
      if (method === "agent.start") {
        return {
          type: "agent_started",
          agent: {
            pane_id: "w1:p_launch",
            terminal_id: "term_launch",
            name: "loom-launch-worker",
            launch_pending: true,
            agent_status: "unknown",
          },
        };
      }
      if (method === "agent.get") {
        return {
          type: "agent",
          agent: {
            pane_id: "w1:p_other",
            terminal_id: "term_other",
            name: "someone-else",
            interactive_ready: true,
          },
        };
      }
      return { type: "ok" };
    };

    await expect(
      client.agentStart({
        name: "loom-launch-worker",
        kind: "grok",
        paneId: "w1:p_launch",
      }),
    ).rejects.toThrow(/identity mismatch/);
    client.close();
  });

  test("tab.create carries cwd and Loom-owned environment before start", async () => {
    const { client, calls } = recordingClient();
    await client.tabCreate({
      workspaceId: "w1",
      label: "loom-workers",
      cwd: "/workspace/project",
      env: {
        LOOM_CARD: "task_fixture",
        LOOM_HOOK_SOCK: "/runtime/loom-hook.sock",
        LOOM_ARTIFACTS_DIR: "/workspace/artifacts",
      },
    } as never);
    expect(calls).toEqual([
      {
        method: "tab.create",
        params: {
          workspace_id: "w1",
          label: "loom-workers",
          cwd: "/workspace/project",
          env: {
            LOOM_CARD: "task_fixture",
            LOOM_HOOK_SOCK: "/runtime/loom-hook.sock",
            LOOM_ARTIFACTS_DIR: "/workspace/artifacts",
          },
          focus: false,
        },
      },
    ]);
    client.close();
  });

  test("client exposes paneSplit, agentPrompt, agentSendKeys, and agentWait", () => {
    const proto = HerdrClient.prototype as unknown as Record<string, unknown>;
    const missing = ["paneSplit", "agentPrompt", "agentSendKeys", "agentWait"].filter(
      (name) => typeof proto[name] !== "function",
    );
    expect(missing).toEqual([]);
  });

  test("primary injection is one opaque agent.prompt request", async () => {
    const { client, calls } = recordingClient();
    await client.injectPromptAndSubmit("w1:p_fixture", "A != B");
    expect(calls).toEqual([
      {
        method: "agent.prompt",
        params: { target: "w1:p_fixture", text: "A != B" },
      },
    ]);
    client.close();
  });

  test("protocol-16 agentSend/submitDelayMs/BARE_ENTER surface is gone", async () => {
    const source = await Bun.file(new URL("./herdr-client.ts", import.meta.url)).text();
    const proto = HerdrClient.prototype as unknown as Record<string, unknown>;
    expect({
      agentSendMethod: typeof proto.agentSend === "function",
      bareEnterExport: "BARE_ENTER" in herdrClientModule,
      submitDelayOption: source.includes("submitDelayMs"),
      dualSendImplementation:
        source.includes("await this.agentSend(target, prompt)") ||
        source.includes("await this.agentSend(target, BARE_ENTER)"),
    }).toEqual({
      agentSendMethod: false,
      bareEnterExport: false,
      submitDelayOption: false,
      dualSendImplementation: false,
    });
  });

  test("R46 retry branch reissues only on miss and nudges hit/read-fail", async () => {
    const source = await Bun.file(new URL("./bridge-runtime.ts", import.meta.url)).text();
    const helper = functionBlock(source, "verifyInjectOrRetry");
    expect(helper.length).toBeGreaterThan(0);
    expect(helper).toContain('probe === "miss" && !reinjectUsed');
    expect(helper).toContain("reinjectUsed = true");
    expect(helper).toContain('reason: "inject_unconfirmed"');
    expect(helper.match(/\b(?:const|let)\s+\w*(?:TIME|DELAY|WAIT)\w*\s*=/gi) ?? []).toHaveLength(0);
    expect({
      fullPromptReissues: (helper.match(/\.agentPrompt\s*\(/g) ?? []).length,
      boundedKeyNudgeSites: (helper.match(/\.agentSendKeys\s*\(/g) ?? []).length,
      legacySendSites: (helper.match(/\.agentSend\s*\(/g) ?? []).length,
    }).toEqual({
      fullPromptReissues: 1,
      boundedKeyNudgeSites: 1,
      legacySendSites: 0,
    });
  });

  test("additive release fields have no completion-authority coupling", async () => {
    const source = await Bun.file(new URL("./bridge-runtime.ts", import.meta.url)).text();
    const authorityCoupling = source.match(
      /(?:final_status|released)[\s\S]{0,180}(?:finishCard|paneClose|status:\s*["']done["'])|(?:finishCard|paneClose|status:\s*["']done["'])[\s\S]{0,180}(?:final_status|released)/g,
    );
    expect(authorityCoupling ?? []).toHaveLength(0);
  });
});
