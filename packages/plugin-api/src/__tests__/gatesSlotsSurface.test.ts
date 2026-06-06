import type {
  CytarioPlugin,
  GateOutcome,
  GateRegistry,
  GateRequest,
  Identity,
  PluginContext,
  SessionGate,
  SlotName,
  SlotProps,
  SlotRegistry,
} from "../index";

describe("auth / gates / slots surface", () => {
  test("Identity carries org alias, opaque attrs, groups and admin scopes", () => {
    const identity: Identity = {
      organization: "testcorp",
      organizationAttributes: { subscription_status: "active" },
      groups: ["lab/team-a"],
      adminScopes: ["*"],
    };
    expect(identity.organization).toBe("testcorp");
    expect(identity.organizationAttributes["subscription_status"]).toBe("active");
    expect(identity.groups).toEqual(["lab/team-a"]);
    expect(identity.adminScopes).toEqual(["*"]);
  });

  test("Identity organization is optional for zero-org sessions", () => {
    const identity: Identity = {
      organizationAttributes: {},
      groups: [],
      adminScopes: [],
    };
    expect(identity.organization).toBeUndefined();
  });

  test("GateRequest threads url, uppercase method and identity", () => {
    const req: GateRequest = {
      url: "https://app.cytario.com/images/1",
      method: "POST",
      identity: { organizationAttributes: {}, groups: [], adminScopes: [] },
    };
    expect(req.method).toBe("POST");
  });

  test("SessionGate may return a sync or async outcome", async () => {
    const sync: SessionGate = () => ({ kind: "continue" });
    const async: SessionGate = async () => ({ kind: "redirect", url: "/onboarding" });
    const req: GateRequest = {
      url: "/",
      method: "GET",
      identity: { organizationAttributes: {}, groups: [], adminScopes: [] },
    };
    expect(sync(req)).toEqual({ kind: "continue" });
    await expect(async(req)).resolves.toEqual({ kind: "redirect", url: "/onboarding" });
  });

  test("GateOutcome is exhaustive over kind", () => {
    const render = (outcome: GateOutcome): string => {
      switch (outcome.kind) {
        case "continue":
          return "continue";
        case "redirect":
          return `redirect:${outcome.url}`;
        case "deny":
          return `deny:${outcome.status ?? 403}:${outcome.message ?? ""}`;
        default: {
          const unreachable: never = outcome;
          return unreachable;
        }
      }
    };
    expect(render({ kind: "continue" })).toBe("continue");
    expect(render({ kind: "redirect", url: "/x" })).toBe("redirect:/x");
    expect(render({ kind: "deny" })).toBe("deny:403:");
    expect(render({ kind: "deny", status: 401, message: "nope" })).toBe("deny:401:nope");
  });

  test("a GateRegistry accepts a SessionGate", () => {
    const registered: SessionGate[] = [];
    const registry: GateRegistry = {
      register(gate) {
        registered.push(gate);
      },
    };
    registry.register(() => ({ kind: "continue" }));
    expect(registered).toHaveLength(1);
  });

  test("SlotRegistry appends components for the known slot names", () => {
    const calls: Array<{ slot: SlotName; component: unknown }> = [];
    const registry: SlotRegistry = {
      register(slot, component) {
        calls.push({ slot, component });
      },
    };
    const Overlay = () => null;
    const Banner = () => null;
    registry.register("app-overlay", Overlay);
    registry.register("app-banner", Banner);
    expect(calls.map((c) => c.slot)).toEqual(["app-overlay", "app-banner"]);
  });

  test("SlotProps carries the Identity projection", () => {
    const props: SlotProps = {
      identity: { organizationAttributes: {}, groups: [], adminScopes: [] },
    };
    expect(props.identity.groups).toEqual([]);
  });

  test("a CytarioPlugin can register a gate and slots via PluginContext", () => {
    const plugin = {
      name: "surface-probe",
      apiVersion: "^2.2.0",
      register(ctx: PluginContext) {
        if (ctx.env === "server") {
          ctx.gates.register(() => ({ kind: "continue" }));
        } else {
          ctx.slots.register("app-banner", () => null);
        }
      },
    } satisfies CytarioPlugin;
    expect(plugin.name).toBe("surface-probe");
  });
});
