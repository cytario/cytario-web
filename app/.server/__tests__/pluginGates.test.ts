import { gateRegistry, runGates } from "../pluginGates";
import type { GateOutcome, GateRequest, Identity } from "@cytario/plugin-api";

const identity: Identity = {
  sub: "test-user",
  organization: "testcorp",
  organizationAttributes: {},
  groups: [],
  adminScopes: [],
};

const request = (overrides?: Partial<GateRequest>): GateRequest => ({
  url: "http://localhost/test",
  method: "GET",
  identity,
  ...overrides,
});

beforeEach(() => {
  gateRegistry.__reset();
});

describe("pluginGates", () => {
  test("register adds a gate that runGates evaluates", async () => {
    const gate = vi.fn(() => ({ kind: "continue" }) as const);
    gateRegistry.scopedFor("test-plugin").register(gate);

    const outcome = await runGates(request());

    expect(gate).toHaveBeenCalledTimes(1);
    expect(outcome).toEqual({ kind: "continue" });
  });

  test("returns continue when no gates are registered", async () => {
    expect(await runGates(request())).toEqual({ kind: "continue" });
  });

  test("evaluates gates in registration order", async () => {
    const order: string[] = [];
    gateRegistry.scopedFor("test-plugin").register(() => {
      order.push("first");
      return { kind: "continue" };
    });
    gateRegistry.scopedFor("test-plugin").register(() => {
      order.push("second");
      return { kind: "continue" };
    });

    await runGates(request());

    expect(order).toEqual(["first", "second"]);
  });

  test("returns the first non-continue outcome (redirect) and stops", async () => {
    const later = vi.fn(() => ({ kind: "continue" }) as const);
    gateRegistry.scopedFor("test-plugin").register(() => ({ kind: "continue" }));
    gateRegistry.scopedFor("test-plugin").register(() => ({ kind: "redirect", url: "/onboard" }));
    gateRegistry.scopedFor("test-plugin").register(later);

    const outcome = await runGates(request());

    expect(outcome).toEqual({ kind: "redirect", url: "/onboard" });
    expect(later).not.toHaveBeenCalled();
  });

  test("returns the first non-continue outcome (deny)", async () => {
    gateRegistry
      .scopedFor("test-plugin")
      .register(() => ({ kind: "deny", status: 403, message: "read-only" }));

    expect(await runGates(request({ method: "POST" }))).toEqual({
      kind: "deny",
      status: 403,
      message: "read-only",
    });
  });

  test("awaits async gates", async () => {
    gateRegistry
      .scopedFor("test-plugin")
      .register(async () => ({ kind: "redirect", url: "/async" }));

    expect(await runGates(request())).toEqual({ kind: "redirect", url: "/async" });
  });

  test("passes the host-resolved resource facts through to the gate", async () => {
    const gate = vi.fn(() => ({ kind: "continue" }) as const);
    gateRegistry.scopedFor("test-plugin").register(gate);

    await runGates(request({ resource: { connectionId: "conn-1", isPublic: true } }));

    expect(gate).toHaveBeenCalledWith(
      expect.objectContaining({
        resource: { connectionId: "conn-1", isPublic: true },
      }),
    );
  });

  test("returns a lock outcome once every gate has had its say", async () => {
    gateRegistry
      .scopedFor("test-plugin")
      .register(() => ({ kind: "lock", connectionIds: ["conn-1", "conn-2"] }));

    expect(await runGates(request())).toEqual({
      kind: "lock",
      connectionIds: ["conn-1", "conn-2"],
    });
  });

  test("a lock does not short-circuit later gates — their locks are merged", async () => {
    const later = vi.fn((): GateOutcome => ({ kind: "lock", connectionIds: ["conn-3"] }));
    gateRegistry
      .scopedFor("test-plugin")
      .register(() => ({ kind: "lock", connectionIds: ["conn-1", "conn-2"] }));
    gateRegistry.scopedFor("test-plugin").register(later);
    gateRegistry.scopedFor("test-plugin").register(() => ({ kind: "continue" }));

    expect(await runGates(request())).toEqual({
      kind: "lock",
      connectionIds: ["conn-1", "conn-2", "conn-3"],
    });
    expect(later).toHaveBeenCalledTimes(1);
  });

  test("a lock that names no requested connection cannot shield it from a later deny", async () => {
    // The failure this guards: the requesting gate locks some OTHER connection,
    // the run stops, and a gate that would have denied this request never ran.
    const deny = vi.fn((): GateOutcome => ({ kind: "deny", status: 402, message: "free plan" }));
    gateRegistry
      .scopedFor("test-plugin")
      .register(() => ({ kind: "lock", connectionIds: ["conn-other"] }));
    gateRegistry.scopedFor("test-plugin").register(deny);

    const outcome = await runGates(request({ resource: { connectionId: "conn-1" } }));

    expect(outcome).toEqual({ kind: "deny", status: 402, message: "free plan" });
    expect(deny).toHaveBeenCalledTimes(1);
  });

  test("mixed lock and deny across gates: the deny answers, the locks are dropped", async () => {
    const afterDeny = vi.fn((): GateOutcome => ({ kind: "lock", connectionIds: ["conn-late"] }));
    gateRegistry
      .scopedFor("test-plugin")
      .register(() => ({ kind: "lock", connectionIds: ["conn-1"] }));
    gateRegistry
      .scopedFor("test-plugin")
      .register(() => ({ kind: "deny", status: 403, message: "no" }));
    gateRegistry.scopedFor("test-plugin").register(afterDeny);

    expect(await runGates(request())).toEqual({ kind: "deny", status: 403, message: "no" });
    // A deny answers the request outright — nothing after it changes the verdict.
    expect(afterDeny).not.toHaveBeenCalled();
  });

  test("mixed deny then lock: the earlier deny wins and stops the run", async () => {
    const lockGate = vi.fn((): GateOutcome => ({ kind: "lock", connectionIds: ["conn-1"] }));
    gateRegistry
      .scopedFor("test-plugin")
      .register(() => ({ kind: "deny", status: 402, message: "free plan" }));
    gateRegistry.scopedFor("test-plugin").register(lockGate);

    expect(await runGates(request())).toEqual({
      kind: "deny",
      status: 402,
      message: "free plan",
    });
    expect(lockGate).not.toHaveBeenCalled();
  });

  test("a duplicate id across locks appears once, and the first lock's copy speaks for the set", async () => {
    gateRegistry.scopedFor("test-plugin").register(() => ({
      kind: "lock",
      connectionIds: ["conn-1"],
      message: "first",
      resolveUrl: "https://admin.cytario.com/billing",
      resolveLabel: "Upgrade plan",
    }));
    gateRegistry
      .scopedFor("test-plugin")
      .register(() => ({ kind: "lock", connectionIds: ["conn-1", "conn-2"], message: "second" }));

    expect(await runGates(request())).toEqual({
      kind: "lock",
      connectionIds: ["conn-1", "conn-2"],
      message: "first",
      resolveUrl: "https://admin.cytario.com/billing",
      resolveLabel: "Upgrade plan",
    });
  });

  test("a lock outcome with a malformed id list is contained and treated as continue", async () => {
    const consoleSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    const after = vi.fn(() => ({ kind: "redirect", url: "/after" }) as const);

    gateRegistry.scopedFor("test-plugin").register(() => ({ kind: "lock" }) as never);
    gateRegistry
      .scopedFor("test-plugin")
      .register(() => ({ kind: "lock", connectionIds: [1, 2] }) as never);
    gateRegistry.scopedFor("test-plugin").register(after);

    expect(await runGates(request())).toEqual({ kind: "redirect", url: "/after" });
    expect(consoleSpy).toHaveBeenCalledWith(
      expect.stringContaining("malformed outcome"),
      expect.objectContaining({ outcome: expect.anything() }),
    );
    consoleSpy.mockRestore();
  });

  test("a throwing gate is contained and treated as continue", async () => {
    const consoleSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    const after = vi.fn(() => ({ kind: "redirect", url: "/after" }) as const);

    gateRegistry.scopedFor("test-plugin").register(() => {
      throw new Error("gate boom");
    });
    gateRegistry.scopedFor("test-plugin").register(after);

    const outcome = await runGates(request());

    expect(after).toHaveBeenCalledTimes(1);
    expect(outcome).toEqual({ kind: "redirect", url: "/after" });
    expect(consoleSpy).toHaveBeenCalledWith(
      expect.stringContaining('"test-plugin" threw'),
      expect.objectContaining({ error: expect.stringContaining("gate boom") }),
    );
    consoleSpy.mockRestore();
  });

  test("a gate returning a malformed outcome is contained and treated as continue", async () => {
    const consoleSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    const after = vi.fn(() => ({ kind: "redirect", url: "/after" }) as const);

    // Garbage returns: undefined, and an object with no recognizable `kind`.
    gateRegistry.scopedFor("test-plugin").register(() => undefined as never);
    gateRegistry.scopedFor("test-plugin").register(() => ({ foo: "bar" }) as never);
    gateRegistry.scopedFor("test-plugin").register(after);

    const outcome = await runGates(request());

    expect(after).toHaveBeenCalledTimes(1);
    expect(outcome).toEqual({ kind: "redirect", url: "/after" });
    expect(consoleSpy).toHaveBeenCalledWith(
      expect.stringContaining("malformed outcome"),
      expect.objectContaining({ outcome: expect.anything() }),
    );
    consoleSpy.mockRestore();
  });

  test("a rejecting async gate is contained and treated as continue", async () => {
    const consoleSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    const after = vi.fn(() => ({ kind: "redirect", url: "/after" }) as const);

    gateRegistry.scopedFor("test-plugin").register(async () => {
      throw new Error("async boom");
    });
    gateRegistry.scopedFor("test-plugin").register(after);

    const outcome = await runGates(request());

    expect(after).toHaveBeenCalledTimes(1);
    expect(outcome).toEqual({ kind: "redirect", url: "/after" });
    expect(consoleSpy).toHaveBeenCalledWith(
      expect.stringContaining('"test-plugin" threw'),
      expect.objectContaining({ error: expect.stringContaining("async boom") }),
    );
    consoleSpy.mockRestore();
  });
});
