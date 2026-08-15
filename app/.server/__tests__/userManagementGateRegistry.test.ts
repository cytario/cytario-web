import { userMgmtGateRegistry } from "../userManagementGateRegistry";
import type { GateOutcome, UserManagementGateRequest } from "@cytario/plugin-api";

const request = (overrides?: Partial<UserManagementGateRequest>): UserManagementGateRequest => ({
  identity: {
    sub: "test-user",
    organization: "testcorp",
    organizationAttributes: {},
    groups: [],
    adminScopes: [],
  },
  action: { kind: "invite", inviteCount: 1 },
  currentMemberCount: 0,
  currentAnalystCount: 0,
  ...overrides,
});

beforeEach(() => {
  userMgmtGateRegistry.__reset();
});

describe("userManagementGateRegistry", () => {
  test("consult returns null when no gate is registered", async () => {
    expect(await userMgmtGateRegistry.consult(request())).toBeNull();
  });

  test("hasGate reflects registration state", () => {
    expect(userMgmtGateRegistry.hasGate()).toBe(false);
    userMgmtGateRegistry.register(() => ({ kind: "continue" }));
    expect(userMgmtGateRegistry.hasGate()).toBe(true);
    userMgmtGateRegistry.__reset();
    expect(userMgmtGateRegistry.hasGate()).toBe(false);
  });

  test("consult invokes the registered gate with the request", async () => {
    const gate = vi.fn(() => ({ kind: "continue" }) as const);
    userMgmtGateRegistry.register(gate);

    const req = request({ currentMemberCount: 5, currentAnalystCount: 2 });
    const outcome = await userMgmtGateRegistry.consult(req);

    expect(gate).toHaveBeenCalledTimes(1);
    expect(gate).toHaveBeenCalledWith(req);
    expect(outcome).toEqual({ kind: "continue" });
  });

  test("last registration wins (single-slot)", async () => {
    const first = vi.fn(() => ({ kind: "continue" }) as const);
    const second = vi.fn(() => ({ kind: "deny", message: "over limit" }) as const);
    userMgmtGateRegistry.register(first);
    userMgmtGateRegistry.register(second);

    const outcome = await userMgmtGateRegistry.consult(request());

    expect(first).not.toHaveBeenCalled();
    expect(second).toHaveBeenCalledTimes(1);
    expect(outcome).toEqual({ kind: "deny", message: "over limit" });
  });

  test("passes through a deny outcome", async () => {
    userMgmtGateRegistry.register(() => ({ kind: "deny", status: 402, message: "no seats" }));

    expect(await userMgmtGateRegistry.consult(request())).toEqual({
      kind: "deny",
      status: 402,
      message: "no seats",
    });
  });

  test("passes through a redirect outcome", async () => {
    userMgmtGateRegistry.register(() => ({ kind: "redirect", url: "/upgrade" }));

    expect(await userMgmtGateRegistry.consult(request())).toEqual({
      kind: "redirect",
      url: "/upgrade",
    });
  });

  test("a throwing gate is contained and treated as continue", async () => {
    const consoleSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    userMgmtGateRegistry.register(() => {
      throw new Error("gate boom");
    });

    const outcome = await userMgmtGateRegistry.consult(request());

    expect(outcome).toEqual({ kind: "continue" });
    expect(consoleSpy).toHaveBeenCalledWith(
      expect.stringContaining("gate threw"),
      expect.objectContaining({ error: expect.stringContaining("gate boom") }),
    );
    consoleSpy.mockRestore();
  });

  test("a rejecting async gate is contained and treated as continue", async () => {
    const consoleSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    userMgmtGateRegistry.register(async () => {
      throw new Error("async boom");
    });

    const outcome = await userMgmtGateRegistry.consult(request());

    expect(outcome).toEqual({ kind: "continue" });
    expect(consoleSpy).toHaveBeenCalledWith(
      expect.stringContaining("gate threw"),
      expect.objectContaining({ error: expect.stringContaining("async boom") }),
    );
    consoleSpy.mockRestore();
  });

  test("a gate returning a malformed outcome is contained and treated as continue", async () => {
    const consoleSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    userMgmtGateRegistry.register(() => undefined as never);

    const outcome = await userMgmtGateRegistry.consult(request());

    expect(outcome).toEqual({ kind: "continue" });
    expect(consoleSpy).toHaveBeenCalledWith(
      expect.stringContaining("malformed outcome"),
      expect.objectContaining({ outcome: undefined }),
    );
    consoleSpy.mockRestore();
  });

  test("a gate returning an object with an unrecognized kind is treated as continue", async () => {
    const consoleSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    userMgmtGateRegistry.register(() => ({ kind: "explode" }) as unknown as GateOutcome);

    const outcome = await userMgmtGateRegistry.consult(request());

    expect(outcome).toEqual({ kind: "continue" });
    expect(consoleSpy).toHaveBeenCalledWith(
      expect.stringContaining("malformed outcome"),
      expect.objectContaining({ outcome: expect.anything() }),
    );
    consoleSpy.mockRestore();
  });
});
