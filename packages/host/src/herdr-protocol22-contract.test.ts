/**
 * PLAN 0.45.3 P2 (D4 · R10) — herdr 0.9.5 / protocol-22 fixture contract.
 *
 * Fixture-only (`docs/spikes/fixtures/herdr-v0.9.5/schema.json`): green on the pre-0.45.3 code
 * too — a regression guard, not a red test (declared). ④ makes D2 mechanical: the params
 * definitions of every method Loom sends are deep-equal to the 0.7.5 fixture except the new
 * optional `PaneSplitParams.properties.right_click`.
 */
import { describe, expect, test } from "bun:test";

type JsonObject = Record<string, unknown>;
type ParamsDef = { required?: string[]; properties?: Record<string, unknown> } & JsonObject;
type OneOfEntry = { properties?: Record<string, JsonObject>; required?: string[] } & JsonObject;
type Schema = {
  protocol: number;
  schema_version: number;
  schemas: {
    request: { $defs: Record<string, JsonObject>; oneOf: OneOfEntry[] };
    event: { $defs: { EventData: { oneOf: OneOfEntry[] } } };
  };
};

const fixturesRoot = new URL("../../../docs/spikes/fixtures/", import.meta.url);

async function schemaOf(version: "herdr-v0.7.5" | "herdr-v0.9.5"): Promise<Schema> {
  return (await Bun.file(new URL(`${version}/schema.json`, fixturesRoot)).json()) as Schema;
}

/** The 15 methods Loom sends (14 in herdr-client.ts + bridge-runtime pane.close) → params def. */
const METHODS: Record<string, { def: string; required: string[]; properties: string[] }> = {
  ping: { def: "PingParams", required: [], properties: [] },
  "agent.start": {
    def: "AgentStartParams",
    required: ["name", "kind", "pane_id"],
    properties: ["args", "kind", "name", "pane_id", "timeout_ms"],
  },
  "agent.get": { def: "AgentTarget", required: ["target"], properties: ["target"] },
  "agent.prompt": {
    def: "AgentPromptParams",
    required: ["target", "text"],
    properties: ["target", "text", "wait"],
  },
  "agent.send_keys": {
    def: "AgentSendKeysParams",
    required: ["target", "keys"],
    properties: ["keys", "target"],
  },
  "agent.wait": {
    def: "AgentWaitParams",
    required: ["target"],
    properties: ["target", "timeout_ms", "until"],
  },
  "tab.create": {
    def: "TabCreateParams",
    required: [],
    properties: ["cwd", "env", "focus", "label", "workspace_id"],
  },
  "pane.split": {
    def: "PaneSplitParams",
    required: ["direction"],
    properties: [
      "cwd",
      "direction",
      "env",
      "focus",
      "ratio",
      "right_click",
      "target_pane_id",
      "workspace_id",
    ],
  },
  "pane.list": { def: "PaneListParams", required: [], properties: ["workspace_id"] },
  "pane.layout": { def: "PaneLayoutParams", required: [], properties: ["pane_id"] },
  "pane.resize": {
    def: "PaneResizeParams",
    required: ["direction"],
    properties: ["amount", "direction", "pane_id"],
  },
  "pane.read": {
    def: "PaneReadParams",
    required: ["pane_id", "source"],
    properties: ["format", "lines", "pane_id", "source", "strip_ansi"],
  },
  "pane.close": { def: "PaneTarget", required: ["pane_id"], properties: ["pane_id"] },
  "events.subscribe": {
    def: "EventsSubscribeParams",
    required: ["subscriptions"],
    properties: ["subscriptions"],
  },
  "session.snapshot": { def: "EmptyParams", required: [], properties: [] },
};

const EVENTS: Record<string, string[]> = {
  pane_closed: ["type", "pane_id", "workspace_id"],
  pane_exited: ["type", "pane_id", "workspace_id"],
  pane_agent_detected: ["type", "pane_id", "workspace_id"],
  pane_agent_status_changed: ["type", "pane_id", "workspace_id", "agent_status"],
};

const SUBSCRIPTIONS: Record<string, string[]> = {
  "pane.closed": ["type"],
  "pane.agent_status_changed": ["type", "pane_id"],
};

function constOf(entry: OneOfEntry, key: string): unknown {
  return entry.properties?.[key]?.const;
}

/** `/schemas/request/oneOf[method]` → params `$ref` definition name. */
function paramsDefName(schema: Schema, method: string): string | undefined {
  const entry = schema.schemas.request.oneOf.find((e) => constOf(e, "method") === method);
  const ref = entry?.properties?.params?.$ref;
  return typeof ref === "string" ? ref.slice(ref.lastIndexOf("/") + 1) : undefined;
}

function paramsDef(schema: Schema, method: string): ParamsDef | undefined {
  const name = paramsDefName(schema, method);
  return name === undefined ? undefined : (schema.schemas.request.$defs[name] as ParamsDef);
}

function subscriptionOneOf(schema: Schema): OneOfEntry[] {
  return (schema.schemas.request.$defs.Subscription as { oneOf: OneOfEntry[] }).oneOf;
}

describe("herdr 0.9.5 fixture contract (PLAN 0.45.3 P2 · R10)", () => {
  test("① schema is protocol 22 · schema_version 1", async () => {
    const schema = await schemaOf("herdr-v0.9.5");
    expect(schema.protocol).toBe(22);
    expect(schema.schema_version).toBe(1);
  });

  test("② the 15 methods Loom sends keep their params definitions", async () => {
    const schema = await schemaOf("herdr-v0.9.5");
    for (const [method, want] of Object.entries(METHODS)) {
      expect({ method, def: paramsDefName(schema, method) }).toEqual({ method, def: want.def });
      const def = paramsDef(schema, method)!;
      expect({ method, required: def.required ?? [] }).toEqual({ method, required: want.required });
      expect({ method, properties: Object.keys(def.properties ?? {}).sort() }).toEqual({
        method,
        properties: want.properties,
      });
    }
  });

  test("③ the 4 events and 2 subscriptions Loom uses keep their required fields", async () => {
    const schema = await schemaOf("herdr-v0.9.5");
    const eventData = schema.schemas.event.$defs.EventData.oneOf;
    for (const [type, required] of Object.entries(EVENTS)) {
      const entry = eventData.find((e) => constOf(e, "type") === type);
      expect({ type, required: entry?.required }).toEqual({ type, required });
    }
    const subs = subscriptionOneOf(schema);
    for (const [type, required] of Object.entries(SUBSCRIPTIONS)) {
      const entry = subs.find((e) => constOf(e, "type") === type);
      expect({ type, required: entry?.required }).toEqual({ type, required });
    }
  });

  test("④ params definitions are deep-equal to 0.7.5 except PaneSplitParams.right_click", async () => {
    const v17 = await schemaOf("herdr-v0.7.5");
    const v22 = await schemaOf("herdr-v0.9.5");
    expect(v17.protocol).toBe(17);
    for (const method of Object.keys(METHODS)) {
      expect({ method, def: paramsDefName(v22, method) }).toEqual({
        method,
        def: paramsDefName(v17, method),
      });
      const old = paramsDef(v17, method);
      const cur = structuredClone(paramsDef(v22, method)) as ParamsDef;
      if (method === "pane.split") {
        expect(old?.properties && "right_click" in old.properties).toBe(false);
        expect(cur.properties && "right_click" in cur.properties).toBe(true);
        delete cur.properties!.right_click;
      }
      expect({ method, def: cur }).toEqual({ method, def: old as ParamsDef });
    }
  });
});
