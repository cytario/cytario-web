import { describe, expect, test, vi } from "vitest";

import { consultUserMgmtGate } from "../userManagementGate";
import { userMgmtGateRegistry } from "../userManagementGateRegistry";
import type { Identity, UserManagementAction } from "@cytario/plugin-api";

const identity = (overrides?: Partial<Identity>): Identity => ({
  sub: "test-user",
  organization: "testcorp",
  organizationAttributes: {},
  groups: [],
  adminScopes: [],
  ...overrides,
});

describe("consultUserMgmtGate", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    userMgmtGateRegistry.__reset();
  });

  test("short-circuits when no gate is registered", async () => {
    await expect(
      consultUserMgmtGate(identity(), { kind: "invite", inviteCount: 1 }),
    ).resolves.toBeUndefined();
  });

  test("passes identity, action, and orgTier to the gate when one is registered", async () => {
    const gate = vi.fn(() => ({ kind: "continue" }) as const);
    userMgmtGateRegistry.register(gate);

    const id = identity({
      organizationAttributes: { subscription_tier: ["research"] },
    });
    const action: UserManagementAction = { kind: "invite", inviteCount: 2 };
    await consultUserMgmtGate(id, action);

    expect(gate).toHaveBeenCalledWith({ identity: id, action, orgTier: "research" });
  });

  test("passes orgTier as undefined when subscription_tier is absent", async () => {
    const gate = vi.fn(() => ({ kind: "continue" }) as const);
    userMgmtGateRegistry.register(gate);

    await consultUserMgmtGate(identity(), { kind: "invite", inviteCount: 1 });

    expect(gate).toHaveBeenCalledWith(expect.objectContaining({ orgTier: undefined }));
  });

  test("resolves without throwing when the gate returns continue", async () => {
    userMgmtGateRegistry.register(() => ({ kind: "continue" }));

    await expect(
      consultUserMgmtGate(identity(), { kind: "invite", inviteCount: 1 }),
    ).resolves.toBeUndefined();
  });

  test("throws a JSON Response with default status 402 when the gate denies", async () => {
    userMgmtGateRegistry.register(() => ({ kind: "deny" }));

    try {
      await consultUserMgmtGate(identity(), { kind: "invite", inviteCount: 1 });
      expect.fail("should have thrown");
    } catch (e) {
      expect(e).toBeInstanceOf(Response);
      const res = e as Response;
      expect(res.status).toBe(402);
      expect(res.headers.get("Content-Type")).toBe("application/json");
      const body = await res.json();
      expect(body.error).toBe("User-management action denied by gate.");
    }
  });

  test("throws a JSON Response carrying the gate's custom status, message, and resolve fields", async () => {
    userMgmtGateRegistry.register(() => ({
      kind: "deny",
      status: 402,
      message: "Action denied by gate.",
      resolveLabel: "Resolve here",
      resolveUrl: "https://example.com/resolve",
    }));

    try {
      await consultUserMgmtGate(identity(), { kind: "runAnalysis" });
      expect.fail("should have thrown");
    } catch (e) {
      expect(e).toBeInstanceOf(Response);
      const res = e as Response;
      expect(res.status).toBe(402);
      const body = await res.json();
      expect(body.error).toBe("Action denied by gate.");
      expect(body.resolveLabel).toBe("Resolve here");
      expect(body.resolveUrl).toBe("https://example.com/resolve");
    }
  });

  test("ignores a redirect outcome (resolves without throwing)", async () => {
    userMgmtGateRegistry.register(() => ({ kind: "redirect", url: "/upgrade" }));

    await expect(
      consultUserMgmtGate(identity(), { kind: "invite", inviteCount: 1 }),
    ).resolves.toBeUndefined();
  });

  test("a throwing gate is fail-opened by the registry and the action proceeds", async () => {
    const consoleSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    userMgmtGateRegistry.register(() => {
      throw new Error("gate boom");
    });

    await expect(
      consultUserMgmtGate(identity(), { kind: "invite", inviteCount: 1 }),
    ).resolves.toBeUndefined();
    expect(consoleSpy).toHaveBeenCalled();
    consoleSpy.mockRestore();
  });
});
