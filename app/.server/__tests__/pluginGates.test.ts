import { gateRegistry, runGates } from "../pluginGates";
import type { GateRequest, Identity } from "@cytario/plugin-api";

const identity: Identity = {
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
